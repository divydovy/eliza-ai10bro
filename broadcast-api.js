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

        // Get platform statistics
        const platformStatsQuery = `
            SELECT 
                client as platform,
                status,
                COUNT(*) as count
            FROM broadcasts
            GROUP BY client, status
        `;
        const platformStats = db.prepare(platformStatsQuery).all();
        
        // Format platform statistics
        const platforms = {};
        platformStats.forEach(row => {
            if (!platforms[row.platform]) {
                platforms[row.platform] = {
                    sent: 0,
                    pending: 0,
                    failed: 0,
                    total: 0
                };
            }
            platforms[row.platform][row.status] = row.count;
            platforms[row.platform].total += row.count;
        });

        // Send response
        res.json({
            totalDocuments: totalDocs,
            totalBroadcasts: totalBroadcasts,
            pendingBroadcasts: pendingBroadcasts,
            sentBroadcasts: sentBroadcasts,
            failedBroadcasts: failedBroadcasts,
            docsWithBroadcasts: docsWithBroadcasts,
            docsWithoutBroadcasts: Math.max(0, totalDocs - docsWithBroadcasts),
            platformStats: platforms,
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

// Dashboard compatibility endpoints
app.get('/api/stats', (req, res) => {
    try {
        // Get total documents
        const totalDocs = db.prepare(`
            SELECT COUNT(*) as count 
            FROM memories 
            WHERE type = 'documents'
        `).get().count;

        // Get documents with broadcasts
        const docsWithBroadcasts = db.prepare(`
            SELECT COUNT(DISTINCT documentId) as count
            FROM broadcasts
            WHERE documentId IS NOT NULL
        `).get().count;

        // Get pending broadcasts
        const pendingBroadcasts = db.prepare(`
            SELECT COUNT(*) as count
            FROM broadcasts
            WHERE status = 'pending'
        `).get().count;

        // Get sent broadcasts
        const sentBroadcasts = db.prepare(`
            SELECT COUNT(*) as count
            FROM broadcasts
            WHERE status = 'sent'
        `).get().count;

        // Calculate coverage percentage
        const coverage = totalDocs > 0 ? ((docsWithBroadcasts / totalDocs) * 100).toFixed(1) : 0;
        
        // Total broadcasts is sent + pending
        const totalBroadcasts = sentBroadcasts + pendingBroadcasts;

        res.json({
            totalDocuments: totalDocs,
            totalBroadcasts: totalBroadcasts, // Dashboard expects this
            docsWithBroadcasts: docsWithBroadcasts,
            sentBroadcasts: sentBroadcasts,
            pendingBroadcasts: pendingBroadcasts,
            coverage: coverage + '%'
        });
    } catch (error) {
        console.error('Error in /api/stats:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

app.get('/api/sources', (req, res) => {
    try {
        const sources = db.prepare(`
            SELECT 
                json_extract(content, '$.metadata.sourceType') as source,
                COUNT(*) as count,
                MAX(createdAt) as lastImport
            FROM memories
            WHERE type = 'documents'
            AND json_extract(content, '$.metadata.sourceType') IS NOT NULL
            GROUP BY json_extract(content, '$.metadata.sourceType')
            ORDER BY count DESC
            LIMIT 20
        `).all();

        res.json(sources.map(s => ({
            name: s.source || 'Unknown',
            count: s.count,
            lastImport: new Date(parseInt(s.lastImport)).toISOString()
        })));
    } catch (error) {
        console.error('Error in /api/sources:', error);
        res.status(500).json({ error: 'Failed to fetch sources' });
    }
});

app.get('/api/recent', (req, res) => {
    try {
        const recent = db.prepare(`
            SELECT 
                json_extract(content, '$.metadata.title') as title,
                json_extract(content, '$.metadata.sourceType') as source,
                createdAt
            FROM memories
            WHERE type = 'documents'
            ORDER BY ROWID DESC
            LIMIT 50
        `).all();

        res.json(recent.map(doc => ({
            title: doc.title || 'Untitled',
            source: doc.source || 'Unknown',
            time: new Date(parseInt(doc.createdAt)).toISOString()
        })));
    } catch (error) {
        console.error('Error in /api/recent:', error);
        res.status(500).json({ error: 'Failed to fetch recent documents' });
    }
});

app.get('/api/broadcasts', (req, res) => {
    try {
        const broadcasts = db.prepare(`
            SELECT 
                content,
                status,
                client as platform,
                createdAt,
                sent_at
            FROM broadcasts
            WHERE status = 'sent'
            ORDER BY sent_at DESC, createdAt DESC
            LIMIT 20
        `).all();

        res.json(broadcasts.map(b => {
            let broadcastText = '';
            try {
                const content = JSON.parse(b.content);
                broadcastText = content.text || b.content;
            } catch {
                broadcastText = b.content || '';
            }

            return {
                text: broadcastText.substring(0, 200),
                platform: b.platform || 'telegram',
                status: b.status,
                time: new Date(parseInt(b.sent_at || b.createdAt)).toISOString()
            };
        }));
    } catch (error) {
        console.error('Error in /api/broadcasts:', error);
        res.status(500).json({ error: 'Failed to fetch broadcasts' });
    }
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
                json_extract(content, '$.metadata.sourceType') as metaSourceType,
                createdAt
            FROM memories
            WHERE type = 'documents'
            ORDER BY ROWID DESC
            LIMIT 50
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
            
            // Determine source type from metadata, path or source URL
            let sourceType = 'unknown';
            const path = doc.path || doc.source || '';
            const source = doc.source || '';
            
            // First check if metadata already has sourceType
            if (doc.metaSourceType) {
                sourceType = doc.metaSourceType;
            }
            // Check for arxiv patterns in source URL or path
            else if (source.includes('arxiv.org') || path.toLowerCase().includes('arxiv')) {
                sourceType = 'arxiv';
            }
            // Check for specific data sources that come from GitHub scrapers
            else if (path.includes('GDELT_Notes')) {
                sourceType = 'github-gdelt';  // GDELT news from GitHub scraper
            } else if (path.includes('YouTube_Notes') || path.includes('youtube')) {
                sourceType = 'github-youtube';  // YouTube transcripts from GitHub
            } else if (path.includes('ArXiv_Notes')) {
                sourceType = 'github-arxiv';  // ArXiv papers from GitHub scraper
            } else if (path.includes('Clippings/')) {
                sourceType = 'obsidian-web';  // Web content saved to Obsidian via clipper
            } else if (path.match(/^\d+\.\s/) || path.includes('Resources/')) {
                sourceType = 'obsidian';  // Regular Obsidian notes
            } else if (path.includes('Notes/') && !path.includes('_Notes')) {
                sourceType = 'obsidian';  // Other notes in Obsidian
            } else if (path.includes('github.com') || path.includes('GitHub')) {
                sourceType = 'github';
            } else if (source.includes('reddit.com')) {
                sourceType = 'reddit';
            } else if (source.includes('nature.com')) {
                sourceType = 'nature';
            } else if (source.includes('youtube.com') || source.includes('youtu.be')) {
                sourceType = 'youtube';
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

// Source quality metrics endpoint
app.get('/api/source-metrics', (req, res) => {
    try {
        // Get source breakdown with detailed categorization
        const sourceAnalysisQuery = `
            SELECT 
                CASE 
                    WHEN json_extract(content, '$.metadata.path') LIKE '%GDELT_Notes%' THEN 'github-gdelt'
                    WHEN json_extract(content, '$.metadata.path') LIKE '%YouTube_Notes%' THEN 'github-youtube'
                    WHEN json_extract(content, '$.metadata.path') LIKE '%ArXiv_Notes%' THEN 'github-arxiv'
                    WHEN json_extract(content, '$.metadata.path') LIKE '%SciHub%' THEN 'github-scihub'
                    WHEN json_extract(content, '$.metadata.path') LIKE '%Clippings/%' THEN 'obsidian'
                    WHEN json_extract(content, '$.metadata.path') LIKE '%Resources/%' THEN 'obsidian'
                    WHEN json_extract(content, '$.metadata.path') LIKE '%Notes/%' AND 
                         json_extract(content, '$.metadata.path') NOT LIKE '%_Notes%' THEN 'obsidian'
                    WHEN json_extract(content, '$.metadata.sourceType') = 'reddit' THEN 'reddit'
                    WHEN json_extract(content, '$.metadata.sourceType') = 'podcast' THEN 'podcast'
                    WHEN json_extract(content, '$.metadata.source') LIKE '%github.com%' THEN 'github-direct'
                    WHEN json_extract(content, '$.metadata.source') LIKE '%reddit.com%' THEN 'reddit'
                    WHEN json_extract(content, '$.metadata.source') LIKE 'http%' THEN 'web-direct'
                    ELSE 'other'
                END as source_type,
                COUNT(*) as total_docs,
                AVG(CASE 
                    WHEN json_extract(content, '$.metadata.alignment_score') IS NOT NULL 
                    THEN CAST(json_extract(content, '$.metadata.alignment_score') AS REAL)
                    ELSE NULL 
                END) as avg_alignment,
                COUNT(CASE 
                    WHEN id IN (
                        SELECT DISTINCT json_extract(content, '$.metadata.sourceMemoryId')
                        FROM memories 
                        WHERE type = 'messages' 
                        AND json_extract(content, '$.metadata.messageType') = 'broadcast'
                    ) THEN 1 
                END) as docs_with_broadcasts,
                MAX(createdAt) as last_import,
                MAX(ROWID) as last_rowid
            FROM memories
            WHERE type = 'documents'
            GROUP BY source_type
            ORDER BY total_docs DESC
        `;
        
        const sourceMetrics = db.prepare(sourceAnalysisQuery).all();
        
        // Calculate totals and percentages
        let totalDocuments = 0;
        let totalWithBroadcasts = 0;
        let totalAlignmentSum = 0;
        let alignmentCount = 0;
        
        const enrichedMetrics = sourceMetrics.map(source => {
            totalDocuments += source.total_docs;
            totalWithBroadcasts += source.docs_with_broadcasts;
            
            if (source.avg_alignment) {
                totalAlignmentSum += source.avg_alignment * source.total_docs;
                alignmentCount += source.total_docs;
            }
            
            const broadcastRate = source.total_docs > 0 ? 
                (source.docs_with_broadcasts / source.total_docs * 100).toFixed(1) : 0;
            
            // Determine source category
            let category = 'Other';
            if (source.source_type.startsWith('github-')) category = 'GitHub Scrapers';
            else if (source.source_type.startsWith('obsidian') || source.source_type === 'obsidian') category = 'Obsidian';
            else if (source.source_type === 'web-direct') category = 'Web Direct';
            
            // Format the timestamp properly
            let formattedLastImport = source.last_import;
            if (typeof formattedLastImport === 'number') {
                // Check if it's milliseconds (13 digits) or seconds (10 digits)
                if (formattedLastImport > 1000000000000) {
                    formattedLastImport = new Date(formattedLastImport).toISOString().replace('T', ' ').slice(0, 19);
                } else {
                    formattedLastImport = new Date(formattedLastImport * 1000).toISOString().replace('T', ' ').slice(0, 19);
                }
            }
            
            return {
                source: source.source_type,
                category: category,
                documents: source.total_docs,
                broadcasts: source.docs_with_broadcasts,
                broadcastRate: parseFloat(broadcastRate),
                alignmentScore: source.avg_alignment ? source.avg_alignment.toFixed(2) : null,
                lastImport: formattedLastImport
            };
        });
        
        // Overall metrics
        const overallBroadcastRate = totalDocuments > 0 ? 
            (totalWithBroadcasts / totalDocuments * 100).toFixed(1) : 0;
        const overallAlignment = alignmentCount > 0 ? 
            (totalAlignmentSum / alignmentCount).toFixed(2) : null;
        
        res.json({
            sources: enrichedMetrics,
            summary: {
                totalSources: sourceMetrics.length,
                totalDocuments: totalDocuments,
                documentsWithBroadcasts: totalWithBroadcasts,
                overallBroadcastRate: parseFloat(overallBroadcastRate),
                overallAlignmentScore: overallAlignment ? parseFloat(overallAlignment) : null,
                topPerformers: enrichedMetrics
                    .filter(s => s.broadcastRate > 0)
                    .sort((a, b) => b.broadcastRate - a.broadcastRate)
                    .slice(0, 3)
                    .map(s => ({
                        source: s.source,
                        rate: s.broadcastRate + '%'
                    }))
            },
            lastUpdated: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error fetching source metrics:', error);
        res.status(500).json({ error: 'Failed to fetch source metrics' });
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