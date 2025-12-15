#!/usr/bin/env node

const http = require('http');
const { exec } = require('child_process');
const PORT = 3003;

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
                
                // Trigger the action via the agent's REST API
                const http = require('http');
                const agentReq = http.request({
                    hostname: 'localhost',
                    port: 3000,
                    path: '/7298724c-f4fa-0ff3-b2aa-3660e54108d4/message',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }, (agentRes) => {
                    let responseBody = '';
                    agentRes.on('data', chunk => responseBody += chunk);
                    agentRes.on('end', () => {
                        try {
                            const result = JSON.parse(responseBody);
                            console.log(`Action result:`, result);
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ 
                                success: true, 
                                action: action,
                                output: result[0]?.text || 'Action triggered'
                            }));
                        } catch (e) {
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ 
                                success: true, 
                                action: action,
                                output: responseBody
                            }));
                        }
                    });
                });
                
                agentReq.on('error', (error) => {
                    console.error(`Error: ${error}`);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: error.message }));
                });
                
                agentReq.write(JSON.stringify({
                    text: action,
                    userId: 'system',
                    userName: 'System'
                }));
                agentReq.end();
                
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`Action API running on http://localhost:${PORT}`);
    console.log('');
    console.log('Trigger actions with:');
    console.log('  curl -X POST http://localhost:3003/trigger -H "Content-Type: application/json" -d \'{"action":"SYNC_GITHUB"}\'');
    console.log('  curl -X POST http://localhost:3003/trigger -H "Content-Type: application/json" -d \'{"action":"CREATE_KNOWLEDGE"}\'');
    console.log('  curl -X POST http://localhost:3003/trigger -H "Content-Type: application/json" -d \'{"action":"PROCESS_QUEUE"}\'');
});