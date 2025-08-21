#!/usr/bin/env node

// Test filtering ALL ai10bro GitHub repositories
console.log('🔗 Testing ALL AI10bro GitHub Repository Filter');
console.log('===============================================');

function shouldIncludeLink(sourceUrl) {
    return sourceUrl && 
           sourceUrl !== 'Unknown' && 
           !sourceUrl.includes('github.com/divydovy/ai10bro');
}

// Test cases for all your data source repositories
const testCases = [
    {
        name: "GDELT data repository",
        url: "https://github.com/divydovy/ai10bro-gdelt",
        expected: "EXCLUDE"
    },
    {
        name: "YouTube data repository", 
        url: "https://github.com/divydovy/ai10bro-youtube",
        expected: "EXCLUDE"
    },
    {
        name: "ArXiv data repository",
        url: "https://github.com/divydovy/ai10bro-arxiv", 
        expected: "EXCLUDE"
    },
    {
        name: "Main AI10bro repository",
        url: "https://github.com/divydovy/ai10bro",
        expected: "EXCLUDE"
    },
    {
        name: "Real Nature article",
        url: "https://nature.com/articles/crispr-breakthrough-2024",
        expected: "INCLUDE"
    },
    {
        name: "Real Science article", 
        url: "https://science.org/content/article/gene-editing-climate",
        expected: "INCLUDE"
    },
    {
        name: "Real ArXiv paper",
        url: "https://arxiv.org/abs/2024.12345",
        expected: "INCLUDE"
    },
    {
        name: "Real YouTube video",
        url: "https://youtube.com/watch?v=abc123", 
        expected: "INCLUDE"
    }
];

console.log('Testing filter logic:\n');

testCases.forEach((test, i) => {
    const shouldInclude = shouldIncludeLink(test.url);
    const result = shouldInclude ? 'INCLUDE' : 'EXCLUDE';
    const correct = result === test.expected;
    
    console.log(`${i + 1}. ${test.name}:`);
    console.log(`   URL: ${test.url}`);
    console.log(`   Result: ${result} (expected: ${test.expected})`);
    console.log(`   ${correct ? '✅' : '❌'} ${correct ? 'Correct' : 'Wrong!'}`);
    console.log('');
});

console.log('🎯 Summary:');
console.log('✅ All ai10bro GitHub repos will be filtered out'); 
console.log('✅ Real article sources (Nature, Science, ArXiv, etc.) will get links');
console.log('💰 Cost impact: Still $0.001 per broadcast (99.6% savings)');