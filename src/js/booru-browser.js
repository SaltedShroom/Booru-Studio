// --- Booru Gallery Counter Logic ---
function updateBooruGalleryCounter() {
  if (document.getElementById('booru-content')?.style.display == 'none')
    return; // Don't show counter if total count is hidden (e.g., in downloads gallery)

  const gallery = document.getElementById('gallery-wrapper');
  const booruGallery = document.getElementById('booru-gallery');
  const counter = document.getElementById('booru-gallery-counter');

  // Determine if we're in downloads gallery mode
  let isDownloadsGallery = booruGallery.classList.contains('downloads-gallery');
  let totalCount = totalResultCount;
  if (isDownloadsGallery) {
    counter.classList.add('downloads');
    // Use the number of downloaded posts as the total
    // Try to get the posts from the DOM or window
    if (window.isViewingDownloadsGallery && typeof dbStore !== 'undefined' && dbStore) {
      // Try to get the current rendered posts (filtered or not)
      const items = gallery.querySelectorAll('.booru-image-item');
      totalCount = items.length;
    } else if (window.downloadedPosts && Array.isArray(window.downloadedPosts)) {
      totalCount = window.downloadedPosts.length;
    }
  } else {
    counter.classList.remove('downloads');
  }
  if (totalCount === 0) {
    counter.style.opacity = '0';
    return;
  } else {
    counter.style.opacity = '1';
  }

  counter.title = totalCount ? totalCount.toString() : 'unknown';
  // Get the visible viewport boundaries
  const viewportTop = window.scrollY;
  const viewportBottom = viewportTop + window.innerHeight;
  // Find the highest data-index of any image currently visible in the viewport
  const images = Array.from(gallery.querySelectorAll('img[data-index]'));
  let maxIdx = 0;
  images.forEach(img => {
    const imgRect = img.getBoundingClientRect();
    const imgTop = imgRect.top + window.scrollY;
    const imgBottom = imgRect.bottom + window.scrollY;
    // Check if any part of the image is visible in the viewport
    if (imgBottom > viewportTop && imgTop < viewportBottom) {
      maxIdx = Math.max(maxIdx, parseInt(img.getAttribute('data-index'), 10));
    }
  });

  function formatNumber(num) {
    if (num === null || num === undefined) return '?';
    let s = num.toString();
    if (s.length > 6) s = s.slice(0, s.length - 6) + 'M+';
    else if (s.length > 3) s = s.slice(0, s.length - 3) + 'k+';
    return s;
  }


  const currentEl = document.getElementById('booru-counter-current');
  const totalEl = document.getElementById('booru-counter-total');
  if (currentEl && totalEl && typeof window.Odometer !== 'undefined') {
    if (!currentEl._odometer) {
      currentEl._odometer = new window.Odometer({ el: currentEl, value: 0, format: 'd', duration: 500 });
    }
    if (maxIdx >= 1000) {
      currentEl.style.fontSize = '9px';
    } else {
      currentEl.style.fontSize = '';
    }
    currentEl._odometer.update(maxIdx);
    totalEl.innerHTML = formatNumber(totalCount);
  } else {
    // Fallback if Odometer is not yet loaded
    counter.innerHTML = formatNumber(maxIdx) + '<br><b>/ ' + formatNumber(totalCount) + '</b>';
  }
}
function fillBooruEndTags() {
  const endTagsEl = document.getElementById('booru-end-tags');
  if (!endTagsEl) return;
  // Gather all tags from all images in the gallery
  const tagCounts = {};
  const posts = window.booruPosts || [];
  posts.forEach(post => {
    if (Array.isArray(post.tags)) {
      post.tags.forEach(tag => {
        if (!tag) return;
        const userInput = document.getElementById('search-filter-input')?.value.toLowerCase().split(' ') || [];
        if (userInput.includes(tag.toLowerCase())) return; // Skip tags already in search input 
        if (tag != 'male' && tag != 'female' && tag != '1girl' && tag != '1boy' && tag != 'mammal' && tag != 'penis' && tag != 'sex' && tag != 'anthro' && tag != 'cum' && tag != 'balls' && tag != 'conditional_dnp' && tag != 'furry' && tag != 'pussy' && tag != 'vagina' && tag != 'hi_res' && tag != 'absurd_res' && tag != 'fur' && tag != 'genitals' && tag != 'ass' && tag != 'hair' && tag != 'clothing' && tag != 'eyebrows' && tag != 'bodily_fluids' && tag != 'genital_fluids' && tag != 'erection' && tag != 'text' && tag != 'anus') // Skip common tags
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    }
  });
  // Get top 10 tags by count
  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxRecommendedTags)
    .map(([tag]) => tag);
  // Clear and fill the element
  endTagsEl.innerHTML = '';
  topTags.forEach(tag => {
    const tagSpan = document.createElement('span');
    tagSpan.className = 'booru-tag';
    tagSpan.textContent = tag;
        
    tagSpan.addEventListener('click', (e) => {
      if (searchFilterInput) {
        e.stopPropagation();
        toggleTagInSearch(tag);
      }
    });
    
    tagSpan.addEventListener('mousedown', (e) => {
      if (e.button === 1) { // Middle mouse button
        e.preventDefault();
        e.stopPropagation();
        // Create new tab with this tag
        if (typeof createNewBooruTab === 'function') {
          createNewBooruTab(tag);
        }
      }
    });
    
    endTagsEl.appendChild(tagSpan);
  });
}

function setupBooruGalleryCounter() {
  const gallery = document.getElementById('booru-gallery');
  if (!gallery) return;
  
  // Clean up previous setup if exists
  if (window.booruGalleryCleanup) {
    window.booruGalleryCleanup.cleanup();
  }
  
  // Create new cleanup manager for this setup
  window.booruGalleryCleanup = new CleanupManager();
  const cleanup = window.booruGalleryCleanup;

  // The actual scrolling container is .booru-content (overflow:auto), not the window.
  // scroll events do NOT bubble, so window listeners miss them entirely.
  const scrollContainer = document.querySelector('.booru-content') || gallery;
  
  let ticking = false;
  function requestCounterUpdate() {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        updateBooruGalleryCounter();
        ticking = false;
      });
      ticking = true;
    }
  }
  // Listen on the real scroll container, gallery, and window as fallback
  cleanup.addEventListener(scrollContainer, 'scroll', requestCounterUpdate, { passive: true });
  cleanup.addEventListener(gallery, 'scroll', requestCounterUpdate, { passive: true });
  cleanup.addEventListener(window, 'scroll', requestCounterUpdate, { passive: true });
  cleanup.addEventListener(scrollContainer, 'wheel', requestCounterUpdate, { passive: true });
  cleanup.addEventListener(gallery, 'wheel', requestCounterUpdate, { passive: true });
  cleanup.addEventListener(window, 'wheel', requestCounterUpdate, { passive: true });
  cleanup.addEventListener(scrollContainer, 'touchmove', requestCounterUpdate, { passive: true });
  cleanup.addEventListener(gallery, 'touchmove', requestCounterUpdate, { passive: true });
  cleanup.addEventListener(window, 'touchmove', requestCounterUpdate, { passive: true });

  // Debounced handler for scroll end (fires after user stops scrolling)
  let scrollEndTimer = null;
  function handleScrollEnd() {
    if (scrollEndTimer) clearTimeout(scrollEndTimer);
    scrollEndTimer = cleanup.setTimeout(() => {
      updateBooruGalleryCounter();
    }, 120); // 120ms after last scroll event
  }
  cleanup.addEventListener(scrollContainer, 'scroll', handleScrollEnd, { passive: true });
  cleanup.addEventListener(gallery, 'scroll', handleScrollEnd, { passive: true });
  cleanup.addEventListener(window, 'scroll', handleScrollEnd, { passive: true });
  cleanup.addEventListener(scrollContainer, 'wheel', handleScrollEnd, { passive: true });
  cleanup.addEventListener(gallery, 'wheel', handleScrollEnd, { passive: true });
  cleanup.addEventListener(window, 'wheel', handleScrollEnd, { passive: true });
  cleanup.addEventListener(scrollContainer, 'touchmove', handleScrollEnd, { passive: true });
  cleanup.addEventListener(gallery, 'touchmove', handleScrollEnd, { passive: true });
  cleanup.addEventListener(window, 'touchmove', handleScrollEnd, { passive: true });

  // Detect scrollbar drag start/end using pointer events on the scroll container
  let isDraggingScrollbar = false;
  cleanup.addEventListener(scrollContainer, 'pointerdown', (e) => {
    if (e.pointerType === 'mouse') {
      isDraggingScrollbar = true;
      requestCounterUpdate(); // Scroll start
    }
  });
  cleanup.addEventListener(scrollContainer, 'pointerup', (e) => {
    if (isDraggingScrollbar) {
      isDraggingScrollbar = false;
      updateBooruGalleryCounter(); // Scroll end
    }
  });
  cleanup.addEventListener(gallery, 'pointerdown', (e) => {
    if (e.pointerType === 'mouse') {
      isDraggingScrollbar = true;
      requestCounterUpdate();
    }
  });
  cleanup.addEventListener(gallery, 'pointerup', (e) => {
    if (isDraggingScrollbar) {
      isDraggingScrollbar = false;
      updateBooruGalleryCounter();
    }
  });
  // Listen for resize events
  cleanup.addEventListener(window, 'resize', requestCounterUpdate, { passive: true });
  // Update counter after Justified Gallery layout
  if (typeof $ !== 'undefined' && gallery) {
    $(gallery).on('jg.complete', function() {
      requestCounterUpdate();
    });
  }
  // Also observe DOM changes in the gallery (e.g., images added/removed)
  const observer = new MutationObserver(requestCounterUpdate);
  cleanup.addObserver(observer);
  observer.observe(gallery, { childList: true, subtree: true });
  // Initial update
  requestCounterUpdate();
}

// Run setup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('booru-gallery-counter')) {
    setupBooruGalleryCounter();
  }
    fillBooruEndTags();
});
// Log when the user leaves the app window
window.addEventListener('blur', () => {
  previewFrozen = false;
  booruHoverPreview.classList.remove('frozen');
  booruHoverPreview.classList.remove('active');
  pauseAllPreviewVideos()
});

let hidePreviewTimeout = null;

document.addEventListener('mouseleave', () => {
  hidePreviewTimeout = setTimeout(() => {
    if (booruHoverPreview.classList.contains('active')) {
      if (!booruHoverPreview.classList.contains('frozen')) {
        booruHoverPreview.classList.remove('active');
        pauseAllPreviewVideos()
      }
    }
  }, 100);
});
document.addEventListener('mouseenter', () => {
  if (hidePreviewTimeout) {
    clearTimeout(hidePreviewTimeout);
    hidePreviewTimeout = null;
  }
});


// Get DOM elements
const booruSourceSelect = document.getElementById('booru-source-select');
const subredditControl = document.getElementById('subreddit-control');
const booruSettingsBtn = document.getElementById('booru-settings-btn');
const apiSettingsModal = document.getElementById('api-settings-modal');
const closeApiModalBtn = document.getElementById('close-api-modal');
const apiKeyInput = document.getElementById('api-key-input');
const userIdInput = document.getElementById('user-id-input');
const saveApiCredentialsBtn = document.getElementById('save-api-credentials-btn');
const reloadBooruBtn = document.getElementById('reload-booru-btn');
const aiFilterToggleBtn = document.getElementById('ai-filter-toggle');
const galleryQualityToggleBtn = document.getElementById('gallery-quality-toggle');
let booruGallery = document.getElementById('booru-gallery');
const booruSortSelect = document.getElementById('booru-sort-select');
const booruLimitInput = document.getElementById('booru-limit-input');
const booruContent = document.getElementById('booru-content');
const booruLoading = document.getElementById('booru-loading');
const booruTotalCount = document.getElementById('booru-total-count');

// Global booru state - use window properties for tab persistence
window.currentBooruSource = 'reddit';
let booruPaginationToken = null;
let isLoadingBooru = false;
let aiFilterEnabled = false; // AI filter OFF by default
let maxRecommendedTags = 20;
let activeDownloadsSidebarTab = 'analytics'; // or 'mosaic'

// Gallery quality state
let showHighQualityGallery = false;
let qualityLoadingTimeouts = []; // Track ongoing quality loading operations
let galleryQualityLoadBatch = 0;

// HQ image loading counter for the toast counter element
let _hqLoadingCount = 0;
let _hqTotalBytes = 0;

let LoadingCounterTimeout = null;

if (localStorage.getItem('downloadsSidebarSelectedTab')) {
  activeDownloadsSidebarTab = localStorage.getItem('downloadsSidebarSelectedTab');
}

function updateHqLoadingCounter(delta) {
  if (LoadingCounterTimeout) {
    clearTimeout(LoadingCounterTimeout);
    LoadingCounterTimeout = null;
  }
  _hqLoadingCount = Math.max(0, _hqLoadingCount + delta);
  const el = document.getElementById('loading-toast-counter');
  if (!el) return;
  if (_hqLoadingCount === 0) {
    el.innerHTML = 'Loading: <b>0</b> posts <b class="hq-loading-mb">0.0 MB</b>';
    LoadingCounterTimeout = setTimeout(() => {
      el.classList.add('hidden');
    }, 500);
    return;
  }
  const countLabel = `<b>${_hqLoadingCount}</b> post${_hqLoadingCount !== 1 ? 's' : ''}`;
  const mbLabel = _hqTotalBytes > 0 ? ` <b class="hq-loading-mb">${(_hqTotalBytes / (1024 * 1024)).toFixed(1)} MB</b>` : ' <b class="hq-loading-mb">0.0 MB</b>';
  el.innerHTML = `Loading: ${countLabel}${mbLabel}`;
  el.classList.remove('hidden');
}

// Download management
// Download management
window.downloadFolder = window.downloadFolder || null;

// Download queue + retry manager
window.downloadConcurrency = window.downloadConcurrency || 3; // default (can be overridden by settings)
const downloadQueue = {
  _queue: [],
  _active: 0,
  enqueue(task) {
    return new Promise((resolve, reject) => {
      this._queue.push({ task, resolve, reject, attempts: 0 });
      this._process();
    });
  },
  async _process() {
    const concurrency = parseInt(window.downloadConcurrency, 10) || 3;
    while (this._active < concurrency && this._queue.length > 0) {
      const item = this._queue.shift();
      this._active++;
      (async () => {
        try {
          const res = await runDownloadWithRetries(item.task, 3, (pct, status) => {
            // progress callback -> update toast and gallery progress bar (if present)
            if (item.task.toast) item.task.toast.update(pct, status);
            try {
              if (item.task.progressBar) {
                item.task.progressBar.style.width = Math.max(0, Math.min(100, pct)) + '%';
                if (item.task.progressContainer) {
                  item.task.progressContainer.style.display = (pct > 0 && pct < 100) ? 'block' : (pct >= 100 ? 'none' : item.task.progressContainer.style.display);
                }
              }
            } catch (e) { /* ignore DOM errors */ }
            // progress callback -> update mosaicEstimatedTime
            
          });
          item.resolve(res);
        } catch (err) {
          item.reject(err);
        } finally {
          this._active--;
          // process next
          setTimeout(() => this._process(), 0);
        }
      })();
    }
  }
};

window.imageLoadConcurrency = window.imageLoadConcurrency || 3;
const loadingQueue = {
  _queue: [],
  _active: 0,
  enqueue(task) {
    return new Promise((resolve, reject) => {
      this._queue.push({ task, resolve, reject });
      this._process();
    });
  },
  async _process() {
    const concurrency = parseInt(window.imageLoadConcurrency, 10) || 3;
    while (this._active < concurrency && this._queue.length > 0) {
      const item = this._queue.shift();
      this._active++;
      (async () => {
        try {
          const res = await item.task();
          item.resolve(res);
        } catch (err) {
          item.reject(err);
        } finally {
          this._active--;
          setTimeout(() => this._process(), 0);
        }
      })();
    }
  }
};

async function runDownloadWithRetries(task, maxAttempts = 3, onProgress) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (onProgress) onProgress( (attempt - 1) / maxAttempts * 20, `Attempt ${attempt}/${maxAttempts}` );
    try {
      // perform download (server request)
      if (onProgress) onProgress(10, 'Starting');
      // include current source headers if available
      let extra = {};
      if (typeof booruSourcesManager !== 'undefined' && booruSourcesManager) {
        const cfg = booruSourcesManager.getSource(window.currentBooruSource);
        if (cfg) {
          if (cfg.userAgent) extra.userAgent = cfg.userAgent;
          if (cfg.cookies) extra.cookies = cfg.cookies;
        }
      }
      const resp = await fetch('http://localhost:3001/download-booru-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: task.imageUrl, filename: task.filename, ...extra })
      });
      const data = await resp.json();
      if (data && data.success) {
        if (onProgress) onProgress(100, 'Saved');
        return data;
      } else {
        throw new Error(data && data.error ? data.error : 'Unknown server error');
      }
    } catch (err) {
      lastError = err;
      // If there are more attempts left, show failed status and wait 1s before retrying
      if (attempt < maxAttempts) {
        if (onProgress) onProgress(Math.min(80, 20 + attempt * 20), `Failed — retrying in 1s (attempt ${attempt})`);
        await new Promise(r => setTimeout(r, 1000));
        // continue to next attempt
      } else {
        // final failure - update progress/status and exit loop
        if (onProgress) onProgress(100, 'Failed');
      }
    }
  }
  throw lastError;
}

// Expose for testing
window._downloadQueue = downloadQueue;

// Initialize window properties if not exists
window.booruPosts = window.booruPosts || [];
window.hasMoreResults = window.hasMoreResults !== undefined ? window.hasMoreResults : true;
window.totalResultCount = window.totalResultCount || null;

// Per-tab thumbnail cache to avoid reloading thumbnails when switching between booru tabs
window._booruThumbnailCache = window._booruThumbnailCache || {};
function getTabThumbnailCache(tabId) {
  if (!tabId) return null;
  window._booruThumbnailCache = window._booruThumbnailCache || {};
  if (!window._booruThumbnailCache[tabId]) {
    window._booruThumbnailCache[tabId] = new Map();
  }
  return window._booruThumbnailCache[tabId];
}
function getCachedThumbnailUrl(tabId, url) {
  const cache = getTabThumbnailCache(tabId);
  return cache ? cache.get(url) : null;
}
function clearThumbnailCacheForTab(tabId) {
  const cache = window._booruThumbnailCache?.[tabId];
  if (!cache) return;
  for (const objectUrl of cache.values()) {
    try { URL.revokeObjectURL(objectUrl); } catch (e) {}
  }
  delete window._booruThumbnailCache[tabId];
  deleteThumbnailCacheForTab(tabId).catch(() => {});
}

const THUMBNAIL_CACHE_DB_NAME = 'booru-thumbnail-cache-db';
const THUMBNAIL_CACHE_STORE_NAME = 'thumbnails';
let _thumbnailCacheDbPromise = null;

function openThumbnailCacheDb() {
  if (_thumbnailCacheDbPromise) return _thumbnailCacheDbPromise;
  _thumbnailCacheDbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(THUMBNAIL_CACHE_DB_NAME, 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(THUMBNAIL_CACHE_STORE_NAME)) {
        const store = db.createObjectStore(THUMBNAIL_CACHE_STORE_NAME, { keyPath: 'id' });
        store.createIndex('tabId', 'tabId', { unique: false });
        store.createIndex('cacheKey', 'cacheKey', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return _thumbnailCacheDbPromise;
}

async function getThumbnailCacheStore(mode = 'readonly') {
  const db = await openThumbnailCacheDb();
  const tx = db.transaction(THUMBNAIL_CACHE_STORE_NAME, mode);
  return tx.objectStore(THUMBNAIL_CACHE_STORE_NAME);
}

async function restoreThumbnailCacheForTab(tabId) {
  if (!tabId) return;
  const cache = getTabThumbnailCache(tabId);
  if (!cache) return;
  try {
    const store = await getThumbnailCacheStore('readonly');
    return new Promise((resolve, reject) => {
      const records = [];
      const request = store.index('tabId').openCursor(IDBKeyRange.only(tabId));
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) {
          // Transaction is complete, now convert blobs to data URLs
          const conversionPromises = records.map(record => {
            return new Promise((resolve) => {
              if (record && record.cacheKey && record.blob) {
                const reader = new FileReader();
                reader.onload = () => {
                  cache.set(record.cacheKey, reader.result);
                  resolve();
                };
                reader.onerror = () => resolve();
                reader.readAsDataURL(record.blob);
              } else {
                resolve();
              }
            });
          });
          Promise.all(conversionPromises).then(() => resolve()).catch(() => resolve());
          return;
        }
        records.push(cursor.value);
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.warn('Thumbnail cache restore failed:', e);
  }
}

async function persistThumbnailCacheEntry(tabId, cacheKey, blob) {
  if (!tabId || !cacheKey || !blob) return;
  try {
    const store = await getThumbnailCacheStore('readwrite');
    const id = `${tabId}|${cacheKey}`;
    return new Promise((resolve, reject) => {
      const req = store.put({ id, tabId, cacheKey, blob });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('Thumbnail cache save failed:', e);
  }
}

async function deleteThumbnailCacheForTab(tabId) {
  if (!tabId) return;
  try {
    const store = await getThumbnailCacheStore('readwrite');
    return new Promise((resolve, reject) => {
      const request = store.index('tabId').openCursor(IDBKeyRange.only(tabId));
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) {
          resolve();
          return;
        }
        store.delete(cursor.primaryKey);
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.warn('Thumbnail cache delete failed:', e);
  }
}

async function cacheThumbnailBlobForTab(tabId, originalUrl, cacheKey = null) {
  if (!tabId || !originalUrl || originalUrl.includes('?url=Unknown')) return null;
  const cache = getTabThumbnailCache(tabId);
  if (!cache) return null;
  const key = cacheKey || originalUrl;
  if (key.includes('?url=Unknown')) return null;
  if (cache.has(key)) return cache.get(key);

  try {
    const response = await fetch(originalUrl, { cache: 'force-cache' });
    if (!response.ok) return null;
    const blob = await response.blob();
    // Use data URL instead of blob URL to avoid CSP issues
    const reader = new FileReader();
    return new Promise((resolve) => {
      reader.onload = () => {
        const dataUrl = reader.result;
        cache.set(key, dataUrl);
        persistThumbnailCacheEntry(tabId, key, blob).catch(() => {});
        resolve(dataUrl);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    return null;
  }
}

function logBooruThumbnailCacheCounts() {
  const cache = window._booruThumbnailCache || {};
  const tabIds = Object.keys(cache);
  let total = 0;
  const tabCounts = tabIds.map((tabId) => {
    const count = cache[tabId]?.size || 0;
    total += count;
    return { tabId, count };
  });
  console.log(`Booru thumbnail cache: ${total} item(s) across ${tabCounts.length} tab(s)`, tabCounts);
  return { total, tabCounts };
}
window.logBooruThumbnailCacheCounts = logBooruThumbnailCacheCounts;
window.clearThumbnailCacheForTab = clearThumbnailCacheForTab;

// Tag suggestions
window.tagSuggestions = {};

// Constant blacklist tags (filtered when aiFilterEnabled is true)
const CONSTANT_BLACKLIST = ['ai_generated', 'ai', 'ai_assisted'];

// Abort controller for cancelling ongoing requests
let currentAbortController = null;

// Returns a human-friendly message like "Proxy may be down (host:port)" when the proxy is
// active and the error looks like a proxy connectivity failure; returns null otherwise.
function getProxyDownHint(status, rawMessage) {
  let settings;
  try { settings = JSON.parse(localStorage.getItem('proxySettings') || '{}'); } catch (e) { return null; }
  const msg = String(rawMessage || '');
  const isCfBlock = status === 403 && (msg.includes('Cloudflare') || msg.toLowerCase().includes('cloudflare'));
  if (isCfBlock) {
    return `Cloudflare is blocking image requests from this source. Open Settings → Booru Sources, edit the source and paste your browser cookies.`;
  }
  if (!settings.active || !settings.host || !settings.port) return null;
  const looksLikeConnectError =
    status === 502 ||
    /\b502\b/.test(msg) ||
    /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ECONNRESET|EHOSTUNREACH|socket hang up|tunneling socket|tunnel/i.test(msg);
  if (!looksLikeConnectError) return null;
  return `Proxy may be down (${settings.host}:${settings.port})`;
}

// Proxy fetch helper - always routes through server to avoid CORS issues
// The proxy setting controls which proxy the server uses, not whether to go through server
async function proxyFetch(url, options = {}) {
  const silent = !!options.silent;
  // Always route through server endpoint on port 3001 to avoid CORS issues
  // The server will apply the configured proxy if it's enabled
  try {
    // ensure headers object exists
    const headers = Object.assign({}, options.headers || {});

    // add cookies and user-agent from current source configuration if appropriate
    try {
      const currentSourceId = window.currentBooruSource;
      if (currentSourceId && typeof booruSourcesManager !== 'undefined') {
        const src = booruSourcesManager.getSource(currentSourceId);
        if (src) {
          // cookie header
          if (src.cookies) {
            try {
              const u = new URL(url);
              const base = src.apiUrl || src.baseUrl;
              if (base) {
                const host = new URL(base).hostname;
                if (u.hostname.includes(host)) {
                  headers['Cookie'] = src.cookies;
                }
              }
            } catch (e) {
              // ignore malformed URL
            }
          }
          // user-agent header
          if (src.userAgent && !headers['User-Agent'] && !headers['user-agent']) {
            headers['User-Agent'] = src.userAgent;
          }
        }
      }
    } catch (e) {
      console.warn('proxyFetch header injection failed', e);
    }

    const response = await fetch('http://localhost:3001/api/proxy-fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: url,
        method: options.method || 'GET',
        headers: headers,
        body: options.body
      })
    });
    return response;
  } catch (e) {
    if (!silent) {
      console.error('Error in proxyFetch:', e);
      showToast('Network error: ' + e.message, 'error');
    }
    throw e;
  }
}

// Detect CAPTCHA HTML in responses
function isCaptchaPage(html) {
  if (!html) return false;
  return /Please enter the CAPTCHA to continue to rule34\.xxx/i.test(html) || /captcha/i.test(html);
}

// Video volume/mute persistence
const VIDEO_VOLUME_KEY = 'booruVideoVolume';
function applyVideoVolume(videoEl) {
  try {
    const saved = JSON.parse(localStorage.getItem(VIDEO_VOLUME_KEY) || 'null');
    if (saved) {
      videoEl.volume = typeof saved.volume === 'number' ? saved.volume : 1;
      videoEl.muted = !!saved.muted;
    }
  } catch (e) { /* ignore corrupt storage */ }
  videoEl.addEventListener('volumechange', () => {
    try {
      localStorage.setItem(VIDEO_VOLUME_KEY, JSON.stringify({ volume: videoEl.volume, muted: videoEl.muted }));
    } catch (e) { /* ignore */ }
  });
}

// Get image URL - routes through proxy if enabled (but not for local files)
function getImageUrl(imageUrl) {
  if (!imageUrl) return '';
  // Never proxy localhost URLs - they're local files
  if (imageUrl.includes('localhost') || imageUrl.includes('127.0.0.1')) {
    return imageUrl;
  }
  // Never proxy data URLs - they're already embedded and would create huge header sizes
  if (imageUrl.startsWith('data:')) {
    return imageUrl;
  }
  
  const proxySettings = localStorage.getItem('proxySettings');
  if (proxySettings) {
    try {
      const settings = JSON.parse(proxySettings);
      if (settings.active && settings.host && settings.port) {
        // Return proxied URL pointing to port 3001
        return `http://localhost:3001/proxy-image?url=${encodeURIComponent(imageUrl)}`;
      }
    } catch (e) {
      console.error('Error checking proxy settings for image:', e);
      showToast('Error checking proxy settings: ' + e.message, 'error');
    }
  }
  // Return direct URL if proxy is not enabled
  return imageUrl;
}

// Global listener for image load errors so we can toast proxy failures
// using capturing phase to catch errors before jQuery swallows them
document.addEventListener('error', event => {
  const el = event.target;
  if (el && el.tagName === 'IMG') {
    //only use proxy if src does not contain "data%3Aimage" (already a data URL) or "url=Unknown" (placeholder for failed proxy)

    const src = el.src || '';
    if (src.includes('/proxy-image?') && !src.includes('data%3Aimage') && !src.includes('url=Unknown')) {
      // try fetching same URL to extract JSON error details
      fetch(src)
        .then(r => {
          const status = r.status;
          return r.json().catch(() => ({})).then(data => ({ status, data }));
        })
        .catch(() => {
          showToast('Image failed to load (proxy)', 'error');
        });
    } else {
      return; // not a proxied image, ignore
    }
  }
}, true);

// Download helper functions
function getFilenameFromUrl(url, postId) {
  try {
    const urlObj = new URL(url);
    let filename = urlObj.pathname.split('/').pop();
    
    // If no extension found or filename is empty, create one
    if (!filename || !filename.includes('.')) {
      const ext = url.toLowerCase().endsWith('.mp4') || url.includes('.mp4?') ? '.mp4' :
                  url.toLowerCase().endsWith('.webm') || url.includes('.webm?') ? '.webm' :
                  url.toLowerCase().endsWith('.gif') || url.includes('.gif?') ? '.gif' :
                  '.jpg';
      filename = `${postId || Date.now()}${ext}`;
    }
    
    return filename;
  } catch (e) {
    return `${postId || Date.now()}.jpg`;
  }
}

// derive a simple key from a booru URL by stripping extension and non-hash prefixes
function getImageKey(url) {
  try {
    const u = new URL(url);
    let seg = u.pathname.split('/').pop() || '';
    seg = seg.replace(/\?.*$/, ''); // remove query
    seg = seg.replace(/\.[^.]+$/, ''); // drop extension
    // look for trailing hex/hash of at least 8 chars
    const m = seg.match(/([0-9a-f]{8,})$/i);
    return m ? m[1] : seg;
  } catch (e) {
    // not a valid URL, fall back to basic cleanup
    let s = url.split('/').pop() || url;
    s = s.replace(/\?.*$/, '').replace(/\.[^.]+$/, '');
    const m = s.match(/([0-9a-f]{8,})$/i);
    return m ? m[1] : s;
  }
}

async function checkDownloadedImages() {
  // Wait for download folder to be loaded if it's still loading
  if (!window.downloadFolder && !window.downloadFolderChecked) {
    // Wait a bit for the folder to load, then try again
    await new Promise(resolve => setTimeout(resolve, 200));
    if (!window.downloadFolder) return; // Still not loaded, give up
  }
  if (!window.downloadFolder) return;
  
  const filenames = window.booruPosts.map(post => getFilenameFromUrl(post.imageUrl, post.id));
  const keys = window.booruPosts.map(post => getImageKey(post.imageUrl));
  
  try {
    const response = await fetch('http://localhost:3001/check-downloaded-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filenames, keys })
    });
    
    const data = await response.json();
    
    // Update UI for downloaded images
    const imageItems = document.querySelectorAll('.booru-image-item');
    imageItems.forEach((item, index) => {
      const post = window.booruPosts[index];
      if (!post) return;
      
      const filename = getFilenameFromUrl(post.imageUrl, post.id);
      const key = getImageKey(post.imageUrl);
      const isDownloaded = data.downloaded[filename] || (data.keys && data.keys[key]);
      
      if (isDownloaded) {
        item.dataset.downloaded = 'true';
        const downloadBtn = item.querySelector('.booru-download-btn');
        if (downloadBtn) {
          downloadBtn.innerHTML = '<i class="fas fa-times"></i>';
          downloadBtn.title = 'Delete';
        }
      }
    });
  } catch (error) {
    console.error('Failed to check downloaded images:', error);
    showToast('Failed to check downloaded images: ' + error.message, 'error');
  }
}

async function loadDownloadFolder() {
  try {
    const response = await fetch('http://localhost:3001/get-download-folder');
    const data = await response.json();
    if (data.folder) {
      window.downloadFolder = data.folder;
      window.downloadFolderChecked = true;
      updateDownloadFolderDisplay();
    } else {
      window.downloadFolderChecked = true;
    }
  } catch (error) {
    console.error('Failed to load download folder:', error);
    window.downloadFolderChecked = true;
    showToast('Failed to load download folder: ' + error.message, 'error');
  }
}

function selectDownloadsSidebarTab(tab) {
  activeDownloadsSidebarTab = tab;
  localStorage.setItem('downloadsSidebarSelectedTab', tab);
  renderDownloadsSidebar();
}

function renderDownloadsSidebar() {
  const sidebar = document.getElementById('downloads-sidebar');
  if (!sidebar) return;

  sidebar.innerHTML = '';

  if (localStorage.getItem('downloadsSidebarCollapsed') === 'true') {
    sidebar.classList.add('collapsed');
  } else {
    sidebar.classList.remove('collapsed');
  }

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'sidebar-toggle-btn';
  toggleBtn.innerHTML = '<i class="fa-solid fa-angles-right"></i>';
  toggleBtn.title = 'Toggle Analytics';
  toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    try {
      const collapsed = sidebar.classList.contains('collapsed');
      localStorage.setItem('downloadsSidebarCollapsed', collapsed ? 'true' : 'false');
    } catch (e) { /* ignore */ }
  });
  sidebar.appendChild(toggleBtn);

  let analyticsActive = '';
  let mosaicActive = '';
  if (activeDownloadsSidebarTab === 'analytics') {
    analyticsActive = 'active';
  } else {
    mosaicActive = 'active';
  }

  const navbarContainer = document.createElement('div');
  navbarContainer.className = 'sidebar-navbar-container';
  navbarContainer.innerHTML = `<button id="downloads-sidebar-analytics-btn" onclick="selectDownloadsSidebarTab('analytics')" class="sidebar-nav-btn ${analyticsActive}">Analytics</button> <button id="downloads-sidebar-mosaic-btn" onclick="selectDownloadsSidebarTab('mosaic')" class="sidebar-nav-btn ${mosaicActive}">Mosaic</button>`;
  sidebar.appendChild(navbarContainer);

  if (activeDownloadsSidebarTab === 'analytics') {
    renderDownloadsAnalytics(sidebar);
  } else {
    renderDownloadsMosaic(sidebar);
  }
}

function renderDownloadsAnalytics(sidebar) {
  const downloadTitle = document.createElement('h3');
  downloadTitle.textContent = 'SEARCH ANALYTICS';
  sidebar.appendChild(downloadTitle);

  const activityBlock = document.createElement('div');
  activityBlock.className = 'stats-wrapper';

  const activityTitle = document.createElement('h1');
  activityTitle.textContent = 'Activity';
  activityBlock.appendChild(activityTitle);

  const activityChartWrapper = document.createElement('div');
  activityChartWrapper.className = 'downloads-chart-wrapper';
  // activityChartWrapper.style.height = '60px';

  const activityCanvas = document.createElement('canvas');
  activityCanvas.id = 'downloads-activity-chart';
  activityCanvas.style.width = '100%';
  activityCanvas.style.height = '180px';
  activityChartWrapper.appendChild(activityCanvas);

  activityBlock.appendChild(activityChartWrapper);
  sidebar.appendChild(activityBlock);
  renderDownloadsActivityChart();

  sidebar.appendChild(document.createElement('hr'));

  const sourceArtistBlock = document.createElement('div');
  sourceArtistBlock.className = 'stats-wrapper';

  const downloadChartTitle = document.createElement('h1');
  downloadChartTitle.textContent = 'Sources & Artists';
  sourceArtistBlock.appendChild(downloadChartTitle);

  const chartWrapper = document.createElement('div');
  chartWrapper.className = 'downloads-chart-wrapper';
  // chartWrapper.style.height = '100px';

  const chartCanvas = document.createElement('canvas');
  chartCanvas.id = 'downloads-source-artist-chart';
  chartCanvas.style.width = '100%';
  chartCanvas.style.height = '200px';
  chartWrapper.appendChild(chartCanvas);

  sourceArtistBlock.appendChild(chartWrapper);
  sidebar.appendChild(sourceArtistBlock);
  renderDownloadsStatsChart();

  sidebar.appendChild(document.createElement('hr'));

  const fileTypeBlock = document.createElement('div');
  fileTypeBlock.className = 'stats-wrapper';
  fileTypeBlock.style.flexGrow = '0';

  const pieTitle = document.createElement('h1');
  pieTitle.textContent = 'Downloaded File Types';
  fileTypeBlock.appendChild(pieTitle);

  const pieWrapper = document.createElement('div');
  pieWrapper.className = 'downloads-chart-wrapper';
  pieWrapper.style.height = '100px';
  pieWrapper.style.display = 'flex';
  pieWrapper.style.flexDirection = 'column';

  const pieCanvas = document.createElement('canvas');
  pieCanvas.id = 'downloads-filetype-chart';
  pieCanvas.style.width = '100%';
  pieWrapper.appendChild(pieCanvas);

  fileTypeBlock.appendChild(pieWrapper);
  sidebar.appendChild(fileTypeBlock);
  renderDownloadsFileTypeChart();

  // sidebar.appendChild(document.createElement('hr'));

  // const mostUsedTags = document.createElement('div');
  // mostUsedTags.className = 'stats-wrapper';

  // const mostUsedTagsTitle = document.createElement('h1');
  // mostUsedTagsTitle.textContent = 'Favorite Tags';
  // mostUsedTags.appendChild(mostUsedTagsTitle);
  // const tagsContainer = document.createElement('div');
  // tagsContainer.className = 'tags-container';
  // tagsContainer.id = 'downloads-tags-container';
  // mostUsedTags.appendChild(tagsContainer);
  // sidebar.appendChild(mostUsedTags);

  // renderDownloadsTags();
}

function renderDownloadsMosaic(sidebar) {
  const mosaicTitle = document.createElement('h3');
  mosaicTitle.textContent = 'MOSAIC CREATOR';
  sidebar.appendChild(mosaicTitle);

  const mosaicInputContainer = document.createElement('div');
  mosaicInputContainer.className = 'mosaic-container';
  const mosaicInputTitle = document.createElement('h1');
  mosaicInputTitle.textContent = 'Input Image';
  const mosaicInputDiv = document.createElement('div');
  mosaicInputDiv.className = 'mosaic-file-container';
  mosaicInputDiv.textContent = 'Click or drag an image here';
  const mosaicInput = document.createElement('input');
  mosaicInput.className = 'input-container';
  mosaicInput.type = 'file';
  mosaicInput.multiple = false;
  mosaicInput.accept = 'image/*';
  mosaicInput.style.display = 'none';
  mosaicInput.style.pointerEvents = 'none';
  
  const mosaicImage = document.createElement('img');
  mosaicImage.id = 'mosaic-input';
  
  // Handle file change to display image
  mosaicInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (event) => {
        mosaicImage.src = event.target.result;
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  });

  mosaicImage.addEventListener('load', () => {
    mosaicInputDiv.style.color = 'var(--bg-darkest)';
    renderDownloadsOutputPreview();
  });
  
  // Allow clicking the container to open file picker
  mosaicInputDiv.addEventListener('click', () => {
    mosaicInput.click();
  });
  mosaicInputDiv.style.cursor = 'pointer';
  
  // Add drag and drop handlers to the visible container (not the hidden input)
  mosaicInputDiv.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    mosaicInputDiv.classList.add('dragover');
  });
  
  mosaicInputDiv.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    mosaicInputDiv.classList.remove('dragover');
  });
  
  mosaicInputDiv.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    mosaicInputDiv.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    
    // Try alternate approach with DataTransferItemList
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      let fileFound = false;
      
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const item = e.dataTransfer.items[i];
        
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
              mosaicImage.src = event.target.result;
              mosaicInputDiv.classList.add('has-file');
            };
            reader.readAsDataURL(file);
            fileFound = true;
            break;
          }
        } else if (item.kind === 'string') {
          if (item.type === 'text/uri-list' || item.type === 'text/plain') {
            item.getAsString(async (urlString) => {
              try {
                // Extract the URL (remove any whitespace/newlines)
                const imageUrl = urlString.trim().split('\n')[0];
                
                const response = await fetch(imageUrl);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                
                const blob = await response.blob();
                
                const reader = new FileReader();
                reader.onload = (event) => {
                  mosaicImage.src = event.target.result;
                  mosaicInputDiv.classList.add('has-file');
                };
                reader.readAsDataURL(blob);
                fileFound = true;
              } catch (error) {
                // Silently fail if fetch doesn't work
              }
            });
            break;
          }
        }
      }
    } else if (files && files.length > 0) {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        mosaicImage.src = event.target.result;
        mosaicInputDiv.classList.add('has-file');
      };
      reader.readAsDataURL(file);
    }
  });
  
  mosaicInputDiv.appendChild(mosaicInput);
  mosaicInputDiv.appendChild(mosaicImage);
  mosaicInputContainer.appendChild(mosaicInputTitle);
  mosaicInputContainer.appendChild(mosaicInputDiv);
  sidebar.appendChild(mosaicInputContainer);

  const mosaicOutputContainer = document.createElement('div');
  mosaicOutputContainer.className = 'mosaic-container';
  const mosaicOutputTitle = document.createElement('h1');
  mosaicOutputTitle.textContent = 'Output Image';
  const mosaicOutputDiv = document.createElement('div');
  mosaicOutputDiv.className = 'mosaic-file-container';
  const mosaicOutput = document.createElement('div');
  mosaicOutput.className = 'output-container';
  mosaicOutput.id = 'mosaic-output';
  const mosaicProgressBar = document.createElement('div');
  mosaicProgressBar.className = 'mosaic-progress-bar';
  mosaicProgressBar.id = 'mosaic-progress-bar';
  const mosaicProgressRect = document.createElement('div');
  mosaicProgressRect.className = 'mosaic-progress-rect';
  mosaicProgressRect.id = 'mosaic-progress-rect';
  const mosaicProgressText = document.createElement('span');
  mosaicProgressText.className = 'mosaic-progress-text';
  mosaicProgressText.id = 'mosaic-progress-text';
  mosaicProgressText.textContent = '0%';
  mosaicProgressBar.appendChild(mosaicProgressRect);
  mosaicProgressBar.appendChild(mosaicProgressText);
  const mosaicEstimatedTime = document.createElement('span');
  mosaicEstimatedTime.className = 'mosaic-estimated-time';
  mosaicEstimatedTime.id = 'mosaic-estimated-time';
  mosaicEstimatedTime.textContent = '';
  mosaicOutputDiv.appendChild(mosaicOutput);
  mosaicOutputDiv.appendChild(mosaicProgressBar);
  mosaicOutputContainer.appendChild(mosaicOutputTitle);
  mosaicOutputContainer.appendChild(mosaicOutputDiv);
  mosaicOutputContainer.appendChild(mosaicEstimatedTime);
  sidebar.appendChild(mosaicOutputContainer);

  sidebar.appendChild(document.createElement('hr'));

  //add slider to control mosaic tile size (allow 80, 100, 120)
  const tileSizeContainer = document.createElement('div');
  tileSizeContainer.className = 'mosaic-container';
  const tileSizeTitle = document.createElement('h1');
  tileSizeTitle.textContent = 'Tile Size';
  const tileSizeInput = document.createElement('input');
  tileSizeInput.className = 'input-slider';
  tileSizeInput.id = 'tile-size-input';
  tileSizeInput.type = 'range';
  tileSizeInput.min = '80';
  tileSizeInput.max = '120';
  tileSizeInput.value = '80';
  tileSizeInput.step = '20';
  const tileSizeValue = document.createElement('span');
  tileSizeValue.textContent = tileSizeInput.value + 'x' + tileSizeInput.value;
  
  tileSizeInput.addEventListener('input', () => {
    tileSizeValue.textContent = tileSizeInput.value + 'x' + tileSizeInput.value;
    renderDownloadsOutputPreview();
  });
  
  tileSizeContainer.appendChild(tileSizeTitle);
  tileSizeContainer.appendChild(tileSizeValue);
  tileSizeContainer.appendChild(tileSizeInput);
  sidebar.appendChild(tileSizeContainer);

  //add slider to control grid size (allow 100 to 1000 tiles)
  const gridSizeContainer = document.createElement('div');
  gridSizeContainer.className = 'mosaic-container';
  const gridSizeTitle = document.createElement('h1');
  gridSizeTitle.textContent = 'Grid Size';
  const gridSizeInput = document.createElement('input');
  gridSizeInput.className = 'input-slider';
  gridSizeInput.id = 'grid-size-input';
  gridSizeInput.type = 'range';
  gridSizeInput.min = '100';
  gridSizeInput.max = '1000';
  gridSizeInput.value = '100';
  gridSizeInput.step = '50';
  const gridSizeValue = document.createElement('span');
  gridSizeValue.textContent = gridSizeInput.value + ' tiles';
  
  gridSizeInput.addEventListener('input', () => {
    gridSizeValue.textContent = gridSizeInput.value + ' tiles';
  });
  
  gridSizeContainer.appendChild(gridSizeTitle);
  gridSizeContainer.appendChild(gridSizeValue);
  gridSizeContainer.appendChild(gridSizeInput);
  sidebar.appendChild(gridSizeContainer);

  sidebar.appendChild(document.createElement('hr'));
  
  const runMosaicBtn = document.createElement('button');
  runMosaicBtn.className = 'run-mosaic-btn';
  runMosaicBtn.id = 'run-mosaic-btn';
  runMosaicBtn.textContent = 'Build Mosaic';
  runMosaicBtn.addEventListener('click', () => {
    buildMosaic();
  });
  sidebar.appendChild(runMosaicBtn);
}

