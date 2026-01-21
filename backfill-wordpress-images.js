#!/usr/bin/env node

/**
 * Backfill missing WordPress featured images
 *
 * Finds WordPress posts without featured images and uploads them from
 * the broadcast database records.
 */

const sqlite3 = require('better-sqlite3');
const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.wordpress' });

const WP_BASE_URL = process.env.WP_BASE_URL || 'http://localhost:8885';
const WP_USERNAME = process.env.WP_USERNAME || 'admin';
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD;

if (!WP_APP_PASSWORD) {
    throw new Error('WP_APP_PASSWORD not configured in .env.wordpress');
}

const auth = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString('base64');

/**
 * Upload image to WordPress
 */
async function uploadImage(imagePath, title) {
    const form = new FormData();
    form.append('file', fs.createReadStream(imagePath));
    form.append('title', title);
    form.append('alt_text', title);

    const response = await fetch(`${WP_BASE_URL}/wp-json/wp/v2/media`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${auth}` },
        body: form
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Image upload failed: ${response.status} ${error}`);
    }

    const data = await response.json();
    return data.id;
}

/**
 * Update WordPress post with featured image
 */
async function updatePostImage(postId, mediaId) {
    const response = await fetch(`${WP_BASE_URL}/wp-json/wp/v2/insight/${postId}`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ featured_media: mediaId })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Post update failed: ${response.status} ${error}`);
    }

    return response.json();
}

/**
 * Get WordPress posts without featured images
 */
async function getPostsWithoutImages() {
    const posts = [];
    let page = 1;

    while (true) {
        const response = await fetch(
            `${WP_BASE_URL}/wp-json/wp/v2/insight?per_page=100&page=${page}&_fields=id,title,featured_media`
        );

        if (!response.ok) break;

        const pagePosts = await response.json();
        if (pagePosts.length === 0) break;

        posts.push(...pagePosts.filter(p => p.featured_media === 0));
        page++;
    }

    return posts;
}

/**
 * Main backfill function
 */
async function backfillImages() {
    console.log('🖼️  WordPress Image Backfill\n');

    // Open database
    const dbPath = path.join(process.cwd(), 'agent/data/db.sqlite');
    const db = sqlite3(dbPath);

    // Get WordPress posts without images
    console.log('📥 Fetching WordPress posts without images...');
    const posts = await getPostsWithoutImages();
    console.log(`   Found ${posts.length} posts missing images\n`);

    if (posts.length === 0) {
        console.log('✨ All posts have images!');
        db.close();
        return;
    }

    let uploaded = 0;
    let failed = 0;
    let notFound = 0;

    for (const post of posts) {
        const title = post.title.rendered;
        console.log(`\n📝 Processing: "${title.substring(0, 60)}..."`);
        console.log(`   Post ID: ${post.id}`);

        try {
            // Find broadcast by title (match within JSON content field)
            const broadcast = db.prepare(`
                SELECT id, image_url, documentId
                FROM broadcasts
                WHERE client = 'wordpress_insight'
                AND json_extract(content, '$.title') = ?
                LIMIT 1
            `).get(title);

            if (!broadcast) {
                console.log(`   ⚠️  No matching broadcast found`);
                notFound++;
                continue;
            }

            if (!broadcast.image_url) {
                console.log(`   ⚠️  Broadcast has no image`);
                notFound++;
                continue;
            }

            const imagePath = broadcast.image_url;

            if (!fs.existsSync(imagePath)) {
                console.log(`   ⚠️  Image file not found: ${imagePath}`);
                notFound++;
                continue;
            }

            console.log(`   📷 Uploading: ${path.basename(imagePath)}`);
            const mediaId = await uploadImage(imagePath, title);
            console.log(`   ✅ Image uploaded (Media ID: ${mediaId})`);

            console.log(`   🔗 Updating post with featured image...`);
            await updatePostImage(post.id, mediaId);
            console.log(`   ✅ Post updated successfully`);

            uploaded++;

        } catch (error) {
            console.error(`   ❌ Failed: ${error.message}`);
            failed++;
        }
    }

    db.close();

    console.log('\n' + '='.repeat(60));
    console.log('📊 Backfill Summary:');
    console.log(`   ✅ Uploaded: ${uploaded}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   ⚠️  Not found: ${notFound}`);
    console.log(`   📝 Total processed: ${posts.length}`);
    console.log('='.repeat(60));
}

// Run
backfillImages().catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
});
