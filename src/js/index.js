const toggle = document.getElementById('toggle-switch');
const handle = toggle.querySelector('.handle');
const outputDirInput = document.getElementById('output-dir');
const jsonDropdown = document.getElementById('json-dropdown');
const logPanel = document.getElementById('log-panel');
const imageContainer = document.getElementById('image-container');
const currentImage = document.getElementById('current-image');
const promptPanel = document.querySelector('#prompt-panel .prompt-content');
const leftArrow = imageContainer.querySelector('.left-arrow');
const rightArrow = imageContainer.querySelector('.right-arrow');
const deleteBtn = imageContainer.querySelector('.delete-btn');
const appVersionEl = document.getElementById('app-version');
const updateBtn = document.getElementById('update-btn');
const advertButton = document.getElementById('toggleAdverts');
const advertsContainer = document.getElementById('adverts');

// Settings management
const settingsBtn = document.getElementById('settings-btn');
const themeSelect = document.getElementById('theme-select');
const root = document.documentElement;
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const supportToastEnabled = document.getElementById('support-toast-enabled');
const LOCAL_SERVER_ERROR_COOLDOWN_MS = 15000;
let tallImageScrollSpeedMultiplier = 1.1; // seconds per 100px of image height
let localServerUnavailableUntil = 0;

// Window zoom controls
const increaseZoomBtn = document.getElementById('increase-zoom');
const decreaseZoomBtn = document.getElementById('decrease-zoom');
const zoomValueDisplay = document.querySelector('.window-zoom-controls p');
const ZOOM_MIN = 10;
const ZOOM_MAX = 250;
const ZOOM_STEP = 10;
let currentZoom = parseInt(localStorage.getItem('browserZoom'), 10);
if (Number.isNaN(currentZoom) || currentZoom < ZOOM_MIN || currentZoom > ZOOM_MAX) {
  currentZoom = 100;
}

function updateZoomButtons() {
  if (increaseZoomBtn) increaseZoomBtn.disabled = currentZoom >= ZOOM_MAX;
  if (decreaseZoomBtn) decreaseZoomBtn.disabled = currentZoom <= ZOOM_MIN;
}

function applyBrowserZoom(value, persist = true) {
  const normalizedZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value / ZOOM_STEP) * ZOOM_STEP));
  currentZoom = normalizedZoom;
  if (zoomValueDisplay) zoomValueDisplay.textContent = `${normalizedZoom}%`;
  document.documentElement.style.zoom = `${normalizedZoom}%`;
  updateZoomButtons();
  if (persist) localStorage.setItem('browserZoom', String(normalizedZoom));
}

if (increaseZoomBtn) {
  increaseZoomBtn.addEventListener('click', () => applyBrowserZoom(currentZoom + ZOOM_STEP));
}
if (decreaseZoomBtn) {
  decreaseZoomBtn.addEventListener('click', () => applyBrowserZoom(currentZoom - ZOOM_STEP));
}

applyBrowserZoom(currentZoom, false);

// Proxy settings elements
const proxyActive = document.getElementById('proxy-active');
const proxyType = document.getElementById('proxy-type');
const proxyHost = document.getElementById('proxy-host');
const proxyPort = document.getElementById('proxy-port');
const proxyUser = document.getElementById('proxy-user');
const proxyPassword = document.getElementById('proxy-password');

if (supportToastEnabled) {
  supportToastEnabled.checked = localStorage.getItem('supportToastEnabled') !== 'false';
  supportToastEnabled.addEventListener('change', () => {
    localStorage.setItem('supportToastEnabled', supportToastEnabled.checked ? 'true' : 'false');
    if (!supportToastEnabled.checked) supportToastSuccessCount = 0;
    debouncedSettingsSave();
  });
}

// Anonymity settings elements
const anonUaRotation      = document.getElementById('anon-ua-rotation');
const anonJitterMin       = document.getElementById('anon-jitter-min');
const anonJitterMax       = document.getElementById('anon-jitter-max');
const anonTorRotateCount  = document.getElementById('anon-tor-rotate-count');
const anonTorRotateMins   = document.getElementById('anon-tor-rotate-mins');
const anonTorControlPort  = document.getElementById('anon-tor-control-port');
const anonTorHashedPassword = document.getElementById('anon-tor-hashed-password');
const anonTorRotateNow    = document.getElementById('anon-tor-rotate-now');
const anonTorStatus       = document.getElementById('anon-tor-rotate-status');

// Initialize settings based on saved preferences
async function initializeSettings() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  themeSelect.value = savedTheme;
  applyTheme(savedTheme);

  // Set icon rotation on load
  updateThemeToggleIcon(savedTheme);

  if (outputDirInput) {
    outputDirInput.placeholder = 'Loading output folder…';
    try {
      const outputPath = await window.electronAPI.getUserDataOutputPath();
      if (!outputDirInput.value || outputDirInput.value.trim() === 'output') {
        outputDirInput.value = outputPath;
      }
      outputDirInput.placeholder = outputPath;
    } catch (err) {
      console.warn('Unable to load output path for UI:', err);
      outputDirInput.placeholder = 'Documents\\My Games\\BS\\output';
    }
  }

  // Show startup proxy status before restoring session
  await setLoadingStatus('Starting up…', 'Applying saved proxy settings…');

  // Load proxy settings
  await loadProxySettings();
}

async function syncProxySettingsToServer(settings, attempt = 1, forceRestart = false) {
  try {
    const body = { ...settings };
    if (forceRestart) body.forceRestart = true;

    const res = await fetch('http://localhost:3001/api/set-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      throw new Error(`Server returned ${res.status}`);
    }
    return true;
  } catch (e) {
    console.error('Error syncing proxy settings to server:', e);
    showToast('Failed to apply proxy settings: ' + (e.message || e), 'error');
    if (attempt < 3) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return syncProxySettingsToServer(settings, attempt + 1, forceRestart);
    }
    return false;
  }
}

// Load proxy settings from localStorage and sync to server
async function loadProxySettings() {
  const proxySettings = localStorage.getItem('proxySettings');
  if (proxySettings) {
    try {
      const settings = JSON.parse(proxySettings);
      proxyActive.checked = settings.active || false;
      proxyType.value = settings.type || 'HTTP';
      proxyHost.value = settings.host || '';
      proxyPort.value = settings.port || '';
      proxyUser.value = settings.user || '';
      proxyPassword.value = settings.password || '';
      updateProxyFieldsDisabled();

      // Load anonymity settings
      anonUaRotation.checked     = settings.uaRotation  !== false;
      anonJitterMin.value        = settings.jitterMin    ?? 20;
      anonJitterMax.value        = settings.jitterMax    ?? 250;
      anonTorRotateCount.value   = settings.torRotateCount ?? 100;
      anonTorRotateMins.value    = settings.torRotateMins  ?? 300;
      anonTorControlPort.value   = settings.torControlPort ?? 9051;
      anonTorHashedPassword.value = settings.torHashedPassword || '';
      updateJitterMaxDisabled();
      updateTorStatusText();
      
      // Sync proxy settings to server immediately on page load and force a proxy restart if enabled.
      await syncProxySettingsToServer(settings, 1, settings.active === true);
    } catch (e) {
      console.error('Error loading proxy settings:', e);
      showToast('Failed to load proxy settings: ' + (e.message || e), 'error');
    }
  } else {
    // No saved proxy settings yet: initialize defaults.
    proxyActive.checked = false;
    proxyType.value = 'SOCKS5';
    proxyHost.value = 'localhost';
    proxyPort.value = '9050';
    proxyUser.value = '';
    proxyPassword.value = '';
    updateProxyFieldsDisabled();
  }
}

// Save proxy settings to localStorage
function saveProxySettings() {
  const settings = {
    active: proxyActive.checked,
    type: proxyType.value,
    host: proxyHost.value,
    port: proxyPort.value,
    user: proxyUser.value,
    password: proxyPassword.value,
    uaRotation:      anonUaRotation.checked,
    jitterMin:       parseInt(anonJitterMin.value)      || 0,
    jitterMax:       parseInt(anonJitterMax.value)      || 0,
    torRotateCount:  parseInt(anonTorRotateCount.value) || 0,
    torRotateMins:   parseInt(anonTorRotateMins.value)  || 0,
    torControlPort:  parseInt(anonTorControlPort.value) || 9051,
    torHashedPassword: anonTorHashedPassword.value.trim() || '',
  };
  localStorage.setItem('proxySettings', JSON.stringify(settings));
  
  // Send proxy settings to server on port 3001
  syncProxySettingsToServer(settings).catch(e => console.error('Error sending proxy settings to server:', e));
  
  // Update status text with the new control port
  updateTorStatusText();
}

// Update disabled state of proxy fields based on active checkbox
function updateProxyFieldsDisabled() {
  const isDisabled = !proxyActive.checked;
  proxyType.disabled = isDisabled;
  proxyHost.disabled = isDisabled;
  proxyPort.disabled = isDisabled;
  proxyUser.disabled = isDisabled;
  proxyPassword.disabled = isDisabled;

  // Tor/Anonymity settings fields
  if (typeof anonUaRotation !== 'undefined') anonUaRotation.disabled = isDisabled;
  if (typeof anonJitterMin !== 'undefined') anonJitterMin.disabled = isDisabled;
  if (typeof anonJitterMax !== 'undefined') anonJitterMax.disabled = isDisabled;
  if (typeof anonTorRotateCount !== 'undefined') anonTorRotateCount.disabled = isDisabled;
  if (typeof anonTorRotateMins !== 'undefined') anonTorRotateMins.disabled = isDisabled;
  if (typeof anonTorControlPort !== 'undefined') anonTorControlPort.disabled = isDisabled;
  if (typeof anonTorHashedPassword !== 'undefined') anonTorHashedPassword.disabled = isDisabled;
  if (typeof anonTorRotateNow !== 'undefined') anonTorRotateNow.disabled = isDisabled;
}

// Disable jitter-max input when both jitter fields are 0
function updateJitterMaxDisabled() {
  // nothing to disable anymore — both fields are always editable
}

// Apply theme based on setting
function applyTheme(themeSetting) {
  if (themeSetting === 'auto') {
    // Use browser preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      root.classList.add('light-mode');
    } else {
      root.classList.remove('light-mode');
    }
  } else if (themeSetting === 'light') {
    root.classList.add('light-mode');
  } else {
    root.classList.remove('light-mode');
  }

  // Update theme toggle icon rotation
  updateThemeToggleIcon(themeSetting);
}

