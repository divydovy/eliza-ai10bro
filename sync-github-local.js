#!/usr/bin/env node

/**
 * GitHub Repository Sync - Local Clone Approach
 *
 * Reads markdown files directly from local git clone instead of GitHub API.
 *
 * Benefits:
 * - Zero API calls (no rate limits!)
 * - Finds ALL files (not limited by API pagination)
 * - Faster (disk I/O vs HTTP)
 * - More reliable
 *
 * Prerequisites:
 * - Local clone of repository at GITHUB_REPO_PATH
 * - Periodic git pull to stay current
 */

import Database from 'better-sqlite3';
import { readFileSync, existsSync, statSync } from 'fs';
import { createHash } from 'crypto';
import { glob } from 'glob';
import { execSync } from 'child_process';

// Simple string to UUID function (deterministic)
function stringToUuid(str) {
    const hash = createHash('sha256').update(str).digest('hex');
    return `${hash.substr(0, 8)}-${hash.substr(8, 4)}-${hash.substr(12, 4)}-${hash.substr(16, 4)}-${hash.substr(20, 12)}`;
}

// Configuration
const GITHUB_REPO_PATH = '/Users/davidlockie/Documents/Projects/gdelt-obsidian';
const DB_PATH = './agent/data/db.sqlite';

console.log('🔄 Starting GitHub repository sync (local clone approach)...\n');
console.log(`Repository: ${GITHUB_REPO_PATH}`);

// Verify repository exists
if (!existsSync(GITHUB_REPO_PATH)) {
    console.error(`❌ Error: Repository not found at ${GITHUB_REPO_PATH}`);
    console.error('Please ensure the repository is cloned locally.');
    process.exit(1);
}

// Pull latest changes
console.log('\n📥 Pulling latest changes from remote...');
try {
    const pullOutput = execSync('git pull', {
        cwd: GITHUB_REPO_PATH,
        encoding: 'utf-8'
    });
    console.log(pullOutput.trim());
} catch (error) {
    console.error('⚠️  Warning: git pull failed:', error.message);
    console.log('Continuing with local files...\n');
}

// Get current branch
let currentBranch = 'unknown';
try {
    currentBranch = execSync('git branch --show-current', {
        cwd: GITHUB_REPO_PATH,
        encoding: 'utf-8'
    }).trim();
    console.log(`Branch: ${currentBranch}\n`);
} catch (error) {
    console.log('Could not determine branch\n');
}

// Open database
const db = new Database(DB_PATH);

// Find all markdown files
console.log('📡 Scanning for markdown files...');
const pattern = `${GITHUB_REPO_PATH}/**/*.md`;
const files = glob.sync(pattern, {
    ignore: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**'
    ],
    nodir: true
});

console.log(`Found ${files.length} markdown files\n`);

// Prepare statements
const getExistingStmt = db.prepare(`
    SELECT
        id,
        json_extract(content, '$.hash') as hash,
        json_extract(content, '$.deleted') as deleted
    FROM memories
    WHERE id = ? AND type = 'documents'
`);

const insertStmt = db.prepare(`
    INSERT INTO memories (id, type, content, embedding, createdAt, userId, roomId, agentId, "unique")
    VALUES (?, 'documents', ?, ?, ?, NULL, NULL, NULL, 1)
`);

const updateStmt = db.prepare(`
    UPDATE memories
    SET content = ?,
        embedding = ?,
        alignment_score = NULL
    WHERE id = ?
`);

// Process files
let processed = 0;
let skipped = 0;
let updated = 0;
let created = 0;
let errors = 0;

for (const filePath of files) {
    try {
        // Calculate relative path from repo root
        const relativePath = filePath.replace(GITHUB_REPO_PATH + '/', '');
        const docId = stringToUuid(relativePath);

        // Read file content
        const content = readFileSync(filePath, 'utf-8');

        // Skip empty files
        if (content.trim().length === 0) {
            skipped++;
            continue;
        }

        // Calculate hash
        const hash = createHash('sha256').update(content).digest('hex');

        // Check if document exists
        const existing = getExistingStmt.get(docId);

        // Skip if already exists with same hash and not deleted
        if (existing && existing.hash === hash && !existing.deleted) {
            skipped++;

            // Progress indicator
            if ((processed + skipped) % 100 === 0) {
                console.log(`Skipped ${skipped} unchanged files...`);
            }
            continue;
        }

        // Prepare document content
        const documentContent = JSON.stringify({
            text: content,
            hash: hash,
            source: 'github',
            metadata: {
                path: relativePath,
                size: content.length,
                branch: currentBranch,
                synced_at: new Date().toISOString()
            }
        });

        const embedding = Buffer.alloc(0); // Empty blob
        const now = Date.now();

        if (existing) {
            // Update existing document
            updateStmt.run(documentContent, embedding, docId);
            updated++;
        } else {
            // Insert new document
            insertStmt.run(docId, documentContent, embedding, now);
            created++;
        }

        processed++;

        // Progress indicator
        if (processed % 100 === 0) {
            console.log(`Processed ${processed} files...`);
        }

    } catch (error) {
        errors++;
        console.error(`Error processing ${filePath.replace(GITHUB_REPO_PATH + '/', '')}:`, error.message);
    }
}

// Final summary
console.log('\n✅ GitHub sync complete!');
console.log(`   Created: ${created} new documents`);
console.log(`   Updated: ${updated} changed documents`);
console.log(`   Skipped: ${skipped} unchanged documents`);
console.log(`   Errors: ${errors} files`);
console.log(`   Total: ${files.length} files scanned`);

// Close database
db.close();

// Stats
console.log('\n📊 Database stats:');
const statsDb = new Database(DB_PATH);
const stats = statsDb.prepare(`
    SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN json_extract(content, '$.source') = 'github' THEN 1 END) as github_docs,
        COUNT(CASE WHEN json_extract(content, '$.deleted') = 1 THEN 1 END) as tombstones
    FROM memories
    WHERE type = 'documents'
`).get();

console.log(`   Total documents: ${stats.total}`);
console.log(`   GitHub documents: ${stats.github_docs}`);
console.log(`   Tombstones: ${stats.tombstones}`);
statsDb.close();

process.exit(0);