function buildMosaic() {
  document.getElementById('run-mosaic-btn').disabled = true;
  document.getElementById('mosaic-progress-bar').classList.add('active');
  document.getElementById('tile-size-input').disabled = true;
  document.getElementById('grid-size-input').disabled = true;
  
  // Reset progress bar
  const progressRect = document.getElementById('mosaic-progress-rect');
  if (progressRect) {
    progressRect.style.width = '0%';
  }

  const tileSize = parseInt(document.getElementById('tile-size-input').value) || 80;
  const gridSize = parseInt(document.getElementById('grid-size-input').value) || 100;
  const mosaicInputImg = document.getElementById('mosaic-input');
  
  // Get image dimensions
  const imageWidth = mosaicInputImg.naturalWidth;
  const imageHeight = mosaicInputImg.naturalHeight;
  
  if (!imageWidth || !imageHeight) {
    alert('Error: Unable to get image dimensions. Please ensure an image is loaded.');
    document.getElementById('run-mosaic-btn').disabled = false;
    document.getElementById('mosaic-progress-bar').classList.remove('active');
    return;
  }
  
  // Calculate grid dimensions based on aspect ratio
  const aspectRatio = imageWidth / imageHeight;
  const columns = Math.round(Math.sqrt(gridSize * aspectRatio));
  const rows = Math.round(Math.sqrt(gridSize / aspectRatio));
  
  // Calculate cell dimensions from tile size
  const cellWidth = tileSize;
  const cellHeight = tileSize;
  
  // Convert image to base64
  const canvas = document.createElement('canvas');
  canvas.width = imageWidth;
  canvas.height = imageHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(mosaicInputImg, 0, 0);
  const imageBase64 = canvas.toDataURL('image/png');
  
  // Generate unique request ID
  const requestId = `mosaic-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Call the endpoint
  (async () => {
    try {
      let resultFilename = null;
      let generationCompleted = false;
      const estimatedTimeEl = document.getElementById('mosaic-estimated-time');
      let generationStartTime = Date.now();
      const progressSamples = [];
      let lastProgress = null;
      let lastProgressTime = null;

      if (estimatedTimeEl) {
        estimatedTimeEl.textContent = '';
      }

      const formatEstimatedTime = (seconds) => {
        const totalSeconds = Math.max(0, Math.round(seconds));
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;
        const parts = [];
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        parts.push(`${secs}s`);
        return parts.join(' ');
      };

      const addProgressSample = (progress, time) => {
        if (progressSamples.length > 0) {
          const lastSample = progressSamples[progressSamples.length - 1];
          if (progress < lastSample.progress) return; // ignore regressions
          if (progress === lastSample.progress) {
            lastSample.time = time;
            return;
          }
        }

        progressSamples.push({ progress, time });
        if (progressSamples.length > 6) {
          progressSamples.shift();
        }
      };

      const getSmoothedRate = () => {
        if (progressSamples.length < 2) return null;

        let totalWeight = 0;
        let weightedRate = 0;

        for (let i = 1; i < progressSamples.length; i += 1) {
          const prev = progressSamples[i - 1];
          const cur = progressSamples[i];
          const deltaPct = cur.progress - prev.progress;
          const deltaSeconds = (cur.time - prev.time) / 1000;
          if (deltaPct <= 0 || deltaSeconds <= 0) continue;
          const rate = deltaPct / deltaSeconds;
          const weight = i; // more recent pairs get more weight
          weightedRate += rate * weight;
          totalWeight += weight;
        }

        if (totalWeight === 0) return null;
        return weightedRate / totalWeight;
      };

      let etaList = [];

      const updateEstimatedTime = (progressValue) => {
        if (!estimatedTimeEl) return;
        const progress = Math.max(0, Math.min(100, Number(progressValue) || 0));

        if (progress >= 96) {
          estimatedTimeEl.textContent = 'Estimated time left: 2s';
          return;
        }

        const now = Date.now();
        addProgressSample(progress, now);

        let etaSeconds = null;
        const rate = getSmoothedRate();
        if (rate && rate > 0) {
          const remainingPct = Math.max(0, 96 - progress);
          etaSeconds = remainingPct / rate;
        }

        if (etaSeconds === null && progress > 0) {
          const elapsedSeconds = (now - generationStartTime) / 1000;
          if (elapsedSeconds > 0) {
            const overallRate = progress / elapsedSeconds;
            if (overallRate > 0) {
              const remainingPct = Math.max(0, 96 - progress);
              etaSeconds = remainingPct / overallRate;
            }
          }
        }

        if (etaSeconds !== null && etaSeconds >= 0) {
          etaList.push(etaSeconds);
          estimatedTimeEl.textContent = `Estimated time left: ${formatEstimatedTime(etaSeconds)}`;
        }
      };

      // Step-based animation variables
      let currentProgress = 0;
      let targetProgress = 0;
      let progressIntervalId = null;
      
      // Animation loop that steps towards target progress
      const animateMosaicProgress = () => {
        if (currentProgress < targetProgress) {
          // Calculate the remaining distance to target
          const remainingDistance = targetProgress - currentProgress;
          
          // Move 8% of remaining distance each step for smooth but responsive animation
          const stepSize = Math.max(remainingDistance * 0.08, 0.1);
          currentProgress += stepSize;
          
          // Allow reaching the actual target progress
          if (currentProgress > targetProgress) {
            currentProgress = targetProgress;
          }
        } else if (currentProgress > targetProgress) {
          // If somehow above target, come back down to target
          currentProgress = targetProgress;
        }
        
        const progressRect = document.getElementById('mosaic-progress-rect');
        const progressText = document.getElementById('mosaic-progress-text');
        if (progressRect) {
          progressRect.style.width = currentProgress + '%';
        }
        if (progressText) {
          // Truncate to 2 decimals instead of rounding to show precise values
          const truncatedProgress = Math.floor(currentProgress * 100) / 100;
          progressText.textContent = truncatedProgress.toFixed(2) + '%';
        }
        
        if (!generationCompleted) {
          progressIntervalId = setTimeout(animateMosaicProgress, 500); // Step every 500ms
        }
      };
      
      // Start animation loop
      animateMosaicProgress();
      
      // Define polling function BEFORE starting anything
      const pollProgress = () => {
        if (generationCompleted) return;
        
        const progressUrl = `http://localhost:3001/api/mosaic-progress?requestId=${requestId}`;
        
        setTimeout(() => {
          fetch(progressUrl)
            .then(r => r.json())
            .then(progressData => {
              
              if (progressData.success) {
                const progress = Number(progressData.progress) || 0;
                const now = Date.now();
                lastProgress = progress;
                lastProgressTime = now;
                updateEstimatedTime(progress);
                
                // Progress should only move forward, never backward
                // Use Math.max to ensure we don't regress to lower values
                targetProgress = Math.max(targetProgress, progress);
                
                if (progressData.status === 'completed') {
                  generationCompleted = true;
                  
                  // Cancel animation and set to 100%
                  if (progressIntervalId) {
                    clearTimeout(progressIntervalId);
                  }
                  const progressRect = document.getElementById('mosaic-progress-rect');
                  if (progressRect) {
                    progressRect.style.width = '100%';
                  }
                  if (estimatedTimeEl) {
                    estimatedTimeEl.textContent = '';
                  }
                  
                  // Get filename from progress response
                  const filename = progressData.filename || resultFilename;
                  
                  // Display the result
                  if (filename) {
                    const outputImage = document.getElementById('mosaic-output');
                    const resultImg = document.createElement('img');
                    resultImg.src = `http://localhost:3001/serve-mosaic-file/${encodeURIComponent(filename)}`;
                    resultImg.style.width = '100%';
                    resultImg.style.height = 'auto';
                    resultImg.style.display = 'block';
                    resultImg.style.cursor = 'pointer';
                    outputImage.innerHTML = '';
                    outputImage.appendChild(resultImg);
                    
                    // Add click listener to save mosaic when clicked
                    resultImg.addEventListener('click', async () => {
                      try {
                        if (window.electronAPI && window.electronAPI.saveMosaicFile) {
                          // Electron mode: use IPC to save
                          const result = await window.electronAPI.saveMosaicFile(
                            resultImg.src,
                            `mosaic-${Date.now()}.jpg`
                          );
                          if (result.error) {
                            console.error('Error saving mosaic:', result.error);
                            showToast('Error saving mosaic: ' + result.error, 'error');
                          }
                        } else {
                          // Browser mode: download directly
                          const response = await fetch(resultImg.src);
                          const blob = await response.blob();
                          const url = URL.createObjectURL(blob);
                          const link = document.createElement('a');
                          link.href = url;
                          link.download = `mosaic-${Date.now()}.jpg`;
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                          URL.revokeObjectURL(url);
                        }
                      } catch (err) {
                        console.error('Failed to save mosaic:', err);
                      }
                    });
                  } else {
                    console.warn('[MOSAIC] Status completed but filename is not available');
                  }
                  document.getElementById('run-mosaic-btn').disabled = false;
                  document.getElementById('mosaic-progress-bar').classList.remove('active');
                  document.getElementById('tile-size-input').disabled = false;
                  document.getElementById('grid-size-input').disabled = false;
                } else if (progressData.status === 'error') {
                  generationCompleted = true;
                  
                  // Cancel animation on error
                  if (progressIntervalId) {
                    clearTimeout(progressIntervalId);
                  }
                  throw new Error(progressData.error || 'Generation error occurred');
                } else if (!generationCompleted) {
                  // Continue polling
                  setTimeout(pollProgress, 100);
                }
              } else {
                console.error('[MOSAIC] Progress response not successful:', progressData);
                if (!generationCompleted) {
                  setTimeout(pollProgress, 200);
                }
              }
            })
            .catch(err => {
              console.error('[MOSAIC] Error polling progress:', err);
              if (!generationCompleted) {
                // Continue polling even on error
                setTimeout(pollProgress, 200);
              }
            });
        }, 800); // Slight delay before each poll to avoid tight loop
      };
      
      // Send POST request - will get immediate 202 response
      const postPromise = fetch('http://localhost:3001/api/generate-mosaic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          filename: `mosaic-input-${Date.now()}.png`,
          cellWidth,
          cellHeight,
          columns,
          rows,
          gridSize,
          requestId
        })
      });
      
      // Start polling immediately (in parallel with POST)
      setTimeout(() => {
        pollProgress();
      }, 50); // Small delay to let server start processing
      
      // Wait for initial POST response (202 Accepted)
      const response = await postPromise;
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Mosaic generation failed to start');
      }
      
      // Continue polling until completion - the filename will be available from progress endpoint
      // when status is 'completed'
    } catch (error) {
      console.error('[MOSAIC] Error building mosaic:', error);
      generationCompleted = true;
      if (progressIntervalId) {
        clearTimeout(progressIntervalId);
      }
      alert('Error building mosaic: ' + (error.message || error));
      document.getElementById('run-mosaic-btn').disabled = false;
      setTimeout(() => {
      document.getElementById('mosaic-progress-bar').classList.remove('active');
      }, 500);
      document.getElementById('tile-size-input').disabled = false;
      document.getElementById('grid-size-input').disabled = false;
    }
  })();
}

function renderDownloadsOutputPreview() {
  const outputImage = document.getElementById('mosaic-output');
  const inputImage = document.getElementById('mosaic-input');
  
  const width = inputImage.getBoundingClientRect().width;
  const height = inputImage.getBoundingClientRect().height;

  const ratioX = inputImage.naturalWidth;
  const ratioY = inputImage.naturalHeight;

  const tileSize = document.getElementById('tile-size-input').value || 80;
  
  outputImage.style.width = width + 'px';
  outputImage.style.height = height + 'px';

  outputImage.parentElement.style.backgroundColor = 'var(--bg-darkest)';
  
  const tilesX = Math.round(ratioX / tileSize);
  const tilesY = Math.round(ratioY / tileSize);
  
  const tileWidth = width / tilesX;
  const tileHeight = height / tilesY;
  
  // Clear previous content
  outputImage.innerHTML = '';
  
  // Get the CSS color values
  const root = document.documentElement;
  const darkColor = getComputedStyle(root).getPropertyValue('--surface-darkest').trim();
  const darkestColor = getComputedStyle(root).getPropertyValue('--bg-dark').trim();
  
  // Create SVG for checkerboard pattern
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.style.display = 'block';
  
  for (let y = 0; y < tilesY; y++) {
    for (let x = 0; x < tilesX; x++) {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', x * tileWidth);
      rect.setAttribute('y', y * tileHeight);
      rect.setAttribute('width', tileWidth);
      rect.setAttribute('height', tileHeight);
      
      // Checkerboard pattern: alternate colors
      const isEven = (x + y) % 2 === 0;
      rect.setAttribute('fill', isEven ? darkColor : darkestColor);
      
      svg.appendChild(rect);
    }
  }
  
  outputImage.appendChild(svg);
}

function renderDownloadsStatsChart() {
  if (typeof Chart === 'undefined') return;

  const canvas = document.getElementById('downloads-source-artist-chart');
  if (!canvas) return;

  if (window.downloadsSourceArtistChart) {
    window.downloadsSourceArtistChart.destroy();
    window.downloadsSourceArtistChart = null;
  }

  const posts = Array.isArray(window.allDownloadedPosts) ? window.allDownloadedPosts : [];
  if (!posts.length) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    return;
  }

  const sourceArtistCounts = {};
  posts.forEach(post => {
    const source = (post.source || 'Unknown Source').toString();
    const artist = ((post.artist || post.author || 'Unknown Artist') || 'Unknown Artist').toString();
    sourceArtistCounts[source] = sourceArtistCounts[source] || {};
    sourceArtistCounts[source][artist] = (sourceArtistCounts[source][artist] || 0) + 1;
  });

  const sourceEntries = Object.entries(sourceArtistCounts)
    .map(([source, artists]) => ({
      source,
      total: Object.values(artists).reduce((sum, count) => sum + count, 0),
      artists
    }))
    .sort((a, b) => b.total - a.total);

  const sources = sourceEntries.map(entry => entry.source);
  const artistTotals = {};
  sourceEntries.forEach(entry => {
    Object.entries(entry.artists).forEach(([artist, count]) => {
      artistTotals[artist] = (artistTotals[artist] || 0) + count;
    });
  });

  const sortedArtists = Object.keys(artistTotals)
    .sort((a, b) => artistTotals[b] - artistTotals[a]);

  const palette = [
    '#ff5a5f', '#ffb400', '#00a699', '#7b0051', '#3b8ea5', '#ff6f61', '#7fc8a9', '#f5a623', '#6f4a8e', '#ef476f',
    '#06d6a0', '#118ab2', '#ffd166', '#073b4c', '#ff9f1c', '#2ec4b6', '#e71d36', '#3a86ff', '#ffbe0b', '#8ac926'
  ];

  const datasets = sortedArtists.map((artist, index) => ({
    label: artist,
    data: sources.map(source => sourceArtistCounts[source][artist] || 0),
    backgroundColor: palette[index % palette.length],
    borderWidth: 0
  }));

  const chartData = {
    labels: sources,
    datasets
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        filter: (tooltipItem) => {
          return tooltipItem.parsed?.y > 0;
        },
        itemSort: (a, b) => {
          return (b.parsed?.y || 0) - (a.parsed?.y || 0);
        }
      }
    },
    scales: {
      x: {
        stacked: true
      },
      y: {
        stacked: true,
        beginAtZero: true,
        ticks: {
          precision: 0
        }
      }
    }
  };

  const ctx = canvas.getContext('2d');
  window.downloadsSourceArtistChart = new Chart(ctx, {
    type: 'bar',
    data: chartData,
    options: chartOptions
  });
}

function renderDownloadsActivityChart() {
  if (typeof Chart === 'undefined') return;

  const canvas = document.getElementById('downloads-activity-chart');
  if (!canvas) return;

  if (window.downloadsActivityChart) {
    window.downloadsActivityChart.destroy();
    window.downloadsActivityChart = null;
  }

  const posts = Array.isArray(window.allDownloadedPosts) ? window.allDownloadedPosts : [];
  if (!posts.length) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    return;
  }

  // Group downloads by date (YYYY-MM-DD)
  const dateCounts = {};
  posts.forEach(post => {
    if (post.downloadedAt) {
      const date = new Date(post.downloadedAt);
      const dateStr = date.toISOString().split('T')[0]; // Format: YYYY-MM-DD
      dateCounts[dateStr] = (dateCounts[dateStr] || 0) + 1;
    }
  });

  // Sort dates from newest to oldest
  const sortedDates = Object.keys(dateCounts).sort((a, b) => {
    return new Date(b) - new Date(a);
  });

  const chartData = {
    labels: sortedDates,
    datasets: [{
      label: 'Downloads',
      data: sortedDates.map(date => dateCounts[date]),
      backgroundColor: '#3b8ea5',
      borderWidth: 0
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        mode: 'index',
        intersect: false
      }
    },
    scales: {
      x: {
        beginAtZero: true,
        ticks: {
          display: false
        }
      },
      y: {
        beginAtZero: true,
        ticks: {
          precision: 0
        }
      }
    }
  };

  const ctx = canvas.getContext('2d');
  window.downloadsActivityChart = new Chart(ctx, {
    type: 'bar',
    data: chartData,
    options: chartOptions
  });
}

function renderDownloadsFileTypeChart() {
  if (typeof Chart === 'undefined') return;

  const canvas = document.getElementById('downloads-filetype-chart');
  if (!canvas) return;

  if (window.downloadsFileTypeChart) {
    window.downloadsFileTypeChart.destroy();
    window.downloadsFileTypeChart = null;
  }

  const posts = Array.isArray(window.allDownloadedPosts) ? window.allDownloadedPosts : [];
  if (!posts.length) {
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const typeCounts = {};
  posts.forEach(post => {
    const url = post.originalImageUrl || post.imageUrl || '';
    let ext = '';
    try {
      const pathname = new URL(url).pathname;
      ext = pathname.split('/').pop().split('.').pop().toLowerCase();
    } catch (e) {
      ext = url.split('/').pop().split('.').pop().toLowerCase();
    }
    if (!ext || ext.length > 6 || ext.includes('/') || ext.includes('?')) {
      ext = 'unknown';
    }
    if (ext === url) {
      ext = 'unknown';
    }
    typeCounts[ext] = (typeCounts[ext] || 0) + 1;
  });

  const labels = Object.keys(typeCounts).sort((a, b) => typeCounts[b] - typeCounts[a]);
  const data = labels.map(label => typeCounts[label]);
  const total = data.reduce((sum, value) => sum + value, 0);
  const palette = [
    '#ff5a5f', '#ffb400', '#00a699', '#7b0051', '#3b8ea5', '#ff6f61', '#7fc8a9', '#f5a623', '#6f4a8e', '#ef476f',
    '#06d6a0', '#118ab2', '#ffd166', '#073b4c', '#ff9f1c', '#2ec4b6', '#e71d36', '#3a86ff', '#ffbe0b', '#8ac926'
  ];

  const chartData = {
    labels,
    datasets: [{
      data,
      backgroundColor: labels.map((_, index) => palette[index % palette.length]),
      borderWidth: 0
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          boxWidth: 18,
          padding: 8,
          usePointStyle: true
        }
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const count = context.parsed || 0;
            const label = context.label || 'unknown';
            const pct = total ? ((count / total) * 100).toFixed(1) : '0.0';
            return `${label}: ${count} (${pct}%)`;
          }
        }
      }
    }
  };

  const ctx = canvas.getContext('2d');
  window.downloadsFileTypeChart = new Chart(ctx, {
    type: 'pie',
    data: chartData,
    options: chartOptions
  });
}

function renderDownloadsTags() {
  const container = document.getElementById('downloads-tags-container');
  if (!container) return;

  const posts = Array.isArray(window.allDownloadedPosts) ? window.allDownloadedPosts : [];
  const tagCounts = {};

  posts.forEach(post => {
    let tags = post.tags;
    if (typeof tags === 'string') {
      tags = tags.split(/\s+/);
    }
    if (!Array.isArray(tags)) return;

    tags.forEach(tag => {
      const normalizedTag = String(tag || '').trim();
      if (!normalizedTag) return;
      tagCounts[normalizedTag] = (tagCounts[normalizedTag] || 0) + 1;
    });
  });

  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);

  container.innerHTML = '';
  topTags.forEach(([tag, count]) => {
    const p = document.createElement('p');
    p.className = 'tag';
    p.textContent = `${tag} `;
    const countEl = document.createElement('b');
    countEl.textContent = count;
    p.appendChild(countEl);
    container.appendChild(p);
  });
}

window.renderDownloadsTags = renderDownloadsTags;
window.renderDownloadsActivityChart = renderDownloadsActivityChart;

function updateArtistFilter() {
  const controlBar = document.querySelector('header.control-bar.booru-control-bar');
  const leftControls = controlBar?.querySelector('.booru-control-left');
  if (!leftControls) return;

  const searchInput = document.getElementById('search-filter-input');
  const posts = Array.isArray(window.allDownloadedPosts) ? window.allDownloadedPosts : [];
  const artistSelect = document.getElementById('downloads-artist-select') || document.createElement('select');
  artistSelect.id = 'downloads-artist-select';
  artistSelect.classList.add('js-example-basic-single');
  artistSelect.style.color = 'var(--text-primary)';
  artistSelect.style.width = '100%';

  if (typeof $ !== 'undefined' && $.fn.select2 && $(artistSelect).hasClass('select2-hidden-accessible')) {
    $(artistSelect).select2('destroy');
  }
  if (artistSelect._downloadsArtistChangeListener) {
    artistSelect.removeEventListener('change', artistSelect._downloadsArtistChangeListener);
    artistSelect._downloadsArtistChangeListener = null;
  }

  artistSelect.innerHTML = '';
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = '-';
  artistSelect.appendChild(defaultOption);

  const artistCounts = {};
  posts.forEach(post => {
    const artist = Array.isArray(post.artist)
      ? post.artist.join(' ')
      : post.artist || post.author || 'Unknown';
    artistCounts[artist] = (artistCounts[artist] || 0) + 1;
  });

  Object.keys(artistCounts)
    .sort((a, b) => {
      const countDiff = artistCounts[b] - artistCounts[a];
      return countDiff !== 0 ? countDiff : a.localeCompare(b);
    })
    .forEach(artist => {
      const option = document.createElement('option');
      option.value = artist;
      option.text = artist;
      option.dataset.count = artistCounts[artist];
      artistSelect.appendChild(option);
    });

  function formatArtistOption(option) {
    if (!option.id) return option.text;
    const count = option.element?.dataset?.count;
    const artist = option.text || '';
    const countHtml = count ? ` <span class="artist-count">${count}</span>` : '';
    return `<span class="artist-tag">${artist}</span>${countHtml}`;
  }

  function formatArtistSelection(option) {
    if (!option.id) return option.text;
    return formatArtistOption(option);
  }

  function handleArtistSelection(selectedArtist) {
    if (!searchInput) return;
    searchInput.value = selectedArtist;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  leftControls.querySelectorAll('.control-section-artist').forEach(el => el.remove());
  const artistSection = document.createElement('div');
  artistSection.className = 'control-section control-section-artist control-section';
  artistSection.appendChild(artistSelect);
  const searchSection = leftControls.querySelector('.control-section-search');
  if (searchSection && searchSection.parentNode === leftControls) {
    leftControls.insertBefore(artistSection, searchSection.nextSibling);
  } else {
    leftControls.appendChild(artistSection);
  }

  if (typeof $ !== 'undefined' && $.fn.select2) {
    $(artistSelect).select2({
      width: 'resolve',
      templateResult: formatArtistOption,
      templateSelection: formatArtistSelection,
      escapeMarkup: markup => markup
    }).on('select2:select', function (e) {
      const selectedArtist = e.params?.data?.id || $(this).val();
      handleArtistSelection(selectedArtist);
    });
  } else {
    const artistChangeHandler = () => handleArtistSelection(artistSelect.value);
    artistSelect.addEventListener('change', artistChangeHandler);
    artistSelect._downloadsArtistChangeListener = artistChangeHandler;
  }
}


function updateSourceFilter() {
  const controlBar = document.querySelector('header.control-bar.booru-control-bar');
  const leftControls = controlBar?.querySelector('.booru-control-left');
  if (!leftControls) return;

  const searchInput = document.getElementById('search-filter-input');
  const posts = Array.isArray(window.allDownloadedPosts) ? window.allDownloadedPosts : [];
  const sourceCounts = {};

  posts.forEach(post => {
    const source = (post.source || 'Unknown').toString();
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;
  });

  const sources = Object.entries(sourceCounts)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => {
      const diff = b.count - a.count;
      return diff !== 0 ? diff : a.source.localeCompare(b.source);
    });

  leftControls.querySelectorAll('.control-section-source').forEach(el => el.remove());

  if (!sources.length) return;

  const sourceSelect = document.getElementById('downloads-source-select') || document.createElement('select');
  sourceSelect.id = 'downloads-source-select';
  sourceSelect.classList.add('js-example-basic-single');
  sourceSelect.style.color = 'var(--text-primary)';
  sourceSelect.style.width = '100%';

  if (typeof $ !== 'undefined' && $.fn.select2 && $(sourceSelect).hasClass('select2-hidden-accessible')) {
    $(sourceSelect).select2('destroy');
  }
  if (sourceSelect._downloadsSourceChangeListener) {
    sourceSelect.removeEventListener('change', sourceSelect._downloadsSourceChangeListener);
    sourceSelect._downloadsSourceChangeListener = null;
  }

  sourceSelect.innerHTML = '';
  const sourceDefault = document.createElement('option');
  sourceDefault.value = '';
  sourceDefault.textContent = '-';
  sourceSelect.appendChild(sourceDefault);

  sources.forEach(sourceEntry => {
    const option = document.createElement('option');
    option.value = sourceEntry.source;
    option.text = sourceEntry.source;
    option.dataset.count = sourceEntry.count;
    sourceSelect.appendChild(option);
  });

  const currentSource = searchInput?.dataset?.downloadsSource || '';
  if (currentSource) {
    sourceSelect.value = currentSource;
  }

  function formatSourceOption(option) {
    if (!option.id) return option.text;
    const count = option.element?.dataset?.count;
    const sourceName = option.text || '';
    const countHtml = count ? ` <span class="artist-count">${count}</span>` : '';
    return `<span class="artist-tag">${sourceName}</span>${countHtml}`;
  }

  function formatSourceSelection(option) {
    if (!option.id) return option.text;
    return formatSourceOption(option);
  }

  function handleSourceSelection(selectedSource) {
    if (!searchInput) return;
    if (selectedSource) {
      searchInput.dataset.downloadsSource = selectedSource;
    } else {
      delete searchInput.dataset.downloadsSource;
    }
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  }

  leftControls.querySelectorAll('.control-section-source').forEach(el => el.remove());
  const sourceSection = document.createElement('div');
  sourceSection.className = 'control-section control-section-source control-section';
  sourceSection.appendChild(sourceSelect);
  const searchSection = leftControls.querySelector('.control-section-search');
  if (searchSection && searchSection.parentNode === leftControls) {
    leftControls.insertBefore(sourceSection, searchSection.nextSibling);
  } else {
    leftControls.appendChild(sourceSection);
  }

  if (typeof $ !== 'undefined' && $.fn.select2) {
    $(sourceSelect).select2({
      width: 'resolve',
      templateResult: formatSourceOption,
      templateSelection: formatSourceSelection,
      escapeMarkup: markup => markup
    }).on('select2:select', function (e) {
      const selected = e.params?.data?.id || $(this).val();
      handleSourceSelection(selected);
      document.getElementById('reload-booru-btn')?.dispatchEvent(new Event('click', { bubbles: true }));
      document.getElementById('reload-booru-btn')?.dispatchEvent(new Event('blur', { bubbles: true }));
    });
  } else {
    const sourceChangeHandler = () => handleSourceSelection(sourceSelect.value);
    sourceSelect.addEventListener('change', sourceChangeHandler);
    sourceSelect._downloadsSourceChangeListener = sourceChangeHandler;
  }
}


