const _electron = require('electron');

// Validate we're running inside Electron's main process, not plain Node.js
if (!_electron || typeof _electron === 'string' || !_electron.app) {
  console.error('\n[ERROR] electron-main.js must be launched via the Electron binary.');
  console.error('        Run:  npm run electron   (or double-click start.bat)');
  console.error('        Got:', typeof _electron, _electron);
  process.exit(1);
}

const { app, BrowserWindow, shell, Menu, ipcMain, dialog } = _electron;
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { autoUpdater } = require('electron-updater');

// Keep global references to prevent garbage collection
let mainWindow = null;
let launcherWindow = null;
let serverProcess = null;
let sdProcess = null;

function sendMainWindowEvent(channel, payload) {
  if (mainWindow?.webContents) {
    mainWindow.webContents.send(channel, payload);
  }
}

autoUpdater.autoDownload = false;

autoUpdater.on('error', (err) => {
  console.error('AutoUpdater error:', err);
  sendMainWindowEvent('update-error', { message: err?.message || String(err) });
});

autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info.version);
  sendMainWindowEvent('update-available', info);
});

autoUpdater.on('update-not-available', () => {
  console.log('No update available');
  sendMainWindowEvent('update-not-available');
});

autoUpdater.on('download-progress', (info) => {
  console.log(`Update download progress: ${info.percent?.toFixed(2)}%`, info);
  sendMainWindowEvent('update-progress', info);
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded:', info.version);
  sendMainWindowEvent('update-downloaded', info);

  autoUpdater.quitAndInstall(false, true);
});

// ─── Server ────────────────────────────────────────────────────────────────

function startServer() {
  return new Promise((resolve) => {
    if (serverProcess) {
      return resolve();
    }

    try {
      console.log('Starting embedded server inside Electron main process...');
      require(path.join(__dirname, 'server.js'));
      serverProcess = true;
      resolve();
    } catch (err) {
      console.error('Failed to start embedded server:', err);
      serverProcess = null;
      resolve();
    }
  });
}

// ─── Stable Diffusion (optional) ───────────────────────────────────────────


