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
                const prompt = `You are David Attenborough observing technological evolution. Create a compelling broadcast about this innovation that weaves together nature's wisdom with human progress. 

Content to analyze:
${content.text?.substring(0, 2000)}

Write a SINGLE PARAGRAPH broadcast (MAXIMUM 600 characters - this is CRITICAL) that:
- Opens with an unexpected observation linking this to nature (but don't label it)
- Reveals why this breakthrough matters for humanity's future
- Ends with ONE specific action: a researcher to follow, company to track, platform to use, or investment opportunity
- Use vivid, sensory language that brings the innovation to life
- Vary your openings - sometimes start with the technology, sometimes with nature, sometimes with a question

AVOID:
- Section headers like "Nature Parallel:" or "Why this matters:"
- Generic statements - be specific about people, companies, timelines
- Multiple actions - give just ONE clear next step
- Formulaic structure - let each broadcast flow naturally

Remember: You're telling a story about how this innovation mirrors nature's genius and what someone should DO about it right now.

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
                
                // Enforce length limit
                if (generated.length > 750) {
                    // Find last complete sentence within limit
                    const sentences = generated.match(/[^.!?]+[.!?]+/g) || [];
                    let truncated = '';
                    for (const sentence of sentences) {
                        if ((truncated + sentence).length <= 700) {
                            truncated += sentence;
                        } else {
                            break;
                        }
                    }
                    generated = truncated || generated.substring(0, 700) + '...';
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