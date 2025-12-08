#!/usr/bin/env node

/**
 * Multi-repository GitHub sync
 * Syncs content from multiple GitHub repositories including GDELT and YouTube
 */

const Database = require('better-sqlite3');
const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Helper to generate UUID v4 from string (same as stringToUuid in core)
function stringToUuid(str) {
    const hash = crypto.createHash('sha256').update(str).digest('hex');
    return [
        hash.substring(0, 8),
        hash.substring(8, 4),
        '4' + hash.substring(13, 3),
        ((parseInt(hash.substring(16, 2), 16) & 0x3f) | 0x80).toString(16) + hash.substring(18, 2),
        hash.substring(20, 12)
    ].join('-');
}

// Repository configurations
const REPOSITORIES = [
    {
        url: 'https://github.com/divydovy/ai10bro-gdelt',
        path: 'Notes',
        name: 'General Biology Content',
        sourceType: 'general'
    },
    {
        url: 'https://github.com/divydovy/ai10bro-gdelt',
        path: 'Papers',
        name: 'PubMed Research',
        sourceType: 'pubmed'
    }
];

async function syncRepository(repo, octokit, db, agentId, roomId) {
    try {
        // Parse repository URL
        const match = repo.url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        if (!match) {
            throw new Error(`Invalid GitHub repository URL: ${repo.url}`);
        }
        const owner = match[1];
        const repoName = match[2].replace('.git', '');
        
        console.log(`\n📦 Syncing ${repo.name}: ${owner}/${repoName}`);
        console.log(`📁 Target path: ${repo.path || 'root'}`);
        
        // Function to recursively get all markdown files
        async function getMarkdownFilesRecursively(path) {
            console.log(`  Scanning: ${path || 'root'}`);
            
            try {
                const response = await octokit.rest.repos.getContent({
                    owner,
                    repo: repoName,
                    path: path || ''
                });
                
                if (!Array.isArray(response.data)) {
                    // Single file
                    if (response.data.type === 'file' && response.data.name.endsWith('.md')) {
                        return [response.data];
                    }
                    return [];
                }
                
                let allFiles = [];
                
                // Get markdown files in current directory
                const markdownFiles = response.data.filter(file => 
                    file.type === 'file' && file.name.endsWith('.md')
                );
                allFiles = [...allFiles, ...markdownFiles];
                
                // Process subdirectories
                const directories = response.data.filter(item => item.type === 'dir');
                for (const dir of directories) {
                    const subFiles = await getMarkdownFilesRecursively(dir.path);
                    allFiles = [...allFiles, ...subFiles];
                }
                
                return allFiles;
            } catch (error) {
                if (error.status === 404) {
                    console.log(`  Path not found: ${path || 'root'}`);
                    return [];
                }
                throw error;
            }
        }
        
        // Get all markdown files from the target path
        const markdownFiles = await getMarkdownFilesRecursively(repo.path);
        console.log(`  Found ${markdownFiles.length} markdown files`);
        
        if (markdownFiles.length === 0) {
            console.log(`  No markdown files found in ${repo.name}`);
            return { imported: 0, skipped: 0, updated: 0 };
        }
        
        // Prepare database statements
        const checkStmt = db.prepare(`
            SELECT id, json_extract(content, '$.metadata.sha') as sha 
            FROM memories 
            WHERE type = 'documents' 
            AND json_extract(content, '$.metadata.source') = ?
            AND json_extract(content, '$.metadata.path') = ?
        `);
        
        const insertStmt = db.prepare(`
            INSERT INTO memories (
                id, type, content, embedding, userId, agentId, roomId, createdAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const updateStmt = db.prepare(`
            UPDATE memories 
            SET content = ?, createdAt = ?
            WHERE id = ?
        `);
        
        let imported = 0;
        let skipped = 0;
        let updated = 0;
        
        // Process each markdown file
        for (const file of markdownFiles) {
            try {
                // Check if already imported and if SHA changed
                const existing = checkStmt.get(
                    `https://github.com/${owner}/${repoName}/blob/main/${file.path}`,
                    file.path
                );
                
                // Skip if same SHA (no changes)
                if (existing && existing.sha === file.sha) {
                    skipped++;
                    continue;
                }
                
                // Fetch file content
                const contentResponse = await octokit.rest.repos.getContent({
                    owner,
                    repo: repoName,
                    path: file.path
                });
                
                const content = Buffer.from(contentResponse.data.content, 'base64').toString('utf8');
                
                // Extract title from first heading or filename
                const titleMatch = content.match(/^#\s+(.+)$/m);
                const title = titleMatch ? titleMatch[1] : file.name.replace('.md', '');
                
                // Create document with metadata
                const document = {
                    text: content,
                    metadata: {
                        title: title,
                        path: file.path,
                        filename: file.name,
                        source: `https://github.com/${owner}/${repoName}/blob/main/${file.path}`,
                        sourceType: repo.sourceType,
                        sha: file.sha,
                        size: file.size,
                        repository: `${owner}/${repoName}`,
                        importedAt: new Date().toISOString()
                    }
                };
                
                if (existing) {
                    // Update existing document
                    updateStmt.run(
                        JSON.stringify(document),
                        Date.now(),
                        existing.id
                    );
                    updated++;
                    if (updated % 10 === 0) {
                        console.log(`  ✓ Updated ${updated} documents...`);
                    }
                } else {
                    // Insert new document
                    const docId = stringToUuid(`${repo.url}-${file.path}`);
                    insertStmt.run(
                        docId,
                        'documents',
                        JSON.stringify(document),
                        '[]', // Empty embedding array to satisfy NOT NULL constraint
                        agentId,
                        agentId,
                        roomId,
                        Date.now()
                    );
                    imported++;
                    if (imported % 10 === 0) {
                        console.log(`  ✓ Imported ${imported} documents...`);
                    }
                }
                
            } catch (error) {
                console.error(`  ⚠️ Error processing ${file.path}:`, error.message);
            }
        }
        
        console.log(`  ✅ ${repo.name} sync complete!`);
        console.log(`     📥 Imported: ${imported} new documents`);
        console.log(`     🔄 Updated: ${updated} existing documents`);
        console.log(`     ⏭️ Skipped: ${skipped} unchanged documents`);
        
        return { imported, skipped, updated };
        
    } catch (error) {
        console.error(`❌ Error syncing ${repo.name}:`, error.message);
        return { imported: 0, skipped: 0, updated: 0, error: error.message };
    }
}

