#!/usr/bin/env node

const sqlite3 = require('better-sqlite3');
const { Telegraf } = require('telegraf');
const fs = require('fs');
const path = require('path');

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
                SELECT id, content as message, client as platform 
                FROM broadcasts 
                WHERE id = ? 
                AND status IN ('pending', 'sending')
                AND client = 'telegram'
            `).all(process.env.BROADCAST_ID);
        } else {
            // Send only 1 pending broadcast per run for proper pacing
            pendingBroadcasts = db.prepare(`
                SELECT id, content as message, client as platform
                FROM broadcasts
                WHERE status = 'pending'
                AND client = 'telegram'
                ORDER BY createdAt ASC
                LIMIT 1
            `).all();
        }
        
        console.log(`📤 Found ${pendingBroadcasts.length} pending Telegram broadcasts`);
        
        for (const broadcast of pendingBroadcasts) {
            console.log(`\n📱 Sending broadcast ${broadcast.id}...`);

            // Parse JSON content to extract text
            let messageText;
            try {
                const parsed = JSON.parse(broadcast.message);
                messageText = parsed.text || broadcast.message;
            } catch (e) {
                messageText = broadcast.message;
            }

            // Clean message (remove broadcast tags)
            const cleanMessage = messageText.replace(/\[BROADCAST:[^\]]+\]\s*/, '');

            let success = false;
            for (const chatId of chatIds) {
                try {
                    await bot.telegram.sendMessage(chatId, cleanMessage);
                    console.log(`   ✅ Sent to chat ${chatId}`);
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