function compareVersionStrings(a, b) {
  if (!a || !b) return 0;
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  const length = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < length; i++) {
    const va = Number.isFinite(partsA[i]) ? partsA[i] : 0;
    const vb = Number.isFinite(partsB[i]) ? partsB[i] : 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

async function initVersionCheck() {
  const defaultAppVersion = '0.0.0';
  let appVersion = defaultAppVersion;
  try {
    appVersion = await window.electronAPI?.getAppVersion?.() || defaultAppVersion;
  } catch (err) {
    console.error('Unable to get app version from Electron API:', err);
  }

  if (appVersionEl) {
    appVersionEl.textContent = `v${appVersion}`;
  }

  try {
    const result = await window.electronAPI?.checkForUpdates?.();

    if (result?.noReleases) {
      console.log('Update check: no published GitHub releases available.');
      if (updateBtn) {
        updateBtn.classList.toggle('active', false);
      }
      console.log('Current local app version:', appVersion);
      console.log('Remote update version: none');
      return { local: appVersion, updateAvailable: false, remoteVersion: null };
    }
    if (result?.error) {
      console.error('Update check failed:', result.message);
      console.log('Current local app version:', appVersion);
      console.log('Remote update version: none');
      return { local: appVersion, updateAvailable: false, remoteVersion: null };
    }

    const remoteVersion = result?.remoteVersion || result?.updateInfo?.version || null;
    // Strip 'v' prefix from remote version if present
    const cleanRemoteVersion = remoteVersion ? remoteVersion.replace(/^v/, '') : null;
    const versionComparison = cleanRemoteVersion ? compareVersionStrings(cleanRemoteVersion, appVersion) : 0;
    const isUpdateAvailable = versionComparison === 1;
    if (updateBtn) {
      if (isUpdateAvailable && remoteVersion) {
        updateBtn.innerHTML = updateBtn.innerHTML + ` ${remoteVersion}`;
      }
      updateBtn.classList.toggle('active', isUpdateAvailable);
    }

    return { local: appVersion, updateAvailable: isUpdateAvailable, remoteVersion };
  } catch (err) {
    console.error('Failed to check updates:', err);
    console.log('Current local app version:', appVersion);
    console.log('Remote update version: none');
    return { local: appVersion, updateAvailable: false, remoteVersion: null };
  }
}

let currentUpdateProgress = null;

function formatUpdateProgress(info) {
  if (info && typeof info.percent === 'number') {
    return `Downloading ${Math.round(info.percent)}%`;
  }
  return 'Downloading...';
}

async function startUpdateRoutine() {
  console.log('Update routine started.');
  if (!updateBtn?.classList.contains('active')) {
    console.log('No update available; aborting download.');
    return;
  }

  const loadingOverlay = document.getElementById('app-loading-overlay');
  const loadingStatus = document.getElementById('app-loading-status');
  const loadingDetail = document.getElementById('app-loading-detail');
  if (loadingOverlay) {
    loadingOverlay.classList.remove('fade-out');
  }
  if (loadingStatus) {
    loadingStatus.textContent = 'Updating';
  }
  if (loadingDetail) {
    loadingDetail.textContent = 'Downloading and installing patch...';
  }

  if (updateBtn) {
    updateBtn.disabled = true;
  }

  try {
    const result = await window.electronAPI?.downloadUpdate?.();
    if (result?.error) {
      console.error('Download update failed:', result.message);
      return;
    }
    console.log('Update download started; wait for download completion event.');
  } catch (err) {
    console.error('Error starting update download:', err);
  } finally {
    if (updateBtn) {
      updateBtn.disabled = false;
    }
  }
}

if (window.electronAPI?.onUpdateProgress) {
  window.electronAPI.onUpdateProgress((event, info) => {
    const loadingDetail = document.getElementById('app-loading-detail');
    if (!loadingDetail) return;
    if (info && typeof info.percent === 'number') {
      currentUpdateProgress = Math.round(info.percent);
      loadingDetail.textContent = `Downloading ${currentUpdateProgress}%`;
    } else {
      loadingDetail.textContent = 'Downloading...';
    }
  });
}

if (updateBtn) {
  updateBtn.addEventListener('click', async () => {
    await startUpdateRoutine();
  });
}

// Update theme toggle icon rotation
function updateThemeToggleIcon(themeSetting) {
  // No-op: CSS handles rotation via .light-mode, but this can be used for future logic if needed
}
// Handle theme selection change
themeSelect.addEventListener('change', () => {
  const selectedTheme = themeSelect.value;
  localStorage.setItem('theme', selectedTheme);
  applyTheme(selectedTheme);
  // Keep toggle button in sync
  updateThemeToggleIcon(selectedTheme);
});

// Handle theme toggle button click
if (themeToggleBtn) {
  themeToggleBtn.addEventListener('click', () => {
    // Toggle between dark and light
    let currentTheme = localStorage.getItem('theme') || 'dark';
    let newTheme = (currentTheme === 'light') ? 'dark' : 'light';
    localStorage.setItem('theme', newTheme);
    themeSelect.value = newTheme;
    applyTheme(newTheme);
    updateThemeToggleIcon(newTheme);
  });
}
// Handle proxy settings changes
proxyActive.addEventListener('change', () => {
  updateProxyFieldsDisabled();
  saveProxySettings();
});

// Initialize global blacklist tags from localStorage so that
// booru browser code can filter immediately on page load.
window.globalBlacklistTags = JSON.parse(localStorage.getItem('globalBlacklistTags') || '[]');
// populate textarea if present (in case settings tab opened before session load)
const initBlacklistInput = document.getElementById('blacklist-tags-input');
if (initBlacklistInput) {
  initBlacklistInput.value = window.globalBlacklistTags.join(' ');
}

// Save blacklist tags helper (keeps localStorage and triggers session save).
function updateGlobalBlacklistTags(tagsArray) {
  window.globalBlacklistTags = tagsArray || [];
  localStorage.setItem('globalBlacklistTags', JSON.stringify(window.globalBlacklistTags));
  debouncedSettingsSave();
}

proxyType.addEventListener('change', saveProxySettings);
proxyHost.addEventListener('input', saveProxySettings);
proxyPort.addEventListener('input', saveProxySettings);
proxyUser.addEventListener('input', saveProxySettings);
proxyPassword.addEventListener('input', saveProxySettings);

// Anonymity settings event listeners
anonUaRotation.addEventListener('change', saveProxySettings);
anonJitterMin.addEventListener('input', saveProxySettings);
anonJitterMax.addEventListener('input', saveProxySettings);
anonTorRotateCount.addEventListener('input', saveProxySettings);
anonTorRotateMins.addEventListener('input', saveProxySettings);
anonTorControlPort.addEventListener('input', saveProxySettings);
anonTorHashedPassword.addEventListener('input', saveProxySettings);

// Update status text to show current control port
function updateTorStatusText() {
  const controlPort = parseInt(anonTorControlPort.value) || 9051;
  anonTorStatus.textContent = `Sends SIGNAL NEWNYM to Tor control port ${controlPort}`;
}

anonTorRotateNow.addEventListener('click', async () => {
  anonTorRotateNow.disabled = true;
  anonTorStatus.textContent = 'Rotating…';
  try {
    const res = await fetch('http://localhost:3001/api/rotate-circuit', { method: 'POST' });
    const data = await res.json();
    anonTorStatus.textContent = data.ok ? '✓ Circuit rotated' : ('⚠ ' + (data.message || 'Failed'));
  } catch (e) {
    anonTorStatus.textContent = '⚠ Server unreachable';
  }
  setTimeout(() => {
    anonTorStatus.textContent = 'Sends SIGNAL NEWNYM to Tor control port';
    anonTorRotateNow.disabled = false;
  }, 3000);
});

// Handle settings button click
settingsBtn.addEventListener('click', () => {
  const settingsTab = document.querySelector('[data-tab="settings"]');
  if (settingsTab) {
    settingsTab.click();
  }
});

// Proxy status button
const proxyStatusBtn = document.getElementById('proxy-status-btn');

// Server console elements
const consoleContent = document.getElementById('console-content');

const pendingConsoleLines = [];
let consoleUpdateScheduled = false;
const MAX_CONSOLE_LINES = 500;

// Append a line to the server console pane
function appendConsoleLine(line) {
  if (!consoleContent) return;
  if (pendingConsoleLines.length >= MAX_CONSOLE_LINES) {
    pendingConsoleLines.shift();
  }
  pendingConsoleLines.push(line);
  if (!consoleUpdateScheduled) {
    consoleUpdateScheduled = true;
    setTimeout(flushPendingConsoleLines, 100);
  }
}

function flushPendingConsoleLines() {
  consoleUpdateScheduled = false;
  if (!consoleContent || pendingConsoleLines.length === 0) return;

  const fragment = document.createDocumentFragment();
  while (pendingConsoleLines.length) {
    let line = pendingConsoleLines.shift();
    const p = document.createElement('p');

    // if this line looks like a continuation (starts with whitespace), copy
    // the high‑severity class from the previous entry so stack traces stay
    // colored
    if (/^[ \t]/.test(line)) {
      const last = fragment.lastElementChild || consoleContent.lastElementChild;
      if (last) {
        if (last.classList.contains('warn')) p.classList.add('warn');
        if (last.classList.contains('error')) p.classList.add('error');
      }
    }

    // style according to prefix
    if (line.startsWith('[WARN]')) {
      p.classList.add('warn');
      line = line.slice(6).trim();
    } else if (line.startsWith('[ERROR]')) {
      p.classList.add('error');
      line = line.slice(7).trim();
    }

    p.textContent = line;
    fragment.appendChild(p);
  }

  consoleContent.appendChild(fragment);

  if (consoleContent.offsetParent !== null) {
    consoleContent.scrollTop = consoleContent.scrollHeight;
    const lastLog = consoleContent.lastElementChild;
    if (lastLog) {
      lastLog.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
    }
  }
}

// Initialize SSE connection for server logs
function initServerConsole() {
  if (!consoleContent) return;
  try {
    const source = new EventSource('http://localhost:3001/api/server-logs');
    source.onmessage = e => {
      appendConsoleLine(e.data);
      if (e.data.includes('Puppeteer fallback also failed: Cloudflare or other HTML block page returned even via Puppeteer')) {
        showToast('Puppeteer fallback also failed — update the cookie setting on the source and try again.', 'error');
      }
    };
    // Listen for circuit-rotated notifications from the server
    source.addEventListener('circuit-rotated', () => {
      showCircuitSpinner();
    });
    source.onerror = err => {
      console.error('Server log stream error', err);
      showToast('Lost connection to server logs', 'error');
      source.close();
    };
  } catch (e) {
    console.error('Failed to open server log stream', e);
    showToast('Failed to connect to server logs: ' + (e.message || e), 'error');
  }
}


// Check proxy connectivity
async function checkProxyConnectivity() {
  const proxySettings = localStorage.getItem('proxySettings');
  if (!proxySettings) {
    proxyStatusBtn.style.display = 'none';
    return;
  }

  try {
    const settings = JSON.parse(proxySettings);
    if (!settings.host || !settings.port) {
      proxyStatusBtn.style.display = 'none';
      return;
    }

    // Try to connect to the proxy
    const testUrl = `http://localhost:3001/api/test-proxy`;
    const response = await fetch(testUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });

    if (!response.ok) {
      proxyStatusBtn.style.display = 'none';
      return;
    }

    const data = await response.json();
    const isConnected = data.available === true;
    // Use the current checkbox state, not the stored state
    updateProxyStatusButton(isConnected, proxyActive.checked);
  } catch (error) {
    localServerUnavailableUntil = Date.now() + LOCAL_SERVER_ERROR_COOLDOWN_MS;
    proxyStatusBtn.style.display = 'none';
  }
}

function updateProxyStatusButton(isConnected, isActive) {
  if (isConnected) {
    // Proxy is working
    proxyStatusBtn.style.display = 'flex';
    if (isActive) {
      proxyStatusBtn.classList.add('active');
      proxyStatusBtn.style.color = 'var(--success)';
    } else {
      proxyStatusBtn.classList.remove('active');
      proxyStatusBtn.style.color = 'var(--text-secondary)';
    }
  } else if (isActive) {
    // Proxy is NOT working but enabled - show in red
    proxyStatusBtn.style.display = 'flex';
    proxyStatusBtn.classList.remove('active');
    proxyStatusBtn.style.color = '#ff6b6b';
  } else {
    // Proxy is not working and not enabled - hide
    proxyStatusBtn.style.display = 'none';
  }
}

// Show a spinning indicator on the proxy button for 2 seconds (circuit rotating)
let _circuitSpinnerTimeout = null;
function showCircuitSpinner() {
  const icon = proxyStatusBtn.querySelector('i');
  if (!icon) return;
  // Save current classes once; successive calls just reset the timer
  if (!proxyStatusBtn.dataset.savedIconClass) {
    proxyStatusBtn.dataset.savedIconClass = icon.className;
  }
  icon.className = 'fas fa-circle-notch fa-spin';
  if (_circuitSpinnerTimeout) clearTimeout(_circuitSpinnerTimeout);
  _circuitSpinnerTimeout = setTimeout(() => {
    icon.className = proxyStatusBtn.dataset.savedIconClass || 'fa-solid fa-shield-halved';
    delete proxyStatusBtn.dataset.savedIconClass;
    _circuitSpinnerTimeout = null;
  }, 2000);
}

// Toggle proxy active state
proxyStatusBtn.addEventListener('click', () => {
  proxyActive.checked = !proxyActive.checked;
  updateProxyFieldsDisabled();
  saveProxySettings();
  
  // Update button appearance immediately
  const settings = JSON.parse(localStorage.getItem('proxySettings') || '{}');
  updateProxyStatusButton(true, proxyActive.checked);
});

// Right-click context menu on proxy status button
(function () {
  const menu = document.createElement('div');
  menu.id = 'proxy-context-menu';
  menu.className = 'proxy-context-menu';
  menu.innerHTML = `
    <button class="proxy-context-item" id="ctx-rotate-circuit"><i class="fas fa-arrows-rotate"></i> New Tor circuit</button>
    <div class="circuit-divider"></div>
    <div id="ctx-circuit-display" class="circuit-display">
      <div class="circuit-nodes" id="ctx-circuit-nodes">
        <span class="circuit-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</span>
      </div>
    </div>
  `;
  document.body.appendChild(menu);

  async function loadCurrentCircuit() {
    try {
      const response = await fetch('http://localhost:3001/api/tor-test/circuit-info');
      const data = await response.json();
      const nodesContainer = document.getElementById('ctx-circuit-nodes');
      
      if (data.ok && data.nodes && data.nodes.length > 0) {
        // Extract fingerprints and query Onionoo for country data
        const countryMap = {};
        
        // Fetch country data from Onionoo API (same format as test page)
        try {
          const fpList = data.nodes.map(n => n.id.toUpperCase()).join(',');
          const onionooRes = await fetch(`https://onionoo.torproject.org/details?fields=fingerprint,country&lookup=${fpList}`);
          
          if (onionooRes.ok) {
            const onionooData = await onionooRes.json();
            
            if (onionooData.relays && onionooData.relays.length > 0) {
              onionooData.relays.forEach(relay => {
                countryMap[relay.fingerprint.toUpperCase()] = (relay.country || '??').toUpperCase();
              });
            }
          }
        } catch (e) {
          // Fallback if Onionoo fails
        }
        
        // Build country tag display
        const countryCodes = data.nodes.map((node) => {
          const country = countryMap[node.id.toUpperCase()] || '??';
          return `<span class="country-tag">${country}</span>`;
        }).join('');
        
        nodesContainer.innerHTML = countryCodes || '<span class="circuit-loading">No circuit</span>';
      } else {
        nodesContainer.innerHTML = '<span class="circuit-loading">No circuit</span>';
      }
    } catch (error) {
      document.getElementById('ctx-circuit-nodes').innerHTML = '<span class="circuit-loading">Error loading</span>';
    }
  }

  function closeMenu() {
    menu.classList.remove('visible');
  }

  function positionMenuWithinViewport(clientX, clientY) {
    // First, make visible temporarily to get dimensions
    menu.classList.add('visible');
    const rect = menu.getBoundingClientRect();
    const menuWidth = rect.width;
    const menuHeight = rect.height;
    const padding = 10; // Padding from screen edges
    
    let left = clientX;
    let top = clientY;
    
    // Adjust horizontal position if menu goes off-screen to the right
    if (clientX + menuWidth + padding > window.innerWidth) {
      left = Math.max(padding, window.innerWidth - menuWidth - padding);
    }
    
    // Adjust vertical position if menu goes off-screen to the bottom
    if (clientY + menuHeight + padding > window.innerHeight) {
      top = Math.max(padding, window.innerHeight - menuHeight - padding);
    }
    
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  }

  proxyStatusBtn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    loadCurrentCircuit();
    positionMenuWithinViewport(e.clientX, e.clientY);
  });

  document.getElementById('ctx-rotate-circuit').addEventListener('click', async () => {
    const nodesContainer = document.getElementById('ctx-circuit-nodes');
    nodesContainer.innerHTML = '<span class="circuit-loading"><i class="fas fa-spinner fa-spin"></i> Creating new circuit...</span>';
    
    try {
      await fetch('http://localhost:3001/api/rotate-circuit', { method: 'POST' });
      
      // Wait a bit for TOR to build the new circuit
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Reload and display the new circuit
      await loadCurrentCircuit();
    } catch (e) {
      nodesContainer.innerHTML = '<span class="circuit-loading">Error</span>';
    }
  });

  document.addEventListener('click', closeMenu);
  document.addEventListener('contextmenu', (e) => {
    if (e.target !== proxyStatusBtn && !proxyStatusBtn.contains(e.target)) closeMenu();
  });
}());

