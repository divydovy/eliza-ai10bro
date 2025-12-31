#!/usr/bin/env node

/**
 * Generate Missing Broadcast Images
 *
 * Problem: 16 broadcasts missing images (created during times when image generation failed)
 * Solution: Retroactively generate images for these broadcasts
 */

const Database = require('better-sqlite3');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);

console.log('🎨 Generating Missing Broadcast Images\n');

const db = new Database('./agent/data/db.sqlite');

// Find broadcasts missing images
const broadcastsWithoutImages = db.prepare(`
    SELECT
        b.id,
        b.documentId,
        b.client,
        b.content,
        b.alignment_score,
        datetime(b.createdAt/1000, 'unixepoch') as created
    FROM broadcasts b
    WHERE b.status = 'pending'
    AND b.alignment_score >= 0.12
    AND b.image_url IS NULL
    ORDER BY b.createdAt ASC
`).all();

console.log(`📊 Found ${broadcastsWithoutImages.length} broadcasts without images\n`);

if (broadcastsWithoutImages.length === 0) {
    console.log('✅ All broadcasts have images!\n');
    db.close();
    process.exit(0);
}

// Group by document (one image per document, reused across platforms)
const uniqueDocuments = new Map();
broadcastsWithoutImages.forEach(b => {
    if (!uniqueDocuments.has(b.documentId)) {
        uniqueDocuments.set(b.documentId, {
            documentId: b.documentId,
            content: b.content,
            broadcasts: []
        });
    }
    uniqueDocuments.get(b.documentId).broadcasts.push({
        id: b.id,
        client: b.client,
        created: b.created
    });
});

console.log(`📄 ${uniqueDocuments.size} unique documents need images\n`);

async function generateImage(documentId, content) {
    try {
        // Parse content
        const parsed = JSON.parse(content);
        const text = parsed.text || '';

        // Extract text without source URL for image prompt
        const textForImage = text.replace(/\n\n🔗 Source:.*$/, '').substring(0, 500);

        console.log(`   Generating image for document ${documentId.substring(0, 8)}...`);

        // Call image generation script
        const { stdout } = await execPromise(
            `python3 generate-broadcast-image-v2.py "${documentId}" "${textForImage.replace(/"/g, '\\"')}"`
        );

        // Extract image path from output
        const imageMatch = stdout.match(/Image saved to: (.+\.png)/);
        if (imageMatch) {
            const imageUrl = imageMatch[1];
            console.log(`   ✅ Generated: ${imageUrl}`);
            return imageUrl;
        } else {
            console.log(`   ⚠️  No image path found in output`);
            return null;
        }
    } catch (error) {
        console.log(`   ❌ Failed: ${error.message}`);
        return null;
    }
}

async function processDocuments() {
    let succeeded = 0;
    let failed = 0;

    for (const [documentId, data] of uniqueDocuments) {
        console.log(`\n🖼️  Document: ${documentId.substring(0, 8)}... (${data.broadcasts.length} broadcasts)`);

        const imageUrl = await generateImage(documentId, data.content);

        if (imageUrl) {
            // Update all broadcasts for this document
            const updateStmt = db.prepare(`
                UPDATE broadcasts
                SET image_url = ?
                WHERE documentId = ?
                AND status = 'pending'
            `);

            const result = updateStmt.run(imageUrl, documentId);
            console.log(`   ✅ Updated ${result.changes} broadcasts`);
            succeeded++;
        } else {
            failed++;
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Succeeded: ${succeeded}/${uniqueDocuments.size}`);
    console.log(`   ❌ Failed: ${failed}/${uniqueDocuments.size}`);

    // Check final stats
    const finalStats = db.prepare(`
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN image_url IS NOT NULL THEN 1 ELSE 0 END) as with_images,
            SUM(CASE WHEN image_url IS NULL THEN 1 ELSE 0 END) as without_images
        FROM broadcasts
        WHERE status = 'pending'
        AND alignment_score >= 0.12
    `).get();

    console.log(`\n📈 Final Stats:`);
    console.log(`   Total sendable: ${finalStats.total}`);
    console.log(`   With images: ${finalStats.with_images} (${Math.round(finalStats.with_images/finalStats.total*100)}%)`);
    console.log(`   Without images: ${finalStats.without_images} (${Math.round(finalStats.without_images/finalStats.total*100)}%)`);

    db.close();
}

processDocuments().catch(error => {
    console.error('\n❌ Error:', error);
    db.close();
    process.exit(1);
});
