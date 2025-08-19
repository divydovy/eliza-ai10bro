#!/usr/bin/env node

const Database = require('better-sqlite3');
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function sendPendingBroadcasts() {
    console.log("📤 Sending pending broadcasts to Telegram...\n");
    
    const db = new Database('./agent/data/db.sqlite');
    
    // Get pending broadcasts
    const pending = db.prepare('SELECT * FROM broadcasts WHERE status = ? AND client = ?').all('pending', 'telegram');
    
    if (pending.length === 0) {
        console.log("No pending broadcasts to send");
        return;
    }
    
    console.log(`Found ${pending.length} pending broadcasts`);
    
    // Get telegram credentials
    const character = JSON.parse(fs.readFileSync('./characters/ai10bro.character.json', 'utf-8'));
    const token = character.settings.secrets.TELEGRAM_BOT_TOKEN;
    const chatIds = character.settings.secrets.TELEGRAM_CHAT_ID.split(',');
    
    let sent = 0;
    let failed = 0;
    
    for (const broadcast of pending) {
        console.log(`\n📨 Sending broadcast ${broadcast.id}`);
        console.log(`   Preview: ${broadcast.content.substring(0, 80)}...`);
        
        let success = true;
        for (const chatId of chatIds) {
            try {
                const telegramUrl = `https://api.telegram.org/bot${token}/sendMessage`;
                const { stdout: response } = await execPromise(`curl -s -X POST "${telegramUrl}" -H "Content-Type: application/json" -d '${JSON.stringify({
                    chat_id: chatId.trim(),
                    text: broadcast.content,
                    parse_mode: 'Markdown',
                    disable_web_page_preview: false
                })}'`);
                
                const result = JSON.parse(response);
                if (result.ok) {
                    console.log(`   ✅ Sent to chat ${chatId}`);
                } else {
                    console.error(`   ❌ Failed for chat ${chatId}: ${result.description}`);
                    success = false;
                }
            } catch (error) {
                console.error(`   ❌ Error sending to ${chatId}: ${error.message}`);
                success = false;
            }
        }
        
        // Update broadcast status
        if (success) {
            db.prepare('UPDATE broadcasts SET status = ?, sent_at = ? WHERE id = ?')
              .run('sent', Date.now(), broadcast.id);
            sent++;
        } else {
            db.prepare('UPDATE broadcasts SET status = ? WHERE id = ?')
              .run('failed', broadcast.id);
            failed++;
        }
    }
    
    db.close();
    
    console.log(`\n✨ Complete!`);
    console.log(`   Sent: ${sent}`);
    console.log(`   Failed: ${failed}`);
}

sendPendingBroadcasts().catch(console.error);