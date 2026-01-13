document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const globalToggle = document.getElementById('dark-mode-toggle');
  const globalStatus = document.getElementById('status-text');

  const siteToggle = document.getElementById('site-toggle');
  const siteDomainText = document.getElementById('site-domain');

  const warmthSlider = document.getElementById('warmth-slider');
  const warmthValue = document.getElementById('warmth-value');

  const automationMode = document.getElementById('automation-mode');
  const scheduleInputs = document.getElementById('schedule-inputs');
  const startTimeInput = document.getElementById('start-time');
  const endTimeInput = document.getElementById('end-time');

  const exportBtn = document.getElementById('export-btn');
  const importBtnTrigger = document.getElementById('import-btn-trigger');
  const importFile = document.getElementById('import-file');

  const errorMsg = document.getElementById('error-msg');

  // State
  let currentHostname = '';

  /**
   * Safely sets text content of an element to prevent XSS.
   * @param {HTMLElement} element - The target element.
   * @param {string} text - The text to set.
   */
  function safeSetText(element, text) {
    if (element) element.textContent = text;
  }

  /**
   * Creates a debounced version of a function.
   * @param {Function} func - The function to debounce.
   * @param {number} wait - The delay in milliseconds.
   * @returns {Function} - The debounced function.
   */
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Checks if the current URL is a restricted system page.
   * @param {string} url - The URL to check.
   * @returns {boolean}
   */
  function isRestrictedUrl(url) {
    return /^(chrome|edge|about|data|view-source):/.test(url);
  }

  /**
   * Updates the UI visibility based on the selected automation mode.
   * @param {string} mode - 'manual', 'system', 'scheduled'
   */
  function updateAutomationUI(mode) {
    if (mode === 'scheduled') {
      scheduleInputs.style.display = 'flex';
    } else {
      scheduleInputs.style.display = 'none';
    }

    if (mode === 'system') {
      globalToggle.disabled = true;
      safeSetText(globalStatus, 'Managed by OS');
    } else {
      globalToggle.disabled = false;
    }
  }

  /**
   * Validates imported settings object.
   * Strict security check.
   * @param {Object} data - The JSON data.
   * @returns {boolean} - True if valid.
   */
  function validateSettings(data) {
    if (typeof data !== 'object' || data === null) return false;

    // Check Whitelist
    if (data.disabledDomains && !Array.isArray(data.disabledDomains)) return false;
    if (data.disabledDomains) {
      if (!data.disabledDomains.every(d => typeof d === 'string')) return false;
    }

    // Check Automation Mode
    if (data.automationMode) {
      const validModes = ['manual', 'system', 'scheduled'];
      if (!validModes.includes(data.automationMode)) return false;
    }

    // Check Times
    if (data.startTime && typeof data.startTime !== 'string') return false;
    if (data.endTime && typeof data.endTime !== 'string') return false;

    return true;
  }

  // --- Main Initialization ---

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) return;

    const currentTab = tabs[0];
    if (!currentTab) return;

    // 1. Restriction Check
    if (isRestrictedUrl(currentTab.url)) {
      globalToggle.disabled = true;
      siteToggle.disabled = true;
      warmthSlider.disabled = true;
      automationMode.disabled = true;
      importBtnTrigger.disabled = true; // Safety
      safeSetText(globalStatus, 'System Page');

      if (errorMsg) {
        errorMsg.style.display = 'block';
        safeSetText(errorMsg, 'Cannot run on this page.');
      }
      return;
    }

    // 2. Hostname Extraction
    try {
      const url = new URL(currentTab.url);
      currentHostname = url.hostname;
      safeSetText(siteDomainText, currentHostname);
    } catch (e) {
      currentHostname = '';
      siteToggle.disabled = true;
    }

    // 3. Load Storage State
    chrome.storage.local.get(['isEnabled', 'warmth'], (localResult) => {
      chrome.storage.sync.get(['disabledDomains', 'automationMode', 'startTime', 'endTime'], (syncResult) => {
        const isGlobalEnabled = localResult.isEnabled || false;
        const warmth = localResult.warmth || 0;
        const mode = syncResult.automationMode || 'manual';

        globalToggle.checked = isGlobalEnabled;
        if (mode !== 'system') {
          safeSetText(globalStatus, isGlobalEnabled ? 'Active' : 'Inactive');
        }

        warmthSlider.value = warmth;
        safeSetText(warmthValue, warmth + '%');

        const disabledDomains = syncResult.disabledDomains || [];
        const isSiteEnabled = !disabledDomains.includes(currentHostname);
        siteToggle.checked = isSiteEnabled;

        automationMode.value = mode;
        startTimeInput.value = syncResult.startTime || '18:00';
        endTimeInput.value = syncResult.endTime || '06:00';
        updateAutomationUI(mode);
      });
    });
  });

  // --- Event Listeners ---

  // Global Toggle
  globalToggle.addEventListener('change', () => {
    const isEnabled = globalToggle.checked;
    safeSetText(globalStatus, isEnabled ? 'Active' : 'Inactive');
    chrome.storage.local.set({ isEnabled: isEnabled });
  });

  // Site Toggle
  siteToggle.addEventListener('change', () => {
    if (!currentHostname) return;
    const isSiteEnabled = siteToggle.checked;

    chrome.storage.sync.get(['disabledDomains'], (result) => {
      let domains = result.disabledDomains || [];

      if (isSiteEnabled) {
        domains = domains.filter((d) => d !== currentHostname);
      } else {
        if (!domains.includes(currentHostname)) {
          domains.push(currentHostname);
        }
      }

      chrome.storage.sync.set({ disabledDomains: domains });
    });
  });

  // Warmth Slider
  const saveWarmth = debounce((value) => {
    chrome.storage.local.set({ warmth: parseInt(value, 10) });
  }, 300);

  warmthSlider.addEventListener('input', (e) => {
    const val = e.target.value;
    safeSetText(warmthValue, val + '%');
    saveWarmth(val);
  });

  // Automation Mode
  automationMode.addEventListener('change', () => {
    const mode = automationMode.value;
    updateAutomationUI(mode);
    chrome.storage.sync.set({ automationMode: mode });
  });

  // Time Inputs
  const saveTime = () => {
    chrome.storage.sync.set({
      startTime: startTimeInput.value,
      endTime: endTimeInput.value
    });
  };
  startTimeInput.addEventListener('change', saveTime);
  endTimeInput.addEventListener('change', saveTime);

  // --- Settings Management ---

  // Export
  exportBtn.addEventListener('click', () => {
    chrome.storage.sync.get(null, (items) => {
      const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'dark-mode-settings.json';
      a.click();
      URL.revokeObjectURL(url);
    });
  });

  // Import Trigger
  importBtnTrigger.addEventListener('click', () => {
    importFile.click();
  });

  // Import Handling
  importFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (validateSettings(data)) {
          chrome.storage.sync.set(data, () => {
            alert('Settings imported successfully!');
            // Reload current page to apply
            chrome.tabs.reload();
          });
        } else {
          alert('Invalid settings file.');
        }
      } catch (err) {
        alert('Error parsing file.');
      }
    };
    reader.readAsText(file);
  });

});
