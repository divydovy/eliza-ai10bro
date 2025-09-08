#!/usr/bin/env node

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

// Configuration
const PORT = process.env.BROADCAST_API_PORT || 3001;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'agent/data/db.sqlite');

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

// Serve the dashboard HTML
app.use(express.static(__dirname));

// Initialize database connection
let db;
try {
    db = new Database(DB_PATH, { readonly: true });
    console.log(`✅ Connected to database at: ${DB_PATH}`);
} catch (error) {
    console.error('❌ Failed to connect to database:', error);
    process.exit(1);
}

// API endpoint for broadcast statistics
app.get('/api/broadcast-stats', (req, res) => {
    try {
        // Get total documents
        const totalDocsQuery = `
            SELECT COUNT(*) as count 
            FROM memories 
            WHERE type = 'documents'
        `;
        const totalDocs = db.prepare(totalDocsQuery).get().count;

        // Get total broadcasts from broadcasts table
        const totalBroadcastsQuery = `
            SELECT COUNT(*) as count 
            FROM broadcasts
        `;
        const totalBroadcasts = db.prepare(totalBroadcastsQuery).get().count;

        // Get broadcast status breakdown from broadcasts table
        const statusQuery = `
            SELECT 
                status,
                COUNT(*) as count
            FROM broadcasts
            GROUP BY status
        `;
        const statusBreakdown = db.prepare(statusQuery).all();

        // Calculate status counts
        let pendingBroadcasts = 0;
        let sentBroadcasts = 0;
        let failedBroadcasts = 0;

        statusBreakdown.forEach(row => {
            if (row.status === 'pending') pendingBroadcasts = row.count;
            else if (row.status === 'sent') sentBroadcasts = row.count;
            else if (row.status === 'failed') failedBroadcasts = row.count;
        });

        // Get recent broadcast activity from broadcasts table
        const recentActivityQuery = `
            SELECT 
                content as text,
                status,
                client as platform,
                createdAt
            FROM broadcasts
            ORDER BY createdAt DESC
            LIMIT 20
        `;
        const recentActivity = db.prepare(recentActivityQuery).all();

        // Format recent activity for display
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
            const textPreview = item.text ? 
                item.text.split('\n')[0].substring(0, 100) + 
                (item.text.length > 100 ? '...' : '') : 
                'No content';

            return {
                text: textPreview,
                status: item.status || 'pending',
                platform: item.platform || 'telegram',
                time: timeStr
            };
        });

        // Get documents without broadcasts (approximate)
        const docsWithBroadcastsQuery = `
            SELECT COUNT(DISTINCT json_extract(content, '$.metadata.sourceMemoryId')) as count
            FROM memories 
            WHERE type = 'messages' 
            AND json_extract(content, '$.metadata.messageType') = 'broadcast'
            AND json_extract(content, '$.metadata.sourceMemoryId') IS NOT NULL
        `;
        const docsWithBroadcasts = db.prepare(docsWithBroadcastsQuery).get().count;

        // Send response
        res.json({
            totalDocuments: totalDocs,
            totalBroadcasts: totalBroadcasts,
            pendingBroadcasts: pendingBroadcasts,
            sentBroadcasts: sentBroadcasts,
            failedBroadcasts: failedBroadcasts,
            docsWithBroadcasts: docsWithBroadcasts,
            docsWithoutBroadcasts: Math.max(0, totalDocs - docsWithBroadcasts),
            recentActivity: formattedActivity,
            lastUpdated: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error fetching broadcast stats:', error);
        res.status(500).json({ error: 'Failed to fetch broadcast statistics' });
    }
});

// Get broadcast trends (hourly for last 24 hours)
// Route: /api/config
app.get('/api/config', (req, res) => {
    res.json({
        statsPort: 3001,
        actionPort: 3003,
        endpoints: {
            stats: '/api/broadcast-stats',
            trigger: 'http://localhost:3003/trigger'
        },
        refreshInterval: 30000
    });
});

// Route: /api/recent-documents
app.get('/api/recent-documents', (req, res) => {
    try {
        const recentDocs = db.prepare(`
            SELECT 
                id,
                type,
                json_extract(content, '$.text') as text,
                json_extract(content, '$.metadata.source') as source,
                json_extract(content, '$.metadata.path') as path,
                json_extract(content, '$.metadata.title') as title,
                json_extract(content, '$.metadata.description') as description,
                createdAt
            FROM memories
            WHERE type = 'documents'
            ORDER BY createdAt DESC
            LIMIT 20
        `).all();

        const formatted = recentDocs.map(doc => {
            const now = Date.now();
            // Handle both timestamp and datetime string formats
            let created;
            if (typeof doc.createdAt === 'string') {
                created = new Date(doc.createdAt).getTime();
            } else {
                created = parseInt(doc.createdAt);
            }
            const minutesAgo = Math.floor((now - created) / 60000);
            
            let timeStr;
            if (minutesAgo < 1) timeStr = 'Just now';
            else if (minutesAgo < 60) timeStr = `${minutesAgo} mins ago`;
            else if (minutesAgo < 1440) timeStr = `${Math.floor(minutesAgo / 60)} hours ago`;
            else timeStr = `${Math.floor(minutesAgo / 1440)} days ago`;

            // Extract title or first line of text
            let displayTitle = doc.title || '';
            if (!displayTitle && doc.text) {
                const lines = doc.text.split('\n');
                displayTitle = lines[0].substring(0, 100);
            }
            
            // Determine source type from path or source
            let sourceType = 'unknown';
            const path = doc.path || doc.source || '';
            
            // Check for specific data sources that come from GitHub scrapers
            if (path.includes('GDELT_Notes')) {
                sourceType = 'github-gdelt';  // GDELT news from GitHub scraper
            } else if (path.includes('YouTube_Notes') || path.includes('youtube')) {
                sourceType = 'github-youtube';  // YouTube transcripts from GitHub
            } else if (path.includes('ArXiv_Notes') || path.includes('arxiv')) {
                sourceType = 'github-arxiv';  // ArXiv papers from GitHub
            } else if (path.includes('Clippings/')) {
                sourceType = 'obsidian-web';  // Web content saved to Obsidian via clipper
            } else if (path.match(/^\d+\.\s/) || path.includes('Resources/')) {
                sourceType = 'obsidian';  // Regular Obsidian notes
            } else if (path.includes('Notes/') && !path.includes('_Notes')) {
                sourceType = 'obsidian';  // Other notes in Obsidian
            } else if (path.includes('github.com') || path.includes('GitHub')) {
                sourceType = 'github';
            } else if (doc.source && doc.source.includes('http')) {
                sourceType = 'web';
            }
            
            return {
                id: doc.id,
                title: displayTitle || 'Untitled',
                description: doc.description || doc.text?.substring(0, 200) || '',
                source: path || doc.source || 'unknown',
                sourceType: sourceType,
                createdTime: timeStr,
                fullText: doc.text || ''
            };
        });

        res.json(formatted);
    } catch (error) {
        console.error('Error fetching recent documents:', error);
        res.status(500).json({ error: 'Failed to fetch recent documents' });
    }
});

