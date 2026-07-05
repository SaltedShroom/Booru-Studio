// Coin Collection Animation System
// Adapted from CodePen example for Booru Studio

// @Util
const CoinUtil = {
  objectAssign: function(object1, object2) {
    const keys = Object.keys(object2);
    for (let i = 0; i < keys.length; i++)
      object1[keys[i]] = object2[keys[i]];
    return object1;
  },
  isHTMLElement: function(element) {
    return (
      typeof element === 'object'
      && typeof element.nodeType === 'number'
      && element.nodeType === 1
      && element instanceof HTMLElement
    );
  },
  cubicBezier: function(t, p1, cp1, cp2, p2) {
    return Math.pow(1 - t, 3) * p1 + 3 * t * Math.pow(1 - t, 2) * cp1 + 3 * t * t * (1 - t) * cp2 + t * t * t * p2;
  },
  hypotenuse: function(x, y) {
    let max = Math.max(Math.abs(x), Math.abs(y));
    if (max === 0) max = 1;
    const min = Math.min(Math.abs(x), Math.abs(y));    
    const n = min / max;
    return max * Math.sqrt(1 + n * n);
  },
  lerp: function(from, to, t) {
    return (1 - t) * from + t * to;
  },
  modulate(number, from, to) {
    if (typeof from === 'number') from = [0, from];
    if (typeof to === 'number') to = [0, to];
    const percent = (number - from[0]) / (from[1] - from[0]);
    let result;
    if (to[1] > to[0]) {
      result = percent * (to[1] - to[0]) + to[0];
    } else {
      result = to[0] - (percent * (to[0] - to[1]));
    }
    return result;
  },
  getEuclideanDistance(a, b) {
    if (a === b) return 0;
    return Math.sqrt(Math.abs((a - b) * (b - a)));
  },
  cycleNumber(number, range) {
    if (typeof range === 'number') range = [0, range];
    const max = Math.max(range[0], range[1]);
    const min = Math.min(range[0], range[1]);
    if (max === 0 && min === 0) return 0;
    const da = CoinUtil.getEuclideanDistance(min, max);
    let db, c;
    if (number > max) {
      db = CoinUtil.getEuclideanDistance(number, max);
      c = db % da + min;
      return c === min ? max : c;
    } else if (number < min) {
      db = CoinUtil.getEuclideanDistance(number, min);
      c = max - db % da;
      return c === max ? min : c;
    }
    return number;
  },
};

// @Vector2
const CoinVector2 = function(x, y) {
  this.init(x, y);
};

CoinVector2.prototype = {
  init: function(x, y) {
    this.x = (typeof x === 'number') ? x : 0;
    this.y = (typeof y === 'number') ? y : 0;
  },
  copy: function(v) {
    this.x = v.x;
    this.y = v.y;
    return this;
  },
  clone: function() {
    return new CoinVector2(this.x, this.y);
  },
  add: function(x, y) {
    this.x += x;
    this.y += y;
    return this;
  },
  subtract: function(x, y) {
    this.x -= x;
    this.y -= y;
    return this;
  },
  multiply: function(x, y) {
    this.x *= x;
    this.y *= y;
    return this;
  },
  divide: function(x, y) {
    this.x /= x;
    this.y /= y;
    return this;
  },
  magnitude: function() {
    return CoinUtil.hypotenuse(this.x, this.y);
  },
  normalize: function() {
    let mag = Math.abs(this.magnitude()); 
    mag = mag === 0 ? 1 : mag;
    this.x /= mag;
    this.y /= mag;
    return this;
  },
  applyCubicBezier: function(t, p1, cp1, cp2, p2) {
    this.x = CoinUtil.cubicBezier(t, p1.x, cp1.x, cp2.x, p2.x);
    this.y = CoinUtil.cubicBezier(t, p1.y, cp1.y, cp2.y, p2.y);
  },
  getAngle: function() {
    let angle = Math.acos(this.x / this.magnitude());
    if (this.y < 0) angle = Math.PI + (Math.PI - angle);
    return angle;
  },
  getAngleTo: function(to) {
    return CoinVector2.subtract(to, this).getAngle();
  },
  getDistanceTo: function(to) {
    return CoinVector2
      .subtract(this, to)
      .magnitude();
  },
};

