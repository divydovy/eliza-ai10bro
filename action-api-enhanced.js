#!/usr/bin/env node

const http = require('http');
const Database = require('better-sqlite3');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const PORT = process.env.ELIZA_ACTION_PORT || 3003;
const db = new Database('./agent/data/db.sqlite');

// Enhanced action handlers with detailed feedback
const actionHandlers = {
    async PROCESS_QUEUE() {
        const result = {
            action: 'PROCESS_QUEUE',
            started: new Date().toISOString(),
            steps: []
        };
        
        try {
            // Check pending broadcasts
            const pending = db.prepare('SELECT COUNT(*) as count FROM broadcasts WHERE status = ?').get('pending');
            result.steps.push({
                step: 'Check pending',
                message: `Found ${pending.count} pending broadcasts`,
                count: pending.count
            });
            
            if (pending.count === 0) {
                // Check for documents without broadcasts
                const unprocessed = db.prepare(`
                    SELECT COUNT(*) as count FROM memories m 
                    WHERE NOT EXISTS (
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
                    result.steps.push({
                        step: 'Trigger processing',
                        message: 'Triggering broadcast generation for unprocessed documents...',
                        status: 'initiated'
                    });
                }
            } else {
                // Process pending broadcasts
                const broadcasts = db.prepare('SELECT * FROM broadcasts WHERE status = ? LIMIT 5').all('pending');
                result.steps.push({
                    step: 'Processing broadcasts',
                    message: `Processing ${broadcasts.length} pending broadcasts...`,
                    items: broadcasts.map(b => ({
                        id: b.id,
                        client: b.client,
                        preview: b.content ? b.content.substring(0, 50) + '...' : 'No content'
                    }))
                });
            }
            
            // Trigger the actual action
            const { stdout } = await execPromise(`curl -s -X POST http://localhost:3000/trigger -H "Content-Type: application/json" -d '{"action":"PROCESS_QUEUE"}'`);
            
            result.success = true;
            result.completed = new Date().toISOString();
            
        } catch (error) {
            result.success = false;
            result.error = error.message;
        }
        
        return result;
    },
    
    async CREATE_KNOWLEDGE() {
        const result = {
            action: 'CREATE_KNOWLEDGE',
            started: new Date().toISOString(),
            steps: []
        };
        
        try {
            // Check current document count
            const before = db.prepare('SELECT COUNT(*) as count FROM memories').get();
            result.steps.push({
                step: 'Initial count',
                message: `Current knowledge base: ${before.count} documents`,
                count: before.count
            });
            
            // Check Obsidian vault
            const vaultPath = '/Users/davidlockie/Library/Mobile Documents/iCloud~md~obsidian/Documents/AI10bro';
            const { stdout: fileList } = await execPromise(`find "${vaultPath}" -name "*.md" -type f | wc -l`);
            const fileCount = parseInt(fileList.trim());
            
            result.steps.push({
                step: 'Scan vault',
                message: `Found ${fileCount} markdown files in Obsidian vault`,
                count: fileCount
            });
            
            // Trigger the import
            const { stdout } = await execPromise(`curl -s -X POST http://localhost:3000/trigger -H "Content-Type: application/json" -d '{"action":"CREATE_KNOWLEDGE"}'`);
            
            // Wait a moment and check new count
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const after = db.prepare('SELECT COUNT(*) as count FROM memories').get();
            const imported = after.count - before.count;
            
            if (imported > 0) {
                result.steps.push({
                    step: 'Import complete',
                    message: `Successfully imported ${imported} new documents`,
                    count: imported,
                    newTotal: after.count
                });
            } else {
                result.steps.push({
                    step: 'Import complete',
                    message: 'No new documents to import (all up to date)',
                    count: 0
                });
            }
            
            result.success = true;
            result.completed = new Date().toISOString();
            
        } catch (error) {
            result.success = false;
            result.error = error.message;
        }
        
        return result;
    },
    
    async SYNC_GITHUB() {
        const result = {
            action: 'SYNC_GITHUB',
            started: new Date().toISOString(),
            steps: []
        };
        
        try {
            result.steps.push({
                step: 'GitHub sync',
                message: 'GitHub sync not yet implemented',
                status: 'pending'
            });
            
            result.success = true;
            result.completed = new Date().toISOString();
            
        } catch (error) {
            result.success = false;
            result.error = error.message;
        }
        
        return result;
    }
};

// Create server
const server = http.createServer(async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    if (req.url === '/trigger' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const action = data.action;
                
                if (actionHandlers[action]) {
                    console.log(`📋 Processing action: ${action}`);
                    const result = await actionHandlers[action]();
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } else {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: false,
                        error: `Unknown action: ${action}`
                    }));
                }
            } catch (error) {
                console.error('Error:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: error.message
                }));
            }
        });
    } else if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy', port: PORT }));
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`
🎯 Enhanced Action API Server
=============================
Port: ${PORT}
Endpoint: http://localhost:${PORT}/trigger
Health: http://localhost:${PORT}/health
=============================
    `);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down...');
    db.close();
    server.close();
    process.exit(0);
});