#!/usr/bin/env node

/**
 * Save document IDs from malformed WordPress broadcasts for future regeneration
 *
 * These are the source documents that produced malformed WordPress broadcasts
 * with invalid JSON. The source content is good (they have successful broadcasts
 * on Telegram/Bluesky), but the WordPress generation had JSON formatting issues.
 *
 * After fixing the generator, we can regenerate WordPress broadcasts from these
 * document IDs.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'agent/data/db.sqlite');
const db = new Database(dbPath);

console.log('📝 Saving document IDs from malformed WordPress broadcasts...\n');

// Get all unique document IDs that have malformed WordPress broadcasts
const malformedDocs = db.prepare(`
    SELECT DISTINCT
        b.documentId,
        m.alignment_score,
        m.type,
        json_extract(m.content, '$.source') as source,
        substr(json_extract(m.content, '$.text'), 1, 100) as preview
    FROM broadcasts b
    INNER JOIN memories m ON b.documentId = m.id
    WHERE b.client IN ('wordpress_insight', 'wordpress_deepdive')
    AND b.status = 'pending'
    AND (
        LENGTH(json_extract(b.content, '$.title')) <= 7
        OR json_extract(b.content, '$.title') LIKE '\`%'
        OR json_extract(b.content, '$.title') LIKE 'Here%'
        OR json_extract(b.content, '$.title') = '{'
    )
    ORDER BY m.alignment_score DESC
`).all();

console.log(`Found ${malformedDocs.length} unique documents with malformed WordPress broadcasts\n`);

// Create output file with metadata
const timestamp = new Date().toISOString().split('T')[0];
const outputFile = path.join(__dirname, `malformed-wordpress-doc-ids-${timestamp}.json`);

const output = {
    generated_at: new Date().toISOString(),
    total_documents: malformedDocs.length,
    description: "Document IDs from malformed WordPress broadcasts. Use these to regenerate WordPress broadcasts after generator fix.",
    alignment_stats: {
        avg: (malformedDocs.reduce((sum, doc) => sum + doc.alignment_score, 0) / malformedDocs.length * 100).toFixed(1),
        min: (Math.min(...malformedDocs.map(d => d.alignment_score)) * 100).toFixed(1),
        max: (Math.max(...malformedDocs.map(d => d.alignment_score)) * 100).toFixed(1)
    },
    documents: malformedDocs.map(doc => ({
        documentId: doc.documentId,
        alignment_score: (doc.alignment_score * 100).toFixed(1),
        source: doc.source,
        preview: doc.preview
    }))
};

// Write to JSON file
fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));

console.log(`✅ Saved ${malformedDocs.length} document IDs to: ${outputFile}`);
console.log(`\nAlignment Statistics:`);
console.log(`   Average: ${output.alignment_stats.avg}%`);
console.log(`   Min: ${output.alignment_stats.min}%`);
console.log(`   Max: ${output.alignment_stats.max}%`);

// Also create a simple text file with just IDs for easy scripting
const txtFile = path.join(__dirname, `malformed-wordpress-doc-ids-${timestamp}.txt`);
fs.writeFileSync(txtFile, malformedDocs.map(d => d.documentId).join('\n'));

console.log(`\n✅ Also saved plain text list to: ${txtFile}`);
console.log(`\nTo regenerate WordPress broadcasts for these documents:`);
console.log(`   1. Delete the malformed broadcasts first`);
console.log(`   2. Use the fixed generator on these document IDs`);
console.log(`   3. Or wait for next broadcast creation run to pick them up`);

db.close();