// Expose filter helpers globally so they can be called outside showDownloadsGallery.
window.updateArtistFilter = updateArtistFilter;
window.updateSourceFilter = updateSourceFilter;

function updateDownloadFolderDisplay() {
  const btn = document.getElementById('select-download-folder-btn');
  if (btn && window.downloadFolder) {
    btn.title = `Download folder: ${window.downloadFolder}`;
    btn.style.color = 'var(--accent)';
  }
}

let searchHandlerTimeout = null;

function getDownloadsDateSortOrder() {
  if (window.sessionDownloadsDateSortOrder !== undefined) {
    return window.sessionDownloadsDateSortOrder;
  }
  const saved = localStorage.getItem('downloadsDateSortOrder');
  if (saved === 'asc' || saved === 'desc') {
    window.sessionDownloadsDateSortOrder = saved;
    return saved;
  }
  window.sessionDownloadsDateSortOrder = 'desc';
  return 'desc';
}

function setDownloadsDateSortOrder(order) {
  if (order !== 'asc' && order !== 'desc') {
    return;
  }
  window.sessionDownloadsDateSortOrder = order;
  localStorage.setItem('downloadsDateSortOrder', order);
}

function sortDownloadedPosts(posts) {
  if (!Array.isArray(posts)) return posts;
  const order = getDownloadsDateSortOrder();
  posts.sort((a, b) => {
    const dateA = a.downloadedAt || 0;
    const dateB = b.downloadedAt || 0;
    return order === 'asc' ? dateA - dateB : dateB - dateA;
  });
  return posts;
}

// Function to show downloads gallery
async function showDownloadsGallery(forceReload = false) {

  if (window.isViewingDownloadsGallery && !forceReload) return; // Already on downloads

  const appContent = document.getElementById('app-content');
  const booruGallery = document.getElementById('booru-gallery');
  cleanupDownloadsGallery();
  booruGallery.innerHTML = '<i class="fas fa-circle-notch fa-spin image-loader" style="position: relative; color: var(--accent); font-size: 60px; width: 100%; height: 200px; line-height: 200px; text-align: center;"></i>';
  document.getElementById('load-more-icon')?.remove();
  const booruCounter = document.getElementById('booru-total-count');
  booruCounter.innerHTML = ''; // Clear total count
  
  // Abort any ongoing Booru loading
  if (currentAbortController) {
    currentAbortController.abort();
  }

  const artistSeperators = galleryWrapper.querySelectorAll('.artist-separator');
  artistSeperators.forEach(sep => sep.remove());
  
  // Hide scroller if it's visible
  const scrollerContent = document.getElementById('scroller-content');
  if (scrollerContent) {
    scrollerContent.style.display = 'none';
  }
  
  // Show booru content
  const booruContent = document.getElementById('booru-content');
  if (booruContent) {
    booruContent.style.display = 'block';
  }
  
  window.isViewingDownloadsGallery = true;
  window.isViewingScroller = false;
  activeTabId = null; // Clear active tab
  const showDownloadsBtn = document.getElementById('show-downloads-gallery-btn');
  const showScrollerBtn = document.getElementById('show-scroller-btn');
  // 1. Set downloads button active, remove active from scroller and all booru tabs
  if (showDownloadsBtn) showDownloadsBtn.classList.add('active');
  if (showScrollerBtn) showScrollerBtn.classList.remove('active');
  document.querySelectorAll('.booru-tab-item.active').forEach(tab => tab.classList.remove('active'));
  // 2. Set search input to downloads search text
  const searchInput = document.getElementById('search-filter-input');
  // Save current search to active tab before switching
  if (activeTabId && typeof saveCurrentTabState === 'function' && searchInput) {
    const currentTab = booruTabs.find(t => t.id === activeTabId);
    if (currentTab) {
      currentTab.state = currentTab.state || {};
      currentTab.state.searchTags = searchInput.value;
      saveCurrentTabState();
    }
  }

  // Restore downloads image size if available
  const imageSizeSlider = document.getElementById('image-size-slider');
  if (imageSizeSlider && window.sessionDownloadsImageSize !== undefined) {
    imageSizeSlider.value = window.sessionDownloadsImageSize;
    imageSizeSlider.dispatchEvent(new Event('input', { bubbles: true }));
  }

  if (searchInput) {
    searchInput.value = window.downloadsSearchText || '';
  }

  // 3. Filter header controls: keep only .control-section-primary, .control-section-search, .control-section-slider, .control-section-limit, .control-section-artist, .control-section-source, .control-section-downloads-date-order, #select-download-folder-btn
  const controlBar = document.querySelector('header.control-bar.booru-control-bar');
  if (controlBar) {
    // Hide all children except allowed ones
    controlBar.querySelectorAll('.booru-control-left > *:not(.control-section-primary):not(.control-section-search):not(.control-section-slider):not(.control-section-limit):not(.control-section-artist):not(.control-section-source):not(.control-section-downloads-date-order)').forEach(el => el.style.display = 'none');
    controlBar.querySelectorAll('.booru-control-right > *:not(#select-download-folder-btn)').forEach(el => el.style.display = 'none');
    // Explicitly show the allowed left controls in case they were hidden previously
    controlBar.querySelectorAll('.control-section-primary, .control-section-search, .control-section-slider, .control-section-limit, .control-section-artist, .control-section-source, .control-section-downloads-date-order').forEach(el => el.style.display = '');
    // Hide ai filter and sort section (keep reload button visible)
    const aiFilter = controlBar.querySelector('#ai-filter-toggle');
    if (aiFilter) aiFilter.style.display = 'none';
    const sortSection = controlBar.querySelector('.control-section-sort');
    if (sortSection) sortSection.style.display = 'none';

    const galleryQualityToggleBtn = document.getElementById('gallery-quality-toggle');
    if (galleryQualityToggleBtn) galleryQualityToggleBtn.style.display = 'none';

    const leftControls = controlBar.querySelector('.booru-control-left');
    const searchSection = controlBar.querySelector('.control-section-search');
    let downloadsDateSortSection = controlBar.querySelector('.control-section-downloads-date-order');
    if (!downloadsDateSortSection && leftControls) {
      downloadsDateSortSection = document.createElement('div');
      downloadsDateSortSection.className = 'control-section control-select control-section-downloads-date-order';
      downloadsDateSortSection.innerHTML = `
        <div class="section-label">Date</div>
        <select id="downloads-date-sort-select" class="select-minimal">
          <option value="desc">Newest</option>
          <option value="asc">Oldest</option>
        </select>
      `;
      leftControls.insertBefore(downloadsDateSortSection, searchSection?.nextSibling || null);
    }
    const downloadsDateSortSelect = document.getElementById('downloads-date-sort-select');
    if (downloadsDateSortSelect) {
      downloadsDateSortSelect.value = getDownloadsDateSortOrder();
      downloadsDateSortSelect.addEventListener('change', () => {
        setDownloadsDateSortOrder(downloadsDateSortSelect.value);
        if (window.downloadsGalleryOriginalPosts) {
          sortDownloadedPosts(window.downloadsGalleryOriginalPosts);
        }
        document.getElementById('search-filter-input')?.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    
    // Add shuffle button before search input if not already added (original logic)
    // Always remove sort by artist button before adding (prevents it from appearing in regular galleries)
    const existingSortArtistBtn = document.getElementById('downloads-sort-artist-btn');
    if (existingSortArtistBtn) existingSortArtistBtn.remove();
    if (searchSection && !document.getElementById('downloads-shuffle-btn')) {
      // Shuffle Button (existing logic)
      const shuffleBtn = document.createElement('button');
      shuffleBtn.id = 'downloads-shuffle-btn';
      shuffleBtn.className = 'btn-icon';
      shuffleBtn.title = 'Shuffle downloads';
      shuffleBtn.innerHTML = '<i class="fas fa-random"></i>';
      shuffleBtn.addEventListener('click', () => {
        // Shuffle the current posts array
        if (window.allDownloadedPosts && window.allDownloadedPosts.length > 0) {
          // Fisher-Yates shuffle algorithm
          const shuffled = [...window.allDownloadedPosts];
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }
          window.allDownloadedPosts = shuffled;
          window.downloadsPaginationIndex = 0;
          const limit = parseInt(document.getElementById('booru-limit-input')?.value) || 100;
          const initialPosts = shuffled.slice(0, limit);
          window.booruPosts = initialPosts;
          window.downloadsPaginationIndex = limit;
          window.hasMoreResults = limit < shuffled.length;
          if (booruGallery) {
            if (typeof $.fn.justifiedGallery !== 'undefined') {
              $(booruGallery).find('img').off('load error');
              $(booruGallery).justifiedGallery('destroy');
            }
            const galleryWrapper = document.getElementById('gallery-wrapper');
            galleryWrapper.querySelectorAll('.booru-gallery:not([id])').forEach(gallery => gallery.remove());
            const artistSeperators = galleryWrapper.querySelectorAll('.artist-separator');
            artistSeperators.forEach(separator => separator.remove());
            const booruGalleryTemp = document.getElementById('booru-gallery');
            booruGalleryTemp.innerHTML = '';
          }
          const seperateByArtist = document.getElementById('downloads-sort-artist-btn')?.classList.contains('btn-accent');
          renderBooruGallery(initialPosts, false, seperateByArtist);
          showToast('Downloads shuffled', 'success');
        }
      });
      const primarySection = controlBar.querySelector('.control-section-primary');
      primarySection.appendChild(shuffleBtn);
    }
    // Add sort by artist button ONLY in downloads gallery
    if (window.isViewingDownloadsGallery && searchSection && !document.getElementById('downloads-sort-artist-btn')) {
      const sortArtistBtn = document.createElement('button');
      sortArtistBtn.id = 'downloads-sort-artist-btn';
      sortArtistBtn.className = 'btn-icon';
      sortArtistBtn.title = 'Sort by Artist';
      sortArtistBtn.innerHTML = '<i class="fa-solid fa-bars"></i>';
      // Restore toggle state from session/localStorage
      let sortByArtist = false;
      if (window.sessionSortByArtist !== undefined) {
        sortByArtist = window.sessionSortByArtist;
      } else {
        const saved = localStorage.getItem('downloadsSortByArtist');
        sortByArtist = saved === 'true';
        window.sessionSortByArtist = sortByArtist;
      }
      if (sortByArtist) sortArtistBtn.classList.add('btn-accent');
      sortArtistBtn.addEventListener('click', () => {
        sortByArtist = !sortByArtist;
        window.sessionSortByArtist = sortByArtist;
        localStorage.setItem('downloadsSortByArtist', sortByArtist);
        if (sortByArtist) {
          sortArtistBtn.classList.add('btn-accent');
        } else {
          sortArtistBtn.classList.remove('btn-accent');
        }
        if (sortByArtist) {
          document.getElementById('search-filter-input')?.dispatchEvent(new Event('input', { bubbles: true }));
          document.getElementById('search-filter-input')?.dispatchEvent(new Event('blur', { bubbles: true }));
        } else {
          document.getElementById('reload-booru-btn')?.dispatchEvent(new Event('click', { bubbles: true }));
          document.getElementById('reload-booru-btn')?.dispatchEvent(new Event('blur', { bubbles: true }));
        }
        if (typeof saveSession === 'function') saveSession();
      });
      const primarySection = controlBar.querySelector('.control-section-primary');
      primarySection.appendChild(sortArtistBtn);
    }
    // Remove sort by artist button if it exists when not in downloads gallery
    if (!window.isViewingDownloadsGallery) {
      const sortArtistBtn = document.getElementById('downloads-sort-artist-btn');
      if (sortArtistBtn) sortArtistBtn.remove();
    }
  }
  // Show the control bar
  if (controlBar) {
    controlBar.style.display = 'flex';
  }

  let downloadedPosts = await dbStore.getAllDownloadedPosts();

  // 4. Render downloads gallery
  if (typeof dbStore !== 'undefined' && dbStore) {
    // Filter out posts where files don't exist on the server
    const filenames = downloadedPosts.map(p => getFilenameFromUrl(p.imageUrl, p.id));
    try {
      const response = await fetch('http://localhost:3001/check-downloaded-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filenames })
      });
      
      if (response.ok) {
        const data = await response.json();
        const existingFiles = new Set(Object.keys(data.downloaded).filter(f => data.downloaded[f]));
        const beforeCount = downloadedPosts.length;
        const removedPosts = downloadedPosts.filter(p => {
          const filename = getFilenameFromUrl(p.imageUrl, p.id);
          return !existingFiles.has(filename);
        });
        downloadedPosts = downloadedPosts.filter(p => {
          const filename = getFilenameFromUrl(p.imageUrl, p.id);
          return existingFiles.has(filename);
        });
        if (removedPosts.length > 0) {
          const count = removedPosts.length;
          console.log(`Cannot find ${count} posts with missing files`);
          
          showConfirmToast(
            `Cannot find ${count} posts with missing files. Remove from database?`,
            () => {
              // Yes - Remove posts from database
              removedPosts.forEach(p => {
                if (dbStore) {
                  dbStore.removeDownloadedPost(p.id).catch(err => {
                    console.error(`Failed to remove post ${p.id} from database:`, err);
                  });
                } else {
                  console.warn('dbStore not available, cannot remove post:', p.id);
                }
              });
              showToast(`Removed ${count} posts with missing files`, 'success');
              window.updateAppLoadingDownloadCount();
            },
            () => {
              // No - Do nothing
              console.log('User chose not to remove posts with missing files');
            }
          );
        }
      }
    } catch (err) {
      console.warn('Could not verify file existence, showing all posts:', err);
    }
    
    // Ensure author is set to artist for downloaded posts
    downloadedPosts.forEach(p => {
      if (p.artist && p.artist !== 'Unknown') {
        p.author = p.artist;
      }
      // Convert remote URLs to local URLs for downloaded files
      // Store original URLs for reference but use local serving for display
      if (p.imageUrl) {
        p.originalImageUrl = p.imageUrl;
        const filename = getFilenameFromUrl(p.imageUrl, p.id);
        // Preserve file type detection by keeping extension in imageUrl
        p.imageUrl = `http://localhost:3001/serve-local-file/${encodeURIComponent(filename)}`;
        p.thumbnailUrl = p.imageUrl; // Use same local file for thumbnail (already full quality)
      }
    });
    const uniqueArtists = [...new Set(downloadedPosts.map(p => p.artist || p.author || 'Unknown'))];
    // Sort by download date, newest first
    if (Array.isArray(downloadedPosts)) {
      if (downloadedPosts.length > 0 && downloadedPosts.some(p => p.downloadedAt)) {
        sortDownloadedPosts(downloadedPosts);
      } else {
        downloadedPosts.reverse();
      }
    }

    if (booruGallery) {
      booruGallery.innerHTML = '';
      document.getElementById('load-more-icon')?.remove();
      booruGallery.classList.add('downloads-gallery');
    }
    // Set window properties for lightbox navigation and pagination
    window.downloadsGalleryOriginalPosts = downloadedPosts;
    window.allDownloadedPosts = downloadedPosts; // Store current result set
    window.booruPosts = []; // Will be filled incrementally
    window.downloadsPaginationIndex = 0; // Track current pagination position
    window.hasMoreResults = true;
    window.totalResultCount = downloadedPosts.length;
    
    // Load initial batch based on limit input
    const limit = parseInt(document.getElementById('booru-limit-input')?.value) || 100;
    const initialPosts = downloadedPosts.slice(0, limit);
    window.booruPosts = initialPosts;
    window.downloadsPaginationIndex = limit;
    window.hasMoreResults = limit < downloadedPosts.length;

    // Set booruTotalCount to downloads count
    if (booruTotalCount) {
      booruTotalCount.innerHTML = `DOWNLOADS <b>${downloadedPosts.length}</b>`;
      booruTotalCount.style.display = 'block';
    }
    // 5. Enable search filter for downloads gallery
    if (searchInput) {
      const downloadsSearchHandler = function() {
        window.downloadsSearchText = searchInput.value;
        window.debouncedSave();
        const val = searchInput.value.trim().toLowerCase();
        const selectedSource = document.getElementById('downloads-source-select')?.value;
        const sourcePosts = window.downloadsGalleryOriginalPosts || downloadedPosts;
        
        // Check if search contains OR operator ||
        const hasOrOperator = val.includes('||');
        let filterGroups = [];
        
        if (hasOrOperator) {
          // Split by || to create OR groups
          filterGroups = val.split('||').map(group => group.trim()).filter(g => g.length > 0);
        } else {
          // No OR operator, treat entire search as single AND group
          filterGroups = val.length > 0 ? [val] : [];
        }
        
        const filtered = sourcePosts.filter(post => {
          if (selectedSource && post.source !== selectedSource) {
            return false;
          }
          
          // If no filter groups, include all posts
          if (!filterGroups.length) {
            return true;
          }
          
          const tags = post.tags || [];
          const artist = Array.isArray(post.artist)
            ? post.artist.join(' ').toLowerCase()
            : (post.artist || '').toLowerCase();
          
          // Check if post matches any of the OR groups (OR logic between groups)
          return filterGroups.some(group => {
            const tokens = group.split(/\s+/);
            // Within each group, all tokens must match (AND logic)
            return tokens.every(token => {
              return tags.some(tag => tag.toLowerCase().startsWith(token)) || artist.startsWith(token);
            });
          });
        });
        // Reset pagination for filtered results
        window.allDownloadedPosts = filtered;
        window.downloadsPaginationIndex = 0;
        const limit = parseInt(document.getElementById('booru-limit-input')?.value) || 100;
        const initialPosts = filtered.slice(0, limit);
        window.booruPosts = initialPosts;
        window.downloadsPaginationIndex = limit;
        window.hasMoreResults = limit < filtered.length;

        const galleryWrapper = document.getElementById('gallery-wrapper');
        galleryWrapper.querySelectorAll('.booru-gallery:not([id])').forEach(gallery => gallery.remove());
        const artistSeperators = galleryWrapper.querySelectorAll('.artist-separator');
        artistSeperators.forEach(separator => separator.remove());
        const booruGalleryTemp = document.getElementById('booru-gallery');
        booruGalleryTemp.innerHTML = '';
        
        const seperateByArtist = document.getElementById('downloads-sort-artist-btn')?.classList.contains('btn-accent');
        renderBooruGallery(initialPosts, false, seperateByArtist);
        // Update booruTotalCount to filtered count
        if (booruTotalCount) {
          booruTotalCount.innerHTML = `DOWNLOADS <b>${filtered.length}</b>`;
        }
      };
      searchInput.addEventListener('input', () => {
        if (window.isViewingDownloadsGallery) {
          if (searchHandlerTimeout) {
            clearTimeout(searchHandlerTimeout);
          }
          searchHandlerTimeout = setTimeout(() => {
            downloadsSearchHandler();
          }, 400);
        }
      });
      // Store the handler for removal later
      searchInput._downloadsSearchHandler = downloadsSearchHandler;
    }

    updateSourceFilter();
    updateArtistFilter();
    
    const endMessage = document.querySelector('.booru-end-message');
    if (endMessage) endMessage.style.display = 'none';

    setTimeout(() => {
      if (booruGallery && document.getElementById('show-downloads-gallery-btn').classList.contains('active')) {
        booruGallery.classList.add('downloads-gallery');
      }
    }, 2000);
    document.getElementById('search-filter-input')?.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('search-filter-input')?.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  if (appContent) {
    const existingSidebar = document.getElementById('downloads-sidebar');
    if (existingSidebar) {
      existingSidebar.remove();
    }
    const downloadsSidebar = document.createElement('div');
    downloadsSidebar.id = 'downloads-sidebar';
    downloadsSidebar.className = 'downloads-sidebar';
    appContent.appendChild(downloadsSidebar);
    renderDownloadsSidebar();
  }

  // Save the state
  if (window.debouncedSave) window.debouncedSave();
}

// Make it global
window.showDownloadsGallery = showDownloadsGallery;

function cleanupDownloadsGallery() {
  const galleryWrapper = document.getElementById('gallery-wrapper');
  if (!galleryWrapper) return;

  galleryWrapper.querySelectorAll('.booru-gallery:not(#booru-gallery)').forEach(gallery => {
    if (typeof cleanupGallery !== 'undefined') {
      cleanupGallery(gallery);
    }
    gallery.remove();
  });
  galleryWrapper.querySelectorAll('.artist-separator').forEach(sep => sep.remove());

  const booruGallery = document.getElementById('booru-gallery');
  if (!booruGallery) return;

  if (typeof $ !== 'undefined' && typeof $.fn.justifiedGallery !== 'undefined') {
    try {
      $(booruGallery).find('img').off('load error');
      $(booruGallery).justifiedGallery('destroy');
    } catch (e) {
      console.warn('Failed to destroy justifiedGallery during downloads cleanup:', e);
    }
  }

  if (typeof cleanupGallery !== 'undefined') {
    cleanupGallery(booruGallery);
  } else {
    booruGallery.innerHTML = '';
    document.getElementById('load-more-icon')?.remove();
  }
  booruGallery.style.height = '300px';
}

if (!window._booruPreviewFreezeMousedownListenerInstalled) {
  window._booruPreviewFreezeMousedownListenerInstalled = true;
  document.addEventListener('mousedown', (e) => {
    if (e.button === 1) {
      const previewMedia = document.querySelector('.booru-hover-preview-media img, .booru-hover-preview-media video');
      if (previewFrozen && previewMedia && e.target === previewMedia && typeof window.resetPreviewFrozen === 'function') {
        window.resetPreviewFrozen();
      }
    }
  });
}

// Initialize booru browser
function initBooruBrowser() {
  // Tag suggestions are queried on demand to avoid loading the full table on launch.
  window.isViewingDownloadsGallery = false;
  // Add handler for show-downloads-gallery-btn
  const showDownloadsBtn = document.getElementById('show-downloads-gallery-btn');
  if (showDownloadsBtn) {
    showDownloadsBtn.addEventListener('click', async () => {
      await showDownloadsGallery();
    });
  }
  // Add handler for show-scroller-btn
  const showScrollerBtn = document.getElementById('show-scroller-btn');
  if (showScrollerBtn) {
    showScrollerBtn.addEventListener('click', () => {
      showScrollerBtn.classList.add('active');
      if (showDownloadsBtn) showDownloadsBtn.classList.remove('active');
      document.querySelectorAll('.booru-tab-item.active').forEach(tab => tab.classList.remove('active'));
      window.isViewingDownloadsGallery = false;
      window.isViewingScroller = true;
      activeTabId = null;
      
      // Reset downloads pagination state
      window.allDownloadedPosts = null;
      window.downloadsPaginationIndex = 0;
      
      // Remove shuffle button if it exists
      const shuffleBtn = document.getElementById('downloads-shuffle-btn');
      if (shuffleBtn) shuffleBtn.remove();
      const sortArtistBtn = document.getElementById('downloads-sort-artist-btn');
      if (sortArtistBtn) sortArtistBtn.remove();
      
      const booruContent = document.getElementById('booru-content');
      if (booruContent) {
        booruContent.style.display = 'none';
      }

      const existingSidebar = document.getElementById('downloads-sidebar');
      if (existingSidebar)
        existingSidebar.remove();

      const contentParent = booruContent.parentElement;
      
      // Filter header controls: keep only ai-filter-toggle, reload-booru-btn, source select, and select-download-folder-btn
      const controlBar = document.querySelector('header.control-bar.booru-control-bar');
      if (controlBar) {
        // Hide all children of booru-control-left except ai-filter and reload button (which are in control-section-primary)
        controlBar.querySelectorAll('.booru-control-left > *:not(.control-section-primary)').forEach(el => el.style.display = 'none');
        // Show ai-filter-toggle and reload-booru-btn in control-section-primary
        const primarySection = controlBar.querySelector('.control-section-primary');
        if (primarySection) {
          primarySection.querySelectorAll('button:not(#ai-filter-toggle):not(#reload-booru-btn)').forEach(btn => btn.style.display = 'none');
          const aiFilter = primarySection.querySelector('#ai-filter-toggle');
          const reloadBtn = primarySection.querySelector('#reload-booru-btn');
          if (aiFilter) aiFilter.style.display = '';
          if (reloadBtn) reloadBtn.style.display = '';
        }
        // Hide all children of booru-control-right except select-download-folder-btn
        controlBar.querySelectorAll('.booru-control-right > *:not(#select-download-folder-btn)').forEach(el => el.style.display = 'none');
        // Show the control bar
        controlBar.style.display = 'flex';
      }

      // Check if scroller already exists, if so just show it
      let scrollerContent = document.getElementById('scroller-content');
      if (scrollerContent) {
        scrollerContent.style.display = 'block';
        // Save state
        if (window.debouncedSave) window.debouncedSave();
        return; // Exit early, scroller already initialized
      }

      // Fill scroller with content (only if doesn't exist)
      if (contentParent) {

        scrollerContent = document.createElement('div');
        scrollerContent.id = 'scroller-content';
        scrollerContent.className = 'shorts-scroller';

        // Create main container
        const mainContainer = document.createElement('div');
        mainContainer.className = 'shorts-main-container';

        // Create left container (flex grow)
        const leftContainer = document.createElement('div');
        leftContainer.className = 'shorts-side-container shorts-left-container';

        // Create middle container
        const middleContainer = document.createElement('div');
        middleContainer.className = 'shorts-middle-container';

        // Create phone viewport
        const phoneViewport = document.createElement('div');
        phoneViewport.className = 'shorts-phone-viewport';
        phoneViewport.id = 'shorts-phone-viewport';

        // Create posts container (will hold multiple posts)
        const postsContainer = document.createElement('div');
        postsContainer.className = 'shorts-posts-container';
        postsContainer.id = 'shorts-posts-container';

        phoneViewport.appendChild(postsContainer);
        middleContainer.appendChild(phoneViewport);

        // Create right container (flex grow)
        const rightContainer = document.createElement('div');
        rightContainer.className = 'shorts-side-container shorts-right-container';

        // Create sidebar with tags
        const tagsSidebar = document.createElement('div');
        tagsSidebar.className = 'shorts-tags-sidebar';
        tagsSidebar.id = 'shorts-tags-sidebar';

        const tagsContent = document.createElement('div');
        tagsContent.className = 'shorts-tags-content';
        tagsContent.id = 'shorts-tags-content';

        const tagsFooter = document.createElement('div');
        tagsFooter.className = 'booru-hover-preview-footer';
        tagsFooter.id = 'shorts-tags-footer';
        tagsFooter.innerHTML = '<div class="booru-hover-preview-author" id="shorts-author-container"></div>';

        tagsSidebar.appendChild(tagsContent);
        tagsSidebar.appendChild(tagsFooter);

        rightContainer.appendChild(tagsSidebar);

        mainContainer.appendChild(leftContainer);
        mainContainer.appendChild(middleContainer);
        mainContainer.appendChild(rightContainer);

        // Create dark overlay for backgrounds
        const darkOverlay = document.createElement('div');
        darkOverlay.className = 'shorts-dark-overlay';
        scrollerContent.appendChild(darkOverlay);

        scrollerContent.appendChild(mainContainer);
        contentParent.appendChild(scrollerContent);

        // Initialize scroller functionality
        initializeScroller();
      }

      // Initialize scroller with scroll snap and API fetching
      function initializeScroller() {
        const scrollerContent = document.getElementById('scroller-content');
        const phoneViewport = document.getElementById('shorts-phone-viewport');
        const postsContainer = document.getElementById('shorts-posts-container');
        const tagsContent = document.getElementById('shorts-tags-content');
        const postIndexDisplay = document.getElementById('post-index');

        let currentPostIndex = 0;
        let posts = [];
        let isLoading = false;
        let scrollTimeout = null;
        let animationFrameId = null;
        let activeBackgroundLayer = 1; // Track which layer is currently visible (1 or 2)

        // Fetch posts from API
        async function fetchPosts(retries = 3) {
          if (isLoading) return;
          isLoading = true;

          try {
            const favoriteTags = ['femboy', 'girly', 'crossdressing', 'cute'];
            const filterDownloaded = true;
            const filterAI = !document.getElementById('ai-filter-toggle').classList.contains('active');
            
            const url = `http://localhost:3001/api/recommended-posts?favoriteTags=${encodeURIComponent(favoriteTags.join(','))}&filterDownloaded=${filterDownloaded}&filterAI=${filterAI}`;
            
            const response = await fetch(url);
            
            if (!response.ok) {
              if (response.status === 500 && retries > 0) {
                // Retry on 500 error
                isLoading = false;
                await new Promise(resolve => setTimeout(resolve, 500));
                return fetchPosts(retries - 1);
              }
              throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!data.posts || data.posts.length === 0) {
              // Retry if empty
              if (retries > 0) {
                isLoading = false;
                await new Promise(resolve => setTimeout(resolve, 500));
                return fetchPosts(retries - 1);
              }
              throw new Error('No posts returned');
            }

            for (let i = 0; i < data.posts.length; i++) {
              const post = data.posts[i];
              const artists = post.artist?.filter(item => item.type === "artist")?.map(item => item.tag) ?? ['?'];
              data.posts[i].artist = artists; // Store artists in post object for later use
            }
            
            posts = [...posts, ...data.posts];
            renderPosts();
          } catch (error) {
            console.error('Error fetching posts:', error);
            showToast('Error fetching posts: ' + error.message, 'error');
          } finally {
            isLoading = false;
          }
        }

        // Render posts to container
        function renderPosts() {
          const newPosts = posts.slice(postsContainer.children.length);
          
          newPosts.forEach((post, index) => {
            const postDiv = document.createElement('div');
            postDiv.className = 'shorts-post';
            postDiv.dataset.postIndex = postsContainer.children.length + index;
            postDiv.dataset.postId = post.id;
            postDiv.dataset.postSource = 'rule34';

            const imageContainer = document.createElement('div');
            imageContainer.className = 'shorts-image-container';

            const img = document.createElement('img');
            img.src = getImageUrl(post.image_url || post.sample_url || post.high_quality_url);
            img.alt = `Post ${post.id}`;
            img.className = 'shorts-image';
            img.dataset.artists = post.artist.join(', ');

            // Load high quality image in background once preview is loaded
            const highQualityUrl = post.high_quality_url || post.sample_url;
            if (highQualityUrl && highQualityUrl !== (post.image_url || post.sample_url || post.high_quality_url)) {
              img.addEventListener('load', () => {
                // Add loading spinner overlay
                const loadingOverlay = document.createElement('div');
                loadingOverlay.className = 'preview-loading-overlay';
                loadingOverlay.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
                loadingOverlay.style.cssText = `
                  position: absolute;
                  top: 10px;
                  right: 10px;
                  width: 45px;
                  height: 45px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  background: rgba(0, 0, 0, 0.5);
                  border-radius: 50%;
                  color: var(--accent);
                  font-size: 28px;
                  z-index: 10;
                `;
                imageContainer.style.position = 'relative';
                imageContainer.appendChild(loadingOverlay);
                
                // Preload high quality image
                const highQualityImg = new Image();
                highQualityImg.onload = () => {
                  // Swap to high quality once loaded
                  img.src = getImageUrl(highQualityUrl);
                  img.dataset.highQualityLoaded = 'true';
                  // Remove loading overlay
                  loadingOverlay.remove();
                };
                highQualityImg.src = getImageUrl(highQualityUrl);
              }, { once: true });
            }

            imageContainer.appendChild(img);
            
            // Add download button
            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'booru-download-btn';
            downloadBtn.innerHTML = '<i class="fas fa-download"></i>';
            downloadBtn.title = 'Download';
            
            // Add progress bar (hidden by default)
            const progressContainer = document.createElement('div');
            progressContainer.className = 'booru-download-progress';
            progressContainer.style.display = 'none';
            const progressBar = document.createElement('div');
            progressBar.className = 'booru-download-progress-bar';
            progressBar.style.width = '0%';
            progressContainer.appendChild(progressBar);
            
            // Store download state - set to true if viewing downloads gallery (these are already downloaded)
            const isFromDownloadsGallery = window.isViewingDownloadsGallery || post.downloadedAt;
            postDiv.dataset.downloaded = isFromDownloadsGallery ? 'true' : 'false';
            
            // Store hover handlers for removal later
            let hoverHandlers = null;
            
            // If from downloads gallery, set button to downloaded state immediately
            if (isFromDownloadsGallery) {
              downloadBtn.innerHTML = '<i class="fas fa-check"></i>';
              downloadBtn.classList.add('downloaded');
              downloadBtn.title = 'Delete';
              
              // Add hover handlers for downloaded state
              const mouseEnterHandler = () => {
                downloadBtn.innerHTML = '<i class="fas fa-times"></i>';
              };
              const mouseLeaveHandler = () => {
                downloadBtn.innerHTML = '<i class="fas fa-check"></i>';
              };
              hoverHandlers = { mouseEnterHandler, mouseLeaveHandler };
              downloadBtn.addEventListener('mouseenter', mouseEnterHandler);
              downloadBtn.addEventListener('mouseleave', mouseLeaveHandler);
            }
            
            // Normalize post structure for consistency
            if (!post.imageUrl) post.imageUrl = post.image_url || post.sample_url || post.high_quality_url || 'Unknown';
            if (!post.source) post.source = 'rule34';
            if (!post.author) post.author = '?';
            
            // Check if this image is already downloaded (skip if already from downloads gallery)
            if (window.downloadFolder && !isFromDownloadsGallery) {
              const filename = getFilenameFromUrl(post.imageUrl, post.id);
              const key = getImageKey(post.imageUrl);
              fetch('http://localhost:3001/check-downloaded-images', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filenames: [filename], keys: [key] })
              })
              .then(res => res.json())
              .then(data => {
                const isDL = (data.downloaded && data.downloaded[filename]) ||
                             (data.keys && data.keys[key]);
                if (isDL) {
                  postDiv.dataset.downloaded = 'true';
                  downloadBtn.innerHTML = '<i class="fas fa-check"></i>';
                  downloadBtn.classList.add('downloaded');
                  downloadBtn.title = 'Delete';
                  
                  // Add hover handlers to swap between check and X icons
                  const mouseEnterHandler = () => {
                    downloadBtn.innerHTML = '<i class="fas fa-times"></i>';
                  };
                  const mouseLeaveHandler = () => {
                    downloadBtn.innerHTML = '<i class="fas fa-check"></i>';
                  };
                  hoverHandlers = { mouseEnterHandler, mouseLeaveHandler };
                  
                  downloadBtn.addEventListener('mouseenter', mouseEnterHandler);
                  downloadBtn.addEventListener('mouseleave', mouseLeaveHandler);
                }
              })
              .catch(err => {
                console.error('Failed to check download status:', err);
                showToast('Error checking download status: ' + err.message, 'error');
              });
            }
            
            // Download button click handler
            downloadBtn.addEventListener('click', async (e) => {
              e.preventDefault();
              e.stopPropagation();
              
              const isDownloaded = postDiv.dataset.downloaded === 'true';
              if (isDownloaded) {
                // Delete from disk and dbStore
                const filename = getFilenameFromUrl(post.imageUrl, post.id);
                try {
                  const response = await fetch('http://localhost:3001/delete-downloaded-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename, id: post.id })
                  });
                  const data = await response.json();
                  if (!response.ok) {
                    console.warn('HTTP error deleting file', response.status, data.error || data);
                    showToast('Failed to delete file: ' + (data.error || `HTTP ${response.status}`), 'error');
                  } else if (data.success) {
                    // remove file from disk succeeded; server will also drop DB entry if id was passed
                    if (typeof dbStore !== 'undefined' && dbStore && post && post.id) {
                      try {
                        await dbStore.removeDownloadedPost(post.id);
                        window.updateAppLoadingDownloadCount();
                      } catch (e) {
                        console.warn('Failed to remove downloaded post from dbStore', e);
                        showToast('Could not remove record from database', 'error');
                      }
                    }

                    postDiv.dataset.downloaded = 'false';
                    downloadBtn.innerHTML = '<i class="fas fa-download"></i>';
                    downloadBtn.classList.remove('downloaded');
                    downloadBtn.title = 'Download';
                    if (hoverHandlers) {
                      downloadBtn.removeEventListener('mouseenter', hoverHandlers.mouseEnterHandler);
                      downloadBtn.removeEventListener('mouseleave', hoverHandlers.mouseLeaveHandler);
                      hoverHandlers = null;
                    }
                  } else {
                    console.warn('Server reported deletion failure:', data.error || data);
                    showToast('Failed to delete file: ' + (data.error || 'unknown'), 'error');
                  }
                } catch (error) {
                  console.error('Failed to delete:', error);
                  showToast('Error deleting file: ' + (error.message || error), 'error');
                }
              } else {
                const currentSearchInput = document.getElementById('search-filter-input')?.value;
                // User requested a download — create toast immediately (before any awaits)
                let toast = null;
                try { toast = window.createDownloadToast(`dl-${post.id}-${Date.now()}`, String(post.id)); if (toast) toast.update(2, 'Queued'); } catch (e) { /* ignore if not available */ }

                // Download file -> enqueue into download pipeline (with retries)
                const filename = getFilenameFromUrl(post.imageUrl, post.id);

                // Fetch artist if not known
                if (post.artist.length === 0 || post.artist[0] === '?' || !post.artist || post.artist[0] === 'Unknown') {
                  const postId = post.id;
                  const postSource = post.source;
                  try {
                    const fetchedArtists = await fetchArtistForPost(postId, postSource, post.tags);
                    post.artist = Array.isArray(fetchedArtists)
                      ? (fetchedArtists.length ? fetchedArtists : ['Unknown'])
                      : [fetchedArtists || 'Unknown'];
                  } catch (err) {
                    console.error('Error fetching artist for download:', err);
                    showToast('Error fetching artist info: ' + (err.message || err), 'error');
                    post.artist = ['Unknown'];
                  }
                }

                let artist = "Unknown";
                if (post.artist && post.artist.length > 0) {
                  artist = post.artist[0];
                  post.artist.forEach(a => {
                    if (a.toLowerCase() == currentSearchInput?.toLowerCase()) {
                      artist = a;
                    }
                  });
                }

                // Prepare task
                const task = {
                  postId: post.id,
                  imageUrl: post.imageUrl,
                  filename,
                  postDiv,
                  downloadBtn,
                  progressBar,
                  progressContainer,
                  toast
                };

                // Ensure UI shows queued/downloading state immediately
                downloadBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin loading-artist"></i>';
                downloadBtn.disabled = true;
                progressContainer.style.display = 'block';
                progressBar.style.width = '4%';

                try {
                  await downloadQueue.enqueue(task);

                  // On success: save post to dbStore and update UI (mirror previous behavior)
                  if (typeof dbStore !== 'undefined' && dbStore && post && post.id) {
                    const postToSave = { ...post };
                    postToSave.artist = artist;
                    postToSave.downloadedAt = Date.now();
                    try { await dbStore.saveDownloadedPost(postToSave); } catch (e) { console.warn('Failed to save downloaded post to dbStore', e); }
                  }

                  // finalize UI
                  progressBar.style.width = '100%';
                  setTimeout(() => {
                    postDiv.dataset.downloaded = 'true';
                    downloadBtn.innerHTML = '<i class="fas fa-check"></i>';
                    downloadBtn.classList.add('downloaded');
                    downloadBtn.title = 'Delete';
                    downloadBtn.disabled = false;
                    progressContainer.style.display = 'none';
                    progressBar.style.width = '0%';

                    // Add hover handlers to swap between check and X icons
                    const mouseEnterHandler = () => { downloadBtn.innerHTML = '<i class="fas fa-times"></i>'; };
                    const mouseLeaveHandler = () => { downloadBtn.innerHTML = '<i class="fas fa-check"></i>'; };
                    hoverHandlers = { mouseEnterHandler, mouseLeaveHandler };
                    downloadBtn.addEventListener('mouseenter', mouseEnterHandler);
                    downloadBtn.addEventListener('mouseleave', mouseLeaveHandler);

                    if (task.toast) task.toast.done(true, 'Completed', post.imageUrl);
                  }, 300);
                } catch (error) {
                  // Failed after retries
                  console.error('Download failed after retries:', error);
                  downloadBtn.innerHTML = '<i class="fas fa-download"></i>';
                  downloadBtn.disabled = false;
                  progressContainer.style.display = 'none';
                  progressBar.style.width = '0%';
                  if (task.toast) task.toast.done(false, 'Failed');
                  const _dlErrMsg = error && error.message ? error.message : 'unknown';
                  const _dlProxyHint = getProxyDownHint(null, _dlErrMsg);
                  showToast(_dlProxyHint ? `Download failed: ${_dlProxyHint}` : `Download failed: ${_dlErrMsg}`, 'error');
                }
              }
            });
            
            // Middle mouse button handler
            postDiv.addEventListener('mousedown', (e) => {
              if (e.button === 1) {
                e.preventDefault();
                e.stopPropagation();
                downloadBtn.click();
                return false;
              }
            });
            
            imageContainer.appendChild(downloadBtn);
            imageContainer.appendChild(progressContainer);
            postDiv.appendChild(imageContainer);

            postsContainer.appendChild(postDiv);
          });

          // Update tags for current post
          updateTags();
        }

        // Update tags sidebar with current post tags
        function updateTags() {
          if (posts[currentPostIndex]) {
            const post = posts[currentPostIndex];
            tagsContent.innerHTML = '';

            if (post.tags && post.tags.length > 0) {
              // Build lookup maps from tag_influences for quick access
              const tagInfluences = post.tag_influences || { favorite_tags: [], commonly_downloaded_tags: [], both: [] };
              
              // Create sets/maps for quick lookup
              const favoriteTags = new Set(tagInfluences.favorite_tags.map(t => t.toLowerCase()));
              const bothMap = new Map();
              const commonlyDownloadedMap = new Map();
              
              // Store both tags (with frequency)
              tagInfluences.both.forEach(item => {
                bothMap.set(item.tag.toLowerCase(), item.frequency);
              });
              
              // Store commonly downloaded tags (with frequency)
              tagInfluences.commonly_downloaded_tags.forEach(item => {
                commonlyDownloadedMap.set(item.tag.toLowerCase(), item.frequency);
              });
              
              // Find max frequency for scaling (from both commonly_downloaded and both)
              let maxFrequency = 0;
              tagInfluences.commonly_downloaded_tags.forEach(item => {
                if (item.frequency > maxFrequency) maxFrequency = item.frequency;
              });
              tagInfluences.both.forEach(item => {
                if (item.frequency > maxFrequency) maxFrequency = item.frequency;
              });
              
              // Render tags with styling based on influence
              // First create span elements and compute outlineOpacity, then sort
              const tagSpansWithOpacity = post.tags.map(tag => {
                const tagSpan = document.createElement('span');
                tagSpan.className = 'booru-tag';
                tagSpan.textContent = tag;

                const tagLower = tag.toLowerCase();
                
                // Determine outline opacity based on tag category
                let outlineOpacity = 0; // Default: no outline
                
                if (bothMap.has(tagLower)) {
                  // Tag is both favorite AND commonly downloaded - pure white
                  outlineOpacity = 1;
                } else if (favoriteTags.has(tagLower)) {
                  // Tag is a favorite - pure white
                  outlineOpacity = 1;
                } else if (commonlyDownloadedMap.has(tagLower)) {
                  // Tag is commonly downloaded - scale opacity by frequency
                  const frequency = commonlyDownloadedMap.get(tagLower);
                  if (maxFrequency > 0) {
                    outlineOpacity = frequency / maxFrequency;
                  }
                }
                
                // Apply outline styling if tag has influence
                if (outlineOpacity > 0) {
                  tagSpan.style.boxShadow = `inset 0 0 0 2px rgba(233, 69, 96, ${outlineOpacity})`;
                }

                // Add click handler for tag (only works when preview is frozen)
                tagSpan.addEventListener('click', (e) => {
                  if (e.button === 0) { // Middle mouse button
                    e.preventDefault();
                    e.stopPropagation();
                    // Create new tab with this tag
                    if (typeof createNewBooruTab === 'function') {
                      try {
                        const newTabId = createNewBooruTab(tag);
                      } catch (err) {
                        showToast('Failed to create new tab for tag: ' + tag + ' - ' + err.message, 'error');
                      }
                    }
                  }
                });
                
                // Add middle mouse button handler to open new tab with this tag
                tagSpan.addEventListener('mousedown', (e) => {
                  if (e.button === 1) { // Middle mouse button
                    e.preventDefault();
                    e.stopPropagation();
                    // Create new tab with this tag
                    if (typeof createNewBooruTab === 'function') {
                      try {
                        const newTabId = createNewBooruTab(tag);
                      } catch (err) {
                        showToast('Failed to create new tab for tag: ' + tag + ' - ' + err.message, 'error');
                      }
                    }
                  }
                });

                return { tagSpan, outlineOpacity };
              });

              // sort highest outlineOpacity first
              tagSpansWithOpacity.sort((a, b) => b.outlineOpacity - a.outlineOpacity);
              tagSpansWithOpacity.forEach(obj => tagsContent.appendChild(obj.tagSpan));
            } else {
              tagsContent.innerHTML = '<p style="color: #888;">No tags</p>';
            }

            // Update author in footer
            const authorContainer = document.getElementById('shorts-author-container');
            if (authorContainer) {
              authorContainer.innerHTML = '';
              
              // Find artist from tags or set to '?'
              let artistName = '?';
              if (post.tags) {
                const artistTag = post.tags.find(tag => 
                  tag.toLowerCase().startsWith('artist:') || 
                  tag.toLowerCase().includes('(artist)')
                );
                if (artistTag) {
                  artistName = artistTag.replace(/^artist:/i, '').replace(/\(artist\)$/i, '').trim();
                }
              }
              
              // Store artist in post object
              if (!post.artist) {
                post.artist = artistName;
              }

              if (post.artist) {
                for (const artist of post.artist) {

                  const authorTag = document.createElement('span');
                  authorTag.className = 'booru-tag author-tag';
                  authorTag.textContent = artist || artistName;
                  authorTag.style.cursor = 'pointer';

                  // Add click handler for author tag
                  authorTag.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    
                    // If author is '?', fetch the artist from the post page
                    if (authorTag.textContent === '?' && !authorTag.classList.contains('loading')) {
                      const postId = post.id;
                      const postSource = post.source;
                      
                      authorTag.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
                      authorTag.classList.add('loading');
                      
                      try {
                        const fetchedArtists = await fetchArtistForPost(postId, postSource, post.tags);
                        const artistText = Array.isArray(fetchedArtists)
                          ? fetchedArtists.join(', ')
                          : (fetchedArtists || 'Unknown');
                        authorTag.textContent = artistText;
                        authorTag.classList.remove('loading');
                        post.artist = Array.isArray(fetchedArtists)
                          ? (fetchedArtists.length ? fetchedArtists : ['Unknown'])
                          : [fetchedArtists || 'Unknown'];
                      } catch (err) {
                        console.error('Error fetching artist:', err);
                        showToast('Error fetching artist info: ' + (err.message || err), 'error');
                        authorTag.textContent = 'Unknown';
                        authorTag.classList.remove('loading');
                        post.artist = ['Unknown'];
                      }
                    } else {
                      // Author is already loaded, open new tab with this artist
                      if (authorTag.textContent !== '?' && authorTag.textContent !== 'Unknown' && typeof createNewBooruTab === 'function') {
                        createNewBooruTab(authorTag.textContent.trim(), false, authorTag.textContent.trim());
                      }
                    }
                  });

                  // Add middle mouse button handler to open new tab with this artist
                  authorTag.addEventListener('mousedown', async (e) => {
                    if (e.button !== 1) return; // Only middle mouse button
                    
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const currentArtistName = authorTag.textContent.trim();
                    const isLoading = authorTag.classList.contains('loading');
                    
                    // If author is '?', fetch it first
                    if (currentArtistName === '?' && !isLoading) {
                      const postId = post.id;
                      const postSource = post.source;
                      
                      authorTag.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
                      authorTag.classList.add('loading');
                      
                      try {
                        const fetchedArtists = await fetchArtistForPost(postId, postSource, post.tags);
                        const artistText = Array.isArray(fetchedArtists)
                          ? fetchedArtists.join(', ')
                          : (fetchedArtists || 'Unknown');
                        authorTag.textContent = artistText;
                        authorTag.classList.remove('loading');
                        post.artist = Array.isArray(fetchedArtists)
                          ? (fetchedArtists.length ? fetchedArtists : ['Unknown'])
                          : [fetchedArtists || 'Unknown'];
                        
                        // Now open new tab with the found artist
                        if (artistText && artistText !== 'Unknown' && typeof createNewBooruTab === 'function') {
                          createNewBooruTab(artistText, false, artistText);
                        }
                      } catch (err) {
                        console.error('Error fetching artist:', err);
                        showToast('Error fetching artist info: ' + (err.message || err), 'error');
                        authorTag.textContent = 'Unknown';
                        authorTag.classList.remove('loading');
                        post.artist = 'Unknown';
                      }
                    } else if (currentArtistName !== '?' && currentArtistName !== 'Unknown' && !isLoading) {
                      // Author is already loaded and valid, open new tab
                      if (typeof createNewBooruTab === 'function') {
                        createNewBooruTab(currentArtistName, false, currentArtistName);
                      }
                    }
                  });

                  if (authorTag.textContent == 'Unknown') {
                    authorTag.classList.add('unknown-artist');
                  }

                  authorContainer.appendChild(authorTag);
                }
              }

            }

            // Update phone viewport background with current post image (always use preview for blurred background)
            if (scrollerContent) {
              const imageUrl = post.image_url || post.sample_url; // Only use preview, not high quality
              if (imageUrl) {
                const newBgUrl = `url('${imageUrl}')`;
                
                // Crossfade: fade in the next layer while fading out the current one
                if (activeBackgroundLayer === 1) {
                  // Layer 1 is currently visible, fade to layer 2
                  scrollerContent.style.setProperty('--bg-image-url-2', newBgUrl);
                  scrollerContent.style.setProperty('--bg-opacity-2', '1');
                  scrollerContent.style.setProperty('--bg-opacity-1', '0');
                  activeBackgroundLayer = 2;
                } else {
                  // Layer 2 is currently visible, fade to layer 1
                  scrollerContent.style.setProperty('--bg-image-url-1', newBgUrl);
                  scrollerContent.style.setProperty('--bg-opacity-1', '1');
                  scrollerContent.style.setProperty('--bg-opacity-2', '0');
                  activeBackgroundLayer = 1;
                }
              }
            }
          }
          
          // Update index display
          if (postIndexDisplay) {
            postIndexDisplay.textContent = `${currentPostIndex + 1} / ${posts.length}`;
          }
        }

        // Detect scroll snap and log the snapped element index
        function detectSnapPosition() {
          if (!phoneViewport || !postsContainer) return;
          
          const viewportRect = phoneViewport.getBoundingClientRect();
          const viewportCenter = viewportRect.top + viewportRect.height / 2;
          
          const postElements = Array.from(postsContainer.querySelectorAll('.shorts-post'));
          if (postElements.length === 0) return;
          
          // Find which post is closest to the viewport center
          let closestIndex = 0;
          let closestDistance = Infinity;
          
          postElements.forEach((post, index) => {
            const postRect = post.getBoundingClientRect();
            const postCenter = postRect.top + postRect.height / 2;
            const distance = Math.abs(viewportCenter - postCenter);
            
            if (distance < closestDistance) {
              closestDistance = distance;
              closestIndex = index;
            }
          });
          
          // Only update if the index changed
          if (closestIndex !== currentPostIndex) {

            // Log snap event with additional info
            const totalPosts = postElements.length;
            const isLastPost = closestIndex === totalPosts - 1;
            const isSecondToLast = closestIndex === totalPosts - 2;
            
            if (isLastPost || isSecondToLast) {
              fetchPosts(); // Fetch more posts when nearing the end
            }

            currentPostIndex = closestIndex;
            updateTags();
          }
        }

        // Handle scroll events with debouncing
        let snapDetectionTimeout = null;
        function handleScroll() {
          // Clear previous timeout
          if (snapDetectionTimeout) {
            clearTimeout(snapDetectionTimeout);
          }
          
          // Detect snap after scrolling stops (scrollend is not widely supported yet)
          snapDetectionTimeout = setTimeout(() => {
            detectSnapPosition();
          }, 150);
        }

        // Add scroll listener to phoneViewport
        if (phoneViewport) {
          phoneViewport.addEventListener('scroll', handleScroll, { passive: true });
          
          // Also try to use scrollend event if supported (newer browsers)
          if ('onscrollend' in phoneViewport) {
            phoneViewport.addEventListener('scrollend', detectSnapPosition, { passive: true });
          }
        }

        // Initial load
        fetchPosts();
        
        // Save scroller state
        if (window.debouncedSave) window.debouncedSave();
      }

    });
  }
  
  // When switching to a booru tab, revert downloads gallery UI changes
  document.getElementById('booru-tabs-container')?.addEventListener('click', (e) => {

    setTimeout(() => {
      const artistSection = document.querySelector('.control-section-artist');
      if (artistSection) artistSection.style.display = 'none';
      const sourceSection = document.querySelector('.control-section-source');
      if (sourceSection) sourceSection.style.display = 'none';
    }, 200);

    const galleryWrapper = document.getElementById('gallery-wrapper');
    const artistSeperators = galleryWrapper.querySelectorAll('.artist-separator');
    artistSeperators.forEach(sep => sep.remove());


    const tabBtn = e.target.closest('.booru-tab-item');
    if (!tabBtn) return;
    let tabId = tabBtn.dataset.tabId;

    const scrollerContent = document.getElementById('scroller-content');
    if (scrollerContent) {
      scrollerContent.style.display = 'none'; // Hide instead of removing
    }

    const booruContent = document.getElementById('booru-content');
    if (booruContent) {
      booruContent.style.display = 'block';
    }
    
    // Always remove active classes from downloads and scroller buttons when switching to a booru tab
    const showDownloadsBtn = document.getElementById('show-downloads-gallery-btn');
    const showScrollerBtn = document.getElementById('show-scroller-btn');
    if (showDownloadsBtn) showDownloadsBtn.classList.remove('active');
    if (showScrollerBtn) showScrollerBtn.classList.remove('active');
    
    // Restore controls when exiting scroller mode
    if (window.isViewingScroller) {
      window.isViewingScroller = false;
      // Save state change
      if (window.debouncedSave) window.debouncedSave();
      const controlBar = document.querySelector('header.control-bar.booru-control-bar');
      if (controlBar) {
        // Restore all controls
        controlBar.querySelectorAll('.booru-control-left > *').forEach(el => el.style.display = '');
        controlBar.querySelectorAll('.booru-control-right > *').forEach(el => el.style.display = '');
        // Restore buttons in control-section-primary
        const primarySection = controlBar.querySelector('.control-section-primary');
        if (primarySection) {
          primarySection.querySelectorAll('button').forEach(btn => btn.style.display = '');
        }
        // Restore gallery quality toggle
        const galleryQualityToggleBtn = document.getElementById('gallery-quality-toggle');
        if (galleryQualityToggleBtn) galleryQualityToggleBtn.style.display = '';
      }
      // Hide subreddit control if source is not reddit
      const subredditControl = document.getElementById('subreddit-control');
      const sourceSelect = document.getElementById('booru-source-select');
      if (subredditControl && sourceSelect) {
        subredditControl.style.display = (sourceSelect.value === 'reddit') ? '' : 'none';
      }
    }
    
    if (window.isViewingDownloadsGallery) {
      // Restore all booru tab items' active state (handled by switchToTab)
      // Restore header controls and show reload/AI filter buttons
      const controlBar = document.querySelector('header.control-bar.booru-control-bar');
      if (controlBar) {
        controlBar.querySelectorAll('.booru-control-left > *').forEach(el => el.style.display = '');
        controlBar.querySelectorAll('.booru-control-right > *').forEach(el => el.style.display = '');
        const aiFilter = controlBar.querySelector('#ai-filter-toggle');
        if (aiFilter) aiFilter.style.display = '';
        const reloadBtn = controlBar.querySelector('#reload-booru-btn');
        if (reloadBtn) reloadBtn.style.display = '';
      }
      // Restore search input event
      const searchInput = document.getElementById('search-filter-input');
      if (searchInput) {
        if (searchInput._downloadsSearchHandler) {
          searchInput.removeEventListener('input', searchInput._downloadsSearchHandler);
          delete searchInput._downloadsSearchHandler;
        }
      }
      // Remove downloads gallery class
      const booruGallery = document.getElementById('booru-gallery');
      if (booruGallery) {
        booruGallery.classList.remove('downloads-gallery');
        const artistSection = document.querySelector('.control-section-artist');
        if (artistSection) artistSection.style.display = 'none';
        const sourceSection = document.querySelector('.control-section-source');
        if (sourceSection) sourceSection.style.display = 'none';
      }
      
      // Remove shuffle button if it exists
      const shuffleBtn = document.getElementById('downloads-shuffle-btn');
      if (shuffleBtn) shuffleBtn.remove();
      const sortArtistBtn = document.getElementById('downloads-sort-artist-btn');
      if (sortArtistBtn) sortArtistBtn.remove();
      const downloadsDateSortSection = document.querySelector('.control-section-downloads-date-order');
      if (downloadsDateSortSection) downloadsDateSortSection.remove();
      window.downloadsGalleryOriginalPosts = null;
      
      window.isViewingDownloadsGallery = false;
      
      // Reset downloads pagination state
      window.allDownloadedPosts = null;
      window.downloadsPaginationIndex = 0;
      
      // Restore the selected booru tab's state
      // Debug: print all tab IDs in DOM
      const domTabIds = Array.from(document.querySelectorAll('.booru-tab-item')).map(el => el.dataset.tabId);
      if (tabId && typeof window.switchToTab === 'function') {
        // Restore header controls first
        const controlBar = document.querySelector('header.control-bar.booru-control-bar');
        if (controlBar) {
          controlBar.querySelectorAll('.booru-control-left > *').forEach(el => el.style.display = '');
          controlBar.querySelectorAll('.booru-control-right > *').forEach(el => el.style.display = '');
        }
        // Then switch to the tab after a short delay
        // Restore search input and source select to tab state before switching
        const tabsArr = (typeof booruTabs !== 'undefined' && booruTabs.length) ? booruTabs : (window.booruTabs || []);
        const tab = tabsArr.find(t => t.id === tabId);
        if (tab) {
          // Restore search input
          const searchInput = document.getElementById('search-filter-input');
          if (searchInput) {
            searchInput.value = tab.state?.searchTags || '';
            if (searchInput.value.toLowerCase() == 'search' || searchInput.value.toLowerCase() == 'new tab') searchInput.value = '';
          }
          // Restore source select
          const sourceSelect = document.getElementById('booru-source-select');
          if (sourceSelect && tab.state?.source) {
            sourceSelect.value = tab.state.source;
          }
          // Hide subreddit control if source is not reddit
          const subredditControl = document.getElementById('subreddit-control');
          if (subredditControl && sourceSelect) {
            subredditControl.style.display = (sourceSelect.value === 'reddit') ? '' : 'none';
          }
        }
        setTimeout(() => {
          window.switchToTab(tabId);
        }, 200);
      }
      window.isViewingDownloadsGallery = false;
    }
  });
  if (booruSourceSelect) {
    booruSourceSelect.addEventListener('change', () => {
      handleSourceChange();
      debouncedSettingsSave();
      // Auto-load gallery when source changes
      if (booruGallery) {
        loadBooruImages(false);
      }
    });
  }
  
  if (booruSettingsBtn) {
    booruSettingsBtn.addEventListener('click', toggleApiSettings);
  }
  
  if (closeApiModalBtn) {
    closeApiModalBtn.addEventListener('click', closeApiSettings);
  }
  
  // Close modal when clicking overlay
  if (apiSettingsModal) {
    apiSettingsModal.querySelector('.modal-overlay').addEventListener('click', closeApiSettings);
  }
  
  // Toggle advanced controls
  const toggleAdvancedBtn = document.getElementById('toggle-advanced');
  const advancedControls = document.getElementById('advanced-controls');
  if (toggleAdvancedBtn && advancedControls) {
    toggleAdvancedBtn.addEventListener('click', () => {
      const isVisible = advancedControls.style.display !== 'none';
      advancedControls.style.display = isVisible ? 'none' : 'block';
      toggleAdvancedBtn.querySelector('i').className = isVisible ? 'fas fa-sliders-h' : 'fas fa-times';
    });
  }
  
  if (saveApiCredentialsBtn) {
    saveApiCredentialsBtn.addEventListener('click', saveApiCredentials);
  }
  
  // Load saved API credentials
  loadApiCredentials();
  
  // Load AI filter setting
  loadAiFilterSetting();
  
  // Restore gallery quality toggle state from localStorage
  try {
    const savedQualityState = localStorage.getItem('showHighQualityGallery');
    if (savedQualityState !== null) {
      showHighQualityGallery = savedQualityState === 'true';
    }
  } catch (e) {}
  
  if (aiFilterToggleBtn) {
    aiFilterToggleBtn.addEventListener('click', toggleAiFilter);
  }

  if (galleryQualityToggleBtn) {
    galleryQualityToggleBtn.addEventListener('click', () => {
      showHighQualityGallery = !showHighQualityGallery;
      // Save to localStorage
      try {
        localStorage.setItem('showHighQualityGallery', showHighQualityGallery.toString());
      } catch (e) {}
      // clear any cached previews so they reflect the new quality immediately
      if (window._previewCache) window._previewCache.clear();

      updateGalleryQualityButton();
      updateGalleryImageQuality();
    });
    updateGalleryQualityButton();
  }
  
  if (reloadBooruBtn) {
    reloadBooruBtn.addEventListener('click', async () => {
      // Check if we're viewing downloads gallery
      if (window.isViewingDownloadsGallery) {
        if (!window.allDownloadedPosts) {
          showToast('No downloaded posts to load', 'error');
          return;
        }
        
        reloadBooruBtn.disabled = true;
        reloadBooruBtn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i>';

        cleanupDownloadsGallery();

        const limit = parseInt(document.getElementById('booru-limit-input')?.value) || 100;
        const initialPosts = window.allDownloadedPosts.slice(0, limit);
        const seperateByArtist = document.getElementById('downloads-sort-artist-btn')?.classList.contains('btn-accent');
        document.getElementById('search-filter-input')?.dispatchEvent(new Event('input', { bubbles: true }));
        document.getElementById('search-filter-input')?.dispatchEvent(new Event('blur', { bubbles: true }));
        reloadBooruBtn.disabled = false;
        reloadBooruBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
        showToast('Downloads reloaded', 'success');
      } else if (window.isViewingScroller) {
        // Reset scroller by removing it (will be recreated when clicked again)
        const scrollerContent = document.getElementById('scroller-content');
        if (scrollerContent) {
          scrollerContent.remove();
        }
        // Re-trigger the scroller button to create fresh scroller
        const showScrollerBtn = document.getElementById('show-scroller-btn');
        if (showScrollerBtn) {
          showScrollerBtn.click();
        }
      } else {
        // Normal booru reload - clear current active tab's cache
        window.booruPosts = [];
        window.hasMoreResults = true;
        window.totalResultCount = null;
        booruPaginationToken = null;
        
        // Clear cached posts from current active tab
        if (activeTabId && window.booruTabs && Array.isArray(window.booruTabs)) {
          const activeTab = window.booruTabs.find(tab => tab.id === activeTabId);
          if (activeTab) {
            activeTab.booruPosts = [];
            activeTab.hasMoreResults = true;
            activeTab.totalResultCount = null;
            activeTab.paginationToken = null;
          }
        }
        
        debouncedSettingsSave();
        loadBooruImages(false);
      }
    });
  }
  
  if (booruSortSelect) {
    booruSortSelect.addEventListener('change', () => {
      debouncedSettingsSave();
      if (booruGallery && booruGallery.children.length > 0) {
        loadBooruImages(false);
      }
    });
  }

  let _hqRestoreResizeTimeout = null;
  
  // Image size slider listener
  if (typeof imageSizeSlider !== 'undefined' && imageSizeSlider) {
    window._lastGalleryType = 'booru'; // 'booru' or 'downloads'
    imageSizeSlider.addEventListener('input', () => {
      currentImageSize = parseInt(imageSizeSlider.value, 10);
      // Set the CSS variable for image size on the gallery wrapper instead of document root
      const galleryWrapper = document.getElementById('gallery-wrapper');
      if (galleryWrapper) {
        galleryWrapper.style.setProperty('--booru-image-size', `${Math.min(currentImageSize, 300)}px`);
      } else {
        document.documentElement.style.setProperty('--booru-image-size', `${Math.min(currentImageSize, 300)}px`);
      }
      if (typeof imageSizeValue !== 'undefined' && imageSizeValue) {
        imageSizeValue.textContent = `${currentImageSize}px`;
      }
      if (window.isViewingDownloadsGallery) {
        window.sessionDownloadsImageSize = imageSizeSlider.value;
        try {
          localStorage.setItem('downloadsImageSize', imageSizeSlider.value);
        } catch (e) {}
        window._lastGalleryType = 'downloads';
      } else if (window.isViewingDownloadsGallery === false || window.isViewingDownloadsGallery === undefined) {
        // Only update booruImageSize if NOT in downloads gallery
        window.sessionBooruImageSize = imageSizeSlider.value;
        try {
          localStorage.setItem('booruImageSize', imageSizeSlider.value);
        } catch (e) {}
        window._lastGalleryType = 'booru';
      }
      // Update Justified Gallery rowHeight dynamically for all gallery instances in the wrapper
      if (typeof $.fn.justifiedGallery !== 'undefined') {
        const wrapper = galleryWrapper || booruGallery;
        const galleryTargets = galleryWrapper
          ? Array.from(galleryWrapper.querySelectorAll('.booru-gallery'))
          : (booruGallery ? [booruGallery] : []);

        galleryTargets.forEach((gallery) => {
          $(gallery).justifiedGallery('norewind').justifiedGallery({
            rowHeight: currentImageSize,
            maxRowHeight: false,
            margins: 10,
            lastRow: 'nojustify',
            captions: false,
            waitThumbnailsLoad: false,
            border: 0
          });
        });

        if (_hqRestoreResizeTimeout) {
          clearTimeout(_hqRestoreResizeTimeout);
        }
        _hqRestoreResizeTimeout = setTimeout(() => {
          restoreHighQualityGalleryImages();
        }, 120);
      }
    });

    // On load, restore both values
    try {
      const downloadsSize = localStorage.getItem('downloadsImageSize');
      if (downloadsSize !== null) window.sessionDownloadsImageSize = downloadsSize;
      const booruSize = localStorage.getItem('booruImageSize');
      if (booruSize !== null) window.sessionBooruImageSize = booruSize;
    } catch (e) {}

    // When switching to downloads gallery, set last gallery type
    const _origShowDownloadsGallery = window.showDownloadsGallery;
    window.showDownloadsGallery = async function (...args) {
      window._lastGalleryType = 'downloads';
      return await _origShowDownloadsGallery.apply(this, args);
    };
  }
  
  // Keep HQ previews after browser resize or other layout changes
  window.addEventListener('resize', () => {
    if (_hqRestoreResizeTimeout) {
      clearTimeout(_hqRestoreResizeTimeout);
    }
    _hqRestoreResizeTimeout = setTimeout(() => {
      restoreHighQualityGalleryImages();
    }, 120);
  });
  
  // Enter key on search input to execute search
  if (typeof searchFilterInput !== 'undefined' && searchFilterInput) {
    searchFilterInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // Don't search Booru if viewing downloads gallery
        if (window.isViewingDownloadsGallery) return;
        debouncedSettingsSave();
        if (booruGallery) {
          loadBooruImages(false);
        }
      }
    });
  }
  
  // Handle source change on load (MUST be before loadSavedTotalCount)
  handleSourceChange();
  
  // Load saved total count and display it (AFTER handleSourceChange sets currentBooruSource)
  loadSavedTotalCount();
}