CoinVector2.subtract = function(a, b) {
  return new CoinVector2().copy(a).subtract(b.x, b.y);
};

// @Animation
const ANIMATION_DEFAULT_CONFIG = {
  duration: 1000,
  delay: 0,
  timingFunction: function(t) { return t },
  onTick: function() {},
  onStart: function() {},
  onComplete: function() {},
};

const CoinAnimation = function(config) {
  this.init(config);
};

CoinAnimation.prototype = {
  init: function(config) {
    this.config = CoinUtil.objectAssign({}, ANIMATION_DEFAULT_CONFIG);
    this.setConfig(config);
    this.rafID;
    this.timeStart = 0;
    this.timeEnd = 0;
    this.isActive = false;
    this.isAnimating = false;
    this.progress = 0;
  },
  setConfig: function(config) {
    if (typeof config === 'object')
      CoinUtil.objectAssign(this.config, config);
  },
  updateProgress: function() {
    const now = Date.now();
    this.progress = (now - this.timeStart) / this.config.duration;
    if (this.progress > 1) this.progress = 1;
  },
  loop: function() {
    if (this.isAnimating === true) {
      this.updateProgress();
      this.config.onTick(
        this.config.timingFunction(this.progress)
      );
      if (this.progress < 1) {
        this.continueLoop();
      } else {
        this.stop();
      }
    }
  },
  continueLoop: function() {
    if (this.isAnimating === true) {
      window.cancelAnimationFrame(this.rafID);
      this.rafID = window.requestAnimationFrame(
        this.loop.bind(this)
      );
    }
  },
  play: function() {
    if (this.isActive === false) {
      this.isActive = true;
      setTimeout(function() {
        this.isAnimating = true;
        this.timeStart = Date.now();
        this.config.onStart(this);
        this.continueLoop();  
      }.bind(this), this.config.delay);
    }
  },
  stop: function() {
    if (this.isActive === true) {
      window.cancelAnimationFrame(this.rafID);
      this.isAnimating = false;
      this.isActive = false;
      this.timeEnd = Date.now();
      this.config.onComplete(this);
      this.progress = 0;
    }
  },
};

// @Coin
const COIN_DEFAULT_CONFIG = {
  delay: 1000,
  duration: 1000,
  timingFunction: function(t) { return t * t * t; },

  startVector: new CoinVector2(),
  endVector: new CoinVector2(),
  burstVector: new CoinVector2(),

  curveStartIntensity: 0.5,
  curveEndIntensity: 0.5,

  curveStartAngle: 0,
  curveEndAngle: 0,

  burstPhaseEnd: 0.3, // Burst phase ends at 30% of animation
  burstDistance: 100,

  prepareElement: function() {},

  move: function(pointElement, position) {
    const left = pointElement.offsetWidth / 2;
    const top = pointElement.offsetHeight / 2;
    pointElement.style.transform = `translateX(${position.x - left}px) translateY(${position.y - top}px)`;
  },

  beforeStart: function() {},
  onComplete: function() {},
};

const Coin = function(manager, config) {
  this.init(manager, config);
};

