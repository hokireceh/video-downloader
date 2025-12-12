# Telegram Video Downloader Bot 🤖📹

Bot Telegram canggih untuk mendownload video dari berbagai sumber dengan fitur smart scraping, interactive menu, dan persistent history management.

[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)

## ✨ Fitur Utama

### 🎯 Download Modes
- **Direct Link**: Download langsung dari URL file video (.mp4, .webm, .mkv, dll)
- **Video Page**: Auto-extract video dari halaman web menggunakan cheerio scraping
- **Search/Category**: Interactive menu untuk memilih video dari hasil pencarian dengan pagination

### 📊 Persistent History Management
- **Download History**: Track video yang sudah didownload (retention: 24 jam)
- **Search Results**: Simpan hasil pencarian user (retention: 24 jam atau saat URL baru)
- **Auto Cleanup**: Hapus history expired otomatis setiap 1 jam
- **JSON-Based Storage**: Data persisten di `data/data.json`
- **Redownload Confirmation**: Prompt konfirmasi untuk video yang sudah pernah didownload

### 🔐 Keamanan & Performa
- **SSRF Protection**: 
  - Validasi DNS untuk mencegah akses ke private/internal network
  - Block IPv4 private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8)
  - Block IPv6 private ranges (fe80::/10, fc00::/7, ::1)
  - Block localhost, link-local, dan multicast addresses
- **Rate Limiting**: 5 requests per 60 detik per user
- **Auto Cleanup**: 
  - File otomatis terhapus 5 detik setelah dikirim
  - Cleanup file lama (>1 jam) setiap 30 menit
- **Memory Management**: 
  - Automatic cleanup untuk mencegah memory leaks
  - JSON-based storage untuk efisiensi memory
  - Cleanup expired data setiap 5 menit

### 🎨 User Experience
- **Interactive Menu**: Pilih video dari list dengan inline keyboard
- **Smart Pagination**: 
  - Navigate hasil pencarian dengan tombol Previous/Next
  - 5 video per halaman
  - Support multi-page navigation
  - Auto-detect next page URL dari berbagai pattern
- **Batch Download**: Download semua video sekaligus atau satu per satu
- **Progress Tracking**: 
  - Real-time update status download
  - Progress counter untuk batch download
  - Skip/Success/Failed statistics
- **Smart Deduplication**: 
  - Otomatis skip link duplikat dalam 24 jam
  - Konfirmasi redownload untuk user control
- **Next Page Auto-Load**: Tombol otomatis muncul jika ada halaman selanjutnya

### 🔍 Smart Video Link Extraction
- **Validation Rules**:
  - Single-level path only (depth = 1)
  - Must have `_XXXXXX` pattern (ID dengan minimal 5 digit)
  - Minimal 40 karakter ATAU mengandung `-video-` atau `-porn-`
  - Filter non-video keywords (search, category, tag, login, dll)
  - Same domain validation (cegah external links)
- **Auto-detect Next Page**: 
  - Pattern `page=X` di query string
  - Pattern `/page/X` di path
  - Tombol "Next" / "›" / "»" di HTML
  - Auto-increment page number

## 📋 Requirements

