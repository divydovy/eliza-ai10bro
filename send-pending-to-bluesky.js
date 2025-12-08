#!/usr/bin/env node

const sqlite3 = require('better-sqlite3');
const { BskyAgent } = require('@atproto/api');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execPromise = promisify(exec);

async function sendPendingBroadcasts() {
    try {
        // Load character settings for AI10BRO
        const characterPath = path.join(process.cwd(), 'characters', 'ai10bro.character.json');
        const character = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));

        const handle = character.settings.secrets.BLUESKY_HANDLE;
        const password = character.settings.secrets.BLUESKY_APP_PASSWORD;

        if (!handle || !password) {
            throw new Error('BLUESKY_HANDLE or BLUESKY_APP_PASSWORD not found in character settings');
        }

        // Initialize Bluesky agent
        const agent = new BskyAgent({
            service: 'https://bsky.social'
        });

        // Login to Bluesky
        const loginHandle = handle.includes('.') ? handle : `${handle}.bsky.social`;
        await agent.login({
            identifier: loginHandle,
            password: password
        });

        console.log(`✅ Connected to Bluesky as ${agent.session?.handle}`);

        // Open broadcast database
        const dbPath = path.join(process.cwd(), 'agent/data/db.sqlite');
        const db = sqlite3(dbPath);

        // Get pending broadcasts - either a specific one or up to 5
        let pendingBroadcasts;
        if (process.env.BROADCAST_ID) {
            // Send a specific broadcast
            pendingBroadcasts = db.prepare(`
                SELECT id, documentId, content as message, client as platform, image_url
                FROM broadcasts
                WHERE id = ?
                AND status IN ('pending', 'sending')
                AND client = 'bluesky'
                AND alignment_score >= 0.12
            `).all(process.env.BROADCAST_ID);
        } else {
            // Send only 1 pending broadcast per run for proper pacing
            // Quality threshold: 0.12 (from alignment-keywords-refined.json)
            pendingBroadcasts = db.prepare(`
                SELECT id, documentId, content as message, client as platform, image_url
                FROM broadcasts
                WHERE status = 'pending'
                AND client = 'bluesky'
                AND alignment_score >= 0.12
                ORDER BY createdAt ASC
                LIMIT 1
            `).all();
        }

        console.log(`📤 Found ${pendingBroadcasts.length} pending Bluesky broadcasts`);

        if (pendingBroadcasts.length === 0) {
            console.log('✅ No pending Bluesky broadcasts to send');
            db.close();
            return;
        }

        let successCount = 0;
        let errorCount = 0;

        for (const broadcast of pendingBroadcasts) {
            try {
                console.log(`📡 Sending broadcast ${broadcast.id} to Bluesky...`);

                // Parse the JSON content to extract the text
                let messageText;
                try {
                    const parsed = JSON.parse(broadcast.message);
                    messageText = parsed.text || broadcast.message;
                } catch (e) {
                    // If parsing fails, use content as-is
                    messageText = broadcast.message;
                }

                // Just-in-time image generation (if not already generated)
                if (!broadcast.image_url && process.env.ENABLE_IMAGE_GENERATION === 'true' && process.env.GEMINI_API_KEY) {
                    try {
                        console.log(`   🎨 Generating image on-the-fly...`);

                        // Use broadcast content for image prompt (strip source URL)
                        const textForImage = messageText.replace(/\n\n🔗 Source:.*$/, '').substring(0, 500);

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

                // Upload image if present
                let embed = undefined;
                if (broadcast.image_url && fs.existsSync(broadcast.image_url)) {
                    try {
                        console.log(`   📸 Uploading image: ${broadcast.image_url}`);

                        // Try to use sharp for resizing, but gracefully fallback if not available
                        let imageBuffer;
                        try {
                            const sharp = require('sharp');
                            // Resize if needed (Bluesky max: 1MB)
                            imageBuffer = await sharp(broadcast.image_url)
                                .resize(1200, 675, { fit: 'inside' })
                                .jpeg({ quality: 85 })
                                .toBuffer();
                        } catch (sharpError) {
                            // If sharp not available, use original image
                            console.log(`   ⚠️  Sharp not available, using original image`);
                            imageBuffer = fs.readFileSync(broadcast.image_url);
                        }

                        const uploadResponse = await agent.uploadBlob(imageBuffer, {
                            encoding: 'image/jpeg'
                        });

                        embed = {
                            $type: 'app.bsky.embed.images',
                            images: [{
                                alt: messageText.substring(0, 100),
                                image: uploadResponse.data.blob
                            }]
                        };

                        console.log(`   ✅ Image uploaded successfully`);
                    } catch (imageError) {
                        console.error(`   ⚠️  Failed to upload image (continuing without): ${imageError.message}`);
                    }
                }

                // Post to Bluesky
                const post = await agent.post({
                    text: messageText,
                    createdAt: new Date().toISOString(),
                    embed: embed
                });

                // Mark as sent in database
                db.prepare(`
                    UPDATE broadcasts
                    SET status = 'sent', sent_at = ?
                    WHERE id = ?
                `).run(Date.now(), broadcast.id);

                console.log(`✅ Broadcast ${broadcast.id} sent successfully to Bluesky`);
                console.log(`🔗 Post URI: ${post.uri}`);
                successCount++;

            } catch (error) {
                console.error(`❌ Failed to send broadcast ${broadcast.id} to Bluesky:`, error.message);

                // Mark as failed
                db.prepare(`
                    UPDATE broadcasts
                    SET status = 'failed'
                    WHERE id = ?
                `).run(broadcast.id);

                errorCount++;
            }
        }

        console.log(`\n📊 Bluesky Broadcast Summary:`);
        console.log(`✅ Successful: ${successCount}`);
        console.log(`❌ Failed: ${errorCount}`);
        console.log(`📱 Total: ${pendingBroadcasts.length}`);

        db.close();

    } catch (error) {
        console.error('💥 Critical error in Bluesky broadcast script:', error);
        process.exit(1);
    }
}

// Run the script
if (require.main === module) {
    sendPendingBroadcasts().catch(error => {
        console.error('💥 Unhandled error:', error);
        process.exit(1);
    });
}

module.exports = { sendPendingBroadcasts };