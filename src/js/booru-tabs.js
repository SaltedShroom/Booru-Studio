booruTabs = [];

// Browser-mode fallback: custom input dialog replacing prompt()
function showFolderPrompt(defaultValue) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center';

    const box = document.createElement('div');
    box.style.cssText = 'background:#1e1e2e;border:1px solid #444;border-radius:8px;padding:24px;min-width:420px;max-width:90vw;display:flex;flex-direction:column;gap:12px';

    const label = document.createElement('label');
    label.textContent = 'Enter the full path to your download folder:';
    label.style.cssText = 'color:#cdd6f4;font-size:14px';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = defaultValue;
    input.style.cssText = 'padding:8px 10px;border-radius:4px;border:1px solid #555;background:#2a2a3e;color:#fff;font-size:14px;width:100%;box-sizing:border-box';

    const buttons = document.createElement('div');
    buttons.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';

    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    cancel.style.cssText = 'padding:6px 16px;border-radius:4px;border:1px solid #555;background:#333;color:#ccc;cursor:pointer';

    const ok = document.createElement('button');
    ok.textContent = 'OK';
    ok.style.cssText = 'padding:6px 16px;border-radius:4px;border:none;background:#7c3aed;color:#fff;cursor:pointer';

    const close = (value) => { document.body.removeChild(overlay); resolve(value); };
    cancel.addEventListener('click', () => close(null));
    ok.addEventListener('click', () => close(input.value.trim() || null));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') close(input.value.trim() || null); if (e.key === 'Escape') close(null); });

    buttons.append(cancel, ok);
    box.append(label, input, buttons);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    input.select();
  });
}


let activeTabId = null;
let tabIdCounter = 0;
let saveDebounceTimer = null;
const tagSuggestionCache = {};

// Debounce utility for performance
function debounce(func, wait) {
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(saveDebounceTimer);
      func(...args);
    };
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(later, wait);
  };
}

// Debounced save (500ms delay)
const debouncedSave = debounce(() => {
  saveBooruTabsToSession();
}, 500);

// Make it global
window.debouncedSave = debouncedSave;

// Smooth scroll state for horizontal scrolling
let scrollState = {
  targetScroll: 0,
  currentScroll: 0,
  velocity: 0,
  isAnimating: false,
  element: null
};

// Smooth scroll function with momentum and edge clamping
function smoothScroll(element, delta) {
  // Initialize or update target
  if (scrollState.element !== element) {
    scrollState.element = element;
    scrollState.currentScroll = element.scrollLeft;
    scrollState.targetScroll = element.scrollLeft;
    scrollState.velocity = 0;
  }
  
  // Add to target with momentum accumulation
  scrollState.targetScroll += delta;
  
  // Clamp target to valid scroll range to prevent bounce
  const maxScroll = element.scrollWidth - element.clientWidth;
  scrollState.targetScroll = Math.max(0, Math.min(scrollState.targetScroll, maxScroll));
  
  // Start animation if not already running
  if (!scrollState.isAnimating) {
    scrollState.isAnimating = true;
    scrollState.currentScroll = element.scrollLeft;
    animateScroll();
  }
}

function animateScroll() {
  if (!scrollState.element) {
    scrollState.isAnimating = false;
    return;
  }
  
  const element = scrollState.element;
  const diff = scrollState.targetScroll - scrollState.currentScroll;
  
  // Apply smooth interpolation (lerp with damping)
  // Higher value = faster response, lower = smoother
  const smoothing = 0.15;
  scrollState.currentScroll += diff * smoothing;
  
  // Apply to element
  element.scrollLeft = scrollState.currentScroll;
  
  // Continue animation if not close enough to target
  if (Math.abs(diff) > 0.5) {
    requestAnimationFrame(animateScroll);
  } else {
    // Snap to final position
    element.scrollLeft = scrollState.targetScroll;
    scrollState.currentScroll = scrollState.targetScroll;
    scrollState.isAnimating = false;
  }
}

// Drag and drop handlers for reordering tabs
let draggedTab = null;

