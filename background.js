/**
 * Tor Switch - Background Service Worker
 * Manages proxy configuration for a local Tor SOCKS5 endpoint.
 * Does NOT run Tor itself. Does NOT claim connectivity guarantees.
 */

'use strict';

const DEFAULT_TOR_PROXY = {
  mode: 'fixed_servers',
  rules: {
    singleProxy: {
      scheme: 'socks5',
      host: '127.0.0.1',
      port: 9050
    },
    bypassList: ['localhost', '127.0.0.1']
  }
};

const STORAGE_KEYS = {
  TOR_ENABLED: 'torEnabled',
  PREVIOUS_PROXY: 'previousProxy'
};

/**
 * Get the current extension state from storage.
 */
async function getStoredState() {
  try {
    const data = await chrome.storage.local.get([
      STORAGE_KEYS.TOR_ENABLED,
      STORAGE_KEYS.PREVIOUS_PROXY
    ]);
    return {
      enabled: Boolean(data[STORAGE_KEYS.TOR_ENABLED]),
      previousProxy: data[STORAGE_KEYS.PREVIOUS_PROXY] || null
    };
  } catch (err) {
    console.error('[Tor Switch] Failed to read storage:', err);
    return { enabled: false, previousProxy: null };
  }
}

/**
 * Persist enabled state and optional previous proxy.
 */
async function saveState(enabled, previousProxy) {
  const payload = {
    [STORAGE_KEYS.TOR_ENABLED]: Boolean(enabled)
  };
  if (previousProxy !== undefined) {
    payload[STORAGE_KEYS.PREVIOUS_PROXY] = previousProxy;
  }
  await chrome.storage.local.set(payload);
}

/**
 * Read the current browser proxy settings (regular profile).
 * Returns a serializable object or null on failure.
 */
async function getCurrentProxyConfig() {
  return new Promise((resolve) => {
    try {
      chrome.proxy.settings.get({ incognito: false }, (config) => {
        if (chrome.runtime.lastError) {
          console.error('[Tor Switch] proxy.settings.get error:', chrome.runtime.lastError);
          resolve(null);
          return;
        }
        // Store a clean copy that can be restored later
        resolve(config ? { value: config.value, levelOfControl: config.levelOfControl } : null);
      });
    } catch (err) {
      console.error('[Tor Switch] Exception reading proxy settings:', err);
      resolve(null);
    }
  });
}

/**
 * Apply a proxy configuration object.
 * @param {object} config - Chrome proxy settings value object
 * @returns {Promise<{success: boolean, error?: string}>}
 */
function applyProxyConfig(config) {
  return new Promise((resolve) => {
    try {
      chrome.proxy.settings.set(
        { value: config, scope: 'regular' },
        () => {
          if (chrome.runtime.lastError) {
            console.error('[Tor Switch] proxy.settings.set error:', chrome.runtime.lastError);
            resolve({
              success: false,
              error: 'Unable to apply proxy settings.'
            });
            return;
          }
          resolve({ success: true });
        }
      );
    } catch (err) {
      console.error('[Tor Switch] Exception applying proxy:', err);
      resolve({
        success: false,
        error: 'Unable to apply proxy settings.'
      });
    }
  });
}

/**
 * Clear control of proxy settings (fallback when no previous config).
 */
function clearProxyControl() {
  return new Promise((resolve) => {
    try {
      chrome.proxy.settings.clear({ scope: 'regular' }, () => {
        if (chrome.runtime.lastError) {
          console.error('[Tor Switch] proxy.settings.clear error:', chrome.runtime.lastError);
          // Fall back to system mode
          applyProxyConfig({ mode: 'system' }).then(resolve);
          return;
        }
        resolve({ success: true });
      });
    } catch (err) {
      console.error('[Tor Switch] Exception clearing proxy:', err);
      resolve({ success: false, error: 'Unable to restore previous proxy settings.' });
    }
  });
}

/**
 * Enable Tor proxy: save current config, apply SOCKS5.
 */
