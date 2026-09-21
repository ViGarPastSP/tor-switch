# Tor Switch

A lightweight browser extension that lets you enable or disable a local SOCKS5 proxy used by a locally running Tor client with a single click.

**Important:** This extension does **not** contain Tor, does **not** operate a Tor relay, and does **not** provide its own proxy server. It only configures the browser’s proxy settings to point at a local SOCKS5 endpoint (default `127.0.0.1:9050`).

You are responsible for running a compatible Tor SOCKS5 service on your machine.

## Features

- One-click Enable / Disable Tor proxy
- Uses the standard local Tor SOCKS5 endpoint (`127.0.0.1:9050`)
- Saves and restores your previous browser proxy configuration
- Privacy-first: no telemetry, no analytics, no external servers, no tracking
- Manifest V3
- Works as an unpacked extension (no build step)
- Minimal, accessible UI

## Requirements

- Google Chrome, Chromium, Brave, Edge, or another Chromium-based browser that supports Manifest V3
- Firefox support is prepared via `browser_specific_settings` (tested on recent Firefox versions that support the proxy API)
- A local SOCKS5 service listening on **127.0.0.1:9050** (the default port used by the official Tor client)

### Installing Tor (examples)

- **Tor Browser** includes a SOCKS5 proxy; you can also run the standalone Tor daemon.
- On many Linux distributions: `sudo apt install tor` (or equivalent). By default it listens on `127.0.0.1:9050`.
- On macOS: `brew install tor` then start the service.
- On Windows: download the Tor Expert Bundle or use Tor Browser.

Make sure something is actually listening on port 9050 before you enable the proxy in the extension. If nothing is listening, most websites will fail to load while the proxy is enabled.

## Installation (unpacked)

1. Download or clone this repository.
2. Open `chrome://extensions` (or `brave://extensions`, `edge://extensions`, etc.).
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `tor-switch` folder (the one that contains `manifest.json`).
6. The extension icon should appear in the toolbar.

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select the `manifest.json` file inside the `tor-switch` folder.
4. Note: temporary add-ons are removed when Firefox restarts. For permanent installation you would need to sign the extension or use a development profile.

## Usage

1. Start your local Tor SOCKS5 service (so that it listens on `127.0.0.1:9050`).
2. Click the Tor Switch icon in the browser toolbar.
3. Click **Enable Tor**.
4. Browse as usual. Traffic is now sent through the configured SOCKS5 proxy.
5. When finished, open the popup again and click **Disable Tor**. Your previous proxy settings will be restored.

The extension never enables the Tor proxy automatically on install or update. You must press the button yourself.

## What the status means

| UI text              | Meaning                                              |
|----------------------|------------------------------------------------------|
| Tor is OFF           | Browser is using its normal (previous) connection    |
| Tor is ON            | Browser proxy is set to SOCKS5 127.0.0.1:9050        |

**Tor is ON** only means the proxy configuration was applied. It does **not** guarantee that:

- a SOCKS5 service is actually running,
- the service is Tor,
- or that your traffic is anonymous.

If the local SOCKS5 service is unavailable, pages will typically fail to load while the proxy remains enabled.

## Permissions

The extension requests only:

- `proxy` – to read and set browser proxy settings
- `storage` – to remember whether Tor is enabled and to store the previous proxy configuration

It does **not** request tabs, history, cookies, webRequest, scripting, or host permissions.

## Privacy

- No browsing history is stored or transmitted.
- No page contents are inspected.
- No IP addresses or personal data are collected.
- No telemetry or analytics.
- No communication with any remote server.
- All logic runs locally inside the browser.

## Important limitations

- The extension does **not** contain Tor.
- The extension does **not** provide anonymity by itself.
- Traffic may fail if the configured SOCKS5 service is unavailable.
- The extension only configures the browser proxy.
- Incognito / private windows: the MVP operates on the regular browser profile. Incognito proxy settings are not modified.
- If you remove the extension while Tor is enabled, the browser may keep the SOCKS5 proxy configuration until you change it manually. Chrome does not always allow reliable cleanup on uninstall.

## Restoring previous proxy settings

Before enabling Tor, the extension reads your current proxy configuration and stores it. When you disable Tor, it restores that configuration. If no previous configuration is available, it falls back to `{ mode: "system" }`.

Supported previous configurations include system proxy, PAC scripts, fixed servers, and other SOCKS proxies, provided the browser returns them via the proxy API.

## Development

There is no build system. Edit the source files and reload the extension:

1. Make your changes.
2. Go to the extensions page.
3. Click the reload icon for Tor Switch.
4. Re-open the popup to test.

### Project structure

```
tor-switch/
├── manifest.json
├── background.js          # Service worker – proxy logic
├── README.md
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── options/
│   ├── options.html       # Future-ready options page
│   ├── options.css
│   └── options.js
└── icons/
    ├── icon16.svg
    ├── icon32.svg
    ├── icon48.svg
    └── icon128.svg
```

## Troubleshooting

| Problem | Possible cause / solution |
|---------|---------------------------|
| Websites do not load after enabling | Nothing is listening on 127.0.0.1:9050. Start Tor or change the port. |
| “Unable to enable the Tor proxy” | Permission or API error. Check the service worker console. |
| Previous proxy not restored | Storage may have been cleared, or the original config was unavailable. The extension falls back to system mode. |
| Popup shows wrong state after restart | Service worker restarted; state is read from `chrome.storage.local`. Re-open the popup. |
| Extension errors in console | Open the service worker / background page console from the extensions management page for details. |

## Version

1.0.0 – Initial release.

## License

This project is provided as-is for personal and educational use. Use at your own risk.
