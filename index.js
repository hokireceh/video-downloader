require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

const { CONFIG, useLocalAPI, localAPIUrl, validateEnvironment, isAuthorized } = require('./src/config');
const { isValidVideoUrl, sanitizeFilename } = require('./src/utils/security');
const { 
  loadHistory, cleanupOldHistory, isAlreadyDownloaded, addToHistory,
  getIncompleteDownloads, updateDownloadStatus,
  getUserSearchEntry, setUserSearchEntry, deleteUserSearchEntry, startHistoryCleanupInterval 
} = require('./src/services/history');
const {
  userRequests, userPagination, userRedownloadData, userSelectedVideos,
  checkRateLimit, cleanupOldFiles, cleanupExpiredMemoryData,
  generatePaginationKeyboard, getPageInfo, startFileCleanupInterval, startMemoryCleanupInterval
} = require('./src/utils/helpers');
const { extractVideoLinksFromPage, extractVideoFromHTML, parseM3U8Playlist } = require('./src/services/scraper');
const { downloadVideo, downloadHLSSegments, uploadVideoToTelegram, checkContentType } = require('./src/services/downloader');

validateEnvironment();

const botOptions = { 
  polling: {
    interval: 300,
    autoStart: true,
    params: {
      timeout: 10
    }
  },
  filepath: false
};

if (useLocalAPI) {
  botOptions.baseApiUrl = localAPIUrl;
  botOptions.request = {
    rejectUnauthorized: false
  };
  console.log(`[INFO] Using Local Bot API: ${localAPIUrl}`);
  console.log('[INFO] File size limit: Up to 2GB (Local API)');
} else {
  console.log('[INFO] Using Telegram Cloud Bot API');
  console.log('[INFO] File size limit: Up to 50MB (Cloud API)');
}

const bot = new TelegramBot(process.env.BOT_TOKEN, botOptions);

console.log('[STARTUP] Running initial history cleanup...');
cleanupOldHistory();

// Re-upload incomplete files from previous session
console.log('[STARTUP] Checking for incomplete downloads to retry...');
const incompleteDownloads = getIncompleteDownloads();
if (incompleteDownloads.length > 0) {
  console.log(`[STARTUP] Found ${incompleteDownloads.length} incomplete downloads, will retry upload...`);
  
  // Schedule retry for a few seconds after bot starts
  setTimeout(async () => {
    for (const download of incompleteDownloads) {
      try {
        const filePath = path.join(CONFIG.DOWNLOAD_FOLDER, download.filename);
        if (fs.existsSync(filePath)) {
          console.log(`[RETRY] Attempting to upload incomplete file: ${download.filename}`);
          const result = await uploadVideoToTelegram(bot, download.userId, filePath, download.filename, {
            onFail: async (error) => {
              console.error(`[RETRY] Failed to upload ${download.filename}: ${error}`);
            }
          });
          
          if (result.success) {
            updateDownloadStatus(download.filename, 'sent');
          }
        }
      } catch (error) {
        console.error(`[RETRY] Error processing incomplete download: ${error.message}`);
      }
    }
  }, 2000);
} else {
  console.log('[STARTUP] No incomplete downloads found');
}

startHistoryCleanupInterval();
startFileCleanupInterval();
startMemoryCleanupInterval(getUserSearchEntry);

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 
    '👋 Halo! Aku bisa download video untuk kamu!\n\n' +
    '📹 Cara pakai:\n' +
    '1. Direct link: https://example.com/video.mp4\n' +
    '2. Halaman video: Bot ekstrak video otomatis\n' +
    '3. Search results: Pilih video dari list!\n\n' +
    '✨ Fitur:\n' +
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
    '💡 Commands:\n' +
    '/start - Mulai bot\n' +
    '/help - Bantuan\n' +
    '/stats - Cek quota'
  );
});

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

bot.onText(/^\/cek/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const chatName = msg.chat.title || msg.chat.first_name || 'Direct Chat';

  const response = `
📋 **Chat Information**

**Chat ID:** \`${chatId}\`
**Chat Name:** ${chatName}
**Chat Type:** ${msg.chat.type}

👤 **User Information**

**User ID:** \`${userId}\`
**Username:** @${msg.from.username || 'N/A'}
**Name:** ${msg.from.first_name}${msg.from.last_name ? ' ' + msg.from.last_name : ''}

ℹ️ *Gunakan IDs di atas untuk ALLOWED_GROUPS dan ALLOWED_ADMINS di .env*
  `.trim();

  await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
});

