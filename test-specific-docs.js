const Database = require('better-sqlite3');
const { scoreDocument } = require('./llm-score-document');

const db = new Database('./agent/data/db.sqlite');

async function testSpecificDocs() {
    const docIds = [
        { id: '07e97f94-3b43-fb86-6d0e-96fed4273d81', expected: 'LOW', name: 'Roman concrete index' },
        { id: 'fad9addc-fae2-0a94-baac-63079310fc62', expected: 'LOW', name: 'Supply chain emissions' }
    ];

    console.log('🧪 Testing Specific Problem Documents\n');

    for (const doc of docIds) {
        const result = db.prepare("SELECT json_extract(content, '$.text') as text FROM memories WHERE id = ?").get(doc.id);

        if (result && result.text) {
            const score = await scoreDocument(result.text);
            const percentage = Math.round(score * 100);
            const status = percentage <= 20 ? '✅' : '❌';

            console.log(status + ' ' + doc.name + ' (expect ' + doc.expected + ')');
            console.log('   Score: ' + percentage + '%');
            console.log('   Preview: ' + result.text.substring(0, 150) + '...');
            console.log('');
        }
    }

    // Also test some known good ones
    console.log('Testing known GOOD documents:\n');

    const goodDocs = db.prepare(`
        SELECT id, json_extract(content, '$.title') as title, json_extract(content, '$.text') as text
        FROM memories
        WHERE type = 'documents'
        AND (
            json_extract(content, '$.text') LIKE '%CRISPR%'
            OR json_extract(content, '$.text') LIKE '%fermentation%protein%'
            OR json_extract(content, '$.text') LIKE '%mycelium%leather%'
        )
        AND json_extract(content, '$.source') = 'github'
        LIMIT 3
    `).all();

    for (const doc of goodDocs) {
        if (doc.text) {
            const score = await scoreDocument(doc.text);
            const percentage = Math.round(score * 100);
            const status = percentage >= 60 ? '✅' : '❌';

            console.log(status + ' ' + (doc.title || 'Biotech doc') + ' (expect HIGH)');
            console.log('   Score: ' + percentage + '%');
            console.log('');
        }
    }

    db.close();
}

testSpecificDocs().catch(err => {
    console.error('Error:', err);
    db.close();
    process.exit(1);
});
