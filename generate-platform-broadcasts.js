#!/usr/bin/env node

/**
 * Platform-specific broadcast generator with character limits
 * Generates optimized broadcasts for each platform respecting their limits
 */

const Database = require('better-sqlite3');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');
const http = require('http');

// Platform character limits
const PLATFORM_LIMITS = {
    twitter: 280,
    bluesky: 300,
    telegram: 4096,
    farcaster: 320,
    threads: 500
};

// Platform-specific prompts
const PLATFORM_PROMPTS = {
    twitter: `You are ai10bro, a friendly AI helping build a positive tech future.
Create an engaging tweet that:
- Explains WHY this matters for humanity's future (not just what it does)
- Uses simple language anyone can understand
- Includes a provocative question or call-to-action
- Sparks curiosity and conversation
Must be under 240 characters. Add 1-2 relevant hashtags like #FutureTech #HumanAI #Web3`,

    bluesky: `You are ai10bro, bridging cutting-edge tech with human needs.
Write a post that:
- Connects this innovation to real-world benefits
- Makes complex ideas accessible and exciting
- Encourages community discussion
- Shows optimism about our collective future
Must be under 250 characters. Be conversational, not academic.`,

    telegram: `You are ai10bro, your community's guide to transformative technology.
Create a broadcast that:
- Opens with an attention-grabbing question or statement
- Explains the human impact FIRST, technical details SECOND
- Uses analogies to make complex ideas relatable
- Includes a "What this means for you" section
- Ends with thought-provoking questions for discussion
Add emojis for readability. Maximum 3900 characters.`,

    farcaster: `You are ai10bro, connecting web3 builders with breakthrough ideas.
Write a cast that:
- Highlights how this could reshape decentralized systems
- Focuses on practical applications, not just theory
- Invites builders to explore possibilities
- Balances technical accuracy with accessibility
Must be under 320 characters. Be inspiring, not dry.`,

    threads: `You are ai10bro, making tomorrow's tech understandable today.
Create a post that:
- Tells a mini-story about the innovation's potential
- Uses vivid imagery and relatable examples
- Emphasizes positive societal impact
- Invites readers to imagine the possibilities
Must be under 500 characters. Be visual and optimistic.`
};

