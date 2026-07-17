// SQLite Database Module for Booru Studio
// Replaces IndexedDB with server-side SQLite database

const path = require('path');
const fs = require('fs');

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

// Database file path
const DB_PATH = path.join(USER_DATA_BASE, 'data', 'booru-studio.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db = null;

// Initialize database connection
async function initDatabase() {
  const Database = require('better-sqlite3');
  
  db = new Database(DB_PATH);
  
  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');
  
  // Create tables if they don't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS downloaded_posts (
      id TEXT PRIMARY KEY,
      image_url TEXT,
      thumbnail_url TEXT,
      tags TEXT,
      artist TEXT,
      score INTEGER,
      source TEXT,
      aspect_ratio REAL,
      created_at INTEGER,
      downloaded_at INTEGER
    );
    
    CREATE TABLE IF NOT EXISTS downloaded_artists (
      artist TEXT PRIMARY KEY,
      post_count INTEGER DEFAULT 0,
      last_download_date INTEGER,
      last_download_source TEXT
    );
    
    CREATE TABLE IF NOT EXISTS tabs (
      id TEXT PRIMARY KEY,
      data TEXT
    );
    
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    
    CREATE TABLE IF NOT EXISTS tag_suggestions (
      source TEXT NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY (source, tag)
    );
    
    CREATE TABLE IF NOT EXISTS css_presets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      code TEXT,
      is_active BOOLEAN DEFAULT 0,
      order_index INTEGER,
      created_at INTEGER,
      updated_at INTEGER
    );
    
    CREATE TABLE IF NOT EXISTS homepage (
      key TEXT PRIMARY KEY,
      data TEXT
    );
  `);

  migrateDownloadedPostsSchema();
  migrateTagSuggestionsSchema();
  migrateDownloadedArtistsSchema();
  migrateDownloadedArtistsAddSourceColumn();

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_downloaded_posts_downloaded_at ON downloaded_posts(downloaded_at);
    CREATE INDEX IF NOT EXISTS idx_downloaded_posts_artist ON downloaded_posts(artist);
    CREATE INDEX IF NOT EXISTS idx_downloaded_posts_source ON downloaded_posts(source);
    CREATE INDEX IF NOT EXISTS idx_downloaded_artists_last_download ON downloaded_artists(last_download_date);
  `);
  
  // Clean up artists with 0 downloaded posts
  cleanupZeroCountArtists();
  
  // Verify schema for debugging
  verifyDownloadedArtistsSchema();
  
  ensureDefaultCSSPresets();
  
  console.log('✓ SQLite database initialized at:', DB_PATH);
  return db;
}

function migrateDownloadedPostsSchema() {
  const existingColumns = db.prepare('PRAGMA table_info(downloaded_posts)').all().map(col => col.name);
  const desiredColumns = ['id', 'image_url', 'thumbnail_url', 'tags', 'artist', 'score', 'source', 'aspect_ratio', 'created_at', 'downloaded_at'];
  const hasOldColumns = existingColumns.includes('title') || existingColumns.includes('sample_url') || existingColumns.includes('author');

  if (!existingColumns.length || !hasOldColumns) {
    return;
  }

  const artistExpr = existingColumns.includes('artist')
    ? existingColumns.includes('author')
      ? 'COALESCE(NULLIF(artist, \'\'), author) AS artist'
      : 'artist'
    : existingColumns.includes('author')
      ? 'author AS artist'
      : 'NULL AS artist';

  const selectColumns = `id, image_url, thumbnail_url, tags, ${artistExpr}, score, source, aspect_ratio, created_at, downloaded_at`;

  db.exec(`
    CREATE TABLE IF NOT EXISTS downloaded_posts_temp (
      id TEXT PRIMARY KEY,
      image_url TEXT,
      thumbnail_url TEXT,
      tags TEXT,
      artist TEXT,
      score INTEGER,
      source TEXT,
      aspect_ratio REAL,
      created_at INTEGER,
      downloaded_at INTEGER
    );
  `);

  db.exec(`
    INSERT OR REPLACE INTO downloaded_posts_temp (${desiredColumns.join(', ')})
    SELECT ${selectColumns} FROM downloaded_posts;
  `);

  db.exec(`
    DROP TABLE downloaded_posts;
    ALTER TABLE downloaded_posts_temp RENAME TO downloaded_posts;
  `);
}

// Close database connection
function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    console.log('✓ SQLite database closed');
  }
}

