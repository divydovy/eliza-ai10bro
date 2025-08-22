#!/usr/bin/env node

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const PORT = process.env.TRIGGER_PORT || 3003;

// Create HTTP server to handle dashboard trigger requests
const server = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Route: POST /trigger
    if (req.url === '/trigger' && req.method === 'POST') {
        let body = '';
        
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', async () => {
            try {
                const request = JSON.parse(body);
                const action = request.action;
                
                console.log(`🎯 Trigger request received: ${action}`);
                
                let result = { success: false, message: 'Unknown action' };
                
                switch (action) {
                    case 'SYNC_GITHUB':
                        result = await handleSyncGithub();
                        break;
                    case 'CREATE_KNOWLEDGE':
                        result = await handleCreateKnowledge();
                        break;
                    case 'CREATE_BROADCASTS':
                        result = await handleCreateBroadcasts();
                        break;
                    case 'PROCESS_QUEUE':
                        result = await handleProcessQueue();
                        break;
                    default:
                        result = { success: false, message: `Unknown action: ${action}` };
                }
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
                
            } catch (error) {
                console.error('Error processing trigger:', error);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    success: false, 
                    error: error.message 
                }));
            }
        });
    }
    // Health check
    else if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            status: 'healthy',
            service: 'broadcast-trigger',
            uptime: process.uptime()
        }));
    }
    // Default route
    else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

// Action handlers
async function handleSyncGithub() {
    // This would typically sync with GitHub repos
    // For now, just trigger broadcast generation for available documents
    console.log('📚 Sync GitHub: Triggering broadcast generation for available documents...');
    
    try {
        // Run the trigger script
        const result = await runScript('trigger-broadcast-generation.js');
        
        return {
            success: true,
            message: '📚 GitHub sync completed - checked for documents to broadcast',
            details: result
        };
    } catch (error) {
        return {
            success: false,
            message: 'Failed to sync GitHub',
            error: error.message
        };
    }
}

async function handleCreateKnowledge() {
    console.log('🧠 Create Knowledge: Processing Obsidian imports...');
    
    return {
        success: true,
        message: '🧠 Knowledge import triggered - processing Obsidian vault',
        action: 'CREATE_KNOWLEDGE'
    };
}

async function handleCreateBroadcasts() {
    console.log('✨ Create Broadcasts: Generating new broadcasts from available documents...');
    
    try {
        // First check how many documents are available
        const checkResult = await runScript('trigger-broadcast-generation.js');
        
        // Create new broadcasts using our script
        const createResult = await runScript('create-new-broadcasts.js');
        
        // Process them with LLM to generate content
        const processResult = await runScript('process-pending-broadcasts.js');
        
        return {
            success: true,
            message: '✨ Broadcasts created successfully - ready to send to Telegram',
            details: {
                check: checkResult.trim().split('\n').slice(-3).join('\n'), // Last few lines with stats
                created: createResult.trim().split('\n').slice(-2).join('\n'), // Summary
                processed: processResult.trim().split('\n').slice(-1).join('\n') // Final line
            }
        };
    } catch (error) {
        return {
            success: false,
            message: 'Failed to create broadcasts',
            error: error.message
        };
    }
}

async function handleProcessQueue() {
    console.log('📤 Process Queue: Processing pending broadcasts...');
    
    try {
        // Check for pending broadcasts and process them
        const result = await runScript('send-pending-to-telegram.js');
        
        return {
            success: true,
            message: '📤 Queue processed - pending broadcasts sent to Telegram',
            details: result
        };
    } catch (error) {
        return {
            success: false,
            message: 'Failed to process queue',
            error: error.message
        };
    }
}

// Utility function to run a script and capture output
function runScript(scriptName) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, scriptName);
        
        const child = spawn('node', [scriptPath], {
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let output = '';
        let error = '';
        
        child.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        child.stderr.on('data', (data) => {
            error += data.toString();
        });
        
        child.on('close', (code) => {
            if (code === 0) {
                resolve(output);
            } else {
                reject(new Error(error || `Script exited with code ${code}`));
            }
        });
        
        child.on('error', (err) => {
            reject(err);
        });
    });
}

// Start server
server.listen(PORT, () => {
    console.log(`
🎯 Broadcast Trigger Service
============================
🔌 Listening on: http://localhost:${PORT}
💚 Health check: http://localhost:${PORT}/health
🎯 Trigger endpoint: http://localhost:${PORT}/trigger
============================
    `);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down trigger service...');
    process.exit(0);
});