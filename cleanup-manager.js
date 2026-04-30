// Cleanup Manager - Prevents memory leaks by tracking and cleaning up resources

class CleanupManager {
  constructor() {
    this.listeners = [];
    this.timers = [];
    this.observers = [];
    this.intervals = [];
    this.abortControllers = [];
  }

  // Track and add event listener
  addEventListener(element, event, handler, options) {
    if (!element) return;
    element.addEventListener(event, handler, options);
    this.listeners.push({ element, event, handler, options });
  }

  // Track setTimeout
  setTimeout(callback, delay, ...args) {
    const id = setTimeout(callback, delay, ...args);
    this.timers.push(id);
    return id;
  }

  // Track setInterval
  setInterval(callback, delay, ...args) {
    const id = setInterval(callback, delay, ...args);
    this.intervals.push(id);
    return id;
  }

  // Track MutationObserver
  addObserver(observer) {
    this.observers.push(observer);
    return observer;
  }

  // Track AbortController
  addAbortController(controller) {
    this.abortControllers.push(controller);
    return controller;
  }

  // Clean up all tracked resources
  cleanup() {
    // Remove event listeners
    this.listeners.forEach(({ element, event, handler, options }) => {
      if (element) {
        element.removeEventListener(event, handler, options);
      }
    });
    this.listeners = [];

    // Clear timers
    this.timers.forEach(id => clearTimeout(id));
    this.timers = [];

    // Clear intervals
    this.intervals.forEach(id => clearInterval(id));
    this.intervals = [];

    // Disconnect observers
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];

    // Abort ongoing requests
    this.abortControllers.forEach(controller => {
      try {
        controller.abort();
      } catch (e) {
        // Ignore errors
      }
    });
    this.abortControllers = [];
  }

  // Clear specific timer
  clearTimeout(id) {
    clearTimeout(id);
    this.timers = this.timers.filter(timerId => timerId !== id);
  }

  // Clear specific interval
  clearInterval(id) {
    clearInterval(id);
    this.intervals = this.intervals.filter(intervalId => intervalId !== id);
  }
}

// Global cleanup manager instance
window.globalCleanupManager = new CleanupManager();

// Cleanup DOM elements to prevent memory leaks
function cleanupDOMElement(element) {
  if (!element) return;

  // Remove all event listeners by cloning and replacing
  // This removes ALL listeners including those not tracked
  const clone = element.cloneNode(false);
  
  // Clean up child elements first
  const children = Array.from(element.children);
  children.forEach(child => {
    // Stop videos and release memory
    if (child.tagName === 'VIDEO') {
      child.pause();
      child.src = '';
      child.load();
    }
    // Clear image sources to free memory
    if (child.tagName === 'IMG') {
      child.src = '';
    }
    // Recursively clean children
    cleanupDOMElement(child);
  });

  // Remove element
  if (element.parentNode) {
    element.parentNode.removeChild(element);
  }
}

// Clean up gallery DOM elements
function cleanupGallery(gallery) {
  if (!gallery) return;

  // Unbind all justified gallery event handlers before cleanup to prevent context errors
  if (typeof $ !== 'undefined' && typeof $.fn.justifiedGallery !== 'undefined') {
    $(gallery).find('img').off('load error');
    try {
      $(gallery).justifiedGallery('destroy');
    } catch (e) {
      // Gallery may not be initialized, safe to ignore
    }
  }

  const items = gallery.querySelectorAll('.booru-image-item');
  items.forEach(item => {
    // Clean up images
    const img = item.querySelector('img');
    if (img) {
      img.src = '';
      img.srcset = '';
    }

    // Clean up videos
    const video = item.querySelector('video');
    if (video) {
      video.pause();
      video.src = '';
      video.load();
    }

    // Remove item
    if (item.parentNode) {
      item.parentNode.removeChild(item);
    }
  });

  // Clear innerHTML as final cleanup
  gallery.innerHTML = '';
}

// Limit array size to prevent unbounded growth
function limitArraySize(array, maxSize) {
  if (array.length > maxSize) {
    // Keep only the most recent items
    array.splice(0, array.length - maxSize);
  }
  return array;
}

// Export functions
window.CleanupManager = CleanupManager;
window.cleanupDOMElement = cleanupDOMElement;
window.cleanupGallery = cleanupGallery;
window.limitArraySize = limitArraySize;