// Downloaded Posts operations
function saveDownloadedPost(post) {
  if (!db) throw new Error('Database not initialized');
  if (!post) throw new Error('Post object is null or undefined');
  
  // Handle score objects (e.g., e621 returns {up: X, down: Y, total: Z})
  let scoreValue = post.score;
  if (scoreValue && typeof scoreValue === 'object' && scoreValue.total !== undefined) {
    scoreValue = scoreValue.total;
  }
  
  try {
    const postId = post.id || undefined;
    const newArtist = post.artist || post.author || null;
    const downloadedAt = post.downloadedAt || Date.now();
    
    // Check if this is a new post or an update
    let existingPost = null;
    let oldArtist = null;
    let isNewPost = true;
    
    if (postId) {
      existingPost = db.prepare('SELECT artist FROM downloaded_posts WHERE id = ?').get(postId);
      if (existingPost) {
        isNewPost = false;
        oldArtist = existingPost.artist;
      }
    }
    
    // Save the post
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO downloaded_posts 
      (id, image_url, thumbnail_url, tags, artist, score, source, aspect_ratio, created_at, downloaded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      postId,
      post.imageUrl || post.image_url || null,
      post.thumbnailUrl || post.thumbnail_url || null,
      JSON.stringify(Array.isArray(post.tags) ? post.tags : []),
      newArtist,
      scoreValue !== undefined ? Number(scoreValue) : null,
      post.source || undefined,
      post.aspectRatio || post.aspect_ratio || null,
      post.createdAt || post.created_at || null,
      downloadedAt
    );
    
    // Handle artist statistics
    const postCreatedAt = post.createdAt || post.created_at || null;
    const postSource = post.source || undefined;
    // If artist changed, update the old artist's stats
    if (!isNewPost && oldArtist && oldArtist !== newArtist) {
      if (oldArtist.trim()) {
        updateArtistAfterPostDelete(oldArtist);
      }
      // Treat the new artist as a new post for this artist
      if (newArtist && newArtist.trim()) {
        updateArtistStatistics(newArtist, true, postCreatedAt, postSource);
      }
    } else {
      // Normal case: artist didn't change or this is a new post
      if (newArtist && newArtist.trim()) {
        updateArtistStatistics(newArtist, isNewPost, postCreatedAt, postSource);
      }
    }
    
    return true;
  } catch (error) {
    console.error('❌ saveDownloadedPost FAILED for post', post?.id, ':', error.message);
    throw error;
  }
}

function getDownloadedPost(id) {
  if (!db) throw new Error('Database not initialized');
  
  const stmt = db.prepare('SELECT * FROM downloaded_posts WHERE id = ?');
  const row = stmt.get(id);
  
  return row ? rowToPost(row) : null;
}

function getAllDownloadedPosts() {
  if (!db) throw new Error('Database not initialized');
  
  const stmt = db.prepare('SELECT * FROM downloaded_posts ORDER BY downloaded_at DESC');
  const rows = stmt.all();
  
  return rows.map(rowToPost);
}

function removeDownloadedPost(id) {
  if (!db) throw new Error('Database not initialized');
  
  try {
    // Get the artist of the post being deleted
    const post = db.prepare('SELECT artist FROM downloaded_posts WHERE id = ?').get(id);
    const artist = post ? post.artist : null;
    
    // Delete the post
    const stmt = db.prepare('DELETE FROM downloaded_posts WHERE id = ?');
    stmt.run(id);
    
    // Update artist statistics if artist exists
    if (artist && artist.trim()) {
      updateArtistAfterPostDelete(artist);
    }
    
    return true;
  } catch (error) {
    console.error('❌ removeDownloadedPost FAILED for post', id, ':', error.message);
    throw error;
  }
}

// ============== Artist Statistics Operations ==============

function updateArtistStatistics(artist, isNewPost, createdAt = null, source = null) {
  if (!db) throw new Error('Database not initialized');
  if (!artist || !artist.trim()) return;
  
  try {
    if (isNewPost) {
      // Check if artist exists
      const existingArtist = db.prepare(
        'SELECT post_count FROM downloaded_artists WHERE artist = ?'
      ).get(artist);
      
      if (existingArtist) {
        // Artist exists, increment post count and update source
        db.prepare(`
          UPDATE downloaded_artists 
          SET post_count = post_count + 1, last_download_source = ?
          WHERE artist = ?
        `).run(source, artist);
      } else {
        // New artist, create record with post_count = 1
        // Use post's createdAt as the initial last_download_date
        db.prepare(`
          INSERT INTO downloaded_artists (artist, post_count, last_download_date, last_download_source)
          VALUES (?, 1, ?, ?)
        `).run(artist, createdAt, source);
      }
    }
  } catch (error) {
    console.error('❌ updateArtistStatistics FAILED for artist', artist, ':', error.message);
    throw error;
  }
}

