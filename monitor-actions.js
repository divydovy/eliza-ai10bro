#!/usr/bin/env node

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'agent/data/db.sqlite');

function monitorActions() {
    const db = new Database(DB_PATH);
    
    console.log('\n📊 ACTION MONITORING DASHBOARD');
    console.log('=' .repeat(60));
    
    // Check triggered actions
    console.log('\n📋 TRIGGERED ACTIONS:');
    const actions = db.prepare(`
        SELECT 
            json_extract(content, '$.action') as action,
            COUNT(*) as count,
            datetime(MAX(createdAt)/1000, 'unixepoch') as latest_trigger
        FROM memories 
        WHERE json_extract(content, '$.action') IS NOT NULL 
            AND json_extract(content, '$.action') != 'NONE'
        GROUP BY action 
        ORDER BY MAX(createdAt) DESC
    `).all();
    
    actions.forEach(row => {
        console.log(`  ${row.action}: ${row.count} times (latest: ${row.latest_trigger})`);
    });
    
    // Check Obsidian vault path
    console.log('\n📁 OBSIDIAN CONFIGURATION:');
    const obsidianPath = process.env.OBSIDIAN_VAULT_PATH || 'Not configured';
    console.log(`  Vault Path: ${obsidianPath}`);
    if (obsidianPath !== 'Not configured' && fs.existsSync(obsidianPath)) {
        const files = fs.readdirSync(obsidianPath);
        const mdFiles = files.filter(f => f.endsWith('.md'));
        console.log(`  ✅ Found ${mdFiles.length} markdown files in vault`);
    } else if (obsidianPath !== 'Not configured') {
        console.log(`  ⚠️ Vault path does not exist!`);
    }
    
    // Check knowledge entries
    console.log('\n📚 KNOWLEDGE BASE:');
    const knowledge = db.prepare(`
        SELECT 
            COUNT(*) as total,
            COUNT(DISTINCT json_extract(content, '$.source')) as sources
        FROM knowledge
    `).get();
    console.log(`  Total entries: ${knowledge.total}`);
    console.log(`  Unique sources: ${knowledge.sources}`);
    
    // Check recent knowledge additions
    const recentKnowledge = db.prepare(`
        SELECT 
            id,
            substr(json_extract(content, '$.text'), 1, 50) as preview,
            datetime(createdAt/1000, 'unixepoch') as created
        FROM knowledge
        WHERE createdAt > (strftime('%s', 'now', '-1 day') * 1000)
        ORDER BY createdAt DESC
        LIMIT 5
    `).all();
    
    if (recentKnowledge.length > 0) {
        console.log('\n  Recent additions:');
        recentKnowledge.forEach(k => {
            console.log(`    - ${k.preview}... (${k.created})`);
        });
    } else {
        console.log('  No recent additions in the last 24 hours');
    }
    
    // Check GitHub sync
    console.log('\n🐙 GITHUB SYNC:');
    const githubMemories = db.prepare(`
        SELECT COUNT(*) as count
        FROM memories
        WHERE json_extract(content, '$.source') = 'github'
    `).get();
    console.log(`  GitHub-sourced memories: ${githubMemories.count}`);
    
    // Check broadcast processing
    console.log('\n📤 BROADCAST QUEUE:');
    const broadcastStats = db.prepare(`
        SELECT 
            status,
            COUNT(*) as count
        FROM broadcasts
        GROUP BY status
    `).all();
    
    broadcastStats.forEach(stat => {
        console.log(`  ${stat.status}: ${stat.count}`);
    });
    
    // Check for action responses
    console.log('\n💬 ACTION RESPONSES:');
    const responses = db.prepare(`
        SELECT 
            m1.id,
            json_extract(m1.content, '$.action') as action,
            datetime(m1.createdAt/1000, 'unixepoch') as triggered,
            m2.id as response_id,
            substr(json_extract(m2.content, '$.text'), 1, 100) as response
        FROM memories m1
        LEFT JOIN memories m2 ON m2.roomId = m1.roomId 
            AND m2.createdAt > m1.createdAt 
            AND m2.createdAt < (m1.createdAt + 60000)
            AND m2.userId = m1.agentId
        WHERE json_extract(m1.content, '$.action') IN ('CREATE_KNOWLEDGE', 'SYNC_GITHUB', 'PROCESS_QUEUE')
        ORDER BY m1.createdAt DESC
        LIMIT 5
    `).all();
    
    if (responses.length > 0) {
        responses.forEach(r => {
            console.log(`\n  Action: ${r.action} (${r.triggered})`);
            if (r.response_id) {
                console.log(`  Response: ${r.response || 'No text response'}`);
            } else {
                console.log(`  Response: ⚠️ No response detected`);
            }
        });
    } else {
        console.log('  No recent action responses found');
    }
    
    console.log('\n' + '=' .repeat(60));
    console.log('💡 TIP: Actions need to be processed by the agent.');
    console.log('   Check that the agent is running and configured with:');
    console.log('   - Obsidian plugin (@elizaos/plugin-obsidian)');
    console.log('   - GitHub plugin (@elizaos/plugin-github)');
    console.log('   - Valid OBSIDIAN_VAULT_PATH environment variable');
    
    db.close();
}

// Run monitoring
monitorActions();