function handleSourceChange() {
  window.currentBooruSource = booruSourceSelect ? booruSourceSelect.value : 'reddit';
  
  // Show/hide source-specific controls
  const searchControl = document.getElementById('search-control');
  if (searchControl) {
    searchControl.style.display = window.currentBooruSource === 'reddit' ? 'none' : 'flex';
  }
  
  if (subredditControl) {
    subredditControl.style.display = window.currentBooruSource === 'reddit' ? 'flex' : 'none';
  }
  
  // Show settings button only for sources that require authentication
  if (booruSettingsBtn) {
    let sourceConfig = null;
    if (typeof booruSourcesManager !== 'undefined' && booruSourcesManager) {
      sourceConfig = booruSourcesManager.getSource(window.currentBooruSource);
    }
    const requiresAuth = sourceConfig?.auth?.required || false;
    booruSettingsBtn.style.display = requiresAuth ? 'inline-flex' : 'none';
  }
  
  // Update API settings modal title and help text from source config
  const apiSettingsTitle = document.getElementById('api-settings-title');
  const apiSettingsHelp = document.getElementById('api-settings-help');
  if (apiSettingsTitle || apiSettingsHelp) {
    const sourceConfig = booruSourcesManager?.getSource(window.currentBooruSource);
    if (apiSettingsTitle && sourceConfig) {
      apiSettingsTitle.innerHTML = `<i class="fas fa-key"></i> ${sourceConfig.name} API Settings`;
    }
    if (apiSettingsHelp && sourceConfig?.auth?.helpText) {
      apiSettingsHelp.textContent = sourceConfig.auth.helpText;
    }
  }
  
  // Close settings modal when switching to sources that don't require auth
  if (apiSettingsModal && window.currentBooruSource !== 'reddit') {
    const sourceConfig = booruSourcesManager?.getSource(window.currentBooruSource);
    const requiresAuth = sourceConfig?.auth?.required || false;
    if (!requiresAuth) {
      apiSettingsModal.style.display = 'none';
    }
  }
  
  // Update sort options based on source (pass current sort to preserve it if valid)
  const currentSort = booruSortSelect?.value;
  updateSortOptions(currentSort);
  
  // Load credentials for the new source
  loadApiCredentials();
  
  // Note: Don't clear gallery here - this is called during tab switching
  // Only clear when explicitly loading new content
  // booruGallery.innerHTML = '';
  // booruPosts = [];
  // booruPaginationToken = null;
  // hasMoreResults = true;
  // totalResultCount = null;
}

// Toggle API settings modal
function toggleApiSettings() {
  if (apiSettingsModal) {
    apiSettingsModal.style.display = apiSettingsModal.style.display === 'none' ? 'flex' : 'none';
  }
}

// Close API settings modal
function closeApiSettings() {
  if (apiSettingsModal) {
    apiSettingsModal.style.display = 'none';
  }
}

// Save API credentials using session AND into the source config
async function saveApiCredentials() {
  const userId = userIdInput ? userIdInput.value.trim() : '';
  const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
  const source = window.currentBooruSource;
  
  if (!userId || !apiKey) {
    showToast('Please enter both User ID and API Key', 'error');
    return;
  }
  
  try {
    // Store in window session object for the source
    if (!window.booruApiCredentials) {
      window.booruApiCredentials = {};
    }
    window.booruApiCredentials[source] = { userId, apiKey };
    
    // Also persist into the source config so they survive session resets
    if (typeof booruSourcesManager !== 'undefined' && booruSourcesManager) {
      const sourceObj = booruSourcesManager.getSource(source);
      if (sourceObj && sourceObj.auth) {
        sourceObj.auth.userId = userId;
        sourceObj.auth.apiKey = apiKey;
        await booruSourcesManager.saveSources();
      }
    }

    // Save to session via debouncedSave
    debouncedSettingsSave();
    
    showToast('API credentials saved successfully', 'success');
    
    // Close the modal
    closeApiSettings();
  } catch (err) {
    console.error('Error saving credentials:', err);
    showToast('Error saving credentials', 'error');
  }
}

// Load API credentials — checks source config first, falls back to session
function loadApiCredentials() {
  try {
    const source = window.currentBooruSource;
    let userId = '';
    let apiKey = '';

    // Primary: load from source config (persisted in dbStore)
    if (typeof booruSourcesManager !== 'undefined' && booruSourcesManager) {
      const sourceObj = booruSourcesManager.getSource(source);
      if (sourceObj?.auth?.userId) userId = sourceObj.auth.userId;
      if (sourceObj?.auth?.apiKey) apiKey = sourceObj.auth.apiKey;
    }

    // Fallback: load from session object (legacy / in-memory)
    if (!userId || !apiKey) {
      const sessionCreds = window.booruApiCredentials?.[source];
      if (sessionCreds?.userId && !userId) userId = sessionCreds.userId;
      if (sessionCreds?.apiKey && !apiKey) apiKey = sessionCreds.apiKey;
    }

    if (userId && userIdInput) userIdInput.value = userId;
    if (apiKey && apiKeyInput) apiKeyInput.value = apiKey;

    // Keep window.booruApiCredentials in sync
    if (userId && apiKey) {
      if (!window.booruApiCredentials) window.booruApiCredentials = {};
      window.booruApiCredentials[source] = { userId, apiKey };
    }
  } catch (err) {
    console.error('Error loading credentials:', err);
    showToast('Error loading API credentials: ' + (err.message || err), 'error');
  }
}

