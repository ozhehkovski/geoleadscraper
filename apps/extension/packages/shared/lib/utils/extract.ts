import { IExtractWebsiteResult } from './../../interfaces';
import { BACKGROUND_EVENTS, DATA_PARSING_MODES, DATA_PLATFORM_DOMAINS, DATA_PLATFORMS } from '../../enums';
import { getLocalStorageValue, logger, sendBackgroundEvent } from './background';

import { altitude } from './geo';
import { randomize, sleep } from './interval';

const GOOGLE_BASE_URL = 'https://www.google.com/search';

export type DataPlatform = (typeof DATA_PLATFORMS)[keyof typeof DATA_PLATFORMS];
export type DataParsingMode = (typeof DATA_PARSING_MODES)[keyof typeof DATA_PARSING_MODES];

interface IExtractMapsBaseOptions<S = any> {
  timeout: number;
  page?: number;
  limit?: number;
  state: {
    value: S;
    update: (callback: (state: S) => S) => void;
  };
  controller: AbortController;
  extractWebsites?: boolean;
  next?: boolean;
  complete: (props: { results: number }) => void;
  onRequestComplete: (props: { data: any[]; results: number }) => void;
}

interface IExtractMapsBaseState<T = any> {
  data: T[];
  results: number;
  paused: boolean;
  completed: boolean;
  total?: number;
  page?: number;
  pages?: number;
}

export interface IExtractMapsBaseResponse<T = any> {
  data: T[];
  results: number;
  page: number;
  search: string;
}

export interface IExtractMapsBaseItem {
  place_id: string;
  title: string;
  categories?: string;
  photos?: number;
  labels?: string;
  maps_url: string;
  municipality?: string;
  review_url?: string;
  address: string;
  street?: string;
  latitude: number;
  longitude: number;
  rating?: number;
  review_count: number;
  website?: string;
  email?: string;
  phone?: string;
  phones?: string;
  socials?: string;
  opening_hours?: string;
  hotel_description?: string;
  hotel_class?: string;
  hotel_time?: string;
  hotel_labels?: string;
}

export const detectDataPlatformByUrl = (url: string): DataPlatform | null => {
  let platform: string | null = null;

  const domainBase = url.split('://')[1].split('/')[0];
  const domain = domainBase.startsWith('www.') ? domainBase.split('www.')[1] : domainBase;

  if (DATA_PLATFORM_DOMAINS.GOOGLE_MAPS.includes(domain)) {
    platform = DATA_PLATFORMS.GOOGLE_MAPS;
  }

  if (DATA_PLATFORM_DOMAINS.YANDEX_MAPS.includes(domain)) {
    platform = DATA_PLATFORMS.YANDEX_MAPS;
  }

  if (DATA_PLATFORM_DOMAINS.GIS.includes(domain)) {
    platform = DATA_PLATFORMS.GIS;
  }

  return platform;
};

// google maps

export interface IGoogleMapsExtractItem extends IExtractMapsBaseItem {
  cid: string;
  datafid: string;
  pricing: string;
  ward: string;
  street: string;
  city: string;
  postal_code: string;
  state: string;
  country_code: string;
  located_in: string;
  menu_link: string;
  booking_link: string;
  table_order_link: string;
  photos: number;
  preview_link: string;
  claimed: boolean;
  main_category: string;
  latest_post: string;
  services: string;
  labels: string;
  opening_hours: string;
}

export interface IYandexMapsExtractItem extends IExtractMapsBaseItem {}

export interface I2GisMapsExtractItem extends IExtractMapsBaseItem {}

interface IExtractGoogleMapsState extends IExtractMapsBaseState<IGoogleMapsExtractItem> {}

interface IExtractGoogleMapsOptions extends IExtractMapsBaseOptions<IExtractGoogleMapsState> {
  query: IExtractGoogleQueryParams;
}

export interface IExtractGoogleQueryParams {
  search: string;
  lat: number;
  long: number;
  alt: number;
  psi: string;
  language: string;
  region: string;
  zoom: number;
  width: number;
  height: number;
}

interface IGoogleMapsUrlParams {
  lan: string;
  // gl: string;
  alt: number;
  lat: number;
  long: number;
  offset: number;
  width: number;
  height: number;
  psi: string;
  search: string;
}

interface IExtractGoogleMapsResponse extends IExtractMapsBaseResponse<IGoogleMapsExtractItem> {}

