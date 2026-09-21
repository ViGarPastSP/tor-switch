/**
 * Tor Switch – Popup script
 * Communicates with the background service worker.
 * Never assumes Tor connectivity; only reflects proxy configuration state.
 */

'use strict';

const elements = {
  statusIndicator: document.getElementById('status-indicator'),
  statusText: document.getElementById('status-text'),
  statusDetail: document.getElementById('status-detail'),
  proxyInfo: document.getElementById('proxy-info'),
  proxyValue: document.getElementById('proxy-value'),
  messageArea: document.getElementById('message-area'),
  toggleBtn: document.getElementById('toggle-btn')
};

/** Prevent concurrent operations */
let isBusy = false;

/**
 * Send a message to the background service worker and return the response.
 */
function sendMessage(action) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ action }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[Tor Switch] Message error:', chrome.runtime.lastError);
          resolve({
            success: false,
            error: 'Could not communicate with the extension background.'
          });
          return;
        }
        resolve(response || { success: false, error: 'Empty response from background.' });
      });
    } catch (err) {
      console.error('[Tor Switch] sendMessage exception:', err);
      resolve({
        success: false,
        error: 'Could not communicate with the extension background.'
      });
    }
  });
}

/**
 * Update the UI to reflect the given state.
 * @param {{ enabled: boolean }} state
 * @param {string} [message]
 * @param {'info'|'error'|'warning'} [messageType]
 */
function renderState(state, message, messageType) {
  const enabled = Boolean(state && state.enabled);

  // Status indicator and text (do not rely on color alone)
  if (enabled) {
    elements.statusIndicator.textContent = '●';
    elements.statusIndicator.className = 'indicator on';
    elements.statusText.textContent = 'Tor is ON';
    elements.statusDetail.textContent = 'Browser proxy is set to the local SOCKS5 endpoint.';
    elements.proxyInfo.classList.remove('hidden');
    elements.proxyInfo.setAttribute('aria-hidden', 'false');
    elements.proxyValue.textContent = 'SOCKS5 127.0.0.1:9050';
    elements.toggleBtn.textContent = 'Disable Tor';
    elements.toggleBtn.className = 'btn danger';
  } else {
    elements.statusIndicator.textContent = '○';
    elements.statusIndicator.className = 'indicator off';
    elements.statusText.textContent = 'Tor is OFF';
    elements.statusDetail.textContent = 'Your browser is using its normal connection.';
    elements.proxyInfo.classList.add('hidden');
    elements.proxyInfo.setAttribute('aria-hidden', 'true');
    elements.toggleBtn.textContent = 'Enable Tor';
    elements.toggleBtn.className = 'btn primary';
  }

  elements.toggleBtn.disabled = isBusy;

  // Optional message
  if (message) {
    showMessage(message, messageType || 'info');
  } else {
    clearMessage();
  }
}

function showMessage(text, type) {
  elements.messageArea.innerHTML = '';
  const el = document.createElement('div');
  el.className = `message ${type || 'info'}`;
  el.textContent = text;
  elements.messageArea.appendChild(el);
}

function clearMessage() {
  elements.messageArea.innerHTML = '';
}

function setBusy(busy) {
  isBusy = busy;
  elements.toggleBtn.disabled = busy;
  if (busy) {
    elements.toggleBtn.textContent = 'Applying settings…';
  }
}

/**
 * Load current state from the background and render it.
 */
async function loadState() {
  setBusy(true);
  clearMessage();
  elements.toggleBtn.textContent = 'Loading…';

  const response = await sendMessage('getState');

  setBusy(false);

  if (!response.success) {
    renderState({ enabled: false });
    showMessage(response.error || 'Unable to read current state.', 'error');
    return;
  }

  renderState(response.state);
}

/**
 * Toggle Tor proxy on or off.
 */
async function handleToggle() {
  if (isBusy) return;

  setBusy(true);
  clearMessage();

  // Determine current state from the button label (authoritative source is background)
  const currentlyOn = elements.statusText.textContent.includes('ON');
  const action = currentlyOn ? 'disableTor' : 'enableTor';

  const response = await sendMessage(action);

  setBusy(false);

  if (!response.success) {
    // Re-sync state after failure
    await loadState();
    showMessage(response.error || 'Operation failed.', 'error');
    return;
  }

  renderState(
    response.state,
    response.message || null,
    currentlyOn ? 'info' : 'warning'
  );
}

// Event listeners
elements.toggleBtn.addEventListener('click', handleToggle);

// Keyboard accessibility: Enter / Space already handled by button,
// but ensure focus is usable.
document.addEventListener('DOMContentLoaded', () => {
  loadState();
});

// Also run immediately in case DOMContentLoaded already fired
if (document.readyState !== 'loading') {
  loadState();
}