function updateArtistAfterPostDelete(artist) {
  if (!db) throw new Error('Database not initialized');
  if (!artist || !artist.trim()) return;
  
  try {
    // Count remaining posts for this artist
    const result = db.prepare(
      'SELECT COUNT(*) as count FROM downloaded_posts WHERE artist = ?'
    ).get(artist);
    
    if (result.count === 0) {
      // No more posts from this artist, delete the artist record
      db.prepare('DELETE FROM downloaded_artists WHERE artist = ?').run(artist);
    } else {
      // Update post count, preserve last_download_date
      db.prepare(`
        UPDATE downloaded_artists 
        SET post_count = ?
        WHERE artist = ?
      `).run(result.count, artist);
    }
  } catch (error) {
    console.error('❌ updateArtistAfterPostDelete FAILED for artist', artist, ':', error.message);
    throw error;
  }
}

function getDownloadedArtist(artist) {
  if (!db) throw new Error('Database not initialized');
  
  const stmt = db.prepare(
    'SELECT artist, post_count, last_download_date, last_download_source FROM downloaded_artists WHERE artist = ?'
  );
  return stmt.get(artist);
}

function getAllDownloadedArtists() {
  if (!db) throw new Error('Database not initialized');
  
  const stmt = db.prepare(`
    SELECT artist, post_count, last_download_date, last_download_source 
    FROM downloaded_artists 
    ORDER BY post_count DESC, last_download_date DESC
  `);
  return stmt.all();
}

function getDownloadedArtistCount() {
  if (!db) throw new Error('Database not initialized');
  
  const stmt = db.prepare('SELECT COUNT(*) as count FROM downloaded_artists');
  const row = stmt.get();
  
  return row.count;
}

function searchDownloadedArtists(query) {
  if (!db) throw new Error('Database not initialized');
  
  const searchTerm = `%${query}%`;
  const stmt = db.prepare(`
    SELECT artist, post_count, last_download_date, last_download_source
    FROM downloaded_artists
    WHERE artist LIKE ?
    ORDER BY post_count DESC, last_download_date DESC
  `);
  return stmt.all(searchTerm);
}

// Update artist loaded dates when posts are displayed in gallery
// Accepts an array of artists (or single artist) and a creation date
// Only updates existing artists - does NOT create new entries
function updateArtistLoadedDates(artists, createdAt) {
  if (!db) throw new Error('Database not initialized');
  if (!artists || !createdAt) return;
  
  // Normalize to array
  const artistList = Array.isArray(artists) ? artists : [artists];
  
  try {
    for (const artist of artistList) {
      // Only process non-empty artist names
      if (!artist || !artist.trim()) continue;
      
      const trimmedArtist = artist.trim();
      
      // Check if artist exists
      const existing = db.prepare(
        'SELECT last_download_date FROM downloaded_artists WHERE artist = ?'
      ).get(trimmedArtist);
      
      if (existing) {
        // Artist exists, update last_download_date if createdAt is newer
        if (!existing.last_download_date || createdAt > existing.last_download_date) {
          db.prepare(
            'UPDATE downloaded_artists SET last_download_date = ? WHERE artist = ?'
          ).run(createdAt, trimmedArtist);
        }
      }
      // NOTE: Don't create new artist entries here - artists are only created when posts are downloaded
    }
  } catch (error) {
    console.error('❌ updateArtistLoadedDates FAILED:', error.message);
    throw error;
  }
}

function searchDownloadedPosts(query) {
  if (!db) throw new Error('Database not initialized');
  
  const searchTerm = `%${query}%`;
  const stmt = db.prepare(`
    SELECT * FROM downloaded_posts 
    WHERE tags LIKE ? OR artist LIKE ?
    ORDER BY downloaded_at DESC
  `);
  const rows = stmt.all(searchTerm, searchTerm);
  
  return rows.map(rowToPost);
}

function getDownloadedPostsByArtist(artist) {
  if (!db) throw new Error('Database not initialized');
  
  const stmt = db.prepare(`
    SELECT * FROM downloaded_posts 
    WHERE artist = ?
    ORDER BY downloaded_at DESC
  `);
  const rows = stmt.all(artist);
  
  return rows.map(rowToPost);
}

function getDownloadedPostCount() {
  if (!db) throw new Error('Database not initialized');
  
  const stmt = db.prepare('SELECT COUNT(*) as count FROM downloaded_posts');
  const row = stmt.get();
  
  return row.count;
}