async function enableTor() {
  const state = await getStoredState();

  // Already enabled — idempotent success
  if (state.enabled) {
    return {
      success: true,
      state: { enabled: true },
      message: 'Tor proxy is already enabled.'
    };
  }

  // Capture current proxy configuration before overwriting
  const current = await getCurrentProxyConfig();
  let previousToStore = null;

  if (current && current.value) {
    // Only store if we actually control or can restore something meaningful
    previousToStore = current.value;
  }

  // Apply Tor SOCKS5 configuration
  const result = await applyProxyConfig(DEFAULT_TOR_PROXY);
  if (!result.success) {
    return {
      success: false,
      error: result.error || 'Unable to enable the Tor proxy.',
      state: { enabled: false }
    };
  }

  await saveState(true, previousToStore);

  return {
    success: true,
    state: { enabled: true },
    message: 'Tor proxy enabled. Ensure a local SOCKS5 service is running on 127.0.0.1:9050.'
  };
}

/**
 * Disable Tor proxy: restore previous configuration.
 */
async function disableTor() {
  const state = await getStoredState();

  // Already disabled — idempotent
  if (!state.enabled) {
    return {
      success: true,
      state: { enabled: false },
      message: 'Tor proxy is already disabled.'
    };
  }

  let restoreResult;

  if (state.previousProxy && typeof state.previousProxy === 'object') {
    // Attempt to restore the exact previous configuration
    restoreResult = await applyProxyConfig(state.previousProxy);
    if (!restoreResult.success) {
      console.warn('[Tor Switch] Failed to restore previous proxy; falling back to system.');
      restoreResult = await applyProxyConfig({ mode: 'system' });
    }
  } else {
    // No saved config — safely fall back to system
    restoreResult = await applyProxyConfig({ mode: 'system' });
  }

  // Always mark as disabled even if restore had issues,
  // so the UI and future toggles stay consistent.
  await saveState(false, null);

  if (!restoreResult.success) {
    return {
      success: false,
      error: 'Unable to restore your previous proxy settings. Browser may be using system proxy.',
      state: { enabled: false }
    };
  }

  return {
    success: true,
    state: { enabled: false },
    message: 'Tor proxy disabled. Previous proxy settings restored.'
  };
}

/**
 * Return current known state (from storage).
 * Does not probe the network or claim Tor connectivity.
 */
async function getState() {
  const state = await getStoredState();
  return {
    success: true,
    state: {
      enabled: state.enabled,
      proxy: state.enabled
        ? { scheme: 'socks5', host: '127.0.0.1', port: 9050 }
        : null
    }
  };
}

/**
 * Message handler for popup and other extension pages.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.action !== 'string') {
    sendResponse({ success: false, error: 'Invalid message.' });
    return false;
  }

  const handle = async () => {
    switch (message.action) {
      case 'getState':
        return await getState();
      case 'enableTor':
        return await enableTor();
      case 'disableTor':
        return await disableTor();
      default:
        return { success: false, error: 'Unknown action.' };
    }
  };

  handle()
    .then(sendResponse)
    .catch((err) => {
      console.error('[Tor Switch] Unhandled error in message handler:', err);
      sendResponse({
        success: false,
        error: 'An unexpected error occurred.'
      });
    });

  // Keep the message channel open for async response
  return true;
});

/**
 * On install / update: never auto-enable Tor.
 * Ensure clean initial state on first install.
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Explicitly start disabled; do not touch proxy settings
    await saveState(false, null);
    console.log('[Tor Switch] Installed. Tor proxy remains OFF until the user enables it.');
  } else if (details.reason === 'update') {
    // Preserve existing state; do not force enable or overwrite proxy
    console.log('[Tor Switch] Updated. Existing state preserved.');
  }
});

/**
 * Note on extension removal:
 * Chrome does not provide a reliable synchronous uninstall hook that can
 * always restore proxy settings. If the extension is removed while Tor is
 * enabled, the proxy configuration may remain until the user changes it
 * manually or reinstalls. Document this limitation for users.
 */
console.log('[Tor Switch] Service worker started.');
