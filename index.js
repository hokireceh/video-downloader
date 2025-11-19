require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;

// ==================== PERSISTENT HISTORY MANAGEMENT ====================
const HISTORY_FILE = path.join(__dirname, 'data', 'data.json');
// Download history: dihapus setelah >24 jam
const HISTORY_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours
// Search results: dihapus setelah >24 jam (atau ada URL baru)
const SEARCH_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

// Pastikan folder data ada
const dataFolder = path.join(__dirname, 'data');
if (!fs.existsSync(dataFolder)) {
  fs.mkdirSync(dataFolder, { recursive: true });
  console.log(`[INFO] Created data folder: ${dataFolder}`);
}

// Load history dari file
function loadHistory() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) {
      // Initialize with both downloads and searches
      return { downloads: [], searches: [] };
    }
    const data = fs.readFileSync(HISTORY_FILE, 'utf8');
    // Ensure both arrays exist even if file is malformed
    const history = JSON.parse(data);
    return {
      downloads: history.downloads || [],
      searches: history.searches || []
    };
  } catch (error) {
    console.error(`[ERROR] Failed to load history: ${error.message}`);
    return { downloads: [], searches: [] };
  }
}

// Save history ke file
function saveHistory(history) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
  } catch (error) {
    console.error(`[ERROR] Failed to save history: ${error.message}`);
  }
}

// Cleanup history yang lebih dari retention period
function cleanupOldHistory() {
  try {
    const history = loadHistory();
    const now = Date.now();
    const downloadsBefore = history.downloads.length;
    const searchesBefore = history.searches.length;

    // Cleanup downloads
    history.downloads = history.downloads.filter(entry => {
      return (now - entry.timestamp) < HISTORY_RETENTION_MS;
    });

    // Cleanup searches
    history.searches = history.searches.filter(entry => {
      return (now - entry.timestamp) < SEARCH_RETENTION_MS;
    });

    const removedDownloads = downloadsBefore - history.downloads.length;
    const removedSearches = searchesBefore - history.searches.length;

    if (removedDownloads > 0) {
      console.log(`[CLEANUP] Removed ${removedDownloads} old download history entries (>24 hours)`);
    }
    if (removedSearches > 0) {
      console.log(`[CLEANUP] Removed ${removedSearches} old search result entries (>24 hours)`);
    }

    if (removedDownloads > 0 || removedSearches > 0) {
      saveHistory(history);
    }
  } catch (error) {
    console.error(`[ERROR] History cleanup failed: ${error.message}`);
  }
}

// Cek apakah URL sudah pernah didownload oleh user ini dalam retention period
function isAlreadyDownloaded(url, userId) {
  const history = loadHistory();
  const now = Date.now();

  return history.downloads.some(entry => {
    const isMatch = entry.url === url && entry.userId === userId;
    const isRecent = (now - entry.timestamp) < HISTORY_RETENTION_MS;
    return isMatch && isRecent;
  });
}

// Tambah record download ke history
function addToHistory(url, userId, filename) {
  try {
    const history = loadHistory();

    history.downloads.push({
      url: url,
      userId: userId,
      filename: filename,
      timestamp: Date.now()
    });

    // Auto-cleanup downloads immediately after adding
    cleanupOldHistory();
    console.log(`[HISTORY] Added download: ${filename} for user ${userId}`);
  } catch (error) {
    console.error(`[ERROR] Failed to add to download history: ${error.message}`);
  }
}

// Tambah record search result ke history
// Note: Function ini sekarang wrapper untuk setUserSearchEntry (backwards compatibility)
function addToSearchHistory(userId, searchData) {
  // Delegate ke setUserSearchEntry (JSON-based helper)
  setUserSearchEntry(userId, searchData);
}

// ==================== JSON-BASED SEARCH HELPERS ====================
// Helper function: Get search entry untuk user tertentu dari JSON
// Auto-cleanup expired entries setiap kali read
function getUserSearchEntry(userId) {
  try {
    const history = loadHistory();
    const now = Date.now();

    // Cleanup expired entries before reading
    history.searches = history.searches.filter(entry => {
      return (now - entry.timestamp) < SEARCH_RETENTION_MS;
    });

    // Save if cleanup happened
    const originalLength = loadHistory().searches.length;
    if (history.searches.length < originalLength) {
      saveHistory(history);
    }

    // Find user's search entry
    const userEntry = history.searches.find(s => s.userId === userId);

    // Return null jika tidak ada
    // ATAU jika links kosong DAN tidak ada nextPageUrl (benar-benar empty)
    if (!userEntry) {
      return null;
    }

    if ((!userEntry.links || userEntry.links.length === 0) && !userEntry.nextPageUrl) {
      return null;
    }

    return userEntry;
  } catch (error) {
    console.error(`[ERROR] Failed to get search entry for user ${userId}: ${error.message}`);
    return null;
  }
}

// Helper function: Set/replace search entry untuk user
function setUserSearchEntry(userId, searchData) {
  try {
    // Skip hanya jika links kosong DAN tidak ada nextPageUrl
    // (Jika ada nextPageUrl, tetap simpan untuk keperluan navigation)
    if ((!searchData.links || searchData.links.length === 0) && !searchData.nextPageUrl) {
      console.log(`[SEARCH] Skipped saving empty search results for user ${userId}`);
      return;
    }

    const history = loadHistory();

    // Replace existing entry atau tambah baru
    const existingIndex = history.searches.findIndex(s => s.userId === userId);
    const newEntry = {
      userId: userId,
      links: searchData.links || [],
      nextPageUrl: searchData.nextPageUrl,
      originalUrl: searchData.originalUrl,
      currentPage: searchData.currentPage,
      timestamp: Date.now()
    };

    if (existingIndex > -1) {
      history.searches[existingIndex] = newEntry;
      const linkCount = searchData.links ? searchData.links.length : 0;
      console.log(`[SEARCH] Replaced search results for user ${userId} (${linkCount} links${searchData.nextPageUrl ? ', has next page' : ''})`);
    } else {
      history.searches.push(newEntry);
      const linkCount = searchData.links ? searchData.links.length : 0;
      console.log(`[SEARCH] Added search results for user ${userId} (${linkCount} links${searchData.nextPageUrl ? ', has next page' : ''})`);
    }

    // Cleanup expired entries before saving
    cleanupOldHistory();
    saveHistory(history);
  } catch (error) {
    console.error(`[ERROR] Failed to set search entry for user ${userId}: ${error.message}`);
  }
}

// Helper function: Delete search entry untuk user
function deleteUserSearchEntry(userId) {
  try {
    const history = loadHistory();
    const initialLength = history.searches.length;

    history.searches = history.searches.filter(s => s.userId !== userId);

    if (history.searches.length < initialLength) {
      saveHistory(history);
      console.log(`[SEARCH] Deleted search results for user ${userId}`);
      return true;
    }

    return false;
  } catch (error) {
    console.error(`[ERROR] Failed to delete search entry for user ${userId}: ${error.message}`);
    return false;
  }
}

// Jalankan cleanup history setiap 1 jam
setInterval(cleanupOldHistory, 60 * 60 * 1000);

// Cleanup saat startup - hapus data yang sudah expired
console.log('[STARTUP] Running initial history cleanup...');
cleanupOldHistory();

// ==================== CONFIGURATION CONSTANTS ====================
const CONFIG = {
  // Rate Limiting
  RATE_LIMIT_WINDOW: 60000,
  MAX_REQUESTS_PER_WINDOW: 5,

  // File Management
  // Local API supports up to 2GB, Cloud API supports up to 50MB
  MAX_FILE_SIZE: process.env.USE_LOCAL_API === 'true' 
    ? 2000000000  // 2GB for Local API
    : (parseInt(process.env.MAX_FILE_SIZE) || 50000000), // 50MB for Cloud API
  DOWNLOAD_FOLDER: process.env.DOWNLOAD_FOLDER || './downloads',
  FILE_CLEANUP_AGE: 3600000,
  FILE_CLEANUP_INTERVAL: 1800000,
  FILE_AUTO_DELETE_DELAY: 5000,

  // Pagination
  VIDEOS_PER_PAGE: 5,
  MAX_SEARCH_RESULTS: 20,

  // Timeouts
  HTTP_REQUEST_TIMEOUT: 30000,
  // Download timeout: Local API needs longer timeout for large files (up to 2GB)
  // Cloud API: 60s is enough for max 50MB files
  // Increased to 30 minutes for files up to 2GB
  DOWNLOAD_TIMEOUT: process.env.USE_LOCAL_API === 'true' 
    ? 1800000  // 30 minutes for Local API (large files up to 2GB)
    : 60000,  // 1 minute for Cloud API (small files)
  SCRAPE_TIMEOUT: 30000,

  // Download Progress
  PROGRESS_UPDATE_INTERVAL: 3,
  BATCH_DOWNLOAD_DELAY: 2000,

  // Memory Management
  SEARCH_RESULTS_TTL: 1800000, // Keep search results in memory for 30 minutes
  MEMORY_CLEANUP_INTERVAL: 300000, // Clean memory every 5 minutes

  // Security
  MIN_FILE_SIZE: 50000,
};