// Load AI filter setting from localStorage
function loadAiFilterSetting() {
  try {
    const saved = localStorage.getItem('aiFilterEnabled');
    aiFilterEnabled = saved === 'true'; // OFF by default
    updateAiFilterButton();
  } catch (err) {
    console.error('Error loading AI filter setting:', err);
    showToast('Error loading AI filter setting: ' + (err.message || err), 'error');
    aiFilterEnabled = false;
  }
}

// Save AI filter setting to localStorage
function saveAiFilterSetting() {
  try {
    localStorage.setItem('aiFilterEnabled', aiFilterEnabled.toString());
  } catch (err) {
    console.error('Error saving AI filter setting:', err);
    showToast('Error saving AI filter setting: ' + (err.message || err), 'error');
  }
}

// Update AI filter button appearance
function updateAiFilterButton() {
  if (!aiFilterToggleBtn) return;
  if (!aiFilterEnabled) {
    aiFilterToggleBtn.classList.add('btn-accent');
    aiFilterToggleBtn.title = 'AI Content: ON';
  } else {
    aiFilterToggleBtn.classList.remove('btn-accent');
    aiFilterToggleBtn.title = 'AI Content: OFF';
  }
}

// Update gallery quality button appearance
function updateGalleryQualityButton() {
  if (!galleryQualityToggleBtn) return;
  if (showHighQualityGallery) {
    galleryQualityToggleBtn.classList.add('btn-accent');
    galleryQualityToggleBtn.title = 'Show Low Quality Images';
  } else {
    galleryQualityToggleBtn.classList.remove('btn-accent');
    galleryQualityToggleBtn.title = 'Show High Quality Images';
  }
}

// Seamlessly update all gallery images to high/low quality
function updateGalleryImageQuality() {
  // Cancel any ongoing quality loading operations
  qualityLoadingTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
  qualityLoadingTimeouts = [];
  
  const items = Array.from(document.querySelectorAll('.booru-image-item img'));
  
  // cancel pending HQ loading timers
  qualityLoadingTimeouts.forEach(id => clearTimeout(id));
  qualityLoadingTimeouts = [];
  
  // If turning off quality mode, immediately restore all images to low quality
  if (!showHighQualityGallery) {
    items.forEach(img => {
      // Remove blur from any images that were loading
      img.style.filter = '';
      
      // Restore download buttons that show loading spinners
      const downloadBtn = img?.parentElement?.querySelector('.booru-download-btn');
      if (downloadBtn && downloadBtn.innerHTML.includes('fa-circle-notch')) {
        const isDownloaded = img.closest('.booru-image-item')?.dataset.downloaded === 'true';
        downloadBtn.innerHTML = isDownloaded ? '<i class="fas fa-times"></i>' : '<i class="fas fa-download"></i>';
      }
      
      const low = img.dataset.resolvedThumbnailUrl || getImageUrl(img.dataset.sampleUrl || img.dataset.thumbnailUrl);
      if (img.src !== low) {
        img.src = low; // changing src aborts any previous HQ load
      }
      // clear any stored HQ flag so we don't incorrectly show HQ on next hover
      delete img.dataset.currentQualityUrl;
    });
    // nothing more to do when lowering quality
    return;
  }
  
  // Sort by vertical position (top to bottom) so images update from top first
  items.sort((a, b) => {
    const rectA = a.getBoundingClientRect();
    const rectB = b.getBoundingClientRect();
    if (rectA.top !== rectB.top) {
      return rectA.top - rectB.top;
    }
    // If on same row, sort by horizontal position (left to right)
    return rectA.left - rectB.left;
  });
  
  // Update images sequentially from top to bottom
  items.forEach((img, index) => {
    // Only update if not a video post
    if (img.dataset.isVideo === 'true' || img.dataset.isGif === 'true') return;

    let downloadBtn = img?.parentElement?.querySelector('.booru-download-btn');
    let originalDownloadHTML = null;
    if (downloadBtn) {
      originalDownloadHTML = downloadBtn.innerHTML;
      downloadBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
      img.style.filter = 'blur(5px)'; // Blur while loading
    }
    const timeoutId = setTimeout(() => {
      const high = img.dataset.imageUrl;
      // Prefer sampleUrl if available (better quality than thumbnail), otherwise fall back to thumbnail
      const low = img.dataset.resolvedThumbnailUrl || img.dataset.sampleUrl || img.dataset.thumbnailUrl;
      const targetSrc = getImageUrl(showHighQualityGallery ? high : low);
      
      // Only update if the URL is actually different
      if (img.src !== targetSrc) {
        // Remove any existing error display from the parent container
        const errorDiv = img.parentElement?.querySelector('div[style*="background: var(--bg-darkest)"]');
        if (errorDiv) {
          errorDiv.remove();
        }
        // Set the new source
        img.src = targetSrc;
        img.onload = () => {
          // Image loaded successfully - store the current quality URL for preview to use
          img.dataset.currentQualityUrl = img.src;
          if (downloadBtn && originalDownloadHTML) {
            downloadBtn.innerHTML = originalDownloadHTML;
          }
          img.style.filter = '';

          // --- Update tab cache with new quality ---
          try {
            const postId = img.closest('.booru-image-item')?.dataset.postId;
            const postSource = img.closest('.booru-image-item')?.dataset.postSource;
            if (window.booruTabs && window.activeTabId) {
              const tab = window.booruTabs.find(t => t.id === window.activeTabId);
              if (tab && Array.isArray(tab.booruPosts)) {
                const post = tab.booruPosts.find(p => String(p.id) === String(postId) && String(p.source) === String(postSource));
                if (post) {
                  post.imageUrl = img.src;
                  post.currentQualityUrl = img.src;
                  if (!showHighQualityGallery && img.dataset.thumbnailUrl) post.imageUrl = img.dataset.thumbnailUrl;
                  if (showHighQualityGallery && img.dataset.imageUrl) post.imageUrl = img.dataset.imageUrl;
                }
              }
            }
          } catch (e) { /* ignore */ }
        }
      } else {
        // URL is the same, just restore UI immediately
        if (downloadBtn && originalDownloadHTML) {
          downloadBtn.innerHTML = originalDownloadHTML;
        }
        img.style.filter = '';
      }
    }, index * 250); // 250ms delay between each image update
    qualityLoadingTimeouts.push(timeoutId);
  });
}

// Toggle AI filter
function toggleAiFilter() {
  aiFilterEnabled = !aiFilterEnabled;
  saveAiFilterSetting();
  updateAiFilterButton();
  showToast(`AI Filter ${aiFilterEnabled ? 'Enabled' : 'Disabled'}`, 'info');
  
  // Reload gallery with new filter setting
  if (booruGallery && booruGallery.children.length > 0) {
    loadBooruImages(false);
  }
}

// Load saved total count from localStorage
function loadSavedTotalCount() {
  try {
    const savedCount = localStorage.getItem('booruTotalCount');
    const savedSource = localStorage.getItem('booruCountSource');
    
    // Only use saved count if source matches current source
    if (savedCount && savedSource === window.currentBooruSource) {
      window.totalResultCount = parseInt(savedCount);
      updateTotalCountDisplay();
    }
  } catch (err) {
    console.error('Error loading saved count:', err);
    showToast('Error loading saved total count: ' + (err.message || err), 'error');
  }
}

// Save total count to localStorage
function saveTotalCount() {
  try {
    if (totalResultCount !== null && totalResultCount > 0) {
      localStorage.setItem('booruTotalCount', totalResultCount.toString());
      localStorage.setItem('booruCountSource', window.currentBooruSource);
    }
  } catch (err) {
    console.error('Error saving count:', err);
    showToast('Error saving total count: ' + (err.message || err), 'error');
  }
}

function updateSortOptions(savedSort) {
  if (!booruSortSelect) return;
  
  booruSortSelect.innerHTML = '';
  
  // Reddit uses different sort options
  if (window.currentBooruSource === 'reddit') {
    ['new', 'hot', 'top'].forEach(val => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val.charAt(0).toUpperCase() + val.slice(1);
      booruSortSelect.appendChild(opt);
    });
  } else {
    // All booru sources use date/score sorting
    ['date', 'score'].forEach(val => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val.charAt(0).toUpperCase() + val.slice(1);
      booruSortSelect.appendChild(opt);
    });
  }
  
  // Restore saved sort if provided and valid
  if (savedSort) {
    const optionExists = Array.from(booruSortSelect.options).some(opt => opt.value === savedSort);
    if (optionExists) {
      booruSortSelect.value = savedSort;
    }
  }
}

// Expose updateSortOptions globally
window.updateSortOptions = updateSortOptions;

// Parse tags to separate blacklist tags (with !) from regular tags
function parseTagsAndBlacklist(searchTags) {
  // Start with constant blacklist if AI filter is enabled
  const blacklistTags = aiFilterEnabled ? [...CONSTANT_BLACKLIST] : [];
  
  if (!searchTags) return { searchTags: '', searchTagsArray: [], blacklistTags: blacklistTags };
  
  const tags = searchTags.trim().split(/\s+/);
  const regularTags = [];
  
  tags.forEach(tag => {
    if (tag.startsWith('!') || tag.startsWith('-')) {
      // Remove ! or - prefix and add to blacklist
      const cleanTag = tag.substring(1).toLowerCase();
      if (cleanTag) blacklistTags.push(cleanTag);
    } else if (tag) {
      regularTags.push(tag);
    }
  });
  
  return {
    searchTags: regularTags.join(' '),
    searchTagsArray: regularTags,
    blacklistTags: blacklistTags
  };
}

// Filter posts based on blacklist tags
function filterBlacklistedPosts(posts, blacklistTags) {
  if (!blacklistTags || blacklistTags.length === 0) return posts;

  // normalize blacklist to lowercase for comparison
  const lowerBlacklist = blacklistTags.map(t => t.toLowerCase());

  return posts.filter(post => {
    const postTags = post.tags.map(t => t.toLowerCase());
    // Exclude post if it contains any blacklisted tag EXACTLY
    return !lowerBlacklist.some(bl => postTags.includes(bl));
  });
}

// Tag suggestions management
function decodeHtmlEntities(text) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

async function loadTagSuggestions() {
  try {
    const response = await fetch('http://localhost:3001/load-tag-suggestions');
    if (response.ok) {
      window.tagSuggestions = await response.json();
      // Decode HTML entities in existing tags and sort
      Object.keys(window.tagSuggestions).forEach(source => {
        window.tagSuggestions[source] = window.tagSuggestions[source]
          .map(decodeHtmlEntities)
          .filter((tag, index, arr) => arr.indexOf(tag) === index) // Remove duplicates
          .sort();
      });
    } else {
      window.tagSuggestions = {};
    }
  } catch (err) {
    console.error('Error loading tag suggestions:', err);
    showToast('Error loading tag suggestions: ' + (err.message || err), 'error');
    window.tagSuggestions = {};
  }
}

async function queryTagSuggestions(source, prefix = '', limit = 10) {
  const query = new URL('http://localhost:3001/load-tag-suggestions');
  query.searchParams.set('source', source);
  if (prefix) query.searchParams.set('prefix', prefix);
  query.searchParams.set('limit', String(limit));

  const response = await fetch(query.toString());
  if (!response.ok) throw new Error('Failed to get tag suggestions');
  return response.json();
}

// Debounced save to improve performance
let saveTagSuggestionsTimeout = null;
async function debouncedSaveTagSuggestions() {
  if (saveTagSuggestionsTimeout) clearTimeout(saveTagSuggestionsTimeout);
  saveTagSuggestionsTimeout = setTimeout(async () => {
    try {
      const response = await fetch('http://localhost:3001/save-tag-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(window.tagSuggestions)
      });
      if (!response.ok) {
        console.error('Failed to save tag suggestions');
        showToast('Failed to save tag suggestions', 'error');
      }
    } catch (err) {
      console.error('Error saving tag suggestions:', err);
      showToast('Error saving tag suggestions: ' + (err.message || err), 'error');
    }
  }, 1000); // Save after 1 second of inactivity
}

function updateTagSuggestions(source, posts) {
  if (!window.tagSuggestions[source]) {
    window.tagSuggestions[source] = [];
  }
  const existingTags = new Set(window.tagSuggestions[source]);
  posts.forEach(post => {
    if (post.tags && Array.isArray(post.tags)) {
      post.tags.forEach(tag => {
        if (tag && typeof tag === 'string' && !existingTags.has(tag)) {
          existingTags.add(tag);
          window.tagSuggestions[source].push(tag);
        }
      });
    }
  });
  // Keep sorted for performance
  window.tagSuggestions[source].sort();
  // Debounced save to avoid excessive writes
  debouncedSaveTagSuggestions();
}

// Load images based on current source
async function loadBooruImages(append = false) {
  if (!append) {
    // new gallery load, drop any existing preview cache to avoid stale thumbnails
    if (window._previewCache) window._previewCache.clear();
  }

  // Only block infinite scroll, not reload/search/buttons
  booruTotalCount.style.display = 'none';
  ('[LOAD] loadBooruImages called:', { append, isLoadingBooru, hasMore: window.hasMoreResults, source: window.currentBooruSource });

  // Abort any ongoing request
  if (currentAbortController) {
    currentAbortController.abort();
  }
  currentAbortController = new AbortController();
  
  isLoadingBooru = true;
  window.isViewingDownloadsGallery = false;
  
  // Reset downloads pagination state
  window.allDownloadedPosts = null;
  window.downloadsPaginationIndex = 0;
  
  try {
    // Use generic loader for all booru sources
    await loadGenericBooru(window.currentBooruSource, append);
    booruTotalCount.style.display = 'block';
  } catch (err) {
    console.error('Error loading booru images:', err);
    const _proxyHint2 = getProxyDownHint(null, err.message);
    showToast(_proxyHint2 ? `Error loading images: ${_proxyHint2}` : 'Error loading images: ' + err.message, 'error');
    debouncedSettingsSave(); // Save state even on error
  } finally {
    setTimeout(() => {
      isLoadingBooru = false;
    }, 1500);
  }
}

// ============== GENERIC ARTIST FETCHER (Configuration-Driven) ==============

/**
 * Fetch artist for a post using source configuration
 * Handles safe mode automatically based on config
 */
async function fetchArtistForPost(postId, sourceId, tags) {
  try {
    const sourceConfig = booruSourcesManager.getSource(sourceId);
    if (!sourceConfig || !sourceConfig.artist?.tagApiUrl) {
      return ['Unknown'];
    }

    let tagList = [];
    if (Array.isArray(tags)) {
      tagList = tags.filter(t => typeof t === 'string' && t.trim().length > 0);
    } else if (typeof tags === 'string' && tags.trim().length > 0) {
      tagList = tags.trim().split(/\s+/).filter(t => t.length > 0);
    } else if (window.booruPosts) {
      const post = window.booruPosts.find(p => String(p.id) === String(postId) && p.source === sourceId)
        || window.booruPosts.find(p => String(p.id) === String(postId));
      if (post) {
        if (Array.isArray(post.tags)) {
          tagList = post.tags.filter(t => typeof t === 'string' && t.trim().length > 0);
        } else if (typeof post.tags === 'string' && post.tags.trim().length > 0) {
          tagList = post.tags.trim().split(/\s+/).filter(t => t.length > 0);
        }
      }
    }

    if (tagList.length === 0) {
      console.warn(`No tags available to resolve artist for post ${postId}`);
      return [];
    }

    const userId = userIdInput ? userIdInput.value.trim() : '';
    const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';

    const response = await fetch('http://localhost:3001/api/booru/artist-tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceId,
        tags: tagList,
        userId,
        apiKey
      })
    });

    if (!response.ok) {
      let errorBody;
      try { errorBody = await response.json(); } catch (e) { errorBody = { message: await response.text() }; }
      throw new Error(errorBody?.message || `Artist tag lookup failed (${response.status})`);
    }

    const result = await response.json();
    if (!result || !Array.isArray(result.artists)) {
      return [];
    }
    return result.artists;
  } catch (err) {
    console.error(`Error fetching artist for post ${postId} from ${sourceId}:`, err);
    showToast(`Error fetching artist info: ${err.message || err}`, 'error');
    return [];
  }
}

// ============== GENERIC BOORU LOADER (Configuration-Driven) ==============

/**
 * Generic booru loader that uses configuration from booruSourcesManager
 * Replaces all hardcoded source-specific loader functions
 */