// Check proxy connectivity every 5 seconds
setInterval(checkProxyConnectivity, 5000);

// Initial check
checkProxyConnectivity();

// start receiving server log updates
initServerConsole();

// Lightbox modal elements
const lightboxModal = document.getElementById('lightbox-modal');
const lightboxImage = document.getElementById('lightbox-image');
const lightboxImageFade = document.getElementById('lightbox-image-fade');
const lightboxBackground = lightboxModal.querySelector('.lightbox-background');
const leftArrowLightbox = lightboxModal.querySelector('.left-arrow-lightbox');
const rightArrowLightbox = lightboxModal.querySelector('.right-arrow-lightbox');

let tallLightboxKeyframesStyle = null;

function ensureTallLightboxKeyframesStyle() {
  if (!tallLightboxKeyframesStyle) {
    tallLightboxKeyframesStyle = document.createElement('style');
    tallLightboxKeyframesStyle.id = 'tall-lightbox-keyframes';
    document.head.appendChild(tallLightboxKeyframesStyle);
  }
}

function updateTallLightboxKeyframes(scrollTime) {
  const totalDuration = scrollTime + 8;
  const scrollPct = (scrollTime / totalDuration) * 100;
  ensureTallLightboxKeyframesStyle();
  tallLightboxKeyframesStyle.textContent = `@keyframes tallImageScroll {\n  0% { transform: translateX(-50%) translateY(0); }\n  ${scrollPct}% { transform: translateX(-50%) translateY(calc(min(0px, 90vh - 100%))); }\n  99.999% { transform: translateX(-50%) translateY(calc(min(0px, 90vh - 100%))); }\n  100% { transform: translateX(-50%) translateY(0); }\n}`;
}

function stopTallLightboxScroll() {
  lightboxImage.classList.remove('tall-scroll');
  lightboxImage.style.removeProperty('--tall-scroll-duration');
}

function startTallLightboxScroll() {
  if (!lightboxImage.classList.contains('tall') || !lightboxModal.classList.contains('active')) return;
  const height = lightboxImage.offsetHeight || lightboxImage.naturalHeight || 1000;
  const scrollTime = Math.max(1, height / 100 * tallImageScrollSpeedMultiplier); // per 100px, minimum 1s
  updateTallLightboxKeyframes(scrollTime);
  const totalDuration = scrollTime + 4;
  lightboxImage.style.setProperty('--tall-scroll-duration', `${totalDuration}s`);
  lightboxImage.classList.add('tall-scroll');
}

let slideshowTimer = null;

function clearSlideshowTimer() {
  if (slideshowTimer) {
    clearTimeout(slideshowTimer);
    clearInterval(slideshowTimer);
    slideshowTimer = null;
  }
}

function getTallLightboxAutoplayDuration() {
  const height = lightboxImage.offsetHeight || lightboxImage.naturalHeight || 1000;
  const scrollTime = Math.max(1, height / 100 * tallImageScrollSpeedMultiplier);
  return scrollTime + 4;
}

function scheduleSlideshowAdvance(delaySeconds) {
  clearSlideshowTimer();
  if (!slideshowActive) return;
  slideshowTimer = setTimeout(() => {
    nextLightboxImage();
    if (LightboxIndex < LightboxImages.length - 1) {
      startSlideshow();
    } else {
      stopSlideshow();
    }
  }, delaySeconds * 1000);
}

// Tab switching
const navTabs = document.querySelectorAll('.nav-tab');
const tabContents = document.querySelectorAll('.tab-content');

navTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.dataset.tab;
    const previousTab = document.querySelector('.nav-tab.active')?.dataset.tab;
    
    // Log when leaving settings tab
    if (previousTab === 'settings') {
      window.updateJustifiedGalleries();
    }
    
    // Clean up when leaving booru tab to prevent memory leaks
    if (previousTab === 'booru' && targetTab !== 'booru') {
      if (typeof window.booruGalleryCleanup !== 'undefined' && window.booruGalleryCleanup) {
        window.booruGalleryCleanup.cleanup();
      }
    }
    
    navTabs.forEach(t => t.classList.remove('active'));
    tabContents.forEach(tc => tc.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`${targetTab}-tab`).classList.add('active');
    if (targetTab === 'configs') loadConfigsList();
    
    // Remove downloads search handler when switching tabs
    const searchInput = document.getElementById('search-filter-input');
    if (searchInput && searchInput._downloadsSearchHandler) {
      searchInput.removeEventListener('input', searchInput._downloadsSearchHandler);
      delete searchInput._downloadsSearchHandler;
    }
    
    // Check SD status when switching to generator tab
    if (targetTab === 'generator') {
      initSDCheck();
    }

    // If a booru sub-tab switch was deferred at startup (because the user
    // restored into a different main tab), run it now so the gallery renders.
    if (targetTab === 'booru' && window._pendingBooruTabId) {
      const pendingId = window._pendingBooruTabId;
      window._pendingBooruTabId = null;
      setTimeout(() => {
        if (typeof window.switchToTab === 'function') window.switchToTab(pendingId);
      }, 50);
    }
    
    // Save active tab
    debouncedSettingsSave();
  });
});

// Config Editor
const configItems = document.getElementById('config-items');
const configNameInput = document.getElementById('config-name');
const configEditor = document.getElementById('config-editor-textarea');
const saveConfigBtn = document.getElementById('save-config-btn');
const deleteConfigBtn = document.getElementById('delete-config-btn');
const addConfigBtn = document.getElementById('add-config-btn');

let currentConfigName = '';
let allConfigs = [];
let usedFilenames = new Set();
let supportToastSuccessCount = 0;

// Toast notification function
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Confirm toast with Yes/No buttons (does not auto-dismiss)
function showConfirmToast(message, onYes, onNo) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast toast-warning toast-confirm';
  toast.innerHTML = `
    <div class="toast-confirm-message">${message}</div>
    <div class="toast-confirm-buttons">
      <button class="toast-confirm-btn toast-btn-yes">Yes</button>
      <button class="toast-confirm-btn toast-btn-no">No</button>
    </div>
  `;
  
  const yesBtn = toast.querySelector('.toast-btn-yes');
  const noBtn = toast.querySelector('.toast-btn-no');
  
  const dismiss = () => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  };
  
  yesBtn.addEventListener('click', () => {
    dismiss();
    if (onYes) onYes();
  });
  
  noBtn.addEventListener('click', () => {
    dismiss();
    if (onNo) onNo();
  });
  
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
}

function showSupportToast() {
  if (!supportToastEnabled || !supportToastEnabled.checked) return;
  const container = document.getElementById('toast-container');
  if (container.querySelector('.toast-support')) return;
  const toast = document.createElement('div');
  toast.className = 'toast toast-info toast-support';
  toast.innerHTML = `
    <button type="button" class="toast-close" aria-label="Close"><i class="fa-solid fa-circle-xmark"></i></button>
    <div class="toast-support-main">
      <div class="toast-support-text">
        <div class="toast-support-caption">Enjoying <span style="background:linear-gradient(135deg,var(--accent),var(--accent-secondary));-webkit-background-clip: text;-webkit-text-fill-color:transparent;">Booru Studio</span> ?</div>
        <div class="toast-support-body">I’m a solo creator keeping this app alive. If you can, please support me with a small contribution - it means the world and keeps updates coming. <b>Thank you :)</b>.</div>
        <button class="toast-support-btn" onclick="window.open('https://buymeacoffee.com/saltedshroom', '_blank')"><i class="fa-solid fa-angles-right"></i> Support me</button>
        </div>
      <a href="https://buymeacoffee.com/saltedshroom" target="_blank" rel="noopener noreferrer" class="toast-support-image-link">
        <img src="/src/assets/supportme.gif" alt="Support me">
      </a>
    </div>
  `;
  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  });
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
}

// JSON syntax highlighter
const jsonHighlight = document.getElementById('json-highlight');

function highlightJSON() {
  const json = configEditor.value;
  let highlighted = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/(".*?")(?=:)/g, '<span class="json-key">$1</span>')
    .replace(/: ?(".*?")/g, ': <span class="json-string">$1</span>')
    .replace(/: ?(-?\d+\.?\d*)/g, ': <span class="json-number">$1</span>')
    .replace(/: ?(true|false)/g, ': <span class="json-boolean">$1</span>')
    .replace(/: ?(null)/g, ': <span class="json-null">$1</span>');
  jsonHighlight.innerHTML = highlighted;
  syncScroll();
}

function syncScroll() {
  jsonHighlight.scrollTop = configEditor.scrollTop;
  jsonHighlight.scrollLeft = configEditor.scrollLeft;
}

configEditor.addEventListener('input', highlightJSON);
configEditor.addEventListener('scroll', syncScroll);

// Override settings elements
const overrideCheckpoint = document.getElementById('override-checkpoint');
const checkpointSelect = document.getElementById('checkpoint-select');
const overrideResolution = document.getElementById('override-resolution');
const overrideWidth = document.getElementById('override-width');
const overrideHeight = document.getElementById('override-height');
const overrideSteps = document.getElementById('override-steps');
const stepsInput = document.getElementById('steps-input');
const overrideCfg = document.getElementById('override-cfg');
const cfgInput = document.getElementById('cfg-input');
const overrideSeed = document.getElementById('override-seed');
const seedInput = document.getElementById('seed-input');
const overrideHighres = document.getElementById('override-highres');
const highresSlider = document.getElementById('highres-slider');
const highresValue = document.getElementById('highres-value');
const overridePrompt = document.getElementById('override-prompt');
const customPrompt = document.getElementById('custom-prompt');
const overrideNegative = document.getElementById('override-negative');
const customNegative = document.getElementById('custom-negative');

// Toggle enable/disable for override inputs
overrideCheckpoint.addEventListener('change', () => checkpointSelect.disabled = !overrideCheckpoint.checked);
overrideResolution.addEventListener('change', () => {
  overrideWidth.disabled = !overrideResolution.checked;
  overrideHeight.disabled = !overrideResolution.checked;
});
overrideSteps.addEventListener('change', () => stepsInput.disabled = !overrideSteps.checked);
overrideCfg.addEventListener('change', () => cfgInput.disabled = !overrideCfg.checked);
overrideSeed.addEventListener('change', () => seedInput.disabled = !overrideSeed.checked);
overrideHighres.addEventListener('change', () => highresSlider.disabled = !overrideHighres.checked);
overridePrompt.addEventListener('change', () => customPrompt.disabled = !overridePrompt.checked);
overrideNegative.addEventListener('change', () => customNegative.disabled = !overrideNegative.checked);

// Update highres value display
highresSlider.addEventListener('input', () => {
  highresValue.textContent = highresSlider.value + 'x';
});

let generating = false;
let imageList = [];
let promptDetails = []; // Store prompt details for each image
let currentIndex = -1;
let jsonConfigs = [];
let logs = [];
let lastCheckpoint = null; // Track the last used checkpoint

// Fetch JSON configs from customConfigs folder
async function loadJsonConfigs() {
  const res = await fetch('http://localhost:3001/list-configs');
  const configs = await res.json();
  jsonConfigs = configs;
  jsonConfigs.forEach(cfg => {
    const opt = document.createElement('option');
    opt.value = cfg;
    opt.innerText = cfg;
    jsonDropdown.appendChild(opt);
  });
}

// ── Startup loading overlay helpers ──────────────────────────────────────────
// Async: updates the text then yields via rAF + setTimeout so the browser is
// guaranteed to have actually painted the new text before we continue.
async function setLoadingStatus(text, detail) {
  const el = document.getElementById('app-loading-status');
  if (el) el.textContent = text;
  const det = document.getElementById('app-loading-detail');
  if (det) det.textContent = detail ?? '';
  // rAF tells the browser to schedule a paint; the nested setTimeout fires
  // after that paint has been committed, giving the compositor time to show it.
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 32)));
}
// Expose globally so loadSession (defined later) can push status during heavy work
window._setLoadingStatus = setLoadingStatus;

const countContainer = document.getElementById('app-loading-download-count');
async function updateAppLoadingDownloadCount() {
  if (!countContainer) return;

  let count = 0;
  try {
    if (typeof dbStore !== 'undefined' && dbStore && typeof dbStore.getAllDownloadedPosts === 'function') {
      const saved = await dbStore.getAllDownloadedPosts();
      if (Array.isArray(saved)) {
        count = saved.length;
      } else if (typeof saved === 'number') {
        count = saved;
      } else if (saved && typeof saved.length === 'number') {
        count = saved.length;
      }
    }
  } catch (err) {
    console.warn('Could not load download count for startup badge:', err);
  }

  const digits = String(count).split('');
  if (digits.length === 0) digits.push('0');

  const existingImages = Array.from(countContainer.querySelectorAll('img'));
  const targetLength = digits.length;

  for (let i = 0; i < targetLength; i++) {
    const digit = digits[i];
    const expectedSrc = `/src/assets/counter/${digit}.gif`;

    if (i < existingImages.length) {
      const img = existingImages[i];
      if (img.alt !== digit || img.src !== expectedSrc) {
        img.src = expectedSrc;
        img.alt = digit;
      }
    } else {
      const img = document.createElement('img');
      img.src = expectedSrc;
      img.alt = digit;
      img.className = 'app-loading-download-digit';
      img.loading = 'lazy';
      countContainer.appendChild(img);
    }
  }

  for (let i = existingImages.length - 1; i >= targetLength; i--) {
    existingImages[i].remove();
  }
}