function handleDragStart(e) {
  // Don't drag if clicking on close button
  if (e.target.closest('.booru-tab-close')) {
    e.preventDefault();
    return;
  }
  
  draggedTab = e.target.closest('.booru-tab-item');
  if (draggedTab) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', draggedTab.outerHTML);
    draggedTab.style.opacity = '0.5';
  }
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDrop(e) {
  e.preventDefault();
  if (draggedTab) {
    const targetTab = e.target.closest('.booru-tab-item');
    if (targetTab && targetTab !== draggedTab) {
      const container = draggedTab.parentNode;
      const rect = targetTab.getBoundingClientRect();
      const midpoint = rect.left + rect.width / 2;
      
      if (e.clientX < midpoint) {
        // Insert before target
        container.insertBefore(draggedTab, targetTab);
      } else {
        // Insert after target
        container.insertBefore(draggedTab, targetTab.nextSibling);
      }
      
      // Update booruTabs array to match new order
      updateBooruTabsOrder();
      // Save immediately for reordering
      saveBooruTabsToSession();
    }
  }
  if (draggedTab) {
    draggedTab.style.opacity = '';
    draggedTab = null;
  }
  return false;
}

function handleDragEnd(e) {
  if (draggedTab) {
    draggedTab.style.opacity = '';
    draggedTab = null;
  }
}

function updateBooruTabsOrder() {
  const container = document.getElementById('booru-tabs-container');
  const tabElements = container.querySelectorAll('.booru-tab-item');
  const newOrder = [];
  
  tabElements.forEach(el => {
    const tabId = el.dataset.tabId;
    const tab = booruTabs.find(t => t.id === tabId);
    if (tab) {
      newOrder.push(tab);
    }
  });
  
  booruTabs.length = 0;
  booruTabs.push(...newOrder);
}

// Initialize booru tabs system
async function initBooruTabs() {
    // Enable horizontal scroll with mouse wheel
    const tabsContainer = document.querySelector('.booru-tabs-container');
    const leftFade = document.getElementById('booru-tabs-left-fade');
    if (tabsContainer) {
      tabsContainer.addEventListener('wheel', function(e) {
        if (e.deltaY !== 0) {
          e.preventDefault();
          // Use deltaY for scroll amount, multiply for faster response
          smoothScroll(tabsContainer, e.deltaY * 1);
        }
      }, { passive: false });

      // Add drag and drop event listeners
      tabsContainer.addEventListener('dragstart', handleDragStart);
      tabsContainer.addEventListener('dragover', handleDragOver);
      tabsContainer.addEventListener('drop', handleDrop);
      tabsContainer.addEventListener('dragend', handleDragEnd);

      // Toggle left fade based on scroll position
      const updateLeftFade = () => {
        if (!leftFade) return;
        if (tabsContainer.scrollLeft > 8) {
          leftFade.classList.add('active');
        } else {
          leftFade.classList.remove('active');
        }
      };
      tabsContainer.addEventListener('scroll', updateLeftFade);
      // Initial state
      updateLeftFade();
    }
  const addBtn = document.getElementById('add-booru-tab-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      createNewBooruTab('Search', true, '');
    });
  }

  document.addEventListener('keydown', handleCloseActiveTabShortcut);
  
  // Folder selection button
  const folderBtn = document.getElementById('select-download-folder-btn');
  if (folderBtn) {
    folderBtn.addEventListener('click', async () => {
      let selectedPath;

      if (window.electronAPI?.selectFolder) {
        // Electron: use native folder-picker dialog
        selectedPath = await window.electronAPI.selectFolder(window.downloadFolder || 'C:\\Downloads');
        if (!selectedPath) return;
      } else {
        // Browser fallback: show a simple inline prompt modal
        selectedPath = await showFolderPrompt(window.downloadFolder || 'C:\\Downloads');
        if (!selectedPath) return;
      }

      try {
        const response = await fetch('http://localhost:3001/set-download-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folder: selectedPath })
        });
        const data = await response.json();
        if (data.success && window.downloadFolder !== undefined) {
          window.downloadFolder = data.folder;
          if (window.updateDownloadFolderDisplay) {
            window.updateDownloadFolderDisplay();
          }
          if (window.checkDownloadedImages) {
            window.checkDownloadedImages();
          }
          alert(`Download folder set to: ${data.folder}`);
        } else if (!data.success) {
          alert(`Failed to set download folder: ${data.error || 'Unknown error'}`);
        }
      } catch (error) {
        console.error('Failed to set download folder:', error);
        alert(`Failed to set download folder: ${error.message}`);
      }
    });
  }
  
  // Listen to search input changes to update tab name
  const searchInput = document.getElementById('search-filter-input');
  const suggestionField = document.getElementById('search-suggestion'); // Assume this exists in the HTML

  async function updateSuggestion() {
    const source = window.currentBooruSource || 'reddit';
    const userInput = searchInput.value.trim();
    const tokens = userInput.split(/\s+/);
    const userTag = tokens[tokens.length - 1]?.toLowerCase() || '';
    if (!userInput || !userTag) {
      suggestionField.value = "";
      return;
    }

    const cacheKey = `${source}|${userTag}`;
    let matches = tagSuggestionCache[cacheKey];

    if (!matches) {
      try {
        const response = await fetch(`http://localhost:3001/load-tag-suggestions?source=${encodeURIComponent(source)}&prefix=${encodeURIComponent(userTag)}&limit=10`);
        if (!response.ok) throw new Error('Failed to fetch tag suggestions');
        matches = await response.json();
        if (!Array.isArray(matches)) matches = [];
        tagSuggestionCache[cacheKey] = matches;
      } catch (err) {
        console.error('Tag suggestion lookup failed:', err);
        matches = [];
      }
    }

    if (matches.length > 0) {
      const suggestion = matches[0];
      const escapedUserTag = userTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      suggestionField.value = userInput.replace(new RegExp(`${escapedUserTag}$`, 'i'), suggestion);
    } else {
      suggestionField.value = "";
    }
  }

  if (searchInput && suggestionField) {
    searchInput.addEventListener('input', () => {
      if (activeTabId) {
        const tab = booruTabs.find(t => t.id === activeTabId);
        if (tab) {
          const newName = searchInput.value || 'Search';
          updateTabName(activeTabId, newName);
          saveCurrentTabState();
        }
      }
      updateSuggestion();
    });

    searchInput.addEventListener('focus', () => {
      updateSuggestion();
    });

    searchInput.addEventListener('blur', () => {
      suggestionField.value = "";
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === "Tab" && suggestionField.value) {
        e.preventDefault(); // Prevent default tab behavior
        searchInput.value = suggestionField.value; // Accept the suggestion
        suggestionField.value = ""; // Clear the suggestion
        searchInput.scrollLeft = searchInput.scrollWidth; // Move cursor to end
        if (activeTabId) {
          const newName = searchInput.value || 'Search';
          updateTabName(activeTabId, newName);
        }
      }
    });

    // Sync the scroll position of the suggestion field with the input field
    searchInput.addEventListener('scroll', () => {
      suggestionField.scrollLeft = searchInput.scrollLeft;
    });
  }
  
  // Listen to other control changes to save state
  addControlChangeListeners();
  
  // Load saved tabs and create a default one if none exist
  const hadTabs = await loadBooruTabsFromSession();
  if (!hadTabs) {
    createNewBooruTab('Search', true, '');
  }
}