async function loadGenericBooru(sourceId, append) {
  if (!booruGallery) return;
  if (booruGallery.classList.contains('downloads-gallery')) return;
  
  // Get source configuration
  const sourceConfig = booruSourcesManager.getSource(sourceId);
  if (!sourceConfig) {
    showToast(`Source configuration not found: ${sourceId}`, 'error');
    console.error('Source not found in database:', sourceId);
    return;
  }
  
  // Check for API credentials if required
  if (sourceConfig.auth.required) {
    const userId = userIdInput ? userIdInput.value.trim() : '';
    const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
    
    if (!userId || !apiKey) {
      booruGallery.innerHTML = `<div style="color: var(--text-secondary); text-align: center; padding: 40px;">Please enter your API key and User ID for ${sourceConfig.name}<br><small>${sourceConfig.auth.helpText || 'Get yours from your account settings'}</small></div>`;
      document.getElementById('load-more-icon')?.remove();
      showToast(`Authentication required for ${sourceConfig.name}: enter User ID and API key`, 'warning');
      return;
    }
  }
  
  const currentTabId = activeTabId;
  const sort = booruSortSelect ? booruSortSelect.value : 'date';
  const limit = booruLimitInput ? parseInt(booruLimitInput.value) : 100;
  const rawSearchTags = searchFilterInput ? searchFilterInput.value.trim() : '';
  
  // Parse tags and blacklist
  const { searchTags, blacklistTags } = parseTagsAndBlacklist(rawSearchTags);
  
  if (!append) {
    showToast(`Loading images from ${sourceConfig.name}...`, 'info');
    document.getElementById('load-more-icon')?.remove();
    booruGallery.innerHTML = '<i class="fas fa-circle-notch fa-spin image-loader" style="position: relative; color: var(--accent); font-size: 60px; width: 100%; height: 200px; line-height: 200px; text-align: center;"></i>';
    booruGallery.style.height = '300px';
    booruPaginationToken = null;
    window.booruPosts = [];
    window.hasMoreResults = true;
  } else {
    // Remove end message if it exists
    const endMessage = booruGallery.querySelector('.booru-end-message');
    if (endMessage) endMessage.remove();
    document.getElementById('load-more-icon')?.remove();
    if (booruLoading) booruLoading.style.display = 'flex';
  }
  
  // Build API URL
  // handle optional 1‑based page start offset
  const startPage = sourceConfig.api.pageStart || 0;
  let page;
  if (append) {
    const base = (booruPaginationToken != null ? booruPaginationToken : startPage);
    page = base + 1;
  } else {
    page = startPage;
  }
  
  // Build tags with negative tags for blacklist (API-side filtering)
  let allTags = searchTags ? searchTags.replace(/\s+/g, ' ') : '';
  
  // Add blacklist as negative tags
  if (blacklistTags.length > 0) {
    const negativeTags = blacklistTags.map(tag => `-${tag}`).join(' ');
    allTags = allTags ? `${allTags} ${negativeTags}` : negativeTags;
  }
  
  // Handle sort based on config
  if (sort === 'score' && sourceConfig.sort.scoreMethod === 'tags') {
    // Add sort:score to tags
    allTags = allTags ? `${allTags} sort:score` : `sort:score`;
  }
  
  // Fetch total count if this is a fresh load
  if (!append) {
    try {
      const countUrl = buildCountUrl(sourceConfig, allTags);
      const countResponse = await proxyFetch(countUrl, { signal: currentAbortController.signal });
      const countText = await countResponse.text();

      if (isCaptchaPage(countText)) {
        showToast(`${sourceConfig.name} blocked by CAPTCHA — open the site in a browser to solve it`, 'error');
        window.totalResultCount = null;
        if (booruLoading) booruLoading.style.display = 'none';
        window.hasMoreResults = false;
        return;
      }
      
      if (countText && countText.trim().length > 0) {
        window.totalResultCount = parseCount(countText, sourceConfig);
      }
    } catch (err) {
      console.warn('Failed to fetch total count:', err);
      showToast('Failed to fetch total count: ' + (err.message || err), 'error');
      window.totalResultCount = null;
    }
  }
  
  // Build main data URL
  const targetUrl = buildDataUrl(sourceConfig, allTags, limit, page, sort);
  
  try {
    const response = await proxyFetch(targetUrl, { signal: currentAbortController.signal });
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${sourceConfig.name} API error response:`, errorText);
      // If server returned explicit captcha error JSON
      try {
        const parsed = JSON.parse(errorText);
        if (parsed.error === 'captcha') {
          showToast(`${sourceConfig.name} blocked by CAPTCHA — open the site in a browser to solve it`, 'error');
          window.hasMoreResults = false;
          if (booruLoading) booruLoading.style.display = 'none';
          return;
        }
      } catch (e) {}
      throw new Error(`Failed to fetch ${sourceConfig.name} data: ${response.status} ${response.statusText}`);
    }
    
    // Check if response has content
    const responseText = await response.text();

    if (isCaptchaPage(responseText)) {
      showToast(`${sourceConfig.name} blocked by CAPTCHA — open the site in a browser to solve it`, 'error');
      window.hasMoreResults = false;
      if (booruLoading) booruLoading.style.display = 'none';
      return;
    }
    
    if (!responseText || responseText.trim().length === 0) {
      if (!append) {
        window.totalResultCount = 0;
        updateTotalCountDisplay();
        document.getElementById('load-more-icon')?.remove();
        booruGallery.innerHTML = '<div style="color: var(--text-secondary); text-align: center; width: 100%; padding: 40px;">No images found</div>';
        showToast('No images found', 'info');
      }
      window.hasMoreResults = false;
      if (booruLoading) booruLoading.style.display = 'none';
      return;
    }

    if (currentTabId !== activeTabId) {
      showToast('Tab changed during load, discarding results', 'warning');
      return;
    }
    
    // Parse posts based on config
    let posts = parsePosts(responseText, sourceConfig);
    
    if (!Array.isArray(posts) || posts.length === 0) {
      if (!append) {
        window.totalResultCount = 0;
        updateTotalCountDisplay();
        document.getElementById('load-more-icon')?.remove();
        booruGallery.innerHTML = '<div style="color: var(--text-secondary); text-align: center; width: 100%; padding: 40px;">No images found</div>';
        showToast('No images found', 'error');
      }
      window.hasMoreResults = false;
      if (booruLoading) booruLoading.style.display = 'none';
      return;
    }
    
    booruPaginationToken = page;
    
    // Check if we got fewer results than requested (likely end of results)
    if (posts.length < limit) {
      window.hasMoreResults = false;
    }
    
    // Normalize posts using config field mappings
    let normalizedPosts = normalizePosts(posts, sourceConfig);

    // apply global blacklist filter (settings page)
    if (window.globalBlacklistTags && window.globalBlacklistTags.length > 0) {
      const before = normalizedPosts.length;
      normalizedPosts = filterBlacklistedPosts(normalizedPosts, window.globalBlacklistTags);
      const filteredOut = before - normalizedPosts.length;
      if (filteredOut > 0) {
        console.log(`[BLACKLIST] filtered out ${filteredOut} posts`);
        showToast(`Filtered out ${filteredOut} blacklisted posts`, 'info');
        // adjust total count display if we know the overall count
        if (!append && window.totalResultCount != null) {
          window.totalResultCount = Math.max(0, window.totalResultCount - filteredOut);
          updateTotalCountDisplay();
        }
      }
    }
    
    // No client-side filtering needed - API handles it
    if (normalizedPosts.length === 0 && !append) {
      window.totalResultCount = 0;
      updateTotalCountDisplay();
      document.getElementById('load-more-icon')?.remove();
      booruGallery.innerHTML = '<div style="color: var(--text-secondary); text-align: center; width: 100%; padding: 40px;">No images found</div>';
      showToast('No matching images', 'error');
      if (booruLoading) booruLoading.style.display = 'none';
      return;
    }
    
    if (append) {
      window.booruPosts = window.booruPosts.concat(normalizedPosts);
    } else {
      window.booruPosts = normalizedPosts;
    }
    
    // Check if we've loaded all available posts
    if (window.totalResultCount && window.booruPosts.length >= window.totalResultCount) {
      window.hasMoreResults = false;
    }
    
    booruGallery.classList.remove('downloads-gallery');
    const artistSection = document.querySelector('.control-section-artist');
    if (artistSection) artistSection.style.display = 'none';
    const sourceSection = document.querySelector('.control-section-source');
    if (sourceSection) sourceSection.style.display = 'none';
    
    // Update tag suggestions
    updateTagSuggestions(sourceId, normalizedPosts);
    
    renderBooruGallery(normalizedPosts, append);
    
    // Save tab state after loading images
    if (typeof saveCurrentTabState === 'function') {
      saveCurrentTabState(true);
    }
    
    if (booruLoading) booruLoading.style.display = 'none';
    
    if (!append) {
      showToast(`Loaded ${normalizedPosts.length} images from ${sourceConfig.name}`, 'success');
      updateTotalCountDisplay();
    }
    
    debouncedSettingsSave();
  } catch (err) {
    console.error(`${sourceConfig.name} fetch error:`, err);
    if (!append) {
      document.getElementById('load-more-icon')?.remove();
      booruGallery.innerHTML = `<div style="color: var(--text-secondary); text-align: center; margin-top: 100px; width: 100%; font-size: 30px;">Error loading images from ${sourceConfig.name}.</div>`;
    }
    if (booruLoading) booruLoading.style.display = 'none';
    const _proxyHint = getProxyDownHint(null, err.message);
    showToast(_proxyHint ? `Failed to load ${sourceConfig.name} images: ${_proxyHint}` : `Failed to load ${sourceConfig.name} images: ` + err.message, 'error');
    throw err;
  }
}

/**
 * Build count URL based on source configuration
 */
function buildCountUrl(sourceConfig, tags) {
  const userId = userIdInput ? userIdInput.value.trim() : '';
  const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
  
  // Use apiUrl if available, otherwise fall back to baseUrl
  const apiBaseUrl = sourceConfig.apiUrl || sourceConfig.baseUrl;
  const countPath = sourceConfig.api.countBasePath || sourceConfig.api.basePath;
  let url = `${apiBaseUrl}${countPath}`;
  
  // Add json parameter if supported
  if (sourceConfig.api.jsonSupport && sourceConfig.response.countParser === 'json') {
    url += url.includes('?') ? '&json=1' : '?json=1';
  }
  
  // Add limit=0 and pid=0 for count endpoint
  url += url.includes('?') ? `&${sourceConfig.api.limitParam}=0&${sourceConfig.api.pageParam}=0` : `?${sourceConfig.api.limitParam}=0&${sourceConfig.api.pageParam}=0`;
  
  // Add authentication if required
  if (sourceConfig.auth.required) {
    url += `&${sourceConfig.auth.userIdKey}=${encodeURIComponent(userId)}&${sourceConfig.auth.apiKeyKey}=${encodeURIComponent(apiKey)}`;
  }
  
  // Add tags if present
  if (tags) {
    url += `&${sourceConfig.api.tagsParam}=${encodeURIComponent(tags)}`;
  }
  
  return url;
}

/**
 * Build data URL based on source configuration
 */
function buildDataUrl(sourceConfig, tags, limit, page, sort) {
  const userId = userIdInput ? userIdInput.value.trim() : '';
  const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
  
  // Use apiUrl if available, otherwise fall back to baseUrl
  const apiBaseUrl = sourceConfig.apiUrl || sourceConfig.baseUrl;
  let url = `${apiBaseUrl}${sourceConfig.api.basePath}`;
  
  // Add json parameter if supported
  if (sourceConfig.api.jsonSupport) {
    url += url.includes('?') ? '&json=1' : '?json=1';
  }
  
  // Add limit and page
  url += url.includes('?') ? `&${sourceConfig.api.limitParam}=${limit}&${sourceConfig.api.pageParam}=${page}` : `?${sourceConfig.api.limitParam}=${limit}&${sourceConfig.api.pageParam}=${page}`;
  
  // Add authentication if required
  if (sourceConfig.auth.required) {
    url += `&${sourceConfig.auth.userIdKey}=${encodeURIComponent(userId)}&${sourceConfig.auth.apiKeyKey}=${encodeURIComponent(apiKey)}`;
  }
  
  // Add sort parameter if using separate param method
  if (sort === 'score' && sourceConfig.sort.scoreMethod === 'param' && sourceConfig.sort.paramName) {
    url += `&${sourceConfig.sort.paramName}=score`;
  }

  // Attempt to get Artist tag if given
  url += `&fields=tag_info`;
  
  // Add tags if present
  if (tags) {
    url += `&${sourceConfig.api.tagsParam}=${encodeURIComponent(tags)}`;
  }
  
  return url;
}

/**
 * Parse count from response based on config.
 * For any parser type: after the specific extraction attempt, fall back to scanning
 * the entire response string for numbers and returning the largest one.
 */
function parseCount(responseText, sourceConfig) {
  // Helper: extract the largest number from any string
  function largestNumberIn(str) {
    const nums = String(str).match(/\d+/g);
    if (!nums || nums.length === 0) return null;
    return Math.max(...nums.map(n => parseInt(n, 10)));
  }

  try {
    if (sourceConfig.response.countParser === 'xmlDom') {
      // Parse XML using DOMParser
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(responseText, 'text/xml');
      
      // Parse countPath (e.g., "posts/@count" or "@attributes.count")
      if (sourceConfig.response.countPath) {
        const parts = sourceConfig.response.countPath.split('/');
        let element = xmlDoc;
        
        for (const part of parts) {
          if (part.startsWith('@')) {
            // It's an attribute
            const attrName = part.substring(1);
            if (element.hasAttribute && element.hasAttribute(attrName)) {
              return parseInt(element.getAttribute(attrName));
            }
          } else {
            // It's an element
            element = element.querySelector(part);
            if (!element) break;
          }
        }
      }
    } else if (sourceConfig.response.countParser === 'xmlRegex') {
      // Parse XML using regex
      const countMatch = responseText.match(/<posts\s+count="(\d+)"/);
      if (countMatch && countMatch[1]) {
        return parseInt(countMatch[1]);
      }
    } else if (sourceConfig.response.countParser === 'json') {
      // Parse JSON
      const data = JSON.parse(responseText);
      
      // Navigate countPath (e.g., "@attributes.count")
      if (sourceConfig.response.countPath) {
        const parts = sourceConfig.response.countPath.split('.');
        let value = data;
        
        for (const part of parts) {
          if (value && typeof value === 'object' && part in value) {
            value = value[part];
          } else {
            break;
          }
        }
        
        if (typeof value === 'number' || typeof value === 'string') {
          return parseInt(value);
        }
      }
    }
  } catch (err) {
    console.warn('Failed to parse count with configured parser:', err);
  }

  // Fallback: pull all numbers from the raw response and return the largest
  return largestNumberIn(responseText);
}

/**
 * Resolve a (possibly dot-notation) field path from an object.
 * e.g. resolveField(post, "file.url") === post.file.url
 */
function resolveField(obj, path) {
  if (!path || obj == null) return undefined;
  if (!path.includes('.')) return obj[path];
  return path.split('.').reduce((cur, key) => (cur != null && typeof cur === 'object' ? cur[key] : undefined), obj);
}

function normalizePostId(id) {
  if (id == null) return '';
  const normalized = String(id);
  return normalized.replace(/\.0+$/, '');
}

/**
 * Parse posts from response based on config
 */
function parsePosts(responseText, sourceConfig) {
  try {
    const responseData = JSON.parse(responseText);
    
    if (sourceConfig.response.wrapper && sourceConfig.response.wrapper in responseData) {
      return responseData[sourceConfig.response.wrapper];
    }
    
    // Otherwise return directly if it's an array
    if (Array.isArray(responseData)) {
      return responseData;
    }
    
    // Last resort: check for common wrapper names
    if (responseData.post && Array.isArray(responseData.post)) {
      return responseData.post;
    }
    if (responseData.posts && Array.isArray(responseData.posts)) {
      return responseData.posts;
    }
    
    return [];
  } catch (jsonErr) {
    console.error('Failed to parse JSON:', jsonErr);
    showToast('Error parsing response from server - Try updating cookies for the source', 'error');
    return [];
  }
}

/**
 * Normalize posts using source configuration field mappings
 */
function normalizePosts(posts, sourceConfig) {
  return posts.map(post => {
    // Parse tags
    const tagsField = sourceConfig.fields.tags;
    let tags = [];

    let artists = post["tag_info"]?.filter(item => item.type === "artist")?.map(item => item.tag) ?? ['?'];
    if (artists.length > 0 && artists[0] === '?') {
      const artistRaw = resolveField(post, sourceConfig.fields.artistTag);
      if (Array.isArray(artistRaw)) {
        artists = artistRaw.length > 0 ? artistRaw : ['?'];
      } else if (typeof artistRaw === 'string' && artistRaw) {
        artists = artistRaw.split(' ').filter(t => t.length > 0);
      }
    }

    const tagsRaw = resolveField(post, tagsField);
    if (typeof tagsRaw === 'string') {
      tags = tagsRaw.split(' ').filter(t => t.length > 0);

      if (sourceConfig.fields.tagsFilter) {
        const filterRegex = new RegExp(sourceConfig.fields.tagsFilter, 'g');
        tags = tags.filter(t => t !== '+' && !filterRegex.test(t));
      }

      // Decode HTML entities
      tags = tags.map(decodeHtmlEntities);
    } else if (tagsRaw && typeof tagsRaw === 'object') {
      // e621-style: object of tag-category arrays e.g. {general:[...], artist:[...], species:[...]}
      tags = Object.values(tagsRaw).flat().filter(t => typeof t === 'string' && t.length > 0);
    }
    
    // Parse created date
    let createdAt = null;
    const createdField = sourceConfig.fields.createdAt;
    
    const createdVal = resolveField(post, createdField);
    if (createdVal) {
      if (sourceConfig.fields.dateType === 'timestamp') {
        // Unix timestamp (seconds)
        createdAt = createdVal * 1000;
      } else if (sourceConfig.fields.dateType === 'dateString') {
        // Date string
        createdAt = new Date(createdVal).getTime();
      }
    }

    // Extract width/height from configured fields or post directly
    const widthField = sourceConfig.fields.width;
    const heightField = sourceConfig.fields.height;
    let widthVal = widthField ? resolveField(post, widthField) : post.width;
    let heightVal = heightField ? resolveField(post, heightField) : post.height;
    if (widthVal != null) widthVal = parseFloat(widthVal);
    if (heightVal != null) heightVal = parseFloat(heightVal);
    
    // Helper function to parse URL templates
    const parseUrlTemplate = (template) => {
      if (!template) return null;
      
      // Replace all {placeholder} patterns with actual values from post
      return template.replace(/\{([^}]+)\}/g, (match, placeholder) => {
        // Handle .noext suffix to strip file extension
        if (placeholder.endsWith('.noext')) {
          const fieldName = placeholder.slice(0, -6); // Remove '.noext'
          const value = post[fieldName];
          if (!value) return match;
          // Strip extension (everything after last dot)
          const lastDotIndex = value.lastIndexOf('.');
          return lastDotIndex > 0 ? value.substring(0, lastDotIndex) : value;
        }
        
        // Normal placeholder - just return the field value
        return post[placeholder] !== undefined ? post[placeholder] : match;
      });
    };
    
    // Helper function to construct full URL
    const constructUrl = (urlOrFilename, urlType = 'image') => {
      // If source uses URL templates, parse the appropriate template
      if (sourceConfig.fields.useUrlTemplates) {
        let template;
        if (urlType === 'image' && sourceConfig.fields.imageUrlTemplate) {
          template = sourceConfig.fields.imageUrlTemplate;
        } else if (urlType === 'sample' && sourceConfig.fields.sampleUrlTemplate) {
          template = sourceConfig.fields.sampleUrlTemplate;
        } else if (urlType === 'thumbnail' && sourceConfig.fields.thumbnailUrlTemplate) {
          template = sourceConfig.fields.thumbnailUrlTemplate;
        }
        
        if (template) {
          return parseUrlTemplate(template);
        }
      }
      
      // Early return if no URL provided and not using templates
      if (!urlOrFilename) return urlOrFilename;
      
      // If source returns partial URLs (just filenames), prepend the URL prefix
      if (sourceConfig.fields.partialUrls && sourceConfig.fields.urlPrefix) {
        // Check if it's already a full URL (starts with http:// or https://)
        if (!urlOrFilename.startsWith('http://') && !urlOrFilename.startsWith('https://')) {
          // Ensure urlPrefix ends with / and filename doesn't start with /
          const prefix = sourceConfig.fields.urlPrefix.endsWith('/') 
            ? sourceConfig.fields.urlPrefix 
            : sourceConfig.fields.urlPrefix + '/';
          const filename = urlOrFilename.startsWith('/') ? urlOrFilename.slice(1) : urlOrFilename;
          return prefix + filename;
        }
      }
      
      return urlOrFilename;
    };

    return {
      id: normalizePostId(post.id),
      imageUrl: constructUrl(resolveField(post, sourceConfig.fields.imageUrl), 'image'),  // Full quality
      thumbnailUrl: constructUrl(resolveField(post, sourceConfig.fields.previewUrl) || resolveField(post, sourceConfig.fields.sampleUrl) || resolveField(post, sourceConfig.fields.imageUrl), 'thumbnail'),
      sampleUrl: constructUrl(resolveField(post, sourceConfig.fields.sampleUrl), 'sample'),  // Medium quality
      tags: tags,
      artists: artists,
      score: sourceConfig.fields.score ? (resolveField(post, sourceConfig.fields.score) || 0) : (post.score || 0),
      rating: post.rating,
      source: sourceConfig.id,
      width: widthVal,
      height: heightVal,
      aspectRatio: widthVal && heightVal ? heightVal / widthVal : (post.width && post.height ? post.height / post.width : 1),
      createdAt: createdAt
    };
  });
}

function restoreHighQualityGalleryImages() {
  const gallery = document.getElementById('booru-gallery');
  if (!gallery) return;
  gallery.querySelectorAll('.booru-image-item img[data-high-quality-loaded="true"][data-high-quality-url]').forEach(img => {
    const highQualityUrl = img.dataset.highQualityUrl;
    if (!highQualityUrl) return;
    if (img.src !== highQualityUrl) {
      img.src = highQualityUrl;
    }
    if (!img.dataset.currentQualityUrl) {
      img.dataset.currentQualityUrl = highQualityUrl;
    }
    // --- Update tab cache with new quality ---
    try {
      const postId = img.closest('.booru-image-item')?.dataset.postId;
      const postSource = img.closest('.booru-image-item')?.dataset.postSource;
      if (window.booruTabs && window.activeTabId) {
        const tab = window.booruTabs.find(t => t.id === window.activeTabId);
        if (tab && Array.isArray(tab.booruPosts)) {
          const post = tab.booruPosts.find(p => String(p.id) === String(postId) && String(p.source) === String(postSource));
          if (post) {
            post.imageUrl = img.src;
            post.currentQualityUrl = img.src;
          }
        }
      }
    } catch (e) { /* ignore */ }
  });
}

// Update the total count display
function updateTotalCountDisplay() {
  if (!booruTotalCount) return;
  
  if (totalResultCount !== null) {
    const displayText = `${booruSourceSelect.value.charAt(0).toUpperCase() + booruSourceSelect.value.slice(1)} <b>${totalResultCount.toLocaleString('de-DE')} found</b>`;
    booruTotalCount.innerHTML = displayText;
    booruTotalCount.style.display = 'block';
    saveTotalCount(); // Save to localStorage
  } else {
    const displayText = `${booruSourceSelect.value.charAt(0).toUpperCase() + booruSourceSelect.value.slice(1)} <b>? found</b>`;
    booruTotalCount.innerHTML = displayText;
    booruTotalCount.style.display = 'block';
  }
}

// Render booru gallery using Justified Gallery
function renderBooruGallery(posts, append = true, addSeparators = true) {
  // Expose globally for use in other scripts
  window.renderBooruGallery = renderBooruGallery;

  if (!booruGallery) return;

  // Update the active tab's name to reflect the current search when starting a fresh render
  if (!append && typeof updateTabName === 'function' && typeof activeTabId !== 'undefined' && activeTabId) {
    const searchVal = searchFilterInput ? searchFilterInput.value.trim() : '';
    const newTabName = searchVal || 'New Tab';
    updateTabName(activeTabId, newTabName);
  }

  document.querySelector('.booru-end-message')?.remove();

  booruGallery = document.getElementById('booru-gallery'); // Refresh reference in case it was replaced
  const isDownloadsGallery = booruGallery.classList.contains('downloads-gallery');
  
  // Destroy existing Justified Gallery instance if replacing content
  if (!append && typeof $.fn.justifiedGallery !== 'undefined') {
    // Unbind all event handlers from images before destroying to prevent context errors
    $(booruGallery).find('img').off('load error');
    $(booruGallery).justifiedGallery('destroy');
    
    // Clean up old DOM elements to prevent memory leaks
    if (typeof cleanupGallery !== 'undefined') {
      cleanupGallery(booruGallery);
    } else {
      booruGallery.innerHTML = '';
      document.getElementById('load-more-icon')?.remove();
    }

    if (isDownloadsGallery) {
      renderDownloadsSidebar();
      updateArtistFilter();
      updateSourceFilter();
    }
  }



  // Get current image size from slider
  currentImageSize = parseInt(imageSizeSlider.value, 10);
  
  // Limit window.booruPosts to prevent unbounded growth (keep last 1000 posts)
  if (window.booruPosts && window.booruPosts.length > 1000 && typeof limitArraySize !== 'undefined') {
    window.booruPosts = limitArraySize(window.booruPosts, 1000);
  }
  
  // Create image elements with data-index for fast counter lookup
  let startIndex = 0;
  if (append && booruGallery.children.length > 0) {
    const all = booruGallery.querySelectorAll('.booru-image-item img[data-index]');
    startIndex = all.length;
  }
  let lastArtist = null;

  if (!isDownloadsGallery) {
    const artistSection = document.querySelector('.control-section-artist');
    if (artistSection)
      artistSection.style.display = 'none';
  }
  posts.forEach((post, i) => {
    if (post?.imageUrl === undefined) return; // Skip posts without imageUrl

    if (lastArtist == null && window.downloadsPaginationIndex == parseInt(document.getElementById('booru-limit-input')?.value) && post.artist && addSeparators) {
      const seperator = document.createElement('div');
      seperator.className = 'artist-separator';
      seperator.innerHTML = `<h2>${post.artist}</h2>`;
      galleryWrapper.prepend(seperator);
    }

    if (isDownloadsGallery && post.artist !== lastArtist && lastArtist !== null && addSeparators) {
      $(booruGallery).justifiedGallery({
        rowHeight: currentImageSize || 250,
        maxRowHeight: false, // Allow natural height variation
        margins: 10,
        lastRow: 'nojustify',
        captions: false,
        waitThumbnailsLoad: false,
        border: 0
      });
      const galleryWrapper = document.getElementById('gallery-wrapper');
      if (galleryWrapper) {
        const newGallery = document.createElement('div');
        newGallery.className = 'booru-gallery downloads-gallery justified-gallery';
        const seperator = document.createElement('div');
        seperator.className = 'artist-separator';
        seperator.innerHTML = `<h2>${post.artist}</h2>`;
        galleryWrapper.appendChild(seperator);
        galleryWrapper.appendChild(newGallery);
        booruGallery.id = ''; // Clear old gallery ID to prevent conflicts
        newGallery.id = 'booru-gallery'; // Assign ID to new gallery
        booruGallery = newGallery;
      }
    } else {
      //console.log(isDownloadsGallery, post.artist, lastArtist, addSeparators);
    }

    const imageElement = createBooruImageElement({ ...post, dataIndex: startIndex + i + 1 });
    booruGallery.appendChild(imageElement);
    lastArtist = post.artist;
    let visibilityDelay = 1000 * (1 - Math.exp(-0.05 * i));
    setTimeout(() => {
      if (imageElement) imageElement.classList.add('visible', 'jg-entry-visible');
    }, visibilityDelay);
    
  });

  if (window.hasMoreResults) {
    const gallery = document.getElementById('gallery-wrapper');
    if (gallery) {
      if (document.getElementById('load-more-icon') == null) {
        const loadMore = document.createElement('div');
        loadMore.id = 'load-more-icon';
        loadMore.innerHTML = '<i class="fa-solid fa-ellipsis" style="color: var(--text-secondary); font-size: 30px;"></i>';
        loadMore.style.cssText = 'display: flex; opacity: 0; justify-content: center; align-items: center; padding: 20px;';
        gallery.appendChild(loadMore);
      }
    }
  } else {
    document.getElementById('load-more-icon')?.remove();
  }
  
  setTimeout(() => {
    const loadIcon = document.getElementById('load-more-icon');
    if (loadIcon) loadIcon.style.opacity = '1';
  }, 1000 * (1 - Math.exp(-0.05 * posts.length)));
  
  // Initialize or update Justified Gallery
  $(booruGallery).justifiedGallery({
    rowHeight: currentImageSize || 250,
    maxRowHeight: false, // Allow natural height variation
    margins: 10,
    lastRow: 'nojustify',
    captions: false,
    waitThumbnailsLoad: false,
    border: 0
  });
  restoreHighQualityGalleryImages();
  $(booruGallery).one('jg.complete', restoreHighQualityGalleryImages);

  // No post-layout separator logic needed; separators are now real gallery items.

  // Add end-of-results message if no more content available
  if (!window.hasMoreResults && booruPosts.length > 0) {
    const endMessage = document.createElement('div');
    endMessage.className = 'booru-end-message';
    endMessage.style.cssText = 'text-align: center; padding: 30px; color: var(--text-secondary); font-size: 14px; border-top: 1px solid var(--border); margin-top: 20px;';
    endMessage.innerHTML = `<p>loaded <b>${totalResultCount ?? 0}</b></p> <p><i class="fa-solid fa-xmark"></i> No more results available</p><br><h1>Recommended Tags</h1> <div class="booru-end-tags" id="booru-end-tags"></div>`;
    const existingEndMessage = booruContent.querySelector('.booru-end-message');
    if (existingEndMessage) existingEndMessage.remove();
    booruContent.appendChild(endMessage);
    fillBooruEndTags();
  }
}

// function createBooruImageElement(post, maxHeight = null, imageWidth = null) {

//   // Use <div> instead of <a> to prevent browser navigation on middle mouse
//   const link = document.createElement('div');
//   link.className = 'booru-image-item';
//   link.dataset.score = post.score || 0;
//   link.dataset.tags = post.tags ? post.tags.join(' ') : '';
//   link.dataset.artist = Array.isArray(post.artist) ? post.artist.join(', ') : (post.artist || (post.artists ? post.artists.join(', ') : 'Unknown'));
//   link.dataset.postId = normalizePostId(post.id);
//   link.dataset.postSource = post.source;
//   const aspectRatio = post.aspectRatio || 1;
//   link.dataset.aspectRatio = aspectRatio;
//   // For legacy/local posts, ensure preview works by setting correct data attributes
//   // If imageUrl is a relative path, set both imageUrl and thumbnailUrl to the same value if needed
//   if (post.source === 'legacy' && post.imageUrl && post.imageUrl.startsWith('/')) {
//     post.thumbnailUrl = post.thumbnailUrl || post.imageUrl;
//   }
//   // If post.dataIndex is present, assign it to the image later
//   const dataIndex = post.dataIndex;
  
//   const loader = document.createElement('i');
//   loader.className = 'fas fa-circle-notch fa-spin image-loader';
//   link.appendChild(loader);
  
//   // Check if URL is a video
//   const url = post?.imageUrl?.toLowerCase() || 'Unknown';
//   const isVideo = url.endsWith('.mp4') || url.endsWith('.webm') || url.endsWith('.mov') || 
//                   url.includes('.mp4?') || url.includes('.webm?') || url.includes('.mov?');
//   const isGif = url.endsWith('.gif') || url.includes('.gif?');
  
//   // Add file type class for colored border
//   if (isVideo) {
//     link.classList.add('file-type-video');
//   } else if (isGif) {
//     link.classList.add('file-type-gif');
//     //post.thumbnailUrl = post.imageUrl; // For GIFs, use full URL as thumbnail to preserve animation
//   } else {
//     link.classList.add('file-type-image');
//   }
  
//   let mediaElement;

//   // Only apply gallery quality toggle to images, not videos
//   const useHighQuality = (!isVideo && typeof showHighQualityGallery !== 'undefined') ? showHighQualityGallery : false;

//   if (isVideo) {
//     // Check if thumbnail is also a video (common for downloads) or an actual image thumbnail (common for booru)
//     const thumbnailUrl = useHighQuality ? post.imageUrl : (post.thumbnailUrl || post.imageUrl);

//     // Thumbnail is an image - use img element (for booru gallery)
//     mediaElement = document.createElement('img');
//     mediaElement.alt = post.title || 'Video';
//     mediaElement.dataset.isVideo = 'true';
    
//     const width = 400;
//     const height = Math.round(width * aspectRatio);
//     mediaElement.setAttribute('width', width);
//     mediaElement.setAttribute('height', height);
//     mediaElement.style.opacity = '0';
    
//     mediaElement.dataset.imageUrl = post.imageUrl;
//     mediaElement.dataset.thumbnailUrl = post.thumbnailUrl;
//     mediaElement.dataset.tags = post.tags.join(' ');
//     mediaElement.dataset.author = Array.isArray(post.artist) ? post.artist.join(', ') : (post.artist || post.author || 'Unknown');
//     mediaElement.dataset.title = post.title || '';
//     mediaElement.dataset.createdAt = post.createdAt || '';

//     if (typeof dataIndex !== 'undefined') {
//       mediaElement.setAttribute('data-index', dataIndex);
//     }

//     mediaElement.addEventListener('load', () => {
//       mediaElement.style.opacity = '1';
//       mediaElement.classList.add('loaded');
//       loader.style.display = 'none';
//     }, { once: true });
    
//     mediaElement.addEventListener('error', () => {
//       mediaElement.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="%23252a3a"/><text x="50%" y="50%" text-anchor="middle" fill="%23a0a0a0" font-size="16">Video</text></svg>';
//       mediaElement.style.opacity = '1';
//       mediaElement.classList.add('loaded');
//       loader.style.display = 'none';
//     }, { once: true });
    
//     mediaElement.loading = 'lazy';
//     const currentTabId = typeof activeTabId !== 'undefined' ? activeTabId : null;
//     const resolvedThumbnailUrl = getImageUrl(thumbnailUrl);
//     mediaElement.dataset.resolvedThumbnailUrl = resolvedThumbnailUrl;
//     const isVideoSource = thumbnailUrl.toLowerCase().endsWith('.mp4') || thumbnailUrl.toLowerCase().endsWith('.webm') || thumbnailUrl.toLowerCase().endsWith('.mov');
//     const cacheKey = isVideoSource ? `video-thumbnail:${thumbnailUrl}` : resolvedThumbnailUrl;
//     const cachedThumbnailUrl = currentTabId && !cacheKey.includes('?url=Unknown') ? getCachedThumbnailUrl(currentTabId, cacheKey) : null;
//     const backendThumbnailUrl = isVideoSource && resolvedThumbnailUrl ? `http://localhost:3001/video-thumbnail?url=${encodeURIComponent(resolvedThumbnailUrl)}` : null;

//     if (cachedThumbnailUrl) {
//       mediaElement.src = cachedThumbnailUrl;
//     } else if (isVideoSource) {
//       if (backendThumbnailUrl) {
//         mediaElement.src = backendThumbnailUrl;
//         mediaElement.addEventListener('load', () => {
//           if (currentTabId && cacheKey && !cacheKey.includes('?url=Unknown') && !getCachedThumbnailUrl(currentTabId, cacheKey)) {
//             cacheThumbnailBlobForTab(currentTabId, backendThumbnailUrl, cacheKey).catch(() => {});
//           }
//         }, { once: true });
//       } else {
//         console.warn('No valid thumbnail URL for video post:', post);
//         mediaElement.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="%23252a3a"/><text x="50%" y="50%" text-anchor="middle" fill="%23a0a0a0" font-size="16">Video</text></svg>';
//       }
//     } else {
//       mediaElement.src = resolvedThumbnailUrl;
//       mediaElement.addEventListener('load', () => {
//         if (currentTabId && cacheKey && !cacheKey.includes('?url=Unknown') && !getCachedThumbnailUrl(currentTabId, cacheKey)) {
//           cacheThumbnailBlobForTab(currentTabId, resolvedThumbnailUrl, cacheKey).catch(() => {});
//         }
//       }, { once: true });
//     }
    
//   } else {
//     // Create image element
//     mediaElement = document.createElement('img');
//     mediaElement.alt = post.title || post.tags.slice(0, 5).join(' ');
    
//     // Set explicit dimensions for Justified Gallery to layout before image loads
//     const width = 400;
//     const height = Math.round(width * aspectRatio);
//     mediaElement.setAttribute('width', width);
//     mediaElement.setAttribute('height', height);
    
//     mediaElement.style.width = '100%';
//     mediaElement.style.height = '100%';
//     mediaElement.style.objectFit = 'cover';
//     mediaElement.style.opacity = '0'; // Start hidden, show on load
//     mediaElement.dataset.aspectRatio = aspectRatio;
//     mediaElement.dataset.imageUrl = post.imageUrl;  // Store full quality URL for preview/download
//     mediaElement.dataset.thumbnailUrl = post.thumbnailUrl;  // Store thumbnail URL
//     if (post.sampleUrl) {
//       mediaElement.dataset.sampleUrl = post.sampleUrl;  // Store sample/medium quality URL if available
//     }
//     mediaElement.dataset.tags = post.tags.join(' ');
//     mediaElement.dataset.author = Array.isArray(post.artist) ? post.artist.join(', ') : (post.artist || post.author || 'Unknown');
//     mediaElement.dataset.title = post.title || '';
//     mediaElement.dataset.createdAt = post.createdAt || '';

//     if (post.sampleUrl) {
//       mediaElement.dataset.sampleUrl = post.sampleUrl;  // Store sample/medium quality URL if available
//     }
//     if (url.endsWith('.gif') || url.includes('.gif?')) {
//       mediaElement.dataset.isGif = 'true';
//     }
//     if (typeof dataIndex !== 'undefined') {
//       mediaElement.setAttribute('data-index', dataIndex);
//     }
    
//     mediaElement.addEventListener('load', async () => {
//       mediaElement.style.opacity = '1'; // Fade in on load
//       mediaElement.classList.add('loaded');
//       loader.style.display = 'none';
      
//       // Cache thumbnail after successful load (avoid duplicate fetch before load)
//       const currentTabId = typeof activeTabId !== 'undefined' ? activeTabId : null;
//       const resolvedThumbnailUrl = mediaElement.dataset.resolvedThumbnailUrl;
//       const isVideoSource = resolvedThumbnailUrl && (resolvedThumbnailUrl.endsWith('.mp4') || resolvedThumbnailUrl.endsWith('.webm') || resolvedThumbnailUrl.endsWith('.mov'));
//       const cacheKey = isVideoSource ? `video-thumbnail:${resolvedThumbnailUrl}` : resolvedThumbnailUrl;
//       if (currentTabId && cacheKey && !cacheKey.includes('?url=Unknown') && !getCachedThumbnailUrl(currentTabId, cacheKey)) {
//         cacheThumbnailBlobForTab(currentTabId, resolvedThumbnailUrl, cacheKey).catch(() => {});
//       }

//       // Check if mouse position is within image boundaries and show preview
//       if (!previewFrozen && typeof showPreviewForElement === 'function') {
//         const rect = mediaElement.getBoundingClientRect();
//         const isHovering = lastMouseX >= rect.left && lastMouseX <= rect.right &&
//                           lastMouseY >= rect.top && lastMouseY <= rect.bottom;
//         if (isHovering) {
//           if (typeof lastHoveredElement !== 'undefined') {
//             window.booruLastHoveredElement = mediaElement;
//           }
//           showPreviewForElement(mediaElement);
//         }
//       }
//     }, { once: true });
    
//     mediaElement.addEventListener('error', (e) => {
//       loader.style.display = 'none';
//       mediaElement.style.display = 'none';
//       const errorDiv = document.createElement('div');
//       errorDiv.style.cssText = `
//         width: 100%;
//         height: 100%;
//         display: flex;
//         align-items: center;
//         justify-content: center;
//         background: var(--bg-darkest);
//         color: var(--text-secondary);
//         font-size: 12px;
//         text-align: center;
//         padding: 10px;
//       `;
//       errorDiv.innerHTML = '<i class="fas fa-exclamation-triangle errorDivIcon"></i>Failed to load';
//       link.appendChild(errorDiv);
//     }, { once: true });
    
//     mediaElement.decoding = 'async';
//     mediaElement.loading = 'lazy';
//     const resolvedThumbnailUrl = getImageUrl(useHighQuality ? url : (post.thumbnailUrl || url));
//     mediaElement.dataset.resolvedThumbnailUrl = resolvedThumbnailUrl;
//     const currentTabId = typeof activeTabId !== 'undefined' ? activeTabId : null;
//     const isVideoSource = resolvedThumbnailUrl.endsWith('.mp4') || resolvedThumbnailUrl.endsWith('.webm') || resolvedThumbnailUrl.endsWith('.mov');
//     const cacheKey = isVideoSource ? `video-thumbnail:${resolvedThumbnailUrl}` : resolvedThumbnailUrl;
//     const cachedThumbnailUrl = currentTabId && cacheKey && !cacheKey.includes('?url=Unknown') ? getCachedThumbnailUrl(currentTabId, cacheKey) : null;
//     if (cachedThumbnailUrl) {
//       mediaElement.src = cachedThumbnailUrl;
//     } else if (isVideoSource) {
//       const backendThumbnailUrl = `http://localhost:3001/video-thumbnail?url=${encodeURIComponent(resolvedThumbnailUrl)}`;
//       mediaElement.src = backendThumbnailUrl;
//       if (currentTabId && cacheKey && !cacheKey.includes('?url=Unknown') && !getCachedThumbnailUrl(currentTabId, cacheKey)) {
//         cacheThumbnailBlobForTab(currentTabId, backendThumbnailUrl, cacheKey).catch(() => {});
//       }
//     } else {
//       mediaElement.src = cachedThumbnailUrl || resolvedThumbnailUrl;
//     }
//   }
  
//   link.appendChild(mediaElement);
  
//   link.addEventListener('click', (e) => { 
//     openBooruLightbox(post.imageUrl);
//   });
  
//   link.addEventListener('mousedown', (e) => {
//     if (e.button === 1) {
//       // Only trigger download, do not open URL
//       e.preventDefault();
//       e.stopPropagation();
//       if (downloadBtn)
//         downloadBtn.click();
//       return false;
//     }
//   });
  
//   // Add download button
//   let downloadBtn = document.createElement('button');
//   downloadBtn.className = 'booru-download-btn';
//   downloadBtn.innerHTML = '<i class="fas fa-download"></i>';
//   downloadBtn.title = 'Download';
  
//   // Add progress bar (hidden by default)
//   const progressContainer = document.createElement('div');
//   progressContainer.className = 'booru-download-progress';
//   progressContainer.style.display = 'none';
//   const progressBar = document.createElement('div');
//   progressBar.className = 'booru-download-progress-bar';
//   progressBar.style.width = '0%';
//   progressContainer.appendChild(progressBar);
  
//   // Store download state
//   link.dataset.downloaded = 'false';
  
//   // Store hover handlers for removal later
//   let hoverHandlers = null;
  
//   // Check if this image is already downloaded (exclude videos)
//   if (window.downloadFolder) {
//     const filename = getFilenameFromUrl(post.imageUrl, post.id);
//     fetch('http://localhost:3001/check-downloaded-images', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ filenames: [filename] })
//     })
//     .then(res => res.json())
//     .then(data => {
//       if (data.downloaded && data.downloaded[filename]) {
//         const localUrl = `http://localhost:3001/serve-local-file/${encodeURIComponent(filename)}`;
//         link.dataset.downloaded = 'true';
//         downloadBtn.innerHTML = '<i class="fas fa-check"></i>';
//         downloadBtn.classList.add('downloaded');
//         downloadBtn.title = 'Delete';

//         if (!isVideo) {
//           if (mediaElement) {
//             mediaElement.dataset.highQualityLoaded = 'true';
//             if (mediaElement.src !== localUrl) {
//               mediaElement.src = localUrl;
//             }
//           }

//           const previewImg = booruPreviewMediaContainer.querySelector('img');
//           if (previewImg && previewImg.dataset.postId === link.dataset.postId && previewImg.dataset.postSource === link.dataset.postSource) {
//             previewImg.src = localUrl;
//           }
//         }

//         // Add hover handlers to swap between check and X icons
//         const mouseEnterHandler = () => {
//           downloadBtn.innerHTML = '<i class="fas fa-times"></i>';
//         };
//         const mouseLeaveHandler = () => {
//           downloadBtn.innerHTML = '<i class="fas fa-check"></i>';
//         };
//         hoverHandlers = { mouseEnterHandler, mouseLeaveHandler };

//         downloadBtn.addEventListener('mouseenter', mouseEnterHandler);
//         downloadBtn.addEventListener('mouseleave', mouseLeaveHandler);
//       }
//     })
//     .catch(err => {
//       console.error('Failed to check download status:', err);
//       showToast('Error checking download status: ' + (err.message || err), 'error');
//     });
//   }
  
//   downloadBtn.addEventListener('click', async (e) => {
//     e.preventDefault();
//     e.stopPropagation();
//     // Prevent navigation
//     if (e.button === 1) return false;

//     const isDownloaded = link.dataset.downloaded === 'true';
//     if (isDownloaded) {
//       // remove file and make sure database entry is deleted too
//       const filename = getFilenameFromUrl(post.imageUrl, post.id);
//       try {
//         const response = await fetch('http://localhost:3001/delete-downloaded-image', {
//           method: 'POST',
//           headers: { 'Content-Type': 'application/json' },
//           body: JSON.stringify({ filename, id: post.id })
//         });
//         const data = await response.json();
//         if (!response.ok) {
//           console.warn('HTTP error deleting file', response.status, data.error || data);
//           showToast('Failed to delete file: ' + (data.error || `HTTP ${response.status}`), 'error');
//         } else if (data.success) {
//           // also attempt client‑side removal in case server-side failed silently
//           if (typeof dbStore !== 'undefined' && dbStore && post && post.id) {
//             try { await dbStore.removeDownloadedPost(post.id); window.updateAppLoadingDownloadCount(); } catch (e) { console.warn('Failed to remove downloaded post from dbStore', e); showToast('Could not remove record from database', 'error'); }
//           }
//           link.dataset.downloaded = 'false';
//           downloadBtn.innerHTML = '<i class="fas fa-download"></i>';
//           downloadBtn.classList.remove('downloaded');
//           downloadBtn.title = 'Download';
//           if (hoverHandlers) {
//             downloadBtn.removeEventListener('mouseenter', hoverHandlers.mouseEnterHandler);
//             downloadBtn.removeEventListener('mouseleave', hoverHandlers.mouseLeaveHandler);
//             hoverHandlers = null;
//           }
//           if (window.isViewingDownloadsGallery) {
//             // Remove from UI immediately if in downloads gallery
//             downloadBtn.remove();
//             downloadBtn = null;
//             link.style.opacity = '0.25';
//           }
//         } else {
//           console.warn('Server reported deletion failure:', data.error || data);
//           showToast('Failed to delete file: ' + (data.error || 'unknown'), 'error');
//         }
//       } catch (error) {
//         console.error('Failed to delete:', error);
//         showToast('Error deleting file: ' + (error.message || error), 'error');
//       }
//     } else {
//       const currentSearchInput = document.getElementById('search-filter-input')?.value.trim();

//       // User requested download — create toast immediately
//       let toast = null;
//       try { toast = window.createDownloadToast(`dl-${post.id}-${Date.now()}`, String(post.id)); if (toast) toast.update(2, 'Queued'); } catch (e) { /* ignore */ }

//       downloadBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin loading-artist"></i>';
//       downloadBtn.disabled = true;
//       progressContainer.style.display = 'block';

//       // Download file
//       const filename = getFilenameFromUrl(post.imageUrl, post.id);
      
//       // Fetch artist if not known
//       if (post.artists.length === 0 || post.artists[0] === '?' || !post.artists || post.artists[0] === 'Unknown') {
//         const postId = post.id;
//         const postSource = post.source;
//         try {
//           const fetchedArtists = await fetchArtistForPost(postId, postSource, post.tags);
//           post.artists = Array.isArray(fetchedArtists)
//             ? (fetchedArtists.length ? fetchedArtists : ['Unknown'])
//             : [fetchedArtists || 'Unknown'];
//         } catch (err) {
//           console.error('Error fetching artist for download:', err);
//           showToast('Error fetching artist info: ' + (err.message || err), 'error');
//           post.artists = ['Unknown'];
//         }
//       }

//       let artist = "Unknown";
//       if (post.artists && post.artists.length > 0) {
//         artist = post.artists[0];
//         post.artists.forEach(a => {
//           if (a.toLowerCase() == currentSearchInput?.toLowerCase()) {
//             artist = a;
//           }
//         });
//       }

//       downloadBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';

//       try {
//         // Enqueue download through pipeline (retries handled centrally)
//         const task = {
//           postId: post.id,
//           imageUrl: post.imageUrl,
//           filename,
//           postDiv: link,
//           downloadBtn,
//           progressBar,
//           progressContainer,
//           toast
//         };

//         await downloadQueue.enqueue(task);

//         // On success: Save post to dbStore and update preview UI
//         if (typeof dbStore !== 'undefined' && dbStore && post && post.id) {
//           const postToSave = { ...post };
//           postToSave.artist = artist;
//           postToSave.downloadedAt = Date.now();
//           try { await dbStore.saveDownloadedPost(postToSave); } catch (e) { console.warn('Failed to save downloaded post to dbStore', e); }
//         }
//         const mediaElement = link.querySelector('img, video');
//         if (mediaElement) {
//           mediaElement.dataset.author = artist;
//         }
//         progressBar.style.width = '100%';
//         setTimeout(() => {
//           link.dataset.downloaded = 'true';
//           downloadBtn.innerHTML = '<i class="fas fa-check"></i>';
//           downloadBtn.classList.add('downloaded');
//           downloadBtn.title = 'Delete';
//           downloadBtn.disabled = false;
//             progressContainer.style.display = 'none';
//             progressBar.style.width = '0%';

//             // Add hover handlers to swap between check and X icons
//             const mouseEnterHandler = () => {
//               downloadBtn.innerHTML = '<i class="fas fa-times"></i>';
//             };
//             const mouseLeaveHandler = () => {
//               downloadBtn.innerHTML = '<i class="fas fa-check"></i>';
//             };
//             hoverHandlers = { mouseEnterHandler, mouseLeaveHandler };

//             downloadBtn.addEventListener('mouseenter', mouseEnterHandler);
//             downloadBtn.addEventListener('mouseleave', mouseLeaveHandler);

//             // finalize toast
//             if (post.imageUrl.toLowerCase().match(/\.(mp4|webm|mov)(\?|$)/)) {
//               if (task.toast) task.toast.done(true, 'Completed', post.sampleUrl);
//             } else {
//               if (task.toast) task.toast.done(true, 'Completed', post.imageUrl);
//             }
//           }, 300);    
//       } catch (error) {
//         console.error('Download failed:', error);
//         showToast('Download failed: ' + (error.message || error), 'error');
//         downloadBtn.innerHTML = '<i class="fas fa-download"></i>';
//         downloadBtn.disabled = false;
//         progressContainer.style.display = 'none';
//         progressBar.style.width = '0%';
//         // finalize toast as failed
//         if (toast) toast.done(false, 'Failed');
//       }
//     }
//   });
  
//   link.appendChild(downloadBtn);
//   link.appendChild(progressContainer);
  
//   return link;
// }

function createBooruImageElement(post, maxHeight = null, imageWidth = null) {

  const loader = document.createElement('i');
  loader.className = 'fas fa-circle-notch fa-spin image-loader';

  const container = document.createElement('div');
  container.className = 'booru-image-item';
  container.dataset.score = post.score || 0;
  container.dataset.tags = post.tags ? post.tags.join(' ') : '';
  container.dataset.artist = Array.isArray(post.artist) ? post.artist.join(', ') : (post.artist || (post.artists ? post.artists.join(', ') : 'Unknown'));
  container.dataset.postId = normalizePostId(post.id);
  container.dataset.postSource = post.source;
  container.dataset.aspectRatio = post.aspectRatio || 1;
  container.appendChild(loader);

  const dataIndex = post.dataIndex;
  const qualityUrl = post?.imageUrl?.toLowerCase() || 'Unknown';
  const isVideo = qualityUrl.endsWith('.mp4') || qualityUrl.endsWith('.webm') || qualityUrl.endsWith('.mov') || qualityUrl.includes('.mp4?') || qualityUrl.includes('.webm?') || qualityUrl.includes('.mov?');
  const isGif = qualityUrl.endsWith('.gif') || qualityUrl.includes('.gif?');
  const useHighQuality = (!isVideo && typeof showHighQualityGallery !== 'undefined') ? showHighQualityGallery : false;

  let mediaElement = document.createElement('img');
  mediaElement.alt = post.title || 'Unknown Title';

  const width = 400;
  const height = Math.round(width * container.dataset.aspectRatio);
  mediaElement.setAttribute('width', width);
  mediaElement.setAttribute('height', height);
  
  mediaElement.style.width = '100%';
  mediaElement.style.height = '100%';
  mediaElement.style.objectFit = 'cover';
  mediaElement.style.opacity = '0';
  mediaElement.dataset.aspectRatio = container.dataset.aspectRatio;
  mediaElement.dataset.imageUrl = qualityUrl;
  mediaElement.dataset.thumbnailUrl = post.thumbnailUrl;
  mediaElement.dataset.sampleUrl = post.sampleUrl || '';
  mediaElement.dataset.tags = post.tags.join(' ');
  mediaElement.dataset.author = Array.isArray(post.artist) ? post.artist.join(', ') : (post.artist || post.author || 'Unknown');
  mediaElement.dataset.title = post.title || '';
  mediaElement.dataset.createdAt = post.createdAt || '';

  if (isVideo) {
    container.classList.add('file-type-video');
    mediaElement.dataset.isVideo = 'true';
  } else if (isGif) {
    container.classList.add('file-type-gif');
    mediaElement.dataset.isGif = 'true';
  } else {
    container.classList.add('file-type-image');
  }
  if (typeof dataIndex !== 'undefined') {
    mediaElement.setAttribute('data-index', dataIndex);
  }
  
  mediaElement.addEventListener('load', async () => {
    mediaElement.style.opacity = '1';
    mediaElement.classList.add('loaded');
    loader.style.display = 'none';
    
    // Cache thumbnail after successful load (avoid duplicate fetch before load)
    const currentTabId = typeof activeTabId !== 'undefined' ? activeTabId : null;
    const resolvedThumbnailUrl = mediaElement.dataset.resolvedThumbnailUrl;
    const isVideoSource = resolvedThumbnailUrl && (resolvedThumbnailUrl.endsWith('.mp4') || resolvedThumbnailUrl.endsWith('.webm') || resolvedThumbnailUrl.endsWith('.mov'));
    const cacheKey = isVideoSource ? `video-thumbnail:${resolvedThumbnailUrl}` : resolvedThumbnailUrl;
    if (currentTabId && cacheKey && !getCachedThumbnailUrl(currentTabId, cacheKey)) {
      cacheThumbnailBlobForTab(currentTabId, resolvedThumbnailUrl, cacheKey).catch(() => {});
    }

    // Check if mouse position is within image boundaries and show preview
    if (!previewFrozen && typeof showPreviewForElement === 'function') {
      const rect = mediaElement.getBoundingClientRect();
      const isHovering = lastMouseX >= rect.left && lastMouseX <= rect.right &&
                        lastMouseY >= rect.top && lastMouseY <= rect.bottom;
      if (isHovering) {
        if (typeof lastHoveredElement !== 'undefined') {
          window.booruLastHoveredElement = mediaElement;
        }
        showPreviewForElement(mediaElement);
      }
    }
  }, { once: true });
  
  mediaElement.addEventListener('error', (e) => {
    loader.style.display = 'none';
    mediaElement.style.display = 'none';
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-darkest);
      color: var(--text-secondary);
      font-size: 12px;
      text-align: center;
      padding: 10px;
    `;
    errorDiv.innerHTML = '<i class="fas fa-exclamation-triangle errorDivIcon"></i>Failed to load';
    container.appendChild(errorDiv);
  }, { once: true });
  
  mediaElement.decoding = 'async';
  mediaElement.loading = 'lazy';
  let resolvedThumbnailUrl = "";
  if (useHighQuality) {
    resolvedThumbnailUrl = getImageUrl(qualityUrl);
  } else {
    resolvedThumbnailUrl = getImageUrl(post.thumbnailUrl || post.sampleUrl || qualityUrl);
  }
  mediaElement.dataset.resolvedThumbnailUrl = resolvedThumbnailUrl;
  const currentTabId = typeof activeTabId !== 'undefined' ? activeTabId : null;
  const isVideoSource = resolvedThumbnailUrl.endsWith('.mp4') || resolvedThumbnailUrl.endsWith('.webm') || resolvedThumbnailUrl.endsWith('.mov');
  const cacheKey = isVideoSource ? `video-thumbnail:${resolvedThumbnailUrl}` : resolvedThumbnailUrl;
  const cachedThumbnailUrl = currentTabId && cacheKey ? getCachedThumbnailUrl(currentTabId, cacheKey) : null;
  if (cachedThumbnailUrl) {
    mediaElement.src = cachedThumbnailUrl;
  } else if (isVideoSource) {
    // Extract thumbnail from video using backend service
    const backendThumbnailUrl = `http://localhost:3001/video-thumbnail?url=${encodeURIComponent(resolvedThumbnailUrl)}`;
    mediaElement.src = backendThumbnailUrl;
  } else {
    mediaElement.src = resolvedThumbnailUrl;
  }
  
  if (useHighQuality) {
    mediaElement.dataset.highQualityLoaded = 'true';
    mediaElement.dataset.highQualityUrl = mediaElement.src;
  }
  
  container.appendChild(mediaElement);
  
  container.addEventListener('click', (e) => { 
    openBooruLightbox(post.imageUrl, post.id, post.source);
  });
  
  container.addEventListener('mousedown', (e) => {
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      if (downloadBtn)
        downloadBtn.click();
      return false;
    }
  });
  
  // Add download button
  let downloadBtn = document.createElement('button');
  downloadBtn.className = 'booru-download-btn';
  downloadBtn.innerHTML = '<i class="fas fa-download"></i>';
  downloadBtn.title = 'Download';
  
  // Add progress bar (hidden by default)
  const progressContainer = document.createElement('div');
  progressContainer.className = 'booru-download-progress';
  progressContainer.style.display = 'none';
  const progressBar = document.createElement('div');
  progressBar.className = 'booru-download-progress-bar';
  progressBar.style.width = '0%';
  progressContainer.appendChild(progressBar);
  
  // Store download state
  container.dataset.downloaded = 'false';
  
  // Store hover handlers for removal later
  let hoverHandlers = null;
  
  // Check if this image is already downloaded (exclude videos)
  if (window.downloadFolder) {
    const filename = getFilenameFromUrl(post.imageUrl, post.id);
    fetch('http://localhost:3001/check-downloaded-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filenames: [filename] })
    })
    .then(res => res.json())
    .then(data => {
      if (data.downloaded && data.downloaded[filename]) {
        const localUrl = `http://localhost:3001/serve-local-file/${encodeURIComponent(filename)}`;
        container.dataset.downloaded = 'true';
        downloadBtn.innerHTML = '<i class="fas fa-check"></i>';
        downloadBtn.classList.add('downloaded');
        downloadBtn.title = 'Delete';

        if (!isVideo) {
          if (mediaElement) {
            mediaElement.dataset.highQualityLoaded = 'true';
            if (mediaElement.src !== localUrl) {
              mediaElement.src = localUrl;
            }
          }

          const previewImg = booruPreviewMediaContainer.querySelector('img');
          if (previewImg && previewImg.dataset.postId === container.dataset.postId && previewImg.dataset.postSource === container.dataset.postSource) {
            previewImg.src = localUrl;
          }
        }

        // Add hover handlers to swap between check and X icons
        const mouseEnterHandler = () => {
          downloadBtn.innerHTML = '<i class="fas fa-times"></i>';
        };
        const mouseLeaveHandler = () => {
          downloadBtn.innerHTML = '<i class="fas fa-check"></i>';
        };
        hoverHandlers = { mouseEnterHandler, mouseLeaveHandler };

        downloadBtn.addEventListener('mouseenter', mouseEnterHandler);
        downloadBtn.addEventListener('mouseleave', mouseLeaveHandler);
      }
    })
    .catch(err => {
      console.error('Failed to check download status:', err);
      showToast('Error checking download status: ' + (err.message || err), 'error');
    });
  }
  
  downloadBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Prevent navigation
    if (e.button === 1) return false;

    const isDownloaded = container.dataset.downloaded === 'true';
    if (isDownloaded) {
      // remove file and make sure database entry is deleted too
      const filename = getFilenameFromUrl(post.imageUrl, post.id);
      try {
        const response = await fetch('http://localhost:3001/delete-downloaded-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename, id: post.id })
        });
        const data = await response.json();
        if (!response.ok) {
          console.warn('HTTP error deleting file', response.status, data.error || data);
          showToast('Failed to delete file: ' + (data.error || `HTTP ${response.status}`), 'error');
        } else if (data.success) {
          // also attempt client‑side removal in case server-side failed silently
          if (typeof dbStore !== 'undefined' && dbStore && post && post.id) {
            try { await dbStore.removeDownloadedPost(post.id); window.updateAppLoadingDownloadCount(); } catch (e) { console.warn('Failed to remove downloaded post from dbStore', e); showToast('Could not remove record from database', 'error'); }
          }
          container.dataset.downloaded = 'false';
          downloadBtn.innerHTML = '<i class="fas fa-download"></i>';
          downloadBtn.classList.remove('downloaded');
          downloadBtn.title = 'Download';
          if (hoverHandlers) {
            downloadBtn.removeEventListener('mouseenter', hoverHandlers.mouseEnterHandler);
            downloadBtn.removeEventListener('mouseleave', hoverHandlers.mouseLeaveHandler);
            hoverHandlers = null;
          }
          if (window.isViewingDownloadsGallery) {
            // Remove from UI immediately if in downloads gallery
            downloadBtn.remove();
            downloadBtn = null;
            container.style.opacity = '0.25';
          }
        } else {
          console.warn('Server reported deletion failure:', data.error || data);
          showToast('Failed to delete file: ' + (data.error || 'unknown'), 'error');
        }
      } catch (error) {
        console.error('Failed to delete:', error);
        showToast('Error deleting file: ' + (error.message || error), 'error');
      }
    } else {
      const currentSearchInput = document.getElementById('search-filter-input')?.value.trim();

      // User requested download — create toast immediately
      let toast = null;
      try { toast = window.createDownloadToast(`dl-${post.id}-${Date.now()}`, String(post.id)); if (toast) toast.update(2, 'Queued'); } catch (e) { /* ignore */ }

      downloadBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin loading-artist"></i>';
      downloadBtn.disabled = true;
      progressContainer.style.display = 'block';

      // Download file
      const filename = getFilenameFromUrl(post.imageUrl, post.id);
      
      // Fetch artist if not known
      if (post.artists.length === 0 || post.artists[0] === '?' || !post.artists || post.artists[0] === 'Unknown') {
        const postId = post.id;
        const postSource = post.source;
        try {
          const fetchedArtists = await fetchArtistForPost(postId, postSource, post.tags);
          post.artists = Array.isArray(fetchedArtists)
            ? (fetchedArtists.length ? fetchedArtists : ['Unknown'])
            : [fetchedArtists || 'Unknown'];
        } catch (err) {
          console.error('Error fetching artist for download:', err);
          showToast('Error fetching artist info: ' + (err.message || err), 'error');
          post.artists = ['Unknown'];
        }
      }

      let artist = "Unknown";
      if (post.artists && post.artists.length > 0) {
        artist = post.artists[0];
        post.artists.forEach(a => {
          if (a.toLowerCase() == currentSearchInput?.toLowerCase()) {
            artist = a;
          }
        });
      }

      downloadBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';

      try {
        // Enqueue download through pipeline (retries handled centrally)
        const task = {
          postId: post.id,
          imageUrl: post.imageUrl,
          filename,
          postDiv: container,
          downloadBtn,
          progressBar,
          progressContainer,
          toast
        };

        await downloadQueue.enqueue(task);

        // On success: Save post to dbStore and update preview UI
        if (typeof dbStore !== 'undefined' && dbStore && post && post.id) {
          const postToSave = { ...post };
          postToSave.artist = artist;
          postToSave.downloadedAt = Date.now();
          try { await dbStore.saveDownloadedPost(postToSave); } catch (e) { console.warn('Failed to save downloaded post to dbStore', e); }
        }
        const mediaElement = container.querySelector('img, video');
        if (mediaElement) {
          mediaElement.dataset.author = artist;
        }
        progressBar.style.width = '100%';
        setTimeout(() => {
          container.dataset.downloaded = 'true';
          downloadBtn.innerHTML = '<i class="fas fa-check"></i>';
          downloadBtn.classList.add('downloaded');
          downloadBtn.title = 'Delete';
          downloadBtn.disabled = false;
            progressContainer.style.display = 'none';
            progressBar.style.width = '0%';

            // Add hover handlers to swap between check and X icons
            const mouseEnterHandler = () => {
              downloadBtn.innerHTML = '<i class="fas fa-times"></i>';
            };
            const mouseLeaveHandler = () => {
              downloadBtn.innerHTML = '<i class="fas fa-check"></i>';
            };
            hoverHandlers = { mouseEnterHandler, mouseLeaveHandler };

            downloadBtn.addEventListener('mouseenter', mouseEnterHandler);
            downloadBtn.addEventListener('mouseleave', mouseLeaveHandler);

            // finalize toast
            if (post.imageUrl.toLowerCase().match(/\.(mp4|webm|mov)(\?|$)/)) {
              if (task.toast) task.toast.done(true, 'Completed', post.sampleUrl);
            } else {
              if (task.toast) task.toast.done(true, 'Completed', post.imageUrl);
            }
          }, 300);    
      } catch (error) {
        console.error('Download failed:', error);
        showToast('Download failed: ' + (error.message || error), 'error');
        downloadBtn.innerHTML = '<i class="fas fa-download"></i>';
        downloadBtn.disabled = false;
        progressContainer.style.display = 'none';
        progressBar.style.width = '0%';
        // finalize toast as failed
        if (toast) toast.done(false, 'Failed');
      }
    }
  });
  
  container.appendChild(downloadBtn);
  container.appendChild(progressContainer);
  
  return container;
}

