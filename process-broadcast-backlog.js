#!/usr/bin/env node

/**
 * Aggressive broadcast backlog processor
 * Processes broadcasts in batches with configurable frequency
 */

const { execSync } = require('child_process');
const Database = require('better-sqlite3');
const path = require('path');

// Configuration
const CONFIG = {
    createBatchSize: 20,        // Create 20 broadcasts at a time
    sendBatchSize: 5,           // Send 5 broadcasts at a time
    createIntervalMinutes: 5,   // Create new broadcasts every 5 minutes
    sendIntervalMinutes: 2,     // Send broadcasts every 2 minutes
    maxConcurrentCreation: 3,   // Allow 3 parallel creation processes
    targetQualityScore: 0.8     // Minimum quality score
};

const dbPath = path.join(__dirname, 'agent/data/db.sqlite');

// Check if Ollama is available
function isOllamaRunning() {
    try {
        execSync('curl -s http://localhost:11434/api/tags', { timeout: 2000 });
        return true;
    } catch (e) {
        return false;
    }
}

// Create broadcasts for documents without them
async function createBroadcasts() {
    if (!isOllamaRunning()) {
        console.log('⚠️  Ollama not running, skipping broadcast creation');
        return;
    }

    const db = new Database(dbPath);
    
    // Get count of documents without broadcasts
    const backlogCount = db.prepare(`
        SELECT COUNT(DISTINCT m.id) 
        FROM memories m 
        LEFT JOIN broadcasts b ON b.documentId = m.id 
        WHERE m.type = 'documents' AND b.id IS NULL
    `).get()['COUNT(DISTINCT m.id)'];
    
    console.log(`\n📊 Backlog Status: ${backlogCount} documents without broadcasts`);
    
    if (backlogCount === 0) {
        console.log('✅ No backlog - all documents have broadcasts!');
        db.close();
        return;
    }
    
    // Process in parallel batches
    const processes = [];
    for (let i = 0; i < CONFIG.maxConcurrentCreation; i++) {
        processes.push(new Promise((resolve) => {
            try {
                console.log(`🚀 Starting creation batch ${i + 1}/${CONFIG.maxConcurrentCreation}`);
                execSync(`node trigger-autobroadcast.js --limit ${CONFIG.createBatchSize}`, {
                    stdio: 'inherit'
                });
                resolve();
            } catch (e) {
                console.error(`❌ Creation batch ${i + 1} failed:`, e.message);
                resolve();
            }
        }));
    }
    
    await Promise.all(processes);
    
    // Get updated stats
    const newBacklogCount = db.prepare(`
        SELECT COUNT(DISTINCT m.id) 
        FROM memories m 
        LEFT JOIN broadcasts b ON b.documentId = m.id 
        WHERE m.type = 'documents' AND b.id IS NULL
    `).get()['COUNT(DISTINCT m.id)'];
    
    const created = backlogCount - newBacklogCount;
    console.log(`\n✅ Created broadcasts for ${created} documents`);
    console.log(`📊 Remaining backlog: ${newBacklogCount} documents`);
    
    db.close();
}

// Send pending broadcasts
async function sendBroadcasts() {
    const db = new Database(dbPath);
    
    // Get pending broadcasts count
    const pendingCount = db.prepare(`
        SELECT COUNT(*) as count 
        FROM broadcasts 
        WHERE status = 'pending' 
        AND alignment_score >= ?
    `).get(CONFIG.targetQualityScore).count;
    
    if (pendingCount === 0) {
        console.log('📭 No pending broadcasts to send');
        db.close();
        return;
    }
    
    console.log(`\n📤 Sending ${Math.min(CONFIG.sendBatchSize, pendingCount)} of ${pendingCount} pending broadcasts...`);
    
    // Get broadcasts to send
    const toSend = db.prepare(`
        SELECT id, client, content 
        FROM broadcasts 
        WHERE status = 'pending' 
        AND alignment_score >= ?
        ORDER BY alignment_score DESC
        LIMIT ?
    `).all(CONFIG.targetQualityScore, CONFIG.sendBatchSize);
    
    for (const broadcast of toSend) {
        try {
            console.log(`📨 Sending ${broadcast.client} broadcast ${broadcast.id.substring(0, 8)}...`);
            
            // Send via action API
            const response = execSync(`curl -s -X POST http://localhost:3003/trigger \
                -H "Content-Type: application/json" \
                -d '{"action":"SEND_BROADCAST","broadcastId":"${broadcast.id}"}'`, {
                maxBuffer: 1024 * 1024
            });
            
            // Mark as sent
            db.prepare(`
                UPDATE broadcasts 
                SET status = 'sent', sent_at = ? 
                WHERE id = ?
            `).run(Date.now(), broadcast.id);
            
            console.log(`   ✅ Sent successfully`);
            
            // Brief pause between sends to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (e) {
            console.error(`   ❌ Failed to send: ${e.message}`);
        }
    }
    
    db.close();
}

// Main processing loop
async function processBacklog() {
    console.log('🤖 Broadcast Backlog Processor Started');
    console.log('=====================================');
    console.log('Configuration:');
    console.log(`  Create batch size: ${CONFIG.createBatchSize} broadcasts`);
    console.log(`  Send batch size: ${CONFIG.sendBatchSize} broadcasts`);
    console.log(`  Create interval: ${CONFIG.createIntervalMinutes} minutes`);
    console.log(`  Send interval: ${CONFIG.sendIntervalMinutes} minutes`);
    console.log(`  Parallel creation: ${CONFIG.maxConcurrentCreation} processes`);
    console.log('');
    
    // Initial run
    await createBroadcasts();
    await sendBroadcasts();
    
    // Schedule regular processing
    setInterval(async () => {
        console.log(`\n⏰ [${new Date().toISOString()}] Creating broadcasts...`);
        await createBroadcasts();
    }, CONFIG.createIntervalMinutes * 60 * 1000);
    
    setInterval(async () => {
        console.log(`\n⏰ [${new Date().toISOString()}] Sending broadcasts...`);
        await sendBroadcasts();
    }, CONFIG.sendIntervalMinutes * 60 * 1000);
    
    console.log('\n✅ Scheduler running. Press Ctrl+C to stop.');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n👋 Shutting down broadcast processor...');
    process.exit(0);
});

// Run if called directly
if (require.main === module) {
    processBacklog().catch(console.error);
}

module.exports = { createBroadcasts, sendBroadcasts };