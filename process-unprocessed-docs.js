#!/usr/bin/env node

const Database = require('better-sqlite3');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const crypto = require('crypto');

async function processUnprocessedDocuments(limit = 10) {
    console.log(`🚀 Processing up to ${limit} unprocessed documents...`);
    
    const db = new Database('./agent/data/db.sqlite');
    
    try {
        // Find documents without broadcasts
        const unprocessedDocs = db.prepare(`
            SELECT m.* FROM memories m
            WHERE m.type = 'documents'
            AND NOT EXISTS (
                SELECT 1 FROM broadcasts b WHERE b.documentId = m.id
            )
            AND json_extract(m.content, '$.text') IS NOT NULL
            AND length(json_extract(m.content, '$.text')) > 100
            ORDER BY m.createdAt DESC
            LIMIT ?
        `).all(limit);
        
        console.log(`Found ${unprocessedDocs.length} unprocessed documents`);
        
        if (unprocessedDocs.length === 0) {
            console.log('No unprocessed documents found');
            return { processed: 0, failed: 0 };
        }
        
        let processed = 0;
        let failed = 0;
        
        for (const doc of unprocessedDocs) {
            try {
                const content = JSON.parse(doc.content);
                const title = content.metadata?.title || content.text?.substring(0, 50) || 'Unknown';

                console.log(`\n📄 Processing: ${title}`);

                // Skip test/draft/cache documents for quality control
                if (/test|draft|cache|example|demo/i.test(title) ||
                    /test|draft|cache|example|demo/i.test(content.text?.substring(0, 200) || '')) {
                    console.log('   ⏭️  Skipped (test/draft content)');
                    failed++;
                    continue;
                }

                // Skip documents with insufficient content
                const textLength = content.text?.length || 0;
                if (textLength < 200) {
                    console.log(`   ⏭️  Skipped (insufficient content: ${textLength} chars)`);
                    failed++;
                    continue;
                }

                // Generate broadcast using Ollama
                const prompt = `You are a technology analyst creating concise, informative broadcasts about innovations and breakthroughs.

CRITICAL: Write ONLY in ENGLISH, regardless of the source language.

Content to analyze:
${content.text?.substring(0, 2000)}

Write a SINGLE PARAGRAPH broadcast IN ENGLISH ONLY (MAXIMUM 280 characters for Twitter/Bluesky/Farcaster compatibility) that:
- Clearly states what this innovation is and why it matters
- Provides specific details (names, companies, dates, metrics)
- Ends with ONE actionable insight: someone to follow, tool to try, or trend to watch
- Uses clear, professional language accessible to a general audience

AVOID:
- Flowery metaphors or poetic language
- Vague generalizations
- Multiple calls to action
- Technical jargon without explanation

Remember: Be informative, specific, and actionable.

[BROADCAST_REQUEST:${doc.id}]`;

                // Save prompt to temp file and generate
                const tempFile = `/tmp/broadcast-${Date.now()}.txt`;
                require('fs').writeFileSync(tempFile, prompt);
                
                const { stdout } = await execPromise(`ollama run qwen2.5:14b < ${tempFile}`);
                require('fs').unlinkSync(tempFile);
                
                // Extract broadcast
                let generated = stdout.trim();
                const match = generated.match(/\[BROADCAST:.*?\](.*?)$/s);
                if (match) {
                    generated = match[1].trim();
                }
                
                // Enforce length limit
                if (generated.length > 750) {
                    // Find last complete sentence within limit
                    const sentences = generated.match(/[^.!?]+[.!?]+/g) || [];
                    let truncated = '';
                    for (const sentence of sentences) {
                        if ((truncated + sentence).length <= 700) {
                            truncated += sentence;
                        } else {
                            break;
                        }
                    }
                    generated = truncated || generated.substring(0, 700) + '...';
                }
                
                // Extract source URL if available (check multiple locations)
                let sourceUrl = content.metadata?.frontmatter?.source ||
                              content.metadata?.url ||
                              content.url ||
                              content.source ||
                              null;

                // Don't add GitHub/Obsidian internal references as sources
                if (sourceUrl && (sourceUrl === 'github' || sourceUrl === 'obsidian' || sourceUrl.includes('github.com/divydovy'))) {
                    // Try to find an actual external URL in the document content
                    const urlMatch = content.text?.match(/https?:\/\/(?!github\.com\/divydovy)[^\s\)]+/);
                    sourceUrl = urlMatch ? urlMatch[0] : null;
                }

                // Only add source if it's a real external URL
                if (sourceUrl && sourceUrl.startsWith('http') && !sourceUrl.includes('github.com/divydovy')) {
                    generated = `${generated}\n\n🔗 Source: ${sourceUrl}`;
                }
                
                // Create broadcasts for all platforms
                const platforms = ['telegram', 'farcaster', 'bluesky'];
                const platformLimits = {
                    telegram: 4096,
                    farcaster: 320,
                    bluesky: 300
                };

                for (const platform of platforms) {
                    let platformContent = generated;
                    const maxLength = platformLimits[platform];

                    // Adjust content for platform limits
                    if (platformContent.length > maxLength) {
                        // Find last complete sentence within limit
                        const sentences = platformContent.match(/[^.!?]+[.!?]+/g) || [];
                        let truncated = '';
                        for (const sentence of sentences) {
                            if ((truncated + sentence).length <= maxLength - 20) {
                                truncated += sentence;
                            } else {
                                break;
                            }
                        }
                        platformContent = truncated || platformContent.substring(0, maxLength - 20) + '...';
                    }

                    // Wrap content in JSON for storage
                    const jsonContent = JSON.stringify({ text: platformContent });

                    // Create broadcast
                    const broadcastId = crypto.randomUUID();
                    db.prepare(`
                        INSERT INTO broadcasts (
                            id, documentId, client, content,
                            status, alignment_score, createdAt
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        broadcastId,
                        doc.id,
                        platform,
                        jsonContent,
                        'pending',
                        0.8,
                        Date.now()
                    );

                    console.log(`✅ Created ${platform} broadcast: ${broadcastId} (${platformContent.length} chars)`);
                }

                processed++;
                
            } catch (error) {
                console.error(`❌ Failed to process document: ${error.message}`);
                failed++;
            }
        }
        
        console.log(`\n📊 Summary:`);
        console.log(`   Processed: ${processed}`);
        console.log(`   Failed: ${failed}`);
        
        // Now trigger the queue processing to send them
        if (processed > 0) {
            console.log(`\n📤 Triggering broadcast queue processing...`);
            try {
                await execPromise(`curl -s -X POST http://localhost:3000/trigger -H "Content-Type: application/json" -d '{"action":"PROCESS_QUEUE"}'`);
                console.log(`✅ Queue processing triggered`);
            } catch (error) {
                console.log(`⚠️  Could not trigger queue processing: ${error.message}`);
            }
        }
        
        return { processed, failed };
        
    } finally {
        db.close();
    }
}

// Run if called directly
if (require.main === module) {
    const limit = process.argv[2] ? parseInt(process.argv[2]) : 10;
    processUnprocessedDocuments(limit).catch(console.error);
}

module.exports = { processUnprocessedDocuments };