#!/bin/bash

# Load .env file if it exists
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | grep -v '^$' | xargs)
fi

# Configuration
API_ID="${TELEGRAM_API_ID}"
API_HASH="${TELEGRAM_API_HASH}"
LOCAL_API_PORT=8081
LOG_FILE="./data/telegram-bot-api.log"

# Validate env vars
if [ -z "$API_ID" ] || [ -z "$API_HASH" ]; then
  echo "❌ Error: TELEGRAM_API_ID and TELEGRAM_API_HASH must be set in .env"
  echo "💡 Get them from: https://my.telegram.org/apps"
  exit 1
fi

# Create data directory if not exists
mkdir -p ./data

# Check if binary exists
if [ ! -f "./telegram-bot-api/bin/telegram-bot-api" ]; then
  echo "⚠️ Telegram Bot API Server not found. Running setup..."
  ./setup-local-api.sh
  
  if [ $? -ne 0 ]; then
    echo "❌ Setup failed!"
    exit 1
  fi
fi

# Check if port is already in use
if lsof -Pi :$LOCAL_API_PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
  echo "⚠️ Port $LOCAL_API_PORT is already in use!"
  echo "💡 Kill existing process or change LOCAL_API_PORT"
  exit 1
fi

# Start Local API Server
echo "🚀 Starting Telegram Local Bot API Server on port $LOCAL_API_PORT..."
echo "📝 Logs: $LOG_FILE"
echo "🔗 API Endpoint: http://localhost:$LOCAL_API_PORT"
echo ""

./telegram-bot-api/bin/telegram-bot-api \
  --api-id="$API_ID" \
  --api-hash="$API_HASH" \
  --local \
  --http-port=$LOCAL_API_PORT \
  --dir=./data \
  --temp-dir=./data/temp \
  --log="$LOG_FILE" \
  --verbosity=1
