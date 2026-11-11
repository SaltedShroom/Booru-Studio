// Booru Sources Manager - Handles CRUD operations for booru source configurations

function appendUrlParam(url, key, value) {
  if (!url || !key || value === undefined || value === null) return url;
  const hasParam = new RegExp(`([?&])${key}=`).test(url);
  if (hasParam) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
}

function resolveSourceUrl(source, value) {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const base = source.apiUrl || source.baseUrl || '';
  if (!base) return value;
  const parsedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const normalizedValue = value.startsWith('/') ? value.slice(1) : value;
  return `${parsedBase}/${normalizedValue}`;
}

function getSourceAuthCredentials(source) {
  const sourceUserId = source?.auth?.userId || '';
  const sourceApiKey = source?.auth?.apiKey || '';

  if (sourceUserId || sourceApiKey) {
    return {
      userId: sourceUserId,
      apiKey: sourceApiKey
    };
  }

  return {
    userId: (window.userIdInput ? window.userIdInput.value.trim() : ''),
    apiKey: (window.apiKeyInput ? window.apiKeyInput.value.trim() : '')
  };
}

function buildArtistTagLookupUrl(source, tags = 'solo 1girl') {
  if (!source?.artist?.tagApiUrl) return '';

  let template = source.artist.tagApiUrl.replace('{tags}', encodeURIComponent(tags));
  if (!/^https?:\/\//i.test(template)) {
    template = resolveSourceUrl(source, template);
  }

  if (source.auth?.required) {
    const { userId, apiKey } = getSourceAuthCredentials(source);
    if (userId && apiKey) {
      const userIdKey = source.auth.userIdKey || 'user_id';
      const apiKeyKey = source.auth.apiKeyKey || 'api_key';
      template = appendUrlParam(template, userIdKey, userId);
      template = appendUrlParam(template, apiKeyKey, apiKey);
    }
  }

  return template;
}

function isAuthFailureResponse(text) {
  const normalizedText = String(text || '').replace(/\s+/g, ' ').trim();
  return /(missing authentication|invalid authentication|invalid api key|unauthorized|not logged in|access denied|error.*authentication)/i.test(normalizedText)
    || /<error[^>]*>.*(authentication|unauthorized|access denied|not logged in).*<\/error>/i.test(normalizedText);
}

class BooruSourcesManager {
  constructor() {
    this.sources = [];
    this.editingSourceId = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    
    // Load sources from database
    await this.loadSources();
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Render initial sources
    this.renderSourcesList();
    
    // Populate source dropdown in booru browser
    this.updateBooruSourceDropdown();
    
    this.initialized = true;
  }

  async loadSources() {
    try {
      const savedSources = await dbStore.loadSetting('booru-sources');
      if (savedSources && Array.isArray(savedSources)) {
        this.sources = savedSources;
        
        // Check if sources need migration (e.g., adding keyPath to metaTagFields)
        const needsMigration = await this.migrateSourcesIfNeeded();
        if (needsMigration) {
          await this.saveSources();
        }
      } else {
        // Initialize with default sources if none exist
        this.sources = this.getDefaultSources();
        await this.saveSources();
      }
    } catch (error) {
      console.error('Error loading booru sources:', error);
      // Use defaults if loading fails
      this.sources = this.getDefaultSources();
    }
  }

  async migrateSourcesIfNeeded() {
    const defaultSources = this.getDefaultSources();
    let migrationOccurred = false;

    for (let i = 0; i < this.sources.length; i++) {
      const source = this.sources[i];
      const defaultSource = defaultSources.find(d => d.id === source.id);

      // Only update sources that match a default source
      if (!defaultSource) continue;

      // Ensure fields object exists
      if (!source.fields) {
        source.fields = {};
      }

      // Check if metaTagFields exists and has items
      if (source.fields.metaTagFields && Array.isArray(source.fields.metaTagFields) && source.fields.metaTagFields.length > 0) {
        // Add keyPath property to existing fields that don't have it
        const needsKeyPathMigration = source.fields.metaTagFields.some(field => !('keyPath' in field));
        if (needsKeyPathMigration) {
          for (const field of source.fields.metaTagFields) {
            if (!('keyPath' in field)) {
              field.keyPath = '';
              migrationOccurred = true;
            }
          }
        }
      } else if (!source.fields.metaTagFields) {
        // If metaTagFields is missing (not just empty), populate it from the default source
        if (defaultSource.fields && defaultSource.fields.metaTagFields && defaultSource.fields.metaTagFields.length > 0) {
          source.fields.metaTagFields = JSON.parse(JSON.stringify(defaultSource.fields.metaTagFields));
          migrationOccurred = true;
        }
      }
    }

    return migrationOccurred;
  }

  async saveSources() {
    try {
      await dbStore.saveSetting('booru-sources', this.sources);
      return true;
    } catch (error) {
      console.error('Error saving booru sources:', error);
      return false;
    }
  }

  getDefaultSources() {
    return [
      {
        type: "api",
        id: "bbooru",
        name: "Bbooru.com",
        baseUrl: "https://bbooru.com",
        auth: {
          required: false
        },
        api: {
          basePath: "/index.php?page=dapi&s=post&q=index",
          jsonSupport: true,
          limitParam: "limit",
          pageParam: "pid",
          tagsParam: "tags",
          pageStart: 0
        },
        response: {
          countParser: "xmlRegex",
          countPath: "",
          wrapper: ""
        },
        fields: {
          imageUrl: "file_url",
          previewUrl: "preview_url",
          sampleUrl: "sample_url",
          tags: "tags",
          artistTag: "",
          metaTagFields: [
            {
              title: "Characters",
              type: "character",
              color: "#1f8112",
              keyPath: ""
            },
            {
              title: "Franchise",
              type: "copyright",
              color: "#a30080",
              keyPath: ""
            }
          ],
          createdAt: "change",
          dateType: "timestamp",
          tagsFilter: "\\+",
          width: "",
          height: "",
          partialUrls: false,
          useUrlTemplates: false
        },
        sort: {
          scoreMethod: "tags"
        },
        safeMode: {
          required: false
        },
        artist: {
          tagApiUrl: "",
          tagTypeKeyPath: "type",
          artistTypeValue: "1",
          tagSeparator: " ",
          postUrlPattern: ""
        },
        ui: {
          defaultSort: "new",
          defaultLimit: 100,
          requiresProxy: false
        },
        cookies: "",
        userAgent: ""
      },
      {
        type: "api",
        id: "e621",
        name: "e621.net",
        baseUrl: "https://e621.net",
        auth: {
          required: false
        },
        api: {
          basePath: "/posts.json",
          jsonSupport: true,
          limitParam: "limit",
          pageParam: "page",
          tagsParam: "tags",
          pageStart: 1
        },
        response: {
          countParser: "json",
          countPath: "",
          wrapper: "posts"
        },
        fields: {
          imageUrl: "file.url",
          previewUrl: "preview.url",
          sampleUrl: "sample.url",
          tags: "tags",
          artistTag: "tags.artist",
          metaTagFields: [],
          createdAt: "created_at",
          dateType: "dateString",
          tagsFilter: "",
          width: "file.width",
          height: "file.height",
          partialUrls: false,
          useUrlTemplates: false
        },
        sort: {
          scoreMethod: "none"
        },
        safeMode: {
          required: false
        },
        artist: {
          tagApiUrl: "",
          tagTypeKeyPath: "type",
          artistTypeValue: "1",
          tagSeparator: " ",
          postUrlPattern: ""
        },
        metaTagFields: [
          {
            title: "Franchise",
            type: "copyright",
            color: "#a30080",
            keyPath: "tags.copyright"
          },
          {
            title: "Characters",
            type: "character",
            color: "#1f8112",
            keyPath: "tags.character"
          },
          {
            title: "Species",
            type: "species",
            color: "#d18400",
            keyPath: "tags.species"
          }
        ],
        ui: {
          defaultSort: "new",
          defaultLimit: 100,
          requiresProxy: false
        },
        cookies: "",
        userAgent: ""
      },
      {
        type: "api",
        id: "rule34",
        name: "Rule34.xxx",
        baseUrl: "https://rule34.xxx",
        apiUrl: "https://api.rule34.xxx",
        auth: {
          required: true,
          userIdKey: "user_id",
          apiKeyKey: "api_key",
          helpText: "Get your credentials from Rule34 account settings",
          userId: "",
          apiKey: ""
        },
        api: {
          basePath: "/index.php?page=dapi&s=post&q=index",
          jsonSupport: true,
          limitParam: "limit",
          pageParam: "pid",
          tagsParam: "tags",
          pageStart: 0
        },
        response: {
          countParser: "xmlDom",
          countPath: "posts/@count",
          wrapper: ""
        },
        fields: {
          imageUrl: "file_url",
          previewUrl: "preview_url",
          sampleUrl: "sample_url",
          tags: "tags",
          artistTag: "",
          metaTagFields: [
            {
              title: "Characters",
              type: "character",
              color: "#1f8112",
              keyPath: ""
            },
            {
              title: "Franchise",
              type: "copyright",
              color: "#a30080",
              keyPath: ""
            }
          ],
          createdAt: "change",
          dateType: "timestamp",
          tagsFilter: "",
          width: "",
          height: "",
          partialUrls: false,
          useUrlTemplates: false
        },
        sort: {
          scoreMethod: "tags"
        },
        safeMode: {
          required: false
        },
        artist: {
          tagApiUrl: "",
          tagTypeKeyPath: "type",
          artistTypeValue: "1",
          tagSeparator: " ",
          postUrlPattern: ""
        },
        ui: {
          defaultSort: "new",
          defaultLimit: 100,
          requiresProxy: false
        },
        cookies: "",
        userAgent: ""
      },
      {
        type: "api",
        id: "gelbooru",
        name: "gelbooru.com",
        baseUrl: "https://gelbooru.com",
        auth: {
          required: true,
          userIdKey: "user_id",
          apiKeyKey: "api_key",
          helpText: "Get your credentials from Gelbooru account settings",
          userId: "",
          apiKey: ""
        },
        api: {
          basePath: "/index.php?page=dapi&s=post&q=index&json=1",
          jsonSupport: true,
          limitParam: "limit",
          pageParam: "pid",
          tagsParam: "tags",
          pageStart: 0
        },
        response: {
          countParser: "json",
          countPath: "@attributes.count",
          wrapper: ""
        },
        fields: {
          imageUrl: "file_url",
          previewUrl: "preview_url",
          sampleUrl: "sample_url",
          tags: "tags",
          artistTag: "tags.artist",
          metaTagFields: [
            {
              title: "Characters",
              type: "character",
              color: "#1f8112",
              keyPath: ""
            },
            {
              title: "Franchise",
              type: "copyright",
              color: "#a30080",
              keyPath: ""
            }
          ],
          createdAt: "change",
          dateType: "timestamp",
          tagsFilter: "\\+",
          width: "",
          height: "",
          partialUrls: false,
          useUrlTemplates: false
        },
        sort: {
          scoreMethod: "tags"
        },
        safeMode: {
          required: false
        },
        artist: {
          tagApiUrl: "/index.php?page=dapi&s=tag&q=index&json=1&names={tags}",
          tagTypeKeyPath: "type",
          artistTypeValue: "1",
          tagSeparator: " ",
          postUrlPattern: ""
        },
        ui: {
          defaultSort: "new",
          defaultLimit: 100,
          requiresProxy: false
        },
        cookies: "",
        userAgent: ""
      },
      {
        type: "scraper",
        id: "realbooru",
        name: "Realbooru.com",
        baseUrl: "https://realbooru.com",
        apiUrl: "https://realbooru.com",
        auth: {
          required: false
        },
        cookies: "",
        userAgent: "",
        ui: {
          defaultSort: "new",
          defaultLimit: 100,
          requiresProxy: false
        },
        scraper: {
          listPageUrl: "https://realbooru.com/index.php?page=post&s=list",
          listPageSelector: ".col.thumb",
          postLinkSelector: "a",
          imageUrlSelector: "img",
          imageUrlAttribute: "src",
          thumbnailWidthAttribute: "width",
          thumbnailHeightAttribute: "height",
          initialTagsAttribute: "title",
          initialFileTypeAttribute: "style",
          initialFileTypeAttributeValue: "border: 3px solid #0000ff;",
          initialFileTypeGifTag: "gif",
          detailImageSelector: "#image, #gelcomVideoPlayer",
          detailImageAttribute: "src",
          detailTagsSelector: "#tagLink",
          detailGeneralTagsSelector: "a",
          detailArtistTagsSelector: "a.model, a.artist",
          detailTagTextExtraction: "text",
          postsPerPage: 42,
          paginationStrategy: "offset",
          paginationParam: "pid",
          paginationLastPageSelector: "a[alt='last page']",
          searchTagParam: "tags",
          searchTagSeparator: "+"
        },
        gallery: {
          invertAspectRatio: true
        }
      }
    ];
  }

