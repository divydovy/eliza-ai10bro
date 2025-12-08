const sqlite3 = require('better-sqlite3');
const fs = require('fs');

// Load alignment config to get source quality mappings
const alignmentConfig = JSON.parse(fs.readFileSync('alignment-keywords-refined.json', 'utf8'));

// Open database
const db = sqlite3('agent/data/db.sqlite');

console.log('🏷️  Fixing source labels for unlabeled documents...\n');

// Get all documents without source labels
const unlabeled = db.prepare(`
    SELECT id, content
    FROM memories
    WHERE type = 'documents'
    AND json_extract(content, '$.source') IS NULL
`).all();

console.log(`Found ${unlabeled.length} unlabeled documents\n`);

const stats = {
    arxiv: 0,
    reddit: 0,
    premium: 0,
    trusted: 0,
    other: 0
};

for (const doc of unlabeled) {
    const content = JSON.parse(doc.content);
    const text = content.text || '';

    let newSource = null;

    // Detect ArXiv papers
    if (text.includes('**Published:**') && text.includes('**Authors:**') && text.includes('**Categories:**')) {
        newSource = 'arxiv';
        stats.arxiv++;
    }
    // Detect Reddit posts
    else if (text.includes('**Subreddit:**') && text.includes('**Author:**')) {
        newSource = 'reddit';
        stats.reddit++;
    }
    // Parse YAML frontmatter for source URL
    else if (text.startsWith('---\n')) {
        const yamlMatch = text.match(/---\n([\s\S]*?)\n---/);
        if (yamlMatch) {
            const yaml = yamlMatch[1];
            const sourceMatch = yaml.match(/source:\s*["']?(https?:\/\/[^\s"']+)["']?/);

            if (sourceMatch) {
                const url = sourceMatch[1];

                // Check if premium source
                const isPremium = alignmentConfig.source_quality_indicators.premium_sources.some(domain =>
                    url.includes(domain)
                );
                const isTrusted = alignmentConfig.source_quality_indicators.trusted_sources.some(domain =>
                    url.includes(domain)
                );

                if (isPremium) {
                    newSource = 'premium';
                    stats.premium++;
                } else if (isTrusted) {
                    newSource = 'trusted';
                    stats.trusted++;
                } else {
                    newSource = 'web';
                    stats.other++;
                }
            }
        }
    }

    // Update document with source label
    if (newSource) {
        content.source = newSource;
        db.prepare('UPDATE memories SET content = ? WHERE id = ?').run(
            JSON.stringify(content),
            doc.id
        );
    }
}

console.log('✅ Source labeling complete!\n');
console.log('📊 Distribution:');
console.log(`   ArXiv papers: ${stats.arxiv}`);
console.log(`   Reddit posts: ${stats.reddit}`);
console.log(`   Premium sources (1.3x): ${stats.premium}`);
console.log(`   Trusted sources (1.15x): ${stats.trusted}`);
console.log(`   Other web sources (1.0x): ${stats.other}`);

console.log('\n🔄 Now recalculating alignment scores with proper source multipliers...');

// Recalculate scores for all affected documents
const docsToRecalc = db.prepare(`
    SELECT DISTINCT documentId
    FROM broadcasts
    WHERE documentId IN (
        SELECT id FROM memories
        WHERE type = 'documents'
        AND json_extract(content, '$.source') IN ('arxiv', 'reddit', 'premium', 'trusted', 'web')
    )
`).all();

console.log(`Recalculating ${docsToRecalc.length} documents...\n`);

let recalculated = 0;
for (const {documentId} of docsToRecalc) {
    const doc = db.prepare('SELECT * FROM memories WHERE id = ?').get(documentId);
    if (!doc) continue;

    const content = JSON.parse(doc.content);
    const text = (content.text || '').toLowerCase();
    const source = content.source || 'unknown';

    // Calculate alignment score (same as process-unprocessed-docs.js)
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
    const multiplierMap = alignmentConfig.scoring_recommendations.source_quality_multiplier;
    const multiplier = multiplierMap[source] || multiplierMap.unknown || 1.0;
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
    recalculated++;
}

console.log(`✅ Recalculated ${recalculated} documents\n`);

// Update broadcast scores
console.log('📝 Updating broadcast scores...');
const result = db.prepare(`
    UPDATE broadcasts
    SET alignment_score = (
        SELECT alignment_score FROM memories WHERE id = broadcasts.documentId
    )
    WHERE documentId IN (
        SELECT id FROM memories
        WHERE type = 'documents'
        AND json_extract(content, '$.source') IN ('arxiv', 'reddit', 'premium', 'trusted', 'web')
    )
`).run();

console.log(`✅ Updated ${result.changes} broadcasts\n`);

// Show new distribution
console.log('📊 New broadcast distribution:');
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
