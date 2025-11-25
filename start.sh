#!/bin/bash

set -e

API_PORT=8081
NGROK_LOG="./data/ngrok.log"

mkdir -p ./data

echo ""
echo "============================================"
echo "🔗 API Mode: Local API"
echo "🔌 Ngrok Tunnel: Enabled"
echo "============================================"
echo ""

echo "🚀 Starting Local API..."
./start-local-api.sh > ./data/api-output.log 2>&1 &
API_PID=$!

sleep 3

if ! kill -0 $API_PID 2>/dev/null; then
  echo "❌ Local API failed to start! Check ./data/api-output.log"
  exit 1
fi

echo "✅ Local API running (PID: $API_PID)"

# Kill existing ngrok if exists
pgrep -x "ngrok" >/dev/null && killall ngrok 2>/dev/null || true

echo "🌐 Starting Ngrok tunnel..."
echo ""

# Background loop: auto-restart ngrok
while true; do
    ./ngrok http $API_PORT --log=stdout --log-level=info > "$NGROK_LOG" 2>&1 &
    NGROK_PID=$!

    # Wait until ngrok API is ready
    until curl -s http://127.0.0.1:4040/api/tunnels >/dev/null 2>&1; do
        sleep 1
    done

    # Get public URL
    PUBLIC_URL=$(curl -s http://127.0.0.1:4040/api/tunnels | grep -o 'https://[^"]*')

    echo "🌍 Public Ngrok URL: $PUBLIC_URL"
    echo "📄 Ngrok Logs: $NGROK_LOG"
    echo ""

    # Wait for ngrok exit
    wait $NGROK_PID

    echo "⚠️ Ngrok stopped! Restarting in 3 seconds..."
    sleep 3
done &

trap "echo '🛑 Cleanup...'; kill $API_PID $NGROK_PID 2>/dev/null" EXIT

wait
