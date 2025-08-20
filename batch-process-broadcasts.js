#!/usr/bin/env node

const Database = require('better-sqlite3');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const crypto = require('crypto');
const fs = require('fs');

async function batchProcessBroadcasts(batchSize = 50, maxBatches = 10) {
    console.log(`🚀 Batch Processing Broadcasts`);
    console.log(`   Batch size: ${batchSize} documents`);
    console.log(`   Max batches: ${maxBatches}\n`);
    
    const db = new Database('./agent/data/db.sqlite');
    const startTime = Date.now();
    
    try {
        // Get total unprocessed count
        const totalUnprocessed = db.prepare(`
            SELECT COUNT(*) as count FROM memories m
            WHERE m.type = 'documents'
            AND NOT EXISTS (
                SELECT 1 FROM broadcasts b WHERE b.documentId = m.id
            )
            AND json_extract(m.content, '$.text') IS NOT NULL
            AND length(json_extract(m.content, '$.text')) > 100
        `).get().count;
        
        console.log(`📊 Total unprocessed documents: ${totalUnprocessed}\n`);
        
        if (totalUnprocessed === 0) {
            console.log('✅ All documents have been processed!');
            return;
        }
        
        let totalProcessed = 0;
        let totalFailed = 0;
        let batchCount = 0;
        
        while (batchCount < maxBatches && totalProcessed < totalUnprocessed) {
            batchCount++;
            console.log(`\n${'='.repeat(60)}`);
            console.log(`📦 Processing Batch ${batchCount}/${maxBatches}`);
            console.log(`${'='.repeat(60)}`);
            
            // Get next batch of unprocessed documents
            const docs = db.prepare(`
                SELECT m.* FROM memories m
                WHERE m.type = 'documents'
                AND NOT EXISTS (
                    SELECT 1 FROM broadcasts b WHERE b.documentId = m.id
                )
                AND json_extract(m.content, '$.text') IS NOT NULL
                AND length(json_extract(m.content, '$.text')) > 100
                ORDER BY m.createdAt DESC
                LIMIT ?
            `).all(batchSize);
            
            if (docs.length === 0) {
                console.log('No more documents to process');
                break;
            }
            
            console.log(`Found ${docs.length} documents in this batch\n`);
            
            let batchProcessed = 0;
            let batchFailed = 0;
            
            for (let i = 0; i < docs.length; i++) {
                const doc = docs[i];
                const progress = `[${i + 1}/${docs.length}]`;
                
                try {
                    const content = JSON.parse(doc.content);
                    const title = content.metadata?.title || 
                                 content.metadata?.frontmatter?.title ||
                                 content.text?.substring(0, 50) || 
                                 'Unknown';
                    
                    process.stdout.write(`${progress} Processing: ${title.substring(0, 40)}...`);
                    
                    // Generate broadcast using improved prompt
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
                    const tempFile = `/tmp/broadcast-batch-${Date.now()}.txt`;
                    fs.writeFileSync(tempFile, prompt);
                    
                    const { stdout } = await execPromise(`ollama run qwen2.5:14b < ${tempFile}`, {
                        timeout: 30000 // 30 second timeout
                    });
                    fs.unlinkSync(tempFile);
                    
                    // Extract broadcast
                    let generated = stdout.trim();
                    const match = generated.match(/\[BROADCAST:.*?\](.*?)$/s);
                    if (match) {
                        generated = match[1].trim();
                    }
                    
                    // Enforce length limit
                    if (generated.length > 750) {
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
                    const sourceUrl = content.metadata?.frontmatter?.source || 
                                      content.metadata?.url || 
                                      content.url ||
                                      (content.source !== 'obsidian' ? content.source : null);
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
                    
                    process.stdout.write(` ✅\n`);
                    batchProcessed++;
                    
                } catch (error) {
                    process.stdout.write(` ❌ ${error.message}\n`);
                    batchFailed++;
                }
            }
            
            totalProcessed += batchProcessed;
            totalFailed += batchFailed;
            
            console.log(`\nBatch ${batchCount} complete:`);
            console.log(`   ✅ Processed: ${batchProcessed}`);
            console.log(`   ❌ Failed: ${batchFailed}`);
            
            // Small delay between batches to avoid overloading
            if (batchCount < maxBatches) {
                console.log('\nWaiting 2 seconds before next batch...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        const duration = Math.round((Date.now() - startTime) / 1000);
        
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📊 Final Summary`);
        console.log(`${'='.repeat(60)}`);
        console.log(`   Total processed: ${totalProcessed}`);
        console.log(`   Total failed: ${totalFailed}`);
        console.log(`   Time taken: ${duration} seconds`);
        console.log(`   Processing rate: ${(totalProcessed / duration).toFixed(1)} docs/second`);
        
        const remaining = db.prepare(`
            SELECT COUNT(*) as count FROM memories m
            WHERE m.type = 'documents'
            AND NOT EXISTS (
                SELECT 1 FROM broadcasts b WHERE b.documentId = m.id
            )
        `).get().count;
        
        console.log(`   Documents remaining: ${remaining}`);
        console.log(`${'='.repeat(60)}\n`);
        
    } finally {
        db.close();
    }
}

// Run if called directly
if (require.main === module) {
    const batchSize = process.argv[2] ? parseInt(process.argv[2]) : 50;
    const maxBatches = process.argv[3] ? parseInt(process.argv[3]) : 10;
    
    console.log('Usage: node batch-process-broadcasts.js [batchSize] [maxBatches]');
    console.log('Example: node batch-process-broadcasts.js 50 10\n');
    
    batchProcessBroadcasts(batchSize, maxBatches).catch(console.error);
}

module.exports = { batchProcessBroadcasts };