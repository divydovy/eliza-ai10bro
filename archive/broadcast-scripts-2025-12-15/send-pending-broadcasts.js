#!/usr/bin/env node

/**
 * Wrapper script to send pending broadcasts to all platforms
 * Called by action-api-standalone.js
 */

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function sendBroadcasts() {
    const limit = process.env.LIMIT || 1;
    console.log(`Sending ${limit} broadcast(s) to all platforms...`);

    const platforms = [
        { name: 'Telegram', script: 'send-pending-to-telegram.js' },
        // Farcaster disabled - no active Neynar signer
        // { name: 'Farcaster', script: 'send-pending-to-farcaster.js' },
        { name: 'Bluesky', script: 'send-pending-to-bluesky.js' }
    ];

    let totalSent = 0;

    for (const platform of platforms) {
        try {
            console.log(`\nChecking ${platform.name}...`);
            const { stdout } = await execPromise(`LIMIT=${limit} node ${platform.script}`);
            console.log(stdout);

            // Count sent broadcasts from output
            const sentMatch = stdout.match(/sent (\d+) broadcast/i);
            if (sentMatch) {
                totalSent += parseInt(sentMatch[1]);
            }
        } catch (error) {
            console.error(`Error sending to ${platform.name}:`, error.message);
        }
    }

    console.log(`\n✅ Total broadcasts sent: ${totalSent}`);
    process.exit(0);
}

sendBroadcasts().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});