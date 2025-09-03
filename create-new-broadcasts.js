#!/usr/bin/env node

const sqlite3 = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

async function createNewBroadcasts() {
    try {
        // Open database
        const dbPath = path.join(process.cwd(), 'agent/data/db.sqlite');
        const db = sqlite3(dbPath);
        
        // Load character settings
        const characterPath = path.join(process.cwd(), 'characters', 'ai10bro.character.json');
        const character = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));
        
        // Get documents that don't have broadcasts yet (limit to 5 for testing)
        const docsWithoutBroadcasts = db.prepare(`
            SELECT m.id, m.content 
            FROM memories m 
            LEFT JOIN broadcasts b ON m.id = b.documentId 
            WHERE m.type = 'documents' 
            AND b.documentId IS NULL 
            LIMIT 5
        `).all();
        
        console.log(`📚 Found ${docsWithoutBroadcasts.length} documents to process`);
        
        for (const doc of docsWithoutBroadcasts) {
            const content = JSON.parse(doc.content);
            const text = content.text || content.title || 'No content';
            
            // Extract title
            const titleMatch = text.match(/title:\s*"?([^"\n]+)"?/i) || text.match(/^#\s*(.+)/m);
            const title = titleMatch ? titleMatch[1].trim() : text.substring(0, 50) + '...';
            
            console.log(`\n📄 Processing: ${title}`);
            console.log(`   Document ID: ${doc.id}`);
            
            // Find actual HTTPS URLs in the content
            let sourceUrl = null;
            const urlMatch = text.match(/https?:\/\/[^\s\)]+/);
            if (urlMatch) {
                sourceUrl = urlMatch[0];
            }
            
            // Generate UUID for broadcast ID
            const { randomUUID } = require('crypto');
            const broadcastId = randomUUID();
            
            // Create broadcast entry in database with proper format
            db.prepare(`
                INSERT INTO broadcasts (id, documentId, content, client, status, createdAt, alignment_score)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                broadcastId,
                doc.id,
                `${title}`, // Clean title without prefix
                'telegram',
                'pending',
                Date.now(),
                0.8 // Default alignment score
            );
            
            console.log(`   ✅ Created broadcast ${broadcastId}`);
        }
        
        const totalBroadcasts = db.prepare(`SELECT COUNT(*) as count FROM broadcasts WHERE status = 'pending'`).get().count;
        
        console.log(`\n🎉 Created broadcasts for ${docsWithoutBroadcasts.length} documents`);
        console.log(`📊 Total pending broadcasts: ${totalBroadcasts}`);
        console.log('\n💡 Next step: Run process-pending-broadcasts.js to generate content with LLM');
        
        db.close();
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    createNewBroadcasts();
}

module.exports = { createNewBroadcasts };