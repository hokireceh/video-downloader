
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

## 🚀 Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/hokireceh/video-downloader.git
cd video-downloader
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Setup Environment

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

### 4. Dapatkan Bot Token

1. Buka [@BotFather](https://t.me/botfather) di Telegram
2. Kirim `/newbot` dan ikuti instruksi
3. Copy token yang diberikan ke file `.env`

### 5. Run Bot

```bash
npm start
```

Bot akan mulai berjalan dan siap menerima perintah!

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

Anda dapat menyesuaikan konstanta di `index.js`:

```javascript
const CONFIG = {
  // Rate Limiting
  RATE_LIMIT_WINDOW: 60000,           // 60 detik
  MAX_REQUESTS_PER_WINDOW: 5,         // Max 5 requests per window
  
  // File Management
  MAX_FILE_SIZE: 50000000,            // 50MB
  DOWNLOAD_FOLDER: './downloads',
  FILE_CLEANUP_AGE: 3600000,          // 1 jam
  FILE_CLEANUP_INTERVAL: 1800000,     // 30 menit
  FILE_AUTO_DELETE_DELAY: 5000,       // 5 detik
  
  // Pagination
  VIDEOS_PER_PAGE: 5,                 // 5 video per halaman
  MAX_SEARCH_RESULTS: 20,             // Max 20 video per search
  
  // Timeouts
  HTTP_REQUEST_TIMEOUT: 30000,        // 30 detik
  DOWNLOAD_TIMEOUT: 60000,            // 60 detik
  SCRAPE_TIMEOUT: 30000,              // 30 detik
  
  // Download Progress
  PROGRESS_UPDATE_INTERVAL: 3,        // Update setiap 3 video
  BATCH_DOWNLOAD_DELAY: 2000,         // 2 detik delay antar video
  
  // Memory Management
  SEARCH_RESULTS_TTL: 1800000,        // 30 menit
  MEMORY_CLEANUP_INTERVAL: 300000,    // 5 menit
  
  // Security
  MIN_FILE_SIZE: 50000,               // 50KB (validasi file)
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
- File size validation (min 50KB, max 50MB)
- Content-type validation (reject HTML pages)
- Filename sanitization (remove special characters)

## 📁 Project Structure

```
video-downloader/
├── data/
│   └── data.json           # Persistent history storage
├── downloads/              # Temporary video storage (auto-cleanup)
├── index.js               # Main bot application
├── package.json           # Dependencies & scripts
├── .env                   # Environment configuration (git-ignored)
├── .env.example          # Environment template
├── README.md             # Project documentation
└── .gitignore            # Git ignore rules
```

## 🔧 Development

### Debug Mode

Bot include comprehensive console logging:

```javascript
console.log('[INFO] ...')       // Info messages
console.log('[SUCCESS] ...')    // Success messages
console.warn('[WARN] ...')      // Warnings
console.error('[ERROR] ...')    // Errors
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
- **Purpose**: Mencegah duplikasi download dalam 24 jam
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

## 🚀 Deployment on Replit

Bot ini sudah dikonfigurasi untuk deploy di Replit:

1. Fork/Import project ini ke Replit
2. Set environment variable `BOT_TOKEN` di Secrets
3. Klik tombol Run
4. Bot akan auto-start dengan workflow "Telegram Bot"

Bot akan tetap running 24/7 di Replit dengan:
- Auto-restart on crash
- Persistent storage di `data/data.json`
- Auto-cleanup untuk manage resources

---

Made with ❤️ by hokireceh
