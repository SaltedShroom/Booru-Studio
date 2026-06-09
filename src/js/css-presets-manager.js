// CSS Presets Manager
// Handles creation, editing, and management of custom CSS presets with monaco-editor

let cssPresetsManager = {
  editor: null,
  currentPresetId: null,
  isEditingNewPreset: false,
  allPresets: [],
  emptyStateHTML: '<div style="padding: 10px; text-align: center; color: var(--text-secondary);">No CSS presets yet. Create one to get started!</div>',
  jsonHeaders: { 'Content-Type': 'application/json' },

  // Initialize the CSS presets manager
  async init() {
    await this.loadPresets();
    
    // Attach event listeners
    document.getElementById('css-add-preset-btn')?.addEventListener('click', () => {
      this.currentPresetId = null;
      this.isEditingNewPreset = true;
      this.openEditor('', 'New CSS Preset');
    });
    document.getElementById('css-load-presets-btn')?.addEventListener('click', () => this.loadPresets());
    document.getElementById('css-cancel-preset-btn')?.addEventListener('click', () => {
      document.getElementById('css-editor-container').style.display = 'none';
      this.currentPresetId = null;
      this.isEditingNewPreset = false;
    });
    
    this.applyActivePresets();
  },

  // Load all presets from database and render them
  async loadPresets() {
    try {
      const response = await fetch('http://localhost:3001/api/css-presets', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      this.allPresets = await response.json();
      this.renderPresetsList();
    } catch (err) {
      console.error('Failed to load CSS presets:', err);
      showToast('Failed to load CSS presets: ' + err.message, 'error');
    }
  },

  // Generate preset item HTML
  getPresetItemHTML(preset) {
    const isActive = preset.is_active;
    return `
      <div class="css-preset-item" data-preset-id="${preset.id}">
        <div class="css-preset-item-info">
          <input 
            type="checkbox" 
            class="css-preset-item-checkbox css-preset-active-checkbox"
            ${isActive ? 'checked' : ''}
            data-preset-id="${preset.id}"
            title="Toggle preset active/inactive"
          />
          <span class="css-preset-item-name" data-preset-id="${preset.id}" style="cursor: pointer;">
            ${this.escapeHtml(preset.name)}
          </span>
          ${isActive ? '<span class="css-preset-item-active-badge">Active</span>' : ''}
        </div>
        <div class="css-preset-item-actions">
          <div class="css-preset-item-btn css-preset-edit-btn" data-preset-id="${preset.id}" title="Edit this preset" style="cursor: pointer;">
            <i class="fas fa-edit"></i> Edit
          </div>
          <div class="css-preset-item-btn css-preset-delete-btn css-preset-item-btn-danger" data-preset-id="${preset.id}" title="Delete this preset" style="cursor: pointer;">
            <i class="fas fa-trash"></i> Delete
          </div>
        </div>
      </div>
    `;
  },

  // Render the presets list
  renderPresetsList() {
    const container = document.getElementById('css-presets-list');
    if (!container) return;

    if (this.allPresets.length === 0) {
      container.innerHTML = this.emptyStateHTML;
      return;
    }

    container.innerHTML = this.allPresets.map(p => this.getPresetItemHTML(p)).join('');

    // Clone to remove all old event listeners
    const newContainer = container.cloneNode(true);
    container.parentNode.replaceChild(newContainer, container);
    const updatedContainer = document.getElementById('css-presets-list');

    // Attach event listeners using event delegation
    updatedContainer.addEventListener('change', (e) => {
      if (e.target.classList.contains('css-preset-item-checkbox')) {
        this.togglePresetActive(e.target.dataset.presetId, e.target.checked);
      }
    });
    
    updatedContainer.addEventListener('click', (e) => {
      const presetId = e.target.closest('[data-preset-id]')?.dataset.presetId;
      if (!presetId) return;
      
      const preset = this.allPresets.find(p => p.id === presetId);
      if (!preset) return;
      
      if (e.target.closest('.css-preset-item-name') || e.target.closest('.css-preset-edit-btn')) {
        this.currentPresetId = presetId;
        this.isEditingNewPreset = false;
        this.openEditor(preset.code || '', preset.name);
      } else if (e.target.closest('.css-preset-delete-btn')) {
        this.deletePreset(presetId);
      }
    });
  },

  // Generate a unique ID for new presets
  generateId() {
    return 'preset_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  },

  // Open the editor
  openEditor(code, presetName) {
    const nameInput = document.getElementById('css-preset-name');
    if (!nameInput) return;

    nameInput.value = presetName;
    document.getElementById('css-editor-container').style.display = 'flex';

    if (!this.editor) {
      this.initMonacoEditor(document.getElementById('css-monaco-editor'), code);
    } else {
      this.editor.setValue(code);
    }
    
    // Attach auto-save listener to name input (saves on every keystroke)
    nameInput.removeEventListener('input', () => this.triggerAutoSave());
    nameInput.addEventListener('input', () => this.triggerAutoSave());
    
    nameInput.focus({ preventScroll: true });
  },

  // Initialize code editor (using CodeMirror)
  initMonacoEditor(container, code) {
    container.innerHTML = '';
    
    // Create CodeMirror editor
    this.editor = CodeMirror(container, {
      value: code,
      mode: 'css',
      theme: this.getCodeMirrorTheme(),
      lineNumbers: true,
      lineWrapping: true,
      indentUnit: 2,
      indentWithTabs: false,
      tabSize: 2,
      styleActiveLine: true,
      matchBrackets: true,
      autoCloseBrackets: true,
      foldGutter: true,
      gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
      height: 'auto',
      viewportMargin: Infinity
    });
    
    // Attach auto-save listener to editor changes
    this.editor.on('change', () => this.triggerAutoSave());
  },
  
  // Get CodeMirror theme based on current theme
  getCodeMirrorTheme() {
    const htmlTheme = document.documentElement.getAttribute('data-theme') || 
                      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    return htmlTheme === 'dark' ? 'material-darker' : 'default';
  },

  // Close the editor
  closeEditor() {
    const container = document.getElementById('css-editor-container');
    if (container) {
      container.style.display = 'none';
    }
    this.currentPresetId = null;
    this.isEditingNewPreset = false;
  },

  // Trigger auto-save instantly
  triggerAutoSave() {
    this.autoSave();
  },

  // Auto-save the preset without closing editor
  async autoSave() {
    const nameInput = document.getElementById('css-preset-name');
    const presetName = nameInput?.value.trim();

    if (!presetName) {
      return;
    }

    // Check for duplicate names (excluding current preset if editing)
    const isDuplicate = this.allPresets.some(p => 
      p.name === presetName && 
      (this.isEditingNewPreset || p.id !== this.currentPresetId)
    );

    if (isDuplicate) {
      return;
    }

    try {
      const code = this.editor.getValue();
      const method = this.isEditingNewPreset ? 'POST' : 'PUT';
      const url = this.isEditingNewPreset ? 'http://localhost:3001/api/css-presets' : `http://localhost:3001/api/css-presets/${this.currentPresetId}`;

      const response = await fetch(url, {
        method: method,
        headers: this.jsonHeaders,
        body: JSON.stringify({ name: presetName, code })
      });

      if (response.ok) {
        if (this.isEditingNewPreset) {
          // Create new preset object
          const newPreset = {
            id: response.headers.get('X-Preset-Id') || this.generateId(),
            name: presetName,
            code: code,
            is_active: false,
            created_at: Date.now(),
            updated_at: Date.now()
          };
          this.allPresets.push(newPreset);
          this.currentPresetId = newPreset.id;
          this.isEditingNewPreset = false;
          
          // Add new item to DOM without full re-render
          const container = document.getElementById('css-presets-list');
          if (container) {
            if (this.allPresets.length === 1) container.innerHTML = '';
            const newItem = document.createElement('div');
            newItem.innerHTML = this.getPresetItemHTML(newPreset);
            container.appendChild(newItem.firstElementChild);
          }
          
          showToast(`Preset "${presetName}" created`, 'success');
        } else {
          // Update existing preset
          const preset = this.allPresets.find(p => p.id === this.currentPresetId);
          if (preset) {
            preset.name = presetName;
            preset.code = code;
            preset.updated_at = Date.now();
            
            // Update the name in the DOM
            const nameElement = document.querySelector(`.css-preset-item-name[data-preset-id="${this.currentPresetId}"]`);
            if (nameElement) {
              nameElement.textContent = this.escapeHtml(presetName);
            }
          }
        }
        
        await this.applyActivePresets();
        await this.togglePresetActive(this.currentPresetId, true);
      }
    } catch (err) {
      console.error('Error auto-saving preset:', err);
    }
  },

  // Save the current preset
  async savePreset() {
    const nameInput = document.getElementById('css-preset-name');
    const presetName = nameInput.value.trim();

    if (!presetName) {
      showToast('Preset name is required', 'error');
      return;
    }

    // Get code from CodeMirror editor
    const code = this.editor.getValue();

    // Check for duplicate names (excluding current preset if editing)
    const isDuplicate = this.allPresets.some(p => 
      p.name === presetName && 
      (this.isEditingNewPreset || p.id !== this.currentPresetId)
    );

    if (isDuplicate) {
      showToast('A preset with this name already exists', 'error');
      return;
    }

    try {
      const method = this.isEditingNewPreset ? 'POST' : 'PUT';
      const url = this.isEditingNewPreset ? 'http://localhost:3001/api/css-presets' : `http://localhost:3001/api/css-presets/${this.currentPresetId}`;

      const response = await fetch(url, {
        method: method,
        headers: this.jsonHeaders,
        body: JSON.stringify({ name: presetName, code })
      });

      if (response.ok) {
        showToast(`Preset "${presetName}" saved successfully`, 'success');
        this.closeEditor();
        
        // Update or add preset to local array
        if (this.isEditingNewPreset) {
          // Create new preset object
          const newPreset = {
            id: response.headers.get('X-Preset-Id') || this.generateId(),
            name: presetName,
            code: code,
            is_active: false,
            created_at: Date.now(),
            updated_at: Date.now()
          };
          this.allPresets.push(newPreset);
          
          // Add new item to DOM without full re-render
          const container = document.getElementById('css-presets-list');
          if (container) {
            if (this.allPresets.length === 1) container.innerHTML = '';
            const newItem = document.createElement('div');
            newItem.innerHTML = this.getPresetItemHTML(newPreset);
            container.appendChild(newItem.firstElementChild);
          }
        } else {
          // Update existing preset
          const preset = this.allPresets.find(p => p.id === this.currentPresetId);
          if (preset) {
            preset.name = presetName;
            preset.code = code;
            preset.updated_at = Date.now();
            
            // Update the name in the DOM
            const nameElement = document.querySelector(`.css-preset-item-name[data-preset-id="${this.currentPresetId}"]`);
            if (nameElement) {
              nameElement.textContent = this.escapeHtml(presetName);
            }
          }
        }
        
        this.applyActivePresets();
        
        // Reload all presets from database
        await this.loadPresets();
      } else {
        showToast('Failed to save preset', 'error');
      }
    } catch (err) {
      console.error('Error saving preset:', err);
      showToast('Error saving preset: ' + err.message, 'error');
    }
  },

  // Delete a preset
  async deletePreset(presetId) {
    const preset = this.allPresets.find(p => p.id === presetId);
    if (!preset) return;

    try {
      const response = await fetch(`http://localhost:3001/api/css-presets/${presetId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        // Remove from local array
        this.allPresets = this.allPresets.filter(p => p.id !== presetId);
        
        // Close editor if the deleted preset is currently open
        if (presetId === this.currentPresetId) {
          document.getElementById('css-editor-container').style.display = 'none';
          this.currentPresetId = null;
          this.isEditingNewPreset = false;
          this.autoSaveTimeout = null;
        }
        
        // Remove from DOM - use specific selector for the container
        const element = document.querySelector(`.css-preset-item[data-preset-id="${presetId}"]`);
        if (element) {
          element.remove();
        }
        
        // If list is now empty, show empty message
        const container = document.getElementById('css-presets-list');
        if (container && this.allPresets.length === 0) {
          container.innerHTML = this.emptyStateHTML;
        }
        
        showToast(`Preset "${preset.name}" deleted`, 'success');
        this.applyActivePresets();
      } else {
        showToast('Failed to delete preset', 'error');
      }
    } catch (err) {
      console.error('Error deleting preset:', err);
      showToast('Error deleting preset: ' + err.message, 'error');
    }
  },

  // Toggle preset active status
  async togglePresetActive(presetId, isActive) {
    try {
      const response = await fetch(`http://localhost:3001/api/css-presets/${presetId}/active`, {
        method: 'PUT',
        headers: this.jsonHeaders,
        body: JSON.stringify({ is_active: isActive })
      });

      if (response.ok) {
        // Update local array
        const preset = this.allPresets.find(p => p.id === presetId);
        if (preset) {
          preset.is_active = isActive;
          preset.updated_at = Date.now();
        }
        
        // Update DOM checkbox
        const checkbox = document.querySelector(`[data-preset-id="${presetId}"].css-preset-active-checkbox`);
        if (checkbox) {
          checkbox.checked = isActive;
        }
        
        // Update or remove active badge
        const item = document.querySelector(`[data-preset-id="${presetId}"]`);
        if (item) {
          const badge = item.querySelector('.css-preset-item-active-badge');
          if (isActive && !badge) {
            // Add badge
            const info = item.querySelector('.css-preset-item-info');
            const newBadge = document.createElement('span');
            newBadge.className = 'css-preset-item-active-badge';
            newBadge.textContent = 'Active';
            info.appendChild(newBadge);
          } else if (!isActive && badge) {
            // Remove badge
            badge.remove();
          }
        }
        
        this.applyActivePresets();
      }
    } catch (err) {
      console.error('Error toggling preset:', err);
      showToast('Error toggling preset: ' + err.message, 'error');
    }
  },

  // Apply active presets to the page
  async applyActivePresets() {
    try {
      const response = await fetch('http://localhost:3001/api/css-presets/active');
      if (response.ok) {
        const activePresets = await response.json();
        
        // Remove existing custom CSS
        let styleElement = document.getElementById('css-presets-style');
        if (styleElement) {
          styleElement.remove();
        }

        // Add new CSS from active presets
        if (activePresets.length > 0) {
          const combinedCSS = activePresets.map(p => p.code).join('\n\n');
          styleElement = document.createElement('style');
          styleElement.id = 'css-presets-style';
          styleElement.textContent = combinedCSS;
          document.head.appendChild(styleElement);
        }
      }
    } catch (err) {
      console.error('Failed to apply active presets:', err);
    }
  },

  // Utility: Escape HTML to prevent XSS
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

// Initialize when DOM is ready
document.readyState === 'loading' 
  ? document.addEventListener('DOMContentLoaded', () => cssPresetsManager.init())
  : cssPresetsManager.init();
