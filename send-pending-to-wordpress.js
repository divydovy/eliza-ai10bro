#!/usr/bin/env node

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

// Bio theme mapping (from ELIZA_AGENT_GUIDE.md)
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
                };
                if (categoryMap[category]) return categoryMap[category];
            }
        }

        // Keyword matching
        if (contentLower.includes('synthetic biology') || contentLower.includes('bioengineering')) return 'synbio';
        if (contentLower.includes('material')) return 'materials';
        if (contentLower.includes('energy') || contentLower.includes('battery')) return 'energy';
        if (contentLower.includes('agriculture') || contentLower.includes('farming')) return 'agtech';
        if (contentLower.includes('medicine') || contentLower.includes('therapeutic')) return 'health';

        return 'innovation'; // default
    } catch (error) {
        return 'innovation';
    }
}

/**
 * Extract source URL from document content
 */
function extractSourceUrl(documentContent) {
    try {
        const content = typeof documentContent === 'string' ? documentContent : JSON.stringify(documentContent);

        // Check YAML frontmatter
        const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (yamlMatch) {
            const sourceMatch = yamlMatch[1].match(/source:\s*(https?:\/\/[^\s]+)/);
            if (sourceMatch) return sourceMatch[1];

            const doiMatch = yamlMatch[1].match(/doi:\s*["']?(10\.\d+\/[^\s"']+)["']?/);
            if (doiMatch) return `https://doi.org/${doiMatch[1]}`;
        }

        // Find first URL in content
        const urlMatch = content.match(/https?:\/\/[^\s<)]+/);
        if (urlMatch) return urlMatch[0];

        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Upload image to WordPress
 */
async function uploadImage(imagePath, title, auth, baseUrl) {
    const form = new FormData();
    form.append('file', fs.createReadStream(imagePath));
    form.append('title', title);
    form.append('alt_text', title);

    const response = await fetch(`${baseUrl}/wp-json/wp/v2/media`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${auth}` },
        body: form
    });

    if (!response.ok) {
        throw new Error(`Image upload failed: ${response.status}`);
    }

    const data = await response.json();
    return data.id;
}

/**
 * Create WordPress post
 */
async function createPost(article, bioTheme, alignmentScore, sourceUrl, featuredMediaId, auth, baseUrl, publishStatus = 'publish') {
    const postData = {
        title: article.title,
        content: article.content,
        excerpt: article.excerpt,
        status: publishStatus,
        bio_theme: [BIO_THEME_MAP[bioTheme] || BIO_THEME_MAP['innovation']],
        featured_media: featuredMediaId || undefined,
        meta: {
            alignment_score: alignmentScore.toFixed(3),
            source_url: sourceUrl || '',
            is_featured: false
        }
    };

    const response = await fetch(`${baseUrl}/wp-json/wp/v2/insight`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(postData)
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Post creation failed: ${response.status} ${error}`);
    }

    return response.json();
}

/**
 * Send pending WordPress broadcasts
 */
