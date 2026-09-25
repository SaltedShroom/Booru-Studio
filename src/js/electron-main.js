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

app.setName('Booru Studio');

// Keep global references to prevent garbage collection
let mainWindow = null;
let launcherWindow = null;
let serverProcess = null;
let sdProcess = null;
let updateCheckInfo = null; // Track the last successful update check

function sendMainWindowEvent(channel, payload) {
  if (mainWindow?.webContents) {
    mainWindow.webContents.send(channel, payload);
  }
}

autoUpdater.autoDownload = false;

// Set the correct app version from package.json
try {
  const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  app.setVersion(packageJson.version);
} catch (err) {
  console.error('Failed to set app version from package.json:', err);
}

// Global error handlers
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

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
  if (serverProcess) return;

  try {
    require(path.join(__dirname, 'server.js'));
    
    // Start the web server (port 3000)
    const http = require('http');
    const handler = require('serve-handler');
    const webServer = http.createServer((req, res) => {
      const urlObj = new URL(req.url, 'http://localhost:3000');
      const pathname = urlObj.pathname;
      
      // Serve index.html at root path
      if (pathname === '/' || pathname === '') {
        const indexPath = path.join(__dirname, 'index.html');
        fs.readFile(indexPath, 'utf8', (err, data) => {
          if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404: index.html not found');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(data);
        });
        return;
      }
      
      // Serve static files from workspace root (including node_modules)
      const filePath = path.join(__dirname, '..', '..', pathname);
      
      // Security: prevent directory traversal
      if (!filePath.startsWith(path.join(__dirname, '..', '..'))) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403: Forbidden');
        return;
      }
      
      // Try to serve the file
      fs.stat(filePath, (err, stats) => {
        if (err) {
          // File doesn't exist, use serve-handler
          return handler(req, res, {
            public: path.join(__dirname, '..', '..'),
          });
        }
        
        if (stats.isDirectory()) {
          // It's a directory, use serve-handler
          return handler(req, res, {
            public: path.join(__dirname, '..', '..'),
          });
        }
        
        // Serve the file
        fs.readFile(filePath, (err, data) => {
          if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('500: Internal Server Error');
            return;
          }
          
          // Determine content type
          const ext = path.extname(filePath).toLowerCase();
          let contentType = 'application/octet-stream';
          if (ext === '.js') contentType = 'application/javascript';
          else if (ext === '.css') contentType = 'text/css';
          else if (ext === '.html') contentType = 'text/html';
          else if (ext === '.json') contentType = 'application/json';
          else if (ext === '.png') contentType = 'image/png';
          else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
          else if (ext === '.gif') contentType = 'image/gif';
          else if (ext === '.svg') contentType = 'image/svg+xml';
          else if (ext === '.woff' || ext === '.woff2') contentType = 'font/woff2';
          else if (ext === '.ttf') contentType = 'font/ttf';
          
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(data);
        });
      });
    });
    
    webServer.listen(3000);
    serverProcess = true;
    
  } catch (err) {
    console.error('[startServer] Error:', err.message);
  }
}

// ─── Stable Diffusion support is currently disabled. ─────────────────────────

function startStableDiffusion() {
  return;
  /*
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
  */
}

// ─── Launcher window ────────────────────────────────────────────────────