// Import multiple posts at once (for migration)
function bulkImportPosts(posts) {
  if (!db) throw new Error('Database not initialized');
  
  const postStmt = db.prepare(`
    INSERT OR REPLACE INTO downloaded_posts 
    (id, image_url, thumbnail_url, tags, artist, score, source, aspect_ratio, created_at, downloaded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const insertMany = db.transaction((posts) => {
    const artistStats = new Map(); // Track artist stats for efficient bulk update
    let count = 0;
    
    for (const post of posts) {
      // Handle score objects (e.g., e621 returns {up: X, down: Y, total: Z})
      let scoreValue = post.score;
      if (scoreValue && typeof scoreValue === 'object' && scoreValue.total !== undefined) {
        scoreValue = scoreValue.total;
      }
      
      try {
        const artist = post.artist || post.author || null;
        const downloadedAt = post.downloadedAt || Date.now();
        
        postStmt.run(
          post.id,
          post.imageUrl || null,
          post.thumbnailUrl || null,
          JSON.stringify(post.tags || []),
          artist,
          scoreValue !== undefined ? Number(scoreValue) : null,
          post.source || null,
          post.aspectRatio || null,
          post.createdAt || null,
          downloadedAt
        );
        
        // Track artist statistics
        if (artist && artist.trim()) {
          if (!artistStats.has(artist)) {
            artistStats.set(artist, { count: 0, latestDate: downloadedAt, latestCreatedAt: post.createdAt || null, latestSource: post.source || null });
          }
          const stats = artistStats.get(artist);
          stats.count++;
          stats.latestDate = Math.max(stats.latestDate, downloadedAt);
          // Track the latest createdAt date for this artist
          if (post.createdAt && (!stats.latestCreatedAt || post.createdAt > stats.latestCreatedAt)) {
            stats.latestCreatedAt = post.createdAt;
          }
          // Always update to the most recent source
          stats.latestSource = post.source || null;
        }
        
        count++;
      } catch (error) {
        console.error(`❌ Failed to import post ${post?.id}:`, error.message);
      }
    }
    
    // Update artist statistics
    const selectStmt = db.prepare('SELECT post_count, last_download_date FROM downloaded_artists WHERE artist = ?');
    const insertStmt = db.prepare('INSERT INTO downloaded_artists (artist, post_count, last_download_date, last_download_source) VALUES (?, ?, ?, ?)');
    const updateStmt = db.prepare('UPDATE downloaded_artists SET post_count = post_count + ?, last_download_source = ? WHERE artist = ?');
    
    for (const [artist, stats] of artistStats) {
      try {
        const existing = selectStmt.get(artist);
        if (existing) {
          // Artist exists, increment post count and update source
          updateStmt.run(stats.count, stats.latestSource || null, artist);
        } else {
          // New artist, insert with post_count
          // Use the latest createdAt date from this artist's posts as initial last_download_date
          insertStmt.run(artist, stats.count, stats.latestCreatedAt || null, stats.latestSource || null);
        }
      } catch (error) {
        console.error(`❌ Failed to update artist stats for ${artist}:`, error.message);
      }
    }
    
    return count;
  });
  
  return insertMany(posts);
}

// Tabs operations
function saveTabs(tabs, activeTabId, isViewingDownloadsGallery, isViewingScroller, downloadsSearchText, isViewingHomepage) {
  if (!db) throw new Error('Database not initialized');
  
  const deleteStmt = db.prepare('DELETE FROM tabs');
  const insertStmt = db.prepare('INSERT INTO tabs (id, data) VALUES (?, ?)');
  const settingStmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  
  const saveAll = db.transaction(() => {
    deleteStmt.run();
    for (const tab of tabs) {
      insertStmt.run(tab.id, JSON.stringify(tab));
    }
    settingStmt.run('activeTabId', activeTabId);
    settingStmt.run('isViewingDownloadsGallery', isViewingDownloadsGallery ? '1' : '0');
    settingStmt.run('isViewingScroller', isViewingScroller ? '1' : '0');
    settingStmt.run('isViewingHomepage', isViewingHomepage ? '1' : '0');
    settingStmt.run('downloadsSearchText', downloadsSearchText || '');
  });
  
  saveAll();
  return true;
}

function loadTabs() {
  if (!db) throw new Error('Database not initialized');
  
  const tabsStmt = db.prepare('SELECT data FROM tabs');
  const settingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  
  const tabRows = tabsStmt.all();
  const tabs = tabRows.map(row => JSON.parse(row.data));
  
  const activeRow = settingStmt.get('activeTabId');
  const activeTabId = activeRow ? activeRow.value : null;
  
  const downloadsGalleryRow = settingStmt.get('isViewingDownloadsGallery');
  const isViewingDownloadsGallery = downloadsGalleryRow ? downloadsGalleryRow.value === '1' : false;
  
  const scrollerRow = settingStmt.get('isViewingScroller');
  const isViewingScroller = scrollerRow ? scrollerRow.value === '1' : false;
  
  const homepageRow = settingStmt.get('isViewingHomepage');
  const isViewingHomepage = homepageRow ? homepageRow.value === '1' : false;
  
  const downloadsSearchRow = settingStmt.get('downloadsSearchText');
  const downloadsSearchText = downloadsSearchRow ? downloadsSearchRow.value : '';
  
  return { tabs, activeTabId, isViewingDownloadsGallery, isViewingScroller, isViewingHomepage, downloadsSearchText };
}

// Settings operations
function saveSetting(key, value) {
  if (!db) throw new Error('Database not initialized');
  
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  stmt.run(key, JSON.stringify(value));
  
  return true;
}

function loadSetting(key) {
  if (!db) throw new Error('Database not initialized');
  
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const row = stmt.get(key);
  
  return row ? JSON.parse(row.value) : null;
}

function clearSettings() {
  if (!db) throw new Error('Database not initialized');
  
  db.prepare('DELETE FROM tabs').run();
  db.prepare('DELETE FROM settings').run();
  
  return true;
}

// Homepage operations
function saveHomepageData(key, data) {
  if (!db) throw new Error('Database not initialized');
  
  const stmt = db.prepare('INSERT OR REPLACE INTO homepage (key, data) VALUES (?, ?)');
  stmt.run(key, JSON.stringify(data));
  
  return true;
}

function loadHomepageData(key) {
  if (!db) throw new Error('Database not initialized');
  
  const stmt = db.prepare('SELECT data FROM homepage WHERE key = ?');
  const row = stmt.get(key);
  
  return row ? JSON.parse(row.data) : null;
}

function initializeHomepageSetup() {
  if (!db) throw new Error('Database not initialized');
  
  // Initialize setup entry with empty posts array if it doesn't exist
  const existing = loadHomepageData('setup');
  if (!existing) {
    saveHomepageData('setup', {
      posts: [],
      currentBatchIndex: 0
    });
  }
  
  return true;
}

// Helper function to convert database row to post object
function rowToPost(row) {
  return {
    id: row.id,
    imageUrl: row.image_url,
    thumbnailUrl: row.thumbnail_url,
    tags: JSON.parse(row.tags || '[]'),
    author: row.artist,
    artist: row.artist,
    score: row.score,
    source: row.source,
    aspectRatio: row.aspect_ratio,
    createdAt: row.created_at,
    downloadedAt: row.downloaded_at
  };
}

// ============== Session operations ==============

function saveSession(sessionData) {
  if (!db) throw new Error('Database not initialized');
  
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  stmt.run('session', JSON.stringify(sessionData));
  
  return true;
}

function loadSession() {
  if (!db) throw new Error('Database not initialized');
  
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const row = stmt.get('session');
  
  if (row) {
    return JSON.parse(row.value);
  }
  
  // Return default session if none exists
  return {
    imageList: [],
    promptDetails: [],
    logs: [],
    currentIndex: -1,
    activeTab: 'booru',
    toggleState: false,
    outputDir: path.join(USER_DATA_BASE, 'output')
  };
}

// ============== Tag Suggestions operations ==============

function saveTagSuggestions(tagData) {
  if (!db) throw new Error('Database not initialized');

  const deleteStmt = db.prepare('DELETE FROM tag_suggestions');
  const insertStmt = db.prepare('INSERT OR REPLACE INTO tag_suggestions (source, tag) VALUES (?, ?)');
  
  const saveAll = db.transaction((data) => {
    deleteStmt.run();
    for (const source of Object.keys(data || {})) {
      const tags = Array.isArray(data[source]) ? data[source] : [];
      const seen = new Set();
      for (const tag of tags) {
        if (typeof tag !== 'string' || tag.length === 0) continue;
        if (seen.has(tag)) continue;
        seen.add(tag);
        insertStmt.run(source, tag);
      }
    }
  });

  saveAll(tagData);
  return true;
}

function loadTagSuggestions() {
  if (!db) throw new Error('Database not initialized');
  
  const rows = db.prepare('SELECT source, tag FROM tag_suggestions ORDER BY source, tag').all();
  const suggestions = {};
  for (const row of rows) {
    if (!suggestions[row.source]) suggestions[row.source] = [];
    suggestions[row.source].push(row.tag);
  }
  return suggestions;
}

function queryTagSuggestions(source, prefix = '', limit = 10) {
  if (!db) throw new Error('Database not initialized');
  if (typeof source !== 'string' || source.length === 0) return [];
  if (typeof prefix !== 'string') prefix = '';

  const sanitizedPrefix = prefix.replace(/[%_]/g, '\\$&');
  const likePattern = sanitizedPrefix.length ? `${sanitizedPrefix}%` : '%';

  const stmt = db.prepare(`
    SELECT tag
    FROM tag_suggestions
    WHERE source = ?
      AND tag LIKE ? ESCAPE '\\'
    ORDER BY tag
    LIMIT ?
  `);
  return stmt.all(source, likePattern, limit).map(row => row.tag);
}

function migrateTagSuggestionsSchema() {
  if (!db) throw new Error('Database not initialized');

  const tableInfo = db.prepare('PRAGMA table_info(tag_suggestions)').all();
  const columns = tableInfo.map(col => col.name);
  const hasSourceColumn = columns.includes('source');
  const hasTagColumn = columns.includes('tag');
  const hasSourcesColumn = columns.includes('sources');

  if (hasTagColumn && hasSourcesColumn && !hasSourceColumn) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tag_suggestions_new (
        source TEXT NOT NULL,
        tag TEXT NOT NULL,
        PRIMARY KEY (source, tag)
      );
    `);

    const rows = db.prepare('SELECT tag, sources FROM tag_suggestions').all();
    const insertStmt = db.prepare('INSERT OR IGNORE INTO tag_suggestions_new (source, tag) VALUES (?, ?)');
    const migrateOld = db.transaction((items) => {
      for (const row of items) {
        let sources;
        try {
          sources = JSON.parse(row.sources);
        } catch (err) {
          sources = [];
        }
        if (!Array.isArray(sources)) sources = [];
        for (const source of sources) {
          if (typeof source !== 'string' || source.length === 0) continue;
          insertStmt.run(source, row.tag);
        }
      }
    });

    migrateOld(rows);
    db.exec('DROP TABLE tag_suggestions;');
    db.exec('ALTER TABLE tag_suggestions_new RENAME TO tag_suggestions;');
  }

  db.exec('CREATE INDEX IF NOT EXISTS idx_tag_suggestions_source_tag ON tag_suggestions(source, tag);');

  const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get('tag_suggestions');
  if (existing && existing.value) {
    let suggestions;
    try {
      suggestions = JSON.parse(existing.value);
    } catch (err) {
      console.warn('Could not parse existing tag_suggestions JSON:', err);
      suggestions = null;
    }

    if (suggestions && typeof suggestions === 'object') {
      const insertStmt = db.prepare('INSERT OR IGNORE INTO tag_suggestions (source, tag) VALUES (?, ?)');
      const insertMany = db.transaction((data) => {
        for (const source of Object.keys(data)) {
          const tags = Array.isArray(data[source]) ? data[source] : [];
          const seen = new Set();
          for (const tag of tags) {
            if (typeof tag !== 'string' || tag.length === 0) continue;
            if (seen.has(tag)) continue;
            seen.add(tag);
            insertStmt.run(source, tag);
          }
        }
      });
      insertMany(suggestions);
    }

    db.prepare('DELETE FROM settings WHERE key = ?').run('tag_suggestions');
  }
}

