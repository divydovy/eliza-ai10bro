#!/usr/bin/env node

/**
 * Expanded YouTube RSS Feed Fetcher for AI10bro
 * Focus on biomimetics, sustainability, and breakthrough tech
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

// EXPANDED YouTube channels - focused on AI10bro's interests
const YOUTUBE_CHANNELS = [
    // === SUSTAINABILITY & CLIMATE TECH ===
    { name: 'Just Have a Think', channelId: 'UCRBwLPbXGsI2cJe9W1zfSjQ' }, // Climate tech analysis
    { name: 'Undecided with Matt Ferrell', channelId: 'UCNzszbnvQeFzObW0ghk0Ckw' }, // Clean tech & sustainability
    { name: 'Climate Town', channelId: 'UCuVLG9pThvBABcYCm7pkNkA' }, // Climate solutions
    { name: 'Andrew Millison', channelId: 'UCgb_TbreMblaOvcELMozUNQ' }, // Permaculture & regenerative systems
    
    // === BIOMIMICRY & NATURE-INSPIRED TECH ===
    { name: 'Biomimicry Institute', channelId: 'UCsFfD7OPEhYU4DvFP--3zSQ' }, // Official biomimicry channel
    { name: 'Deep Look', channelId: 'UC-3SbfTPJsL8fJAPKiVqBLg' }, // Nature's micro engineering
    { name: 'Journey to the Microcosmos', channelId: 'UCBbnbBWJtwsf0jLGUwX5Q3g' }, // Microscopic life
    { name: 'Animalogic', channelId: 'UCwg6_F2hDHYrqbNSGjmar4w' }, // Animal adaptations
    
    // === AI & MACHINE LEARNING ===
    { name: 'Two Minute Papers', channelId: 'UCbfYPyITQ-7l4upoX8nvctg' },
    { name: 'Yannic Kilcher', channelId: 'UCZHmQk67mSJgfCCTn7xBfew' }, // ML paper reviews
    { name: 'AI Explained', channelId: 'UCNJ1Ymd5yFuUPtn21xtRbbw' }, // AI developments
    { name: 'Robert Miles AI Safety', channelId: 'UCLB7AzTwc6VFZrBsO2ucBMg' }, // AI alignment
    
    // === QUANTUM & ADVANCED PHYSICS ===
    { name: 'Quantum Computing Report', channelId: 'UCkJ_g33NWBaDmg9drv0Ly-Q' },
    { name: 'Looking Glass Universe', channelId: 'UCFk__1iexL3T5gvGcMpeHNA' }, // Quantum physics
    { name: 'Arvin Ash', channelId: 'UCpMcsdZf2KkAnfmxiq2MfMQ' }, // Physics & quantum
    
    // === MATERIALS SCIENCE & NANOTECH ===
    { name: 'NileRed', channelId: 'UCFhXFikryT4aFcLkLw2LBLA' }, // Chemistry & materials
    { name: 'Applied Science', channelId: 'UCivA7_KLKWo43tFcCkFvydw' }, // Advanced engineering
    { name: 'Ben Krasnow', channelId: 'UCivA7_KLKWo43tFcCkFvydw' }, // Materials engineering
    
    // === BIOTECH & SYNTHETIC BIOLOGY ===
    { name: 'The Thought Emporium', channelId: 'UCV5vCi3jPJdURZwAOO_FNfQ' }, // Bioengineering
    { name: 'Primer', channelId: 'UCKzJFdi57J53Vr_BkTfN3uQ' }, // Evolution & genetics
    { name: 'Stated Clearly', channelId: 'UC_cznB5YZZmvAmeq7Y3EriQ' }, // Biology & evolution
    
    // === RENEWABLE ENERGY ===
    { name: 'Engineering with Rosie', channelId: 'UCvs4qvkPR6SvFfPqLWV7qzg' }, // Wind & renewable engineering
    { name: 'Solar Power with Will', channelId: 'UCj1VqrHhDte54oLgPG4xpuQ' }, // Solar tech
    { name: 'Tesla Daily', channelId: 'UCgYkuL87rUwiBl7tqfN53Eg' }, // Battery & EV tech
    
    // === ROBOTICS & AUTOMATION ===
    { name: 'Boston Dynamics', channelId: 'UC7vVhkEfw4nOGp8TyDk7RcQ' },
    { name: 'IEEE Spectrum', channelId: 'UCNvl1bVCLfF9_LT-4NNtFrQ' }, // Robotics news
    { name: 'James Bruton', channelId: 'UCUbDcUPed50Y_7KmfCXKohA' }, // DIY robotics
    
    // === SPACE & ASTRONOMY (for perspective) ===
    { name: 'Scott Manley', channelId: 'UCxzC4EngIsMrPmbm6Nxvb-A' }, // Space technology
    { name: 'Isaac Arthur', channelId: 'UCZFipeZtQM5CKUjx6grh54g' }, // Future tech & megastructures
    { name: 'Anton Petrov', channelId: 'UCciQ8wFcVoIIMbGtmjExPbQ' }, // Space & science news
    
    // === INNOVATION & FUTURE TECH ===
    { name: 'ColdFusion', channelId: 'UC4QZ_LsYcvcq7qOsOhpAX4A' }, // Tech history & innovation
    { name: 'Real Engineering', channelId: 'UCR1IuLEqb6UEA_zQ81kwrfA' }, // Engineering solutions
    { name: 'Veritasium', channelId: 'UCHnyfMqiRRG1u-2MsSQLbXA' },
    { name: 'Kurzgesagt', channelId: 'UCsXVk37bltHxD1rDPwtNM8Q' },
    
    // === CIRCULAR ECONOMY & REGENERATIVE DESIGN ===
    { name: 'Ellen MacArthur Foundation', channelId: 'UCXzb2eX9Q7Yh3-sF-Sq1Qwg' }, // Circular economy
    { name: 'Cradle to Cradle', channelId: 'UC3bFZyVfWqLWW4dZDfm_4gg' }, // Regenerative design
    
    // === ORIGINAL CHANNELS (KEEP THESE) ===
    { name: 'TED', channelId: 'UCAuUUnT6oDeKwE6v1NGQxug' },
    { name: 'MIT', channelId: 'UCEBb1b_L6zDS3xTUrIALZOw' }, // Fixed MIT channel ID
    { name: 'Google', channelId: 'UCK8sQmJBp8GCxrOtXWBpyEA' },
    { name: 'Microsoft', channelId: 'UCFtEEv80fQVKkD4h1PF-Xqw' },
    { name: 'NASA', channelId: 'UCLA_DiR1FfKNvjuUpBHmylQ' },
    { name: 'SpaceX', channelId: 'UCtI0Hodo5o5dUb67FeUjDeA' }
];

// Enhanced keywords for AI10bro's interests
const KEYWORDS = [
    // AI & Computing
    'ai', 'artificial intelligence', 'machine learning', 'deep learning', 'neural',
    'quantum computing', 'quantum', 'algorithm', 'gpt', 'transformer', 'llm',
    
    // Sustainability & Climate
    'sustainable', 'renewable', 'carbon capture', 'climate', 'regenerative',
    'circular economy', 'green', 'clean energy', 'solar', 'wind', 'fusion',
    'carbon negative', 'net zero', 'permaculture', 'restoration',
    
    // Biomimicry & Nature
    'biomimicry', 'biomimetic', 'bio-inspired', 'nature', 'evolution',
    'adaptation', 'ecosystem', 'symbiosis', 'mycelium', 'fungi',
    
    // Materials & Nanotech
    'nanotech', 'graphene', 'metamaterial', 'smart material', 'self-healing',
    'biodegradable', 'bioplastic', 'composite',
    
    // Biotech
    'biotech', 'synthetic biology', 'crispr', 'genetic', 'bioengineer',
    'microbiome', 'cellular', 'protein folding', 'organoid',
    
    // Innovation
    'breakthrough', 'innovation', 'research', 'discovery', 'invention',
    'disruptive', 'paradigm', 'revolution', 'frontier',
    
    // Robotics
    'robotics', 'automation', 'swarm', 'soft robotics', 'bionic'
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
    
    console.log('🎬 Fetching YouTube content from EXPANDED channel list');
    console.log('🌿 Focus: Biomimicry, Sustainability, Innovation');
    console.log('=' .repeat(60));
    
    let totalImported = 0;
    let totalSkipped = 0;
    let channelsWithContent = 0;
    
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
                channelsWithContent++;
                console.log(`  📊 Channel summary: ${channelImported} imported, ${channelSkipped} skipped`);
            }
            
        } catch (error) {
            if (!error.message.includes('Unquoted attribute')) {
                console.error(`  ❌ Error fetching ${channel.name}:`, error.message);
            }
        }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🎯 YouTube RSS Fetch Complete!');
    console.log(`📡 Channels scanned: ${YOUTUBE_CHANNELS.length}`);
    console.log(`✅ Channels with relevant content: ${channelsWithContent}`);
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