// Add listeners to all controls to save state when changed
function addControlChangeListeners() {
  const controls = [
    'booru-source-select',
    'booru-sort-select', 
    'booru-limit-input',
    'image-size-slider',
    'subreddit-input'
  ];
  
  controls.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => saveCurrentTabState());
      el.addEventListener('input', () => saveCurrentTabState());
    }
  });
}

// Create a new booru tab
function createNewBooruTab(name = 'Search', switchToIt = false, initialSearch = '', scrollToTab = true) {
  const existingEndMessage = booruContent.querySelector('.booru-end-message');
  if (existingEndMessage) existingEndMessage.remove();

  const tabId = `booru-tab-${tabIdCounter++}`;
  
  const tab = {
    id: tabId,
    name: name,
    state: getCurrentState(),
    scrollPosition: 0,
    booruPosts: [],
    totalResultCount: null,
    hasMoreResults: true,
    needsInitialLoad: !!initialSearch
  };

  // Override search tags if provided
  if (initialSearch) {
    tab.state.searchTags = initialSearch;
  }

  booruTabs.push(tab);
  createTabButton(tab);
  // Scroll the tabs container to the right after adding the new tab
  if (scrollToTab) {
    setTimeout(() => {
      const tabsContainer = document.getElementById('booru-tabs-container');
      if (tabsContainer) {
        tabsContainer.scrollTo({ left: tabsContainer.scrollWidth, behavior: 'smooth' });
      }
    }, 50);
  }
  if (switchToIt) {
    switchToTab(tabId);
  }
  saveBooruTabsToSession();

  if (name === 'Search') {
    setTimeout(() => {
      if (searchFilterInput) {
        searchFilterInput.value = "";
      }
      // Focus search input for convenience
      const searchInput = document.getElementById('search-filter-input');
      if (searchInput) {
        searchInput.focus();
      }
    }, 100);
  }
  
  return tabId;
}