bot.onText(/^\/botid/, async (msg) => {
  try {
    const botInfo = await bot.getMe();
    const response = `
🤖 **Bot Information**

**Bot ID:** \`${botInfo.id}\`
**Bot Username:** @${botInfo.username}
**Bot Name:** ${botInfo.first_name}

ℹ️ *Bot ID ini adalah ID bot kamu*
    `.trim();

    await bot.sendMessage(msg.chat.id, response, { parse_mode: 'Markdown' });
  } catch (error) {
    await bot.sendMessage(msg.chat.id, `❌ Error: ${error.message}`);
  }
});

bot.onText(/^\/chat\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const targetGroupId = process.env.RELAY_GROUP_ID;
  const messageText = match[1];

  if (!targetGroupId || targetGroupId.trim() === '') {
    return bot.sendMessage(chatId, '❌ Relay group tidak dikonfigurasi!');
  }

  try {
    await bot.sendMessage(targetGroupId, messageText);
    await bot.sendMessage(chatId, '✅ Pesan terkirim ke group!');
  } catch (error) {
    console.error(`[ERROR] Failed to send relay message: ${error.message}`);
    await bot.sendMessage(chatId, `❌ Gagal kirim ke group!\n\nError: ${error.message}`);
  }
});

async function processVideoDownload(text, chatId, userId, existingMessageId = null, skipDuplicateCheck = false) {
  const startTime = Date.now();
  
  const loadingMsg = existingMessageId 
    ? { message_id: existingMessageId, chat: { id: chatId } }
    : await bot.sendMessage(chatId, '⏳ Processing...');

  try {
    let videoUrl = text;

    const videoExtensions = ['.mp4', '.webm', '.mkv', '.avi', '.mov', '.flv', '.wmv', '.m4v', '.3gp'];
    const urlPath = new URL(text).pathname.toLowerCase().replace(/\/$/, '');
    const isDirectLink = videoExtensions.some(ext => urlPath.endsWith(ext)) || urlPath.includes('/get_file/');

    const urlLower = text.toLowerCase();
    const isSearchPage = urlLower.includes('/search') || 
                        urlLower.includes('?q=') || 
                        urlLower.includes('/category') ||
                        urlLower.includes('/tag');

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

      const urlObj = new URL(text);
      const pageParam = urlObj.searchParams.get('page');
      const urlPageNumber = pageParam ? parseInt(pageParam) : 1;

      const links = linksResult.links.slice(0, CONFIG.MAX_SEARCH_RESULTS);
      setUserSearchEntry(userId, {
        links: links,
        nextPageUrl: linksResult.nextPageUrl,
        originalUrl: text,
        currentPage: urlPageNumber
      });

      userPagination.set(userId, {
        currentPage: 0,
        messageId: loadingMsg.message_id
      });

      const keyboard = generatePaginationKeyboard(links, 0, userId);
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

      return;
    }

    let extractResult = null;

    if (!isDirectLink) {
      await bot.editMessageText(
        '🔍 Mencari video di halaman...',
        { chat_id: chatId, message_id: loadingMsg.message_id }
      );

      const linksResult = await extractVideoLinksFromPage(text);

      if (linksResult.success && linksResult.total > 1) {
        const links = linksResult.links.slice(0, CONFIG.MAX_SEARCH_RESULTS);
        setUserSearchEntry(userId, {
          links: links,
          nextPageUrl: linksResult.nextPageUrl,
          originalUrl: text,
          currentPage: 1
        });

        userPagination.set(userId, {
          currentPage: 0,
          messageId: loadingMsg.message_id
        });

        const keyboard = generatePaginationKeyboard(links, 0, userId);
        const pageInfo = getPageInfo(links.length, 0, 1);

        await bot.editMessageText(
          `✅ Ditemukan ${links.length} video di album ini!\n\n` +
          `${pageInfo}\n\n` +
          `Pilih video yang mau di-download:`,
          {
            chat_id: chatId,
            message_id: loadingMsg.message_id,
            reply_markup: { inline_keyboard: keyboard }
          }
        );

        return;
      }

      extractResult = await extractVideoFromHTML(text);

      if (!extractResult.success) {
        await bot.editMessageText(
          `❌ ${extractResult.error}`,
          { chat_id: chatId, message_id: loadingMsg.message_id }
        );
        return;
      }

      if (extractResult.foundMultiple && extractResult.videoUrls && extractResult.videoUrls.length > 1) {
        const videoOptions = extractResult.videoUrls;

        setUserSearchEntry(userId, {
          links: videoOptions,
          nextPageUrl: null,
          originalUrl: text,
          currentPage: 1,
          pageTitle: extractResult.pageTitle
        });

        userPagination.set(userId, {
          currentPage: 0,
          messageId: loadingMsg.message_id
        });

        const keyboard = generatePaginationKeyboard(videoOptions, 0, userId, extractResult.pageTitle);
        const pageInfo = getPageInfo(videoOptions.length, 0, 1);

        await bot.editMessageText(
          `✅ Ditemukan ${videoOptions.length} pilihan kualitas/source!\n\n` +
          `${pageInfo}\n\n` +
          `Pilih quality yang mau di-download:`,
          {
            chat_id: chatId,
            message_id: loadingMsg.message_id,
            reply_markup: { inline_keyboard: keyboard }
          }
        );

        return;
      }

      videoUrl = extractResult.videoUrl;

      await bot.editMessageText(
        '✅ Video ditemukan! Downloading...',
        { chat_id: chatId, message_id: loadingMsg.message_id }
      );
    } else {
      await bot.editMessageText(
        '⏳ Downloading video...',
        { chat_id: chatId, message_id: loadingMsg.message_id }
      );
    }

    const result = await downloadVideo(videoUrl, chatId, extractResult?.pageTitle || null);

    if (!result.success) {
      await bot.editMessageText(
        `❌ Gagal download: ${result.error}`,
        { chat_id: chatId, message_id: loadingMsg.message_id }
      );
      return;
    }

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

    const filenameCleaned = result.filename.replace(/\.[^/.]+$/, '');
    const fileSizeMB = (result.fileSize / 1024 / 1024).toFixed(2);

    const caption = 
      `▬▬▬▬▬▬▬▬▬▬▬▬▬\n` +
      `${filenameCleaned} \n\n` +
      `          ❖ ${fileSizeMB}MB ❖\n` +
      `▬▬▬▬▬▬▬▬▬▬▬▬▬`;

    const uploadResult = await uploadVideoToTelegram(bot, chatId, result.filePath, result.filename, {
      caption: caption,
      onRetry: async (attempt, max) => {
        await bot.editMessageText(
          `⏫ Retry upload (${attempt}/${max})...`,
          { chat_id: chatId, message_id: loadingMsg.message_id }
        ).catch(() => {});
      },
      onFail: async (error) => {
        let errorDetails = error;
        let helpText = '';
        
        if (error.includes('file is too big')) {
          helpText = `\n\n💡 File terlalu besar untuk Telegram ${useLocalAPI ? 'Local API' : 'Cloud API'}.\n⚠️ Max: ${(CONFIG.MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB`;
        } else if (error.includes('ETELEGRAM')) {
          errorDetails = error.replace('ETELEGRAM: ', '');
          helpText = '\n\n💡 Error dari Telegram server. Coba lagi nanti.';
        } else if (error.includes('ECONNRESET') || error.includes('ETIMEDOUT')) {
          helpText = '\n\n💡 Koneksi terputus. Periksa koneksi internet Anda.';
        }
        
        await bot.editMessageText(
          `❌ Gagal upload ke Telegram!\n\n` +
          `Error: ${errorDetails}${helpText}`,
          { chat_id: chatId, message_id: loadingMsg.message_id }
        );
      }
    });

    if (!uploadResult.success) {
      return;
    }

    addToHistory(text, userId, result.filename, 'sent');
    await bot.deleteMessage(chatId, loadingMsg.message_id);

  } catch (error) {
    console.error(`[ERROR] Message handler error: ${error.message}`);

    try {
      await bot.editMessageText(
        `❌ Error: ${error.message}`,
        { chat_id: chatId, message_id: loadingMsg.message_id }
      );
    } catch (editError) {
      await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
  }
}

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  if (text?.startsWith('/')) return;

  if (!isAuthorized(chatId, userId)) {
    return bot.sendMessage(
      chatId,
      '❌ Bot ini restricted hanya untuk grup/admin tertentu.\n\n' +
      'Hubungi admin bot untuk akses.'
    );
  }

  if (!text || !text.match(/^https?:\/\/.+/i)) {
    return bot.sendMessage(chatId, '❌ Kirim URL yang valid!\n\nContoh: https://example.com/video.mp4');
  }

  const oldSearch = getUserSearchEntry(userId);
  if (oldSearch) {
    if (!oldSearch.links || !oldSearch.links.includes(text)) {
      deleteUserSearchEntry(userId);
      userPagination.delete(userId);
    }
  }

  if (!checkRateLimit(userId)) {
    return bot.sendMessage(
      chatId, 
      '⚠️ Terlalu banyak request! Tunggu sebentar ya.\n\n' +
      `Max ${CONFIG.MAX_REQUESTS_PER_WINDOW} video per ${CONFIG.RATE_LIMIT_WINDOW / 1000} detik.`
    );
  }

  const urlValidation = await isValidVideoUrl(text);
  if (!urlValidation.valid) {
    return bot.sendMessage(chatId, `❌ ${urlValidation.error}`);
  }

  if (isAlreadyDownloaded(text, userId)) {
    const keyboard = [
      [
        { text: '⬇️ Download Ulang', callback_data: `redownload_${Buffer.from(text).toString('base64').substring(0, 50)}` },
        { text: '❌ Skip', callback_data: 'skip_download' }
      ]
    ];

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

  await processVideoDownload(text, chatId, userId);
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const messageId = query.message.message_id;
  const data = query.data;

  try {
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
      userRedownloadData.delete(userId);

      await bot.editMessageText(
        '⏳ Processing ulang...',
        { chat_id: chatId, message_id: messageId }
      );

      await processVideoDownload(url, chatId, userId, messageId, true);
      return;
    }

    if (data === 'skip_download') {
      await bot.answerCallbackQuery(query.id, {
        text: '✓ Download dibatalkan',
        show_alert: false
      });

      userRedownloadData.delete(userId);

      await bot.editMessageText(
        '✓ Download dibatalkan.',
        { chat_id: chatId, message_id: messageId }
      );
      return;
    }

    const searchData = getUserSearchEntry(userId);
    if (!searchData) {
      await bot.answerCallbackQuery(query.id, {
        text: '❌ Session expired. Kirim URL lagi.',
        show_alert: true
      });
      return;
    }

    const links = searchData.links || [];

    if (data.startsWith('toggle_')) {
      const index = parseInt(data.split('_')[1]);
      
      if (index < 0 || index >= links.length) {
        await bot.answerCallbackQuery(query.id, {
          text: '❌ Index tidak valid',
          show_alert: true
        });
        return;
      }

      let selectedSet = userSelectedVideos.get(userId) || new Set();
      
      if (selectedSet.has(index)) {
        selectedSet.delete(index);
      } else {
        selectedSet.add(index);
      }
      
      userSelectedVideos.set(userId, selectedSet);

      const paginationData = userPagination.get(userId) || { currentPage: 0 };
      const keyboard = generatePaginationKeyboard(links, paginationData.currentPage, userId, searchData.pageTitle);
      const pageInfo = getPageInfo(links.length, paginationData.currentPage, searchData.currentPage);

      await bot.answerCallbackQuery(query.id);
      await bot.editMessageReplyMarkup(
        { inline_keyboard: keyboard },
        { chat_id: chatId, message_id: messageId }
      );
      return;
    }

    if (data.startsWith('page_')) {
      const newPage = parseInt(data.split('_')[1]);
      
      userPagination.set(userId, {
        currentPage: newPage,
        messageId: messageId
      });

      const keyboard = generatePaginationKeyboard(links, newPage, userId, searchData.pageTitle);
      const pageInfo = getPageInfo(links.length, newPage, searchData.currentPage);

      await bot.answerCallbackQuery(query.id);
      await bot.editMessageText(
        `📋 Daftar Video\n\n${pageInfo}\n\nPilih video yang mau di-download:`,
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: keyboard }
        }
      );
      return;
    }

    if (data === 'load_next_page') {
      const nextPageUrl = searchData.nextPageUrl;
      
      if (!nextPageUrl) {
        await bot.answerCallbackQuery(query.id, {
          text: '❌ Tidak ada halaman selanjutnya',
          show_alert: true
        });
        return;
      }

      await bot.answerCallbackQuery(query.id);
      await bot.editMessageText(
        '🔍 Loading halaman selanjutnya...',
        { chat_id: chatId, message_id: messageId }
      );

      await processVideoDownload(nextPageUrl, chatId, userId, messageId);
      return;
    }

    if (data === 'download_selected') {
      const selectedSet = userSelectedVideos.get(userId) || new Set();
      
      if (selectedSet.size === 0) {
        await bot.answerCallbackQuery(query.id, {
          text: '❌ Pilih video dulu!',
          show_alert: true
        });
        return;
      }

      await bot.answerCallbackQuery(query.id);

      const selectedLinks = Array.from(selectedSet).sort((a, b) => a - b).map(i => links[i]);
      
      userSelectedVideos.delete(userId);

      await bot.editMessageText(
        `⏬ Downloading ${selectedLinks.length} video...\n\nSedang memproses...`,
        { chat_id: chatId, message_id: messageId }
      );

      let success = 0, failed = 0, skipped = 0;

      for (let i = 0; i < selectedLinks.length; i++) {
        const link = selectedLinks[i];

        if (isAlreadyDownloaded(link, userId)) {
          skipped++;
          continue;
        }

        try {
          const videoExtensions = ['.mp4', '.webm', '.mkv', '.avi', '.mov', '.flv', '.wmv', '.m4v', '.3gp'];
          const urlPath = new URL(link).pathname.toLowerCase().replace(/\/$/, '');
          const isDirectVideoLink = videoExtensions.some(ext => urlPath.endsWith(ext)) || urlPath.includes('/get_file/');

          let videoUrl;
          let pageTitle = null;
          
          if (isDirectVideoLink) {
            videoUrl = link;
            const contentCheck = await checkContentType(link);
            if (contentCheck.success && contentCheck.isM3U8) {
              console.log(`[INFO] Direct link is M3U8, will be handled by downloader`);
            }
          } else {
            const extractResult = await extractVideoFromHTML(link);
            if (!extractResult.success) {
              failed++;
              continue;
            }
            videoUrl = extractResult.videoUrl;
            pageTitle = extractResult.pageTitle;
          }

          const result = await downloadVideo(videoUrl, chatId, pageTitle);
          if (!result.success) {
            failed++;
            continue;
          }

          const filenameCleaned = result.filename.replace(/\.[^/.]+$/, '');
          const fileSizeMB = (result.fileSize / 1024 / 1024).toFixed(2);
          const caption = `▬▬▬▬▬▬▬▬▬▬▬▬▬\n${filenameCleaned}\n\n          ❖ ${fileSizeMB}MB ❖\n▬▬▬▬▬▬▬▬▬▬▬▬▬`;
          const uploadResult = await uploadVideoToTelegram(bot, chatId, result.filePath, result.filename, { caption });

          if (uploadResult.success) {
            addToHistory(link, userId, result.filename);
            success++;
          } else {
            failed++;
          }

          await bot.editMessageText(
            `⏬ Progress: ${i + 1}/${selectedLinks.length}\n\n` +
            `✓ Berhasil: ${success}\n` +
            `✗ Gagal: ${failed}\n` +
            `⏭️ Dilewati: ${skipped}`,
            { chat_id: chatId, message_id: messageId }
          ).catch(() => {});

        } catch (err) {
          console.error(`[ERROR] Selected download error: ${err.message}`);
          failed++;
        }
      }

      await bot.deleteMessage(chatId, messageId).catch(() => {});
      await bot.sendMessage(
        chatId,
        `✅ Selesai!\n\n` +
        `✓ Berhasil: ${success} video\n` +
        `✗ Gagal: ${failed} video\n` +
        `⏭️ Dilewati (duplikat): ${skipped} video`
      );
      return;
    }

    if (data === 'download_all') {
      await bot.answerCallbackQuery(query.id);

      userSelectedVideos.delete(userId);

      await bot.editMessageText(
        `⏬ Downloading ${links.length} video...\n\nSedang memproses...`,
        { chat_id: chatId, message_id: messageId }
      );

      let success = 0, failed = 0, skipped = 0;
      const MAX_CONCURRENT = 3;
      let activeDownloads = 0;
      let nextLinkIndex = 0;

      const processQueue = async () => {
        while (true) {
          const currentIndex = nextLinkIndex++;
          if (currentIndex >= links.length) break;
          
          const link = links[currentIndex];

          if (isAlreadyDownloaded(link, userId)) {
            skipped++;
            continue;
          }

          try {
            activeDownloads++;
            
            const videoExtensions = ['.mp4', '.webm', '.mkv', '.avi', '.mov', '.flv', '.wmv', '.m4v', '.3gp'];
            const urlPath = new URL(link).pathname.toLowerCase().replace(/\/$/, '');
            const isDirectVideoLink = videoExtensions.some(ext => urlPath.endsWith(ext)) || urlPath.includes('/get_file/');

            let videoUrl;
            let pageTitle = null;
            
            if (isDirectVideoLink) {
              videoUrl = link;
              const contentCheck = await checkContentType(link);
              if (contentCheck.success && contentCheck.isM3U8) {
                console.log(`[INFO] Direct link is M3U8, will be handled by downloader`);
              }
            } else {
              const extractResult = await extractVideoFromHTML(link);
              if (!extractResult.success) {
                failed++;
                activeDownloads--;
                continue;
              }
              videoUrl = extractResult.videoUrl;
              pageTitle = extractResult.pageTitle;
            }

            const result = await downloadVideo(videoUrl, chatId, pageTitle);
            if (!result.success) {
              failed++;
              activeDownloads--;
              continue;
            }

            const filenameCleaned = result.filename.replace(/\.[^/.]+$/, '');
            const fileSizeMB = (result.fileSize / 1024 / 1024).toFixed(2);
            const caption = `▬▬▬▬▬ ${currentIndex + 1}/${links.length} ▬▬▬▬▬\n${filenameCleaned}\n\n          ❖ ${fileSizeMB}MB ❖\n▬▬▬▬▬▬▬▬▬▬▬▬▬`;
            const uploadResult = await uploadVideoToTelegram(bot, chatId, result.filePath, result.filename, { caption });

            if (uploadResult.success) {
              addToHistory(link, userId, result.filename);
              success++;
            } else {
              failed++;
            }

            activeDownloads--;

          } catch (error) {
            console.error(`[ERROR] Download all error: ${error.message}`);
            failed++;
            activeDownloads--;
          }
        }
      };

      const workers = [];
      for (let i = 0; i < MAX_CONCURRENT; i++) {
        workers.push(processQueue());
      }

      await Promise.all(workers);

      await bot.deleteMessage(chatId, messageId).catch(() => {});

      const nextPageUrl = searchData.nextPageUrl;
      if (nextPageUrl) {
        const nextUrlObj = new URL(nextPageUrl);
        const nextPageParam = nextUrlObj.searchParams.get('page');
        const nextPageNumber = nextPageParam ? parseInt(nextPageParam) : 1;

        setUserSearchEntry(userId, {
          links: [],
          nextPageUrl: nextPageUrl,
          originalUrl: searchData.originalUrl,
          currentPage: searchData.currentPage
        });

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
          { reply_markup: { inline_keyboard: keyboard } }
        );
      } else {
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
      return;
    }

    if (data.startsWith('download_')) {
      const index = parseInt(data.split('_')[1]);

      if (index < 0 || index >= links.length) {
        await bot.answerCallbackQuery(query.id, {
          text: '❌ Index tidak valid',
          show_alert: true
        });
        return;
      }

      const link = links[index];

      if (isAlreadyDownloaded(link, userId)) {
        await bot.answerCallbackQuery(query.id, {
          text: '⚠️ Video ini sudah pernah kamu download dalam 24 jam terakhir!',
          show_alert: true
        });
        return;
      }

      await bot.answerCallbackQuery(query.id);

      const videoExtensions = ['.mp4', '.webm', '.mkv', '.avi', '.mov', '.flv', '.wmv', '.m4v', '.3gp'];
      const urlPath = new URL(link).pathname.toLowerCase().replace(/\/$/, '');
      const isDirectVideoLink = videoExtensions.some(ext => urlPath.endsWith(ext)) || urlPath.includes('/get_file/');

      let videoUrl;
      let pageTitle = null;

      if (isDirectVideoLink) {
        videoUrl = link;
        
        const contentCheck = await checkContentType(link);
        if (contentCheck.success && contentCheck.isM3U8) {
          console.log(`[INFO] Direct link is M3U8, will be handled by downloader`);
        }
        
        await bot.editMessageText(
          `⏳ Downloading video ${index + 1}...`,
          { chat_id: chatId, message_id: messageId }
        );
      } else {
        await bot.editMessageText(
          `⏳ Memproses video ${index + 1}...\n\n🔍 Mencari video...`,
          { chat_id: chatId, message_id: messageId }
        );

        const extractResult = await extractVideoFromHTML(link);

        if (!extractResult.success) {
          await bot.editMessageText(
            `❌ Gagal: ${extractResult.error}`,
            { chat_id: chatId, message_id: messageId }
          );
          return;
        }

        videoUrl = extractResult.videoUrl;
        pageTitle = extractResult.pageTitle;

        await bot.editMessageText(
          `⏳ Downloading video ${index + 1}...`,
          { chat_id: chatId, message_id: messageId }
        );
      }

      const result = await downloadVideo(videoUrl, chatId, pageTitle);

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

      const filenameCleaned = result.filename.replace(/\.[^/.]+$/, '');
      const fileSizeMB = (result.fileSize / 1024 / 1024).toFixed(2);
      const uploadCaption = `▬▬▬▬▬▬▬▬▬▬▬▬▬\n${filenameCleaned}\n\n          ❖ ${fileSizeMB}MB ❖\n▬▬▬▬▬▬▬▬▬▬▬▬▬`;
      const uploadResult = await uploadVideoToTelegram(bot, chatId, result.filePath, result.filename, {
        caption: uploadCaption
      });

      if (!uploadResult.success) {
        throw new Error(`Upload failed: ${uploadResult.error}`);
      }

      addToHistory(link, userId, result.filename);
      await bot.deleteMessage(chatId, messageId);
      userPagination.delete(userId);
    }

  } catch (error) {
    console.error(`[ERROR] Callback query error: ${error.message}`);
    await bot.answerCallbackQuery(query.id, {
      text: `❌ Error: ${error.message}`,
      show_alert: true
    });
  }
});

