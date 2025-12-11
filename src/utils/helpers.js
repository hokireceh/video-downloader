const fs = require('fs');
const path = require('path');
const { CONFIG } = require('../config');

const userRequests = new Map();
const userPagination = new Map();
const userRedownloadData = new Map();
const userSelectedVideos = new Map();

const MAX_MAP_SIZE = 10000;

function checkRateLimit(userId) {
  const now = Date.now();
  const userHistory = userRequests.get(userId) || [];

  const recentRequests = userHistory.filter(time => now - time < CONFIG.RATE_LIMIT_WINDOW);

  if (recentRequests.length >= CONFIG.MAX_REQUESTS_PER_WINDOW) {
    return false;
  }

  recentRequests.push(now);
  
  if (userRequests.size > MAX_MAP_SIZE) {
    const oldestKey = userRequests.keys().next().value;
    userRequests.delete(oldestKey);
  }
  
  userRequests.set(userId, recentRequests);
  return true;
}

function cleanupOldFiles() {
  try {
    if (!fs.existsSync(CONFIG.DOWNLOAD_FOLDER)) {
      return;
    }
    
    const files = fs.readdirSync(CONFIG.DOWNLOAD_FOLDER);
    const now = Date.now();
    let cleanedCount = 0;

    files.forEach(file => {
      const filePath = path.join(CONFIG.DOWNLOAD_FOLDER, file);
      try {
        const stats = fs.statSync(filePath);

        if (now - stats.mtimeMs > CONFIG.FILE_CLEANUP_AGE) {
          fs.unlinkSync(filePath);
          cleanedCount++;
          console.log(`[CLEANUP] Deleted old file: ${file}`);
        }
      } catch (err) {
        console.warn(`[WARN] Could not process file ${file}: ${err.message}`);
      }
    });
    
    if (cleanedCount > 0) {
      console.log(`[CLEANUP] Cleaned ${cleanedCount} old files`);
    }
  } catch (error) {
    console.error(`[ERROR] Cleanup failed: ${error.message}`);
  }
}

function cleanupExpiredMemoryData(getUserSearchEntry) {
  try {
    const now = Date.now();
    let cleanedCount = 0;

    for (const userId of userPagination.keys()) {
      const searchEntry = getUserSearchEntry ? getUserSearchEntry(userId) : null;
      if (!searchEntry) {
        userPagination.delete(userId);
        cleanedCount++;
      }
    }

    for (const [userId, requests] of userRequests.entries()) {
      const recentRequests = requests.filter(time => now - time < CONFIG.RATE_LIMIT_WINDOW);
      if (recentRequests.length === 0) {
        userRequests.delete(userId);
        cleanedCount++;
      } else {
        userRequests.set(userId, recentRequests);
      }
    }
    
    for (const [userId, data] of userRedownloadData.entries()) {
      if (now - data.timestamp > 300000) {
        userRedownloadData.delete(userId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[CLEANUP] Cleaned ${cleanedCount} expired memory entries`);
    }
  } catch (error) {
    console.error(`[ERROR] Memory cleanup failed: ${error.message}`);
  }
}

function generatePaginationKeyboard(links, page, userId = null, pageTitle = null) {
  const videosPerPage = CONFIG.VIDEOS_PER_PAGE;
  const totalPages = Math.ceil(links.length / videosPerPage);
  const startIdx = page * videosPerPage;
  const endIdx = Math.min(startIdx + videosPerPage, links.length);

  const keyboard = [];
  const selectedSet = userId ? (userSelectedVideos.get(userId) || new Set()) : new Set();

  for (let i = startIdx; i < endIdx; i++) {
    let title = pageTitle || '';
    
    try {
      const urlObj = new URL(links[i]);
      
      if (!title) {
        title = decodeURIComponent(urlObj.pathname.split('/').pop() || `Video ${i + 1}`)
          .replace(/_\d+$/, '')
          .replace(/[-_]/g, ' ')
          .trim();
      }

      if (title && links.length > 1 && links[i].match(/(720p|480p|360p|1080p|4k|HD|SD)/i)) {
        const qualityMatch = links[i].match(/(720p|480p|360p|1080p|4k|HD|SD)/i);
        if (qualityMatch) {
          title = `${title} (${qualityMatch[0]})`;
        }
      }
    } catch (e) {
      title = `Video ${i + 1}`;
    }

    const words = title.split(' ')
      .filter(w => !['video', 'porn', 'amateur', 'asian'].includes(w.toLowerCase()))
      .slice(0, 5)
      .join(' ');

    const shortTitle = words.length > 35 ? words.substring(0, 35) + '...' : words;
    
    const isSelected = selectedSet.has(i);
    const checkmark = isSelected ? '✅' : '☐';

    keyboard.push([{
      text: `${checkmark} ${i + 1}. ${shortTitle}`,
      callback_data: `toggle_${i}`
    }]);
  }

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

  const selectedCount = selectedSet.size;
  if (links.length > 1) {
    const actionButtons = [];
    
    if (selectedCount > 0) {
      actionButtons.push({
        text: `✓ Download ${selectedCount} Video`,
        callback_data: 'download_selected'
      });
    }
    
    actionButtons.push({
      text: `⬇️ Download Semua (${links.length})`,
      callback_data: 'download_all'
    });

    if (actionButtons.length > 0) {
      keyboard.push(actionButtons);
    }
  }

  return keyboard;
}

function getPageInfo(totalVideos, currentPage, urlPageNumber = null) {
  const videosPerPage = CONFIG.VIDEOS_PER_PAGE;
  const totalPages = Math.ceil(totalVideos / videosPerPage);
  const startIdx = currentPage * videosPerPage + 1;
  const endIdx = Math.min((currentPage + 1) * videosPerPage, totalVideos);

  if (urlPageNumber !== null) {
    return `📄 Halaman ${urlPageNumber} - Video ${startIdx}-${endIdx} dari ${totalVideos} di halaman ini`;
  }

  return `📄 Halaman ${currentPage + 1}/${totalPages} (Video ${startIdx}-${endIdx} dari ${totalVideos})`;
}

function startFileCleanupInterval() {
  setInterval(cleanupOldFiles, CONFIG.FILE_CLEANUP_INTERVAL);
}

function startMemoryCleanupInterval(getUserSearchEntry) {
  setInterval(() => cleanupExpiredMemoryData(getUserSearchEntry), CONFIG.MEMORY_CLEANUP_INTERVAL);
}

module.exports = {
  userRequests,
  userPagination,
  userRedownloadData,
  userSelectedVideos,
  checkRateLimit,
  cleanupOldFiles,
  cleanupExpiredMemoryData,
  generatePaginationKeyboard,
  getPageInfo,
  startFileCleanupInterval,
  startMemoryCleanupInterval
};
