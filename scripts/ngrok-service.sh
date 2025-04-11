#!/bin/bash

# Load environment variables
if [ -f /root/.ngrok.env ]; then
    source /root/.ngrok.env
else
    echo "Error: /root/.ngrok.env not found"
    exit 1
fi

# Required environment variables
if [ -z "$NGROK_AUTHTOKEN" ] || [ -z "$SENDGRID_API_KEY" ] || [ -z "$EMAIL_TO" ]; then
    echo "Error: Required environment variables are not set"
    echo "NGROK_AUTHTOKEN: ${NGROK_AUTHTOKEN:+set}"
    echo "SENDGRID_API_KEY: ${SENDGRID_API_KEY:+set}"
    echo "EMAIL_TO: ${EMAIL_TO:+set}"
    exit 1
fi

# Configuration
PORT=3000
MAX_RETRIES=5
RETRY_DELAY=10

# Function to get current ngrok URL
get_ngrok_url() {
    local url
    url=$(curl -s http://localhost:4040/api/tunnels | jq -r '.tunnels[0].public_url')
    if [ $? -ne 0 ] || [ -z "$url" ]; then
        echo "Error: Failed to get ngrok URL"
        return 1
    fi
    echo "$url"
}

# Function to send email using SendGrid
send_email() {
    local old_url=$1
    local new_url=$2
    local subject="Ngrok URL Changed"
    local body="Ngrok URL has changed from $old_url to $new_url"

    echo "Attempting to send email notification..."
    echo "From: $EMAIL_TO"
    echo "To: $EMAIL_TO"
    echo "Subject: $subject"
    echo "Body: $body"

    response=$(curl -s -w "\n%{http_code}" --request POST \
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
        }")

    http_code=$(echo "$response" | tail -n1)
    if [ "$http_code" -eq 202 ]; then
        echo "Email notification sent successfully"
    else
        echo "Failed to send email notification. HTTP code: $http_code"
        echo "Response: $response"
        return 1
    fi
}

# Function to start ngrok tunnel
start_ngrok() {
    local retries=0
    while [ $retries -lt $MAX_RETRIES ]; do
        echo "Starting ngrok tunnel (attempt $((retries + 1))/$MAX_RETRIES)..."

        # Start ngrok in the background
        ngrok http $PORT --authtoken $NGROK_AUTHTOKEN --log=stdout &
        NGROK_PID=$!

        # Wait for ngrok to start and get a valid URL
        for i in {1..30}; do
            current_url=$(get_ngrok_url)
            if [[ $current_url == https://* ]]; then
                echo "Tunnel established at: $current_url"
                return 0
            fi
            sleep 2
            echo "Attempt $i: Waiting for valid URL..."
        done

        # If we get here, ngrok failed to start
        echo "Failed to establish ngrok tunnel, retrying in $RETRY_DELAY seconds..."
        kill $NGROK_PID 2>/dev/null || true
        sleep $RETRY_DELAY
        retries=$((retries + 1))
    done

    echo "Failed to establish ngrok tunnel after $MAX_RETRIES attempts"
    return 1
}

# Main loop
while true; do
    if start_ngrok; then
        # Send initial URL email
        send_email "Starting up" "$current_url"

        # Monitor for URL changes
        while true; do
            # Check if ngrok is still running
            if ! kill -0 $NGROK_PID 2>/dev/null; then
                echo "Ngrok process died, restarting..."
                break
            fi

            sleep 60  # Check every minute
            new_url=$(get_ngrok_url)

            if [ "$new_url" != "$current_url" ] && [[ $new_url == https://* ]]; then
                echo "URL changed from $current_url to $new_url"
                send_email "$current_url" "$new_url"
                current_url=$new_url
            fi
        done
    else
        echo "Critical error: Could not establish ngrok tunnel"
        exit 1
    fi
done