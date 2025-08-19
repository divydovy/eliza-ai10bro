#!/usr/bin/env node

const Database = require('better-sqlite3');

async function fixBroadcastSources() {
    console.log("🔧 Fixing broadcast source URLs...\n");
    
    const db = new Database('./agent/data/db.sqlite');
    
    try {
        // Get all broadcasts with "Source: obsidian"
        const obsidianBroadcasts = db.prepare(`
            SELECT b.id, b.documentId, b.content, m.content as docContent
            FROM broadcasts b
            LEFT JOIN memories m ON b.documentId = m.id
            WHERE b.content LIKE '%Source: obsidian%'
        `).all();
        
        console.log(`Found ${obsidianBroadcasts.length} broadcasts with 'Source: obsidian'`);
        
        let updated = 0;
        let noUrl = 0;
        
        for (const broadcast of obsidianBroadcasts) {
            if (!broadcast.docContent) {
                console.log(`⚠️  No document found for broadcast ${broadcast.id}`);
                continue;
            }
            
            try {
                const docContent = JSON.parse(broadcast.docContent);
                
                // Try to find the actual source URL
                const sourceUrl = docContent.metadata?.frontmatter?.source || 
                                 docContent.metadata?.url || 
                                 docContent.url;
                
                if (sourceUrl && sourceUrl !== 'obsidian') {
                    // Replace "Source: obsidian" with actual URL
                    const newContent = broadcast.content.replace(
                        /🔗 Source: obsidian/g,
                        `🔗 Source: ${sourceUrl}`
                    );
                    
                    // Update the broadcast
                    db.prepare('UPDATE broadcasts SET content = ? WHERE id = ?')
                      .run(newContent, broadcast.id);
                    
                    console.log(`✅ Updated broadcast ${broadcast.id}`);
                    console.log(`   New source: ${sourceUrl.substring(0, 50)}...`);
                    updated++;
                } else {
                    console.log(`⚠️  No URL found for broadcast ${broadcast.id}`);
                    noUrl++;
                }
            } catch (error) {
                console.error(`❌ Error processing broadcast ${broadcast.id}: ${error.message}`);
            }
        }
        
        console.log(`\n📊 Summary:`);
        console.log(`   Updated: ${updated} broadcasts`);
        console.log(`   No URL found: ${noUrl} broadcasts`);
        console.log(`   Total processed: ${obsidianBroadcasts.length}`);
        
    } finally {
        db.close();
    }
}

fixBroadcastSources().catch(console.error);