// Get current state from controls
function getCurrentState() {
  return {
    source: document.getElementById('booru-source-select')?.value || 'reddit',
    sort: document.getElementById('booru-sort-select')?.value || 'hot',
    limit: parseInt(document.getElementById('booru-limit-input')?.value) || 100,
    imageSize: parseInt(document.getElementById('image-size-slider')?.value) || 250,
    searchTags: document.getElementById('search-filter-input')?.value || '',
    subreddit: document.getElementById('subreddit-input')?.value || '',
    aiFilterEnabled: window.aiFilterEnabled || false
  };
}

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

// Apply state to controls
function applyState(state) {
  const searchInput = document.getElementById('search-filter-input');
  const sourceSelect = document.getElementById('booru-source-select');
  const sortSelect = document.getElementById('booru-sort-select');
  const limitInput = document.getElementById('booru-limit-input');
  const sizeSlider = document.getElementById('image-size-slider');
  const sizeValue = document.getElementById('image-size-value');
  const subredditInput = document.getElementById('subreddit-input');
  
  if (sourceSelect && sourceSelect.value !== state.source) {
    sourceSelect.value = state.source || 'reddit';
  }
  if (sortSelect && sortSelect.value !== state.sort) {
    sortSelect.value = state.sort || 'hot';
  }
  if (limitInput && limitInput.value !== String(state.limit)) {
    limitInput.value = state.limit || 100;
  }
  if (sizeSlider && sizeSlider.value !== String(state.imageSize)) {
    sizeSlider.value = state.imageSize || 250;
    document.documentElement.style.setProperty('--booru-image-size', `${Math.min(state.imageSize || 250, 300)}px`);
  }
  if (sizeValue) {
    sizeValue.textContent = `${state.imageSize || 250}px`;
  }
  if (subredditInput && subredditInput.value !== state.subreddit) {
    subredditInput.value = state.subreddit || '';
  }
  
  if (window.aiFilterEnabled !== state.aiFilterEnabled) {
    window.aiFilterEnabled = state.aiFilterEnabled;
    updateAiFilterButton();
  }
  
  // Trigger source change to update UI visibility
  if (typeof handleSourceChange === 'function') {
    handleSourceChange();
  }
  
  // Re-apply sort after handleSourceChange rebuilds sort options
  if (sortSelect && state.sort) {
    const optionExists = Array.from(sortSelect.options).some(opt => opt.value === state.sort);
    if (optionExists) {
      sortSelect.value = state.sort;
    }
  }

  const imageSizeSlider = document.getElementById('image-size-slider');
  const currentImageSize = parseInt(imageSizeSlider.value, 10);
  // Set the CSS variable for image size on the gallery wrapper instead of document root
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

}

// Save current tab state (called frequently, uses debouncing)
function saveCurrentTabState() {
  if (activeTabId) {
    const tab = booruTabs.find(t => t.id === activeTabId);
    if (tab) {
      tab.state = getCurrentState();
      
      // Save scroll position
      const content = document.querySelector('.booru-content');
      if (content) {
        tab.scrollPosition = content.scrollTop;

        // Also record the first post that is at least partially visible so we
        // can restore by element anchor instead of a raw pixel offset (which
        // becomes unreliable after a full gallery re-render + JG reflow).
        const contentRect = content.getBoundingClientRect();
        const items = content.querySelectorAll('.booru-image-item');
        tab.firstVisiblePostId = null;
        for (const item of items) {
          const rect = item.getBoundingClientRect();
          if (rect.bottom > contentRect.top && rect.top < contentRect.bottom) {
            tab.firstVisiblePostId = item.dataset.postId || null;
            break;
          }
        }
      }
      
      // Save booruPosts array (just data, no HTML)
      if (window.booruPosts) {
        tab.booruPosts = [...window.booruPosts];
      }
      
      // Save pagination state
      if (window.totalResultCount !== undefined) {
        tab.totalResultCount = window.totalResultCount;
      }
      if (window.hasMoreResults !== undefined) {
        tab.hasMoreResults = window.hasMoreResults;
      }
      
      // Use debounced save to avoid constant writes
      debouncedSave();
    }
  }
}

