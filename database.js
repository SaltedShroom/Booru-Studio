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
  `);

  migrateDownloadedPostsSchema();
  migrateTagSuggestionsSchema();

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_downloaded_posts_downloaded_at ON downloaded_posts(downloaded_at);
    CREATE INDEX IF NOT EXISTS idx_downloaded_posts_artist ON downloaded_posts(artist);
    CREATE INDEX IF NOT EXISTS idx_downloaded_posts_source ON downloaded_posts(source);
  `);
  
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
  
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO downloaded_posts 
    (id, image_url, thumbnail_url, tags, artist, score, source, aspect_ratio, created_at, downloaded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    post.id,
    post.imageUrl || null,
    post.thumbnailUrl || null,
    JSON.stringify(post.tags || []),
    post.artist || post.author || null,
    post.score || null,
    post.source || null,
    post.aspectRatio || null,
    post.createdAt || null,
    post.downloadedAt || Date.now()
  );
  
  return true;
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
  
  const stmt = db.prepare('DELETE FROM downloaded_posts WHERE id = ?');
  stmt.run(id);
  
  return true;
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
  
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO downloaded_posts 
    (id, image_url, thumbnail_url, tags, artist, score, source, aspect_ratio, created_at, downloaded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const insertMany = db.transaction((posts) => {
    let count = 0;
    for (const post of posts) {
      stmt.run(
        post.id,
        post.imageUrl || null,
        post.thumbnailUrl || null,
        JSON.stringify(post.tags || []),
        post.artist || post.author || null,
        post.score || null,
        post.source || null,
        post.aspectRatio || null,
        post.createdAt || null,
        post.downloadedAt || Date.now()
      );
      count++;
    }
    return count;
  });
  
  return insertMany(posts);
}

// Tabs operations
function saveTabs(tabs, activeTabId, isViewingDownloadsGallery, isViewingScroller, downloadsSearchText) {
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
  
  const downloadsSearchRow = settingStmt.get('downloadsSearchText');
  const downloadsSearchText = downloadsSearchRow ? downloadsSearchRow.value : '';
  
  return { tabs, activeTabId, isViewingDownloadsGallery, isViewingScroller, downloadsSearchText };
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
  loadDownloadSettings
};
