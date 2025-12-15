#!/usr/bin/env node

require('dotenv').config();
const Database = require('better-sqlite3');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const crypto = require('crypto');

/**
 * WORDPRESS BACKFILL SCRIPT
 *
 * Purpose: Generate WordPress broadcasts for documents that:
 * 1. Have alignment scores >= 0.20 (WordPress threshold)
 * 2. Already have broadcasts for other platforms (telegram/bluesky/farcaster)
 * 3. Are missing wordpress_insight broadcasts
 *
 * This is a one-off backfill script to add WordPress broadcasts to existing
 * high-quality documents when WordPress is added as a new platform.
 */

// OpenRouter API integration
async function generateBroadcastWithOpenRouter(prompt) {
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL || 'nousresearch/hermes-3-llama-3.1-405b';

    if (!OPENROUTER_API_KEY) {
        console.log('⚠️  No OpenRouter API key found, falling back to local ollama');
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
                'X-Title': 'Eliza AI10BRO WordPress Backfill'
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert content creator specializing in engaging, professional WordPress articles about technology and sustainability. Create compelling long-form content that connects academic findings to real-world impact and market trends.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 3000,  // WordPress needs more tokens for long-form
                temperature: 0.7
            })
        });

        const data = await response.json();

        if (data.choices && data.choices[0] && data.choices[0].message) {
            return data.choices[0].message.content;
        } else {
            throw new Error(`Unexpected OpenRouter response: ${JSON.stringify(data)}`);
        }
    } catch (error) {
        console.log(`⚠️  OpenRouter failed (${error.message}), falling back to local ollama`);
        const tempFile = `/tmp/broadcast-${Date.now()}.txt`;
        require('fs').writeFileSync(tempFile, prompt);
        const { stdout } = await execPromise(`ollama run qwen2.5:14b < ${tempFile}`);
        require('fs').unlinkSync(tempFile);
        return stdout.trim();
    }
}

async function backfillWordPressbroadcasts() {
    const db = new Database('agent/data/db.sqlite');
    const wpPrompts = require('./wordpress-prompts.json');

    try {
        // Find documents that:
        // 1. Have existing broadcasts (for other platforms)
        // 2. Have alignment >= 0.20
        // 3. Don't have wordpress_insight broadcasts yet
        const candidates = db.prepare(`
            SELECT DISTINCT m.id, m.content, m.alignment_score
            FROM memories m
            WHERE m.type = 'documents'
            AND m.alignment_score >= 0.20
            AND EXISTS (
                SELECT 1 FROM broadcasts b
                WHERE b.documentId = m.id
                AND b.client IN ('telegram', 'bluesky', 'farcaster')
            )
            AND NOT EXISTS (
                SELECT 1 FROM broadcasts b
                WHERE b.documentId = m.id
                AND b.client = 'wordpress_insight'
            )
            ORDER BY m.alignment_score DESC
            LIMIT 20
        `).all();

        console.log(`\n🔍 Found ${candidates.length} documents eligible for WordPress backfill\n`);

        if (candidates.length === 0) {
            console.log('✅ All high-quality documents already have WordPress broadcasts!');
            return;
        }

        let generated = 0;
        let skipped = 0;

        for (const doc of candidates) {
            try {
                const content = JSON.parse(doc.content);
                const alignmentScore = doc.alignment_score;

                console.log(`\n📄 Processing document ${doc.id} (alignment: ${(alignmentScore * 100).toFixed(0)}%)`);

                // Clean content for WordPress generation
                const cleanContent = (content.text || '')
                    .substring(0, 3000)
                    .replace(/\s+/g, ' ')
                    .replace(/[^\x20-\x7E]/g, '')
                    .trim();

                if (cleanContent.length < 500) {
                    console.log(`   ⏭️  Skipping: content too short (${cleanContent.length} chars)`);
                    skipped++;
                    continue;
                }

                // Get existing broadcasts to reuse image_url
                const existingBroadcast = db.prepare(`
                    SELECT image_url FROM broadcasts
                    WHERE documentId = ?
                    AND image_url IS NOT NULL
                    LIMIT 1
                `).get(doc.id);

                const imageUrl = existingBroadcast?.image_url || null;

                // Generate WordPress Insight (Daily Insight)
                const promptConfig = wpPrompts.daily_insight;
                console.log(`   📝 Generating ${promptConfig.name} article...`);

                // Prepare prompt
                const wpPrompt = promptConfig.prompt
                    .replace('{document_content}', cleanContent)
                    .replace('{trend_context}', 'No specific trend context available.');

                // Generate article
                let wpArticleRaw = await generateBroadcastWithOpenRouter(wpPrompt);

                // Strip common LLM preambles
                wpArticleRaw = wpArticleRaw.replace(/^Here is the article in the requested JSON format:\s*/i, '');
                wpArticleRaw = wpArticleRaw.replace(/^Here is the JSON:\s*/i, '');
                wpArticleRaw = wpArticleRaw.replace(/^```json\s*/, '').replace(/\s*```$/, '');

                // Parse response
                let wpArticle;
                try {
                    wpArticle = JSON.parse(wpArticleRaw);
                } catch (e) {
                    // Fallback: extract title from first line
                    const lines = wpArticleRaw.split('\n').filter(l => l.trim());
                    const title = lines[0].substring(0, 100).replace(/<[^>]+>/g, '').replace(/^#+\s*/, '');
                    wpArticle = {
                        title: title,
                        excerpt: lines.slice(1, 3).join(' ').substring(0, 160),
                        content: wpArticleRaw
                    };
                }

                // Store as JSON
                const platformContent = JSON.stringify({
                    title: wpArticle.title,
                    excerpt: wpArticle.excerpt,
                    content: wpArticle.content,
                    type: 'daily_insight',
                    publish_status: promptConfig.publish_status
                });

                // Insert broadcast
                const broadcastId = crypto.randomUUID();
                db.prepare(`
                    INSERT INTO broadcasts (id, documentId, client, content, status, alignment_score, image_url, createdAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    broadcastId,
                    doc.id,
                    'wordpress_insight',
                    platformContent,
                    'pending',
                    alignmentScore,
                    imageUrl,
                    Date.now()
                );

                console.log(`   ✅ Generated: "${wpArticle.title}" (~${wpArticle.content.length} chars)`);
                console.log(`   💾 Broadcast ID: ${broadcastId}`);
                generated++;

            } catch (error) {
                console.error(`   ❌ Error processing document ${doc.id}: ${error.message}`);
                skipped++;
            }
        }

        console.log(`\n✨ Backfill complete!`);
        console.log(`   Generated: ${generated} WordPress broadcasts`);
        console.log(`   Skipped: ${skipped} documents`);
        console.log(`\nRun this to publish them:`);
        console.log(`   CLIENT=wordpress_insight node send-pending-to-wordpress.js\n`);

    } catch (error) {
        console.error(`Fatal error: ${error.message}`);
        throw error;
    } finally {
        db.close();
    }
}

// Run backfill
backfillWordPressbroadcasts().catch(err => {
    console.error(err);
    process.exit(1);
});
