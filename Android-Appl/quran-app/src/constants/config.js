// GitHub Pages base URL for all data shards
export const DATA_BASE_URL = 'https://asadikram2255.github.io/Quran-Connect/';

// Manifest path
export const MANIFEST_URL = `${DATA_BASE_URL}data/meta/manifest.json`;

// Cache version — bump this to force re-download on update
export const CACHE_VERSION = '1';

// Font sizes (defaults)
export const DEFAULT_ARABIC_SIZE = 24;
export const DEFAULT_ENGLISH_SIZE = 14;
export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 34;

// Search
export const TRIGRAM_MIN_LEN = 3;
export const MAX_RESULTS = 50;

// Notification
export const NOTIF_CHANNEL_ID = 'daily-ayah';
export const NOTIF_HOUR = 8;   // 8 AM daily
export const NOTIF_MINUTE = 0;

// Async storage keys
export const STORAGE_KEYS = {
  BOOKMARKS: '@qbm_bookmarks',
  ARABIC_FONT: '@qbm_arabic_font',
  ENGLISH_FONT: '@qbm_english_font',
  CACHE_VERSION: '@qbm_cache_version',
  NOTIF_ENABLED: '@qbm_notif_enabled',
  ONBOARDING_DONE: '@qbm_onboarding_done',
};
