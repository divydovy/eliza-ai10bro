const Database = require('better-sqlite3');
const { scoreDocument } = require('./llm-score-document');

const db = new Database('./agent/data/db.sqlite');

async function testScoring() {
    // Test documents we identified as problematic
    const testCases = [
        {
            name: "Roman concrete (should be LOW)",
            query: "SELECT json_extract(content, '$.text') as text FROM memories WHERE json_extract(content, '$.title') LIKE '%Roman concrete%' LIMIT 1"
        },
        {
            name: "Scope 3 emissions (should be LOW)",
            query: "SELECT json_extract(content, '$.text') as text FROM memories WHERE json_extract(content, '$.title') LIKE '%Scope 3%' LIMIT 1"
        },
        {
            name: "Bio-concrete with bacteria (should be HIGH)",
            query: "SELECT json_extract(content, '$.text') as text FROM memories WHERE json_extract(content, '$.text') LIKE '%bacteria%concrete%' AND json_extract(content, '$.text') LIKE '%heal%' LIMIT 1"
        },
        {
            name: "CRISPR synthetic biology (should be HIGH)",
            query: "SELECT json_extract(content, '$.text') as text FROM memories WHERE json_extract(content, '$.title') LIKE '%CRISPR%' AND json_extract(content, '$.source') = 'github' LIMIT 1"
        },
        {
            name: "Precision fermentation (should be HIGH)",
            query: "SELECT json_extract(content, '$.text') as text FROM memories WHERE json_extract(content, '$.text') LIKE '%precision fermentation%' LIMIT 1"
        }
    ];

    console.log('🧪 Testing Updated Scoring Prompt\n');

    for (const testCase of testCases) {
        const result = db.prepare(testCase.query).get();
        if (result && result.text) {
            const score = await scoreDocument(result.text);
            const percentage = Math.round(score * 100);
            console.log(`${testCase.name}`);
            console.log(`  Score: ${percentage}%`);
            console.log(`  Text preview: ${result.text.substring(0, 100)}...`);
            console.log('');
        } else {
            console.log(`${testCase.name}`);
            console.log('  ❌ No matching document found');
            console.log('');
        }
    }

    db.close();
}

testScoring().catch(err => {
    console.error('Error:', err);
    db.close();
    process.exit(1);
});
