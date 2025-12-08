const sqlite3 = require('better-sqlite3');
const fs = require('fs');

// Load alignment keywords
const alignmentConfig = JSON.parse(fs.readFileSync('alignment-keywords-refined.json', 'utf8'));

// Open database
const db = sqlite3('agent/data/db.sqlite');

// Get all documents with broadcasts
const docs = db.prepare('SELECT DISTINCT documentId FROM broadcasts').all();

console.log(`📊 Recalculating scores for ${docs.length} documents with updated weights...`);
console.log(`   - clean_energy: 0.30 → 0.15`);
console.log(`   - Obsidian multiplier: 4.0 → 1.5`);

let updated = 0;
for (const {documentId} of docs) {
    const doc = db.prepare('SELECT * FROM memories WHERE id = ?').get(documentId);
    if (!doc) continue;

    const content = JSON.parse(doc.content);
    const text = (content.text || '').toLowerCase();

    // Calculate alignment score
    const themeScores = {};
    let totalScore = 0;

    for (const [themeName, theme] of Object.entries(alignmentConfig.themes)) {
        let matches = 0;
        for (const keyword of theme.keywords) {
            if (text.includes(keyword.toLowerCase())) {
                matches++;
            }
        }
        const themeScore = (matches / theme.keywords.length) * theme.weight;
        themeScores[themeName] = themeScore;
        totalScore += themeScore;
    }

    // Apply source quality multiplier
    const source = content.source || 'unknown';
    const multiplier = alignmentConfig.scoring_recommendations.source_quality_multiplier[source] || 1.0;
    totalScore *= multiplier;

    // Multi-theme boost
    const strongThemes = Object.values(themeScores).filter(score => score > 0.05).length;
    if (strongThemes >= 3) {
        totalScore *= 1.3;
    } else if (strongThemes >= 2) {
        totalScore *= 1.15;
    }

    // Obsidian minimum
    if (source === 'obsidian') {
        totalScore = Math.max(totalScore, 0.15);
    }

    // Update document
    db.prepare('UPDATE memories SET alignment_score = ? WHERE id = ?').run(totalScore, documentId);
    updated++;
}

console.log(`✅ Updated ${updated} documents`);

// Now update broadcast scores from documents
console.log(`\n📝 Updating broadcast scores from documents...`);
const result = db.prepare(`
    UPDATE broadcasts
    SET alignment_score = (
        SELECT alignment_score FROM memories WHERE id = broadcasts.documentId
    )
    WHERE documentId IS NOT NULL
`).run();

console.log(`✅ Updated ${result.changes} broadcasts`);

// Show new distribution
console.log(`\n📊 New broadcast distribution:`);
const dist = db.prepare(`
    SELECT
      CASE
        WHEN alignment_score >= 0.12 THEN '>=0.12 (SENDABLE)'
        WHEN alignment_score >= 0.10 THEN '0.10-0.12'
        WHEN alignment_score >= 0.08 THEN '0.08-0.10'
        ELSE '<0.08'
      END as score_range,
      COUNT(*) as count
    FROM broadcasts
    WHERE status = 'pending'
    GROUP BY score_range
    ORDER BY MIN(alignment_score) DESC
`).all();

dist.forEach(row => {
    console.log(`   ${row.score_range}: ${row.count}`);
});