// Environment Validation
function validateEnvironment() {
  const errors = [];

  if (!process.env.BOT_TOKEN) {
    errors.push('BOT_TOKEN is required. Please set it in .env file');
  } else if (process.env.BOT_TOKEN.length < 40) {
    errors.push('BOT_TOKEN appears to be invalid (too short)');
  }

  // Validate Local API credentials if enabled
  if (process.env.USE_LOCAL_API === 'true') {
    if (!process.env.TELEGRAM_API_ID) {
      errors.push('TELEGRAM_API_ID is required for Local API');
    }
    if (!process.env.TELEGRAM_API_HASH) {
      errors.push('TELEGRAM_API_HASH is required for Local API');
    }
  }

  if (errors.length > 0) {
    console.error('[FATAL] Environment validation failed:');
    errors.forEach(err => console.error(`  - ${err}`));
    console.error('\nPlease check your .env file and try again.');
    process.exit(1);
  }

  console.log('[INFO] Environment validation passed ✓');
}

validateEnvironment();

// Inisialisasi bot dengan support Local API (optional)
const botOptions = { 
  polling: {
    interval: 300,
    autoStart: true,
    params: {
      timeout: 10
    }
  },
  filepath: false // Disable file download via bot API (we handle it manually)
};

// Check if Local API is enabled
const useLocalAPI = process.env.USE_LOCAL_API === 'true';
const localAPIUrl = process.env.LOCAL_API_URL || 'http://localhost:8081';

if (useLocalAPI) {
  botOptions.baseApiUrl = localAPIUrl;
  console.log(`[INFO] Using Local Bot API: ${localAPIUrl}`);
  console.log('[INFO] File size limit: Up to 2GB (Local API)');
} else {
  console.log('[INFO] Using Telegram Cloud Bot API');
  console.log('[INFO] File size limit: Up to 50MB (Cloud API)');
}

const bot = new TelegramBot(process.env.BOT_TOKEN, botOptions);

// Pastikan folder download ada
if (!fs.existsSync(CONFIG.DOWNLOAD_FOLDER)) {
  fs.mkdirSync(CONFIG.DOWNLOAD_FOLDER, { recursive: true });
  console.log(`[INFO] Created download folder: ${CONFIG.DOWNLOAD_FOLDER}`);
}

// ==================== STATE MANAGEMENT ====================
// Rate limiting: track user requests
const userRequests = new Map();

// Pagination (simpan halaman aktif dan message ID)
const userPagination = new Map();

// Redownload confirmation data (temporary, in-memory only)
const userRedownloadData = new Map();

// Note: Search results sekarang langsung read/write dari JSON, tidak pakai memory
console.log('[STARTUP] Initialized - Search results will be read from JSON on-demand');

// ==================== UTILITY FUNCTIONS ====================
// Fungsi untuk cek rate limit
function checkRateLimit(userId) {
  const now = Date.now();
  const userHistory = userRequests.get(userId) || [];

  // Hapus request yang sudah lebih dari RATE_LIMIT_WINDOW
  const recentRequests = userHistory.filter(time => now - time < CONFIG.RATE_LIMIT_WINDOW);

  if (recentRequests.length >= CONFIG.MAX_REQUESTS_PER_WINDOW) {
    return false;
  }

  recentRequests.push(now);
  userRequests.set(userId, recentRequests);
  return true;
}

// Fungsi untuk cleanup file lama
function cleanupOldFiles() {
  try {
    const files = fs.readdirSync(CONFIG.DOWNLOAD_FOLDER);
    const now = Date.now();

    files.forEach(file => {
      const filePath = path.join(CONFIG.DOWNLOAD_FOLDER, file);
      const stats = fs.statSync(filePath);

      if (now - stats.mtimeMs > CONFIG.FILE_CLEANUP_AGE) {
        fs.unlinkSync(filePath);
        console.log(`[CLEANUP] Deleted old file: ${file}`);
      }
    });
  } catch (error) {
    console.error(`[ERROR] Cleanup failed: ${error.message}`);
  }
}

// Jalankan cleanup files secara periodik
setInterval(cleanupOldFiles, CONFIG.FILE_CLEANUP_INTERVAL);

// Fungsi untuk cleanup memory maps (userPagination, userRequests)
// Note: userSearchResults sudah tidak ada, langsung pakai JSON
function cleanupExpiredMemoryData() {
  try {
    const now = Date.now();
    let cleanedCount = 0;

    // Cleanup userPagination (cek dari JSON apakah user punya search results)
    for (const userId of userPagination.keys()) {
      const searchEntry = getUserSearchEntry(userId);
      if (!searchEntry) {
        userPagination.delete(userId);
        cleanedCount++;
      }
    }

    // Cleanup userRequests (hapus yang sudah tidak relevan)
    for (const [userId, requests] of userRequests.entries()) {
      const recentRequests = requests.filter(time => now - time < CONFIG.RATE_LIMIT_WINDOW);
      if (recentRequests.length === 0) {
        userRequests.delete(userId);
        cleanedCount++;
      } else {
        userRequests.set(userId, recentRequests);
      }
    }

    if (cleanedCount > 0) {
      console.log(`[CLEANUP] Cleaned ${cleanedCount} expired memory entries`);
    }
  } catch (error) {
    console.error(`[ERROR] Memory cleanup failed: ${error.message}`);
  }
}

// Jalankan memory cleanup secara periodik
setInterval(cleanupExpiredMemoryData, CONFIG.MEMORY_CLEANUP_INTERVAL);

// Fungsi untuk cek apakah IPv4 address termasuk private/internal
function isPrivateIPv4(ip) {
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = ip.match(ipv4Regex);

  if (!match) return false;

  const octets = match.slice(1).map(Number);

  // Validasi octet range
  if (octets.some(octet => octet < 0 || octet > 255)) return false;

  // 127.0.0.0/8 - Loopback
  if (octets[0] === 127) return true;

  // 10.0.0.0/8 - Private
  if (octets[0] === 10) return true;

  // 172.16.0.0/12 - Private (172.16.0.0 - 172.31.255.255)
  if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;

  // 192.168.0.0/16 - Private
  if (octets[0] === 192 && octets[1] === 168) return true;

  // 169.254.0.0/16 - Link-local
  if (octets[0] === 169 && octets[1] === 254) return true;

  // 0.0.0.0/8 - Current network
  if (octets[0] === 0) return true;

  // 255.255.255.255 - Broadcast
  if (octets[0] === 255 && octets[1] === 255 && octets[2] === 255 && octets[3] === 255) return true;

  // 100.64.0.0/10 - Shared Address Space (CGN)
  if (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) return true;

  // 224.0.0.0/4 - Multicast
  if (octets[0] >= 224 && octets[0] <= 239) return true;

  return false;
}

// Fungsi untuk cek apakah IPv6 address termasuk private/internal
function isPrivateIPv6(ip) {
  const ipLower = ip.toLowerCase();

  // ::1 - Loopback
  if (ipLower === '::1' || ipLower === '0:0:0:0:0:0:0:1') return true;

  // fe80::/10 - Link-local
  if (ipLower.startsWith('fe80:')) return true;

  // fc00::/7 - Unique local address (ULA)
  if (ipLower.startsWith('fc') || ipLower.startsWith('fd')) return true;

  // ff00::/8 - Multicast
  if (ipLower.startsWith('ff')) return true;

  return false;
}

// Fungsi async untuk resolve hostname dan validate semua IP addresses
async function resolveAndValidateHost(hostname) {
  const hostLower = hostname.toLowerCase();

  // Check localhost string
  if (hostLower === 'localhost') {
    return { safe: false, reason: 'Localhost tidak diizinkan' };
  }

  // Jika sudah berbentuk IP, langsung check
  if (isPrivateIPv4(hostname)) {
    return { safe: false, reason: 'Private IPv4 tidak diizinkan' };
  }

  if (isPrivateIPv6(hostname)) {
    return { safe: false, reason: 'Private IPv6 tidak diizinkan' };
  }

  // Resolve DNS untuk domain names
  try {
    // Resolve IPv4
    try {
      const ipv4Addresses = await dns.resolve4(hostname);
      for (const ip of ipv4Addresses) {
        if (isPrivateIPv4(ip)) {
          console.warn(`[SECURITY] Domain ${hostname} resolves to private IP: ${ip}`);
          return { safe: false, reason: `Domain mengarah ke private IP (${ip})` };
        }
      }
    } catch (err) {
      // Tidak ada IPv4, skip
    }

    // Resolve IPv6
    try {
      const ipv6Addresses = await dns.resolve6(hostname);
      for (const ip of ipv6Addresses) {
        if (isPrivateIPv6(ip)) {
          console.warn(`[SECURITY] Domain ${hostname} resolves to private IPv6: ${ip}`);
          return { safe: false, reason: `Domain mengarah ke private IPv6` };
        }
      }
    } catch (err) {
      // Tidak ada IPv6, skip
    }

    return { safe: true };
  } catch (err) {
    // DNS resolution failed - bisa jadi domain tidak valid atau network error
    // Untuk keamanan, kita tetap allow (karena axios akan handle ini nanti)
    // Tapi log untuk monitoring
    console.warn(`[WARN] DNS resolution failed for ${hostname}: ${err.message}`);
    return { safe: true };
  }
}