// Migrate downloaded_artists table schema
function migrateDownloadedArtistsSchema() {
  if (!db) throw new Error('Database not initialized');

  try {
    const tableInfo = db.prepare('PRAGMA table_info(downloaded_artists)').all();
    const columns = tableInfo.map(col => col.name);
    const hasOldColumn = columns.includes('latest_download_date');
    const hasNewColumn = columns.includes('last_download_date');

    // If table has old column and not new column, rename it
    if (hasOldColumn && !hasNewColumn) {
      db.exec(`
        CREATE TABLE downloaded_artists_new (
          artist TEXT PRIMARY KEY,
          post_count INTEGER DEFAULT 0,
          last_download_date INTEGER,
          last_download_source TEXT
        );
      `);

      db.exec(`
        INSERT INTO downloaded_artists_new (artist, post_count, last_download_date, last_download_source)
        SELECT artist, post_count, latest_download_date, NULL FROM downloaded_artists;
      `);

      db.exec(`
        DROP TABLE downloaded_artists;
        ALTER TABLE downloaded_artists_new RENAME TO downloaded_artists;
      `);

      console.log('✓ Verified downloaded_artists table has last_download_date column');
    }
  } catch (error) {
    console.warn('⚠ Error checking/migrating downloaded_artists schema:', error.message);
  }
}

