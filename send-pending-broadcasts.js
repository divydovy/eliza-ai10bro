#!/usr/bin/env node

const Database = require('better-sqlite3');
const fs = require('fs');
const https = require('https');

function escapeMarkdown(text) {
    // Escape special Markdown characters for Telegram
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

function sendTelegramMessage(botToken, chatId, text) {
    return new Promise((resolve, reject) => {
        // Escape markdown in URLs and other special characters
        const escapedText = text.replace(/(https?:\/\/[^\s]+)/g, (url) => {
            return url.replace(/_/g, '\\_');
        });
        
        const data = JSON.stringify({
            chat_id: chatId,
            text: escapedText,
            parse_mode: 'Markdown',
            disable_web_page_preview: false
        });

        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${botToken}/sendMessage`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(body);
                    resolve(result);
                } catch (e) {
                    reject(new Error(`Invalid response: ${body}`));
                }
            });
        });

        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function sendPendingBroadcasts() {
    console.log("📤 Sending pending broadcasts to Telegram...\n");
    
    const db = new Database('./agent/data/db.sqlite');
    
    // Check for LIMIT environment variable
    const limit = process.env.LIMIT ? parseInt(process.env.LIMIT) : null;
    
    // Get pending broadcasts - either limited or all
    let query = 'SELECT * FROM broadcasts WHERE status = ? AND client = ?';
    if (limit) {
        query += ` LIMIT ${limit}`;
    }
    
    const pending = db.prepare(query).all('pending', 'telegram');
    
    if (pending.length === 0) {
        console.log("No pending broadcasts to send");
        return;
    }
    
    const totalPending = db.prepare('SELECT COUNT(*) as count FROM broadcasts WHERE status = ? AND client = ?').get('pending', 'telegram').count;
    
    if (limit) {
        console.log(`Sending ${pending.length} of ${totalPending} pending broadcasts (LIMIT=${limit})`);
    } else {
        console.log(`Found ${pending.length} pending broadcasts`);
    }
    
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
                const result = await sendTelegramMessage(token, chatId.trim(), broadcast.content);
                
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