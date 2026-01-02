#!/usr/bin/env node

/**
 * Cleanup Unaligned Documents
 *
 * Removes documents with alignment scores below threshold to prevent database bloat.
 * Run after alignment scoring to clean up low-quality imports.
 *
 * Usage:
 *   node cleanup-unaligned-documents.js           # Dry run (shows what would be deleted)
 *   node cleanup-unaligned-documents.js --execute # Actually delete documents
 */

const Database = require('better-sqlite3');
const db = new Database('./agent/data/db.sqlite');

// Configuration
const ALIGNMENT_THRESHOLD = 0.08; // Conservative: keep documents >= 8%
const DRY_RUN = !process.argv.includes('--execute');

console.log('🧹 Cleanup Unaligned Documents');
console.log('================================\n');
console.log(`Threshold: ${ALIGNMENT_THRESHOLD * 100}% alignment`);
console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'EXECUTE (will delete)'}`);
console.log('');

// Get documents below threshold (excluding Obsidian - it has special handling)
const unalignedDocs = db.prepare(`
    SELECT
        id,
        content,
        alignment_score,
        createdAt
    FROM memories
    WHERE type = 'documents'
    AND alignment_score < ?
    AND alignment_score IS NOT NULL
    ORDER BY alignment_score ASC
`).all(ALIGNMENT_THRESHOLD);

console.log(`Found ${unalignedDocs.length} documents below ${ALIGNMENT_THRESHOLD * 100}% alignment\n`);

if (unalignedDocs.length === 0) {
    console.log('✅ No unaligned documents to clean up!');
    db.close();
    process.exit(0);
}

// Analyze what we're about to delete
let sourceBreakdown = {};
let scoreRanges = {
    '0-2%': 0,
    '2-4%': 0,
    '4-6%': 0,
    '6-8%': 0
};

unalignedDocs.forEach(doc => {
    try {
        const content = JSON.parse(doc.content);
        const source = content.source || 'unknown';
        sourceBreakdown[source] = (sourceBreakdown[source] || 0) + 1;

        const score = doc.alignment_score || 0;
        if (score < 0.02) scoreRanges['0-2%']++;
        else if (score < 0.04) scoreRanges['2-4%']++;
        else if (score < 0.06) scoreRanges['4-6%']++;
        else scoreRanges['6-8%']++;
    } catch (e) {
        // Skip if content can't be parsed
    }
});

console.log('📊 Breakdown by source:');
Object.entries(sourceBreakdown).forEach(([source, count]) => {
    console.log(`  ${source}: ${count} documents`);
});

console.log('\n📊 Breakdown by score:');
Object.entries(scoreRanges).forEach(([range, count]) => {
    console.log(`  ${range}: ${count} documents`);
});

// Show sample of what will be deleted
console.log('\n📄 Sample documents to be deleted (first 5):');
unalignedDocs.slice(0, 5).forEach(doc => {
    try {
        const content = JSON.parse(doc.content);
        const title = content.title || content.text?.substring(0, 50) || 'Untitled';
        const score = (doc.alignment_score * 100).toFixed(1);
        console.log(`  [${score}%] ${title}`);
    } catch (e) {
        console.log(`  [${(doc.alignment_score * 100).toFixed(1)}%] (parse error)`);
    }
});

if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN MODE - No documents were deleted');
    console.log('   Run with --execute flag to actually delete these documents');
    console.log(`   Command: node cleanup-unaligned-documents.js --execute`);
} else {
    console.log('\n⚠️  EXECUTE MODE - Converting to tombstone records...');
    console.log('ℹ️  Keeping hash to prevent re-import, deleting content to reclaim space\n');

    // Prepare statements for tombstone conversion
    const deleteBroadcastsStmt = db.prepare(`DELETE FROM broadcasts WHERE documentId = ?`);
    const deleteBroadcastAttemptsStmt = db.prepare(`DELETE FROM broadcast_attempts WHERE documentId = ?`);
    const deleteEntityMentionsStmt = db.prepare(`DELETE FROM entity_mentions WHERE document_id = ?`);

    // Convert to tombstone: keep hash for dedup, remove content/embedding to reclaim space
    const tombstoneStmt = db.prepare(`
        UPDATE memories
        SET content = json_object('deleted', true, 'hash', json_extract(content, '$.hash'), 'deleted_at', datetime('now')),
            embedding = zeroblob(0),
            alignment_score = 0
        WHERE id = ?
    `);

    const deleteTx = db.transaction((docs) => {
        let broadcastsDeleted = 0;
        let attemptsDeleted = 0;
        let mentionsDeleted = 0;

        for (const doc of docs) {
            // Delete related records (they're useless for tombstones)
            const broadcasts = deleteBroadcastsStmt.run(doc.id);
            broadcastsDeleted += broadcasts.changes;

            const attempts = deleteBroadcastAttemptsStmt.run(doc.id);
            attemptsDeleted += attempts.changes;

            const mentions = deleteEntityMentionsStmt.run(doc.id);
            mentionsDeleted += mentions.changes;

            // Convert document to tombstone
            tombstoneStmt.run(doc.id);
        }

        return { broadcastsDeleted, attemptsDeleted, mentionsDeleted };
    });

    try {
        const stats = deleteTx(unalignedDocs);
        console.log(`✅ Successfully converted ${unalignedDocs.length} documents to tombstones`);
        console.log(`   Deleted content & embeddings (space reclaimed)`);
        console.log(`   Kept hashes (prevents re-import)`);
        console.log(`   Also deleted: ${stats.broadcastsDeleted} broadcasts, ${stats.attemptsDeleted} attempts, ${stats.mentionsDeleted} entity mentions`);

        // Vacuum database to reclaim space
        console.log('\n🗜️  Vacuuming database to reclaim space...');
        db.exec('VACUUM');
        console.log('✅ Database vacuumed');

    } catch (e) {
        console.error('❌ Error during cleanup:', e.message);
        process.exit(1);
    }
}

// Show final stats (exclude tombstones)
const activeDocs = db.prepare(`
    SELECT COUNT(*) as count
    FROM memories
    WHERE type = 'documents'
    AND json_extract(content, '$.deleted') IS NULL
`).get();

const tombstones = db.prepare(`
    SELECT COUNT(*) as count
    FROM memories
    WHERE type = 'documents'
    AND json_extract(content, '$.deleted') = 1
`).get();

const highScoringDocs = db.prepare(`
    SELECT COUNT(*) as count
    FROM memories
    WHERE type = 'documents'
    AND alignment_score >= 0.12
    AND json_extract(content, '$.deleted') IS NULL
`).get();

console.log('\n📈 Final Statistics:');
console.log(`  Active documents: ${activeDocs.count}`);
console.log(`  Tombstone records: ${tombstones.count} (prevent re-import)`);
console.log(`  Broadcast-ready (>=12%): ${highScoringDocs.count}`);
console.log(`  Database health: ${(highScoringDocs.count / activeDocs.count * 100).toFixed(1)}% broadcast-ready`);

db.close();
console.log('\n✨ Cleanup complete!');
