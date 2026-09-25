import { useEffect, useRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';

import {
  GOOGLE_MAPS_REVIEW_FIELDS,
  exportResults,
  getGoogleMapsPlaceId,
  getGoogleMapsPlaceName,
  logger,
  mergeGoogleMapsReviews,
  parseGoogleMapsReview,
  parseGoogleMapsReviewsFromDom,
  randomize,
  sendBackgroundEvent,
  sleep,
} from '@chrome-extension/shared/lib';
import type { IGoogleMapsReview, IGoogleMapsReviewsPage } from '@chrome-extension/shared/lib';
import { AppProvider, Button, Logo, Spinner, Stack } from '@chrome-extension/shared/components';
import {
  BACKGROUND_EVENTS,
  DATA_EXPORT_FORMATS,
  DATA_PARSING_MODES,
  DATA_PLATFORMS,
} from '@chrome-extension/shared/enums';
import { config } from '@chrome-extension/shared';

import { ContentContext, IContentContextState } from '@/context';
import { Layout } from '@/layout';
import {
  expandTruncatedReviews,
  getPlaceTitle,
  openReviewsTab,
  scrollReviewsToEnd,
  sortReviewsByNewest,
} from './google-maps-dom';
import { getReceivedReviewsPages, subscribeToReviewsPages } from './reviews-store';

type Status = 'idle' | 'collecting' | 'paused' | 'completed';

// Give up when several scrolls in a row load nothing new.
const MAX_IDLE_ATTEMPTS = 3;
const PAGE_TIMEOUT_MS = 8000;

const getStyles = (position: 'left' | 'right'): string =>
  twMerge(
    'fixed shadow-md top-[60px] z-50 flex text-black bg-white border border-solid border-gray-200 rounded-md w-[325px] h-auto',
    position === 'right' ? 'right-[20px]' : 'left-[501px]',
  );

const toFileSlug = (value: string): string =>
  value
    .toLowerCase()
    .replace(new RegExp('[^\\p{L}\\p{N}]+', 'gu'), '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

export const ReviewsApp = () => {
  const [placeId] = useState(() => getGoogleMapsPlaceId(document.location.href));
  const [status, setStatus] = useState<Status>('idle');
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<IContentContextState>({
    platform: DATA_PLATFORMS.GOOGLE_MAPS,
    position: 'right',
    mode: DATA_PARSING_MODES.INTERVAL,
    search: null,
    results: 0,
    data: [],
    initiated: false,
    completed: false,
    paused: false,
    extracting: false,
    page: 1,
    pages: 0,
    current: 0,
    total: 0,
    extract_websites: false,
    request_interval: 0,
    auto_download: false,
    export_format: DATA_EXPORT_FORMATS.CSV,
    export_fields: [],
  });

  const reviewsRef = useRef<IGoogleMapsReview[]>([]);
  const lastPageReachedRef = useRef(false);
  const runningRef = useRef(false);
  const collectingRef = useRef(false);

  // Read lazily: the SPA updates the document title after this widget mounts.
  const getPlaceName = (): string => getPlaceTitle() || getGoogleMapsPlaceName(document.location.href);

  // Reviews rendered in the list. Opening a place straight on its Reviews
  // tab renders the first pages without any network call we could observe,
  // so the DOM is the source that always has them.
  const addRenderedReviews = () => {
    expandTruncatedReviews();

    const parsed = parseGoogleMapsReviewsFromDom(document, { placeId: placeId || '', placeName: getPlaceName() });
    reviewsRef.current = mergeGoogleMapsReviews(reviewsRef.current, parsed).slice(0, config.EXTRACT_LIMIT);
    setCount(reviewsRef.current.length);
  };

  const addPage = (page: IGoogleMapsReviewsPage) => {
    const parsed = page.reviews
      .map(raw => parseGoogleMapsReview(raw, { placeId: page.placeId, placeName: getPlaceName() }))
      .filter((review): review is IGoogleMapsReview => review !== null);

    reviewsRef.current = mergeGoogleMapsReviews(reviewsRef.current, parsed).slice(0, config.EXTRACT_LIMIT);
    if (page.nextToken === null) lastPageReachedRef.current = true;
    setCount(reviewsRef.current.length);
  };

  useEffect(() => {
    if (!placeId) return undefined;

    return subscribeToReviewsPages(page => {
      if (page.placeId === placeId && collectingRef.current) addPage(page);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId]);

  const exportReviews = async () => {
    try {
      const settings = await sendBackgroundEvent<{ export_format?: string }>({ type: BACKGROUND_EVENTS.GET_STORE });
      const format = settings?.data?.export_format || DATA_EXPORT_FORMATS.CSV;
      const prefix = [config.EXPORT_FILE_NAME_PREFIX, 'reviews', toFileSlug(getPlaceName())].filter(Boolean).join('-');
      const data = reviewsRef.current as unknown as Record<string, number | string | boolean | undefined>[];

      logger('reviews export', { format, results: data.length });

      exportResults({ format, prefix, fields: GOOGLE_MAPS_REVIEW_FIELDS, data });
    } catch (e) {
      console.error('geoleadscraper reviews export error:', (e as Error)?.message, (e as Error)?.stack);
    }
  };

  const complete = async () => {
    runningRef.current = false;
    setStatus('completed');
    logger('reviews completed', { results: reviewsRef.current.length });

    const settings = await sendBackgroundEvent<{ auto_download?: boolean }>({ type: BACKGROUND_EVENTS.GET_STORE });
    if (settings?.data?.auto_download && reviewsRef.current.length > 0) await exportReviews();
  };

  // Keep scrolling the list until Maps reports the last page, the limit is
  // reached, or nothing new arrives for a few attempts in a row.
  const collect = async () => {
    runningRef.current = true;
    setStatus('collecting');

    let idle = 0;

    while (runningRef.current) {
      addRenderedReviews();

      if (reviewsRef.current.length >= config.EXTRACT_LIMIT) {
        await complete();
        return;
      }

      const before = reviewsRef.current.length;
      scrollReviewsToEnd();

      // Wait for the next page: either a response we observed or new rows
      // rendered into the list.
      const deadline = Date.now() + PAGE_TIMEOUT_MS;
      while (runningRef.current && Date.now() < deadline) {
        await sleep(500);
        addRenderedReviews();
        if (reviewsRef.current.length > before) break;
      }

      if (!runningRef.current) return;

      idle = reviewsRef.current.length > before ? 0 : idle + 1;

      // Maps told us this was the last page — one quiet round is enough.
      const limit = lastPageReachedRef.current ? 1 : MAX_IDLE_ATTEMPTS;
      if (idle >= limit) {
        await complete();
        return;
      }

      await sleep(randomize(config.REQUEST_INTERVAL.GOOGLE_MAPS));
    }
  };

  const handlers = {
    start: async () => {
      if (!placeId) return;

      setError(null);
      reviewsRef.current = [];
      lastPageReachedRef.current = false;
      collectingRef.current = true;
      setCount(0);
      setStatus('collecting');

      // Reviews Maps already loaded on this page count too.
      getReceivedReviewsPages(placeId).forEach(addPage);
      lastPageReachedRef.current = false;

      const opened = await openReviewsTab();
      if (!opened) {
        collectingRef.current = false;
        setStatus('idle');
        setError('This place has no reviews to export.');
        return;
      }

      const sorted = await sortReviewsByNewest();
      logger('reviews start', { placeId, sorted });

      await collect();
    },
    pause: () => {
      runningRef.current = false;
      setStatus('paused');
    },
    resume: () => {
      collect();
    },
    stop: () => {
      runningRef.current = false;
      complete();
    },
    reset: () => {
      runningRef.current = false;
      collectingRef.current = false;
      reviewsRef.current = [];
      lastPageReachedRef.current = false;
      setCount(0);
      setError(null);
      setStatus('idle');
    },
  };

  useEffect(
    () => () => {
      runningRef.current = false;
    },
    [],
  );

  if (!placeId) return null;

  return (
    <AppProvider>
      <ContentContext.Provider
        value={{ context, setContext: partial => setContext(state => ({ ...state, ...partial })) }}>
        <div className={getStyles(context.position)}>
          <Layout>
            <div className="w-full flex flex-col gap-2">
              <div className="w-full flex flex-row justify-between items-center">
                <Logo size="sm" />
                <div>{status === 'collecting' && <Spinner />}</div>
              </div>
              <div className="mt-4 w-full flex flex-col gap-2 text-sm">
                {status === 'collecting' ? (
                  <span>Extracting reviews {count >= 1 ? `(${count})` : '..'}</span>
                ) : status !== 'idle' ? (
                  <span>Reviews: {count}</span>
                ) : null}
                <div className="mt-2 flex flex-col">
                  <Stack>
                    {status === 'idle' && (
                      <Button variant="secondary" size="sm" onClick={handlers.start}>
                        Extract reviews
                      </Button>
                    )}
                    {status === 'collecting' && (
                      <>
                        <Button variant="secondary" size="sm" onClick={handlers.pause}>
                          Pause
                        </Button>
                        <Button variant="secondary" size="sm" onClick={handlers.stop}>
                          Stop
                        </Button>
                      </>
                    )}
                    {(status === 'paused' || status === 'completed') && (
                      <>
                        <Button variant="secondary" size="sm" onClick={exportReviews}>
                          Export reviews ({count})
                        </Button>
                        {status === 'paused' && (
                          <Button variant="secondary" size="sm" onClick={handlers.resume}>
                            Resume
                          </Button>
                        )}
                        <Button variant="secondary" size="sm" onClick={handlers.reset}>
                          Reset
                        </Button>
                      </>
                    )}
                  </Stack>
                </div>
                {error && <span className="mt-1 text-xs text-amber-700">{error}</span>}
              </div>
            </div>
          </Layout>
        </div>
      </ContentContext.Provider>
    </AppProvider>
  );
};
