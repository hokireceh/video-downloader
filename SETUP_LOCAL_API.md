# Option B - Setup: Local API di PC + Bot di Replit

## ✅ Replit Side (SUDAH DONE)
- Bot di Replit ✓
- USE_LOCAL_API=true ✓
- LOCAL_API_URL already set ✓
- Max file size: 2GB ✓

## 🖥️ PC Side (YANG PERLU KAMU LAKUKAN)

### Step 1: Setup Local Bot API di PC
```bash
# Download TDLib + Telegram Bot API
git clone https://github.com/tdlib/telegram-bot-api.git
cd telegram-bot-api
mkdir build && cd build
cmake ..
make
cd ..
```

### Step 2: Jalankan Local Bot API
```bash
./telegram-bot-api \
  --api-id=29835169 \
  --api-hash=9c54eb9786637df88e412fcbfa9b32ac \
  --local \
  --http-port=8081
```
⚠️ Ganti API_ID dan API_HASH dengan milik kamu!

### Step 3: Setup ngrok Tunnel (di terminal baru)
```bash
ngrok http 8081
```
Lihat URL yang di-generate (contoh: https://xxxx-yyyy.ngrok-free.dev)

### Step 4: Update .env di Replit
Copy URL dari ngrok:
```
USE_LOCAL_API=true
LOCAL_API_URL=https://xxxx-yyyy.ngrok-free.dev
```

### Step 5: Restart Bot di Replit
Bot akan reconnect ke Local API PC kamu via ngrok

## 🔍 Verification Checklist
- [ ] Local Bot API running di PC (port 8081)
- [ ] ngrok tunnel aktif
- [ ] ngrok URL udah update di .env
- [ ] Bot restart di Replit
- [ ] Test: kirim `/cek` ke bot
- [ ] Jika ada error, check logs di Replit

## ⚡ Benefits
✅ File size up to 2GB (unlimited praktisnya)
✅ Replit bot always running
✅ PC handle download (powerful i7 kamu)
✅ ngrok bridge otomatis

---
Questions? Check bot logs di Replit for details.