function openBooruLightbox(imageUrl, postId, postSource) {
  // Build array of all booru image URLs for navigation and autoplay
  redditLightboxImages = (window.booruPosts || []).map(post => getImageUrl(post.imageUrl));
  
  // If postId is provided, find the exact post by ID for reliable matching
  // This prevents issues when high quality toggle changes image URLs
  if (postId !== undefined && postSource !== undefined) {
    redditLightboxIndex = (window.booruPosts || []).findIndex(post => 
      String(post.id) === String(postId) && String(post.source) === String(postSource)
    );
  } else {
    // Fallback to URL matching if no ID provided
    const proxiedUrl = getImageUrl(imageUrl);
    redditLightboxIndex = redditLightboxImages.indexOf(proxiedUrl);
  }
  
  if (redditLightboxIndex === -1) redditLightboxIndex = 0;
  showRedditLightboxImage(redditLightboxIndex);
  lightboxModal.classList.add('active', 'reddit-mode');
}

// Track shift key state for preview freezing
let isShiftHeld = false;
let previewFrozen = false;
let tagsChangedWhileFrozen = false;
let previewMiddleClickedTags = new Set();
let lastMouseX = 0;
let lastMouseY = 0;

// Track if user is scrolling (mouse, wheel, touch, scrollbar drag)
let isScrolling = false;
let scrollBlockPreview = false;
let scrollBlockTimer = null;

// Global function to reset preview frozen state
window.resetPreviewFrozen = function() {
  isShiftHeld = false;
  previewFrozen = false;
  tagsChangedWhileFrozen = false;
  previewMiddleClickedTags.clear();
  const body = document.body;
  if (body) body.style.userSelect = '';
};

// Track mouse position globally and detect when mouse stops
let mouseStopTimer = null;

document.addEventListener('mousemove', (e) => {
  // Don't trigger preview if user has mouse over downloads artist select (prevents interference with select2 dropdown)
  const selectRect = document.querySelector('.select2-results')?.getBoundingClientRect();
  const suppportRect = document.querySelector('.toast-support')?.getBoundingClientRect();
  if (selectRect && e.clientX >= selectRect.left && e.clientX <= selectRect.right &&
      e.clientY >= selectRect.top && e.clientY <= selectRect.bottom ||
      suppportRect && e.clientX >= suppportRect.left && e.clientX <= suppportRect.right &&
      e.clientY >= suppportRect.top && e.clientY <= suppportRect.bottom) {
    const previewMedia = document.querySelector('.booru-hover-preview');
    if (previewMedia) {
      previewMedia.classList.remove('active');
      pauseAllPreviewVideos();
    }
    return;
  }

  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  
  const elementsUnderCursor = document.elementsFromPoint(lastMouseX, lastMouseY);
  const mediaElement = elementsUnderCursor.find(el => 
    el.matches('.booru-image-item img, .booru-image-item video')
  );

  if (
    mediaElement &&
    typeof showPreviewForElement === 'function' &&
    mediaElement.parentElement.classList.contains('file-type-video') === false // Only reload preview if it's an image, not a video
  ) {
    window.booruLastHoveredElement = mediaElement;
    showPreviewForElement(mediaElement);
  }

  // Track modifier state for Shift and right mouse button down
  window._lastShiftHeld = (e.getModifierState && e.getModifierState('Shift')) || e.buttons === 2;
  

  // If scrolling, do not trigger preview
  if (isScrolling || scrollBlockPreview) return;

  // Clear previous timer
  if (mouseStopTimer) {
    clearTimeout(mouseStopTimer);
  }

  // Set new timer to detect when mouse stops moving
  mouseStopTimer = setTimeout(() => {
    // If scrolling, do not trigger preview
    if (isScrolling || scrollBlockPreview) return;

    // Use last tracked modifier state for Shift
    const shiftHeld = window._lastShiftHeld;

    if (previewFrozen && !shiftHeld) {
      previewFrozen = false;
      booruHoverPreview.classList.remove('frozen');
      booruHoverPreview.classList.remove('active');
      pauseAllPreviewVideos()
    }

    if (previewFrozen) return;

    const elementsUnderCursor = document.elementsFromPoint(lastMouseX, lastMouseY);
    const mediaElement = elementsUnderCursor.find(el => 
      el.matches('.booru-image-item img, .booru-image-item video')
    );

    // Only reload preview if it's an image, not a video
    if (
      mediaElement &&
      mediaElement.classList.contains('loaded') &&
      typeof showPreviewForElement === 'function'
    ) {
      window.booruLastHoveredElement = mediaElement;
      showPreviewForElement(mediaElement);
    }
  }, 100); // 100ms delay after mouse stops
}, { passive: true });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Shift') {
    isShiftHeld = true;
    previewFrozen = true;
    booruHoverPreview.classList.add('frozen');
    document.body.style.userSelect = 'none';
  }
});

document.addEventListener('keyup', (e) => {
  if (e.key === 'Shift') {
    isShiftHeld = false;
    previewFrozen = false;
    booruHoverPreview.classList.remove('frozen');
    document.body.style.userSelect = '';
    if (booruHoverPreview.classList.contains('active')) {
      booruHoverPreview.classList.remove('active');
      pauseAllPreviewVideos();
    }
    if (tagsChangedWhileFrozen) {
      tagsChangedWhileFrozen = false;
      loadBooruImages(false);
    }
    commitPreviewFrozenTagChanges();
  }
});

document.addEventListener('mousedown', (e) => {
  if (e.button === 2) {
    e.preventDefault();
    isShiftHeld = true;
    previewFrozen = true;
    booruHoverPreview.classList.add('active');
    booruHoverPreview.classList.add('frozen');
    document.body.style.userSelect = 'none';
    booruHoverPreview.querySelector('video')?.play();
  }
});

document.addEventListener('mouseup', (e) => {
  if (e.button === 2) {
    e.preventDefault();
    booruHoverPreview.classList.add('active');
    isShiftHeld = false;
    previewFrozen = false;
    booruHoverPreview.classList.remove('frozen');
    document.body.style.userSelect = '';
    if (booruHoverPreview.classList.contains('active')) {
      booruHoverPreview.classList.remove('active');
      pauseAllPreviewVideos();
    }
    if (tagsChangedWhileFrozen) {
      tagsChangedWhileFrozen = false;
      loadBooruImages(false);
    }
    commitPreviewFrozenTagChanges();
  }
});

// Create hover preview for booru
const booruHoverPreview = document.createElement('div');
booruHoverPreview.className = 'booru-hover-preview';
booruHoverPreview.innerHTML = `
  <div class="booru-hover-preview-media"></div>
  <div class="booru-hover-preview-info">
    <div class="booru-hover-preview-tags"></div>
    <div class="booru-hover-preview-footer">
      <div class="booru-hover-preview-author"></div>
      <div class="booru-hover-preview-metadata">
        <span class="booru-hover-preview-id booru-tag id-tag" title="Post ID"></span>
        <span class="booru-hover-preview-source booru-tag source-tag" title="Source"></span>
        <div class="booru-hover-preview-date" title="Date Created"></div>
      </div>
    </div>
  </div>
`;
document.body.appendChild(booruHoverPreview);

const booruPreviewMediaContainer = booruHoverPreview.querySelector('.booru-hover-preview-media');
const booruPreviewTags = booruHoverPreview.querySelector('.booru-hover-preview-tags');
const booruPreviewMetadata = booruHoverPreview.querySelector('.booru-hover-preview-metadata');
const booruPreviewId = booruHoverPreview.querySelector('.booru-hover-preview-id');
const booruPreviewSource = booruHoverPreview.querySelector('.booru-hover-preview-source');
const booruPreviewAuthor = booruHoverPreview.querySelector('.booru-hover-preview-author');
const booruPreviewDate = booruHoverPreview.querySelector('.booru-hover-preview-date');

const activeArtistRequests = new Set();

function normalizeArtistNames(raw) {
  if (Array.isArray(raw)) {
    return raw.map(a => String(a).trim()).filter(a => a.length > 0 && a !== 'Unknown');
  }
  if (typeof raw === 'string') {
    return raw.split(',').map(a => a.trim()).filter(a => a.length > 0 && a !== 'Unknown');
  }
  return [];
}

function setPreviewArtistNames(mediaElement, rawArtists) {
  const artistNames = normalizeArtistNames(rawArtists);
  if (artistNames.length === 0) {
    artistNames.push('?');
  }
  const artistText = artistNames.join(', ');
  mediaElement.dataset.author = artistText;
  if (mediaElement.parentElement) {
    mediaElement.parentElement.dataset.artist = artistText;
  }
  mediaElement.dataset.authorLoading = 'false';
  booruPreviewAuthor.innerHTML = '';
  artistNames.forEach(name => booruPreviewAuthor.appendChild(createPreviewAuthorTag(mediaElement, name)));
  return artistText;
}

function createPreviewAuthorTag(mediaElement, artistName) {
  const authorTag = document.createElement('span');
  authorTag.className = 'booru-tag author-tag';
  const isLoading = mediaElement.dataset.authorLoading === 'true';
  if (isLoading) {
    authorTag.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
    authorTag.classList.add('loading');
  } else {
    authorTag.textContent = artistName;
  }
  authorTag.style.cursor = 'pointer';

  async function fetchAndRender(openAfterFetch = false) {
    if (authorTag.classList.contains('loading')) return;
    const postId = mediaElement.closest('.booru-image-item')?.dataset.postId;
    const postSource = mediaElement.closest('.booru-image-item')?.dataset.postSource;
    if (!postId || !postSource) return;

    authorTag.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
    authorTag.classList.add('loading');
    mediaElement.dataset.authorLoading = 'true';

    try {
      const item = mediaElement.closest('.booru-image-item');
      const tagString = item?.dataset?.tags || '';
      const tags = tagString.trim().length > 0 ? tagString.trim().split(/\s+/) : undefined;
      const fetchedArtists = await fetchArtistForPost(postId, postSource, tags);
      const artistText = setPreviewArtistNames(mediaElement, fetchedArtists);

      const postIndex = booruPosts.findIndex(p => p.id == postId);
      if (postIndex !== -1) {
        booruPosts[postIndex].author = artistText;
        booruPosts[postIndex].artist = normalizeArtistNames(fetchedArtists).length
          ? normalizeArtistNames(fetchedArtists)
          : ['?'];
      }

      if (openAfterFetch && artistText !== '?') {
        if (typeof createNewBooruTab === 'function') {
          createNewBooruTab(artistText, false, artistText);
        }
      }
    } catch (err) {
      console.error('Error fetching artist:', err);
      showToast('Failed to fetch artist: ' + err.message, 'error');
      setPreviewArtistNames(mediaElement, '?');
    } finally {
      mediaElement.dataset.authorLoading = 'false';
      if (postId && activeArtistRequests.has(postId)) {
        activeArtistRequests.delete(postId);
      }
    }
  }

  authorTag.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (artistName === '?' && !authorTag.classList.contains('loading')) {
      await fetchAndRender(false);
    } else if (previewFrozen && searchFilterInput && !authorTag.classList.contains('loading') && artistName !== '?') {
      toggleTagInSearch(artistName);
    }
  });

  authorTag.addEventListener('mousedown', async (e) => {
    if (e.button !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    const currentName = authorTag.textContent.trim();
    const currentIsLoading = authorTag.classList.contains('loading');
    if (currentName === '?' && !currentIsLoading) {
      await fetchAndRender(true);
    } else if (currentName !== '?' && currentName !== 'Unknown' && !currentIsLoading) {
      if (typeof createNewBooruTab === 'function') {
        createNewBooruTab(currentName, false, currentName);
      }
    }
  });

  if (authorTag.textContent == 'Unknown') {
    authorTag.classList.add('unknown-artist');
  }

  return authorTag;
}

function autoClickUnknownPreviewAuthor(postId, sourceId) {
  if (!postId) return;
  const authorTag = booruPreviewAuthor.querySelector('.author-tag');
  if (!authorTag) return;
  if (authorTag.textContent.trim() !== '?') return;
  // check if booru Source has tag API configured before attempting to fetch artist (prevents unnecessary loading indicator for sources without tag API)
  const sourceConfig = booruSourcesManager.getSource(sourceId || window.currentBooruSource);
  if (!sourceConfig || !sourceConfig.artist?.tagApiUrl) {
    authorTag.textContent = 'Unknown';
    authorTag.classList.add('unknown-artist');
    return;
  }
  if (authorTag.textContent.trim() !== '?') return;
  authorTag.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
  if (activeArtistRequests.has(postId)) return;

  activeArtistRequests.add(postId);
  authorTag.dispatchEvent(new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    view: window
  }));
  authorTag.dispatchEvent(new FocusEvent('blur', {
    bubbles: true,
    cancelable: true,
    view: window
  }));
}

// Pause all preview videos — container + cache — to prevent background audio leaks
function pauseAllPreviewVideos() {
  const containerVideo = booruPreviewMediaContainer.querySelector('video');
  if (containerVideo) { try { containerVideo.pause(); } catch (e) {} }
  if (window._previewCache) {
    for (const entry of window._previewCache.values()) {
      if (entry && entry.element && entry.element.tagName === 'VIDEO') {
        try { entry.element.pause(); } catch (e) {}
      }
    }
  }
}

