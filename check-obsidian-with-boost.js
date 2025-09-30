#!/usr/bin/env node

const Database = require('better-sqlite3');
const db = new Database('./agent/data/db.sqlite');
const alignmentConfig = require('./alignment-keywords-refined.json');

console.log('🔍 Checking all Obsidian documents with boost...\n');

// Get ALL Obsidian documents
const obsidianDocs = db.prepare(`
    SELECT m.id,
           json_extract(m.content, '$.text') as text,
           json_extract(m.content, '$.source') as source,
           CASE WHEN b.id IS NULL THEN 'no' ELSE 'yes' END as has_broadcast
    FROM memories m
    LEFT JOIN broadcasts b ON b.documentId = m.id
    WHERE json_extract(m.content, '$.source') = 'obsidian'
`).all();

console.log(`Total Obsidian documents: ${obsidianDocs.length}\n`);

const missionKeywords = {
    aiComputing: alignmentConfig.themes.ai_computing.keywords,
    innovationMarkets: alignmentConfig.themes.innovation_markets.keywords,
    syntheticBiology: alignmentConfig.themes.synthetic_biology.keywords,
    healthMedicine: alignmentConfig.themes.health_medicine.keywords,
    cleanEnergy: alignmentConfig.themes.clean_energy.keywords,
    materials: alignmentConfig.themes.advanced_materials.keywords,
    agriculture: alignmentConfig.themes.agriculture_food.keywords
};

let scoreDistribution = {
    'very_high': 0,  // > 50%
    'high': 0,       // 30-50%
    'medium': 0,     // 20-30%
    'low': 0,        // 12-20%
    'very_low': 0    // < 12%
};

let withBroadcast = 0;
let withoutBroadcast = 0;

obsidianDocs.forEach(doc => {
    const contentLower = (doc.text || '').toLowerCase().substring(0, 2000);
    let alignmentScore = 0;

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
            alignmentScore += themeScore;
        }
    });

    // Apply Obsidian boost
    alignmentScore *= 2.5;
    alignmentScore = Math.min(alignmentScore, 1.0);

    // Distribution
    if (alignmentScore > 0.5) scoreDistribution.very_high++;
    else if (alignmentScore >= 0.3) scoreDistribution.high++;
    else if (alignmentScore >= 0.2) scoreDistribution.medium++;
    else if (alignmentScore >= 0.12) scoreDistribution.low++;
    else scoreDistribution.very_low++;

    // Track broadcast status
    if (doc.has_broadcast === 'yes') withBroadcast++;
    else withoutBroadcast++;
});

console.log('📊 OBSIDIAN ALIGNMENT SCORES (WITH 2.5x BOOST):');
console.log('─'.repeat(50));
console.log(`Very High (>50%):  ${scoreDistribution.very_high.toString().padStart(3)} docs (${(scoreDistribution.very_high / obsidianDocs.length * 100).toFixed(1)}%)`);
console.log(`High (30-50%):     ${scoreDistribution.high.toString().padStart(3)} docs (${(scoreDistribution.high / obsidianDocs.length * 100).toFixed(1)}%)`);
console.log(`Medium (20-30%):   ${scoreDistribution.medium.toString().padStart(3)} docs (${(scoreDistribution.medium / obsidianDocs.length * 100).toFixed(1)}%)`);
console.log(`Low (12-20%):      ${scoreDistribution.low.toString().padStart(3)} docs (${(scoreDistribution.low / obsidianDocs.length * 100).toFixed(1)}%)`);
console.log(`Very Low (<12%):   ${scoreDistribution.very_low.toString().padStart(3)} docs (${(scoreDistribution.very_low / obsidianDocs.length * 100).toFixed(1)}%)`);

const totalPassing = obsidianDocs.length - scoreDistribution.very_low;
const passRate = (totalPassing / obsidianDocs.length * 100).toFixed(1);

console.log('\n✅ OBSIDIAN DOCS PASSING ALIGNMENT (≥12%):');
console.log('─'.repeat(50));
console.log(`${totalPassing} out of ${obsidianDocs.length} documents (${passRate}%)`);

console.log('\n📤 BROADCAST STATUS:');
console.log('─'.repeat(50));
console.log(`With broadcasts:    ${withBroadcast} docs`);
console.log(`Without broadcasts: ${withoutBroadcast} docs`);

if (passRate < 95) {
    console.log('\n⚠️  WARNING: Not all Obsidian docs pass alignment!');
    console.log('Consider increasing the boost factor or lowering threshold.');
} else {
    console.log('\n✅ SUCCESS: All/Most Obsidian docs now pass alignment!');
}

db.close();