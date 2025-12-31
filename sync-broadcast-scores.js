#!/usr/bin/env node

/**
 * Sync broadcast alignment scores with memory alignment scores
 *
 * Problem: Broadcasts are created with alignment_score copied from memories at creation time.
 * When documents get rescored (LLM scoring), the memories table updates but broadcasts don't.
 *
 * Solution: Periodically sync broadcast scores with current memory scores.
 *
 * Run: Every hour via cron (before send scripts run)
 */

const Database = require('better-sqlite3');
const db = new Database('./agent/data/db.sqlite');

console.log('🔄 Syncing Broadcast Alignment Scores\n');

// Count broadcasts that need updating
const needsSync = db.prepare(`
    SELECT COUNT(*) as count
    FROM broadcasts b
    JOIN memories m ON b.documentId = m.id
    WHERE b.status = 'pending'
    AND m.alignment_score IS NOT NULL
    AND (b.alignment_score IS NULL OR b.alignment_score != m.alignment_score)
`).get();

if (needsSync.count === 0) {
    console.log('✅ All broadcast scores are already in sync!\n');
    db.close();
    process.exit(0);
}

console.log(`Found ${needsSync.count} broadcasts with outdated scores\n`);

// Sync scores
const result = db.prepare(`
    UPDATE broadcasts
    SET alignment_score = (
        SELECT alignment_score
        FROM memories
        WHERE memories.id = broadcasts.documentId
    )
    WHERE documentId IN (
        SELECT id FROM memories WHERE alignment_score IS NOT NULL
    )
    AND status = 'pending'
`).run();

console.log(`✅ Updated ${result.changes} broadcast scores\n`);

// Show summary of ready broadcasts
const ready = db.prepare(`
    SELECT
        client,
        COUNT(*) as count
    FROM broadcasts
    WHERE status = 'pending'
    AND alignment_score >= 0.12
    GROUP BY client
    ORDER BY client
`).all();

console.log('📊 Broadcasts Ready to Send:');
ready.forEach(r => {
    console.log(`   ${r.client}: ${r.count}`);
});

console.log('\n✅ Sync complete!\n');
db.close();
