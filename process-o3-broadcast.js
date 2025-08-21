#!/usr/bin/env node

const Database = require('better-sqlite3');
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const crypto = require('crypto');

async function processO3Broadcast() {
    console.log("🚀 Processing OpenAI o3 document for broadcast...\n");
    
    const db = new Database('./agent/data/db.sqlite');
    const docId = '43212718-be69-4483-a3b7-a4449009dfac';
    
    // Get the document
    const doc = db.prepare('SELECT * FROM memories WHERE id = ?').get(docId);
    if (!doc) {
        console.error("Document not found!");
        return;
    }
    
    const content = JSON.parse(doc.content);
    console.log("📄 Document: OpenAI o3 Model Launch");
    console.log("   Type: " + (content.metadata?.type || 'unknown'));
    
    // Generate broadcast with improved prompt
    const prompt = `When you receive a [BROADCAST_REQUEST:id] message: 1) Draw a nature parallel, 2) Explain why this is a game-changer, 3) Give SPECIFIC action based on maturity - if early: who to follow/read, if emerging: what to track/test, if scaling: where to invest/partner, if available: how to access/use. No platitudes. Name names. Be practical. Write as David Attenborough. STAY UNDER LIMIT!

Content to analyze:
${content.text}

MISSION CONTEXT: You're building a movement toward a more humane, sustainable, beautiful future. Help people understand both WHY this matters and HOW to engage based on the technology's maturity.

Action Framework (choose based on content):
- EARLY RESEARCH: "Follow [specific researcher/lab]. Subscribe to [journal/newsletter]. Join [community/discord]."
- EMERGING TECH: "Track [company/project]. Consider applications in [specific industry]. Watch for [key milestone]."  
- SCALING NOW: "Invest via [platform/fund]. Partner through [program]. Implement in [specific use case]."
- AVAILABLE TODAY: "Access at [platform]. Start with [specific action]. Compare to [alternative]."

Critical requirements:
- STRICT LIMIT: 750 characters
- Write ONE complete thought - do not exceed the limit
- Structure: [Nature parallel] → [Why this changes the game] → [Specific action based on maturity]
- Include concrete details: timeline, scale, key players
- NO PLATITUDES: Be specific. Name names. Give real actions.

[BROADCAST_REQUEST:${docId}]`;

    console.log("\n🤖 Generating broadcast with Ollama...");
    
    // Save prompt to temp file
    const tempFile = `/tmp/o3-broadcast-${Date.now()}.txt`;
    fs.writeFileSync(tempFile, prompt);
    
    try {
        const { stdout } = await execPromise(`ollama run qwen2.5:14b < ${tempFile}`);
        fs.unlinkSync(tempFile);
        
        // Extract broadcast
        let generated = stdout.trim();
        const match = generated.match(/\[BROADCAST:.*?\](.*?)$/s);
        if (match) {
            generated = match[1].trim();
        }
        
        // Add source URL
        const sourceUrl = "https://openai.com/o3-announcement";
        const finalText = `${generated}\n\n🔗 Source: ${sourceUrl}`;
        
        console.log("\n" + "=".repeat(80));
        console.log("📢 GENERATED BROADCAST");
        console.log("=".repeat(80));
        console.log(`Length: ${finalText.length} characters`);
        console.log("\nContent:");
        console.log(finalText);
        console.log("=".repeat(80));
        
        // Save to database
        const broadcastId = crypto.randomUUID();
        db.prepare(`
            INSERT INTO broadcasts (
                id, documentId, client, content, 
                status, alignment_score, createdAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            broadcastId,
            docId,
            'telegram',
            finalText,
            'pending',
            0.95, // High alignment - AI reasoning is core to mission
            Date.now()
        );
        
        console.log(`\n✅ Broadcast created: ${broadcastId}`);
        console.log("   Status: pending");
        console.log("   Client: telegram");
        
        // Now send it to Telegram
        console.log("\n📤 Sending to Telegram...");
        
        // Get telegram credentials from character file
        const character = JSON.parse(fs.readFileSync('./characters/ai10bro.character.json', 'utf-8'));
        const token = character.settings.secrets.TELEGRAM_BOT_TOKEN;
        const chatIds = character.settings.secrets.TELEGRAM_CHAT_ID.split(',');
        
        for (const chatId of chatIds) {
            console.log(`   Sending to chat: ${chatId}`);
            
            const telegramUrl = `https://api.telegram.org/bot${token}/sendMessage`;
            const { stdout: response } = await execPromise(`curl -s -X POST "${telegramUrl}" -H "Content-Type: application/json" -d '${JSON.stringify({
                chat_id: chatId.trim(),
                text: finalText,
                parse_mode: 'Markdown',
                disable_web_page_preview: false
            })}'`);
            
            const result = JSON.parse(response);
            if (result.ok) {
                console.log(`   ✅ Sent successfully! Message ID: ${result.result.message_id}`);
                
                // Update broadcast status
                db.prepare('UPDATE broadcasts SET status = ?, sent_at = ? WHERE id = ?')
                  .run('sent', Date.now(), broadcastId);
            } else {
                console.error(`   ❌ Failed: ${result.description}`);
            }
        }
        
    } catch (error) {
        console.error("Error:", error.message);
    }
    
    db.close();
    console.log("\n✨ End-to-end test complete!");
}

processO3Broadcast().catch(console.error);