async function main() {
    try {
        // Load character config
        const characterPath = path.join(__dirname, 'characters/ai10bro.character.json');
        const character = JSON.parse(fs.readFileSync(characterPath, 'utf8'));
        
        const githubToken = character.settings?.secrets?.GITHUB_TOKEN || character.settings?.GITHUB_TOKEN;
        
        if (!githubToken) {
            throw new Error('GITHUB_TOKEN not found in character configuration');
        }
        
        console.log('🔄 Starting multi-repository GitHub sync...');
        console.log(`📅 Date: ${new Date().toISOString()}`);
        
        // Initialize GitHub client
        const octokit = new Octokit({
            auth: githubToken,
            baseUrl: 'https://api.github.com'
        });
        
        // Initialize database
        const dbPath = path.join(__dirname, 'agent/data/db.sqlite');
        const db = new Database(dbPath);
        
        // Get the actual agentId from the database
        const agent = db.prepare("SELECT id FROM accounts WHERE name = 'ai10bro'").get();
        if (!agent) {
            throw new Error('ai10bro agent not found in database');
        }
        const agentId = agent.id;
        
        // Get an existing room ID to use for the foreign key
        const room = db.prepare("SELECT id FROM rooms LIMIT 1").get();
        const roomId = room ? room.id : null;
        
        // Track totals
        let totalImported = 0;
        let totalSkipped = 0;
        let totalUpdated = 0;
        
        // Sync each repository
        for (const repo of REPOSITORIES) {
            const result = await syncRepository(repo, octokit, db, agentId, roomId);
            totalImported += result.imported || 0;
            totalSkipped += result.skipped || 0;
            totalUpdated += result.updated || 0;
        }
        
        // Get current stats
        const stats = db.prepare(`
            SELECT 
                COUNT(*) as total,
                COUNT(DISTINCT json_extract(content, '$.metadata.sourceType')) as sources
            FROM memories 
            WHERE type = 'documents'
        `).get();
        
        console.log('\n' + '='.repeat(60));
        console.log('📊 SYNC COMPLETE - FINAL STATISTICS');
        console.log('='.repeat(60));
        console.log(`📥 Total imported: ${totalImported} new documents`);
        console.log(`🔄 Total updated: ${totalUpdated} existing documents`);
        console.log(`⏭️ Total skipped: ${totalSkipped} unchanged documents`);
        console.log(`📚 Total documents in database: ${stats.total}`);
        console.log(`🌐 Total sources: ${stats.sources}`);
        console.log('='.repeat(60));
        
        db.close();
        
    } catch (error) {
        console.error('❌ Sync failed:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { main };