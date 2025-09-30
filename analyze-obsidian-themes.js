#!/usr/bin/env node

const Database = require('better-sqlite3');
const db = new Database('./agent/data/db.sqlite');

console.log('🔍 Analyzing Obsidian document content to reverse-engineer alignment...\n');

// Get ALL Obsidian documents
const obsidianDocs = db.prepare(`
    SELECT 
        json_extract(m.content, '$.text') as text,
        json_extract(m.content, '$.url') as url
    FROM memories m
    WHERE json_extract(m.content, '$.source') = 'obsidian'
`).all();

console.log(`Analyzing ${obsidianDocs.length} Obsidian documents...\n`);

// Track all keywords and their frequency
const keywordFrequency = {};
const bigramFrequency = {};
const trigramFrequency = {};
const domainFrequency = {};

// Common stop words to ignore
const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who',
    'where', 'when', 'why', 'how', 'all', 'each', 'every', 'both', 'few',
    'more', 'most', 'other', 'some', 'such', 'only', 'own', 'same', 'so',
    'than', 'too', 'very', 'just', 'out', 'up', 'down', 'about', 'into',
    'through', 'during', 'after', 'before', 'over', 'under', 'between'
]);

obsidianDocs.forEach(doc => {
    const text = (doc.text || '').toLowerCase();
    const url = doc.url || '';
    
    // Extract domain from URL
    if (url) {
        const match = url.match(/https?:\/\/([^/]+)/);
        if (match) {
            const domain = match[1].replace('www.', '');
            domainFrequency[domain] = (domainFrequency[domain] || 0) + 1;
        }
    }
    
    // Extract words (alphanumeric sequences)
    const words = text.match(/[a-z0-9]+/g) || [];
    
    // Single words (unigrams)
    words.forEach(word => {
        if (word.length > 3 && !stopWords.has(word)) {
            keywordFrequency[word] = (keywordFrequency[word] || 0) + 1;
        }
    });
    
    // Bigrams
    for (let i = 0; i < words.length - 1; i++) {
        if (!stopWords.has(words[i]) && !stopWords.has(words[i + 1])) {
            const bigram = `${words[i]} ${words[i + 1]}`;
            bigramFrequency[bigram] = (bigramFrequency[bigram] || 0) + 1;
        }
    }
    
    // Trigrams
    for (let i = 0; i < words.length - 2; i++) {
        if (!stopWords.has(words[i]) && !stopWords.has(words[i + 2])) {
            const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
            trigramFrequency[trigram] = (trigramFrequency[trigram] || 0) + 1;
        }
    }
});

// Sort by frequency
const topKeywords = Object.entries(keywordFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50);

const topBigrams = Object.entries(bigramFrequency)
    .sort((a, b) => b[1] - a[1])
    .filter(([_, count]) => count > 3)
    .slice(0, 30);

const topTrigrams = Object.entries(trigramFrequency)
    .sort((a, b) => b[1] - a[1])
    .filter(([_, count]) => count > 2)
    .slice(0, 20);

const topDomains = Object.entries(domainFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

console.log('📊 TOP SINGLE KEYWORDS (50 most frequent):');
console.log('─'.repeat(60));
topKeywords.forEach(([word, count]) => {
    const percent = (count / obsidianDocs.length * 100).toFixed(1);
    console.log(`  ${word.padEnd(20)} ${count.toString().padStart(4)} docs (${percent}%)`);
});

console.log('\n📊 TOP BIGRAMS (2-word phrases):');
console.log('─'.repeat(60));
topBigrams.forEach(([phrase, count]) => {
    const percent = (count / obsidianDocs.length * 100).toFixed(1);
    console.log(`  ${phrase.padEnd(30)} ${count.toString().padStart(4)} docs (${percent}%)`);
});

console.log('\n📊 TOP TRIGRAMS (3-word phrases):');
console.log('─'.repeat(60));
topTrigrams.forEach(([phrase, count]) => {
    const percent = (count / obsidianDocs.length * 100).toFixed(1);
    console.log(`  ${phrase.padEnd(40)} ${count.toString().padStart(3)} docs (${percent}%)`);
});

console.log('\n📊 TOP SOURCE DOMAINS:');
console.log('─'.repeat(60));
topDomains.forEach(([domain, count]) => {
    console.log(`  ${domain.padEnd(30)} ${count.toString().padStart(4)} docs`);
});

// Categorize keywords into themes
console.log('\n🎯 THEME ANALYSIS:');
console.log('─'.repeat(60));

const themes = {
    'AI & Computing': ['learning', 'neural', 'intelligence', 'artificial', 'model', 'algorithm', 'data', 'deep', 'network', 'computing', 'transformer', 'llm', 'machine', 'computer'],
    'Biology & Biotech': ['cells', 'protein', 'gene', 'dna', 'rna', 'biology', 'biological', 'genome', 'bacteria', 'enzyme', 'metabolic', 'cellular', 'tissue', 'molecular'],
    'Health & Medicine': ['cancer', 'disease', 'treatment', 'therapy', 'drug', 'clinical', 'patient', 'medical', 'health', 'vaccine', 'antibody', 'pharmaceutical'],
    'Materials & Nanotech': ['materials', 'material', 'nano', 'quantum', 'polymer', 'molecular', 'chemical', 'structure'],
    'Energy & Climate': ['energy', 'solar', 'battery', 'carbon', 'climate', 'renewable', 'sustainable', 'hydrogen'],
    'Innovation & Business': ['technology', 'innovation', 'market', 'research', 'development', 'startup', 'investment', 'commercial']
};

Object.entries(themes).forEach(([theme, keywords]) => {
    let themeCount = 0;
    keywords.forEach(keyword => {
        if (keywordFrequency[keyword]) {
            themeCount += keywordFrequency[keyword];
        }
    });
    const avgPerDoc = (themeCount / obsidianDocs.length).toFixed(2);
    console.log(`  ${theme.padEnd(25)} ${themeCount.toString().padStart(5)} mentions (${avgPerDoc} per doc)`);
});

console.log('\n💡 RECOMMENDATIONS:');
console.log('─'.repeat(60));
console.log('1. High-frequency keywords (>20% of docs) should be core alignment terms');
console.log('2. Source domains indicate trusted/premium content sources');
console.log('3. Theme weights should reflect actual distribution in curated content');
console.log('4. Consider bigrams/trigrams for more specific matching');

db.close();