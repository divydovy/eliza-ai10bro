#!/usr/bin/env node

const sqlite3 = require('better-sqlite3');
const { Configuration, NeynarAPIClient } = require('@neynar/nodejs-sdk');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function sendPendingBroadcasts() {
    try {
        // Load Farcaster credentials from environment
        const apiKey = process.env.FARCASTER_NEYNAR_API_KEY;
        const signerUuid = process.env.FARCASTER_NEYNAR_SIGNER_UUID;
        const fid = process.env.FARCASTER_FID || 1331903;

        if (!apiKey || !signerUuid || !fid) {
            throw new Error('FARCASTER_NEYNAR_API_KEY, FARCASTER_NEYNAR_SIGNER_UUID, or FARCASTER_FID not found in environment');
        }

        // Initialize Neynar client
        const config = new Configuration({
            apiKey: apiKey,
            baseOptions: {
                headers: {
                    "x-neynar-experimental": true,
                },
            },
        });
        const client = new NeynarAPIClient(config);

        console.log(`✅ Connected to Farcaster via Neynar (FID: ${fid})`);

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
                AND client = 'farcaster'
            `).all(process.env.BROADCAST_ID);
        } else {
            // Send up to 5 pending broadcasts
            pendingBroadcasts = db.prepare(`
                SELECT id, content as message, client as platform
                FROM broadcasts
                WHERE status = 'pending'
                AND client = 'farcaster'
                LIMIT 5
            `).all();
        }

        console.log(`📤 Found ${pendingBroadcasts.length} pending Farcaster broadcasts`);

        if (pendingBroadcasts.length === 0) {
            console.log('✅ No pending Farcaster broadcasts to send');
            db.close();
            return;
        }

        let successCount = 0;
        let errorCount = 0;

        for (const broadcast of pendingBroadcasts) {
            try {
                console.log(`📡 Sending broadcast ${broadcast.id} to Farcaster...`);

                // Post to Farcaster
                const result = await client.publishCast({
                    signerUuid: signerUuid,
                    text: broadcast.message,
                });

                // Mark as sent in database
                db.prepare(`
                    UPDATE broadcasts
                    SET status = 'sent', sent_at = datetime('now')
                    WHERE id = ?
                `).run(broadcast.id);

                console.log(`✅ Broadcast ${broadcast.id} sent successfully to Farcaster`);
                console.log(`🔗 Cast hash: ${result.cast.hash}`);
                console.log(`🔗 View on Warpcast: https://warpcast.com/~/conversations/${result.cast.hash}`);
                successCount++;

            } catch (error) {
                console.error(`❌ Failed to send broadcast ${broadcast.id} to Farcaster:`, error.message);

                // Mark as failed
                db.prepare(`
                    UPDATE broadcasts
                    SET status = 'failed'
                    WHERE id = ?
                `).run(broadcast.id);

                errorCount++;
            }
        }

        console.log(`\n📊 Farcaster Broadcast Summary:`);
        console.log(`✅ Successful: ${successCount}`);
        console.log(`❌ Failed: ${errorCount}`);
        console.log(`📱 Total: ${pendingBroadcasts.length}`);

        db.close();

    } catch (error) {
        console.error('💥 Critical error in Farcaster broadcast script:', error);
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