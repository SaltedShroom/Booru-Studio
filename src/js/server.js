const http = require('http');
const https = require('https');
const net = require('net');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const url = require('url');
const puppeteer = require('puppeteer');
const { SocksProxyAgent } = require('socks-proxy-agent');
const HttpProxyAgent = require('http-proxy-agent');
const HttpsProxyAgent = require('https-proxy-agent');
const database = require('./database');

const { app: electronApp } = (() => {
  try {
    return require('electron');
  } catch (err) {
    return {};
  }
})();

const DOCUMENTS_PATH = electronApp && typeof electronApp.getPath === 'function'
  ? electronApp.getPath('documents')
  : process.env.USERPROFILE
    ? path.join(process.env.USERPROFILE, 'Documents')
    : process.env.HOME
      ? path.join(process.env.HOME, 'Documents')
      : path.join(__dirname, '..', 'Documents');

const USER_DATA_BASE = path.join(DOCUMENTS_PATH, 'My Games', 'BS');

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

ensureDirectoryExists(USER_DATA_BASE);

const PORT = 3001;
const DEFAULT_DOWNLOAD_FOLDER = path.join(USER_DATA_BASE, 'downloads');
let browser = null;
const FALLBACK_THUMBNAIL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVQYV2NgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=', 'base64');

// Proxy configuration
let proxySettings = {
  active: false,
  type: 'HTTP',
  host: '',
  port: '',
  user: '',
  password: '',
  // Anonymity options (all on by default)
  uaRotation: true,
  jitterMin: 20,
  jitterMax: 250,
  torRotateCount: 100,
  torRotateMins: 300
};

let blacklistTags = [];
// blacklistingString will be computed on demand when needed

// ----- server-side logging helpers & SSE broadcast -----
// keep a small buffer of recent log lines so new clients can catch up
const logBuffer = [];
const sseClients = new Set();

function broadcastLog(message) {
  // normalize newline
  const lines = message.toString().split("\n");
  lines.forEach(line => {
    logBuffer.push(line);
    if (logBuffer.length > 500) logBuffer.shift();
    sseClients.forEach(res => {
      res.write(`data: ${line.replace(/\n/g, '\\ndata: ')}\n\n`);
    });
  });
}

function broadcastCircuitRotated() {
  sseClients.forEach(res => {
    res.write('event: circuit-rotated\ndata: {}\n\n');
  });
}

// wrap console methods to mirror output to SSE buffer
const origConsoleLog = console.log.bind(console);
const origConsoleWarn = console.warn.bind(console);
const origConsoleError = console.error.bind(console);

function serializeArg(arg) {
  if (arg instanceof Error) {
    return arg.stack || arg.message;
  }
  if (typeof arg === 'object') {
    try { return JSON.stringify(arg); } catch (e) { return String(arg); }
  }
  return String(arg);
}

function formatArgs(args) {
  return args.map(serializeArg).join(' ');
}

console.log = (...args) => {
  origConsoleLog(...args);
  try { broadcastLog(formatArgs(args)); } catch(e){}
};
console.warn = (...args) => {
  origConsoleWarn(...args);
  try { broadcastLog('[WARN] ' + formatArgs(args)); } catch(e){}
};
console.error = (...args) => {
  origConsoleError(...args);
  try { broadcastLog('[ERROR] ' + formatArgs(args)); } catch(e){}
};


// Track what proxy settings the browser was launched with
let browserProxyConfig = null;

// Initialize Puppeteer browser (with proxy support)
async function getBrowser() {
  // Check if we need to restart browser due to proxy settings change
  const currentProxyKey = proxySettings.active 
    ? `${proxySettings.type}:${proxySettings.host}:${proxySettings.port}`
    : 'none';
  
  if (browser && browserProxyConfig !== currentProxyKey) {
    console.log('🌐 Proxy settings changed, restarting browser...');
    await browser.close();
    browser = null;
  }
  
  if (!browser) {
    const launchArgs = ['--no-sandbox', '--disable-setuid-sandbox'];
    
    // Add proxy server if configured
    if (proxySettings.active && proxySettings.host && proxySettings.port) {
      if (proxySettings.type === 'SOCKS5') {
        launchArgs.push(`--proxy-server=socks5://${proxySettings.host}:${proxySettings.port}`);
        // Force remote DNS resolution through proxy
        launchArgs.push('--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost');
      } else {
        launchArgs.push(`--proxy-server=http://${proxySettings.host}:${proxySettings.port}`);
      }
      console.log('🌐 Launching Puppeteer with proxy:', proxySettings.type, proxySettings.host + ':' + proxySettings.port);
    } else {
      console.log('🌐 Launching Puppeteer without proxy');
    }
    
    browser = await puppeteer.launch({
      headless: true,
      args: launchArgs
    });
    browserProxyConfig = currentProxyKey;
  }
  return browser;
}

async function restartBrowser() {
  if (browser) {
    try {
      await browser.close();
    } catch (err) {
      console.warn('Failed to close existing Puppeteer browser during proxy restart:', err.message);
    }
    browser = null;
    browserProxyConfig = null;
  }
}

// Fetch a binary image through a real Puppeteer browser page — used as fallback when
// Cloudflare TLS-fingerprint-blocks the plain https.request path.
async function fetchImageViaPuppeteer(imageUrl, matchingSource) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    const parsedHost = new URL(imageUrl).hostname;

    // Apply source cookies if available (same pattern as HTML page fetching)
    if (matchingSource?.cookies) {
      const pairs = matchingSource.cookies.split(';').map(c => c.trim()).filter(Boolean);
      for (const pair of pairs) {
        const [name, ...rest] = pair.split('=');
        if (!name) continue;
        await page.setCookie({ name: name.trim(), value: rest.join('=').trim(), domain: parsedHost });
      }
    }

    if (matchingSource?.userAgent) {
      await page.setUserAgent(matchingSource.userAgent);
    }

    const response = await page.goto(imageUrl, { waitUntil: 'networkidle0', timeout: 30000 });
    if (!response) throw new Error('No response from Puppeteer page.goto');

    const status = response.status();
    if (status >= 400) throw new Error(`Upstream returned HTTP ${status} via Puppeteer`);

    const contentType = response.headers()['content-type'] || 'image/jpeg';
    if (contentType.includes('text/html')) {
      throw new Error('Cloudflare or other HTML block page returned even via Puppeteer');
    }

    const buffer = await response.buffer();
    await page.close();
    return { buffer, contentType };
  } catch (err) {
    await page.close();
    throw err;
  }
}

// Create proxy agent based on settings
function getProxyAgent(protocol = 'http') {
  if (!proxySettings.active || !proxySettings.host || !proxySettings.port) {
    console.log(`🧭 getProxyAgent: direct fallback because proxy disabled/incomplete [active=${proxySettings.active} host=${proxySettings.host} port=${proxySettings.port}]`);
    return null;
  }

  const auth = proxySettings.user && proxySettings.password 
    ? `${proxySettings.user}:${proxySettings.password}@` 
    : '';
  
  if (proxySettings.type === 'SOCKS5') {
    // CRITICAL: Use 'socks5h://' (with 'h') to force REMOTE DNS resolution
    // This prevents DNS leaks - hostname resolution happens through SOCKS proxy
    const proxyUrl = `socks5h://${auth}${proxySettings.host}:${proxySettings.port}`;
    return new SocksProxyAgent(proxyUrl);
  } else {
    // HTTP proxy
    const proxyUrl = `${proxySettings.type.toLowerCase()}://${auth}${proxySettings.host}:${proxySettings.port}`;
    if (protocol === 'https') {
      return new HttpsProxyAgent(proxyUrl);
    } else {
      return new HttpProxyAgent(proxyUrl);
    }
  }
}

function requireProxyAgent(protocol = 'http') {
  const agent = getProxyAgent(protocol);
  if (proxySettings.active && !agent) {
    throw new Error('Proxy is enabled but no proxy agent could be constructed');
  }
  return agent;
}

// Create proxy agent from provided settings (for testing)
function getProxyAgentFromSettings(settings, protocol = 'http') {
  if (!settings || !settings.host || !settings.port) {
    return null;
  }

  const auth = settings.user && settings.password 
    ? `${settings.user}:${settings.password}@` 
    : '';

  if (settings.type === 'SOCKS5') {
    // Use 'socks5h://' for remote DNS resolution
    const proxyUrl = `socks5h://${auth}${settings.host}:${settings.port}`;
    return new SocksProxyAgent(proxyUrl);
  } else {
    // HTTP proxy
    const proxyUrl = `${settings.type.toLowerCase()}://${auth}${settings.host}:${settings.port}`;
    if (protocol === 'https') {
      return new HttpsProxyAgent(proxyUrl);
    } else {
      return new HttpProxyAgent(proxyUrl);
    }
  }
}

// ─── Anonymity Helpers ─────────────────────────────────────────────────────

// Pool of realistic, current browser User-Agent strings
const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6; rv:136.0) Gecko/20100101 Firefox/136.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:136.0) Gecko/20100101 Firefox/136.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0',
];

function getRandomUA() {
  return UA_POOL[Math.floor(Math.random() * UA_POOL.length)];
}

// Random jitter delay (20–250 ms) before outgoing requests to impede timing correlation
function requestJitter() {
  return new Promise(resolve => setTimeout(resolve, 20 + Math.floor(Math.random() * 250)));
}

// Returns true when the active proxy looks like a local Tor SOCKS5 instance
function isTorProxy() {
  return proxySettings.active &&
    proxySettings.type === 'SOCKS5' &&
    (proxySettings.host === '127.0.0.1' || proxySettings.host === 'localhost') &&
    (String(proxySettings.port) === '9050' || String(proxySettings.port) === '9150');
}

// Send SIGNAL NEWNYM to the Tor control port to rotate the exit circuit.
// Silently no-ops if not using Tor or the control port is unavailable.
function rotateTorCircuit() {
  if (!isTorProxy()) return Promise.resolve();
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.connect(9051, '127.0.0.1', () => {
      socket.write('AUTHENTICATE ""\r\nSIGNAL NEWNYM\r\nQUIT\r\n');
    });
    socket.on('data', () => {});
    socket.on('close', resolve);
    socket.on('error', () => resolve());
    socket.on('timeout', () => { socket.destroy(); resolve(); });
  });
}

