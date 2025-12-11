const axios = require('axios');
const cheerio = require('cheerio');
const { CONFIG } = require('../config');
const { isValidVideoUrl } = require('../utils/security');

const axiosInstance = axios.create({
  timeout: CONFIG.HTTP_REQUEST_TIMEOUT,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9'
  },
  maxRedirects: 5
});

async function extractVideoLinksFromPage(pageUrl) {
  try {
    console.log(`[INFO] Extracting video links from: ${pageUrl}`);

    const response = await axiosInstance.get(pageUrl);

    const $ = cheerio.load(response.data);
    const baseUrl = new URL(pageUrl);
    const videoLinks = new Set();

    let skippedCount = 0;

    $('a[href]').each((i, elem) => {
      let href = $(elem).attr('href');
      if (!href) return;

      if (href.startsWith('/')) {
        href = `${baseUrl.protocol}//${baseUrl.host}${href}`;
      } else if (!href.startsWith('http')) {
        return;
      }

      let hrefHostname;
      try {
        hrefHostname = new URL(href).hostname;
      } catch (e) {
        return;
      }

      if (hrefHostname !== baseUrl.hostname) {
        return;
      }

      const pathname = new URL(href).pathname;

      if (href.includes('?') || href.includes('#')) {
        return;
      }

      const pathParts = pathname.split('/').filter(p => p);

      if (pathParts.length !== 1) {
        skippedCount++;
        return;
      }

      const pathSegment = pathParts[0].toLowerCase();

      const nonVideoKeywords = ['search', 'category', 'categories', 'tag', 'tags', 'login', 'signup', 'register', 'account', 'profile', 'settings', 'dmca', 'terms', 'privacy', 'about', 'contact', 'upload'];
      if (nonVideoKeywords.some(keyword => pathSegment === keyword || pathSegment.startsWith(keyword + '-') || pathSegment.startsWith(keyword + '_'))) {
        skippedCount++;
        return;
      }

      const idMatch = pathSegment.match(/_(\d+)$/);
      if (!idMatch) {
        skippedCount++;
        return;
      }

      const videoId = idMatch[1];
      if (videoId.length < 5) {
        skippedCount++;
        return;
      }

      if (pathSegment.length < 40 && !pathSegment.includes('-video-') && !pathSegment.includes('-porn-')) {
        skippedCount++;
        return;
      }

      videoLinks.add(href);
    });

    if (skippedCount > 0) {
      console.log(`[INFO] Skipped ${skippedCount} non-video links during extraction`);
    }

    const links = Array.from(videoLinks);
    console.log(`[SUCCESS] Found ${links.length} unique video links`);

    let nextPageUrl = null;

    $('a').each((i, elem) => {
      const text = $(elem).text().toLowerCase().trim();
      const href = $(elem).attr('href');

      if ((text.includes('next') || text.includes('selanjutnya') || text === '›' || text === '»' || text === '>') && href) {
        let nextUrl = href;

        if (nextUrl.startsWith('/')) {
          nextUrl = `${baseUrl.protocol}//${baseUrl.host}${nextUrl}`;
        } else if (!nextUrl.startsWith('http')) {
          nextUrl = `${baseUrl.protocol}//${baseUrl.host}/${nextUrl}`;
        }

        nextPageUrl = nextUrl;
        return false;
      }
    });

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
        urlObj.searchParams.set('page', '2');
        nextPageUrl = urlObj.toString();

        console.log(`[INFO] Auto-detected next page from URL pattern: page 2 (from page 1)`);
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

async function extractVideoFromHTML(pageUrl) {
  try {
    console.log(`[INFO] Scraping page: ${pageUrl}`);

    const response = await axiosInstance.get(pageUrl);
    const contentType = response.headers['content-type'] || '';
    
    console.log(`[DEBUG] Response content-type: ${contentType}, size: ${response.data.length} bytes`);

    // Check if response is M3U8 playlist (sometimes returned without .m3u8 extension)
    if (typeof response.data === 'string' && response.data.includes('#EXTM3U')) {
      console.log(`[INFO] Detected M3U8 playlist in response body`);
      const result = await parseM3U8Playlist(pageUrl);
      if (result.success && result.videoUrls && result.videoUrls.length > 0) {
        return {
          success: true,
          videoUrls: result.videoUrls,
          videoUrl: result.videoUrls[0],
          foundMultiple: result.videoUrls.length > 1,
          totalFound: result.videoUrls.length,
          pageTitle: 'M3U8 Stream',
          isM3U8: true
        };
      }
    }

    const $ = cheerio.load(response.data);
    const videoUrlsSet = new Set();
    
    let pageTitle = '';
    const titleTag = $('title').text().trim();
    const h1Tag = $('h1').first().text().trim();
    const metaOg = $('meta[property="og:title"]').attr('content');
    
    if (metaOg) {
      pageTitle = metaOg;
    } else if (h1Tag) {
      pageTitle = h1Tag;
    } else if (titleTag) {
      pageTitle = titleTag.split('|')[0].trim();
    }
    
    console.log(`[INFO] Page title extracted: ${pageTitle || '(none found)'}`);

    // Extract from standard video tags
    $('video[src]').each((i, elem) => {
      const src = $(elem).attr('src');
      if (src) videoUrlsSet.add(src);
    });

    $('video source[src]').each((i, elem) => {
      const src = $(elem).attr('src');
      if (src) videoUrlsSet.add(src);
    });

    $('video[data-src]').each((i, elem) => {
      const src = $(elem).attr('data-src');
      if (src) videoUrlsSet.add(src);
    });

    // Extract from iframe src (for embedded players)
    $('iframe[src]').each((i, elem) => {
      const src = $(elem).attr('src');
      if (src && (src.includes('video') || src.includes('player'))) {
        // Check if iframe src is a direct video URL
        if (src.match(/\.(mp4|webm|mkv|avi|mov|flv|wmv|m3u8)$/i)) {
          videoUrlsSet.add(src);
        }
      }
    });

    // Extract from data attributes (some players use data-src, data-video-url, etc)
    $('[data-video-url]').each((i, elem) => {
      const src = $(elem).attr('data-video-url');
      if (src) videoUrlsSet.add(src);
    });

    // Extract from script tags (some sites embed URLs in JSON)
    $('script').each((i, elem) => {
      const content = $(elem).text();
      // Look for common URL patterns in script (simplified regex)
      const urlMatches = content.match(/https?:\/\/[^\s"'<>]+?\.(mp4|webm|mkv|m3u8)/gi);
      if (urlMatches) {
        urlMatches.forEach(url => {
          // Clean up URL (remove extra characters)
          const cleanUrl = url.replace(/[",'].*$/, '');
          if (cleanUrl) videoUrlsSet.add(cleanUrl);
        });
      }
    });

    const videoUrls = Array.from(videoUrlsSet);

    if (videoUrls.length === 0) {
      return {
        success: false,
        error: 'Tidak ditemukan video di halaman ini. Pastikan URL mengarah ke halaman yang memiliki video, atau gunakan direct link ke file video.'
      };
    }

    console.log(`[INFO] Found ${videoUrls.length} unique video URLs (after deduplication)`);

    const validatedUrls = new Set();
    const baseUrl = new URL(pageUrl);

    for (let videoUrl of videoUrls) {
      if (videoUrl.startsWith('//')) {
        videoUrl = 'https:' + videoUrl;
      } else if (videoUrl.startsWith('/')) {
        videoUrl = `${baseUrl.protocol}//${baseUrl.host}${videoUrl}`;
      } else if (!videoUrl.startsWith('http')) {
        videoUrl = `${baseUrl.protocol}//${baseUrl.host}/${videoUrl}`;
      }

      const validation = await isValidVideoUrl(videoUrl);
      if (validation.valid) {
        validatedUrls.add(videoUrl);
      } else {
        console.warn(`[SECURITY] Blocked URL: ${videoUrl} - ${validation.error}`);
      }
    }

    const validatedUrlsArray = Array.from(validatedUrls);

    if (validatedUrlsArray.length === 0) {
      return {
        success: false,
        error: 'Tidak ditemukan video yang valid di halaman ini.'
      };
    }

    console.log(`[SUCCESS] Found and validated ${validatedUrlsArray.length} video URLs`);

    return {
      success: true,
      videoUrls: validatedUrlsArray,
      videoUrl: validatedUrlsArray[0],
      foundMultiple: validatedUrlsArray.length > 1,
      totalFound: validatedUrlsArray.length,
      pageTitle: pageTitle
    };

  } catch (error) {
    console.error(`[ERROR] Scraping failed: ${error.message}`);
    return {
      success: false,
      error: `Gagal scraping halaman: ${error.message}`
    };
  }
}

async function parseM3U8Playlist(url, baseUrl = null, isNestedLevel = false) {
  try {
    console.log(`[M3U8] Fetching playlist: ${url}${isNestedLevel ? ' (nested)' : ''}`);
    
    const response = await axiosInstance.get(url);

    const content = response.data;
    const lines = content.split('\n');
    const playlistUrl = baseUrl || url;
    const playlistBase = new URL(playlistUrl).href.substring(0, new URL(playlistUrl).href.lastIndexOf('/') + 1);
    
    const isMasterPlaylist = content.includes('EXT-X-STREAM-INF');
    
    console.log(`[M3U8] Playlist type: ${isMasterPlaylist ? 'MASTER (variants)' : 'VARIANT (segments)'}`);
    
    if (isMasterPlaylist && !isNestedLevel) {
      const variants = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (line.startsWith('#EXT-X-STREAM-INF')) {
          if (i + 1 < lines.length) {
            let variantUrl = lines[i + 1].trim();
            
            if (!variantUrl || variantUrl.startsWith('#')) continue;
            
            if (!variantUrl.startsWith('http')) {
              variantUrl = new URL(variantUrl, playlistBase).toString();
            }
            
            const resolutionMatch = line.match(/RESOLUTION=(\d+x\d+)/);
            const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
            const resolution = resolutionMatch ? resolutionMatch[1] : 'unknown';
            const bandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1]) : 0;
            
            variants.push({
              url: variantUrl,
              resolution: resolution,
              bandwidth: bandwidth
            });
            
            console.log(`[M3U8] Found variant: ${resolution} (${bandwidth} bps)`);
          }
        }
      }
      
      if (variants.length === 0) {
        return { success: false, error: 'No variant streams found' };
      }
      
      const bestVariant = variants.reduce((best, current) => 
        current.bandwidth > best.bandwidth ? current : best
      );
      
      console.log(`[M3U8] Selected best variant: ${bestVariant.resolution}`);
      
      return parseM3U8Playlist(bestVariant.url, bestVariant.url, true);
    }
    
    const videoUrls = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (!line || line.startsWith('#')) continue;
      
      let segmentUrl = line;
      
      if (!segmentUrl.startsWith('http')) {
        segmentUrl = new URL(segmentUrl, playlistBase).toString();
      }
      
      videoUrls.push(segmentUrl);
    }

    console.log(`[M3U8] Found ${videoUrls.length} video segments`);
    return { success: true, videoUrls: videoUrls };
  } catch (error) {
    console.error(`[M3U8] Parse failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

module.exports = {
  extractVideoLinksFromPage,
  extractVideoFromHTML,
  parseM3U8Playlist
};
