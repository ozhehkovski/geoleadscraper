export const BACKGROUND_EVENTS = {
  CONTENT_SCRIPT_LOADED: 'CONTENT_SCRIPT_LOADED',
  GET_STORE: 'GET_STORE',
  LOGGER: 'LOGGER',
  PARSE_PAGE: 'PARSE_PAGE',
  OPEN_NEW_TAB: 'OPEN_NEW_TAB',
  OPEN_EXTENSION_PAGE: 'OPEN_EXTENSION_PAGE',
  FETCH_URL: 'FETCH_URL',
  EXTRACT_WEBSITES: 'EXTRACT_WEBSITES',
  CHECK_BACKEND: 'CHECK_BACKEND',
  UPDATE_GOOGLE_MAPS_CONFIG: 'UPDATE_GOOGLE_MAPS_CONFIG',
  // Reviews responses forwarded by the injected page script (never sent to the background).
  GOOGLE_MAPS_REVIEWS_RESPONSE: 'GOOGLE_MAPS_REVIEWS_RESPONSE',
  // MCP / auto-collection bridge
  CONTENT_READY: 'CONTENT_READY',
  SUBMIT_JOB_RESULTS: 'SUBMIT_JOB_RESULTS',
  JOB_FAILED: 'JOB_FAILED',
};

export const DATA_EXPORT_FORMATS = {
  CSV: 'csv',
  XLSX: 'xlsx',
  JSON: 'json',
};

export const LOCAL_STORAGE_KEYS = {
  TOKEN: 'token',
  STORE: 'store',
};

export const DATA_PARSING_MODES = {
  PAGE: 'page',
  INTERVAL: 'interval',
};

export const DATA_PLATFORMS = {
  GOOGLE_MAPS: 'google_maps',
  YANDEX_MAPS: 'yandex_maps',
  GIS: 'gis',
};

export const DATA_PLATFORM_DOMAINS = {
  GOOGLE_MAPS: ['google.com'],
  YANDEX_MAPS: ['yandex.com', 'yandex.ru', 'yandex.by', 'yandex.kz', 'yandex.ua', 'yandex.uz', 'yandex.eu'],
  GIS: ['2gis.com', '2gis.ru'],
};

export const DATA_EXPORT_FIELDS = {
  PLACE_ID: 'place_id',
  TITLE: 'title',
  ADDRESS: 'address',
  MAPS_URL: 'maps_url',
  REVIEW_URL: 'review_url',
  STREET: 'street',
  CATEGORIES: 'categories',
  SERVICES: 'services',
  LABELS: 'labels',
  REVIEW_COUNT: 'review_count',
  RATING: 'rating',
  LATITUDE: 'latitude',
  LONGITUDE: 'longitude',
  WEBSITE: 'website',
  OPENING_HOURS: 'opening_hours',
  CLAIMED: 'claimed',
  LATEST_POST: 'latest_post',
  PRICING: 'pricing',
  EMAIL: 'email',
  PHOTOS: 'photos',
  PHONE: 'phone',
  PHONES: 'phones',
  SOCIALS: 'socials',
  MUNICIPALITY: 'municipality',
  MENU_LINK: 'menu_link',
  BOOKING_LINK: 'booking_link',
  TABLE_ORDER_LINK: 'table_order_link',
  HOTEL_DESCRIPTION: 'hotel_description',
  HOTEL_CLASS: 'hotel_class',
  HOTEL_TIME: 'hotel_time',
  HOTEL_LABELS: 'hotel_labels',

  // @todo
  // FEATURED_IMAGE: 'featured_image',
};

