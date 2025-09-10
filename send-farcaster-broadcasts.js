#!/usr/bin/env node

const sqlite3 = require('better-sqlite3');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

async function sendFarcasterBroadcasts() {
    try {
        // Get API credentials from environment
        const apiKey = process.env.FARCASTER_NEYNAR_API_KEY;
        const signerUuid = process.env.FARCASTER_NEYNAR_SIGNER_UUID;
        
        if (!apiKey) {
            throw new Error('FARCASTER_NEYNAR_API_KEY not found in environment');
        }
        
        if (!signerUuid) {
            console.log('⚠️  FARCASTER_NEYNAR_SIGNER_UUID not set - you need to create a signer first');
            console.log('Visit https://dev.neynar.com/ to create a signer UUID');
            return;
        }
        
        // Open broadcast database  
        const dbPath = path.join(process.cwd(), 'agent/data/db.sqlite');
        const db = sqlite3(dbPath);
        
        // Get pending Farcaster broadcasts - either a specific one or up to 5
        let pendingBroadcasts;
        const limit = process.env.LIMIT || 1;
        
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
            // Send pending broadcasts
            pendingBroadcasts = db.prepare(`
                SELECT id, content as message, client as platform 
                FROM broadcasts 
                WHERE status = 'pending' 
                AND client = 'farcaster'
                LIMIT ?
            `).all(limit);
        }
        
        console.log(`🎭 Found ${pendingBroadcasts.length} pending Farcaster broadcasts`);
        
        for (const broadcast of pendingBroadcasts) {
            console.log(`\n🎯 Sending broadcast ${broadcast.id}...`);
            
            // Clean message (remove broadcast tags if any)
            const cleanMessage = broadcast.message.replace(/\[BROADCAST:[^\]]+\]\s*/, '');
            
            // Farcaster has a 320 character limit for casts
            const truncatedMessage = cleanMessage.length > 320 
                ? cleanMessage.substring(0, 317) + '...' 
                : cleanMessage;
            
            try {
                // Send cast via Neynar API
                const response = await axios.post(
                    'https://api.neynar.com/v2/farcaster/cast',
                    {
                        signer_uuid: signerUuid,
                        text: truncatedMessage
                    },
                    {
                        headers: {
                            'accept': 'application/json',
                            'x-api-key': apiKey,
                            'content-type': 'application/json'
                        }
                    }
                );
                
                if (response.data && response.data.cast) {
                    console.log(`   ✅ Cast sent! Hash: ${response.data.cast.hash}`);
                    console.log(`   🔗 View at: https://warpcast.com/${response.data.cast.author.username}/${response.data.cast.hash.slice(0, 10)}`);
                    
                    // Update broadcast status
                    db.prepare(`
                        UPDATE broadcasts 
                        SET status = 'sent', 
                            sent_at = datetime('now'),
                            response = ?
                        WHERE id = ?
                    `).run(JSON.stringify(response.data), broadcast.id);
                    
                    console.log(`   ✅ Marked as sent in database`);
                } else {
                    console.error(`   ⚠️  Unexpected response format`);
                }
                
            } catch (error) {
                console.error(`   ❌ Failed to send cast:`, error.response?.data || error.message);
                
                // Mark as failed in database (note: error column doesn't exist, just update status)
                db.prepare(`
                    UPDATE broadcasts 
                    SET status = 'failed'
                    WHERE id = ?
                `).run(broadcast.id);
            }
            
            // Wait between sends to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        db.close();
        console.log('\n🎉 Farcaster broadcast processing complete!');
        
    } catch (error) {
        console.error('❌ Error sending broadcasts:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    sendFarcasterBroadcasts();
}

module.exports = { sendFarcasterBroadcasts };