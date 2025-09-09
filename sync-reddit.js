#!/usr/bin/env node

/**
 * Reddit content scraper for AI10BRO
 * Focuses on biomimetics, sustainability, and regenerative tech subreddits
 * Uses Reddit's JSON API for read-only access
 */

const Database = require('better-sqlite3');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Subreddits aligned with AI10BRO's mission
const SUBREDDITS = [
    // Tier 1 - Core Mission
    'syntheticbiology',
    'biotech', 
    'biomimicry',
    'sustainability',
    'RenewableEnergy',
    'ClimateActionPlan',
    // Tier 2 - Supporting Tech
    'cleantech',
    'CircularEconomy',
    'Permaculture',
    'solarpunk',
    // Tier 3 - Emerging Tech
    'longevity',
    'VerticalFarming',
    'labgrown'
];

// Helper to generate UUID v4 from string
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

// Process and save Reddit posts
async function processRedditPosts(db, subreddit, posts) {
    let imported = 0;
    let skipped = 0;
    
    for (const item of posts.data.children) {
        const post = item.data;
        
        // Skip if low quality
        if (post.score < 10 || post.num_comments < 2) {
            skipped++;
            continue;
        }
        
        // Create unique ID
        const docId = stringToUuid(`reddit-${post.id}`);
        
        // Check if already exists
        const existing = db.prepare(`
            SELECT id FROM memories 
            WHERE id = ? AND type = 'documents'
        `).get(docId);
        
        if (existing) {
            skipped++;
            continue;
        }
        
        // Prepare content
        const title = post.title || '';
        const selftext = post.selftext || '';
        const url = post.url || '';
        const permalink = `https://reddit.com${post.permalink}`;
        
        const content = `# ${title}

${selftext}

**Score:** ${post.score} | **Comments:** ${post.num_comments}
**Subreddit:** r/${subreddit}
**Author:** u/${post.author}
${url && url !== permalink ? `**Link:** ${url}` : ''}
**Discussion:** ${permalink}`;

        // Create metadata
        const metadata = {
            source: permalink,
            path: `Reddit/${subreddit}/${post.id}.md`,
            title: title,
            subreddit: subreddit,
            score: post.score,
            author: post.author,
            created_utc: post.created_utc,
            num_comments: post.num_comments,
            url: url,
            importedAt: new Date().toISOString(),
            sourceType: 'reddit'
        };
        
        // Insert into database
        try {
            // Create a placeholder embedding (will be generated later by Eliza)
            const embedding = new Float32Array(1536).fill(0);
            
            db.prepare(`
                INSERT INTO memories (
                    id, type, content, userId, roomId, agentId, createdAt, embedding
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                docId,
                'documents',
                JSON.stringify({ text: content, metadata }),
                'ai10bro',
                'ai10bro-room',
                'ai10bro',
                Date.now(),
                Buffer.from(embedding.buffer)
            );
            
            imported++;
        } catch (error) {
            console.error(`Error importing ${post.id}:`, error.message);
        }
    }
    
    return { imported, skipped };
}

async function main() {
    try {
        // Open database
        const dbPath = path.join(__dirname, 'agent/data/db.sqlite');
        const db = new Database(dbPath);
        
        console.log('🤖 Reddit Sync for AI10BRO');
        console.log('=' .repeat(50));
        console.log(`📚 Syncing ${SUBREDDITS.length} subreddits`);
        console.log('');
        
        let totalImported = 0;
        let totalSkipped = 0;
        
        // Process each subreddit
        for (const subreddit of SUBREDDITS) {
            console.log(`\n📖 Processing r/${subreddit}...`);
            
            try {
                // Fetch hot posts
                const hotPosts = await fetchRedditJSON(subreddit, 'hot', 25);
                const hotResults = await processRedditPosts(db, subreddit, hotPosts);
                
                // Fetch top posts (week)
                const topPosts = await fetchRedditJSON(subreddit, 'top', 10);
                const topResults = await processRedditPosts(db, subreddit, topPosts);
                
                const imported = hotResults.imported + topResults.imported;
                const skipped = hotResults.skipped + topResults.skipped;
                
                console.log(`  ✅ Imported: ${imported} | ⏭️  Skipped: ${skipped}`);
                
                totalImported += imported;
                totalSkipped += skipped;
                
                // Rate limiting - Reddit allows ~60 requests/minute
                await new Promise(resolve => setTimeout(resolve, 2000));
                
            } catch (error) {
                console.error(`  ❌ Error with r/${subreddit}:`, error.message);
            }
        }
        
        console.log('\n' + '=' .repeat(50));
        console.log(`✨ Reddit Sync Complete!`);
        console.log(`📊 Total imported: ${totalImported}`);
        console.log(`⏭️  Total skipped: ${totalSkipped}`);
        console.log(`📚 Total documents: ${db.prepare("SELECT COUNT(*) as count FROM memories WHERE type = 'documents'").get().count}`);
        
        db.close();
        
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