function showLauncher() {
  launcherWindow = new BrowserWindow({
    width: 300,
    height: 200,
    frame: false,
    resizable: false,
    backgroundColor: '#1a1a2e',
    icon: path.join(__dirname, '..', 'assets', 'favicon', 'app.ico'),
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

ipcMain.handle('copy-files', async (event, sourceFile, destFile) => {
  const fs = require('fs').promises;
  try {
    await fs.copyFile(sourceFile, destFile);
    return { success: true };
  } catch (error) {
    throw new Error(`Failed to copy file: ${error.message}`);
  }
});

ipcMain.handle('crop-image', async (event, sourceFile, destFile, targetX, targetY, postAspectRatio) => {
  const sharp = require('sharp');
  const fs = require('fs');
  try {
    // Check if source file exists
    if (!fs.existsSync(sourceFile)) {
      throw new Error(`Source file does not exist: ${sourceFile}`);
    }
    
    // Read the image metadata
    const image = sharp(sourceFile);
    const metadata = await image.metadata();
    
    // Calculate target aspect ratio (width/height)
    const targetRatio = targetX / targetY;
    const currentRatio = metadata.width / metadata.height;
    
    // Determine crop dimensions to fit the target aspect ratio
    let cropWidth, cropHeight;
    
    if (currentRatio > targetRatio) {
      // Image is wider than target - crop width
      cropHeight = metadata.height;
      cropWidth = Math.round(cropHeight * targetRatio);
    } else {
      // Image is taller than target - crop height
      cropWidth = metadata.width;
      cropHeight = Math.round(cropWidth / targetRatio);
    }
    
    // Calculate position to center the crop
    const leftOffset = Math.round((metadata.width - cropWidth) / 2);
    const topOffset = Math.round((metadata.height - cropHeight) / 2);
    
    // Determine output format from destination file extension
    const ext = destFile.split('.').pop().toLowerCase();
    const supportedFormats = ['png', 'jpg', 'jpeg', 'webp', 'tiff', 'avif', 'heif', 'heic'];
    
    // Crop and save the image
    let pipeline = image
      .extract({ 
        left: Math.max(0, leftOffset), 
        top: Math.max(0, topOffset), 
        width: cropWidth, 
        height: cropHeight 
      });
    
    // Specify output format if recognized, otherwise default to PNG
    if (supportedFormats.includes(ext)) {
      pipeline = pipeline.toFormat(ext);
    } else {
      // For temp files or unknown extensions, default to PNG
      pipeline = pipeline.toFormat('png');
    }
    
    await pipeline.toFile(destFile);
    
    return { success: true };
  } catch (error) {
    throw new Error(`Failed to crop image: ${error.message}`);
  }
});

ipcMain.handle('resize-image', async (event, sourceFile, destFile, targetWidth, targetHeight) => {
  const sharp = require('sharp');
  const fs = require('fs');
  try {
    // Check if source file exists
    if (!fs.existsSync(sourceFile)) {
      throw new Error(`Source file does not exist: ${sourceFile}`);
    }
    
    // Read metadata to validate the file
    const metadata = await sharp(sourceFile).metadata();
    
    // Determine output format from destination file extension
    const ext = destFile.split('.').pop().toLowerCase();
    const supportedFormats = ['png', 'jpg', 'jpeg', 'webp', 'tiff', 'avif', 'heif', 'heic'];
    const outputFormat = supportedFormats.includes(ext) ? ext : 'png';
    
    let pipeline = sharp(sourceFile)
      .resize(targetWidth, targetHeight, { 
        fit: 'cover',
        position: 'center'
      });
    
    // Specify output format
    pipeline = pipeline.toFormat(outputFormat);
    
    await pipeline.toFile(destFile);
    
    return { success: true };
  } catch (error) {
    throw new Error(`Failed to resize image: ${error.message}`);
  }
});

// Helper function to write uncompressed DDS file
async function writeDDSFile(imageData, width, height, destFile) {
  const fs = require('fs').promises;
  
  // DDS file header is 128 bytes total (4 + 124)
  const header = Buffer.alloc(128, 0);
  
  // Magic number "DDS " at offset 0
  header.write('DDS ', 0, 4, 'ascii');
  
  // DWORD dwSize (always 124) at offset 4
  header.writeUInt32LE(124, 4);
  
  // DWORD dwFlags at offset 8
  const DDSD_CAPS = 0x1;
  const DDSD_HEIGHT = 0x2;
  const DDSD_WIDTH = 0x4;
  const DDSD_PITCH = 0x8;
  const DDSD_PIXELFORMAT = 0x1000;
  const DDSD_LINEARSIZE = 0x80000;
  header.writeUInt32LE(DDSD_CAPS | DDSD_HEIGHT | DDSD_WIDTH | DDSD_LINEARSIZE | DDSD_PIXELFORMAT, 8);
  
  // DWORD dwHeight at offset 12
  header.writeUInt32LE(height, 12);
  
  // DWORD dwWidth at offset 16
  header.writeUInt32LE(width, 16);
  
  // DWORD dwPitchOrLinearSize (for uncompressed, linear size) at offset 20
  header.writeUInt32LE(width * height * 4, 20);
  
  // DWORD dwDepth (not a volume texture) at offset 24
  header.writeUInt32LE(0, 24);
  
  // DWORD dwMipMapCount (no mipmaps) at offset 28
  header.writeUInt32LE(0, 28);
  
  // dwReserved1[11] at offsets 32-75 (44 bytes) - already zero-initialized
  
  // Pixel format structure at offset 76 (32 bytes)
  // dwSize (always 32) at offset 76
  header.writeUInt32LE(32, 76);
  
  // dwFlags (DDPF_ALPHAPIXELS | DDPF_RGB) at offset 80
  const DDPF_ALPHAPIXELS = 0x1;
  const DDPF_RGB = 0x40;
  header.writeUInt32LE(DDPF_ALPHAPIXELS | DDPF_RGB, 80);
  
  // dwFourCC (0 for uncompressed) at offset 84
  header.writeUInt32LE(0, 84);
  
  // dwRGBBitCount (32 for RGBA) at offset 88
  header.writeUInt32LE(32, 88);
  
  // dwRBitMask (red channel: 0x000000FF - bits 0-7) at offset 92
  header.writeUInt32LE(0x000000FF, 92);
  
  // dwGBitMask (green channel: 0x0000FF00 - bits 8-15) at offset 96
  header.writeUInt32LE(0x0000FF00, 96);
  
  // dwBBitMask (blue channel: 0x00FF0000 - bits 16-23) at offset 100
  header.writeUInt32LE(0x00FF0000, 100);
  
  // dwABitMask (alpha channel: 0xFF000000 - bits 24-31) at offset 104
  header.writeUInt32LE(0xFF000000, 104);
  
  // dwCaps (DDSCAPS_TEXTURE) at offset 108
  const DDSCAPS_TEXTURE = 0x1000;
  header.writeUInt32LE(DDSCAPS_TEXTURE, 108);
  
  // dwCaps2, dwCaps3, dwCaps4 at offsets 112, 116, 120 - already zero-initialized
  
  // dwReserved2 at offset 124 - already zero-initialized
  
  // Write header and image data to file
  const fd = await fs.open(destFile, 'w');
  try {
    await fd.write(header);
    await fd.write(imageData);
  } finally {
    await fd.close();
  }
}

ipcMain.handle('convert-file-type', async (event, sourceFile, destFile, fileType) => {
  const sharp = require('sharp');
  try {
    if (fileType === 'dds') {
      // Custom DDS conversion from image to uncompressed DDS
      const image = sharp(sourceFile);
      const metadata = await image.metadata();
      
      // Convert to RGBA buffer
      const { data, info } = await sharp(sourceFile)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      
      // Write uncompressed DDS file
      await writeDDSFile(data, info.width, info.height, destFile);
      return { success: true };
    } else {
      // Use Sharp for standard formats
      await sharp(sourceFile)
        .toFormat(fileType)
        .toFile(destFile);
      
      return { success: true };
    }
  } catch (error) {
    throw new Error(`Failed to convert image to ${fileType}: ${error.message}`);
  }
});

ipcMain.handle('delete-files', async (event, filePaths) => {
  const fs = require('fs').promises;
  try {
    await Promise.all(
      filePaths.map(async (filePath) => {
        try {
          await fs.unlink(filePath);
        } catch (error) {
          // Ignore individual file deletion errors
        }
      })
    );
    return { success: true };
  } catch (error) {
    throw new Error(`Failed to delete files: ${error.message}`);
  }
});

ipcMain.handle('get-file-sizes', async (event, filePaths) => {
  const fs = require('fs').promises;
  try {
    const sizes = await Promise.all(
      filePaths.map(async (filePath) => {
        try {
          const stats = await fs.stat(filePath);
          return { filePath, size: stats.size, error: null };
        } catch (error) {
          return { filePath, size: 0, error: error.message };
        }
      })
    );
    return sizes;
  } catch (error) {
    throw new Error(`Failed to get file sizes: ${error.message}`);
  }
});

ipcMain.handle('get-app-version', async () => {
  return app.getVersion();
});

ipcMain.handle('get-user-data-output-path', async () => {
  const documentsPath = app.getPath('documents');
  const userDataBase = path.join(documentsPath, 'My Games', 'BS');
  return path.join(userDataBase, 'output');
});

ipcMain.handle('save-mosaic-file', async (event, imageUrl, defaultFilename) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Mosaic Image',
    defaultPath: path.join(app.getPath('downloads'), defaultFilename || 'mosaic.jpg'),
    filters: [
      { name: 'JPEG Image', extensions: ['jpg', 'jpeg'] },
      { name: 'All Files', extensions: ['*'] }
    ],
  });
  
  if (result.canceled) {
    return { canceled: true };
  }
  
  try {
    // Fetch the image from the local server
    const https_module = imageUrl.startsWith('https') ? require('https') : require('http');
    
    return new Promise((resolve) => {
      https_module.get(imageUrl, (response) => {
        const fileStream = fs.createWriteStream(result.filePath);
        response.pipe(fileStream);
        
        fileStream.on('finish', () => {
          fileStream.close();
          resolve({ canceled: false, filePath: result.filePath });
        });
        
        fileStream.on('error', (err) => {
          fs.unlink(result.filePath, () => {});
          resolve({ canceled: false, error: err.message });
        });
      }).on('error', (err) => {
        resolve({ canceled: false, error: err.message });
      });
    });
  } catch (err) {
    return { canceled: false, error: err.message };
  }
});

