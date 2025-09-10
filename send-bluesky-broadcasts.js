#!/usr/bin/env node

const { BskyAgent, RichText } = require('@atproto/api');
const sqlite3 = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

async function sendBlueskyBroadcasts() {
    try {
        // Get Bluesky credentials from environment
        const handle = process.env.BLUESKY_HANDLE;
        const appPassword = process.env.BLUESKY_APP_PASSWORD;
        
        if (!handle || !appPassword) {
            throw new Error('BLUESKY_HANDLE and BLUESKY_APP_PASSWORD must be set in environment');
        }
        
        // Create Bluesky agent
        const agent = new BskyAgent({
            service: 'https://bsky.social'
        });
        
        // Login to Bluesky
        console.log(`🦋 Logging into Bluesky as @${handle}...`);
        await agent.login({
            identifier: handle.includes('.') ? handle : `${handle}.bsky.social`,
            password: appPassword
        });
        console.log('✅ Successfully logged into Bluesky');
        
        // Open broadcast database  
        const dbPath = path.join(process.cwd(), 'agent/data/db.sqlite');
        const db = sqlite3(dbPath);
        
        // Get pending Bluesky broadcasts
        let pendingBroadcasts;
        const limit = parseInt(process.env.LIMIT) || 1;
        
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
            // Send pending broadcasts
            pendingBroadcasts = db.prepare(`
                SELECT id, content as message, client as platform 
                FROM broadcasts 
                WHERE status = 'pending' 
                AND client = 'bluesky'
                ORDER BY createdAt ASC
                LIMIT ?
            `).all(limit);
        }
        
        console.log(`🦋 Found ${pendingBroadcasts.length} pending Bluesky broadcasts`);
        
        for (const broadcast of pendingBroadcasts) {
            console.log(`\n🎯 Sending broadcast ${broadcast.id.substring(0, 8)}...`);
            
            // Clean message (remove broadcast tags if any)
            let cleanMessage = broadcast.message.replace(/\[BROADCAST:[^\]]+\]\s*/, '');
            
            // Bluesky has a 300 character limit for posts
            if (cleanMessage.length > 300) {
                cleanMessage = cleanMessage.substring(0, 297) + '...';
            }
            
            try {
                // Update status to sending
                db.prepare(`
                    UPDATE broadcasts 
                    SET status = 'sending'
                    WHERE id = ?
                `).run(broadcast.id);
                
                // Create RichText for better formatting support
                const rt = new RichText({ text: cleanMessage });
                await rt.detectFacets(agent); // Detect mentions, links, etc.
                
                // Send the post
                const response = await agent.post({
                    text: rt.text,
                    facets: rt.facets,
                    createdAt: new Date().toISOString()
                });
                
                if (response.uri) {
                    console.log(`   ✅ Posted successfully!`);
                    console.log(`   🔗 View at: https://bsky.app/profile/${handle}/post/${response.uri.split('/').pop()}`);
                    
                    // Update broadcast status
                    db.prepare(`
                        UPDATE broadcasts 
                        SET status = 'sent', 
                            sent_at = datetime('now')
                        WHERE id = ?
                    `).run(broadcast.id);
                    
                    console.log(`   ✅ Marked as sent in database`);
                } else {
                    console.error(`   ⚠️  Unexpected response format`);
                    throw new Error('No URI in response');
                }
                
            } catch (error) {
                console.error(`   ❌ Failed to send post:`, error.message);
                
                // Mark as failed in database
                db.prepare(`
                    UPDATE broadcasts 
                    SET status = 'failed'
                    WHERE id = ?
                `).run(broadcast.id);
            }
            
            // Wait between sends to avoid rate limiting
            if (pendingBroadcasts.length > 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        db.close();
        console.log('\n🦋 Bluesky broadcast processing complete!');
        
    } catch (error) {
        console.error('❌ Error sending broadcasts:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    sendBlueskyBroadcasts();
}

module.exports = { sendBlueskyBroadcasts };