// Route: /api/recent-broadcasts
app.get('/api/recent-broadcasts', (req, res) => {
    try {
        const recentBroadcasts = db.prepare(`
            SELECT 
                id,
                content,
                client as platform,
                status,
                sent_at,
                createdAt
            FROM broadcasts
            ORDER BY createdAt DESC
            LIMIT 20
        `).all();

        const formatted = recentBroadcasts.map(broadcast => {
            const now = Date.now();
            const created = parseInt(broadcast.createdAt);
            const sent = broadcast.sent_at ? parseInt(broadcast.sent_at) * 1000 : null;
            
            const createdMinutesAgo = Math.floor((now - created) / 60000);
            let createdTimeStr;
            if (createdMinutesAgo < 1) createdTimeStr = 'Just now';
            else if (createdMinutesAgo < 60) createdTimeStr = `${createdMinutesAgo} mins ago`;
            else if (createdMinutesAgo < 1440) createdTimeStr = `${Math.floor(createdMinutesAgo / 60)} hours ago`;
            else createdTimeStr = `${Math.floor(createdMinutesAgo / 1440)} days ago`;

            let sentTimeStr = null;
            if (sent) {
                const sentMinutesAgo = Math.floor((now - sent) / 60000);
                if (sentMinutesAgo < 1) sentTimeStr = 'Just now';
                else if (sentMinutesAgo < 60) sentTimeStr = `${sentMinutesAgo} mins ago`;
                else if (sentMinutesAgo < 1440) sentTimeStr = `${Math.floor(sentMinutesAgo / 60)} hours ago`;
                else sentTimeStr = `${Math.floor(sentMinutesAgo / 1440)} days ago`;
            }

            // Extract first line for preview
            const lines = broadcast.content ? broadcast.content.split('\n') : ['No content'];
            const preview = lines[0].substring(0, 80) + (lines[0].length > 80 ? '...' : '');
            
            return {
                id: broadcast.id,
                preview: preview,
                fullContent: broadcast.content || 'No content',
                platform: broadcast.platform || 'unknown',
                status: broadcast.status,
                createdTime: createdTimeStr,
                sentTime: sentTimeStr
            };
        });

        res.json(formatted);
    } catch (error) {
        console.error('Error fetching recent broadcasts:', error);
        res.status(500).json({ error: 'Failed to fetch recent broadcasts' });
    }
});

app.get('/api/broadcast-trends', (req, res) => {
    try {
        const trendsQuery = `
            SELECT 
                strftime('%Y-%m-%d %H:00', createdAt/1000, 'unixepoch') as hour,
                COUNT(*) as count
            FROM broadcasts
            WHERE createdAt > ${Date.now() - 86400000}
            GROUP BY hour
            ORDER BY hour DESC
        `;
        const trends = db.prepare(trendsQuery).all();

        res.json({ trends });
    } catch (error) {
        console.error('Error fetching broadcast trends:', error);
        res.status(500).json({ error: 'Failed to fetch broadcast trends' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        database: db ? 'connected' : 'disconnected',
        uptime: process.uptime()
    });
});

// Serve log files
app.get('/api/logs/send', (req, res) => {
    const logPath = path.join(__dirname, 'logs', 'broadcast-send.log');
    fs.readFile(logPath, 'utf8', (err, data) => {
        if (err) {
            res.status(500).send('Log file not found');
            return;
        }
        // Get last 20 lines
        const lines = data.trim().split('\n').slice(-20);
        res.send(lines.join('\n'));
    });
});

app.get('/api/logs/creation', (req, res) => {
    const logPath = path.join(__dirname, 'logs', 'broadcast-creation.log');
    fs.readFile(logPath, 'utf8', (err, data) => {
        if (err) {
            res.status(500).send('Log file not found');
            return;
        }
        // Get last 20 lines
        const lines = data.trim().split('\n').slice(-20);
        res.send(lines.join('\n'));
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`
🚀 Broadcast Dashboard API Server
==================================
📊 Dashboard: http://localhost:${PORT}/broadcast-dashboard.html
🔌 API Endpoint: http://localhost:${PORT}/api/broadcast-stats
📈 Trends: http://localhost:${PORT}/api/broadcast-trends
💚 Health: http://localhost:${PORT}/health
==================================
    `);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down gracefully...');
    if (db) db.close();
    process.exit(0);
});