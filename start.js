const { spawn, exec } = require('child_process');
const http = require('http');
const handler = require('serve-handler');
const path = require('path');

// Configuration - SD folder is next to the project folder
const SD_PATH = path.join(__dirname, '..', 'STABLE DIFFUSION');
const SD_WEBUI_BAT = path.join(SD_PATH, 'webui-user.bat');

console.log('Starting Booru Studio...\n');

let sdProcess = null;

/*
// Stable Diffusion support is currently disabled.
// The code below is retained for reference but not executed.
if (require('fs').existsSync(SD_WEBUI_BAT)) {
  console.log('🚀 Starting Stable Diffusion WebUI...');
  console.log('   Path:', SD_PATH);
  console.log('   Bat file:', SD_WEBUI_BAT);
  console.log('   Arguments: --no-half-vae --api --cors-allow-origins=* --nowebui');
  console.log('');
  
  // Build command that sets COMMANDLINE_ARGS then calls the bat file
  const command = `set COMMANDLINE_ARGS=--no-half-vae --api --cors-allow-origins=* --nowebui && call webui-user.bat`;
  
  // Launch with cmd /c, using cwd to set the directory
  sdProcess = spawn('cmd', ['/c', command], {
    cwd: SD_PATH,
    shell: false,
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  sdProcess.stdout.on('data', (data) => {
    const output = data.toString();
    console.log('[SD] ' + output.trim());
    if (output.includes('Running on local URL')) {
      console.log('✓ Stable Diffusion is ready at http://localhost:7860');
    }
  });

  sdProcess.stderr.on('data', (data) => {
    console.error('[SD] ' + data.toString().trim());
  });

  sdProcess.on('error', (error) => {
    console.error('❌ Failed to start Stable Diffusion:', error.message);
  });

  sdProcess.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      // console.error(`❌ Stable Diffusion exited with code ${code}`);
    }
  });
} else {
  // Stable Diffusion support is disabled.
}
*/

// Start the image save server using Electron's bundled runtime.
const saveServer = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  cwd: __dirname,
  stdio: ['ignore', 'pipe', 'pipe']
});

saveServer.stdout.on('data', (data) => {
  process.stdout.write('[server] ' + data.toString());
});

saveServer.stderr.on('data', (data) => {
  process.stderr.write('[server] ' + data.toString());
});

// Start the web server directly without spawning an external shell.
const webServer = http.createServer((req, res) => {
  return handler(req, res, {
    public: __dirname,
  });
});

webServer.listen(3000, () => {
  console.log('✓ Web server started on http://localhost:3000\n');
});

console.log('✓ Image save server started on http://localhost:3001');

function openUrl(url) {
  let command;
  if (process.platform === 'win32') {
    command = `start "" "${url}"`;
  } else if (process.platform === 'darwin') {
    command = `open "${url}"`;
  } else {
    command = `xdg-open "${url}"`;
  }

  exec(command, (error) => {
    if (error) {
      console.warn('\n📋 Please manually open:', url);
    }
  });
}

// Auto-open browser after a short delay
setTimeout(() => {
  console.log('🌐 Opening browser...');
  openUrl('http://localhost:3000');
}, 2000);

// Handle exit
process.on('SIGINT', () => {
  console.log('\nStopping servers...');
  if (sdProcess) sdProcess.kill();
  saveServer.kill();
  webServer.kill();
  process.exit();
});