let downloadCount = 0;

// Periodic Tor circuit rotation (interval driven by torRotateMins setting)
let torRotateTimer = null;

function resetTorRotateTimer() {
  if (torRotateTimer) clearTimeout(torRotateTimer);
  torRotateTimer = null;
  if (!isTorProxy()) return;
  const ms = (parseInt(proxySettings.torRotateMins) || 0) * 1000;
  if (ms <= 0) return;
  torRotateTimer = setTimeout(() => {
    rotateTorCircuit().then(() => {
      console.log(`\uD83D\uDD04 Tor circuit rotated (${ms / 1000}s timer)`);
      broadcastCircuitRotated();
      resetTorRotateTimer();
    });
  }, ms);
}

// Call after each successful download. Rotates the Tor circuit every N downloads.
function trackDownload() {
  downloadCount++;
  const every = parseInt(proxySettings.torRotateCount) || 0;
  if (every > 0 && downloadCount % every === 0) {
    rotateTorCircuit().then(() => {
      console.log(`\uD83D\uDD04 Tor circuit rotated after ${downloadCount} downloads`);
      broadcastCircuitRotated();
      resetTorRotateTimer();
    });
  }
}

// Returns a User-Agent: random when UA rotation is on, fixed fallback otherwise
function getActiveUA() {
  return proxySettings.uaRotation !== false ? getRandomUA()
    : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';
}

// Returns browser-like headers for image requests to bypass basic bot detection (e.g. Cloudflare)
function buildImageHeaders(hostname) {
  return {
    'User-Agent': getActiveUA(),
    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': `https://${hostname}/`,
    'sec-fetch-dest': 'image',
    'sec-fetch-mode': 'no-cors',
    'sec-fetch-site': 'same-origin',
    'Connection': 'keep-alive'
  };
}

// Jitter respects the user-configured min/max (both 0 = disabled)
function activeRequestJitter() {
  const min = Math.max(0, parseInt(proxySettings.jitterMin) || 0);
  const max = Math.max(0, parseInt(proxySettings.jitterMax) || 0);
  if (min === 0 && max === 0) return Promise.resolve();
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const delay = hi === lo ? lo : lo + Math.floor(Math.random() * (hi - lo));
  return new Promise(resolve => setTimeout(resolve, delay));
}

// ─────────────────────────────────────────────────────────────────────────────

const OUTPUT_DIR = path.join(USER_DATA_BASE, 'output');
const CONFIGS_DIR = path.join(USER_DATA_BASE, 'customConfigs');

// Ensure directories exist
ensureDirectoryExists(OUTPUT_DIR);
ensureDirectoryExists(CONFIGS_DIR);
ensureDirectoryExists(DEFAULT_DOWNLOAD_FOLDER);

