#!/usr/bin/env node

/**
 * Free YouTube RSS Feed Fetcher
 * No API key required - uses public RSS feeds
 */

const https = require('https');
const xml2js = require('xml2js');
const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

// Helper to generate UUID
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

// YouTube channels to monitor (add more as needed)
const YOUTUBE_CHANNELS = [
    { name: 'TED', channelId: 'UCAuUUnT6oDeKwE6v1NGQxug' },
    { name: 'MIT', channelId: 'UCk0Gn0le4XOgrODmhwKdvkg' },
    { name: 'Google', channelId: 'UCK8sQmJBp8GCxrOtXWBpyEA' },
    { name: 'Microsoft', channelId: 'UCFtEEv80fQVKkD4h1PF-Xqw' },
    { name: 'NASA', channelId: 'UCLA_DiR1FfKNvjuUpBHmylQ' },
    { name: 'SpaceX', channelId: 'UCtI0Hodo5o5dUb67FeUjDeA' },
    { name: 'Two Minute Papers', channelId: 'UCbfYPyITQ-7l4upoX8nvctg' },
    { name: 'Veritasium', channelId: 'UCHnyfMqiRRG1u-2MsSQLbXA' },
    { name: 'Kurzgesagt', channelId: 'UCsXVk37bltHxD1rDPwtNM8Q' }
];

// Keywords to filter for AI10bro interests
const KEYWORDS = [
    'ai', 'artificial intelligence', 'machine learning', 'quantum', 'sustainable',
    'renewable', 'carbon', 'climate', 'biotech', 'nanotech', 'robotics', 'neural',
    'breakthrough', 'innovation', 'research', 'science', 'technology', 'future',
    'energy', 'solar', 'fusion', 'computing', 'algorithm', 'deep learning'
];

function fetchRSSFeed(channelId) {
    return new Promise((resolve, reject) => {
        const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
        
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                xml2js.parseString(data, (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });
        }).on('error', reject);
    });
}

function isRelevant(title, description = '') {
    const text = `${title} ${description}`.toLowerCase();
    return KEYWORDS.some(keyword => text.includes(keyword));
}

async function main() {
    const db = new Database('./agent/data/db.sqlite');
    
    // Get agent ID
    const agent = db.prepare("SELECT id FROM accounts WHERE name = 'ai10bro'").get();
    if (!agent) {
        console.error('Agent ai10bro not found');
        process.exit(1);
    }
    const agentId = agent.id;
    
    // Get room ID
    const room = db.prepare("SELECT id FROM rooms LIMIT 1").get();
    const roomId = room ? room.id : null;
    
    console.log('🎬 Fetching YouTube content via RSS (no API key needed!)');
    console.log('=' .repeat(60));
    
    let totalImported = 0;
    let totalSkipped = 0;
    
    for (const channel of YOUTUBE_CHANNELS) {
        try {
            console.log(`\n📺 Fetching from ${channel.name}...`);
            const feed = await fetchRSSFeed(channel.channelId);
            
            if (!feed?.feed?.entry) {
                console.log(`  No videos found`);
                continue;
            }
            
            const videos = feed.feed.entry;
            let channelImported = 0;
            let channelSkipped = 0;
            
            for (const video of videos.slice(0, 10)) { // Last 10 videos per channel
                const videoId = video['yt:videoId'][0];
                const title = video.title[0];
                const published = video.published[0];
                const author = video.author[0].name[0];
                const link = video.link[0].$.href;
                
                // Check if relevant
                if (!isRelevant(title)) {
                    continue;
                }
                
                // Check if already exists
                const docId = stringToUuid(`youtube-${videoId}`);
                const existing = db.prepare('SELECT id FROM memories WHERE id = ?').get(docId);
                
                if (existing) {
                    channelSkipped++;
                    continue;
                }
                
                // Create document
                const document = {
                    text: `# ${title}\n\n**Channel**: ${author}\n**Published**: ${published}\n**Link**: ${link}\n\n[Watch on YouTube](${link})`,
                    metadata: {
                        title: title,
                        videoId: videoId,
                        channel: author,
                        channelId: channel.channelId,
                        published: published,
                        url: link,
                        sourceType: 'youtube',
                        source: link,
                        importedAt: new Date().toISOString()
                    }
                };
                
                // Insert into database
                db.prepare(`
                    INSERT INTO memories (id, type, content, embedding, userId, agentId, roomId, createdAt)
                    VALUES (?, 'documents', ?, '[]', ?, ?, ?, ?)
                `).run(docId, JSON.stringify(document), agentId, agentId, roomId, Date.now());
                
                channelImported++;
                console.log(`  ✅ Imported: ${title.substring(0, 60)}...`);
            }
            
            totalImported += channelImported;
            totalSkipped += channelSkipped;
            
            if (channelImported > 0) {
                console.log(`  📊 Channel summary: ${channelImported} imported, ${channelSkipped} skipped`);
            }
            
        } catch (error) {
            console.error(`  ❌ Error fetching ${channel.name}:`, error.message);
        }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🎯 YouTube RSS Fetch Complete!');
    console.log(`📥 Total imported: ${totalImported} videos`);
    console.log(`⏭️  Total skipped: ${totalSkipped} videos`);
    console.log('=' .repeat(60));
    
    db.close();
}

// Check if xml2js is installed
try {
    require('xml2js');
    main().catch(console.error);
} catch (e) {
    console.log('Installing xml2js...');
    require('child_process').execSync('npm install xml2js', { stdio: 'inherit' });
    console.log('Please run the script again.');
}