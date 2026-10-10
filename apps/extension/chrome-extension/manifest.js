import { config } from '@chrome-extension/shared';

/**
 * After changing, please reload the extension at `chrome://extensions`
 * @type {chrome.runtime.ManifestV3}
 */
const manifest = Object.assign({
  manifest_version: 3,
  default_locale: 'en',
  version: config.APP_VERSION,
  name: '__MSG_extensionName__',
  description: '__MSG_extensionDescription__',
  permissions: ['storage', 'activeTab', 'scripting', 'tabs', 'alarms'],
  host_permissions: ['*://*.google.com/*', 'http://localhost/*', 'http://127.0.0.1/*'],
  optional_host_permissions: ['<all_urls>'],
  options_page: 'options/index.html',
  key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnX7EN8qaI6ajLgmaQZQbOEXOrBeP5FKqaZc7AG8hGDr0BmaHFbFiLNIGyI6g2BNum1OVKAAK5ClsG3MKWUNkvWPJLMVeF2QE61NSD13GFBY9TwpWqPdVU4BUWDRDc/MVj5c6daCGWjP3dCo0BzpA6Tb3t9eqOiloilh2bt+1Lr+9eUMu8ukpXZKrng16KvqQbDeNH3JpaK8ACUapAgXqAHQ5gIjCA1BDjZFsBUlvuMuej5DfmzG+KsKGBes4NKcJEar3XMWkG6ooYUE5rF7M0cJYxVBew4eAMpwy+P7Y5qTnHLfGmgwg3kMKWiSZDqhmgfsPF53bguQC9T8TPkIzFwIDAQAB',
  background: {
    service_worker: 'service-worker.js',
    type: 'module',
  },
  action: {
    default_popup: 'popup/index.html',
    default_icon: 'icon-32.png',
  },
  icons: {
    32: 'icon-32.png',
    128: 'icon-128.png',
  },
  content_scripts: [
    {
      matches: config.CONTENT_SCRIPT_DOMAINS.map(domain => `*://*.${domain}/*`),
      js: ['content/index.iife.js'],
      run_at: 'document_end',
      all_frames: false,
    },
  ],
  web_accessible_resources: [
    {
      resources: ['*.js', '*.css', '*.svg', 'icon-128.png', 'icon-32.png'],
      matches: ['*://*/*'],
    },
  ],
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'",
  },
});

export default manifest;
