#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { randomUUID } = require('crypto');

// Load environment and character config
require('dotenv').config();
const characterFile = './characters/ai10bro.character.json';
const character = JSON.parse(fs.readFileSync(characterFile, 'utf8'));

const vaultPath = character.settings?.obsidian?.vaultPath || 
    '/Users/davidlockie/Library/Mobile Documents/iCloud~md~obsidian/Documents/AI10bro';

const db = new Database('./agent/data/db.sqlite');

console.log('🧠 Starting Obsidian vault import...');
console.log(`📁 Vault path: ${vaultPath}`);

// Function to recursively get all markdown files
function getAllMarkdownFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        // Skip hidden files and directories
        if (file.startsWith('.')) return;
        
        if (stat.isDirectory()) {
            getAllMarkdownFiles(filePath, fileList);
        } else if (file.endsWith('.md')) {
            fileList.push(filePath);
        }
    });
    
    return fileList;
}

// Function to extract metadata from markdown
function extractMetadata(content, filePath) {
    const lines = content.split('\n');
    const title = lines[0]?.replace(/^#\s+/, '') || path.basename(filePath, '.md');
    
    // Determine category based on path
    let category = 'obsidian';
    if (filePath.includes('Clippings')) category = 'obsidian-clipping';
    else if (filePath.includes('Resources')) category = 'obsidian-resource';
    else if (filePath.includes('Generated')) category = 'obsidian-generated';
    else if (filePath.includes('PDFs')) category = 'obsidian-pdf';
    
    return {
        title: title,
        path: filePath.replace(vaultPath, ''),
        sourceType: 'obsidian',
        category: category,
        source: `obsidian://${path.basename(filePath, '.md')}`
    };
}

try {
    // Get all markdown files
    const markdownFiles = getAllMarkdownFiles(vaultPath);
    console.log(`📚 Found ${markdownFiles.length} markdown files`);
    
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
    
    markdownFiles.forEach(filePath => {
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
                null, // No embedding for now
                character.id || 'ai10bro',
                character.id || 'ai10bro',
                `obsidian-${character.id || 'ai10bro'}`,
                Date.now()
            );
            
            imported++;
            
            // Show progress
            if (imported % 10 === 0) {
                console.log(`  ✓ Imported ${imported} documents...`);
            }
            
        } catch (error) {
            console.error(`  ⚠️ Error importing ${filePath}:`, error.message);
        }
    });
    
    console.log(`\n✅ Import complete!`);
    console.log(`   📥 Imported: ${imported} new documents`);
    console.log(`   ⏭️ Skipped: ${skipped} existing documents`);
    console.log(`   📊 Total in database: ${imported + skipped}`);
    
} catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
} finally {
    db.close();
}