// Create tab button
function createTabButton(tab) {
  const container = document.getElementById('booru-tabs-container');
  if (!container) return;
  
  const tabButton = document.createElement('div');
  tabButton.className = 'booru-tab-item';
  tabButton.draggable = true;
  tabButton.dataset.tabId = tab.id;
  
  const tabName = document.createElement('span');
  tabName.className = 'booru-tab-name';
  tabName.textContent = tab.name;
  tabName.title = tab.name;
  
  const closeBtn = document.createElement('span');
  closeBtn.className = 'booru-tab-close';
  closeBtn.innerHTML = '<i class="fas fa-times"></i>';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeBooruTab(tab.id);
  });
  
  tabButton.appendChild(tabName);
  tabButton.appendChild(closeBtn);
  tabButton.addEventListener('click', () => switchToTab(tab.id));
  
  container.appendChild(tabButton);
}

function handleCloseActiveTabShortcut(e) {
  if (!((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key && e.key.toLowerCase() === 'w')) {
    return;
  }

  const activeElement = document.activeElement;
  if (activeElement && (
    activeElement.tagName === 'INPUT' ||
    activeElement.tagName === 'TEXTAREA' ||
    activeElement.tagName === 'SELECT' ||
    activeElement.isContentEditable
  )) {
    return;
  }

  if (activeTabId) {
    e.preventDefault();
    closeBooruTab(activeTabId);
  }
}

// Switch to a specific tab
function switchToTab(tabId) {
  document.getElementById('load-more-icon')?.remove();
  const existingSidebar = document.getElementById('downloads-sidebar');
  if (existingSidebar)
    existingSidebar.remove();
  const galleryWrapper = document.getElementById('gallery-wrapper');
  galleryWrapper.querySelectorAll('.booru-gallery:not([id])').forEach(gallery => gallery.remove());
  const artistSeperators = galleryWrapper.querySelectorAll('.artist-separator');
  artistSeperators.forEach(separator => separator.remove());

  const tabsContainer = document.getElementById('booru-tabs-container');
  const tabButton = tabsContainer && tabsContainer.querySelector(`.booru-tab-item[data-tab-id="${tabId}"]`);
  // Scroll the selected tab into view, aligning its left edge with the container
  setTimeout(() => {
    if (tabsContainer && tabButton) {
      const containerRect = tabsContainer.getBoundingClientRect();
      const tabRect = tabButton.getBoundingClientRect();
      // If the tab is not fully visible, scroll so its left edge is at the left of the container
      if (tabRect.left < containerRect.left || tabRect.right > containerRect.right - 60) {
        const scrollLeft = tabButton.offsetLeft + tabRect.width - containerRect.width + 190;
        tabsContainer.scrollTo({ left: scrollLeft, behavior: 'smooth' });
      }
    }
  }, 50);
  // Abort any ongoing Booru loading
  if (window.currentAbortController) {
    window.currentAbortController.abort();
  }

  // Save current tab state FIRST — while the gallery DOM is still intact
  // so that firstVisiblePostId and scrollPosition are captured correctly.
  // (cleanupGallery below removes all .booru-image-item nodes, so saving
  //  after it would always produce firstVisiblePostId = null)
  if (activeTabId && activeTabId !== tabId) {
    saveCurrentTabState();
  }
  
  // Clean up previous tab's gallery to prevent memory leaks
  if (activeTabId && activeTabId !== tabId) {
    const booruGallery = document.getElementById('booru-gallery');
    if (booruGallery && typeof window.cleanupGallery !== 'undefined') {
      // Only cleanup if gallery has content to avoid unnecessary work
      if (booruGallery.children.length > 0) {
        window.cleanupGallery(booruGallery);
      }
    }
  }
  
  // Set downloads gallery to false when switching to a tab
  let wasViewingDownloads = window.isViewingDownloadsGallery;
  window.isViewingDownloadsGallery = false;
  debouncedSave();
  
  if (wasViewingDownloads) {
    const downloadsGalleries = document.querySelectorAll('.downloads-gallery');
    // check if downloadsGalleries exist before trying to remove class
    if (downloadsGalleries) {
      // foreach gallery in downloadGalleries remove gallery that has no id
      downloadsGalleries.forEach(gallery => {
        if (!gallery.id) { gallery.remove(); }
      });
      const booruGallery = document.getElementById('booru-gallery');
      booruGallery.innerHTML = '';
    }

    // Reset downloads pagination state
    window.allDownloadedPosts = null;
    window.downloadsPaginationIndex = 0;
    
    // Restore header controls
    const controlBar = document.querySelector('header.control-bar.booru-control-bar');
    if (controlBar) {
      controlBar.querySelectorAll('.booru-control-left > *').forEach(el => el.style.display = '');
      controlBar.querySelectorAll('.booru-control-right > *').forEach(el => el.style.display = '');
      const aiFilter = controlBar.querySelector('#ai-filter-toggle');
      if (aiFilter) aiFilter.style.display = '';
      const galleryQualityToggleBtn = controlBar.querySelector('#gallery-quality-toggle');
      if (galleryQualityToggleBtn) galleryQualityToggleBtn.style.display = '';
      const reloadBtn = controlBar.querySelector('#reload-booru-btn');
      if (reloadBtn) reloadBtn.style.display = '';
    }
    const downloadsDateSortSection = document.querySelector('.control-section-downloads-date-order');
    if (downloadsDateSortSection) downloadsDateSortSection.remove();
    // Remove downloads button active
    const showDownloadsBtn = document.getElementById('show-downloads-gallery-btn');
    if (showDownloadsBtn) showDownloadsBtn.classList.remove('active');
    // Remove scroller button active
    const showScrollerBtn = document.getElementById('show-scroller-btn');
    if (showScrollerBtn) showScrollerBtn.classList.remove('active');
    // Remove downloads-gallery class from gallery
    const booruGallery = document.getElementById('booru-gallery');
    if (booruGallery) {
      booruGallery.classList.remove('downloads-gallery');
    }
    // Hide downloads-only artist/source controls when returning to a normal tab
    const artistSection = document.querySelector('.control-section-artist');
    if (artistSection) artistSection.style.display = 'none';
    const sourceSection = document.querySelector('.control-section-source');
    if (sourceSection) sourceSection.style.display = 'none';
    // Remove downloads search handler
    const searchInput = document.getElementById('search-filter-input');
    if (searchInput && searchInput._downloadsSearchHandler) {
      searchInput.removeEventListener('input', searchInput._downloadsSearchHandler);
      delete searchInput._downloadsSearchHandler;
    }
    // Remove shuffle button if it exists
    const shuffleBtn = document.getElementById('downloads-shuffle-btn');
    if (shuffleBtn) shuffleBtn.remove();
    const sortArtistBtn = document.getElementById('downloads-sort-artist-btn');
    if (sortArtistBtn) sortArtistBtn.remove();
  }

  if (tabButton) {
    const tags = tabButton.querySelector('span')?.title;
    if (tags) {
      searchFilterInput.value = tags;
    }
  }
  
  if (activeTabId === tabId) return;
  
  // Force close preview when switching tabs - aggressively hide it
  const booruHoverPreview = document.querySelector('booru-hover-preview');
  if (booruHoverPreview) {
    booruHoverPreview.classList.remove('active', 'frozen');
    booruHoverPreview.querySelector('video')?.pause();
    // Force display none with !important-like effect
    booruHoverPreview.style.setProperty('display', 'none', 'important');
    // Remove inline style after a delay
    setTimeout(() => {
      booruHoverPreview.style.removeProperty('display');
    }, 100);
  }
  // Reset preview frozen state in booru-browser scope (even if shift is held)
  if (typeof window.resetPreviewFrozen === 'function') {
    window.resetPreviewFrozen();
  }
  
  // (State already saved above, before cleanupGallery)
  
  // Call hook for booru source change tracking BEFORE updating activeTabId
  const previousTabId = activeTabId;
  if (window._onBooruTabSwitch) {
    window._onBooruTabSwitch(tabId, previousTabId);
  }
  
  activeTabId = tabId;
  window.activeTabId = activeTabId;
  
  // Show control bar when a tab is active
  const controlBar = document.querySelector('.booru-control-bar');
  if (controlBar) {
    controlBar.style.display = 'flex';
  }
  
  // Update tab button appearance
  document.querySelectorAll('.booru-tab-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tabId === tabId);
  });
  
  // Load and apply the tab's state
  const tab = booruTabs.find(t => t.id === tabId);
  if (tab) {
      const renderTab = () => {
        // Restore booruPosts array first
        if (tab.booruPosts && tab.booruPosts.length > 0) {
          window.booruPosts = [...tab.booruPosts];
        } else {
          window.booruPosts = [];
        }
        
        // Restore pagination state
        if (tab.totalResultCount !== undefined) {
          window.totalResultCount = tab.totalResultCount;
        }
        if (tab.hasMoreResults !== undefined) {
          window.hasMoreResults = tab.hasMoreResults;
        }
        
        // Apply state to controls
        applyState(tab.state);
        
        // If this tab needs initial load, trigger it
        if (tab.needsInitialLoad) {
          tab.needsInitialLoad = false;
          setTimeout(() => {
            if (typeof loadBooruImages === 'function') {
              loadBooruImages(false);
            }
          }, 100);
        }
        
        // Update currentImageSize for rendering
        if (typeof window.currentImageSize !== 'undefined') {
          window.currentImageSize = tab.state.imageSize || 250;
        }
        
        // Rebuild gallery from data.
        // Hide the content area first so the render + scroll-restore happen
        // invisibly; we fade it back in once everything is in place.
        const content = document.querySelector('.booru-content');
        const gallery = document.getElementById('booru-gallery');
        if (content) {
          content.classList.add('hidden');
        }

        // Restore scroll position after gallery renders, then reveal the content.
        const revealContent = () => {
          if (content) {
            content.classList.remove('hidden');
          }
        };

        // Register jg.complete listener BEFORE calling renderBooruGallery so it
        // catches the initial layout event instead of a later infinite-scroll one.
        if (content && (tab.firstVisiblePostId || tab.scrollPosition)) {
          let restored = false;

          const restoreScroll = () => {
            if (restored) return;
            restored = true;
            if (tab.firstVisiblePostId) {
              const anchor = gallery && gallery.querySelector(
                `.booru-image-item[data-post-id="${CSS.escape(tab.firstVisiblePostId)}"]`
              );
              if (anchor) {
                content.scrollTop = anchor.offsetTop;
                revealContent();
                return;
              }
            }
            // Fallback to raw pixel offset
            if (tab.scrollPosition) {
              content.scrollTop = tab.scrollPosition;
            }
            revealContent();
          };

          if (gallery && typeof $ !== 'undefined' && typeof $.fn.justifiedGallery !== 'undefined') {
            $(gallery).one('jg.complete', () => setTimeout(restoreScroll, 30));
          }
          // Fallback: if jg.complete never fires within 800 ms, restore anyway
          setTimeout(restoreScroll, 800);
        } else {
          // No scroll to restore — just reveal after JG lays out
          if (gallery && typeof $ !== 'undefined' && typeof $.fn.justifiedGallery !== 'undefined') {
            $(gallery).one('jg.complete', () => setTimeout(revealContent, 30));
          }
          setTimeout(revealContent, 800);
        }

        if (window.booruPosts.length > 0) {
          if (typeof renderBooruGallery === 'function') {
            gallery.classList.remove('downloads-gallery');
            renderBooruGallery(window.booruPosts, false);
          }
        } else {
          if (gallery) gallery.innerHTML = '';
        }

        // Update total count display
        if (typeof updateTotalCountDisplay === 'function') {
          updateTotalCountDisplay();
        }
      };

      if (tab.booruPosts && tab.booruPosts.length > 0) {
        restoreThumbnailCacheForTab(tabId).then(renderTab).catch((err) => {
          console.warn('Thumbnail cache restore failed:', err);
          renderTab();
        });
      } else {
        renderTab();
      }
    }
  const searchInput = document.getElementById('search-filter-input');
  if (searchInput.value.toLowerCase() == 'search' || searchInput.value.toLowerCase() == 'new tab') { searchInput.value = ''; };
  
  saveBooruTabsToSession();

  const booruGallery = document.getElementById('booru-gallery');
  if (booruGallery) {
    if (booruGallery.children.length === 0) {
      document.getElementById('load-more-icon')?.remove();
      booruGallery.innerHTML = '<i class="fa-regular fa-images cleanup-icon"></i> <i class="fa-solid fa-magnifying-glass cleanup-icon"></i>';
    }
  }

}

