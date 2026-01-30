#!/usr/bin/env node

const sqlite3 = require('better-sqlite3');
const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.wordpress' });

// Bio theme mapping
const BIO_THEME_MAP = {
  'biomimicry': 2, 'synbio': 3, 'materials': 4, 'energy': 5, 'agtech': 6,
  'health': 7, 'ai': 8, 'innovation': 9, 'environment': 10, 'space': 11, 'manufacturing': 12,
};

function extractBioTheme(documentContent) {
    try {
        const content = typeof documentContent === 'string' ? documentContent : JSON.stringify(documentContent);
        const contentLower = content.toLowerCase();

        if (contentLower.includes('synthetic biology') || contentLower.includes('bioengineering')) return 'synbio';
        if (contentLower.includes('material')) return 'materials';
        if (contentLower.includes('energy') || contentLower.includes('battery')) return 'energy';
        if (contentLower.includes('agriculture') || contentLower.includes('farming')) return 'agtech';
        if (contentLower.includes('medicine') || contentLower.includes('therapeutic')) return 'health';
        return 'innovation';
    } catch (error) {
        return 'innovation';
    }
}

function extractSourceUrl(documentContent) {
    try {
        const content = typeof documentContent === 'string' ? documentContent : JSON.stringify(documentContent);
        const urlMatch = content.match(/https?:\/\/[^\s<)]+/);
        return urlMatch ? urlMatch[0] : null;
    } catch (error) {
        return null;
    }
}

async function uploadImage(imagePath, title, token, siteId) {
    const form = new FormData();
    form.append('media[]', fs.createReadStream(imagePath));

    const apiUrl = `https://public-api.wordpress.com/rest/v1.1/sites/${siteId}/media/new`;
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            ...form.getHeaders()
        },
        body: form
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Image upload failed: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.media && data.media[0] ? data.media[0].ID : null;
}

async function createPost(article, bioTheme, alignmentScore, sourceUrl, featuredMediaId, token, siteId, publishStatus = 'publish', clientType = 'wordpress_insight') {
    const postData = {
        title: article.title,
        content: article.content,
        excerpt: article.excerpt,
        status: publishStatus,
        categories: [BIO_THEME_MAP[bioTheme] || BIO_THEME_MAP['innovation']],
        featured_image: featuredMediaId ? String(featuredMediaId) : undefined,
        metadata: [
            { key: 'alignment_score', value: alignmentScore.toFixed(3) },
            { key: 'source_url', value: sourceUrl || '' }
        ]
    };

    if (clientType === 'wordpress_deepdive') {
        postData.tags = ['deep-dive'];
    }

    const apiUrl = `https://public-api.wordpress.com/rest/v1.1/sites/${siteId}/posts/new`;
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(postData)
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Post creation failed: ${response.status} - ${error}`);
    }

    return response.json();
}

async function sendPendingBroadcasts() {
    const WPCOM_ACCESS_TOKEN = process.env.WPCOM_ACCESS_TOKEN;
    const WPCOM_SITE_ID = process.env.WPCOM_SITE_ID;
    const CLIENT_FILTER = process.env.CLIENT || 'wordpress_insight';

    if (!WPCOM_ACCESS_TOKEN || !WPCOM_SITE_ID) {
        throw new Error('WPCOM credentials not configured in .env.wordpress');
    }

    const dbPath = path.join(process.cwd(), 'agent/data/db.sqlite');
    const db = sqlite3(dbPath);

    console.log(`📤 Checking for pending ${CLIENT_FILTER} broadcasts...`);

    const limit = CLIENT_FILTER === 'wordpress_deepdive' ? 2 : 9;
    const pendingBroadcasts = db.prepare(`
        SELECT id, documentId, content, image_url, alignment_score, client
        FROM broadcasts
        WHERE status = 'pending'
        AND client = ?
        ORDER BY alignment_score DESC, createdAt ASC
        LIMIT ?
    `).all(CLIENT_FILTER, limit);

    console.log(`   Found ${pendingBroadcasts.length} pending broadcasts`);

    if (pendingBroadcasts.length === 0) {
        console.log('✅ No pending WordPress broadcasts to send');
        db.close();
        return;
    }

    for (const broadcast of pendingBroadcasts) {
        console.log(`\n📝 Publishing ${broadcast.client} broadcast ${broadcast.id.slice(0, 8)}...`);

        try {
            const article = JSON.parse(broadcast.content);
            console.log(`   Title: "${article.title}"`);

            const doc = db.prepare(`SELECT content FROM memories WHERE id = ?`).get(broadcast.documentId);
            if (!doc) throw new Error('Source document not found');

            const docContent = JSON.parse(doc.content);
            const bioTheme = extractBioTheme(docContent);
            const sourceUrl = extractSourceUrl(docContent);

            console.log(`   Bio theme: ${bioTheme}`);
            console.log(`   Source: ${sourceUrl || 'none'}`);

            let featuredMediaId = null;
            if (broadcast.image_url && fs.existsSync(broadcast.image_url)) {
                try {
                    console.log(`   📷 Uploading featured image...`);
                    featuredMediaId = await uploadImage(
                        broadcast.image_url,
                        article.title,
                        WPCOM_ACCESS_TOKEN,
                        WPCOM_SITE_ID
                    );
                    console.log(`   ✅ Image uploaded: ID ${featuredMediaId}`);
                } catch (imageError) {
                    console.log(`   ⚠️  Image upload failed: ${imageError.message}`);
                }
            }

            console.log(`   📤 Creating WordPress post...`);
            const post = await createPost(
                article,
                bioTheme,
                broadcast.alignment_score,
                sourceUrl,
                featuredMediaId,
                WPCOM_ACCESS_TOKEN,
                WPCOM_SITE_ID,
                'publish',
                broadcast.client
            );

            db.prepare(`
                UPDATE broadcasts
                SET status = 'sent',
                    message_id = ?,
                    sent_at = ?,
                    wordpress_post_id = ?
                WHERE id = ?
            `).run(post.URL, Date.now(), post.ID, broadcast.id);

            console.log(`   ✅ Published: ${post.URL}`);

        } catch (error) {
            console.log(`   ❌ Failed: ${error.message}`);
            db.prepare(`
                UPDATE broadcasts
                SET status = 'failed',
                    wordpress_error = ?
                WHERE id = ?
            `).run(error.message, broadcast.id);
        }
    }

    console.log(`\n✅ WordPress publishing complete`);
    db.close();
}

if (require.main === module) {
    sendPendingBroadcasts().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { sendPendingBroadcasts };
