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

                // Skip only actual test/draft/cache documents
                if (/\b(test|draft|cache|example|demo)\b/i.test(title) &&
                    !title.includes('arxiv') && !content.text?.includes('arxiv')) {
                    console.log('   ⏭️  Skipped (test/draft content)');
                    failed++;
                    continue;
                }

                // Check mission alignment - AI10BRO focuses on innovation, sustainability, and technology
                const missionKeywords = [
                    'ai', 'artificial intelligence', 'machine learning', 'neural', 'algorithm',
                    'sustainability', 'renewable', 'climate', 'carbon', 'energy', 'solar', 'wind',
                    'innovation', 'breakthrough', 'research', 'technology', 'science',
                    'biotech', 'nanotech', 'quantum', 'computing', 'robotics', 'automation',
                    'health', 'medical', 'drug discovery', 'protein', 'genetic', 'therapy'
                ];

                const contentLower = (title + ' ' + content.text?.substring(0, 1000)).toLowerCase();
                const hasRelevantContent = missionKeywords.some(keyword => contentLower.includes(keyword));

                // Skip non-aligned content (politics, strikes, non-tech news)
                const excludeKeywords = ['strike', 'protest', 'election', 'politician', 'guerra', 'συλλαλητήρια'];
                const hasExcludedContent = excludeKeywords.some(keyword => contentLower.includes(keyword));

                if (!hasRelevantContent || hasExcludedContent) {
                    console.log('   ⏭️  Skipped (not aligned with mission)');
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
                const prompt = `You are AI10BRO, tracking breakthrough innovations that shape humanity's sustainable future.

TASK: Generate ONLY the broadcast text. Do not include any labels, prefixes, or meta-text.

CONTENT TO ANALYZE:
${content.text?.substring(0, 2000)}

INSTRUCTIONS:
1. Choose ONE writing style (do not mention which style you're using):
   - Start with "MIT just cracked..." or "[Institution] just..." or "Breakthrough:..."
   - Start with impact: "Your electricity bills could drop..." or "80% reduction in..."
   - Start with the problem being solved: "Water scarcity affects 2 billion..."
   - Start with future vision: "By 2030..." or "Within 3 years..."
   - RARELY (1 in 10 times max): Use a nature metaphor, but VARY it (not always fireflies)

2. Structure your broadcast:
   - Lead with CONCRETE FACTS and the actual breakthrough
   - Include SPECIFIC metrics, numbers, percentages, or timelines
   - Connect to real-world impact (sustainability, climate, health, equity)
   - End with ONE action: link to the source, suggest following the PROJECT/RESEARCHER (not @AI10BRO), or join relevant community

3. Length: 400-600 characters total

WRONG OUTPUT (never write like this):
"Problem-solution: The plastic crisis..."
"Direct news lead: MIT just..."
"Like fireflies..." (don't overuse nature metaphors)
"**Breaking News**"
"(Note: This is about...)"
"Follow @AI10BRO for updates" (don't tell people to follow the sender)
Any text starting with a style label or using too many metaphors instead of facts

CORRECT OUTPUT (write exactly like this):
"Researchers achieved 47% efficiency in perovskite solar cells, surpassing silicon's 26% limit. Commercial production starts 2026. Track @MITEnergy"
"New carbon capture tech removes CO2 for $50/ton, 75% cheaper than current methods. Industrial trials begin Q2. Details at carbonengineering.com"
"Stanford's AI model predicts protein folding 10x faster using 90% less energy than AlphaFold. Open source release next month. Join r/ProteinFolding"

OUTPUT YOUR BROADCAST NOW (no labels, no prefixes, just the text):`;

                // Save prompt to temp file and generate
                const tempFile = `/tmp/broadcast-${Date.now()}.txt`;
                require('fs').writeFileSync(tempFile, prompt);
                
                const { stdout } = await execPromise(`ollama run qwen2.5:14b < ${tempFile}`);
                require('fs').unlinkSync(tempFile);
                
                // Extract broadcast - remove any quotes if LLM adds them
                let generated = stdout.trim();

                // Remove quotes if the LLM wrapped the response in them
                if (generated.startsWith('"') && generated.endsWith('"')) {
                    generated = generated.slice(1, -1);
                }
                if (generated.startsWith("'") && generated.endsWith("'")) {
                    generated = generated.slice(1, -1);
                }

                // Handle any escaped quotes
                generated = generated.replace(/\\"/g, '"');
                
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
                        // Check if content has source URL
                        const sourceMatch = platformContent.match(/🔗 Source: (https?:\/\/[^\s]+)/);

                        if (sourceMatch) {
                            // Split content and source
                            const sourceUrl = sourceMatch[0];
                            const mainContent = platformContent.replace(/\n\n🔗 Source: https?:\/\/[^\s]+$/, '');

                            // Calculate available space for main content
                            const availableLength = maxLength - sourceUrl.length - 3; // 3 for "\n\n"

                            if (availableLength > 100) { // Ensure enough space for meaningful content
                                // Truncate main content but preserve source
                                const sentences = mainContent.match(/[^.!?]+[.!?]+/g) || [];
                                let truncated = '';
                                for (const sentence of sentences) {
                                    if ((truncated + sentence).length <= availableLength) {
                                        truncated += sentence;
                                    } else {
                                        break;
                                    }
                                }
                                platformContent = (truncated || mainContent.substring(0, availableLength - 3) + '...') + '\n\n' + sourceUrl;
                            } else {
                                // Not enough space for source, use original truncation
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
                        } else {
                            // No source URL, use original truncation
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
                        0.8, // TODO: Calculate real alignment score based on content
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