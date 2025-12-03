#!/usr/bin/env node

/**
 * Generate 10 sample V2 images for quality review
 */

const sqlite3 = require('better-sqlite3');
const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execPromise = promisify(exec);

async function generateSamples() {
    try {
        if (!process.env.GEMINI_API_KEY) {
            console.error('❌ GEMINI_API_KEY not found in environment');
            process.exit(1);
        }

        const dbPath = path.join(process.cwd(), 'agent/data/db.sqlite');
        const db = sqlite3(dbPath);

        // Get top 10 documents by alignment score
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
            LIMIT 10
        `).all();

        console.log(`\n🎨 Generating 10 Sample V2 Images`);
        console.log(`═══════════════════════════════════════════════`);
        console.log(`📊 Top 10 documents (scores: ${documents[0].alignment_score.toFixed(3)} - ${documents[9].alignment_score.toFixed(3)})`);
        console.log(`💰 Cost: $0.10\n`);

        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < documents.length; i++) {
            const doc = documents[i];
            const progress = `[${i + 1}/10]`;

            try {
                console.log(`${progress} 🎨 Document ${doc.documentId.substring(0, 8)}...`);
                console.log(`   Score: ${doc.alignment_score.toFixed(3)}`);

                // Extract broadcast text
                let textForImage;
                try {
                    const parsed = JSON.parse(doc.content);
                    textForImage = parsed.text || doc.content;
                } catch (e) {
                    textForImage = doc.content;
                }

                // Clean and truncate
                textForImage = textForImage
                    .replace(/\n\n🔗 Source:.*$/m, '')
                    .substring(0, 500)
                    .replace(/"/g, '\\"');

                // Generate image
                console.log(`   🖼️  Generating with V2...`);
                const { stdout } = await execPromise(
                    `python3 generate-broadcast-image-v2.py "${doc.documentId}" "${textForImage}"`
                );

                const imageMatch = stdout.match(/Image saved to: (.+\.png)/);
                if (imageMatch) {
                    console.log(`   ✅ ${path.basename(imageMatch[1])}\n`);
                    successCount++;
                } else {
                    console.log(`   ⚠️  No image generated\n`);
                }

                // Small delay
                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (error) {
                console.error(`   ❌ Error: ${error.message}\n`);
                errorCount++;
            }
        }

        db.close();

        console.log(`\n═══════════════════════════════════════════════`);
        console.log(`🎉 Sample Generation Complete!`);
        console.log(`   ✅ Success: ${successCount}/10`);
        console.log(`   ❌ Errors: ${errorCount}/10\n`);

        console.log(`📂 Review images in: broadcast-images/`);
        console.log(`💡 Open Finder: open broadcast-images/\n`);

    } catch (error) {
        console.error('💥 Critical error:', error);
        process.exit(1);
    }
}

generateSamples().catch(error => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
});
