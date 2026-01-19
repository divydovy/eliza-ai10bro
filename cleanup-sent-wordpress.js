#!/usr/bin/env node

/**
 * Clean up malformed "sent" WordPress broadcasts
 *
 * Issue: 18 broadcasts marked as 'sent' but many have malformed JSON
 * - 14 with title = '{' (invalid JSON wrapped in outer structure)
 * - 1 with "Here is the article..." preamble
 * - 3 appear valid (bio-concrete, bioengineering, data-driven omics)
 *
 * These were sent via old mechanism and never recorded wordpress_post_id
 * Need to clean them up so they can be republished properly.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'agent/data/db.sqlite');
const db = new Database(dbPath);

console.log('🧹 Cleaning up malformed sent WordPress broadcasts...\n');

// Get all sent WordPress broadcasts
const sentBroadcasts = db.prepare(`
    SELECT
        id,
        LENGTH(json_extract(content, '$.title')) as title_len,
        json_extract(content, '$.title') as title,
        alignment_score
    FROM broadcasts
    WHERE client = 'wordpress_insight'
    AND status = 'sent'
`).all();

console.log(`Found ${sentBroadcasts.length} sent WordPress broadcasts\n`);

// Identify malformed ones
const malformed = sentBroadcasts.filter(b =>
    b.title_len <= 7 ||
    b.title.startsWith('{') ||
    b.title.startsWith('Here is')
);

const good = sentBroadcasts.filter(b =>
    b.title_len > 10 &&
    !b.title.startsWith('{') &&
    !b.title.startsWith('Here is')
);

console.log(`📊 Analysis:`);
console.log(`   ✅ Good broadcasts: ${good.length}`);
console.log(`   ❌ Malformed broadcasts: ${malformed.length}\n`);

if (good.length > 0) {
    console.log('✅ Good broadcasts (will reset to pending for proper republishing):');
    good.forEach(b => {
        console.log(`   - "${b.title.substring(0, 60)}..." (${(b.alignment_score * 100).toFixed(1)}%)`);
    });
    console.log();
}

if (malformed.length > 0) {
    console.log('❌ Malformed broadcasts (will be deleted):');
    malformed.forEach(b => {
        console.log(`   - Title: "${b.title.substring(0, 40)}..." (len: ${b.title_len})`);
    });
    console.log();
}

// Delete malformed broadcasts
console.log(`🗑️  Deleting ${malformed.length} malformed broadcasts...`);
const deleteResult = db.prepare(`
    DELETE FROM broadcasts
    WHERE client = 'wordpress_insight'
    AND status = 'sent'
    AND (
        LENGTH(json_extract(content, '$.title')) <= 7
        OR json_extract(content, '$.title') LIKE '{%'
        OR json_extract(content, '$.title') LIKE 'Here is%'
    )
`).run();

console.log(`   ✅ Deleted ${deleteResult.changes} malformed broadcasts\n`);

// Reset good broadcasts to pending for proper republishing
if (good.length > 0) {
    console.log(`🔄 Resetting ${good.length} good broadcasts to 'pending' status...`);
    const resetResult = db.prepare(`
        UPDATE broadcasts
        SET status = 'pending',
            wordpress_published = 0,
            wordpress_post_id = NULL,
            wordpress_published_at = NULL,
            wordpress_status = NULL
        WHERE client = 'wordpress_insight'
        AND status = 'sent'
    `).run();

    console.log(`   ✅ Reset ${resetResult.changes} broadcasts to pending\n`);
}

// Show final status
const finalCount = db.prepare(`
    SELECT
        status,
        COUNT(*) as count,
        ROUND(AVG(alignment_score * 100), 1) as avg_alignment
    FROM broadcasts
    WHERE client = 'wordpress_insight'
    GROUP BY status
`).all();

console.log('📊 Final WordPress Insight broadcast status:');
finalCount.forEach(row => {
    console.log(`   ${row.status}: ${row.count} broadcasts (${row.avg_alignment}% avg alignment)`);
});

console.log('\n✨ Cleanup complete!');
console.log('\n📝 Next steps:');
console.log('   1. Manually delete malformed posts from WordPress site');
console.log('   2. Good broadcasts will be republished on next send run');
console.log('   3. Check WordPress site to verify cleanup');

db.close();