Coin.prototype = {
  init: function(manager, config) {
    this.config = CoinUtil.objectAssign({}, COIN_DEFAULT_CONFIG);
    this.setConfig(config);

    this.amount = this.config.amount;

    this.manager = manager;
    this.animation = new CoinAnimation();
    this.isActive = false;
    this.element;

    this.position = new CoinVector2().copy(this.config.startVector);
    // Control points now use burst vector as the starting point for phase 2
    this.controlPoint1 = this.getControlPointVector(this.config.burstVector, this.config.endVector, this.config.curveStartIntensity, this.config.curveStartAngle);
    this.controlPoint2 = this.getControlPointVector(this.config.endVector, this.config.burstVector, this.config.curveEndIntensity, this.config.curveEndAngle);
  },
  setConfig: function(config) {
    if (typeof config === 'object') CoinUtil.objectAssign(this.config, config);
  },
  create: function() {
    this.element = document.createElement('DIV');
    this.config.prepareElement(this.element);
  },
  destroy: function() {
    if (CoinUtil.isHTMLElement(this.element) === true) this.element.remove();
  },
  start: function() {
    this.animation.stop();
    this.animation.setConfig({
      delay: this.config.delay,
      duration: this.config.duration,
      timingFunction: this.config.timingFunction,
      onStart: function() {
        this.create();
        this.config.beforeStart(this);
      }.bind(this),
      onTick: this.tick.bind(this),
      onComplete: this.end.bind(this),
    });
    this.animation.play();
  },
  end: function() {
    this.destroy();
    this.config.onComplete(this);
    this.manager.onCoinEnd();
  },
  getControlPointVector: function(from, to, intensity, angleOffset) {
    const distance = from.getDistanceTo(to);
    const length = distance * intensity;
    const angle = CoinUtil.cycleNumber(
      from.getAngleTo(to) + angleOffset, Math.PI * 2
    );
    return new CoinVector2(
      from.x + Math.cos(angle) * length,
      from.y + Math.sin(angle) * length,
    );
  },
  tick: function(t) {
    if (t < this.config.burstPhaseEnd) {
      // Phase 1: Burst outward from start position
      const burstProgress = t / this.config.burstPhaseEnd;
      const easeOutQuad = 1 - (1 - burstProgress) * (1 - burstProgress); // Ease out for natural deceleration
      this.position.copy(this.config.startVector);
      this.position.add(
        (this.config.burstVector.x - this.config.startVector.x) * easeOutQuad,
        (this.config.burstVector.y - this.config.startVector.y) * easeOutQuad
      );
    } else {
      // Phase 2: Move from burst position to end vector
      const moveProgress = (t - this.config.burstPhaseEnd) / (1 - this.config.burstPhaseEnd);
      this.position.applyCubicBezier(moveProgress, this.config.burstVector, this.controlPoint1, this.controlPoint2, this.config.endVector);
    }
    this.config.move(this.element, this.position, this);
  },
};

// @CoinManager
const COIN_MANAGER_DEFAULT_CONFIG = {
  startElement: null,
  endElement: null,
  parentElement: null,

  amount: 500,
  increment: 10,

  timingFunction: function(t) { return t * t * t },

  minDelay: 100,
  maxDelay: 1000,

  minDuration: 400,
  maxDuration: 1200,

  minIntensity: 0,
  maxIntensity: 1,

  minAngleIntensity: 0,
  maxAngleIntensity: Math.PI / 2,

  varyCurve: false,

  coinClassName: 'coin',
  beforeStart: function() {},
  onCoinStart: function(coin) {},
  onCoinComplete: function(coin) {},
  onComplete: function() {},
};

const CoinManager = function(config) {
  this.init(config);
};

