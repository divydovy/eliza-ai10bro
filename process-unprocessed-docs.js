#!/usr/bin/env node

const Database = require('better-sqlite3');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const crypto = require('crypto');

async function processUnprocessedDocuments(limit = 10) {
    console.log(`🚀 Processing up to ${limit} unprocessed documents...`);
    
    const db = new Database('./agent/data/db.sqlite');
    
    try {
        // Find documents without broadcasts
        const unprocessedDocs = db.prepare(`
            SELECT m.* FROM memories m
            WHERE m.type = 'documents'
            AND NOT EXISTS (
                SELECT 1 FROM broadcasts b WHERE b.documentId = m.id
            )
            AND json_extract(m.content, '$.text') IS NOT NULL
            AND length(json_extract(m.content, '$.text')) > 100
            ORDER BY m.createdAt DESC
            LIMIT ?
        `).all(limit);
        
        console.log(`Found ${unprocessedDocs.length} unprocessed documents`);
        
        if (unprocessedDocs.length === 0) {
            console.log('No unprocessed documents found');
            return { processed: 0, failed: 0 };
        }
        
        let processed = 0;
        let failed = 0;
        
        for (const doc of unprocessedDocs) {
            try {
                const content = JSON.parse(doc.content);
                const title = content.metadata?.title || content.text?.substring(0, 50) || 'Unknown';
                
                console.log(`\n📄 Processing: ${title}`);
                
                // Generate broadcast using Ollama
                const prompt = `When you receive a [BROADCAST_REQUEST:id] message: 1) Draw a nature parallel, 2) Explain why this is a game-changer, 3) Give SPECIFIC action based on maturity - if early: who to follow/read, if emerging: what to track/test, if scaling: where to invest/partner, if available: how to access/use. No platitudes. Name names. Be practical. Write as David Attenborough. STAY UNDER LIMIT!

Content to analyze:
${content.text?.substring(0, 2000)}

MISSION CONTEXT: You're building a movement toward a more humane, sustainable, beautiful future. Help people understand both WHY this matters and HOW to engage based on the technology's maturity.

Action Framework (choose based on content):
- EARLY RESEARCH: "Follow [specific researcher/lab]. Subscribe to [journal/newsletter]."
- EMERGING TECH: "Track [company/project]. Consider applications in [specific industry]."  
- SCALING NOW: "Invest via [platform/fund]. Partner through [program]."
- AVAILABLE TODAY: "Access at [platform]. Start with [specific action]."

Critical requirements:
- STRICT LIMIT: 750 characters
- Structure: [Nature parallel] → [Why this changes the game] → [Specific action]
- NO PLATITUDES: Be specific. Name names. Give real actions.

[BROADCAST_REQUEST:${doc.id}]`;

                // Save prompt to temp file and generate
                const tempFile = `/tmp/broadcast-${Date.now()}.txt`;
                require('fs').writeFileSync(tempFile, prompt);
                
                const { stdout } = await execPromise(`ollama run qwen2.5:14b < ${tempFile}`);
                require('fs').unlinkSync(tempFile);
                
                // Extract broadcast
                let generated = stdout.trim();
                const match = generated.match(/\[BROADCAST:.*?\](.*?)$/s);
                if (match) {
                    generated = match[1].trim();
                }
                
                // Add source URL if available
                const sourceUrl = content.metadata?.url || content.source;
                if (sourceUrl) {
                    generated = `${generated}\n\n🔗 Source: ${sourceUrl}`;
                }
                
                // Create broadcast
                const broadcastId = crypto.randomUUID();
                db.prepare(`
                    INSERT INTO broadcasts (
                        id, documentId, client, content, 
                        status, alignment_score, createdAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(
                    broadcastId,
                    doc.id,
                    'telegram',
                    generated,
                    'pending',
                    0.8,
                    Date.now()
                );
                
                console.log(`✅ Created broadcast: ${broadcastId}`);
                console.log(`   Length: ${generated.length} chars`);
                processed++;
                
            } catch (error) {
                console.error(`❌ Failed to process document: ${error.message}`);
                failed++;
            }
        }
        
        console.log(`\n📊 Summary:`);
        console.log(`   Processed: ${processed}`);
        console.log(`   Failed: ${failed}`);
        
        // Now trigger the queue processing to send them
        if (processed > 0) {
            console.log(`\n📤 Triggering broadcast queue processing...`);
            try {
                await execPromise(`curl -s -X POST http://localhost:3000/trigger -H "Content-Type: application/json" -d '{"action":"PROCESS_QUEUE"}'`);
                console.log(`✅ Queue processing triggered`);
            } catch (error) {
                console.log(`⚠️  Could not trigger queue processing: ${error.message}`);
            }
        }
        
        return { processed, failed };
        
    } finally {
        db.close();
    }
}

// Run if called directly
if (require.main === module) {
    const limit = process.argv[2] ? parseInt(process.argv[2]) : 10;
    processUnprocessedDocuments(limit).catch(console.error);
}

module.exports = { processUnprocessedDocuments };