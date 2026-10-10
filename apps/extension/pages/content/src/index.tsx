import { createRoot } from 'react-dom/client';
import App from './app';
import { ReviewsApp } from './reviews/reviews-app';
import { receiveReviewsResponse } from './reviews/reviews-store';

// eslint-disable-next-line
// @ts-ignore
import tailwindcssOutput from './tailwind-output.css?inline';
import { detectDataPlatformByUrl, logger, sendBackgroundEvent } from '@chrome-extension/shared/lib';
import { BACKGROUND_EVENTS, DATA_PLATFORMS } from '@chrome-extension/shared/enums';

const APP_ID = 'mapscan_app';

const platform = detectDataPlatformByUrl(document.location.href) as string;

// @remove
// const patterns = {
//   google: /^\/maps\/(search|place)\/.+/,
//   yandex: /^\/maps\/.+/,
//   gis: /^\/[^/]+\/search\/.+/,
// };

const shouldRender = ({ platform, url }: { url: string; platform: string }): boolean => {
  const path = new URL(url).href;

  switch (platform) {
    case DATA_PLATFORMS.GOOGLE_MAPS:
      // Search results → company extraction; a single place → reviews export.
      return path.includes('/maps/search/') || path.includes('/maps/place/');
    case DATA_PLATFORMS.YANDEX_MAPS:
      return (
        path.includes('/maps') &&
        [
          path.includes('/search'),
          path.includes('mode=search'),
          path.includes('text='),
          path.includes('?bookmarks'),
          path.includes('bookmarks'),
        ].some(condition => condition === true)
      );
    case DATA_PLATFORMS.GIS:
      return [path.includes('/search'), path.includes('/favorites/private')].some(condition => condition === true);
    default:
      return false;
  }
};

function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function (this: ThisParameterType<T>, ...args: Parameters<T>): void {
    const later = () => {
      timeout = null;
      func.apply(this, args);
    };

    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

const render = () => {
  const url = document.location.href;

  if (!shouldRender({ platform, url })) {
    const existingApp = document.getElementById(APP_ID);
    if (existingApp) {
      existingApp.remove();
    }
    return;
  }

  const existingApp = document.getElementById(APP_ID);
  if (existingApp) {
    existingApp.remove();
  }

  const root = document.createElement('div');
  root.id = APP_ID;

  let container: HTMLElement = document.body;

  switch (platform) {
    case DATA_PLATFORMS.GOOGLE_MAPS:
      container = document.getElementById('assistive-chips') || document.body;
      break;
    case DATA_PLATFORMS.YANDEX_MAPS:
    case DATA_PLATFORMS.GIS:
      container = document.body;
      break;
  }

  container.append(root);

  const rootIntoShadow = document.createElement('div');
  rootIntoShadow.id = 'shadow-root';
  const shadowRoot = root.attachShadow({ mode: 'open' });
  shadowRoot.appendChild(rootIntoShadow);

  const styleElement = document.createElement('style');
  styleElement.innerHTML = tailwindcssOutput;
  shadowRoot.appendChild(styleElement);

  const isGooglePlace = platform === DATA_PLATFORMS.GOOGLE_MAPS && url.includes('/maps/place/');

  createRoot(rootIntoShadow).render(isGooglePlace ? <ReviewsApp /> : <App platform={platform || ''} />);

  logger('APP_RENDER');
};

const debouncedRender = debounce(render, 100);

// Self-heal: SPA map sites (especially Yandex) replace document.body after the
// content script runs at document_end, wiping our widget. Re-mount it whenever
// it should be visible but is missing — no Ctrl+R needed.
const ensureRendered = () => {
  if (shouldRender({ platform, url: document.location.href }) && !document.getElementById(APP_ID)) {
    debouncedRender();
  }
};

let lastUrl = document.location.href;

// set up mutationobserver to watch for url changes
const observer = new MutationObserver(() => {
  let url = '';

  switch (platform) {
    case DATA_PLATFORMS.GOOGLE_MAPS:
      url = document.location.href.split('/@')[0];
      break;
    case DATA_PLATFORMS.YANDEX_MAPS:
      url = document.location.href.split('?')[0];
      break;
    case DATA_PLATFORMS.GIS:
      url = document.location.href.split('/firm/')[0];
      break;
    default:
      url = document.location.href;
      break;
  }

  if (url !== lastUrl) {
    lastUrl = url;
    debouncedRender();
    return;
  }

  // Otherwise keep the widget alive if the page tore it down.
  ensureRendered();
});

observer.observe(document, { subtree: true, childList: true });

// render the app (retry a few times for SPAs that mount their UI late)
setTimeout(debouncedRender, 0);
setTimeout(ensureRendered, 600);
setTimeout(ensureRendered, 1500);
setTimeout(ensureRendered, 3000);

// inject the script
const injectScript = () => {
  const script = document.createElement('script');

  script.src = chrome.runtime.getURL('injected.js');
  script.onload = () => {
    script.remove();
  };

  (document.head || document.documentElement).appendChild(script);

  logger('CONTENT_SCRIPT_INJECTED');
};

injectScript();

logger('CONTENT_SCRIPT_LOADED');

let initial = true;

// listen for messages from the injected script
window.addEventListener('message', event => {
  // Only trust messages posted by the injected script in this very window.
  if (event.source !== window) return;

  let message;

  try {
    message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
  } catch {
    console.warn('Invalid event data in postMessage:', event.data);
    return;
  }

  const { action, data } = message || {};

  switch (action) {
    case BACKGROUND_EVENTS.UPDATE_GOOGLE_MAPS_CONFIG:
      if (initial) {
        logger('GOOGLE_MAPS_CONFIG', data || {});
      }
      sendBackgroundEvent({ type: BACKGROUND_EVENTS.UPDATE_GOOGLE_MAPS_CONFIG, payload: data });
      break;
    case BACKGROUND_EVENTS.GOOGLE_MAPS_REVIEWS_RESPONSE:
      if (typeof data?.request === 'string' && typeof data?.response === 'string') {
        receiveReviewsResponse({ request: data.request, response: data.response });
      }
      break;
  }

  if (initial) {
    initial = false;
  }
});

// clean up observer when the script is unloaded
window.addEventListener('unload', () => {
  observer.disconnect();
});
