#!/usr/bin/env node

require('dotenv').config();
const Database = require('better-sqlite3');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const crypto = require('crypto');

// OpenRouter API integration for high-quality broadcast generation
async function generateBroadcastWithOpenRouter(prompt) {
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL || 'nousresearch/hermes-3-llama-3.1-405b';

    if (!OPENROUTER_API_KEY) {
        console.log('⚠️  No OpenRouter API key found, falling back to local ollama');
        // Fallback to ollama
        const tempFile = `/tmp/broadcast-${Date.now()}.txt`;
        require('fs').writeFileSync(tempFile, prompt);
        const { stdout } = await execPromise(`ollama run qwen2.5:14b < ${tempFile}`);
        require('fs').unlinkSync(tempFile);
        return stdout.trim();
    }

    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'X-Title': 'Eliza AI10BRO Broadcast Generation'
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert content creator specializing in engaging, professional broadcasts about technology and sustainability. Create compelling content that connects academic findings to real-world impact and market trends.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 800,
                temperature: 0.7
            })
        });

        const data = await response.json();

        if (data.choices && data.choices[0] && data.choices[0].message) {
            return data.choices[0].message.content.trim();
        } else {
            console.log('⚠️  OpenRouter response error, falling back to ollama');
            console.log('Response:', JSON.stringify(data, null, 2));
            // Fallback to ollama
            const tempFile = `/tmp/broadcast-${Date.now()}.txt`;
            require('fs').writeFileSync(tempFile, prompt);
            const { stdout } = await execPromise(`ollama run qwen2.5:14b < ${tempFile}`);
            require('fs').unlinkSync(tempFile);
            return stdout.trim();
        }
    } catch (error) {
        console.log('⚠️  OpenRouter API error, falling back to ollama:', error.message);
        // Fallback to ollama
        const tempFile = `/tmp/broadcast-${Date.now()}.txt`;
        require('fs').writeFileSync(tempFile, prompt);
        const { stdout } = await execPromise(`ollama run qwen2.5:14b < ${tempFile}`);
        require('fs').unlinkSync(tempFile);
        return stdout.trim();
    }
}

