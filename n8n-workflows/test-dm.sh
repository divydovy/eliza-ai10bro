#!/bin/bash

echo "🧪 Testing N8N Telegram DM Only"
echo "================================"
echo ""
echo "Sending test message to your DM..."
echo ""

curl -X POST http://localhost:5678/webhook/telegram-broadcast \
  -H "Content-Type: application/json" \
  -d '{
    "title": "✅ N8n Test Successful!",
    "text": "Your Telegram integration is working! This message cost $0.00 instead of $0.25. The migration from ElizaOS to n8n is complete.",
    "url": "https://github.com/divydovy/ai10bro-gdelt"
  }'

echo ""
echo ""
echo "📱 Check your Telegram DM!"
echo "💰 This broadcast cost: $0.00 (was $0.25 with ElizaOS)"
echo "📊 Annual savings: $1,700-3,500"