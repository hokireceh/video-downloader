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

async function downloadVideo(videoUrl, chatId) {
  let filePath = null;
  
  try {
    console.log(`[INFO] Starting download: ${videoUrl}`);

    // Check if URL is M3U8 playlist
    if (videoUrl.includes('.m3u8') || videoUrl.endsWith('.m3u8')) {
      console.log(`[INFO] Detected M3U8 playlist, parsing...`);
      const parseResult = await parseM3U8Playlist(videoUrl);
      
      if (!parseResult.success) {
        return {
          success: false,
          error: `Gagal parse M3U8 playlist: ${parseResult.error}`
        };
      }
      
      if (!parseResult.videoUrls || parseResult.videoUrls.length === 0) {
        return {
          success: false,
          error: 'M3U8 playlist kosong atau tidak ada segment video'
        };
      }
      
      console.log(`[HLS] Downloading ${parseResult.videoUrls.length} segments...`);
      const hlsResult = await downloadHLSSegments(parseResult.videoUrls, chatId, 'HLS Video');
      return hlsResult;
    }

    const urlObj = new URL(videoUrl);
    let filename = decodeURIComponent(urlObj.pathname.split('/').pop()) || `video_${Date.now()}.mp4`;
    
    filename = sanitizeFilename(filename);

    const videoExtensions = ['.mp4', '.webm', '.mkv', '.avi', '.mov', '.flv', '.wmv', '.m4v', '.3gp'];
    if (!videoExtensions.some(ext => filename.toLowerCase().endsWith(ext))) {
      filename += '.mp4';
    }

    filePath = path.join(CONFIG.DOWNLOAD_FOLDER, filename);

    const headResponse = await axios({
      url: videoUrl,
      method: 'HEAD',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      maxRedirects: 5
    }).catch(() => null);

    const contentLength = headResponse?.headers['content-length'];
    if (contentLength) {
      const fileSize = parseInt(contentLength);
      if (fileSize > CONFIG.MAX_FILE_SIZE) {
        const maxSizeMB = (CONFIG.MAX_FILE_SIZE / 1024 / 1024).toFixed(0);
        const fileSizeMB = (fileSize / 1024 / 1024).toFixed(2);
        return {
          success: false,
          error: `File terlalu besar (${fileSizeMB}MB). Maksimal ${maxSizeMB}MB.`
        };
      }
    }

    const response = await axios({
      url: videoUrl,
      method: 'GET',
      responseType: 'stream',
      timeout: CONFIG.DOWNLOAD_TIMEOUT,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'identity'
      }
    });

    const writer = fs.createWriteStream(filePath);

    return new Promise((resolve, reject) => {
      let downloadedBytes = 0;
      const totalBytes = parseInt(response.headers['content-length']) || 0;
      let lastProgress = 0;

      response.data.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        
        if (totalBytes > 0) {
          const progress = Math.floor((downloadedBytes / totalBytes) * 100);
          if (progress >= lastProgress + CONFIG.PROGRESS_UPDATE_INTERVAL) {
            lastProgress = progress;
            console.log(`[DOWNLOAD] Progress: ${progress}% (${(downloadedBytes / 1024 / 1024).toFixed(2)}MB / ${(totalBytes / 1024 / 1024).toFixed(2)}MB)`);
          }
        }
      });

      response.data.pipe(writer);

      writer.on('finish', () => {
        const stats = fs.statSync(filePath);
        const fileSize = stats.size;

        if (fileSize < CONFIG.MIN_FILE_SIZE) {
          try {
            fs.unlinkSync(filePath);
          } catch (e) {}
          
          resolve({
            success: false,
            error: `File terlalu kecil (${(fileSize / 1024).toFixed(2)}KB). Kemungkinan bukan video valid atau server menolak request.`
          });
          return;
        }

        console.log(`[SUCCESS] Downloaded: ${filename} (${(fileSize / 1024 / 1024).toFixed(2)}MB)`);
        resolve({
          success: true,
          filePath: filePath,
          filename: filename,
          fileSize: fileSize
        });
      });

      writer.on('error', (err) => {
        console.error(`[ERROR] Write error: ${err.message}`);
        if (filePath && fs.existsSync(filePath)) {
          try { fs.unlinkSync(filePath); } catch (e) {}
        }

        if (err.message.includes('ENOSPC') || err.message.includes('no space')) {
          resolve({
            success: false,
            error: 'Disk penuh! Tidak cukup ruang untuk menyimpan file.'
          });
        } else if (err.message.includes('max size') || err.message.includes('too big')) {
          const maxSizeMB = (CONFIG.MAX_FILE_SIZE / 1024 / 1024).toFixed(0);
          resolve({
            success: false,
            error: `File terlalu besar! Maksimal: ${maxSizeMB} MB`
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
      try { fs.unlinkSync(filePath); } catch (e) {}
    }

    let errorMessage = error.message;
    if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Koneksi ditolak. Server tidak dapat diakses.';
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
      errorMessage = useLocalAPI 
        ? `Timeout saat download. Cek koneksi internet Anda.`
        : 'Timeout. Server terlalu lama merespons.';
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
        console.log(`[HLS] Downloading segment ${i + 1}/${segmentUrls.length}`);
        
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
      
      await bot.sendVideo(chatId, filePath, {
        caption: caption,
        supports_streaming: true
      }, {
        filename: filename,
        contentType: contentType
      });
      
      uploadSuccess = true;
      console.log(`[SUCCESS] Video uploaded: ${filename}`);
      
    } catch (err) {
      console.error(`[ERROR] Upload attempt ${uploadAttempts} failed: ${err.message}`);
      
      const isRetryable = err.message.includes('ECONNRESET') || 
                          err.message.includes('ETIMEDOUT') || 
                          err.message.includes('socket hang up') ||
                          err.message.includes('network');
      
      if (!isRetryable || uploadAttempts >= maxRetries) {
        if (onFail) await onFail(err.message);
        return { success: false, error: err.message };
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000 * uploadAttempts));
    }
  }

  try {
    setTimeout(() => {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[CLEANUP] Deleted: ${filename}`);
      }
    }, CONFIG.FILE_AUTO_DELETE_DELAY);
  } catch (e) {
    console.warn(`[WARN] Failed to schedule file deletion: ${e.message}`);
  }

  return { success: uploadSuccess };
}

module.exports = {
  downloadVideo,
  downloadHLSSegments,
  uploadVideoToTelegram
};
