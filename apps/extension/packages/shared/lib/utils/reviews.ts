// Google Maps reviews.
//
// Google Maps loads a place's reviews through its internal `batchexecute`
// endpoint (rpc id `qv9Egd`), 10 reviews per page. Those requests carry a
// BotGuard token, so we never issue them ourselves: the extension drives the
// Maps UI (opens the Reviews tab and scrolls the list) and the injected page
// script passively forwards the responses Maps already received. This module
// holds the pure parsing logic for those responses.

export const GOOGLE_MAPS_REVIEWS_RPC_ID = 'qv9Egd';

export interface IGoogleMapsReview {
  review_id: string;
  place_id: string;
  place_name: string;
  author_name: string;
  author_id: string;
  author_url: string;
  author_photo: string;
  author_info: string;
  rating: number | undefined;
  text: string;
  text_translated: string;
  language: string;
  published_at: string;
  updated_at: string;
  relative_date: string;
  details: string;
  photos: string;
  photos_count: number;
  owner_response: string;
  owner_response_at: string;
  /** Relative date as Maps renders it, e.g. "5 months ago" (DOM fallback). */
  owner_response_relative_date: string;
  review_url: string;
}

export interface IGoogleMapsReviewsPage {
  /** Feature id of the place, e.g. `0x47192d004eb606fd:0xdcadaf8ae2686d8c`. */
  placeId: string;
  /** Token of the next page; `null` when this was the last page. */
  nextToken: string | null;
  /** Raw review entries, see `parseGoogleMapsReview`. */
  reviews: unknown[];
}

export const GOOGLE_MAPS_REVIEW_FIELDS: (keyof IGoogleMapsReview)[] = [
  'review_id',
  'place_id',
  'place_name',
  'author_name',
  'author_id',
  'author_url',
  'author_photo',
  'author_info',
  'rating',
  'text',
  'text_translated',
  'language',
  'published_at',
  'updated_at',
  'relative_date',
  'details',
  'photos',
  'photos_count',
  'owner_response',
  'owner_response_at',
  'owner_response_relative_date',
  'review_url',
];

type Json = unknown;

// Safe nested accessor for Google's positional JSON arrays.
const at = (value: Json, ...path: number[]): Json => {
  let current: Json = value;
  for (const index of path) {
    if (!Array.isArray(current)) return undefined;
    current = current[index];
  }
  return current;
};

const str = (value: Json): string => (typeof value === 'string' ? value : '');

// Google timestamps are microseconds since epoch.
const microsToIso = (value: Json): string => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '';
  return new Date(Math.floor(value / 1000)).toISOString();
};

const FEATURE_ID_PATTERN = /!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i;

/** Extract the place feature id (`0x…:0x…`) from a Google Maps place URL. */
export const getGoogleMapsPlaceId = (url: string): string | null => {
  const match = url.match(FEATURE_ID_PATTERN) || decodeURIComponent(url).match(FEATURE_ID_PATTERN);
  return match ? match[1].toLowerCase() : null;
};

/** Extract the place name from a Google Maps place URL (`/maps/place/<name>/…`). */
export const getGoogleMapsPlaceName = (url: string): string => {
  const match = url.match(/\/maps\/place\/([^/@?]+)/);
  if (!match) return '';
  try {
    return decodeURIComponent(match[1].replace(/\+/g, ' ')).trim();
  } catch {
    return match[1].replace(/\+/g, ' ').trim();
  }
};

export const isGoogleMapsPlaceUrl = (url: string): boolean => /\/maps\/place\//.test(url);

/**
 * Read the place feature id from the (JSON-encoded) `f.req` form field of a
 * `batchexecute` request body. Returns null for any other rpc.
 */
export const getReviewsRequestPlaceId = (body: string): string | null => {
  try {
    const freq = new URLSearchParams(body).get('f.req');
    if (!freq) return null;
    const outer = JSON.parse(freq) as Json;
    const call = at(outer, 0, 0);
    if (at(call, 0) !== GOOGLE_MAPS_REVIEWS_RPC_ID) return null;
    const payload = JSON.parse(str(at(call, 1))) as Json;
    const placeId = str(at(payload, 0, 0, 0));
    return placeId ? placeId.toLowerCase() : null;
  } catch {
    return null;
  }
};

/**
 * Parse a raw `batchexecute` response body and return the reviews payloads it
 * contains. The body is a `)]}'`-prefixed stream of length-prefixed JSON
 * chunks; each `wrb.fr` envelope holds one rpc result as a JSON string.
 */
