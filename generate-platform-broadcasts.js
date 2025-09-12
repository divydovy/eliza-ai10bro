#!/usr/bin/env node

/**
 * Platform-specific broadcast generator with character limits
 * Generates optimized broadcasts for each platform respecting their limits
 */

const Database = require('better-sqlite3');
const path = require('path');
const { execSync } = require('child_process');

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
    twitter: `Create a compelling Twitter/X post about this scientific breakthrough. 
Must be under 280 characters including any URLs.
Use relevant hashtags sparingly.
Focus on the most impactful aspect.
Be concise and engaging.`,
    
    bluesky: `Create an engaging BlueSky post about this scientific breakthrough.
Must be under 300 characters including any URLs.
Focus on key innovation and impact.
Be conversational but informative.`,
    
    telegram: `Create a detailed Telegram broadcast about this scientific breakthrough.
Can be up to 4000 characters.
Include context, implications, and technical details.
Structure with clear paragraphs.
Add relevant emojis for readability.`,
    
    farcaster: `Create a Farcaster cast about this scientific breakthrough.
Must be under 320 characters.
Focus on the crypto/web3 implications if relevant.
Be technical but accessible.`,
    
    threads: `Create a Threads post about this scientific breakthrough.
Must be under 500 characters.
Be visual and engaging.
Focus on human impact and real-world applications.`
};

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

async function generatePlatformBroadcasts(documentId, content) {
    const broadcasts = {};
    
    for (const [platform, limit] of Object.entries(PLATFORM_LIMITS)) {
        const prompt = PLATFORM_PROMPTS[platform];
        console.log(`\n📱 Generating ${platform} broadcast (max ${limit} chars)...`);
        
        const broadcast = await generateWithLLM(content, prompt, limit);
        
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
            
            broadcasts[platform] = {
                text: broadcast,
                length: quality.length,
                quality: quality
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
        LIMIT 5
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
                id, documentId, content, client, status, alignment_score, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        
        const insertMany = db.transaction((broadcasts) => {
            for (const [platform, data] of Object.entries(broadcasts)) {
                const broadcastId = `${doc.id.substring(0, 8)}-${platform}-${Date.now()}`;
                const broadcastContent = JSON.stringify({
                    text: data.text,
                    metadata: {
                        platform: platform,
                        characterCount: data.length,
                        qualityScore: data.quality.score,
                        qualityChecks: data.quality,
                        generatedAt: new Date().toISOString()
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