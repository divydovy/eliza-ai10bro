#!/usr/bin/env node

const Database = require('better-sqlite3');
const db = new Database('./agent/data/db.sqlite');

// Find all broadcasts with any form of meta-text
const problematicBroadcasts = db.prepare(`
    SELECT id, content 
    FROM broadcasts 
    WHERE status = 'pending' 
    AND (
        content LIKE '%Note:%' OR 
        content LIKE '%Problem-solution%' OR 
        content LIKE '%**Problem-%' OR
        content LIKE '%Direct news lead:%' OR
        content LIKE '%Impact first:%' OR
        content LIKE '%Future vision:%'
    )
`).all();

console.log(`Found ${problematicBroadcasts.length} broadcasts with meta-text`);

for (const broadcast of problematicBroadcasts) {
    const content = JSON.parse(broadcast.content);
    const originalText = content.text;
    
    // Remove internal notes
    content.text = content.text.replace(/[\n\s]*\(Note:.*$/s, '');
    
    // Remove style approach labels
    content.text = content.text.replace(/^\*\*[^*]+\*\*\s*:?\s*\n+/g, '');
    content.text = content.text.replace(/^(Problem-solution|Direct news lead|Impact first|Future vision|Nature metaphor)[\s:]*\n*/gi, '');
    
    // Clean up any double newlines at the start
    content.text = content.text.replace(/^\n+/, '');
    
    // Clean up any trailing whitespace
    content.text = content.text.trim();
    
    if (content.text !== originalText) {
        // Update the broadcast
        db.prepare(`
            UPDATE broadcasts 
            SET content = ? 
            WHERE id = ?
        `).run(JSON.stringify(content), broadcast.id);
        
        console.log(`Fixed broadcast ${broadcast.id}`);
    }
}

// Final count check
const remaining = db.prepare(`
    SELECT COUNT(*) as count 
    FROM broadcasts 
    WHERE status = 'pending' 
    AND (
        content LIKE '%Note:%' OR 
        content LIKE '%Problem-solution%' OR 
        content LIKE '%**Problem-%' OR
        content LIKE '%Direct news lead:%' OR
        content LIKE '%Impact first:%' OR
        content LIKE '%Future vision:%'
    )
`).get();

console.log(`\nDone! ${remaining.count} broadcasts still need manual review (if any)`);
db.close();
