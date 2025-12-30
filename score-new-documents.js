#!/usr/bin/env node

/**
 * Score any unscored documents in the database
 * Runs quickly and exits if there are no documents to score
 * Safe to run from cron every hour
 */

const Database = require('better-sqlite3');
const { scoreDocument } = require('./llm-score-document');

const db = new Database('./agent/data/db.sqlite');

async function scoreNewDocuments() {
    // Get unscored documents
    const unscored = db.prepare(`
        SELECT id, content
        FROM memories
        WHERE type = 'documents'
        AND alignment_score IS NULL
        LIMIT 100
    `).all();

    if (unscored.length === 0) {
        console.log('✅ No unscored documents found');
        process.exit(0);
    }

    console.log(`🤖 Scoring ${unscored.length} new documents with qwen2.5:32b\n`);

    const updateStmt = db.prepare('UPDATE memories SET alignment_score = ? WHERE id = ?');

    for (const doc of unscored) {
        const content = JSON.parse(doc.content);
        const text = content.text || '';

        const score = await scoreDocument(text);

        if (score !== null) {
            updateStmt.run(score, doc.id);
            console.log(`  ✓ Scored: ${(score * 100).toFixed(0)}% - ${doc.id.substring(0, 8)}...`);
        } else {
            console.log(`  ⚠️  Failed to score: ${doc.id.substring(0, 8)}...`);
        }
    }

    console.log(`\n✅ Scored ${unscored.length} documents`);
    db.close();
}

scoreNewDocuments().catch(error => {
    console.error('❌ Error:', error.message);
    db.close();
    process.exit(1);
});
