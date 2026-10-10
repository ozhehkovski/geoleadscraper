import 'webextension-polyfill';

import { BACKGROUND_EVENTS } from '@chrome-extension/shared/enums';
import { type BackgroundMessagePayload, type IBackgroundMessageResponse } from '@chrome-extension/shared';
import { api, getBackendUrl } from './api';
import { crawlWebsitesConcurrently } from './crawler';

chrome.runtime.onInstalled.addListener(async () => {
  const manifest = chrome.runtime.getManifest();
  await chrome.storage.local.set({
    extension: {
      APP_ID: chrome.runtime.id,
      APP_VERSION: manifest.version,
    },
  });
});

const logger = (text: string, data?: Record<string, number | string | object | boolean | undefined>): void => {
  if (text) {
    console.log(text, data ? data : '');
  }
};

/* ------------------------------------------------------------------ *
 *  MCP auto-collection bridge
 *  Poll the backend for collection jobs, drive the extension to scrape
 *  the requested map in a background tab, and submit the results back.
 * ------------------------------------------------------------------ */

type AutoJob = {
  job: { id: string; platform: string; query: string; url?: string; limit: number; extractContacts: boolean };
  backend: string;
  tabId: number;
  timer: ReturnType<typeof setTimeout>;
};

let active: AutoJob | null = null;
const JOB_TIMEOUT_MS = 4 * 60 * 1000;

const buildMapsUrl = (job: AutoJob['job']): string => {
  if (job.url) return job.url;
  const q = encodeURIComponent(job.query);
  switch (job.platform) {
    case 'yandex_maps':
      return `https://yandex.com/maps/?mode=search&text=${q}`;
    case 'gis':
      return `https://2gis.ru/search/${q}`;
    case 'google_maps':
    default:
      return `https://www.google.com/maps/search/${q}`;
  }
};

const reportJobError = async (backend: string, jobId: string, error: string) => {
  await fetch(`${backend}/v1/jobs/${jobId}/error`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error }),
  }).catch(() => undefined);
};

const finishJob = async (tabId: number) => {
  if (!active || active.tabId !== tabId) return;
  clearTimeout(active.timer);
  const { tabId: id } = active;
  active = null;
  await chrome.tabs.remove(id).catch(() => undefined);
};

const startJob = async (backend: string, job: AutoJob['job']) => {
  const url = buildMapsUrl(job);
  const tab = await chrome.tabs.create({ url, active: false });
  const tabId = tab.id as number;

  const timer = setTimeout(async () => {
    if (active && active.tabId === tabId) {
      await reportJobError(backend, job.id, 'timed out while collecting');
      await finishJob(tabId);
    }
  }, JOB_TIMEOUT_MS);

  active = { job, backend, tabId, timer };
  logger('job started', { id: job.id, platform: job.platform, query: job.query, tabId });
};

const pollJobs = async () => {
  if (active) return; // one job at a time
  const backend = await getBackendUrl();
  if (!backend) return;

  const job = await fetch(`${backend}/v1/jobs/next`)
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null);

  if (!job || !job.id) return;

  await startJob(backend, job).catch(async e => {
    await reportJobError(backend, job.id, e?.message || 'failed to start');
    active = null;
  });
};

let pollTimer: ReturnType<typeof setTimeout> | null = null;
const startPollLoop = () => {
  if (pollTimer) return;
  const tick = async () => {
    await pollJobs().catch(() => undefined);
    pollTimer = setTimeout(tick, 5000);
  };
  tick();
};

// Heartbeat: wake the service worker periodically so polling resumes even if
// the worker was suspended while idle.
try {
  chrome.alarms.create('gls-poll', { periodInMinutes: 1 });
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === 'gls-poll') startPollLoop();
  });
} catch {
  // alarms may be unavailable in some contexts; the loop below still runs
}
startPollLoop();

// Reconcile enrich_missing when optional permissions are granted or revoked at runtime
try {
  chrome.permissions?.onAdded?.addListener(permissions => {
    if (permissions.origins?.includes('<all_urls>') || permissions.origins?.some(o => o.includes('*'))) {
      chrome.storage.local.get('store', ({ store }) => {
        chrome.storage.local.set({ store: { ...(store || {}), enrich_missing: true } });
      });
    }
  });

  chrome.permissions?.onRemoved?.addListener(permissions => {
    if (permissions.origins?.includes('<all_urls>') || permissions.origins?.some(o => o.includes('*'))) {
      chrome.storage.local.get('store', ({ store }) => {
        chrome.storage.local.set({ store: { ...(store || {}), enrich_missing: false } });
      });
    }
  });
} catch {
  // permissions listeners unavailable
}

/* ------------------------------------------------------------------ */

