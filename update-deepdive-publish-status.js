#!/usr/bin/env node

/**
 * Update all pending wordpress_deepdive broadcasts to auto-publish
 * Changes publish_status from "draft" to "publish" in broadcast content JSON
 */

const sqlite3 = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'agent/data/db.sqlite');
const db = sqlite3(dbPath);

console.log('📝 Updating Deep Dive broadcasts to auto-publish...\n');

// Get all pending deep dive broadcasts
const broadcasts = db.prepare(`
    SELECT id, content
    FROM broadcasts
    WHERE client = 'wordpress_deepdive'
    AND status = 'pending'
`).all();

console.log(`   Found ${broadcasts.length} pending deep dive broadcasts\n`);

let updated = 0;
let alreadyPublish = 0;
let errors = 0;

for (const broadcast of broadcasts) {
    try {
        const content = JSON.parse(broadcast.content);

        if (content.publish_status === 'publish') {
            alreadyPublish++;
            continue;
        }

        // Update publish_status
        content.publish_status = 'publish';

        // Save back to database
        db.prepare(`
            UPDATE broadcasts
            SET content = ?
            WHERE id = ?
        `).run(JSON.stringify(content), broadcast.id);

        updated++;

        if (updated % 10 === 0) {
            console.log(`   Updated ${updated} broadcasts...`);
        }

    } catch (error) {
        console.error(`   ❌ Error updating broadcast ${broadcast.id.slice(0, 8)}: ${error.message}`);
        errors++;
    }
}

db.close();

console.log('\n' + '='.repeat(60));
console.log('📊 Update Summary:');
console.log(`   ✅ Updated: ${updated}`);
console.log(`   ⏭️  Already set to publish: ${alreadyPublish}`);
console.log(`   ❌ Errors: ${errors}`);
console.log(`   📝 Total processed: ${broadcasts.length}`);
console.log('='.repeat(60));
console.log('\n✅ All pending deep dive broadcasts will now auto-publish!');
