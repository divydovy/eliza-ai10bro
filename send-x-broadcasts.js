#!/usr/bin/env node

const Database = require('better-sqlite3');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const OAuth = require('oauth-1.0a');

// Initialize OAuth
function getOAuth(credentials) {
    const oauth = OAuth({
        consumer: {
            key: credentials.TWITTER_API_KEY,
            secret: credentials.TWITTER_API_KEY_SECRET
        },
        signature_method: 'HMAC-SHA1',
        hash_function(base_string, key) {
            return crypto
                .createHmac('sha1', key)
                .update(base_string)
                .digest('base64');
        }
    });
    
    const token = {
        key: credentials.TWITTER_ACCESS_TOKEN,
        secret: credentials.TWITTER_ACCESS_TOKEN_SECRET
    };
    
    return { oauth, token };
}

function sendTweet(text, credentials, dryRun = false) {
    return new Promise((resolve, reject) => {
        if (dryRun) {
            console.log(`   🔍 DRY RUN - Would post (${text.length} chars):`);
            console.log(`   "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
            resolve({ ok: true, dryRun: true, length: text.length });
            return;
        }
        
        const { oauth, token } = getOAuth(credentials);
        
        const request_data = {
            url: 'https://api.twitter.com/2/tweets',
            method: 'POST',
            data: { text: text }
        };
        
        const headers = oauth.toHeader(oauth.authorize(request_data, token));
        headers['Content-Type'] = 'application/json';
        
        const body = JSON.stringify({ text: text });
        headers['Content-Length'] = Buffer.byteLength(body);
        
        const options = {
            hostname: 'api.twitter.com',
            port: 443,
            path: '/2/tweets',
            method: 'POST',
            headers: headers
        };
        
        const req = https.request(options, (res) => {
            let responseBody = '';
            res.on('data', chunk => responseBody += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(responseBody);
                    if (res.statusCode === 201) {
                        resolve({ ok: true, data: result.data });
                    } else {
                        resolve({ ok: false, error: result });
                    }
                } catch (e) {
                    reject(new Error(`Invalid response: ${responseBody}`));
                }
            });
        });
        
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function sendPendingXBroadcasts(dryRun = false) {
    console.log(`📤 ${dryRun ? 'DRY RUN - ' : ''}Sending pending X/Twitter broadcasts...\n`);
    
    const db = new Database('./agent/data/db.sqlite');
    
    // Check for LIMIT environment variable
    const limit = process.env.LIMIT ? parseInt(process.env.LIMIT) : 5; // Default to 5 for X to avoid rate limits
    
    // Get pending X broadcasts
    let query = 'SELECT * FROM broadcasts WHERE status = ? AND client = ?';
    if (limit) {
        query += ` LIMIT ${limit}`;
    }
    
    const pending = db.prepare(query).all('pending', 'twitter');
    
    if (pending.length === 0) {
        console.log("No pending X broadcasts to send");
        return;
    }
    
    const totalPending = db.prepare('SELECT COUNT(*) as count FROM broadcasts WHERE status = ? AND client = ?')
        .get('pending', 'twitter').count;
    
    console.log(`Sending ${pending.length} of ${totalPending} pending X broadcasts (LIMIT=${limit})`);
    
    // Get X/Twitter credentials
    const character = JSON.parse(fs.readFileSync('./characters/ai10bro.character.json', 'utf-8'));
    const credentials = character.settings.secrets;
    
    let sent = 0;
    let failed = 0;
    
    for (const broadcast of pending) {
        console.log(`\n🐦 ${dryRun ? 'DRY RUN - ' : ''}Sending broadcast ${broadcast.id.substring(0, 8)}...`);
        console.log(`   Length: ${broadcast.content.length} chars`);
        console.log(`   Preview: ${broadcast.content.substring(0, 80)}...`);
        
        // Length validation
        if (broadcast.content.length > 280) {
            console.error(`   ❌ Content too long: ${broadcast.content.length} chars (max 280)`);
            if (!dryRun) {
                db.prepare('UPDATE broadcasts SET status = ? WHERE id = ?')
                  .run('failed', broadcast.id);
            }
            failed++;
            continue;
        }
        
        try {
            const result = await sendTweet(broadcast.content, credentials, dryRun);
            
            if (result.ok) {
                console.log(`   ✅ ${dryRun ? 'Would be sent' : 'Sent'} successfully`);
                if (!dryRun) {
                    db.prepare('UPDATE broadcasts SET status = ?, sent_at = ?, message_id = ? WHERE id = ?')
                      .run('sent', Date.now(), result.data?.id || null, broadcast.id);
                }
                sent++;
            } else {
                console.error(`   ❌ Failed:`, result.error);
                if (!dryRun) {
                    db.prepare('UPDATE broadcasts SET status = ? WHERE id = ?')
                      .run('failed', broadcast.id);
                }
                failed++;
            }
        } catch (error) {
            console.error(`   ❌ Error:`, error.message);
            if (!dryRun) {
                db.prepare('UPDATE broadcasts SET status = ? WHERE id = ?')
                  .run('failed', broadcast.id);
            }
            failed++;
        }
        
        // Rate limiting - wait 1 second between posts
        if (!dryRun && sent < pending.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    db.close();
    
    console.log(`\n✨ Complete!`);
    console.log(`   ${dryRun ? 'Would send' : 'Sent'}: ${sent}`);
    console.log(`   Failed: ${failed}`);
}

// Check command line arguments
const isDryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';

// Run if called directly
if (require.main === module) {
    sendPendingXBroadcasts(isDryRun)
        .catch(console.error);
}

module.exports = { sendPendingXBroadcasts };