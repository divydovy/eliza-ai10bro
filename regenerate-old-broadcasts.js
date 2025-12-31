#!/usr/bin/env node

/**
 * Regenerate Old Broadcasts with Current Quality Standards
 *
 * Problem: Old broadcasts (created before Dec 15) don't have:
 * - Images
 * - Proper source URLs
 * - Current formatting standards
 *
 * Solution:
 * 1. Find old pending broadcasts (before Dec 15, 2025)
 * 2. Delete them from broadcasts table
 * 3. Documents become "unprocessed" again
 * 4. Run process-unprocessed-docs.js to regenerate with current quality
 */

const Database = require('better-sqlite3');
const { execSync } = require('child_process');

const CUTOFF_DATE = new Date('2025-12-15T00:00:00Z');
const CUTOFF_TIMESTAMP = CUTOFF_DATE.getTime();

console.log('🔄 Regenerating Old Broadcasts\n');
console.log(`Cutoff date: ${CUTOFF_DATE.toISOString()}`);
console.log(`Cutoff timestamp: ${CUTOFF_TIMESTAMP}\n`);

const db = new Database('./agent/data/db.sqlite');

// Step 1: Find old pending broadcasts (only sendable ones with alignment >= 0.12)
const oldBroadcasts = db.prepare(`
    SELECT
        b.id,
        b.documentId,
        b.client,
        b.alignment_score,
        datetime(b.createdAt/1000, 'unixepoch') as created_utc,
        CASE WHEN b.image_url IS NOT NULL THEN 1 ELSE 0 END as has_image,
        CASE WHEN b.content LIKE '%Source:%' THEN 1 ELSE 0 END as has_source
    FROM broadcasts b
    WHERE b.status = 'pending'
    AND b.alignment_score >= 0.12
    AND b.createdAt < ?
`).all(CUTOFF_TIMESTAMP);

console.log(`📊 Found ${oldBroadcasts.length} old pending broadcasts\n`);

if (oldBroadcasts.length === 0) {
    console.log('✅ No old broadcasts to regenerate!\n');
    db.close();
    process.exit(0);
}

// Show quality issues
const withoutImages = oldBroadcasts.filter(b => !b.has_image).length;
const withoutSources = oldBroadcasts.filter(b => !b.has_source).length;

console.log('Quality Issues:');
console.log(`  - Without images: ${withoutImages}/${oldBroadcasts.length} (${Math.round(withoutImages/oldBroadcasts.length*100)}%)`);
console.log(`  - Without sources: ${withoutSources}/${oldBroadcasts.length} (${Math.round(withoutSources/oldBroadcasts.length*100)}%)\n`);

// Get unique documents
const uniqueDocuments = [...new Set(oldBroadcasts.map(b => b.documentId))];
console.log(`📄 ${uniqueDocuments.length} unique documents to regenerate\n`);

// Show sample
console.log('Sample broadcasts to delete:');
oldBroadcasts.slice(0, 5).forEach(b => {
    console.log(`  - ${b.id.substring(0, 8)}... | ${b.client} | score: ${b.alignment_score} | image: ${b.has_image ? '✅' : '❌'} | source: ${b.has_source ? '✅' : '❌'}`);
});
if (oldBroadcasts.length > 5) {
    console.log(`  ... and ${oldBroadcasts.length - 5} more\n`);
} else {
    console.log('');
}

// Ask for confirmation
const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
});

readline.question('Delete these old broadcasts and regenerate? (yes/no): ', (answer) => {
    if (answer.toLowerCase() !== 'yes') {
        console.log('\n❌ Cancelled. No changes made.\n');
        db.close();
        readline.close();
        process.exit(0);
    }

    console.log('\n🗑️  Deleting old broadcasts...');

    // Step 2: Delete old broadcasts (only sendable ones)
    const deleteResult = db.prepare(`
        DELETE FROM broadcasts
        WHERE status = 'pending'
        AND alignment_score >= 0.12
        AND createdAt < ?
    `).run(CUTOFF_TIMESTAMP);

    console.log(`✅ Deleted ${deleteResult.changes} broadcasts\n`);

    // Step 3: Run process-unprocessed-docs.js to regenerate
    console.log('🔨 Regenerating broadcasts with current quality standards...');
    console.log(`Command: node process-unprocessed-docs.js ${oldBroadcasts.length}\n`);

    try {
        const output = execSync(`node process-unprocessed-docs.js ${oldBroadcasts.length}`, {
            encoding: 'utf-8',
            stdio: 'inherit'
        });

        console.log('\n✅ Regeneration complete!\n');

        // Step 4: Show new broadcast stats
        const newBroadcasts = db.prepare(`
            SELECT
                client,
                COUNT(*) as count,
                SUM(CASE WHEN image_url IS NOT NULL THEN 1 ELSE 0 END) as with_images,
                SUM(CASE WHEN content LIKE '%Source:%' THEN 1 ELSE 0 END) as with_sources
            FROM broadcasts
            WHERE status = 'pending'
            AND createdAt >= ?
            GROUP BY client
        `).all(CUTOFF_TIMESTAMP);

        console.log('📊 New Broadcasts Created:');
        newBroadcasts.forEach(stats => {
            console.log(`  ${stats.client}: ${stats.count} total`);
            console.log(`    - With images: ${stats.with_images}/${stats.count} (${Math.round(stats.with_images/stats.count*100)}%)`);
            console.log(`    - With sources: ${stats.with_sources}/${stats.count} (${Math.round(stats.with_sources/stats.count*100)}%)`);
        });

    } catch (error) {
        console.error('\n❌ Error during regeneration:', error.message);
        process.exit(1);
    }

    db.close();
    readline.close();
});
