#!/usr/bin/env node

/**
 * Retroactively generate images for existing pending broadcasts
 *
 * This script:
 * 1. Finds pending broadcasts passing quality threshold (score >= 0.15)
 * 2. Groups by documentId to avoid duplicate image generation
 * 3. Generates one image per document
 * 4. Updates all broadcasts for that document with the image_url
 */

const sqlite3 = require('better-sqlite3');
const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

const execPromise = promisify(exec);

async function backfillImages() {
    try {
        if (!process.env.GEMINI_API_KEY) {
            console.error('❌ GEMINI_API_KEY not found in environment');
            console.log('💡 Run: export GEMINI_API_KEY=your_key_here');
            process.exit(1);
        }

        if (!process.env.ENABLE_IMAGE_GENERATION || process.env.ENABLE_IMAGE_GENERATION !== 'true') {
            console.error('❌ ENABLE_IMAGE_GENERATION must be set to "true"');
            console.log('💡 Run: export ENABLE_IMAGE_GENERATION=true');
            process.exit(1);
        }

        // Open database
        const dbPath = path.join(process.cwd(), 'agent/data/db.sqlite');
        const db = sqlite3(dbPath);

        // Get distinct documents that need images
        const documents = db.prepare(`
            SELECT DISTINCT
                documentId,
                content,
                alignment_score
            FROM broadcasts
            WHERE status = 'pending'
                AND alignment_score >= 0.15
                AND image_url IS NULL
            ORDER BY alignment_score DESC
        `).all();

        console.log(`\n🎨 Backfilling Images for Pending Broadcasts`);
        console.log(`═══════════════════════════════════════════════`);
        console.log(`📊 Found ${documents.length} unique documents needing images`);

        // Calculate total broadcasts that will be updated
        const totalBroadcasts = db.prepare(`
            SELECT COUNT(*) as count
            FROM broadcasts
            WHERE status = 'pending'
                AND alignment_score >= 0.15
                AND image_url IS NULL
        `).get().count;

        console.log(`📤 ${totalBroadcasts} broadcasts will receive images`);
        console.log(`💰 Estimated cost: $${(documents.length * 0.01).toFixed(2)}\n`);

        let successCount = 0;
        let errorCount = 0;
        let skippedCount = 0;

        for (let i = 0; i < documents.length; i++) {
            const doc = documents[i];
            const progress = `[${i + 1}/${documents.length}]`;

            try {
                console.log(`${progress} 🎨 Processing document ${doc.documentId}...`);
                console.log(`   Score: ${doc.alignment_score.toFixed(3)}`);

                // Extract broadcast text (parse JSON or use as-is)
                let textForImage;
                try {
                    const parsed = JSON.parse(doc.content);
                    textForImage = parsed.text || doc.content;
                } catch (e) {
                    textForImage = doc.content;
                }

                // Remove source URLs and truncate for image prompt
                textForImage = textForImage
                    .replace(/\n\n🔗 Source:.*$/m, '')
                    .substring(0, 500)
                    .replace(/"/g, '\\"');

                // Generate image using Python script
                console.log(`   🖼️  Generating image...`);
                const { stdout, stderr } = await execPromise(
                    `python3 generate-broadcast-image.py "${doc.documentId}" "${textForImage}"`
                );

                // Extract image path from output
                const imageMatch = stdout.match(/Image saved to: (.+\.png)/);
                if (!imageMatch) {
                    console.log(`   ⚠️  No image generated (skipping)`);
                    skippedCount++;
                    continue;
                }

                const imageUrl = imageMatch[1];
                console.log(`   ✅ Image created: ${path.basename(imageUrl)}`);

                // Update all broadcasts for this document
                const result = db.prepare(`
                    UPDATE broadcasts
                    SET image_url = ?
                    WHERE documentId = ?
                        AND status = 'pending'
                        AND image_url IS NULL
                `).run(imageUrl, doc.documentId);

                console.log(`   ✅ Updated ${result.changes} broadcasts\n`);
                successCount++;

                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (error) {
                console.error(`   ❌ Error: ${error.message}\n`);
                errorCount++;
            }
        }

        db.close();

        console.log(`\n═══════════════════════════════════════════════`);
        console.log(`🎉 Backfill Complete!`);
        console.log(`   ✅ Success: ${successCount} documents`);
        console.log(`   ❌ Errors: ${errorCount} documents`);
        console.log(`   ⚠️  Skipped: ${skippedCount} documents`);
        console.log(`   💰 Actual cost: $${(successCount * 0.01).toFixed(2)}`);

        // Show updated stats
        const updatedCount = db.prepare(`
            SELECT COUNT(*) as count
            FROM broadcasts
            WHERE status = 'pending'
                AND image_url IS NOT NULL
        `).get().count;

        console.log(`   📊 Broadcasts with images: ${updatedCount}\n`);

    } catch (error) {
        console.error('💥 Critical error:', error);
        process.exit(1);
    }
}

// Run the script
if (require.main === module) {
    backfillImages().catch(error => {
        console.error('💥 Unhandled error:', error);
        process.exit(1);
    });
}

module.exports = { backfillImages };
