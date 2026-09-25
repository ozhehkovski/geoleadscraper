import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import {
  getGoogleMapsPlaceId,
  getGoogleMapsPlaceName,
  getReviewsRequestPlaceId,
  isGoogleMapsPlaceUrl,
  mergeGoogleMapsReviews,
  parseGoogleMapsReview,
  parseGoogleMapsReviewElement,
  parseGoogleMapsReviewsFromDom,
  parseReviewsBatchResponse,
  type IGoogleMapsReview,
} from './reviews';

const PLACE_ID = '0x47192d004eb606fd:0xdcadaf8ae2686d8c';
const PLACE_URL =
  'https://www.google.com/maps/place/Kawiarnia+Babiniec/@52.15,21.05,15z/data=!4m6!3m5!1s0x47192d004eb606fd:0xdcadaf8ae2686d8c!8m2!3d52.15!4d21.05?hl=en';

// Synthetic review entry mirroring the positional layout Google Maps returns.
const buildRawReview = (id: string, overrides: { withOwner?: boolean; withPhotos?: boolean } = {}) => {
  const author = [
    'Jane Doe',
    'https://lh3.googleusercontent.com/a/avatar',
    ['https://www.google.com/maps/contrib/123'],
    '123',
    null,
    null,
    null,
    null,
    null,
    null,
    ['Local Guide · 12 reviews'],
  ];

  const body: unknown[] = [];
  body[0] = [4];
  if (overrides.withPhotos) {
    body[2] = [
      ['p1', ['p1', 10, 12, null, null, null, ['https://lh3.googleusercontent.com/photo-1']]],
      ['p2', ['p2', 10, 12, null, null, null, ['https://lh3.googleusercontent.com/photo-2']]],
    ];
  }
  body[6] = [
    [['GUIDED_DINING_FOOD_ASPECT'], 'Food', null, null, null, 'Food', null, 'x', null, null, null, [5]],
    [
      ['GUIDED_DINING_PRICE_RANGE'],
      'How much did you spend per person?',
      [[[['E:PLN_20_TO_40'], 'zł 20–40', 2]], 1],
      null,
      null,
      'Price per person',
    ],
  ];
  body[14] = ['pl', 'en', 'Polish', 'English', false];
  body[15] = [
    ['Świetna kawa', null, [0, 12]],
    ['Great coffee', null, [0, 12]],
  ];

  const owner = overrides.withOwner
    ? [
        null,
        1781156427000000,
        1781156505000000,
        '3 months ago',
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        ['pl'],
        [['Dziękujemy!', null, [0, 11]]],
      ]
    : null;

  return [
    id,
    [
      '0x0:0xdcadaf8ae2686d8c',
      null,
      1778165501125818,
      1778165829485886,
      [null, null, null, null, null, author],
      null,
      '4 months ago',
    ],
    body,
    owner,
    [null, null, 512, ['https://www.google.com/maps/reviews/data=abc']],
    'tracking',
  ];
};

const buildResponse = (reviews: unknown[], nextToken: string | null) => {
  const payload = JSON.stringify([null, nextToken, reviews.map(review => [review])]);
  const chunk = JSON.stringify([
    ['wrb.fr', 'qv9Egd', payload, null, null, null, 'generic'],
    ['di', 42],
  ]);
  return `)]}'\n\n${chunk.length}\n${chunk}\n25\n[["e",4,null,null,233]]\n`;
};

describe('place url helpers', () => {
  it('extracts the feature id and name from a place url', () => {
    expect(getGoogleMapsPlaceId(PLACE_URL)).toBe(PLACE_ID);
    expect(getGoogleMapsPlaceName(PLACE_URL)).toBe('Kawiarnia Babiniec');
    expect(isGoogleMapsPlaceUrl(PLACE_URL)).toBe(true);
  });

  it('returns empty values for non-place urls', () => {
    const url = 'https://www.google.com/maps/search/cafe/@52.14,21.06,4539m';
    expect(getGoogleMapsPlaceId(url)).toBeNull();
    expect(getGoogleMapsPlaceName(url)).toBe('');
    expect(isGoogleMapsPlaceUrl(url)).toBe(false);
  });
});

