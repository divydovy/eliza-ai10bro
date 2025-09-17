#!/usr/bin/env node

/**
 * Create New Broadcasts Script
 * Called by LaunchAgent to generate new broadcasts from documents
 */

const { exec } = require('child_process');

const ACTION_API_PORT = process.env.ACTION_API_PORT || 3003;
const LIMIT = process.env.LIMIT || 10;

async function createBroadcasts() {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Starting broadcast creation...`);

    try {
        // Check if action API is running
        const healthCheck = await new Promise((resolve) => {
            exec(`curl -s http://localhost:${ACTION_API_PORT}/health`, (error, stdout) => {
                resolve(!error && stdout);
            });
        });

        if (!healthCheck) {
            console.error(`[${timestamp}] Action API not available on port ${ACTION_API_PORT}`);
            process.exit(1);
        }

        // Trigger broadcast creation via PROCESS_QUEUE (which handles creating broadcasts when none are pending)
        const command = `curl -s -X POST http://localhost:${ACTION_API_PORT}/trigger -H "Content-Type: application/json" -d '{"action":"PROCESS_QUEUE"}'`;

        exec(command, (error, stdout, stderr) => {
            const endTime = new Date().toISOString();

            if (error) {
                console.error(`[${endTime}] Failed to create broadcasts: ${error.message}`);
                process.exit(1);
            }

            console.log(`[${endTime}] Broadcast creation completed`);
            if (stdout) {
                console.log(`Response: ${stdout}`);
            }

            process.exit(0);
        });

    } catch (error) {
        console.error(`[${timestamp}] Unexpected error: ${error.message}`);
        process.exit(1);
    }
}

// Start the process
createBroadcasts();