function fetchGitHubReleases() {
  return new Promise((resolve) => {
    const request = https.get(
      'https://api.github.com/repos/SaltedShroom/Booru-Studio/releases?per_page=100',
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
              releases: [],
            });
          }
          try {
            const releases = JSON.parse(data);
            if (!Array.isArray(releases) || releases.length === 0) {
              return resolve({
                error: false,
                remoteVersion: null,
                releases: [],
              });
            }
            
            // Map releases to our format and sort by version (newest first)
            const mappedReleases = releases
              .filter(r => !r.draft && !r.prerelease) // Filter out drafts and prereleases
              .map(r => ({
                version: r.tag_name || r.name || null,
                title: r.name || null,
                notes: r.body || null,
                raw: r,
              }));
            
            const remoteVersion = mappedReleases.length > 0 ? mappedReleases[0].version : null;
            resolve({ error: false, remoteVersion, releases: mappedReleases });
          } catch (err) {
            resolve({ error: true, message: err.message || String(err), remoteVersion: null, releases: [] });
          }
        });
      }
    );

    request.on('error', (err) => {
      resolve({ error: true, message: err.message || String(err), remoteVersion: null, releases: [] });
    });

    request.end();
  });
}

ipcMain.handle('check-for-updates', async () => {
  const githubData = await fetchGitHubReleases();
  console.log('GitHub releases fetch:', {
    remoteVersion: githubData.remoteVersion || null,
    releaseCount: githubData.releases?.length || 0,
    githubError: githubData.error ? githubData.message : null,
  });

  try {
    const updateCheck = await autoUpdater.checkForUpdates();
    const updateInfoVersion = updateCheck?.updateInfo?.version || null;
    console.log('autoUpdater.checkForUpdates result:', {
      updateInfoVersion,
      updateAvailable: updateInfoVersion !== null,
    });
    
    // Store the update info for use in the download step
    updateCheckInfo = updateCheck;
    
    return {
      error: false,
      updateInfo: updateCheck?.updateInfo || null,
      remoteVersion: githubData.remoteVersion || null,
      releases: githubData.releases || [],
      githubError: githubData.error ? githubData.message : null,
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
        remoteVersion: githubData.remoteVersion || null,
        releases: githubData.releases || [],
        githubError: githubData.error ? githubData.message : null,
      };
    }
    console.error('Check for updates failed:', err);
    return {
      error: true,
      message,
      remoteVersion: githubData.remoteVersion || null,
      releases: githubData.releases || [],
      githubError: githubData.error ? githubData.message : null,
    };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    // Ensure checkForUpdates was called first
    if (!updateCheckInfo) {
      const errorMsg = 'Update check must be performed before download. Please check for updates first.';
      console.error('Download update failed:', errorMsg);
      sendMainWindowEvent('update-error', { message: errorMsg });
      return {
        error: true,
        message: errorMsg,
      };
    }

    await autoUpdater.downloadUpdate();
    return { error: false };
  } catch (err) {
    const message = err?.message || String(err);
    console.error('Download update failed:', err);
    sendMainWindowEvent('update-error', { message: `Download failed: ${message}` });
    return {
      error: true,
      message,
    };
  }
});

