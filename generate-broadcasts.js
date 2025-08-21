#!/usr/bin/env node

/**
 * Generate broadcast messages from recent documents
 * This creates actual broadcast messages (not raw documents) for the queue
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'agent/data/db.sqlite');

async function generateBroadcasts() {
    console.log('🚀 Starting broadcast generation from recent documents...\n');
    
    const db = new sqlite3.Database(DB_PATH);
    
    // Get recent documents (last 7 days) that haven't been broadcast
    const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days ago
    
    const query = `
        SELECT id, content 
        FROM memories 
        WHERE type = 'documents' 
        AND createdAt > ? 
        AND id NOT IN (SELECT documentId FROM broadcasts)
        ORDER BY createdAt DESC
        LIMIT 10
    `;
    
    db.all(query, [cutoffTime], async (err, documents) => {
        if (err) {
            console.error('❌ Error fetching documents:', err);
            db.close();
            return;
        }
        
        console.log(`📚 Found ${documents.length} recent documents to process\n`);
        
        if (documents.length === 0) {
            console.log('ℹ️ No new documents to process');
            
            // Let's check for ANY documents
            db.get("SELECT COUNT(*) as count FROM memories WHERE type = 'documents'", (err, result) => {
                if (!err) {
                    console.log(`Total documents in database: ${result.count}`);
                }
                
                // Get some sample documents regardless of date
                const sampleQuery = `
                    SELECT id, json_extract(content, '$.text') as text,
                           json_extract(content, '$.metadata.path') as path
                    FROM memories 
                    WHERE json_extract(content, '$.text') IS NOT NULL
                    AND id NOT IN (SELECT documentId FROM broadcasts WHERE status != 'failed')
                    ORDER BY createdAt DESC
                    LIMIT 5
                `;
                
                db.all(sampleQuery, [], (err, samples) => {
                    if (!err && samples.length > 0) {
                        console.log('\n📄 Sample documents available for broadcast:');
                        samples.forEach((doc, i) => {
                            const preview = doc.text ? doc.text.substring(0, 100) : 'No text';
                            console.log(`${i + 1}. ${doc.path || 'Unknown'}: ${preview}...`);
                        });
                        
                        console.log('\n💡 To generate broadcasts for these, we need to:');
                        console.log('1. Trigger the agent to call CREATE_MESSAGE action for each document');
                        console.log('2. The agent will generate appropriate broadcast messages');
                        console.log('3. Then PROCESS_QUEUE will send them\n');
                        
                        console.log('Triggering CREATE_MESSAGE for the first document...\n');
                        
                        // Trigger CREATE_MESSAGE for the first document
                        const firstDoc = samples[0];
                        if (firstDoc) {
                            const http = require('http');
                            const messageData = JSON.stringify({
                                text: `CREATE_MESSAGE for document ${firstDoc.id}`,
                                documentId: firstDoc.id,
                                userId: 'scheduler',
                                userName: 'Broadcast Generator'
                            });
                            
                            const options = {
                                hostname: 'localhost',
                                port: 3000,
                                path: '/7298724c-f4fa-0ff3-b2aa-3660e54108d4/message',
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Content-Length': messageData.length
                                }
                            };
                            
                            const req = http.request(options, (res) => {
                                let data = '';
                                res.on('data', chunk => data += chunk);
                                res.on('end', () => {
                                    console.log('✅ Agent response:', data.substring(0, 200));
                                    
                                    // Check if broadcast was created
                                    setTimeout(() => {
                                        db.get(
                                            "SELECT COUNT(*) as count FROM broadcasts WHERE status='pending'",
                                            (err, result) => {
                                                if (!err) {
                                                    console.log(`\n📊 Pending broadcasts in queue: ${result.count}`);
                                                }
                                                db.close();
                                            }
                                        );
                                    }, 2000);
                                });
                            });
                            
                            req.on('error', (e) => {
                                console.error(`❌ Error triggering CREATE_MESSAGE: ${e.message}`);
                                db.close();
                            });
                            
                            req.write(messageData);
                            req.end();
                        }
                    } else {
                        console.log('❌ No documents found in database');
                        db.close();
                    }
                });
            });
        } else {
            // Process documents if found
            console.log('Would process these documents, but need to implement message generation');
            db.close();
        }
    });
}

// Run the script
generateBroadcasts().catch(console.error);