CoinManager.prototype = {
  init: function(config) {
    this.config = CoinUtil.objectAssign({}, COIN_MANAGER_DEFAULT_CONFIG);
    this.setConfig(config);

    this.isActive = false;
    this.startVector;
    this.endVector;
    this.coins = [];
    this.endCount = 0;
  },
  setConfig: function(config) {
    if (typeof config === 'object') CoinUtil.objectAssign(this.config, config);
  },
  start: function() {
    if (this.isActive === false) {
      this.getTargetVectors();
      this.populate();
      this.isActive = true;
      this.config.beforeStart();
      for (let i = 0; i < this.coins.length; i++) this.coins[i].start();
      if (this.coins.length === 0) this.end();
    }
  },
  onCoinEnd: function() {
    this.endCount++;
    if (this.endCount === this.coins.length) this.end();
  },
  end: function() {
    this.coins = [];
    this.endCount = 0;
    this.isActive = false;
    this.config.onComplete();
  },
  getTargetVectors: function() {
    this.startVector = this.getTargetVectorFromElement(this.config.startElement);
    this.endVector   = this.getTargetVectorFromElement(this.config.endElement);
    
    // Convert start position from viewport to container-relative coordinates
    if (this.config.startElement && this.config.parentElement) {
      const rect = this.config.startElement.getBoundingClientRect();
      const containerRect = this.config.parentElement.getBoundingClientRect();
      
      this.startVector = new CoinVector2(
        rect.left - containerRect.left + (rect.width / 2),
        rect.top - containerRect.top + (rect.height / 2)
      );
    }
    
    // Adjust end position to center-right of app-download-size
    // Convert from viewport coordinates to container-relative coordinates
    if (this.config.endElement && this.config.endElement.id === 'app-download-size') {
      const rect = this.config.endElement.getBoundingClientRect();
      const containerRect = this.config.parentElement.getBoundingClientRect();
      
      this.endVector = new CoinVector2(
        rect.left - containerRect.left + rect.width - 20,
        rect.top - containerRect.top + (rect.height / 2)
      );
    }
  },
  getTargetVectorFromElement: function(element) {
    const rect = element.getBoundingClientRect();
    return new CoinVector2(
      rect.left + (rect.width  / 2),
      rect.top  + (rect.height / 2),
    );
  },
  populate: function() {
    this.coins = [];
    let numberOfCoins = 0, remainder = 0;
    if (this.config.increment > 0 && this.config.amount > 0) {
      remainder = this.config.amount % this.config.increment;
      let difference = this.config.amount - remainder;
      numberOfCoins = (difference === 0) ? 1 : difference / this.config.increment;
    }
    for (let i = 0; i < numberOfCoins; i++) {
      let config = this.getCoinConfig(i, numberOfCoins);
      config.amount = this.config.increment;
      if (i === numberOfCoins - 1 && remainder > 0) config.amount = remainder;
      this.coins.push(new Coin(this, config));
    }
  },
  getCoinConfig: function(coinIndex, totalCoins) {
    let curveStartAngle, curveEndAngle;
    if (this.config.varyCurve === true) {
      curveStartAngle = CoinUtil.modulate(Math.random(), 1, [-this.config.maxAngleIntensity, this.config.maxAngleIntensity]);
      curveEndAngle = CoinUtil.modulate(Math.random(), 1, [-this.config.maxAngleIntensity, this.config.maxAngleIntensity]);
    } else {
      const curve = CoinUtil.modulate(Math.random(), 1, [-this.config.maxAngleIntensity, this.config.maxAngleIntensity]);
      curveStartAngle = curve;
      curveEndAngle = - curve;
    }

    return {
      startVector: this.startVector,
      endVector:   this.endVector,

      timingFunction: this.config.timingFunction,

      delay:               CoinUtil.modulate(Math.random(), 1, [this.config.minDelay, this.config.maxDelay]),
      duration:            CoinUtil.modulate(Math.random(), 1, [this.config.minDuration, this.config.maxDuration]),
      curveStartIntensity: CoinUtil.modulate(Math.random(), 1, [this.config.minIntensity, this.config.maxIntensity]),
      curveEndIntensity:   CoinUtil.modulate(Math.random(), 1, [this.config.minIntensity, this.config.maxIntensity]),

      curveStartAngle: curveStartAngle,
      curveEndAngle:   curveEndAngle,

      // Calculate burst vector: each coin bursts at a different angle around the start point
      burstVector: (() => {
        const angle = (coinIndex / Math.max(1, totalCoins)) * Math.PI * 2 + (Math.random() * 0.3); // Add slight randomness
        const burstDistance = 100 + Math.random() * 50; // Burst distance between 100-150px
        return new CoinVector2(
          this.startVector.x + Math.cos(angle) * burstDistance,
          this.startVector.y + Math.sin(angle) * burstDistance
        );
      })(),
      burstDistance: 100 + Math.random() * 50,
      burstPhaseEnd: 0.3,

      prepareElement: function(element) {
        
        // Randomly choose one of the three accent colors
        const colors = ['var(--accent)', 'var(--accent-secondary)', 'var(--accent-hover)'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        element.style.setProperty('--coin-color', randomColor);
        
        element.classList.add(this.config.coinClassName);
        this.config.parentElement.appendChild(element);
      }.bind(this),

      beforeStart: this.config.onCoinStart,
      onComplete: this.config.onCoinComplete,
    }
  },
};

// Global CoinCollector Manager
window.CoinCollector = {
  containerElement: null,
  endElement: null,
  isInitialized: false,
  animationsEnabled: false,
  coinAnimationsDisabled: false,
  currentTotalBytes: 0,

  init: function() {
    // Load user preference for coin animations
    this.coinAnimationsDisabled = localStorage.getItem('coinAnimationEnabled') === 'false';

    // Create coin container inside app-content
    this.containerElement = document.createElement('div');
    this.containerElement.className = 'coin-collector-container';
    const appContent = document.getElementById('app-content');
    if (appContent) {
      appContent.appendChild(this.containerElement);
    } else {
      document.body.appendChild(this.containerElement);
    }

    // Reference to odometer element
    this.endElement = document.getElementById('app-download-size');

    // Setup download listener
    this.setupDownloadListener();
    
    this.isInitialized = true;
    
    // Enable animations after app has initialized (prevent initial load animation)
    setTimeout(() => {
      this.animationsEnabled = true;
    }, 2000);
  },

  setupDownloadListener: function() {
    // Watch for data-downloaded attribute changes on media elements
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-downloaded') {
          const element = mutation.target;
          const isDownloaded = element.getAttribute('data-downloaded') === 'true';
          
          if (!isDownloaded && this.animationsEnabled) {
            // Deletion: fetch actual folder size from server endpoint
            if (typeof window.updateDownloadFolderSizeOdometer === 'function') {
              window.updateDownloadFolderSizeOdometer();
            }
          }
          // Note: Download animation is now triggered directly in booru-browser.js
          // when data-downloaded is set, instead of via this observer
        }
      });
    });

    // Start observing the gallery for any media element changes
    const gallery = document.getElementById('booru-gallery');
    if (gallery) {
      observer.observe(gallery, {
        subtree: true,
        attributes: true,
        attributeFilter: ['data-downloaded'],
      });
    }
  },

  triggerCoinAnimation: function(startElement, fileSize) {
    if (!startElement || !this.animationsEnabled || !this.containerElement || this.coinAnimationsDisabled) return;

    // Calculate coin count: 0.6 MB = 1 coin, so coins = (fileSize in MB) / 0.6
    const fileSizeMB = fileSize / (1024 * 1024);
    const coinCount = Math.max(1, Math.round(fileSizeMB / 0.6));
    
    // Create a NEW CoinManager for this animation (allows concurrent animations)
    const manager = new CoinManager({
      parentElement: this.containerElement,
      endElement: this.endElement,

      timingFunction: function(t) { return t; },

      amount: coinCount,
      increment: Math.max(1, Math.floor(coinCount / 5)),

      minDelay: 0,
      maxDelay: 50,

      minDuration: 800,
      maxDuration: 1200,

      maxIntensity: 0.3,
      maxAngleIntensity: Math.PI / 8,

      varyCurve: true,

      startElement: startElement,

      onCoinComplete: function(coin) {
        // Pulse animation on odometer
        if (this.endElement) {
          this.endElement.classList.remove('coinTarget--animate');
          void this.endElement.offsetWidth;
          this.endElement.classList.add('coinTarget--animate');
        }
      }.bind(this),

      onComplete: function() {
        // After all coins finish, update odometer with actual folder size
        this.downloadedBytes = fileSize;
        if (typeof window.incrementDownloadFolderSizeOdometer === 'function') {
          window.incrementDownloadFolderSizeOdometer(this.downloadedBytes);
        }
      }.bind(this)
    });

    manager.start();
  },
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    window.CoinCollector.init();
  });
} else {
  window.CoinCollector.init();
}
