#!/usr/bin/env node

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
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

// Helper function to extract title from YAML frontmatter
function extractTitleFromYAML(text) {
    if (!text || typeof text !== 'string') return null;

    // Check if text starts with YAML frontmatter
    if (!text.trim().startsWith('---')) return null;

    try {
        // Extract frontmatter block
        const lines = text.split('\n');
        const frontmatterEnd = lines.findIndex((line, idx) => idx > 0 && line.trim() === '---');

        if (frontmatterEnd === -1) return null;

        // Find title line in frontmatter
        const frontmatterLines = lines.slice(1, frontmatterEnd);
        const titleLine = frontmatterLines.find(line => line.trim().startsWith('title:'));

        if (!titleLine) return null;

        // Extract title value (handle both "title: value" and "title: 'value'" and "title: \"value\"")
        let title = titleLine.substring(titleLine.indexOf(':') + 1).trim();

        // Remove quotes if present
        if ((title.startsWith('"') && title.endsWith('"')) ||
            (title.startsWith("'") && title.endsWith("'"))) {
            title = title.slice(1, -1);
        }

        return title || null;
    } catch (e) {
        return null;
    }
}

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

                // Handle mixed timestamp formats for createdAt
                let created;
                if (typeof item.createdAt === 'string' && item.createdAt.includes('-')) {
                    // SQLite datetime format: "2025-09-18 14:39:21"
                    created = new Date(item.createdAt + ' UTC').getTime();
                } else {
                    // Unix timestamp (milliseconds)
                    created = parseInt(item.createdAt);
                }

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

            // Get broadcast-ready documents (alignment >= 10%)
            const broadcastReadyDocs = db.prepare(`
                SELECT COUNT(*) as count
                FROM memories
                WHERE type = 'documents'
                AND alignment_score >= 0.10
            `).get().count;

            const response = {
                totalDocuments: totalDocs,
                totalBroadcasts: totalBroadcasts,
                pendingBroadcasts: pendingBroadcasts,
                sentBroadcasts: sentBroadcasts,
                failedBroadcasts: failedBroadcasts,
                docsWithBroadcasts: docsWithBroadcasts,
                docsWithoutBroadcasts: Math.max(0, totalDocs - docsWithBroadcasts),
                broadcastReadyDocs: broadcastReadyDocs,
                coveragePercent: broadcastReadyDocs > 0 ? Math.round((docsWithBroadcasts / broadcastReadyDocs) * 100) : 0,
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
    // Route: /api/platform-config - Returns enabled platforms from character config
    else if (req.url === '/api/platform-config' && req.method === 'GET') {
        try {
            const characterPath = path.join(process.cwd(), 'characters/ai10bro.character.json');
            const characterConfig = JSON.parse(fs.readFileSync(characterPath, 'utf8'));
            const clients = characterConfig.clients || [];

            // Filter to broadcast-relevant clients (exclude 'direct')
            const enabledPlatforms = clients.filter(c => c !== 'direct');

            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({
                enabledPlatforms: enabledPlatforms,
                allClients: clients
            }));
        } catch (error) {
            console.error('Error reading character config:', error);
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            // Fallback to default
            res.end(JSON.stringify({
                enabledPlatforms: ['telegram'],
                allClients: ['direct', 'telegram']
            }));
        }
    }
    // Route: /api/recent-broadcasts
    else if (req.url === '/api/recent-broadcasts' && req.method === 'GET') {
        try {
            // Get unique broadcasts (one per document), prioritizing most recent
            const broadcasts = db.prepare(`
                SELECT
                    b.content,
                    b.status,
                    b.client as platform,
                    b.createdAt,
                    b.sent_at,
                    b.documentId
                FROM broadcasts b
                INNER JOIN (
                    SELECT documentId, MAX(createdAt) as maxCreated
                    FROM broadcasts
                    WHERE status = 'sent'
                    GROUP BY documentId
                ) latest ON b.documentId = latest.documentId AND b.createdAt = latest.maxCreated
                WHERE b.status = 'sent'
                ORDER BY b.createdAt DESC
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
                    type,
                    alignment_score
                FROM memories
                WHERE type = 'documents'
                AND alignment_score >= 0.12
                AND json_extract(content, '$.text') IS NOT NULL
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

                // Extract title with priority: explicit title > YAML frontmatter > text substring > 'Untitled'
                let title = parsed.title || extractTitleFromYAML(parsed.text) || parsed.text?.substring(0, 100) || 'Untitled';

                // Clean up title if it's a substring (remove leading/trailing whitespace and add ellipsis if truncated)
                if (!parsed.title && !extractTitleFromYAML(parsed.text) && parsed.text && title.length === 100) {
                    title = title.trim() + '...';
                }

                return {
                    title: title,
                    source: source,
                    sourceType: sourceType,
                    createdTime: createdTime,
                    alignmentScore: Math.round((doc.alignment_score || 0) * 100) + '%',
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
    // Route: /api/logs/send
    else if (req.url === '/api/logs/send' && req.method === 'GET') {
        try {
            const projectRoot = path.join(__dirname, '../../../..');
            const logFiles = [
                path.join(projectRoot, 'logs/cron-telegram-send.log'),
                path.join(projectRoot, 'logs/cron-bluesky-send.log'),
                path.join(projectRoot, 'logs/cron-wordpress-insights.log')
            ];

            let combinedLogs = '';
            for (const logFile of logFiles) {
                if (fs.existsSync(logFile)) {
                    const logContent = execSync(`tail -50 ${logFile}`).toString();
                    const logName = path.basename(logFile).replace('cron-', '').replace('-send.log', '').replace('-insights.log', '');
                    combinedLogs += `=== ${logName.toUpperCase()} ===\n${logContent}\n\n`;
                }
            }

            res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
            res.end(combinedLogs || 'No send logs available');
        } catch (error) {
            console.error('Error fetching send logs:', error);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Error loading send logs');
        }
    }
    // Route: /api/logs/creation
    else if (req.url === '/api/logs/creation' && req.method === 'GET') {
        try {
            const projectRoot = path.join(__dirname, '../../../..');
            const logFile = path.join(projectRoot, 'logs/cron-broadcast-create.log');

            let logs = 'No creation logs available';
            if (fs.existsSync(logFile)) {
                logs = execSync(`tail -100 ${logFile}`).toString();
            }

            res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
            res.end(logs);
        } catch (error) {
            console.error('Error fetching creation logs:', error);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Error loading creation logs');
        }
    }
    // Route: /api/source-metrics
    else if (req.url === '/api/source-metrics' && req.method === 'GET') {
        try {
            // Get accurate source counts by extracting from JSON content
            const metrics = db.prepare(`
                SELECT
                    COALESCE(json_extract(m.content, '$.source'), 'unknown') as source,
                    COUNT(*) as documents,
                    COUNT(DISTINCT CASE WHEN b.status = 'sent' THEN b.id END) as broadcasts,
                    MAX(m.createdAt) as lastImport
                FROM memories m
                LEFT JOIN broadcasts b ON b.documentId = m.id
                WHERE m.type = 'documents'
                GROUP BY source
                ORDER BY documents DESC
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
    // Route: /api/schedule
    else if (req.url === '/api/schedule' && req.method === 'GET') {
        try {
            const schedule = [];

            // Parse actual crontab instead of LaunchAgents
            const { execSync } = require('child_process');
            const crontab = execSync('crontab -l 2>/dev/null || echo ""', { encoding: 'utf-8' });

            // Define schedule patterns to look for
            const schedulePatterns = [
                { pattern: /sync-github-local\.js/, name: 'GitHub Sync', icon: '🔄', description: 'Clone-based repository sync' },
                { pattern: /IMPORT_OBSIDIAN/, name: 'Obsidian Import', icon: '🧠', description: 'Import notes from vault' },
                { pattern: /calculate-alignment-scores\.js/, name: 'Alignment Scoring', icon: '📊', description: 'Score all documents' },
                { pattern: /score-new-documents\.js/, name: 'LLM Scoring', icon: '🤖', description: 'Score new documents (Ollama)' },
                { pattern: /cleanup-unaligned-documents\.js/, name: 'Database Cleanup', icon: '🧹', description: 'Remove low-quality docs' },
                { pattern: /process-unprocessed-docs\.js/, name: 'Create Broadcasts', icon: '✨', description: 'Generate broadcasts' },
                { pattern: /send-pending-to-telegram\.js/, name: 'Send to Telegram', icon: '✈️', description: 'Post to Telegram' },
                { pattern: /send-pending-to-bluesky\.js/, name: 'Send to Bluesky', icon: '🦋', description: 'Post to Bluesky' },
                { pattern: /send-pending-to-wordpress\.js/, name: 'Publish to WordPress', icon: '📝', description: 'Publish insights' }
            ];

            for (const { pattern, name, icon, description } of schedulePatterns) {
                const cronLines = crontab.split('\n').filter(line =>
                    !line.trim().startsWith('#') &&
                    line.trim().length > 0 &&
                    pattern.test(line)
                );

                if (cronLines.length > 0) {
                    const times = [];
                    let interval = '';

                    for (const line of cronLines) {
                        // Parse cron expression (minute hour * * *)
                        const cronMatch = line.match(/^(\S+)\s+(\S+)\s+\S+\s+\S+\s+\S+/);
                        if (cronMatch) {
                            const [, minute, hour] = cronMatch;

                            // Parse different cron patterns
                            if (hour === '*' && minute === '*') {
                                interval = 'Every minute';
                            } else if (hour === '*' && minute.includes('/')) {
                                const freq = minute.split('/')[1];
                                interval = `Every ${freq} minutes`;
                            } else if (hour === '*' && minute.includes(',')) {
                                const mins = minute.split(',');
                                interval = `${mins.length}x per hour`;
                                times.push(...mins.map(m => `:${m.padStart(2, '0')}`));
                            } else if (hour === '*') {
                                interval = 'Hourly';
                                times.push(`:${minute.padStart(2, '0')}`);
                            } else if (hour.includes('/')) {
                                const freq = hour.split('/')[1];
                                interval = `Every ${freq} hours`;
                                times.push(`${minute.padStart(2, '0')}:00`);
                            } else if (hour.includes(',')) {
                                const hours = hour.split(',');
                                interval = `${hours.length}x daily`;
                                times.push(...hours.map(h => `${h.padStart(2, '0')}:${minute.padStart(2, '0')}`));
                            } else {
                                interval = 'Daily';
                                times.push(`${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`);
                            }
                        }
                    }

                    schedule.push({
                        name,
                        icon,
                        description,
                        times: times.length > 0 ? times : ['See cron'],
                        interval
                    });
                }
            }

            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ schedule }));
        } catch (error) {
            console.error('Error fetching schedule:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to fetch schedule' }));
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
    // Route: /api/system-status
    else if (req.url === '/api/system-status' && req.method === 'GET') {
        try {
            // 1. Document Stats
            const docStats = db.prepare(`
                SELECT
                    COUNT(*) as total,
                    COUNT(CASE WHEN json_extract(content, '$.deleted') = 1 THEN 1 END) as tombstones,
                    COUNT(CASE WHEN json_extract(content, '$.deleted') IS NULL OR json_extract(content, '$.deleted') = 0 THEN 1 END) as active,
                    COUNT(CASE WHEN alignment_score IS NOT NULL THEN 1 END) as scored,
                    COUNT(CASE WHEN alignment_score >= 0.12 AND (json_extract(content, '$.deleted') IS NULL OR json_extract(content, '$.deleted') = 0) THEN 1 END) as broadcast_ready,
                    COUNT(CASE WHEN alignment_score >= 0.20 AND (json_extract(content, '$.deleted') IS NULL OR json_extract(content, '$.deleted') = 0) THEN 1 END) as wordpress_ready,
                    COUNT(CASE WHEN json_extract(content, '$.source') = 'github' THEN 1 END) as github_total,
                    COUNT(CASE WHEN json_extract(content, '$.source') = 'github' AND (json_extract(content, '$.deleted') IS NULL OR json_extract(content, '$.deleted') = 0) THEN 1 END) as github_active
                FROM memories
                WHERE type = 'documents'
            `).get();

            // 2. LLM Scoring Status
            const llmStatus = {
                inProgress: false,
                checkpoint: null
            };

            // Check if LLM scoring is running
            try {
                const pidPath = path.join(process.cwd(), 'llm-scoring.pid');
                if (fs.existsSync(pidPath)) {
                    const pidContent = fs.readFileSync(pidPath, 'utf8').trim();
                    const checkProcess = execSync(`ps -p ${pidContent} 2>/dev/null | grep -v PID | wc -l`).toString().trim();
                    llmStatus.inProgress = checkProcess === '1';
                }
            } catch (e) {
                llmStatus.inProgress = false;
            }

            // Check for checkpoint
            try {
                const checkpointPath = path.join(process.cwd(), 'llm-scoring-checkpoint.json');
                if (fs.existsSync(checkpointPath)) {
                    llmStatus.checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
                }
            } catch (e) {}

            // 3. Cron Job Status
            let cronJobs = [];
            try {
                const crontabOutput = execSync('crontab -l 2>/dev/null').toString();
                const lines = crontabOutput.split('\n');

                for (const line of lines) {
                    if (line.trim() && !line.startsWith('#')) {
                        const parts = line.split(/\s+/);
                        if (parts.length >= 6) {
                            const schedule = parts.slice(0, 5).join(' ');
                            const command = parts.slice(5).join(' ');

                            let name = 'Unknown Job';
                            let logFile = null;

                            if (command.includes('sync-github-local')) {
                                name = 'GitHub Sync (Local)';
                                logFile = 'logs/cron-github-sync.log';
                            } else if (command.includes('IMPORT_OBSIDIAN')) {
                                name = 'Obsidian Import';
                                logFile = 'logs/cron-obsidian-import.log';
                            } else if (command.includes('calculate-alignment-scores')) {
                                name = 'Alignment Scores';
                                logFile = 'logs/cron-alignment-scoring.log';
                            } else if (command.includes('score-new-documents')) {
                                name = 'LLM Scoring';
                                logFile = 'logs/cron-llm-scoring.log';
                            } else if (command.includes('cleanup-unaligned')) {
                                name = 'Cleanup Unaligned';
                                logFile = 'logs/cron-cleanup-unaligned.log';
                            } else if (command.includes('process-unprocessed-docs')) {
                                name = 'Create Broadcasts';
                                logFile = 'logs/cron-broadcast-create.log';
                            } else if (command.includes('send-pending-to-telegram')) {
                                name = 'Send Telegram';
                                logFile = 'logs/cron-telegram-send.log';
                            } else if (command.includes('send-pending-to-bluesky')) {
                                name = 'Send Bluesky';
                                logFile = 'logs/cron-bluesky-send.log';
                            } else if (command.includes('send-pending-to-wordpress')) {
                                name = 'Send WordPress';
                                logFile = 'logs/cron-wordpress-insights.log';
                            } else {
                                continue; // Skip unknown jobs
                            }

                            // Get last run time from log file
                            let lastRun = null;
                            if (logFile) {
                                const logPath = path.join(process.cwd(), logFile);
                                if (fs.existsSync(logPath)) {
                                    try {
                                        const stats = fs.statSync(logPath);
                                        lastRun = stats.mtime.toISOString();
                                    } catch (e) {}
                                }
                            }

                            cronJobs.push({
                                name,
                                schedule,
                                lastRun,
                                logFile
                            });
                        }
                    }
                }
            } catch (e) {
                console.error('Error reading crontab:', e.message);
            }

            // 4. Broadcast Pipeline Status
            const broadcastStats = db.prepare(`
                SELECT
                    client,
                    status,
                    COUNT(*) as count,
                    COUNT(CASE WHEN alignment_score >= 0.12 THEN 1 END) as sendable
                FROM broadcasts
                GROUP BY client, status
            `).all();

            const response = {
                documents: docStats,
                llmScoring: llmStatus,
                cronJobs,
                broadcasts: broadcastStats,
                timestamp: new Date().toISOString()
            };

            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify(response));
        } catch (error) {
            console.error('Error fetching system status:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to fetch system status', details: error.message }));
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