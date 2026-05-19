// mosaic-worker-thread.js
// Worker thread for handling CPU-intensive mosaic generation
const { parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');

// Handle messages from the main thread
parentPort.on('message', async (task) => {
  try {
    const { taskId, imageBase64, filename, cellWidth, cellHeight, columns, rows, downloadFolder, mosaicFolder } = task;
    
    // Send initial status
    parentPort.postMessage({
      taskId,
      type: 'status',
      progress: 0,
      status: 'initializing'
    });

    const mosaicModule = require('mosaic-node-generator');
    const inputDir = path.join(mosaicFolder, 'mosaic-test-inputs');
    const outputsDir = path.join(mosaicFolder, 'outputs');
    const thumbsDir = path.join(mosaicFolder, `mosaic-thumbs-${Number(cellWidth)}x${Number(cellHeight)}`);
    const tilesDir = path.join(mosaicFolder, 'mosaic-tiles');

    // Verify mosaicFolder is valid (prevent creation in wrong location)
    if (!mosaicFolder || !path.isAbsolute(mosaicFolder)) {
      throw new Error('Invalid mosaicFolder path: ' + mosaicFolder);
    }

    if (!fs.existsSync(inputDir)) fs.mkdirSync(inputDir, { recursive: true });
    if (!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir, { recursive: true });
    if (!fs.existsSync(thumbsDir)) fs.mkdirSync(thumbsDir, { recursive: true });

    // Clean up any outputs folders that might have been created in unexpected locations
    // This prevents accumulation of rogue outputs folders from mosaic library fallback behavior
    function cleanupRogueOutputs() {
      const rogueLocations = [
        path.join(process.cwd(), 'outputs'),
        path.join(__dirname, 'outputs'),
        path.join(path.dirname(__dirname), 'outputs')
      ];
      
      for (const loc of rogueLocations) {
        if (loc !== outputsDir && fs.existsSync(loc)) {
          try {
            fs.rmSync(loc, { recursive: true, force: true });
            console.error('[WORKER] Cleaned up rogue outputs folder at:', loc);
          } catch (err) {
            console.warn('[WORKER] Could not remove rogue outputs folder:', loc, err.message);
          }
        }
      }
    }

    if (fs.existsSync(tilesDir)) {
      fs.rmSync(tilesDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tilesDir, { recursive: true });

    parentPort.postMessage({
      taskId,
      type: 'status',
      progress: 5,
      status: 'gathering_tiles'
    });

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

    parentPort.postMessage({
      taskId,
      type: 'status',
      progress: 15,
      status: 'preparing_input'
    });

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

    parentPort.postMessage({
      taskId,
      type: 'status',
      progress: 15,
      status: 'generating'
    });

    const sourceJimp = await mosaicModule.JimpImage.read(inputPath);
    const sourceImage = new mosaicModule.JimpImage(sourceJimp);
    console.error('[WORKER] Creating MosaicImage object...');
    const mosaicImage = new mosaicModule.MosaicImage(
      sourceImage,
      tilesDir,
      Number(cellWidth),
      Number(cellHeight),
      Number(columns),
      Number(rows),
      thumbsDirectoryFromRead,
      thumbsDir,
      true
    );
    console.error('[WORKER] MosaicImage object created');
    console.error('[WORKER] MosaicImage properties:', Object.keys(mosaicImage));
    console.error('[WORKER] Attempting to set output directory...');
    
    // Try to set output directory via various possible property names
    if (mosaicImage.hasOwnProperty('outputPath') || 'outputPath' in mosaicImage) {
      mosaicImage.outputPath = outputsDir;
      console.error('[WORKER] Set outputPath to:', outputsDir);
    }
    if (mosaicImage.hasOwnProperty('outputFolder') || 'outputFolder' in mosaicImage) {
      mosaicImage.outputFolder = outputsDir;
      console.error('[WORKER] Set outputFolder to:', outputsDir);
    }
    if (mosaicImage.hasOwnProperty('outputDir') || 'outputDir' in mosaicImage) {
      mosaicImage.outputDir = outputsDir;
      console.error('[WORKER] Set outputDir to:', outputsDir);
    }
    if (typeof mosaicImage.setOutputPath === 'function') {
      mosaicImage.setOutputPath(outputsDir);
      console.error('[WORKER] Called setOutputPath()');
    }
    if (typeof mosaicImage.setOutputFolder === 'function') {
      mosaicImage.setOutputFolder(outputsDir);
      console.error('[WORKER] Called setOutputFolder()');
    }
    
    console.error('[WORKER] Setting up console interception...');

    // Intercept console.log to capture mosaic library progress
    const originalLog = console.log;
    let thumbsSaveInProgress = false;
    let totalThumbsToSave = 0;
    
    console.log = function(...args) {
      originalLog.apply(console, args);
      const message = args.map(arg => String(arg)).join(' ');
      
      // Detect start of thumbnail saving
      if (message.includes('Start saving thumbs')) {
        thumbsSaveInProgress = true;
        console.error('[WORKER] Thumbnail saving starting');
        parentPort.postMessage({
          taskId,
          type: 'progress',
          progress: 20,
          status: 'saving_thumbnails'
        });
        return;
      }
      
      // Detect end of thumbnail saving
      if (message.includes('End saving thumbs')) {
        thumbsSaveInProgress = false;
        console.error('[WORKER] Thumbnail saving complete');
        parentPort.postMessage({
          taskId,
          type: 'progress',
          progress: 85,
          status: 'generating'
        });
        return;
      }
      
      // Track individual thumbnail save progress: "[Thumbs save] X/Y. Progress: Z%"
      if (thumbsSaveInProgress) {
        const thumbsMatch = message.match(/\[Thumbs save\]\s*(\d+)\/(\d+)/);
        if (thumbsMatch) {
          const current = parseInt(thumbsMatch[1]);
          const total = parseInt(thumbsMatch[2]);
          totalThumbsToSave = total;
          
          if (current > 0 && total > 0) {
            // Map thumbs progress (0-100%) to 20-85% range
            const thumbsPercent = (current / total) * 100;
            const mappedProgress = 20 + (thumbsPercent * 0.65);
            const progress = Math.min(85, Math.round(mappedProgress * 100) / 100);
            
            parentPort.postMessage({
              taskId,
              type: 'progress',
              progress,
              status: 'saving_thumbnails'
            });
          }
        }
        return;
      }
      
      // Detect mosaic generation progress: "Progress: X%"
      if (!thumbsSaveInProgress && message.match(/Progress:\s*([\d.]+)%/i)) {
        const progressMatch = message.match(/Progress:\s*([\d.]+)%/i);
        if (progressMatch) {
          const progressValue = parseFloat(progressMatch[1]);
          if (!isNaN(progressValue)) {
            // Map library progress (0-100%) to 85-95% range
            const mappedProgress = 85 + (progressValue * 0.10);
            const progress = Math.min(95, Math.round(mappedProgress * 100) / 100);
            
            parentPort.postMessage({
              taskId,
              type: 'progress',
              progress,
              status: 'generating'
            });
          }
        }
      }
    };
    
    console.error('[WORKER] Starting mosaic generation with timeout protection...');
    
    // Add a timeout handler in case generation hangs
    const generationTimeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Mosaic generation timeout - exceeded 30 minutes')), 30 * 60 * 1000)
    );
    
    const generatePromise = mosaicImage.generate();
    console.error('[WORKER] generate() called, returning:', typeof generatePromise);
    
    try {
      let generatedImage = null;
      
      if (generatePromise && typeof generatePromise.then === 'function') {
        // It's a Promise
        console.error('[WORKER] generate() returned a Promise');
        generatedImage = await Promise.race([generatePromise, generationTimeout]);
        console.error('[WORKER] generate() Promise resolved, returned:', typeof generatedImage);
      } else if (generatePromise && typeof generatePromise === 'object') {
        // Might be some other async object
        console.error('[WORKER] generate() returned an object (not a standard Promise)');
        generatedImage = await generatePromise;
        console.error('[WORKER] generate() completed, returned:', typeof generatedImage);
      } else {
        // Not a Promise, might be sync or undefined
        console.error('[WORKER] generate() returned:', generatePromise, '- likely modifies mosaicImage in place');
        generatedImage = generatePromise;
      }
      
      console.error('[WORKER] After generate(), checking mosaicImage.image...');
      
      // The mosaic-node-generator likely stores result in mosaicImage.image
      if (mosaicImage.image) {
        console.error('[WORKER] mosaicImage.image exists');
        console.error('[WORKER] mosaicImage.image type:', typeof mosaicImage.image);
        console.error('[WORKER] mosaicImage.image methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(mosaicImage.image)).filter(m => typeof mosaicImage.image[m] === 'function').slice(0, 20));
        
        // Use getBuffer() to avoid double extension issues with write()
        if (typeof mosaicImage.image.getBuffer === 'function') {
          console.error('[WORKER] Using getBuffer() to save mosaic...');
          const buffer = await mosaicImage.image.getBuffer('image/jpeg');
          const outputFile = path.join(outputsDir, `output_${Date.now()}.jpg`);
          fs.writeFileSync(outputFile, buffer);
          console.error('[WORKER] Successfully saved to:', outputFile);
        } else if (typeof mosaicImage.image.write === 'function') {
          console.error('[WORKER] Calling mosaicImage.image.write() without extension...');
          const outputFile = path.join(outputsDir, `output_${Date.now()}`);
          await mosaicImage.image.write(outputFile);
          console.error('[WORKER] Successfully saved to:', outputFile);
        } else if (typeof mosaicImage.image.save === 'function') {
          console.error('[WORKER] Calling mosaicImage.image.save() without extension...');
          const outputFile = path.join(outputsDir, `output_${Date.now()}`);
          await mosaicImage.image.save(outputFile);
          console.error('[WORKER] Successfully saved to:', outputFile);
        } else {
          console.error('[WORKER] No getBuffer/write/save method found on mosaicImage.image');
          console.error('[WORKER] Full methods list:', Object.getOwnPropertyNames(Object.getPrototypeOf(mosaicImage.image)));
          throw new Error('Cannot save mosaic: no save method available');
        }
      } else {
        console.error('[WORKER] No mosaicImage.image property found');
        console.error('[WORKER] mosaicImage properties:', Object.keys(mosaicImage));
      }
    } catch (err) {
      console.error('[WORKER] Error during generate/save:', err.message);
      console.error('[WORKER] Error stack:', err.stack);
      throw err;
    }
    
    console.error('[WORKER] Mosaic generation completed!');
    
    // Restore original console.log
    console.log = originalLog;

    console.error('[WORKER] Sending finalizing status...');
    parentPort.postMessage({
      taskId,
      type: 'status',
      progress: 95,
      status: 'finalizing'
    });

    console.error('[WORKER] Reading output directory:', outputsDir);
    const outputDirContents = fs.readdirSync(outputsDir);
    console.error('[WORKER] Output dir contents (ALL):', outputDirContents);
    
    // Look for any image files, not just the pattern we expect
    const allImageFiles = outputDirContents.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext);
    });
    console.error('[WORKER] Found image files:', allImageFiles);
    
    // If no files found in outputs, search the entire mosaic folder for recently created files
    let results = outputDirContents
      .filter(file => /^output_.*\.(jpg|jpeg|png)$/i.test(file))
      .map(file => ({
        name: file,
        mtime: fs.statSync(path.join(outputsDir, file)).mtimeMs
      }))
      .sort((a, b) => b.mtime - a.mtime);

    console.error('[WORKER] Found matching output files:', results.length, results.map(r => r.name));
    
    if (results.length === 0) {
      console.error('[WORKER] ERROR: No output files found in outputs dir, searching entire mosaic folder...');
      
      // Search recursively for recently created image files in the entire mosaic folder
      function findRecentFiles(dir, maxAgeMs = 60000) { // Files created in last 60 seconds
        const files = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const now = Date.now();
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const stat = fs.statSync(fullPath);
          const age = now - stat.mtimeMs;
          
          if (age < maxAgeMs) {
            if (entry.isFile()) {
              const ext = path.extname(entry.name).toLowerCase();
              if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext)) {
                files.push({
                  path: fullPath,
                  name: entry.name,
                  dir: dir,
                  mtime: stat.mtimeMs,
                  size: stat.size
                });
              }
            } else if (entry.isDirectory()) {
              files.push(...findRecentFiles(fullPath, maxAgeMs));
            }
          }
        }
        return files;
      }
      
      const recentFiles = findRecentFiles(mosaicFolder);
      console.error('[WORKER] Recently created image files found:', recentFiles.length);
      recentFiles.forEach(f => {
        console.error(`[WORKER]   - ${f.dir}/${f.name} (${f.size} bytes, age: ${Date.now() - f.mtime}ms)`);
      });
      
      if (recentFiles.length > 0) {
        // Use the most recent file found
        const mostRecent = recentFiles.sort((a, b) => b.mtime - a.mtime)[0];
        console.error('[WORKER] Using most recent file found:', mostRecent.name);
        results = [{ name: path.basename(mostRecent.path), path: mostRecent.path }];
      } else {
        console.error('[WORKER] No recently created image files found anywhere in mosaic folder');
        const allFilesInFolder = fs.readdirSync(mosaicFolder, { recursive: true });
        console.error('[WORKER] ALL files in mosaic folder:', allFilesInFolder);
        throw new Error('Mosaic output file not found');
      }
    }

    console.error('[WORKER] Sending completion with file:', results[0].name);
    parentPort.postMessage({
      taskId,
      type: 'status',
      progress: 100,
      status: 'completed'
    });

    // Clean up any rogue outputs folders created by mosaic library fallback behavior
    cleanupRogueOutputs();

    // Construct relative path from mosaicFolder
    let relativePath = 'outputs/' + results[0].name;
    if (results[0].path) {
      // If we found the file via search, use its actual path relative to mosaicFolder
      relativePath = path.relative(mosaicFolder, results[0].path);
    }
    
    parentPort.postMessage({
      taskId,
      type: 'complete',
      success: true,
      filename: relativePath
    });
    console.error('[WORKER] Task completed successfully with file:', relativePath);
  } catch (error) {
    console.error('Worker thread error:', error);
    parentPort.postMessage({
      taskId: task.taskId,
      type: 'error',
      error: error.message || String(error)
    });
  }
});
