#!/usr/bin/env node

/**
 * Direct GitHub sync using the GitHub plugin's provider
 * Simplified version that actually pulls new content from the configured repository
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

async function main() {
    try {
        // Load character config
        const characterPath = path.join(__dirname, 'characters/ai10bro.character.json');
        const character = JSON.parse(fs.readFileSync(characterPath, 'utf8'));
        
        const githubToken = character.settings?.secrets?.GITHUB_TOKEN || character.settings?.GITHUB_TOKEN;
        const repoUrl = character.settings?.GITHUB_REPO_URL || 'https://github.com/divydovy/ai10bro-gdelt';
        const targetPath = character.settings?.GITHUB_TARGET_PATH || 'Notes';
        
        if (!githubToken) {
            throw new Error('GITHUB_TOKEN not found in character configuration');
        }
        
        // Parse repository URL
        const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        if (!match) {
            throw new Error('Invalid GitHub repository URL');
        }
        const owner = match[1];
        const repo = match[2].replace('.git', '');
        
        console.log(`📦 Repository: ${owner}/${repo}`);
        console.log(`📁 Target path: ${targetPath}`);
        console.log('🔄 Starting GitHub sync...\n');
        
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
        
        // Function to recursively get all markdown files
        async function getMarkdownFilesRecursively(path) {
            console.log(`Scanning: ${path || 'root'}`);
            
            const response = await octokit.rest.repos.getContent({
                owner,
                repo,
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
        }
        
        // Get all markdown files
        const markdownFiles = await getMarkdownFilesRecursively(targetPath);
        console.log(`\nFound ${markdownFiles.length} markdown files`);
        
        let processedCount = 0;
        let skippedCount = 0;
        
        // Process each file (limit to first 10 for testing)
        const filesToProcess = markdownFiles; // .slice(0, 10); // Remove slice to process all
        console.log(`\nProcessing ${filesToProcess.length} files...`);
        
        for (const file of filesToProcess) {
            const docId = stringToUuid(file.path);
            
            // Check if document already exists and get its hash
            const existing = db.prepare(`
                SELECT id, json_extract(content, '$.hash') as hash 
                FROM memories 
                WHERE id = ?
            `).get(docId);
            
            // Get file content
            const contentResponse = await octokit.repos.getContent({
                owner,
                repo,
                path: file.path
            });
            
            if ('content' in contentResponse.data) {
                const content = Buffer.from(contentResponse.data.content, 'base64').toString();
                const newHash = crypto.createHash('sha256').update(content).digest('hex');
                
                // Skip if content hasn't changed
                if (existing && existing.hash === newHash) {
                    console.log(`⏭️  Skipping unchanged: ${file.path}`);
                    skippedCount++;
                    continue;
                }
                
                const progress = Math.floor((processedCount + skippedCount) / filesToProcess.length * 100);
                console.log(`✅ [${progress}%] Processing: ${file.path}`);
                
                // Create or update the document
                const documentContent = {
                    text: content,
                    hash: newHash,
                    source: 'github',
                    metadata: {
                        path: file.path,
                        repo: `${owner}/${repo}`,
                        url: `https://github.com/${owner}/${repo}/blob/main/${file.path}`
                    }
                };
                
                if (existing) {
                    // Update existing document
                    db.prepare(`
                        UPDATE memories 
                        SET content = ?, updatedAt = datetime('now')
                        WHERE id = ?
                    `).run(JSON.stringify(documentContent), docId);
                } else {
                    // Insert new document - include empty embedding to satisfy NOT NULL constraint
                    db.prepare(`
                        INSERT INTO memories (id, type, content, embedding, agentId, userId, roomId, createdAt)
                        VALUES (?, 'documents', ?, '[]', ?, NULL, ?, datetime('now'))
                    `).run(docId, JSON.stringify(documentContent), agentId, roomId);
                }
                
                processedCount++;
            }
        }
        
        console.log(`\n✅ Sync complete: ${processedCount} files processed, ${skippedCount} skipped`);
        
        // Get total document count from GitHub
        const totalDocs = db.prepare(`
            SELECT COUNT(*) as count FROM memories 
            WHERE type = 'documents' 
            AND json_extract(content, '$.source') = 'github'
        `).get();
        
        console.log(`📊 Total GitHub documents in database: ${totalDocs.count}`);
        
        db.close();
        
    } catch (error) {
        console.error('❌ Sync failed:', error.message);
        if (error.response) {
            console.error('GitHub API error:', error.response.data);
        }
        process.exit(1);
    }
}

main().catch(console.error);