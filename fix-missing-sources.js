#!/usr/bin/env node

/**
 * Add Missing Source URLs to Broadcasts
 *
 * Problem: 21 broadcasts missing source URLs (created during times when source extraction failed)
 * Solution: Extract source URLs from documents and add to broadcast content
 */

const Database = require('better-sqlite3');

console.log('🔗 Adding Missing Source URLs\n');

const db = new Database('./agent/data/db.sqlite');

// Find broadcasts missing sources
const broadcastsWithoutSources = db.prepare(`
    SELECT
        b.id,
        b.documentId,
        b.client,
        b.content,
        b.alignment_score,
        datetime(b.createdAt/1000, 'unixepoch') as created
    FROM broadcasts b
    WHERE b.status = 'pending'
    AND b.alignment_score >= 0.12
    AND b.content NOT LIKE '%Source:%'
    ORDER BY b.createdAt ASC
`).all();

console.log(`📊 Found ${broadcastsWithoutSources.length} broadcasts without source URLs\n`);

if (broadcastsWithoutSources.length === 0) {
    console.log('✅ All broadcasts have source URLs!\n');
    db.close();
    process.exit(0);
}

let fixed = 0;
let failed = 0;
let noSource = 0;

for (const broadcast of broadcastsWithoutSources) {
    console.log(`\n🔍 Broadcast: ${broadcast.id.substring(0, 8)}... (${broadcast.client})`);

    // Get source document
    const document = db.prepare(`SELECT content FROM memories WHERE id = ?`).get(broadcast.documentId);

    if (!document) {
        console.log(`   ⚠️  Document not found`);
        failed++;
        continue;
    }

    try {
        const docContent = JSON.parse(document.content);
        const docText = docContent.text || '';

        // Extract source URL from document
        let sourceUrl = null;

        // Try to find source: in markdown frontmatter
        const sourceMatch = docText.match(/^source:\s*(.+)$/m);
        if (sourceMatch) {
            sourceUrl = sourceMatch[1].trim();
        }

        // Try DOI format
        if (!sourceUrl) {
            const doiMatch = docText.match(/doi:\s*"?([^"\n]+)"?/i);
            if (doiMatch) {
                sourceUrl = `https://doi.org/${doiMatch[1].trim()}`;
            }
        }

        // Try direct URL in text
        if (!sourceUrl) {
            const urlMatch = docText.match(/https?:\/\/[^\s\)]+/);
            if (urlMatch) {
                sourceUrl = urlMatch[0];
            }
        }

        if (!sourceUrl) {
            console.log(`   ⚠️  No source URL found in document`);
            noSource++;
            continue;
        }

        console.log(`   📎 Found source: ${sourceUrl}`);

        // Update broadcast content
        const broadcastContent = JSON.parse(broadcast.content);
        broadcastContent.text = `${broadcastContent.text}\n\n🔗 Source: ${sourceUrl}`;

        const result = db.prepare(`
            UPDATE broadcasts
            SET content = ?
            WHERE id = ?
        `).run(JSON.stringify(broadcastContent), broadcast.id);

        console.log(`   ✅ Updated broadcast`);
        fixed++;

    } catch (error) {
        console.log(`   ❌ Failed: ${error.message}`);
        failed++;
    }
}

console.log(`\n📊 Summary:`);
console.log(`   ✅ Fixed: ${fixed}`);
console.log(`   ⚠️  No source found: ${noSource}`);
console.log(`   ❌ Failed: ${failed}`);

// Check final stats
const finalStats = db.prepare(`
    SELECT
        COUNT(*) as total,
        SUM(CASE WHEN content LIKE '%Source:%' THEN 1 ELSE 0 END) as with_sources,
        SUM(CASE WHEN content NOT LIKE '%Source:%' THEN 1 ELSE 0 END) as without_sources
    FROM broadcasts
    WHERE status = 'pending'
    AND alignment_score >= 0.12
`).get();

console.log(`\n📈 Final Stats:`);
console.log(`   Total sendable: ${finalStats.total}`);
console.log(`   With sources: ${finalStats.with_sources} (${Math.round(finalStats.with_sources/finalStats.total*100)}%)`);
console.log(`   Without sources: ${finalStats.without_sources} (${Math.round(finalStats.without_sources/finalStats.total*100)}%)`);

db.close();
console.log('\n✅ Complete!\n');
