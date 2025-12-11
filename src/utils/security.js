const dns = require('dns').promises;
const path = require('path');

const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
  '169.254.169.254'
]);

const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

function isPrivateIPv4(ip) {
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = ip.match(ipv4Regex);

  if (!match) return false;

  const octets = match.slice(1).map(Number);

  if (octets.some(octet => octet < 0 || octet > 255)) return false;

  if (octets[0] === 127) return true;
  if (octets[0] === 10) return true;
  if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
  if (octets[0] === 192 && octets[1] === 168) return true;
  if (octets[0] === 169 && octets[1] === 254) return true;
  if (octets[0] === 0) return true;
  if (octets[0] === 255 && octets[1] === 255 && octets[2] === 255 && octets[3] === 255) return true;
  if (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) return true;
  if (octets[0] >= 224 && octets[0] <= 239) return true;

  return false;
}

function isPrivateIPv6(ip) {
  const ipLower = ip.toLowerCase();

  if (ipLower === '::1' || ipLower === '0:0:0:0:0:0:0:1') return true;
  if (ipLower.startsWith('fe80:')) return true;
  if (ipLower.startsWith('fc') || ipLower.startsWith('fd')) return true;
  if (ipLower.startsWith('ff')) return true;

  return false;
}

async function resolveAndValidateHost(hostname) {
  const hostLower = hostname.toLowerCase();

  if (BLOCKED_HOSTS.has(hostLower)) {
    return { safe: false, reason: 'Host tidak diizinkan' };
  }
  
  if (hostLower.endsWith('.internal') || hostLower.endsWith('.local')) {
    return { safe: false, reason: 'Internal hosts tidak diizinkan' };
  }

  if (isPrivateIPv4(hostname)) {
    return { safe: false, reason: 'Private IPv4 tidak diizinkan' };
  }

  if (isPrivateIPv6(hostname)) {
    return { safe: false, reason: 'Private IPv6 tidak diizinkan' };
  }

  try {
    try {
      const ipv4Addresses = await dns.resolve4(hostname);
      for (const ip of ipv4Addresses) {
        if (isPrivateIPv4(ip)) {
          console.warn(`[SECURITY] Domain ${hostname} resolves to private IP: ${ip}`);
          return { safe: false, reason: `Domain mengarah ke private IP (${ip})` };
        }
      }
    } catch (err) {
    }

    try {
      const ipv6Addresses = await dns.resolve6(hostname);
      for (const ip of ipv6Addresses) {
        if (isPrivateIPv6(ip)) {
          console.warn(`[SECURITY] Domain ${hostname} resolves to private IPv6: ${ip}`);
          return { safe: false, reason: `Domain mengarah ke private IPv6` };
        }
      }
    } catch (err) {
    }

    return { safe: true };
  } catch (err) {
    console.warn(`[WARN] DNS resolution failed for ${hostname}: ${err.message}`);
    return { safe: true };
  }
}

async function isValidVideoUrl(url) {
  try {
    const urlObj = new URL(url);

    if (!ALLOWED_SCHEMES.has(urlObj.protocol)) {
      return { valid: false, error: 'Hanya URL HTTP/HTTPS yang diizinkan' };
    }
    
    if (urlObj.username || urlObj.password) {
      return { valid: false, error: 'URL dengan credentials tidak diizinkan' };
    }
    
    if (urlObj.port && !['80', '443', '8080', '8443'].includes(urlObj.port)) {
      console.warn(`[SECURITY] Non-standard port detected: ${urlObj.port}`);
    }

    const hostname = urlObj.hostname.toLowerCase();

    const hostValidation = await resolveAndValidateHost(hostname);
    if (!hostValidation.safe) {
      return { valid: false, error: hostValidation.reason };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'Format URL tidak valid' };
  }
}

function sanitizeFilename(filename, maxLength = 200) {
  if (!filename || typeof filename !== 'string') {
    return `file_${Date.now()}`;
  }
  
  let sanitized = filename
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\s+/g, '_')
    .replace(/__+/g, '_')
    .trim();
  
  const dangerousPatterns = [
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i,
    /\.\./,
    /^-/,
    /^\s/,
    /\s$/
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(sanitized)) {
      sanitized = `file_${Date.now()}`;
      break;
    }
  }
  
  if (sanitized.length > maxLength) {
    const ext = path.extname(sanitized);
    const name = sanitized.slice(0, maxLength - ext.length - 1);
    sanitized = name + ext;
  }
  
  if (!sanitized || sanitized === '.' || sanitized === '..') {
    sanitized = `file_${Date.now()}`;
  }
  
  return sanitized;
}

module.exports = {
  isPrivateIPv4,
  isPrivateIPv6,
  resolveAndValidateHost,
  isValidVideoUrl,
  sanitizeFilename
};
