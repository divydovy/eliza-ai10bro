#!/usr/bin/env node

/**
 * Check broadcast quality for truncation issues
 */

const Database = require('better-sqlite3');
const path = require('path');
const { PLATFORM_LIMITS } = require('./generate-platform-broadcasts');

const dbPath = path.join(__dirname, 'agent/data/db.sqlite');
const db = new Database(dbPath);

console.log('🔍 Broadcast Quality Check\n');
console.log('=========================\n');

// Get recent sent broadcasts
const recentBroadcasts = db.prepare(`
    SELECT id, client, content, sent_at
    FROM broadcasts
    WHERE status = 'sent'
    ORDER BY sent_at DESC
    LIMIT 50
`).all();

console.log(`Checking ${recentBroadcasts.length} recent sent broadcasts...\n`);

const issues = {
    truncated: [],
    noUrl: [],
    tooLong: [],
    perfect: []
};

recentBroadcasts.forEach(broadcast => {
    try {
        const content = JSON.parse(broadcast.content);
        const text = content.text || '';
        const platform = broadcast.client;
        const limit = PLATFORM_LIMITS[platform] || 500;
        
        // Check for issues
        const problems = [];
        
        // Check length
        if (text.length > limit) {
            problems.push(`Exceeds ${platform} limit: ${text.length}/${limit}`);
            issues.tooLong.push({ id: broadcast.id, platform, length: text.length, limit });
        }
        
        // Check for mid-sentence truncation
        const lastChar = text.slice(-1);
        const lastWords = text.trim().split(' ').slice(-3).join(' ');
        
        if (!text.includes('🔗') && platform !== 'telegram') {
            problems.push('No URL included');
            issues.noUrl.push({ id: broadcast.id, platform });
        }
        
        // Check for suspicious endings
        const suspiciousEndings = ['and', 'the', 'to', 'of', 'in', 'for', 'with', 'that', 'this', 'as', 'by'];
        const lastWord = text.trim().split(' ').pop().replace(/[.,!?;:]$/, '');
        
        if (suspiciousEndings.includes(lastWord.toLowerCase())) {
            problems.push(`Ends mid-thought with "${lastWord}"`);
            issues.truncated.push({ id: broadcast.id, platform, ending: lastWord });
        } else if (!['.', '!', '?', '"', ')', ']'].includes(lastChar) && !text.endsWith('🔗')) {
            // Check if it doesn't end with proper punctuation (unless it ends with a URL)
            const urlMatch = text.match(/https?:\/\/[^\s]+$/);
            if (!urlMatch) {
                problems.push(`No ending punctuation (ends with "${lastChar}")`);
                issues.truncated.push({ id: broadcast.id, platform, ending: lastChar });
            }
        }
        
        if (problems.length === 0) {
            issues.perfect.push({ id: broadcast.id, platform });
        }
        
    } catch (e) {
        console.log(`❌ Error parsing broadcast ${broadcast.id}: ${e.message}`);
    }
});

// Display results
console.log('📊 Quality Analysis Results:\n');
console.log(`✅ Perfect broadcasts: ${issues.perfect.length}`);
console.log(`⚠️  Truncated broadcasts: ${issues.truncated.length}`);
console.log(`📏 Exceeding limits: ${issues.tooLong.length}`);
console.log(`🔗 Missing URLs: ${issues.noUrl.length}\n`);

if (issues.truncated.length > 0) {
    console.log('⚠️  Truncated Broadcasts:');
    issues.truncated.slice(0, 5).forEach(b => {
        console.log(`   - ${b.platform} (${b.id.substring(0, 8)}...): ends with "${b.ending}"`);
    });
}

if (issues.tooLong.length > 0) {
    console.log('\n📏 Broadcasts Exceeding Limits:');
    issues.tooLong.slice(0, 5).forEach(b => {
        console.log(`   - ${b.platform}: ${b.length}/${b.limit} chars`);
    });
}

if (issues.noUrl.length > 0 && issues.noUrl.length <= 10) {
    console.log('\n🔗 Broadcasts Missing URLs:');
    issues.noUrl.slice(0, 5).forEach(b => {
        console.log(`   - ${b.platform} (${b.id.substring(0, 8)}...)`);
    });
}

// Get overall statistics
const stats = db.prepare(`
    SELECT 
        status,
        COUNT(*) as count,
        AVG(alignment_score) as avg_score
    FROM broadcasts
    GROUP BY status
`).all();

console.log('\n📈 Overall Statistics:');
stats.forEach(stat => {
    console.log(`   ${stat.status}: ${stat.count} broadcasts (avg score: ${(stat.avg_score * 100).toFixed(0)}%)`);
});

// Check backlog
const backlog = db.prepare(`
    SELECT COUNT(DISTINCT m.id) as count
    FROM memories m
    LEFT JOIN broadcasts b ON b.documentId = m.id
    WHERE m.type = 'documents' AND b.id IS NULL
`).get();

console.log(`\n📦 Backlog: ${backlog.count} documents without broadcasts`);

db.close();

console.log('\n✨ Quality check complete!\n');