// Function to show preview for a media element
function showPreviewForElement(mediaElement, forceVideoLoad = false) {
  // Don't show preview if lightbox is open or any modal overlay is actually visible to the user
  if (lightboxModal && lightboxModal.classList.contains('active')) {
    return;
  }
  // Prevent preview if scrolling or scroll-block is active
  if (typeof isScrolling !== 'undefined' && (isScrolling || scrollBlockPreview) && ! isShiftHeld) {
    booruHoverPreview.classList.remove('active', 'frozen');
    pauseAllPreviewVideos()
    previewFrozen = false;
    return;
  }
  // Only block if overlay is visible AND its parent modal is active (open)
  const overlays = document.querySelectorAll('.modal-overlay');
  for (const overlay of overlays) {
    const style = window.getComputedStyle(overlay);
    const parentModal = overlay.closest('.modal');
    if (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      style.pointerEvents !== 'none' &&
      parentModal && parentModal.style.display !== 'none'
    ) {
      return;
    }
  }
  
  if (!mediaElement || !mediaElement.dataset.tags) return;
  // For legacy/local images, allow preview even if imageUrl is a relative path
  // (the rest of the preview logic will work as long as data attributes are set)
  if (previewFrozen && booruHoverPreview.classList.contains('active')) return;

  // Check if this is a video thumbnail
  const isVideo = mediaElement.dataset.isVideo === 'true';  

  booruPreviewMediaContainer.parentNode.classList.add('active');

  // Set post id in metadata
  const previewItem = mediaElement.closest('.booru-image-item');
  if (booruPreviewId) {
    const postId = previewItem?.dataset.postId || '';
    booruPreviewId.textContent = postId;
  }
  if (booruPreviewSource) {
    const sourceName = previewItem?.dataset.postSource || '';
    const isDownloadsGallery = previewItem?.closest('.booru-gallery')?.classList.contains('downloads-gallery');
    booruPreviewSource.textContent = isDownloadsGallery ? sourceName : '';
  }
  if (booruPreviewSource.textContent === '') {
    booruPreviewSource.style.display = 'none';
  } else {
    booruPreviewSource.style.display = '';
  }

  // Ensure preview cache exists (keep recently previewed media to avoid re-fetch)
  window._previewCache = window._previewCache || new Map();
  window._previewLoadingSet = window._previewLoadingSet || new Set();

  // If preview is already showing this video, do nothing
  format_test: if (isVideo) {
    const currentVideo = booruPreviewMediaContainer.querySelector('video');
    const targetPostId = mediaElement.closest('.booru-image-item')?.dataset.postId;
    const targetPostSource = mediaElement.closest('.booru-image-item')?.dataset.postSource;

    if (currentVideo) {
      // Handle the promise returned by play() — ignore AbortError (element removed) so it doesn't pollute the console
      const previewContainer = document.querySelector('.booru-hover-preview');
      if (previewContainer?.classList.contains('active')) {
        const _p = currentVideo.play();
        if (_p && typeof _p.catch === 'function') {
          _p.catch(err => {
            if (err && err.name === 'AbortError') return; // expected when element is removed mid-play
            // keep non-fatal logging for other cases (debug-only)
            console.debug('booru preview video play rejected:', err);
          });
        }
      }
    }

    // If the preview is already showing the same post (by postId + postSource), do nothing
    if (currentVideo && currentVideo.dataset.postId === targetPostId && currentVideo.dataset.postSource === targetPostSource) {
      break format_test; // already showing this post
    }

    const cachedPreview = targetPostId ? window._previewCache.get(targetPostId) : null;
    const previewAlreadyLoading = targetPostId && window._previewLoadingSet.has(targetPostId);

    const renderCachedPreview = () => {
      booruPreviewMediaContainer.innerHTML = '';
      booruPreviewMediaContainer.appendChild(cachedPreview.element);

      // Keep a loading overlay visible while the cached preview is still loading
      let overlay = booruPreviewMediaContainer.querySelector('.preview-loading-overlay');
      if (!overlay && cachedPreview.isLoading) {
        overlay = document.createElement('div');
        overlay.className = 'preview-loading-overlay';
        overlay.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
        overlay.style.cssText = `
          position: absolute;
          top: 10px;
          right: 10px;
          width: 45px;
          height: 45px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.5);
          border-radius: 50%;
          color: var(--accent);
          font-size: 28px;
          z-index: 10;
        `;
        booruPreviewMediaContainer.style.position = 'relative';
        booruPreviewMediaContainer.appendChild(overlay);
      }
      if (overlay && !cachedPreview.isLoading) {
        overlay.remove();
      }

      const galleryItem = mediaElement.closest('.booru-image-item');
      const galleryLoader = galleryItem?.querySelector('.image-loader');
      if (galleryLoader) galleryLoader.style.display = cachedPreview.isLoading ? 'block' : 'none';
      if (cachedPreview.element.tagName === 'VIDEO') {
        const previewContainer = document.querySelector('.booru-hover-preview');
        if (previewContainer?.classList.contains('active')) {
          cachedPreview.element.play().catch(err => {
            if (err && err.name !== 'AbortError') console.debug('booru preview video play rejected:', err);
          });
        }
      }
    };

    if (previewAlreadyLoading && cachedPreview?.element) {
      break format_test;
    }

    if (cachedPreview?.isLoaded && cachedPreview.element) {
      renderCachedPreview();
      return;
    }

    const previewDelay = window.hqHoverDelay ?? 150;
    if (previewDelay > 0 && !forceVideoLoad && !mediaElement.dataset.previewLoading && !mediaElement._videoPreviewDelayTimer) {
      mediaElement._videoPreviewDelayTimer = setTimeout(() => {
        mediaElement._videoPreviewDelayTimer = null;
        if (!booruHoverPreview.classList.contains('active')) return;
        const elementsUnderCursor = document.elementsFromPoint(lastMouseX, lastMouseY);
        const currentHover = elementsUnderCursor.find(el => el === mediaElement);
        if (!currentHover) return;

        // Resume video load after delay
        showPreviewForElement(mediaElement, true);
      }, previewDelay);
      return;
    }

    if (!forceVideoLoad && mediaElement._videoPreviewDelayTimer) {
      return;
    }

    // Clear preview container for the new preview
    booruPreviewMediaContainer.innerHTML = '';

    // Show thumbnail image first, then load video
    const img = document.createElement('img');
    img.alt = 'Loading video...';
    
    // Use cached gallery image instead of forcing new fetch (except for GIFs - preserve animation)
    const gallerySrc = mediaElement.currentSrc || mediaElement.src || mediaElement.dataset.resolvedThumbnailUrl || getImageUrl(mediaElement.dataset.thumbnailUrl || mediaElement.dataset.imageUrl);
    const isGif = mediaElement.dataset.isGif === 'true';
    if (isGif) {
      // For GIFs, use the actual GIF source directly to preserve animation
      img.src = gallerySrc;
    } else if (gallerySrc && mediaElement.complete && mediaElement.naturalWidth > 0) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = mediaElement.naturalWidth;
        canvas.height = mediaElement.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(mediaElement, 0, 0);
          img.src = canvas.toDataURL('image/jpeg', 0.92);
        } else {
          img.src = gallerySrc;
        }
      } catch (err) {
        img.src = gallerySrc;
      }
    } else {
      img.src = gallerySrc;
    }
    
    booruPreviewMediaContainer.appendChild(img);

    // Create preview loading overlay (same as for images)
    let loadingOverlay = booruPreviewMediaContainer.querySelector('.preview-loading-overlay');
    if (!loadingOverlay) {
      loadingOverlay = document.createElement('div');
      loadingOverlay.className = 'preview-loading-overlay';
      loadingOverlay.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
      loadingOverlay.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        width: 45px;
        height: 45px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.5);
        border-radius: 50%;
        color: var(--accent);
        font-size: 28px;
        z-index: 10;
      `;
      booruPreviewMediaContainer.style.position = 'relative';
      booruPreviewMediaContainer.appendChild(loadingOverlay);
    }

    // Also show gallery item's loader + set download button spinner (if present)
    const galleryItem = mediaElement.closest('.booru-image-item');
    const galleryLoader = galleryItem?.querySelector('.image-loader');
    if (galleryLoader) galleryLoader.style.display = 'block';
    const downloadBtn = galleryItem?.querySelector('.booru-download-btn');
    const originalDownloadHTML = downloadBtn ? downloadBtn.innerHTML : null;
    if (downloadBtn) downloadBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';

    // Mark this thumbnail as currently loading a preview to avoid duplicate fetches
    try { mediaElement.dataset.previewLoading = 'true'; } catch (e) { /* ignore */ }
    updateHqLoadingCounter(1);

    // Load actual video in background (create element and cache it immediately to prevent races)
    const video = document.createElement('video');
    const __ppid = mediaElement.closest('.booru-image-item')?.dataset.postId;
    window._previewCache.set(__ppid, { element: video, isLoading: true, isLoaded: false, lastUsed: Date.now() });
    if (__ppid) window._previewLoadingSet.add(__ppid);
    video.controls = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    applyVideoVolume(video);
    // Prevent clicks inside native controls from bubbling to outer handlers (fix seeking)
    ['click','pointerdown','touchstart'].forEach(evt => video.addEventListener(evt, e => e.stopPropagation()));
    video.style.maxWidth = '100%';
    video.style.width = 'auto';
    video.style.height = 'auto';
    video.style.objectFit = 'contain';
    // assign src last so browsers start fetching after our cache entry exists
    video.src = getImageUrl(mediaElement.dataset.imageUrl);

    // Store post source and ID for middle-click handler
    video.dataset.postSource = mediaElement.closest('.booru-image-item')?.dataset.postSource;
    video.dataset.postId = mediaElement.closest('.booru-image-item')?.dataset.postId;

    // Add middle click handler to open post URL
    video.addEventListener('mousedown', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        const postSource = video.dataset.postSource;
        const postId = video.dataset.postId;
        
        // Build post URL from source config
        const sourceConfig = booruSourcesManager?.getSource(postSource);
        let postUrl;
        if (sourceConfig && sourceConfig.artist && (sourceConfig.artist.postUrlPattern || sourceConfig.artist.urlPattern)) {
          const urlPattern = sourceConfig.artist.postUrlPattern || sourceConfig.artist.urlPattern;
          postUrl = urlPattern.startsWith('http')
            ? urlPattern.replace('{id}', postId)
            : sourceConfig.baseUrl + urlPattern.replace('{id}', postId);
        } else {
          postUrl = video.src;
        }
        window.open(postUrl, '_blank');
      }
    });

    // When video is loaded, replace the image with the video
    video.addEventListener('canplay', () => {
      if (img.parentNode === booruPreviewMediaContainer) {
        // Normal path: thumbnail placeholder still showing — swap it out for the loaded video
        booruPreviewMediaContainer.removeChild(img);
        booruPreviewMediaContainer.appendChild(video);
        // get width and height in pixels of video
        const previewContainer = document.querySelector('.booru-hover-preview');
        if (previewContainer?.classList.contains('active')) {
          video.play().catch(err => {
            if (err && err.name !== 'AbortError') console.debug('booru preview video play rejected:', err);
          });
        }
        // mark cache entry as loaded (video is live and in the container)
        try {
          const postId = mediaElement.closest('.booru-image-item')?.dataset.postId;
          const cached = window._previewCache.get(postId);
          if (cached) { cached.isLoading = false; cached.isLoaded = true; cached.lastUsed = Date.now(); }
          mediaElement.dataset.previewLoading = 'false';
          if (postId && window._previewLoadingSet) window._previewLoadingSet.delete(postId);
        } catch (e) { /* ignore */ }
      } else if (video.parentNode === booruPreviewMediaContainer) {
        // User hovered away and came back while loading — video was already inserted as the
        // in-progress element, so just start playing it and mark it as ready
        const previewContainer = document.querySelector('.booru-hover-preview');
        if (previewContainer?.classList.contains('active')) {
          video.play().catch(err => {
            if (err && err.name !== 'AbortError') console.debug('booru preview video play rejected:', err);
          });
        }
        try {
          const postId = mediaElement.closest('.booru-image-item')?.dataset.postId;
          const cached = window._previewCache.get(postId);
          if (cached) { cached.isLoading = false; cached.isLoaded = true; cached.lastUsed = Date.now(); }
          mediaElement.dataset.previewLoading = 'false';
          if (postId && window._previewLoadingSet) window._previewLoadingSet.delete(postId);
        } catch (e) { /* ignore */ }
      } else {
        // User moved away and never came back — stop immediately to prevent background audio
        try { video.pause(); video.src = ''; } catch (e) {}
        // Remove from cache: the video element's src was cleared so it can't be reused
        try {
          const postId = mediaElement.closest('.booru-image-item')?.dataset.postId;
          if (postId) {
            window._previewCache.delete(postId);
            if (window._previewLoadingSet) window._previewLoadingSet.delete(postId);
          }
          mediaElement.dataset.previewLoading = 'false';
        } catch (e) { /* ignore */ }
      }
      updateHqLoadingCounter(-1);
      // remove preview loading overlay and restore gallery download button
      const overlay = booruPreviewMediaContainer.querySelector('.preview-loading-overlay');
      if (overlay) overlay.remove();
      if (galleryLoader) galleryLoader.style.display = 'none';
      if (downloadBtn && originalDownloadHTML !== null) downloadBtn.innerHTML = originalDownloadHTML;
    }, { once: true });

    video.addEventListener('error', () => {
      try {
        const postId = mediaElement.closest('.booru-image-item')?.dataset.postId;
        const cached = window._previewCache.get(postId);
        if (cached) { cached.isLoading = false; cached.isLoaded = false; cached.lastUsed = Date.now(); }
        mediaElement.dataset.previewLoading = 'false';
        if (postId && window._previewLoadingSet) window._previewLoadingSet.delete(postId);
      } catch (e) { /* ignore */ }
      updateHqLoadingCounter(-1);
      const overlay = booruPreviewMediaContainer.querySelector('.preview-loading-overlay');
      if (overlay) overlay.remove();
      if (galleryLoader) galleryLoader.style.display = 'none';
      if (downloadBtn && originalDownloadHTML !== null) downloadBtn.innerHTML = originalDownloadHTML;
    }, { once: true });
  } else {

    // Prevent duplicate image elements in preview
    const currentImg = booruPreviewMediaContainer.querySelector('img');
    const currentPostId = mediaElement.closest('.booru-image-item')?.dataset.postId;
    const currentPostSource = mediaElement.closest('.booru-image-item')?.dataset.postSource;
    const isSameImage = currentImg &&
      currentImg.dataset.postId === currentPostId &&
      currentImg.dataset.postSource === currentPostSource;
    if (isSameImage) {
      const resolvedImageUrl = getImageUrl(mediaElement.dataset.imageUrl);
      const hqPending = mediaElement.dataset.thumbnailUrl &&
        mediaElement.dataset.imageUrl !== mediaElement.dataset.thumbnailUrl &&
        mediaElement.dataset.highQualityLoaded !== 'true' &&
        !(mediaElement.dataset.currentQualityUrl && mediaElement.dataset.currentQualityUrl === resolvedImageUrl) &&
        mediaElement.dataset.highQualityLoading !== 'true';
      if (!hqPending) {
        // Already showing this image and HQ is done/in-progress, do not add again
        break format_test;
      }
      // fall through to re-trigger the HQ load using the existing preview img
    }
    if (!isSameImage) {
      booruPreviewMediaContainer.innerHTML = '';
    }
    const img = isSameImage ? currentImg : document.createElement('img');
    if (!isSameImage) {
      // Store post source and ID for middle-click handler
      img.dataset.postSource = mediaElement.closest('.booru-image-item')?.dataset.postSource;
      img.dataset.postId = mediaElement.closest('.booru-image-item')?.dataset.postId;
      img.alt = 'Preview';

      const gallerySrc = mediaElement.currentSrc || mediaElement.src || mediaElement.dataset.resolvedThumbnailUrl || getImageUrl(mediaElement.dataset.thumbnailUrl || mediaElement.dataset.imageUrl);
      // For GIFs, use the actual GIF source directly to preserve animation
      const isGif = mediaElement.dataset.isGif === 'true';
      if (isGif) {
        img.src = gallerySrc;
      } else {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = mediaElement.naturalWidth;
          canvas.height = mediaElement.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (ctx && mediaElement.naturalWidth > 0 && mediaElement.naturalHeight > 0) {
            ctx.drawImage(mediaElement, 0, 0);
            img.src = canvas.toDataURL('image/jpeg', 0.92);
          } else {
            img.src = gallerySrc;
          }
        } catch (err) {
          img.src = gallerySrc;
        }
      }

      // Normalize preview styling to fit the hover container
      img.style.maxWidth = '100%';
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'contain';

      // Check if gallery image already has a high-quality version loaded
      if (mediaElement.dataset.currentQualityUrl) {
        img.src = mediaElement.dataset.currentQualityUrl;
        img.alt = 'Preview (High Quality)';
      } else if (mediaElement.dataset.highQualityLoaded === 'true' && mediaElement.dataset.highQualityUrl) {
        img.src = mediaElement.dataset.highQualityUrl;
        img.alt = 'Preview (High Quality)';

        // Add error handler as fallback if blob URL fails
        img.addEventListener('error', () => {
          img.src = getImageUrl(mediaElement.dataset.imageUrl);
        }, { once: true });
      } else {
        // if gallery image itself is already high quality but we haven't recorded it yet,
        // capture it so subsequent hovers will be instantaneous
        if (!mediaElement.dataset.currentQualityUrl && showHighQualityGallery) {
          mediaElement.dataset.currentQualityUrl = getImageUrl(mediaElement.dataset.imageUrl);
        }
      }
    }

    // Load high quality in background and swap when ready
    if (mediaElement.dataset.thumbnailUrl && mediaElement.dataset.imageUrl !== mediaElement.dataset.thumbnailUrl) {
      if (mediaElement.dataset.highQualityLoaded === 'true' && mediaElement.dataset.highQualityUrl) {
        // High quality already loaded and we've set it above, nothing more to do
      } else if (mediaElement.dataset.currentQualityUrl && mediaElement.dataset.currentQualityUrl === getImageUrl(mediaElement.dataset.imageUrl)) {
        // High quality already loaded via quality toggle, nothing more to do
      } else if (mediaElement.dataset.highQualityLoading !== 'true') {
        // Cancel any previously scheduled timer for this element (mousemove fires rapidly)
        if (mediaElement._hqDelayTimer) {
          clearTimeout(mediaElement._hqDelayTimer);
          mediaElement._hqDelayTimer = null;
        }
        // Start loading high quality after 400ms hover delay
        mediaElement._hqDelayTimer = setTimeout(() => {
          mediaElement._hqDelayTimer = null;
          // Guard: another call may have already started the load
          if (mediaElement.dataset.highQualityLoading === 'true' || mediaElement.dataset.highQualityLoaded === 'true') return;
          // Check if still hovering over the same element
          const elementsUnderCursor = document.elementsFromPoint(lastMouseX, lastMouseY);
          const currentHover = elementsUnderCursor.find(el => el === mediaElement);
          if (!currentHover) {
            // User moved away, cancel high quality load
            return;
          }
          
          mediaElement.dataset.highQualityLoading = 'true';
          
          // Add loading spinner to preview
          let loadingOverlay = booruPreviewMediaContainer.querySelector('.preview-loading-overlay');
          if (!loadingOverlay) {
            loadingOverlay = document.createElement('div');
            loadingOverlay.className = 'preview-loading-overlay';
            loadingOverlay.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
            loadingOverlay.style.cssText = `
              position: absolute;
              top: 10px;
              right: 10px;
              width: 45px;
              height: 45px;
              display: flex;
              align-items: center;
              justify-content: center;
              background: rgba(0, 0, 0, 0.5);
              border-radius: 50%;
              color: var(--accent);
              font-size: 28px;
              z-index: 10;
            `;
            booruPreviewMediaContainer.style.position = 'relative';
            booruPreviewMediaContainer.appendChild(loadingOverlay);
          }
          
          // Add loading spinner to download button if gallery item exists
          const galleryItem = mediaElement.closest('.booru-image-item');
          const downloadBtn = galleryItem?.querySelector('.booru-download-btn');
          // Capture original HTML — if the button is already showing a spinner (e.g., because
          // the gallery quality toggle is mid-load), derive the correct restore target from the
          // item's downloaded state rather than blindly capturing the transient spinner.
          let originalDownloadHTML = null;
          if (downloadBtn) {
            const currentBtnHtml = downloadBtn.innerHTML;
            if (currentBtnHtml.includes('fa-circle-notch')) {
              const isDownloaded = galleryItem?.dataset.downloaded === 'true';
              originalDownloadHTML = isDownloaded
                ? '<i class="fas fa-check"></i>'
                : '<i class="fas fa-download"></i>';
            } else {
              originalDownloadHTML = currentBtnHtml;
            }
            downloadBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
          }
          galleryItem.querySelector('.image-loader').style.display = 'none';
          updateHqLoadingCounter(1);
          
          loadingQueue.enqueue(async () => {
            let _thisLoadBytes = 0; // bytes this request added to _hqTotalBytes
            let contentLength = 0;
            try {
              const highQualityUrl = mediaElement.dataset.imageUrl;
              let response = null;
              try {
                // Only attempt HEAD probe if URL is actually a remote HTTP(S) URL
                // Skip for localhost, data URLs, or blob URLs to avoid unnecessary proxy errors
                if (highQualityUrl && !highQualityUrl.startsWith('data:') && !highQualityUrl.includes('blob:') && !highQualityUrl.includes('localhost')) {
                  response = await proxyFetch(highQualityUrl, { method: 'HEAD', silent: true });
                }
              } catch (err) {
                // optional HEAD probe failed; continue without HEAD metadata
              }
              if (response && (response.ok || response.status === 302)) {
                const proxyContentLength = response.headers.get('X-Proxy-Content-Length');
                contentLength = parseInt(proxyContentLength || response.headers.get('Content-Length') || '0', 10);
                if (contentLength > 0) {
                  _thisLoadBytes = contentLength;
                  _hqTotalBytes += contentLength;
                  updateHqLoadingCounter(0); // refresh display
                }
              } else if (response && response.status !== 302) {
                // optional HEAD probe returned non-OK status; continue without HEAD metadata
              }
              
              // Store the proxied high-quality URL for future preview reuse.
              // This avoids reloading the raw source URL again on subsequent hovers.
              mediaElement.dataset.highQualityUrl = getImageUrl(highQualityUrl);
              
              // Update preview image if it's still showing and hasn't been replaced
              if (img.parentNode === booruPreviewMediaContainer) {
                
                // Create a new image element with the high quality URL
                const newImg = document.createElement('img');
                newImg.style.opacity = '0';
                newImg.style.zIndex = '5';
                newImg.style.position = 'absolute';
                newImg.style.top = '0';
                newImg.style.left = '0';
                newImg.style.width = '100%';
                newImg.style.height = '100%';
                newImg.style.objectFit = 'contain';
                newImg.style.transition = 'opacity 0.2s ease-in';
                
                // Make container position relative
                if (booruPreviewMediaContainer.style.position === '' || booruPreviewMediaContainer.style.position === 'static') {
                  booruPreviewMediaContainer.style.position = 'relative';
                }
                
                newImg.onload = () => {
                  // Fade in new image
                  newImg.style.opacity = '1';

                  // Remove loading indicator from preview
                  const overlay = booruPreviewMediaContainer.querySelector('.preview-loading-overlay');
                  if (overlay) overlay.remove();
                  
                  // Restore download button only after image is fully loaded - re-query to get fresh reference
                  const currentGalleryItem = mediaElement.closest('.booru-image-item');
                  const currentDownloadBtn = currentGalleryItem?.querySelector('.booru-download-btn');
                  if (currentDownloadBtn && originalDownloadHTML !== null) {
                    currentDownloadBtn.innerHTML = originalDownloadHTML;
                  }
                };
                
                newImg.onerror = (e) => {
                  console.error('Failed to load high quality preview, error:', e);
                  showToast('Failed to load high quality preview', 'error');
                  if (newImg.parentNode === booruPreviewMediaContainer) {
                    booruPreviewMediaContainer.removeChild(newImg);
                  }
                  
                  // Remove loading indicator from preview on error
                  const overlay = booruPreviewMediaContainer.querySelector('.preview-loading-overlay');
                  if (overlay) overlay.remove();
                  
                  // Restore download button on error - re-query to get fresh reference
                  const currentGalleryItem = mediaElement.closest('.booru-image-item');
                  const currentDownloadBtn = currentGalleryItem?.querySelector('.booru-download-btn');
                  if (currentDownloadBtn && originalDownloadHTML !== null) {
                    currentDownloadBtn.innerHTML = originalDownloadHTML;
                  }
                };
                
                // Append and set src to direct proxy URL (not blob)
                booruPreviewMediaContainer.appendChild(newImg);
                // Use the same proxy method that works elsewhere
                newImg.src = getImageUrl(mediaElement.dataset.imageUrl);
              }
              
              // Update gallery element using the same approach as updateGalleryImageQuality()
              // Remove any existing error display from the parent container
              const errorDiv = mediaElement.parentElement?.querySelector('div[style*="background: var(--bg-darkest)"]');
              if (errorDiv) {
                errorDiv.remove();
              }
              
              // Remove loaded class to allow new load event
              mediaElement.classList.remove('loaded');
              
              // Add load handler for gallery element to restore button when background load completes
              mediaElement.addEventListener('load', () => {
                mediaElement.classList.add('loaded');
                _hqTotalBytes -= contentLength;
                updateHqLoadingCounter(-1);
                // Restore download button when gallery image loads
                const currentGalleryItem = mediaElement.closest('.booru-image-item');
                const currentDownloadBtn = currentGalleryItem?.querySelector('.booru-download-btn');
                if (currentDownloadBtn && originalDownloadHTML !== null) {
                  currentDownloadBtn.innerHTML = originalDownloadHTML;
                }
                mediaElement.dataset.highQualityLoaded = 'true';
                delete mediaElement.dataset.highQualityLoading;
                if (!mediaElement.dataset.currentQualityUrl) {
                  mediaElement.dataset.currentQualityUrl = mediaElement.dataset.highQualityUrl || getImageUrl(mediaElement.dataset.imageUrl);
                }
              }, { once: true });
              
              // Add error handler for gallery element
              mediaElement.addEventListener('error', () => {
                mediaElement.classList.add('loaded');
                _hqTotalBytes -= contentLength;
                updateHqLoadingCounter(-1);
                const loader = mediaElement.parentElement?.querySelector('.image-loader');
                if (loader) loader.style.display = 'none';
                // Restore download button on error
                const currentGalleryItem = mediaElement.closest('.booru-image-item');
                const currentDownloadBtn = currentGalleryItem?.querySelector('.booru-download-btn');
                if (currentDownloadBtn && originalDownloadHTML !== null) {
                  currentDownloadBtn.innerHTML = originalDownloadHTML;
                }
                delete mediaElement.dataset.highQualityLoading;
              }, { once: true });
              
              // Set the new source using the already-resolved URL if available
              mediaElement.src = getImageUrl(mediaElement.dataset.imageUrl);
              // --- Update tab cache with new quality ---
              try {
                const postId = mediaElement.closest('.booru-image-item')?.dataset.postId;
                const postSource = mediaElement.closest('.booru-image-item')?.dataset.postSource;
                if (window.booruTabs && window.activeTabId) {
                  const tab = window.booruTabs.find(t => t.id === window.activeTabId);
                  if (tab && Array.isArray(tab.booruPosts)) {
                    const post = tab.booruPosts.find(p => String(p.id) === String(postId) && String(p.source) === String(postSource));
                    if (post) {
                      post.imageUrl = mediaElement.src;
                      post.currentQualityUrl = mediaElement.src;
                    }
                  }
                }
              } catch (e) { /* ignore */ }
            } catch (err) {
              console.error('Error during hover HQ loading setup:', err);
              // Remove loading indicator on error
              const overlay = booruPreviewMediaContainer.querySelector('.preview-loading-overlay');
              if (overlay) overlay.remove();
              // Restore download button on error - re-query to get fresh reference
              const currentGalleryItem = mediaElement.closest('.booru-image-item');
              const currentDownloadBtn = currentGalleryItem?.querySelector('.booru-download-btn');
              if (currentDownloadBtn && originalDownloadHTML !== null) {
                currentDownloadBtn.innerHTML = originalDownloadHTML;
              }
              delete mediaElement.dataset.highQualityLoading;
              if (_thisLoadBytes > 0) { _hqTotalBytes -= _thisLoadBytes; _thisLoadBytes = 0; }
              updateHqLoadingCounter(-1);
            }
          }).catch(err => {
            console.error('Queued high quality hover load failed:', err);
          });
        }, window.hqHoverDelay ?? 150); // hover delay (configurable in Settings)
      }
      // If already loading, keep thumbnail for now
    }
    if (!isSameImage) {
      // Add middle click handler to open post URL
      img.addEventListener('mousedown', (e) => {
        if (e.button === 1) {
          e.preventDefault();
          const postSource = img.dataset.postSource;
          const postId = img.dataset.postId;
          
          // Build post URL from source config
          const sourceConfig = booruSourcesManager?.getSource(postSource);
          let postUrl;
          if (sourceConfig && sourceConfig.artist && (sourceConfig.artist.postUrlPattern || sourceConfig.artist.urlPattern)) {
            const urlPattern = sourceConfig.artist.postUrlPattern || sourceConfig.artist.urlPattern;
            postUrl = urlPattern.startsWith('http')
              ? urlPattern.replace('{id}', postId)
              : sourceConfig.baseUrl + urlPattern.replace('{id}', postId);
          } else {
            postUrl = img.src;
          }
          window.open(postUrl, '_blank');
        }
      });
      booruPreviewMediaContainer.appendChild(img);
    }
  }
  
  const tags = mediaElement.dataset.tags.split(' ').filter(t => t.length > 0);
  booruPreviewTags.innerHTML = '';
  
  // Get current search tags for highlighting
  const rawSearchTags = searchFilterInput ? searchFilterInput.value.trim() : '';
  const { searchTagsArray } = parseTagsAndBlacklist(rawSearchTags);
  const searchTagsLower = searchTagsArray ? searchTagsArray.map(t => t.toLowerCase()) : [];
  
  tags.forEach(tag => {
    const tagSpan = document.createElement('span');
    tagSpan.className = 'booru-tag';
    
    // Highlight if it matches a searched tag
    if (searchTagsLower.includes(tag.toLowerCase())) {
      tagSpan.classList.add('searched');
    }
    
    tagSpan.textContent = tag;
    const tagKey = tag.toLowerCase();
    if (previewMiddleClickedTags.has(tagKey)) {
      tagSpan.classList.add('middle-selected');
    }

    // Add click handler for tag (only works when preview is frozen)
    tagSpan.addEventListener('click', (e) => {
      if (previewFrozen && searchFilterInput) {
        e.preventDefault();
        e.stopPropagation();
        togglePreviewTagSelection(tag);
      }
    });
    
    tagSpan.addEventListener('mousedown', (e) => {
      if (e.button === 1) { // Middle mouse button
        e.preventDefault();
        e.stopPropagation();
        if (previewFrozen) {
          togglePreviewMiddleTagSelection(tag);
          return;
        }
        if (typeof createNewBooruTab === 'function') {
          try {
            createNewBooruTab(tag);
          } catch (err) {
            showToast('Failed to create new tab for tag: ' + tag + ' - ' + err.message, 'error');
          }
        }
      }
    });
    
    booruPreviewTags.appendChild(tagSpan);
  });

  // Render all Artists as tags
  const authorValue = mediaElement.parentElement?.dataset.artist || mediaElement.dataset.author || '?';
  setPreviewArtistNames(mediaElement, authorValue);
  
  // Display upload date if available
  booruPreviewDate.innerHTML = '';
  const createdAt = mediaElement.dataset.createdAt;
  if (createdAt && createdAt !== '') {
    const dateTag = document.createElement('span');
    dateTag.className = 'booru-tag date-tag';
    const dateObj = new Date(parseInt(createdAt) || createdAt);
    if (!isNaN(dateObj.getTime())) {
      dateTag.textContent = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      booruPreviewDate.appendChild(dateTag);
    }
  }
  
  booruHoverPreview.classList.add('active');
  const previewPostId = mediaElement.closest('.booru-image-item')?.dataset.postId;
  const previewPostSource = mediaElement.closest('.booru-image-item')?.dataset.postSource;
  autoClickUnknownPreviewAuthor(previewPostId, previewPostSource);
}


const galleryWrapper = document.getElementById('gallery-wrapper');

// Set up event listeners for gallery
if (galleryWrapper) {
  // Helper to block preview during/after scroll
  function blockPreviewDuringScroll() {
    isScrolling = true;
    scrollBlockPreview = true;
    booruHoverPreview.classList.remove('active', 'frozen');
    previewFrozen = false;
    pauseAllPreviewVideos();
    if (scrollBlockTimer) clearTimeout(scrollBlockTimer);
    scrollBlockTimer = setTimeout(() => {
      isScrolling = false;
      // Block preview for a short time after scroll ends
      setTimeout(() => { scrollBlockPreview = false; }, 200);
    }, 150);
  }

  // Listen for scroll events on gallery and window
  galleryWrapper.addEventListener('scroll', blockPreviewDuringScroll, { passive: true });
  window.addEventListener('scroll', blockPreviewDuringScroll, { passive: true });
  galleryWrapper.addEventListener('wheel', blockPreviewDuringScroll, { passive: true });
  window.addEventListener('wheel', blockPreviewDuringScroll, { passive: true });
  galleryWrapper.addEventListener('touchmove', blockPreviewDuringScroll, { passive: true });
  window.addEventListener('touchmove', blockPreviewDuringScroll, { passive: true });
  // Optionally: pointer events for scrollbar drag
  galleryWrapper.addEventListener('pointerdown', blockPreviewDuringScroll, { passive: true });
  galleryWrapper.addEventListener('pointerup', blockPreviewDuringScroll, { passive: true });
  let lastHoveredElement = null;
  let mouseoverThrottle = null;
  
  galleryWrapper.addEventListener('mouseover', (e) => {
    const mediaElement = e.target.closest('.booru-image-item img, .booru-image-item video');
    
    // Skip if same element or throttled
    if (mediaElement === lastHoveredElement) return;
    if (mouseoverThrottle) return;
    
    if (mediaElement && mediaElement.dataset.tags && mediaElement.classList.contains('loaded')) {
      lastHoveredElement = mediaElement;
      mouseoverThrottle = setTimeout(() => {
        mouseoverThrottle = null;
      }, 100); // 100ms throttle for better performance
      
      showPreviewForElement(mediaElement);
    }
  });
  
  galleryWrapper.addEventListener('mouseout', (e) => {
    const mediaElement = e.target.closest('.booru-image-item img, .booru-image-item video');
    if (mediaElement) {
      // Only hide if not frozen, but always reset lastHoveredElement
      lastHoveredElement = null;
      if (mediaElement._videoPreviewDelayTimer) {
        clearTimeout(mediaElement._videoPreviewDelayTimer);
        mediaElement._videoPreviewDelayTimer = null;
      }
      if (!previewFrozen) {
        booruHoverPreview.classList.remove('active');
        pauseAllPreviewVideos();
      }
    }
  });
  
  galleryWrapper.addEventListener('mousemove', (e) => {
    // Check if mouse is over an image
    const mediaElement = e.target.closest('.booru-image-item img, .booru-image-item video');
    
    // Hide preview if not over an image and not frozen
    if (!mediaElement && !previewFrozen && booruHoverPreview.classList.contains('active')) {
      booruHoverPreview.classList.remove('active');
      lastHoveredElement = null;
      pauseAllPreviewVideos();
    }
    
    if (booruHoverPreview.classList.contains('active') && !previewFrozen) {
      const offset = 40;
      const previewRect = booruHoverPreview.getBoundingClientRect();
      
      // Calculate position, defaulting to right and below cursor
      let x = e.clientX + offset;
      let y = e.clientY + offset;
      
      // Prevent horizontal overflow
      if (x + previewRect.width > window.innerWidth) {
        x = e.clientX - previewRect.width - offset;
      }
      // If still overflows on left, clamp to screen
      if (x < 0) {
        x = 10;
      }
      
      // Prevent vertical overflow
      if (y + previewRect.height > window.innerHeight) {
        y = e.clientY - previewRect.height - offset;
      }
      // If still overflows on top, clamp to screen
      if (y < 0) {
        y = 10;
      }
      
      booruHoverPreview.style.left = x + 'px';
      booruHoverPreview.style.top = y + 'px';
    }
  });
  
  // Handle wheel scrolling on preview to scroll tags instead of page (only when frozen)
  booruHoverPreview.addEventListener('wheel', (e) => {
    // Always prevent propagation to window scroll handlers
    e.stopPropagation();
    
    // Throttle wheel event to prevent laggy smooth scroll
    if (!booruHoverPreview._tagsScrollThrottle) booruHoverPreview._tagsScrollThrottle = false;
    if (previewFrozen && !booruHoverPreview._tagsScrollThrottle) {
      booruHoverPreview._tagsScrollThrottle = true;
      const tagsContainer = booruPreviewTags;
      if (tagsContainer) {
        // Only prevent default scrolling if the tags container has a scrollbar
        const hasScrollbar = tagsContainer.scrollHeight > tagsContainer.clientHeight;
        if (hasScrollbar) {
          e.preventDefault();
          tagsContainer.scrollBy({ top: e.deltaY, behavior: 'smooth' });
        }
      }
      setTimeout(() => { booruHoverPreview._tagsScrollThrottle = false; }, 50);
    } else if (previewFrozen) {
      e.preventDefault(); // Prevent stacking even if throttled
    }
  }, { passive: false });
}

function togglePreviewTagSelection(tag) {
  if (!searchFilterInput) return;

  const currentTags = searchFilterInput.value.trim().split(/\s+/).filter(t => t.length > 0);
  const tagLower = tag.toLowerCase();
  const tagIndex = currentTags.findIndex(t => t.toLowerCase() === tagLower);

  if (tagIndex !== -1) {
    currentTags.splice(tagIndex, 1);
  } else {
    currentTags.push(tag);
  }

  searchFilterInput.value = currentTags.join(' ');

  if (previewFrozen) {
    tagsChangedWhileFrozen = true;
  }

  updatePreviewTagHighlighting();
}

function togglePreviewMiddleTagSelection(tag) {
  const tagKey = tag.toLowerCase();

  if (previewMiddleClickedTags.has(tagKey)) {
    previewMiddleClickedTags.delete(tagKey);
  } else {
    previewMiddleClickedTags.add(tagKey);
  }

  updatePreviewTagHighlighting();
}

// Toggle tag in search input
function toggleTagInSearch(tag) {
  togglePreviewTagSelection(tag);
}

function commitPreviewFrozenTagChanges() {
  if (previewMiddleClickedTags.size === 0) return;

  const tagsForNewTab = Array.from(previewMiddleClickedTags).join(' ');
  previewMiddleClickedTags.clear();

  if (!tagsForNewTab.trim()) return;

  if (typeof createNewBooruTab === 'function') {
    try {
      createNewBooruTab(tagsForNewTab, false, tagsForNewTab);
    } catch (err) {
      showToast('Failed to create new tab for selected tags: ' + err.message, 'error');
    }
  }
}

// Update tag highlighting in active preview
function updatePreviewTagHighlighting() {
  if (!booruHoverPreview.classList.contains('active')) return;
  
  const rawSearchTags = searchFilterInput ? searchFilterInput.value.trim() : '';
  const { searchTagsArray } = parseTagsAndBlacklist(rawSearchTags);
  const searchTagsLower = searchTagsArray ? searchTagsArray.map(t => t.toLowerCase()) : [];
  
  const tagSpans = booruPreviewTags.querySelectorAll('.booru-tag');
  tagSpans.forEach(tagSpan => {
    const tagText = tagSpan.textContent.toLowerCase();
    const tagKey = tagText.toLowerCase();

    if (searchTagsLower.includes(tagText)) {
      tagSpan.classList.add('searched');
    } else {
      tagSpan.classList.remove('searched');
    }

    if (previewMiddleClickedTags.has(tagKey)) {
      tagSpan.classList.add('middle-selected');
    } else {
      tagSpan.classList.remove('middle-selected');
    }
  });
}

// Infinite scroll for booru
if (booruContent) {
  let scrollSaveTimeout;
  let scrollLoadTimeout;
  
  booruContent.addEventListener('scroll', () => {
    clearTimeout(scrollSaveTimeout);
    scrollSaveTimeout = setTimeout(() => {
      debouncedSettingsSave();
    }, 500);

    clearTimeout(scrollLoadTimeout);
    scrollLoadTimeout = setTimeout(() => {
      if (!window.isViewingDownloadsGallery)
        if (isLoadingBooru) return;
      if (!window.hasMoreResults) {
        const booruLoadingIcon = document.getElementById('booru-loading');
        if (booruLoadingIcon) {
          booruLoadingIcon.style.display = 'none';
        }
        // Add end-of-results message if no more content available
        if (!window.hasMoreResults && booruPosts.length > 0) {
          const endMessage = document.createElement('div');
          endMessage.className = 'booru-end-message';
          endMessage.style.cssText = 'text-align: center; padding: 30px; color: var(--text-secondary); font-size: 14px; border-top: 1px solid var(--border); margin-top: 20px;';
          endMessage.innerHTML = `<p>loaded <b>${totalResultCount ?? 0}</b></p> <p><i class="fa-solid fa-xmark"></i> No more results available</p><br><h1>Recommended Tags</h1> <div class="booru-end-tags" id="booru-end-tags"></div>`;
          const existingEndMessage = booruContent.querySelector('.booru-end-message');
          if (existingEndMessage) existingEndMessage.remove();
          booruContent.appendChild(endMessage);
          fillBooruEndTags();
        }
        return;
      }

      // Handle downloads gallery pagination
      if (window.isViewingDownloadsGallery) {
        if (!window.allDownloadedPosts || window.downloadsPaginationIndex >= window.allDownloadedPosts.length) {
          return;
        }
        
        const scrollTop = booruContent.scrollTop;
        const scrollHeight = booruContent.scrollHeight;
        const clientHeight = booruContent.clientHeight;

        if (scrollTop + clientHeight >= scrollHeight - 300) {
          // Load next batch of downloads
          const limit = parseInt(document.getElementById('booru-limit-input')?.value) || 100;
          const nextBatch = window.allDownloadedPosts.slice(window.downloadsPaginationIndex, window.downloadsPaginationIndex + limit);
          
          if (nextBatch.length > 0) {
            // Set loading state to prevent multiple loads
            isLoadingBooru = true;
            
            // Remove end message if it exists
            const endMessage = booruGallery.querySelector('.booru-end-message');
            if (endMessage) endMessage.remove();
            // Show loading indicator
            document.getElementById('load-more-icon')?.remove();
            if (booruLoading) booruLoading.style.display = 'flex';
            
            // Delay rendering to allow loading icon to appear
            setTimeout(() => {
              // Append to booruPosts array
              window.booruPosts = window.booruPosts.concat(nextBatch);
              window.downloadsPaginationIndex += nextBatch.length;
              window.hasMoreResults = window.downloadsPaginationIndex < window.allDownloadedPosts.length;
              
              // Listen for gallery render completion
              $(booruGallery).one('jg.complete', function() {
                // Hide loading indicator and reset loading state after gallery finishes
                if (booruLoading) booruLoading.style.display = 'none';
                isLoadingBooru = false;
              });
              
              // Render with append=true to add to existing gallery
              const seperateByArtist = document.getElementById('downloads-sort-artist-btn')?.classList.contains('btn-accent');
              renderBooruGallery(nextBatch, true, seperateByArtist);
            }, 100);
          }
        }
        return;
      }

      // Allow infinite scroll if we have a pagination token OR if we have posts (first load for non-paginated sources)
      const canLoadMore = booruPaginationToken !== null || window.booruPosts.length > 0;
      if (!canLoadMore) {
        console.log('Cannot load more - no pagination token and no posts');
        return;
      }

      const scrollTop = booruContent.scrollTop;
      const scrollHeight = booruContent.scrollHeight;
      const clientHeight = booruContent.clientHeight;

      if (scrollTop + clientHeight >= scrollHeight - 300) {
        // Only block infinite scroll loading when viewing downloads gallery
        if (!window.isViewingDownloadsGallery) {
          loadBooruImages(true);
        }
      }
    }, 100);
  }, { passive: true });
  
  booruContent.addEventListener('wheel', (e) => {
    if (isLoadingBooru) return;
    if (!window.hasMoreResults) return; // Don't try to load if no more results

    // Handle downloads gallery pagination
    if (window.isViewingDownloadsGallery) {
      if (!window.allDownloadedPosts || window.downloadsPaginationIndex >= window.allDownloadedPosts.length) {
        return;
      }

      if (e.deltaY > 0) {
        const scrollTop = booruContent.scrollTop;
        const scrollHeight = booruContent.scrollHeight;
        const clientHeight = booruContent.clientHeight;

        const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10;
        const isNotScrollable = scrollHeight <= clientHeight;

        if (isAtBottom || isNotScrollable) {
          // Load next batch of downloads
          const limit = parseInt(document.getElementById('booru-limit-input')?.value) || 100;
          const nextBatch = window.allDownloadedPosts.slice(window.downloadsPaginationIndex, window.downloadsPaginationIndex + limit);
          
          if (nextBatch.length > 0) {
            // Set loading state to prevent multiple loads
            isLoadingBooru = true;
            
            // Remove end message if it exists
            const endMessage = booruGallery.querySelector('.booru-end-message');
            if (endMessage) endMessage.remove();
            document.getElementById('load-more-icon')?.remove();
            // Show loading indicator
            if (booruLoading) booruLoading.style.display = 'flex';
            
            // Delay rendering to allow loading icon to appear
            setTimeout(() => {
              // Append to booruPosts array
              window.booruPosts = window.booruPosts.concat(nextBatch);
              window.downloadsPaginationIndex += nextBatch.length;
              window.hasMoreResults = window.downloadsPaginationIndex < window.allDownloadedPosts.length;
              
              // Listen for gallery render completion
              $(booruGallery).one('jg.complete', function() {
                // Hide loading indicator and reset loading state after gallery finishes
                if (booruLoading) booruLoading.style.display = 'none';
                isLoadingBooru = false;
              });
              
              // Render with append=true to add to existing gallery
              const seperateByArtist = document.getElementById('downloads-sort-artist-btn')?.classList.contains('btn-accent');
              renderBooruGallery(nextBatch, true, seperateByArtist);
            }, 100);
          }
        }
      }
      return;
    }

    // Allow infinite scroll if we have a pagination token OR if we have posts
    const canLoadMore = booruPaginationToken !== null || window.booruPosts.length > 0;
    if (!canLoadMore) return;

    if (e.deltaY > 0) {
      const scrollTop = booruContent.scrollTop;
      const scrollHeight = booruContent.scrollHeight;
      const clientHeight = booruContent.clientHeight;

      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10;
      const isNotScrollable = scrollHeight <= clientHeight;

      if (isAtBottom || isNotScrollable) {
        // Only block infinite scroll loading when viewing downloads gallery
        if (!window.isViewingDownloadsGallery) {
          loadBooruImages(true);
        }
      }
    }
  }, { passive: true });
}

// Justified Gallery handles window resize automatically

// Periodic memory cleanup to prevent leaks
// Runs every 2 minutes to clean up excessive DOM elements and limit array sizes
if (typeof window.booruMemoryCleanupInterval === 'undefined') {
  window.booruMemoryCleanupInterval = setInterval(() => {
    // Only run cleanup if on booru tab
    const booruTab = document.getElementById('booru-tab');
    if (!booruTab || !booruTab.classList.contains('active')) return;
    
    const gallery = document.getElementById('booru-gallery');
    if (!gallery) return;
    
    // Gallery cleanup disabled – keep every DOM element, threshold removed
    // (array size limiter below still runs independently)
    // const items = gallery.querySelectorAll('.booru-image-item');
    // if (items.length > 500) {
    //   console.log(`[Memory Cleanup] Gallery has ${items.length} items, cleaning up oldest ${items.length - 300}...`);
    //   
    //   // IMPORTANT: Destroy JustifiedGallery and unbind events BEFORE removing elements
    //   if (typeof $.fn.justifiedGallery !== 'undefined') {
    //     $(gallery).find('img, video').off('load error');
    //     $(gallery).justifiedGallery('destroy');
    //   }
    //   
    //   // Remove first N items (oldest ones at top)
    //   const itemsToRemove = items.length - 300;
    //   for (let i = 0; i < itemsToRemove; i++) {
    //     const item = items[i];
    //     // Clean up images and videos
    //     const img = item.querySelector('img');
    //     if (img) {
    //       img.src = '';
    //       img.srcset = '';
    //     }
    //     const video = item.querySelector('video');
    //     if (video) {
    //       video.pause();
    //       video.src = '';
    //       video.load();
    //     }
    //     item.remove();
    //   }
    // }
      
      // Reinitialize JustifiedGallery after cleanup
      // (cleanup is currently disabled, so this block is intentionally skipped)
    // end of original cleanup-if (now disabled)
    
    // Limit window.booruPosts array size
    if (window.booruPosts && window.booruPosts.length > 1000 && typeof limitArraySize !== 'undefined') {
      const oldLength = window.booruPosts.length;
      window.booruPosts = limitArraySize(window.booruPosts, 1000);
      console.log(`[Memory Cleanup] Limited booruPosts from ${oldLength} to ${window.booruPosts.length}`);
    }
  }, 120000); // Run every 2 minutes
}

// Initialize on load
initBooruBrowser();

// Load download folder on startup
loadDownloadFolder();

// Expose download functions globally for tabs system
window.checkDownloadedImages = checkDownloadedImages;
window.updateDownloadFolderDisplay = updateDownloadFolderDisplay;
window.getFilenameFromUrl = getFilenameFromUrl;