// Fungsi untuk generate keyboard dengan pagination
function generatePaginationKeyboard(links, page) {
  const videosPerPage = CONFIG.VIDEOS_PER_PAGE;
  const totalPages = Math.ceil(links.length / videosPerPage);
  const startIdx = page * videosPerPage;
  const endIdx = Math.min(startIdx + videosPerPage, links.length);

  const keyboard = [];

  // Tampilkan video untuk halaman ini
  for (let i = startIdx; i < endIdx; i++) {
    const urlObj = new URL(links[i]);
    let title = decodeURIComponent(urlObj.pathname.split('/').pop() || `Video ${i + 1}`)
      .replace(/_\d+$/, '')
      .replace(/[-_]/g, ' ')
      .trim();

    const words = title.split(' ')
      .filter(w => !['video', 'porn', 'amateur', 'asian'].includes(w.toLowerCase()))
      .slice(0, 5)
      .join(' ');

    const shortTitle = words.length > 35 ? words.substring(0, 35) + '...' : words;

    keyboard.push([{
      text: `📹 ${i + 1}. ${shortTitle}`,
      callback_data: `download_${i}`
    }]);
  }

  // Navigation buttons
  const navButtons = [];

  if (page > 0) {
    navButtons.push({
      text: '◀️ Sebelumnya',
      callback_data: `page_${page - 1}`
    });
  }

  if (page < totalPages - 1) {
    navButtons.push({
      text: 'Selanjutnya ▶️',
      callback_data: `page_${page + 1}`
    });
  }

  if (navButtons.length > 0) {
    keyboard.push(navButtons);
  }

  // Download all button
  if (links.length > 1) {
    keyboard.push([{
      text: `⬇️ Download Semua (${links.length} video)`,
      callback_data: 'download_all'
    }]);
  }

  return keyboard;
}

// Fungsi untuk info halaman
// urlPageNumber: nomor halaman dari URL (page=6 berarti halaman 6)
// currentPage: internal pagination (0-based) untuk video per halaman
function getPageInfo(totalVideos, currentPage, urlPageNumber = null) {
  const videosPerPage = CONFIG.VIDEOS_PER_PAGE;
  const totalPages = Math.ceil(totalVideos / videosPerPage);
  const startIdx = currentPage * videosPerPage + 1;
  const endIdx = Math.min((currentPage + 1) * videosPerPage, totalVideos);

  // Jika ada urlPageNumber, tampilkan itu sebagai halaman aktual
  if (urlPageNumber !== null) {
    return `📄 Halaman ${urlPageNumber} - Video ${startIdx}-${endIdx} dari ${totalVideos} di halaman ini`;
  }

  return `📄 Halaman ${currentPage + 1}/${totalPages} (Video ${startIdx}-${endIdx} dari ${totalVideos})`;
}

// Fungsi async untuk validasi URL yang lebih ketat dengan DNS resolution
async function isValidVideoUrl(url) {
  try {
    const urlObj = new URL(url);

    // Hanya izinkan http dan https
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return { valid: false, error: 'Hanya URL HTTP/HTTPS yang diizinkan' };
    }

    const hostname = urlObj.hostname.toLowerCase();

    // Resolve dan validate hostname (check DNS untuk private IPs)
    const hostValidation = await resolveAndValidateHost(hostname);
    if (!hostValidation.safe) {
      return { valid: false, error: hostValidation.reason };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'Format URL tidak valid' };
  }
}

