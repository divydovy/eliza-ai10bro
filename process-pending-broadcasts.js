#!/usr/bin/env node

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function processPendingBroadcasts() {
    console.log("🚀 Processing 8 pending broadcasts through LLM...\n");
    
    // Connect to database
    const db = new Database('./agent/data/db.sqlite');
    
    // Get pending broadcasts with their document content
    const pendingBroadcasts = db.prepare(`
        SELECT 
            b.id as broadcastId,
            b.documentId,
            b.alignment_score,
            m.content as documentContent
        FROM broadcasts b
        JOIN memories m ON m.id = b.documentId
        WHERE b.status = 'pending'
        ORDER BY b.alignment_score DESC
        LIMIT 8
    `).all();
    
    console.log(`Found ${pendingBroadcasts.length} pending broadcasts to process\n`);
    
    // Load character for broadcast prompt
    const characterPath = path.join(__dirname, 'characters/ai10bro.character.json');
    const character = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));
    
    const results = [];
    
    for (const broadcast of pendingBroadcasts) {
        const content = JSON.parse(broadcast.documentContent);
        const text = content.text || '';
        
        // Extract title
        const titleMatch = text.match(/title:\s*"?([^"\n]+)"?/i);
        const title = titleMatch ? titleMatch[1].trim() : text.substring(0, 50) + '...';
        
        console.log(`\n📄 Processing: ${title}`);
        console.log(`   Alignment: ${broadcast.alignment_score.toFixed(3)}`);
        console.log(`   Broadcast ID: ${broadcast.broadcastId}`);
        
        // Clean text
        const cleanedText = text.replace(/\*[^*]+\*/g, '').replace(/\s+/g, ' ').trim();
        
        // Extract source URL
        const sourceMatch = text.match(/source:\s*(https?:\/\/[^\s]+)/i);
        const sourceUrl = sourceMatch ? sourceMatch[1] : null;
        
        // Create prompt for Ollama
        const prompt = `${character.settings?.broadcastPrompt || 'Extract the most remarkable pattern or discovery. Write as David Attenborough observing technological evolution. Draw unexpected parallels between natural and technological systems. Be precise, vivid, and profound.'}

Content to analyze:
${cleanedText.substring(0, 2000)}

Critical requirements:
- Maximum 800 characters for Telegram
- Write as David Attenborough, from your perspective  
- Focus on ONE remarkable insight or pattern
- Draw parallels between natural and technological systems
- Be specific with numbers, names, or concrete examples
- Connect to larger implications
- Start directly with the insight - no preambles
${sourceUrl ? '- Do NOT include the source URL (it will be added separately)' : ''}

[BROADCAST_REQUEST:${broadcast.broadcastId}]`;

        try {
            // Call Ollama to generate the broadcast
            console.log(`   🤖 Generating broadcast with Qwen 2.5...`);
            
            // Save prompt to temp file (to handle special characters)
            const tempFile = `/tmp/broadcast-prompt-${broadcast.broadcastId}.txt`;
            fs.writeFileSync(tempFile, prompt);
            
            // Call Ollama
            const { stdout } = await execPromise(`ollama run qwen2.5:14b < ${tempFile}`);
            
            // Clean up temp file
            fs.unlinkSync(tempFile);
            
            // Extract broadcast message
            let generatedText = stdout.trim();
            
            // Remove the BROADCAST tag if present
            const messageMatch = generatedText.match(/\[BROADCAST:.*?\](.*?)$/s);
            if (messageMatch) {
                generatedText = messageMatch[1].trim();
            }
            
            // Ensure it's not too long
            if (generatedText.length > 800) {
                generatedText = generatedText.substring(0, 797) + '...';
            }
            
            // Add source URL
            let finalText = generatedText;
            if (sourceUrl) {
                finalText = `${finalText}\n\n🔗 Source: ${sourceUrl}`;
            }
            
            // Update broadcast with generated content
            db.prepare(`
                UPDATE broadcasts 
                SET content = ?, status = 'ready' 
                WHERE id = ?
            `).run(finalText, broadcast.broadcastId);
            
            console.log(`   ✅ Generated ${finalText.length} character broadcast`);
            console.log(`   Preview: "${finalText.substring(0, 150)}..."`);
            
            results.push({
                title,
                alignmentScore: broadcast.alignment_score,
                broadcastId: broadcast.broadcastId,
                content: finalText
            });
            
        } catch (error) {
            console.error(`   ❌ Error generating broadcast: ${error.message}`);
        }
    }
    
    // Summary
    console.log("\n" + "=".repeat(80));
    console.log("📊 GENERATED BROADCASTS");
    console.log("=".repeat(80));
    
    results.forEach((r, i) => {
        console.log(`\n${i + 1}. ${r.title}`);
        console.log(`   Alignment: ${r.alignmentScore.toFixed(3)}`);
        console.log(`   Length: ${r.content.length} chars`);
        console.log(`   Message:`);
        console.log(`   "${r.content}"`);
        console.log();
    });
    
    db.close();
    console.log("✨ Processing complete! Broadcasts are ready to send.");
}

processPendingBroadcasts().catch(console.error);