describe('getReviewsRequestPlaceId', () => {
  const encode = (rpc: string) => {
    const inner = JSON.stringify([
      [[PLACE_ID], null, null, null, null, [null, null, null, [[1], [3]]]],
      [10, ''],
    ]);
    return new URLSearchParams({ 'f.req': JSON.stringify([[[rpc, inner, null, 'generic']]]), at: 'token' }).toString();
  };

  it('reads the place id from a reviews request body', () => {
    expect(getReviewsRequestPlaceId(encode('qv9Egd'))).toBe(PLACE_ID);
  });

  it('ignores other rpcs and malformed bodies', () => {
    expect(getReviewsRequestPlaceId(encode('Qt4aBe'))).toBeNull();
    expect(getReviewsRequestPlaceId('f.req=not-json')).toBeNull();
    expect(getReviewsRequestPlaceId('')).toBeNull();
  });
});

describe('parseReviewsBatchResponse', () => {
  it('returns the reviews and the next page token', () => {
    const text = buildResponse([buildRawReview('r1'), buildRawReview('r2')], 'NEXT');
    const pages = parseReviewsBatchResponse(text, PLACE_ID);

    expect(pages).toHaveLength(1);
    expect(pages[0].placeId).toBe(PLACE_ID);
    expect(pages[0].nextToken).toBe('NEXT');
    expect(pages[0].reviews).toHaveLength(2);
  });

  it('reports the last page with a null token', () => {
    const [page] = parseReviewsBatchResponse(buildResponse([buildRawReview('r1')], null));
    expect(page.nextToken).toBeNull();
  });

  it('ignores other rpc envelopes and garbage', () => {
    const other = JSON.stringify([['wrb.fr', 'Qt4aBe', '[1,2]', null, null, null, 'generic']]);
    expect(parseReviewsBatchResponse(`)]}'\n\n10\n${other}\n[[broken`)).toEqual([]);
  });
});

describe('parseGoogleMapsReview', () => {
  it('maps every field of a full review', () => {
    const review = parseGoogleMapsReview(buildRawReview('r1', { withOwner: true, withPhotos: true }), {
      placeId: PLACE_ID,
      placeName: 'Kawiarnia Babiniec',
    });

    expect(review).toEqual({
      review_id: 'r1',
      place_id: PLACE_ID,
      place_name: 'Kawiarnia Babiniec',
      author_name: 'Jane Doe',
      author_id: '123',
      author_url: 'https://www.google.com/maps/contrib/123',
      author_photo: 'https://lh3.googleusercontent.com/a/avatar',
      author_info: 'Local Guide · 12 reviews',
      rating: 4,
      text: 'Świetna kawa',
      text_translated: 'Great coffee',
      language: 'pl',
      published_at: new Date(1778165501125).toISOString(),
      updated_at: new Date(1778165829485).toISOString(),
      relative_date: '4 months ago',
      details: 'Food: 5; Price per person: zł 20–40',
      photos: 'https://lh3.googleusercontent.com/photo-1, https://lh3.googleusercontent.com/photo-2',
      photos_count: 2,
      owner_response: 'Dziękujemy!',
      owner_response_at: new Date(1781156427000).toISOString(),
      owner_response_relative_date: '3 months ago',
      review_url: 'https://www.google.com/maps/reviews/data=abc',
    });
  });

  it('leaves optional fields empty when absent', () => {
    const review = parseGoogleMapsReview(buildRawReview('r2'));

    expect(review?.owner_response).toBe('');
    expect(review?.owner_response_at).toBe('');
    expect(review?.photos).toBe('');
    expect(review?.photos_count).toBe(0);
  });

  it('rejects entries without an id', () => {
    expect(parseGoogleMapsReview(null)).toBeNull();
    expect(parseGoogleMapsReview([])).toBeNull();
  });
});

describe('mergeGoogleMapsReviews', () => {
  it('appends new reviews and drops duplicates', () => {
    const a = parseGoogleMapsReview(buildRawReview('a')) as IGoogleMapsReview;
    const b = parseGoogleMapsReview(buildRawReview('b')) as IGoogleMapsReview;

    expect(mergeGoogleMapsReviews([a], [a, b]).map(review => review.review_id)).toEqual(['a', 'b']);
  });
});

