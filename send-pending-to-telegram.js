#!/usr/bin/env node

const sqlite3 = require('better-sqlite3');
const { Telegraf } = require('telegraf');
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
        
        const botToken = character.settings.secrets.TELEGRAM_BOT_TOKEN;
        const chatIds = character.settings.secrets.TELEGRAM_CHAT_ID.split(',').map(id => id.trim());
        
        if (!botToken) {
            throw new Error('TELEGRAM_BOT_TOKEN not found in character settings');
        }
        
        const bot = new Telegraf(botToken);
        
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
                AND client = 'telegram'
                AND alignment_score >= 0.15
            `).all(process.env.BROADCAST_ID);
        } else {
            // Send only 1 pending broadcast per run for proper pacing
            // Quality threshold: 0.15 (from alignment-keywords-refined.json)
            pendingBroadcasts = db.prepare(`
                SELECT id, documentId, content as message, client as platform, image_url
                FROM broadcasts
                WHERE status = 'pending'
                AND client = 'telegram'
                AND alignment_score >= 0.15
                ORDER BY createdAt ASC
                LIMIT 1
            `).all();
        }
        
        console.log(`📤 Found ${pendingBroadcasts.length} pending Telegram broadcasts`);
        
        for (const broadcast of pendingBroadcasts) {
            console.log(`\n📱 Sending broadcast ${broadcast.id}...`);

            // Handle both JSON and plain text content
            let messageText;
            if (broadcast.message.startsWith('{') && broadcast.message.includes('"text"')) {
                try {
                    const parsed = JSON.parse(broadcast.message);
                    messageText = parsed.text || broadcast.message;
                } catch (e) {
                    messageText = broadcast.message;
                }
            } else {
                // Plain text content from new broadcast system
                messageText = broadcast.message;
            }

            // Clean message (remove broadcast tags)
            const cleanMessage = messageText.replace(/\[BROADCAST:[^\]]+\]\s*/, '');

            // Just-in-time image generation (if not already generated)
            if (!broadcast.image_url && process.env.ENABLE_IMAGE_GENERATION === 'true' && process.env.GEMINI_API_KEY) {
                try {
                    console.log(`   🎨 Generating image on-the-fly...`);

                    // Use broadcast content for image prompt (strip source URL)
                    const textForImage = cleanMessage.replace(/\n\n🔗 Source:.*$/, '').substring(0, 500);

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

            let success = false;
            for (const chatId of chatIds) {
                try {
                    // Send with image if available
                    if (broadcast.image_url && fs.existsSync(broadcast.image_url)) {
                        await bot.telegram.sendPhoto(chatId, { source: broadcast.image_url }, {
                            caption: cleanMessage
                        });
                        console.log(`   ✅ Sent to chat ${chatId} (with image)`);
                    } else {
                        await bot.telegram.sendMessage(chatId, cleanMessage);
                        console.log(`   ✅ Sent to chat ${chatId}`);
                    }
                    success = true;
                } catch (error) {
                    console.error(`   ❌ Failed to send to chat ${chatId}:`, error.message);
                }
            }
            
            // Update broadcast status
            if (success) {
                db.prepare(`
                    UPDATE broadcasts
                    SET status = 'sent', sent_at = ?
                    WHERE id = ?
                `).run(Date.now(), broadcast.id);
                console.log(`   ✅ Marked as sent in database`);
            }
            
            // Wait between sends to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        db.close();
        console.log('\n🎉 Telegram broadcast processing complete!');
        
    } catch (error) {
        console.error('❌ Error sending broadcasts:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    sendPendingBroadcasts();
}

module.exports = { sendPendingBroadcasts };