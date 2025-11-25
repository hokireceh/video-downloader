#!/bin/bash

set -e

# Load env
if [ -f .env ]; then
  export $(grep -v '^#' .env | grep -v '^$' | xargs)
fi

API_ID="${TELEGRAM_API_ID}"
API_HASH="${TELEGRAM_API_HASH}"
PORT=8081
DATA_DIR="./data"
TEMP_DIR="$DATA_DIR/temp"
LOG_FILE="$DATA_DIR/telegram-bot-api.log"

# Validate
if [ -z "$API_ID" ] || [ -z "$API_HASH" ]; then
  echo "❌ TELEGRAM_API_ID & TELEGRAM_API_HASH not set!"
  exit 1
fi

mkdir -p "$DATA_DIR" "$TEMP_DIR"

# Binary check
if [ ! -f "./telegram-bot-api/bin/telegram-bot-api" ]; then
  echo "⚠️ Binary missing. Running setup..."
  ./setup-local-api.sh || exit 1
fi

echo ""
echo "============================================"
echo "🔗 API Mode: Local API"
echo "🌐 Local Endpoint: http://localhost:$PORT"
echo "📝 Log File: $LOG_FILE"
echo "============================================"
echo ""

# Cleanup stale port
if lsof -nti ":$PORT" >/dev/null; then
    kill -9 $(lsof -t -i:$PORT) 2>/dev/null || true
    sleep 1
fi

echo "🚀 Starting Local Telegram Bot API (auto-restart enabled)..."

# Loop + auto-restart
while true; do
    ./telegram-bot-api/bin/telegram-bot-api \
        --api-id="$API_ID" \
        --api-hash="$API_HASH" \
        --local \
        --http-port=$PORT \
        --dir="$DATA_DIR" \
        --temp-dir="$TEMP_DIR" \
        --log="$LOG_FILE" \
        --verbosity=1

    echo "⚠️ API crashed! Restarting in 3 seconds..."
    sleep 3
done