// Fungsi untuk ekstrak link-link video dari halaman search/list
async function extractVideoLinksFromPage(pageUrl) {
  try {
    console.log(`[INFO] Extracting video links from: ${pageUrl}`);

    const response = await axios({
      url: pageUrl,
      method: 'GET',
      timeout: CONFIG.HTTP_REQUEST_TIMEOUT,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    const $ = cheerio.load(response.data);
    const baseUrl = new URL(pageUrl);
    const videoLinks = new Set(); // Pakai Set untuk auto-deduplicate

    // Cari semua link yang kemungkinan mengarah ke halaman video
    let skippedCount = 0;

    $('a[href]').each((i, elem) => {
      let href = $(elem).attr('href');
      if (!href) return;

      // Convert relative URL ke absolute
      if (href.startsWith('/')) {
        href = `${baseUrl.protocol}//${baseUrl.host}${href}`;
      } else if (!href.startsWith('http')) {
        return; // Skip jika bukan http atau relative path
      }

      // Validasi: harus sama domain dengan base URL (cegah external links)
      let hrefHostname;
      try {
        hrefHostname = new URL(href).hostname;
      } catch (e) {
        return; // Invalid URL
      }

      if (hrefHostname !== baseUrl.hostname) {
        return; // Skip external links
      }

      // Filter: hanya ambil link ke halaman video individual
      const pathname = new URL(href).pathname;
      const hrefLower = href.toLowerCase();

      // Skip jika ada query string atau fragment (karena video page biasanya clean URL)
      if (href.includes('?') || href.includes('#')) {
        return;
      }

      // Split path dan cek depth
      const pathParts = pathname.split('/').filter(p => p);

      // Harus single-level path (depth = 1)
      if (pathParts.length !== 1) {
        skippedCount++;
        return;
      }

      const pathSegment = pathParts[0].toLowerCase();

      // Skip common non-video paths (lebih strict list)
      const nonVideoKeywords = ['search', 'category', 'categories', 'tag', 'tags', 'login', 'signup', 'register', 'account', 'profile', 'settings', 'dmca', 'terms', 'privacy', 'about', 'contact', 'upload'];
      if (nonVideoKeywords.some(keyword => pathSegment === keyword || pathSegment.startsWith(keyword + '-') || pathSegment.startsWith(keyword + '_'))) {
        skippedCount++;
        return;
      }

      // Harus ada pattern _angka di akhir (ID video)
      const idMatch = pathSegment.match(/_(\d+)$/);
      if (!idMatch) {
        skippedCount++;
        return;
      }

      // ID harus paling tidak 5 digit (relax dari 6 ke 5)
      const videoId = idMatch[1];
      if (videoId.length < 5) {
        skippedCount++;
        return;
      }

      // Relax: Harus cukup panjang (minimal 40 karakter) ATAU mengandung kata "-video-" atau "-porn-"
      if (pathSegment.length < 40 && !pathSegment.includes('-video-') && !pathSegment.includes('-porn-')) {
        skippedCount++;
        return;
      }

      // Passed all validations
      videoLinks.add(href);
    });

    if (skippedCount > 0) {
      console.log(`[INFO] Skipped ${skippedCount} non-video links during extraction`);
    }

    const links = Array.from(videoLinks);
    console.log(`[SUCCESS] Found ${links.length} unique video links`);

    // Deteksi apakah ada halaman selanjutnya
    let nextPageUrl = null;

    // Cari link pagination (bisa berbeda per website, ini pattern umum)
    $('a').each((i, elem) => {
      const text = $(elem).text().toLowerCase().trim();
      const href = $(elem).attr('href');

      // Cek text tombol next (case insensitive)
      if ((text.includes('next') || text.includes('selanjutnya') || text === '›' || text === '»' || text === '>') && href) {
        let nextUrl = href;

        // Convert relative URL ke absolute
        if (nextUrl.startsWith('/')) {
          nextUrl = `${baseUrl.protocol}//${baseUrl.host}${nextUrl}`;
        } else if (!nextUrl.startsWith('http')) {
          nextUrl = `${baseUrl.protocol}//${baseUrl.host}/${nextUrl}`;
        }

        nextPageUrl = nextUrl;
        return false; // Break loop
      }
    });

    // Fallback: Deteksi dari URL pattern (misal: page=2 jadi page=3)
    if (!nextPageUrl) {
      const urlObj = new URL(pageUrl);
      const pageParam = urlObj.searchParams.get('page');

      if (pageParam && !isNaN(pageParam)) {
        const currentPage = parseInt(pageParam);
        const nextPage = currentPage + 1;

        urlObj.searchParams.set('page', nextPage.toString());
        nextPageUrl = urlObj.toString();

        console.log(`[INFO] Auto-detected next page from URL pattern: page ${nextPage}`);
      } else if (!pageParam) {
        // Tidak ada page param = halaman 1, next page = 2
        urlObj.searchParams.set('page', '2');
        nextPageUrl = urlObj.toString();

        console.log(`[INFO] Auto-detected next page from URL pattern: page 2 (from page 1)`);
      } else {
        // Fallback 2: Cek pattern &pageX (tanpa =) atau /pageX
        const urlStr = pageUrl.toLowerCase();

        // Pattern: &page5 atau ?page5 (typo umum)
        const pageMatch = urlStr.match(/[?&]page(\d+)/);
        if (pageMatch) {
          const currentPage = parseInt(pageMatch[1]);
          const nextPage = currentPage + 1;

          // Ganti &page5 jadi &page=6
          nextPageUrl = pageUrl.replace(
            new RegExp(`([?&])page${currentPage}`, 'i'),
            `$1page=${nextPage}`
          );

          console.log(`[INFO] Auto-detected next page from typo pattern: page ${nextPage}`);
        } else {
          // Pattern: /page/5/ atau /page5/
          const pathPageMatch = urlStr.match(/\/page[\/=]?(\d+)/);
          if (pathPageMatch) {
            const currentPage = parseInt(pathPageMatch[1]);
            const nextPage = currentPage + 1;

            nextPageUrl = pageUrl.replace(
              new RegExp(`/page[/=]?${currentPage}`, 'i'),
              `/page/${nextPage}`
            );

            console.log(`[INFO] Auto-detected next page from path pattern: page ${nextPage}`);
          }
        }
      }
    }

    if (nextPageUrl) {
      console.log(`[INFO] Next page detected: ${nextPageUrl}`);
    } else {
      console.log(`[INFO] No next page found (last page)`);
    }

    return {
      success: true,
      links: links,
      total: links.length,
      nextPageUrl: nextPageUrl,
      hasNextPage: !!nextPageUrl
    };

  } catch (error) {
    console.error(`[ERROR] Failed to extract links: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

// Fungsi untuk ekstrak URL video dari halaman HTML
async function extractVideoFromHTML(pageUrl) {
  try {
    console.log(`[INFO] Scraping page: ${pageUrl}`);

    const response = await axios({
      url: pageUrl,
      method: 'GET',
      timeout: CONFIG.HTTP_REQUEST_TIMEOUT,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    const $ = cheerio.load(response.data);
    const videoUrls = [];

    // Cari semua tag <video> dengan attribute src
    $('video[src]').each((i, elem) => {
      const src = $(elem).attr('src');
      if (src) videoUrls.push(src);
    });

    // Cari tag <source> di dalam <video>
    $('video source[src]').each((i, elem) => {
      const src = $(elem).attr('src');
      if (src) videoUrls.push(src);
    });

    // Cari attribute data-src (lazy loading)
    $('video[data-src]').each((i, elem) => {
      const src = $(elem).attr('data-src');
      if (src) videoUrls.push(src);
    });

    if (videoUrls.length === 0) {
      return {
        success: false,
        error: 'Tidak ditemukan video di halaman ini. Pastikan URL mengarah ke halaman yang memiliki video, atau gunakan direct link ke file video.'
      };
    }

    // Ambil video URL pertama
    let videoUrl = videoUrls[0];

    // Convert relative URL ke absolute URL
    if (videoUrl.startsWith('//')) {
      videoUrl = 'https:' + videoUrl;
    } else if (videoUrl.startsWith('/')) {
      const baseUrl = new URL(pageUrl);
      videoUrl = `${baseUrl.protocol}//${baseUrl.host}${videoUrl}`;
    } else if (!videoUrl.startsWith('http')) {
      const baseUrl = new URL(pageUrl);
      videoUrl = `${baseUrl.protocol}//${baseUrl.host}/${videoUrl}`;
    }

    console.log(`[INFO] Extracted video URL: ${videoUrl}`);

    // IMPORTANT: Validasi ulang URL yang diekstrak untuk mencegah SSRF (with DNS resolution)
    const validation = await isValidVideoUrl(videoUrl);
    if (!validation.valid) {
      console.warn(`[SECURITY] Blocked extracted URL: ${videoUrl} - ${validation.error}`);
      return {
        success: false,
        error: `URL video yang ditemukan tidak valid atau tidak aman: ${validation.error}`
      };
    }

    console.log(`[SUCCESS] Found and validated video URL: ${videoUrl}`);

    return {
      success: true,
      videoUrl: videoUrl,
      foundMultiple: videoUrls.length > 1,
      totalFound: videoUrls.length
    };

  } catch (error) {
    console.error(`[ERROR] Scraping failed: ${error.message}`);
    return {
      success: false,
      error: `Gagal scraping halaman: ${error.message}`
    };
  }
}

// Fungsi download video
async function downloadVideo(url, chatId) {
  let filePath = null;

  try {
    // Parse URL untuk dapatkan referer
    const urlObj = new URL(url);
    const referer = `${urlObj.protocol}//${urlObj.hostname}/`;

    // Kirim status "typing"
    await bot.sendChatAction(chatId, 'upload_document');

    console.log(`[INFO] Starting download from: ${urlObj.hostname}`);

    const response = await axios({
      url: url,
      method: 'GET',
      responseType: 'stream',
      maxRedirects: 5,
      timeout: CONFIG.DOWNLOAD_TIMEOUT,
      maxContentLength: CONFIG.MAX_FILE_SIZE,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': referer,
        'Accept': 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity'  // Disable compression untuk video (sudah compressed)
      }
    });

    const contentType = response.headers['content-type'] || '';
    const contentLength = response.headers['content-length'];
    console.log(`[INFO] Content-Type: ${contentType}, Content-Length: ${contentLength}`);

    // Cek apakah response adalah HTML (halaman web), bukan video
    if (contentType.includes('text/html')) {
      return {
        success: false,
        error: 'URL mengarah ke halaman web, bukan video langsung. Gunakan URL video langsung.'
      };
    }

    // Cek ukuran file sebelum download
    if (contentLength && parseInt(contentLength) > CONFIG.MAX_FILE_SIZE) {
      const fileSizeMB = (parseInt(contentLength) / 1024 / 1024).toFixed(2);
      const maxSizeMB = (CONFIG.MAX_FILE_SIZE / 1024 / 1024).toFixed(2);
      console.log(`[WARN] File too large: ${fileSizeMB}MB (max: ${maxSizeMB}MB)`);
      
      // Abort the request immediately
      response.data.destroy();
      
      return {
        success: false,
        error: `❌ File terlalu besar!\n\n📦 Ukuran: ${fileSizeMB} MB\n⚠️ Maksimal: ${maxSizeMB} MB\n\n💡 Bot ini menggunakan Telegram ${useLocalAPI ? 'Local API (hingga 2GB)' : 'Cloud API (hingga 50MB)'}.\n\n💭 Untuk file besar, jalankan bot dengan Local API di PC Anda.`
      };
    }

    const urlPath = new URL(url).pathname;
    let filename = path.basename(urlPath) || `video_${Date.now()}.mp4`;

    // Sanitize filename untuk keamanan
    filename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

    if (!filename.includes('.')) {
      filename += '.mp4';
    }

    filePath = path.join(CONFIG.DOWNLOAD_FOLDER, filename);
    // Optimize write stream dengan buffer 1MB untuk file besar
    const writer = fs.createWriteStream(filePath, {
      highWaterMark: 1024 * 1024  // 1MB buffer
    });

    // Track download progress dengan size check dan periodic logging
    let downloaded = 0;
    let abortedDueToSize = false;
    let lastLoggedPercent = 0;
    let lastUserUpdatePercent = 0;
    const totalSize = parseInt(contentLength) || 0;
    const startTime = Date.now();
    let progressMessageId = null;
    
    console.log(`[DOWNLOAD] Starting download: ${filename} (${(totalSize / 1024 / 1024).toFixed(2)}MB)`);
    
    // Send initial progress message to user
    if (totalSize > 100 * 1024 * 1024) { // Only for files >100MB
      bot.sendMessage(chatId, `📥 Download besar dimulai...\n📦 Size: ${(totalSize / 1024 / 1024).toFixed(2)}MB\n\n⏳ Progress akan diupdate setiap 10%...`)
        .then(msg => { progressMessageId = msg.message_id; })
        .catch(err => console.error('[WARN] Failed to send progress message:', err.message));
    }
    
    response.data.on('data', (chunk) => {
      downloaded += chunk.length;
      
      // Optimized progress logging untuk file besar
      if (totalSize > 0) {
        const percent = Math.floor((downloaded / totalSize) * 100);
        // Log setiap 20% untuk file >500MB, 10% untuk file <500MB
        const logInterval = totalSize > 500 * 1024 * 1024 ? 20 : 10;
        
        if (percent >= lastLoggedPercent + logInterval) {
          lastLoggedPercent = percent;
          const downloadedMB = (downloaded / 1024 / 1024).toFixed(2);
          const totalMB = (totalSize / 1024 / 1024).toFixed(2);
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          const speed = (downloaded / 1024 / (Date.now() - startTime)).toFixed(2);
          const remaining = totalSize - downloaded;
          const eta = remaining / (downloaded / (Date.now() - startTime)) / 1000;
          console.log(`[PROGRESS] ${percent}% - ${downloadedMB}/${totalMB}MB - ${speed}MB/s - ${elapsed}s - ETA: ${eta.toFixed(0)}s`);
          
          // Update user setiap 10% untuk file besar
          if (progressMessageId && percent >= lastUserUpdatePercent + 10) {
            lastUserUpdatePercent = percent;
            const progressBar = '▓'.repeat(Math.floor(percent / 10)) + '░'.repeat(10 - Math.floor(percent / 10));
            bot.editMessageText(
              `📥 Downloading...\n\n${progressBar} ${percent}%\n\n` +
              `📦 ${downloadedMB}/${totalMB}MB\n` +
              `⚡ ${speed}MB/s\n` +
              `⏱️ ETA: ${Math.ceil(eta / 60)} menit`,
              { chat_id: chatId, message_id: progressMessageId }
            ).catch(() => {}); // Ignore edit errors
          }
        }
      } else {
        // Jika tidak ada Content-Length, log setiap 100MB
        const downloadedMB = Math.floor(downloaded / (100 * 1024 * 1024));
        if (downloadedMB > lastLoggedPercent) {
          lastLoggedPercent = downloadedMB;
          const mb = (downloaded / 1024 / 1024).toFixed(2);
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          const speed = (downloaded / 1024 / (Date.now() - startTime)).toFixed(2);
          console.log(`[PROGRESS] Downloaded: ${mb}MB - ${speed}MB/s - ${elapsed}s`);
        }
      }
      
      // Safety check: abort jika download melebihi limit (untuk server yang tidak kirim Content-Length)
      if (downloaded > CONFIG.MAX_FILE_SIZE && !abortedDueToSize) {
        abortedDueToSize = true;
        const downloadedMB = (downloaded / 1024 / 1024).toFixed(2);
        const maxSizeMB = (CONFIG.MAX_FILE_SIZE / 1024 / 1024).toFixed(2);
        console.log(`[WARN] Download exceeded limit during transfer: ${downloadedMB}MB (max: ${maxSizeMB}MB)`);
        
        response.data.destroy(new Error('FILE_TOO_LARGE'));
        writer.destroy(new Error('FILE_TOO_LARGE'));
      }
    });

    // Set socket keepalive untuk koneksi lama (file besar)
    if (response.request && response.request.socket) {
      response.request.socket.setKeepAlive(true, 60000); // Keepalive setiap 60s
    }
    
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        try {
          // Delete progress message if exists
          if (progressMessageId) {
            bot.deleteMessage(chatId, progressMessageId).catch(() => {});
          }
          
          const stats = fs.statSync(filePath);
          const fileSize = stats.size;

          console.log(`[INFO] Download completed. Size: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);

          // Validasi ukuran file (terlalu kecil = kemungkinan redirect/error page)
          if (fileSize < CONFIG.MIN_FILE_SIZE) {
            fs.unlinkSync(filePath);
            console.log(`[WARN] File terlalu kecil (${fileSize} bytes), kemungkinan bukan video asli`);
            resolve({
              success: false,
              error: `File yang didownload terlalu kecil (${(fileSize / 1024).toFixed(2)}KB). Mungkin URL redirect atau butuh akses khusus.`
            });
            return;
          }

          if (fileSize > CONFIG.MAX_FILE_SIZE) {
            fs.unlinkSync(filePath);
            resolve({
              success: false,
              error: `File terlalu besar! (${(fileSize / 1024 / 1024).toFixed(2)}MB). Max: ${(CONFIG.MAX_FILE_SIZE / 1024 / 1024).toFixed(2)}MB`
            });
            return;
          }

          console.log(`[SUCCESS] Direct download: ${filename} (${(fileSize / 1024 / 1024).toFixed(2)}MB)`);
          resolve({
            success: true,
            filePath: filePath,
            filename: filename,
            fileSize: fileSize
          });
        } catch (err) {
          console.error(`[ERROR] File validation failed: ${err.message}`);
          // Cleanup jika ada error
          if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          resolve({
            success: false,
            error: 'Gagal memvalidasi file yang didownload'
          });
        }
      });

      writer.on('error', (err) => {
        console.error(`[ERROR] Write stream error: ${err.message}`);
        // Cleanup jika ada error
        if (filePath && fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        
        // Special handling for FILE_TOO_LARGE error
        if (err.message === 'FILE_TOO_LARGE') {
          const maxSizeMB = (CONFIG.MAX_FILE_SIZE / 1024 / 1024).toFixed(2);
          resolve({
            success: false,
            error: `❌ File terlalu besar!\n\n⚠️ Maksimal: ${maxSizeMB} MB\n\n💡 Bot ini menggunakan Telegram ${useLocalAPI ? 'Local API (hingga 2GB)' : 'Cloud API (hingga 50MB)'}.\n\n💭 Untuk file besar, jalankan bot dengan Local API di PC Anda.`
          });
        } else {
          resolve({
            success: false,
            error: `Gagal menyimpan file: ${err.message}`
          });
        }
      });
    });
  } catch (error) {
    console.error(`[ERROR] Download failed: ${error.message}`);
    // Cleanup jika ada error
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (cleanupError) {
        console.error(`[ERROR] Cleanup failed: ${cleanupError.message}`);
      }
    }

    // Berikan pesan error yang lebih informatif
    let errorMessage = error.message;
    if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Koneksi ditolak. Server tidak dapat diakses.';
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
      if (useLocalAPI) {
        errorMessage = `Timeout saat download.\n\n💡 Untuk file besar, coba:\n• Cek koneksi internet Anda\n• Server mungkin lambat merespons\n• Timeout maksimal: ${CONFIG.DOWNLOAD_TIMEOUT / 1000}s (${CONFIG.DOWNLOAD_TIMEOUT / 60000} menit)`;
      } else {
        errorMessage = 'Timeout. Server terlalu lama merespons.';
      }
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = 'Domain tidak ditemukan. Periksa URL Anda.';
    } else if (error.code === 'ECONNRESET') {
      errorMessage = 'Koneksi terputus. Server memutuskan koneksi.';
    }

    return {
      success: false,
      error: errorMessage
    };
  }
}

// Command /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 
    '👋 Halo! Aku bisa download video untuk kamu!\n\n' +
    '📹 Cara pakai:\n' +
    '1. Direct link: https://example.com/video.mp4\n' +
    '2. Halaman video: Bot ekstrak video otomatis\n' +
    '3. Search results: Pilih video dari list!\n\n' +
    '✨ Fitur Baru:\n' +
    '• 🔍 Support halaman search/category\n' +
    '• 📋 Interactive menu - pilih video\n' +
    '• ⬇️ Download semua atau satu per satu\n' +
    '• 🎯 Auto deduplicate - no duplikat!\n' +
    '• 🎥 Kualitas asli - tidak dikompresi\n\n' +
    '💡 Command:\n' +
    '/start - Mulai bot\n' +
    '/help - Bantuan lengkap\n' +
    '/stats - Cek quota kamu'
  );
});

// Command /help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId,
    '📖 Cara pakai:\n\n' +
    '1️⃣ Direct link ke video:\n' +
    '   https://example.com/video.mp4\n\n' +
    '2️⃣ Halaman yang ada videonya:\n' +
    '   https://example.com/watch/video123\n' +
    '   Bot ekstrak video otomatis!\n\n' +
    '3️⃣ Halaman search/category:\n' +
    '   https://example.com/search?q=keyword\n' +
    '   Bot tampilkan menu pilihan video!\n\n' +
    '✨ Fitur Smart:\n' +
    '• 🔍 Auto-detect: Direct/Page/Search\n' +
    '• 📋 Interactive menu untuk search\n' +
    '• ⬇️ Download 1 video atau semua\n' +
    '• 🎯 Auto deduplicate - cegah duplikat dalam 24 jam\n' +
    '• 🎥 Video kualitas asli (document)\n\n' +
    '⚠️ Batasan:\n' +
    `• Max file: ${(CONFIG.MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB\n` +
    `• Rate limit: ${CONFIG.MAX_REQUESTS_PER_WINDOW} video per ${CONFIG.RATE_LIMIT_WINDOW / 1000} detik\n` +
    `• Max ${CONFIG.MAX_SEARCH_RESULTS} video per search\n` +
    '• Format: MP4, WebM, MKV, AVI, MOV, FLV, WMV\n\n' +
    '🗂️ Data Retention:\n' +
    '• Download history: Dihapus setelah 24 jam\n' +
    '• Search results: Dihapus saat kirim URL baru atau setelah 24 jam\n\n' +
    '💡 Commands:\n' +
    '/start - Mulai bot\n' +
    '/help - Bantuan\n' +
    '/stats - Cek quota'
  );
});

// Command /stats
bot.onText(/\/stats/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const userHistory = userRequests.get(userId) || [];
  const now = Date.now();
  const recentRequests = userHistory.filter(time => now - time < CONFIG.RATE_LIMIT_WINDOW);
  const remainingRequests = CONFIG.MAX_REQUESTS_PER_WINDOW - recentRequests.length;

  bot.sendMessage(chatId,
    '📊 Statistik Bot\n\n' +
    `🔢 Request tersisa: ${remainingRequests}/${CONFIG.MAX_REQUESTS_PER_WINDOW}\n` +
    `⏱️ Reset dalam: ${Math.ceil((CONFIG.RATE_LIMIT_WINDOW - (now - (recentRequests[0] || now))) / 1000)}s\n` +
    `📁 Max file size: ${(CONFIG.MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB\n` +
    `🤖 Status: Online ✅`
  );
});

// Fungsi untuk proses download video (bisa dipanggil ulang)
async function processVideoDownload(text, chatId, userId, existingMessageId = null, skipDuplicateCheck = false) {
  const startTime = Date.now(); // Track start time for duration calculation
  
  // Kirim status
  const loadingMsg = existingMessageId 
    ? { message_id: existingMessageId, chat: { id: chatId } }
    : await bot.sendMessage(chatId, '⏳ Processing...');

  try {
    let videoUrl = text;

    // Cek apakah URL adalah direct link ke video file
    const videoExtensions = ['.mp4', '.webm', '.mkv', '.avi', '.mov', '.flv', '.wmv', '.m4v', '.3gp'];
    const urlPath = new URL(text).pathname.toLowerCase();
    const isDirectLink = videoExtensions.some(ext => urlPath.endsWith(ext));

    // Deteksi apakah ini search/list page
    const urlLower = text.toLowerCase();
    const isSearchPage = urlLower.includes('/search') || 
                        urlLower.includes('?q=') || 
                        urlLower.includes('/category') ||
                        urlLower.includes('/tag');

    // Jika search page, ekstrak semua video links
    if (isSearchPage) {
      await bot.editMessageText(
        '🔍 Mencari video di halaman search...',
        { chat_id: chatId, message_id: loadingMsg.message_id }
      );

      const linksResult = await extractVideoLinksFromPage(text);

      if (!linksResult.success) {
        await bot.editMessageText(
          `❌ Gagal mengekstrak links: ${linksResult.error}`,
          { chat_id: chatId, message_id: loadingMsg.message_id }
        );
        return;
      }

      if (linksResult.total === 0) {
        await bot.editMessageText(
          '❌ Tidak ditemukan link video di halaman ini.',
          { chat_id: chatId, message_id: loadingMsg.message_id }
        );
        return;
      }

      // Deteksi nomor halaman dari URL (tidak ada page param = halaman 1)
      const urlObj = new URL(text);
      const pageParam = urlObj.searchParams.get('page');
      const urlPageNumber = pageParam ? parseInt(pageParam) : 1;

      // Simpan links untuk user ini di JSON (menggantikan yang lama)
      const links = linksResult.links.slice(0, CONFIG.MAX_SEARCH_RESULTS);
      setUserSearchEntry(userId, {
        links: links,
        nextPageUrl: linksResult.nextPageUrl,
        originalUrl: text,
        currentPage: urlPageNumber // Nomor halaman dari URL
      });

      // Simpan state pagination (halaman 0 = awal)
      userPagination.set(userId, {
        currentPage: 0,
        messageId: loadingMsg.message_id
      });

      // Generate keyboard untuk halaman pertama
      const keyboard = generatePaginationKeyboard(links, 0);
      const pageInfo = getPageInfo(links.length, 0, urlPageNumber);

      await bot.editMessageText(
        `✅ Ditemukan ${links.length} video!\n\n` +
        `${pageInfo}\n\n` +
        `Pilih video yang mau di-download:`,
        {
          chat_id: chatId,
          message_id: loadingMsg.message_id,
          reply_markup: { inline_keyboard: keyboard }
        }
      );

      return; // Stop disini, tunggu user pilih
    }

    // Jika bukan direct link dan bukan search page, coba scraping halaman
    if (!isDirectLink) {
      await bot.editMessageText(
        '🔍 Mencari video di halaman...',
        { chat_id: chatId, message_id: loadingMsg.message_id }
      );

      const extractResult = await extractVideoFromHTML(text);

      if (!extractResult.success) {
        await bot.editMessageText(
          `❌ ${extractResult.error}`,
          { chat_id: chatId, message_id: loadingMsg.message_id }
        );
        return;
      }

      videoUrl = extractResult.videoUrl;

      if (extractResult.foundMultiple) {
        await bot.editMessageText(
          `✅ Ditemukan ${extractResult.totalFound} video! Mendownload yang pertama...\n\n⏳ Downloading...`,
          { chat_id: chatId, message_id: loadingMsg.message_id }
        );
      } else {
        await bot.editMessageText(
          '✅ Video ditemukan! Downloading...',
          { chat_id: chatId, message_id: loadingMsg.message_id }
        );
      }
    } else {
      await bot.editMessageText(
        '⏳ Downloading video...',
        { chat_id: chatId, message_id: loadingMsg.message_id }
      );
    }

    // Download video
    const result = await downloadVideo(videoUrl, chatId);

    if (!result.success) {
      await bot.editMessageText(
        `❌ Gagal download: ${result.error}`,
        { chat_id: chatId, message_id: loadingMsg.message_id }
      );
      return;
    }

    // Update status dengan durasi download
    const downloadDuration = ((Date.now() - startTime) / 1000).toFixed(1);
    const downloadSpeed = (result.fileSize / 1024 / (Date.now() - startTime)).toFixed(2);
    
    await bot.editMessageText(
      `✅ Download selesai!\n` +
      `📁 File: ${result.filename}\n` +
      `📦 Size: ${(result.fileSize / 1024 / 1024).toFixed(2)}MB\n` +
      `⚡ Speed: ${downloadSpeed}MB/s\n` +
      `⏱️ Durasi: ${downloadDuration}s\n\n` +
      `⏫ Uploading ke Telegram...`,
      { chat_id: chatId, message_id: loadingMsg.message_id }
    );

    // Deteksi MIME type berdasarkan extension
    const ext = path.extname(result.filename).toLowerCase();
    const mimeTypes = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mkv': 'video/x-matroska',
      '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime',
      '.flv': 'video/x-flv',
      '.wmv': 'video/x-ms-wmv'
    };
    const contentType = mimeTypes[ext] || 'video/mp4';

    // Format caption yang lebih rapi dan centered
    const filenameCleaned = result.filename.replace(/\.[^/.]+$/, ''); // Hapus extension
    const fileSizeMB = (result.fileSize / 1024 / 1024).toFixed(2);

    const caption = 
      `▬▬▬▬▬▬▬▬▬▬▬▬▬\n` +
      `${filenameCleaned} \n\n` +
      `          ❖ ${fileSizeMB}MB ❖\n` +
      `▬▬▬▬▬▬▬▬▬▬▬▬▬`;

    // Kirim video ke user sebagai document dengan content-type yang tepat
    try {
      await bot.sendDocument(chatId, result.filePath, {
        caption: caption
      }, {
        contentType: contentType
      });

      // Simpan ke history untuk mencegah duplikasi
      addToHistory(text, userId, result.filename);

      // Hapus pesan loading
      await bot.deleteMessage(chatId, loadingMsg.message_id);
    } catch (uploadError) {
      console.error(`[ERROR] Telegram upload failed: ${uploadError.message}`);
      
      // Cleanup file immediately on upload failure
      if (fs.existsSync(result.filePath)) {
        fs.unlinkSync(result.filePath);
      }
      
      // Show error to user
      await bot.editMessageText(
        `❌ Gagal upload ke Telegram!\n\n` +
        `Error: ${uploadError.message}\n\n` +
        `💡 File mungkin terlalu besar untuk Telegram ${useLocalAPI ? 'Local API' : 'Cloud API'} (max ${(CONFIG.MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB).`,
        { chat_id: chatId, message_id: loadingMsg.message_id }
      );
      return;
    }

    // Auto-cleanup: Hapus file setelah dikirim
    setTimeout(() => {
      try {
        if (fs.existsSync(result.filePath)) {
          fs.unlinkSync(result.filePath);
          console.log(`[CLEANUP] Deleted sent file: ${result.filename}`);
        }
      } catch (cleanupError) {
        console.error(`[ERROR] Auto-cleanup failed: ${cleanupError.message}`);
      }
    }, CONFIG.FILE_AUTO_DELETE_DELAY);

  } catch (error) {
    console.error(`[ERROR] Message handler error: ${error.message}`);

    try {
      await bot.editMessageText(
        `❌ Error: ${error.message}`,
        { chat_id: chatId, message_id: loadingMsg.message_id }
      );
    } catch (editError) {
      // Jika gagal edit, kirim pesan baru
      await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
  }
}

// Handle URL video
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  // Skip kalau command
  if (text?.startsWith('/')) return;

  // Validasi URL dasar
  if (!text || !text.match(/^https?:\/\/.+/i)) {
    return bot.sendMessage(chatId, '❌ Kirim URL yang valid!\n\nContoh: https://example.com/video.mp4');
  }

  // Hapus search results lama saat ada URL baru (search retention policy)
  // Search results: dihapus setelah ada URL baru + akan dihapus otomatis setelah >24 jam
  const oldSearch = getUserSearchEntry(userId);
  if (oldSearch) {
    // Cek apakah ini URL baru (bukan dari search results yang ada)
    if (!oldSearch.links || !oldSearch.links.includes(text)) {
      deleteUserSearchEntry(userId);
      userPagination.delete(userId);
      console.log(`[CLEANUP] Cleared old search results for user ${userId} (new URL received)`);
    }
  }

  // Cek rate limit
  if (!checkRateLimit(userId)) {
    return bot.sendMessage(
      chatId, 
      '⚠️ Terlalu banyak request! Tunggu sebentar ya.\n\n' +
      `Max ${CONFIG.MAX_REQUESTS_PER_WINDOW} video per ${CONFIG.RATE_LIMIT_WINDOW / 1000} detik.`
    );
  }

  // Validasi URL yang lebih ketat (dengan DNS resolution check)
  const urlValidation = await isValidVideoUrl(text);
  if (!urlValidation.valid) {
    return bot.sendMessage(chatId, `❌ ${urlValidation.error}`);
  }

  // Cek duplikasi: apakah URL ini sudah pernah didownload dalam retention period?
  if (isAlreadyDownloaded(text, userId)) {
    const keyboard = [
      [
        { text: '⬇️ Download Ulang', callback_data: `redownload_${Buffer.from(text).toString('base64').substring(0, 50)}` },
        { text: '❌ Skip', callback_data: 'skip_download' }
      ]
    ];

    // Simpan URL untuk redownload (temporary, in-memory)
    userRedownloadData.set(userId, {
      url: text,
      timestamp: Date.now()
    });

    return bot.sendMessage(
      chatId,
      '⚠️ Video ini sudah pernah kamu download dalam 24 jam terakhir!\n\n' +
      '💡 Pilih aksi:\n' +
      '• Download Ulang - Download video lagi\n' +
      '• Skip - Batalkan download',
      { reply_markup: { inline_keyboard: keyboard } }
    );
  }

  // Process download
  await processVideoDownload(text, chatId, userId);
});

// Handle callback query (tombol inline keyboard)
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const messageId = query.message.message_id;
  const data = query.data;

  try {
    // Handle redownload confirmation
    if (data.startsWith('redownload_')) {
      await bot.answerCallbackQuery(query.id);

      const redownloadData = userRedownloadData.get(userId);

      if (!redownloadData || !redownloadData.url) {
        await bot.editMessageText(
          '❌ Data sudah expired. Kirim URL lagi ya!',
          { chat_id: chatId, message_id: messageId }
        );
        return;
      }

      const url = redownloadData.url;

      // Hapus data redownload
      userRedownloadData.delete(userId);

      await bot.editMessageText(
        '⏳ Processing ulang...',
        { chat_id: chatId, message_id: messageId }
      );

      // Process download tanpa cek duplikasi
      await processVideoDownload(url, chatId, userId, messageId, true);
      return;
    }

    // Handle skip download
    if (data === 'skip_download') {
      await bot.answerCallbackQuery(query.id, {
        text: '✓ Download dibatalkan',
        show_alert: false
      });

      // Hapus data redownload
      userRedownloadData.delete(userId);

      await bot.editMessageText(
        '✅ Download dibatalkan.\n\n💡 Kirim URL baru jika ingin download video lain.',
        { chat_id: chatId, message_id: messageId }
      );
      return;
    }

    // Ambil search results user ini dari JSON
    const searchData = getUserSearchEntry(userId);

    if (!searchData) {
      await bot.answerCallbackQuery(query.id, {
        text: '❌ Data sudah expired. Kirim URL lagi ya!',
        show_alert: true
      });
      return;
    }

    const links = searchData.links;

    // Parse action
    if (data === 'load_next_page') {
      // Load next page
      await bot.answerCallbackQuery(query.id);

      const nextPageUrl = searchData.nextPageUrl;

      if (!nextPageUrl) {
        await bot.answerCallbackQuery(query.id, {
          text: '❌ Tidak ada halaman selanjutnya',
          show_alert: true
        });
        return;
      }

      // Deteksi nomor halaman dari nextPageUrl
      const nextUrlObj = new URL(nextPageUrl);
      const nextPageParam = nextUrlObj.searchParams.get('page');
      // Jika tidak ada page param, itu halaman 1
      const nextPageNumber = nextPageParam ? parseInt(nextPageParam) : 1;

      await bot.editMessageText(
        `🔍 Memuat halaman ${nextPageNumber}...`,
        { chat_id: chatId, message_id: messageId }
      );

      // Ekstrak links dari halaman berikutnya
      const linksResult = await extractVideoLinksFromPage(nextPageUrl);

      if (!linksResult.success) {
        await bot.editMessageText(
          `❌ Gagal memuat halaman selanjutnya: ${linksResult.error}`,
          { chat_id: chatId, message_id: messageId }
        );
        return;
      }

      if (linksResult.total === 0) {
        await bot.editMessageText(
          '❌ Tidak ditemukan video di halaman selanjutnya.',
          { chat_id: chatId, message_id: messageId }
        );
        return;
      }

      // Update search results dengan halaman baru
      const newLinks = linksResult.links.slice(0, CONFIG.MAX_SEARCH_RESULTS);

      // Save the new search results to JSON (menggantikan yang lama)
      setUserSearchEntry(userId, {
        links: newLinks,
        nextPageUrl: linksResult.nextPageUrl,
        originalUrl: nextPageUrl,
        currentPage: nextPageNumber
      });

      // Reset ke halaman 0
      userPagination.set(userId, {
        currentPage: 0,
        messageId: messageId
      });

      // Generate keyboard untuk halaman pertama
      const keyboard = generatePaginationKeyboard(newLinks, 0);
      const pageInfo = getPageInfo(newLinks.length, 0, nextPageNumber);

      await bot.editMessageText(
        `✅ Halaman ${nextPageNumber}: Ditemukan ${newLinks.length} video!\n\n` +
        `${pageInfo}\n\n` +
        `Pilih video yang mau di-download:`,
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: keyboard }
        }
      );

    } else if (data.startsWith('page_')) {
      // Navigation pagination
      const newPage = parseInt(data.split('_')[1]);

      await bot.answerCallbackQuery(query.id);

      // Update pagination state
      userPagination.set(userId, {
        currentPage: newPage,
        messageId: messageId
      });

      // Generate keyboard baru
      const keyboard = generatePaginationKeyboard(links, newPage);
      const urlPageNumber = searchData.currentPage; // Nomor halaman dari URL
      const pageInfo = getPageInfo(links.length, newPage, urlPageNumber);

      // Edit message (auto replace, tidak create new message)
      await bot.editMessageText(
        `✅ Ditemukan ${links.length} video!\n\n` +
        `${pageInfo}\n\n` +
        `Pilih video yang mau di-download:`,
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: keyboard }
        }
      );

    } else if (data === 'download_all') {
      // Download semua video
      await bot.answerCallbackQuery(query.id);
      await bot.editMessageText(
        `⏬ Memproses ${links.length} video...\n\n` +
        `Video akan dikirim satu per satu. Mohon tunggu...`,
        { chat_id: chatId, message_id: messageId }
      );

      let success = 0;
      let failed = 0;
      let skipped = 0;

      for (let i = 0; i < links.length; i++) {
        try {
          const link = links[i];

          // Cek duplikasi - skip jika sudah pernah didownload
          if (isAlreadyDownloaded(link, userId)) {
            console.log(`[INFO] Skipping ${i + 1}/${links.length}: Already downloaded (${link})`);
            skipped++;
            continue;
          }

          console.log(`[INFO] Downloading ${i + 1}/${links.length}: ${link}`);

          // Update progress setiap N video
          if (i > 0 && i % CONFIG.PROGRESS_UPDATE_INTERVAL === 0) {
            await bot.editMessageText(
              `⏬ Progress: ${i}/${links.length} video\n\n` +
              `✓ Berhasil: ${success}\n` +
              `✗ Gagal: ${failed}\n` +
              `⏭️ Dilewati (duplikat): ${skipped}\n\n` +
              `Masih memproses...`,
              { chat_id: chatId, message_id: messageId }
            ).catch(() => {}); // Ignore edit errors
          }

          // Ekstrak video dari halaman
          const extractResult = await Promise.race([
            extractVideoFromHTML(link),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), CONFIG.SCRAPE_TIMEOUT))
          ]).catch(err => ({ success: false, error: err.message }));

          if (!extractResult.success) {
            console.warn(`[WARN] Failed to extract video from ${link}: ${extractResult.error}`);
            failed++;
            continue;
          }

          // Download video
          const result = await Promise.race([
            downloadVideo(extractResult.videoUrl, chatId),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Download timeout')), CONFIG.DOWNLOAD_TIMEOUT))
          ]).catch(err => ({ success: false, error: err.message }));

          if (!result.success) {
            console.warn(`[WARN] Failed to download ${link}: ${result.error}`);
            failed++;
            continue;
          }

          // Format caption yang lebih rapi
          const filenameCleaned = result.filename.replace(/\.[^/.]+$/, '');
          const fileSizeMB = (result.fileSize / 1024 / 1024).toFixed(2);

          const caption = 
            `▬▬▬▬▬ ${i + 1}/${links.length} ▬▬▬▬▬\n` +
            ` ${filenameCleaned} \n\n` +
            `          ❖ ${fileSizeMB}MB ❖\n` +
            `▬▬▬▬▬▬▬▬▬▬▬▬▬`;

          // Kirim video
          await bot.sendDocument(chatId, result.filePath, {
            caption: caption
          }, {
            contentType: 'video/mp4'
          });

          // Simpan ke history
          addToHistory(link, userId, result.filename);

          // Auto-cleanup
          setTimeout(() => {
            try {
              if (fs.existsSync(result.filePath)) {
                fs.unlinkSync(result.filePath);
                console.log(`[CLEANUP] Deleted: ${result.filename}`);
              }
            } catch (err) {
              console.error(`[ERROR] Cleanup failed: ${err.message}`);
            }
          }, CONFIG.FILE_AUTO_DELETE_DELAY);

          success++;

          // Small delay untuk menghindari flood
          await new Promise(resolve => setTimeout(resolve, CONFIG.BATCH_DOWNLOAD_DELAY));

        } catch (error) {
          console.error(`[ERROR] Error processing link ${i + 1}: ${error.message}`);
          failed++;
        }
      }

      // Hapus message progress
      await bot.deleteMessage(chatId, messageId).catch(() => {});

      const nextPageUrl = searchData.nextPageUrl;

      if (nextPageUrl) {
        // Deteksi nomor halaman berikutnya dari URL
        const nextUrlObj = new URL(nextPageUrl);
        const nextPageParam = nextUrlObj.searchParams.get('page');
        // Jika tidak ada page param, itu halaman 1
        const nextPageNumber = nextPageParam ? parseInt(nextPageParam) : 1;

        // Simpan nextPageUrl untuk navigation ke halaman selanjutnya
        // Links dikosongkan karena semua video di halaman ini sudah didownload
        setUserSearchEntry(userId, {
          links: [],
          nextPageUrl: nextPageUrl,
          originalUrl: searchData.originalUrl,
          currentPage: searchData.currentPage
        });

        // Clear pagination state
        userPagination.delete(userId);

        const keyboard = [[{
          text: `➡️ Download Halaman ${nextPageNumber}`,
          callback_data: 'load_next_page'
        }]];

        await bot.sendMessage(
          chatId,
          `✅ Selesai!\n\n` +
          `✓ Berhasil: ${success} video\n` +
          `✗ Gagal: ${failed} video\n` +
          `⏭️ Dilewati (duplikat): ${skipped} video\n\n` +
          `📄 Ada halaman selanjutnya! Klik tombol di bawah untuk lanjut.`,
          { 
            reply_markup: { inline_keyboard: keyboard }
          }
        );
      } else {
        // No next page, clear all search data from JSON
        deleteUserSearchEntry(userId);
        userPagination.delete(userId);

        await bot.sendMessage(
          chatId,
          `✅ Selesai!\n\n` +
          `✓ Berhasil: ${success} video\n` +
          `✗ Gagal: ${failed} video\n` +
          `⏭️ Dilewati (duplikat): ${skipped} video\n\n` +
          `📄 Ini halaman terakhir.`
        );
      }

    } else if (data.startsWith('download_')) {
      // Download video tertentu
      const index = parseInt(data.split('_')[1]);

      if (index < 0 || index >= links.length) {
        await bot.answerCallbackQuery(query.id, {
          text: '❌ Index tidak valid',
          show_alert: true
        });
        return;
      }

      const link = links[index];

      // Cek duplikasi
      if (isAlreadyDownloaded(link, userId)) {
        await bot.answerCallbackQuery(query.id, {
          text: '⚠️ Video ini sudah pernah kamu download dalam 24 jam terakhir!',
          show_alert: true
        });
        return;
      }

      await bot.answerCallbackQuery(query.id);

      await bot.editMessageText(
        `⏳ Memproses video ${index + 1}...\n\n🔍 Mencari video...`,
        { chat_id: chatId, message_id: messageId }
      );

      // Ekstrak video dari halaman
      const extractResult = await extractVideoFromHTML(link);

      if (!extractResult.success) {
        await bot.editMessageText(
          `❌ Gagal: ${extractResult.error}`,
          { chat_id: chatId, message_id: messageId }
        );
        return;
      }

      await bot.editMessageText(
        `⏳ Downloading video ${index + 1}...`,
        { chat_id: chatId, message_id: messageId }
      );

      // Download video
      const result = await downloadVideo(extractResult.videoUrl, chatId);

      if (!result.success) {
        await bot.editMessageText(
          `❌ Gagal download: ${result.error}`,
          { chat_id: chatId, message_id: messageId }
        );
        return;
      }

      await bot.editMessageText(
        `✅ Download selesai!\n📁 ${result.filename}\n📦 ${(result.fileSize / 1024 / 1024).toFixed(2)}MB\n\n⏫ Uploading...`,
        { chat_id: chatId, message_id: messageId }
      );

      // Kirim video
      const ext = path.extname(result.filename).toLowerCase();
      const mimeTypes = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mkv': 'video/x-matroska',
        '.avi': 'video/x-msvideo',
        '.mov': 'video/quicktime',
        '.flv': 'video/x-flv',
        '.wmv': 'video/x-ms-wmv'
      };
      const contentType = mimeTypes[ext] || 'video/mp4';

      await bot.sendDocument(chatId, result.filePath, {
        caption: `📹 ${result.filename}\n💾 ${(result.fileSize / 1024 / 1024).toFixed(2)}MB`
      }, {
        contentType: contentType
      });

      // Simpan ke history
      addToHistory(link, userId, result.filename);

      await bot.deleteMessage(chatId, messageId);

      // Clear pagination state
      userPagination.delete(userId);

      // Auto-cleanup
      setTimeout(() => {
        try {
          if (fs.existsSync(result.filePath)) {
            fs.unlinkSync(result.filePath);
            console.log(`[CLEANUP] Deleted: ${result.filename}`);
          }
        } catch (err) {
          console.error(`[ERROR] Cleanup failed: ${err.message}`);
        }
      }, CONFIG.FILE_AUTO_DELETE_DELAY);
    }

  } catch (error) {
    console.error(`[ERROR] Callback query error: ${error.message}`);
    await bot.answerCallbackQuery(query.id, {
      text: `❌ Error: ${error.message}`,
      show_alert: true
    });
  }
});

// Error handling yang lebih baik dengan auto-restart
let pollingErrorCount = 0;
const MAX_POLLING_ERRORS = 3;

bot.on('polling_error', (error) => {
  console.error(`[ERROR] Polling error: ${error.code || error.message}`);

  // Jangan crash bot untuk error umum
  if (error.code === 'EFATAL' || error.code === 'ETELEGRAM') {
    pollingErrorCount++;
    console.error(`[FATAL] Fatal polling error (${pollingErrorCount}/${MAX_POLLING_ERRORS})`);
    
    if (pollingErrorCount >= MAX_POLLING_ERRORS) {
      console.error('[RESTART] Too many polling errors, restarting polling...');
      pollingErrorCount = 0;
      
      // Stop and restart polling
      bot.stopPolling().then(() => {
        setTimeout(() => {
          bot.startPolling().then(() => {
            console.log('[SUCCESS] Polling restarted successfully');
          }).catch(err => {
            console.error('[ERROR] Failed to restart polling:', err.message);
          });
        }, 2000);
      }).catch(err => {
        console.error('[ERROR] Failed to stop polling:', err.message);
      });
    }
  } else {
    // Reset counter untuk error non-fatal
    pollingErrorCount = 0;
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[INFO] Bot shutting down...');
  bot.stopPolling();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[INFO] Bot shutting down...');
  bot.stopPolling();
  process.exit(0);
});

// Catch unhandled errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('[ERROR] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[ERROR] Uncaught Exception:', error);
});

console.log('✅ Bot berjalan...');
console.log(`🔗 API Mode: ${useLocalAPI ? 'Local API (' + localAPIUrl + ')' : 'Cloud API'}`);
console.log(`📊 Rate limit: ${CONFIG.MAX_REQUESTS_PER_WINDOW} requests per ${CONFIG.RATE_LIMIT_WINDOW / 1000}s`);
console.log(`📁 Max file size: ${(CONFIG.MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB`);
console.log(`🗂️ Download folder: ${CONFIG.DOWNLOAD_FOLDER}`);