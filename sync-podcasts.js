#!/usr/bin/env node

/**
 * Podcast RSS scraper for AI10BRO
 * Fetches episodes from sustainability, biotech, and regenerative tech podcasts
 */

const Database = require('better-sqlite3');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const xml2js = require('xml2js');

// Install xml2js if needed
try {
    require.resolve('xml2js');
} catch {
    console.log('Installing xml2js...');
    require('child_process').execSync('npm install xml2js', { stdio: 'inherit' });
}

// Podcasts aligned with AI10BRO's mission
const PODCASTS = [
    // Tier 1 - Direct alignment
    {
        name: 'The Biomimicry Institute',
        url: 'https://biomimicry.org/podcast/feed/',
        category: 'biomimicry'
    },
    {
        name: 'Outrage + Optimism',
        url: 'https://feeds.buzzsprout.com/785790.rss',
        category: 'climate'
    },
    {
        name: 'How to Save a Planet',
        url: 'https://feeds.simplecast.com/l2i9YnTd',
        category: 'climate'
    },
    {
        name: 'The Energy Gang',
        url: 'https://feeds.megaphone.fm/VMP5705694065',
        category: 'cleantech'
    },
    {
        name: 'Crazy Town',
        url: 'https://feeds.simplecast.com/6WZpZ5wE',
        category: 'sustainability'
    },
    {
        name: 'The Carbon Copy',
        url: 'https://feeds.megaphone.fm/ESP8268341096',
        category: 'cleantech'
    },
    {
        name: 'Reversing Climate Change',
        url: 'https://feeds.soundcloud.com/users/soundcloud:users:446750968/sounds.rss',
        category: 'climate'
    },
    {
        name: 'The Big Switch',
        url: 'https://feeds.megaphone.fm/columbia-the-big-switch',
        category: 'energy'
    },
    {
        name: 'GreenBiz 350',
        url: 'https://feeds.soundcloud.com/users/soundcloud:users:7422892/sounds.rss',
        category: 'sustainability'
    },
    {
        name: 'Climate One',
        url: 'https://feeds.megaphone.fm/climate-one',
        category: 'climate'
    }
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

// Parse RSS feed
function parseRSSFeed(xmlData) {
    return new Promise((resolve, reject) => {
        const parser = new xml2js.Parser({ explicitArray: false });
        parser.parseString(xmlData, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

// Fetch RSS feed
function fetchRSSFeed(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        
        const options = {
            headers: {
                'User-Agent': 'AI10BRO Podcast Bot/1.0'
            }
        };

        client.get(url, options, (res) => {
            // Handle redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                fetchRSSFeed(res.headers.location).then(resolve).catch(reject);
                return;
            }

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

// Process podcast episodes
async function processPodcastEpisodes(db, podcast, feed, agentId, roomId) {
    let imported = 0;
    let skipped = 0;
    
    // Get episodes from feed
    const items = feed.rss?.channel?.item || feed.feed?.entry || [];
    const episodes = Array.isArray(items) ? items : [items];
    
    // Process last 10 episodes max
    const recentEpisodes = episodes.slice(0, 10);
    
    for (const episode of recentEpisodes) {
        try {
            // Extract episode data
            const title = episode.title?.$t || episode.title || '';
            const description = episode.description || episode.summary || episode['itunes:summary'] || '';
            const pubDate = episode.pubDate || episode.published || episode['dc:date'] || '';
            const link = episode.link?.href || episode.link || episode.enclosure?.url || '';
            const guid = episode.guid?._ || episode.guid || episode.id || link;
            
            // Skip if no content
            if (!title || !description) {
                skipped++;
                continue;
            }
            
            // Create unique ID
            const docId = stringToUuid(`podcast-${podcast.name}-${guid}`);
            
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
            const content = `# ${title}

**Podcast:** ${podcast.name}
**Published:** ${new Date(pubDate).toLocaleDateString()}
**Category:** ${podcast.category}

## Episode Description

${description}

**Listen:** ${link}`;

            // Create metadata
            const metadata = {
                source: link,
                path: `Podcasts/${podcast.name}/${title}`,
                title: title,
                podcast: podcast.name,
                category: podcast.category,
                publishedDate: pubDate,
                importedAt: new Date().toISOString(),
                sourceType: 'podcast'
            };
            
            // Insert into database
            const embedding = new Float32Array(1536).fill(0);
            
            db.prepare(`
                INSERT INTO memories (
                    id, type, content, userId, roomId, agentId, createdAt, embedding
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                docId,
                'documents',
                JSON.stringify({ text: content, metadata }),
                null,
                roomId,
                agentId,
                Date.now(),
                Buffer.from(embedding.buffer)
            );
            
            imported++;
            
        } catch (error) {
            console.error(`Error processing episode:`, error.message);
        }
    }
    
    return { imported, skipped };
}

async function main() {
    try {
        // Open database
        const dbPath = path.join(__dirname, 'agent/data/db.sqlite');
        const db = new Database(dbPath);
        
        // Get the actual agentId from the database
        const agent = db.prepare("SELECT id FROM accounts WHERE name = 'ai10bro' LIMIT 1").get();
        if (!agent) {
            throw new Error('ai10bro agent not found in database');
        }
        const agentId = agent.id;
        
        // Get an existing room ID to use for the foreign key
        const room = db.prepare("SELECT id FROM rooms LIMIT 1").get();
        const roomId = room ? room.id : null;
        
        console.log('🎙️ Podcast Sync for AI10BRO');
        console.log('=' .repeat(50));
        console.log(`📻 Syncing ${PODCASTS.length} podcasts`);
        console.log('');
        
        let totalImported = 0;
        let totalSkipped = 0;
        
        // Process each podcast
        for (const podcast of PODCASTS) {
            console.log(`\n🎧 Processing ${podcast.name}...`);
            
            try {
                // Fetch RSS feed
                const xmlData = await fetchRSSFeed(podcast.url);
                const feed = await parseRSSFeed(xmlData);
                
                // Process episodes
                const results = await processPodcastEpisodes(db, podcast, feed, agentId, roomId);
                
                console.log(`  ✅ Imported: ${results.imported} | ⏭️  Skipped: ${results.skipped}`);
                
                totalImported += results.imported;
                totalSkipped += results.skipped;
                
                // Rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.error(`  ❌ Error with ${podcast.name}:`, error.message);
            }
        }
        
        console.log('\n' + '=' .repeat(50));
        console.log(`✨ Podcast Sync Complete!`);
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