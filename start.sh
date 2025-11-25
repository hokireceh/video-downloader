#!/bin/bash

set -e

API_PORT=8081
NGROK_LOG="./data/ngrok.log"

mkdir -p ./data

echo "🚀 Starting Telegram Local API (background)..."
./start-local-api.sh > ./data/api-output.log 2>&1 &
API_PID=$!

sleep 3

if ! kill -0 $API_PID 2>/dev/null; then
  echo "❌ Local API failed to start! Check ./data/api-output.log"
  exit 1
fi

echo "✅ Local API running (PID: $API_PID)"
echo "🌐 Starting Ngrok tunnel..."

# Kill old ngrok if exists
if pgrep -x "ngrok" >/dev/null; then
    killall ngrok 2>/dev/null || true
fi

# Ngrok auto-restart loop
while true; do
    ./ngrok http $API_PORT > "$NGROK_LOG" 2>&1
    echo "⚠️ Ngrok stopped. Restarting in 3 seconds..."
    sleep 3
done &

NGROK_PID=$!

echo "🔗 Ngrok running (PID: $NGROK_PID)"
echo "📄 Ngrok logs: $NGROK_LOG"

# Cleanup both when exiting
trap "echo '🛑 Cleanup...'; kill $API_PID $NGROK_PID 2>/dev/null" EXIT

# Keep script alive
wait
