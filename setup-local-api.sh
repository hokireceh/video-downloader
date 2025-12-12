#!/bin/bash

set -e

echo "🔧 Setting up Telegram Local Bot API Server..."

# Check if already compiled
if [ -f "./telegram-bot-api/bin/telegram-bot-api" ]; then
  echo "✅ Telegram Bot API Server already compiled!"
  echo "📁 Binary location: ./telegram-bot-api/bin/telegram-bot-api"
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
    sudo apt-get install -y git cmake g++ make gperf libssl-dev zlib1g-dev libreadline-dev
    echo "✅ Dependencies installed!"
fi

# Cleanup old source if exists (prevent conflicts)
if [ -d "telegram-bot-api-src" ]; then
  echo "🧹 Removing old source directory..."
  rm -rf telegram-bot-api-src
fi

# Clone repository
echo "📥 Cloning Telegram Bot API repository..."
git clone --recursive https://github.com/tdlib/telegram-bot-api.git telegram-bot-api-src

if [ ! -d "telegram-bot-api-src" ]; then
  echo "❌ Clone failed!"
  exit 1
fi

cd telegram-bot-api-src

# Build
echo "🔨 Building Telegram Bot API Server..."
echo "⏳ This may take 30-60 minutes depending on your system..."
echo ""

mkdir -p build
cd build

echo "📝 Running CMake configuration..."
cmake -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX:PATH=../../telegram-bot-api ..

echo "🔨 Compiling source code (using $(nproc) cores)..."
cmake --build . --target install -j$(nproc)

cd ../..

# Verify binary was created
if [ ! -f "./telegram-bot-api/bin/telegram-bot-api" ]; then
    echo "❌ Build completed but binary not found!"
    rm -rf telegram-bot-api-src
    exit 1
fi

# Cleanup source
echo "🧹 Cleaning up source files..."
rm -rf telegram-bot-api-src

echo ""
echo "✅ Telegram Bot API Server compiled successfully!"
echo "📁 Binary location: ./telegram-bot-api/bin/telegram-bot-api"
echo "📊 Ready to run with: ./start-local-api.sh"
