#!/usr/bin/env node

const sqlite3 = require('better-sqlite3');
const { BskyAgent } = require('@atproto/api');
const fs = require('fs');
const path = require('path');

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
                SELECT id, content as message, client as platform
                FROM broadcasts
                WHERE id = ?
                AND status IN ('pending', 'sending')
                AND client = 'bluesky'
            `).all(process.env.BROADCAST_ID);
        } else {
            // Send only 1 pending broadcast per run for proper pacing
            // Quality threshold: 0.15 (from alignment-keywords-refined.json)
            pendingBroadcasts = db.prepare(`
                SELECT id, content as message, client as platform
                FROM broadcasts
                WHERE status = 'pending'
                AND client = 'bluesky'
                AND alignment_score >= 0.15
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

                // Post to Bluesky
                const post = await agent.post({
                    text: messageText,
                    createdAt: new Date().toISOString()
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