#!/usr/bin/env node

const sqlite3 = require('better-sqlite3');
const path = require('path');

async function triggerBroadcastGeneration() {
    try {
        // Open database
        const dbPath = path.join(process.cwd(), 'agent/data/db.sqlite');
        const db = sqlite3(dbPath);
        
        // Get documents that don't have broadcasts yet
        const docsWithoutBroadcasts = db.prepare(`
            SELECT m.id, m.content 
            FROM memories m 
            LEFT JOIN broadcasts b ON m.id = b.documentId 
            WHERE m.type = 'documents' 
            AND b.documentId IS NULL 
            LIMIT 20
        `).all();
        
        console.log(`📚 Found ${docsWithoutBroadcasts.length} documents without broadcasts`);
        
        if (docsWithoutBroadcasts.length > 0) {
            console.log('\n🔍 Sample documents:');
            docsWithoutBroadcasts.slice(0, 5).forEach(doc => {
                const content = JSON.parse(doc.content);
                const title = content.title || content.text?.substring(0, 50) + '...' || 'Untitled';
                console.log(`   - ${doc.id}: ${title}`);
            });
            
            console.log('\n💡 The AutoBroadcastService running in the agent will process these automatically.');
            console.log('💡 It runs every 30 minutes, or you can restart the agent to trigger immediate processing.');
        } else {
            console.log('✅ All documents already have broadcasts!');
        }
        
        // Check total broadcast counts
        const stats = db.prepare(`
            SELECT 
                COUNT(DISTINCT m.id) as total_docs,
                COUNT(DISTINCT b.documentId) as docs_with_broadcasts,
                COUNT(b.id) as total_broadcasts
            FROM memories m 
            LEFT JOIN broadcasts b ON m.id = b.documentId 
            WHERE m.type = 'documents'
        `).get();
        
        console.log('\n📊 Current Statistics:');
        console.log(`   Total documents: ${stats.total_docs}`);
        console.log(`   Documents with broadcasts: ${stats.docs_with_broadcasts}`);
        console.log(`   Total broadcasts: ${stats.total_broadcasts}`);
        
        db.close();
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    triggerBroadcastGeneration();
}

module.exports = { triggerBroadcastGeneration };