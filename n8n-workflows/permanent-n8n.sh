#!/bin/bash

# Permanent n8n setup that bypasses setup screen
echo "Starting permanent n8n setup with no user management..."

# Stop any existing n8n
docker stop n8n 2>/dev/null
docker rm n8n 2>/dev/null

# Create persistent volume if it doesn't exist
docker volume create n8n_data

# Start n8n with user management completely disabled
docker run -d \
  --name n8n \
  --restart unless-stopped \
  -p 5678:5678 \
  -e GENERIC_TIMEZONE="America/New_York" \
  -e N8N_USER_MANAGEMENT_DISABLED=true \
  -e N8N_AUTH_ENABLED=false \
  -e N8N_BASIC_AUTH_ACTIVE=false \
  -e N8N_PERSISTED_BINARY_DATA_TTL=604800 \
  -v n8n_data:/home/node/.n8n \
  n8nio/n8n

echo "N8n started with user management disabled!"
echo "Access at: http://localhost:5678"
echo ""
echo "No setup screen - direct access to workflows!"
echo "Your annual savings: \$1,700-3,500"