#!/bin/bash

# Load environment variables
if [ -f /root/.ngrok.env ]; then
    source /root/.ngrok.env
fi

# Required environment variables
if [ -z "$NGROK_AUTHTOKEN" ] || [ -z "$SENDGRID_API_KEY" ] || [ -z "$EMAIL_TO" ]; then
    echo "Error: Required environment variables are not set"
    exit 1
fi

# Configuration
PORT=3000

# Function to get current ngrok URL
get_ngrok_url() {
    curl -s http://localhost:4040/api/tunnels | jq -r '.tunnels[0].public_url'
}

# Function to send email using SendGrid
send_email() {
    local old_url=$1
    local new_url=$2
    local subject="Ngrok URL Changed"
    local body="Ngrok URL has changed from $old_url to $new_url"

    curl --request POST \
         --url https://api.sendgrid.com/v3/mail/send \
         --header "Authorization: Bearer $SENDGRID_API_KEY" \
         --header 'Content-Type: application/json' \
         --data "{
            \"personalizations\": [
                {
                    \"to\": [
                        {
                            \"email\": \"$EMAIL_TO\"
                        }
                    ]
                }
            ],
            \"from\": {
                \"email\": \"$EMAIL_TO\"
            },
            \"subject\": \"$subject\",
            \"content\": [
                {
                    \"type\": \"text/plain\",
                    \"value\": \"$body\"
                }
            ]
        }"
}

# Start ngrok in the background
ngrok http $PORT --authtoken $NGROK_AUTHTOKEN --log=stdout &
NGROK_PID=$!

# Wait for ngrok to start and get a valid URL
echo "Waiting for ngrok to establish tunnel..."
for i in {1..30}; do
    current_url=$(get_ngrok_url)
    if [[ $current_url == https://* ]]; then
        echo "Tunnel established at: $current_url"
        break
    fi
    sleep 2
    echo "Attempt $i: Waiting for valid URL..."
done

if [[ $current_url != https://* ]]; then
    echo "Failed to establish ngrok tunnel"
    exit 1
fi

# Send initial URL email
send_email "Starting up" "$current_url"

# Monitor for URL changes
while true; do
    # Check if ngrok is still running
    if ! kill -0 $NGROK_PID 2>/dev/null; then
        echo "Ngrok process died, restarting..."
        ngrok http $PORT --authtoken $NGROK_AUTHTOKEN --log=stdout &
        NGROK_PID=$!
        sleep 5
    fi

    sleep 60  # Check every minute
    new_url=$(get_ngrok_url)

    if [ "$new_url" != "$current_url" ] && [[ $new_url == https://* ]]; then
        echo "URL changed from $current_url to $new_url"
        send_email "$current_url" "$new_url"
        current_url=$new_url
    fi
done