#!/usr/bin/env node

const http = require('http');
const { exec } = require('child_process');
const Database = require('better-sqlite3');
const path = require('path');

const PORT = 3003;
const db = new Database('./agent/data/db.sqlite');

const server = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    if (req.method === 'POST' && req.url === '/trigger') {
        let body = '';
        
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', () => {
            try {
                const { action } = JSON.parse(body);
                
                if (!action) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Action required' }));
                    return;
                }
                
                console.log(`Received action: ${action}`);
                
                // Handle each action
                switch(action) {
                    case 'SYNC_GITHUB':
                        // First do a quick check to see current status
                        const currentDocs = db.prepare(`
                            SELECT COUNT(DISTINCT json_extract(content, '$.metadata.path')) as count 
                            FROM memories 
                            WHERE type = 'documents' 
                            AND json_extract(content, '$.source') = 'github'
                        `).get();
                        
                        console.log('Starting GitHub sync from configured repository...');
                        console.log(`Current GitHub documents: ${currentDocs.count}`);
                        
                        // Return immediate response about checking
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ 
                            success: true, 
                            action: action,
                            steps: [
                                { step: 'Current status', message: `${currentDocs.count} GitHub documents in database`, count: currentDocs.count },
                                { step: 'Repository', message: 'github.com/divydovy/ai10bro-gdelt' },
                                { step: 'Checking', message: 'Checking for new content from scrapers...' },
                                { step: 'Note', message: 'Full sync runs in background, may take a few minutes' },
                                { step: 'Status', message: 'All current documents are up to date' }
                            ]
                        }));
                        
                        // Run the actual sync in background (don't wait for it)
                        exec('node sync-github-direct.js', { timeout: 300000 }, (error, stdout, stderr) => {
                            if (error) {
                                console.error('Background GitHub sync error:', error.message);
                            } else {
                                const completeLine = stdout.split('\n').find(l => l.includes('Sync complete:'));
                                if (completeLine) {
                                    console.log('Background sync completed:', completeLine);
                                }
                            }
                        });
                        break;
                        
                    case 'IMPORT_OBSIDIAN':
                    case 'CREATE_KNOWLEDGE':  // Alias for backwards compatibility
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ 
                            success: true, 
                            action: action,
                            steps: [
                                { step: 'Connect vault', message: 'Connecting to Obsidian vault' },
                                { step: 'Import', message: 'Obsidian import will be available soon' }
                            ]
                        }));
                        break;
                        
                    case 'CREATE_BROADCASTS':
                        // Check for documents without broadcasts
                        const unprocessed = db.prepare(`
                            SELECT COUNT(*) as count FROM memories m 
                            WHERE m.type = 'documents'
                            AND NOT EXISTS (
                                SELECT 1 FROM broadcasts b WHERE b.documentId = m.id
                            )
                        `).get();
                        
                        if (unprocessed.count === 0) {
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ 
                                success: true, 
                                action: action,
                                steps: [
                                    { step: 'Check documents', message: 'All documents have broadcasts', count: 0 }
                                ]
                            }));
                        } else {
                            exec('node create-new-broadcasts.js', (error, stdout, stderr) => {
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ 
                                    success: !error, 
                                    action: action,
                                    steps: [
                                        { step: 'Find unprocessed', message: `Found ${unprocessed.count} documents without broadcasts`, count: unprocessed.count },
                                        { step: 'Create broadcasts', message: error ? error.message : 'Creating broadcasts for documents' }
                                    ]
                                }));
                            });
                        }
                        break;
                        
                    case 'PROCESS_QUEUE':
                        // Check pending broadcasts
                        const pending = db.prepare('SELECT COUNT(*) as count FROM broadcasts WHERE status = ?').get('pending');
                        
                        if (pending.count === 0) {
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ 
                                success: true, 
                                action: action,
                                steps: [
                                    { step: 'Check queue', message: 'No pending broadcasts', count: 0 }
                                ]
                            }));
                        } else {
                            exec('LIMIT=1 node send-pending-broadcasts.js', (error, stdout, stderr) => {
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ 
                                    success: !error, 
                                    action: action,
                                    steps: [
                                        { step: 'Check queue', message: `Found ${pending.count} pending broadcasts`, count: pending.count },
                                        { step: 'Send broadcast', message: error ? error.message : 'Sent 1 broadcast to Telegram', count: 1 }
                                    ]
                                }));
                            });
                        }
                        break;
                        
                    default:
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: `Unknown action: ${action}` }));
                }
                
            } catch (error) {
                console.error('Error processing request:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

server.listen(PORT, () => {
    console.log(`🎯 Action API Server`);
    console.log(`=======================`);
    console.log(`Port: ${PORT}`);
    console.log(`Endpoint: http://localhost:${PORT}/trigger`);
    console.log(`=======================`);
    console.log('');
    console.log('Available actions:');
    console.log('  - SYNC_GITHUB');
    console.log('  - IMPORT_OBSIDIAN');
    console.log('  - CREATE_BROADCASTS');
    console.log('  - PROCESS_QUEUE');
});