#!/usr/bin/env node

// Test alignment scoring for Obsidian synthetic biology content
const testContent = `---
title: "Global Synthetic Biology Market Valuation and Growth Forecast to 2035"
source: "https://www.marketreports.us/synthetic-biology-market-10193"

Synthetic Biology Market experiencing unprecedented growth. The synthetic biology market represents a revolutionary convergence of engineering principles with biological systems, fundamentally reshaping how we approach manufacturing, medicine, agriculture, and environmental solutions. This emerging field combines disciplines such as molecular biology, genetic engineering, computer science, and systems biology to design and construct new biological parts, devices, and systems.

Key applications include biomanufacturing, precision fermentation, metabolic engineering, and cellular agriculture. Companies are leveraging engineered microorganisms to produce chemicals, materials, and fuels through fermentation processes that generate fewer greenhouse gas emissions.`;

const missionKeywords = {
    // Core mission keywords - sustainability & regeneration (high weight)
    core: ['renewable energy', 'solar power', 'wind power', 'carbon capture',
           'climate tech', 'sustainability', 'regenerative', 'biomimicry',
           'circular economy', 'green energy', 'sustainable materials',
           'biodegradable', 'carbon negative', 'net zero', 'clean energy',
           'synthetic biology', 'bioengineering', 'biomanufacturing', 'fermentation',
           'metabolic engineering', 'cellular agriculture', 'precision fermentation'],
    // Supporting keywords - breakthrough innovations (medium weight)
    tech: ['breakthrough', 'innovation', 'discovery', 'fusion energy',
           'vertical farming', 'lab grown', 'cultured meat', 'alternative protein',
           'energy storage', 'battery', 'hydrogen', 'geothermal',
           'microorganism', 'engineered', 'biofuel', 'biomaterials', 'gene editing',
           'CRISPR', 'protein design', 'DNA synthesis', 'artificial cells',
           'biocomputing', 'living materials', 'microbiome', 'biotechnology'],
    // Context keywords (low weight)
    context: ['environment', 'climate', 'energy', 'efficiency', 'reduce emissions',
             'sustainable', 'ecological', 'conservation', 'market', 'growth',
             'technology', 'research', 'development', 'commercial', 'application']
};

const contentLower = testContent.toLowerCase();

// Calculate alignment score
let alignmentScore = 0;
let coreMatches = 0;
let techMatches = 0;

console.log('🔍 Testing alignment scoring for synthetic biology content\n');
console.log('Content snippet:', contentLower.substring(0, 200) + '...\n');

// Check core keywords (0.3 points each, max 0.6)
console.log('Core Keywords Found:');
for (const keyword of missionKeywords.core) {
    if (contentLower.includes(keyword)) {
        coreMatches++;
        alignmentScore += 0.3;
        console.log(`  ✅ "${keyword}" - Score: +0.3`);
        if (alignmentScore >= 0.6) {
            console.log('  ⚠️  Core keyword cap reached (0.6)');
            alignmentScore = 0.6;
            break;
        }
    }
}
console.log(`Core total: ${coreMatches} matches, ${Math.min(coreMatches * 0.3, 0.6).toFixed(2)} points\n`);

// Check tech keywords (0.1 points each, max 0.3)
const techStart = alignmentScore;
console.log('Tech Keywords Found:');
for (const keyword of missionKeywords.tech) {
    if (contentLower.includes(keyword)) {
        techMatches++;
        alignmentScore += 0.1;
        console.log(`  ✅ "${keyword}" - Score: +0.1`);
        if (alignmentScore >= techStart + 0.3) {
            console.log('  ⚠️  Tech keyword cap reached (0.3)');
            alignmentScore = techStart + 0.3;
            break;
        }
    }
}
console.log(`Tech total: ${techMatches} matches, ${Math.min(techMatches * 0.1, 0.3).toFixed(2)} points\n`);

// Add context bonus (max 0.1)
const contextMatches = missionKeywords.context.filter(k => contentLower.includes(k)).length;
const contextBonus = Math.min(contextMatches * 0.02, 0.1);
alignmentScore += contextBonus;
console.log('Context Keywords:', contextMatches, 'matches,', contextBonus.toFixed(2), 'points\n');

// Cap at 1.0
alignmentScore = Math.min(alignmentScore, 1.0);

console.log('═'.repeat(50));
console.log(`📊 FINAL ALIGNMENT SCORE: ${(alignmentScore * 100).toFixed(0)}%`);
console.log(`Threshold: 15%`);
console.log(`Result: ${alignmentScore >= 0.15 ? '✅ PASS - Would process' : '❌ FAIL - Would skip'}`);
console.log('═'.repeat(50));