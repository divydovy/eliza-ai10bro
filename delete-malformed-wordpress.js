#!/usr/bin/env node

/**
 * Delete malformed WordPress broadcasts
 *
 * These broadcasts have invalid JSON that cannot be rescued.
 * Document IDs have been saved to malformed-wordpress-doc-ids-*.json
 * for regeneration after the generator fix is deployed.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'agent/data/db.sqlite');
const db = new Database(dbPath);

console.log('🗑️  Deleting malformed WordPress broadcasts...\n');

// Count malformed broadcasts before deletion
const count = db.prepare(`
    SELECT COUNT(*) as total
    FROM broadcasts
    WHERE client IN ('wordpress_insight', 'wordpress_deepdive')
    AND status = 'pending'
    AND (
        LENGTH(json_extract(content, '$.title')) <= 7
        OR json_extract(content, '$.title') LIKE '\`%'
        OR json_extract(content, '$.title') LIKE 'Here%'
        OR json_extract(content, '$.title') = '{'
    )
`).get();

console.log(`Found ${count.total} malformed broadcasts to delete\n`);

if (count.total === 0) {
    console.log('✨ No malformed broadcasts found. Nothing to delete!');
    db.close();
    process.exit(0);
}

// Ask for confirmation
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question(`⚠️  Are you sure you want to delete ${count.total} malformed broadcasts? (yes/no): `, (answer) => {
    if (answer.toLowerCase() !== 'yes') {
        console.log('\n❌ Deletion cancelled.');
        rl.close();
        db.close();
        process.exit(0);
    }

    // Delete malformed broadcasts
    const result = db.prepare(`
        DELETE FROM broadcasts
        WHERE client IN ('wordpress_insight', 'wordpress_deepdive')
        AND status = 'pending'
        AND (
            LENGTH(json_extract(content, '$.title')) <= 7
            OR json_extract(content, '$.title') LIKE '\`%'
            OR json_extract(content, '$.title') LIKE 'Here%'
            OR json_extract(content, '$.title') = '{'
        )
    `).run();

    console.log(`\n✅ Deleted ${result.changes} malformed broadcasts`);
    console.log(`\n📋 Document IDs saved in: malformed-wordpress-doc-ids-*.json`);
    console.log(`   Use these to regenerate after the generator fix is deployed`);

    rl.close();
    db.close();
});
