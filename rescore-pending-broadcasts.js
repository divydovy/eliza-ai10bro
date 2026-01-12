#!/usr/bin/env node

/**
 * Re-score all pending broadcasts with updated LLM prompt
 * Removes broadcasts that fall below 10% threshold after rescoring
 */

const Database = require('better-sqlite3');
const { scoreDocument } = require('./llm-score-document');

const db = new Database('./agent/data/db.sqlite');

const ALIGNMENT_THRESHOLD = 0.10; // 10% minimum

async function rescorePendingBroadcasts() {
    // Get all pending broadcasts with their source documents
    const pending = db.prepare(`
        SELECT
            b.id as broadcast_id,
            b.client,
            m.id as doc_id,
            m.alignment_score as old_score,
            json_extract(m.content, '$.text') as text,
            json_extract(m.content, '$.title') as title
        FROM broadcasts b
        JOIN memories m ON b.documentId = m.id
        WHERE b.status = 'pending'
        AND json_extract(m.content, '$.text') IS NOT NULL
        ORDER BY m.alignment_score DESC
    `).all();

    console.log(`🔄 Re-scoring ${pending.length} pending broadcasts...\n`);

    const updateScore = db.prepare('UPDATE memories SET alignment_score = ? WHERE id = ?');
    const deleteBroadcast = db.prepare('DELETE FROM broadcasts WHERE id = ?');

    let rescored = 0;
    let deleted = 0;
    let errors = 0;
    let kept = 0;

    for (const item of pending) {
        if (!item.text) {
            console.log(`⚠️  Skipping ${item.broadcast_id.substring(0, 8)}: no text`);
            continue;
        }

        try {
            const newScore = await scoreDocument(item.text);
            const oldPercent = Math.round((item.old_score || 0) * 100);
            const newPercent = Math.round(newScore * 100);

            // Update document score
            updateScore.run(newScore, item.doc_id);

            // Delete broadcast if below threshold
            if (newScore < ALIGNMENT_THRESHOLD) {
                deleteBroadcast.run(item.broadcast_id);
                deleted++;
                console.log(`❌ Deleted ${item.client}: ${oldPercent}% → ${newPercent}% - ${item.title || 'Untitled'}`);
            } else {
                kept++;
                const status = newScore < item.old_score ? '⬇️' : newScore > item.old_score ? '⬆️' : '➡️';
                console.log(`${status} Kept ${item.client}: ${oldPercent}% → ${newPercent}% - ${item.title || 'Untitled'}`);
            }

            rescored++;

            // Progress update every 50
            if (rescored % 50 === 0) {
                console.log(`\n📊 Progress: ${rescored}/${pending.length} (${Math.round(rescored/pending.length*100)}%)`);
                console.log(`   Kept: ${kept}, Deleted: ${deleted}, Errors: ${errors}\n`);
            }

        } catch (error) {
            errors++;
            console.log(`❌ Error scoring ${item.broadcast_id.substring(0, 8)}: ${error.message}`);
        }
    }

    console.log(`\n✅ Re-scoring complete!`);
    console.log(`   Total processed: ${rescored}`);
    console.log(`   Kept (>= ${ALIGNMENT_THRESHOLD * 100}%): ${kept}`);
    console.log(`   Deleted (< ${ALIGNMENT_THRESHOLD * 100}%): ${deleted}`);
    console.log(`   Errors: ${errors}`);

    // Show final distribution
    const finalStats = db.prepare(`
        SELECT
            b.client,
            COUNT(*) as count,
            MIN(printf('%.0f%%', m.alignment_score * 100)) as min_score,
            MAX(printf('%.0f%%', m.alignment_score * 100)) as max_score,
            AVG(m.alignment_score * 100) as avg_score
        FROM broadcasts b
        JOIN memories m ON b.documentId = m.id
        WHERE b.status = 'pending'
        GROUP BY b.client
        ORDER BY b.client
    `).all();

    console.log(`\n📊 Final Pending Broadcasts:`);
    for (const stat of finalStats) {
        console.log(`   ${stat.client}: ${stat.count} broadcasts (${stat.min_score}-${stat.max_score}, avg ${Math.round(stat.avg_score)}%)`);
    }

    db.close();
}

rescorePendingBroadcasts().catch(err => {
    console.error('Fatal error:', err);
    db.close();
    process.exit(1);
});
