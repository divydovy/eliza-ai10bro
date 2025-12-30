#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { randomUUID } = require('crypto');

// Load environment
require('dotenv').config();

// GitHub scraper notes directory
const githubNotesPath = '/Users/davidlockie/Documents/Projects/gdelt-obsidian/Notes';

const db = new Database('./agent/data/db.sqlite');

console.log('🧠 Starting GitHub scraper content import...');
console.log(`📁 Source path: ${githubNotesPath}`);

// Function to recursively get all markdown files
function getAllMarkdownFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        // Skip hidden files, cache directories, and index files
        if (file.startsWith('.') || file === '.cache' || file.startsWith('index_')) return;

        if (stat.isDirectory()) {
            getAllMarkdownFiles(filePath, fileList);
        } else if (file.endsWith('.md')) {
            fileList.push(filePath);
        }
    });

    return fileList;
}

// Function to extract metadata from GitHub scraper markdown
function extractMetadata(content, filePath) {
    const lines = content.split('\n');
    const title = lines[0]?.replace(/^#\s+/, '') || path.basename(filePath, '.md');

    // Determine source type based on directory
    let sourceType = 'github-scraper';
    let category = 'unknown';

    if (filePath.includes('Arxiv_Notes')) {
        sourceType = 'arxiv';
        category = 'research-paper';
    } else if (filePath.includes('BioRxiv_Notes')) {
        sourceType = 'biorxiv';
        category = 'preprint';
    } else if (filePath.includes('News_Notes')) {
        sourceType = 'news-rss';
        category = 'news-article';
    } else if (filePath.includes('YouTube_Notes')) {
        sourceType = 'youtube';
        category = 'video-transcript';
    } else if (filePath.includes('HackerNews_Notes')) {
        sourceType = 'hackernews';
        category = 'discussion';
    } else if (filePath.includes('GitHub_Trending_Notes')) {
        sourceType = 'github-trending';
        category = 'repository';
    } else if (filePath.includes('GDELT_Notes')) {
        sourceType = 'gdelt';
        category = 'news-event';
    } else if (filePath.includes('HuggingFace_Notes')) {
        sourceType = 'huggingface';
        category = 'model';
    } else if (filePath.includes('OWID_Notes')) {
        sourceType = 'owid';
        category = 'data-analysis';
    }

    // Extract URL from content if present (handles both markdown link and plain URL formats)
    let url = null;
    // Try markdown link format first: **URL**: [text](https://...)
    let urlMatch = content.match(/\*\*URL\*\*:\s*\[.*?\]\((https?:\/\/[^\)]+)\)/);
    if (urlMatch) {
        url = urlMatch[1];
    } else {
        // Try plain URL format: **URL:** https://... or - **URL:** https://...
        // Look for URL followed by http/https
        urlMatch = content.match(/URL.*?(https?:\/\/[^\s\n]+)/);
        if (urlMatch) {
            url = urlMatch[1];
        }
    }

    return {
        title: title,
        path: filePath.replace(githubNotesPath, ''),
        sourceType: sourceType,
        category: category,
        url: url,
        source: url || `github-scraper://${path.basename(filePath, '.md')}`
    };
}

try {
    // Get all markdown files
    const markdownFiles = getAllMarkdownFiles(githubNotesPath);
    console.log(`📚 Found ${markdownFiles.length} markdown files`);

    // Show breakdown by source
    const breakdown = {};
    markdownFiles.forEach(f => {
        const dir = path.dirname(f).split('/').pop();
        breakdown[dir] = (breakdown[dir] || 0) + 1;
    });
    console.log('\n📊 Breakdown by source:');
    Object.entries(breakdown).forEach(([dir, count]) => {
        console.log(`   ${dir}: ${count} files`);
    });
    console.log('');

    // Get the actual agentId from the database
    const agent = db.prepare("SELECT id FROM accounts WHERE name = 'ai10bro'").get();
    if (!agent) {
        console.error('❌ ai10bro agent not found in database. Please ensure the agent has been run at least once.');
        process.exit(1);
    }
    const agentId = agent.id;

    // Get an existing room ID to use for the foreign key
    const room = db.prepare("SELECT id FROM rooms LIMIT 1").get();
    const roomId = room ? room.id : null;

    if (!roomId) {
        console.error('❌ No rooms found in database. Please ensure the agent has been run at least once.');
        process.exit(1);
    }

    // Prepare statements
    const checkStmt = db.prepare(`
        SELECT id FROM memories
        WHERE type = 'documents'
        AND json_extract(content, '$.metadata.path') = ?
    `);

    const insertStmt = db.prepare(`
        INSERT INTO memories (
            id, type, content, embedding, userId, agentId, roomId, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let imported = 0;
    let skipped = 0;

    console.log('🔄 Starting import...\n');

    markdownFiles.forEach((filePath, index) => {
        try {
            // Read file content
            const content = fs.readFileSync(filePath, 'utf8');
            const metadata = extractMetadata(content, filePath);

            // Check if already imported
            const existing = checkStmt.get(metadata.path);
            if (existing) {
                skipped++;
                return;
            }

            // Prepare document
            const docId = randomUUID();
            const document = {
                text: content,
                title: metadata.title,
                metadata: {
                    ...metadata,
                    importedAt: new Date().toISOString(),
                    fileSize: fs.statSync(filePath).size
                }
            };

            // Insert into database
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

            // Show progress every 100 files
            if (imported % 100 === 0) {
                console.log(`  ✓ Imported ${imported} documents... (${((index / markdownFiles.length) * 100).toFixed(1)}% complete)`);
            }

        } catch (error) {
            console.error(`  ⚠️ Error importing ${filePath}:`, error.message);
        }
    });

    console.log(`\n✅ Import complete!`);
    console.log(`   📥 Imported: ${imported} new documents`);
    console.log(`   ⏭️ Skipped: ${skipped} existing documents`);
    console.log(`   📊 Total in database: ${imported + skipped}`);

    // Show final breakdown
    console.log('\n📈 Final statistics:');
    const finalStats = db.prepare(`
        SELECT
            json_extract(content, '$.metadata.sourceType') as source_type,
            COUNT(*) as count
        FROM memories
        WHERE type = 'documents'
        AND json_extract(content, '$.metadata.sourceType') NOT IN ('obsidian')
        GROUP BY source_type
        ORDER BY count DESC
    `).all();

    finalStats.forEach(stat => {
        console.log(`   ${stat.source_type}: ${stat.count} documents`);
    });

} catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
} finally {
    db.close();
}
