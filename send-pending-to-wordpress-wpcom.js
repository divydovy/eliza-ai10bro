#!/usr/bin/env node

/**
 * WordPress.com API Publishing Script
 * Uses WordPress.com OAuth API instead of REST API
 */

const sqlite3 = require('better-sqlite3');
const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execPromise = promisify(exec);

require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.wordpress' });

// WordPress.com OAuth Configuration
const WPCOM_ACCESS_TOKEN = process.env.WPCOM_ACCESS_TOKEN;
const WPCOM_SITE_ID = process.env.WPCOM_SITE_ID || 'ai10bro.com';
const WPCOM_API_BASE = 'https://public-api.wordpress.com/rest/v1.1';

// Bio theme mapping
const BIO_THEME_MAP = {
  'biomimicry': 2,
  'synbio': 3,
  'materials': 4,
  'energy': 5,
  'agtech': 6,
  'health': 7,
  'ai': 8,
  'innovation': 9,
  'environment': 10,
  'space': 11,
  'manufacturing': 12,
};

// Content type mapping
const CONTENT_TYPE_MAP = {
    'wordpress_insight': 'insight',
    'wordpress_deepdive': 'analysis'
};

const CLIENT_FILTER = process.env.CLIENT || 'wordpress_insight';
const BROADCAST_ID_FILTER = process.env.BROADCAST_ID || null;
const ENABLE_IMAGE_GENERATION = process.env.ENABLE_IMAGE_GENERATION || 'false';

if (!WPCOM_ACCESS_TOKEN) {
    console.error('❌ ERROR: WPCOM_ACCESS_TOKEN not found in .env.wordpress');
    console.log('\nRun: node wordpress-oauth-auth.js\n');
    process.exit(1);
}

/**
 * Extract bio theme from document content
 */
function extractBioTheme(documentContent) {
    try {
        const content = typeof documentContent === 'string' ? documentContent : JSON.stringify(documentContent);
        const contentLower = content.toLowerCase();

        // Check YAML frontmatter category
        const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (yamlMatch) {
            const frontmatter = yamlMatch[1];
            const categoryMatch = frontmatter.match(/category:\s*(\w+)/);
            if (categoryMatch) {
                const category = categoryMatch[1].toLowerCase();
                const categoryMap = {
                    'microbiology': 'synbio',
                    'biotechnology': 'synbio',
                    'materials': 'materials',
                    'energy': 'energy',
                    'agriculture': 'agtech',
                    'medicine': 'health',
                    'health': 'health',
                    'ai': 'ai',
                    'artificial intelligence': 'ai'
                };
                return categoryMap[category] || 'innovation';
            }
        }

        // Theme keyword detection
        if (contentLower.includes('synthetic biology') || contentLower.includes('crispr') || contentLower.includes('gene editing')) return 'synbio';
        if (contentLower.includes('biomimicry') || contentLower.includes('bio-inspired')) return 'biomimicry';
        if (contentLower.includes('biomaterial') || contentLower.includes('bio-plastic') || contentLower.includes('sustainable material')) return 'materials';
        if (contentLower.includes('biofuel') || contentLower.includes('renewable energy') || contentLower.includes('bio-energy')) return 'energy';
        if (contentLower.includes('agriculture') || contentLower.includes('crop') || contentLower.includes('farming')) return 'agtech';
        if (contentLower.includes('medicine') || contentLower.includes('therapy') || contentLower.includes('drug')) return 'health';
        if (contentLower.includes('artificial intelligence') || contentLower.includes('machine learning') || contentLower.includes('neural network')) return 'ai';
        if (contentLower.includes('climate') || contentLower.includes('carbon') || contentLower.includes('ecosystem')) return 'environment';
        if (contentLower.includes('space') || contentLower.includes('astrobiology') || contentLower.includes('extraterrestrial')) return 'space';
        if (contentLower.includes('biomanufacturing') || contentLower.includes('bioprocess') || contentLower.includes('fermentation')) return 'manufacturing';

        return 'innovation';
    } catch (error) {
        console.error('Error extracting bio theme:', error);
        return 'innovation';
    }
}

