#!/usr/bin/env node

const Database = require('better-sqlite3');
const db = new Database('./agent/data/db.sqlite');

// Find broadcasts with notes
const problematicBroadcasts = db.prepare(`
    SELECT id, content 
    FROM broadcasts 
    WHERE status = 'pending' 
    AND content LIKE '%Note:%'
`).all();

console.log(`Found ${problematicBroadcasts.length} broadcasts with internal notes`);

for (const broadcast of problematicBroadcasts) {
    const content = JSON.parse(broadcast.content);
    
    // Remove everything after "(Note:" or "\n\n(Note:"
    content.text = content.text.replace(/[\n\s]*\(Note:.*$/s, '');
    
    // Also handle "**Problem-solution approach**" prefixes
    content.text = content.text.replace(/^\*\*Problem-solution approach\*\*\s*\n+/, '');
    content.text = content.text.replace(/^Problem-solution approach:\s*\n+/, '');
    content.text = content.text.replace(/^Problem-solution:\s*/, '');
    
    // Clean up any trailing whitespace
    content.text = content.text.trim();
    
    // Update the broadcast
    db.prepare(`
        UPDATE broadcasts 
        SET content = ? 
        WHERE id = ?
    `).run(JSON.stringify(content), broadcast.id);
    
    console.log(`Fixed broadcast ${broadcast.id}`);
    console.log(`New content: ${content.text.substring(0, 100)}...`);
}

console.log('Done fixing broadcasts');
db.close();