// Update tab name
function updateTabName(tabId, newName) {
  const tab = booruTabs.find(t => t.id === tabId);
  if (tab) {
    tab.name = newName;
    const tabButton = document.querySelector(`.booru-tab-item[data-tab-id="${tabId}"]`);
    if (tabButton) {
      const nameSpan = tabButton.querySelector('.booru-tab-name');
      if (nameSpan) {
        nameSpan.textContent = newName;
        nameSpan.title = newName;
      }
    }
    saveBooruTabsToSession();
  }
}

// Close a tab
function closeBooruTab(tabId) {
  const tabIndex = booruTabs.findIndex(t => t.id === tabId);
  if (tabIndex === -1) return;
  
  // Clear cached thumbnails for this tab
  if (window.clearThumbnailCacheForTab) {
    window.clearThumbnailCacheForTab(tabId);
  }
  
  // Clean up the tab's data to free memory
  const tab = booruTabs[tabIndex];
  if (tab && tab.booruPosts) {
    tab.booruPosts = [];
  }
  
  booruTabs.splice(tabIndex, 1);
  
  const tabButton = document.querySelector(`.booru-tab-item[data-tab-id="${tabId}"]`);
  if (tabButton) tabButton.remove();
  
  if (activeTabId === tabId) {
    // Clean up gallery before switching
    const booruGallery = document.getElementById('booru-gallery');
    if (booruGallery && typeof window.cleanupGallery !== 'undefined') {
      window.cleanupGallery(booruGallery);
    }
    
    if (booruTabs.length > 0) {
      const newActiveTab = booruTabs[Math.min(Math.max(0, tabIndex), booruTabs.length - 1)];
      if (newActiveTab) {
        switchToTab(newActiveTab.id);
      }
    } else {
      createNewBooruTab('Search', true, '');
      if (typeof showToast === 'function') {
        showToast('Closed last tab and opened a new one', 'success');
      }
      return;
    }
  }
  
  saveBooruTabsToSession();
}