async function processUnprocessedDocuments(targetBroadcasts = 10) {
    console.log(`🚀 Processing documents until we create ${targetBroadcasts} valid broadcasts...`);

    const db = new Database('./agent/data/db.sqlite');

    try {
        let processed = 0;
        let failed = 0;
        let documentsReviewed = 0;
        const maxDocumentsToReview = 100; // Safety limit to prevent infinite loops
        const processedDocumentIds = new Set(); // Track documents we've already tried

        // Load refined alignment keywords based on Obsidian document analysis
        const alignmentConfig = require('./alignment-keywords-refined.json');

        // Define mission keywords based on analyzed themes
        const missionKeywords = {
            // Core themes from Obsidian analysis (weighted by frequency)
            aiComputing: alignmentConfig.themes.ai_computing.keywords,
            innovationMarkets: alignmentConfig.themes.innovation_markets.keywords,
            syntheticBiology: alignmentConfig.themes.synthetic_biology.keywords,
            healthMedicine: alignmentConfig.themes.health_medicine.keywords,
            cleanEnergy: alignmentConfig.themes.clean_energy.keywords,
            materials: alignmentConfig.themes.advanced_materials.keywords,
            agriculture: alignmentConfig.themes.agriculture_food.keywords
        };

        while (processed < targetBroadcasts && documentsReviewed < maxDocumentsToReview) {
            // Find next batch of unprocessed documents WITH HIGH ALIGNMENT SCORES
            const unprocessedDocs = db.prepare(`
                SELECT m.* FROM memories m
                WHERE m.type = 'documents'
                AND NOT EXISTS (
                    SELECT 1 FROM broadcasts b WHERE b.documentId = m.id
                )
                AND json_extract(m.content, '$.text') IS NOT NULL
                AND length(json_extract(m.content, '$.text')) > 200
                AND m.alignment_score >= ?
                ORDER BY
                    -- Prioritize Obsidian documents first
                    CASE
                        WHEN json_extract(m.content, '$.source') = 'obsidian' THEN 0
                        ELSE 1
                    END,
                    -- Then by alignment score
                    m.alignment_score DESC,
                    m.createdAt DESC
                LIMIT 20
            `).all(alignmentConfig.scoring_recommendations?.core_alignment_minimum || 0.08)
            .filter(doc => !processedDocumentIds.has(doc.id)); // Skip documents we've already tried

            if (unprocessedDocs.length === 0) {
                console.log('No more unprocessed documents available');
                break;
            }

            console.log(`\n📚 Reviewing batch of ${unprocessedDocs.length} documents (${processed}/${targetBroadcasts} broadcasts created so far)`);

            for (const doc of unprocessedDocs) {
                if (processed >= targetBroadcasts) break;
                documentsReviewed++;
                processedDocumentIds.add(doc.id); // Mark as tried
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
                const contentLower = (title + ' ' + content.text?.substring(0, 2000)).toLowerCase();

                // Calculate alignment score based on theme matches
                let alignmentScore = 0;
                let themeScores = {};

                // Check each theme and apply weighted scoring
                Object.entries(alignmentConfig.themes).forEach(([theme, config]) => {
                    let themeMatches = 0;
                    const keywords = missionKeywords[theme.replace(/_([a-z])/g, (m, p1) => p1.toUpperCase())];

                    if (keywords) {
                        keywords.forEach(keyword => {
                            if (contentLower.includes(keyword.toLowerCase())) {
                                themeMatches++;
                            }
                        });

                        // Calculate theme score (normalized by keyword count)
                        const themeScore = Math.min(themeMatches / keywords.length, 1.0) * config.weight;
                        themeScores[theme] = themeScore;
                        alignmentScore += themeScore;
                    }
                });

                // Check source quality for bonus
                let sourceBonus = 1.0;

                // Obsidian documents get highest priority (manually curated)
                if (content.source === 'obsidian') {
                    sourceBonus = alignmentConfig.scoring_recommendations.source_quality_multiplier.obsidian || 4.0;
                } else {
                    const sourceMatch = content.source?.match(/https?:\/\/([^\/]+)/);
                    if (sourceMatch) {
                        const domain = sourceMatch[1].replace('www.', '');
                        if (alignmentConfig.source_quality_indicators.premium_sources.includes(domain)) {
                            sourceBonus = 1.3;
                        } else if (alignmentConfig.source_quality_indicators.trusted_sources.includes(domain)) {
                            sourceBonus = 1.15;
                        } else if (alignmentConfig.source_quality_indicators.industry_sources.includes(domain)) {
                            sourceBonus = 1.1;
                        }
                    }
                }

                // Apply source quality multiplier
                alignmentScore *= sourceBonus;

                // Ensure Obsidian documents always pass (manually curated)
                if (content.source === 'obsidian') {
                    alignmentScore = Math.max(alignmentScore, 0.35); // Minimum 35% for Obsidian (HIGH threshold is 30%)
                }

                // Boost for multiple strong themes
                const strongThemes = Object.values(themeScores).filter(score => score > 0.1).length;
                if (strongThemes >= 3) {
                    alignmentScore *= 1.15; // 15% boost for interdisciplinary content
                }

                // Cap at 1.0
                alignmentScore = Math.min(alignmentScore, 1.0);

                // Skip if alignment too low (using refined threshold)
                if (alignmentScore < alignmentConfig.scoring_recommendations.core_alignment_minimum) {
                    console.log(`   ⏭️  Skipped (alignment score: ${(alignmentScore * 100).toFixed(0)}% < ${(alignmentConfig.scoring_recommendations.core_alignment_minimum * 100).toFixed(0)}%)`);
                    failed++;
                    continue;
                }

                // Skip non-aligned content (politics, strikes, non-tech news)
                // Use word boundaries to avoid false matches (e.g., "software" matching "war")
                const excludePatterns = [
                    /\bstrike action\b/i, /\bprotest\b/i, /\belection\b/i, /\bpolitician\b/i,
                    /\bguerra\b/i, /συλλαλητήρια/i, /\bmurder\b/i, /\bwar\b/i, /\bbattle\b/i,
                    /\bgaza\b/i, /\bukraine conflict\b/i, /\bmuseum\b/i, /\barchaeological\b/i,
                    /\bgeorge washington\b/i, /\btempi\b/i
                ];
                const matchedKeywords = excludePatterns.filter(pattern => pattern.test(contentLower)).map(p => p.source);
                const hasExcludedContent = matchedKeywords.length > 0;

                if (hasExcludedContent) {
                    console.log(`   ⏭️  Skipped (contains excluded topics: ${matchedKeywords.join(', ')})`);
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

                // Load tech trends for context
                const trends = JSON.parse(require('fs').readFileSync('./tech-trends-2025.json', 'utf8'));

                // Find relevant megatrend based on content
                let relevantTrend = null;
                let trendConnection = '';
                for (const [key, trend] of Object.entries(trends.megatrends)) {
                    const hasKeyword = trend.related_keywords.some(kw =>
                        contentLower.includes(kw.toLowerCase())
                    );
                    if (hasKeyword) {
                        relevantTrend = trend;
                        trendConnection = `This connects to: ${trend.name} - ${trend.description}`;
                        break;
                    }
                }

                // Generate broadcast using Ollama
                const prompt = `You are AI10BRO, tracking innovations in technology and sustainability. Write informatively with measured optimism.

TASK: Generate ONLY the broadcast text. Be INFORMATIVE and FACTUAL.

CONTENT TO ANALYZE:
${cleanContent}

${relevantTrend ? `TREND CONTEXT:
This development is part of "${relevantTrend.name}"
- ${relevantTrend.description}
- Market size: ${relevantTrend.key_metrics.market_size || 'Growing'}
- Key milestone: ${Object.entries(relevantTrend.milestones)[0] ? `${Object.entries(relevantTrend.milestones)[0][0]}: ${Object.entries(relevantTrend.milestones)[0][1]}` : ''}

USE THIS CONTEXT TO:
- Connect the finding to real-world applications
- Reference the broader trend it's part of
- Show progress toward key milestones
- Mention market size or investment when relevant
` : ''}

WRITING PRINCIPLES:
- Be factual and specific, avoid hyperbole
- Lead with what's new or different
- Include numbers and data when available
- Focus on practical implications
- Use clear, professional language

AVOID:
- Words like "breakthrough", "revolutionary", "game-changing"
- Excessive exclamation points or emojis
- "Big news" or "Alert" style openings
- Overly dramatic language
- "Imagine" or "Picture this" openings

VARY YOUR STYLE - use ONE of these patterns:
- Research update: Present the finding and its significance
- Technical achievement: Focus on the innovation details
- Market development: Highlight business and investment angles
- Progress marker: Show advancement toward goals
- Innovation application: Emphasize practical uses
- Industry shift: Describe sector transformation
- Cost improvement: Lead with economic benefits
- Scale milestone: Focus on growth metrics

STRUCTURE:
1. Lead (what's new)
2. Details (how it works/what was achieved)
3. Impact (practical applications)
4. Context (market/trend connection)

TONE VARIATIONS TO MIX:
- Optimistic: "Major breakthrough brings us closer to..."
- Narrative: "Picture this: cities that actively clean the air..."
- Progress-focused: "While others debate, researchers just delivered..."
- Impact-driven: "This doesn't just solve problems, it creates opportunities..."
- Contextual: "Remember when solar seemed impossible? This follows that path..."

LENGTH: 400-600 characters

HOW TO LADDER UP ACADEMIC FINDINGS:
- Small efficiency gain → "Pushes us closer to grid parity/commercial viability"
- New material property → "Could unlock the $X billion market"
- Lab demonstration → "Proves the physics for next-gen technology"
- Cost reduction → "Makes this accessible to billions, not millions"
- Speed improvement → "Compresses the timeline from decades to years"

TREND CONNECTIONS (use even without exact match):
- Energy findings → "$1.8 trillion energy transition accelerating"
- Materials science → "$4.5 trillion circular economy by 2030"
- Carbon research → "Race to $1 trillion carbon removal market"
- Biology/biotech → "The Biology Century - 40% of manufacturing by 2040"
- Agriculture → "Feeding 10 billion while healing the planet"

EXAMPLES OF ENGAGING BROADCASTS WITH VARIED HOOKS:
"Mushroom leather reaches price parity with cowhide 2 years ahead of schedule. Part of the $4.5T circular economy shift. Grows in 2 weeks, costs 40% less than traditional leather. Hermès already manufacturing with it."

"Dutch bridges now test bio-concrete that heals its own cracks. Brings us closer to the 2028 milestone of self-repairing infrastructure. Part of the $2T climate adaptation market. Buildings that literally grow stronger over time."

"CO2-to-jet-fuel costs just dropped below $100/ton - cheaper than drilling oil. United Airlines committed to 1.5B gallons as the $1 trillion carbon removal market accelerates. Aviation economics are about to flip."

"Recycling plant discovers algae strain that dissolves PET bottles in 6 weeks. Natural waste management system now scaled for industry as the circular economy's $4.5T potential becomes reality."

"NYC schools grow hyperlocal food using 95% less water through vertical farming. Validates regenerative agriculture's promise to feed 10B people while sequestering 5Gt CO2/year."

NOTE: Do NOT include source URLs, links, or "Details:" lines in your output. These will be added automatically.

OUTPUT YOUR BROADCAST NOW (no labels, just the engaging text):`;

                // Use OpenRouter for high-quality broadcast generation
                let generated = await generateBroadcastWithOpenRouter(prompt);

                // Remove quotes if the LLM wrapped the response in them
                if (generated.startsWith('"') && generated.endsWith('"')) {
                    generated = generated.slice(1, -1);
                }
                if (generated.startsWith("'") && generated.endsWith("'")) {
                    generated = generated.slice(1, -1);
                }

                // Handle any escaped quotes
                generated = generated.replace(/\\"/g, '"');

                // Strip any "Details:", "Watch:", "Read:", etc. lines the model may have added
                // These will be replaced with proper source URLs
                generated = generated.replace(/\s*(Details|Watch|Read|Learn more|More info|Full story|Source):\s*[^\n]+$/i, '');
                generated = generated.replace(/\s*🔗\s*Source:\s*[^\n]+$/i, '');

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
                    // Look for common academic/news sources first
                    const allUrls = content.text?.match(/https?:\/\/[^\s\)]+/g) || [];
                    const externalUrl = allUrls.find(url => !url.includes('github.com/divydovy'));
                    sourceUrl = externalUrl || null;
                }

                // Clean URL: strip query parameters (utm_source, etc.)
                if (sourceUrl && sourceUrl.startsWith('http')) {
                    try {
                        const urlObj = new URL(sourceUrl);
                        sourceUrl = urlObj.origin + urlObj.pathname;
                    } catch (e) {
                        // If URL parsing fails, use original
                    }
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