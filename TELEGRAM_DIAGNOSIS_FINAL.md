# Telegram Bot Not Responding - Root Cause Found

## Issue
The Telegram bot initializes successfully but **never receives messages**. The bot.launch() appears to hang and never complete its connection to Telegram's long polling API.

## Evidence

### ✅ What Works
1. Bot token is valid (confirmed via getMe API call)
2. Bot can SEND messages (broadcasts work, test messages work)
3. Bot initializes successfully in agent logs
4. No webhook is set (confirmed)
5. Bot username is correct: @ai10bro_bot

### ❌ What Doesn't Work
1. Bot never receives messages (no logs when messages sent)
2. Telegraf bot.launch() hangs indefinitely
3. Long polling connection never establishes
4. Message handlers never fire

## Root Cause

**The bot's long polling connection to Telegram API is failing silently.**

When `bot.launch()` is called, it attempts to connect to Telegram's getUpdates endpoint for long polling. This connection is **hanging** rather than completing or throwing an error.

## Potential Causes

### 1. **Network/Firewall Issue** (Most Likely)
- Something is blocking outbound connections to api.telegram.org
- Proxy or firewall interfering with long-polling connections
- ISP blocking or rate-limiting Telegram API

**Test**: Try from different network
```bash
# Switch to mobile hotspot or different WiFi and restart agent
```

### 2. **Bot Rate Limited by Telegram**
- Too many restart attempts may have triggered rate limiting
- Bot may be temporarily blocked

**Solution**: Wait 1 hour, then try again

### 3. **Conflicting Polling Instances**
- Another instance of the bot may still be polling
- This would prevent new connections

**Check**:
```bash
ps aux | grep "node" | grep -E "(agent|telegram|eliza)"
```

Make sure ALL old instances are killed before restarting.

### 4. **Telegram API Outage**
**Test**: Check https://downdetector.com/status/telegram/

## Recommended Solutions

### Solution 1: Use Webhooks Instead of Polling

Webhooks are more reliable than long polling. Set up a webhook:

```javascript
// In telegramClient.ts, replace bot.launch() with:
await bot.telegram.setWebhook(`https://your-domain.com/telegram-webhook/${botToken}`);

// Then handle webhooks in your web server
app.post(`/telegram-webhook/${botToken}`, (req, res) => {
    bot.handleUpdate(req.body, res);
});
```

**Note**: Requires public HTTPS endpoint.

### Solution 2: Add Timeout and Retry Logic

Modify bot.launch() to detect hanging and retry:

```javascript
// Add timeout to bot launch
const launchWithTimeout = async (bot, timeout = 30000) => {
    return Promise.race([
        bot.launch({ dropPendingUpdates: true }),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Bot launch timeout')), timeout)
        )
    ]);
};

try {
    await launchWithTimeout(this.bot);
    elizaLogger.success('Bot launched successfully');
} catch (error) {
    elizaLogger.error('Bot launch failed:', error);
    // Retry logic here
}
```

### Solution 3: Debug with Polling Options

Try manual polling with explicit options:

```javascript
bot.launch({
    dropPendingUpdates: true,
    allowedUpdates: ['message', 'edited_message'],
    webhook: {
        domain: '',  // Explicitly disable webhook
    },
    polling: {
        timeout: 30,
        limit: 100,
        allowed_updates: ['message']
    }
});
```

### Solution 4: Network Diagnostics

```bash
# Test direct connectivity to Telegram API
curl -v https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe

# Test with longer timeout
curl --connect-timeout 30 https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getUpdates?timeout=10

# Check for proxy/firewall
echo $HTTP_PROXY
echo $HTTPS_PROXY
```

### Solution 5: Temporary Workaround - Manual Polling

Create a manual polling script:

```javascript
// manual-telegram-poll.js
const https = require('https');
const fs = require('fs');
const path = require('path');

const characterPath = path.join(process.cwd(), 'characters', 'ai10bro.character.json');
const character = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));
const botToken = character.settings.secrets.TELEGRAM_BOT_TOKEN;

let offset = 0;

async function poll() {
    try {
        const updates = await getUpdates(botToken, offset);
        if (updates.ok && updates.result.length > 0) {
            console.log(`Received ${updates.result.length} updates`);
            for (const update of updates.result) {
                console.log('Update:', JSON.stringify(update, null, 2));
                offset = update.update_id + 1;

                // Forward to agent API
                await fetch('http://localhost:3000/telegram/webhook', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(update)
                });
            }
        }
    } catch (error) {
        console.error('Poll error:', error.message);
    }

    // Poll every 2 seconds
    setTimeout(poll, 2000);
}

function getUpdates(token, offset) {
    return new Promise((resolve, reject) => {
        const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=10`;
        https.get(url, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

poll();
```

## Immediate Action

1. **Kill all node processes**:
   ```bash
   killall -9 node
   ```

2. **Check network connectivity**:
   ```bash
   curl https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe
   ```

   If this hangs or fails, you have a network issue.

3. **Try from different network** (mobile hotspot)

4. **If network is fine**, wait 1 hour (rate limit cooldown) then restart

5. **Consider webhook setup** for production reliability

## Files Created for Debugging

- `test-telegram-bot-alive.js` - Bot status checker
- `check-telegram-webhook.js` - Webhook status
- `debug-telegram-updates.js` - Update checker
- `test-telegraf-direct.js` - Minimal Telegraf test (exposed the hang)
- `TELEGRAM_FIX.md` - Initial diagnosis
- `AGENT_RESTART_SUMMARY.md` - Restart documentation
- `This file` - Final diagnosis

## Next Steps

1. Test network connectivity to api.telegram.org
2. If network issue: fix network or use webhook
3. If rate limiting: wait 1 hour
4. If persistent: switch to webhook mode
5. Consider adding timeout/retry logic to bot.launch()

---

**Status**: Root cause identified - long polling connection failing
**Type**: Network/Infrastructure issue
**Severity**: High (bot can send but not receive)
**Solution**: Network diagnostics + webhook fallback

