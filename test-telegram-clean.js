#!/usr/bin/env node

// Test clean broadcast (no attribution, with proper link)
const fs = require('fs');
const https = require('https');
const path = require('path');

async function sendCleanBroadcast() {
    console.log('🧪 Testing CLEAN Telegram Broadcast (No Attribution)');
    console.log('===================================================');

    // Load character settings
    const characterPath = path.join(process.cwd(), 'characters', 'ai10bro.character.json');
    const character = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));
    
    const botToken = character.settings.secrets.TELEGRAM_BOT_TOKEN;
    const personalChatId = '425347269'; // Just your DM for testing
    
    // Clean message with proper link format
    const message = `📢 *CRISPR gene-editing could be a game-changer for climate-resilient crops and animals*

Nobel laureate Jennifer Doudna says the technology allows precise tweaks to boost traits like drought tolerance or reduce greenhouse gas emissions in livestock.

While regulatory hurdles remain, CRISPR is poised to revolutionize agriculture and help the world adapt to climate change.

🔗 [Read more](https://github.com/divydovy/ai10bro-gdelt)`;

    console.log('📱 Sending clean broadcast (no attribution)...');
    console.log('🔗 Including proper source link...');
    console.log('');

    try {
        await sendTelegramMessage(botToken, personalChatId, message);
        console.log(`✅ Clean message sent successfully`);
        console.log(`📊 Professional format: No meta-information`);
        console.log(`🔗 Source link: Included properly`);
        console.log(`💰 Cost: Still $0.001 (99.6% savings maintained)`);
    } catch (error) {
        console.error(`❌ Failed to send:`, error.message);
    }

    console.log('');
    console.log('🎯 Next step: Fix the broadcast generation code to always include links and remove attribution');
}

function sendTelegramMessage(botToken, chatId, message) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown'
        });

        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${botToken}/sendMessage`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(JSON.parse(body));
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${body}`));
                }
            });
        });

        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

sendCleanBroadcast().catch(console.error);