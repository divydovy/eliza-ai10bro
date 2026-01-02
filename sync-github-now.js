#!/usr/bin/env node

/**
 * GitHub Sync Script
 *
 * Manually triggers a full sync of the GitHub repository
 * Imports all .md files from the configured GitHub repo/path into the database
 */

import { Octokit } from '@octokit/rest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { createHash, randomUUID } from 'crypto';

// Simple string to UUID function (deterministic)
function stringToUuid(str) {
    const hash = createHash('sha256').update(str).digest('hex');
    return `${hash.substr(0, 8)}-${hash.substr(8, 4)}-${hash.substr(12, 4)}-${hash.substr(16, 4)}-${hash.substr(20, 12)}`;
}

console.log('🔄 Starting GitHub repository sync...\n');

// Load character configuration
const characterPath = './characters/ai10bro.character.json';
const character = JSON.parse(readFileSync(characterPath, 'utf-8'));

// Extract GitHub settings
const token = character.settings.secrets.GITHUB_TOKEN;
const repoUrl = character.settings.GITHUB_REPO_URL;
const targetPath = character.settings.GITHUB_TARGET_PATH || '';

if (!token || !repoUrl) {
    console.error('❌ GitHub not configured in character file');
    process.exit(1);
}

// Parse repo URL
const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
if (!match) {
    console.error('❌ Invalid GitHub repository URL');
    process.exit(1);
}

const owner = match[1];
const repo = match[2].replace('.git', '');

console.log(`Repository: ${owner}/${repo}`);
console.log(`Target path: ${targetPath || '(root)'}`);
console.log('');

// Initialize GitHub client
const octokit = new Octokit({
    auth: token,
    baseUrl: 'https://api.github.com',
    headers: {
        'X-GitHub-Api-Version': '2022-11-28'
    }
});

// Open database
const db = new Database('./agent/data/db.sqlite');

// Recursive function to get all markdown files
async function getMarkdownFilesRecursively(path) {
    const response = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: path || '',
        ref: 'master' // Repository uses master branch
    });

    if (!Array.isArray(response.data)) {
        // Single file
        if (response.data.type === 'file' && response.data.name.endsWith('.md')) {
            return [response.data];
        }
        return [];
    }

    // Directory - get markdown files and recurse into subdirectories
    let allMarkdownFiles = [];

    const markdownFiles = response.data.filter(file =>
        file.type === 'file' && file.name.endsWith('.md')
    );
    allMarkdownFiles = [...allMarkdownFiles, ...markdownFiles];

    const directories = response.data.filter(item => item.type === 'dir');

    for (const dir of directories) {
        const filesInSubdir = await getMarkdownFilesRecursively(dir.path);
        allMarkdownFiles = [...allMarkdownFiles, ...filesInSubdir];
    }

    return allMarkdownFiles;
}

let processed = 0;
let skipped = 0;
let errors = 0;

try {
    console.log(`📡 Scanning repository for markdown files...`);

    // Get all markdown files
    const markdownFiles = await getMarkdownFilesRecursively(targetPath);
    console.log(`Found ${markdownFiles.length} markdown files\n`);

    // Process each file
    for (const file of markdownFiles) {
        const docId = stringToUuid(file.path);

        try {
            // Get file content
            const contentResponse = await octokit.repos.getContent({
                owner,
                repo,
                path: file.path,
                ref: 'master'
            });

            if ('content' in contentResponse.data) {
                const content = Buffer.from(contentResponse.data.content, 'base64').toString();
                const hash = createHash('sha256').update(content).digest('hex');

                // Check if document already exists with same hash
                const existing = db.prepare(`
                    SELECT id, json_extract(content, '$.hash') as existing_hash
                    FROM memories
                    WHERE id = ?
                `).get(docId);

                if (existing && existing.existing_hash === hash) {
                    skipped++;
                    if (skipped % 100 === 0) {
                        console.log(`Skipped ${skipped} unchanged files...`);
                    }
                    continue;
                }

                // Create or update document
                const documentContent = JSON.stringify({
                    text: content,
                    hash: hash,
                    source: 'github',
                    metadata: {
                        path: file.path
                    }
                });

                // Create a minimal embedding (GitHub provider uses knowledge.set which expects an embedding)
                // For now, use empty blob - alignment scoring and RAG will handle this properly
                const embedding = Buffer.alloc(0);

                if (existing) {
                    // Update existing
                    db.prepare(`
                        UPDATE memories
                        SET content = ?,
                            embedding = ?,
                            alignment_score = NULL
                        WHERE id = ?
                    `).run(documentContent, embedding, docId);
                } else {
                    // Insert new
                    db.prepare(`
                        INSERT INTO memories (id, type, content, embedding, createdAt, userId, roomId, agentId, "unique")
                        VALUES (?, 'documents', ?, ?, ?, NULL, NULL, NULL, 1)
                    `).run(docId, documentContent, embedding, Date.now());
                }

                processed++;
                if (processed % 100 === 0) {
                    console.log(`Processed ${processed} files...`);
                }
            }
        } catch (error) {
            console.error(`Error processing ${file.path}: ${error.message}`);
            errors++;
        }
    }

    console.log(`\n✅ GitHub sync complete!`);
    console.log(`   Processed: ${processed} new or changed files`);
    console.log(`   Skipped: ${skipped} unchanged files`);
    console.log(`   Errors: ${errors} files`);
    console.log(`   Total: ${markdownFiles.length} files scanned`);

} catch (error) {
    console.error('❌ GitHub sync failed:', error.message);
    if (error.stack) {
        console.error(error.stack);
    }
    process.exit(1);
} finally {
    db.close();
}