// Add last_download_source column to existing databases
function migrateDownloadedArtistsAddSourceColumn() {
  if (!db) throw new Error('Database not initialized');

  try {
    const tableInfo = db.prepare('PRAGMA table_info(downloaded_artists)').all();
    const columns = tableInfo.map(col => col.name);
    const hasSourceColumn = columns.includes('last_download_source');

    console.log('Downloaded artists columns before migration:', columns.join(', '));

    if (!hasSourceColumn) {
      console.log('⚠ last_download_source column missing, attempting to add...');
      
      try {
        // Try direct ALTER TABLE first
        db.prepare('ALTER TABLE downloaded_artists ADD COLUMN last_download_source TEXT').run();
        console.log('✓ Successfully added last_download_source column via ALTER TABLE');
      } catch (alterError) {
        console.warn('⚠ ALTER TABLE failed:', alterError.message);
        console.log('Attempting to recreate table with new schema...');
        
        // Fallback: recreate the table with the new column
        try {
          db.exec(`
            CREATE TABLE downloaded_artists_backup AS 
            SELECT artist, post_count, last_download_date FROM downloaded_artists;
            
            DROP TABLE downloaded_artists;
            
            CREATE TABLE downloaded_artists (
              artist TEXT PRIMARY KEY,
              post_count INTEGER DEFAULT 0,
              last_download_date INTEGER,
              last_download_source TEXT
            );
            
            INSERT INTO downloaded_artists (artist, post_count, last_download_date, last_download_source)
            SELECT artist, post_count, last_download_date, NULL FROM downloaded_artists_backup;
            
            DROP TABLE downloaded_artists_backup;
            
            CREATE INDEX IF NOT EXISTS idx_downloaded_artists_last_download ON downloaded_artists(last_download_date);
          `);
          console.log('✓ Successfully recreated table with last_download_source column');
        } catch (recreateError) {
          console.error('❌ Failed to recreate table:', recreateError.message);
          throw recreateError;
        }
      }
    } else {
      console.log('✓ last_download_source column already exists');
    }
    
    // Verify the column now exists
    const finalTableInfo = db.prepare('PRAGMA table_info(downloaded_artists)').all();
    const finalColumns = finalTableInfo.map(col => col.name);
    console.log('Downloaded artists columns after migration:', finalColumns.join(', '));
    
  } catch (error) {
    console.error('❌ Error during schema migration:', error.message);
  }
}