window.updateAppLoadingDownloadCount = updateAppLoadingDownloadCount;

function hideLoadingOverlay() {
  const overlay = document.getElementById('app-loading-overlay');
  if (!overlay) return;
  overlay.classList.add('fade-out');
}

// Initial load - make async to prevent tab switching flash
(async () => {
  await updateAppLoadingDownloadCount();
  await setLoadingStatus('Starting up…', 'Initializing application…');
  await initializeSettings();
  await initVersionCheck();
  await loadSession();
  await setLoadingStatus('Loading credentials…', 'Applying saved API keys and booru source credentials…');
  if (window.loadApiCredentials) {
    window.loadApiCredentials();
  }
  await setLoadingStatus('Loading configs…', 'Fetching config presets and available checkpoints…');
  await Promise.allSettled([loadJsonConfigs(), loadCheckpoints()]);
  await setLoadingStatus('Loading gallery…', 'Setting up booru browser and tabs…');
  if (window._initBooruTabs) await window._initBooruTabs();
  hideLoadingOverlay();
  countContainer.classList.add('loaded');
  
  // Setup booru source change tracking
  setupBooruSourceChangeTracking();
})();

// Track booru source changes and tab switches
function setupBooruSourceChangeTracking() {
  const booruSourceSelect = document.getElementById('booru-source-select');
  let previousTabSource = null;
  
  // Function to call when source changes
  function onSourceOrTabChange() {
    // Rotate TOR circuit when source changes
    try {
      fetch('http://localhost:3001/api/rotate-circuit', { method: 'POST' }).catch(() => {});
    } catch (e) {
      // Silent fail if server unreachable
    }
  }
  
  // Listen for direct source changes
  if (booruSourceSelect) {
    booruSourceSelect.addEventListener('change', () => {
      onSourceOrTabChange();
    });
  }
  
  // Override the switchToTab function to track source changes
  if (window._switchToTab) {
    // If the function was already assigned, store the original
    window._originalSwitchToTab = window._switchToTab;
  } else {
    // Check if switchToTab exists globally through booru-tabs.js
    // We'll need to patch it via a global hook
  }
  
  // Create a hook that booru-tabs.js can call
  window._onBooruTabSwitch = function(tabId, previousTabId) {
    // Get the current active tab from booru-tabs
    if (window.booruTabs) {
      const currentTab = window.booruTabs.find(t => t.id === tabId);
      const previousTab = window.booruTabs.find(t => t.id === previousTabId);
      
      if (currentTab && previousTab) {
        const currentSource = currentTab.state?.source;
        const previousSource = previousTab.state?.source;
        
        // Call if sources are different
        if (currentSource !== previousSource) {
          onSourceOrTabChange();
        }
      }
    }
  };
}

// Stable Diffusion loading check
const sdLoadingOverlay = document.getElementById('sd-loading-overlay');
const sdStatusText = document.getElementById('sd-status-text');

/*
async function checkSDStatus() {
  try {
    const res = await fetch('http://localhost:3001/check-sd-status');
    const data = await res.json();
    
    if (data.ready) {
      sdStatusText.textContent = 'Stable Diffusion is ready! ✓';
      setTimeout(() => {
        sdLoadingOverlay.classList.remove('active');
      }, 800);
      return true;
    } else {
      return false;
    }
  } catch (e) {
    return false;
  }
}

let sdCheckCount = 0;
const sdProgressSteps = document.getElementById('sd-progress-steps');

async function pollSDStatus() {
  sdCheckCount++;
  
  const messages = [
    'Initializing...',
    'Starting WebUI...',
    'Loading model weights...',
    'Applying optimizations...',
    'Almost ready...',
    'Please wait...'
  ];
  
  const messageIndex = Math.min(Math.floor(sdCheckCount / 3), messages.length - 1);
  sdStatusText.textContent = messages[messageIndex];
  
  // Update progress steps
  if (sdProgressSteps) {
    const steps = sdProgressSteps.querySelectorAll('.sd-step');
    steps.forEach((step, idx) => {
      if (idx <= messageIndex) {
        step.classList.add('active');
      } else {
        step.classList.remove('active');
      }
    });
  }
  
  const isReady = await checkSDStatus();
  
  if (!isReady && sdCheckCount < 120) { // Check for up to 2 minutes
    setTimeout(pollSDStatus, 1000);
  } else if (!isReady) {
    sdStatusText.textContent = 'Taking longer than expected...';
    setTimeout(() => {
      sdLoadingOverlay.classList.remove('active');
    }, 2000);
  }
}

// Check if SD is already running before showing overlay
async function initSDCheck() {
  // Only check SD status if we're on the generator tab
  const savedTab = localStorage.getItem('activeTab') || 'booru';
  if (savedTab !== 'generator') {
    return; // Don't check SD if not on generator tab
  }
  
  const isReady = await checkSDStatus();
  if (!isReady) {
    // SD is not ready, show overlay and start polling
    sdLoadingOverlay.classList.add('active');
    setTimeout(pollSDStatus, 2000);
  }
  // If SD is ready, overlay stays hidden (no active class)
}

// Start checking SD status
initSDCheck();
*/

async function checkSDStatus() {
  return false;
}

let sdCheckCount = 0;
const sdProgressSteps = document.getElementById('sd-progress-steps');

async function pollSDStatus() {
  // Stable Diffusion polling disabled.
  return false;
}

async function initSDCheck() {
  // Stable Diffusion support is disabled; skip status checks.
  return false;
}

// Start checking SD status (disabled)
initSDCheck();

// Load checkpoints from backend
async function loadCheckpoints() {
  try {
    const res = await fetch('http://localhost:3001/get-checkpoints');
    const checkpoints = await res.json();
    checkpointSelect.innerHTML = '';
    checkpoints.forEach(cp => {
      const opt = document.createElement('option');
      opt.value = cp;
      opt.textContent = cp;
      checkpointSelect.appendChild(opt);
    });
  } catch(e) {
    console.error('Failed to load checkpoints:', e);
    showToast('Failed to load checkpoints: ' + (e.message || e), 'error');
  }
}

// Clear log button
document.getElementById('clear-log-btn').addEventListener('click', clearLog);

// Debounced save for settings changes
let settingsSaveTimeout;
function debouncedSettingsSave() {
  clearTimeout(settingsSaveTimeout);
  settingsSaveTimeout = setTimeout(saveSession, 300);
}

// Debounced save for image navigation - saves after user stops navigating
let navigationSaveTimeout;
function debouncedNavigationSave() {
  clearTimeout(navigationSaveTimeout);
  navigationSaveTimeout = setTimeout(saveSession, 500);
}

// Add listeners to save settings when they change
toggle.addEventListener('click', debouncedSettingsSave);
outputDirInput.addEventListener('input', debouncedSettingsSave);
jsonDropdown.addEventListener('change', debouncedSettingsSave);
overrideCheckpoint.addEventListener('change', debouncedSettingsSave);
checkpointSelect.addEventListener('change', debouncedSettingsSave);
overrideResolution.addEventListener('change', debouncedSettingsSave);
overrideWidth.addEventListener('input', debouncedSettingsSave);
overrideHeight.addEventListener('input', debouncedSettingsSave);
overrideSteps.addEventListener('change', debouncedSettingsSave);
stepsInput.addEventListener('input', debouncedSettingsSave);
overrideCfg.addEventListener('change', debouncedSettingsSave);
cfgInput.addEventListener('input', debouncedSettingsSave);
overrideSeed.addEventListener('change', debouncedSettingsSave);
seedInput.addEventListener('input', debouncedSettingsSave);
overrideHighres.addEventListener('change', debouncedSettingsSave);
highresSlider.addEventListener('input', debouncedSettingsSave);
overridePrompt.addEventListener('change', debouncedSettingsSave);
customPrompt.addEventListener('input', debouncedSettingsSave);
overrideNegative.addEventListener('change', debouncedSettingsSave);
customNegative.addEventListener('input', debouncedSettingsSave);

// Blacklist tags input listener
const blacklistTagsInput = document.getElementById('blacklist-tags-input');
if (blacklistTagsInput) {
  blacklistTagsInput.addEventListener('input', () => {
    const raw = blacklistTagsInput.value.trim();
    const tags = raw ? raw.split(/\s+/) : [];
    updateGlobalBlacklistTags(tags);

    // if a gallery is already loaded, immediately remove any posts matching
    // the new blacklist and re-render so the change is reflected promptly
    try {
      if (window.booruPosts && typeof filterBlacklistedPosts === 'function') {
        const before = window.booruPosts.length;
        window.booruPosts = filterBlacklistedPosts(window.booruPosts, window.globalBlacklistTags);
        const filteredOut = before - window.booruPosts.length;
        if (filteredOut > 0) {
          console.log(`[BLACKLIST] filtered out ${filteredOut} posts from current gallery`);
          showToast(`Filtered out ${filteredOut} blacklisted posts`, 'info');
          if (window.totalResultCount != null) {
            window.totalResultCount = Math.max(0, window.totalResultCount - filteredOut);
            if (typeof updateTotalCountDisplay === 'function') updateTotalCountDisplay();
          }
          if (typeof renderBooruGallery === 'function' && document.getElementById('booru-gallery')) {
            renderBooruGallery(window.booruPosts, false);
          }
        }
      }
    } catch (e) {
      console.warn('Error applying blacklist filter immediately:', e);
    }
  });
}

// HQ hover delay input
const hqHoverDelayInput = document.getElementById('hq-hover-delay-input');
const tallImageScrollSpeedMultiplierInput = document.getElementById('tall-image-scroll-speed-multiplier-input');
if (hqHoverDelayInput) {
  hqHoverDelayInput.addEventListener('input', () => {
    const v = parseInt(hqHoverDelayInput.value, 10);
    if (!isNaN(v)) {
      window.hqHoverDelay = Math.max(0, Math.min(2000, v));
    }
    debouncedSettingsSave();
  });
  window.hqHoverDelay = parseInt(hqHoverDelayInput.value, 10) || 150;
} else {
  window.hqHoverDelay = window.hqHoverDelay || 150;
}

if (tallImageScrollSpeedMultiplierInput) {
  tallImageScrollSpeedMultiplierInput.addEventListener('input', () => {
    const v = parseFloat(tallImageScrollSpeedMultiplierInput.value);
    if (!isNaN(v)) {
      tallImageScrollSpeedMultiplier = Math.max(0.1, Math.min(10, v));
    }
    debouncedSettingsSave();
  });
  tallImageScrollSpeedMultiplierInput.addEventListener('blur', () => {
    const v = parseFloat(tallImageScrollSpeedMultiplierInput.value);
    if (isNaN(v)) {
      tallImageScrollSpeedMultiplierInput.value = tallImageScrollSpeedMultiplier.toFixed(1);
      return;
    }
    tallImageScrollSpeedMultiplier = Math.max(0.1, Math.min(10, v));
    tallImageScrollSpeedMultiplierInput.value = tallImageScrollSpeedMultiplier.toFixed(1);
  });
  tallImageScrollSpeedMultiplier = parseFloat(tallImageScrollSpeedMultiplierInput.value) || 1.1;
} else {
  tallImageScrollSpeedMultiplier = tallImageScrollSpeedMultiplier || 1.1;
}

// Download concurrency input
const downloadConcurrencyInput = document.getElementById('download-concurrency-input');
if (downloadConcurrencyInput) {
  downloadConcurrencyInput.addEventListener('input', () => {
    const v = parseInt(downloadConcurrencyInput.value, 10) || 1;
    window.downloadConcurrency = Math.max(1, Math.min(10, v));
    downloadConcurrencyInput.value = window.downloadConcurrency;
    debouncedSettingsSave();
  });
  // initialize global
  window.downloadConcurrency = parseInt(downloadConcurrencyInput.value, 10) || 3;
} else {
  window.downloadConcurrency = window.downloadConcurrency || 3;
}

const imageLoadConcurrencyInput = document.getElementById('image-load-concurrency-input');
if (imageLoadConcurrencyInput) {
  imageLoadConcurrencyInput.addEventListener('input', () => {
    const v = parseInt(imageLoadConcurrencyInput.value, 10) || 1;
    window.imageLoadConcurrency = Math.max(1, Math.min(10, v));
    imageLoadConcurrencyInput.value = window.imageLoadConcurrency;
    debouncedSettingsSave();
  });
  window.imageLoadConcurrency = parseInt(imageLoadConcurrencyInput.value, 10) || 3;
} else {
  window.imageLoadConcurrency = window.imageLoadConcurrency || 3;
}

