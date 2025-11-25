# 🖥️ PC Local API Setup Guide (Option B)

## Quick Start (3 Steps)

### Step 1: Setup (First Time Only)
```bash
chmod +x setup-local-api.sh
./setup-local-api.sh
```
⏱️ Takes ~5-10 minutes, compiles Telegram Bot API

### Step 2: Start Local API (Terminal 1)
```bash
chmod +x start-local-api.sh
./start-local-api.sh
```
✅ Should see: "🚀 Starting Local Telegram Bot API"

### Step 3: Setup ngrok Tunnel (Terminal 2)
```bash
ngrok http 8081
```
📋 Copy the URL (looks like: https://xxxx-yyyy.ngrok-free.dev)

## Update Replit

### Step 4: Set Environment Variable in Replit
In Replit Secrets tab:
```
LOCAL_API_URL=https://xxxx-yyyy.ngrok-free.dev
```

### Step 5: Restart Bot in Replit
Bot will auto-connect to your PC Local API via ngrok

## ✅ Verification

- [ ] Local API running (Step 2)
- [ ] ngrok tunnel active (Step 3)  
- [ ] LOCAL_API_URL set in Replit
- [ ] Bot restarted
- [ ] Test: Send `/cek` to bot
- [ ] Check logs for connection status

## 🔧 Troubleshooting

**Local API won't start?**
- Check .env has TELEGRAM_API_ID and TELEGRAM_API_HASH
- Check port 8081 not used: `lsof -i :8081`

**ngrok shows "offline"?**
- Verify Local API running (Step 2)
- Check firewall allows localhost:8081

**Bot still showing errors?**
- Restart bot in Replit
- Check LOCAL_API_URL copied correctly (no extra spaces)
- View logs: `tail -f data/telegram-bot-api.log`

## 📊 Architecture

```
Bot (Replit)
    ↓
ngrok tunnel
    ↓
Local API (PC:8081)
    ↓
TDLib + Download
```

## 🚀 Status

After setup, you should have:
- ✅ Bot running 24/7 on Replit
- ✅ Download handling on your PC (unlimited 2GB files)
- ✅ ngrok bridge between them

---

Ready? Start with Step 1! 👍
