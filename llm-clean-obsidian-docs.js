import Database from 'better-sqlite3';
import fetch from 'node-fetch';

const db = new Database('./agent/data/db.sqlite');

async function extractArticleWithLLM(rawContent) {
    const prompt = `Extract ONLY the main article content from this web page text. Remove all navigation, ads, stock tickers, related articles, subscription prompts, and boilerplate. Return ONLY the core article text about the technology/research topic.

Raw content:
${rawContent.substring(0, 3000)}

Article content only:`;

    const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'qwen2.5:32b',
            prompt: prompt,
            stream: false,
            options: {
                temperature: 0.1,
                num_predict: 2000
            }
        })
    });

    const result = await response.json();
    return result.response.trim();
}

console.log('🧠 Cleaning low-scoring Obsidian documents...\n');

// Get Obsidian docs that are low-scoring, have content, and haven't been cleaned
const docs = db.prepare(`
    SELECT id, content, alignment_score
    FROM memories
    WHERE type = 'documents'
    AND alignment_score < 0.10
    AND alignment_score > 0
    AND length(json_extract(content, '$.text')) > 800
    AND json_extract(content, '$.text_cleaned_llm') IS NULL
    AND json_extract(content, '$.metadata.sourceType') = 'obsidian'
    ORDER BY alignment_score DESC
    LIMIT 25
`).all();

console.log(`Processing ${docs.length} Obsidian documents\n`);

let processed = 0;

for (const doc of docs) {
    console.log(`Processing ${doc.id.substring(0, 8)}... (score: ${(doc.alignment_score * 100).toFixed(1)}%)`);

    const content = JSON.parse(doc.content);
    const originalText = content.text;

    try {
        const cleanedText = await extractArticleWithLLM(originalText);

        if (cleanedText.length > 300 && cleanedText.length < originalText.length * 0.8) {
            const reduction = ((originalText.length - cleanedText.length) / originalText.length * 100).toFixed(0);

            content.text = cleanedText;
            content.text_cleaned_llm = true;
            content.original_length = originalText.length;

            db.prepare(`UPDATE memories SET content = ? WHERE id = ?`)
                .run(JSON.stringify(content), doc.id);

            processed++;
            console.log(`✓ Cleaned: ${originalText.length}→${cleanedText.length} chars (-${reduction}%)`);
            console.log(`  Preview: "${cleanedText.substring(0, 100).replace(/\n/g, ' ')}..."\n`);
        } else {
            console.log(`⏭️  Skipped (extracted content too short or not significantly reduced)\n`);
        }
    } catch (error) {
        console.log(`❌ Error: ${error.message}\n`);
    }
}

console.log(`✅ Processed ${processed}/${docs.length} documents`);
console.log('⚠️  Run calculate-alignment-scores.js to recalculate scores\n');

db.close();