// Save session to backend
async function saveSession() {
  if (localServerUnavailableUntil > Date.now()) return;
  try {
    // Get active tab
    const activeTab = document.querySelector('.nav-tab.active');
    const activeTabName = activeTab ? activeTab.dataset.tab : 'generator';
    
    // Save active tab to localStorage immediately for instant restore on reload
    localStorage.setItem('activeTab', activeTabName);
    
    const settings = {
      imageList, 
      promptDetails, 
      logs, 
      currentIndex,
      activeTab: activeTabName,
      toggleState: toggle.classList.contains('active'),
      outputDir: outputDirInput.value,
      selectedConfig: jsonDropdown.value,
      overrideCheckpoint: overrideCheckpoint.checked,
      selectedCheckpoint: checkpointSelect.value,
      overrideResolution: overrideResolution.checked,
      overrideWidth: overrideWidth.value,
      overrideHeight: overrideHeight.value,
      overrideSteps: overrideSteps.checked,
      stepsValue: stepsInput.value,
      overrideCfg: overrideCfg.checked,
      cfgValue: cfgInput.value,
      overrideSeed: overrideSeed.checked,
      seedValue: seedInput.value,
      overrideHighres: overrideHighres.checked,
      highresValue: highresSlider.value,
      overridePrompt: overridePrompt.checked,
      customPromptValue: customPrompt.value,
      overrideNegative: overrideNegative.checked,
      customNegativeValue: customNegative.value,
      // global blacklist tags
      blacklistTags: window.globalBlacklistTags || [],
      // Booru browser settings
      booruSource: booruSourceSelect ? booruSourceSelect.value : null,
      booruSort: booruSortSelect ? booruSortSelect.value : 'hot',
      booruLimit: booruLimitInput ? booruLimitInput.value : '100',
      booruImageSize: currentImageSize,
      booruSearchFilter: searchFilterInput ? searchFilterInput.value : '',
      booruScrollPosition: booruContent ? booruContent.scrollTop : 0,
      supportToastEnabled: supportToastEnabled ? supportToastEnabled.checked : true,
      // booruLoadedPosts is owned by booru-tabs.js and saved via /api/db/tabs — not duplicated here
      slideshowInterval: slideshowIntervalInput ? slideshowIntervalInput.value : '3',
      slideshowFadeDuration: slideshowFadeDurationInput ? slideshowFadeDurationInput.value : '0.5',
      // API credentials (source-specific)
      booruApiCredentials: window.booruApiCredentials || {},
      downloadConcurrency: (document.getElementById('download-concurrency-input') && parseInt(document.getElementById('download-concurrency-input').value, 10)) || 3,
      imageLoadConcurrency: (document.getElementById('image-load-concurrency-input') && parseInt(document.getElementById('image-load-concurrency-input').value, 10)) || 3,
      hqHoverDelay: (document.getElementById('hq-hover-delay-input') && parseInt(document.getElementById('hq-hover-delay-input').value, 10)) ?? 150,
      tallImageScrollSpeedMultiplier: (document.getElementById('tall-image-scroll-speed-multiplier-input') && parseFloat(document.getElementById('tall-image-scroll-speed-multiplier-input').value)) || 1.1,
      downloadsSortByArtist: window.sessionSortByArtist || false
    };
    const response = await fetch('http://localhost:3001/save-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    if (!response.ok) {
      localServerUnavailableUntil = Date.now() + LOCAL_SERVER_ERROR_COOLDOWN_MS;
      return;
    }
  } catch(e) {
    localServerUnavailableUntil = Date.now() + LOCAL_SERVER_ERROR_COOLDOWN_MS;
    return;
  }
}

// Load session from backend
async function loadSession() {
  try {
    if (window._setLoadingStatus) await window._setLoadingStatus('Restoring session…', 'Connecting to local server…');
    const res = await fetch('http://localhost:3001/load-session');
    if (window._setLoadingStatus) await window._setLoadingStatus('Restoring session…', 'Parsing session data…');
    const session = await res.json();

    if (window._setLoadingStatus) await window._setLoadingStatus('Restoring session…', 'Applying tab layout and navigation state…');
    // Restore active tab
    if (session.activeTab) {
      navTabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(tc => tc.classList.remove('active'));
      const targetTab = document.querySelector(`[data-tab="${session.activeTab}"]`);
      if (targetTab) {
        targetTab.classList.add('active');
        document.getElementById(`${session.activeTab}-tab`).classList.add('active');
        if (session.activeTab === 'configs') loadConfigsList();
      }
    }
    
    // Restore user settings
    if (session.toggleState !== undefined) {
      if (session.toggleState) {
        toggle.classList.add('active');
      } else {
        toggle.classList.remove('active');
      }
    }
    if (session.outputDir) outputDirInput.value = session.outputDir;
    if (session.selectedConfig) jsonDropdown.value = session.selectedConfig;
    if (session.supportToastEnabled !== undefined && supportToastEnabled) {
      supportToastEnabled.checked = session.supportToastEnabled;
      localStorage.setItem('supportToastEnabled', supportToastEnabled.checked ? 'true' : 'false');
    }
    
    if (window._setLoadingStatus) await window._setLoadingStatus('Restoring session…', 'Restoring booru browser settings and search state…');
    // Restore Booru browser settings
    if (session.downloadsSortByArtist !== undefined) {
      window.sessionSortByArtist = session.downloadsSortByArtist;
      // If the button exists, update its state
      const sortArtistBtn = document.getElementById('downloads-sort-artist-btn');
      if (sortArtistBtn) {
        if (session.downloadsSortByArtist) sortArtistBtn.classList.add('btn-accent');
        else sortArtistBtn.classList.remove('btn-accent');
      }
    }
    if (session.booruSource && booruSourceSelect) {
      booruSourceSelect.value = session.booruSource;
      currentBooruSource = session.booruSource;
      if (typeof handleSourceChange === 'function') {
        handleSourceChange();
      }
    }
    if (session.booruSort && booruSortSelect) {
      booruSortSelect.value = session.booruSort;
    }
    if (session.booruLimit && booruLimitInput) {
      booruLimitInput.value = session.booruLimit;
    }
    if (session.booruImageSize && imageSizeSlider) {
      currentImageSize = parseInt(session.booruImageSize, 10) || 250;
      imageSizeSlider.value = currentImageSize;
      if (imageSizeValue) {
        imageSizeValue.textContent = `${currentImageSize}px`;
      }
    }
    if (session.booruSearchFilter !== undefined && searchFilterInput) {
      searchFilterInput.value = session.booruSearchFilter;
    }
    
    // Restore API credentials (source-specific)
    if (session.booruApiCredentials) {
      window.booruApiCredentials = session.booruApiCredentials;
    }
    
    // Restore slideshow interval
    if (session.slideshowInterval && slideshowIntervalInput) {
      slideshowIntervalInput.value = session.slideshowInterval;
    }
    // Restore slideshow fade duration
    if (session.slideshowFadeDuration !== undefined && slideshowFadeDurationInput) {
      slideshowFadeDurationInput.value = session.slideshowFadeDuration;
    }

    // Restore download concurrency
    if (session.downloadConcurrency !== undefined && document.getElementById('download-concurrency-input')) {
      document.getElementById('download-concurrency-input').value = session.downloadConcurrency;
      window.downloadConcurrency = parseInt(session.downloadConcurrency, 10) || 3;
    } else {
      window.downloadConcurrency = window.downloadConcurrency || 3;
    }
    if (session.imageLoadConcurrency !== undefined && document.getElementById('image-load-concurrency-input')) {
      document.getElementById('image-load-concurrency-input').value = session.imageLoadConcurrency;
      window.imageLoadConcurrency = parseInt(session.imageLoadConcurrency, 10) || 3;
    } else {
      window.imageLoadConcurrency = window.imageLoadConcurrency || 3;
    }
    // Restore HQ hover delay
    if (session.hqHoverDelay !== undefined && document.getElementById('hq-hover-delay-input')) {
      document.getElementById('hq-hover-delay-input').value = session.hqHoverDelay;
      window.hqHoverDelay = parseInt(session.hqHoverDelay, 10) ?? 150;
    } else {
      window.hqHoverDelay = window.hqHoverDelay || 150;
    }
    // Restore tall image scroll speed multiplier
    if (session.tallImageScrollSpeedMultiplier !== undefined && document.getElementById('tall-image-scroll-speed-multiplier-input')) {
      document.getElementById('tall-image-scroll-speed-multiplier-input').value = session.tallImageScrollSpeedMultiplier;
      tallImageScrollSpeedMultiplier = parseFloat(session.tallImageScrollSpeedMultiplier) || 1.1;
    } else {
      tallImageScrollSpeedMultiplier = tallImageScrollSpeedMultiplier || 1.1;
    }
    // Restore global blacklist tags
    if (session.blacklistTags && blacklistTagsInput) {
      blacklistTagsInput.value = session.blacklistTags.join(' ');
      window.globalBlacklistTags = session.blacklistTags.slice();
      // mirror into localStorage as well
      localStorage.setItem('globalBlacklistTags', JSON.stringify(window.globalBlacklistTags));
    } else {
      window.globalBlacklistTags = window.globalBlacklistTags || [];
    }
    
    if (window._setLoadingStatus) await window._setLoadingStatus('Restoring session…', 'Restoring generator overrides and settings…');
    // Restore override settings
    if (session.overrideCheckpoint !== undefined) {
      overrideCheckpoint.checked = session.overrideCheckpoint;
      checkpointSelect.disabled = !session.overrideCheckpoint;
      if (session.selectedCheckpoint) checkpointSelect.value = session.selectedCheckpoint;
    }

  // --- download toast helpers ---
  function createDownloadToast(key, title) {
    const container = document.getElementById('download-toast-container');
    const toast = document.createElement('div');
    toast.className = 'download-toast';
    toast.dataset.key = key;

    const top = document.createElement('div');
    top.className = 'dt-top';
    const ttitle = document.createElement('div');
    ttitle.className = 'dt-title';
    ttitle.textContent = title || 'Download';
    const status = document.createElement('div');
    status.className = 'dt-status';
    status.textContent = 'Queued';
    top.appendChild(ttitle);
    top.appendChild(status);

    const progressTrack = document.createElement('div');
    progressTrack.className = 'dt-progress-track';
    const progress = document.createElement('div');
    progress.className = 'dt-progress';
    progressTrack.appendChild(progress);

    const img = document.createElement('img');
    img.className = 'dt-preview';

    toast.appendChild(top);
    toast.appendChild(progressTrack);
    toast.appendChild(img);
    container.appendChild(toast);

    // show animation (match other toasts) — add .show after a short tick so CSS transition runs
    setTimeout(() => toast.classList.add('show'), 10);

    return {
      update(pct, st) {
        progress.style.width = Math.max(0, Math.min(100, pct)) + '%';
        if (st) status.textContent = st;
      },
      done(success, msg, imageUrl) {
        // update final state
        this.update(100, msg || (success ? 'Completed' : 'Failed'));
        // show downloaded image inside the toast on success
        if (success && imageUrl) {
          let removeDelay = setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
          }, 7000);

          img.src = getImageUrl(imageUrl);
          img.onload = () => {
            clearTimeout(removeDelay);
            removeDelay = null;
            img.classList.add('loaded');
            img.style.maxHeight = '200px';
            // keep visible longer when image is shown
            const delay = success && imageUrl ? 3000 : 2000;
            setTimeout(() => {
              toast.classList.remove('show');
              setTimeout(() => toast.remove(), 300);
            }, delay);
          }

          requestAnimationFrame(() => {
            //plaxeholder 
          });
        } else {
          // keep visible longer when image is shown
          const delay = success && imageUrl ? 4000 : 3000;
          setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
          }, delay);       
        }
        updateAppLoadingDownloadCount();
        if (success === true && supportToastEnabled && supportToastEnabled.checked) {
          supportToastSuccessCount += 1;
          if (supportToastSuccessCount >= 50) {
            supportToastSuccessCount = 0;
            showSupportToast();
          }
        }
      },
      remove() { toast.remove(); }
    };
  }
  window.createDownloadToast = createDownloadToast;
    if (session.overrideResolution !== undefined) {
      overrideResolution.checked = session.overrideResolution;
      overrideWidth.disabled = !session.overrideResolution;
      overrideHeight.disabled = !session.overrideResolution;
      if (session.overrideWidth) overrideWidth.value = session.overrideWidth;
      if (session.overrideHeight) overrideHeight.value = session.overrideHeight;
    }
    if (session.overrideSteps !== undefined) {
      overrideSteps.checked = session.overrideSteps;
      stepsInput.disabled = !session.overrideSteps;
      if (session.stepsValue) stepsInput.value = session.stepsValue;
    }
    if (session.overrideCfg !== undefined) {
      overrideCfg.checked = session.overrideCfg;
      cfgInput.disabled = !session.overrideCfg;
      if (session.cfgValue) cfgInput.value = session.cfgValue;
    }
    if (session.overrideSeed !== undefined) {
      overrideSeed.checked = session.overrideSeed;
      seedInput.disabled = !session.overrideSeed;
      if (session.seedValue) seedInput.value = session.seedValue;
    }
    if (session.overrideHighres !== undefined) {
      overrideHighres.checked = session.overrideHighres;
      highresSlider.disabled = !session.overrideHighres;
      if (session.highresValue) {
        highresSlider.value = session.highresValue;
        highresValue.textContent = session.highresValue + 'x';
      }
    }
    if (session.overridePrompt !== undefined) {
      overridePrompt.checked = session.overridePrompt;
      customPrompt.disabled = !session.overridePrompt;
      if (session.customPromptValue) customPrompt.value = session.customPromptValue;
    }
    if (session.overrideNegative !== undefined) {
      overrideNegative.checked = session.overrideNegative;
      customNegative.disabled = !session.overrideNegative;
      if (session.customNegativeValue) customNegative.value = session.customNegativeValue;
    }
    
    // Restore images and logs
    if (window._setLoadingStatus) {
      await window._setLoadingStatus('Restoring session…', 'Rebuilding image list and generation logs…');
    }
    if (session.imageList && session.imageList.length > 0) {
      imageList = session.imageList;
      promptDetails = session.promptDetails || [];
      logs = session.logs || [];
      currentIndex = session.currentIndex || -1;
      
      // MIGRATE OLD FORMAT: Convert old 3-panel structure to new tabbed structure
      let migrated = false;
      promptDetails = promptDetails.map(html => {
        // Check if this is old format (has multiple prompt-section divs)
        if (html.includes('prompt-section') && !html.includes('prompt-tabs-container')) {
          migrated = true;
          // Extract resolution, positive, negative, and custom text from old format
          const resMatch = html.match(/<div class="prompt-value resolution">([^<]*)<\/div>/);
          const posMatch = html.match(/<div class="prompt-value positive">([\s\S]*?)<\/div>/);
          const negMatch = html.match(/<div class="prompt-value negative">([\s\S]*?)<\/div>/);
          const customMatch = html.match(/<div class="prompt-value random">([\s\S]*?)<\/div>/);
          
          const resolution = resMatch ? resMatch[1].trim() : '512x512';
          const positive = posMatch ? posMatch[1].trim() : 'No data';
          const negative = negMatch ? negMatch[1].trim() : 'No data';
          const custom = customMatch ? customMatch[1].trim() : 'No data';
          
          // Return new tabbed format
          return `
        <div class="prompt-section resolution-section">
          <div class="prompt-label">Resolution</div>
          <div class="prompt-value resolution">${resolution}</div>
        </div>
        <div class="prompt-tabs-container">
          <div class="prompt-tabs">
            <button class="prompt-tab" data-tab="positive" data-content="${positive.replace(/"/g, '&quot;')}">Positive</button>
            <button class="prompt-tab" data-tab="negative" data-content="${negative.replace(/"/g, '&quot;')}">Negative</button>
            <button class="prompt-tab active" data-tab="custom" data-content="${custom.replace(/"/g, '&quot;')}">Custom</button>
          </div>
          <div class="prompt-tab-content">
            <div class="prompt-value random">${custom}</div>
          </div>
        </div>
      `;
        }
        return html;
      });
      
      // Ensure arrays are in sync - if promptDetails is shorter, pad it
      while (promptDetails.length < imageList.length) {
        promptDetails.push('<div class="prompt-section"><div class="prompt-value">No details available</div></div>');
      }
      
      // Ensure currentIndex is valid
      if (currentIndex >= imageList.length) {
        currentIndex = imageList.length - 1;
      }
      
      // Restore logs
      logs.forEach(msg => {
        const p = document.createElement('p');
        p.className = 'log-complete';
        p.innerHTML = `<div class="timeline-dot"></div><div class="log-entry-content">${msg}<div class="progress-bar complete"><div class="progress-fill"></div></div></div>`;
        logPanel.insertBefore(p, logPanel.firstChild);
      });
      
      // Restore current image and its prompt details
      if (currentIndex >= 0 && imageList[currentIndex]) {
        showImage(currentIndex);
      }
      
      // Only write back to session if old-format records were actually migrated
      if (migrated) saveSession();
    }
    
    // Booru browser state (posts + gallery) is restored by booru-tabs.js via
    // loadBooruTabsFromSession() — nothing to do here.
  } catch(e) {
    console.error('Failed to load session:', e);
    showToast('Failed to load session: ' + (e.message || e), 'error');
  }
}

