(function () {
    /**
     * STEALTH MODE
     * Generates a random ID to prevent detection by anti-dark-mode scripts.
     */
    const randomId = Math.random().toString(36).substring(2, 10);
    const STYLE_ID = `style-${randomId}`;
    const RESTORE_CLASS = `restore-${randomId}`;

    // State
    let observer = null;
    let isGlobalEnabled = false;
    let warmthValue = 0;
    let disabledDomains = [];
    let automationMode = 'manual'; // Default

    // Batch Processing State
    let dirtyElements = new Set();
    let batchTimeout = null;
    const BATCH_DELAY = 200; // ms

    /**
     * Generates the dynamic CSS based on warmth settings.
     * @param {number} warmth - Warmth value from 0 to 100.
     * @returns {string} - The generated CSS string.
     */
    function getCssRules(warmth) {
        const sepiaAmount = warmth / 100;
        const filter = `invert(1) hue-rotate(180deg) contrast(0.8) sepia(${sepiaAmount})`;

        return `
      html {
        background-color: #1a1a1a !important;
        filter: ${filter} !important;
      }
      
      /* Restoration Rule: Invert back images/media/etc */
      img, video, iframe, .${RESTORE_CLASS} {
        filter: invert(1) hue-rotate(180deg) !important;
      }
    `;
    }

    /**
     * Injects the dynamic style sheet into the document.
     * Updates content if it already exists.
     */
    function injectStyles() {
        const css = getCssRules(warmthValue);
        let style = document.getElementById(STYLE_ID);

        if (!style) {
            style = document.createElement('style');
            style.id = STYLE_ID;
            (document.head || document.documentElement).appendChild(style);
        }
        style.textContent = css;
    }

    /**
     * Removes the extension's style sheet from the document.
     */
    function removeStyles() {
        const style = document.getElementById(STYLE_ID);
        if (style) style.remove();
    }

    /**
     * RestorationEngine
     * Handles the logic for identifying elements that need to be
     * "restored" (inverted back) to look normal, such as background images.
     */
    const RestorationEngine = {
        /**
         * Checks an element and applies the restoration class if needed.
         * @param {Node} element - The DOM node to check.
         */
        analyze: function (element) {
            if (element.nodeType !== Node.ELEMENT_NODE) return;
            if (element.classList.contains(RESTORE_CLASS)) return;

            if (!element.isConnected) return;

            const tagName = element.tagName.toLowerCase();

            // Native tags are handled by CSS selectors directly
            if (['img', 'video', 'iframe'].includes(tagName)) {
                return;
            }

            // Check for background images
            const computedStyle = window.getComputedStyle(element);
            if (
                computedStyle.backgroundImage !== 'none' &&
                computedStyle.backgroundImage !== ''
            ) {
                element.classList.add(RESTORE_CLASS);
            }
        },

        /**
         * Scans a root node and all its descendants.
         * @param {Node} root - The root node to start scanning from.
         */
        scanTree: function (root) {
            this.analyze(root);
            const descendants = root.querySelectorAll('*');
            descendants.forEach((node) => this.analyze(node));
        },

        /**
         * Cleans up restoration classes from the DOM.
         */
        cleanup: function () {
            const restored = document.querySelectorAll(`.${RESTORE_CLASS}`);
            restored.forEach((el) => el.classList.remove(RESTORE_CLASS));
        },
    };

    /**
     * Processes the batch of dirty elements.
     * Runs via setTimeout(..., 200).
     */
    function processBatch() {
        if (!dirtyElements.size) return;

        dirtyElements.forEach((node) => {
            if (node.isConnected) {
                RestorationEngine.scanTree(node);
            }
        });

        dirtyElements.clear();
        batchTimeout = null;
    }

    /**
     * Schedules an element for batch processing.
     * @param {Node} node - The node that changed.
     */
    function scheduleBatch(node) {
        dirtyElements.add(node);
        if (!batchTimeout) {
            batchTimeout = setTimeout(processBatch, BATCH_DELAY);
        }
    }

    /**
     * Checks if the extension should be active on the current page.
     * Handles Whitelist, System Mode, and Global Toggle.
     * @returns {boolean}
     */
    function shouldBeActive() {
        // 1. Check Whitelist
        if (disabledDomains.includes(window.location.hostname)) return false;

        // 2. Check Automation Mode
        if (automationMode === 'system') {
            return window.matchMedia('(prefers-color-scheme: dark)').matches;
        }

        // 3. Fallback to Global Toggle
        return isGlobalEnabled;
    }

    /**
     * Starts the MutationObserver to handle dynamic content.
     */
    function startObserver() {
        if (observer) return;

        observer = new MutationObserver((mutations) => {
            if (!shouldBeActive()) return;

            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length) {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            scheduleBatch(node);
                        }
                    });
                }
            });
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
        });
    }

    /**
     * Stops the MutationObserver and clears timers.
     */
    function stopObserver() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        if (batchTimeout) {
            clearTimeout(batchTimeout);
            batchTimeout = null;
        }
        dirtyElements.clear();
    }

    /**
     * Updates the global state of the extension logic.
     * Enables or disables features based on current settings.
     */
    function updateState() {
        if (shouldBeActive()) {
            injectStyles();
            // If we are late to the party (document already exists), scan it now.
            if (document.body) {
                RestorationEngine.scanTree(document.documentElement);
            }
            startObserver();
        } else {
            removeStyles();
            stopObserver();
            RestorationEngine.cleanup();
        }
    }

    // --- Listen for OS Theme Changes (System Mode) ---
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (automationMode === 'system') {
            updateState();
        }
    });


    // --- Initialization & Listeners ---

    chrome.storage.local.get(['isEnabled', 'warmth'], (localRes) => {
        isGlobalEnabled = localRes.isEnabled || false;
        warmthValue = localRes.warmth || 0;

        chrome.storage.sync.get(['disabledDomains', 'automationMode'], (syncRes) => {
            disabledDomains = syncRes.disabledDomains || [];
            automationMode = syncRes.automationMode || 'manual';
            updateState();
        });
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        let stateChanged = false;

        if (area === 'local') {
            if (changes.isEnabled) {
                isGlobalEnabled = changes.isEnabled.newValue;
                stateChanged = true;
            }
            if (changes.warmth) {
                warmthValue = changes.warmth.newValue || 0;
                stateChanged = true;
            }
        }

        if (area === 'sync') {
            if (changes.disabledDomains) {
                disabledDomains = changes.disabledDomains.newValue || [];
                stateChanged = true;
            }
            if (changes.automationMode) {
                automationMode = changes.automationMode.newValue || 'manual';
                stateChanged = true;
            }
        }

        if (stateChanged) updateState();
    });
})();
