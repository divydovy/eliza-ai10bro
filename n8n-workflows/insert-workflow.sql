INSERT INTO workflow_entity (
  id, name, active, nodes, connections, createdAt, updatedAt, versionId, settings
) VALUES (
  'telegram-broadcast-001',
  'Telegram Broadcast (Zero Cost)',
  0,
  json('[
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "telegram-broadcast",
        "responseMode": "lastNode"
      },
      "id": "webhook1",
      "name": "Webhook Trigger",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1.1,
      "position": [250, 300]
    },
    {
      "parameters": {
        "jsCode": "const title = $input.first().json.title || \"Update\";\nconst text = $input.first().json.text || \"\";\nconst url = $input.first().json.url || \"\";\nlet message = `📢 *${title}*\\n\\n${text}`;\nif (url) message += `\\n\\n🔗 [Source](${url})`;\nreturn [{chatId: \"425347269\", message: message}, {chatId: \"-1002339513336\", message: message}];"
      },
      "id": "code1",
      "name": "Format Message",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [450, 300]
    },
    {
      "parameters": {
        "resource": "message",
        "operation": "sendMessage",
        "chatId": "={{ $json.chatId }}",
        "text": "={{ $json.message }}",
        "additionalFields": {"parse_mode": "Markdown"}
      },
      "id": "telegram1",
      "name": "Send to Telegram",
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [650, 300],
      "credentials": {
        "telegramApi": {
          "id": "telegram-bot-1",
          "name": "AI10bro Bot"
        }
      }
    }
  ]'),
  json('{
    "Webhook Trigger": {
      "main": [[{"node": "Format Message", "type": "main", "index": 0}]]
    },
    "Format Message": {
      "main": [[{"node": "Send to Telegram", "type": "main", "index": 0}]]
    }
  }'),
  datetime('now'),
  datetime('now'),
  'v1',
  json('{}')
);