// Download folder will be loaded after database init
let downloadFolder = null;

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Prevent browser caching for all responses
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();

    return;
  }

  // Server-Sent Events for live log streaming
  if (req.method === 'GET' && req.url === '/api/server-logs') {
    // set headers for SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    // send existing buffer
    logBuffer.forEach(line => {
      res.write(`data: ${line.replace(/\n/g, '\\ndata: ')}\n\n`);
    });
    // keep the connection open
    sseClients.add(res);
    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // Handle proxy settings endpoint
  if (req.method === 'POST' && req.url === '/api/set-proxy') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const newSettings = JSON.parse(body);
        const forceRestart = newSettings.forceRestart === true;
        const previousProxyKey = proxySettings.active ? `${proxySettings.type}:${proxySettings.host}:${proxySettings.port}` : 'none';
        const nextProxyKey = newSettings.active ? `${newSettings.type}:${newSettings.host}:${newSettings.port}` : 'none';

        proxySettings = newSettings;
        // Persist proxy settings to database
        database.saveSetting('proxySettings', proxySettings);

        if (forceRestart || (browser && browserProxyConfig !== nextProxyKey)) {
          await restartBrowser();
        }

        // Restart the 5-minute rotation timer to reflect new proxy state
        resetTorRotateTimer();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  // Manual Tor circuit rotation endpoint (triggered from Settings UI)
  if (req.method === 'POST' && req.url === '/api/rotate-circuit') {
    rotateTorCircuit().then(() => {
      broadcastCircuitRotated();
      resetTorRotateTimer();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    }).catch(err => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, message: err.message }));
    });
    return;
  }

  // Test proxy connectivity endpoint
  if (req.method === 'POST' && req.url === '/api/test-proxy') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const settings = JSON.parse(body);
        
        // If host and port are not provided, consider it unavailable
        if (!settings.host || !settings.port) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ available: false }));
          return;
        }

        // Try to connect to proxy by making a simple request through it
        // Uses example.com (IANA reference domain) — no tracking, no commercial logging
        const testUrl = 'https://example.com';
        const agent = getProxyAgentFromSettings(settings, 'https');
        
        let responseSent = false;
        
        const testReq = https.get(testUrl, { agent, timeout: 5000 }, (testRes) => {
          if (responseSent) return;
          responseSent = true;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ available: true }));
          testRes.on('data', () => {}); // Drain response
          testRes.on('end', () => {});
        });

        testReq.on('error', (error) => {
          if (responseSent) return;
          responseSent = true;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ available: false }));
        });

        testReq.on('timeout', () => {
          testReq.destroy();
          if (responseSent) return;
          responseSent = true;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ available: false }));
        });
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ available: false, error: error.message }));
      }
    });
    return;
  }

  // ============== DATABASE API ENDPOINTS ==============
  
  // Generate recommended posts based on downloaded posts (uses first configured booru source with auth)
  if (req.method === 'GET' && req.url.startsWith('/api/recommended-posts')) {
    try {
      // Parse query parameters
      const urlParams = new URL(req.url, 'http://localhost').searchParams;
      const favoriteTagsParam = urlParams.get('favoriteTags');
      const favoriteTags = favoriteTagsParam ? favoriteTagsParam.split(',').map(t => t.trim()) : [];
      const filterDownloaded = urlParams.get('filterDownloaded') === 'true';
      const filterAI = urlParams.get('filterAI') === 'true';
      
      // Load booru sources configuration
      let sourceConfig = null;
      let sourceId = null;
      try {
        const sources = database.loadSetting('booru-sources') || [];
        // Find first source with authentication required
        sourceConfig = sources.find(s => s.auth && s.auth.required);
        sourceId = sourceConfig ? sourceConfig.id : null;
      } catch (e) {
        console.warn('Could not load booru sources:', e);
      }
      
      if (!sourceConfig) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No authenticated booru source configured for recommendations' }));
        return;
      }
      
      // Load session credentials for this source
      let userId = '';
      let apiKey = '';
      
      try {
        const session = database.loadSession();
        
        if (session.booruApiCredentials && session.booruApiCredentials[sourceId]) {
          userId = session.booruApiCredentials[sourceId].userId || '';
          apiKey = session.booruApiCredentials[sourceId].apiKey || '';
        }
      } catch (e) {
        console.warn('Could not load session:', e);
      }

      if (!userId || !apiKey) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Missing API credentials for ${sourceConfig.name}. Please set them in the main app.` }));
        return;
      }

      // Get all downloaded posts and calculate tag frequencies
      const downloadedPosts = database.getAllDownloadedPosts();
      const tagCounts = {};
      const totalPosts = downloadedPosts.length;
      
      // tags we want to ignore entirely (don't influence search or scores)
      const ignoredTags = new Set(['female','male','boy','girl','penis','balls']);

      // Calculate tag frequencies with recency bonus
      downloadedPosts.forEach((post, index) => {
        if (Array.isArray(post.tags)) {
          if (index >= 450) return; // Only consider the most recent 450 posts for performance

          // Determine recency bonus (assuming newer posts are at the beginning)
          let recencyBonus = 1.0;
          if (index < 25) {
            recencyBonus = 1.35; // 35% bonus for last 25 downloads
          } else if (index < 50) {
            recencyBonus = 1.20; // 20% bonus for last 50 downloads
          } else if (index < 150) {
            recencyBonus = 1.10; // 10% bonus for last 150 downloads
          }
          
          post.tags.forEach(tag => {
            if (tag && tag.trim()) {
              const normalizedTag = tag.toLowerCase().trim();
              if (ignoredTags.has(normalizedTag)) return;
              tagCounts[normalizedTag] = (tagCounts[normalizedTag] || 0) + recencyBonus;
            }
          });
        }
      });

      // Sort tags by frequency
      const sortedTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([tag, count]) => ({ tag, priority: count }));

      if (sortedTags.length === 0) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ posts: [], message: 'No downloaded posts to generate recommendations from' }));
        return;
      }

      // Generate random tags based on priority (probabilistic selection)
      const maxPriority = sortedTags[0].priority;
      const selectedTags = [];
      const selectedSet = new Set();
      
      while (selectedTags.length < 15 && selectedTags.length < sortedTags.length) {
        for (const tagObj of sortedTags) {
          if (selectedSet.has(tagObj.tag)) continue;
          
          const baseProbability = 50;
          const probability = tagObj === sortedTags[0] 
            ? baseProbability 
            : (tagObj.priority / maxPriority) * baseProbability;
          
          if (Math.random() * 100 < probability) {
            selectedTags.push(tagObj.tag);
            selectedSet.add(tagObj.tag);
            if (selectedTags.length >= 15) break;
          }
        }
      }

      const tagsForSearch = selectedTags.slice(3, 8);
      
      if (tagsForSearch.length === 0) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ posts: [], message: 'Not enough tags to generate recommendations' }));
        return;
      }

      // Add AI filter tags to blacklist if filterAI is enabled
      const tagsString = tagsForSearch.join(' ');
      let finalTagsString = tagsString;
      
      if (filterAI) {
        const aiBlacklistTags = ['ai_generated', 'ai', 'ai_assisted'];
        const blacklistString = aiBlacklistTags.map(tag => `-${tag}`).join(' ');
        finalTagsString = `${tagsString} ${blacklistString}`;
      }

      // Filter general blacklist tags if needed
      if (blacklistTags.length > 0) {
        const blStr = blacklistTags.map(tag => `-${tag}`).join(' ');
        finalTagsString = `${finalTagsString} ${blStr}`;
      }
      
      const limit = 50;
      
      // Build API URL using source configuration
      const apiBaseUrl = sourceConfig.apiUrl || sourceConfig.baseUrl;
      const basePath = sourceConfig.api.basePath;
      
      // Build URL with tags
      let apiUrl = `${apiBaseUrl}${basePath}`;
      
      // Add JSON support if configured
      if (sourceConfig.api.jsonSupport) {
        apiUrl += apiUrl.includes('?') ? '&json=1' : '?json=1';
      }
      
      // Add limit parameter
      const limitParam = sourceConfig.api.limitParam || 'limit';
      apiUrl += `&${limitParam}=${limit}`;
      
      // Add page parameter (page 0)
      const pageParam = sourceConfig.api.pageParam || 'pid';
      apiUrl += `&${pageParam}=0`;
      
      // Add tags parameter
      const tagsParam = sourceConfig.api.tagsParam || 'tags';
      apiUrl += `&${tagsParam}=${encodeURIComponent(finalTagsString)}`;
      
      // Add authentication
      const userIdKey = sourceConfig.auth.userIdKey || 'user_id';
      const apiKeyKey = sourceConfig.auth.apiKeyKey || 'api_key';
      apiUrl += `&${userIdKey}=${encodeURIComponent(userId)}&${apiKeyKey}=${encodeURIComponent(apiKey)}`;

      apiUrl += `&fields=tag_info`;

      // Fetch through proxy
      const parsedUrl = new URL(apiUrl);
      const protocol = https;
      const agent = requireProxyAgent('https');
      const proxyName = `${proxySettings.type} ${proxySettings.host}:${proxySettings.port}`;
      console.log(`📡 tag-info proxy ${parsedUrl.hostname}${parsedUrl.pathname}${parsedUrl.search || ''} [${proxyName}]`);

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {}
      };

      if (agent) {
        options.agent = agent;
      }

      const proxyReq = protocol.request(options, (proxyRes) => {
        let responseBody = '';
        proxyRes.on('data', chunk => {
          responseBody += chunk;
        });
        proxyRes.on('end', () => {
          
          try {
            const posts = JSON.parse(responseBody);
            
            if (!Array.isArray(posts) || posts.length === 0) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ posts: [], message: 'No posts found with these tags' }));
              return;
            }

            // Filter out already downloaded posts by ID if filterDownloaded is enabled
            let filteredByDownload = posts;
            if (filterDownloaded) {
              const downloadedPostIds = new Set(downloadedPosts.map(p => String(p.id)));
              filteredByDownload = posts.filter(post => !downloadedPostIds.has(String(post.id)));
            }

            // Filter out video posts (keep images and GIFs)
            const nonVideoPosts = filteredByDownload.filter(post => {
              const url = (post.file_url || '').toLowerCase();
              const isVideo = url.endsWith('.mp4') || url.endsWith('.webm') || url.endsWith('.mov') ||
                             url.includes('.mp4?') || url.includes('.webm?') || url.includes('.mov?');
              return !isVideo;
            });

            // Filter posts by aspect ratio (keep only portrait/square)
            const filteredPosts = nonVideoPosts.filter(post => {
              if (post.width && post.height) {
                const heightToWidthRatio = post.height / post.width;
                return heightToWidthRatio >= 0.65 && heightToWidthRatio <= 2.5;
              }
              return true;
            });

            if (filteredPosts.length === 0) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ posts: [], message: 'No portrait/square images found' }));
              return;
            }

            // Deduplicate posts with 90%+ similar tags (keep highest score)
            const dedupedPosts = [];
            const processed = new Set();
            
            for (let i = 0; i < filteredPosts.length; i++) {
              if (processed.has(i)) continue;
              
              const postA = filteredPosts[i];
              const tagsA = new Set((postA.tags || '').split(' ').filter(t => t.length > 0).map(t => t.toLowerCase().trim()));
              
              // Find all similar posts
              const similarGroup = [{ post: postA, index: i }];
              
              for (let j = i + 1; j < filteredPosts.length; j++) {
                if (processed.has(j)) continue;
                
                const postB = filteredPosts[j];
                const tagsB = new Set((postB.tags || '').split(' ').filter(t => t.length > 0).map(t => t.toLowerCase().trim()));
                
                // Calculate Jaccard similarity (intersection / union)
                const intersection = new Set([...tagsA].filter(tag => tagsB.has(tag)));
                const union = new Set([...tagsA, ...tagsB]);
                const similarity = intersection.size / union.size;
                
                if (similarity >= 0.9) {
                  similarGroup.push({ post: postB, index: j });
                  processed.add(j);
                }
              }
              
              // Keep only the post with the highest score from the group
              const bestPost = similarGroup.reduce((best, current) => 
                (current.post.score || 0) > (best.post.score || 0) ? current : best
              );
              
              dedupedPosts.push(bestPost.post);
              processed.add(bestPost.index);
            }
            
            console.log(`Deduplicated similar posts: ${filteredPosts.length} -> ${dedupedPosts.length} posts`);

            // Calculate match scores based on downloaded tags (ignoredTags defined earlier)
            dedupedPosts.forEach(post => {
              let matchScore = 0;
              const matchedTags = [];
              const postTags = post.tags ? post.tags.split(' ').filter(t => t.length > 0) : [];
              
              postTags.forEach(tag => {
                const normalizedTag = tag.toLowerCase().trim();
                if (ignoredTags.has(normalizedTag)) return;
                if (tagCounts[normalizedTag]) {
                  matchScore += tagCounts[normalizedTag];
                  matchedTags.push(normalizedTag);
                }
              });
              
              post.matchScore = matchScore;
              post.matchedTags = matchedTags;
            });

            // Use favorite tags from query parameter
            dedupedPosts.forEach(post => {
              const postTags = post.tags ? post.tags.split(' ').map(t => t.toLowerCase().trim()) : [];
              const favoriteTagCount = postTags.filter(tag => favoriteTags.includes(tag)).length;
              post.favoriteTagCount = favoriteTagCount;
            });

            // Normalize and calculate weighted scores
            const maxMatchCount = Math.max(...dedupedPosts.map(p => p.matchedTags ? p.matchedTags.length : 0), 1);
            const maxScore = Math.max(...dedupedPosts.map(p => p.score || 0), 1);
            const maxFavoriteCount = Math.max(...dedupedPosts.map(p => p.favoriteTagCount || 0), 1);
            
            // Calculate date-based recency bonus (up to 40%)
            const postDates = dedupedPosts
              .map(p => p.created_at ? new Date(p.created_at).getTime() : 0)
              .filter(d => d > 0);
            const newestDate = postDates.length > 0 ? Math.max(...postDates) : Date.now();
            const oldestDate = postDates.length > 0 ? Math.min(...postDates) : Date.now();
            const dateRange = newestDate - oldestDate || 1;

            dedupedPosts.forEach(post => {
              const normalizedMatchCount = (post.matchedTags ? post.matchedTags.length : 0) / maxMatchCount;
              const normalizedScore = (post.score || 0) / maxScore;
              const normalizedFavoriteCount = (post.favoriteTagCount || 0) / maxFavoriteCount;
              
              // Calculate recency bonus (0 to 0.4 based on post date)
              let recencyBonus = 0;
              if (post.created_at) {
                const postDate = new Date(post.created_at).getTime();
                const normalizedRecency = (postDate - oldestDate) / dateRange;
                recencyBonus = normalizedRecency * 0.4; // Up to 40% bonus for newest posts
              }
              
              let weightedScore = (normalizedMatchCount * 0.7) + (normalizedScore * 0.3) + (normalizedFavoriteCount * 0.6) + recencyBonus;
              
              // Apply 60% penalty for posts with more than 35 non-ignored tags
              const postTags = post.tags ? post.tags.split(' ').filter(t => t.length > 0) : [];
              const significantTagsCount = postTags.filter(t => !ignoredTags.has(t.toLowerCase().trim())).length;
              if (significantTagsCount > 35) {
                weightedScore *= 0.4; // 60% penalty
              }
              
              post.weightedScore = weightedScore;
            });

            // Sort by weighted score
            dedupedPosts.sort((a, b) => (b.weightedScore || 0) - (a.weightedScore || 0));

            // Return formatted results
            const results = dedupedPosts.map(post => {
              const postTags = post.tags ? post.tags.split(' ').filter(t => t.length > 0) : [];
              
              // Build detailed tag influence breakdown
              const tagInfluences = {
                favorite_tags: [],
                commonly_downloaded_tags: [],
                both: [] // Tags that are both favorite and commonly downloaded
              };
              
              postTags.forEach(tag => {
                const normalizedTag = tag.toLowerCase().trim();
                if (ignoredTags.has(normalizedTag)) return;
                const isFavorite = favoriteTags.includes(normalizedTag);
                const isCommon = tagCounts[normalizedTag] !== undefined;
                const tagFrequency = tagCounts[normalizedTag] || 0;
                
                if (isFavorite && isCommon) {
                  tagInfluences.both.push({
                    tag: tag,
                    frequency: tagFrequency,
                    occurrence_count: Math.floor(tagFrequency) // Approximate count considering recency bonuses
                  });
                } else if (isFavorite) {
                  tagInfluences.favorite_tags.push(tag);
                } else if (isCommon) {
                  tagInfluences.commonly_downloaded_tags.push({
                    tag: tag,
                    frequency: tagFrequency,
                    occurrence_count: Math.floor(tagFrequency)
                  });
                }
              });
              
              return {
                id: post.id,
                image_url: post.preview_url || post.sample_url || post.file_url,
                high_quality_url: post.file_url,
                sample_url: post.sample_url,
                artist: post.tag_info ? post.tag_info : [],
                tags: postTags,
                score: post.score,
                match_score: post.matchScore,
                matched_tags: post.matchedTags,
                favorite_tag_count: post.favoriteTagCount,
                weighted_score: post.weightedScore,
                width: post.width,
                height: post.height,
                tag_influences: tagInfluences
              };
            });

            // filter out posts the user already downloaded (always)
            const downloadedPostIds = new Set(downloadedPosts.map(p => String(p.id)));
            const filteredResults = results.filter(r => !downloadedPostIds.has(String(r.id)));

            // log any removed ids for debugging
            if (filteredResults.length !== results.length) {
              const removedIds = results
                .map(r => String(r.id))
                .filter(id => downloadedPostIds.has(id));
              console.log(`🔎 removed downloaded IDs from recommendations: ${removedIds.join(', ')}`);
            }

            // if nothing left after removing downloaded items, return early
            if (filteredResults.length === 0) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                posts: [],
                searched_tags: tagsForSearch,
                total_results: 0,
                message: 'All recommended posts have already been downloaded'
              }));
              return;
            }

            // Select first 2 posts and 2 random posts from positions 3-20
            let selectedPosts = filteredResults.slice(0, 2);
            if (filteredResults.length > 2) {
              const candidatePosts = filteredResults.slice(2, Math.min(20, filteredResults.length));
              // Randomly select 2 posts from candidates
              const shuffled = candidatePosts.sort(() => Math.random() - 0.5);
              const randomPosts = shuffled.slice(0, Math.min(2, candidatePosts.length));
              selectedPosts = selectedPosts.concat(randomPosts);
            }

            // sanity check: none of the selected posts should be in downloaded set
            const bad = selectedPosts.filter(p => downloadedPostIds.has(String(p.id)));
            if (bad.length > 0) {
              console.warn('⚠️ selectedPosts contains already-downloaded ids:', bad.map(p=>p.id));
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              posts: selectedPosts,
              searched_tags: tagsForSearch,
              total_results: selectedPosts.length
            }));
          } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to parse API response', message: error.message }));
          }
        });
      });

      proxyReq.on('error', (error) => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Failed to fetch from ${sourceConfig.name} API`, message: error.message }));
      });

      proxyReq.end();
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  
  // Get post count (must be before generic /api/db/posts/ route)
  if (req.method === 'GET' && req.url === '/api/db/posts/count') {
    try {
      const count = database.getDownloadedPostCount();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ count }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // Search posts (must be before generic /api/db/posts/ route)
  if (req.method === 'GET' && req.url.startsWith('/api/db/posts/search?')) {
    try {
      const urlParams = new URL(req.url, 'http://localhost').searchParams;
      const query = urlParams.get('q');
      const posts = database.searchDownloadedPosts(query || '');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(posts));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // Get posts by artist (must be before generic /api/db/posts/ route)
  if (req.method === 'GET' && req.url.startsWith('/api/db/posts/artist/')) {
    try {
      const artist = decodeURIComponent(req.url.replace('/api/db/posts/artist/', ''));
      const posts = database.getDownloadedPostsByArtist(artist);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(posts));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // Bulk import posts (must be before generic /api/db/posts/ route)
  if (req.method === 'POST' && req.url === '/api/db/posts/bulk') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const posts = JSON.parse(body);
        const count = database.bulkImportPosts(posts);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, imported: count }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // Get all downloaded posts
  if (req.method === 'GET' && req.url === '/api/db/posts') {
    try {
      const posts = database.getAllDownloadedPosts();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(posts));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // Get single downloaded post (generic route - must be after specific routes)
  if (req.method === 'GET' && req.url.startsWith('/api/db/posts/')) {
    try {
      const id = decodeURIComponent(req.url.replace('/api/db/posts/', ''));
      const post = database.getDownloadedPost(id);
      if (post) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(post));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Post not found' }));
      }
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // Save downloaded post
  if (req.method === 'POST' && req.url === '/api/db/posts') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const post = JSON.parse(body);
        database.saveDownloadedPost(post);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // Delete downloaded post
  if (req.method === 'DELETE' && req.url.startsWith('/api/db/posts/')) {
    try {
      const id = decodeURIComponent(req.url.replace('/api/db/posts/', ''));
      database.removeDownloadedPost(id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // Save tabs
  if (req.method === 'POST' && req.url === '/api/db/tabs') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const { tabs, activeTabId, isViewingDownloadsGallery, isViewingScroller, downloadsSearchText } = JSON.parse(body);
        database.saveTabs(tabs, activeTabId, isViewingDownloadsGallery, isViewingScroller, downloadsSearchText);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // Load tabs
  if (req.method === 'GET' && req.url === '/api/db/tabs') {
    try {
      const result = database.loadTabs();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // Save setting
  if (req.method === 'POST' && req.url === '/api/db/settings') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const { key, value } = JSON.parse(body);
        database.saveSetting(key, value);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // Load setting
  if (req.method === 'GET' && req.url.startsWith('/api/db/settings/')) {
    try {
      const key = decodeURIComponent(req.url.replace('/api/db/settings/', ''));
      const value = database.loadSetting(key);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ value }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // ============== END DATABASE API ENDPOINTS ==============

  // Proxy image downloads via GET (for img tags in booru gallery)
  if (req.method === 'GET' && (req.url.startsWith('/proxy-image?') || req.url === '/proxy-image')) {
    (async () => {
    try {
      const urlParams = new URL(req.url, 'http://localhost').searchParams;
      const imageUrl = urlParams.get('url');

      if (!imageUrl) {
        console.log('GET IMAGE request URL: MISSING - Aborting!');
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing URL parameter' }));
        return;
      } else {
        console.log('GET IMAGE request URL:', imageUrl);
      }

      await activeRequestJitter();

      const parsedUrl = new URL(imageUrl);
      const protocol = parsedUrl.protocol === 'http:' ? http : https;
      const agent = requireProxyAgent(parsedUrl.protocol === 'http:' ? 'http' : 'https');
      const proxyName = `${proxySettings.type} ${proxySettings.host}:${proxySettings.port}`;

      const headers = buildImageHeaders(parsedUrl.hostname);
      if (!headers.Host && !headers.host) {
        headers.Host = parsedUrl.host;
      }
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'http:' ? 80 : 443),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers
      };
      if (agent) {
        options.agent = agent;
      } else {
      }
      // Forward Range header so video seeking (HTTP 206 Partial Content) works
      if (req.headers['range']) {
        options.headers['Range'] = req.headers['range'];
      }
      // override UA/cookies if a matching source specifies them
      try {
        const sources = database.loadSetting('booru-sources') || [];
        const matching = sources.find(source => {
          try {
            const sUrl = new URL(source.baseUrl);
            return parsedUrl.hostname.includes(sUrl.hostname);
          } catch (e) {
            return false;
          }
        });
        if (matching?.userAgent) {
          options.headers['User-Agent'] = matching.userAgent;
        }
        if (matching?.cookies) {
          options.headers['Cookie'] = matching.cookies;
        }
      } catch (e) {
        console.warn('Error applying headers to image proxy request', e);
      }

      const proxyReq = protocol.request(options, (proxyRes) => {
        const contentType = proxyRes.headers['content-type'] || '';
        const isHtml = contentType.includes('text/html');

        // Treat any error status OR an HTML body (e.g. Cloudflare 200 challenge page) as an error
        if (proxyRes.statusCode >= 400 || isHtml) {
          let errorBody = '';
          proxyRes.on('data', chunk => errorBody += chunk);
          proxyRes.on('end', async () => {
            const isCfBlock = isHtml ||
              (errorBody.includes('Cloudflare') &&
              (errorBody.includes('blocked') || errorBody.includes('Attention Required') || errorBody.includes('cf-error')));

            if (isCfBlock) {
              // Fall back to Puppeteer to bypass TLS fingerprinting
              console.log('🖼️ Cloudflare block detected — retrying via Puppeteer:', parsedUrl.hostname);
              try {
                // Resolve matching source so Puppeteer can apply cookies/UA
                let matchingSource = null;
                try {
                  const sources = database.loadSetting('booru-sources') || [];
                  matchingSource = sources.find(s => {
                    try { return parsedUrl.hostname.includes(new URL(s.baseUrl).hostname); } catch { return false; }
                  }) || null;
                } catch { /* ignore */ }
                const { buffer, contentType } = await fetchImageViaPuppeteer(imageUrl, matchingSource);
                res.writeHead(200, {
                  'Content-Type': contentType,
                  'Content-Length': buffer.length,
                  'Access-Control-Allow-Origin': '*',
                  'Cache-Control': 'public, max-age=86400'
                });
                res.end(buffer);
              } catch (puppeteerErr) {
                console.error('🖼️ Puppeteer fallback also failed:', puppeteerErr.message);
                res.writeHead(403, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({
                  error: 'Cloudflare blocked',
                  status: 403,
                  message: `Cloudflare is blocking ${parsedUrl.hostname} even via browser. Try adding site cookies in Settings → Booru Sources.`
                }));
              }
              return;
            }

            console.error('🖼️ Upstream image error', proxyRes.statusCode, errorBody.slice(0, 200));
            res.writeHead(proxyRes.statusCode, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({
              error: 'Proxy image failed',
              status: proxyRes.statusCode,
              message: errorBody
            }));
          });
          return;
        }

        // Stream binary data directly for successful responses
        const headers = {
          'Content-Type': proxyRes.headers['content-type'] || 'image/jpeg',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=86400'
        };
        // Only set Content-Length if it exists (some servers use chunked encoding)
        if (proxyRes.headers['content-length']) {
          headers['Content-Length'] = proxyRes.headers['content-length'];
        }
        // Forward range-related headers so the browser can seek in videos
        if (proxyRes.headers['accept-ranges']) {
          headers['Accept-Ranges'] = proxyRes.headers['accept-ranges'];
        }
        if (proxyRes.headers['content-range']) {
          headers['Content-Range'] = proxyRes.headers['content-range'];
        }
        res.writeHead(proxyRes.statusCode, headers);
        proxyRes.pipe(res);
      });

      proxyReq.on('error', (error) => {
        console.error('🖼️ Proxy image request error:', error);
        res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'Proxy image request failed', message: error.message }));
      });

      proxyReq.end();
    } catch (error) {
      console.error('🖼️ Proxy image endpoint error:', error);
      res.writeHead(400, { 'Content-Type': 'image/svg+xml' });
      res.end('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23333"/></svg>');
    }
    })();
    return;
  }

  // Proxy image downloads through configured proxy (for Booru images)
  if (req.method === 'POST' && req.url === '/api/proxy-image') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const { url: imageUrl } = JSON.parse(body);

        await activeRequestJitter();

        const parsedUrl = new URL(imageUrl);
        const protocol = parsedUrl.protocol === 'http:' ? http : https;
        const agent = requireProxyAgent(parsedUrl.protocol === 'http:' ? 'http' : 'https');
        const proxyName = `${proxySettings.type} ${proxySettings.host}:${proxySettings.port}`;
        console.log(`📡 proxy-image proxy ${parsedUrl.hostname}${parsedUrl.pathname}${parsedUrl.search || ''} [${proxyName}]`);

        const options = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (parsedUrl.protocol === 'http:' ? 80 : 443),
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'GET',
          headers: buildImageHeaders(parsedUrl.hostname)
        };
        // inject cookies/UA if configured for a matching source
        try {
          const sources = database.loadSetting('booru-sources') || [];
          const matching = sources.find(source => {
            try {
              const sUrl = new URL(source.baseUrl);
              return parsedUrl.hostname.includes(sUrl.hostname);
            } catch (e) {
              return false;
            }
          });
          if (matching?.userAgent) {
            options.headers['User-Agent'] = matching.userAgent;
          }
          if (matching?.cookies) {
            options.headers['Cookie'] = matching.cookies;
          }
        } catch (e) {
          console.warn('Error injecting cookies into image proxy request', e);
        }

        if (agent) {
          options.agent = agent;
        }

        const proxyReq = protocol.request(options, (proxyRes) => {
          // Stream binary data directly
          res.writeHead(proxyRes.statusCode, {
            'Content-Type': proxyRes.headers['content-type'] || 'image/jpeg',
            'Content-Length': proxyRes.headers['content-length'],
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=86400'
          });
          proxyRes.pipe(res);
        });

        proxyReq.on('error', (error) => {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Image proxy failed', message: error.message }));
        });

        proxyReq.end();
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request', message: error.message }));
      }
    });
    return;
  }

  // Proxy external API requests through configured proxy (for Booru APIs)
  if (req.method === 'POST' && req.url === '/api/proxy-fetch') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const { url: fetchUrl, method = 'GET', headers = {}, body: fetchBody } = JSON.parse(body);

        await activeRequestJitter();

        const parsedUrl = new URL(fetchUrl);
        const protocol = parsedUrl.protocol === 'http:' ? http : https;
        const agent = requireProxyAgent(parsedUrl.protocol === 'http:' ? 'http' : 'https');
        const proxyName = `${proxySettings.type} ${proxySettings.host}:${proxySettings.port}`;
        console.log('GET FETCH request URL:', fetchUrl);

        // if no cookie header provided and a source config matches this host, inject configured cookies
        try {
          const sources = database.loadSetting('booru-sources') || [];
          const matching = sources.find(source => {
            try {
              const sUrl = new URL(source.baseUrl);
              return parsedUrl.hostname.includes(sUrl.hostname);
            } catch (e) {
              return false;
            }
          });
          if (matching?.cookies && !headers['Cookie'] && !headers['cookie']) {
            headers['Cookie'] = matching.cookies;
          }
          if (matching?.userAgent && !headers['User-Agent'] && !headers['user-agent']) {
            headers['User-Agent'] = matching.userAgent;
          }
        } catch (e) {
          console.warn('Error injecting headers into proxy-fetch options', e);
        }

        if (!headers['User-Agent'] && !headers['user-agent']) {
          headers['User-Agent'] = getActiveUA();
        }

        const options = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (parsedUrl.protocol === 'http:' ? 80 : 443),
          path: parsedUrl.pathname + parsedUrl.search,
          method: method,
          headers: headers
        };

        if (!headers.Host && !headers.host) {
          options.headers.Host = parsedUrl.host;
        }

        if (agent) {
          options.agent = agent;
        }

        const proxyReq = protocol.request(options, (proxyRes) => {
          const responseChunks = [];
          proxyRes.on('data', chunk => {
            responseChunks.push(chunk);
          });
          proxyRes.on('end', () => {
            const responseBody = Buffer.concat(responseChunks);
            const responseHeaders = {
              'Content-Type': proxyRes.headers['content-type'] || 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Expose-Headers': 'X-Proxy-Content-Length'
            };
            if (proxyRes.headers['content-length']) {
              responseHeaders['X-Proxy-Content-Length'] = proxyRes.headers['content-length'];
            }
            res.writeHead(proxyRes.statusCode, responseHeaders);
            res.end(responseBody);
          });
        });

        proxyReq.on('error', (error) => {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Proxy fetch failed', message: error.message }));
        });

        if (fetchBody) {
          proxyReq.write(fetchBody);
        }
        proxyReq.end();
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request', message: error.message }));
      }
    });
    return;
  }

  // Backend artist tag lookup for booru sources
  if (req.method === 'POST' && req.url === '/api/booru/artist-tags') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const { sourceId, tags, userId, apiKey } = JSON.parse(body);
        if (!sourceId || !tags) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'sourceId and tags are required' }));
          return;
        }

        const sources = database.loadSetting('booru-sources') || [];
        const sourceConfig = sources.find(source => source.id === sourceId);
        if (!sourceConfig) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Source not found: ${sourceId}` }));
          return;
        }

        if (!sourceConfig.artist?.tagApiUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Artist tag API not configured for this source' }));
          return;
        }

        let tagList = [];
        if (Array.isArray(tags)) {
          tagList = tags.filter(t => typeof t === 'string' && t.trim().length > 0);
        } else if (typeof tags === 'string' && tags.trim().length > 0) {
          tagList = tags.trim().split(/\s+/).filter(t => t.length > 0);
        }

        if (tagList.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No tags provided for artist lookup' }));
          return;
        }

        const tagSeparator = sourceConfig.artist.tagSeparator || ' ';
        const encodedTags = encodeURIComponent(tagList.join(tagSeparator));
        let apiUrl = sourceConfig.artist.tagApiUrl;
        if (apiUrl.includes('{tags}')) {
          apiUrl = apiUrl.replace('{tags}', encodedTags);
        } else {
          apiUrl += apiUrl.includes('?') ? `&names=${encodedTags}` : `?names=${encodedTags}`;
        }

        if (!/^https?:\/\//i.test(apiUrl)) {
          const apiBase = sourceConfig.apiUrl || sourceConfig.baseUrl;
          apiUrl = `${apiBase.replace(/\/$/, '')}/${apiUrl.replace(/^\//, '')}`;
        }

        const resolvedUserId = userId || sourceConfig.auth?.userId || '';
        const resolvedApiKey = apiKey || sourceConfig.auth?.apiKey || '';
        if (sourceConfig.auth?.required) {
          if (!resolvedUserId || !resolvedApiKey) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'API credentials required for this source' }));
            return;
          }
          if (sourceConfig.auth.userIdKey && !new RegExp(`[?&]${sourceConfig.auth.userIdKey}=`).test(apiUrl)) {
            apiUrl += apiUrl.includes('?') ? `&${sourceConfig.auth.userIdKey}=${encodeURIComponent(resolvedUserId)}` : `?${sourceConfig.auth.userIdKey}=${encodeURIComponent(resolvedUserId)}`;
          }
          if (sourceConfig.auth.apiKeyKey && !new RegExp(`[?&]${sourceConfig.auth.apiKeyKey}=`).test(apiUrl)) {
            apiUrl += apiUrl.includes('?') ? `&${sourceConfig.auth.apiKeyKey}=${encodeURIComponent(resolvedApiKey)}` : `?${sourceConfig.auth.apiKeyKey}=${encodeURIComponent(resolvedApiKey)}`;
          }
        }

        if (sourceConfig.safeMode?.required && sourceConfig.safeMode.url) {
          await new Promise((resolve, reject) => {
            const safeModeUrl = new URL(sourceConfig.safeMode.url);
            const protocol = safeModeUrl.protocol === 'http:' ? http : https;
            const agent = requireProxyAgent(safeModeUrl.protocol === 'http:' ? 'http' : 'https');
            const options = {
              hostname: safeModeUrl.hostname,
              port: safeModeUrl.port || (safeModeUrl.protocol === 'http:' ? 80 : 443),
              path: safeModeUrl.pathname + safeModeUrl.search,
              method: 'GET',
              headers: {
                'User-Agent': sourceConfig.userAgent || getActiveUA(),
                'Host': safeModeUrl.host
              },
              agent
            };
            const safeReq = protocol.request(options, safeRes => {
              safeRes.on('data', () => {});
              safeRes.on('end', resolve);
            });
            safeReq.on('error', reject);
            safeReq.end();
          });
        }

        const parsedUrl = new URL(apiUrl);
        const protocol = parsedUrl.protocol === 'http:' ? http : https;
        const agent = requireProxyAgent(parsedUrl.protocol === 'http:' ? 'http' : 'https');
        const headers = {
          'User-Agent': sourceConfig.userAgent || getActiveUA(),
          'Host': parsedUrl.host
        };
        if (sourceConfig.cookies) {
          headers['Cookie'] = sourceConfig.cookies;
        }

        const options = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (parsedUrl.protocol === 'http:' ? 80 : 443),
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'GET',
          headers,
          agent
        };

        const proxyReq = protocol.request(options, (proxyRes) => {
          const responseChunks = [];
          proxyRes.on('data', chunk => responseChunks.push(chunk));
          proxyRes.on('end', () => {
            const responseBody = Buffer.concat(responseChunks).toString('utf8');
            if (proxyRes.statusCode < 200 || proxyRes.statusCode >= 300) {
              res.writeHead(proxyRes.statusCode, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              });
              res.end(JSON.stringify({ error: 'Artist tag API request failed', message: responseBody }));
              return;
            }

            let parsed;
            try {
              parsed = JSON.parse(responseBody);
            } catch (error) {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid JSON from artist tag API', message: error.message }));
              return;
            }

            const tagObjects = parsed.tag ?? parsed.tags ?? parsed;
            const normalizeArray = (value) => {
              if (Array.isArray(value)) return value;
              if (value && typeof value === 'object') return [value];
              return [];
            };

            const items = normalizeArray(tagObjects);
            const fieldPath = sourceConfig.artist.tagTypeKeyPath || 'type';
            const artistTypeValues = String(sourceConfig.artist.artistTypeValue || '1').split(',').map(v => v.trim()).filter(v => v.length > 0);
            const artists = [];

            const resolvePath = (obj, path) => {
              if (!obj || typeof path !== 'string' || path.trim() === '') return undefined;
              const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
              let current = obj;
              for (const part of parts) {
                if (!current || typeof current !== 'object') return undefined;
                current = current[part];
              }
              return current;
            };

            for (const tagItem of items) {
              const rawType = resolvePath(tagItem, fieldPath);
              const typeValue = rawType != null ? String(rawType) : '';
              if (artistTypeValues.includes(typeValue)) {
                const artistName = String(tagItem.name ?? tagItem.tag ?? '').trim();
                if (artistName.length > 0) {
                  artists.push(artistName);
                }
              }
            }

            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({ artists }));
          });
        });

        proxyReq.on('error', (error) => {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Artist tag lookup failed', message: error.message }));
        });

        proxyReq.end();
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid artist lookup request', message: error.message }));
      }
    });
    return;
  }

  // Stable Diffusion API proxy disabled
  if (req.url.startsWith('/api/sd/')) {
    res.writeHead(404, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({
      error: 'Stable Diffusion support is disabled',
      message: 'The Stable Diffusion API proxy is disabled in this build.'
    }));
    return;
  }

  /*
  const sdPath = req.url.replace('/api/sd', '');
  const options = {
    hostname: '127.0.0.1',
    port: 7860,
    path: sdPath,
    method: req.method,
    headers: {
      'Content-Type': 'application/json'
    }
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (error) => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to connect to Stable Diffusion API', message: error.message }));
  });

  if (req.method === 'POST') {
    req.pipe(proxyReq);
  } else {
    proxyReq.end();
  }
  return;
  */

  if (req.method === 'POST' && req.url === '/save-image') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const { image, filename } = JSON.parse(body);
        const base64Data = image.replace(/^data:image\/png;base64,/, '');
        const filepath = path.join(OUTPUT_DIR, filename);
        
        fs.writeFileSync(filepath, base64Data, 'base64');
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, filepath: filename }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/save-session') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const sessionData = JSON.parse(body);
        database.saveSession(sessionData);
        // update server-side blacklist tags so recommendation endpoint uses the same list
        if (sessionData.blacklistTags && Array.isArray(sessionData.blacklistTags)) {
          blacklistTags = sessionData.blacklistTags.slice();
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
  } else if (req.method === 'GET' && req.url === '/load-session') {
    try {
      const sessionData = database.loadSession();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sessionData));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
  } else if (req.method === 'GET' && req.url === '/get-checkpoints') {
    try {
      const checkpointPath = 'temp sd Path for checkpoints';
      if (fs.existsSync(checkpointPath)) {
        const files = fs.readdirSync(checkpointPath)
          .filter(file => file.endsWith('.safetensors') || file.endsWith('.ckpt'))
          .sort();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(files));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(['sd_xl_base_1.0.safetensors', 'v1-5-pruned-emaonly.safetensors']));
      }
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([]));
    }
  } else if (req.method === 'GET' && req.url === '/list-configs') {
    try {
      const files = fs.readdirSync(CONFIGS_DIR)
        .filter(file => file.endsWith('.json'))
        .sort();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(files));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
  } else if (req.method === 'GET' && req.url.startsWith('/load-config/')) {
    const filename = decodeURIComponent(req.url.split('/load-config/')[1]);
    const filepath = path.join(CONFIGS_DIR, filename);
    
    fsPromises.readFile(filepath, 'utf8')
      .then((content) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(content);
      })
      .catch((error) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      });
  } else if (req.method === 'POST' && req.url === '/save-config') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const { filename, content } = JSON.parse(body);
        const filepath = path.join(CONFIGS_DIR, filename);
        fs.writeFileSync(filepath, content, 'utf8');
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
  } else if (req.method === 'DELETE' && req.url.startsWith('/delete-config/')) {
    const filename = decodeURIComponent(req.url.split('/delete-config/')[1]);
    const filepath = path.join(CONFIGS_DIR, filename);
    
    fsPromises.unlink(filepath)
      .then(() => {
        // Force Windows to sync filesystem
        return new Promise(resolve => setTimeout(resolve, 50));
      })
      .then(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      })
      .catch((error) => {
        if (error.code === 'ENOENT') {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'File not found' }));
        } else {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
      });
  } else if (req.method === 'GET' && req.url === '/check-sd-status') {
    // Stable Diffusion status checks are disabled
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({ ready: false, status: 'disabled' }));
  } else if (req.method === 'GET' && req.url.startsWith('/proxy-booru')) {
  /*
    // Check if Stable Diffusion is responding
    const sdHttp = require('http');
    const sdReq = sdHttp.get('http://localhost:7860', (sdRes) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ready: true, status: 'running' }));
    });
    
    sdReq.on('error', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ready: false, status: 'starting' }));
    });
    
    sdReq.setTimeout(1000);
  */
  } else if (req.method === 'GET' && req.url.startsWith('/proxy-booru')) {
    // Proxy booru API requests to avoid CORS
    
    const urlParams = new url.URL(req.url, `http://localhost:${PORT}`);
    const targetUrl = urlParams.searchParams.get('url');
    
    console.log('Target URL:', targetUrl);
    
    if (!targetUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing url parameter' }));
      return;
    }
    
    // Check if this is an HTML page request (contains s=view) vs API request (contains json=1)
    const isHtmlPage = targetUrl.includes('s=view') && targetUrl.includes('page=post');
    
    if (isHtmlPage) {

      // Use Puppeteer for HTML pages to bypass Cloudflare
      getBrowser().then(async (browser) => {
        const page = await browser.newPage();
        
        try {
          // Check if source requires safe mode based on configuration
          try {
            const sources = database.loadSetting('booru-sources') || [];
            const matchingSource = sources.find(source => {
              // Match by checking if targetUrl contains the source's baseUrl domain
              try {
                const sourceUrlObj = new url.URL(source.baseUrl);
                return targetUrl.includes(sourceUrlObj.hostname);
              } catch (e) {
                return false;
              }
            });
            
            if (matchingSource?.safeMode?.required) {
              console.log(`Safe mode required for ${matchingSource.name} - setting safe mode first`);
              await page.goto(matchingSource.safeMode.url, {
                waitUntil: 'networkidle0',
                timeout: 30000
              });
              // Use configured delay or default to 500ms
              const delay = matchingSource.safeMode.delay || 500;
              await new Promise(resolve => setTimeout(resolve, delay));
            }

            // set any configured cookies on the page before navigating to target
            if (matchingSource?.cookies) {
              try {
                const hostname = new URL(targetUrl).hostname;
                const pairs = matchingSource.cookies.split(';').map(c=>c.trim()).filter(Boolean);
                for (const pair of pairs) {
                  const [name, ...rest] = pair.split('=');
                  if (!name) continue;
                  const value = rest.join('=').trim();
                  await page.setCookie({ name: name.trim(), value: value, domain: hostname });
                }
              } catch (cookieErr) {
                console.warn('Failed to set cookies for proxy-booru page:', cookieErr);
              }
            }
            // set custom user-agent if provided
            if (matchingSource?.userAgent) {
              try {
                await page.setUserAgent(matchingSource.userAgent);
              } catch (uaErr) {
                console.warn('Failed to set userAgent for proxy-booru page:', uaErr);
              }
            }
          } catch (configErr) {
            console.warn('Could not load source config for safe mode:', configErr);
          }
          
          await page.goto(targetUrl, { 
            waitUntil: 'networkidle0',
            timeout: 30000
          });
          
          // Wait a bit for any dynamic content
          await new Promise(resolve => setTimeout(resolve, 100));
          
          const html = await page.content();
          
          await page.close();

          // Detect CAPTCHA pages and return an explicit JSON error so the client can show a toast
          const captchaPattern = /Please enter the CAPTCHA to continue/i;
          if (captchaPattern.test(html)) {
            res.writeHead(403, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'captcha', message: 'Blocked by CAPTCHA' }));
            return;
          }
          
          res.writeHead(200, { 
            'Content-Type': 'text/html',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(html);
        } catch (error) {
          console.error('Puppeteer error:', error.message);
          await page.close();
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to fetch page', message: error.message }));
        }
      }).catch(error => {
        console.error('Browser error:', error.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to initialize browser', message: error.message }));
      });
    } else {
      // Use regular HTTP for API requests (with proxy support)
      
      // Detect if this is a Reddit request
      const isReddit = targetUrl.includes('reddit.com');
      
      // Follow redirects with proxy support
      const makeRequest = (reqUrl) => {
        const parsedReqUrl = new URL(reqUrl);
        const isHttps = parsedReqUrl.protocol === 'https:';
        const module = isHttps ? https : http;
        const agent = requireProxyAgent(isHttps ? 'https' : 'http');
        const proxyName = `${proxySettings.type} ${proxySettings.host}:${proxySettings.port}`;
        console.log(`📡 proxy-booru proxy ${parsedReqUrl.hostname}${parsedReqUrl.pathname}${parsedReqUrl.search || ''} [${proxyName}]`);
        
        const options = {
          hostname: parsedReqUrl.hostname,
          port: parsedReqUrl.port || (isHttps ? 443 : 80),
          path: parsedReqUrl.pathname + parsedReqUrl.search,
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        };
        // if we matched a source earlier, include its cookies or UA header
        if (isReddit === false) {
          const sources = database.loadSetting('booru-sources') || [];
          const matchingSource = sources.find(source => {
            try {
              const sourceUrlObj = new url.URL(source.baseUrl);
              return targetUrl.includes(sourceUrlObj.hostname);
            } catch (e) {
              return false;
            }
          });
          if (matchingSource?.cookies) {
            options.headers['Cookie'] = matchingSource.cookies;
          }
          if (matchingSource?.userAgent) {
            options.headers['User-Agent'] = matchingSource.userAgent;
          }
        }
        
        if (agent) {
          options.agent = agent;
          console.log('📡 proxy-booru API request through proxy:', parsedReqUrl.hostname);
        }
        
        const proxyReq = module.request(options, (proxyRes) => {
          // Handle redirects
          if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
            console.log('Following redirect to:', proxyRes.headers.location);
            const redirectUrl = new URL(proxyRes.headers.location, reqUrl).href;
            proxyRes.resume(); // Drain response
            makeRequest(redirectUrl);
            return;
          }
          
          let data = '';
          proxyRes.on('data', chunk => data += chunk);
          proxyRes.on('end', () => {
            console.log('Proxy response received, length:', data.length);
            res.writeHead(200, { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            });
            res.end(data);
          });
        });
        
        proxyReq.on('error', (error) => {
          console.error('Proxy error:', error.message);
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to fetch from booru', message: error.message }));
        });
        
        proxyReq.end();
      };
      
      makeRequest(targetUrl);
    }
  } else if (req.method === 'GET' && req.url.startsWith('/video-thumbnail')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const urlParams = new url.URL(req.url, `http://localhost:${PORT}`);
    const videoUrl = urlParams.searchParams.get('url');

    if (!videoUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing url parameter' }));
      return;
    }

    (async () => {
      let page = null;
      let contentType = 'image/jpeg';
      let buffer = null;
      try {
        const browser = await getBrowser();
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        await page.setContent(`
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8" />
              <style>html,body{margin:0;padding:0;height:100%;background:#000;}video{width:100%;height:100%;object-fit:contain;}</style>
            </head>
            <body>
              <video id="video" muted playsinline crossorigin="anonymous"></video>
            </body>
          </html>
        `, { waitUntil: 'domcontentloaded' });

        await page.evaluate(() => {
          const video = document.getElementById('video');
          if (!video) return;
          video.pause();
          video.removeAttribute('src');
          video.load();
        });

        await page.evaluate((src) => {
          const video = document.getElementById('video');
          if (!video) return;
          video.src = src;
          video.muted = true;
          video.playsInline = true;
          video.crossOrigin = 'anonymous';
          video.load();
        }, videoUrl);

        await page.waitForFunction(() => {
          const video = document.getElementById('video');
          return video && video.readyState >= 2;
        }, { timeout: 12000 }).catch((err) => {
          console.warn('Video readyState did not reach >=2 in time, continuing with fallback:', err.message || err);
        });

        await page.evaluate(() => {
          const video = document.getElementById('video');
          if (!video) return;

          const targetTime = Math.min(0.2, Math.max(0.05, (video.duration || 0.2) * 0.02));
          const seekVideo = () => {
            try {
              video.currentTime = targetTime;
            } catch (e) {
              console.warn('Unable to seek video to target time:', e.message || e);
            }
          };

          return new Promise((resolve) => {
            if (video.readyState >= 3) {
              seekVideo();
              resolve();
              return;
            }
            const onReady = () => {
              seekVideo();
              resolve();
            };
            video.addEventListener('loadeddata', onReady, { once: true });
            video.addEventListener('error', onReady, { once: true });
          });
        });

        await page.waitForFunction(() => {
          const video = document.getElementById('video');
          return video && video.readyState >= 3 && video.currentTime > 0;
        }, { timeout: 12000 }).catch((err) => {
          console.warn('Video did not seek to a playable frame in time, continuing with fallback:', err.message || err);
        });

        const videoHandle = await page.$('#video');
        if (videoHandle) {
          try {
            buffer = await videoHandle.screenshot({ type: 'jpeg', quality: 80 });
          } catch (screenshotError) {
            console.warn('Video element screenshot failed, falling back to page screenshot:', screenshotError.message || screenshotError);
          }
        }

        if (!buffer) {
          try {
            buffer = await page.screenshot({ type: 'jpeg', quality: 75 });
          } catch (pageScreenshotError) {
            console.warn('Page screenshot fallback failed:', pageScreenshotError.message || pageScreenshotError);
          }
        }

        if (!buffer) {
          buffer = FALLBACK_THUMBNAIL_PNG;
          contentType = 'image/png';
        }

        res.writeHead(200, {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*'
        });
        res.end(buffer);
      } finally {
        if (page) {
          try {
            await page.close();
          } catch (closeError) {
            console.warn('Failed to close puppeteer page after thumbnail generation:', closeError.message || closeError);
          }
        }
      }
    })().catch((error) => {
      console.error('Video thumbnail generation error:', error.message || error);
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Failed to generate video thumbnail', message: error.message || String(error) }));
    });
  } else if (req.method === 'POST' && req.url === '/set-download-folder') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const { folder } = JSON.parse(body);
        console.log('Setting download folder to:', folder);
        downloadFolder = folder;
        database.saveDownloadSettings({ downloadFolder: folder });
        console.log('Successfully saved download folder setting');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, folder }));
      } catch (error) {
        console.error('Error setting download folder:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
  } else if (req.method === 'GET' && req.url === '/get-download-folder') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ folder: downloadFolder }));
  } else if (req.method === 'POST' && req.url === '/api/generate-mosaic') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', async () => {
      try {
        const {
          imageBase64,
          filename,
          cellWidth = 50,
          cellHeight = 50,
          columns = 100,
          rows = 100
        } = JSON.parse(body);

        if (!imageBase64) {
          throw new Error('Missing image data');
        }
        if (!downloadFolder) {
          throw new Error('Download folder not set');
        }

        const outputWidth = Number(cellWidth) * Number(columns);
        const outputHeight = Number(cellHeight) * Number(rows);
        const maxPixels = 16_000_000;
        if (outputWidth * outputHeight > maxPixels) {
          throw new Error(`Requested mosaic is too large (${outputWidth}x${outputHeight} = ${outputWidth * outputHeight} pixels). Reduce columns, rows, or cell size to keep output under ${maxPixels.toLocaleString()} pixels.`);
        }

        const mosaicModule = require('mosaic-node-generator');
        const inputDir = path.join(downloadFolder, 'mosaic-test-inputs');
        const outputsDir = path.join(downloadFolder, 'outputs');
        const thumbsDir = path.join(downloadFolder, `mosaic-thumbs-${Number(cellWidth)}x${Number(cellHeight)}`);
        const tilesDir = path.join(downloadFolder, 'mosaic-tiles');

        if (!fs.existsSync(inputDir)) fs.mkdirSync(inputDir, { recursive: true });
        if (!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir, { recursive: true });
        if (!fs.existsSync(thumbsDir)) fs.mkdirSync(thumbsDir, { recursive: true });

        if (fs.existsSync(tilesDir)) {
          fs.rmSync(tilesDir, { recursive: true, force: true });
        }
        fs.mkdirSync(tilesDir, { recursive: true });

        const supportedExts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);
        const downloadFiles = fs.readdirSync(downloadFolder);
        const supportedTiles = [];
        for (const filenameEntry of downloadFiles) {
          const sourcePath = path.join(downloadFolder, filenameEntry);
          const stat = fs.statSync(sourcePath);
          if (!stat.isFile()) continue;
          const ext = path.extname(filenameEntry).toLowerCase();
          if (!supportedExts.has(ext)) continue;
          supportedTiles.push(filenameEntry);
        }

        if (supportedTiles.length === 0) {
          throw new Error('No supported image tiles found in download folder');
        }

        const maxTiles = 500;
        let selectedTiles = supportedTiles;
        if (supportedTiles.length > maxTiles) {
          console.log(`[mosaic] found ${supportedTiles.length} supported tiles, limiting to ${maxTiles} selected tiles to reduce memory usage`);
          selectedTiles = supportedTiles.sort(() => 0.5 - Math.random()).slice(0, maxTiles);
        }

        let tileCount = 0;
        for (const filenameEntry of selectedTiles) {
          const sourcePath = path.join(downloadFolder, filenameEntry);
          const destPath = path.join(tilesDir, filenameEntry);
          try {
            fs.linkSync(sourcePath, destPath);
          } catch (err) {
            try {
              fs.copyFileSync(sourcePath, destPath);
            } catch (copyErr) {
              console.warn('Failed to link or copy tile file:', sourcePath, copyErr.message || copyErr);
              continue;
            }
          }
          tileCount++;
        }

        if (tileCount === 0) {
          throw new Error('Failed to stage any tile images for mosaic generation');
        }

        console.log('[mosaic] tilesDir:', tilesDir, 'tileCount:', tileCount);
        console.log('[mosaic] thumbsDir:', thumbsDir, 'exists:', fs.existsSync(thumbsDir));

        const inputName = filename ? path.basename(filename) : `mosaic-input-${Date.now()}.png`;
        const inputPath = path.join(inputDir, inputName);
        let rawData = imageBase64;
        if (rawData.startsWith('data:')) {
          rawData = rawData.substring(rawData.indexOf(',') + 1);
        }
        const buffer = Buffer.from(rawData, 'base64');
        fs.writeFileSync(inputPath, buffer);

        let thumbsDirectoryFromRead = null;
        const thumbsFiles = fs.readdirSync(thumbsDir).filter(file => {
          const full = path.join(thumbsDir, file);
          return fs.statSync(full).isFile();
        });
        if (thumbsFiles.length > 0) {
          thumbsDirectoryFromRead = thumbsDir;
        }

        console.log('[mosaic] thumbsDirectoryFromRead:', thumbsDirectoryFromRead ? thumbsDir : 'none', 'thumbs count:', thumbsFiles.length);

        const sourceJimp = await mosaicModule.JimpImage.read(inputPath);
        const sourceImage = new mosaicModule.JimpImage(sourceJimp);
        const mosaicImage = new mosaicModule.MosaicImage(
          sourceImage,
          tilesDir,
          Number(cellWidth),
          Number(cellHeight),
          Number(columns),
          Number(rows),
          thumbsDirectoryFromRead,
          thumbsDir,
          false
        );

        const originalCwd = process.cwd();
        process.chdir(downloadFolder);
        console.log('[mosaic] starting generate, cwd:', process.cwd());
        await mosaicImage.generate();
        process.chdir(originalCwd);
        console.log('[mosaic] generate completed, cwd restored to:', process.cwd());

        const results = fs.readdirSync(outputsDir)
          .filter(file => /^output_.*\.(jpg|jpeg|png)$/i.test(file))
          .map(file => ({
            name: file,
            mtime: fs.statSync(path.join(outputsDir, file)).mtimeMs
          }))
          .sort((a, b) => b.mtime - a.mtime);

        if (results.length === 0) {
          throw new Error('Mosaic output file not found');
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, filename: `outputs/${results[0].name}` }));
      } catch (error) {
        console.error('Mosaic generation failed:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message || String(error) }));
      }
    });
  } else if (req.method === 'GET' && req.url.startsWith('/api/list-files')) {
    try {
      const parsedUrl = new URL(req.url, 'http://localhost');
      const requestedPath = parsedUrl.searchParams.get('path') || '';
      const normalizedPath = path.normalize(requestedPath);
      if (path.isAbsolute(normalizedPath) || normalizedPath.startsWith('..')) {
        throw new Error('Invalid path parameter');
      }
      const targetDir = path.resolve(__dirname, normalizedPath);
      const rootDir = path.resolve(__dirname);
      if (!targetDir.startsWith(rootDir)) {
        throw new Error('Invalid path parameter');
      }
      const files = fs.readdirSync(targetDir);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ files }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
  } else if (req.method === 'POST' && req.url === '/download-booru-image') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', async () => {
      try {
        const { imageUrl, filename, userAgent, cookies } = JSON.parse(body);
        const downloadHeaders = {};
        if (userAgent) downloadHeaders.userAgent = userAgent;
        if (cookies) downloadHeaders.cookies = cookies;
        
        if (!downloadFolder) {
          throw new Error('Download folder not set');
        }

        if (!fs.existsSync(downloadFolder)) {
          fs.mkdirSync(downloadFolder, { recursive: true });
        }

        const filepath = path.join(downloadFolder, filename);
        
        // Download with redirect support
        const downloadWithRedirects = (downloadUrl, redirectCount = 0) => {
          if (redirectCount > 5) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Too many redirects' }));
            return;
          }
          
          const parsedUrl = new URL(downloadUrl);
          const protocol = parsedUrl.protocol === 'http:' ? http : https;
          const agent = requireProxyAgent(parsedUrl.protocol === 'http:' ? 'http' : 'https');
          const proxyName = `${proxySettings.type} ${proxySettings.host}:${proxySettings.port}`;
          console.log(`📡 download proxy ${parsedUrl.hostname}${parsedUrl.pathname}${parsedUrl.search || ''} [${proxyName}]`);
          
          const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'http:' ? 80 : 443),
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            timeout: 60000,
            headers: buildImageHeaders(parsedUrl.hostname)
          };
          // apply overrides from client if provided
          if (downloadHeaders) {
            if (downloadHeaders.userAgent) {
              options.headers['User-Agent'] = downloadHeaders.userAgent;
            }
            if (downloadHeaders.cookies) {
              options.headers['Cookie'] = downloadHeaders.cookies;
            }
          }
          
          if (agent) options.agent = agent;
          
          const downloadReq = protocol.request(options, (response) => {
            // Handle redirects
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
              const redirectUrl = new URL(response.headers.location, downloadUrl).href;
              response.resume();
              downloadWithRedirects(redirectUrl, redirectCount + 1);
              return;
            }
            
            // Check for successful response
            if (response.statusCode !== 200) {
              response.resume();
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: `HTTP ${response.statusCode}` }));
              return;
            }
            
            // Stream to file
            const fileStream = fs.createWriteStream(filepath);
            
            fileStream.on('error', (err) => {
              response.resume();
              if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: err.message }));
            });
            
            response.pipe(fileStream);
            
            fileStream.on('finish', () => {
              trackDownload();
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, filepath: filename }));
            });
          });
          
          downloadReq.on('error', (err) => {
            if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err.message }));
          });
          
          downloadReq.on('timeout', () => {
            downloadReq.destroy();
            if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Request timeout' }));
          });
          
          downloadReq.end();
        };
        
        await activeRequestJitter();
        downloadWithRedirects(imageUrl);
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/check-downloaded-images') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const { filenames = [], keys = [] } = JSON.parse(body);
        if (!downloadFolder || !fs.existsSync(downloadFolder)) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ downloaded: {}, keys: {} }));
          return;
        }
        const downloaded = {};
        filenames.forEach(filename => {
          downloaded[filename] = fs.existsSync(path.join(downloadFolder, filename));
        });

        // if keys provided, build normalized key map from existing files
        const keyResults = {};
        if (keys && keys.length > 0) {
          const files = fs.readdirSync(downloadFolder);
          const normalizeKey = (name) => {
            let base = name.replace(/\.[^/.]+$/, '');
            const m = base.match(/([0-9a-f]{8,})$/i);
            return m ? m[1] : base;
          };
          const existingKeys = files.map(f => normalizeKey(f));
          keys.forEach(k => {
            keyResults[k] = existingKeys.includes(k);
          });
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ downloaded, keys: keyResults }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/delete-downloaded-image') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const { filename, id } = JSON.parse(body);
        if (!downloadFolder) throw new Error('Download folder not set');
        const filepath = path.join(downloadFolder, filename);
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
        // if caller provided the post id, clear the database record too
        if (id && typeof database !== 'undefined' && database && typeof database.removeDownloadedPost === 'function') {
          try {
            database.removeDownloadedPost(id);
          } catch (dbErr) {
            console.warn('Failed to remove DB record during file delete', dbErr);
            // file deletion succeeded, but DB removal failed; inform client
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: dbErr.message || String(dbErr) }));
            return;
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });

  } else if (req.method === 'GET' && req.url.startsWith('/serve-local-file/')) {
    // Serve files from the download folder
    res.setHeader('Access-Control-Allow-Origin', '*');
    const filename = decodeURIComponent(req.url.replace('/serve-local-file/', ''));
    
    if (!downloadFolder) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Download folder not set' }));
      return;
    }
    
    // Sanitize path to prevent directory traversal
    const safePath = path.normalize(filename).replace(/^([\/]+|\.\.([\/]|$))+/, '');
    const filepath = path.join(downloadFolder, safePath);
    if (!filepath.startsWith(downloadFolder + path.sep) && filepath !== downloadFolder) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid file path' }));
      return;
    }
    
    if (!fs.existsSync(filepath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'File not found' }));
      return;
    }
    
    // Determine content type
    const ext = path.extname(filepath).toLowerCase();
    const contentTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime'
    };
    const contentType = contentTypes[ext] || 'application/octet-stream';
    
    try {
      const stat = fs.statSync(filepath);
      const totalSize = stat.size;
      const rangeHeader = req.headers.range;
      if (rangeHeader) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
        if (match) {
          const start = match[1] ? parseInt(match[1], 10) : 0;
          const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
          if (start > end || start >= totalSize || end >= totalSize) {
            res.writeHead(416, {
              'Content-Range': `bytes */${totalSize}`
            });
            res.end();
            return;
          }
          const chunkSize = end - start + 1;
          res.writeHead(206, {
            'Content-Type': contentType,
            'Content-Length': chunkSize,
            'Content-Range': `bytes ${start}-${end}/${totalSize}`,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=31536000'
          });
          fs.createReadStream(filepath, { start, end }).pipe(res);
          return;
        }
      }

      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': totalSize,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=31536000' // Cache for 1 year since files don't change
      });
      fs.createReadStream(filepath).pipe(res);
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }

  } else if (req.method === 'GET' && req.url === '/list-downloaded-files') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    try {
      if (!downloadFolder || !fs.existsSync(downloadFolder)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([]));
        return;
      }
      const files = fs.readdirSync(downloadFolder)
        .filter(file => file.match(/\.(png|jpe?g|gif|webm|mp4)$/i))
        .sort();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(files));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
  } else if (req.method === 'GET' && req.url.startsWith('/load-tag-suggestions')) {
    try {
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const source = urlObj.searchParams.get('source');
      const prefix = urlObj.searchParams.get('prefix') || '';
      const limit = parseInt(urlObj.searchParams.get('limit') || '10', 10);
      if (source) {
        // Query for a specific source and prefix
        const matches = database.queryTagSuggestions(source, prefix, limit);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(matches));
      } else {
        // No source param: return all suggestions (full dump)
        const suggestions = database.loadTagSuggestions();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(suggestions));
      }
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
  } else if (req.method === 'POST' && req.url === '/save-tag-suggestions') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const suggestions = JSON.parse(body);
        database.saveTagSuggestions(suggestions);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

