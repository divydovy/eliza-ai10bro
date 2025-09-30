#!/usr/bin/env node

const Database = require('better-sqlite3');
const db = new Database('./agent/data/db.sqlite');
const alignmentConfig = require('./alignment-keywords-refined.json');

console.log('🔍 Analyzing remaining documents for alignment...\n');

// Get documents without broadcasts
const docsWithoutBroadcasts = db.prepare(`
    SELECT m.id, json_extract(m.content, '$.text') as text,
           json_extract(m.content, '$.source') as source
    FROM memories m
    WHERE m.type = 'documents'
    AND NOT EXISTS (
        SELECT 1 FROM broadcasts b WHERE b.documentId = m.id
    )
    AND json_extract(m.content, '$.text') IS NOT NULL
    AND length(json_extract(m.content, '$.text')) > 100
`).all();

console.log(`Total documents without broadcasts: ${docsWithoutBroadcasts.length}\n`);

// Score each document
let alignedCount = 0;
let scoreDistribution = {
    'very_high': 0,  // > 50%
    'high': 0,       // 30-50%
    'medium': 0,     // 20-30%
    'low': 0,        // 12-20%
    'very_low': 0    // < 12%
};

let sourceDistribution = {
    'obsidian': 0,
    'github': 0,
    'other': 0
};

const missionKeywords = {
    aiComputing: alignmentConfig.themes.ai_computing.keywords,
    innovationMarkets: alignmentConfig.themes.innovation_markets.keywords,
    syntheticBiology: alignmentConfig.themes.synthetic_biology.keywords,
    healthMedicine: alignmentConfig.themes.health_medicine.keywords,
    cleanEnergy: alignmentConfig.themes.clean_energy.keywords,
    materials: alignmentConfig.themes.advanced_materials.keywords,
    agriculture: alignmentConfig.themes.agriculture_food.keywords
};

docsWithoutBroadcasts.forEach(doc => {
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

    // Track source
    const source = doc.source || 'other';
    if (source === 'obsidian') sourceDistribution.obsidian++;
    else if (source === 'github') sourceDistribution.github++;
    else sourceDistribution.other++;

    // Apply source quality multiplier
    if (doc.source) {
        const sourceMatch = doc.source.match(/https?:\/\/([^\/]+)/);
        if (sourceMatch) {
            const domain = sourceMatch[1].replace('www.', '');
            if (alignmentConfig.source_quality_indicators.premium_sources.includes(domain)) {
                alignmentScore *= 1.3;
            } else if (alignmentConfig.source_quality_indicators.trusted_sources.includes(domain)) {
                alignmentScore *= 1.15;
            }
        }
    }

    alignmentScore = Math.min(alignmentScore, 1.0);

    // Would it pass?
    if (alignmentScore >= alignmentConfig.scoring_recommendations.core_alignment_minimum) {
        alignedCount++;
    }

    // Distribution
    if (alignmentScore > 0.5) scoreDistribution.very_high++;
    else if (alignmentScore >= 0.3) scoreDistribution.high++;
    else if (alignmentScore >= 0.2) scoreDistribution.medium++;
    else if (alignmentScore >= 0.12) scoreDistribution.low++;
    else scoreDistribution.very_low++;
});

console.log('📊 ALIGNMENT SCORE DISTRIBUTION:');
console.log('─'.repeat(50));
console.log(`Very High (>50%):  ${scoreDistribution.very_high.toString().padStart(5)} docs (${(scoreDistribution.very_high / docsWithoutBroadcasts.length * 100).toFixed(1)}%)`);
console.log(`High (30-50%):     ${scoreDistribution.high.toString().padStart(5)} docs (${(scoreDistribution.high / docsWithoutBroadcasts.length * 100).toFixed(1)}%)`);
console.log(`Medium (20-30%):   ${scoreDistribution.medium.toString().padStart(5)} docs (${(scoreDistribution.medium / docsWithoutBroadcasts.length * 100).toFixed(1)}%)`);
console.log(`Low (12-20%):      ${scoreDistribution.low.toString().padStart(5)} docs (${(scoreDistribution.low / docsWithoutBroadcasts.length * 100).toFixed(1)}%)`);
console.log(`Very Low (<12%):   ${scoreDistribution.very_low.toString().padStart(5)} docs (${(scoreDistribution.very_low / docsWithoutBroadcasts.length * 100).toFixed(1)}%)`);

console.log('\n📁 SOURCE DISTRIBUTION:');
console.log('─'.repeat(50));
console.log(`Obsidian:          ${sourceDistribution.obsidian.toString().padStart(5)} docs`);
console.log(`GitHub:            ${sourceDistribution.github.toString().padStart(5)} docs`);
console.log(`Other:             ${sourceDistribution.other.toString().padStart(5)} docs`);

console.log('\n✅ DOCUMENTS THAT WOULD PASS ALIGNMENT (≥12%):');
console.log('─'.repeat(50));
console.log(`${alignedCount} out of ${docsWithoutBroadcasts.length} documents (${(alignedCount / docsWithoutBroadcasts.length * 100).toFixed(1)}%)`);

// At current rate, how long to process?
const broadcastsPerDay = 4; // Creates 10 broadcasts every 6 hours
const documentsPerBroadcast = 1; // Each document gets broadcast
const daysToProcess = Math.ceil(alignedCount / (broadcastsPerDay * 10));

console.log('\n⏱️  TIME TO PROCESS:');
console.log('─'.repeat(50));
console.log(`At current rate (10 broadcasts every 6 hours):`);
console.log(`• ${alignedCount} aligned documents`);
console.log(`• ${Math.ceil(alignedCount / 10)} broadcast creation cycles needed`);
console.log(`• Approximately ${daysToProcess} days to process all aligned content`);

db.close();