export const extractGoogleMapsResults = async (options: IExtractGoogleMapsOptions): Promise<void> => {
  const {
    query,
    timeout = 2000,
    next = true,
    page = 1,
    limit = 10000,
    controller,
    extractWebsites,
    state: { value: state, update: setState },
    complete,
    onRequestComplete,
  } = options;
  const { signal } = controller;
  const { search, lat, long, alt, psi, language, region, width, height } = query;
  const take = 20;

  // check if the signal aborted
  if (signal.aborted) {
    logger('extract request aborted');
    return;
  }

  // fetch the results
  const response = await fetchGoogleMapsResults({
    search,
    lat,
    long,
    alt,
    page,
    psi,
    take,
    region,
    language,
    width,
    height,
  });

  let data = response.data;
  const results = response.results;

  // extract the websites
  if (extractWebsites) {
    const urls: string[] = data.map(({ website }) => website as string);
    const websites = urls.length >= 1 ? await extractWebsiteResults({ urls }).then(({ data }) => data) : [];

    data = data.map(result => {
      if (!result.website) return result;

      const website = websites.find(({ url }: { url: string }) => url === result.website);
      if (!website) return result;

      const email = result?.email ? result.email : website?.email ? website.email : undefined;
      const socials = website?.socials && website?.socials?.length >= 1 ? website.socials.join(', ') : '';
      const phones = website?.phones && website?.phones?.length >= 1 ? website.phones.join(', ') : undefined;

      return {
        ...result,
        email,
        phones,
        socials,
      };
    });
  }

  if (results) {
    // add the new results to the state
    state.data = [...state.data, ...data];
    state.results += results;

    const limited = state.results >= limit;

    // handle limits
    if (limited) {
      state.data = state.data.slice(0, limit);
      state.results = limit;

      // update the state
      setState(prev => ({
        ...prev,
        page,
        data: state.data,
        results: state.results,
      }));

      // mark the request as completed
      onRequestComplete({ data: state.data, results: state.results });

      // complete the extraction
      complete({ results: state.results });
    } else {
      // update the state
      setState(prev => ({
        ...prev,
        page,
        data: state.data,
        results: state.results,
      }));

      // mark the request as completed
      onRequestComplete({ data, results });
    }
  }

  // complete if there are not results
  if (!results || results < take) {
    complete({ results: state.results });
  }

  // check if the signal aborted
  if (signal.aborted) {
    logger('extract request aborted');
    return;
  }

  if (next && !controller.signal.aborted) {
    await sleep(randomize(timeout));

    // check if the signal aborted
    if (signal.aborted) {
      logger('extract request aborted');
      return;
    }

    await extractGoogleMapsResults({
      ...options,
      query,
      page: page + 1,
      limit,
      state: { value: { ...state }, update: setState },
    });
  }
};