// Clean up artists with 0 downloaded posts
function cleanupZeroCountArtists() {
  if (!db) throw new Error('Database not initialized');

  try {
    // First, check how many records have post_count = 0
    const checkStmt = db.prepare('SELECT COUNT(*) as count FROM downloaded_artists WHERE post_count = 0 OR post_count IS NULL');
    const checkResult = checkStmt.get();
    
    if (checkResult && checkResult.count > 0) {
      console.log(`⚠ Found ${checkResult.count} artist records with post_count = 0 or NULL, cleaning up...`);
      
      const result = db.prepare('DELETE FROM downloaded_artists WHERE post_count = 0 OR post_count IS NULL').run();
      console.log(`✓ Cleaned up ${result.changes} artist records with post_count = 0 or NULL`);
    } else {
      console.log('✓ No artist records with post_count = 0 to clean up');
    }
  } catch (error) {
    console.warn('⚠ Error cleaning up zero-count artists:', error.message);
  }
}

// Verify the last_download_source column was added and check database state
function verifyDownloadedArtistsSchema() {
  if (!db) throw new Error('Database not initialized');

  try {
    const tableInfo = db.prepare('PRAGMA table_info(downloaded_artists)').all();
    const columns = tableInfo.map(col => col.name);
    
    console.log('Downloaded Artists table columns:', columns.join(', '));
    
    const artistCount = db.prepare('SELECT COUNT(*) as count FROM downloaded_artists').get();
    console.log(`Total artists in table: ${artistCount.count}`);
    
    const withSourceCount = db.prepare('SELECT COUNT(*) as count FROM downloaded_artists WHERE last_download_source IS NOT NULL').get();
    if (withSourceCount) {
      console.log(`Artists with last_download_source: ${withSourceCount.count}`);
    }
  } catch (error) {
    console.warn('⚠ Error verifying schema:', error.message);
  }
}

// ============== Ensure Default CSS Presets ==============

