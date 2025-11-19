
# Telegram Video Downloader Bot 🤖📹

Advanced Telegram bot untuk mendownload video dari berbagai sumber dengan fitur smart scraping dan interactive menu.

[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)

## ✨ Fitur Utama

### 🎯 Download Modes
- **Direct Link**: Download langsung dari URL file video (.mp4, .webm, .mkv, dll)
- **Video Page**: Auto-extract video dari halaman web
- **Search/Category**: Interactive menu untuk memilih video dari hasil pencarian

### 🔐 Keamanan & Performa
- **SSRF Protection**: Validasi DNS untuk mencegah akses ke private/internal network
- **Rate Limiting**: 5 requests per 60 detik per user
- **Auto Cleanup**: File otomatis terhapus setelah dikirim
- **Memory Management**: Automatic cleanup untuk mencegah memory leaks

### 🎨 User Experience
- **Interactive Menu**: Pilih video dari list dengan inline keyboard
- **Pagination**: Navigate hasil pencarian dengan tombol Previous/Next
- **Batch Download**: Download semua video sekaligus atau satu per satu
- **Progress Tracking**: Real-time update status download
- **Smart Deduplication**: Otomatis menghapus link duplikat

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
```
Bot akan menampilkan interactive menu dengan daftar video yang dapat dipilih.

### Interactive Features

- **Navigation**: Gunakan tombol ◀️ Sebelumnya / Selanjutnya ▶️
- **Single Download**: Pilih video individual dari list
- **Batch Download**: Klik "⬇️ Download Semua" untuk download semua video
- **Next Page**: Load halaman selanjutnya jika tersedia

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
  RATE_LIMIT_WINDOW: 60000,           // Rate limit window (ms)
  MAX_REQUESTS_PER_WINDOW: 5,         // Max requests per window
  MAX_FILE_SIZE: 50000000,            // Max file size (50MB)
  VIDEOS_PER_PAGE: 5,                 // Videos per pagination page
  MAX_SEARCH_RESULTS: 20,             // Max search results
  HTTP_REQUEST_TIMEOUT: 30000,        // HTTP timeout (30s)
  DOWNLOAD_TIMEOUT: 60000,            // Download timeout (60s)
  // ... dan lainnya
};
```

## 🛡️ Security Features

### SSRF Protection
Bot mengvalidasi semua URL untuk mencegah akses ke:
- Localhost (127.0.0.0/8)
- Private networks (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
- Link-local addresses (169.254.0.0/16)
- IPv6 private ranges

### DNS Resolution
Semua hostname di-resolve terlebih dahulu untuk memastikan tidak mengarah ke IP private/internal.

### Rate Limiting
Setiap user dibatasi maksimal 5 request per 60 detik untuk mencegah abuse.

## 📁 Project Structure

```
video-downloader/
├── index.js              # Main bot application
├── package.json          # Dependencies & scripts
├── .env                  # Environment configuration (git-ignored)
├── .env.example          # Environment template
├── downloads/            # Temporary video storage (auto-cleanup)
├── README.md             # Project documentation
└── .gitignore           # Git ignore rules
```

## 🔧 Development

### Debug Mode

Untuk melihat log detail, bot sudah include console logging:

```javascript
console.log('[INFO] ...')    // Info messages
console.warn('[WARN] ...')   // Warnings
console.error('[ERROR] ...')  // Errors
```

### Error Handling

Bot memiliki comprehensive error handling:
- Graceful shutdown (SIGINT/SIGTERM)
- Unhandled rejection catching
- Polling error recovery
- User-friendly error messages

## 📊 Limitations

- **File Size**: Maximum 50MB (default, dapat diubah)
- **Rate Limit**: 5 video per 60 detik per user
- **Search Results**: Maximum 20 video per search
- **Supported Formats**: MP4, WebM, MKV, AVI, MOV, FLV, WMV, M4V, 3GP

## 🤝 Contributing

Contributions are welcome! Silakan buat issue atau pull request.

## 📝 License

ISC License - lihat file LICENSE untuk detail.

## 🙏 Acknowledgments

- [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api) - Telegram Bot API wrapper
- [axios](https://github.com/axios/axios) - HTTP client
- [cheerio](https://github.com/cheeriojs/cheerio) - HTML parsing

## 📞 Support

Jika ada pertanyaan atau masalah, buat issue di [GitHub Issues](https://github.com/hokireceh/video-downloader/issues).

---

Made with ❤️ by hokireceh