const constructGoogleMapsUrl = (baseUrl: string, params: IGoogleMapsUrlParams) => {
  const url = new URL(baseUrl);
  const searchParams = new URLSearchParams(url.search);

  // add basic parameters
  const basicParams = {
    tbm: 'map',
    authuser: '0',
    hl: params.lan,
    q: params.search,
    oq: params.search,
    tch: '1',
    ech: '3',
    psi: `${params.psi}.${Date.now()}.1`,
  };

  Object.entries(basicParams).forEach(([key, value]) => {
    searchParams.append(key, value);
  });

  // construct the pb parameter
  const pb = [
    '!4m9',
    `!1m3!1d${params.alt}!2d${params.long}!3d${params.lat}`,
    '!2m0',
    '!3m2',
    `!1i${params.width}`,
    `!2i${params.height}`,
    '!4f13.1',
    '!7i20',
    `!8i${params.offset}`,
    '!10b1',
    '!12m21',
    '!1m2!18b1!30b1',
    '!2m3!5m1!6e2!20e3',
    '!10b1!12b1!13b1!16b1',
    '!17m1!3e1',
    '!20m4!5e2!6b1!8b1!14b1',
    '!46m1!1b0',
    '!94b1',
    // @todo
    // sort by rating parameter
    // '!19m4!2m3!1i360!2i120!4i8!20m57!2m2!1i203!2i100!3m2!2i4!5b1!6m6!1m2!1i86!2i86!1m2!1i408!2i240!7m42!1m3!1e1!2b0!3e3!1m3!1e2!2b1!3e2!1m3!1e2!2b0!3e3!1m3!1e8!2b0!3e3!1m3!1e10!2b0!3e3!1m3!1e10!2b1!3e2!1m3!1e9!2b1!3e2!1m3!1e10!2b0!3e3!1m3!1e10!2b1!3e2!1m3!1e10!2b0!3e4!2b1!4b1!9b0!22m2!1seCbEZoqGGbmbseMPprqn-A8!7e81!24m103!1m28!13m9!2b1!3b1!4b1!6i1!8b1!9b1!14b1!20b1!25b1!18m17!3b1!4b1!5b1!6b1!13b1!14b1!17b1!21b1!22b1!25b1!27m1!1b0!28b0!31b0!32b0!33m1!1b0!5m5!2b1!5b1!6b1!7b1!10b1!10m1!8e3!11m1!3e1!14m1!3b1!17b1!20m2!1e3!1e6!24b1!25b1!26b1!29b1!30m1!2b1!36b1!39m3!2m2!2i1!3i1!43b1!52b1!54m1!1b1!55b1!56m1!1b1!65m5!3m4!1m3!1m2!1i224!2i298!71b1!72m19!1m5!1b1!2b1!3b1!5b1!7b1!4b1!8m10!1m6!4m1!1e1!4m1!1e3!4m1!1e4!3sother_user_reviews!6m1!1e1!9b1!89b1!103b1!113b1!114m3!1b1!2m1!1b1!117b1!122m1!1b1!125b0!126b1!127b1!26m4!2m3!1i80!2i92!4i8!30m28!1m6!1m2!1i0!2i0!2m2!1i530!2i768!1m6!1m2!1i974!2i0!2m2!1i1024!2i768!1m6!1m2!1i0!2i0!2m2!1i1024!2i20!1m6!1m2!1i0!2i748!2m2!1i1024!2i768!34m19!2b1!3b1!4b1!6b1!7b1!8m6!1b1!3b1!4b1!5b1!6b1!7b1!9b1!12b1!14b1!20b1!23b1!25b1!26b1!37m1!1e81!42b1!46m1!1e9!47m0!49m9!3b1!6m2!1b1!2b1!7m2!1e3!2b1!8b1!9b1!50m25!1m21!2m7!1u3!4sOpen+now!5e1!9s0ahUKEwjsyo2g6IKIAxW5TWwGHSbdCf8Q_KkBCJMKKBY!10m2!3m1!1e1!2m7!1u2!4sTop-rated!5e1!9s0ahUKEwjsyo2g6IKIAxW5TWwGHSbdCf8Q_KkBCJQKKBc!10m2!2m1!1e1!3m1!1u2!3m1!1u3!4BIAE!2e2!3m1!3b1!59BQ2dBd0Fn!61b1!67m3!7b1!10b1!14b0!69i703',
  ].join('');

  searchParams.append('pb', pb);

  url.search = searchParams.toString();

  return url.toString();
};

