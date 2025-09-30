#!/usr/bin/env node

const Database = require('better-sqlite3');
const db = new Database('./agent/data/db.sqlite');
const alignmentConfig = require('./alignment-keywords-refined.json');

console.log('🔍 Testing Obsidian document alignment scores...\n');

// Get Obsidian documents without broadcasts
const obsidianDocs = db.prepare(`
    SELECT m.id,
           substr(json_extract(m.content, '$.text'), 1, 500) as text_sample,
           json_extract(m.content, '$.text') as full_text,
           json_extract(m.content, '$.source') as source
    FROM memories m
    WHERE json_extract(m.content, '$.source') = 'obsidian'
    AND NOT EXISTS (
        SELECT 1 FROM broadcasts b WHERE b.documentId = m.id
    )
    LIMIT 10
`).all();

console.log(`Analyzing ${obsidianDocs.length} Obsidian documents...\n`);

const missionKeywords = {
    aiComputing: alignmentConfig.themes.ai_computing.keywords,
    innovationMarkets: alignmentConfig.themes.innovation_markets.keywords,
    syntheticBiology: alignmentConfig.themes.synthetic_biology.keywords,
    healthMedicine: alignmentConfig.themes.health_medicine.keywords,
    cleanEnergy: alignmentConfig.themes.clean_energy.keywords,
    materials: alignmentConfig.themes.advanced_materials.keywords,
    agriculture: alignmentConfig.themes.agriculture_food.keywords
};

obsidianDocs.forEach((doc, idx) => {
    const contentLower = (doc.full_text || '').toLowerCase().substring(0, 2000);
    let alignmentScore = 0;
    let themeScores = {};

    // Calculate theme scores
    Object.entries(alignmentConfig.themes).forEach(([theme, config]) => {
        let themeMatches = 0;
        const keywords = missionKeywords[theme.replace(/_([a-z])/g, (m, p1) => p1.toUpperCase())];

        if (keywords) {
            keywords.forEach(keyword => {
                if (contentLower.includes(keyword.toLowerCase())) {
                    themeMatches++;
                }
            });

            const themeScore = Math.min(themeMatches / keywords.length, 1.0) * config.weight;
            themeScores[theme] = themeScore;
            alignmentScore += themeScore;
        }
    });

    // Current source bonus (Obsidian gets nothing special)
    alignmentScore = Math.min(alignmentScore, 1.0);

    console.log(`Document ${idx + 1}:`);
    console.log(`  Sample: ${doc.text_sample.substring(0, 100)}...`);
    console.log(`  Current Score: ${(alignmentScore * 100).toFixed(1)}%`);
    console.log(`  Theme breakdown:`);
    Object.entries(themeScores).forEach(([theme, score]) => {
        if (score > 0) {
            console.log(`    - ${theme}: ${(score * 100).toFixed(1)}%`);
        }
    });

    // What would happen with Obsidian boost?
    const boostedScore = Math.min(alignmentScore * 2.5, 1.0); // 2.5x boost for Obsidian
    console.log(`  With Obsidian boost (2.5x): ${(boostedScore * 100).toFixed(1)}%`);
    console.log();
});

console.log('─'.repeat(50));
console.log('RECOMMENDATION: Add source-based boost for Obsidian documents');
console.log('Obsidian documents should get 2.5x multiplier to ensure ≥30% alignment');

db.close();