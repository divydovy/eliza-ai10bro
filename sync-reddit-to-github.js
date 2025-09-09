#!/usr/bin/env node

/**
 * Reddit to GitHub sync - stores Reddit posts as markdown files in GitHub
 * This follows the same pattern as other data sources (GitHub-first storage)
 */

const { Octokit } = require('@octokit/rest');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load character config for GitHub token
const characterPath = path.join(__dirname, 'characters/ai10bro.character.json');
const character = JSON.parse(fs.readFileSync(characterPath, 'utf8'));
const GITHUB_TOKEN = character.settings?.secrets?.GITHUB_TOKEN || character.settings?.GITHUB_TOKEN;
const REPO_URL = character.settings?.GITHUB_REPO_URL || 'https://github.com/divydovy/ai10bro-gdelt';

// Parse repository URL
const match = REPO_URL.match(/github\.com\/([^\/]+)\/([^\/]+)/);
const OWNER = match[1];
const REPO = match[2].replace('.git', '');

// Subreddits aligned with AI10BRO's mission
const SUBREDDITS = [
    'syntheticbiology',
    'biotech', 
    'biomimicry',
    'sustainability',
    'RenewableEnergy',
    'ClimateActionPlan',
    'cleantech',
    'CircularEconomy',
    'Permaculture',
    'solarpunk',
    'longevity',
    'VerticalFarming',
    'labgrown'
];

// Initialize GitHub client
const octokit = new Octokit({
    auth: GITHUB_TOKEN,
    baseUrl: 'https://api.github.com'
});

// Fetch JSON from Reddit
function fetchRedditJSON(subreddit, sortBy = 'hot', limit = 25) {
    return new Promise((resolve, reject) => {
        const url = `https://www.reddit.com/r/${subreddit}/${sortBy}.json?limit=${limit}`;
        const options = {
            headers: {
                'User-Agent': 'AI10BRO Knowledge Bot/1.0 (by /u/ai10bro)'
            }
        };

        https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json);
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

// Check if file exists on GitHub
async function fileExistsOnGitHub(path) {
    try {
        await octokit.repos.getContent({
            owner: OWNER,
            repo: REPO,
            path: path
        });
        return true;
    } catch (error) {
        if (error.status === 404) {
            return false;
        }
        throw error;
    }
}

// Upload file to GitHub
async function uploadToGitHub(filePath, content, message) {
    try {
        // Check if file exists
        let sha;
        try {
            const existing = await octokit.repos.getContent({
                owner: OWNER,
                repo: REPO,
                path: filePath
            });
            sha = existing.data.sha;
        } catch (e) {
            // File doesn't exist, which is fine
        }

        // Create or update file
        await octokit.repos.createOrUpdateFileContents({
            owner: OWNER,
            repo: REPO,
            path: filePath,
            message: message,
            content: Buffer.from(content).toString('base64'),
            sha: sha
        });

        return true;
    } catch (error) {
        console.error(`Error uploading ${filePath}:`, error.message);
        return false;
    }
}

// Process Reddit posts and upload to GitHub
async function processRedditPosts(subreddit, posts) {
    let uploaded = 0;
    let skipped = 0;
    
    for (const item of posts.data.children) {
        const post = item.data;
        
        // Skip if low quality
        if (post.score < 10 || post.num_comments < 2) {
            skipped++;
            continue;
        }
        
        // Create filename
        const date = new Date(post.created_utc * 1000);
        const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
        const titleSlug = post.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .substring(0, 50);
        const filename = `${dateStr}_reddit_${subreddit}_${titleSlug}.md`;
        const filePath = `Reddit/${subreddit}/${filename}`;
        
        // Check if already exists
        const exists = await fileExistsOnGitHub(filePath);
        if (exists) {
            skipped++;
            continue;
        }
        
        // Prepare content
        const content = `# ${post.title}

**Source:** Reddit r/${subreddit}
**Author:** u/${post.author}
**Score:** ${post.score} | **Comments:** ${post.num_comments}
**Posted:** ${new Date(post.created_utc * 1000).toISOString()}
**URL:** https://reddit.com${post.permalink}

## Content

${post.selftext || 'No text content - link post'}

${post.url && post.url !== `https://reddit.com${post.permalink}` ? `\n**External Link:** ${post.url}\n` : ''}

## Metadata

- **Post ID:** ${post.id}
- **Subreddit:** ${subreddit}
- **Flair:** ${post.link_flair_text || 'None'}
- **Awards:** ${post.total_awards_received || 0}
- **Upvote Ratio:** ${post.upvote_ratio || 0}

---
*Imported by AI10BRO Reddit Sync*`;

        // Upload to GitHub
        const success = await uploadToGitHub(
            filePath,
            content,
            `Add Reddit post: ${post.title.substring(0, 50)}`
        );
        
        if (success) {
            uploaded++;
            console.log(`  ✅ Uploaded: ${filename}`);
        } else {
            console.log(`  ❌ Failed: ${filename}`);
        }
        
        // Rate limiting for GitHub API
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return { uploaded, skipped };
}

async function main() {
    try {
        console.log('🤖 Reddit to GitHub Sync for AI10BRO');
        console.log('=' .repeat(50));
        console.log(`📚 Syncing ${SUBREDDITS.length} subreddits to GitHub`);
        console.log(`📦 Repository: ${OWNER}/${REPO}`);
        console.log('');
        
        let totalUploaded = 0;
        let totalSkipped = 0;
        
        // Process each subreddit
        for (const subreddit of SUBREDDITS) {
            console.log(`\n📖 Processing r/${subreddit}...`);
            
            try {
                // Fetch hot posts
                const hotPosts = await fetchRedditJSON(subreddit, 'hot', 10);
                const results = await processRedditPosts(subreddit, hotPosts);
                
                console.log(`  Summary: ${results.uploaded} uploaded | ${results.skipped} skipped`);
                
                totalUploaded += results.uploaded;
                totalSkipped += results.skipped;
                
                // Rate limiting
                await new Promise(resolve => setTimeout(resolve, 2000));
                
            } catch (error) {
                console.error(`  ❌ Error with r/${subreddit}:`, error.message);
            }
        }
        
        console.log('\n' + '=' .repeat(50));
        console.log(`✨ Reddit to GitHub Sync Complete!`);
        console.log(`📊 Total uploaded: ${totalUploaded}`);
        console.log(`⏭️  Total skipped: ${totalSkipped}`);
        console.log(`\nNow run sync-github-direct.js to pull these into the database`);
        
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { main };