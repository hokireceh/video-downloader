#!/bin/bash

echo "🚀 Starting Telegram Local API..."
./start-local-api.sh > ./data/api-output.log 2>&1 &
API_PID=$!

echo "⏳ Waiting for API to start..."
sleep 5

if ! kill -0 $API_PID 2>/dev/null; then
    echo "❌ API failed to start! Check ./data/api-output.log"
    exit 1
fi

echo "✅ API running (PID: $API_PID)"
echo "🌐 Starting ngrok..."
./ngrok http 8081

# Cleanup on exit
trap "kill $API_PID 2>/dev/null" EXIT