export const DATA_EXPORT_FIELDS_SELECT = [
  { value: DATA_EXPORT_FIELDS.PLACE_ID, label: 'Place Id' },
  { value: DATA_EXPORT_FIELDS.TITLE, label: 'Title' },
  { value: DATA_EXPORT_FIELDS.ADDRESS, label: 'Address' },
  { value: DATA_EXPORT_FIELDS.MAPS_URL, label: 'Maps Url' },
  { value: DATA_EXPORT_FIELDS.REVIEW_URL, label: 'Review Url' },
  { value: DATA_EXPORT_FIELDS.STREET, label: 'Street' },
  { value: DATA_EXPORT_FIELDS.CATEGORIES, label: 'Categories' },
  { value: DATA_EXPORT_FIELDS.SERVICES, label: 'Services' },
  { value: DATA_EXPORT_FIELDS.LABELS, label: 'Labels' },
  { value: DATA_EXPORT_FIELDS.MENU_LINK, label: 'Menu link' },
  { value: DATA_EXPORT_FIELDS.BOOKING_LINK, label: 'Booking link' },
  { value: DATA_EXPORT_FIELDS.TABLE_ORDER_LINK, label: 'Table order link' },
  { value: DATA_EXPORT_FIELDS.REVIEW_COUNT, label: 'Review Count' },
  { value: DATA_EXPORT_FIELDS.RATING, label: 'Rating' },
  { value: DATA_EXPORT_FIELDS.LATITUDE, label: 'Latitude' },
  { value: DATA_EXPORT_FIELDS.LONGITUDE, label: 'Longitude' },
  { value: DATA_EXPORT_FIELDS.CLAIMED, label: 'Claimed' },
  { value: DATA_EXPORT_FIELDS.LATEST_POST, label: 'Latest post' },
  { value: DATA_EXPORT_FIELDS.OPENING_HOURS, label: 'Opening Hours' },
  { value: DATA_EXPORT_FIELDS.PRICING, label: 'Pricing' },
  { value: DATA_EXPORT_FIELDS.PHOTOS, label: 'Photos' },
  { value: DATA_EXPORT_FIELDS.EMAIL, label: 'Email' },
  { value: DATA_EXPORT_FIELDS.PHONE, label: 'Phone' },
  { value: DATA_EXPORT_FIELDS.PHONES, label: 'Phones' },
  { value: DATA_EXPORT_FIELDS.WEBSITE, label: 'Website' },
  { value: DATA_EXPORT_FIELDS.SOCIALS, label: 'Social Medias' },
  { value: DATA_EXPORT_FIELDS.MUNICIPALITY, label: 'Municipality' },
  { value: DATA_EXPORT_FIELDS.HOTEL_CLASS, label: 'Hotel Class' },
  { value: DATA_EXPORT_FIELDS.HOTEL_DESCRIPTION, label: 'Hotel Description' },
  { value: DATA_EXPORT_FIELDS.HOTEL_TIME, label: 'Hotel Time' },
  { value: DATA_EXPORT_FIELDS.HOTEL_LABELS, label: 'Hotel Labels' },
];

export const DATA_EXPORT_FORMATS_SELECT = [
  { value: DATA_EXPORT_FORMATS.CSV, label: 'CSV' },
  { value: DATA_EXPORT_FORMATS.JSON, label: 'JSON' },
  { value: DATA_EXPORT_FORMATS.XLSX, label: 'XLSX (Excel)' },
];

export const DATA_EXPORT_REQUEST_INTERVAL_SELECT = [
  { value: '5', label: '5s' },
  { value: '6', label: '6s' },
  { value: '7', label: '7s' },
  { value: '8', label: '8s' },
  { value: '9', label: '9s' },
  { value: '10', label: '10s' },
];

export const DATA_EXPORT_BASIC_FIELDS = [
  DATA_EXPORT_FIELDS.PLACE_ID,
  DATA_EXPORT_FIELDS.TITLE,
  DATA_EXPORT_FIELDS.ADDRESS,
  DATA_EXPORT_FIELDS.MAPS_URL,
  DATA_EXPORT_FIELDS.REVIEW_URL,
  DATA_EXPORT_FIELDS.STREET,
  DATA_EXPORT_FIELDS.CATEGORIES,
  DATA_EXPORT_FIELDS.SERVICES,
  DATA_EXPORT_FIELDS.LABELS,
  DATA_EXPORT_FIELDS.PHONE,
  DATA_EXPORT_FIELDS.REVIEW_COUNT,
  DATA_EXPORT_FIELDS.RATING,
  DATA_EXPORT_FIELDS.LATITUDE,
  DATA_EXPORT_FIELDS.LONGITUDE,
  DATA_EXPORT_FIELDS.WEBSITE,
  DATA_EXPORT_FIELDS.EMAIL,
  DATA_EXPORT_FIELDS.PHONES,
  DATA_EXPORT_FIELDS.SOCIALS,
  DATA_EXPORT_FIELDS.CLAIMED,
  DATA_EXPORT_FIELDS.OPENING_HOURS,
  DATA_EXPORT_FIELDS.MENU_LINK,
  DATA_EXPORT_FIELDS.BOOKING_LINK,
  DATA_EXPORT_FIELDS.TABLE_ORDER_LINK,
  DATA_EXPORT_FIELDS.LATEST_POST,
  DATA_EXPORT_FIELDS.MUNICIPALITY,

  // DATA_EXPORT_FIELDS.FEATURED_IMAGE,
];

export const DATA_EXPORT_PREMIUM_FIELDS = [
  DATA_EXPORT_FIELDS.PRICING,
  DATA_EXPORT_FIELDS.PHOTOS,
  DATA_EXPORT_FIELDS.HOTEL_CLASS,
  DATA_EXPORT_FIELDS.HOTEL_DESCRIPTION,
  DATA_EXPORT_FIELDS.HOTEL_TIME,
  DATA_EXPORT_FIELDS.HOTEL_LABELS,
];
