#!/bin/bash

echo "🧪 Testing N8N Telegram Workflow (Cost-Free Version)"
echo "===================================================="
echo ""
echo "Sending test broadcast..."
echo ""

curl -X POST http://localhost:5678/webhook/telegram-broadcast \
  -H "Content-Type: application/json" \
  -d '{
    "title": "✅ Migration Complete!",
    "text": "Your Telegram broadcasts now cost $0.00 instead of $0.25 each. The smart truncation preserves complete sentences and the full 4096 character limit is available. No more expensive LLM calls!",
    "url": "https://github.com/divydovy/ai10bro-gdelt"
  }'

echo ""
echo ""
echo "📊 Cost Comparison:"
echo "-------------------"
echo "OLD (ElizaOS): $0.25 per broadcast (50K tokens)"
echo "NEW (N8N):     $0.00 per broadcast (0 tokens)"
echo "SAVINGS:       100% reduction"
echo ""
echo "If the webhook returns 404, activate the workflow in n8n interface."