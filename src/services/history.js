const fs = require('fs');
const path = require('path');
const { CONFIG } = require('../config');

const HISTORY_FILE = path.join(process.cwd(), 'data', 'data.json');

const dataFolder = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataFolder)) {
  fs.mkdirSync(dataFolder, { recursive: true });
  console.log(`[INFO] Created data folder: ${dataFolder}`);
}

let historyCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5000;

function loadHistory() {
  try {
    const now = Date.now();
    if (historyCache && (now - cacheTimestamp) < CACHE_TTL) {
      return historyCache;
    }
    
    if (!fs.existsSync(HISTORY_FILE)) {
      historyCache = { downloads: [], searches: [] };
      cacheTimestamp = now;
      return historyCache;
    }
    const data = fs.readFileSync(HISTORY_FILE, 'utf8');
    const history = JSON.parse(data);
    historyCache = {
      downloads: history.downloads || [],
      searches: history.searches || []
    };
    cacheTimestamp = now;
    return historyCache;
  } catch (error) {
    console.error(`[ERROR] Failed to load history: ${error.message}`);
    return { downloads: [], searches: [] };
  }
}

function saveHistory(history) {
  try {
    historyCache = history;
    cacheTimestamp = Date.now();
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
  } catch (error) {
    console.error(`[ERROR] Failed to save history: ${error.message}`);
  }
}

function cleanupOldHistory() {
  try {
    const history = loadHistory();
    const now = Date.now();
    const downloadsBefore = history.downloads.length;
    const searchesBefore = history.searches.length;

    history.downloads = history.downloads.filter(entry => {
      return (now - entry.timestamp) < CONFIG.HISTORY_RETENTION_MS;
    });

    history.searches = history.searches.filter(entry => {
      return (now - entry.timestamp) < CONFIG.SEARCH_RETENTION_MS;
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

function isAlreadyDownloaded(url, userId) {
  const history = loadHistory();
  const now = Date.now();

  return history.downloads.some(entry => {
    const isMatch = entry.url === url && entry.userId === userId;
    const isRecent = (now - entry.timestamp) < CONFIG.HISTORY_RETENTION_MS;
    const isSent = entry.status === 'sent';
    return isMatch && isRecent && isSent;
  });
}

function addToHistory(url, userId, filename, status = 'sent') {
  try {
    const history = loadHistory();
    const now = Date.now();

    history.downloads.push({
      url: url,
      userId: userId,
      filename: filename,
      status: status,
      timestamp: now,
      sentAt: status === 'sent' ? now : null
    });

    history.downloads = history.downloads.filter(entry => {
      return (now - entry.timestamp) < CONFIG.HISTORY_RETENTION_MS;
    });

    saveHistory(history);
    console.log(`[HISTORY] Added download: ${filename} for user ${userId} (status: ${status})`);
  } catch (error) {
    console.error(`[ERROR] Failed to add to download history: ${error.message}`);
  }
}

function getUserSearchEntry(userId) {
  try {
    const history = loadHistory();
    const userEntry = history.searches.find(s => s.userId === userId);

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

function setUserSearchEntry(userId, searchData) {
  try {
    if ((!searchData.links || searchData.links.length === 0) && !searchData.nextPageUrl) {
      console.log(`[SEARCH] Skipped saving empty search results for user ${userId}`);
      return;
    }

    const history = loadHistory();

    const existingIndex = history.searches.findIndex(s => s.userId === userId);
    const newEntry = {
      userId: userId,
      links: searchData.links || [],
      nextPageUrl: searchData.nextPageUrl,
      originalUrl: searchData.originalUrl,
      currentPage: searchData.currentPage,
      pageTitle: searchData.pageTitle,
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

    saveHistory(history);
  } catch (error) {
    console.error(`[ERROR] Failed to set search entry for user ${userId}: ${error.message}`);
  }
}

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

function getIncompleteDownloads() {
  try {
    const history = loadHistory();
    const now = Date.now();
    
    return history.downloads.filter(entry => {
      const isRecent = (now - entry.timestamp) < CONFIG.HISTORY_RETENTION_MS;
      const isIncomplete = entry.status === 'pending';
      return isIncomplete && isRecent;
    });
  } catch (error) {
    console.error(`[ERROR] Failed to get incomplete downloads: ${error.message}`);
    return [];
  }
}

function updateDownloadStatus(filename, newStatus) {
  try {
    const history = loadHistory();
    const entry = history.downloads.find(d => d.filename === filename);
    
    if (entry) {
      entry.status = newStatus;
      if (newStatus === 'sent') {
        entry.sentAt = Date.now();
      }
      saveHistory(history);
      console.log(`[HISTORY] Updated status for ${filename}: ${newStatus}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`[ERROR] Failed to update download status: ${error.message}`);
    return false;
  }
}

function startHistoryCleanupInterval() {
  setInterval(cleanupOldHistory, 60 * 60 * 1000);
}

module.exports = {
  loadHistory,
  saveHistory,
  cleanupOldHistory,
  isAlreadyDownloaded,
  addToHistory,
  getIncompleteDownloads,
  updateDownloadStatus,
  getUserSearchEntry,
  setUserSearchEntry,
  deleteUserSearchEntry,
  startHistoryCleanupInterval
};
