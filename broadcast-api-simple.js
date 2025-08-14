#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Configuration
const PORT = process.env.BROADCAST_API_PORT || 3001;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'agent/data/db.sqlite');

// Initialize database connection
let db;
try {
    db = new Database(DB_PATH, { readonly: true });
    console.log(`✅ Connected to database at: ${DB_PATH}`);
} catch (error) {
    console.error('❌ Failed to connect to database:', error);
    process.exit(1);
}

// Create HTTP server
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

    // Route: /api/broadcast-stats
    if (req.url === '/api/broadcast-stats' && req.method === 'GET') {
        try {
            // Get total documents
            const totalDocs = db.prepare(`
                SELECT COUNT(*) as count 
                FROM memories 
                WHERE type = 'documents'
            `).get().count;

            // Get total broadcasts
            const totalBroadcasts = db.prepare(`
                SELECT COUNT(*) as count 
                FROM memories 
                WHERE type = 'messages' 
                AND json_extract(content, '$.metadata.messageType') = 'broadcast'
            `).get().count;

            // Get broadcast status breakdown
            const statusBreakdown = db.prepare(`
                SELECT 
                    json_extract(content, '$.metadata.status') as status,
                    COUNT(*) as count
                FROM memories 
                WHERE type = 'messages' 
                AND json_extract(content, '$.metadata.messageType') = 'broadcast'
                GROUP BY status
            `).all();

            // Calculate status counts
            let pendingBroadcasts = 0;
            let sentBroadcasts = 0;
            let failedBroadcasts = 0;

            statusBreakdown.forEach(row => {
                if (row.status === 'pending') pendingBroadcasts = row.count;
                else if (row.status === 'sent') sentBroadcasts = row.count;
                else if (row.status === 'failed') failedBroadcasts = row.count;
            });

            // If all broadcasts show as null status, assume they're pending
            if (pendingBroadcasts === 0 && sentBroadcasts === 0 && failedBroadcasts === 0) {
                pendingBroadcasts = totalBroadcasts;
            }

            // Get recent broadcast activity
            const recentActivity = db.prepare(`
                SELECT 
                    json_extract(content, '$.text') as text,
                    json_extract(content, '$.metadata.status') as status,
                    json_extract(content, '$.metadata.platform') as platform,
                    createdAt
                FROM memories 
                WHERE type = 'messages' 
                AND json_extract(content, '$.metadata.messageType') = 'broadcast'
                ORDER BY createdAt DESC
                LIMIT 20
            `).all();

            // Format recent activity
            const formattedActivity = recentActivity.map(item => {
                const now = Date.now();
                const created = parseInt(item.createdAt);
                const minutesAgo = Math.floor((now - created) / 60000);
                
                let timeStr;
                if (minutesAgo < 1) timeStr = 'Just now';
                else if (minutesAgo < 60) timeStr = `${minutesAgo} mins ago`;
                else if (minutesAgo < 1440) timeStr = `${Math.floor(minutesAgo / 60)} hours ago`;
                else timeStr = `${Math.floor(minutesAgo / 1440)} days ago`;

                // Extract first line of text for display
                // Remove [BROADCAST:id] prefix if present to show actual content
                let textContent = item.text || 'No content';
                textContent = textContent.replace(/^\[BROADCAST:\d+\]\s*/, '');
                const textPreview = textContent.split('\n')[0].substring(0, 100) + 
                    (textContent.length > 100 ? '...' : '');

                // Guess platform from text content if not specified
                let platform = item.platform || 'unknown';
                if (!item.platform && item.text) {
                    if (item.text.includes('🔗') || item.text.length > 280) {
                        platform = 'telegram';
                    } else {
                        platform = 'twitter';
                    }
                }

                return {
                    text: textPreview,
                    status: item.status || 'pending',
                    platform: platform,
                    time: timeStr
                };
            });

            // Get documents with broadcasts
            const docsWithBroadcasts = db.prepare(`
                SELECT COUNT(DISTINCT json_extract(content, '$.metadata.sourceMemoryId')) as count
                FROM memories 
                WHERE type = 'messages' 
                AND json_extract(content, '$.metadata.messageType') = 'broadcast'
                AND json_extract(content, '$.metadata.sourceMemoryId') IS NOT NULL
            `).get().count;

            const response = {
                totalDocuments: totalDocs,
                totalBroadcasts: totalBroadcasts,
                pendingBroadcasts: pendingBroadcasts,
                sentBroadcasts: sentBroadcasts,
                failedBroadcasts: failedBroadcasts,
                docsWithBroadcasts: docsWithBroadcasts,
                docsWithoutBroadcasts: Math.max(0, totalDocs - docsWithBroadcasts),
                recentActivity: formattedActivity,
                lastUpdated: new Date().toISOString()
            };

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response));
        } catch (error) {
            console.error('Error fetching broadcast stats:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to fetch broadcast statistics' }));
        }
    }
    // Route: /broadcast-dashboard.html
    else if (req.url === '/broadcast-dashboard.html' && req.method === 'GET') {
        const dashboardPath = path.join(__dirname, 'broadcast-dashboard.html');
        fs.readFile(dashboardPath, 'utf8', (err, data) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Dashboard not found');
            } else {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(data);
            }
        });
    }
    // Route: /health
    else if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            status: 'healthy', 
            database: db ? 'connected' : 'disconnected',
            uptime: process.uptime()
        }));
    }
    // Default route
    else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

// Start server
server.listen(PORT, () => {
    console.log(`
🚀 Broadcast Dashboard API Server (Simple Version)
==================================================
📊 Dashboard: http://localhost:${PORT}/broadcast-dashboard.html
🔌 API Endpoint: http://localhost:${PORT}/api/broadcast-stats
💚 Health: http://localhost:${PORT}/health
==================================================
    `);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down gracefully...');
    if (db) db.close();
    process.exit(0);
});