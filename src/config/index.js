require('dotenv').config();

const CONFIG = {
  RATE_LIMIT_WINDOW: 60000,
  MAX_REQUESTS_PER_WINDOW: 5,

  MAX_FILE_SIZE: process.env.USE_LOCAL_API === 'true' 
    ? 2000000000
    : (parseInt(process.env.MAX_FILE_SIZE) || 50000000),
  DOWNLOAD_FOLDER: process.env.DOWNLOAD_FOLDER || './downloads',
  FILE_CLEANUP_AGE: 3600000,
  FILE_CLEANUP_INTERVAL: 1800000,
  FILE_AUTO_DELETE_DELAY: 30000,

  VIDEOS_PER_PAGE: 5,
  MAX_SEARCH_RESULTS: 20,

  HTTP_REQUEST_TIMEOUT: 30000,
  DOWNLOAD_TIMEOUT: process.env.USE_LOCAL_API === 'true' 
    ? 1800000
    : 60000,
  SCRAPE_TIMEOUT: 30000,

  PROGRESS_UPDATE_INTERVAL: 3,
  BATCH_DOWNLOAD_DELAY: 0,

  SEARCH_RESULTS_TTL: 1800000,
  MEMORY_CLEANUP_INTERVAL: 300000,

  MIN_FILE_SIZE: 10000,
  
  HISTORY_RETENTION_MS: 24 * 60 * 60 * 1000,
  SEARCH_RETENTION_MS: 24 * 60 * 60 * 1000,
};

const useLocalAPI = process.env.USE_LOCAL_API === 'true';
const localAPIUrl = process.env.LOCAL_API_URL || 'http://localhost:8081';

function validateEnvironment() {
  const errors = [];

  if (!process.env.BOT_TOKEN) {
    errors.push('BOT_TOKEN is required. Please set it in .env file');
  } else if (process.env.BOT_TOKEN.length < 40) {
    errors.push('BOT_TOKEN appears to be invalid (too short)');
  }

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

function isAuthorized(chatId, userId) {
  const allowedGroups = process.env.ALLOWED_GROUPS || '';
  const allowedAdmins = process.env.ALLOWED_ADMINS || '';

  if (!allowedGroups && !allowedAdmins) {
    return true;
  }

  if (allowedGroups) {
    const groupList = allowedGroups.split(',').map(g => g.trim()).filter(g => g);
    if (groupList.length > 0 && !groupList.includes(chatId.toString())) {
      return false;
    }
  }

  if (allowedAdmins) {
    const adminList = allowedAdmins.split(',').map(a => a.trim()).filter(a => a);
    if (adminList.length > 0 && !adminList.includes(userId.toString())) {
      return false;
    }
  }

  return true;
}

module.exports = {
  CONFIG,
  useLocalAPI,
  localAPIUrl,
  validateEnvironment,
  isAuthorized
};
