#!/usr/bin/env node

const http = require('http');
const Database = require('better-sqlite3');
const path = require('path');

const PORT = 3002;
const db = new Database('./agent/data/db.sqlite', { readonly: true });

const server = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    if (req.method === 'GET' && req.url === '/api/stats') {
        try {
            // Get broadcast statistics
            const stats = db.prepare(`
                SELECT 
                    (SELECT COUNT(*) FROM broadcasts WHERE status = 'sent' AND client = 'telegram') as telegramSent,
                    (SELECT COUNT(*) FROM broadcasts WHERE status = 'pending' AND client = 'telegram') as telegramPending,
                    (SELECT COUNT(*) FROM broadcasts WHERE status = 'failed' AND client = 'telegram') as telegramFailed,
                    (SELECT COUNT(*) FROM broadcasts WHERE status = 'sent' AND client = 'twitter') as twitterSent,
                    (SELECT COUNT(*) FROM broadcasts WHERE status = 'pending' AND client = 'twitter') as twitterPending,
                    (SELECT COUNT(*) FROM broadcasts WHERE status = 'failed' AND client = 'twitter') as twitterFailed,
                    (SELECT COUNT(*) FROM broadcasts) as totalBroadcasts,
                    (SELECT COUNT(DISTINCT documentId) FROM broadcasts) as docsWithBroadcasts,
                    (SELECT COUNT(*) FROM memories WHERE type = 'documents') as totalDocs,
                    (SELECT AVG(alignment_score) FROM broadcasts WHERE status = 'sent') as avgAlignmentScore
            `).get();
            
            // Get recent broadcasts
            const recentBroadcasts = db.prepare(`
                SELECT id, content, client, status, createdAt 
                FROM broadcasts 
                ORDER BY createdAt DESC 
                LIMIT 10
            `).all().map(b => {
                const now = Date.now();
                const created = parseInt(b.createdAt);
                const minutesAgo = Math.floor((now - created) / 60000);
                
                let timeStr;
                if (minutesAgo < 1) timeStr = 'Just now';
                else if (minutesAgo < 60) timeStr = `${minutesAgo} mins ago`;
                else if (minutesAgo < 1440) timeStr = `${Math.floor(minutesAgo / 60)} hours ago`;
                else timeStr = `${Math.floor(minutesAgo / 1440)} days ago`;
                
                return {
                    id: b.id.substring(0, 8),
                    preview: b.content ? b.content.substring(0, 80) + '...' : 'No content',
                    client: b.client,
                    status: b.status,
                    time: timeStr
                };
            });
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                stats: {
                    telegram: {
                        sent: stats.telegramSent || 0,
                        pending: stats.telegramPending || 0,
                        failed: stats.telegramFailed || 0
                    },
                    twitter: {
                        sent: stats.twitterSent || 0,
                        pending: stats.twitterPending || 0,
                        failed: stats.twitterFailed || 0
                    },
                    totalBroadcasts: stats.totalBroadcasts || 0,
                    docsWithBroadcasts: stats.docsWithBroadcasts || 0,
                    totalDocs: stats.totalDocs || 0,
                    coverage: stats.totalDocs > 0 ? ((stats.docsWithBroadcasts / stats.totalDocs) * 100).toFixed(1) : 0,
                    avgAlignmentScore: stats.avgAlignmentScore ? (stats.avgAlignmentScore * 100).toFixed(1) : 0
                },
                recentBroadcasts
            }));
        } catch (error) {
            console.error('Error fetching stats:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

server.listen(PORT, () => {
    console.log(`📊 Broadcast Stats API running on port ${PORT}`);
    console.log(`   http://localhost:${PORT}/api/stats`);
});