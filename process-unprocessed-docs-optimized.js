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
    console.log(`🚀 Processing HIGH-ALIGNED documents to create ${targetBroadcasts} broadcasts...`);

    const db = new Database('./agent/data/db.sqlite');

    try {
        let processed = 0;
        let failed = 0;
        let documentsReviewed = 0;
        const maxDocumentsToReview = 50; // Lower limit since we're pre-filtering

        // Load refined alignment keywords based on Obsidian document analysis
        const alignmentConfig = require('./alignment-keywords-refined.json');
        const ALIGNMENT_THRESHOLD = alignmentConfig.scoring_recommendations?.core_alignment_minimum || 0.08;

        while (processed < targetBroadcasts && documentsReviewed < maxDocumentsToReview) {
            // Find next batch of unprocessed documents WITH HIGH ALIGNMENT SCORES
            const unprocessedDocs = db.prepare(`
                SELECT m.*, m.alignment_score 
                FROM memories m
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
            `).all(ALIGNMENT_THRESHOLD);

            if (unprocessedDocs.length === 0) {
                console.log('\n⚠️  No more aligned unprocessed documents available');
                console.log(`Only created ${processed} broadcasts out of target ${targetBroadcasts}`);
                break;
            }

            console.log(`\n📚 Found ${unprocessedDocs.length} aligned documents (min score: ${(ALIGNMENT_THRESHOLD * 100).toFixed(0)}%)`);
            console.log(`Progress: ${processed}/${targetBroadcasts} broadcasts created`);

            for (const doc of unprocessedDocs) {
                if (processed >= targetBroadcasts) break;
                documentsReviewed++;
                
                try {
                    const content = JSON.parse(doc.content);
                    const title = content.metadata?.title || content.text?.substring(0, 50) || 'Unknown';
                    const alignmentScore = doc.alignment_score || 0;

                    console.log(`\n📄 Processing: ${title}`);
                    console.log(`   🎯 Alignment: ${(alignmentScore * 100).toFixed(0)}% ${alignmentScore >= 0.3 ? '(HIGH)' : ''}`);

                    // Skip test/draft content
                    if (/\b(test|draft|cache|example|demo)\b/i.test(title) &&
                        !title.includes('arxiv') && !content.text?.includes('arxiv')) {
                        console.log('   ⏭️  Skipped (test/draft content)');
                        failed++;
                        continue;
                    }

                    // Skip excluded topics
                    const contentLower = content.text?.toLowerCase() || '';
                    const excludeKeywords = ['strike action', 'protest march', 'election campaign', 'politician scandal',
                                            'συλλαλητήρια', 'murder case', ' war in ', 'battle of', 'gaza conflict', 'ukraine war',
                                            'museum exhibit', 'archaeological dig', 'george washington', 'tempi crash'];
                    const hasExcludedContent = excludeKeywords.some(keyword => contentLower.includes(keyword));

                    if (hasExcludedContent) {
                        console.log('   ⏭️  Skipped (contains excluded topics)');
                        failed++;
                        continue;
                    }

                    // Clean content before generating broadcast
                    let cleanContent = content.text || '';
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

                    // Generate broadcast using OpenRouter (or ollama fallback)
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
1. Be factual and specific, avoid hyperbole
2. Lead with what's new or different
3. Include numbers and data when available
4. Focus on practical implications
5. Keep under 280 characters for readability

AVOID:
- Words like "breakthrough", "revolutionary", "game-changing"
- Excessive exclamation points or emojis
- "Big news" or "Alert" style openings
- Overly dramatic language

VARY YOUR OPENING - use ONE of these patterns:
1. Research update: "Researchers at MIT develop..."
2. Technical achievement: "New technique achieves 80% efficiency in..."
3. Market development: "$2B invested in carbon capture as..."
4. Progress marker: "Lab-grown meat costs drop 90% with..."
5. Innovation application: "Solar panels that work at night using..."

${content.url ? `Source: ${content.url}` : ''}

OUTPUT ONLY THE BROADCAST TEXT (no title, no metadata):`;

                    console.log('   🤖 Generating broadcast...');
                    let generated = await generateBroadcastWithOpenRouter(prompt);

                    if (!generated || generated.length < 50) {
                        console.log('   ⏭️  Failed to generate quality broadcast');
                        failed++;
                        continue;
                    }

                    // Clean up the generated broadcast
                    generated = generated
                        .replace(/^(Broadcast:|Message:|Text:)/i, '')
                        .replace(/^#+\s*/, '')
                        .replace(/^\*\*.*?\*\*\s*/, '')
                        .trim();

                    // Extract the broadcast message
                    const broadcastLines = generated.split('\n').filter(line => line.trim());
                    const broadcastMessage = broadcastLines[0]; // Take first substantial line

                    if (!broadcastMessage || broadcastMessage.length < 50) {
                        console.log('   ⏭️  Broadcast too short or empty');
                        failed++;
                        continue;
                    }

                    // Create broadcast entries for all platforms
                    const platforms = ['telegram', 'farcaster', 'bluesky'];
                    const insertStmt = db.prepare(`
                        INSERT INTO broadcasts (content, status, client, createdAt, documentId)
                        VALUES (?, 'pending', ?, datetime('now'), ?)
                    `);

                    for (const platform of platforms) {
                        insertStmt.run(broadcastMessage, platform, doc.id);
                    }

                    processed++;
                    console.log(`   ✅ Created broadcast #${processed} (${broadcastMessage.substring(0, 60)}...)`); 
                    console.log(`   📤 Queued for: ${platforms.join(', ')}`);

                } catch (error) {
                    console.error(`   ❌ Error: ${error.message}`);
                    failed++;
                }
            }

            if (processed >= targetBroadcasts) {
                console.log(`\n🎉 Successfully created ${targetBroadcasts} broadcasts!`);
                break;
            }
        }

        // Final summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 SUMMARY:');
        console.log(`✅ Created: ${processed} broadcasts`);
        console.log(`❌ Failed: ${failed} documents`);
        console.log(`📄 Reviewed: ${documentsReviewed} documents total`);

        if (processed < targetBroadcasts) {
            console.log(`\n⚠️  Only created ${processed} broadcasts (target was ${targetBroadcasts})`);
            console.log('Consider running calculate-alignment-scores.js to score more documents');
        }

    } catch (error) {
        console.error('Fatal error:', error);
    } finally {
        db.close();
    }
}

// Run the processor
const targetCount = parseInt(process.argv[2]) || 10;
processUnprocessedDocuments(targetCount).catch(console.error);