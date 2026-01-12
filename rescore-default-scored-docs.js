#!/usr/bin/env node

/**
 * Re-score documents that have default score (0.05)
 * These are documents that failed to score due to timeout or error
 */

const Database = require('better-sqlite3');
const { scoreDocument } = require('./llm-score-document');

const db = new Database('./agent/data/db.sqlite');

async function rescoreDefaultScores() {
    // Get all documents with default score (0.05)
    const defaultScored = db.prepare(`
        SELECT
            id,
            json_extract(content, '$.text') as text,
            json_extract(content, '$.title') as title,
            json_extract(content, '$.source') as source
        FROM memories
        WHERE type = 'documents'
        AND alignment_score = 0.05
        AND json_extract(content, '$.text') IS NOT NULL
        ORDER BY createdAt DESC
    `).all();

    console.log(`🔄 Re-scoring ${defaultScored.length} documents with default score (0.05)...\n`);

    const updateScore = db.prepare('UPDATE memories SET alignment_score = ? WHERE id = ?');

    let rescored = 0;
    let errors = 0;
    let improved = 0;
    let stillLow = 0;

    for (const doc of defaultScored) {
        if (!doc.text) {
            console.log(`⚠️  Skipping ${doc.id.substring(0, 8)}: no text`);
            continue;
        }

        try {
            const newScore = await scoreDocument(doc.text);
            const newPercent = Math.round(newScore * 100);

            // Update document score
            updateScore.run(newScore, doc.id);

            if (newScore > 0.10) {
                improved++;
                console.log(`⬆️  ${doc.source}: 5% → ${newPercent}% - ${doc.title || 'Untitled'}`);
            } else {
                stillLow++;
                console.log(`➡️  ${doc.source}: 5% → ${newPercent}% - ${doc.title || 'Untitled'}`);
            }

            rescored++;

            // Progress update every 50
            if (rescored % 50 === 0) {
                console.log(`\n📊 Progress: ${rescored}/${defaultScored.length} (${Math.round(rescored/defaultScored.length*100)}%)`);
                console.log(`   Improved (>10%): ${improved}, Still Low (<=10%): ${stillLow}, Errors: ${errors}\n`);
            }

        } catch (error) {
            errors++;
            console.log(`❌ Error scoring ${doc.id.substring(0, 8)}: ${error.message}`);
        }
    }

    console.log(`\n✅ Re-scoring complete!`);
    console.log(`   Total processed: ${rescored}`);
    console.log(`   Improved (>10%): ${improved}`);
    console.log(`   Still Low (<=10%): ${stillLow}`);
    console.log(`   Errors: ${errors}`);

    // Show final distribution
    const stats = db.prepare(`
        SELECT
            CASE
                WHEN alignment_score >= 0.30 THEN '30%+'
                WHEN alignment_score >= 0.20 THEN '20-29%'
                WHEN alignment_score >= 0.12 THEN '12-19%'
                WHEN alignment_score >= 0.08 THEN '8-11%'
                ELSE 'Below 8%'
            END as score_range,
            COUNT(*) as count
        FROM memories
        WHERE type = 'documents'
        GROUP BY score_range
        ORDER BY score_range DESC
    `).all();

    console.log(`\n📊 Final Score Distribution:`);
    for (const stat of stats) {
        console.log(`   ${stat.score_range}: ${stat.count} documents`);
    }

    db.close();
}

rescoreDefaultScores().catch(err => {
    console.error('Fatal error:', err);
    db.close();
    process.exit(1);
});