export const parseReviewsBatchResponse = (text: string, placeId = ''): IGoogleMapsReviewsPage[] => {
  const pages: IGoogleMapsReviewsPage[] = [];

  for (const line of text.split('\n')) {
    if (!line.startsWith('[[')) continue;

    let envelopes: Json;
    try {
      envelopes = JSON.parse(line);
    } catch {
      continue;
    }
    if (!Array.isArray(envelopes)) continue;

    for (const envelope of envelopes) {
      if (at(envelope, 0) !== 'wrb.fr' || at(envelope, 1) !== GOOGLE_MAPS_REVIEWS_RPC_ID) continue;

      const payloadText = str(at(envelope, 2));
      if (!payloadText) continue;

      let payload: Json;
      try {
        payload = JSON.parse(payloadText);
      } catch {
        continue;
      }

      const list = at(payload, 2);
      const reviews = Array.isArray(list) ? list.map(entry => at(entry, 0)).filter(Array.isArray) : [];
      const token = at(payload, 1);

      pages.push({ placeId, nextToken: typeof token === 'string' && token ? token : null, reviews });
    }
  }

  return pages;
};

// "Food: 5; Price per person: zł 20–40; …" — structured sub-ratings and
// guided-dining answers attached to a review.
const parseReviewDetails = (items: Json): string => {
  if (!Array.isArray(items)) return '';

  return items
    .map(item => {
      const label = str(at(item, 5)) || str(at(item, 1));
      const score = at(item, 11, 0);
      const options = at(item, 2, 0);
      const value =
        typeof score === 'number'
          ? String(score)
          : Array.isArray(options)
            ? options
                .map(option => str(at(option, 1)))
                .filter(Boolean)
                .join(', ')
            : '';
      return label && value ? `${label}: ${value}` : '';
    })
    .filter(Boolean)
    .join('; ');
};

const parseReviewPhotos = (items: Json): string[] => {
  if (!Array.isArray(items)) return [];
  return items.map(item => str(at(item, 1, 6, 0))).filter(Boolean);
};

/** Convert one raw review entry into a flat, export-ready record. */
export const parseGoogleMapsReview = (
  raw: Json,
  place: { placeId?: string; placeName?: string } = {},
): IGoogleMapsReview | null => {
  const reviewId = str(at(raw, 0));
  if (!reviewId) return null;

  const author = at(raw, 1, 4, 5);
  const rating = at(raw, 2, 0, 0);
  const photos = parseReviewPhotos(at(raw, 2, 2));

  return {
    review_id: reviewId,
    place_id: place.placeId || '',
    place_name: place.placeName || '',
    author_name: str(at(author, 0)),
    author_id: str(at(author, 3)),
    author_url: str(at(author, 2, 0)),
    author_photo: str(at(author, 1)),
    author_info: str(at(author, 10, 0)),
    rating: typeof rating === 'number' ? rating : undefined,
    text: str(at(raw, 2, 15, 0, 0)),
    text_translated: str(at(raw, 2, 15, 1, 0)),
    language: str(at(raw, 2, 14, 0)),
    published_at: microsToIso(at(raw, 1, 2)),
    updated_at: microsToIso(at(raw, 1, 3)),
    relative_date: str(at(raw, 1, 6)),
    details: parseReviewDetails(at(raw, 2, 6)),
    photos: photos.join(', '),
    photos_count: photos.length,
    owner_response: str(at(raw, 3, 14, 0, 0)),
    owner_response_at: microsToIso(at(raw, 3, 1)),
    owner_response_relative_date: str(at(raw, 3, 3)),
    review_url: str(at(raw, 4, 3, 0)),
  };
};

/* ------------------------------------------------------------------ *
 *  DOM fallback
 *
 *  Opening a place straight on its Reviews tab makes Maps render the
 *  first pages without any `batchexecute` call, so intercepting responses
 *  alone misses them. Reading the rendered list covers that; the network
 *  data stays richer (exact dates, translations, sub-ratings) and wins
 *  when both sources describe the same review.
 * ------------------------------------------------------------------ */

export const REVIEW_ELEMENT_SELECTOR = '[data-review-id]';
/** "More" button that expands a review clamped by Maps. */
export const REVIEW_EXPAND_SELECTOR = 'button.w8nwRe';

type DomElement = {
  tagName: string;
  getAttribute(name: string): string | null;
  querySelector(selectors: string): DomElement | null;
  querySelectorAll(selectors: string): ArrayLike<DomElement>;
  closest(selectors: string): DomElement | null;
  parentElement: DomElement | null;
  textContent: string | null;
};

const text = (element: DomElement | null): string => (element?.textContent || '').trim();

const attr = (element: DomElement | null, name: string): string => element?.getAttribute(name) || '';

