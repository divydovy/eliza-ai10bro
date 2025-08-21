#!/usr/bin/env node

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const cors = require('cors');

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

        // Get broadcast status breakdown
        const statusQuery = `
            SELECT 
                json_extract(content, '$.metadata.status') as status,
                COUNT(*) as count
            FROM memories 
            WHERE type = 'messages' 
            AND json_extract(content, '$.metadata.messageType') = 'broadcast'
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

        // Get recent broadcast activity
        const recentActivityQuery = `
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