const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { CONFIG, useLocalAPI } = require('../config');
const { sanitizeFilename } = require('../utils/security');
const { parseM3U8Playlist } = require('./scraper');

if (!fs.existsSync(CONFIG.DOWNLOAD_FOLDER)) {
  fs.mkdirSync(CONFIG.DOWNLOAD_FOLDER, { recursive: true });
  console.log(`[INFO] Created download folder: ${CONFIG.DOWNLOAD_FOLDER}`);
}

async function downloadVideo(videoUrl, chatId, videoTitle = null) {
  let filePath = null;

  try {
    const urlObj = new URL(videoUrl);
    let referer = `${urlObj.protocol}//${urlObj.hostname}/`;

    if (urlObj.hostname.includes('erome.com')) {
      referer = 'https://www.erome.com/';
      console.log(`[INFO] Using erome.com referer: ${referer}`);
    }
    
    if (urlObj.hostname.includes('pornhat.com')) {
      referer = 'https://www.pornhat.com/';
      console.log(`[INFO] Using pornhat.com referer: ${referer}`);
    }

    if (urlObj.hostname.includes('redfans.org')) {
      referer = 'https://redfans.org/';
      console.log(`[INFO] Using redfans.org referer: ${referer}`);
    }

    console.log(`[INFO] Starting download from: ${urlObj.hostname}`);

    const response = await axios({
      url: videoUrl,
      method: 'GET',
      responseType: 'stream',
      maxRedirects: 5,
      timeout: CONFIG.DOWNLOAD_TIMEOUT,
      maxContentLength: CONFIG.MAX_FILE_SIZE,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': referer,
        'Origin': referer.replace(/\/$/, ''),
        'Accept': 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity'
      }
    });

    const contentType = response.headers['content-type'] || '';
    const contentLength = response.headers['content-length'];
    console.log(`[INFO] Content-Type: ${contentType}, Content-Length: ${contentLength}`);

    if (contentType.includes('mpegurl') || videoUrl.includes('.m3u8')) {
      console.log(`[M3U8] Detected HLS playlist, parsing...`);
      response.data.destroy();
      
      const playlistResult = await parseM3U8Playlist(videoUrl);
      if (!playlistResult.success || playlistResult.videoUrls.length === 0) {
        return {
          success: false,
          error: 'Gagal parse HLS playlist. Tidak ada video segments ditemukan.'
        };
      }

      let titleFromUrl = path.basename(urlObj.pathname).replace(/[_\-]/g, ' ').trim();
      if (titleFromUrl.includes('.')) {
        titleFromUrl = titleFromUrl.split('.')[0];
      }

      const hlsTitle = videoTitle || titleFromUrl || 'HLS Video';

      if (playlistResult.videoUrls.length > 1) {
        console.log(`[M3U8] Downloading and concatenating ${playlistResult.videoUrls.length} segments...`);
        return downloadHLSSegments(playlistResult.videoUrls, chatId, hlsTitle);
      } else {
        console.log(`[M3U8] Downloading single video segment`);
        return downloadVideo(playlistResult.videoUrls[0], chatId, hlsTitle);
      }
    }

    if (contentType.includes('text/html')) {
      response.data.destroy();
      return {
        success: false,
        error: 'URL mengarah ke halaman web, bukan video langsung. Gunakan URL video langsung atau biarkan bot mengekstrak dari halaman.'
      };
    }

    if (contentLength && parseInt(contentLength) > CONFIG.MAX_FILE_SIZE) {
      const fileSizeMB = (parseInt(contentLength) / 1024 / 1024).toFixed(2);
      const maxSizeMB = (CONFIG.MAX_FILE_SIZE / 1024 / 1024).toFixed(2);
      console.log(`[WARN] File too large: ${fileSizeMB}MB (max: ${maxSizeMB}MB)`);
      
      response.data.destroy();
      
      return {
        success: false,
        error: `❌ File terlalu besar!\n\n📦 Ukuran: ${fileSizeMB} MB\n⚠️ Maksimal: ${maxSizeMB} MB\n\n💡 Bot ini menggunakan Telegram ${useLocalAPI ? 'Local API (hingga 2GB)' : 'Cloud API (hingga 50MB)'}.`
      };
    }

    let filename;
    if (videoTitle) {
      filename = sanitizeFilename(videoTitle);
      if (filename.length > 200) {
        filename = filename.substring(0, 200);
      }
      if (!filename.endsWith('.mp4')) {
        filename += '.mp4';
      }
    } else {
      const urlPath = new URL(videoUrl).pathname;
      filename = path.basename(urlPath) || `video_${Date.now()}`;
      
      if (filename.includes('?')) {
        filename = filename.split('?')[0];
      }
      
      filename = sanitizeFilename(filename);
    }
    
    if (filename.length > 200) {
      const ext = filename.substring(filename.lastIndexOf('.'));
      filename = filename.substring(0, 200 - ext.length) + ext;
    }

    if (!filename.includes('.')) {
      filename += '.mp4';
    }

    filePath = path.join(CONFIG.DOWNLOAD_FOLDER, filename);
    const writer = fs.createWriteStream(filePath, {
      highWaterMark: 1024 * 1024
    });

    let downloaded = 0;
    let abortedDueToSize = false;
    let lastLoggedPercent = 0;
    const totalSize = parseInt(contentLength) || 0;
    const startTime = Date.now();

    console.log(`[DOWNLOAD] Starting download: ${filename} (${(totalSize / 1024 / 1024).toFixed(2)}MB)`);

    response.data.on('data', (chunk) => {
      downloaded += chunk.length;
      
      if (totalSize > 0) {
        const percent = Math.floor((downloaded / totalSize) * 100);
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
        }
      } else {
        const downloadedMB = Math.floor(downloaded / (100 * 1024 * 1024));
        if (downloadedMB > lastLoggedPercent) {
          lastLoggedPercent = downloadedMB;
          const mb = (downloaded / 1024 / 1024).toFixed(2);
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          const speed = (downloaded / 1024 / (Date.now() - startTime)).toFixed(2);
          console.log(`[PROGRESS] Downloaded: ${mb}MB - ${speed}MB/s - ${elapsed}s`);
        }
      }
      
      if (downloaded > CONFIG.MAX_FILE_SIZE && !abortedDueToSize) {
        abortedDueToSize = true;
        const downloadedMB = (downloaded / 1024 / 1024).toFixed(2);
        const maxSizeMB = (CONFIG.MAX_FILE_SIZE / 1024 / 1024).toFixed(2);
        console.log(`[WARN] Download exceeded limit during transfer: ${downloadedMB}MB (max: ${maxSizeMB}MB)`);
        
        response.data.destroy(new Error('FILE_TOO_LARGE'));
        writer.destroy(new Error('FILE_TOO_LARGE'));
      }
    });

    if (response.request && response.request.socket) {
      response.request.socket.setKeepAlive(true, 60000);
    }
    
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        try {
          const stats = fs.statSync(filePath);
          const fileSize = stats.size;

          console.log(`[INFO] Download completed. Size: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);

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
        if (filePath && fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        
        if (err.message === 'FILE_TOO_LARGE') {
          const maxSizeMB = (CONFIG.MAX_FILE_SIZE / 1024 / 1024).toFixed(2);
          resolve({
            success: false,
            error: `❌ File terlalu besar!\n\n⚠️ Maksimal: ${maxSizeMB} MB\n\n💡 Bot ini menggunakan Telegram ${useLocalAPI ? 'Local API (hingga 2GB)' : 'Cloud API (hingga 50MB)'}.`
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
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (cleanupError) {
        console.error(`[ERROR] Cleanup failed: ${cleanupError.message}`);
      }
    }

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
    } else if (error.response && error.response.status) {
      const status = error.response.status;
      if (status === 403) {
        errorMessage = 'Akses ditolak (403 Forbidden). Server memblokir request.';
      } else if (status === 404) {
        errorMessage = 'Video tidak ditemukan (404). URL mungkin tidak valid.';
      } else if (status === 429) {
        errorMessage = 'Terlalu banyak request (429). Coba lagi nanti.';
      } else if (status >= 500) {
        errorMessage = `Server error (${status}). Coba lagi nanti.`;
      }
    }

    return {
      success: false,
      error: errorMessage
    };
  }
}

async function downloadHLSSegments(segmentUrls, chatId, videoTitle = null) {
  if (!segmentUrls || segmentUrls.length === 0) {
    return { success: false, error: 'No segments to download' };
  }

  const segmentFolder = path.join(CONFIG.DOWNLOAD_FOLDER, `segments_${Date.now()}`);
  let filePath = null;

  try {
    if (!fs.existsSync(segmentFolder)) {
      fs.mkdirSync(segmentFolder, { recursive: true });
    }

    console.log(`[HLS] Downloading ${segmentUrls.length} segments...`);
    
    const downloadedSegments = [];
    for (let i = 0; i < segmentUrls.length; i++) {
      const segmentUrl = segmentUrls[i];
      const segmentPath = path.join(segmentFolder, `seg_${String(i).padStart(4, '0')}.ts`);

      try {
        const response = await axios({
          url: segmentUrl,
          method: 'GET',
          responseType: 'stream',
          timeout: 30000,
          maxRedirects: 3,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        await new Promise((resolve, reject) => {
          const writer = fs.createWriteStream(segmentPath);
          response.data.pipe(writer);
          writer.on('finish', resolve);
          writer.on('error', reject);
        });

        downloadedSegments.push(segmentPath);
        
        if ((i + 1) % Math.max(1, Math.floor(segmentUrls.length / 10)) === 0) {
          console.log(`[HLS] Progress: ${Math.floor((i + 1) / segmentUrls.length * 100)}%`);
        }
      } catch (err) {
        console.warn(`[WARN] Failed to download segment ${i + 1}: ${err.message}`);
      }
    }

    if (downloadedSegments.length === 0) {
      throw new Error('No segments downloaded successfully');
    }

    console.log(`[HLS] Downloaded ${downloadedSegments.length} segments, concatenating...`);

    let filename = `video_${Date.now()}.mp4`;
    if (videoTitle) {
      filename = sanitizeFilename(videoTitle);
      if (filename.length > 200) {
        filename = filename.substring(0, 200);
      }
      if (!filename.endsWith('.mp4')) {
        filename += '.mp4';
      }
    }
    filePath = path.join(CONFIG.DOWNLOAD_FOLDER, filename);
    
    const outputStream = fs.createWriteStream(filePath);
    
    for (const segmentPath of downloadedSegments) {
      const data = fs.readFileSync(segmentPath);
      outputStream.write(data);
    }
    
    outputStream.end();

    return new Promise((resolve) => {
      outputStream.on('finish', () => {
        try {
          const stats = fs.statSync(filePath);
          const fileSize = stats.size;
          const finalFilename = path.basename(filePath);

          console.log(`[HLS] Concatenation complete: ${finalFilename} (${(fileSize / 1024 / 1024).toFixed(2)}MB)`);

          downloadedSegments.forEach(segPath => {
            try { fs.unlinkSync(segPath); } catch (e) {}
          });
          try { fs.rmdirSync(segmentFolder); } catch (e) {}

          resolve({
            success: true,
            filePath: filePath,
            filename: finalFilename,
            fileSize: fileSize
          });
        } catch (err) {
          resolve({
            success: false,
            error: `Concatenation failed: ${err.message}`
          });
        }
      });

      outputStream.on('error', (err) => {
        resolve({
          success: false,
          error: `Write error: ${err.message}`
        });
      });
    });
  } catch (error) {
    console.error(`[ERROR] HLS download failed: ${error.message}`);
    
    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      if (fs.existsSync(segmentFolder)) {
        const files = fs.readdirSync(segmentFolder);
        files.forEach(f => fs.unlinkSync(path.join(segmentFolder, f)));
        fs.rmdirSync(segmentFolder);
      }
    } catch (e) {}

    return {
      success: false,
      error: error.message
    };
  }
}

async function uploadVideoToTelegram(bot, chatId, filePath, filename, options = {}) {
  const {
    caption = '',
    onRetry = null,
    onFail = null,
    maxRetries = 3
  } = options;

  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo', '.mov': 'video/quicktime', '.flv': 'video/x-flv', '.wmv': 'video/x-ms-wmv'
  };
  const contentType = mimeTypes[ext] || 'video/mp4';

  let uploadSuccess = false;
  let uploadAttempts = 0;
  
  while (!uploadSuccess && uploadAttempts < maxRetries) {
    try {
      uploadAttempts++;
      
      if (uploadAttempts > 1) {
        console.log(`[RETRY] Upload attempt ${uploadAttempts}/${maxRetries}`);
        if (onRetry) await onRetry(uploadAttempts, maxRetries);
      }
      
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      const fileSize = fs.statSync(filePath).size;
      console.log(`[UPLOAD] Starting upload: ${filename} (${(fileSize/1024/1024).toFixed(2)}MB)`);
      
      const fileStream = fs.createReadStream(filePath);
      await bot.sendVideo(chatId, fileStream, {
        caption: caption,
        supports_streaming: true
      }, {
        filename: filename,
        contentType: contentType
      });
      
      uploadSuccess = true;
      console.log(`[SUCCESS] Video uploaded: ${filename}`);
      
    } catch (err) {
      console.error(`[ERROR] Upload attempt ${uploadAttempts}/${maxRetries} failed: ${err.message}`);
      
      if (err.code === 'EPARSE') {
        console.error(`[ERROR] EPARSE - Response could not be parsed. Local API may have issues.`);
        if (err.response && err.response.body) {
          console.error(`[ERROR] Response body: ${typeof err.response.body === 'string' ? err.response.body.substring(0, 500) : JSON.stringify(err.response.body)}`);
        }
      }
      
      const isRetryable = !err.message.includes('file is too big') && 
                         !err.message.includes('wrong file identifier') &&
                         uploadAttempts < maxRetries;
      
      if (isRetryable) {
        const waitTime = 3000 * uploadAttempts;
        console.log(`[RETRY] Waiting ${waitTime/1000}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        console.error(`[ERROR] Upload failed - not retryable`);
        if (onFail) await onFail(err.message);
        return { success: false, error: err.message };
      }
    }
  }

  setImmediate(() => {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[CLEANUP] Deleted: ${filename}`);
      }
    } catch (err) {
      console.warn(`[WARN] Cleanup failed: ${err.message}`);
    }
  });

  return uploadSuccess ? { success: true } : { success: false, error: 'Upload failed' };
}

async function checkContentType(url) {
  try {
    const urlObj = new URL(url);
    let referer = `${urlObj.protocol}//${urlObj.hostname}/`;

    if (urlObj.hostname.includes('erome.com')) {
      referer = 'https://www.erome.com/';
    }
    if (urlObj.hostname.includes('pornhat.com')) {
      referer = 'https://www.pornhat.com/';
    }

    const response = await axios({
      url: url,
      method: 'HEAD',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': referer
      },
      maxRedirects: 5,
      validateStatus: () => true
    });

    const contentType = response.headers['content-type'] || '';
    const contentLength = response.headers['content-length'];

    return {
      success: true,
      contentType: contentType,
      contentLength: contentLength ? parseInt(contentLength) : null,
      isVideo: contentType.includes('video/'),
      isM3U8: contentType.includes('mpegurl'),
      isHTML: contentType.includes('text/html')
    };
  } catch (error) {
    console.warn(`[WARN] HEAD request failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

module.exports = {
  downloadVideo,
  downloadHLSSegments,
  uploadVideoToTelegram,
  checkContentType
};
