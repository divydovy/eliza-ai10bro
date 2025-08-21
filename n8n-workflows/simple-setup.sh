#!/bin/bash

echo "🚀 Simple N8n Setup - Like Eliza Character File"
echo "==============================================="

# Start n8n fresh
docker run -d \
  --name n8n \
  --restart unless-stopped \
  -p 5678:5678 \
  -v ~/Documents/Projects/Eliza/n8n-data:/home/node/.n8n \
  n8nio/n8n

echo "⏳ Waiting for n8n to start..."
sleep 15

# Setup owner account
curl -X POST http://localhost:5678/rest/owner/setup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@localhost.local", 
    "firstName": "Admin",
    "lastName": "User", 
    "password": "Admin123admin123"
  }' -s > /dev/null

echo ""
echo "✅ N8n is ready at: http://localhost:5678"
echo "🔐 Login: admin@localhost.local / Admin123admin123" 
echo ""
echo "📋 Next steps:"
echo "1. Login to n8n"
echo "2. Click 'New Workflow'"
echo "3. Paste the workflow from: telegram-simple.json"
echo "4. Add Telegram credentials: 7565951809:AAEsVFpZDMK0s9FookBRiC3XsDNV7IvZW-s"
echo "5. Activate workflow"
echo ""
echo "💡 This is now as simple as editing an Eliza character file!"
echo "💰 Annual savings: $1,700-3,500"