function ensureDefaultCSSPresets() {
  if (!db) throw new Error('Database not initialized');
  
  const defaultPresetName = 'Gallery | noGaps';
  const defaultPresetCode = `.booru-gallery {
  gap: 0px;
}
.booru-image-item .item-overlay {
  opacity: 0;
}
.booru-gallery:not(.downloads-gallery) .booru-image-item[data-downloaded="true"] {
  scale: 1;
}`;

  try {
    // Check if we've already attempted to install the default preset
    const flagStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
    const installed = flagStmt.get('default_preset_installed');

    if (!installed) {
      // Install the default preset on first run only
      const id = 'preset_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      const now = Date.now();

      const insertStmt = db.prepare(`
        INSERT INTO css_presets (id, name, code, is_active, order_index, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      insertStmt.run(
        id,
        defaultPresetName,
        defaultPresetCode,
        0,
        0,
        now,
        now
      );

      // Mark as installed so it won't be reinstalled on future app restarts
      const settingStmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
      settingStmt.run('default_preset_installed', '1');

      console.log('✓ Default CSS preset installed:', defaultPresetName);
    }
  } catch (error) {
    console.error('❌ ensureDefaultCSSPresets FAILED:', error.message);
  }
}

// ============== Download Settings operations ==============

function saveDownloadSettings(settingsData) {
  if (!db) throw new Error('Database not initialized');
  
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  stmt.run('download_settings', JSON.stringify(settingsData));
  
  return true;
}

function loadDownloadSettings() {
  if (!db) throw new Error('Database not initialized');
  
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const row = stmt.get('download_settings');
  
  if (row) {
    return JSON.parse(row.value);
  }
  
  // Return default settings if none exists
  return { downloadFolder: '' };
}

// ============== CSS Presets operations ==============

function saveCSSPreset(preset) {
  if (!db) throw new Error('Database not initialized');
  if (!preset || !preset.name) throw new Error('Preset must have a name');
  
  const id = preset.id || `css-preset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const now = Date.now();
  
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO css_presets 
      (id, name, code, is_active, order_index, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id,
      preset.name,
      preset.code || '',
      preset.is_active ? 1 : 0,
      preset.order_index !== undefined ? preset.order_index : 0,
      preset.created_at || now,
      now
    );
    return id;
  } catch (error) {
    console.error('❌ saveCSSPreset FAILED:', error.message);
    throw error;
  }
}

function getAllCSSPresets() {
  if (!db) throw new Error('Database not initialized');
  
  const stmt = db.prepare('SELECT * FROM css_presets ORDER BY order_index ASC, created_at ASC');
  const rows = stmt.all();
  
  return rows || [];
}

function getActiveCSSPresets() {
  if (!db) throw new Error('Database not initialized');
  
  const stmt = db.prepare('SELECT * FROM css_presets WHERE is_active = 1 ORDER BY order_index ASC, created_at ASC');
  const rows = stmt.all();
  
  return rows || [];
}

function removeCSSPreset(id) {
  if (!db) throw new Error('Database not initialized');
  
  const stmt = db.prepare('DELETE FROM css_presets WHERE id = ?');
  stmt.run(id);
  
  return true;
}

function updateCSSPresetActiveStatus(id, isActive) {
  if (!db) throw new Error('Database not initialized');
  
  const stmt = db.prepare('UPDATE css_presets SET is_active = ?, updated_at = ? WHERE id = ?');
  stmt.run(isActive ? 1 : 0, Date.now(), id);
  
  return true;
}

module.exports = {
  initDatabase,
  closeDatabase,
  saveDownloadedPost,
  getDownloadedPost,
  getAllDownloadedPosts,
  removeDownloadedPost,
  searchDownloadedPosts,
  getDownloadedPostsByArtist,
  getDownloadedPostCount,
  bulkImportPosts,
  getDownloadedArtist,
  getAllDownloadedArtists,
  getDownloadedArtistCount,
  searchDownloadedArtists,
  updateArtistLoadedDates,
  saveTabs,
  loadTabs,
  saveSetting,
  loadSetting,
  clearSettings,
  saveSession,
  loadSession,
  saveTagSuggestions,
  loadTagSuggestions,
  queryTagSuggestions,
  saveDownloadSettings,
  loadDownloadSettings,
  saveCSSPreset,
  getAllCSSPresets,
  getActiveCSSPresets,
  removeCSSPreset,
  updateCSSPresetActiveStatus,
  ensureDefaultCSSPresets,
  updateArtistStatistics,
  updateArtistAfterPostDelete,
  verifyDownloadedArtistsSchema,
  saveHomepageData,
  loadHomepageData,
  initializeHomepageSetup
};
