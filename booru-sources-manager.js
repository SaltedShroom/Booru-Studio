// Booru Sources Manager - Handles CRUD operations for booru source configurations

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
          tagsParam: "tags"
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
          createdAt: "change",
          dateType: "timestamp",
          tagsFilter: ""
        },
        sort: {
          scoreMethod: "tags"
        },
        safeMode: {
          required: true,
          url: "https://bbooru.com/index.php?page=account&s=safe_mode&set=adult",
          delay: 500
        },
        artist: {
          tagApiUrl: "/index.php?page=dapi&s=tag&q=index&json=1&names={tags}",
          tagTypeKeyPath: "type",
          artistTypeValue: "1",
          tagSeparator: " ",
          postUrlPattern: "/index.php?page=post&s=view&id={id}"
        },
        ui: {
          defaultSort: "new",
          defaultLimit: 100,
          requiresProxy: false
        }
      }
    ];
  }

  setupEventListeners() {
    // Add new source button
    document.getElementById('add-booru-source-btn')?.addEventListener('click', () => {
      this.openModal();
    });

    // Modal close buttons
    document.getElementById('close-booru-source-modal')?.addEventListener('click', () => {
      this.closeModal();
    });
    
    document.getElementById('cancel-booru-source-btn')?.addEventListener('click', () => {
      this.closeModal();
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

    // Close modal on overlay click
    document.getElementById('booru-source-modal')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay')) {
        this.closeModal();
      }
    });

    // Import source button
    document.getElementById('import-booru-source-btn')?.addEventListener('click', () => {
      this.openImportModal();
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
      return;
    }

    this.sources.forEach(source => {
      const card = this.createSourceCard(source);
      listContainer.appendChild(card);
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
          <span>${source.response.countParser.toUpperCase()}</span>
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

    // API Configuration
    document.getElementById('source-api-basePath').value = source.api.basePath;
    document.getElementById('source-api-countBasePath').value = source.api.countBasePath || '';
    document.getElementById('source-api-jsonSupport').checked = source.api.jsonSupport || false;
    document.getElementById('source-api-limitParam').value = source.api.limitParam;
    document.getElementById('source-api-pageParam').value = source.api.pageParam;
    document.getElementById('source-api-tagsParam').value = source.api.tagsParam;
      document.getElementById('source-api-pageStart').value = source.api.pageStart || 0;
    // Response Format
    document.getElementById('source-response-countParser').value = source.response.countParser;
    document.getElementById('source-response-countPath').value = source.response.countPath || '';
    document.getElementById('source-response-wrapper').value = source.response.wrapper || '';

    // Field Mappings
    document.getElementById('source-fields-imageUrl').value = source.fields.imageUrl;
    document.getElementById('source-fields-previewUrl').value = source.fields.previewUrl;
    document.getElementById('source-fields-sampleUrl').value = source.fields.sampleUrl;
    document.getElementById('source-fields-tags').value = source.fields.tags;
    document.getElementById('source-fields-artistTag').value = source.fields.artistTag || '';
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
  }

  getFormData() {
    const data = {
      id: document.getElementById('source-id').value.trim(),
      name: document.getElementById('source-name').value.trim(),
      baseUrl: document.getElementById('source-baseUrl').value.trim(),
      apiUrl: document.getElementById('source-apiUrl').value.trim() || undefined,
      auth: {
        required: document.getElementById('source-auth-required').checked
      },
      api: {
        basePath: document.getElementById('source-api-basePath').value.trim(),
        countBasePath: document.getElementById('source-api-countBasePath').value.trim() || undefined,
        jsonSupport: document.getElementById('source-api-jsonSupport').checked,
        limitParam: document.getElementById('source-api-limitParam').value.trim(),
        pageParam: document.getElementById('source-api-pageParam').value.trim(),
        tagsParam: document.getElementById('source-api-tagsParam').value.trim(),
        pageStart: parseInt(document.getElementById('source-api-pageStart').value, 10) || 0,
        pageStart: parseInt(document.getElementById('source-api-pageStart').value, 10) || 0
      },
      response: {
        countParser: document.getElementById('source-response-countParser').value,
        countPath: document.getElementById('source-response-countPath').value.trim(),
        wrapper: document.getElementById('source-response-wrapper').value.trim()
      },
      fields: {
        imageUrl: document.getElementById('source-fields-imageUrl').value.trim(),
        previewUrl: document.getElementById('source-fields-previewUrl').value.trim(),
        sampleUrl: document.getElementById('source-fields-sampleUrl').value.trim(),
        tags: document.getElementById('source-fields-tags').value.trim(),
        artistTag: document.getElementById('source-fields-artistTag').value.trim(),
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
      },
      sort: {
        scoreMethod: document.getElementById('source-sort-scoreMethod').value
      },
      safeMode: {
        required: document.getElementById('source-safeMode-required').checked
      },
      artist: {
        tagApiUrl: document.getElementById('source-artist-tagApiUrl').value.trim(),
        tagTypeKeyPath: document.getElementById('source-artist-tagTypeKeyPath').value.trim() || 'type',
        artistTypeValue: document.getElementById('source-artist-artistTypeValue').value.trim() || '1',
        tagSeparator: document.getElementById('source-artist-tagSeparator').value || ' ',
        postUrlPattern: document.getElementById('source-artist-postUrlPattern').value.trim()
      },
      ui: {
        defaultSort: 'new',
        defaultLimit: 100,
        requiresProxy: false
      }
    };

    // Add optional fields
    if (data.auth.required) {
      data.auth.userIdKey = document.getElementById('source-auth-userIdKey').value.trim();
      data.auth.apiKeyKey = document.getElementById('source-auth-apiKeyKey').value.trim();
      data.auth.helpText = document.getElementById('source-auth-helpText').value.trim();
      data.auth.userId = (document.getElementById('source-auth-userId')?.value || '').trim();
      data.auth.apiKey = (document.getElementById('source-auth-apiKey')?.value || '').trim();
    }
    // cookies string
    data.cookies = document.getElementById('source-cookies').value.trim();
    data.userAgent = document.getElementById('source-userAgent').value.trim();

    if (data.sort.scoreMethod === 'param') {
      data.sort.paramName = document.getElementById('source-sort-paramName').value.trim();
    }

    if (data.safeMode.required) {
      data.safeMode.url = document.getElementById('source-safeMode-url').value.trim();
      data.safeMode.delay = parseInt(document.getElementById('source-safeMode-delay').value) || 1000;
    }

    return data;
  }

  validateFormData(data) {
    const errors = [];

    if (!data.id || !/^[a-z0-9_-]+$/.test(data.id)) {
      errors.push('Source ID must be lowercase alphanumeric with hyphens/underscores only');
    }
    // cookies are optional but should be a valid header string if provided
    if (data.cookies && typeof data.cookies !== 'string') {
      errors.push('Cookies must be a string');
    }
    if (data.userAgent && typeof data.userAgent !== 'string') {
      errors.push('User-Agent must be a string');
    }
    if (data.fields.artistTag && typeof data.fields.artistTag !== 'string') {
      errors.push('Artist tag field must be a string');
    }
    if (data.artist.tagApiUrl && typeof data.artist.tagApiUrl !== 'string') {
      errors.push('Artist Tag API URL must be a string');
    }
    if (data.artist.tagTypeKeyPath && typeof data.artist.tagTypeKeyPath !== 'string') {
      errors.push('Artist Tag Type Key Path must be a string');
    }
    if (data.artist.artistTypeValue && typeof data.artist.artistTypeValue !== 'string') {
      errors.push('Artist Tag Type Value must be a string');
    }
    if (data.artist.tagSeparator && typeof data.artist.tagSeparator !== 'string') {
      errors.push('Tag Separator must be a string');
    }
    if (data.artist.postUrlPattern && typeof data.artist.postUrlPattern !== 'string') {
      errors.push('Post Page URL Pattern must be a string');
    }
    if (data.fields.width && typeof data.fields.width !== 'string') {
      errors.push('Width field mapping must be a string');
    }
    if (data.fields.height && typeof data.fields.height !== 'string') {
      errors.push('Height field mapping must be a string');
    }

    if (!data.name) {
      errors.push('Display name is required');
    }

    if (!data.baseUrl || !data.baseUrl.startsWith('http')) {
      errors.push('Valid base URL is required');
    }

    if (!data.api.basePath) {
      errors.push('API base path is required');
    }
    if (isNaN(data.api.pageStart) || data.api.pageStart < 0) {
      errors.push('Page start index must be a non-negative number');
    }

    if (!data.response.countParser) {
      errors.push('Count parser type is required');
    }

    // Check for duplicate ID when adding new source
    if (!this.editingSourceId && this.sources.some(s => s.id === data.id)) {
      errors.push('Source ID already exists');
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
const booruSourcesManager = new BooruSourcesManager();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    booruSourcesManager.init();
  });
} else {
  booruSourcesManager.init();
}
