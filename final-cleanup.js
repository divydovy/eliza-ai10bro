#!/usr/bin/env node

const Database = require('better-sqlite3');
const db = new Database('./agent/data/db.sqlite');

// Fix remaining broadcasts with bold markdown style labels
const broadcasts = db.prepare(`
    SELECT id, content 
    FROM broadcasts 
    WHERE status = 'pending' 
    AND content LIKE '%**%lead%'
`).all();

console.log(`Found ${broadcasts.length} broadcasts with bold labels`);

for (const broadcast of broadcasts) {
    const content = JSON.parse(broadcast.content);
    
    // Remove bold markdown style labels
    content.text = content.text.replace(/^\*\*[^:]+:\*\*\s*/g, '');
    
    // Clean up any trailing whitespace
    content.text = content.text.trim();
    
    // Update the broadcast
    db.prepare(`
        UPDATE broadcasts 
        SET content = ? 
        WHERE id = ?
    `).run(JSON.stringify(content), broadcast.id);
    
    console.log(`Fixed broadcast ${broadcast.id}`);
}

console.log('All broadcasts cleaned!');
db.close();