chrome.runtime.onMessage.addListener(
  (
    message: { type: string; payload: BackgroundMessagePayload },
    sender: chrome.runtime.MessageSender,
    send: (response: IBackgroundMessageResponse) => void,
  ) => {
    try {
      const action = message.type;
      const payload = message.payload;

      // handle the base (promise-returning) actions
      handleBackgroundEvent({ action, payload, callback: send });

      if (action === BACKGROUND_EVENTS.GET_STORE) {
        chrome.storage.local.get('store', ({ store }) => {
          send({ data: store, error: false });
        });
      }

      // a content script asks whether its tab was opened for an auto-collect job
      if (action === BACKGROUND_EVENTS.CONTENT_READY) {
        const tabId = sender.tab?.id;
        const job = active && tabId === active.tabId ? active.job : null;
        send({ data: { job }, error: false });
      }

      if (action === BACKGROUND_EVENTS.SUBMIT_JOB_RESULTS) {
        const { jobId, data, results } = (payload as { jobId: string; data: any[]; results: number }) || {};
        if (active && active.job.id === jobId) {
          const backend = active.backend;
          const tabId = active.tabId;
          fetch(`${backend}/v1/jobs/${jobId}/results`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data, results }),
          })
            .catch(() => undefined)
            .finally(() => finishJob(tabId));
        }
        send({ data: {}, error: false });
      }

      if (action === BACKGROUND_EVENTS.JOB_FAILED) {
        const { jobId, error } = (payload as { jobId: string; error: string }) || {};
        if (active && active.job.id === jobId) {
          const backend = active.backend;
          const tabId = active.tabId;
          reportJobError(backend, jobId, error || 'collection failed').finally(() => finishJob(tabId));
        }
        send({ data: {}, error: false });
      }

      if (action === BACKGROUND_EVENTS.OPEN_NEW_TAB) {
        const { url } = (payload as { url: string }) || {};
        chrome.tabs.create({ url });
      }

      if (action === BACKGROUND_EVENTS.OPEN_EXTENSION_PAGE) {
        chrome.runtime.openOptionsPage();
      }

      return true;
    } catch (e: any) {
      logger('background error', { message: e?.message });
      return false;
    }
  },
);

const handleBackgroundEvent = ({
  action,
  payload = {},
  callback,
}: {
  action: string;
  payload: BackgroundMessagePayload;
  callback: (response: IBackgroundMessageResponse) => void;
}) => {
  payload = payload || {};

  const handle = (promise: Promise<void | any>) => {
    promise
      .then(data => callback({ error: false, data }))
      .catch(error => callback({ error: true, message: error?.message }));
  };

  if (action === BACKGROUND_EVENTS.LOGGER) {
    logger(payload?.text as string, payload?.data as BackgroundMessagePayload);
  }

  switch (action) {
    case BACKGROUND_EVENTS.FETCH_URL:
      handle(handlers.fetchUrl({ url: payload.url as string }));
      break;
    case BACKGROUND_EVENTS.EXTRACT_WEBSITES:
      handle(handlers.extractWebsites({ urls: payload.urls as string[] }));
      break;
    case BACKGROUND_EVENTS.CHECK_BACKEND:
      handle(handlers.checkBackend());
      break;
    case BACKGROUND_EVENTS.UPDATE_GOOGLE_MAPS_CONFIG:
      handle(handlers.getGoogleMapsConfig(payload));
      break;
  }
};

let backendStatusCache: { available: boolean; timestamp: number } | null = null;

const handlers = {
  fetchUrl: async ({ url }: { url: string }) => {
    const response = await fetch(url);
    return response.text();
  },

  checkBackend: async (): Promise<{ available: boolean; url: string }> => {
    const url = await getBackendUrl();
    if (!url) return { available: false, url: '' };

    api.setBaseUrl(url);
    const { error } = await api.health();
    const available = !error;
    backendStatusCache = { available, timestamp: Date.now() };
    return { available, url };
  },

  extractWebsites: async ({ urls }: { urls: string[] }) => {
    // 1. If backend is configured and running, try backend first (Puppeteer)
    try {
      const now = Date.now();
      const isCachedHealthy = backendStatusCache && (now - backendStatusCache.timestamp < 30000) && backendStatusCache.available;
      const isCachedUnhealthy = backendStatusCache && (now - backendStatusCache.timestamp < 30000) && !backendStatusCache.available;

      if (!isCachedUnhealthy) {
        const url = await getBackendUrl();
        if (url) {
          api.setBaseUrl(url);
          let canUseBackend = isCachedHealthy;
          if (!canUseBackend) {
            const { error: healthError } = await api.health();
            canUseBackend = !healthError;
            backendStatusCache = { available: canUseBackend, timestamp: now };
          }
          if (canUseBackend) {
            const { data, error } = await api.extractWebsites({ urls });
            if (!error) {
              logger('Extracted websites via local backend', { count: data?.data?.length || 0 });
              return data || { data: [], results: 0 };
            }
          }
        }
      }
    } catch (e) {
      backendStatusCache = { available: false, timestamp: Date.now() };
      logger('Backend extraction unavailable, using native in-browser crawler', { error: (e as Error)?.message });
    }

    // 2. Standalone in-browser native crawler (zero-setup, universal fallback)
    const hasPermission = await chrome.permissions?.contains?.({ origins: ['<all_urls>'] });
    if (!hasPermission) {
      logger('Native in-browser crawler skipped: <all_urls> permission missing');
      return {
        data: [],
        results: 0,
        permissionMissing: true,
      };
    }

    logger('Running in-browser native crawler for URLs', { count: urls.length });
    const result = await crawlWebsitesConcurrently(urls, 6);
    logger('Native in-browser crawler completed', { results: result.results });
    return result;
  },

  getGoogleMapsConfig: async (config: any) => {
    chrome.storage.local.set({ config: { google_maps: config } });
    return config;
  },
};
