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
echo "🔗 Local API Endpoint: http://localhost:8081"
echo "🌐 Public API Endpoint: https://api.bukitcuan.fun:8081"
echo ""
echo "⏳ Waiting 2 seconds before starting bot..."
sleep 2

echo "🤖 Starting Telegram Bot..."
node index.js

# Cleanup on exit
trap "kill $API_PID 2>/dev/null" EXIT