// Toggle switch
toggle.addEventListener('click', () => {
  generating = !generating;
  toggle.classList.toggle('active', generating);
  handle.style.left = generating ? '26px' : '2px';
  if (generating) startGenerationLoop();
});

advertButton.addEventListener('click', () => {
  advertsContainer?.classList.toggle('active');
});

// Log helper
function log(msg) {
  logs.push(msg);
  const p = document.createElement('p');
  p.textContent = msg;
  logPanel.appendChild(p);
  logPanel.scrollTop = logPanel.scrollHeight;
  saveSession();
}

function generateUniqueFilename() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let filename;
  do {
    filename = '';
    for (let i = 0; i < 8; i++) {
      filename += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (usedFilenames.has(filename));
  usedFilenames.add(filename);
  return filename + '.png';
}

function clearLog() {
  logs = [];
  logPanel.innerHTML = '';
  saveSession();
}

function logGenerating(resolution) {
  const p = document.createElement('p');
  p.className = 'log-generating';
  p.innerHTML = `<div class="timeline-dot"></div><div class="log-entry-content"><span class="spinner"></span>Generating image: ${resolution}<div class="progress-bar"><div class="progress-fill"></div></div></div>`;
  logPanel.insertBefore(p, logPanel.firstChild);
  logPanel.scrollTop = 0;
  return p;
}

function logComplete(logEntry, msg) {
  logEntry.className = 'log-complete';
  logEntry.innerHTML = `<div class="timeline-dot"></div><div class="log-entry-content">${msg}<div class="progress-bar complete"><div class="progress-fill"></div></div></div>`;
  logs.push(msg);
  saveSession();
}

function logError(logEntry, msg) {
  logEntry.className = 'log-error';
  logEntry.innerHTML = `<div class="timeline-dot"></div><div class="log-entry-content"><span class="error-icon">✗</span>${msg}<div class="progress-bar error"><div class="progress-fill"></div></div></div>`;
  logs.push(msg);
  saveSession();
}

// Navigation
leftArrow.addEventListener('click', prevImage);
rightArrow.addEventListener('click', nextImage);
deleteBtn.addEventListener('click', deleteImage);

// Keyboard navigation
document.addEventListener('keydown', (e) => {
  const isLightboxActive = lightboxModal.classList.contains('active');
  
  if(e.key === 'Escape' && isLightboxActive) {
    closeLightbox();
    return;
  }
  
  if(e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
    if (isLightboxActive && LightboxImages.length > 0) {
      prevLightboxImage();
    } else {
      prevImage();
    }
  }
  else if(e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
    if (isLightboxActive && LightboxImages.length > 0) {
      nextLightboxImage();
    } else {
      nextImage();
    }
  }
  else if(e.key === ' ' && isLightboxActive && LightboxImages.length > 0) {
    e.preventDefault();
    toggleSlideshow();
  }
  else if(e.key === 'Delete' && !isLightboxActive) {
    // Only allow delete when not in lightbox
    deleteImage();
  }
});

// Mouse wheel navigation - works in both normal and lightbox mode
document.addEventListener('wheel', (e) => {
  const isLightboxActive = lightboxModal.classList.contains('active');
  const isOverImageContainer = e.target.closest('.image-container');
  const isOverLightbox = e.target.closest('.lightbox-modal');
  
  // lightbox navigation
  if (isLightboxActive && LightboxImages.length > 0) {
    if (e.deltaY < 0) {
      prevLightboxImage();
    } else if (e.deltaY > 0) {
      nextLightboxImage();
    }
    return;
  }
  
  // Generator tab navigation
  if (!isOverImageContainer && !isLightboxActive) return;
  
  if (imageList.length === 0) return;
  
  if (e.deltaY < 0) {
    // Scroll up = previous image
    prevImage();
  } else if (e.deltaY > 0) {
    // Scroll down = next image
    nextImage();
  }
}, { passive: true });


// Lightbox modal
currentImage.addEventListener('click', () => {
  if (currentImage.src && currentImage.src !== window.location.href) {
    LightboxImages = []; // Clear mode
    lightboxImage.dataset.hqLoaded = 'false';
    lightboxImage.src = currentImage.src;
    lightboxImage.classList.toggle('tall', currentImage.naturalHeight >= 3 * currentImage.naturalWidth);
    lightboxModal.classList.add('active');
    lightboxModal.classList.remove('slideshow-mode');
    lightboxImage.classList.remove('loading');
    stopTallLightboxScroll();
  }
});

lightboxBackground.addEventListener('click', closeLightbox);

leftArrowLightbox.addEventListener('click', () => {
  // Check if we're in mode (slideshow controls visible)
  if (LightboxImages.length > 0) {
    prevLightboxImage();
  } else {
    prevImage();
  }
});

rightArrowLightbox.addEventListener('click', () => {
  // Check if we're in mode (slideshow controls visible)
  if (LightboxImages.length > 0) {
    nextLightboxImage();
  } else {
    nextImage();
  }
});

function closeLightbox() {
  // Stop any playing videos
  const videos = lightboxModal.querySelectorAll('video');
  videos.forEach(video => {
    video.pause();
    video.src = '';
    video.remove();
  });
  
  stopTallLightboxScroll();
  lightboxModal.classList.remove('active', 'slideshow-mode');
  lightboxImage.src = '';
  lightboxImage.classList.remove('loading');
  stopSlideshow();
  LightboxImages = [];
  LightboxIndex = 0;
}

// Lightbox with Slideshow
let LightboxImages = [];
let LightboxIndex = 0;
let slideshowActive = false;
let galleryImg = null;

const slideshowPlayBtn = document.getElementById('slideshow-play-btn');
const slideshowIntervalInput = document.getElementById('slideshow-interval');
const slideshowFadeDurationInput = document.getElementById('slideshow-fade-duration');
const lightboxLoader = document.getElementById('lightbox-loader');

function openLightbox(imageUrl) {
  // Build array of all loaded image URLs from window.booruPosts
  LightboxImages = (window.booruPosts || [])
    .filter(post => {
      const url = post.imageUrl;
      return url && (url.match(/\.(jpeg|jpg|gif|png)$/i) || url.includes('i.redd.it') || url.includes('i.imgur.com'));
    })
    .map(post => getImageUrl(post.imageUrl));
  
  // Find index of clicked image
  const proxiedUrl = getImageUrl(imageUrl);
  LightboxIndex = LightboxImages.indexOf(proxiedUrl);
  if (LightboxIndex === -1) LightboxIndex = 0;
}

function showLightboxImage(idx) {
  if (idx < 0 || idx >= LightboxImages.length) return;

  // Remove any previous videos
  const prevVideos = lightboxImage.parentNode.querySelectorAll('video');
  prevVideos.forEach((v, i) => {
    v.src = '';
    v.pause();
    v.remove();
    v = null;
  });
  
  LightboxIndex = idx;

  const url = LightboxImages[idx];
  const isVideo = url.toLowerCase().endsWith('.mp4') || url.toLowerCase().endsWith('.webm') || 
                  url.toLowerCase().endsWith('.mov') || url.toLowerCase().includes('.mp4?') || 
                  url.toLowerCase().includes('.webm?') || url.toLowerCase().includes('.mov?');

  // Always show loading state (no crossfade)
  const fadeDuration = parseFloat(slideshowFadeDurationInput ? slideshowFadeDurationInput.value : 0) || 0;
  // Fade duration input is kept for UI but does nothing
  lightboxImage.classList.remove('loaded');
  if (lightboxLoader) {
    lightboxLoader.classList.add('visible');
  }
  
  // If a slideshow is running and the new item is video, cancel any pending
  // timer right away so that we don't advance before the video loads.
  if (isVideo && slideshowActive && slideshowTimer) {
    clearTimeout(slideshowTimer);
    clearInterval(slideshowTimer);
    slideshowTimer = null;
  }

  if (isVideo) {
    lightboxImage.style.display = 'none';
    // Handle video in lightbox
    
    // Try to find the actual DOM element for the gallery image and use its current pixels as a placeholder
    galleryImg = null;
    const galleryImages = document.querySelectorAll('.booru-image-item img, .booru-image-item video');
    for (const img of galleryImages) {
      // Match by imageUrl, sampleUrl, or src (for both HQ and LQ)
      if (img.dataset && (getImageUrl(img.dataset.imageUrl) === url || getImageUrl(img.dataset.sampleUrl) === url || getImageUrl(img.src) === url)) {
        galleryImg = img;
        break;
      }
    }
    if (!galleryImg) {
      // Try to match by thumbnail/sample if not found
      for (const img of galleryImages) {
        if (img.dataset && (img.dataset.sampleUrl || img.dataset.thumbnailUrl)) {
          if (getImageUrl(img.dataset.sampleUrl) === url || getImageUrl(img.dataset.thumbnailUrl) === url) {
            galleryImg = img;
            break;
          }
        }
      }
    }

    const video = document.createElement('video');
    video.controls = true;
    video.preload = 'auto';
    video.style.opacity = '0';
    video.style.transition = 'opacity 0.2s ease';
    video.autoplay = true;
    video.muted = true; // mute so autoplay isn't blocked by browser
    video.playsInline = true;
    // Apply persistent volume/mute settings and save changes
    if (typeof applyVideoVolume === 'function') {
      applyVideoVolume(video);
    }
    // Prevent pointer/touch interactions from bubbling to outer handlers (fix seeking)
    ['pointerdown','touchstart'].forEach(evt => video.addEventListener(evt, e => e.stopPropagation()));

    // Insert video immediately so buffering can start while the loader is visible
    lightboxImage.parentNode.insertBefore(video, lightboxImage);

    // Helper to always advance on video end if slideshow is active
    function handleVideoEnded() {
      if (slideshowActive) {
        nextLightboxImage();
        // Only restart slideshow if not at end
        if (LightboxIndex < LightboxImages.length - 1) {
          startSlideshow();
        } else {
          stopSlideshow();
        }
      }
    }

    // Store reference for later (for toggling slideshow on/off)
    video._slideshowEndedHandler = handleVideoEnded;

    // Always set loop property based on slideshowActive
    video.loop = !slideshowActive;

    const showBufferedVideo = () => {
      if (lightboxLoader) {
        lightboxLoader.classList.remove('visible');
      }
      lightboxImage.style.display = 'none';
      video.style.opacity = '1';
      video.play().catch(e => console.warn('Lightbox autoplay prevented:', e));

      if (slideshowTimer) {
        clearTimeout(slideshowTimer);
        clearInterval(slideshowTimer);
        slideshowTimer = null;
      }

      // Always remove any previous 'ended' listeners before adding
      video.removeEventListener('ended', handleVideoEnded);
      if (slideshowActive) {
        video.addEventListener('ended', handleVideoEnded);
      } else {
        video.removeEventListener('ended', handleVideoEnded);
      }
    };

    video.addEventListener('loadedmetadata', showBufferedVideo, { once: true });

    video.src = url;
    // If slideshow is toggled on while video is already playing, ensure handler and loop are correct
    video.loop = !slideshowActive;
    video.removeEventListener('ended', handleVideoEnded);
    if (slideshowActive) {
      video.addEventListener('ended', handleVideoEnded);
    }
  } else {
    // Handle image in lightbox (no crossfade)
    // Remove any videos that might be showing
    const existingVideos = lightboxImage.parentNode.querySelectorAll('video');
    existingVideos.forEach(v => v.remove());
    lightboxImage.style.display = 'block';


    // Try to find the actual DOM element for the gallery image and use its current pixels as a placeholder
    galleryImg = null;
    const galleryImages = document.querySelectorAll('.booru-image-item img, .booru-image-item video');
    for (const img of galleryImages) {
      // Match by imageUrl, sampleUrl, or src (for both HQ and LQ)
      if (img.dataset && (getImageUrl(img.dataset.imageUrl) === url || getImageUrl(img.dataset.sampleUrl) === url || getImageUrl(img.src) === url)) {
        galleryImg = img;
        break;
      }
    }
    if (!galleryImg) {
      // Try to match by thumbnail/sample if not found
      for (const img of galleryImages) {
        if (img.dataset && (img.dataset.sampleUrl || img.dataset.thumbnailUrl)) {
          if (getImageUrl(img.dataset.sampleUrl) === url || getImageUrl(img.dataset.thumbnailUrl) === url) {
            galleryImg = img;
            break;
          }
        }
      }
    }

    if (galleryImg) {
      // Always use the gallery image's current src as the placeholder
        lightboxImage.dataset.hqLoaded = 'false';
        lightboxImage.src = galleryImg.src;
        lightboxImage.classList.toggle('tall', galleryImg.naturalHeight >= 3 * galleryImg.naturalWidth);
        lightboxImage.classList.add('loaded');
        lightboxImage.classList.remove('tall-scroll');
      } else {
        // Fallback: try to get thumbnail/sample from booruPosts
        lightboxImage.dataset.hqLoaded = 'false';
        let lowQualityUrl = null;
        if (window.booruPosts) {
          const post = window.booruPosts.find(p => getImageUrl(p.imageUrl) === url);
          if (post) {
            lowQualityUrl = post.sampleUrl || post.thumbnailUrl || post.imageUrl;
          }
        }
        if (lowQualityUrl) {
          lightboxImage.src = getImageUrl(lowQualityUrl);
          lightboxImage.classList.toggle('tall', lightboxImage.naturalHeight >= 3 * lightboxImage.naturalWidth);
          lightboxImage.classList.add('loaded');
          lightboxImage.classList.add('loading');
          lightboxImage.classList.remove('tall-scroll');
        lightboxImage.src = '';
        lightboxImage.classList.remove('loaded');
      }
    }


    // Show loader icon only if HQ is not already loaded and not already displayed
    let hqLoaded = false;
    if (galleryImg && galleryImg.getAttribute('data-high-quality-loaded') === 'true' && galleryImg.getAttribute('data-high-quality-url') === url) {
      hqLoaded = true;
    }
    // Also consider it loaded if the lightbox image src is already the HQ url
    if (lightboxImage.src === url) {
      hqLoaded = true;
    }
    if (lightboxLoader) {
      if (!hqLoaded) {
        lightboxLoader.classList.add('visible');
      } else {
        lightboxLoader.classList.remove('visible');
        if (lightboxImage.classList.contains('tall')) {
          const height = lightboxImage.offsetHeight || lightboxImage.naturalHeight || 1000;
          const scrollTime = Math.max(1, height / 100 * tallImageScrollSpeedMultiplier); // per 100px, minimum 1s
          updateTallLightboxKeyframes(scrollTime);
          const totalDuration = scrollTime + 4;
          lightboxImage.style.setProperty('--tall-scroll-duration', `${totalDuration}s`);
          lightboxImage.classList.add('tall-scroll');
        }
        if (slideshowActive) {
          startSlideshow();
        }
        return; // HQ already loaded and displayed, no need to proceed further
      }
    }

    // Now load the high quality image in the background and swap when ready
    const tempImg = new Image();
    tempImg.onload = () => {
      // Only update the lightbox image if the modal is active and still showing this post
      const modalActive = lightboxModal && lightboxModal.classList.contains('active');
      const stillOnThisImage = LightboxImages[LightboxIndex] === url;
      if (modalActive && stillOnThisImage) {
        lightboxImage.src = url;
        lightboxImage.classList.remove('loading');
        lightboxImage.dataset.hqLoaded = 'true';
        if (lightboxLoader) {
          lightboxLoader.classList.remove('visible');
        }
        (lightboxImage.decode ? lightboxImage.decode() : Promise.resolve())
          .catch(() => {})
          .then(() => {
            lightboxImage.classList.add('loaded');
            if (lightboxImage.classList.contains('tall')) {
              startTallLightboxScroll();
            }
            if (slideshowActive) {
              startSlideshow();
            }
          });
      }
      if (galleryImg && galleryImg.src !== url) {
        galleryImg.src = url;
        galleryImg.setAttribute('data-high-quality-loaded', 'true');
        galleryImg.setAttribute('data-high-quality-url', url);
      }
    };
    tempImg.onerror = () => {
      // If image fails, hide loader and show broken image
      const modalActive = lightboxModal && lightboxModal.classList.contains('active');
      const stillOnThisImage = LightboxImages[LightboxIndex] === url;
      if (modalActive && stillOnThisImage) {
        lightboxImage.src = url;
        lightboxImage.classList.remove('loading');
        if (lightboxLoader) {
          lightboxLoader.classList.remove('visible');
        }
        if (lightboxImageFade) {
          lightboxImageFade.style.transition = 'none';
          lightboxImageFade.style.opacity = '0';
          lightboxImageFade.src = '';
        }
      }
      if (galleryImg && galleryImg.src !== url) {
        galleryImg.src = url;
        galleryImg.setAttribute('data-high-quality-loaded', 'true');
        galleryImg.setAttribute('data-high-quality-url', url);
      }
    };
    tempImg.src = url;
    if (tempImg.complete && tempImg.naturalWidth > 0) {
      const cb = tempImg.onload;
      tempImg.onload = null;
      if (cb) cb();
    }
  }
}


// Preload images in advance before opening lightbox (prevents showing loading on autoplay)
let loadNextBatch = null;

function nextLightboxImage() {
  LightboxIndex = Math.min(LightboxIndex, LightboxImages.length - 1);
  if (LightboxIndex < LightboxImages.length - 1) {
    showLightboxImage(LightboxIndex + 1);
    if (galleryImg) {
      galleryImg.scrollIntoView({
        behavior: 'smooth',
        block: 'end',
        inline: 'nearest'
      });
      //simulate scroll event to trigger any lazy loading in the gallery
      document.getElementById('booru-content').dispatchEvent(new Event('scroll'));
      // Update lightbox images array with any new posts that may have loaded
      const prevUrl = LightboxImages[LightboxIndex];
      LightboxImages = window.booruPosts.map(post => getImageUrl(post.imageUrl));
      LightboxIndex = Math.max(0, LightboxImages.indexOf(prevUrl));
    }
  }
}

function prevLightboxImage() {
  if (LightboxIndex > 0) {
    LightboxIndex -= 1;
    showLightboxImage(LightboxIndex);
  }
  if (galleryImg) {
    galleryImg.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
      inline: 'nearest'
    });
  }
}

