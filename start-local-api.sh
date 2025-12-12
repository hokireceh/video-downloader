#!/bin/bash

set -e

# Load env safely (handle special chars)
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# Configuration
API_ID="${TELEGRAM_API_ID}"
API_HASH="${TELEGRAM_API_HASH}"
PORT="${LOCAL_API_PORT:-8081}"
DATA_DIR="./data"
TEMP_DIR="$DATA_DIR/temp"
LOG_FILE="$DATA_DIR/telegram-bot-api.log"

# Validate credentials
if [ -z "$API_ID" ] || [ -z "$API_HASH" ]; then
  echo "❌ Error: TELEGRAM_API_ID & TELEGRAM_API_HASH not set in .env!"
  echo "📝 Please set these variables before running this script."
  exit 1
fi

# Create directories
mkdir -p "$DATA_DIR" "$TEMP_DIR"

# Check if binary exists, compile if needed
if [ ! -f "./telegram-bot-api/bin/telegram-bot-api" ]; then
  echo "⚠️ Binary not found. Running setup script..."
  if ! ./setup-local-api.sh; then
    echo "❌ Setup failed!"
    exit 1
  fi
fi

echo ""
echo "============================================"
echo "🔗 API Mode: Local API (Replit)"
echo "🌐 Local Endpoint: http://localhost:$PORT"
echo "📝 Log File: $LOG_FILE"
echo "============================================"
echo ""
echo "📌 To expose to internet (new terminal):"
echo "   ngrok http $PORT"
echo ""
echo "   Then set Replit .env:"
echo "   LOCAL_API_URL=https://xxxx-xxxx.ngrok-free.dev"
echo "============================================"
echo ""

# Cleanup stale port (if netstat available, fallback gracefully)
if command -v netstat &> /dev/null; then
  if netstat -tlnp 2>/dev/null | grep -q ":$PORT"; then
    echo "⚠️ Port $PORT already in use. Attempting to kill existing process..."
    lsof -ti ":$PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
elif command -v lsof &> /dev/null; then
  if lsof -nti ":$PORT" >/dev/null 2>&1; then
    echo "⚠️ Port $PORT already in use. Attempting to kill existing process..."
    lsof -t -i:$PORT | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
fi

echo "🚀 Starting Local Telegram Bot API (port: $PORT, auto-restart enabled)..."
echo ""

# Auto-restart loop
RESTART_COUNT=0
while true; do
    RESTART_COUNT=$((RESTART_COUNT + 1))
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting API (attempt $RESTART_COUNT)..."
    
    ./telegram-bot-api/bin/telegram-bot-api \
        --api-id="$API_ID" \
        --api-hash="$API_HASH" \
        --local \
        --http-port=$PORT \
        --dir="$DATA_DIR" \
        --temp-dir="$TEMP_DIR" \
        --log="$LOG_FILE" \
        --verbosity=1

    echo "⚠️ API exited. Restarting in 3 seconds..."
    sleep 3
done
