#!/usr/bin/env node

/**
 * Fix broadcasts with malformed source URLs
 * Adds https:// protocol where missing and ensures 🔗 Source: prefix
 */

const Database = require('better-sqlite3');
const db = new Database('./agent/data/db.sqlite');

console.log('🔧 Fixing Malformed Source URLs in Broadcasts\n');

// Find broadcasts with URLs but missing proper format
const broadcasts = db.prepare(`
    SELECT id, documentId, content, client
    FROM broadcasts
    WHERE status = 'pending'
    AND (
        -- Has URL-like text but missing protocol
        (content LIKE '%.com%' OR content LIKE '%.org%' OR content LIKE '%.io%' OR content LIKE '%.ai%')
        AND content NOT LIKE '%http%'
    )
    LIMIT 200
`).all();

console.log(`Found ${broadcasts.length} broadcasts with potential malformed URLs\n`);

let fixed = 0;
let skipped = 0;

broadcasts.forEach((broadcast) => {
    try {
        const content = JSON.parse(broadcast.content);
        let text = content.text || content.content || '';

        // Look for domain-like patterns without protocol
        const domainPattern = /\b([a-z0-9-]+\.(com|org|io|net|ai|co|edu)[^\s,;)]*)/gi;
        const matches = text.match(domainPattern);

        if (!matches || matches.length === 0) {
            skipped++;
            return;
        }

        // Take the last match (usually the source URL at the end)
        const lastMatch = matches[matches.length - 1];

        // Clean up any trailing punctuation
        const cleanedUrl = lastMatch.replace(/[,;.]$/, '');

        // Add protocol and 🔗 Source: format
        const fullUrl = `https://${cleanedUrl}`;

        // Replace the malformed URL with proper format
        const newText = text.replace(lastMatch, `\n\n🔗 Source: ${fullUrl}`);

        // Update broadcast
        content.text = newText;

        db.prepare(`
            UPDATE broadcasts
            SET content = ?
            WHERE id = ?
        `).run(JSON.stringify(content), broadcast.id);

        console.log(`✅ Fixed ${broadcast.id} (${broadcast.client})`);
        console.log(`   Old: ${lastMatch}`);
        console.log(`   New: ${fullUrl}`);
        fixed++;

    } catch (error) {
        console.log(`⚠️  Error fixing ${broadcast.id}: ${error.message}`);
        skipped++;
    }
});

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 Summary');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log(`✅ Fixed: ${fixed}`);
console.log(`⏭️  Skipped: ${skipped}`);
console.log(`\n✅ Malformed URL fix complete!\n`);

db.close();
