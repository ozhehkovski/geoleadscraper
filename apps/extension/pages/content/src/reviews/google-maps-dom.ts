import { REVIEW_EXPAND_SELECTOR, sleep } from '@chrome-extension/shared/lib';

// Google Maps visual-element ids (the numeric prefix of `jslog`) are stable
// across UI languages, unlike labels. Labels are only a fallback.
const REVIEWS_TAB_SELECTOR = 'button[role="tab"][jslog^="145620"]';
const SORT_BUTTON_SELECTOR = 'button[jslog^="59550"], button[data-value="Sort"]';
// Sort menu order: most relevant, newest, highest rating, lowest rating.
const SORT_NEWEST_SELECTOR = '[role="menuitemradio"][data-index="1"]';
const REVIEW_SELECTOR = '[data-review-id]';

const findReviewsTab = (): HTMLButtonElement | null =>
  document.querySelector<HTMLButtonElement>(REVIEWS_TAB_SELECTOR) ||
  Array.from(document.querySelectorAll<HTMLButtonElement>('button[role="tab"]')).find(tab =>
    /review|отзыв|opini|rezension|avis|reseñ|recensi|avalia|yorum|відгук/i.test(tab.getAttribute('aria-label') || ''),
  ) ||
  null;

const waitFor = async <T>(read: () => T | null | undefined, timeout: number): Promise<T | null> => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = read();
    if (value) return value;
    await sleep(250);
  }
  return null;
};

export const hasReviewsTab = (): boolean => !!findReviewsTab();

/** Open the place's Reviews tab and wait until reviews are rendered. */
export const openReviewsTab = async (): Promise<boolean> => {
  const tab = await waitFor(findReviewsTab, 5000);
  if (!tab) return false;

  if (tab.getAttribute('aria-selected') !== 'true') tab.click();

  return !!(await waitFor(() => document.querySelector(REVIEW_SELECTOR), 10000));
};

/**
 * Switch the list to "Newest". Besides a predictable order, changing the sort
 * makes Maps reload the list from the first page, so we observe every page.
 */
export const sortReviewsByNewest = async (): Promise<boolean> => {
  const button = await waitFor(() => document.querySelector<HTMLButtonElement>(SORT_BUTTON_SELECTOR), 3000);
  if (!button) return false;

  button.click();

  const item = await waitFor(() => document.querySelector<HTMLElement>(SORT_NEWEST_SELECTOR), 3000);
  if (!item) return false;

  item.click();
  return true;
};

const findScrollContainer = (): HTMLElement | null => {
  let element = document.querySelector<HTMLElement>(REVIEW_SELECTOR)?.parentElement || null;

  while (element && element !== document.body) {
    const { overflowY } = getComputedStyle(element);
    if ((overflowY === 'auto' || overflowY === 'scroll') && element.scrollHeight > element.clientHeight) {
      return element;
    }
    element = element.parentElement;
  }

  return null;
};

/**
 * Expand reviews Maps clamped with a "More" button — their rendered text
 * otherwise ends in "… More". Returns how many were expanded.
 */
export const expandTruncatedReviews = (): number => {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(REVIEW_EXPAND_SELECTOR));
  buttons.forEach(button => button.click());
  return buttons.length;
};

/** Scroll the reviews list to the bottom so Maps loads the next page. */
export const scrollReviewsToEnd = (): boolean => {
  const container = findScrollContainer();
  if (!container) return false;

  container.scrollTop = container.scrollHeight;
  return true;
};

/**
 * Place title as shown by Maps, e.g. "Ach Cafe - Google Maps" → "Ach Cafe".
 * Empty while the SPA still shows the bare "Google Maps" title.
 */
export const getPlaceTitle = (): string => {
  const title = document.title.replace(/\s+[-–—]\s+Google Maps.*$/i, '').trim();
  return /^google maps$/i.test(title) ? '' : title;
};