// Save tabs to SQLite database via server API
async function saveBooruTabsToSession() {
  const tabsData = {
    tabs: booruTabs,
    activeTabId: (window.isViewingScroller || window.isViewingDownloadsGallery) ? null : activeTabId, // Clear activeTabId when not viewing a booru tab
    isViewingDownloadsGallery: window.isViewingDownloadsGallery || false,
    isViewingScroller: window.isViewingScroller || false,
    downloadsSearchText: window.downloadsSearchText || ''
  };
  
  try {
    await fetch('http://localhost:3001/api/db/tabs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tabsData)
    });
  } catch (err) {
    console.error('Error saving booru tabs:', err);
  }
}

// Make it global
window.saveBooruTabsToSession = saveBooruTabsToSession;
window.switchToTab = switchToTab;

// Load tabs from SQLite database via server API
async function loadBooruTabsFromSession() {
  try {
    const response = await fetch('http://localhost:3001/api/db/tabs');
    if (response.ok) {
      const data = await response.json();
      
      if (data && data.tabs && data.tabs.length > 0) {
        booruTabs = data.tabs;
        tabIdCounter = Math.max(...booruTabs.map(t => 
          parseInt(t.id.replace('booru-tab-', ''))
        )) + 1;
        
        // Recreate tab buttons
        document.getElementById('booru-tabs-container').innerHTML = '';
        booruTabs.forEach(tab => createTabButton(tab));
        
        // Load downloads search text
        window.downloadsSearchText = data.downloadsSearchText || '';
        
        // Check if was viewing scroller
        if (data.isViewingScroller) {
          // Show scroller
          const showScrollerBtn = document.getElementById('show-scroller-btn');
          if (showScrollerBtn) {
            showScrollerBtn.click();
          }
        } else if (data.isViewingDownloadsGallery) {
          // Show downloads gallery
          if (window.showDownloadsGallery) {
            window.showDownloadsGallery();
          }
        } else {
          // Switch to saved active tab
          const activeId = data.activeTabId || booruTabs[0].id;
          // Only render the gallery if the user is actually on the Booru Browser
          // main nav-tab. If they restored into Settings, Generator, etc. the
          // gallery render (and all the proxy-image requests it fires) is deferred
          // until the user actually navigates to the Booru Browser tab.
          const mainTab = localStorage.getItem('activeTab') || 'generator';
          if (mainTab === 'booru') {
            switchToTab(activeId);
          } else {
            window._pendingBooruTabId = activeId;
            // Visually mark the correct sub-tab button as active so the UI
            // looks right whenever the user does navigate there.
            document.querySelectorAll('.booru-tab-item').forEach(btn => {
              btn.classList.toggle('active', btn.dataset.tabId === activeId);
            });
          }
        }
        
        return true;
      }
    }
  } catch (e) {
    console.error('Error loading booru tabs:', e);
  }
  return false;
}

// Don't auto-initialize — the startup IIFE in index.js calls this explicitly
// after showing a loading status update, so the user sees feedback during init.
window._initBooruTabs = initBooruTabs;

