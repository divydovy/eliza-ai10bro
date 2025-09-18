// Round-Robin Implementation for PROCESS_QUEUE
// This module can be integrated into action-api.js

/**
 * Fair Share Distribution - Option 2
 * Ensures each platform gets equal attention when processing broadcasts
 *
 * @param {Database} db - SQLite database instance
 * @param {number} broadcastsToSend - Total number of broadcasts to send
 * @returns {Array} Array of broadcasts to process
 */
async function getNextBroadcastsRoundRobin(db, broadcastsToSend = 1) {
    // Define active platforms (can be made configurable)
    const platforms = ['telegram', 'farcaster', 'bluesky'];

    // Calculate how many broadcasts per platform
    const perPlatform = Math.ceil(broadcastsToSend / platforms.length);

    const allBroadcasts = [];

    // Get pending broadcasts from each platform
    for (const platform of platforms) {
        const platformBroadcasts = db.prepare(`
            SELECT * FROM broadcasts
            WHERE status = 'pending'
            AND client = ?
            ORDER BY createdAt ASC
            LIMIT ?
        `).all(platform, perPlatform);

        // Add platform broadcasts to the collection
        if (platformBroadcasts.length > 0) {
            console.log(`📱 Found ${platformBroadcasts.length} pending ${platform} broadcasts`);
            allBroadcasts.push(...platformBroadcasts);
        }
    }

    // Interleave broadcasts for true round-robin
    const interleavedBroadcasts = [];
    let maxLength = Math.max(...platforms.map(p =>
        allBroadcasts.filter(b => b.client === p).length
    ));

    for (let i = 0; i < maxLength; i++) {
        for (const platform of platforms) {
            const platformBroadcasts = allBroadcasts.filter(b => b.client === platform);
            if (platformBroadcasts[i]) {
                interleavedBroadcasts.push(platformBroadcasts[i]);
            }
        }
    }

    // Return only the requested number of broadcasts
    return interleavedBroadcasts.slice(0, broadcastsToSend);
}

/**
 * Enhanced PROCESS_QUEUE handler with round-robin distribution
 * Replace the existing PROCESS_QUEUE function in action-api.js with this
 */
async function PROCESS_QUEUE_ROUND_ROBIN() {
    const result = {
        action: 'PROCESS_QUEUE',
        started: new Date().toISOString(),
        steps: [],
        platforms: {}
    };

    try {
        // Check total pending broadcasts
        const pending = db.prepare('SELECT COUNT(*) as count FROM broadcasts WHERE status = ?').get('pending');
        result.steps.push({
            step: 'Check pending',
            message: `Found ${pending.count} total pending broadcasts`,
            count: pending.count
        });

        if (pending.count === 0) {
            // Check for unprocessed documents
            const unprocessed = db.prepare(`
                SELECT COUNT(*) as count FROM memories m
                WHERE m.type = 'documents'
                AND NOT EXISTS (
                    SELECT 1 FROM broadcasts b WHERE b.documentId = m.id
                ) AND json_extract(m.content, '$.text') IS NOT NULL
                AND length(json_extract(m.content, '$.text')) > 100
            `).get();

            result.steps.push({
                step: 'Check unprocessed',
                message: `Found ${unprocessed.count} documents without broadcasts`,
                count: unprocessed.count
            });

            if (unprocessed.count > 0) {
                // Create broadcasts logic here...
                result.steps.push({
                    step: 'Suggestion',
                    message: 'Run CREATE_BROADCASTS to generate new broadcasts'
                });
            }

            result.success = true;
            result.completed = new Date().toISOString();
            return result;
        }

        // Get broadcasts using round-robin distribution
        const broadcastsToProcess = await getNextBroadcastsRoundRobin(db, 1); // Send 1 by default

        if (broadcastsToProcess.length === 0) {
            result.steps.push({
                step: 'No broadcasts',
                message: 'No broadcasts selected for processing'
            });
            result.success = true;
            return result;
        }

        // Track broadcasts by platform
        for (const broadcast of broadcastsToProcess) {
            if (!result.platforms[broadcast.client]) {
                result.platforms[broadcast.client] = 0;
            }
            result.platforms[broadcast.client]++;
        }

        result.steps.push({
            step: 'Selected broadcasts',
            message: `Processing ${broadcastsToProcess.length} broadcast(s) across platforms`,
            platforms: result.platforms
        });

        // Process each broadcast
        for (const broadcast of broadcastsToProcess) {
            try {
                // Mark as sending to prevent race conditions
                db.prepare('UPDATE broadcasts SET status = ? WHERE id = ?')
                    .run('sending', broadcast.id);

                // Determine the send script based on client
                let sendScript;
                const client = broadcast.client || 'telegram';

                switch (client.toLowerCase()) {
                    case 'telegram':
                        sendScript = 'send-pending-to-telegram.js';
                        break;
                    case 'bluesky':
                        sendScript = 'send-pending-to-bluesky.js';
                        break;
                    case 'farcaster':
                        sendScript = 'send-pending-to-farcaster.js';
                        break;
                    case 'threads':
                        sendScript = 'send-pending-to-threads.js';
                        break;
                    case 'twitter':
                    case 'x':
                        sendScript = 'send-pending-to-twitter.js';
                        break;
                    default:
                        console.log(`⚠️ Unknown client '${client}', defaulting to Telegram`);
                        sendScript = 'send-pending-to-telegram.js';
                        break;
                }

                console.log(`📤 Sending broadcast ${broadcast.id} via ${client} using ${sendScript}`);

                // Execute the send script
                const { execSync } = await import('child_process');
                const output = execSync(`node ${sendScript}`, {
                    encoding: 'utf8',
                    env: { ...process.env, BROADCAST_ID: broadcast.id }
                });

                // Check if sent successfully
                const updatedBroadcast = db.prepare('SELECT status FROM broadcasts WHERE id = ?').get(broadcast.id);

                if (updatedBroadcast.status === 'sent') {
                    result.steps.push({
                        step: 'Sent',
                        platform: client,
                        message: `Successfully sent ${client} broadcast`,
                        broadcastId: broadcast.id,
                        status: 'success'
                    });
                } else {
                    result.steps.push({
                        step: 'Failed',
                        platform: client,
                        message: `Failed to send ${client} broadcast`,
                        broadcastId: broadcast.id,
                        status: 'error'
                    });
                }

            } catch (error) {
                console.error(`Error processing broadcast ${broadcast.id}:`, error.message);

                // Mark as failed
                db.prepare('UPDATE broadcasts SET status = ? WHERE id = ?')
                    .run('failed', broadcast.id);

                result.steps.push({
                    step: 'Error',
                    message: `Error processing broadcast ${broadcast.id}: ${error.message}`,
                    status: 'error'
                });
            }
        }

        result.success = true;
        result.completed = new Date().toISOString();

    } catch (error) {
        result.success = false;
        result.error = error.message;
    }

    return result;
}

export {
    getNextBroadcastsRoundRobin,
    PROCESS_QUEUE_ROUND_ROBIN
};