async function sendPendingBroadcasts() {
    const WP_BASE_URL = process.env.WP_BASE_URL || 'http://localhost:8885';
    const WP_USERNAME = process.env.WP_USERNAME || 'admin';
    const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD;
    const CLIENT_FILTER = process.env.CLIENT || 'wordpress_insight'; // Default to insights

    if (!WP_APP_PASSWORD) {
        throw new Error('WP_APP_PASSWORD not configured in .env.wordpress');
    }

    const auth = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString('base64');

    // Open database
    const dbPath = path.join(process.cwd(), 'agent/data/db.sqlite');
    const db = sqlite3(dbPath);

    console.log(`📤 Checking for pending ${CLIENT_FILTER} broadcasts...`);

    // Get pending broadcasts
    let pendingBroadcasts;
    if (process.env.BROADCAST_ID) {
        pendingBroadcasts = db.prepare(`
            SELECT id, documentId, content, image_url, alignment_score, client
            FROM broadcasts
            WHERE id = ?
            AND status = 'pending'
            AND client LIKE 'wordpress_%'
        `).all(process.env.BROADCAST_ID);
    } else {
        // Publish 9 articles per run (6 runs/day * 9 = 54 articles/day)
        pendingBroadcasts = db.prepare(`
            SELECT id, documentId, content, image_url, alignment_score, client
            FROM broadcasts
            WHERE status = 'pending'
            AND client = ?
            ORDER BY alignment_score DESC, createdAt ASC
            LIMIT 9
        `).all(CLIENT_FILTER);
    }

    console.log(`   Found ${pendingBroadcasts.length} pending broadcasts`);

    if (pendingBroadcasts.length === 0) {
        console.log('✅ No pending WordPress broadcasts to send');
        db.close();
        return;
    }

    for (const broadcast of pendingBroadcasts) {
        console.log(`\n📝 Publishing ${broadcast.client} broadcast ${broadcast.id.slice(0, 8)}...`);

        try {
            // Parse pre-generated WordPress article
            const article = JSON.parse(broadcast.content);
            console.log(`   Title: "${article.title}"`);
            console.log(`   Type: ${article.type || 'daily_insight'}`);
            console.log(`   Content: ~${article.content.length} chars`);

            // Get source document for metadata
            const doc = db.prepare(`
                SELECT content FROM memories WHERE id = ?
            `).get(broadcast.documentId);

            if (!doc) {
                throw new Error('Source document not found');
            }

            const docContent = JSON.parse(doc.content);

            // Extract bio theme and source URL
            const bioTheme = extractBioTheme(docContent);
            const sourceUrl = extractSourceUrl(docContent);

            console.log(`   Bio theme: ${bioTheme}`);
            console.log(`   Source: ${sourceUrl || 'none'}`);

            // Just-in-time image generation (if not already generated)
            if (!broadcast.image_url && process.env.ENABLE_IMAGE_GENERATION === 'true' && process.env.GEMINI_API_KEY) {
                try {
                    console.log(`   🎨 Generating image on-the-fly...`);

                    // Use article title + excerpt for image prompt
                    const textForImage = `${article.title}. ${article.excerpt}`.substring(0, 500);

                    // Generate image using Python script
                    const { stdout } = await execPromise(
                        `python3 generate-broadcast-image-v2.py "${broadcast.documentId}" "${textForImage.replace(/"/g, '\\"')}"`
                    );

                    // Extract image path from output
                    const imageMatch = stdout.match(/Image saved to: (.+\.png)/);
                    if (imageMatch) {
                        const imageUrl = imageMatch[1];
                        console.log(`   ✅ Image generated: ${imageUrl}`);

                        // Update ALL broadcasts for this document with the image
                        db.prepare(`
                            UPDATE broadcasts
                            SET image_url = ?
                            WHERE documentId = ?
                        `).run(imageUrl, broadcast.documentId);

                        // Update local broadcast object
                        broadcast.image_url = imageUrl;
                    }
                } catch (error) {
                    console.log(`   ⚠️  Image generation failed (continuing without image): ${error.message}`);
                }
            }

            // Upload featured image if available
            let featuredMediaId = null;
            if (broadcast.image_url && fs.existsSync(broadcast.image_url)) {
                console.log(`   📷 Uploading featured image...`);
                try {
                    featuredMediaId = await uploadImage(
                        broadcast.image_url,
                        article.title,
                        auth,
                        WP_BASE_URL
                    );
                    console.log(`   ✅ Image uploaded (ID: ${featuredMediaId})`);
                } catch (error) {
                    console.warn(`   ⚠️  Image upload failed: ${error.message}`);
                }
            } else {
                console.log(`   ℹ️  No featured image available`);
            }

            // Create WordPress post
            console.log(`   📤 Creating WordPress post...`);
            const publishStatus = article.publish_status || 'publish';
            const post = await createPost(
                article,
                bioTheme,
                broadcast.alignment_score,
                sourceUrl,
                featuredMediaId,
                auth,
                WP_BASE_URL,
                publishStatus
            );

            console.log(`   ✅ Post ${publishStatus === 'publish' ? 'published' : 'created as draft'}: ${post.link}`);

            // Update broadcast status
            db.prepare(`
                UPDATE broadcasts
                SET status = 'sent', sent_at = ?
                WHERE id = ?
            `).run(Date.now(), broadcast.id);

            console.log(`   ✅ Broadcast marked as sent`);

        } catch (error) {
            console.error(`   ❌ Failed: ${error.message}`);
            // Don't update status on failure - will retry next time
        }
    }

    db.close();
    console.log('\n✅ WordPress publishing complete');
}

// Run
sendPendingBroadcasts().catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
});
