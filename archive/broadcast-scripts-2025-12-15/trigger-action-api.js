#!/usr/bin/env node

const http = require('http');
const { v4: uuidv4 } = require('uuid');

const AGENT_PORT = 3000;
const AGENT_ID = '7298724c-f4fa-0ff3-b2aa-3660e54108d4';

async function makeRequest(options, data) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    resolve(body);
                }
            });
        });
        
        req.on('error', reject);
        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

async function triggerActionViaAPI(actionName) {
    console.log(`\n🚀 Triggering ${actionName} via REST API...`);
    
    // First, send a message requesting the action
    const messageId = uuidv4();
    const messageOptions = {
        hostname: 'localhost',
        port: AGENT_PORT,
        path: `/${AGENT_ID}/message`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    };
    
    const messageData = {
        text: actionName,
        userId: 'system',
        userName: 'System'
    };
    
    try {
        console.log('📤 Sending message to agent...');
        const messageResponse = await makeRequest(messageOptions, messageData);
        console.log('📥 Agent response:', messageResponse);
        
        // Check if action was triggered
        if (messageResponse && messageResponse[0]) {
            const response = messageResponse[0];
            if (response.action && response.action !== 'NONE') {
                console.log(`✅ Action triggered: ${response.action}`);
                console.log(`💬 Response: ${response.text}`);
                return true;
            } else {
                console.log(`⚠️ No action triggered. Response: ${response.text}`);
                return false;
            }
        }
        
        return true;
    } catch (error) {
        console.error(`❌ Error triggering ${actionName}:`, error.message);
        return false;
    }
}

// Parse command line arguments
const action = process.argv[2];

if (!action) {
    console.log('Usage: node trigger-action-api.js <ACTION_NAME>');
    console.log('Available actions:');
    console.log('  SYNC_GITHUB      - Sync GitHub repository documents');
    console.log('  CREATE_KNOWLEDGE - Import Obsidian knowledge base');
    console.log('  PROCESS_QUEUE    - Process pending broadcasts');
    process.exit(1);
}

// Trigger the action
triggerActionViaAPI(action).then(success => {
    process.exit(success ? 0 : 1);
});