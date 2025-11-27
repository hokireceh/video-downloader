#!/bin/bash

echo "🔧 Setting up Telegram Local Bot API Server..."

# Check if already compiled
if [ -f "./telegram-bot-api/bin/telegram-bot-api" ]; then
  echo "✅ Telegram Bot API Server already compiled!"
  exit 0
fi

# Check dependencies
echo "🔍 Checking dependencies..."
MISSING_DEPS=()

command -v git >/dev/null 2>&1 || MISSING_DEPS+=("git")
command -v cmake >/dev/null 2>&1 || MISSING_DEPS+=("cmake")
command -v g++ >/dev/null 2>&1 || MISSING_DEPS+=("g++")
command -v make >/dev/null 2>&1 || MISSING_DEPS+=("make")
command -v gperf >/dev/null 2>&1 || MISSING_DEPS+=("gperf")

if [ ${#MISSING_DEPS[@]} -ne 0 ]; then
    echo "❌ Missing dependencies: ${MISSING_DEPS[*]}"
    echo "📦 Installing required packages..."
    sudo apt-get update
    sudo apt-get install -y git cmake g++ make gperf libssl-dev zlib1g-dev
    echo "✅ Dependencies installed!"
fi

# Clone repository
echo "📥 Cloning Telegram Bot API repository..."
git clone --recursive https://github.com/tdlib/telegram-bot-api.git telegram-bot-api-src

cd telegram-bot-api-src

# Build
echo "🔨 Building Telegram Bot API Server (this may take a few minutes)..."
mkdir -p build
cd build

cmake -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX:PATH=../../telegram-bot-api ..

if [ $? -ne 0 ]; then
    echo "❌ CMake configuration failed!"
    cd ../..
    rm -rf telegram-bot-api-src
    exit 1
fi

cmake --build . --target install -j$(nproc)

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    cd ../..
    rm -rf telegram-bot-api-src
    exit 1
fi

cd ../..

# Cleanup source
rm -rf telegram-bot-api-src

echo "✅ Telegram Bot API Server compiled successfully!"
echo "📁 Binary location: ./telegram-bot-api/bin/telegram-bot-api"