let pollingErrorCount = 0;
const MAX_POLLING_ERRORS = 3;

bot.on('polling_error', (error) => {
  console.error(`[ERROR] Polling error: ${error.code || error.message}`);

  if (error.code === 'EFATAL' || error.code === 'ETELEGRAM' || error.code === 'EPARSE') {
    pollingErrorCount++;
    console.error(`[FATAL] Fatal polling error (${pollingErrorCount}/${MAX_POLLING_ERRORS})`);
    
    if (pollingErrorCount >= MAX_POLLING_ERRORS) {
      console.error('[RESTART] Too many polling errors, restarting polling...');
      pollingErrorCount = 0;
      
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
    pollingErrorCount = 0;
  }
});

async function gracefulShutdown(signal) {
  console.log(`\n[INFO] ${signal} received - Bot shutting down gracefully...`);
  
  try {
    console.log('[CLEANUP] Stopping bot polling...');
    await bot.stopPolling();
    
    console.log('[CLEANUP] Running final history cleanup...');
    cleanupOldHistory();
    
    console.log('[CLEANUP] Cleaning up old files...');
    cleanupOldFiles();
    
    console.log('[CLEANUP] Cleaning up memory data...');
    cleanupExpiredMemoryData(getUserSearchEntry);
    
    const history = loadHistory();
    console.log(`[STATS] Final state - Downloads: ${history.downloads.length}, Searches: ${history.searches.length}`);
    
    console.log('[SUCCESS] Bot shutdown complete ✓');
    process.exit(0);
  } catch (error) {
    console.error(`[ERROR] Error during shutdown: ${error.message}`);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

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
