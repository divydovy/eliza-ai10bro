# N8N Quick Setup Guide

## ✅ N8n is now running at http://localhost:5678

### Step 1: First Time Setup (if prompted)
- Create an account (any email/password will work)
- Or skip if you see the workflow editor

### Step 2: Add Telegram Credentials
1. Click **Credentials** (left sidebar)
2. Click **Add Credential** → Search "Telegram"
3. Add your bot token: `7565951809:AAEsVFpZDMK0s9FookBRiC3XsDNV7IvZW-s`
4. Name it: "AI10bro Telegram Bot"
5. Click **Save**

### Step 3: Import the Workflow
1. Click **Workflows** (left sidebar)
2. Click **Add Workflow** (top right)
3. In the empty canvas, press `Ctrl+A` then `Ctrl+V` and paste this:

```json
{
  "name": "AI10bro Telegram Broadcast - Simple",
  "nodes": [
    {
      "parameters": {
        "path": "telegram-broadcast",
        "options": {}
      },
      "id": "webhook",
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1,
      "position": [250, 300],
      "webhookId": "telegram-broadcast"
    },
    {
      "parameters": {
        "resource": "message",
        "operation": "sendMessage",
        "chatId": "425347269",
        "text": "=📢 *{{$json[\"title\"]}}*\n\n{{$json[\"text\"]}}\n\n🔗 Source: {{$json[\"url\"]}}",
        "additionalFields": {
          "parse_mode": "Markdown"
        }
      },
      "id": "telegram1",
      "name": "Send to Personal",
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1,
      "position": [450, 250],
      "credentials": {
        "telegramApi": {
          "id": "",
          "name": "AI10bro Telegram Bot"
        }
      }
    },
    {
      "parameters": {
        "resource": "message",
        "operation": "sendMessage",
        "chatId": "-1002339513336",
        "text": "=📢 *{{$json[\"title\"]}}*\n\n{{$json[\"text\"]}}\n\n🔗 Source: {{$json[\"url\"]}}",
        "additionalFields": {
          "parse_mode": "Markdown"
        }
      },
      "id": "telegram2",
      "name": "Send to Group",
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1,
      "position": [450, 350],
      "credentials": {
        "telegramApi": {
          "id": "",
          "name": "AI10bro Telegram Bot"
        }
      }
    }
  ],
  "connections": {
    "Webhook": {
      "main": [
        [
          {
            "node": "Send to Personal",
            "type": "main",
            "index": 0
          },
          {
            "node": "Send to Group",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

4. Click **Save** (top right)
5. Toggle **Active** switch (top right)

### Step 4: Test Your Workflow
Once activated, test with this command:

```bash
curl -X POST http://localhost:5678/webhook/telegram-broadcast \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Migration Success!",
    "text": "N8n workflow is working - no more expensive LLM calls!",
    "url": "https://github.com/divydovy/ai10bro-gdelt"
  }'
```

## 🎉 That's it! 

Your Telegram broadcasts now cost $0.00 instead of $0.15-0.30 each!