  setupEventListeners() {
    // Modal close buttons
    document.getElementById('close-booru-source-modal')?.addEventListener('click', () => {
      this.closeModal();
    });
    
    document.getElementById('cancel-booru-source-btn')?.addEventListener('click', () => {
      this.closeModal();
    });

    document.getElementById('close-source-test-modal')?.addEventListener('click', () => {
      this.closeSourceTestModal();
    });

    document.getElementById('source-test-modal')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay')) {
        this.closeSourceTestModal();
      }
    });

    // Save source button
    document.getElementById('save-booru-source-btn')?.addEventListener('click', async () => {
      await this.saveSource();
    });

    // Conditional field visibility
    document.getElementById('source-auth-required')?.addEventListener('change', (e) => {
      const authFields = document.getElementById('auth-fields');
      if (authFields) {
        authFields.style.display = e.target.checked ? 'block' : 'none';
      }
    });

    // Source type selector - show/hide API vs Scraper config
    document.getElementById('source-type')?.addEventListener('change', (e) => {
      const isApi = e.target.value === 'api';
      
      // Hide/show API configuration sections
      const apiSections = document.querySelectorAll('[id*="source-api-"], [id*="source-response-"], [id*="source-fields-"], [id*="source-sort-"], [id*="source-artist-"]');
      const apiConfigSection = document.querySelector('.booru-form-section:has(#source-api-basePath)');
      const responseConfigSection = document.querySelector('.booru-form-section:has(#source-response-countParser)');
      const fieldMappingsSection = document.querySelector('.booru-form-section:has(#source-fields-imageUrl)');
      const sortSection = document.querySelector('.booru-form-section:has(#source-sort-scoreMethod)');
      const artistSection = document.querySelector('.booru-form-section:has(#source-artist-tagApiUrl)');
      const apiUrlGroup = document.getElementById('api-url-group');
      
      if (apiConfigSection) apiConfigSection.style.display = isApi ? 'block' : 'none';
      if (responseConfigSection) responseConfigSection.style.display = isApi ? 'block' : 'none';
      if (fieldMappingsSection) fieldMappingsSection.style.display = isApi ? 'block' : 'none';
      if (sortSection) sortSection.style.display = isApi ? 'block' : 'none';
      if (artistSection) artistSection.style.display = isApi ? 'block' : 'none';
      if (apiUrlGroup) apiUrlGroup.style.display = isApi ? 'block' : 'none';
      
      // Hide/show Scraper configuration sections
      const scraperSection = document.getElementById('scraper-config-section');
      if (scraperSection) scraperSection.style.display = isApi ? 'none' : 'block';
    });

    document.getElementById('source-safeMode-required')?.addEventListener('change', (e) => {
      const safeModeFields = document.getElementById('safeMode-fields');
      if (safeModeFields) {
        safeModeFields.style.display = e.target.checked ? 'block' : 'none';
      }
    });

    document.getElementById('source-sort-scoreMethod')?.addEventListener('change', (e) => {
      const sortParamField = document.getElementById('sort-param-field');
      if (sortParamField) {
        sortParamField.style.display = e.target.value === 'param' ? 'block' : 'none';
      }
    });

    document.getElementById('source-fields-partialUrls')?.addEventListener('change', (e) => {
      const urlPrefixField = document.getElementById('urlPrefix-field');
      if (urlPrefixField) {
        urlPrefixField.style.display = e.target.checked ? 'block' : 'none';
      }
    });

    document.getElementById('source-fields-useUrlTemplates')?.addEventListener('change', (e) => {
      const urlTemplatesFields = document.getElementById('urlTemplates-fields');
      if (urlTemplatesFields) {
        urlTemplatesFields.style.display = e.target.checked ? 'block' : 'none';
      }
    });

    // Meta Tag Fields
    document.getElementById('add-metaTag-field-btn')?.addEventListener('click', () => {
      this.addMetaTagField();
    });

    // Close modal on overlay click
    document.getElementById('booru-source-modal')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay')) {
        this.closeModal();
      }
    });

    document.getElementById('close-import-source-modal')?.addEventListener('click', () => {
      this.closeImportModal();
    });

    document.getElementById('cancel-import-source-btn')?.addEventListener('click', () => {
      this.closeImportModal();
    });

    document.getElementById('import-source-modal')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay')) this.closeImportModal();
    });

    document.getElementById('submit-import-source-btn')?.addEventListener('click', () => {
      this.submitImport();
    });

    // Export source modal
    document.getElementById('close-export-source-modal')?.addEventListener('click', () => {
      this.closeExportModal();
    });
    document.getElementById('cancel-export-source-btn')?.addEventListener('click', () => {
      this.closeExportModal();
    });
    document.getElementById('export-source-modal')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay')) this.closeExportModal();
    });
    document.getElementById('copy-export-source-btn')?.addEventListener('click', () => {
      if (this._exportingSource) this.copySourceJsonToClipboard(this._exportingSource);
    });
    document.getElementById('download-export-source-btn')?.addEventListener('click', () => {
      if (this._exportingSource) this.downloadSourceJson(this._exportingSource);
    });

    // Import textarea — drag-and-drop a .json file from OS explorer
    const importTextarea = document.getElementById('import-source-json');
    if (importTextarea) {
      importTextarea.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      });
      importTextarea.addEventListener('drop', (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          importTextarea.value = evt.target.result;
          const errorDiv = document.getElementById('import-source-error');
          if (errorDiv) { errorDiv.textContent = ''; errorDiv.style.display = 'none'; }
        };
        reader.readAsText(file);
      });
    }
  }

  renderSourcesList() {
    const listContainer = document.getElementById('booru-sources-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    if (this.sources.length === 0) {
          listContainer.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">No sources configured. Click "Add New Source" to get started.</p>';
    }

    this.sources.forEach(source => {
      const card = this.createSourceCard(source);
      listContainer.appendChild(card);
    });
    
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'booru-source-card';
    buttonContainer.style.gap = '0px';
    buttonContainer.innerHTML = '<div class="add-booru-button-container"><button id="add-booru-source-btn" class="btn-primary" type="button" title="Add New Source"><i class="fas fa-plus"></i></button><button id="import-booru-source-btn" class="btn-secondary" type="button" title="Import Source"><i class="fas fa-file-import"></i></button></div><a id="browse-booru-source-btn" class="btn-secondary" href="https://github.com/SaltedShroom/Booru-Studio/discussions/3" target="_blank" rel="noopener noreferrer" title="Browse Sources Online"><i class="fas fa-search"></i>Browse Sources</a>';
    listContainer.appendChild(buttonContainer);
    
    document.getElementById('add-booru-source-btn')?.addEventListener('click', () => {
      this.openModal();
    });
    document.getElementById('import-booru-source-btn')?.addEventListener('click', () => {
      this.openImportModal();
    });
  }

  createSourceCard(source) {
    const card = document.createElement('div');
    card.className = 'booru-source-card';
    
    const badges = [];
    if (source.auth?.required) badges.push('<span class="booru-source-badge auth">Auth Required</span>');
    if (source.safeMode?.required) badges.push('<span class="booru-source-badge safe-mode">Safe Mode</span>');
    if (source.api?.jsonSupport) badges.push('<span class="booru-source-badge">JSON</span>');
    if (source.cookies) badges.push('<span class="booru-source-badge cookies">Cookies</span>');
    if (source.userAgent) badges.push('<span class="booru-source-badge ua">UA</span>');
    if (source.fields?.artistTag) badges.push('<span class="booru-source-badge artist-field">Artist</span>');

    card.innerHTML = `
      <div class="booru-source-card-header">
        <div>
          <div class="booru-source-card-title">${source.name}</div>
          <div class="booru-source-card-id">${source.id}</div>
        </div>
        <div class="booru-source-card-actions">
          <button type="button" class="btn-icon-small edit" title="Edit">
            <i class="fas fa-edit"></i>
          </button>
          <button type="button" class="btn-icon-small clone" title="Clone">
            <i class="fas fa-copy"></i>
          </button>
          <button type="button" class="btn-icon-small export" title="Export JSON">
            <i class="fas fa-file-export"></i>
          </button>
          <button type="button" class="btn-icon-small delete" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      <div class="booru-source-card-info">
        <div class="booru-source-card-info-item">
          <i class="fas fa-globe"></i>
          <span>${source.baseUrl}</span>
        </div>
        <div class="booru-source-card-info-item">
          <i class="fas fa-code"></i>
          <span>${source.type === 'scraper' ? 'HTML Scraper' : (source.response?.countParser?.toUpperCase() || 'Unknown')}</span>
        </div>
      </div>
      <div class="booru-source-card-badges">
        ${badges.join('')}
      </div>
      <div class="booru-source-card-footer">
        <button type="button" class="btn-icon-small test" title="Test">
          <i class="fas fa-vial"></i>
        </button>
      </div>
    `;

    // Edit button
    card.querySelector('.edit')?.addEventListener('click', () => {
      this.openModal(source);
    });

    // Clone button
    card.querySelector('.clone')?.addEventListener('click', () => {
      this.cloneSource(source);
    });

    // Export button
    card.querySelector('.export')?.addEventListener('click', () => {
      this.exportSource(source);
    });

    // Test button
    card.querySelector('.test')?.addEventListener('click', () => {
      this.testSource(source, card);
    });

    // Delete button
    card.querySelector('.delete')?.addEventListener('click', () => {
      this.deleteSource(source.id);
    });

    return card;
  }

  // ---- Import / Export ----

  openImportModal() {
    const modal = document.getElementById('import-source-modal');
    const textarea = document.getElementById('import-source-json');
    const error = document.getElementById('import-source-error');
    if (!modal) return;
    if (textarea) textarea.value = '';
    if (error) { error.textContent = ''; error.style.display = 'none'; }
    modal.style.display = 'flex';
    if (textarea) setTimeout(() => textarea.focus(), 50);
  }

  closeImportModal() {
    const modal = document.getElementById('import-source-modal');
    if (modal) modal.style.display = 'none';
  }

  validateImportedSource(obj) {
    const errors = [];

    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      errors.push('JSON must be a plain object, not an array or primitive.');
      return errors;
    }

    // Required top-level string fields
    if (!obj.id || typeof obj.id !== 'string') {
      errors.push('Missing or invalid field: id (must be a non-empty string)');
    } else if (!/^[a-z0-9_-]+$/.test(obj.id)) {
      errors.push('id must be lowercase alphanumeric with hyphens/underscores only');
    } else if (this.sources.some(s => s.id === obj.id)) {
      errors.push(`A source with id "${obj.id}" already exists. Change the id before importing.`);
    }

    if (!obj.name || typeof obj.name !== 'string') {
      errors.push('Missing or invalid field: name (must be a non-empty string)');
    }

    if (!obj.baseUrl || typeof obj.baseUrl !== 'string' || !obj.baseUrl.startsWith('http')) {
      errors.push('Missing or invalid field: baseUrl (must start with http/https)');
    }

    // Validate based on source type
    const type = obj.type || 'api';

    if (type === 'api') {
      // api.basePath
      if (!obj.api || typeof obj.api !== 'object') {
        errors.push('Missing field: api (must be an object with at least basePath)');
      } else if (!obj.api.basePath || typeof obj.api.basePath !== 'string') {
        errors.push('Missing or invalid field: api.basePath (must be a non-empty string)');
      }

      // response.countParser
      const validParsers = ['xmlDom', 'xmlRegex', 'json'];
      if (!obj.response || typeof obj.response !== 'object') {
        errors.push('Missing field: response (must be an object with countParser)');
      } else if (!validParsers.includes(obj.response.countParser)) {
        errors.push(`Invalid response.countParser — must be one of: ${validParsers.join(', ')}`);
      }

      // fields
      if (!obj.fields || typeof obj.fields !== 'object') {
        errors.push('Missing field: fields (must be an object)');
      } else {
        for (const f of ['imageUrl', 'previewUrl', 'tags']) {
          if (!obj.fields[f] || typeof obj.fields[f] !== 'string') {
            errors.push(`Missing or invalid field: fields.${f} (must be a non-empty string)`);
          }
        }
      }
    } else if (type === 'scraper') {
      // Scraper-specific validation
      if (!obj.scraper || typeof obj.scraper !== 'object') {
        errors.push('Missing field: scraper (must be an object with selectors)');
      } else {
        const requiredSelectors = ['listPageUrl', 'listPageSelector', 'postLinkSelector', 'imageUrlSelector'];
        for (const selector of requiredSelectors) {
          if (!obj.scraper[selector] || typeof obj.scraper[selector] !== 'string') {
            errors.push(`Missing or invalid field: scraper.${selector} (must be a non-empty string)`);
          }
        }

        // Detail-page selectors are optional for list-only sources.
        if (obj.scraper.detailImageSelector !== undefined && obj.scraper.detailImageSelector !== null && typeof obj.scraper.detailImageSelector !== 'string') {
          errors.push('scraper.detailImageSelector must be a string when provided');
        }
      }
    } else {
      errors.push(`Invalid source type: "${type}". Must be "api" or "scraper".`);
    }

    return errors;
  }

  async submitImport() {
    const textarea = document.getElementById('import-source-json');
    const errorDiv = document.getElementById('import-source-error');
    const submitBtn = document.getElementById('submit-import-source-btn');

    const showError = (msg) => {
      if (errorDiv) { errorDiv.textContent = msg; errorDiv.style.display = 'block'; }
    };

    if (!textarea) return;
    const raw = textarea.value.trim();

    if (!raw) {
      showError('Please paste a source JSON before submitting.');
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      showError('Invalid JSON: ' + e.message);
      return;
    }

    const errors = this.validateImportedSource(parsed);
    if (errors.length > 0) {
      showError('Validation failed:\n• ' + errors.join('\n• '));
      return;
    }

    // Clear error and import
    if (errorDiv) { errorDiv.textContent = ''; errorDiv.style.display = 'none'; }
    if (submitBtn) submitBtn.disabled = true;

    this.sources.push(parsed);
    await this.saveSources();
    this.updateBooruSourceDropdown();
    this.renderSourcesList();
    this.closeImportModal();

    if (submitBtn) submitBtn.disabled = false;
  }

  exportSource(source) {
    this.openExportModal(source);
  }

  openExportModal(source) {
    this._exportingSource = source;
    const modal = document.getElementById('export-source-modal');
    const preview = document.getElementById('export-source-preview');
    const nameSpan = document.getElementById('export-source-modal-name');
    if (!modal) return;
    if (nameSpan) nameSpan.textContent = source.name;
    if (preview) preview.textContent = JSON.stringify(source, null, 2);
    modal.style.display = 'flex';
  }

  closeExportModal() {
    const modal = document.getElementById('export-source-modal');
    if (modal) modal.style.display = 'none';
    this._exportingSource = null;
  }

  downloadSourceJson(source) {
    const json = JSON.stringify(source, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${source.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  copySourceJsonToClipboard(source) {
    const json = JSON.stringify(source, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      if (typeof showToast === 'function') {
        showToast(`Source JSON copied to clipboard`, 'success');
      }
    }).catch(err => {
      console.error('Failed to copy to clipboard:', err);
      if (typeof showToast === 'function') {
        showToast('Failed to copy to clipboard', 'error');
      }
    });
  }

  // ---- End Import / Export ----

  openModal(source = null, isClone = false) {
    // For clones, don't set editingSourceId so it's treated as a new source
    this.editingSourceId = (source && !isClone) ? source.id : null;
    
    const modal = document.getElementById('booru-source-modal');
    const title = document.getElementById('booru-source-modal-title');
    
    if (!modal || !title) return;

    // Update title
    if (isClone) {
      title.innerHTML = `<i class="fas fa-copy"></i> Clone Booru Source`;
    } else if (source) {
      title.innerHTML = `<i class="fas fa-edit"></i> Edit Booru Source`;
    } else {
      title.innerHTML = `<i class="fas fa-plus"></i> Add New Booru Source`;
    }

    // Reset form
    this.resetForm();

    // Populate form if editing or cloning
    if (source) {
      this.populateForm(source);
      // For clones, enable the ID field so user can change it if desired
      if (isClone) {
        document.getElementById('source-id').disabled = false;
      }
    }

    // Show modal
    modal.style.display = 'flex';
  }

  closeModal() {
    const modal = document.getElementById('booru-source-modal');
    if (modal) {
      modal.style.display = 'none';
    }
    this.editingSourceId = null;
  }

  resetForm() {
    document.getElementById('booru-source-form')?.reset();
    document.getElementById('auth-fields').style.display = 'none';
    document.getElementById('safeMode-fields').style.display = 'none';
    document.getElementById('sort-param-field').style.display = 'none';
    document.getElementById('urlPrefix-field').style.display = 'none';
    document.getElementById('urlTemplates-fields').style.display = 'none';
    document.getElementById('scraper-config-section').style.display = 'none';
    // Default to API type
    document.getElementById('source-type').value = 'api';
    // clear cookies, UA and artistTag fields if they exist
    const cookiesEl = document.getElementById('source-cookies');
    if (cookiesEl) cookiesEl.value = '';
    const uaEl = document.getElementById('source-userAgent');
    if (uaEl) uaEl.value = '';
    const authUserIdEl = document.getElementById('source-auth-userId');
    if (authUserIdEl) authUserIdEl.value = '';
    const authApiKeyEl = document.getElementById('source-auth-apiKey');
    if (authApiKeyEl) authApiKeyEl.value = '';
    const artistTagEl = document.getElementById('source-fields-artistTag');
    if (artistTagEl) artistTagEl.value = '';
    const widthEl = document.getElementById('source-fields-width');
    if (widthEl) widthEl.value = '';
    const heightEl = document.getElementById('source-fields-height');
    if (heightEl) heightEl.value = '';
    const pageStartEl = document.getElementById('source-api-pageStart');
    if (pageStartEl) pageStartEl.value = '0';
  }

  populateForm(source) {
    // Source Type
    const sourceType = source.type || 'api';
    document.getElementById('source-type').value = sourceType;
    
    // Trigger change event to show/hide appropriate sections
    document.getElementById('source-type').dispatchEvent(new Event('change'));
    
    // Basic Info
    document.getElementById('source-id').value = source.id;
    document.getElementById('source-name').value = source.name;
    document.getElementById('source-baseUrl').value = source.baseUrl;
    document.getElementById('source-apiUrl').value = source.apiUrl || '';
    document.getElementById('source-cookies').value = source.cookies || '';
    document.getElementById('source-userAgent').value = source.userAgent || '';

    // Disable ID field when editing
    document.getElementById('source-id').disabled = true;

    // Authentication
    const authRequired = source.auth?.required || false;
    document.getElementById('source-auth-required').checked = authRequired;
    document.getElementById('auth-fields').style.display = authRequired ? 'block' : 'none';
    
    if (authRequired) {
      document.getElementById('source-auth-userIdKey').value = source.auth.userIdKey || '';
      document.getElementById('source-auth-apiKeyKey').value = source.auth.apiKeyKey || '';
      document.getElementById('source-auth-helpText').value = source.auth.helpText || '';
      const authUserIdEl = document.getElementById('source-auth-userId');
      if (authUserIdEl) authUserIdEl.value = source.auth.userId || '';
      const authApiKeyEl = document.getElementById('source-auth-apiKey');
      if (authApiKeyEl) authApiKeyEl.value = source.auth.apiKey || '';
    }

    // API Configuration (only populate if API type)
    if (sourceType === 'api') {
      if (source.api) {
        document.getElementById('source-api-basePath').value = source.api.basePath;
        document.getElementById('source-api-countBasePath').value = source.api.countBasePath || '';
        document.getElementById('source-api-jsonSupport').checked = source.api.jsonSupport || false;
        document.getElementById('source-api-limitParam').value = source.api.limitParam;
        document.getElementById('source-api-pageParam').value = source.api.pageParam;
        document.getElementById('source-api-tagsParam').value = source.api.tagsParam;
        document.getElementById('source-api-pageStart').value = source.api.pageStart || 0;
      }
      
      // Response Format
      if (source.response) {
        document.getElementById('source-response-countParser').value = source.response.countParser;
        document.getElementById('source-response-countPath').value = source.response.countPath || '';
        document.getElementById('source-response-wrapper').value = source.response.wrapper || '';
      }

      // Field Mappings
      if (source.fields) {
        document.getElementById('source-fields-imageUrl').value = source.fields.imageUrl;
        document.getElementById('source-fields-previewUrl').value = source.fields.previewUrl;
        document.getElementById('source-fields-sampleUrl').value = source.fields.sampleUrl;
        document.getElementById('source-fields-tags').value = source.fields.tags;
        document.getElementById('source-fields-artistTag').value = source.fields.artistTag || '';
        
        // Render meta tag fields
        this.renderMetaTagFields(source.fields.metaTagFields || []);
        
        document.getElementById('source-fields-createdAt').value = source.fields.createdAt;
        document.getElementById('source-fields-dateType').value = source.fields.dateType;
        document.getElementById('source-fields-tagsFilter').value = source.fields.tagsFilter || '';
        document.getElementById('source-fields-width').value = source.fields.width || '';
        document.getElementById('source-fields-height').value = source.fields.height || '';

        // URL Templates
        const useUrlTemplates = source.fields.useUrlTemplates || false;
        document.getElementById('source-fields-useUrlTemplates').checked = useUrlTemplates;
        document.getElementById('urlTemplates-fields').style.display = useUrlTemplates ? 'block' : 'none';
        if (useUrlTemplates) {
          if (source.fields.imageUrlTemplate) {
            document.getElementById('source-fields-imageUrlTemplate').value = source.fields.imageUrlTemplate;
          }
          if (source.fields.sampleUrlTemplate) {
            document.getElementById('source-fields-sampleUrlTemplate').value = source.fields.sampleUrlTemplate;
          }
          if (source.fields.thumbnailUrlTemplate) {
            document.getElementById('source-fields-thumbnailUrlTemplate').value = source.fields.thumbnailUrlTemplate;
          }
        }

        // Partial URLs
        document.getElementById('source-fields-partialUrls').checked = source.fields.partialUrls || false;
        const urlPrefixField = document.getElementById('urlPrefix-field');
        if (urlPrefixField) {
          urlPrefixField.style.display = source.fields.partialUrls ? 'block' : 'none';
          if (source.fields.urlPrefix) {
            document.getElementById('source-fields-urlPrefix').value = source.fields.urlPrefix;
          }
        }
      }

      // Sort Options
      const sortScoreMethod = source.sort?.scoreMethod || 'none';
      document.getElementById('source-sort-scoreMethod').value = sortScoreMethod;
      const sortParamField = document.getElementById('sort-param-field');
      if (sortParamField) {
        sortParamField.style.display = sortScoreMethod === 'param' ? 'block' : 'none';
        if (source.sort?.paramName) {
          document.getElementById('source-sort-paramName').value = source.sort.paramName;
        }
      }

      // Safe Mode
      const safeModeRequired = source.safeMode?.required || false;
      document.getElementById('source-safeMode-required').checked = safeModeRequired;
      document.getElementById('safeMode-fields').style.display = safeModeRequired ? 'block' : 'none';
      
      if (safeModeRequired) {
        document.getElementById('source-safeMode-url').value = source.safeMode.url || '';
        document.getElementById('source-safeMode-delay').value = source.safeMode.delay || 1000;
      }

      // Artist Configuration
      document.getElementById('source-artist-tagApiUrl').value = source.artist?.tagApiUrl || '';
      document.getElementById('source-artist-tagTypeKeyPath').value = source.artist?.tagTypeKeyPath || 'type';
      document.getElementById('source-artist-artistTypeValue').value = source.artist?.artistTypeValue || '1';
      document.getElementById('source-artist-tagSeparator').value = source.artist?.tagSeparator || ' ';
      document.getElementById('source-artist-postUrlPattern').value = source.artist?.postUrlPattern || '';
    } else if (sourceType === 'scraper' && source.scraper) {
      // Scraper configuration
      document.getElementById('scraper-listPageUrl').value = source.scraper.listPageUrl || '';
      document.getElementById('scraper-listPageSelector').value = source.scraper.listPageSelector || '';
      document.getElementById('scraper-postLinkSelector').value = source.scraper.postLinkSelector || '';
      document.getElementById('scraper-imageUrlSelector').value = source.scraper.imageUrlSelector || '';
      document.getElementById('scraper-imageUrlAttribute').value = source.scraper.imageUrlAttribute || 'src';
      document.getElementById('scraper-thumbnailWidthAttribute').value = source.scraper.thumbnailWidthAttribute || 'width';
      document.getElementById('scraper-thumbnailHeightAttribute').value = source.scraper.thumbnailHeightAttribute || 'height';
      document.getElementById('scraper-initialTagsAttribute').value = source.scraper.initialTagsAttribute || '';
      document.getElementById('scraper-initialTagsSelector').value = source.scraper.initialTagsSelector || source.scraper.listTagsSelector || '';
      document.getElementById('scraper-initialFileTypeAttribute').value = source.scraper.initialFileTypeAttribute || '';
      document.getElementById('scraper-initialFileTypeAttributeValue').value = source.scraper.initialFileTypeAttributeValue || '';
      document.getElementById('scraper-initialFileTypeGifTag').value = source.scraper.initialFileTypeGifTag || '';
      document.getElementById('scraper-fullImageUrlSelector').value = source.scraper.fullImageUrlSelector || source.scraper.hqUrlSelector || source.scraper.highQualityUrlSelector || '';
      document.getElementById('scraper-fullImageUrlAttribute').value = source.scraper.fullImageUrlAttribute || source.scraper.hqUrlAttribute || source.scraper.highQualityUrlAttribute || 'href';
      document.getElementById('scraper-fullImageUrlTextFilter').value = source.scraper.fullImageUrlTextFilter || source.scraper.hqUrlTextFilter || source.scraper.highQualityUrlTextFilter || '';
      document.getElementById('scraper-detailImageSelector').value = source.scraper.detailImageSelector || '';
      document.getElementById('scraper-detailImageAttribute').value = source.scraper.detailImageAttribute || 'src';
      document.getElementById('scraper-detailTagsSelector').value = source.scraper.detailTagsSelector || '';
      document.getElementById('scraper-detailGeneralTagsSelector').value = source.scraper.detailGeneralTagsSelector || '';
      document.getElementById('scraper-detailArtistTagsSelector').value = source.scraper.detailArtistTagsSelector || '';
      document.getElementById('scraper-detailTagTextExtraction').value = source.scraper.detailTagTextExtraction || 'text';
      document.getElementById('scraper-postsPerPage').value = source.scraper.postsPerPage || '42';
      document.getElementById('scraper-paginationStrategy').value = source.scraper.paginationStrategy || 'offset';
      document.getElementById('scraper-paginationParam').value = source.scraper.paginationParam || '';
      document.getElementById('scraper-paginationLastPageSelector').value = source.scraper.paginationLastPageSelector || '';
      document.getElementById('scraper-searchTagParam').value = source.scraper.searchTagParam || '';
      document.getElementById('scraper-searchTagSeparator').value = source.scraper.searchTagSeparator || '+';
    }

    // Gallery Display Options (applies to all source types)
    const invertAspectRatio = source.gallery?.invertAspectRatio || false;
    document.getElementById('source-invertAspectRatio').checked = invertAspectRatio;
  }

  getFormData() {
    const sourceType = document.getElementById('source-type').value;
    const data = {
      type: sourceType,
      id: document.getElementById('source-id').value.trim(),
      name: document.getElementById('source-name').value.trim(),
      baseUrl: document.getElementById('source-baseUrl').value.trim(),
      apiUrl: document.getElementById('source-apiUrl').value.trim() || undefined,
      auth: {
        required: document.getElementById('source-auth-required').checked
      },
      cookies: document.getElementById('source-cookies').value.trim(),
      userAgent: document.getElementById('source-userAgent').value.trim(),
      ui: {
        defaultSort: 'new',
        defaultLimit: 100,
        requiresProxy: false
      }
    };

    // Add optional auth fields
    if (data.auth.required) {
      data.auth.userIdKey = document.getElementById('source-auth-userIdKey').value.trim();
      data.auth.apiKeyKey = document.getElementById('source-auth-apiKeyKey').value.trim();
      data.auth.helpText = document.getElementById('source-auth-helpText').value.trim();
      data.auth.userId = (document.getElementById('source-auth-userId')?.value || '').trim();
      data.auth.apiKey = (document.getElementById('source-auth-apiKey')?.value || '').trim();
    }

    if (sourceType === 'api') {
      // API-specific fields
      data.api = {
        basePath: document.getElementById('source-api-basePath').value.trim(),
        countBasePath: document.getElementById('source-api-countBasePath').value.trim() || undefined,
        jsonSupport: document.getElementById('source-api-jsonSupport').checked,
        limitParam: document.getElementById('source-api-limitParam').value.trim(),
        pageParam: document.getElementById('source-api-pageParam').value.trim(),
        tagsParam: document.getElementById('source-api-tagsParam').value.trim(),
        pageStart: parseInt(document.getElementById('source-api-pageStart').value, 10) || 0
      };
      
      data.response = {
        countParser: document.getElementById('source-response-countParser').value,
        countPath: document.getElementById('source-response-countPath').value.trim(),
        wrapper: document.getElementById('source-response-wrapper').value.trim()
      };

      data.fields = {
        imageUrl: document.getElementById('source-fields-imageUrl').value.trim(),
        previewUrl: document.getElementById('source-fields-previewUrl').value.trim(),
        sampleUrl: document.getElementById('source-fields-sampleUrl').value.trim(),
        tags: document.getElementById('source-fields-tags').value.trim(),
        artistTag: document.getElementById('source-fields-artistTag').value.trim(),
        metaTagFields: this.getMetaTagFields(),
        createdAt: document.getElementById('source-fields-createdAt').value.trim(),
        dateType: document.getElementById('source-fields-dateType').value,
        tagsFilter: document.getElementById('source-fields-tagsFilter').value.trim(),
        width: document.getElementById('source-fields-width').value.trim(),
        height: document.getElementById('source-fields-height').value.trim(),
        partialUrls: document.getElementById('source-fields-partialUrls').checked,
        urlPrefix: document.getElementById('source-fields-urlPrefix').value.trim() || undefined,
        useUrlTemplates: document.getElementById('source-fields-useUrlTemplates').checked,
        imageUrlTemplate: document.getElementById('source-fields-imageUrlTemplate').value.trim() || undefined,
        sampleUrlTemplate: document.getElementById('source-fields-sampleUrlTemplate').value.trim() || undefined,
        thumbnailUrlTemplate: document.getElementById('source-fields-thumbnailUrlTemplate').value.trim() || undefined
      };

      data.sort = {
        scoreMethod: document.getElementById('source-sort-scoreMethod').value
      };
      if (data.sort.scoreMethod === 'param') {
        data.sort.paramName = document.getElementById('source-sort-paramName').value.trim();
      }

      data.safeMode = {
        required: document.getElementById('source-safeMode-required').checked
      };
      if (data.safeMode.required) {
        data.safeMode.url = document.getElementById('source-safeMode-url').value.trim();
        data.safeMode.delay = parseInt(document.getElementById('source-safeMode-delay').value) || 1000;
      }

      data.artist = {
        tagApiUrl: document.getElementById('source-artist-tagApiUrl').value.trim(),
        tagTypeKeyPath: document.getElementById('source-artist-tagTypeKeyPath').value.trim() || 'type',
        artistTypeValue: document.getElementById('source-artist-artistTypeValue').value.trim() || '1',
        tagSeparator: document.getElementById('source-artist-tagSeparator').value || ' ',
        postUrlPattern: document.getElementById('source-artist-postUrlPattern').value.trim()
      };
    } else if (sourceType === 'scraper') {
      // Scraper-specific fields
      data.scraper = {
        listPageUrl: document.getElementById('scraper-listPageUrl').value.trim(),
        listPageSelector: document.getElementById('scraper-listPageSelector').value.trim(),
        postLinkSelector: document.getElementById('scraper-postLinkSelector').value.trim(),
        imageUrlSelector: document.getElementById('scraper-imageUrlSelector').value.trim(),
        imageUrlAttribute: document.getElementById('scraper-imageUrlAttribute').value.trim() || 'src',
        thumbnailWidthAttribute: document.getElementById('scraper-thumbnailWidthAttribute').value.trim() || 'width',
        thumbnailHeightAttribute: document.getElementById('scraper-thumbnailHeightAttribute').value.trim() || 'height',
        initialTagsAttribute: document.getElementById('scraper-initialTagsAttribute').value.trim() || undefined,
        initialTagsSelector: document.getElementById('scraper-initialTagsSelector').value.trim() || undefined,
        initialFileTypeAttribute: document.getElementById('scraper-initialFileTypeAttribute').value.trim() || undefined,
        initialFileTypeAttributeValue: document.getElementById('scraper-initialFileTypeAttributeValue').value.trim() || undefined,
        initialFileTypeGifTag: document.getElementById('scraper-initialFileTypeGifTag').value.trim() || undefined,
        fullImageUrlSelector: document.getElementById('scraper-fullImageUrlSelector').value.trim() || undefined,
        fullImageUrlAttribute: document.getElementById('scraper-fullImageUrlAttribute').value.trim() || 'href',
        fullImageUrlTextFilter: document.getElementById('scraper-fullImageUrlTextFilter').value.trim() || undefined,
        detailImageSelector: document.getElementById('scraper-detailImageSelector').value.trim(),
        detailImageAttribute: document.getElementById('scraper-detailImageAttribute').value.trim() || 'src',
        detailTagsSelector: document.getElementById('scraper-detailTagsSelector').value.trim(),
        detailGeneralTagsSelector: document.getElementById('scraper-detailGeneralTagsSelector').value.trim(),
        detailArtistTagsSelector: document.getElementById('scraper-detailArtistTagsSelector').value.trim(),
        detailTagTextExtraction: document.getElementById('scraper-detailTagTextExtraction').value,
        postsPerPage: parseInt(document.getElementById('scraper-postsPerPage').value) || 42,
        paginationStrategy: document.getElementById('scraper-paginationStrategy').value,
        paginationParam: document.getElementById('scraper-paginationParam').value.trim(),
        paginationLastPageSelector: document.getElementById('scraper-paginationLastPageSelector').value.trim(),
        searchTagParam: document.getElementById('scraper-searchTagParam').value.trim(),
        searchTagSeparator: document.getElementById('scraper-searchTagSeparator').value.trim() || '+'
      };
    }

    // Gallery display options (applies to all source types)
    data.gallery = {
      invertAspectRatio: document.getElementById('source-invertAspectRatio').checked || false
    };

    return data;
  }

  validateFormData(data) {
    const errors = [];
    const sourceType = data.type || 'api';

    if (!data.id || !/^[a-z0-9_-]+$/.test(data.id)) {
      errors.push('Source ID must be lowercase alphanumeric with hyphens/underscores only');
    }

    if (!data.name) {
      errors.push('Display name is required');
    }

    if (!data.baseUrl || !data.baseUrl.startsWith('http')) {
      errors.push('Valid base URL is required');
    }

    // cookies are optional but should be a valid header string if provided
    if (data.cookies && typeof data.cookies !== 'string') {
      errors.push('Cookies must be a string');
    }
    if (data.userAgent && typeof data.userAgent !== 'string') {
      errors.push('User-Agent must be a string');
    }

    // Check for duplicate ID when adding new source
    if (!this.editingSourceId && this.sources.some(s => s.id === data.id)) {
      errors.push('Source ID already exists');
    }

    // Type-specific validation
    if (sourceType === 'api') {
      if (!data.api || !data.api.basePath) {
        errors.push('API base path is required');
      }
      if (isNaN(data.api.pageStart) || data.api.pageStart < 0) {
        errors.push('Page start index must be a non-negative number');
      }

      if (!data.response || !data.response.countParser) {
        errors.push('Count parser type is required');
      }

      if (!data.fields || !data.fields.imageUrl || !data.fields.previewUrl || !data.fields.tags) {
        errors.push('imageUrl, previewUrl, and tags field mappings are required');
      }

      if (data.fields.artistTag && typeof data.fields.artistTag !== 'string') {
        errors.push('Artist tag field must be a string');
      }
      if (data.fields.metaTagFields && !Array.isArray(data.fields.metaTagFields)) {
        errors.push('Meta tag fields must be an array');
      }
      if (data.artist?.tagApiUrl && typeof data.artist.tagApiUrl !== 'string') {
        errors.push('Artist Tag API URL must be a string');
      }
      if (data.fields.width && typeof data.fields.width !== 'string') {
        errors.push('Width field mapping must be a string');
      }
      if (data.fields.height && typeof data.fields.height !== 'string') {
        errors.push('Height field mapping must be a string');
      }
    } else if (sourceType === 'scraper') {
      if (!data.scraper) {
        errors.push('Scraper configuration is required');
      } else {
        const required = ['listPageUrl', 'listPageSelector', 'postLinkSelector', 'imageUrlSelector'];
        for (const field of required) {
          if (!data.scraper[field]) {
            errors.push(`Scraper field "${field}" is required`);
          }
        }

        // Detail-page selectors are optional; only validate them if present.
        if (data.scraper.detailImageSelector && typeof data.scraper.detailImageSelector !== 'string') {
          errors.push('Scraper field "detailImageSelector" must be a string when provided');
        }
      }
    } else {
      errors.push(`Invalid source type: ${sourceType}`);
    }

    return errors;
  }

  async saveSource() {
    const data = this.getFormData();
    const errors = this.validateFormData(data);

    if (errors.length > 0) {
      alert('Please fix the following errors:\n\n' + errors.join('\n'));
      return;
    }

    try {
      if (this.editingSourceId) {
        // Update existing source
        const index = this.sources.findIndex(s => s.id === this.editingSourceId);
        if (index !== -1) {
          this.sources[index] = data;
        }
      } else {
        // Add new source
        this.sources.push(data);
      }

      // Save to database
      const success = await this.saveSources();
      
      if (success) {
        // Update UI
        this.renderSourcesList();
        this.closeModal();
        
        // Also update the dropdown in the booru browser
        this.updateBooruSourceDropdown();
        document.dispatchEvent(new CustomEvent('booru-sources-updated', {
          detail: { sourceId: data.id }
        }));
        
        // Show success message
        console.log('Source saved successfully:', data.id);
      } else {
        alert('Failed to save source. Please try again.');
      }
    } catch (error) {
      console.error('Error saving source:', error);
      alert('Error saving source: ' + error.message);
    }

    // Re-enable ID field for next use
    document.getElementById('source-id').disabled = false;
  }

  cloneSource(source) {
    // Create a deep copy of the source
    const clonedSource = JSON.parse(JSON.stringify(source));
    
    // Generate new ID by appending "_copy" or incrementing copy number
    let newId = source.id + '_copy';
    let copyNum = 1;
    while (this.sources.some(s => s.id === newId)) {
      copyNum++;
      newId = source.id + '_copy' + copyNum;
    }
    clonedSource.id = newId;
    
    // Update name to indicate it's a copy
    clonedSource.name = source.name + ' (Copy)';
    if (copyNum > 1) {
      clonedSource.name = source.name + ' (Copy ' + copyNum + ')';
    }
    
    // Open modal with cloned data and isClone flag
    this.openModal(clonedSource, true);
  }

  async deleteSource(sourceId) {
    if (!confirm(`Are you sure you want to delete the source "${sourceId}"?\n\nThis action cannot be undone.`)) {
      return;
    }

    try {
      // Remove from array
      this.sources = this.sources.filter(s => s.id !== sourceId);

      // Save to database
      const success = await this.saveSources();

      if (success) {
        // Update UI
        this.renderSourcesList();
        this.updateBooruSourceDropdown();
        console.log('Source deleted successfully:', sourceId);
      } else {
        alert('Failed to delete source. Please try again.');
      }
    } catch (error) {
      console.error('Error deleting source:', error);
      alert('Error deleting source: ' + error.message);
    }
  }

  updateBooruSourceDropdown() {
    const dropdown = document.getElementById('booru-source-select');
    if (!dropdown) return;

    // Save current selection
    const currentValue = dropdown.value;

    // Clear and rebuild options
    dropdown.innerHTML = '';

    this.sources.forEach(source => {
      const option = document.createElement('option');
      option.value = source.id;
      option.textContent = source.name;
      dropdown.appendChild(option);
    });

    // Restore selection if it still exists
    if (this.sources.some(s => s.id === currentValue)) {
      dropdown.value = currentValue;
    } else if (this.sources.length > 0) {
      dropdown.value = this.sources[0].id;
    }
  }

  renderMetaTagFields(fields) {
    const container = document.getElementById('metaTagFields-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    fields.forEach((field, index) => {
      this.addMetaTagField(field.title, field.type, field.color, field.keyPath || '');
    });
  }

  addMetaTagField(title = '', type = '', color = '#64c43b', keyPath = '') {
    const container = document.getElementById('metaTagFields-container');
    if (!container) return;
    
    const row = document.createElement('tr');
    row.className = 'meta-tag-field-row';
    row.innerHTML = `
      <td>
        <input type="text" class="metaTag-field-title" placeholder="e.g., characters" value="${title}" />
      </td>
      <td>
        <input type="text" class="metaTag-field-type" placeholder="e.g., character" value="${type}" />
      </td>
      <td>
        <input type="text" class="metaTag-field-keyPath" placeholder="e.g., tags.character" value="${keyPath}" title="Nested path to tags (e.g., 'tags.character' for tags{character:[...]}). Leave empty to auto-detect." style="font-size: 12px;" />
      </td>
      <td>
        <div class="meta-tag-color-wrapper">
          <input type="color" class="metaTag-field-color" style="background: ${color}; height: 32px; width: 32px;" />
          <span class="meta-tag-color-value">${color.toUpperCase()}</span>
        </div>
      </td>
      <td style="text-align: center;">
        <span class="booru-preview-meta-tag booru-tag" style="background-color: ${color};">example</span>
      </td>
      <td style="text-align: center;">
        <button type="button" class="remove-metaTag-btn">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    
    const colorInput = row.querySelector('.metaTag-field-color');
    const colorValue = row.querySelector('.meta-tag-color-value');
    const previewTag = row.querySelector('.booru-preview-meta-tag');
    
    // Set the color input value (required for color inputs to work properly)
    colorInput.value = color;
    
    // Update displayed color value and preview when input changes
    colorInput.addEventListener('input', (e) => {
      colorValue.textContent = e.target.value.toUpperCase();
      colorInput.style.background = e.target.value;
      previewTag.style.backgroundColor = e.target.value;
    });
    
    const removeBtn = row.querySelector('.remove-metaTag-btn');
    removeBtn.addEventListener('click', () => {
      row.remove();
    });
    
    container.appendChild(row);
  }

  getMetaTagFields() {
    const container = document.getElementById('metaTagFields-container');
    if (!container) return [];
    
    const fields = [];
    const rows = container.querySelectorAll('.meta-tag-field-row');
    
    rows.forEach(row => {
      const title = row.querySelector('.metaTag-field-title')?.value?.trim() || '';
      const type = row.querySelector('.metaTag-field-type')?.value?.trim() || '';
      const color = row.querySelector('.metaTag-field-color')?.value || '#64c43b';
      const keyPath = row.querySelector('.metaTag-field-keyPath')?.value?.trim() || '';
      
      if (title && type) {
        fields.push({ title, type, color, keyPath });
      }
    });
    
    return fields;
  }

  getSource(sourceId) {
    return this.sources.find(s => s.id === sourceId);
  }

  /**
   * Run a simple validation / connectivity check for a source and display
   * a log of steps inside its card. This helps the user verify that the
   * configuration is correct and the API is reachable.
   */
  async testSource(source, cardElement) {
    // make sure the booru-browser helpers are available
    if (typeof buildCountUrl !== 'function' || typeof buildDataUrl !== 'function' || typeof proxyFetch !== 'function') {
      alert('Booru browser functionality isn\'t ready yet – please try again once the main interface has loaded.');
      return;
    }

    const logLines = [];
    /**
     * Append a short message to the card and optionally log verbose info to
     * the console. If `details` is provided the log renders a collapsible
     * details block in the card UI.
     */
    const addLog = (msg, details) => {
      logLines.push({ msg, details });
      this._updateCardLogs(cardElement, logLines);
      if (details !== undefined) {
        console.log('[Source Test]', msg, details);
      } else {
        console.log('[Source Test]', msg);
      }
    };

    const testBtn = cardElement.querySelector('.test');
    if (testBtn) {
      testBtn.disabled = true;
      testBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    addLog(`Starting test for source \"${source.id}\" (${source.name})`);

    // Route to appropriate test based on source type
    const sourceType = source.type || 'api';
    if (sourceType === 'scraper') {
      // Test scraper source
      if (!source.scraper || !source.scraper.listPageUrl) {
        addLog('❌ Invalid scraper configuration: missing listPageUrl');
        if (testBtn) {
          testBtn.disabled = false;
          testBtn.innerHTML = '<i class="fas fa-vial"></i>';
        }
        if (typeof showToast === 'function') {
          showToast('Invalid scraper configuration', 'error');
        }
        return;
      }

      try {
        addLog(`Testing list page: ${source.scraper.listPageUrl}`);
        const response = await proxyFetch(source.scraper.listPageUrl);
        addLog(`List page response status: ${response.status}`);
        const htmlContent = await response.text();
        addLog(`List page HTML length: ${htmlContent.length} bytes`);
        addLog(`List page HTML snippet: ${htmlContent.slice(0, 200).replace(/\s+/g, ' ')}…`);

        // Test parsing with configured selectors (include pagination for count extraction)
        try {
          addLog('Sending request to scraper endpoint...');
          const scraperResponse = await fetch('http://localhost:3001/api/scraper/fetch-page', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              html: htmlContent,
              selectors: {
                listPageSelector: source.scraper.listPageSelector,
                postLinkSelector: source.scraper.postLinkSelector,
                imageUrlSelector: source.scraper.imageUrlSelector,
                imageUrlAttribute: source.scraper.imageUrlAttribute || 'src',
                thumbnailWidthAttribute: source.scraper.thumbnailWidthAttribute || 'width',
                thumbnailHeightAttribute: source.scraper.thumbnailHeightAttribute || 'height',
                initialTagsAttribute: source.scraper.initialTagsAttribute || source.scraper.listTagsAttribute || source.scraper.tagsAttribute,
                initialTagsSelector: source.scraper.initialTagsSelector || source.scraper.listTagsSelector,
                detailTagTextExtraction: source.scraper.detailTagTextExtraction || 'text',
                paginationLastPageSelector: source.scraper.paginationLastPageSelector,
                paginationStrategy: source.scraper.paginationStrategy,
                paginationParam: source.scraper.paginationParam,
                postsPerPage: source.scraper.postsPerPage || 42,
                initialFileTypeAttribute: source.scraper.initialFileTypeAttribute || source.scraper.listFileTypeAttribute,
                initialFileTypeAttributeValue: source.scraper.initialFileTypeAttributeValue,
                initialFileTypeGifTag: source.scraper.initialFileTypeGifTag,
                fullImageUrlSelector: source.scraper.fullImageUrlSelector || source.scraper.hqUrlSelector || source.scraper.highQualityUrlSelector,
                fullImageUrlAttribute: source.scraper.fullImageUrlAttribute || source.scraper.hqUrlAttribute || source.scraper.highQualityUrlAttribute || 'href',
                fullImageUrlTextFilter: source.scraper.fullImageUrlTextFilter || source.scraper.hqUrlTextFilter || source.scraper.highQualityUrlTextFilter
              }
            })
          });

          addLog(`Scraper endpoint response status: ${scraperResponse.status}`);
          if (!scraperResponse.ok) {
            const errorText = await scraperResponse.text();
            addLog(`❌ Scraper endpoint error (${scraperResponse.status}): ${errorText.slice(0, 500)}`);
            throw new Error(`Scraper endpoint returned ${scraperResponse.status}`);
          }

          const scrapedData = await scraperResponse.json();
          if (scrapedData.success) {
            const posts = scrapedData.data.posts || [];
            addLog(`✓ Successfully parsed ${posts.length} posts from list page`, posts.slice(0, 3));
            
            if (posts.length > 0 && source.scraper.detailImageSelector) {
              // Try fetching a detail page if configured
              const firstPost = posts[0];
              let postUrl = firstPost.url;
              if (postUrl && !postUrl.startsWith('http')) {
                const baseUrl = new URL(source.scraper.listPageUrl);
                postUrl = baseUrl.origin + (postUrl.startsWith('/') ? '' : '/') + postUrl;
              }
              
              addLog(`Testing detail page: ${postUrl}`);
              const detailResp = await proxyFetch(postUrl);
              const detailHtml = await detailResp.text();
              addLog(`Detail page HTML length: ${detailHtml.length} bytes`);

              const detailScrapeResp = await fetch('http://localhost:3001/api/scraper/fetch-page', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  html: detailHtml,
                  selectors: {
                    detailImageSelector: source.scraper.detailImageSelector,
                    detailImageAttribute: source.scraper.detailImageAttribute || 'src',
                    detailTagsSelector: source.scraper.detailTagsSelector,
                    detailGeneralTagsSelector: source.scraper.detailGeneralTagsSelector,
                    detailArtistTagsSelector: source.scraper.detailArtistTagsSelector,
                    detailTagTextExtraction: source.scraper.detailTagTextExtraction
                  }
                })
              });

              if (!detailScrapeResp.ok) {
                addLog(`⚠️ Detail page scraper endpoint error (${detailScrapeResp.status})`);
              } else {
                const detailData = await detailScrapeResp.json();
                if (detailData.success) {
                  addLog('✓ Successfully parsed detail page', detailData.data);
                } else {
                  addLog('⚠️ Failed to parse detail page: ' + detailData.error);
                }
              }
            }

            addLog('Test finished - scraper configuration appears valid');
            if (typeof showToast === 'function') {
              showToast('Scraper test successful – check logs for details', 'success');
            }
          } else {
            addLog(`❌ Scraper parsing failed: ${scrapedData.error}`);
            if (typeof showToast === 'function') {
              showToast('Scraper parsing failed – check logs for details', 'error');
            }
          }
        } catch (err) {
          addLog(`❌ Scraper test failed: ${err.message}`);
          if (typeof showToast === 'function') {
            showToast('Scraper test failed: ' + err.message, 'error');
          }
        }
      } catch (err) {
        addLog(`❌ Failed to fetch list page: ${err.message}`);
        if (typeof showToast === 'function') {
          showToast('Failed to fetch list page: ' + err.message, 'error');
        }
      }

      if (testBtn) {
        testBtn.disabled = false;
        testBtn.innerHTML = '<i class="fas fa-vial"></i>';
      }
      return;
    }

    // credentials if required
    if (source.auth && source.auth.required) {
      const userId = window.userIdInput ? window.userIdInput.value.trim() : '';
      const apiKey = window.apiKeyInput ? window.apiKeyInput.value.trim() : '';
      if (!userId || !apiKey) {
        addLog('⚠️ Auth required but no credentials entered in main UI');
      } else {
        addLog('Auth credentials detected');
      }
    }
    if (source.userAgent) {
      addLog(`Using custom User-Agent: ${source.userAgent}`);
    }

    let testHeaders = {};

    // perform count request
    let countSuccess = true;
    try {
      const countUrl = buildCountUrl(source, '');
      addLog(`Count URL: ${countUrl}`, countUrl);
      // include source-specific cookies and user agent if defined
      if (source.cookies) testHeaders['Cookie'] = source.cookies;
      if (source.userAgent) testHeaders['User-Agent'] = source.userAgent;
      const resp = await proxyFetch(countUrl, { headers: testHeaders });
      addLog(`Count response status: ${resp.status}`, resp);
      const text = await resp.text();
      addLog(`Count response snippet: ${text.slice(0,200).replace(/\s+/g,' ')}${text.length>200? '…':''}`, text);
      try {
        const parsed = parseCount(text, source);
        addLog(`Parsed count: ${parsed}`, parsed);
      } catch (e) {
        addLog(`Failed to parse count: ${e.message}`, e);
      }
    } catch (err) {
      countSuccess = false;
      addLog(`Count request failed: ${err.message}`);
    }

    // perform data request (limit 1)
    let dataSuccess = true;
    try {
      const dataUrl = buildDataUrl(source, '', 1, 0, source.ui?.defaultSort || 'date');
      addLog(`Data URL: ${dataUrl}`, dataUrl);
      const resp2 = await proxyFetch(dataUrl, { headers: testHeaders });
      addLog(`Data response status: ${resp2.status}`, resp2);
      const text2 = await resp2.text();
      addLog(`Data response snippet: ${text2.slice(0,200).replace(/\s+/g,' ')}${text2.length>200? '…':''}`, text2);
      const posts = parsePosts(text2, source);
      addLog(`Parsed posts count: ${posts.length}`, posts);
      const norm = normalizePosts(posts, source);
      addLog(`Parsed raw posts count: ${posts.length}`, posts);
      if (posts.length > 0) {
        addLog('Raw post structure from source response:', posts[0]);
      }
      addLog(`Normalized posts count: ${norm.length}`, norm);
      if (norm.length > 0) {
        addLog('Sample normalized post:', norm[0]);
      }
    } catch (err) {
      dataSuccess = false;
      addLog(`Data request failed: ${err.message}`);
    }

    addLog('Test finished');
    if (testBtn) {
      testBtn.disabled = false;
      testBtn.innerHTML = '<i class="fas fa-vial"></i>';
    }

    // show a brief toast summarizing the outcome
    if (typeof showToast === 'function') {
      if (countSuccess && dataSuccess) {
        showToast('Source test complete – check logs for details', 'success');
      } else {
        showToast('Source test finished with errors – see logs', 'error');
      }
    }
  }

  async testSource(source, cardElement) {
    this.openSourceTestModal(source);
  }

  getSourceTestCatalog(source) {
    const tests = [
      {
        id: 'basic',
        label: 'Basic configuration',
        checks: [
          'Source ID',
          'Source name',
          'Base URL',
          'Core config fields'
        ]
      }
    ];

    if (source.type === 'scraper') {
      tests.push(
        {
          id: 'scraper-list',
          label: 'Scraper list page',
          checks: [
            'List page URL',
            'List post-link selector',
            'List image selector'
          ]
        },
        {
          id: 'scraper-detail',
          label: 'Scraper detail page',
          checks: [
            'Sample detail page URL',
            'Detail image selector',
            'Detail tags selector'
          ]
        }
      );
    } else {
      tests.push(
        {
          id: 'auth',
          label: 'Authentication',
          checks: [
            'Auth key names',
            'User ID value',
            'API key value',
            'Credentials accepted by API'
          ]
        },
        {
          id: 'count',
          label: 'Count endpoint',
          checks: [
            'Count request URL',
            'Count response status',
            'Count parser result'
          ]
        },
        {
          id: 'data',
          label: 'Data endpoint',
          checks: [
            'Data request URL',
            'Data response status',
            'Parsed post list'
          ]
        },
        {
          id: 'fields',
          label: 'Field mappings',
          checks: [
            'Required: imageUrl',
            'Required: previewUrl',
            'Required: tags',
            'Optional: sampleUrl',
            'Optional: artistTag',
            'Optional: createdAt',
            'Optional: width',
            'Optional: height'
          ]
        }
      );

      if (source.safeMode?.required) {
        tests.push({
          id: 'safe-mode',
          label: 'Safe mode check',
          checks: [
            'Safe-mode URL',
            'Safe-mode response status'
          ]
        });
      }

      if (source.artist?.tagApiUrl) {
        tests.push({
          id: 'artist',
          label: 'Artist tag lookup',
          checks: [
            'Artist tag URL template',
            'Artist auth params',
            'Artist tag response status'
          ]
        });
      }
    }

    return tests;
  }

  openSourceTestModal(source) {
    const modal = document.getElementById('source-test-modal');
    const list = document.getElementById('source-test-list');
    const title = document.getElementById('source-test-modal-title');
    const info = document.getElementById('source-test-modal-source');
    const log = document.getElementById('source-test-log');
    const runBtn = document.getElementById('run-selected-source-tests-btn');
    const runAllBtn = document.getElementById('run-all-source-tests-btn');

    if (!modal || !list) return;

    this.activeSourceTest = source;
    const catalog = this.getSourceTestCatalog(source);

    if (title) {
      title.innerHTML = `<i class="fas fa-vial"></i> Test source: ${source.name || source.id}`;
    }
    if (info) {
      info.textContent = `${source.id || 'unknown'} • ${source.type === 'scraper' ? 'HTML scraper' : 'API source'}`;
    }

    list.innerHTML = catalog.map((test) => `
      <label class="source-test-option is-pending" data-test-id="${test.id}">
        <input type="checkbox" data-test-id="${test.id}" checked />
        <span class="source-test-option-content">
          <strong>${test.label}</strong>
          <div class="source-test-checks">
            ${(test.checks || [test.description || '']).map((check) => `<div class="source-test-check-row">${check}</div>`).join('')}
          </div>
        </span>
      </label>
    `).join('');

    if (log) {
      log.innerHTML = '<div class="source-test-log-entry info">Select a test and run it.</div>';
    }

    if (runBtn) {
      runBtn.onclick = () => this.runSelectedSourceTests();
    }
    if (runAllBtn) {
      runAllBtn.onclick = () => {
        list.querySelectorAll('input[data-test-id]').forEach((input) => input.checked = true);
        this.runSelectedSourceTests();
      };
    }

    modal.style.display = 'flex';
  }

  resetSourceTestRows(listElement) {
    if (!listElement) return;
    const allRows = listElement.querySelectorAll('.source-test-option[data-test-id]');
    allRows.forEach((row) => {
      row.classList.remove('is-running', 'is-success', 'is-error');
      row.classList.add('is-pending');
    });
  }

  setSourceTestRowStatus(listElement, testId, status) {
    if (!listElement || !testId) return;
    const row = listElement.querySelector(`.source-test-option[data-test-id="${testId}"]`);
    if (!row) return;
    row.classList.remove('is-pending', 'is-running', 'is-success', 'is-error');
    if (status === 'running') row.classList.add('is-running');
    else if (status === 'success') row.classList.add('is-success');
    else if (status === 'error') row.classList.add('is-error');
    else row.classList.add('is-pending');
  }

  closeSourceTestModal() {
    const modal = document.getElementById('source-test-modal');
    if (modal) {
      modal.style.display = 'none';
    }
    this.activeSourceTest = null;
  }

  appendSourceTestLog(message, status = 'info', details = null) {
    const log = document.getElementById('source-test-log');
    if (!log) return;

    const escapeHtml = (value) => String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const formatDetails = (value) => {
      if (value === undefined || value === null) return '';
      if (typeof value === 'string') return value;
      if (value instanceof Error) return value.stack || value.message;
      if (typeof value === 'object') {
        if (value && typeof value.request === 'object') {
          const request = value.request || {};
          const response = value.response || {};
          const bodyText = typeof response.body === 'string' ? response.body : '';
          let formattedBody = bodyText;
          if (bodyText) {
            try {
              const parsedBody = JSON.parse(bodyText);
              formattedBody = JSON.stringify(parsedBody, null, 2);
            } catch (_) {
              formattedBody = bodyText;
            }
          }

          return [
            `Request: ${request.method || 'GET'} ${request.url || ''}`,
            `Response: ${response.status || ''} ${response.statusText || ''}`,
            '',
            formattedBody || JSON.stringify(value, null, 2)
          ].join('\n\n');
        }

        try {
          return JSON.stringify(value, null, 2);
        } catch (error) {
          return String(value);
        }
      }
      return String(value);
    };

    const row = document.createElement('div');
    row.className = `source-test-log-entry ${status}`;
    const formatted = formatDetails(details);
    row.innerHTML = `
      <div class="source-test-log-title">${escapeHtml(message)}</div>
      ${formatted ? `
        <details class="source-test-log-details-wrap" open>
          <summary>Request + response</summary>
          <pre class="source-test-log-details">${escapeHtml(formatted)}</pre>
        </details>
      ` : ''}
    `;
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }

  async runSelectedSourceTests() {
    const source = this.activeSourceTest;
    if (!source) return;

    const list = document.getElementById('source-test-list');
    const log = document.getElementById('source-test-log');
    if (!list || !log) return;

    const selected = [...list.querySelectorAll('input[data-test-id]:checked')].map((el) => el.dataset.testId);
    const catalog = this.getSourceTestCatalog(source);
    const chosen = catalog.filter((test) => selected.includes(test.id));
    this.resetSourceTestRows(list);

    log.innerHTML = '';
    this.appendSourceTestLog(`Testing ${source.name || source.id} (${source.type === 'scraper' ? 'scraper' : 'api'})`, 'info');

    if (!chosen.length) {
      this.appendSourceTestLog('No tests selected. Choose at least one check and try again.', 'warning');
      return;
    }

    let passed = 0;
    let failed = 0;

    for (const test of chosen) {
      const logger = (message, details = null, status = 'info') => {
        this.appendSourceTestLog(message, status, details);
      };

      try {
        this.setSourceTestRowStatus(list, test.id, 'running');
        let ok = false;
        switch (test.id) {
          case 'basic':
            ok = await this.runSourceBasicTest(source, logger);
            break;
          case 'auth':
            ok = await this.runSourceAuthTest(source, logger);
            break;
          case 'count':
            ok = await this.runSourceCountTest(source, logger);
            break;
          case 'data':
            ok = await this.runSourceDataTest(source, logger);
            break;
          case 'fields':
            ok = await this.runSourceFieldTest(source, logger);
            break;
          case 'safe-mode':
            ok = await this.runSourceSafeModeTest(source, logger);
            break;
          case 'artist':
            ok = await this.runSourceArtistTest(source, logger);
            break;
          case 'scraper-list':
            ok = await this.runSourceScraperListTest(source, logger);
            break;
          case 'scraper-detail':
            ok = await this.runSourceScraperDetailTest(source, logger);
            break;
          default:
            logger(`Unknown test: ${test.id}`, null, 'warning');
            ok = false;
        }
        if (ok) {
          this.setSourceTestRowStatus(list, test.id, 'success');
          passed += 1;
        } else {
          this.setSourceTestRowStatus(list, test.id, 'error');
          failed += 1;
        }
      } catch (error) {
        logger(`❌ ${test.label} failed: ${error.message || error}`, error, 'error');
        this.setSourceTestRowStatus(list, test.id, 'error');
        failed += 1;
      }
    }

    const summary = passed > 0 || failed > 0 ? `Finished: ${passed} passed, ${failed} failed.` : 'No tests were run.';
    this.appendSourceTestLog(summary, failed === 0 ? 'success' : 'warning');

    if (typeof showToast === 'function') {
      showToast(failed === 0 ? 'Source tests passed.' : 'Source tests finished with failures.', failed === 0 ? 'success' : 'error');
    }
  }

  async fetchConfiguredUrl(source, url, options = {}) {
    let requestUrl = url;
    if (source?.auth?.required) {
      const { userId, apiKey } = getSourceAuthCredentials(source);
      const userIdKey = source.auth.userIdKey || 'user_id';
      const apiKeyKey = source.auth.apiKeyKey || 'api_key';

      if (userId && apiKey) {
        requestUrl = appendUrlParam(requestUrl, userIdKey, userId);
        requestUrl = appendUrlParam(requestUrl, apiKeyKey, apiKey);
      }
    }

    const requestOptions = {
      ...options,
      headers: {
        ...(options.headers || {})
      }
    };

    if (source.cookies) {
      requestOptions.headers.Cookie = source.cookies;
    }
    if (source.userAgent) {
      requestOptions.headers['User-Agent'] = source.userAgent;
    }

    if (typeof proxyFetch === 'function') {
      return proxyFetch(requestUrl, requestOptions);
    }

    return fetch(requestUrl, requestOptions);
  }

  async runSourceBasicTest(source, logger) {
    const issues = [];
    const type = source.type || 'api';

    if (!source.id) issues.push('Missing source ID');
    if (!source.name) issues.push('Missing display name');
    if (!source.baseUrl || !/^https?:\/\//i.test(source.baseUrl)) issues.push('Base URL is missing or invalid');

    if (type === 'scraper') {
      const scraper = source.scraper || {};
      const required = ['listPageUrl', 'listPageSelector', 'postLinkSelector', 'imageUrlSelector'];
      required.forEach((field) => {
        if (!scraper[field]) issues.push(`Missing scraper field: ${field}`);
      });
    } else {
      if (!source.api?.basePath) issues.push('Missing API basePath');
      if (!source.response?.countParser) issues.push('Missing response.countParser');
      if (!source.fields?.imageUrl || !source.fields?.previewUrl || !source.fields?.tags) {
        issues.push('Required field mappings are missing');
      }
    }

    if (source.auth?.required && (!source.auth.userIdKey || !source.auth.apiKeyKey)) {
      issues.push('Authentication is enabled but userIdKey/apiKeyKey are not configured');
    }

    if (issues.length) {
      logger('❌ Basic configuration check failed', issues.join('\n'), 'error');
      return false;
    }

    logger('✅ Basic configuration looks valid', { sourceId: source.id, type }, 'success');
    return true;
  }

  async runSourceAuthTest(source, logger) {
    if (!source.auth?.required) {
      logger('ℹ️ This source does not require authentication.', null, 'info');
      return true;
    }

    const { userId, apiKey } = getSourceAuthCredentials(source);

    if (!source.auth.userIdKey || !source.auth.apiKeyKey) {
      logger('❌ Auth is required, but the API parameter names are missing from the source config.', null, 'error');
      return false;
    }

    if (!userId || !apiKey) {
      logger('❌ Auth is required, but no credentials are currently available in the app or source config.', null, 'error');
      return false;
    }

    const countUrl = buildCountUrl ? buildCountUrl(source, '') : `${source.apiUrl || source.baseUrl}${source.api.basePath}`;
    const response = await this.fetchConfiguredUrl(source, countUrl, { method: 'GET' });
    const text = await response.text();
    const payload = {
      request: { method: 'GET', url: countUrl },
      response: {
        status: response.status,
        statusText: response.statusText || 'OK',
        body: text
      }
    };
    const statusText = response.statusText || 'OK';
    if (!response.ok) {
      logger(`❌ Auth check failed: ${response.status} ${statusText}`, payload, 'error');
      return false;
    }

    if (isAuthFailureResponse(text)) {
      logger('❌ Authentication check failed: the endpoint rejected the supplied credentials.', payload, 'error');
      return false;
    }

    logger('✅ Authentication parameters are present and the count endpoint accepted the request.', payload, 'success');
    return true;
  }

  async runSourceCountTest(source, logger) {
    const api = source.api || {};
    if (!api.basePath) {
      logger('❌ Count test cannot run because API basePath is missing.', null, 'error');
      return false;
    }

    const countUrl = buildCountUrl(source, '');
    const response = await this.fetchConfiguredUrl(source, countUrl, { method: 'GET' });
    const text = await response.text();
    const payload = {
      request: { method: 'GET', url: countUrl },
      response: {
        status: response.status,
        statusText: response.statusText || 'OK',
        body: text
      }
    };

    if (!response.ok) {
      logger(`❌ Count endpoint failed with ${response.status}.`, payload, 'error');
      return false;
    }

    if (isAuthFailureResponse(text)) {
      logger('❌ Count endpoint rejected the request because authentication is missing or invalid.', payload, 'error');
      return false;
    }

    const parsed = parseCount ? parseCount(text, source) : null;
    if (parsed === null || Number.isNaN(parsed)) {
      logger('❌ Count endpoint returned data but the configured parser could not resolve a numeric count.', payload, 'error');
      return false;
    }

    logger(`✅ Count endpoint works: parsed total = ${parsed}.`, { ...payload, parsedCount: parsed }, 'success');
    return true;
  }

  async runSourceDataTest(source, logger) {
    const pageIndex = Number.isFinite(source.api?.pageStart) ? source.api.pageStart : 0;
    const dataUrl = buildDataUrl(source, '', 1, pageIndex, source.ui?.defaultSort || 'date');
    const response = await this.fetchConfiguredUrl(source, dataUrl, { method: 'GET' });
    const text = await response.text();
    const payload = {
      request: { method: 'GET', url: dataUrl },
      response: {
        status: response.status,
        statusText: response.statusText || 'OK',
        body: text
      }
    };

    if (!response.ok) {
      logger(`❌ Data request failed with ${response.status}.`, payload, 'error');
      return false;
    }

    const posts = parsePosts ? parsePosts(text, source) : [];
    if (!Array.isArray(posts) || posts.length === 0) {
      logger('❌ Data endpoint returned no posts.', payload, 'error');
      return false;
    }

    const normalized = normalizePosts ? normalizePosts(posts.slice(0, 3), source) : [];
    logger(`✅ Data endpoint works: ${posts.length} posts returned.`, {
      ...payload,
      samplePost: posts[0],
      normalizedCount: normalized.length
    }, 'success');
    return true;
  }

  async runSourceFieldTest(source, logger) {
    const pageIndex = Number.isFinite(source.api?.pageStart) ? source.api.pageStart : 0;
    const dataUrl = buildDataUrl(source, '', 1, pageIndex, source.ui?.defaultSort || 'date');
    const response = await this.fetchConfiguredUrl(source, dataUrl, { method: 'GET' });
    const text = await response.text();
    const payload = {
      request: { method: 'GET', url: dataUrl },
      response: {
        status: response.status,
        statusText: response.statusText || 'OK',
        body: text
      }
    };

    if (!response.ok) {
      logger(`❌ Field mapping test could not fetch data: ${response.status}.`, payload, 'error');
      return false;
    }

    const posts = parsePosts ? parsePosts(text, source) : [];
    if (!Array.isArray(posts) || posts.length === 0) {
      logger('❌ Field mapping test stopped: the endpoint returned no posts.', payload, 'error');
      return false;
    }

    const first = posts[0];
    const fieldMap = source.fields || {};
    const fieldChecks = {};
    const requiredKeys = ['imageUrl', 'previewUrl', 'tags'];
    const optionalKeys = ['sampleUrl', 'artistTag', 'createdAt', 'width', 'height'];

    [...requiredKeys, ...optionalKeys].forEach((key) => {
      const field = fieldMap[key];
      if (!field) return;
      const value = resolveField ? resolveField(first, field) : undefined;
      fieldChecks[key] = value;
    });

    const missingRequired = requiredKeys
      .filter((key) => fieldMap[key] && (fieldChecks[key] === undefined || fieldChecks[key] === null || fieldChecks[key] === ''))
      .map((key) => key);

    const missingOptional = optionalKeys
      .filter((key) => fieldMap[key] && (fieldChecks[key] === undefined || fieldChecks[key] === null || fieldChecks[key] === ''))
      .map((key) => key);

    if (missingRequired.length > 0) {
      logger(`❌ Missing required field mappings: ${missingRequired.join(', ')}.`, { ...payload, missingRequired, fieldChecks }, 'error');
      return false;
    }

    if (missingOptional.length > 0) {
      logger('ℹ️ Some optional field mappings are not present in this sample payload, but the required ones resolved correctly.', { ...payload, missingOptional, fieldChecks }, 'info');
    }

    logger('✅ Required field mappings resolve to data on a real post.', { ...payload, fieldChecks }, 'success');
    return true;
  }

  async runSourceSafeModeTest(source, logger) {
    if (!source.safeMode?.required) {
      logger('ℹ️ Safe mode is not required for this source.', null, 'info');
      return true;
    }

    const safeUrl = source.safeMode.url;
    if (!safeUrl) {
      logger('❌ Safe mode is enabled but no safe mode URL is configured.', null, 'error');
      return false;
    }

    const response = await this.fetchConfiguredUrl(source, safeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: ''
    });
    const text = await response.text();
    const payload = {
      request: { method: 'POST', url: safeUrl },
      response: {
        status: response.status,
        statusText: response.statusText || 'OK',
        body: text
      }
    };

    if (!response.ok) {
      logger(`❌ Safe mode verification failed: ${response.status}.`, payload, 'error');
      return false;
    }

    logger('✅ Safe mode request succeeded.', payload, 'success');
    return true;
  }

  async runSourceArtistTest(source, logger) {
    if (!source.artist?.tagApiUrl) {
      logger('ℹ️ No artist tag API URL is configured for this source.', null, 'info');
      return true;
    }

    const artistUrl = buildArtistTagLookupUrl(source, 'solo 1girl');
    const response = await this.fetchConfiguredUrl(source, artistUrl, { method: 'GET' });
    const text = await response.text();
    const payload = {
      request: { method: 'GET', url: artistUrl },
      response: {
        status: response.status,
        statusText: response.statusText || 'OK',
        body: text
      }
    };

    if (!response.ok) {
      logger(`❌ Artist tag lookup failed: ${response.status}.`, payload, 'error');
      return false;
    }

    logger('✅ Artist tag lookup URL is reachable and responded successfully.', payload, 'success');
    return true;
  }

  async runSourceScraperListTest(source, logger) {
    if (!source.scraper?.listPageUrl) {
      logger('❌ Scraper list test is missing a listPageUrl.', null, 'error');
      return false;
    }

    const response = await this.fetchConfiguredUrl(source, source.scraper.listPageUrl, { method: 'GET' });
    const html = await response.text();
    const payload = {
      request: { method: 'GET', url: source.scraper.listPageUrl },
      response: {
        status: response.status,
        statusText: response.statusText || 'OK',
        body: html
      }
    };

    if (!response.ok) {
      logger(`❌ List page request failed with ${response.status}.`, payload, 'error');
      return false;
    }

    const scraperResponse = await fetch('http://localhost:3001/api/scraper/fetch-page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html,
        selectors: {
          listPageSelector: source.scraper.listPageSelector,
          postLinkSelector: source.scraper.postLinkSelector,
          imageUrlSelector: source.scraper.imageUrlSelector,
          imageUrlAttribute: source.scraper.imageUrlAttribute || 'src',
          thumbnailWidthAttribute: source.scraper.thumbnailWidthAttribute || 'width',
          thumbnailHeightAttribute: source.scraper.thumbnailHeightAttribute || 'height',
          initialTagsAttribute: source.scraper.initialTagsAttribute || source.scraper.listTagsAttribute || source.scraper.tagsAttribute,
          initialTagsSelector: source.scraper.initialTagsSelector || source.scraper.listTagsSelector,
          detailTagTextExtraction: source.scraper.detailTagTextExtraction || 'text',
          initialFileTypeAttribute: source.scraper.initialFileTypeAttribute || source.scraper.listFileTypeAttribute,
          initialFileTypeAttributeValue: source.scraper.initialFileTypeAttributeValue,
          initialFileTypeGifTag: source.scraper.initialFileTypeGifTag,
          fullImageUrlSelector: source.scraper.fullImageUrlSelector || source.scraper.hqUrlSelector || source.scraper.highQualityUrlSelector,
          fullImageUrlAttribute: source.scraper.fullImageUrlAttribute || source.scraper.hqUrlAttribute || source.scraper.highQualityUrlAttribute || 'href',
          fullImageUrlTextFilter: source.scraper.fullImageUrlTextFilter || source.scraper.hqUrlTextFilter || source.scraper.highQualityUrlTextFilter,
          paginationLastPageSelector: source.scraper.paginationLastPageSelector,
          paginationStrategy: source.scraper.paginationStrategy,
          paginationParam: source.scraper.paginationParam,
          postsPerPage: source.scraper.postsPerPage || 42
        }
      })
    });

    const scraperBody = await scraperResponse.text();
    if (!scraperResponse.ok) {
      logger(`❌ Scraper endpoint returned ${scraperResponse.status}.`, {
        request: { method: 'POST', url: 'http://localhost:3001/api/scraper/fetch-page' },
        response: { status: scraperResponse.status, statusText: scraperResponse.statusText || 'OK', body: scraperBody }
      }, 'error');
      return false;
    }

    const data = JSON.parse(scraperBody);
    const posts = Array.isArray(data?.data?.posts) ? data.data.posts : [];
    if (!posts.length) {
      logger('❌ The configured scraper selectors did not produce any list items.', { ...payload, scraperResponse: data }, 'error');
      return false;
    }

    logger(`✅ Scraper list selectors produced ${posts.length} post entries.`, { sourceUrl: source.scraper.listPageUrl, scraperResponse: data, samplePost: posts[0] }, 'success');
    return true;
  }

  async runSourceScraperDetailTest(source, logger) {
    if (!source.scraper?.detailImageSelector) {
      logger('ℹ️ No detailImageSelector is configured for this source, so the detail-page check is skipped.', null, 'info');
      return true;
    }

    const response = await this.fetchConfiguredUrl(source, source.scraper.listPageUrl, { method: 'GET' });
    const html = await response.text();
    const listPayload = {
      request: { method: 'GET', url: source.scraper.listPageUrl },
      response: {
        status: response.status,
        statusText: response.statusText || 'OK',
        body: html
      }
    };

    if (!response.ok) {
      logger(`❌ List page request failed with ${response.status}.`, listPayload, 'error');
      return false;
    }

    const scraperResponse = await fetch('http://localhost:3001/api/scraper/fetch-page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html,
        selectors: {
          listPageSelector: source.scraper.listPageSelector,
          postLinkSelector: source.scraper.postLinkSelector,
          imageUrlSelector: source.scraper.imageUrlSelector,
          imageUrlAttribute: source.scraper.imageUrlAttribute || 'src',
          thumbnailWidthAttribute: source.scraper.thumbnailWidthAttribute || 'width',
          thumbnailHeightAttribute: source.scraper.thumbnailHeightAttribute || 'height',
          initialTagsAttribute: source.scraper.initialTagsAttribute || source.scraper.listTagsAttribute || source.scraper.tagsAttribute,
          initialTagsSelector: source.scraper.initialTagsSelector || source.scraper.listTagsSelector,
          detailTagTextExtraction: source.scraper.detailTagTextExtraction || 'text',
          initialFileTypeAttribute: source.scraper.initialFileTypeAttribute || source.scraper.listFileTypeAttribute,
          initialFileTypeAttributeValue: source.scraper.initialFileTypeAttributeValue,
          initialFileTypeGifTag: source.scraper.initialFileTypeGifTag,
          fullImageUrlSelector: source.scraper.fullImageUrlSelector || source.scraper.hqUrlSelector || source.scraper.highQualityUrlSelector,
          fullImageUrlAttribute: source.scraper.fullImageUrlAttribute || source.scraper.hqUrlAttribute || source.scraper.highQualityUrlAttribute || 'href',
          fullImageUrlTextFilter: source.scraper.fullImageUrlTextFilter || source.scraper.hqUrlTextFilter || source.scraper.highQualityUrlTextFilter,
          paginationLastPageSelector: source.scraper.paginationLastPageSelector,
          paginationStrategy: source.scraper.paginationStrategy,
          paginationParam: source.scraper.paginationParam,
          postsPerPage: source.scraper.postsPerPage || 42
        }
      })
    });

    const listScrapeBody = await scraperResponse.text();
    if (!scraperResponse.ok) {
      logger(`❌ Detail scraper test could not fetch list data: ${scraperResponse.status}.`, {
        request: { method: 'POST', url: 'http://localhost:3001/api/scraper/fetch-page' },
        response: { status: scraperResponse.status, statusText: scraperResponse.statusText || 'OK', body: listScrapeBody }
      }, 'error');
      return false;
    }

    const data = JSON.parse(listScrapeBody);
    const firstPost = Array.isArray(data?.data?.posts) ? data.data.posts[0] : null;
    if (!firstPost || !firstPost.url) {
      logger('❌ The scraper list page does not expose any usable post URL for detail validation.', { ...listPayload, scraperResponse: data }, 'error');
      return false;
    }

    const detailUrl = firstPost.url.startsWith('http') ? firstPost.url : new URL(firstPost.url, source.scraper.listPageUrl).toString();
    const detailResponse = await this.fetchConfiguredUrl(source, detailUrl, { method: 'GET' });
    const detailHtml = await detailResponse.text();
    const detailPayload = {
      request: { method: 'GET', url: detailUrl },
      response: {
        status: detailResponse.status,
        statusText: detailResponse.statusText || 'OK',
        body: detailHtml
      }
    };

    if (!detailResponse.ok) {
      logger(`❌ Detail page request failed: ${detailResponse.status}.`, detailPayload, 'error');
      return false;
    }

    const detailScrape = await fetch('http://localhost:3001/api/scraper/fetch-page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html: detailHtml,
        selectors: {
          detailImageSelector: source.scraper.detailImageSelector,
          detailImageAttribute: source.scraper.detailImageAttribute || 'src',
          detailTagsSelector: source.scraper.detailTagsSelector,
          detailGeneralTagsSelector: source.scraper.detailGeneralTagsSelector,
          detailArtistTagsSelector: source.scraper.detailArtistTagsSelector,
          detailTagTextExtraction: source.scraper.detailTagTextExtraction
        }
      })
    });

    const detailScrapeBody = await detailScrape.text();
    if (!detailScrape.ok) {
      logger(`❌ Detail scraper endpoint failed: ${detailScrape.status}.`, {
        request: { method: 'POST', url: 'http://localhost:3001/api/scraper/fetch-page' },
        response: { status: detailScrape.status, statusText: detailScrape.statusText || 'OK', body: detailScrapeBody }
      }, 'error');
      return false;
    }

    const detailData = JSON.parse(detailScrapeBody);
    const result = detailData?.data || {};
    if (!result.imageUrl && !result.image && !result.tags) {
      logger('❌ The configured detail selectors did not resolve an image or tags.', { ...detailPayload, detailData }, 'error');
      return false;
    }

    logger('✅ Scraper detail selectors resolved a real image/tags payload.', { ...detailPayload, detailData }, 'success');
    return true;
  }

  _updateCardLogs(cardElement, lines) {
    const escapeHTML = (str) => String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const formatDetails = (details) => {
      if (details === undefined) return '';
      if (typeof details === 'string') {
        return escapeHTML(details);
      }
      try {
        return escapeHTML(JSON.stringify(details, null, 2));
      } catch (_) {
        return escapeHTML(String(details));
      }
    };

    let logContainer = cardElement.querySelector('.booru-source-card-logs');
    if (!logContainer) {
      logContainer = document.createElement('div');
      logContainer.className = 'booru-source-card-logs';
      // place log container before footer if footer exists so test button stays at bottom
      const footer = cardElement.querySelector('.booru-source-card-footer');
      if (footer) {
        cardElement.insertBefore(logContainer, footer);
      } else {
        cardElement.appendChild(logContainer);
      }
    }

    logContainer.innerHTML = lines.map(line => {
      const message = `<div class="booru-source-log-message">${escapeHTML(line.msg)}</div>`;
      if (line.details === undefined) {
        return `<div class="booru-source-log-line">${message}</div>`;
      }

      const detailsText = formatDetails(line.details);
      return `
        <div class="booru-source-log-line">
          ${message}
          <details class="booru-source-log-details">
            <summary>View details</summary>
            <pre>${detailsText}</pre>
          </details>
        </div>
      `;
    }).join('');

    logContainer.scrollTop = logContainer.scrollHeight;
  }

  getAllSources() {
    return [...this.sources];
  }
}

// Create global instance
window.booruSourcesManager = new BooruSourcesManager();
const booruSourcesManager = window.booruSourcesManager;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    booruSourcesManager.init();
  });
} else {
  booruSourcesManager.init();
}