function startSlideshow() {
  slideshowActive = true;
  lightboxModal.classList.add('slideshow-active');

  slideshowPlayBtn.classList.add('playing');
  slideshowPlayBtn.innerHTML = '<i class="fas fa-pause"></i>';

  const currentUrl = LightboxImages[LightboxIndex] || '';
  const currentIsVideo = currentUrl.toLowerCase().endsWith('.mp4') ||
                         currentUrl.toLowerCase().endsWith('.webm') ||
                         currentUrl.toLowerCase().endsWith('.mov') ||
                         currentUrl.toLowerCase().includes('.mp4?') ||
                         currentUrl.toLowerCase().includes('.webm?') ||
                         currentUrl.toLowerCase().includes('.mov?');

  clearSlideshowTimer();

  // Always update the current video element's loop/event handler
  if (currentIsVideo) {
    const video = lightboxImage.parentNode.querySelector('video');
    if (video) {
      video.loop = false;
      if (video._slideshowEndedHandler) {
        video.removeEventListener('ended', video._slideshowEndedHandler);
      }
      video.addEventListener('ended', video._slideshowEndedHandler || (() => {
        if (slideshowActive) {
          nextLightboxImage();
          if (LightboxIndex < LightboxImages.length - 1) {
            startSlideshow();
          } else {
            stopSlideshow();
          }
        }
      }));
    }
    return;
  }

  if (lightboxImage.classList.contains('tall')) {
    scheduleSlideshowAdvance(getTallLightboxAutoplayDuration());
    return;
  }

  const intervalSeconds = parseFloat(slideshowIntervalInput.value) || 3;
  slideshowTimer = setInterval(() => {
    nextLightboxImage();
  }, intervalSeconds * 1000);
}

function stopSlideshow() {
  slideshowActive = false;
  lightboxModal.classList.remove('slideshow-active');
  clearSlideshowTimer();
  
  if (slideshowPlayBtn) {
    slideshowPlayBtn.classList.remove('playing');
    slideshowPlayBtn.innerHTML = '<i class="fas fa-play"></i>';
  }
}

function toggleSlideshow() {
  if (slideshowActive) {
    stopSlideshow();
  } else {
    startSlideshow();
  }
}

if (slideshowPlayBtn) {
  slideshowPlayBtn.addEventListener('click', toggleSlideshow);
}

// Update slideshow interval when changed
if (slideshowIntervalInput) {
  slideshowIntervalInput.addEventListener('input', () => {
    // Save the new interval value immediately
    debouncedSettingsSave();
    
    // Restart slideshow with new interval if active
    if (slideshowActive) {
      stopSlideshow();
      startSlideshow();
    }
  });
}

// Save fade duration when changed
if (slideshowFadeDurationInput) {
  slideshowFadeDurationInput.addEventListener('input', () => {
    debouncedSettingsSave();
  });
}

// Preload adjacent images for faster navigation
function preloadAdjacentImages(idx) {
  // Preload next image
  if (idx + 1 < imageList.length) {
    const nextImg = new Image();
    nextImg.src = imageList[idx + 1];
  }
  // Preload previous image
  if (idx - 1 >= 0) {
    const prevImg = new Image();
    prevImg.src = imageList[idx - 1];
  }
}

function showImage(idx) {
  if(imageList[idx]) {
    currentImage.src = imageList[idx];
    currentIndex = idx;
    
    // Preload adjacent images for faster navigation
    preloadAdjacentImages(idx);
    
    // Ensure arrays are in sync
    if (idx >= promptDetails.length) {
      console.warn('Prompt details index out of bounds, padding array');
      while (promptDetails.length <= idx) {
        promptDetails.push('<div class="prompt-section"><div class="prompt-value">No details available</div></div>');
      }
    }
    
    // Display corresponding prompt details
    if (promptDetails[idx] && promptPanel) {
      promptPanel.innerHTML = promptDetails[idx];
      
      // Add event listeners for prompt tabs
      const promptTabs = promptPanel.querySelectorAll('.prompt-tab');
      const promptValue = promptPanel.querySelector('.prompt-tab-content .prompt-value');
      
      promptTabs.forEach(tab => {
        tab.addEventListener('click', () => {
          const targetTab = tab.dataset.tab;
          const content = tab.dataset.content;
          
          // Remove active from all tabs
          promptTabs.forEach(t => t.classList.remove('active'));
          
          // Add active to clicked tab
          tab.classList.add('active');
          
          // Update content and color class
          promptValue.textContent = content;
          promptValue.className = 'prompt-value';
          if (targetTab === 'positive') {
            promptValue.classList.add('positive');
          } else if (targetTab === 'negative') {
            promptValue.classList.add('negative');
          } else if (targetTab === 'custom') {
            promptValue.classList.add('random');
          }
        });
      });
    } else {
      promptPanel.innerHTML = '<div class="prompt-section"><div class="prompt-value">No details available</div></div>';
      console.log('Prompt details not found for index:', idx);
    }
    
    // Update lightbox image if modal is active
    if (lightboxModal.classList.contains('active')) {
      lightboxImage.src = imageList[idx];
      lightboxImage.classList.remove('loading');
    }
    
    debouncedNavigationSave();
  }
}

function prevImage() { 
  if(currentIndex > 0) showImage(currentIndex-1);
}

function nextImage() { 
  if(currentIndex < imageList.length-1) showImage(currentIndex+1);
}
function deleteImage() { 
  if(currentIndex >= 0) { 
    imageList.splice(currentIndex, 1);
    promptDetails.splice(currentIndex, 1);
    if (imageList.length === 0) {
      currentImage.src = ''; 
      currentIndex = -1;
      promptPanel.innerHTML = '';
    } else {
      // Jump to next image, or previous if at the end
      if (currentIndex >= imageList.length) {
        currentIndex = imageList.length - 1;
      }
      showImage(currentIndex);
    }
    saveSession(); 
  } 
}