export const fetchGoogleMapsResults = async (query: {
  search: string;
  lat: number;
  long: number;
  alt: number;
  page: number;
  region: string;
  language: string;
  psi: string;
  take?: number;
  width: number;
  height: number;
}): Promise<IExtractGoogleMapsResponse> => {
  const { lat, long, alt, search, page = 1, take = 20, psi, language, width, height } = query || {};

  try {
    // const gl = region;
    const lan = language;
    const offset = page > 1 ? take * page : 0;

    const url = constructGoogleMapsUrl(GOOGLE_BASE_URL, {
      lan,
      alt,
      lat,
      long,
      offset,
      width,
      height,
      psi,
      search,
    });

    const getLabels = (data: any = []): string => {
      const labels: [string, string[]][] = [];

      for (const item of data) {
        if (!item) continue;

        const name = item[1];
        const values = (item[2] || []).map((value: [string, string]) => value[1]);

        labels.push([name, values]);
      }

      const result = labels.map(([name, values = []]) => `${name}: ${values.join(', ')}`).join('; ');

      return result;
    };

    const data = await fetch(url)
      .then(async response => {
        const text = await response.text();
        const json: any[] = JSON.parse(JSON.parse(text.replace(/\)\]\}'\\n/, '').replace(`/*""*/`, ''))?.['d'] || '[]');

        const results =
          json?.[0]?.[1]?.slice(1, take + 1)?.map((el: any) => {
            const data = el?.[14];

            const cid = data?.[10];
            const cid_int = BigInt(cid.split(':')[1]).toString();
            const maps_url = `https://www.google.com/maps?cid=${cid_int}`;
            const review_url = data?.[4]?.[3]?.[0];
            const place_id = data?.[78];
            const title = data?.[11];
            const address = data?.[39];
            const datafid = data?.[10];
            const rating = data?.[4]?.[7];
            const phone = data?.[178]?.[0]?.[3];
            const pricing = data?.[4]?.[2];
            const review_count = data?.[4]?.[8];
            const ward = data?.[183]?.[1]?.[0];
            const street = data?.[183]?.[1]?.[1];
            const city = data?.[183]?.[1]?.[3];
            const postal_code = data?.[183]?.[1]?.[4];
            const state = data?.[183]?.[1]?.[5];
            const country_code = data?.[183]?.[1]?.[6];

            const website = data?.[7]?.[0];
            const menu_link = data?.[38]?.[0];
            const booking_link = data?.[75]?.[0]?.[0]?.[2]?.[0]?.[1]?.[2]?.[0];
            const table_order_link = data?.[46]?.[0]?.[0];

            const latitude = data?.[9]?.[2];
            const longitude = data?.[9]?.[3];
            const photos = data?.[37]?.[1];
            const preview_link = data?.[42];
            const claimed = data?.[49]?.[1] ? false : true;
            const categories = ((data?.[13] as string[]) || []).join(', ');
            const main_category = data?.[13]?.[0];
            const latest_post = data?.[122]?.[1]?.[0]?.[1]?.[0]?.[0]?.[0];
            const opening_hours = (data?.[203]?.[0] || [])
              ?.map((data: any) => {
                const day = data?.[0];
                const time = data?.[3]?.[0]?.[0];
                return `${day}: ${time}`;
              })
              .join(', ');
            const services =
              data?.[100]?.[1]?.[0]?.[0] === 'service_options'
                ? data?.[100]?.[1]?.[0]?.[2]?.map((i: string[]) => i?.[1])?.join(', ')
                : undefined;

            const labels = getLabels(data?.[100]?.[1]);
            const municipality = data?.[183]?.[1]?.[0] as string;

            // @todo
            const located_in = data?.[134]?.[0]?.[0]?.[0]?.[0];

            const hotel_description = data?.[161]?.[1];
            const hotel_class = data?.[35]?.[6];
            const hotel_labels = data?.[35]?.[32]?.[0]?.[0]?.[1]?.[0]?.map((i: string[]) => i?.[2])?.join(', ');
            const hotel_time = hotel_class
              ? [data?.[196]?.[1]?.[0]?.[1]?.[0], data?.[196]?.[1]?.[0]?.[10]?.[0]]?.join(', ')
              : undefined;

            const output: IGoogleMapsExtractItem = {
              place_id,
              cid,
              maps_url,
              review_url,
              title,
              address,
              datafid,
              rating,
              phone,
              pricing,
              review_count,
              ward,
              street,
              city,
              postal_code,
              state,
              country_code,
              website,
              latitude,
              longitude,
              photos,
              preview_link,
              claimed,
              categories,
              main_category,
              latest_post,
              services,
              labels,
              opening_hours,
              menu_link,
              booking_link,
              table_order_link,
              municipality,
              hotel_description,
              hotel_class,
              hotel_time,
              hotel_labels,
              // @todo
              located_in,
            };

            return output;
          }) || [];

        return results as IGoogleMapsExtractItem[];
      })
      .catch((e: any) => {
        logger('google fetch results error', { e: e?.message });
        return [];
      });

    const results = data.length;

    const response: IExtractGoogleMapsResponse = {
      data,
      results,
      page,
      search,
    };

    return response;
  } catch (e) {
    console.log(e);

    const response: IExtractGoogleMapsResponse = {
      data: [],
      results: 0,
      page,
      search,
    };

    return response;
  }
};

// Parse search term, coordinates and zoom straight from a Google Maps URL.
// This works from the content script's isolated world (it can read
// `location.href`), so it does not depend on the injected page script.
const GOOGLE_MAPS_URL_PATTERN =
  /maps\/(?:(\w+)\/?)?(?:([^/@]+)\/?)?@(-?\d+\.\d+),(-?\d+\.\d+),(\d+(?:\.\d+)?)([zm])/;