function ensureDirectoryExists(dirPath) {
  if (!dirPath) return;
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  } catch (error) {
    console.error('Failed to create download folder:', dirPath, error);
  }
}

// Initialize database and start server
(async () => {
  try {
    await database.initDatabase();
    
    // Load download folder setting from database, default to the app downloads folder when not set
    downloadFolder = database.loadDownloadSettings().downloadFolder || DEFAULT_DOWNLOAD_FOLDER;
    ensureDirectoryExists(downloadFolder);
    
    // Load proxy settings from database
    try {
      const savedProxy = database.loadSetting('proxySettings');
      if (savedProxy) {
        proxySettings = typeof savedProxy === 'string' ? JSON.parse(savedProxy) : savedProxy;
        console.log('🔒 Loaded proxy settings:', proxySettings.active ? `${proxySettings.type} ${proxySettings.host}:${proxySettings.port}` : 'disabled');
      }
    } catch (e) {
      console.warn('Could not load proxy settings:', e.message);
    }

    // Try to load existing blacklist tags from saved session in database
    try {
      const sess = database.loadSession();
      if (sess && Array.isArray(sess.blacklistTags)) {
        blacklistTags = sess.blacklistTags.slice();
      }
    } catch (e) {
      console.warn('Could not initialize server blacklist tags from session:', e.message);
    }

    // Start 5-minute Tor circuit rotation timer if applicable
    resetTorRotateTimer();
    
    server.listen(PORT, () => {
      console.log(`Image save server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
})();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  database.closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down...');
  database.closeDatabase();
  process.exit(0);
});
