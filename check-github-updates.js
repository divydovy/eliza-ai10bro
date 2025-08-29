#!/usr/bin/env node

/**
 * Quick check for new GitHub content without processing everything
 */

const Database = require('better-sqlite3');
const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function stringToUuid(str) {
    const hash = crypto.createHash('sha256').update(str).digest('hex');
    return [
        hash.substring(0, 8),
        hash.substring(8, 4),
        '4' + hash.substring(13, 3),
        ((parseInt(hash.substring(16, 2), 16) & 0x3f) | 0x80).toString(16) + hash.substring(18, 2),
        hash.substring(20, 12)
    ].join('-');
}

async function main() {
    try {
        // Load character config
        const characterPath = path.join(__dirname, 'characters/ai10bro.character.json');
        const character = JSON.parse(fs.readFileSync(characterPath, 'utf8'));
        
        const githubToken = character.settings?.secrets?.GITHUB_TOKEN;
        const repoUrl = character.settings?.GITHUB_REPO_URL || 'https://github.com/divydovy/ai10bro-gdelt';
        const targetPath = character.settings?.GITHUB_TARGET_PATH || 'Notes';
        
        // Parse repository URL
        const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        const owner = match[1];
        const repo = match[2].replace('.git', '');
        
        console.log(`📦 Checking ${owner}/${repo}/${targetPath} for updates...`);
        
        // Initialize GitHub client
        const octokit = new Octokit({
            auth: githubToken,
            baseUrl: 'https://api.github.com'
        });
        
        // Initialize database
        const dbPath = path.join(__dirname, 'agent/data/db.sqlite');
        const db = new Database(dbPath);
        
        // Get list of existing document paths
        const existingDocs = db.prepare(`
            SELECT DISTINCT json_extract(content, '$.metadata.path') as path
            FROM memories 
            WHERE type = 'documents' 
            AND json_extract(content, '$.source') = 'github'
        `).all();
        
        const existingPaths = new Set(existingDocs.map(d => d.path).filter(p => p));
        
        console.log(`📊 Current status: ${existingPaths.size} documents in database`);
        
        // Get the latest commit info
        const commits = await octokit.repos.listCommits({
            owner,
            repo,
            path: targetPath,
            per_page: 5
        });
        
        if (commits.data.length > 0) {
            const latestCommit = commits.data[0];
            console.log(`\n📅 Latest commit: ${latestCommit.commit.message}`);
            console.log(`   Author: ${latestCommit.commit.author.name}`);
            console.log(`   Date: ${new Date(latestCommit.commit.author.date).toLocaleString()}`);
        }
        
        // Quick check: Get file tree to count total files
        const tree = await octokit.git.getTree({
            owner,
            repo,
            tree_sha: 'main',
            recursive: '1'
        });
        
        const markdownFiles = tree.data.tree.filter(item => 
            item.type === 'blob' && 
            item.path.startsWith(targetPath) && 
            item.path.endsWith('.md')
        );
        
        console.log(`\n📁 Repository contains ${markdownFiles.length} markdown files`);
        
        // Check for new files
        const newFiles = markdownFiles.filter(file => !existingPaths.has(file.path));
        
        if (newFiles.length === 0) {
            console.log(`✅ All documents are up to date!`);
        } else {
            console.log(`🆕 Found ${newFiles.length} new files to sync`);
            console.log(`\nExamples of new files:`);
            newFiles.slice(0, 5).forEach(f => {
                console.log(`   • ${f.path}`);
            });
            if (newFiles.length > 5) {
                console.log(`   ... and ${newFiles.length - 5} more`);
            }
        }
        
        db.close();
        
        // Return status for the API
        return {
            total: markdownFiles.length,
            existing: existingPaths.size,
            new: newFiles.length
        };
        
    } catch (error) {
        console.error('❌ Check failed:', error.message);
        process.exit(1);
    }
}

main().catch(console.error);