const parseGoogleMapsUrl = (
  url: string,
): { page?: string; search?: string; lat?: number; long?: number; zoom?: number } => {
  const match = url.match(GOOGLE_MAPS_URL_PATTERN);
  if (!match) return {};

  const [, page, search, lat, long, value, unit] = match;

  // `15z` is a zoom level; `9054m` is a distance — clamp the latter to a sane zoom.
  const raw = parseFloat(value);
  const zoom = unit === 'z' ? Math.round(raw) : raw > 21 ? 14 : Math.round(raw);

  return {
    page,
    search: page === 'search' && search ? decodeURIComponent(search.replace(/\+/g, ' ')) : '',
    lat: parseFloat(lat),
    long: parseFloat(long),
    zoom,
  };
};

export const getGoogleMapsConfig = async () => {
  // Supplementary data captured by the injected page script (psi / language /
  // region), when available. Critical fields (search + coordinates) come from
  // the URL so extraction works even if the injected script is blocked by CSP.
  const stored = await getLocalStorageValue<{
    google_maps: {
      language?: string;
      psi?: string;
      region?: string;
      width?: number;
      height?: number;
    };
  }>('config')
    .then(data => data?.google_maps || {})
    .catch(() => ({} as Record<string, never>));

  const href = typeof location !== 'undefined' ? location.href : '';
  const parsed = parseGoogleMapsUrl(href);

  const lat = parsed.lat ?? 0;
  const long = parsed.long ?? 0;
  const zoom = parsed.zoom ?? 14;
  const search = (parsed.search || '').replace(/\//g, '');

  const language =
    stored.language ||
    (typeof document !== 'undefined' && document.documentElement.lang) ||
    (typeof navigator !== 'undefined' && navigator.language?.split('-')[0]) ||
    'en';

  const params: IExtractGoogleQueryParams = {
    search,
    lat,
    long,
    zoom,
    alt: altitude({ latitude: lat, zoom }),
    psi: stored.psi || '',
    language,
    region: stored.region || '',
    width: stored.width || (typeof window !== 'undefined' && window.innerWidth) || 1280,
    height: stored.height || (typeof window !== 'undefined' && window.innerHeight) || 800,
  };

  return params;
};

// yandex maps

interface IExtractYandexMapsState extends IExtractMapsBaseState<IYandexMapsExtractItem> {}

interface IExtractYandexMapsOptions extends IExtractMapsBaseOptions<IExtractYandexMapsState> {
  document: Document;
}

export const extractYandexMapsResults = async (options: IExtractYandexMapsOptions): Promise<void> => {
  const {
    timeout,
    next = true,
    controller,
    limit = 10000,
    state: { value: state, update: setState },
    complete,
    onRequestComplete,
    document,
    extractWebsites,
  } = options;
  const { signal } = controller;

  // check if the signal aborted
  if (signal.aborted) {
    logger('extract yandex aborted');
    return;
  }

  const url = document.location.href;
  const pattern = /^\/maps\/org\/.*$/;
  const isFavorite = url.includes('?bookmarks');
  const container = document.querySelector('.scroll__container') as Element;

  logger('yandex container', {
    isFavorite,
    container,
  });

  // stop if there's not container
  if (!container) {
    logger('extract yandex: no container element found');
    complete({ results: 0 });
    return;
  }

  const elements = Array.from(document.querySelectorAll('.search-list-view__list > li')) as HTMLElement[];
  const items: { url: string; element: HTMLElement }[] = [];

  // parse the items
  for (const element of elements) {
    const anchor = element.querySelector('a');
    const href = anchor ? anchor.getAttribute('href') : null;
    const matched = href && pattern.test(href);
    const url = matched ? [`https://${document.location.hostname}`, href].join(href.startsWith('/') ? '' : '/') : null;

    if (matched && url) {
      items.push({
        url,
        element,
      });
    }
  }

  const data: IYandexMapsExtractItem[] = state.data || [];
  let results = state.results || 0;

  // fetch the items
  for await (const { url, element } of items) {
    // check if the signal aborted
    if (signal.aborted) {
      return;
    }

    // fetch data by url
    const result = await fetchYandexMapsResultByUrl(url, { extractWebsites }).catch(() => null);

    // skip if there's no result
    if (!result) {
      logger('extract yandex: the result skipped', { url });
      continue;
    }

    results += 1;
    data.push(result);

    state.data = data;
    state.results = results;

    const limited = state.results >= limit;

    // handle limits
    if (limited) {
      state.data = state.data.slice(0, limit);
      state.results = limit;

      // update the state
      setState(prev => ({
        ...prev,
        data: state.data,
        results: state.results,
      }));

      // mark the request as completed
      onRequestComplete({ data: [result], results: 1 });

      // complete the extraction
      complete({ results: state.results });
    } else {
      // update the state
      setState(prev => ({
        ...prev,
        data: state.data,
        results: state.results,
      }));

      // mark the request as completed
      onRequestComplete({ data: [result], results: 1 });
    }

    // scroll down to the bottom of the container
    container.scrollTop = container.scrollHeight;

    // remove the element
    element.remove();

    await sleep(randomize(timeout));
  }

  // check if the signal aborted
  if (signal.aborted) {
    logger('extract yandex aborted');
    return;
  }

  // call the function again in recursion if there's the next page
  if (next && !controller.signal.aborted) {
    // console.log('next iteration ..');
    await sleep(randomize(timeout));

    if (signal.aborted) {
      logger('extract yandex aborted');
      return;
    }

    await extractYandexMapsResults({
      ...options,
      limit,
      state: {
        value: { ...state, data, results },
        update: setState,
      },
    });
  }
};

export const fetchYandexMapsResultByUrl = async (
  url: string,
  options?: { extractWebsites?: boolean },
): Promise<IYandexMapsExtractItem | null> => {
  const extractWebsites = options?.extractWebsites || false;
  const pattern = /<script type="application\/json" class="state-view">([^<]*)<\/script>/;

  // fetch the item
  const response = await fetch(url).then(async response => {
    const text = await response.text();
    const match = text.match(pattern);
    const content = match ? match?.[1] : null;
    const json = content ? JSON.parse(content) : {};

    const state = json?.stack?.[0]?.results?.items?.[0];
    if (!state) return null;

    const { title, address, coordinates } = state || {};
    const place_id = `${state.id}`;
    const [latitude = 0, longitude = 0] = coordinates || [];
    const rating = state?.ratingData?.ratingValue ? parseFloat(state?.ratingData?.ratingValue?.toFixed(2)) : undefined;
    const review_count = state?.ratingData?.ratingCount || undefined;
    const opening_hours = state?.workingTimeText ? (state?.workingTimeText as string).replace(';', ',') : undefined;
    const photos = typeof state?.photos?.count === 'number' ? state?.photos?.count : undefined;
    const categories = state?.categories ? state?.categories?.map(({ name }: any) => name)?.join(', ') : undefined;
    const labels = state?.features ? state?.features?.map(({ name }: any) => name)?.join(', ') : undefined;
    const street = state?.compositeAddress?.street ? (state?.compositeAddress?.street as string) : undefined;

    const maps_url = url?.split('?')?.[0];
    const website = state?.urls?.[0];

    const phone: string | undefined = state?.phones ? state?.phones?.[0]?.value : undefined;
    let email: string | undefined;
    let phones: string | undefined = undefined;
    let socials: string | undefined = state?.socialLinks
      ? ((state?.socialLinks as { href: string }[]) || [])?.map(({ href }) => href)?.join(', ')
      : undefined;

    // extract the website
    if (extractWebsites && website) {
      const result = await extractWebsiteResults({ urls: [website] }).then(({ data }) => data?.[0]);

      if (result) {
        email = email ? [email, result?.email].join(', ') : result?.email;
        phones = result?.phones ? result.phones.join(', ') : undefined;
        socials = result.socials ? [socials, result.socials].join(', ') : socials ? socials : undefined;
      }
    }

    const result: IYandexMapsExtractItem = {
      place_id,
      maps_url,
      title,
      address,
      latitude,
      longitude,
      rating,
      opening_hours,
      website,
      review_count,
      street,
      photos,
      labels,
      categories,
      email,
      phone,
      phones,
      socials,
    };

    return result;
  });

  return response;
};

// 2gis maps

interface IExtract2GisMapsState extends IExtractMapsBaseState<I2GisMapsExtractItem> {}

interface IExtract2GisMapsOptions extends IExtractMapsBaseOptions<IExtract2GisMapsState> {
  url: string;
}

export const extract2GisMapsResults = async (options: IExtract2GisMapsOptions): Promise<void> => {
  try {
    const {
      timeout,
      page = 1,
      next = true,
      limit = 10000,
      controller,
      extractWebsites,
      state: { value: state, update: setState },
      complete,
      onRequestComplete,
    } = options;
    const { signal } = controller;

    // check if the signal aborted
    if (signal.aborted) {
      logger('extract 2gis aborted');

      return;
    }

    // update the url according to the page
    const url = update2GisMapsPageParameter({ url: options.url, page });

    // parse the page state
    const query = await parse2GisMapsQueryParams({ url });
    const { elements = [] } = query || {};

    let total = state.total ? state.total : query?.total;
    let results = state.results || 0;
    const data = state.data || [];

    // logger('2gis extract', { search, page, pages, results });

    await sleep(randomize(500));

    // fetch and parse the content of the elements
    for await (const { url } of elements) {
      // check if the signal aborted
      if (signal.aborted) {
        setState(state => ({
          ...state,
          results,
          total,
          data,
        }));

        return;
      }

      const response = await extract2GisMapsResultByUrl(url).catch(e => {
        logger('2gis fetch error', { e: e?.message });
        return null;
      });

      if (!response) {
        logger('2gis extract: the result skipped', { url });
        continue;
      }

      // logger('2gis result', { ...response });

      // skip if there's no result
      if (!response) {
        logger('2gis fetch failed');
        total = total - 1;
        complete({ results });
        continue;
      }

      const { website } = (response as I2GisMapsExtractItem) || {};

      let email = response?.email;
      let phone = response?.phone;
      let phones: string | undefined = undefined;
      let socials: string | undefined = undefined;

      // extract the website
      if (extractWebsites && website) {
        const extractedResult = await extractWebsiteResults({ urls: [website] })
          .then(({ data }) => data?.[0])
          .catch((e: any) => {
            logger('2gis extract website error', { error: e?.message });
            return null;
          });

        if (extractedResult) {
          email = email ? email : extractedResult?.email ? extractedResult.email : undefined;
          phone = phone ? phone : extractedResult?.phones ? extractedResult?.phones?.[0] : undefined;
          phones = extractedResult?.phones ? extractedResult.phones.join(', ') : undefined;
          socials = extractedResult?.socials ? extractedResult.socials.join(', ') : undefined;
        }
      }

      const result = {
        ...response,
        phone,
        website,
        email,
        phones,
        socials,
      };

      results += 1;
      data.push(result);

      state.data = data;
      state.results = results;

      const limited = state.results >= limit;

      // handle limits
      if (limited) {
        state.data = state.data.slice(0, limit);
        state.results = limit;

        // update the state
        setState(prev => ({
          ...prev,
          page,
          data: state.data,
          results: state.results,
          total,
        }));

        // mark the request as completed
        onRequestComplete({ data: [result], results: 1 });

        // complete the extraction
        complete({ results: state.results });
      } else {
        // update the state
        setState(prev => ({
          ...prev,
          page,
          data: state.data,
          results: state.results,
          total,
        }));

        // mark the request as completed
        onRequestComplete({ data: [result], results: 1 });
      }

      // complete the parsing if the end reached
      if (results >= total) {
        complete({ results });
        return;
      }

      await sleep(randomize(timeout));
    }

    // check if the signal aborted
    if (signal.aborted) {
      logger('extract 2gis aborted');

      return;
    }

    if (next && !controller.signal.aborted) {
      await extract2GisMapsResults({
        ...options,
        page: page + 1,
        limit,
        state: {
          value: {
            ...state,
            results,
            total,
          },
          update: setState,
        },
      });
    } else {
      complete({ results });
    }
  } catch (e: any) {
    logger('2gis extract error', { error: e?.message });
  }
};

export const extract2GisMapsResultByUrl = async (url: string): Promise<I2GisMapsExtractItem | null> => {
  const response = await fetch(url);

  const text = response ? await response.text() : null;
  const state = text ? parse2GisMapsPageState(text) : null;

  if (!state) return null;

  const profiles = state?.data?.entity?.profile;
  const profileId = profiles ? Object.keys(profiles)?.[0] : null;
  const data = profileId ? profiles[profileId]?.data : null;

  const place_id = data?.id as string;
  const title = data?.name as string;
  const address = data?.address_name as string;
  const street = data?.address?.components?.[0]?.street;
  const rating = (data?.reviews?.general_rating as number) || 0;
  const review_count = (data?.reviews?.general_review_count as number) || 0;
  const latitude = (data?.point?.lat as number) || 0;
  const longitude = (data?.point?.lon as number) || 0;
  const contacts = [
    ...((data?.contact_groups?.[0]?.contacts as any[]) || []),
    ...((data?.contact_groups?.[1]?.contacts as any[]) || []),
  ] as { text: string; type: 'phone' | 'website' | 'email' }[];
  const website = contacts.find(el => el.type === 'website')?.text;
  const email = contacts.find(el => el.type === 'email')?.text;
  const phone = contacts.find(el => el.type === 'phone')?.text;
  const maps_url = url?.split('?')?.[0];
  const categories = (data?.rubrics as any[])?.map(({ name }) => name).join(', ');
  const photos = data?.external_content ? data?.external_content?.[0]?.count : 0;

  let opening_hours: string | undefined = undefined;
  const opening_hours_schedule = [];

  if (data?.schedule) {
    for (const [day, schedule] of Object.entries(data?.schedule)) {
      const hours = (schedule as any)?.working_hours?.[0] as { from: string; to: string };

      if (hours) {
        const { from, to } = hours;
        opening_hours_schedule.push(`${day}: ${from}-${to}`);
      }
    }

    opening_hours = opening_hours_schedule.length >= 1 ? opening_hours_schedule.join(', ') : undefined;
  }

  let labels: string | undefined = undefined;

  if (data?.attribute_groups) {
    const label_values = [];

    for (const group of data?.attribute_groups || []) {
      const attributes = group?.attributes || [];

      for (const attribute of attributes) {
        if (attribute?.name) {
          label_values.push(attribute?.name);
        }
      }
    }

    labels = label_values.join(', ');
  }

  const output: I2GisMapsExtractItem = {
    maps_url,
    place_id,
    title,
    address,
    street,
    latitude,
    longitude,
    rating,
    review_count,
    website,
    email,
    phone,
    categories,
    labels,
    opening_hours,
    photos,
  };

  return output;
};

export const parse2GisMapsQueryParams = async ({ url }: { url: string }) => {
  if (!url) return null;

  const text = await fetch(url)
    .then(async response => await response.text())
    .catch(() => null);
  if (!text) return {};

  const state = parse2GisMapsPageState(text);
  if (!state) return {};

  const origin = new URL(url).origin;
  const search = state?.data?.search?.profile?.[Object.keys(state?.data?.search?.profile || {})?.[0]]?.data;
  const { query, total, pages, hasPagesToLoad: next } = search || {};
  const region = url.split('https://')[1].split('/')[1];
  const page = parseInt(url.split('https://')[1].split('/')[5] || '1') || 1;
  const elements = (Object.keys(state?.data?.entity?.profile || {}) || []).map((id: string, key: number) => ({
    url: `${origin}/${region}/firm/${id}`,
    id,
    key,
  }));

  return {
    url,
    search: query,
    page,
    pages,
    total,
    next,
    region,
    elements,
  };
};

export const parse2GisMapsPageState = (text: string): any | null => {
  const pattern = /var\s+initialState\s*=\s*JSON\.parse\('{([\s\S]*?)\}'\)\s*;/;
  const match = text.match(pattern);

  if (!match) return null;

  let content = match[1];
  content = `{${content}}`;

  // replace escaped characters
  content = content.replace(/\\\"/g, '"').replace(/\\n/g, '\\n').replace(/\\r/g, '\\r').replace(/\\t/g, '\\t');

  try {
    const json = JSON.parse(content);
    return json;
  } catch (e) {
    console.error('error parsing json:', e);
    return null;
  }
};

export const update2GisMapsPageParameter = ({ url, page }: { url: string; page: number }) => {
  const pattern = /\/page\/\d+/;

  if (page <= 1) return url;

  // check if the URL already contains a /page/ segment
  if (pattern.test(url)) {
    // replace the existing /page/ segment with the new page number
    return url.replace(pattern, `/page/${page}`);
  } else {
    // add /page/{page} if it does not exist
    const [path, query] = url.split('?');
    const newPath = path.endsWith('/') ? path : path + '/';
    return `${newPath}page/${page}${query ? '?' + query : ''}`;
  }

  // return url;
};

export const extractWebsiteResults = async ({ urls = [] }: { urls: string[] }): Promise<IExtractWebsiteResult> => {
  try {
    // filter the urls
    urls = urls.filter(url => !!url && url.length >= 1);

    // extract the websites
    const { data, error } = await sendBackgroundEvent<IExtractWebsiteResult>({
      type: BACKGROUND_EVENTS.EXTRACT_WEBSITES,
      payload: { urls },
    });

    if (error || !data) {
      return {
        data: [],
        results: 0,
      };
    }

    return data;
  } catch {
    return {
      data: [],
      results: 0,
    };
  }
};