// Open Graph image extraction function
async function extractOpenGraphImage(url) {
    return new Promise((resolve) => {
        if (!url || !url.startsWith('http')) {
            resolve(null);
            return;
        }
        
        const protocol = url.startsWith('https://') ? https : http;
        const timeoutMs = 5000; // 5 second timeout
        
        const request = protocol.get(url, { 
            timeout: timeoutMs,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; ElizaBroadcast/1.0)'
            }
        }, (response) => {
            let html = '';
            let size = 0;
            const maxSize = 500000; // 500KB limit
            
            response.on('data', (chunk) => {
                size += chunk.length;
                if (size > maxSize) {
                    request.destroy();
                    resolve(null);
                    return;
                }
                html += chunk;
                
                // Early detection - stop once we find og:image
                const ogImageMatch = html.match(/<meta[^>]*property=['"](og:image)['"][^>]*content=['"]([^'"]+)['"]/i);
                if (ogImageMatch) {
                    request.destroy();
                    const imageUrl = ogImageMatch[2];
                    // Convert relative URLs to absolute
                    if (imageUrl.startsWith('//')) {
                        resolve(`https:${imageUrl}`);
                    } else if (imageUrl.startsWith('/')) {
                        const urlObj = new URL(url);
                        resolve(`${urlObj.protocol}//${urlObj.host}${imageUrl}`);
                    } else if (imageUrl.startsWith('http')) {
                        resolve(imageUrl);
                    } else {
                        resolve(null);
                    }
                    return;
                }
            });
            
            response.on('end', () => {
                // Final check if we didn't find it during streaming
                const ogImageMatch = html.match(/<meta[^>]*property=['"](og:image)['"][^>]*content=['"]([^'"]+)['"]/i);
                if (ogImageMatch) {
                    const imageUrl = ogImageMatch[2];
                    if (imageUrl.startsWith('//')) {
                        resolve(`https:${imageUrl}`);
                    } else if (imageUrl.startsWith('/')) {
                        const urlObj = new URL(url);
                        resolve(`${urlObj.protocol}//${urlObj.host}${imageUrl}`);
                    } else if (imageUrl.startsWith('http')) {
                        resolve(imageUrl);
                    } else {
                        resolve(null);
                    }
                } else {
                    resolve(null);
                }
            });
            
            response.on('error', () => resolve(null));
        });
        
        request.on('timeout', () => {
            request.destroy();
            resolve(null);
        });
        
        request.on('error', () => resolve(null));
    });
}

async function generateWithLLM(text, prompt, maxLength, maxAttempts = 3) {
    try {
        let attempts = 0;
        let broadcast = null;
        
        while (attempts < maxAttempts) {
            attempts++;
            
            // Adjust prompt based on previous attempts
            let adjustedPrompt = prompt;
            if (attempts > 1 && broadcast) {
                adjustedPrompt = `${prompt}

IMPORTANT: Your previous attempt was ${broadcast.length} characters, which exceeds the ${maxLength} character limit.
Please condense the content to fit within ${maxLength} characters while preserving the key information.
Focus on the most important aspects and remove any redundant words.`;
            }
            
            const fullPrompt = `${adjustedPrompt}

Content to summarize:
${text}

CRITICAL: Output must be under ${maxLength} characters total (currently attempt ${attempts}/${maxAttempts}).
Do not include any preamble or explanation, just the broadcast text.`;

            const command = `curl -s http://localhost:11434/api/generate -d '${JSON.stringify({
                model: "qwen2.5:14b",
                prompt: fullPrompt,
                stream: false,
                temperature: attempts === 1 ? 0.7 : 0.5 // Lower temperature for refinement
            })}'`;
            
            const response = execSync(command, { maxBuffer: 1024 * 1024 * 10 });
            const result = JSON.parse(response.toString());
            
            if (result.response) {
                broadcast = result.response.trim();
                
                // Check if it fits within limit
                if (broadcast.length <= maxLength) {
                    console.log(`   ✅ Fit within limit on attempt ${attempts}`);
                    return broadcast;
                } else if (attempts < maxAttempts) {
                    console.log(`   🔄 Attempt ${attempts}: ${broadcast.length} chars (exceeds by ${broadcast.length - maxLength}), refining...`);
                }
            }
        }
        
        // Final fallback: Ask LLM to create a very concise version
        if (broadcast && broadcast.length > maxLength) {
            console.log(`   ⚠️ All attempts exceeded limit, requesting ultra-concise version...`);
            
            const fallbackPrompt = `Create an ULTRA-CONCISE ${maxLength - 20} character summary of the following, focusing ONLY on the single most important fact:

${text.substring(0, 500)}

Output ONLY the summary, no explanation. Must be under ${maxLength - 20} characters.`;

            const fallbackCommand = `curl -s http://localhost:11434/api/generate -d '${JSON.stringify({
                model: "qwen2.5:14b",
                prompt: fallbackPrompt,
                stream: false,
                temperature: 0.3
            })}'`;
            
            const fallbackResponse = execSync(fallbackCommand, { maxBuffer: 1024 * 1024 * 10 });
            const fallbackResult = JSON.parse(fallbackResponse.toString());
            
            if (fallbackResult.response) {
                broadcast = fallbackResult.response.trim();
                if (broadcast.length <= maxLength) {
                    console.log(`   ✅ Ultra-concise version succeeded: ${broadcast.length} chars`);
                    return broadcast;
                }
            }
        }
        
        // Absolute last resort: intelligent truncation (should rarely happen)
        if (broadcast && broadcast.length > maxLength) {
            console.log(`   ⚠️ Using intelligent truncation as last resort`);
            const sentences = broadcast.match(/[^.!?]+[.!?]+/g) || [broadcast];
            let truncated = '';
            
            for (const sentence of sentences) {
                if ((truncated + sentence).length <= maxLength - 3) {
                    truncated += sentence;
                } else {
                    break;
                }
            }
            
            if (truncated.length === 0) {
                // If no complete sentence fits, hard truncate
                broadcast = broadcast.substring(0, maxLength - 3) + '...';
            } else {
                broadcast = truncated;
            }
        }
        
        return broadcast;
    } catch (error) {
        console.error('LLM generation error:', error.message);
    }
    return null;
}

async function generatePlatformBroadcasts(documentId, content, sourceUrl = '') {
    const broadcasts = {};
    
    // Extract URL from content if available
    const url = sourceUrl || 
                (typeof content === 'string' && content.match(/https?:\/\/[^\s]+/)?.[0]) ||
                '';
    
    // Extract Open Graph image if we have a URL
    let ogImage = null;
    if (url) {
        console.log(`\n🖼️  Extracting Open Graph image from: ${url}`);
        ogImage = await extractOpenGraphImage(url);
        if (ogImage) {
            console.log(`   ✅ Found OG image: ${ogImage.substring(0, 80)}...`);
        } else {
            console.log(`   ℹ️  No OG image found`);
        }
    }
    
    for (const [platform, limit] of Object.entries(PLATFORM_LIMITS)) {
        const prompt = PLATFORM_PROMPTS[platform];
        
        // Reserve space for URL if we have one
        const effectiveLimit = url ? limit - url.length - 5 : limit; // 5 chars for "\n\n🔗 "
        
        console.log(`\n📱 Generating ${platform} broadcast (max ${effectiveLimit} chars + URL)...`);
        
        const broadcast = await generateWithLLM(content, prompt, effectiveLimit);
        
        if (broadcast) {
            // Quality checks
            const quality = {
                length: broadcast.length,
                withinLimit: broadcast.length <= limit,
                hasContent: broadcast.length > 50,
                notTruncated: !broadcast.endsWith('...'),
                hasMetrics: /\d+(?:\.\d+)?%|\d+x|\d+\s+(?:tons|MW|GW)/.test(broadcast),
                hasEntity: /[A-Z][a-z]+\s+(?:University|Labs|Corporation|Initiative)/.test(broadcast),
                score: 0
            };
            
            // Calculate quality score
            quality.score = 0.5; // Base score
            if (quality.withinLimit) quality.score += 0.2;
            if (quality.hasContent) quality.score += 0.1;
            if (quality.notTruncated) quality.score += 0.1;
            if (quality.hasMetrics) quality.score += 0.05;
            if (quality.hasEntity) quality.score += 0.05;
            
            // Add URL to the broadcast text if available
            const finalBroadcast = url ? `${broadcast}\n\n🔗 ${url}` : broadcast;
            
            broadcasts[platform] = {
                text: finalBroadcast,
                length: finalBroadcast.length,
                quality: quality,
                url: url,
                ogImage: ogImage
            };
            
            console.log(`   ✅ Generated: ${quality.length} chars (${quality.withinLimit ? 'within' : 'EXCEEDS'} limit)`);
            console.log(`   📊 Quality score: ${(quality.score * 100).toFixed(0)}%`);
            
            if (!quality.withinLimit) {
                console.log(`   ⚠️  WARNING: Broadcast exceeds ${platform} limit!`);
            }
        } else {
            console.log(`   ❌ Failed to generate ${platform} broadcast`);
        }
    }
    
    return broadcasts;
}

async function updateBroadcastsWithPlatformVersions() {
    const dbPath = path.join(__dirname, 'agent/data/db.sqlite');
    const db = new Database(dbPath);
    
    console.log('🚀 Platform-Specific Broadcast Generator\n');
    console.log('========================================\n');
    
    // Get documents without platform-specific broadcasts
    const documents = db.prepare(`
        SELECT DISTINCT m.id, m.content 
        FROM memories m
        LEFT JOIN broadcasts b ON b.documentId = m.id
        WHERE m.type = 'documents'
        AND b.id IS NULL
        LIMIT 50
    `).all();
    
    console.log(`📚 Found ${documents.length} documents without broadcasts\n`);
    
    for (const doc of documents) {
        console.log(`\n📄 Processing document ${doc.id.substring(0, 8)}...`);
        
        let content = '';
        try {
            const parsed = JSON.parse(doc.content);
            content = parsed.text || parsed.content || JSON.stringify(parsed);
        } catch (e) {
            content = doc.content;
        }
        
        // Limit content for processing
        content = content.substring(0, 2000);
        
        // Generate broadcasts for each platform
        const platformBroadcasts = await generatePlatformBroadcasts(doc.id, content);
        
        // Store broadcasts in database
        const insertStmt = db.prepare(`
            INSERT INTO broadcasts (
                id, documentId, content, client, status, alignment_score, createdAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        
        const insertMany = db.transaction((broadcasts) => {
            for (const [platform, data] of Object.entries(broadcasts)) {
                const broadcastId = `${doc.id.substring(0, 8)}-${platform}-${Date.now()}`;
                const broadcastContent = JSON.stringify({
                    text: data.text,
                    url: data.url,
                    ogImage: data.ogImage,
                    metadata: {
                        platform: platform,
                        characterCount: data.length,
                        qualityScore: data.quality.score,
                        qualityChecks: data.quality,
                        generatedAt: new Date().toISOString(),
                        hasOGImage: !!data.ogImage
                    }
                });
                
                insertStmt.run(
                    broadcastId,
                    doc.id,
                    broadcastContent,
                    platform,
                    'pending',
                    data.quality.score,
                    Date.now()
                );
            }
        });
        
        if (Object.keys(platformBroadcasts).length > 0) {
            insertMany(platformBroadcasts);
            console.log(`\n✅ Created ${Object.keys(platformBroadcasts).length} platform-specific broadcasts`);
        }
    }
    
    // Get statistics
    const stats = db.prepare(`
        SELECT 
            client as platform,
            COUNT(*) as count,
            AVG(alignment_score) as avg_quality,
            MIN(LENGTH(json_extract(content, '$.text'))) as min_length,
            MAX(LENGTH(json_extract(content, '$.text'))) as max_length
        FROM broadcasts
        WHERE status = 'pending'
        GROUP BY client
    `).all();
    
    console.log('\n📊 Platform Broadcast Statistics:');
    console.log('=====================================');
    for (const stat of stats) {
        console.log(`\n${stat.platform}:`);
        console.log(`  Count: ${stat.count}`);
        console.log(`  Avg Quality: ${(stat.avg_quality * 100).toFixed(0)}%`);
        console.log(`  Length Range: ${stat.min_length}-${stat.max_length} chars`);
    }
    
    db.close();
}

// Check for truncation issues in existing broadcasts
async function checkExistingBroadcasts() {
    const dbPath = path.join(__dirname, 'agent/data/db.sqlite');
    const db = new Database(dbPath);
    
    console.log('\n\n🔍 Checking Existing Broadcasts for Truncation\n');
    console.log('===============================================\n');
    
    const broadcasts = db.prepare(`
        SELECT id, client, content 
        FROM broadcasts 
        WHERE status = 'pending'
    `).all();
    
    const issues = [];
    
    for (const broadcast of broadcasts) {
        try {
            const content = JSON.parse(broadcast.content);
            const text = content.text || broadcast.content;
            const platform = broadcast.client;
            const limit = PLATFORM_LIMITS[platform] || 500;
            
            if (text.length > limit) {
                issues.push({
                    id: broadcast.id,
                    platform: platform,
                    length: text.length,
                    limit: limit,
                    excess: text.length - limit,
                    preview: text.substring(0, 100) + '...'
                });
            }
        } catch (e) {
            // Skip malformed broadcasts
        }
    }
    
    if (issues.length > 0) {
        console.log(`⚠️  Found ${issues.length} broadcasts exceeding platform limits:\n`);
        issues.forEach(issue => {
            console.log(`  ${issue.platform}: ${issue.length} chars (limit: ${issue.limit}, excess: ${issue.excess})`);
            console.log(`    ${issue.preview}\n`);
        });
    } else {
        console.log('✅ All broadcasts are within platform limits!');
    }
    
    db.close();
    return issues;
}

// Run if called directly
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.includes('--check')) {
        checkExistingBroadcasts().catch(console.error);
    } else {
        updateBroadcastsWithPlatformVersions()
            .then(() => checkExistingBroadcasts())
            .catch(console.error);
    }
}

module.exports = { 
    generatePlatformBroadcasts, 
    checkExistingBroadcasts,
    PLATFORM_LIMITS 
};