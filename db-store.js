// Database Store - Client-side wrapper for server-based SQLite database
// Replaces IndexedDB with server API calls

const DB_API_BASE = 'http://localhost:3001/api/db';

class DBStore {
  constructor() {
    this.initialized = false;
  }

  async init() {
    // No client-side initialization needed - server handles database
    this.initialized = true;
    return true;
  }

  // ============== Downloaded Posts ==============

  async saveDownloadedPost(post) {
    try {
      const response = await fetch(`${DB_API_BASE}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(post)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save post');
      }
      
      return true;
    } catch (error) {
      console.error('DBStore.saveDownloadedPost error:', error);
      throw error;
    }
  }

  async getDownloadedPost(id) {
    try {
      const response = await fetch(`${DB_API_BASE}/posts/${encodeURIComponent(id)}`);
      
      if (response.status === 404) {
        return null;
      }
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get post');
      }
      
      return await response.json();
    } catch (error) {
      console.error('DBStore.getDownloadedPost error:', error);
      throw error;
    }
  }

  async getAllDownloadedPosts() {
    try {
      const response = await fetch(`${DB_API_BASE}/posts`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get posts');
      }
      
      return await response.json();
    } catch (error) {
      console.error('DBStore.getAllDownloadedPosts error:', error);
      throw error;
    }
  }

  async removeDownloadedPost(id) {
    try {
      const response = await fetch(`${DB_API_BASE}/posts/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete post');
      }
      
      return true;
    } catch (error) {
      console.error('DBStore.removeDownloadedPost error:', error);
      throw error;
    }
  }

  async searchDownloadedPosts(query) {
    try {
      const response = await fetch(`${DB_API_BASE}/posts/search?q=${encodeURIComponent(query)}`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to search posts');
      }
      
      return await response.json();
    } catch (error) {
      console.error('DBStore.searchDownloadedPosts error:', error);
      throw error;
    }
  }

  async getDownloadedPostsByArtist(artist) {
    try {
      const response = await fetch(`${DB_API_BASE}/posts/artist/${encodeURIComponent(artist)}`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get posts by artist');
      }
      
      return await response.json();
    } catch (error) {
      console.error('DBStore.getDownloadedPostsByArtist error:', error);
      throw error;
    }
  }

  async getDownloadedPostCount() {
    try {
      const response = await fetch(`${DB_API_BASE}/posts/count`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get post count');
      }
      
      const data = await response.json();
      return data.count;
    } catch (error) {
      console.error('DBStore.getDownloadedPostCount error:', error);
      throw error;
    }
  }

  // Bulk import for migration
  async bulkImportPosts(posts) {
    try {
      const response = await fetch(`${DB_API_BASE}/posts/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(posts)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to import posts');
      }
      
      const data = await response.json();
      return data.imported;
    } catch (error) {
      console.error('DBStore.bulkImportPosts error:', error);
      throw error;
    }
  }

  // ============== Tabs ==============

  async saveTabs(tabs, activeTabId) {
    try {
      const response = await fetch(`${DB_API_BASE}/tabs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tabs, activeTabId })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save tabs');
      }
      
      return true;
    } catch (error) {
      console.error('DBStore.saveTabs error:', error);
      throw error;
    }
  }

  async loadTabs() {
    try {
      const response = await fetch(`${DB_API_BASE}/tabs`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to load tabs');
      }
      
      return await response.json();
    } catch (error) {
      console.error('DBStore.loadTabs error:', error);
      throw error;
    }
  }

  // ============== Settings ==============

  async saveSetting(key, value) {
    try {
      const response = await fetch(`${DB_API_BASE}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save setting');
      }
      
      return true;
    } catch (error) {
      console.error('DBStore.saveSetting error:', error);
      throw error;
    }
  }

  async loadSetting(key) {
    try {
      const response = await fetch(`${DB_API_BASE}/settings/${encodeURIComponent(key)}`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to load setting');
      }
      
      const data = await response.json();
      return data.value;
    } catch (error) {
      console.error('DBStore.loadSetting error:', error);
      throw error;
    }
  }

  async clear() {
    // Clear tabs and settings - posts are intentionally preserved
    console.warn('DBStore.clear() - This will clear tabs and settings');
    // Implementation would require a server endpoint if needed
    return true;
  }
}

// Create global instance
const dbStore = new DBStore();