// Markup mirroring the rendered Maps reviews list (class names and all).
const buildReviewMarkup = (id: string, { owner = false, photos = 0, clamped = false } = {}) => `
  <div data-review-id="${id}" class="jftiEf">
    <div class="jJc9Ad">
      <button class="WEBjve" data-review-id="${id}"><img class="NBa7we" src="https://lh3.googleusercontent.com/a/${id}"></button>
      <div class="GHT2ce">
        <button data-href="https://www.google.com/maps/contrib/117700000000000000001/reviews"><div class="d4r55">Jan Kowalski</div></button>
        <div class="RfnDt">Local Guide · 12 reviews · 3 photos</div>
      </div>
      <div class="GHT2ce">
        <div class="DU9Pgb">
          <span class="kvMYJc" role="img" aria-label="5 stars"></span>
          <span class="rsqaWe">5 months ago</span>
        </div>
        <div>
          <div class="MyEned" lang="pl"><span class="wiI7pd">Świetna obsługa</span></div>
          ${clamped ? '<button class="w8nwRe">More</button>' : ''}
        </div>
        ${Array.from({ length: photos })
          .map(
            (_, i) =>
              `<button class="Tya61d" style="background-image: url(&quot;https://lh3.googleusercontent.com/photo-${i}&quot;);"></button>`,
          )
          .join('')}
        ${
          owner
            ? `<div class="CDe7pd">
                 <span class="fontTitleSmall">Response from the owner</span>
                 <span class="DZSIDd">4 months ago</span>
                 <div class="wiI7pd">Dziękujemy!</div>
               </div>`
            : ''
        }
      </div>
    </div>
  </div>`;

const domRoot = (html: string) => new JSDOM(`<div id="list">${html}</div>`).window.document.getElementById('list')!;

describe('parseGoogleMapsReviewElement', () => {
  it('reads a rendered review', () => {
    const root = domRoot(buildReviewMarkup('dom-1', { owner: true, photos: 2 }));
    const review = parseGoogleMapsReviewElement(root.querySelector('[data-review-id]')!, {
      placeId: PLACE_ID,
      placeName: 'Meble.pl',
    });

    expect(review).toMatchObject({
      review_id: 'dom-1',
      place_id: PLACE_ID,
      place_name: 'Meble.pl',
      author_name: 'Jan Kowalski',
      author_id: '117700000000000000001',
      author_url: 'https://www.google.com/maps/contrib/117700000000000000001/reviews',
      author_photo: 'https://lh3.googleusercontent.com/a/dom-1',
      author_info: 'Local Guide · 12 reviews · 3 photos',
      rating: 5,
      text: 'Świetna obsługa',
      language: 'pl',
      relative_date: '5 months ago',
      photos: 'https://lh3.googleusercontent.com/photo-0, https://lh3.googleusercontent.com/photo-1',
      photos_count: 2,
      owner_response: 'Dziękujemy!',
      owner_response_relative_date: '4 months ago',
    });
  });

  it('parses a localized rating label', () => {
    const html = buildReviewMarkup('dom-2').replace('aria-label="5 stars"', 'aria-label="4 gwiazdki"');
    const review = parseGoogleMapsReviewElement(domRoot(html).querySelector('[data-review-id]')!);

    expect(review?.rating).toBe(4);
  });

  it('leaves owner response empty when there is none', () => {
    const review = parseGoogleMapsReviewElement(domRoot(buildReviewMarkup('dom-3')).querySelector('[data-review-id]')!);

    expect(review?.owner_response).toBe('');
    expect(review?.photos_count).toBe(0);
  });
});

describe('parseGoogleMapsReviewElement, clamped review', () => {
  it('skips the text while the "More" button is still there', () => {
    const root = domRoot(buildReviewMarkup('dom-4', { clamped: true }));
    const review = parseGoogleMapsReviewElement(root.querySelector('[data-review-id]')!);

    // Reading it now would store "… More"; the full text arrives later.
    expect(review?.text).toBe('');
    expect(review?.review_id).toBe('dom-4');
  });
});

describe('parseGoogleMapsReviewsFromDom', () => {
  it('returns one record per review container, not per data-review-id element', () => {
    const root = domRoot(buildReviewMarkup('dom-1') + buildReviewMarkup('dom-2'));

    expect(parseGoogleMapsReviewsFromDom(root).map(review => review.review_id)).toEqual(['dom-1', 'dom-2']);
  });
});

describe('mergeGoogleMapsReviews with both sources', () => {
  it('fills empty fields of a DOM review from the network record', () => {
    const fromDom = parseGoogleMapsReviewElement(
      domRoot(buildReviewMarkup('shared-1')).querySelector('[data-review-id]')!,
    ) as IGoogleMapsReview;
    const fromNetwork = {
      ...(parseGoogleMapsReview(buildRawReview('x', { withOwner: true })) as IGoogleMapsReview),
      review_id: 'shared-1',
    };

    const [merged] = mergeGoogleMapsReviews([fromDom], [fromNetwork]);

    expect(merged.published_at).toBe(fromNetwork.published_at);
    expect(merged.text_translated).toBe('Great coffee');
    expect(merged.owner_response).toBe('Dziękujemy!');
    // The DOM record wins where it already had a value.
    expect(merged.author_name).toBe('Jan Kowalski');
    expect(merged.text).toBe('Świetna obsługa');
  });
});
