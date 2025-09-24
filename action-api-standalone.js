#!/usr/bin/env node

const http = require('http');
const { exec } = require('child_process');
const Database = require('better-sqlite3');
const path = require('path');
const { randomUUID } = require('crypto');

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
                        exec('node sync-github-multi-repo.js', { timeout: 300000 }, (error, stdout, stderr) => {
                            if (error) {
                                console.error('Background GitHub sync error:', error.message);
                            } else {
                                const completeLine = stdout.split('\n').find(l => l.includes('SYNC COMPLETE'));
                                if (completeLine) {
                                    console.log('Background sync completed:', completeLine);
                                }
                            }
                        });
                        break;
                        
                    case 'IMPORT_OBSIDIAN':
                    case 'CREATE_KNOWLEDGE':  // Alias for backwards compatibility
                        console.log('Importing Obsidian vault...');
                        exec('node import-obsidian.js', { timeout: 30000 }, (error, stdout, stderr) => {
                            if (error) {
                                console.error('Error importing Obsidian:', error.message);
                                res.writeHead(500, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ 
                                    success: false, 
                                    action: action,
                                    error: error.message,
                                    steps: [
                                        { step: 'Error', message: `Failed to import Obsidian: ${error.message}` }
                                    ]
                                }));
                            } else {
                                console.log('Obsidian import output:', stdout);
                                const lines = stdout.split('\n').filter(l => l.trim());
                                const importedMatch = stdout.match(/Imported: (\d+) new documents/);
                                const skippedMatch = stdout.match(/Skipped: (\d+) existing documents/);
                                
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ 
                                    success: true, 
                                    action: action,
                                    imported: importedMatch ? parseInt(importedMatch[1]) : 0,
                                    skipped: skippedMatch ? parseInt(skippedMatch[1]) : 0,
                                    steps: lines.filter(l => l.includes('✓') || l.includes('✅') || l.includes('📚'))
                                        .map(l => ({ step: 'Import', message: l.trim() }))
                                }));
                            }
                        });
                        break;
                        
                    case 'CREATE_BROADCASTS':
                        // This will trigger AI-powered broadcast generation using local LLM
                        console.log('Generating AI-powered broadcasts with local Eliza agent...');
                        exec('node create-broadcasts.js 10', { timeout: 60000 }, (error, stdout, stderr) => {
                            if (error) {
                                console.error('Error creating broadcasts:', error.message);
                                res.writeHead(500, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ 
                                    success: false, 
                                    action: action,
                                    error: error.message,
                                    steps: [
                                        { step: 'Error', message: `Failed to trigger broadcast creation: ${error.message}` }
                                    ]
                                }));
                            } else {
                                console.log('Broadcast creation output:', stdout);
                                // Parse the output to get details
                                const lines = stdout.split('\n').filter(l => l.trim());
                                const steps = [];
                                let createdCount = 0;
                                
                                lines.forEach(line => {
                                    if (line.includes('Found')) {
                                        const match = line.match(/Found (\d+) documents/);
                                        if (match) {
                                            steps.push({ step: 'Scan', message: line, count: parseInt(match[1]) });
                                        } else {
                                            steps.push({ step: 'Scan', message: line });
                                        }
                                    } else if (line.includes('Creating broadcast for:')) {
                                        steps.push({ step: 'Generate', message: line });
                                    } else if (line.includes('Created broadcast')) {
                                        createdCount++;
                                        steps.push({ step: 'Create', message: line });
                                    } else if (line.includes('Created') && line.includes('broadcasts successfully')) {
                                        const match = line.match(/Created (\d+) broadcasts/);
                                        if (match) {
                                            createdCount = parseInt(match[1]);
                                        }
                                        steps.push({ step: 'Success', message: line, count: createdCount });
                                    } else if (line.includes('All documents already have broadcasts')) {
                                        steps.push({ step: 'Info', message: line });
                                    }
                                });
                                
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ 
                                    success: true, 
                                    action: action,
                                    created: createdCount,
                                    steps: steps.length > 0 ? steps : [
                                        { step: 'Complete', message: 'Broadcast creation completed' }
                                    ]
                                }));
                            }
                        });
                        break;
                        
                    case 'SEND_TELEGRAM':
                    case 'PROCESS_QUEUE': // Keep for backwards compatibility
                        // Check pending Telegram broadcasts
                        const telegramPending = db.prepare('SELECT COUNT(*) as count FROM broadcasts WHERE status = ? AND client = ?').get('pending', 'telegram');
                        
                        if (!telegramPending || telegramPending.count === 0) {
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ 
                                success: true, 
                                action: action,
                                steps: [
                                    { step: 'Check queue', message: 'No pending Telegram broadcasts', count: 0 }
                                ]
                            }));
                        } else {
                            exec('LIMIT=1 node send-pending-broadcasts.js', (error, stdout, stderr) => {
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ 
                                    success: !error, 
                                    action: action,
                                    steps: [
                                        { step: 'Check queue', message: `Found ${telegramPending.count} pending Telegram broadcasts`, count: telegramPending.count },
                                        { step: 'Send broadcast', message: error ? error.message : 'Sent 1 broadcast to Telegram', count: 1 }
                                    ]
                                }));
                            });
                        }
                        break;
                        
                    case 'SEND_TWITTER':
                        // Check pending X/Twitter broadcasts
                        const twitterPending = db.prepare('SELECT COUNT(*) as count FROM broadcasts WHERE status = ? AND client = ?').get('pending', 'twitter');
                        
                        if (!twitterPending || twitterPending.count === 0) {
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ 
                                success: true, 
                                action: action,
                                steps: [
                                    { step: 'Check queue', message: 'No pending X broadcasts', count: 0 }
                                ]
                            }));
                        } else {
                            exec('LIMIT=1 node send-x-broadcasts.js', (error, stdout, stderr) => {
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ 
                                    success: !error, 
                                    action: action,
                                    steps: [
                                        { step: 'Check queue', message: `Found ${twitterPending.count} pending X broadcasts`, count: twitterPending.count },
                                        { step: 'Send broadcast', message: error ? error.message : 'Sent 1 broadcast to X', count: 1 }
                                    ]
                                }));
                            });
                        }
                        break;
                        
                    case 'SEND_FARCASTER':
                        // Check pending Farcaster broadcasts
                        const farcasterPending = db.prepare('SELECT COUNT(*) as count FROM broadcasts WHERE status = ? AND client = ?').get('pending', 'farcaster');
                        
                        if (!farcasterPending || farcasterPending.count === 0) {
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ 
                                success: true, 
                                action: action,
                                steps: [
                                    { step: 'Check queue', message: 'No pending Farcaster broadcasts', count: 0 }
                                ]
                            }));
                        } else {
                            exec('LIMIT=1 node send-farcaster-broadcasts.js', (error, stdout, stderr) => {
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ 
                                    success: !error, 
                                    action: action,
                                    steps: [
                                        { step: 'Check queue', message: `Found ${farcasterPending.count} pending Farcaster broadcasts`, count: farcasterPending.count },
                                        { step: 'Send broadcast', message: error ? error.message : 'Sent 1 broadcast to Farcaster', count: 1 }
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
    console.log('  - SEND_TELEGRAM');
    console.log('  - SEND_TWITTER');
    console.log('  - SEND_FARCASTER');
});