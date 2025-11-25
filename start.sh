
#!/bin/bash

echo "🚀 Starting Telegram Local API..."

# Check if USE_LOCAL_API is enabled
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | grep -v '^$' | xargs)
fi

if [ "$USE_LOCAL_API" != "true" ]; then
  echo "⚠️ Local API is disabled, starting bot directly..."
  node index.js
  exit 0
fi

# Start Local API in background
./start-local-api.sh > ./data/api-output.log 2>&1 &
API_PID=$!

echo "⏳ Waiting for API to start (checking health)..."

# Wait and check if API is actually running
MAX_RETRIES=15
RETRY_COUNT=0
API_READY=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  sleep 2
  
  # Check if process is still alive
  if ! kill -0 $API_PID 2>/dev/null; then
    echo "❌ API process died! Check ./data/api-output.log for errors:"
    tail -n 20 ./data/api-output.log
    exit 1
  fi
  
  # Check if port is listening
  if lsof -Pi :8081 -sTCP:LISTEN -t >/dev/null 2>&1; then
    # Try to hit health endpoint
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/health 2>/dev/null || echo "000")
    
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "404" ]; then
      # 404 is also OK (endpoint might not exist but server is up)
      API_READY=true
      echo "✅ API is ready and responding!"
      break
    fi
  fi
  
  RETRY_COUNT=$((RETRY_COUNT + 1))
  echo "⏳ Retry $RETRY_COUNT/$MAX_RETRIES - API not ready yet..."
done

if [ "$API_READY" = false ]; then
  echo "❌ API failed to start after $MAX_RETRIES attempts!"
  echo "📋 Last 30 lines of API log:"
  tail -n 30 ./data/api-output.log
  kill $API_PID 2>/dev/null
  exit 1
fi

echo "✅ API running (PID: $API_PID)"
echo "🔗 Local API Endpoint: http://localhost:8081"
echo ""
echo "⏳ Waiting 2 seconds before starting bot..."
sleep 2

echo "🤖 Starting Telegram Bot..."
node index.js

# Cleanup on exit
EXIT_CODE=$?
echo "🛑 Bot stopped with exit code $EXIT_CODE"
kill $API_PID 2>/dev/null
exit $EXIT_CODE
