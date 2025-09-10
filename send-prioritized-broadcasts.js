#!/usr/bin/env node

/**
 * Sends broadcasts with prioritization based on recency and quality
 * Respects enabled clients configuration
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function sendPrioritizedBroadcasts() {
    try {
        // Load character configuration for enabled clients
        const characterPath = path.join(process.cwd(), 'characters/ai10bro.character.json');
        const character = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));
        
        // Map character clients to broadcast clients
        const clientMapping = {
            'telegram': 'telegram',
            'twitter': 'twitter',
            'x': 'twitter',
            'farcaster': 'farcaster',
            'discord': 'discord'
        };
        
        // Get enabled clients from character file
        const enabledClients = (character.clients || [])
            .map(client => clientMapping[client.toLowerCase()])
            .filter(client => client && ['telegram', 'twitter', 'farcaster'].includes(client));
        
        // Load additional config for prioritization settings
        const configPath = path.join(process.cwd(), 'broadcast-config.json');
        let config = {
            prioritization: { recencyBias: true, recencyWindow: 7 },
            limits: { minTimeBetweenBroadcasts: 300000 }
        };
        
        if (fs.existsSync(configPath)) {
            const loadedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            config.prioritization = loadedConfig.prioritization || config.prioritization;
            config.limits = loadedConfig.limits || config.limits;
        }
        
        if (enabledClients.length === 0) {
            console.log('⚠️  No broadcast clients are enabled');
            return;
        }
        
        const dbPath = path.join(process.cwd(), 'agent/data/db.sqlite');
        const db = Database(dbPath);
        
        // Check when last broadcast was sent
        const lastSent = db.prepare(`
            SELECT MAX(sent_at) as last_sent 
            FROM broadcasts 
            WHERE status = 'sent'
        `).get();
        
        if (lastSent?.last_sent) {
            const timeSinceLastBroadcast = Date.now() - lastSent.last_sent;
            if (timeSinceLastBroadcast < config.limits.minTimeBetweenBroadcasts) {
                const waitTime = Math.ceil((config.limits.minTimeBetweenBroadcasts - timeSinceLastBroadcast) / 1000);
                console.log(`⏱️  Waiting ${waitTime} seconds before next broadcast (rate limit)`);
                return;
            }
        }
        
        // Get pending broadcasts prioritized by recency and quality
        let query;
        const limit = parseInt(process.env.LIMIT) || 1;
        
        if (config.prioritization.recencyBias) {
            // Calculate recency window
            const windowMs = config.prioritization.recencyWindow * 24 * 60 * 60 * 1000;
            const cutoffTime = Date.now() - windowMs;
            
            // Prioritize recent documents' broadcasts
            query = `
                SELECT b.*, m.createdAt as document_created
                FROM broadcasts b
                JOIN memories m ON b.documentId = m.id
                WHERE b.status = 'pending'
                AND b.client IN (${enabledClients.map(() => '?').join(',')})
                ORDER BY 
                    CASE WHEN m.createdAt > ? THEN 0 ELSE 1 END,
                    b.alignment_score DESC,
                    m.createdAt DESC
                LIMIT ?
            `;
            
            var pendingBroadcasts = db.prepare(query).all(...enabledClients, cutoffTime, limit);
        } else {
            // No recency bias - just use quality score
            query = `
                SELECT b.*, m.createdAt as document_created
                FROM broadcasts b
                JOIN memories m ON b.documentId = m.id
                WHERE b.status = 'pending'
                AND b.client IN (${enabledClients.map(() => '?').join(',')})
                ORDER BY b.alignment_score DESC, b.createdAt ASC
                LIMIT ?
            `;
            
            var pendingBroadcasts = db.prepare(query).all(...enabledClients, limit);
        }
        
        if (pendingBroadcasts.length === 0) {
            console.log('📭 No pending broadcasts in queue');
            return;
        }
        
        console.log(`📤 Sending ${pendingBroadcasts.length} prioritized broadcast(s)`);
        
        for (const broadcast of pendingBroadcasts) {
            const isRecent = broadcast.document_created > Date.now() - (config.prioritization.recencyWindow * 24 * 60 * 60 * 1000);
            const quality = (broadcast.alignment_score * 100).toFixed(0);
            
            console.log(`\n🎯 Broadcasting to ${broadcast.client}`);
            console.log(`   📊 Quality: ${quality}%`);
            console.log(`   📅 Document: ${isRecent ? '✨ Recent' : '📚 Backfill'}`);
            console.log(`   📝 Preview: ${broadcast.content.substring(0, 100)}...`);
            
            try {
                // Call the appropriate send script based on client
                let command;
                switch(broadcast.client) {
                    case 'telegram':
                        command = `BROADCAST_ID=${broadcast.id} node send-pending-broadcasts.js`;
                        break;
                    case 'twitter':
                        command = `BROADCAST_ID=${broadcast.id} node send-x-broadcasts.js`;
                        break;
                    case 'farcaster':
                        command = `BROADCAST_ID=${broadcast.id} node send-farcaster-broadcasts.js`;
                        break;
                    default:
                        console.log(`   ⚠️  Unknown client: ${broadcast.client}`);
                        continue;
                }
                
                const { stdout, stderr } = await execAsync(command);
                
                if (stderr) {
                    console.error(`   ❌ Error: ${stderr}`);
                } else {
                    console.log(`   ✅ Sent successfully!`);
                }
                
                // Wait between broadcasts
                if (pendingBroadcasts.length > 1) {
                    const waitTime = Math.ceil(config.limits.minTimeBetweenBroadcasts / 1000);
                    console.log(`   ⏱️  Waiting ${waitTime} seconds before next broadcast...`);
                    await new Promise(resolve => setTimeout(resolve, config.limits.minTimeBetweenBroadcasts));
                }
                
            } catch (error) {
                console.error(`   ❌ Failed to send: ${error.message}`);
            }
        }
        
        db.close();
        console.log('\n✨ Broadcast sending complete!');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    sendPrioritizedBroadcasts();
}

module.exports = sendPrioritizedBroadcasts;