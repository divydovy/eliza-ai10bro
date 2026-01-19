#!/usr/bin/env node

/**
 * Rescue malformed WordPress broadcasts
 *
 * Problem: LLM returns JSON wrapped in markdown code blocks:
 *   ```json
 *   { "title": "...", "excerpt": "...", "content": "..." }
 *   ```
 *
 * But the generator stored the outer structure:
 *   { "title": "```json", "excerpt": "...", "content": "```json\n{...}\n```" }
 *
 * This script extracts the inner JSON and fixes the broadcast.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'agent/data/db.sqlite');
const db = new Database(dbPath);

console.log('🔧 Rescuing malformed WordPress broadcasts...\n');

// Get all WordPress broadcasts with malformed titles
const malformed = db.prepare(`
    SELECT id, content, alignment_score
    FROM broadcasts
    WHERE client IN ('wordpress_insight', 'wordpress_deepdive')
    AND status = 'pending'
    AND (
        LENGTH(json_extract(content, '$.title')) <= 7
        OR json_extract(content, '$.title') LIKE '\`\`\`%'
        OR json_extract(content, '$.title') LIKE 'Here is%'
        OR json_extract(content, '$.title') = '{'
    )
`).all();

console.log(`Found ${malformed.length} malformed broadcasts\n`);

let rescued = 0;
let failed = 0;

for (const broadcast of malformed) {
    try {
        const outer = JSON.parse(broadcast.content);

        // The real article is nested in the content field as a string
        let innerContent = outer.content;

        // Clean markdown wrappers from the inner content
        innerContent = innerContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        innerContent = innerContent.replace(/^Here is the article in the requested JSON format:\s*/i, '');
        innerContent = innerContent.replace(/^Here is the article:\s*/i, '');
        innerContent = innerContent.replace(/^Here's the article:\s*/i, '');
        innerContent = innerContent.trim();

        // Try to parse the cleaned inner content
        const inner = JSON.parse(innerContent);

        // Validate it has the expected structure
        if (inner.title && inner.excerpt && inner.content &&
            inner.title.length > 10 && !inner.title.startsWith('```')) {

            // Reconstruct the proper broadcast content
            const fixed = {
                title: inner.title,
                excerpt: inner.excerpt,
                content: inner.content,
                type: outer.type || 'daily_insight',
                publish_status: outer.publish_status || 'publish'
            };

            console.log(`✅ Rescued ${broadcast.id.slice(0, 8)}: "${inner.title.substring(0, 60)}..."`);
            console.log(`   Alignment: ${(broadcast.alignment_score * 100).toFixed(1)}%`);

            // Update the broadcast with fixed content
            db.prepare(`UPDATE broadcasts SET content = ? WHERE id = ?`)
                .run(JSON.stringify(fixed), broadcast.id);

            rescued++;
        } else {
            console.log(`❌ Skipped ${broadcast.id.slice(0, 8)}: Inner JSON structure invalid`);
            console.log(`   Title: "${inner.title?.substring(0, 30)}..."`);
            failed++;
        }
    } catch (e) {
        console.log(`❌ Failed to rescue ${broadcast.id.slice(0, 8)}: ${e.message}`);
        failed++;
    }
}

db.close();

console.log(`\n✨ Rescue complete!`);
console.log(`   ✅ Rescued: ${rescued} broadcasts`);
console.log(`   ❌ Failed: ${failed} broadcasts`);
console.log(`   📊 Success rate: ${((rescued / malformed.length) * 100).toFixed(1)}%`);

if (rescued > 0) {
    console.log(`\n🎉 ${rescued} more broadcasts are now production-ready!`);
}
