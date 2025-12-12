#!/usr/bin/env node

/**
 * Fix double-JSON encoding in WordPress broadcasts
 * The backfill script incorrectly did JSON.stringify() on LLM-generated JSON
 */

const Database = require('better-sqlite3');

const db = new Database('agent/data/db.sqlite');

console.log('🔧 Fixing WordPress broadcast JSON encoding...\n');

// Get all WordPress broadcasts that need fixing
const broadcasts = db.prepare(`
    SELECT id, content
    FROM broadcasts
    WHERE client = 'wordpress_insight'
    AND status = 'pending'
`).all();

console.log(`Found ${broadcasts.length} WordPress broadcasts to fix\n`);

let fixed = 0;
let skipped = 0;

for (const broadcast of broadcasts) {
    try {
        const outer = JSON.parse(broadcast.content);

        // Check if title is just "{" (malformed from fallback parsing)
        if (outer.title === '{' || outer.title === '"{"' || outer.title.startsWith('Here is the article')) {
            // The actual article is in the content field as a JSON string
            try {
                const inner = JSON.parse(outer.content);

                // If inner JSON has title, excerpt, content - it's the real article
                if (inner.title && inner.excerpt && inner.content) {
                    console.log(`✅ Fixing ${broadcast.id.slice(0, 8)}: "${inner.title.substring(0, 50)}..."`);

                    // Store the inner JSON (correctly formatted article)
                    // Include type and publish_status from original
                    const fixed = {
                        title: inner.title,
                        excerpt: inner.excerpt,
                        content: inner.content,
                        type: outer.type || 'daily_insight',
                        publish_status: outer.publish_status || 'publish'
                    };

                    db.prepare(`UPDATE broadcasts SET content = ? WHERE id = ?`)
                        .run(JSON.stringify(fixed), broadcast.id);

                    fixed++;
                } else {
                    console.log(`⏭️  Skipping ${broadcast.id.slice(0, 8)}: Inner JSON doesn't have expected structure`);
                    skipped++;
                }
            } catch (e) {
                console.log(`⏭️  Skipping ${broadcast.id.slice(0, 8)}: Content is not parseable JSON - ${e.message}`);
                skipped++;
            }
        } else {
            console.log(`⏭️  Skipping ${broadcast.id.slice(0, 8)}: Already correctly formatted (title: "${outer.title.substring(0, 30)}...")`);
            skipped++;
        }
    } catch (e) {
        console.error(`❌ Error processing ${broadcast.id.slice(0, 8)}: ${e.message}`);
        skipped++;
    }
}

db.close();

console.log(`\n✨ Fix complete!`);
console.log(`   Fixed: ${fixed} broadcasts`);
console.log(`   Skipped: ${skipped} broadcasts`);