function startStableDiffusion() {
  const SD_PATH = path.join(__dirname, '..', 'STABLE DIFFUSION');
  const SD_WEBUI_BAT = path.join(SD_PATH, 'webui-user.bat');

  if (!fs.existsSync(SD_WEBUI_BAT)) {
    console.warn('⚠  Stable Diffusion not found — skipping SD launch.');
    console.warn('   Expected at:', SD_WEBUI_BAT);
    return;
  }

  console.log('🚀 Starting Stable Diffusion WebUI…');
  const command =
    'set COMMANDLINE_ARGS=--no-half-vae --api --cors-allow-origins=* --nowebui && call webui-user.bat';

  sdProcess = spawn('cmd', ['/c', command], {
    cwd: SD_PATH,
    shell: false,
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  sdProcess.stdout.on('data', (data) => {
    const out = data.toString().trim();
    if (out) process.stdout.write('[SD] ' + out + '\n');
  });

  sdProcess.stderr.on('data', (data) => {
    const out = data.toString().trim();
    if (out) process.stderr.write('[SD] ' + out + '\n');
  });

  sdProcess.on('error', (err) => {
    console.error('❌ Failed to start Stable Diffusion:', err.message);
  });
}

// ─── Launcher window ────────────────────────────────────────────────────

function showLauncher() {
  launcherWindow = new BrowserWindow({
    width: 300,
    height: 200,
    frame: false,
    resizable: false,
    backgroundColor: '#1a1a2e',
    icon: path.join(__dirname, 'favicon', 'app.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'launcher-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  launcherWindow.loadFile(path.join(__dirname, 'launcher.html'));

  // If user closes the launcher window via Alt+F4 or taskbar, quit entirely
  launcherWindow.on('closed', () => {
    launcherWindow = null;
  });
}

// Handle launcher button choices
ipcMain.handle('select-folder', async (event, defaultPath) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Download Folder',
    defaultPath: defaultPath || 'C:\\Downloads',
    properties: ['openDirectory', 'createDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('get-app-version', async () => {
  return app.getVersion();
});

ipcMain.handle('get-user-data-output-path', async () => {
  const documentsPath = app.getPath('documents');
  const userDataBase = path.join(documentsPath, 'My Games', 'BS');
  return path.join(userDataBase, 'output');
});

function fetchLatestGitHubRelease() {
  return new Promise((resolve) => {
    const request = https.get(
      'https://api.github.com/repos/SaltedShroom/Booru-Studio/releases/latest',
      {
        headers: {
          'User-Agent': 'Booru Studio Updater',
          Accept: 'application/vnd.github.v3+json',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return resolve({
              error: true,
              message: `GitHub API returned ${res.statusCode}`,
              remoteVersion: null,
            });
          }
          try {
            const obj = JSON.parse(data);
            const remoteVersion = obj.tag_name || obj.name || null;
            resolve({ error: false, remoteVersion, raw: obj });
          } catch (err) {
            resolve({ error: true, message: err.message || String(err), remoteVersion: null });
          }
        });
      }
    );

    request.on('error', (err) => {
      resolve({ error: true, message: err.message || String(err), remoteVersion: null });
    });

    request.end();
  });
}

ipcMain.handle('check-for-updates', async () => {
  const githubRelease = await fetchLatestGitHubRelease();
  console.log('GitHub release fetch:', {
    remoteVersion: githubRelease.remoteVersion || null,
    githubError: githubRelease.error ? githubRelease.message : null,
  });

  try {
    const updateCheck = await autoUpdater.checkForUpdates();
    const updateInfoVersion = updateCheck?.updateInfo?.version || null;
    console.log('autoUpdater.checkForUpdates result:', {
      updateInfoVersion,
      updateAvailable: updateInfoVersion !== null,
    });
    return {
      error: false,
      updateInfo: updateCheck?.updateInfo || null,
      remoteVersion: githubRelease.remoteVersion || null,
      githubError: githubRelease.error ? githubRelease.message : null,
    };
  } catch (err) {
    const message = err?.message || String(err);
    const noReleases = /No published versions on GitHub|No published version/i.test(message);
    if (noReleases) {
      console.log('Update check: no published GitHub releases available.');
      return {
        error: false,
        updateInfo: null,
        noReleases: true,
        remoteVersion: githubRelease.remoteVersion || null,
        githubError: githubRelease.error ? githubRelease.message : null,
      };
    }
    console.error('Check for updates failed:', err);
    return {
      error: true,
      message,
      remoteVersion: githubRelease.remoteVersion || null,
      githubError: githubRelease.error ? githubRelease.message : null,
    };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { error: false };
  } catch (err) {
    console.error('Download update failed:', err);
    return {
      error: true,
      message: err?.message || String(err),
    };
  }
});

ipcMain.on('launcher-choice', async (event, choice) => {
  if (choice === 'electron') {
    // Open the desktop app immediately, then start the server in the background.
    createWindow();
    if (launcherWindow) {
      launcherWindow.destroy();
      launcherWindow = null;
    }

    startServer().catch((err) => {
      console.error('Error starting server after opening app:', err);
    });
  } else if (choice === 'browser') {
    // Launch the original browser-mode batch file.
    // This is the console window the user expects.
    let browserProcess;
    if (process.platform === 'win32') {
      const batPath = path.join(__dirname, 'Start Browser.bat');
      browserProcess = spawn('cmd.exe', ['/c', 'start', '""', batPath], {
        cwd: __dirname,
        detached: true,
        stdio: 'ignore',
      });
    } else {
      browserProcess = spawn(process.execPath, [path.join(__dirname, 'start.js')], {
        cwd: __dirname,
        detached: true,
        stdio: 'ignore',
      });
    }
    browserProcess.unref();
    app.quit();
  } else if (choice === 'close') {
    if (launcherWindow) {
      launcherWindow.destroy();
      launcherWindow = null;
    }
  }
});

// ─── Window ────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Booru Studio',
    autoHideMenuBar: true,
    backgroundColor: '#0f0f1a', // match app dark background — prevents white flash
    icon: path.join(__dirname, 'favicon', 'app.ico'),
    webPreferences: {
      nodeIntegration: false,     // keep renderer sandboxed
      contextIsolation: true,
      // Allow the file:// page to call http://localhost:3001
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // F12 opens/closes DevTools docked to the right; F11 toggles fullscreen; F5/Ctrl+R reloads
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12') {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools({ mode: 'right' });
      }
      event.preventDefault();
    } else if (input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      event.preventDefault();
    } else if (input.key === 'F5' || (input.key === 'r' && input.control)) {
      mainWindow.webContents.reload();
      event.preventDefault();
    }
  });

  // Open anchor links that target _blank in the system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Load the app directly — no static server needed
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── App lifecycle ─────────────────────────────────────────────────────────

async function main() {
  console.log('Starting Booru Studio…');
  Menu.setApplicationMenu(null);
  // Show launcher choice dialog first
  showLauncher();
}

app.whenReady().then(main);

// Quit when all windows are closed (all platforms)
app.on('window-all-closed', () => {
  app.quit();
});

// macOS: re-create window when dock icon is clicked and no windows are open
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Clean up child processes before quitting
function killChildProcess(proc) {
  if (!proc || typeof proc.pid !== 'number') return;
  try {
    if (process.platform === 'win32') {
      // taskkill /T kills the entire process tree, /F forces immediate termination.
      // This is necessary on Windows because SIGTERM is not a real signal and
      // child processes spawned by the server won't die from a plain kill().
      execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' });
    } else {
      proc.kill();
    }
  } catch (e) { /* process may have already exited */ }
}

app.on('before-quit', () => {
  killChildProcess(serverProcess);
  serverProcess = null;
  killChildProcess(sdProcess);
  sdProcess = null;
});

// Force Electron to fully exit after all cleanup is done.
// Without this, Electron's GPU/network helper processes sometimes linger on Windows.
app.on('will-quit', () => {
  process.nextTick(() => process.exit(0));
});
