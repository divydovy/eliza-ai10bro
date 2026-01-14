const Database = require('better-sqlite3');
const db = new Database('./agent/data/db.sqlite');
const alignmentConfig = require('./alignment-keywords-refined.json');
const processedDocumentIds = new Set();

const unprocessedDocs = db.prepare(`
    SELECT m.* FROM memories m
    WHERE m.type = 'documents'
    AND NOT EXISTS (
        SELECT 1 FROM broadcasts b WHERE b.documentId = m.id
    )
    AND json_extract(m.content, '$.text') IS NOT NULL
    AND length(json_extract(m.content, '$.text')) > 200
    AND m.alignment_score >= ?
    ORDER BY
        CASE
            WHEN json_extract(m.content, '$.source') = 'obsidian' THEN 0
            ELSE 1
        END,
        m.alignment_score DESC,
        m.createdAt DESC
    LIMIT 20
`).all(alignmentConfig.scoring_recommendations?.core_alignment_minimum || 0.08)
.filter(doc => !processedDocumentIds.has(doc.id));

console.log('Query returned:', unprocessedDocs.length, 'documents');
console.log('Alignment threshold:', alignmentConfig.scoring_recommendations?.core_alignment_minimum || 0.08);
if (unprocessedDocs.length > 0) {
    console.log('First doc ID:', unprocessedDocs[0].id);
    console.log('First doc alignment:', unprocessedDocs[0].alignment_score);
} else {
    // Check if any documents exist at all
    const totalDocs = db.prepare(`
        SELECT COUNT(*) as count FROM memories m
        WHERE m.type = 'documents'
        AND json_extract(m.content, '$.text') IS NOT NULL
        AND length(json_extract(m.content, '$.text')) > 200
        AND m.alignment_score >= ?
    `).get(alignmentConfig.scoring_recommendations?.core_alignment_minimum || 0.08);
    console.log('Total docs with alignment >= threshold:', totalDocs.count);

    // Check how many have broadcasts
    const docsWithBroadcasts = db.prepare(`
        SELECT COUNT(DISTINCT m.id) as count FROM memories m
        WHERE m.type = 'documents'
        AND EXISTS (SELECT 1 FROM broadcasts b WHERE b.documentId = m.id)
        AND json_extract(m.content, '$.text') IS NOT NULL
        AND length(json_extract(m.content, '$.text')) > 200
        AND m.alignment_score >= ?
    `).get(alignmentConfig.scoring_recommendations?.core_alignment_minimum || 0.08);
    console.log('Docs with broadcasts:', docsWithBroadcasts.count);
}
db.close();