- Node.js 20.x atau lebih baru
- npm atau yarn
- Telegram Bot Token (dari [@BotFather](https://t.me/botfather))

### Optional: Telegram Local Bot API
Jika ingin support file >50MB (hingga 2GB):
- Telegram API ID & Hash (dari [my.telegram.org/apps](https://my.telegram.org/apps))
- Compile dependencies (sudah include di Nix config)

## 🚀 Quick Start

### Local Development (PC Anda)

#### 1. Clone Repository

```bash
git clone https://github.com/hokireceh/video-downloader.git
cd video-downloader
```

#### 2. Install Dependencies

```bash
npm install
```

#### 3. Setup Environment

Buat file `.env` dari template:

```bash
cp .env.example .env
```

Edit `.env` dan isi dengan token bot Anda:

```env
BOT_TOKEN=your_telegram_bot_token_here
DOWNLOAD_FOLDER=./downloads
MAX_FILE_SIZE=50000000
```

#### 4. Dapatkan Bot Token

1. Buka [@BotFather](https://t.me/botfather) di Telegram
2. Kirim `/newbot` dan ikuti instruksi
3. Copy token yang diberikan ke file `.env`

#### 5. Run Bot

**Opsi A: Cloud Bot API (Default - Max 50MB)**
```bash
npm start
```
Bot akan langsung jalan dengan Telegram Cloud API.

**Opsi B: Local Bot API (Max 2GB)**

Hanya untuk Ubuntu Server dengan Local Bot API + Tunnel sudah setup:

1. Set environment variables di `.env`:
```env
USE_LOCAL_API=true
LOCAL_API_URL=https://your-tunnel-url
TELEGRAM_API_ID=your_api_id_from_my_telegram_org
TELEGRAM_API_HASH=your_api_hash_from_my_telegram_org
```

2. Run bot:
```bash
npm start
```
Bot akan connect ke Local Bot API via tunnel. Pastikan:
- Local Bot API running di port 9090
- Tunnel (ngrok/Cloudflare) aktif dan connected
- `LOCAL_API_URL` sesuai dengan tunnel URL

---

## 🚀 Deployment

### Option A: Replit (Cloud - Recommended for Beginners)

Bot ini sudah dikonfigurasi untuk deploy di Replit. Ikuti langkah berikut:

#### 1. Import Project ke Replit

- Kunjungi [Replit](https://replit.com)
- Klik "Import from GitHub"
- Paste URL repository: `https://github.com/hokireceh/video-downloader.git`
- Klik Import

#### 2. Set Bot Token

1. Buka tab **Secrets** di Replit (tombol gembok di sidebar)
2. Buat secret baru:
   - Key: `BOT_TOKEN`
   - Value: `your_telegram_bot_token_from_botfather`
3. Klik Save

#### 3. Run Bot

1. Klik tombol **Run** di Replit
2. Bot akan auto-start dan siap menerima perintah

#### 4. Bot Configuration (Optional)

Jika ingin menyesuaikan folder download atau ukuran file:

1. Buka tab **Secrets** di Replit
2. Tambah secrets tambahan:
   ```
   DOWNLOAD_FOLDER=./downloads
   MAX_FILE_SIZE=50000000
   ```

#### ✅ Bot akan tetap running 24/7 di Replit dengan:
- Auto-restart on crash
- Persistent storage di `data/data.json`
- Auto-cleanup untuk manage resources

---

### Option B: Ubuntu Server + Local Bot API (Production - 2GB File Support)

Deploy bot dengan Local Bot API untuk support file hingga 2GB. Setup melibatkan 3 komponen:
1. **Local Bot API**: Binary Telegram Bot API running di port 9090
2. **Tunnel** (ngrok atau Cloudflare): Expose local API ke internet
3. **Replit Bot**: Connect ke Local API via tunnel

#### Architecture Overview
```
Replit Bot ─(HTTPS)─> ngrok/Cloudflare Tunnel ─> Localhost:9090 (Local Bot API)
```

---

## 🔧 Setup Local Telegram Bot API (Ubuntu Server)

Jika Local Bot API belum ter-setup di Ubuntu server, ikuti langkah di bawah (hanya perlu sekali):

### Prerequisites untuk Compile
- Ubuntu 24.04+ LTS
- Build tools: `build-essential`, `cmake`
- Dependencies: `libssl-dev`, `zlib1g-dev`, `git`

### Step 1: Install Dependencies

```bash
sudo apt update
sudo apt install -y build-essential cmake git zlib1g-dev libssl-dev libreadline-dev
```

### Step 2: Download & Compile Telegram Bot API

Ada 2 opsi:

**Opsi A: Clone dari GitHub dan Compile (30-60 menit, disk space ~2GB)**
```bash
# Clone repository
git clone --recursive https://github.com/tdlib/telegram-bot-api.git
cd telegram-bot-api

# Create build directory
mkdir build
cd build

# Configure & compile (takes time)
cmake -DCMAKE_BUILD_TYPE=Release ..
cmake --build . --target install

# Binary akan tersimpan di: /usr/local/bin/telegram-bot-api
```

**Opsi B: Download Pre-compiled Binary (Lebih cepat)**

Cek di [TelegramBot/telegram-bot-api releases](https://github.com/tdlib/telegram-bot-api/releases) untuk latest binary, atau:
```bash
cd /tmp
wget https://github.com/tdlib/telegram-bot-api/releases/download/v7.x.x/telegram-bot-api-linux
chmod +x telegram-bot-api-linux
sudo mv telegram-bot-api-linux /usr/local/bin/telegram-bot-api
```

### Step 3: Verify Installation

```bash
telegram-bot-api --help
# Harus show usage information
```

### Step 4: Create Data Directory

```bash
sudo mkdir -p /var/lib/telegram-bot-api
sudo chown -R $USER:$USER /var/lib/telegram-bot-api
```

### Step 5: Create Systemd Service

```bash
sudo tee /etc/systemd/system/telegram-bot-api.service > /dev/null << 'EOF'
[Unit]
Description=Telegram Bot API Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/lib/telegram-bot-api
ExecStart=/usr/local/bin/telegram-bot-api \
  --local \
  --api-id=YOUR_API_ID \
  --api-hash=YOUR_API_HASH \
  --http-port=9090 \
  --http-ip-address=0.0.0.0 \
  --temp-dir=/tmp/telegram-bot-api \
  --verbosity=2 \
  --dir=/var/lib/telegram-bot-api
Restart=on-failure
RestartSec=10s

[Install]
WantedBy=multi-user.target
EOF
```

**Important**: Ganti `YOUR_API_ID` dan `YOUR_API_HASH` dengan nilai dari [my.telegram.org/apps](https://my.telegram.org/apps)

### Step 6: Enable & Start Service

```bash
sudo systemctl daemon-reload
sudo systemctl enable telegram-bot-api
sudo systemctl start telegram-bot-api

# Verify running
sudo systemctl status telegram-bot-api

# Check logs
sudo journalctl -u telegram-bot-api -n 20 --no-pager
```

### Step 7: Test Local Bot API

```bash
# Should return bot info
curl http://localhost:9090/getMe

# Expected response:
# {"ok":false,"error_code":404,"description":"Not Found"}
# (404 OK karena belum ada bot token, tapi service jalan)
```

**Troubleshooting:**
```bash
# Connection refused? Check if service running:
sudo systemctl status telegram-bot-api

# Port 9090 tidak listen? Check error:
sudo journalctl -u telegram-bot-api -n 50

# Kill port jika ada yang occupy:
sudo lsof -ti :9090 | xargs kill -9
```

---

### Step 8: Setup Tunnel untuk Expose ke Internet

Pilih salah satu:
- **ngrok**: See "Option 1: ngrok" section di bawah
- **Cloudflare**: See "Option 2: Cloudflare Tunnel" section di bawah

---

### Connect Replit Bot ke Local API

Setelah Local Bot API + Tunnel setup:

1. **Set Replit Secrets:**
   ```
   USE_LOCAL_API=true
   LOCAL_API_URL=https://your-tunnel-url
   TELEGRAM_API_ID=YOUR_API_ID
   TELEGRAM_API_HASH=YOUR_API_HASH
   ```

2. **Run Bot:**
   ```bash
   npm start
   ```

3. **Verify Connection:**
   - Bot logs should show: `[INFO] Using Local Bot API: https://your-tunnel-url`
   - File uploads should work hingga 2GB

---

#### Setup Steps Summary (Jika Local Bot API Sudah Ada)

1. **Verify Local Bot API running**:
   ```bash
   netstat -tlnp | grep 9090
   # Should show: telegram-bot-api listening on 0.0.0.0:9090
   ```

2. **Setup Tunnel** (pilih salah satu):
   - **ngrok** (lebih cepat untuk file besar): See "Option 1: ngrok" section di atas
   - **Cloudflare** (lebih stabil, perlu domain): See "Option 2: Cloudflare Tunnel" section di atas

3. **Create systemd service** untuk tunnel auto-start:
   ```bash
   # Untuk ngrok: See ngrok section
   # Untuk Cloudflare: Use 'cloudflared service install'
   ```

4. **Configure Replit Bot**:
   - Set environment: `USE_LOCAL_API=true`
   - Set: `LOCAL_API_URL=https://your-tunnel-url`
   - Replit akan auto-disable SSL validation untuk tunnel

#### Benefits
✅ Support file hingga 2GB (vs 50MB cloud API)  
✅ Persistent local storage  
✅ No Telegram cloud upload latency  
✅ Auto-restart capabilities  
✅ Stable tunnel connection (dengan ngrok/Cloudflare)

#### Monitoring
```bash
# Monitor Local Bot API
sudo systemctl status telegram-bot-api
sudo tail -50 /var/log/telegram-bot-api/telegram-bot-api.log

# Monitor Tunnel
# For ngrok:
sudo tail -50 /var/log/ngrok.log

# For Cloudflare:
sudo journalctl -u cloudflared -n 50
```

---

## 🔗 Tunneling Options (Expose Local Bot API to Internet)

Jika menggunakan Local Bot API di server, Anda perlu tunnel untuk expose port 9090 ke internet agar Replit dapat mengakses. Ada 2 opsi:

### Option 1: ngrok (Recommended - Faster for Large Files)

**Kelebihan:**
- ✅ Lebih stabil untuk file besar (100MB+)
- ✅ Disconnect otomatis reconnect
- ✅ Ngrok tunnel URL bersifat temporary (rotate setiap reconnect)

**Kekurangan:**
- ❌ Free tier ada rate limit
- ❌ Tunnel URL berubah setelah reconnect (perlu automate)

**Setup:**

1. **Install ngrok** (jika belum):
   ```bash
   # Download dari https://ngrok.com/download
   # Atau dengan apt:
   sudo apt install ngrok
   ```

2. **Authenticate ngrok** (diperlukan account):
   ```bash
   ngrok config add-authtoken YOUR_NGROK_AUTH_TOKEN
   ```
   (Dapatkan token gratis dari https://dashboard.ngrok.com/auth/your-authtoken)

3. **Setup systemd service** untuk auto-start:
   ```bash
   sudo tee /etc/systemd/system/ngrok.service > /dev/null << 'EOF'
   [Unit]
   Description=ngrok tunnel untuk Local Bot API
   After=network.target

   [Service]
   Type=simple
   User=root
   ExecStart=/usr/local/bin/ngrok http localhost:9090 --log=stdout
   Restart=on-failure
   RestartSec=10s
   StandardOutput=append:/var/log/ngrok.log
   StandardError=append:/var/log/ngrok.log

   [Install]
   WantedBy=multi-user.target
   EOF

   sudo systemctl daemon-reload
   sudo systemctl enable ngrok
   sudo systemctl start ngrok
   ```

4. **Get tunnel URL**:
   ```bash
   # Check URL dari logs
   sudo tail -20 /var/log/ngrok.log | grep "url="
   
   # Atau akses web interface
   curl http://127.0.0.1:4040/api/tunnels | jq '.tunnels[0].public_url'
   ```

5. **Configure Bot Environment**:
   ```bash
   # Set di Replit Secrets:
   USE_LOCAL_API=true
   LOCAL_API_URL=https://YOUR_NGROK_URL
   # Contoh: https://xyz-123-abc.ngrok-free.dev
   ```

6. **Automate URL Updates** (Optional):
   ```bash
   # Buat script untuk fetch URL setiap hari:
   # crontab -e
   0 0 * * * curl http://127.0.0.1:4040/api/tunnels | jq '.tunnels[0].public_url' > /tmp/ngrok_url.txt
   ```

---

### Option 2: Cloudflare Tunnel (Free - Better for Privacy)

**Kelebihan:**
- ✅ Gratis selamanya, tanpa rate limit
- ✅ Fixed URL (tidak berubah)
- ✅ Better privacy (no bandwidth exposure)
- ✅ DDoS protection included

**Kekurangan:**
- ❌ Lebih lambat untuk large file uploads
- ❌ Perlu Cloudflare account + domain

**Setup:**

1. **Requirements:**
   - Domain yang sudah point ke Cloudflare DNS
   - Cloudflare account (gratis)

2. **Install cloudflared**:
   ```bash
   # Debian/Ubuntu
   curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
   sudo dpkg -i cloudflared.deb
   
   # Atau dengan apt:
   sudo apt install cloudflared
   ```

3. **Authenticate dengan Cloudflare**:
   ```bash
   cloudflared tunnel login
   # Akan membuka browser untuk authorize
   ```

4. **Create named tunnel**:
   ```bash
   cloudflared tunnel create telegram-bot-api
   # Akan generate tunnel ID
   ```

5. **Create config file** (`~/.cloudflared/config.yml`):
   ```yaml
   tunnel: telegram-bot-api
   credentials-file: ~/.cloudflared/YOUR_TUNNEL_ID.json
   
   ingress:
     - hostname: bot-api.yourdomain.com
       service: http://localhost:9090
     - service: http_status:404
   ```
   Ganti `yourdomain.com` dengan domain Anda.

6. **Setup DNS di Cloudflare Dashboard**:
   - Buat CNAME record: `bot-api.yourdomain.com` → `YOUR_TUNNEL_ID.cfargotunnel.com`
   - Atau pakai Cloudflare CLI:
   ```bash
   cloudflared tunnel route dns telegram-bot-api bot-api.yourdomain.com
   ```

7. **Setup systemd service** untuk auto-start:
   ```bash
   sudo cloudflared service install
   sudo systemctl start cloudflared
   sudo systemctl enable cloudflared
   ```

8. **Configure Bot Environment**:
   ```bash
   # Set di Replit Secrets:
   USE_LOCAL_API=true
   LOCAL_API_URL=https://bot-api.yourdomain.com
   ```

9. **Monitoring**:
   ```bash
   cloudflared tunnel info telegram-bot-api
   # Atau lihat di Cloudflare Dashboard → Tunnels
   ```

---

### Comparison Table

| Feature | ngrok | Cloudflare |
|---------|-------|-----------|
| **Setup Complexity** | Easy | Medium |
| **Cost** | Gratis (limited) | Gratis (unlimited) |
| **URL Stability** | Changes (free tier) | Fixed ✅ |
| **Large Files** | Better ✅ | Slower |
| **Privacy** | Bandwidth exposed | Hidden ✅ |
| **Downtime** | ~8-9 min intervals | Rare |
| **Domain Required** | No | Yes |

---

### Troubleshooting

**ngrok tunnel offline?**
```bash
# Restart service
sudo systemctl restart ngrok

# Check status
sudo systemctl status ngrok
sudo tail -50 /var/log/ngrok.log
```

**Cloudflare tunnel not connecting?**
```bash
# Check connection
cloudflared tunnel info telegram-bot-api

# View logs
sudo journalctl -u cloudflared -n 50

# Restart service
sudo systemctl restart cloudflared
```

**Bot says "Local API offline"?**
1. Verify Local Bot API running: `netstat -tlnp | grep 9090`
2. Test tunnel: `curl https://YOUR_TUNNEL_URL/getMe` (should return bot info)
3. Check `LOCAL_API_URL` in Replit Secrets matches tunnel URL

---

## ⚙️ Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BOT_TOKEN` | ✅ | - | Telegram bot token (from @BotFather) |
| `USE_LOCAL_API` | ❌ | false | Set to `true` untuk use Local Bot API |
| `LOCAL_API_URL` | ❌ (if `USE_LOCAL_API=true`) | http://localhost:9090 | Local Bot API endpoint (dengan tunnel: https://your-tunnel-url) |
| `DOWNLOAD_FOLDER` | ❌ | ./downloads | Video storage directory |
| `MAX_FILE_SIZE` | ❌ | 50000000 | Max file size in bytes (auto 2GB jika USE_LOCAL_API=true) |
| `TELEGRAM_API_ID` | ❌ (if `USE_LOCAL_API=true`) | - | Telegram API ID (from https://my.telegram.org/apps) |
| `TELEGRAM_API_HASH` | ❌ (if `USE_LOCAL_API=true`) | - | Telegram API Hash (from https://my.telegram.org/apps) |
| `ALLOWED_GROUPS` | ❌ | - | Comma-separated group IDs (optional access control) |
| `ALLOWED_ADMINS` | ❌ | - | Comma-separated user IDs (optional access control) |

**Security Note**: Never commit credentials to git. Use Replit Secrets atau .env (git-ignored).

**LOCAL_API_URL Examples:**
- Local development: `http://localhost:9090`
- With ngrok tunnel: `https://xyz-123-abc.ngrok-free.dev`
- With Cloudflare tunnel: `https://bot-api.yourdomain.com`

---

## 📖 Cara Penggunaan

### Commands

- `/start` - Mulai bot dan lihat intro
- `/help` - Panduan lengkap penggunaan
- `/stats` - Cek quota request Anda

### Download Methods

#### 1️⃣ Direct Link
Kirim URL langsung ke file video:
```
https://example.com/video.mp4
```

#### 2️⃣ Video Page
Kirim URL halaman yang mengandung video:
```
https://example.com/watch/video-title_123456
```
Bot akan otomatis extract dan download video dari halaman tersebut.

#### 3️⃣ Search/Category Page
Kirim URL halaman search atau category:
```
https://example.com/search?q=keyword
https://example.com/search?query=keyword&q=keyword&page=2
```
Bot akan menampilkan interactive menu dengan daftar video yang dapat dipilih.

### Interactive Features

- **Navigation**: Gunakan tombol ◀️ Sebelumnya / Selanjutnya ▶️
- **Single Download**: Pilih video individual dari list
- **Batch Download**: Klik "⬇️ Download Semua" untuk download semua video
- **Next Page**: Klik "➡️ Download Halaman X" untuk load halaman selanjutnya
- **Redownload Confirmation**: Pilih "⬇️ Download Ulang" atau "❌ Skip" untuk video duplikat

## ⚙️ Konfigurasi

### Environment Variables

| Variable | Default | Deskripsi |
|----------|---------|-----------|
| `BOT_TOKEN` | - | **Required** - Token bot dari BotFather |
| `DOWNLOAD_FOLDER` | `./downloads` | Folder untuk menyimpan video sementara |
| `MAX_FILE_SIZE` | `50000000` | Maximum ukuran file (bytes) - default 50MB |

### Configuration Constants

Konfigurasi di `src/config/index.js` (auto-adjust berdasarkan environment):

```javascript
const CONFIG = {
  // Rate Limiting
  RATE_LIMIT_WINDOW: 60000,           // 60 detik
  MAX_REQUESTS_PER_WINDOW: 5,         // Max 5 requests per window

  // File Management
  MAX_FILE_SIZE:                       // Auto-adjust:
    - USE_LOCAL_API=true  → 2GB (2000000000 bytes)
    - USE_LOCAL_API=false → 50MB (50000000 bytes, default)
  DOWNLOAD_FOLDER: './downloads',
  FILE_CLEANUP_AGE: 3600000,          // 1 jam
  FILE_CLEANUP_INTERVAL: 1800000,     // 30 menit
  FILE_AUTO_DELETE_DELAY: 30000,      // 30 detik

  // Pagination
  VIDEOS_PER_PAGE: 5,                 // 5 video per halaman
  MAX_SEARCH_RESULTS: 20,             // Max 20 video per search

  // Timeouts (auto-adjust)
  HTTP_REQUEST_TIMEOUT: 30000,        // 30 detik
  DOWNLOAD_TIMEOUT:
    - USE_LOCAL_API=true  → 30 menit (1800000 ms)
    - USE_LOCAL_API=false → 60 detik (60000 ms)
  SCRAPE_TIMEOUT: 30000,              // 30 detik

  // Download Progress
  PROGRESS_UPDATE_INTERVAL: 3,        // Update setiap 3 video
  BATCH_DOWNLOAD_DELAY: 0,            // No delay (instant)

  // Memory Management
  SEARCH_RESULTS_TTL: 1800000,        // 30 menit
  MEMORY_CLEANUP_INTERVAL: 300000,    // 5 menit

  // Security
  MIN_FILE_SIZE: 10000,               // 10KB (validasi file)
};
```

### History Retention

```javascript
// Download history: dihapus setelah >24 jam
const HISTORY_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

// Search results: dihapus setelah >24 jam (atau ada URL baru)
const SEARCH_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours
```

## 🛡️ Security Features

### SSRF Protection
Bot mengvalidasi semua URL untuk mencegah akses ke:
- **IPv4 Private**:
  - Localhost (127.0.0.0/8)
  - Private networks (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
  - Link-local (169.254.0.0/16)
  - Shared Address Space (100.64.0.0/10)
  - Multicast (224.0.0.0/4)
- **IPv6 Private**:
  - Loopback (::1)
  - Link-local (fe80::/10)
  - Unique local (fc00::/7)
  - Multicast (ff00::/8)

### DNS Resolution
Semua hostname di-resolve terlebih dahulu untuk memastikan tidak mengarah ke IP private/internal.

### Rate Limiting
Setiap user dibatasi maksimal 5 request per 60 detik untuk mencegah abuse.

### Input Validation
- URL validation dengan async DNS resolution
- File size validation (min 10KB, max 50MB/2GB)
- Content-type validation (reject HTML pages)
- Filename sanitization (remove special characters)

## 📁 Project Structure

```
telegram-video-downloader-bot/
├── src/
│   ├── config/
│   │   └── index.js              # Configuration & environment validation
│   ├── services/
│   │   ├── downloader.js         # Video download & upload logic
│   │   ├── history.js            # Download history management
│   │   └── scraper.js            # HTML parsing & video extraction
│   └── utils/
│       ├── helpers.js            # Utility functions (rate limiting, cleanup)
│       └── security.js           # URL validation & SSRF protection
├── data/
│   └── data.json                 # Persistent history storage (auto-created)
├── downloads/                    # Temporary video storage (auto-cleanup)
├── index.js                      # Main bot application
├── package.json                  # Dependencies & scripts
├── .env                          # Environment configuration (git-ignored)
├── .env.example                  # Environment template
├── README.md                     # Project documentation
└── .gitignore                    # Git ignore rules
```

## 🔧 Development

### Debug Mode

Bot include comprehensive console logging:

```javascript
console.log('[INFO] ...')       // Info messages
console.log('[SUCCESS] ...')    // Success messages
console.log('[WARN] ...')      // Warnings
console.log('[ERROR] ...')    // Errors
console.log('[CLEANUP] ...')    // Cleanup operations
console.log('[HISTORY] ...')    // History operations
console.log('[SEARCH] ...')     // Search operations
console.log('[SECURITY] ...')   // Security blocks
```

### Error Handling

Bot memiliki comprehensive error handling:
- Graceful shutdown (SIGINT/SIGTERM)
- Unhandled rejection catching
- Polling error recovery
- User-friendly error messages
- Auto-cleanup pada error

### State Management

- **userRequests**: Rate limiting tracker (Map)
- **userPagination**: Pagination state (Map)
- **userRedownloadData**: Temporary redownload data (Map)
- **History JSON**: Download & search history (File-based)

## 📊 Limitations

- **File Size**: Maximum 50MB (default, dapat diubah)
- **Rate Limit**: 5 video per 60 detik per user
- **Search Results**: Maximum 20 video per search
- **Supported Formats**: MP4, WebM, MKV, AVI, MOV, FLV, WMV, M4V, 3GP
- **History Retention**: 24 jam untuk download & search results
- **Pagination**: 5 video per halaman

## 🗂️ Data Retention Policy

### Download History
- **Purpose**: Mencegah dupliasi download dalam 24 jam
- **Retention**: 24 jam
- **Auto Cleanup**: Setiap 1 jam + setiap kali add new entry
- **Data Stored**: URL, user ID, filename, timestamp

### Search Results
- **Purpose**: Pagination dan navigation
- **Retention**: 24 jam ATAU sampai user kirim URL baru
- **Auto Cleanup**: Setiap kali read + setiap 1 jam
- **Data Stored**: Links, nextPageUrl, originalUrl, currentPage, timestamp

## 🤝 Contributing

Contributions are welcome! Silakan buat issue atau pull request.

## 📝 License

ISC License - lihat file LICENSE untuk detail.

## 🙏 Acknowledgments

- [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api) - Telegram Bot API wrapper
- [axios](https://github.com/axios/axios) - HTTP client
- [cheerio](https://github.com/cheeriojs/cheerio) - HTML parsing
- [dotenv](https://github.com/motdotla/dotenv) - Environment configuration

## 📞 Support

Jika ada pertanyaan atau masalah, buat issue di [GitHub Issues](https://github.com/hokireceh/video-downloader/issues).

---

## 💰 Donasi

Jika bot ini bermanfaat, dukung development dengan donasi:

### ⚡ IDR (Rupiah)
- **[Trakteer](https://trakteer.id/garapanairdrop/tip)**

---

### ⚡ USD BNB ETH HYPE XPL (EVM Networks)
```
0xbE0bff0121f17EE0EC1F08976f936d714202face
```

---

Made with ❤️ by hokireceh
