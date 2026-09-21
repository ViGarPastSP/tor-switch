/**
 * Tor Switch - Background script / service worker
 * Manages proxy configuration for a local Tor SOCKS5 endpoint.
 * Supports both Chrome (chrome.proxy) and Firefox (browser.proxy).
 * Does NOT run Tor itself. Does NOT claim connectivity guarantees.
 */

'use strict';

// Cross-browser API alias
const api = typeof browser !== 'undefined' ? browser : chrome;
const isFirefox = typeof browser !== 'undefined';

// Chrome-style configuration
const CHROME_TOR_PROXY = {
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

// Firefox-style configuration (completely different schema)
const FIREFOX_TOR_PROXY = {
  proxyType: 'manual',
  socks: '127.0.0.1',
  socksVersion: 5,
  proxyDNS: true,
  passthrough: 'localhost, 127.0.0.1'
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
    const data = await api.storage.local.get([
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
  await api.storage.local.set(payload);
}

/**
 * Read the current browser proxy settings.
 * Returns the raw value object (browser-specific format) or null.
 */
async function getCurrentProxyConfig() {
  try {
    if (isFirefox) {
      // Firefox returns a BrowserSetting result
      const details = await api.proxy.settings.get({});
      return details ? details.value : null;
    }

    // Chrome callback style
    return new Promise((resolve) => {
      api.proxy.settings.get({ incognito: false }, (config) => {
        if (api.runtime.lastError) {
          console.error('[Tor Switch] proxy.settings.get error:', api.runtime.lastError);
          resolve(null);
          return;
        }
        resolve(config && config.value ? config.value : null);
      });
    });
  } catch (err) {
    console.error('[Tor Switch] Exception reading proxy settings:', err);
    return null;
  }
}

/**
 * Apply a proxy configuration (value object already in the correct browser format).
 */
async function applyProxyConfig(config) {
  try {
    if (isFirefox) {
      await api.proxy.settings.set({ value: config });
      return { success: true };
    }

    // Chrome
    return new Promise((resolve) => {
      api.proxy.settings.set(
        { value: config, scope: 'regular' },
        () => {
          if (api.runtime.lastError) {
            console.error('[Tor Switch] proxy.settings.set error:', api.runtime.lastError);
            resolve({
              success: false,
              error: 'Unable to apply proxy settings.'
            });
            return;
          }
          resolve({ success: true });
        }
      );
    });
  } catch (err) {
    console.error('[Tor Switch] Exception applying proxy:', err);
    return {
      success: false,
      error: 'Unable to apply proxy settings. ' + (err.message || '')
    };
  }
}

/**
 * Return the correct “system / direct” fallback for the current browser.
 */
function getSystemFallback() {
  if (isFirefox) {
    return { proxyType: 'system' };
  }
  return { mode: 'system' };
}

/**
 * Enable Tor proxy: save current config, apply SOCKS5.
 */
async function enableTor() {
  const state = await getStoredState();

  if (state.enabled) {
    return {
      success: true,
      state: { enabled: true },
      message: 'Tor proxy is already enabled.'
    };
  }

  // Capture current proxy configuration before overwriting
  const previousToStore = await getCurrentProxyConfig();

  // Choose the correct format for this browser
  const torConfig = isFirefox ? FIREFOX_TOR_PROXY : CHROME_TOR_PROXY;

  const result = await applyProxyConfig(torConfig);
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

  if (!state.enabled) {
    return {
      success: true,
      state: { enabled: false },
      message: 'Tor proxy is already disabled.'
    };
  }

  let restoreResult;

  if (state.previousProxy && typeof state.previousProxy === 'object') {
    restoreResult = await applyProxyConfig(state.previousProxy);
    if (!restoreResult.success) {
      console.warn('[Tor Switch] Failed to restore previous proxy; falling back to system.');
      restoreResult = await applyProxyConfig(getSystemFallback());
    }
  } else {
    restoreResult = await applyProxyConfig(getSystemFallback());
  }

  // Always mark as disabled so UI stays consistent
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
 * Message handler
 */
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

  return true; // keep channel open for async response
});

/**
 * On install / update: never auto-enable Tor.
 */
api.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await saveState(false, null);
    console.log('[Tor Switch] Installed. Tor proxy remains OFF until the user enables it.');
  } else if (details.reason === 'update') {
    console.log('[Tor Switch] Updated. Existing state preserved.');
  }
});

console.log('[Tor Switch] Background started. Browser:', isFirefox ? 'Firefox' : 'Chromium');
