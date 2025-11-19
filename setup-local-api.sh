
#!/bin/bash

echo "🔧 Setting up Telegram Local Bot API Server..."

# Check if already compiled
if [ -f "./telegram-bot-api/bin/telegram-bot-api" ]; then
  echo "✅ Telegram Bot API Server already compiled!"
  exit 0
fi

# Clone repository
echo "📥 Cloning Telegram Bot API repository..."
git clone --recursive https://github.com/tdlib/telegram-bot-api.git telegram-bot-api-src

cd telegram-bot-api-src

# Build
echo "🔨 Building Telegram Bot API Server (this may take a few minutes)..."
mkdir build
cd build

cmake -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX:PATH=../../telegram-bot-api ..
cmake --build . --target install -j$(nproc)

cd ../..

# Cleanup source
rm -rf telegram-bot-api-src

echo "✅ Telegram Bot API Server compiled successfully!"
echo "📁 Binary location: ./telegram-bot-api/bin/telegram-bot-api"
