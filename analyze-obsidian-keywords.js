#!/usr/bin/env node

const Database = require('better-sqlite3');
const db = new Database('./agent/data/db.sqlite');

console.log('📚 Analyzing Obsidian Document Themes and Keywords\n');
console.log('=' . repeat(60));

// Get all Obsidian documents
const obsidianDocs = db.prepare(`
    SELECT json_extract(content, '$.text') as text
    FROM memories
    WHERE json_extract(content, '$.source') = 'obsidian'
    AND json_extract(content, '$.text') IS NOT NULL
`).all();

console.log(`\nFound ${obsidianDocs.length} Obsidian documents to analyze\n`);

// Track keyword frequencies
const keywordFrequencies = {};
const titleWords = {};
const domainFrequencies = {};

// Keywords to track (expanded based on what we've seen)
const trackingKeywords = [
    // Biotech/Biology
    'synthetic biology', 'bioengineering', 'biomanufacturing', 'biotechnology',
    'protein', 'cells', 'biological', 'microorganism', 'bacteria', 'enzyme',
    'gene', 'CRISPR', 'DNA', 'RNA', 'genome', 'metabolic', 'fermentation',
    'lab grown', 'cultured', 'cellular', 'microbiome', 'pathogen', 'antibiotics',

    // AI/Computing
    'artificial intelligence', 'AI', 'machine learning', 'neural', 'computing',
    'algorithm', 'quantum', 'data', 'automation', 'robotics', 'AGI',
    'deep learning', 'reinforcement learning', 'transformer', 'LLM',

    // Energy/Climate
    'renewable', 'solar', 'wind', 'battery', 'hydrogen', 'fusion',
    'carbon', 'climate', 'sustainable', 'green', 'clean energy',
    'energy storage', 'grid', 'electrification', 'decarbonization',

    // Materials/Manufacturing
    'materials', 'nanomaterials', 'biomaterials', 'circular economy',
    'recycling', 'plastic', 'polymer', 'composite', '3D printing',
    'additive manufacturing', 'supply chain', 'vertical integration',

    // Agriculture/Food
    'agriculture', 'farming', 'vertical farming', 'regenerative',
    'food', 'nutrition', 'alternative protein', 'cultured meat',
    'precision agriculture', 'crop', 'soil',

    // Health/Medicine
    'therapeutic', 'drug', 'medicine', 'health', 'disease', 'cancer',
    'vaccine', 'antibody', 'clinical', 'FDA', 'biomarker', 'diagnostic',
    'personalized medicine', 'gene therapy', 'immunotherapy',

    // Innovation/Market
    'breakthrough', 'innovation', 'startup', 'market', 'investment',
    'technology', 'research', 'development', 'commercial', 'patent',
    'disruption', 'transformation', 'revolution', 'paradigm shift'
];

// Analyze each document
obsidianDocs.forEach(doc => {
    const text = (doc.text || '').toLowerCase();

    // Track keyword occurrences
    trackingKeywords.forEach(keyword => {
        if (text.includes(keyword.toLowerCase())) {
            keywordFrequencies[keyword] = (keywordFrequencies[keyword] || 0) + 1;
        }
    });

    // Extract title if present
    const titleMatch = text.match(/title:\s*"([^"]+)"/);
    if (titleMatch) {
        const titleWordsArray = titleMatch[1].toLowerCase().split(/\s+/);
        titleWordsArray.forEach(word => {
            if (word.length > 3) { // Skip short words
                titleWords[word] = (titleWords[word] || 0) + 1;
            }
        });
    }

    // Extract source domain if present
    const sourceMatch = text.match(/source:\s*"https?:\/\/([^\/]+)/);
    if (sourceMatch) {
        const domain = sourceMatch[1].replace('www.', '');
        domainFrequencies[domain] = (domainFrequencies[domain] || 0) + 1;
    }
});

// Sort and display results
console.log('\n📊 TOP KEYWORD FREQUENCIES (out of', obsidianDocs.length, 'docs):');
console.log('-'.repeat(60));
const sortedKeywords = Object.entries(keywordFrequencies)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40);

sortedKeywords.forEach(([keyword, count]) => {
    const percentage = ((count / obsidianDocs.length) * 100).toFixed(1);
    const bar = '█'.repeat(Math.floor(count / 3));
    console.log(`${keyword.padEnd(25)} ${count.toString().padStart(3)} (${percentage.padStart(5)}%) ${bar}`);
});

console.log('\n📝 TOP TITLE WORDS:');
console.log('-'.repeat(60));
const sortedTitleWords = Object.entries(titleWords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

sortedTitleWords.forEach(([word, count]) => {
    if (count > 2) {
        console.log(`${word.padEnd(20)} ${count}`);
    }
});

console.log('\n🌐 TOP SOURCE DOMAINS:');
console.log('-'.repeat(60));
const sortedDomains = Object.entries(domainFrequencies)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

sortedDomains.forEach(([domain, count]) => {
    console.log(`${domain.padEnd(30)} ${count} articles`);
});

// Identify key themes
console.log('\n🎯 KEY THEMES IDENTIFIED:');
console.log('-'.repeat(60));

const themes = {
    'Synthetic Biology & Bioengineering': ['synthetic biology', 'bioengineering', 'biomanufacturing', 'protein', 'cells', 'gene'],
    'AI & Computing': ['artificial intelligence', 'AI', 'machine learning', 'neural', 'computing', 'algorithm'],
    'Clean Energy & Climate': ['renewable', 'solar', 'battery', 'hydrogen', 'carbon', 'sustainable'],
    'Advanced Materials': ['materials', 'nanomaterials', 'biomaterials', 'circular economy'],
    'Health & Medicine': ['therapeutic', 'drug', 'medicine', 'health', 'disease', 'vaccine'],
    'Innovation & Markets': ['breakthrough', 'innovation', 'startup', 'market', 'technology']
};

Object.entries(themes).forEach(([theme, keywords]) => {
    const themeCount = keywords.reduce((sum, kw) => sum + (keywordFrequencies[kw] || 0), 0);
    const avgPerDoc = (themeCount / keywords.length / obsidianDocs.length * 100).toFixed(1);
    console.log(`${theme.padEnd(35)} Strength: ${avgPerDoc}%`);
});

console.log('\n💡 RECOMMENDED ALIGNMENT KEYWORDS TO ADD:');
console.log('-'.repeat(60));

// Suggest keywords that appear frequently but might not be in current alignment
const highFreqKeywords = sortedKeywords
    .filter(([kw, count]) => count > obsidianDocs.length * 0.15) // >15% of docs
    .map(([kw]) => kw);

console.log('High-frequency terms to consider adding:');
console.log(highFreqKeywords.join(', '));

db.close();