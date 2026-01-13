/**
 * Background Service Worker
 * - Listens for keyboard shortcuts.
 * - Manages Scheduled Automation (Alarms).
 * - Manages Context Menu interactions.
 * - Handles Onboarding (Welcome Page).
 */

// --- 1. Command Listener ---
chrome.commands.onCommand.addListener((command) => {
    if (command === 'toggle-dark-mode') {
        chrome.storage.local.get(['isEnabled'], (result) => {
            const newState = !result.isEnabled;
            chrome.storage.local.set({ isEnabled: newState });
        });
    }
});

// --- 2. Scheduled Automation ---
function checkSchedule() {
    chrome.storage.sync.get(['automationMode', 'startTime', 'endTime'], (data) => {
        if (data.automationMode !== 'scheduled') return;

        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        const [startH, startM] = (data.startTime || '18:00').split(':').map(Number);
        const [endH, endM] = (data.endTime || '06:00').split(':').map(Number);

        const startTotal = startH * 60 + startM;
        const endTotal = endH * 60 + endM;

        let shouldBeActive = false;

        if (startTotal < endTotal) {
            shouldBeActive = currentMinutes >= startTotal && currentMinutes < endTotal;
        } else {
            shouldBeActive = currentMinutes >= startTotal || currentMinutes < endTotal;
        }

        chrome.storage.local.get(['isEnabled'], (localData) => {
            if (localData.isEnabled !== shouldBeActive) {
                chrome.storage.local.set({ isEnabled: shouldBeActive });
            }
        });
    });
}

chrome.alarms.create('checkSchedule', { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'checkSchedule') {
        checkSchedule();
    }
});

// --- 3. Context Menu Integration ---

/**
 * Creates the context menu items on installation.
 */
function createContextMenus() {
    chrome.contextMenus.removeAll(() => {
        // Parent
        chrome.contextMenus.create({
            id: 'vibe-parent',
            title: 'Vibe Dark Mode',
            contexts: ['all'],
        });

        // Children
        chrome.contextMenus.create({
            id: 'vibe-toggle',
            parentId: 'vibe-parent',
            title: 'Toggle for this page',
            contexts: ['all'],
        });

        chrome.contextMenus.create({
            id: 'vibe-exclude',
            parentId: 'vibe-parent',
            title: 'Exclude this domain (Forever)',
            contexts: ['all'],
        });
    });
}

/**
 * Handles context menu clicks.
 * @param {Object} info - Information about the item clicked.
 * @param {Object} tab - The details of the tab where the click occurred.
 */
function handleMenuClick(info, tab) {
    if (!tab || !tab.url) return;

    let hostname = '';
    try {
        const url = new URL(tab.url);
        hostname = url.hostname;
    } catch (e) {
        return;
    }

    if (info.menuItemId === 'vibe-toggle') {
        chrome.storage.sync.get(['disabledDomains'], (result) => {
            let domains = result.disabledDomains || [];
            if (domains.includes(hostname)) {
                domains = domains.filter((d) => d !== hostname);
            } else {
                domains.push(hostname);
            }
            chrome.storage.sync.set({ disabledDomains: domains });
        });
    } else if (info.menuItemId === 'vibe-exclude') {
        chrome.storage.sync.get(['disabledDomains'], (result) => {
            const domains = result.disabledDomains || [];
            if (!domains.includes(hostname)) {
                domains.push(hostname);
                chrome.storage.sync.set({ disabledDomains: domains });
            }
        });
    }
}

chrome.contextMenus.onClicked.addListener(handleMenuClick);

// --- 4. Initialization & Onboarding ---

/**
 * Runs on installation or update.
 * @param {Object} details - Details about the event (reason: 'install', 'update').
 */
chrome.runtime.onInstalled.addListener((details) => {
    // Always set up these
    checkSchedule();
    createContextMenus();

    // Onboarding
    if (details.reason === 'install') {
        chrome.tabs.create({ url: 'welcome.html' });
    }
});

chrome.runtime.onStartup.addListener(checkSchedule);
