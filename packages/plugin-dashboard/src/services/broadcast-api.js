#!/usr/bin/env node

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.broadcast
const envPath = path.join(path.dirname(__dirname), '../../.env.broadcast');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        if (line && !line.startsWith('#') && line.includes('=')) {
            const [key, value] = line.split('=');
            if (!process.env[key.trim()]) {
                process.env[key.trim()] = value.trim();
            }
        }
    });
}

// Configuration
const PORT = process.env.BROADCAST_API_PORT || 3001;
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'agent/data/db.sqlite');

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

            // Get platform-specific stats
            const platformStats = {};
            const platformBreakdown = db.prepare(`
                SELECT
                    client as platform,
                    status,
                    COUNT(*) as count
                FROM broadcasts
                GROUP BY client, status
            `).all();

            platformBreakdown.forEach(row => {
                if (!platformStats[row.platform]) {
                    platformStats[row.platform] = { sent: 0, pending: 0, failed: 0 };
                }
                if (row.status === 'sent') platformStats[row.platform].sent = row.count;
                else if (row.status === 'pending') platformStats[row.platform].pending = row.count;
                else if (row.status === 'failed') platformStats[row.platform].failed = row.count;
            });

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
                platformStats: platformStats,
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
        // Try multiple possible locations for the dashboard HTML
        const possiblePaths = [
            path.join(__dirname, '../public/broadcast-dashboard.html'),
            path.join(__dirname, 'broadcast-dashboard.html'),
            path.join(process.cwd(), 'broadcast-dashboard.html'),
            path.join(process.cwd(), 'packages/plugin-dashboard/src/public/broadcast-dashboard.html')
        ];

        let fileFound = false;
        for (const dashboardPath of possiblePaths) {
            if (fs.existsSync(dashboardPath)) {
                const data = fs.readFileSync(dashboardPath, 'utf8');
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(data);
                fileFound = true;
                break;
            }
        }

        if (!fileFound) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Dashboard not found');
        }
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
            actionPort: process.env.ELIZA_ACTION_PORT || 3003,
            refreshInterval: 30000,
            endpoints: {
                stats: `/api/broadcast-stats`,
                health: `/health`,
                trigger: `http://localhost:${process.env.ELIZA_ACTION_PORT || 3003}/trigger`
            }
        }));
    }
    // Route: /api/recent-broadcasts
    else if (req.url === '/api/recent-broadcasts' && req.method === 'GET') {
        try {
            const broadcasts = db.prepare(`
                SELECT
                    content,
                    status,
                    client as platform,
                    createdAt,
                    sent_at
                FROM broadcasts
                ORDER BY createdAt DESC
                LIMIT 20
            `).all();

            const formattedBroadcasts = broadcasts.map(b => {
                let content = b.content;
                try {
                    const parsed = JSON.parse(content);
                    content = parsed.text || content;
                } catch (e) {
                    // Content is plain text
                }

                return {
                    preview: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
                    fullContent: content,
                    status: b.status || 'pending',
                    platform: b.platform || 'unknown',
                    createdTime: new Date(parseInt(b.createdAt)).toLocaleString(),
                    sentTime: b.sent_at ? new Date(parseInt(b.sent_at)).toLocaleString() : null
                };
            });

            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify(formattedBroadcasts));
        } catch (error) {
            console.error('Error fetching recent broadcasts:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to fetch broadcasts' }));
        }
    }
    // Route: /api/recent-documents
    else if (req.url === '/api/recent-documents' && req.method === 'GET') {
        try {
            const documents = db.prepare(`
                SELECT
                    content,
                    createdAt,
                    type
                FROM memories
                WHERE type = 'documents'
                ORDER BY createdAt DESC
                LIMIT 50
            `).all();

            const formattedDocs = documents.map(doc => {
                let parsed = {};
                try {
                    parsed = JSON.parse(doc.content);
                } catch (e) {
                    parsed = { text: doc.content };
                }

                const source = parsed.source || parsed.url || '';
                let sourceType = 'unknown';

                if (source.includes('obsidian')) sourceType = 'obsidian';
                else if (source.includes('github')) sourceType = 'github';
                else if (source.includes('arxiv')) sourceType = 'arxiv';
                else if (source.includes('gdelt')) sourceType = 'github-gdelt';
                else if (source.includes('youtube')) sourceType = 'youtube';
                else if (source.includes('reddit')) sourceType = 'reddit';
                else if (source.includes('nature')) sourceType = 'nature';
                else if (source.includes('http')) sourceType = 'web';

                // Handle both timestamp and datetime string formats
                let createdTime;
                if (typeof doc.createdAt === 'string' && doc.createdAt.includes('-')) {
                    // SQLite datetime format: "2025-09-13 06:03:18"
                    createdTime = new Date(doc.createdAt + ' UTC').toLocaleString();
                } else {
                    // Unix timestamp (milliseconds)
                    createdTime = new Date(parseInt(doc.createdAt)).toLocaleString();
                }

                return {
                    title: parsed.title || parsed.text?.substring(0, 100) || 'Untitled',
                    source: source,
                    sourceType: sourceType,
                    createdTime: createdTime,
                    fullText: parsed.text || doc.content
                };
            });

            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify(formattedDocs));
        } catch (error) {
            console.error('Error fetching recent documents:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to fetch documents' }));
        }
    }
    // Route: /api/source-metrics
    else if (req.url === '/api/source-metrics' && req.method === 'GET') {
        try {
            const metrics = db.prepare(`
                SELECT
                    CASE
                        WHEN m.content LIKE '%gdelt%' THEN 'github-gdelt'
                        WHEN m.content LIKE '%youtube%' THEN 'github-youtube'
                        WHEN m.content LIKE '%arxiv%' THEN 'github-arxiv'
                        WHEN m.content LIKE '%obsidian%' THEN 'obsidian'
                        WHEN m.content LIKE '%github%' THEN 'github'
                        WHEN m.content LIKE '%reddit%' THEN 'reddit'
                        WHEN m.content LIKE '%nature%' THEN 'nature'
                        ELSE 'other'
                    END as source,
                    COUNT(*) as documents,
                    SUM(CASE WHEN b.id IS NOT NULL THEN 1 ELSE 0 END) as broadcasts,
                    MAX(m.createdAt) as lastImport
                FROM memories m
                LEFT JOIN broadcasts b ON b.documentId = m.id
                WHERE m.type = 'documents'
                GROUP BY source
                ORDER BY broadcasts DESC
            `).all();

            const formattedMetrics = {
                sources: metrics.map(m => ({
                    source: m.source,
                    documents: m.documents,
                    broadcasts: m.broadcasts,
                    broadcastRate: m.documents > 0 ? (m.broadcasts / m.documents) * 100 : 0,
                    // Handle both timestamp and datetime string formats for lastImport
                    lastImport: m.lastImport ? (
                        typeof m.lastImport === 'string' && m.lastImport.includes('-') ?
                            new Date(m.lastImport + ' UTC').toISOString() :
                            new Date(parseInt(m.lastImport)).toISOString()
                    ) : null
                }))
            };

            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify(formattedMetrics));
        } catch (error) {
            console.error('Error fetching source metrics:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to fetch metrics' }));
        }
    }
    // Route: /api/platform-stats
    else if (req.url === '/api/platform-stats' && req.method === 'GET') {
        try {
            const stats = db.prepare(`
                SELECT
                    client as platform,
                    status,
                    COUNT(*) as count
                FROM broadcasts
                GROUP BY client, status
            `).all();

            const platformStats = {};
            stats.forEach(stat => {
                const platform = stat.platform || 'unknown';
                if (!platformStats[platform]) {
                    platformStats[platform] = { sent: 0, pending: 0, failed: 0 };
                }
                if (stat.status === 'sent') platformStats[platform].sent = stat.count;
                else if (stat.status === 'pending') platformStats[platform].pending = stat.count;
                else if (stat.status === 'failed') platformStats[platform].failed = stat.count;
            });

            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify(platformStats));
        } catch (error) {
            console.error('Error fetching platform stats:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to fetch platform stats' }));
        }
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