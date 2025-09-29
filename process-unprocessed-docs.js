#!/usr/bin/env node

const Database = require('better-sqlite3');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const crypto = require('crypto');

async function processUnprocessedDocuments(targetBroadcasts = 10) {
    console.log(`🚀 Processing documents until we create ${targetBroadcasts} valid broadcasts...`);

    const db = new Database('./agent/data/db.sqlite');

    try {
        let processed = 0;
        let failed = 0;
        let documentsReviewed = 0;
        const maxDocumentsToReview = 100; // Safety limit to prevent infinite loops

        while (processed < targetBroadcasts && documentsReviewed < maxDocumentsToReview) {
            // Find next batch of unprocessed documents, prioritizing tech/AI content
            const unprocessedDocs = db.prepare(`
                SELECT m.* FROM memories m
                WHERE m.type = 'documents'
                AND NOT EXISTS (
                    SELECT 1 FROM broadcasts b WHERE b.documentId = m.id
                )
                AND json_extract(m.content, '$.text') IS NOT NULL
                AND length(json_extract(m.content, '$.text')) > 100
                ORDER BY
                    -- Prioritize sustainability and regeneration content
                    CASE
                        WHEN json_extract(m.content, '$.text') LIKE '%renewable energy%'
                          OR json_extract(m.content, '$.text') LIKE '%sustainable%'
                          OR json_extract(m.content, '$.text') LIKE '%climate tech%'
                          OR json_extract(m.content, '$.text') LIKE '%carbon capture%'
                          OR json_extract(m.content, '$.text') LIKE '%regenerative%'
                          OR json_extract(m.content, '$.text') LIKE '%solar%'
                          OR json_extract(m.content, '$.text') LIKE '%wind power%'
                          OR json_extract(m.content, '$.text') LIKE '%circular economy%'
                          OR json_extract(m.content, '$.text') LIKE '%biodegradable%'
                          OR json_extract(m.content, '$.text') LIKE '%green energy%'
                          OR json_extract(m.content, '$.text') LIKE '%sustainability%'
                          OR json_extract(m.content, '$.text') LIKE '%biomimicry%'
                        THEN 0
                        ELSE 1
                    END,
                    m.createdAt DESC
                LIMIT 20
            `).all();

            if (unprocessedDocs.length === 0) {
                console.log('No more unprocessed documents available');
                break;
            }

            console.log(`\n📚 Reviewing batch of ${unprocessedDocs.length} documents (${processed}/${targetBroadcasts} broadcasts created so far)`);

            for (const doc of unprocessedDocs) {
                if (processed >= targetBroadcasts) break;
                documentsReviewed++;
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

                // Calculate alignment score based on content relevance
                const missionKeywords = {
                    // Core mission keywords - sustainability & regeneration (high weight)
                    core: ['renewable energy', 'solar power', 'wind power', 'carbon capture',
                           'climate tech', 'sustainability', 'regenerative', 'biomimicry',
                           'circular economy', 'green energy', 'sustainable materials',
                           'biodegradable', 'carbon negative', 'net zero', 'clean energy'],
                    // Supporting keywords - breakthrough innovations (medium weight)
                    tech: ['breakthrough', 'innovation', 'discovery', 'fusion energy',
                           'vertical farming', 'lab grown', 'cultured meat', 'alternative protein',
                           'energy storage', 'battery', 'hydrogen', 'geothermal'],
                    // Context keywords (low weight)
                    context: ['environment', 'climate', 'energy', 'efficiency', 'reduce emissions',
                             'sustainable', 'ecological', 'conservation']
                };

                const contentLower = (title + ' ' + content.text?.substring(0, 2000)).toLowerCase();

                // Calculate alignment score
                let alignmentScore = 0;
                let coreMatches = 0;
                let techMatches = 0;

                // Check core keywords (0.3 points each, max 0.6)
                for (const keyword of missionKeywords.core) {
                    if (contentLower.includes(keyword)) {
                        coreMatches++;
                        alignmentScore += 0.3;
                        if (alignmentScore >= 0.6) break;
                    }
                }

                // Check tech keywords (0.1 points each, max 0.3)
                for (const keyword of missionKeywords.tech) {
                    if (contentLower.includes(keyword)) {
                        techMatches++;
                        alignmentScore += 0.1;
                        if (alignmentScore >= 0.9) break;
                    }
                }

                // Add context bonus (max 0.1)
                const contextMatches = missionKeywords.context.filter(k => contentLower.includes(k)).length;
                alignmentScore += Math.min(contextMatches * 0.02, 0.1);

                // Cap at 1.0
                alignmentScore = Math.min(alignmentScore, 1.0);

                // Skip if alignment too low
                if (alignmentScore < 0.3) {  // 30% minimum alignment for quality control
                    console.log(`   ⏭️  Skipped (alignment score: ${(alignmentScore * 100).toFixed(0)}%)`);
                    failed++;
                    continue;
                }

                // Skip non-aligned content (politics, strikes, non-tech news)
                const excludeKeywords = ['strike', 'protest', 'election', 'politician', 'guerra',
                                        'συλλαλητήρια', 'murder', 'war', 'battle', 'gaza', 'ukraine conflict',
                                        'museum', 'archaeological', 'george washington', 'tempi'];
                const hasExcludedContent = excludeKeywords.some(keyword => contentLower.includes(keyword));

                if (hasExcludedContent) {
                    console.log('   ⏭️  Skipped (contains excluded topics)');
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

                // Clean content before generating broadcast
                let cleanContent = content.text || '';
                // Remove metadata lines that shouldn't be in broadcasts
                cleanContent = cleanContent
                    .replace(/_Generated on [^\n]+_\n?/g, '')
                    .replace(/\*\*Topic:\*\* [^\n]+\n?/g, '')
                    .replace(/## Notes\n- \n?/g, '')
                    .substring(0, 2000);

                // Generate broadcast using Ollama
                const prompt = `You are AI10BRO, tracking breakthrough innovations for planetary regeneration. Write with enthusiasm and wonder.

TASK: Generate ONLY the broadcast text. Make it EXCITING and SHAREABLE.

CONTENT TO ANALYZE:
${cleanContent}

WRITING PRINCIPLES:
- Make people FEEL something (hope, amazement, urgency)
- Use vivid, sensory language that paints a picture
- Connect to human experiences and emotions
- Be conversational, not academic

CHOOSE ONE HOOK STYLE:
1. Mind-blowing fact: "Holy shit, scientists just grew concrete that HEALS ITSELF..."
2. Personal impact: "Imagine never paying for electricity again. This solar paint..."
3. Urgent opportunity: "🚨 This changes everything: fusion energy just became..."
4. Provocative question: "What if plastic could disappear in 30 days? These enzymes..."
5. Surprising comparison: "This battery stores energy like a bear stores fat for winter..."
6. Future glimpse: "Your grandkids will live in buildings that breathe. Here's how..."
7. David vs Goliath: "Three students just outsmarted the oil industry with algae..."

STRUCTURE:
1. Hook (grab attention instantly)
2. Wow factor (the breakthrough + why it matters)
3. Real impact (what changes for people/planet)
4. Call to action (learn more, share, engage)

TONE VARIATIONS TO MIX:
- Excited scientist: "This is it! The breakthrough we've been waiting for..."
- Storyteller: "Picture this: cities that eat pollution..."
- Rebel: "While politicians debate, hackers just open-sourced..."
- Visionary: "We're not just solving climate change, we're..."
- Connector: "Remember when solar was expensive? Well..."

LENGTH: 400-600 characters

EXAMPLES OF ENGAGING BROADCASTS:
"🤯 Mushroom leather just killed the cow industry's monopoly. Grows in 2 weeks, feels identical, costs 40% less. Hermès is already using it. The future of fashion is literally underground. See it: mylo-unleather.com"

"Your next house might be grown, not built. Bio-concrete with limestone-producing bacteria repairs its own cracks, lasts 200+ years. Dutch bridges already self-healing. Watch: youtu.be/biomason"

"Plot twist: CO2 is now worth $1000/ton. New reactor turns it into jet fuel cheaper than drilling. United Airlines just ordered 1.5B gallons. The sky's no longer the limit. Details: lanzajet.com"

"Scientists weaponized algae against plastic 🦠 New strain eats PET bottles in 6 weeks, leaves only water and CO2. Found thriving at a recycling plant in Japan. Nature's fighting back. Read: nature.com/plastic-eating"

"Vertical farms using 95% less water just made food deserts history. Pink LED spectrum grows lettuce 2x faster. NYC school cafeterias now hyperlocal. Your food, grown in your neighborhood: plenty.ag"

OUTPUT YOUR BROADCAST NOW (no labels, just the engaging text):`;

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
                        alignmentScore,
                        Date.now()
                    );

                    console.log(`✅ Created ${platform} broadcast: ${broadcastId} (${platformContent.length} chars, alignment: ${(alignmentScore * 100).toFixed(0)}%)`);
                }

                console.log(`   📊 Overall alignment score: ${(alignmentScore * 100).toFixed(0)}%`);
                processed++;

            } catch (error) {
                console.error(`❌ Failed to process document: ${error.message}`);
                failed++;
            }
            }  // End of for loop
        }  // End of while loop

        console.log(`\n📊 Summary:`);
        console.log(`   Documents reviewed: ${documentsReviewed}`);
        console.log(`   Broadcasts created: ${processed}`);
        console.log(`   Documents skipped: ${failed}`);
        
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
    const targetBroadcasts = process.argv[2] ? parseInt(process.argv[2]) : 10;
    processUnprocessedDocuments(targetBroadcasts).catch(console.error);
}

module.exports = { processUnprocessedDocuments };