#!/usr/bin/env node

/**
 * Upload generated images to WordPress and update posts
 */

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

// Posts and their generated image files
const posts = [
    { id: 142, image: 'post-142.png', title: 'CRISPR-like Tools Edit Mitochondria DNA' },
    { id: 141, image: 'post-141.png', title: 'Algae-Based Bio-Altimeter' },
    { id: 140, image: 'post-140.png', title: 'Innovative Corneal Coating' },
    { id: 127, image: 'post-127.png', title: 'Injectable GelMA Hydrogel' },
    { id: 126, image: 'post-126.png', title: 'DIAL Framework Protein Expression' },
    { id: 125, image: 'post-125.png', title: 'Living Microbial Cement Supercapacitors' },
    { id: 124, image: 'post-124.png', title: 'Pig Kidney Xenotransplantation' },
    { id: 123, image: 'post-123.png', title: "Huntington's Disease Treatment" },
    { id: 122, image: 'post-122.png', title: 'Extracellular Vesicles Bone Repair' },
    { id: 121, image: 'post-121.png', title: 'Lab-Grown Human Embryo Model' },
    { id: 120, image: 'post-120.png', title: 'Personal Genome Sequencing Affordable' },
    { id: 119, image: 'post-119.png', title: 'Personal Genome Sequencing Under $2000' },
    { id: 118, image: 'post-118.png', title: 'Bio-Innovators Grow Vibrant Colors' },
    { id: 117, image: 'post-117.png', title: 'Scientists Grow Color Without Chemicals' },
    { id: 116, image: 'post-116.png', title: 'Shiitake Mycelium Memristors' },
    { id: 115, image: 'post-115.png', title: '3D-printed Carotid Artery-on-Chips' },
    { id: 98, image: 'post-98.png', title: 'Self-healing Fungi Concrete' },
    { id: 97, image: 'post-97.png', title: 'Biocement Bricks' },
    { id: 96, image: 'post-96.png', title: 'Self-Healing Bio Concrete' },
    { id: 90, image: 'post-90.png', title: 'Living Architecture Genetic Engineering' },
    { id: 88, image: 'post-88.png', title: "MIT Self-Healing Concrete" },
    { id: 83, image: 'post-83.png', title: 'AI Optimizes Biosensors Lead Detection' },
    { id: 82, image: 'post-82.png', title: 'Biomimetic Microspheres Bone Regeneration' },
    { id: 81, image: 'post-81.png', title: 'Engineered Bacteria Target Tumors' },
    { id: 60, image: 'post-60.png', title: 'Data-Driven Omics Integration' },
    { id: 45, image: 'post-45.png', title: 'Data-Driven Synthetic Microbes' },
    { id: 41, image: 'post-41.png', title: 'Sustainable Alternative to Single-Use Plastics' },
    { id: 40, image: 'post-40.png', title: 'Bio-Concrete 52.5 MPa Strength' }
];

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
 * Main upload function
 */
async function uploadImages() {
    console.log('📤 Uploading Generated Images to WordPress\n');

    const imagesDir = path.join(process.cwd(), 'broadcast-images');
    let uploaded = 0;
    let failed = 0;

    for (const post of posts) {
        const imagePath = path.join(imagesDir, post.image);

        console.log(`\n📝 Post ${post.id}: ${post.title}`);

        if (!fs.existsSync(imagePath)) {
            console.log(`   ⚠️  Image not found: ${post.image}`);
            failed++;
            continue;
        }

        try {
            console.log(`   📷 Uploading: ${post.image}`);
            const mediaId = await uploadImage(imagePath, post.title);
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

    console.log('\n' + '='.repeat(60));
    console.log('📊 Upload Summary:');
    console.log(`   ✅ Uploaded: ${uploaded}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📝 Total: ${posts.length}`);
    console.log('='.repeat(60));
}

// Run
uploadImages().catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
});
