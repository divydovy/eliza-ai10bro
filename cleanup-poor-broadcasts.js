#!/usr/bin/env node

/**
 * Cleanup poor quality broadcasts
 * Deletes broadcasts with quality scores below threshold or matching poor content patterns
 */

const Database = require('better-sqlite3');
const path = require('path');

// Quality thresholds
const QUALITY_THRESHOLD = 0.85; // Delete broadcasts below 85% quality (raised from 60%)
const MIN_CONTENT_LENGTH = 100; // Delete broadcasts shorter than this (raised from 50)

// Poor quality patterns to detect
const POOR_PATTERNS = [
    /^test$/i,
    /^testing/i,
    /^hello world/i,
    /^Track this breakthrough at/i, // Generic ending only
    /^\w+$/, // Single word broadcasts
    /^https?:\/\/\S+$/, // URL only
    /^[^.!?]+$/, // No punctuation (likely just a title)
    /^\w+:\s+\w+/, // Simple title format like "Conference: Future"
    /^The\s+\w+\s+\w+/, // Generic titles starting with "The"
    /\|\s*TEDx?\w*$/i, // TEDx titles
    /\/\//,  // Double slashes (often in video titles)
];

async function cleanupBroadcasts() {
    const dbPath = path.join(__dirname, 'agent/data/db.sqlite');
    const db = new Database(dbPath);
    
    console.log('🧹 Starting broadcast cleanup...\n');
    
    // Get all pending broadcasts
    const pendingBroadcasts = db.prepare(`
        SELECT id, content, alignment_score 
        FROM broadcasts 
        WHERE status = 'pending'
    `).all();
    
    console.log(`📊 Found ${pendingBroadcasts.length} pending broadcasts\n`);
    
    let deleted = 0;
    let analyzed = 0;
    const toDelete = [];
    
    for (const broadcast of pendingBroadcasts) {
        analyzed++;
        let shouldDelete = false;
        let deleteReason = '';
        
        // Parse the broadcast content
        let broadcastText = '';
        let qualityScore = broadcast.alignment_score || 0;
        
        try {
            const content = JSON.parse(broadcast.content);
            broadcastText = content.text || '';
            qualityScore = content.metadata?.qualityScore || broadcast.alignment_score || 0;
        } catch (e) {
            // If JSON parsing fails, treat as plain text
            broadcastText = broadcast.content || '';
        }
        
        // Check quality score
        if (qualityScore < QUALITY_THRESHOLD) {
            shouldDelete = true;
            deleteReason = `Low quality score: ${(qualityScore * 100).toFixed(0)}%`;
        }
        
        // Check content length
        if (!shouldDelete && broadcastText.length < MIN_CONTENT_LENGTH) {
            shouldDelete = true;
            deleteReason = `Too short: ${broadcastText.length} chars`;
        }
        
        // Check for poor patterns
        if (!shouldDelete) {
            for (const pattern of POOR_PATTERNS) {
                if (pattern.test(broadcastText)) {
                    shouldDelete = true;
                    deleteReason = `Matches poor pattern: ${pattern}`;
                    break;
                }
            }
        }
        
        // Check for empty or malformed content
        if (!shouldDelete && (!broadcastText || broadcastText.trim() === '')) {
            shouldDelete = true;
            deleteReason = 'Empty content';
        }
        
        if (shouldDelete) {
            toDelete.push({
                id: broadcast.id,
                reason: deleteReason,
                preview: broadcastText.substring(0, 60)
            });
        }
        
        if (analyzed % 10 === 0) {
            process.stdout.write(`\r⏳ Analyzed ${analyzed}/${pendingBroadcasts.length} broadcasts...`);
        }
    }
    
    console.log(`\r✅ Analyzed ${analyzed} broadcasts\n`);
    
    if (toDelete.length === 0) {
        console.log('✨ No poor quality broadcasts found!');
    } else {
        console.log(`\n🗑️  Found ${toDelete.length} poor quality broadcasts to delete:\n`);
        
        // Show first 10 examples
        toDelete.slice(0, 10).forEach(item => {
            console.log(`   ❌ ${item.preview}...`);
            console.log(`      Reason: ${item.reason}\n`);
        });
        
        if (toDelete.length > 10) {
            console.log(`   ... and ${toDelete.length - 10} more\n`);
        }
        
        // Delete the broadcasts
        const deleteStmt = db.prepare('DELETE FROM broadcasts WHERE id = ?');
        const deleteMany = db.transaction((items) => {
            for (const item of items) {
                deleteStmt.run(item.id);
                deleted++;
            }
        });
        
        deleteMany(toDelete);
        console.log(`\n🗑️  Deleted ${deleted} poor quality broadcasts`);
    }
    
    // Get updated stats
    const stats = db.prepare(`
        SELECT status, COUNT(*) as count 
        FROM broadcasts 
        GROUP BY status
    `).all();
    
    console.log('\n📊 Updated broadcast statistics:');
    stats.forEach(stat => {
        console.log(`   ${stat.status}: ${stat.count}`);
    });
    
    // Get quality distribution of remaining pending broadcasts
    const qualityStats = db.prepare(`
        SELECT 
            CASE 
                WHEN alignment_score >= 0.9 THEN '90-100%'
                WHEN alignment_score >= 0.8 THEN '80-89%'
                WHEN alignment_score >= 0.7 THEN '70-79%'
                WHEN alignment_score >= 0.6 THEN '60-69%'
                ELSE 'Below 60%'
            END as quality_range,
            COUNT(*) as count
        FROM broadcasts
        WHERE status = 'pending'
        GROUP BY quality_range
        ORDER BY alignment_score DESC
    `).all();
    
    console.log('\n📈 Quality distribution of remaining pending broadcasts:');
    qualityStats.forEach(stat => {
        console.log(`   ${stat.quality_range}: ${stat.count} broadcasts`);
    });
    
    db.close();
}

// Run if called directly
if (require.main === module) {
    cleanupBroadcasts().catch(console.error);
}

module.exports = { cleanupBroadcasts };