/** Anything that can be queried for review elements — a Document or an Element. */
type DomRoot = { querySelectorAll(selectors: string): ArrayLike<DomElement> };

/** Review containers only — buttons inside a review repeat `data-review-id`. */
export const getGoogleMapsReviewElements = (root: DomRoot): DomElement[] =>
  Array.from(root.querySelectorAll(REVIEW_ELEMENT_SELECTOR)).filter(element => {
    if (element.tagName !== 'DIV') return false;
    const parent = element.parentElement;
    return !parent || !parent.closest(REVIEW_ELEMENT_SELECTOR);
  });

const parseDomRating = (element: DomElement): number | undefined => {
  const label = attr(element.querySelector('span[role="img"][aria-label]'), 'aria-label');
  const match = label.match(/\d+([.,]\d+)?/);
  return match ? parseFloat(match[0].replace(',', '.')) : undefined;
};

const parseDomPhotos = (element: DomElement): string[] => {
  const urls: string[] = [];

  for (const button of Array.from(element.querySelectorAll('button[style*="background-image"]'))) {
    const url = attr(button, 'style').match(/url\(["']?(https?:[^"')]+)/);
    if (url) urls.push(url[1]);
  }

  return urls;
};

/**
 * Read one review from the rendered list. Expand clamped reviews first
 * (see `REVIEW_EXPAND_SELECTOR`), otherwise the text ends in "… More".
 */
export const parseGoogleMapsReviewElement = (
  element: DomElement,
  place: { placeId?: string; placeName?: string } = {},
): IGoogleMapsReview | null => {
  const reviewId = attr(element, 'data-review-id');
  if (!reviewId) return null;

  const body = element.querySelector('.MyEned');
  // Still clamped: its text would end in "… More". Leave it empty so the full
  // text can arrive from the network, or from a later pass once expanded.
  const clamped = !!element.querySelector(REVIEW_EXPAND_SELECTOR);
  const owner = element.querySelector('.CDe7pd');
  const authorUrl = Array.from(element.querySelectorAll('button[data-href]'))
    .map(button => attr(button, 'data-href'))
    .find(href => href.includes('/maps/contrib/'));
  const photos = parseDomPhotos(element);

  return {
    review_id: reviewId,
    place_id: place.placeId || '',
    place_name: place.placeName || '',
    author_name: text(element.querySelector('.d4r55')),
    author_id: (authorUrl?.match(/\/maps\/contrib\/(\d+)/) || [])[1] || '',
    author_url: authorUrl || '',
    author_photo: attr(element.querySelector('img.NBa7we'), 'src'),
    author_info: text(element.querySelector('.RfnDt')),
    rating: parseDomRating(element),
    text: clamped ? '' : text(body),
    text_translated: '',
    language: attr(body, 'lang'),
    published_at: '',
    updated_at: '',
    relative_date: text(element.querySelector('.rsqaWe')),
    details: '',
    photos: photos.join(', '),
    photos_count: photos.length,
    owner_response: text(owner?.querySelector('.wiI7pd') || null),
    owner_response_at: '',
    owner_response_relative_date: text(owner?.querySelector('.DZSIDd') || null),
    review_url: '',
  };
};

/** Read every review currently rendered in the list. */
export const parseGoogleMapsReviewsFromDom = (
  root: DomRoot,
  place: { placeId?: string; placeName?: string } = {},
): IGoogleMapsReview[] =>
  getGoogleMapsReviewElements(root)
    .map(element => parseGoogleMapsReviewElement(element, place))
    .filter((review): review is IGoogleMapsReview => review !== null);

const isEmptyField = (value: number | string | undefined): boolean =>
  value === undefined || value === null || value === '' || value === 0;

/**
 * Merge newly parsed reviews into an existing list, de-duplicated by id.
 * A review seen twice keeps what it already has and only fills in the
 * fields that were empty, so a DOM record never overwrites network data.
 */
export const mergeGoogleMapsReviews = (
  current: IGoogleMapsReview[],
  incoming: IGoogleMapsReview[],
): IGoogleMapsReview[] => {
  const byId = new Map(current.map(review => [review.review_id, review]));
  const merged = [...current];

  for (const review of incoming) {
    const existing = byId.get(review.review_id);

    if (existing) {
      for (const field of GOOGLE_MAPS_REVIEW_FIELDS) {
        if (isEmptyField(existing[field]) && !isEmptyField(review[field])) {
          (existing[field] as number | string | undefined) = review[field];
        }
      }
      continue;
    }

    byId.set(review.review_id, review);
    merged.push(review);
  }

  return merged;
};
