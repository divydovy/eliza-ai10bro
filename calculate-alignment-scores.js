#!/usr/bin/env node

const Database = require('better-sqlite3');
const db = new Database('./agent/data/db.sqlite');
const alignmentConfig = require('./alignment-keywords-refined.json');

console.log('🎯 Calculating and storing alignment scores for all documents...');

// First, add alignment_score column if it doesn't exist
try {
    db.exec(`ALTER TABLE memories ADD COLUMN alignment_score REAL DEFAULT 0`);
    console.log('✅ Added alignment_score column to memories table');
} catch (e) {
    if (e.message.includes('duplicate column name')) {
        console.log('ℹ️  alignment_score column already exists');
    } else {
        throw e;
    }
}

// Get all documents
const documents = db.prepare(`
    SELECT id, content
    FROM memories
    WHERE type = 'documents'
`).all();

console.log(`Found ${documents.length} documents to score...\n`);

const missionKeywords = {
    aiComputing: alignmentConfig.themes.ai_computing.keywords,
    innovationMarkets: alignmentConfig.themes.innovation_markets.keywords,
    syntheticBiology: alignmentConfig.themes.synthetic_biology.keywords,
    healthMedicine: alignmentConfig.themes.health_medicine.keywords,
    cleanEnergy: alignmentConfig.themes.clean_energy.keywords,
    materials: alignmentConfig.themes.advanced_materials.keywords,
    agriculture: alignmentConfig.themes.agriculture_food.keywords,
    generalTech: alignmentConfig.themes.general_tech ? alignmentConfig.themes.general_tech.keywords : []
};

const updateStmt = db.prepare(`UPDATE memories SET alignment_score = ? WHERE id = ?`);

let processed = 0;
let highScoring = 0;
let obsidianCount = 0;
let obsidianHighScore = 0;

for (const doc of documents) {
    try {
        const content = JSON.parse(doc.content);
        const contentLower = (content.text || '').toLowerCase().substring(0, 2000);
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

        // Apply source quality multipliers
        let sourceBonus = 1.0;
        
        // Obsidian documents get highest priority
        if (content.source === 'obsidian') {
            sourceBonus = alignmentConfig.scoring_recommendations.source_quality_multiplier.obsidian || 4.0;
            obsidianCount++;
        } else if (content.url) {
            const url = content.url.toLowerCase();
            const domain = url.match(/https?:\/\/([^/]+)/)?.[1]?.replace('www.', '');
            
            if (domain) {
                if (alignmentConfig.source_quality_indicators.premium_sources.includes(domain)) {
                    sourceBonus = alignmentConfig.scoring_recommendations.source_quality_multiplier.premium || 1.3;
                } else if (alignmentConfig.source_quality_indicators.trusted_sources.includes(domain)) {
                    sourceBonus = alignmentConfig.scoring_recommendations.source_quality_multiplier.trusted || 1.15;
                } else if (alignmentConfig.source_quality_indicators.industry_sources.includes(domain)) {
                    sourceBonus = alignmentConfig.scoring_recommendations.source_quality_multiplier.industry || 1.1;
                }
            }
        }

        // Apply source quality multiplier
        alignmentScore *= sourceBonus;

        // Ensure Obsidian documents always pass
        if (content.source === 'obsidian') {
            alignmentScore = Math.max(alignmentScore, 0.35); // Minimum 35% for Obsidian
            if (alignmentScore >= 0.3) obsidianHighScore++;
        }

        // Boost for multiple strong themes
        const strongThemes = Object.values(themeScores).filter(score => score > 0.1).length;
        if (strongThemes >= 3) {
            alignmentScore *= 1.15; // 15% boost for interdisciplinary content
        }

        // Cap at 1.0
        alignmentScore = Math.min(alignmentScore, 1.0);

        // Store the score
        updateStmt.run(alignmentScore, doc.id);
        processed++;
        
        if (alignmentScore >= 0.3) highScoring++;
        
        if (processed % 100 === 0) {
            console.log(`Processed ${processed}/${documents.length} documents...`);
        }
    } catch (e) {
        console.error(`Error processing document ${doc.id}:`, e.message);
    }
}

console.log(`\n✅ Calculated alignment scores for ${processed} documents`);
console.log(`📊 High scoring (>=30%): ${highScoring} documents (${(highScoring/processed*100).toFixed(1)}%)`);
if (obsidianCount > 0) {
    console.log(`🎯 Obsidian docs scoring HIGH: ${obsidianHighScore}/${obsidianCount} (${(obsidianHighScore/obsidianCount*100).toFixed(1)}%)`);
}

// Create index for faster queries
try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_alignment ON memories(alignment_score DESC)`);
    console.log('✅ Created index on alignment_score');
} catch (e) {
    console.log('ℹ️  Index already exists or could not be created');
}

db.close();
console.log('\n🎉 Done! Alignment scores have been stored in the database.');