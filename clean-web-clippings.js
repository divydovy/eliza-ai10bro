import Database from 'better-sqlite3';

const db = new Database('./agent/data/db.sqlite');

function extractArticleContent(text) {
    const lines = text.split('\n');
    const articleLines = [];
    let inArticle = false;

    for (const line of lines) {
        const trimmed = line.trim();

        // Skip frontmatter and obvious navigation
        if (trimmed === '---' || trimmed.startsWith('title:') || trimmed.startsWith('source:') ||
            trimmed.startsWith('author:') || trimmed.startsWith('published:') || trimmed.startsWith('created:') ||
            trimmed.startsWith('description:') || trimmed.startsWith('tags:') || trimmed.startsWith('-') ||
            /\[.*?\]\(.*?\)/.test(trimmed) && trimmed.length < 100 ||
            /Get it on|App Store|Subscribe|Newsletter|Premium|Advertisement|Top Tickers|QUICK LINKS|Price: \$/i.test(trimmed)) {
            continue;
        }

        // Look for substantial article content
        if (trimmed.length > 100 && /announced|research|study|technology|platform|company|university|scientists|discovered/i.test(trimmed)) {
            inArticle = true;
        }

        if (inArticle && trimmed.length > 0) {
            articleLines.push(trimmed);
        }

        // Stop at obvious ad/footer markers
        if (inArticle && /Try.*Premium|Subscribe now|Advertisement|Related Articles/i.test(trimmed)) {
            break;
        }
    }

    return articleLines.join('\n\n').trim();
}

console.log('🧹 Cleaning all polluted web clippings...\n');

const docs = db.prepare(`
    SELECT id, content, alignment_score
    FROM memories
    WHERE type = 'documents'
    AND alignment_score < 0.10
    AND length(json_extract(content, '$.text')) > 500
    ORDER BY alignment_score ASC
    LIMIT 50
`).all();

console.log(`Examining ${docs.length} low-scoring documents\n`);

let cleaned = 0;

for (const doc of docs) {
    const content = JSON.parse(doc.content);
    const originalText = content.text;
    const cleanedText = extractArticleContent(originalText);

    const originalLength = originalText.length;
    const cleanedLength = cleanedText.length;

    if (cleanedLength > 200 && cleanedLength < originalLength * 0.7) {
        const reduction = ((originalLength - cleanedLength) / originalLength * 100).toFixed(0);
        content.text = cleanedText;
        content.text_cleaned = true;
        content.original_length = originalLength;

        db.prepare(`UPDATE memories SET content = ? WHERE id = ?`)
            .run(JSON.stringify(content), doc.id);

        cleaned++;
        const preview = cleanedText.substring(0, 80).replace(/\n/g, ' ');
        const docId = doc.id.substring(0, 8);
        console.log(`✓ ${docId}: ${originalLength}→${cleanedLength} chars (-${reduction}%)`);
        console.log(`  "${preview}..."\n`);
    }
}

console.log(`✅ Cleaned ${cleaned} documents`);
db.close();