ipcMain.on('launcher-choice', (event, choice) => {
  if (choice === 'electron') {
    // Start servers in the background
    if (!serverProcess) {
      startServer();
    }
    
    // Create the main window
    createWindow();
    
    // Close the launcher window
    if (launcherWindow) {
      launcherWindow.destroy();
      launcherWindow = null;
    }
    
  } else if (choice === 'browser') {
    // Launch the browser-mode batch file
    let browserProcess;
    if (process.platform === 'win32') {
      const batPath = path.join(__dirname, '..', 'scripts', 'start browser.bat');
      browserProcess = spawn('cmd.exe', ['/c', 'start', '""', batPath], {
        cwd: path.join(__dirname, '..'),
        detached: true,
        stdio: 'ignore',
      });
    } else {
      const startPath = path.join(__dirname, '..', 'scripts', 'start.js');
      browserProcess = spawn(process.execPath, [startPath], {
        cwd: path.join(__dirname, '..'),
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
  try {
    mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 900,
      minHeight: 600,
      title: 'Booru Studio',
      autoHideMenuBar: true,
      backgroundColor: '#0f0f1a',
      icon: path.join(__dirname, '..', 'assets', 'favicon', 'app.ico'),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false,
        preload: path.join(__dirname, 'preload.js'),
      },
    });

    // F12 opens/closes DevTools; F11 toggles fullscreen; F5 reloads, Ctrl+Shift+R hard-reloads with cache clear
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
      } else if (input.key === 'F5') {
        mainWindow.webContents.reloadIgnoringCache();
        event.preventDefault();
      } else if (input.key === 'r' && input.control && input.shift) {
        mainWindow.webContents.reloadIgnoringCache();
        event.preventDefault();
      } else if (input.key === 'r' && input.control) {
        mainWindow.webContents.reload();
        event.preventDefault();
      }
    });

    // Open anchor links that target _blank in the system browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    // Load the app from the HTTP server
    mainWindow.loadURL('http://localhost:3000/');

    // Show the window immediately
    mainWindow.show();

    // Handle load errors
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (isMainFrame) {
        console.error(`Failed to load ${validatedURL}:`, errorCode, errorDescription);
      }
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  } catch (err) {
    console.error('Error creating window:', err.message);
    throw err;
  }
}

// ─── App lifecycle ─────────────────────────────────────────────────────────

async function main() {
  Menu.setApplicationMenu(null);
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
