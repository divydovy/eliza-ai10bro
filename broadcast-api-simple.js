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

            // Get total broadcasts from broadcasts table
            const totalBroadcasts = db.prepare(`
                SELECT COUNT(*) as count 
                FROM broadcasts
            `).get().count;

            // Get broadcast status breakdown from broadcasts table
            const statusBreakdown = db.prepare(`
                SELECT 
                    status,
                    COUNT(*) as count
                FROM broadcasts
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

            // Get recent broadcast activity from broadcasts table
            const recentActivity = db.prepare(`
                SELECT 
                    content as text,
                    status,
                    client as platform,
                    createdAt,
                    sent_at as sentAt
                FROM broadcasts
                ORDER BY createdAt DESC
                LIMIT 20
            `).all();

            // Format recent activity
            const formattedActivity = recentActivity.map(item => {
                const now = Date.now();
                const created = parseInt(item.createdAt);
                // Handle both timestamp and datetime string formats for sent_at
                let sent = null;
                if (item.sentAt) {
                    if (typeof item.sentAt === 'string' && item.sentAt.includes('-')) {
                        // SQLite datetime format: "2025-08-21 12:47:29"
                        sent = new Date(item.sentAt + ' UTC').getTime();
                    } else {
                        // Unix timestamp
                        sent = parseInt(item.sentAt);
                    }
                }
                
                // Format creation time
                const createdMinutesAgo = Math.floor((now - created) / 60000);
                let createdStr;
                if (createdMinutesAgo < 1) createdStr = 'Just now';
                else if (createdMinutesAgo < 60) createdStr = `${createdMinutesAgo} mins ago`;
                else if (createdMinutesAgo < 1440) createdStr = `${Math.floor(createdMinutesAgo / 60)} hours ago`;
                else createdStr = `${Math.floor(createdMinutesAgo / 1440)} days ago`;
                
                // Format sent time if available
                let sentStr = null;
                if (sent) {
                    const sentMinutesAgo = Math.floor((now - sent) / 60000);
                    if (sentMinutesAgo < 1) sentStr = 'Just now';
                    else if (sentMinutesAgo < 60) sentStr = `${sentMinutesAgo} mins ago`;
                    else if (sentMinutesAgo < 1440) sentStr = `${Math.floor(sentMinutesAgo / 60)} hours ago`;
                    else sentStr = `${Math.floor(sentMinutesAgo / 1440)} days ago`;
                }

                // Show full text content
                // Remove [BROADCAST:id] prefix if present to show actual content
                let textContent = item.text || 'No content';
                textContent = textContent.replace(/^\[BROADCAST:\d+\]\s*/, '');
                // Show full message, not just preview
                const fullText = textContent;

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
                    text: fullText,
                    status: item.status || 'pending',
                    platform: platform,
                    createdTime: createdStr,
                    sentTime: sentStr,
                    time: sentStr || createdStr // Keep backwards compatibility
                };
            });

            // Get documents with broadcasts from broadcasts table
            const docsWithBroadcasts = db.prepare(`
                SELECT COUNT(DISTINCT documentId) as count
                FROM broadcasts
                WHERE documentId IS NOT NULL
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
    // Route: /api/config - Provides configuration for dashboard
    else if (req.url === '/api/config' && req.method === 'GET') {
        res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({
            statsPort: PORT,
            actionPort: process.env.ELIZA_ACTION_PORT || 3000,
            refreshInterval: 30000,
            endpoints: {
                stats: `/api/broadcast-stats`,
                health: `/health`,
                trigger: `http://localhost:${process.env.ELIZA_ACTION_PORT || 3000}/api/trigger`
            }
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