// Generation loop
async function startGenerationLoop() {
  const errorMsg = 'Stable Diffusion support is disabled in this build. Generation is unavailable.';
  console.error(errorMsg);
  showToast(errorMsg, 'error');
  generating = false;
  return;
  /*
  while(generating) {
    const cfgFile = jsonDropdown.value;
    try {
      // Change checkpoint if override is enabled and checkpoint is different
      if (overrideCheckpoint.checked) {
        const selectedCheckpoint = checkpointSelect.value;
        if (selectedCheckpoint !== lastCheckpoint) {
          const checkpointLogEntry = logGenerating(`Switching checkpoint`);
          checkpointLogEntry.classList.add('log-checkpoint-switching');
          try {
            const response = await fetch('http://localhost:3001/api/sd/sdapi/v1/options', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sd_model_checkpoint: selectedCheckpoint })
            });
            
            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`Server returned ${response.status}: ${errorText}`);
            }
            
            // Wait a bit for the model to load
            await new Promise(r => setTimeout(r, 2000));
            logComplete(checkpointLogEntry, `CP: ${selectedCheckpoint}`);
            checkpointLogEntry.classList.remove('log-checkpoint-switching');
            checkpointLogEntry.classList.add('log-checkpoint-complete');
            lastCheckpoint = selectedCheckpoint;
          } catch(err) {
            logError(checkpointLogEntry, `Failed to change checkpoint: ${err.message}`);
            console.error('Checkpoint switch error:', err);
            showToast(`Failed to change checkpoint: ${err.message}`, 'error');
          }
        }
      }
      
      const cfg = await fetch(`http://localhost:3001/load-config/${encodeURIComponent(cfgFile)}`).then(r => r.json());
      const rp = cfg.random_prompts_1[Math.floor(Math.random()*cfg.random_prompts_1.length)] +
                 cfg.random_prompts_2[Math.floor(Math.random()*cfg.random_prompts_2.length)];
      
      // Use override prompt if enabled and not empty - replaces ALL prompts (positive + random)
      let prompt;
      let customText;
      if (overridePrompt.checked && customPrompt.value.trim()) {
        customText = customPrompt.value.trim();
        prompt = customText; // Use ONLY custom prompt, no positive prompts
      } else {
        customText = rp;
        prompt = cfg.pos_prompts + rp; // Use positive prompts + random prompts
      }
      
      // Use override negative prompt if enabled and not empty - replaces config negative prompts
      let negative_prompt;
      if (overrideNegative.checked && customNegative.value.trim()) {
        negative_prompt = customNegative.value.trim();
      } else {
        negative_prompt = cfg.neg_prompts || '';
      }
      
      // Select resolution (override or random from config)
      let width = 512, height = 512;
      if (overrideResolution.checked) {
        width = parseInt(overrideWidth.value) || 512;
        height = parseInt(overrideHeight.value) || 512;
      } else if (cfg.resolutions && cfg.resolutions.length > 0) {
        const res = cfg.resolutions[Math.floor(Math.random() * cfg.resolutions.length)];
        width = res.width;
        height = res.height;
      }
      
      // Get steps (override or default)
      const steps = overrideSteps.checked ? parseInt(stepsInput.value) || 40 : 40;
      
      // Get CFG scale (override or default)
      const cfg_scale = overrideCfg.checked ? parseFloat(cfgInput.value) || 7 : 7;
      
      // Get seed (override or -1 for random)
      const seed = overrideSeed.checked ? parseInt(seedInput.value) || -1 : -1;
      
      const logEntry = logGenerating(`${width}x${height}`);
      
      const requestBody = { 
        prompt, 
        negative_prompt,
        steps: steps, 
        cfg_scale: cfg_scale,
        seed: seed,
        width: width, 
        height: height, 
        n_iter: 1, 
        batch_size: 1 
      };
      
      // Add highres fix if enabled
      if (overrideHighres.checked) {
        requestBody.enable_hr = true;
        requestBody.hr_scale = parseFloat(highresSlider.value) || 1.5;
        requestBody.hr_upscaler = "Latent";
        requestBody.denoising_strength = 0.7;
      }
      
      // Start progress monitoring
      const progressBar = logEntry.querySelector('.progress-fill');
      const progressInterval = setInterval(async () => {
        try {
          const progressRes = await fetch('http://localhost:3001/api/sd/sdapi/v1/progress');
          const progressData = await progressRes.json();
          if (progressData.progress > 0) {
            progressBar.style.width = (progressData.progress * 100) + '%';
          }
        } catch (e) {
          // Ignore progress errors
        }
      }, 500);
      
      const res = await fetch('http://localhost:3001/api/sd/sdapi/v1/txt2img', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      clearInterval(progressInterval);
      
      if (!res.ok) {
        throw new Error(`API returned ${res.status}: ${res.statusText}`);
      }
      
      const data = await res.json();
      if (!data.images || !data.images[0]) {
        throw new Error('No images returned from API');
      }
      
      // Update log for highres fix if enabled
      if (overrideHighres.checked) {
        logEntry.innerHTML = `<span class="spinner"></span>Applying Highres Fix: ${width}x${height} → ${Math.round(width * parseFloat(highresSlider.value))}x${Math.round(height * parseFloat(highresSlider.value))}`;
      }
      
      const imgB64 = data.images[0];
      const imgSrc = 'data:image/png;base64,' + imgB64;
      
      // Store prompt details for this image
      const promptDetailHTML = `
        <div class="prompt-section resolution-section">
          <div class="prompt-label">Resolution</div>
          <div class="prompt-value resolution">${width}x${height}</div>
        </div>
        <div class="prompt-tabs-container">
          <div class="prompt-tabs">
            <button class="prompt-tab" data-tab="positive" data-content="${cfg.pos_prompts.replace(/"/g, '&quot;')}">Positive</button>
            <button class="prompt-tab" data-tab="negative" data-content="${negative_prompt.replace(/"/g, '&quot;')}">Negative</button>
            <button class="prompt-tab active" data-tab="custom" data-content="${customText.replace(/"/g, '&quot;')}">Custom</button>
          </div>
          <div class="prompt-tab-content">
            <div class="prompt-value random">${customText}</div>
          </div>
        </div>
      `;
      
      imageList.push(imgSrc);
      promptDetails.push(promptDetailHTML);
      showImage(imageList.length-1);
      
      // Save image to output folder
      const filename = generateUniqueFilename();
      try {
        await fetch('http://localhost:3001/save-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: imgSrc, filename })
        });
        logComplete(logEntry, `${width}x${height} - Saved: ${filename}`);
      } catch(saveErr) {
        logComplete(logEntry, `${width}x${height} - Could not save to disk`);
      }
    } catch(err){ 
      if (typeof logEntry !== 'undefined') {
        logError(logEntry, `${width}x${height} - Error: ${err.message}`);
      } else {
        log('Error: ' + err.message);
      } 
      console.error('Full error:', err);
      showToast('Error: ' + err.message, 'error');
    }

    await new Promise(r => setTimeout(r, 1000));
  }
}
*/
}

// Config Editor Functions
async function loadConfigsList() {
  try {
    const res = await fetch('http://localhost:3001/list-configs');
    const configs = await res.json();
    configItems.innerHTML = '';
    
    configs.forEach(cfg => {
      const item = document.createElement('div');
      item.className = 'config-item';
      item.textContent = cfg;
      item.addEventListener('click', () => loadConfig(cfg));
      configItems.appendChild(item);
    });
    
    allConfigs = configs;
    // Reload dropdown for generator
    const currentSelection = jsonDropdown.value; // Save current selection
    jsonDropdown.innerHTML = '';
    configs.forEach(cfg => {
      const opt = document.createElement('option');
      opt.value = cfg;
      opt.innerText = cfg;
      jsonDropdown.appendChild(opt);
    });
    // Restore previous selection if it still exists
    if (currentSelection) {
      jsonDropdown.value = currentSelection;
    }
  } catch(err) {
    console.error('Error loading configs list:', err);
    showToast('Error loading configs list: ' + err.message, 'error');
  }
}

async function loadConfig(configName) {
  try {
    const res = await fetch(`http://localhost:3001/load-config/${encodeURIComponent(configName)}`);
    const data = await res.json();
    configEditor.value = JSON.stringify(data, null, 2);
    configNameInput.value = configName;
    currentConfigName = configName;
    highlightJSON();
    
    // Update active state
    document.querySelectorAll('.config-item').forEach(item => {
      item.classList.toggle('active', item.textContent === configName);
    });
  } catch(err) {
    console.error('Error loading config:', err);
    showToast('Error loading config: ' + err.message, 'error');
  }
}

addConfigBtn.addEventListener('click', async () => {
  // Generate unique filename
  let counter = 1;
  let newName = `new_config_${counter}.json`;
  while (allConfigs.includes(newName)) {
    counter++;
    newName = `new_config_${counter}.json`;
  }
  
  const defaultConfig = {
    "pos_prompts": "masterpiece, high quality, detailed, ",
    "neg_prompts": "low quality, blurry, artifacts",
    "random_prompts_1": ["cinematic lighting, ", "soft natural light, "],
    "random_prompts_2": ["portrait, ", "landscape, "],
    "resolutions": [
      {"width": 512, "height": 512},
      {"width": 768, "height": 512},
      {"width": 512, "height": 768}
    ]
  };
  
  const content = JSON.stringify(defaultConfig, null, 2);
  
  try {
    // Save to server immediately
    const res = await fetch('http://localhost:3001/save-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: newName, content })
    });
    
    const result = await res.json();
    if (result.success) {
      // Reload list and select the new config
      await loadConfigsList();
      await loadConfig(newName);
    } else {
      showToast('Failed to create config: ' + result.error, 'error');
    }
  } catch(err) {
    showToast('Error creating config: ' + err.message, 'error');
  }
});

saveConfigBtn.addEventListener('click', async () => {
  try {
    const configName = configNameInput.value;
    if (!configName.endsWith('.json')) {
      showToast('Config name must end with .json', 'error');
      return;
    }
    
    // Validate JSON
    const configData = JSON.parse(configEditor.value);
    const formattedContent = JSON.stringify(configData, null, 2);
    
    // If renaming (current name exists and is different), delete the old file first
    if (currentConfigName && currentConfigName !== configName) {
      try {
        const deleteRes = await fetch(`http://localhost:3001/delete-config/${encodeURIComponent(currentConfigName)}`, {
          method: 'DELETE'
        });
        await deleteRes.json(); // Wait for deletion to complete
        // Small delay to ensure filesystem updates
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch(err) {
        console.error('Failed to delete old config during rename:', err);
        showToast('Failed to rename: ' + err.message, 'error');
        return;
      }
    }
    
    // Save to server
    const res = await fetch('http://localhost:3001/save-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: configName, content: formattedContent })
    });
    
    const result = await res.json();
    if (result.success) {
      currentConfigName = configName;
      // Reload the list to show the new/updated config
      await loadConfigsList();
      // Select the saved config
      document.querySelectorAll('.config-item').forEach(item => {
        item.classList.toggle('active', item.textContent === configName);
      });
    } else {
      showToast('Failed to save config: ' + result.error, 'error');
    }
  } catch(err) {
    showToast('Invalid JSON: ' + err.message, 'error');
  }
});

deleteConfigBtn.addEventListener('click', async () => {
  if (!currentConfigName) {
    return;
  }
  
  try {
    const res = await fetch(`http://localhost:3001/delete-config/${encodeURIComponent(currentConfigName)}`, {
      method: 'DELETE'
    });
    
    const result = await res.json();
    if (result.success) {
      currentConfigName = '';
      configEditor.value = '';
      configNameInput.value = '';
      jsonHighlight.innerHTML = '';
      await loadConfigsList();
    } else {
      showToast('Failed to delete config: ' + result.error, 'error');
    }
  } catch(err) {
    showToast('Error deleting config: ' + err.message, 'error');
  }
});

const imageSizeSlider = document.getElementById('image-size-slider');
const imageSizeValue = document.getElementById('image-size-value');
const searchFilterInput = document.getElementById('search-filter-input');

let currentImageSize = 250;

// Shared IntersectionObserver for lazy loading
let sharedImageObserver = null;
let activeGifs = new Set();
const MAX_ACTIVE_GIFS = 5;

if ('IntersectionObserver' in window) {
  sharedImageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const img = entry.target;
      if (entry.isIntersecting) {
        if (!img.src && img.dataset.imageUrl) {
          img.src = img.dataset.imageUrl;
        }
        if (img.dataset.isGif === 'true' && img.dataset.gifSrc) {
          if (activeGifs.size >= MAX_ACTIVE_GIFS) {
            const oldestGif = activeGifs.values().next().value;
            if (oldestGif && oldestGif !== img) {
              oldestGif.src = oldestGif.dataset.staticSrc || oldestGif.dataset.gifSrc;
              activeGifs.delete(oldestGif);
            }
          }
          img.src = img.dataset.gifSrc;
          activeGifs.add(img);
        }
      } else {
        if (img.dataset.isGif === 'true' && img.src && img.complete) {
          img.dataset.gifSrc = img.dataset.gifSrc || img.src;
          if (!img.dataset.staticSrc && img.naturalWidth > 0) {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = img.naturalWidth;
              canvas.height = img.naturalHeight;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0);
              img.dataset.staticSrc = canvas.toDataURL('image/jpeg', 0.5);
            } catch(e) {
              console.warn('Failed to capture GIF frame:', e);
            }
          }
          if (img.dataset.staticSrc) {
            img.src = img.dataset.staticSrc;
          }
          activeGifs.delete(img);
        }
      }
    });
  }, {
    rootMargin: '200px',
    threshold: 0.01
  });
}