/**
 * Upload image to WordPress.com using OAuth API
 */
async function uploadImageWpcom(imagePath, title) {
    try {
        console.log(`  📤 Uploading image: ${path.basename(imagePath)}`);

        const form = new FormData();
        form.append('media[]', fs.createReadStream(imagePath));

        const response = await fetch(`${WPCOM_API_BASE}/sites/${WPCOM_SITE_ID}/media/new`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${WPCOM_ACCESS_TOKEN}`,
                ...form.getHeaders()
            },
            body: form
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Upload failed (${response.status}): ${errorText}`);
        }

        const data = await response.json();

        if (data.media && data.media[0]) {
            console.log(`  ✅ Image uploaded: ID ${data.media[0].ID}`);
            return data.media[0].ID;
        }

        throw new Error('No media ID returned');

    } catch (error) {
        console.error(`  ❌ Image upload failed: ${error.message}`);
        return null;
    }
}

/**
 * Create WordPress post using WordPress.com OAuth API
 */
async function createPostWpcom(article, bioTheme, alignmentScore, sourceUrl, featuredMediaId, publishStatus, clientType) {
    try {
        const postType = CONTENT_TYPE_MAP[clientType] || 'insight';

        const postData = {
            title: article.title,
            content: article.content,
            excerpt: article.excerpt,
            status: publishStatus || 'publish',
            type: postType,
            featured_image: featuredMediaId || undefined,
            metadata: [
                { key: 'bio_theme', value: BIO_THEME_MAP[bioTheme] || BIO_THEME_MAP['innovation'] },
                { key: 'alignment_score', value: alignmentScore.toFixed(3) },
                { key: 'source_url', value: sourceUrl || '' },
                { key: 'is_featured', value: 'false' }
            ]
        };

        console.log(`  📝 Creating ${postType} post: "${article.title}"`);

        const response = await fetch(`${WPCOM_API_BASE}/sites/${WPCOM_SITE_ID}/posts/new`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${WPCOM_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(postData)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Post creation failed (${response.status}): ${errorText}`);
        }

        const post = await response.json();

        console.log(`  ✅ Post created: ${post.URL}`);
        return post;

    } catch (error) {
        console.error(`  ❌ Post creation failed: ${error.message}`);
        throw error;
    }
}

/**
 * Generate image using Gemini if needed
 */
async function generateImageIfNeeded(broadcast, documentContent) {
    if (broadcast.image_url) {
        return broadcast.image_url;
    }

    if (ENABLE_IMAGE_GENERATION !== 'true') {
        return null;
    }

    try {
        console.log('  🎨 Generating image with Gemini...');

        const content = typeof documentContent === 'string' ? documentContent : JSON.stringify(documentContent);
        const title = content.match(/title:\s*(.+)/)?.[1] || 'biotechnology breakthrough';

        const prompt = `${title}, scientific illustration style, biotechnology theme, high quality, professional`;
        const outputPath = `broadcast-images/broadcast-${broadcast.id}.png`;

        await execPromise(
            `cd ~/.claude/plugins/cache/every-marketplace/compounding-engineering/2.8.1/skills/gemini-imagegen && ` +
            `python3 scripts/generate_image.py "${prompt}" "${path.resolve(outputPath)}"`
        );

        if (fs.existsSync(outputPath)) {
            console.log(`  ✅ Image generated: ${outputPath}`);

            // Update ALL broadcasts for this documentId
            const db = sqlite3(path.join(__dirname, 'agent/data/db.sqlite'));
            db.prepare(`
                UPDATE broadcasts
                SET image_url = ?
                WHERE documentId = ? AND image_url IS NULL
            `).run(path.resolve(outputPath), broadcast.documentId);
            db.close();

            return path.resolve(outputPath);
        }

        return null;

    } catch (error) {
        console.error(`  ⚠️  Image generation failed: ${error.message}`);
        return null;
    }
}

/**
 * Main publishing function
 */
async function publishPendingBroadcasts() {
    const db = sqlite3(path.join(__dirname, 'agent/data/db.sqlite'));

    console.log('🚀 WordPress.com Publishing System (OAuth API)\n');
    console.log(`📊 Site: ${WPCOM_SITE_ID}`);
    console.log(`🎯 Client filter: ${CLIENT_FILTER}\n`);

    let pendingBroadcasts;

    if (BROADCAST_ID_FILTER) {
        pendingBroadcasts = db.prepare(`
            SELECT id, documentId, content, image_url, alignment_score, client
            FROM broadcasts
            WHERE id = ? AND status = 'pending'
        `).all(BROADCAST_ID_FILTER);

        if (pendingBroadcasts.length === 0) {
            console.log(`❌ No pending broadcast found with ID: ${BROADCAST_ID_FILTER}`);
            db.close();
            return;
        }
    } else {
        const limit = CLIENT_FILTER === 'wordpress_deepdive' ? 2 : 9;

        pendingBroadcasts = db.prepare(`
            SELECT id, documentId, content, image_url, alignment_score, client
            FROM broadcasts
            WHERE status = 'pending'
            AND client = ?
            ORDER BY alignment_score DESC, createdAt ASC
            LIMIT ?
        `).all(CLIENT_FILTER, limit);
    }

    if (pendingBroadcasts.length === 0) {
        console.log(`✅ No pending broadcasts for ${CLIENT_FILTER}`);
        db.close();
        return;
    }

    console.log(`📦 Found ${pendingBroadcasts.length} pending broadcast(s)\n`);

    let successCount = 0;
    let failCount = 0;

    for (const broadcast of pendingBroadcasts) {
        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`📄 Broadcast ID: ${broadcast.id}`);
        console.log(`📈 Alignment Score: ${(broadcast.alignment_score * 100).toFixed(1)}%`);

        try {
            // Parse broadcast content
            let broadcastContent = JSON.parse(broadcast.content);
            let article = broadcastContent;

            if (!article.title || !article.content) {
                throw new Error('Missing title or content in broadcast');
            }

            const publishStatus = broadcastContent.publish_status || 'publish';

            // Get source document
            const sourceDoc = db.prepare(`
                SELECT content FROM memories WHERE id = ? AND type = 'documents'
            `).get(broadcast.documentId);

            if (!sourceDoc) {
                throw new Error('Source document not found');
            }

            const documentContent = JSON.parse(sourceDoc.content);
            const bioTheme = extractBioTheme(documentContent);
            const sourceUrl = documentContent.source || documentContent.url || '';

            console.log(`  🏷️  Bio Theme: ${bioTheme}`);
            console.log(`  📎 Source: ${sourceUrl ? sourceUrl.substring(0, 60) + '...' : 'N/A'}`);

            // Generate/get image
            const imagePath = await generateImageIfNeeded(broadcast, documentContent);
            let featuredMediaId = null;

            if (imagePath && fs.existsSync(imagePath)) {
                featuredMediaId = await uploadImageWpcom(imagePath, article.title);
            }

            // Create post
            const post = await createPostWpcom(
                article,
                bioTheme,
                broadcast.alignment_score,
                sourceUrl,
                featuredMediaId,
                publishStatus,
                broadcast.client
            );

            // Mark as sent
            db.prepare(`
                UPDATE broadcasts
                SET status = 'sent',
                    sentAt = ?,
                    platform_post_id = ?
                WHERE id = ?
            `).run(new Date().toISOString(), String(post.ID), broadcast.id);

            console.log(`  ✅ Broadcast marked as sent`);
            successCount++;

        } catch (error) {
            console.error(`  ❌ Failed to publish: ${error.message}`);
            failCount++;
        }
    }

    db.close();

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`\n📊 Summary:`);
    console.log(`  ✅ Successful: ${successCount}`);
    console.log(`  ❌ Failed: ${failCount}`);
    console.log(`  📦 Total processed: ${successCount + failCount}`);
}

// Run
publishPendingBroadcasts().catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
});
