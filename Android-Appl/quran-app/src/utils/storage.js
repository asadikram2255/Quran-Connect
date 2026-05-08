import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/config';

// ─── Bookmarks ────────────────────────────────────────────────────────────────

/**
 * Load all bookmarks → Set of ayah_id strings
 */
export async function loadBookmarks() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.BOOKMARKS);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

/**
 * Save bookmarks Set to storage
 */
export async function saveBookmarks(bookmarkSet) {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEYS.BOOKMARKS,
      JSON.stringify([...bookmarkSet])
    );
  } catch {}
}

/**
 * Toggle bookmark for an ayah_id, return updated Set
 */
export async function toggleBookmark(ayahId) {
  const current = await loadBookmarks();
  if (current.has(ayahId)) {
    current.delete(ayahId);
  } else {
    current.add(ayahId);
  }
  await saveBookmarks(current);
  return current;
}

export async function isBookmarked(ayahId) {
  const current = await loadBookmarks();
  return current.has(ayahId);
}

// ─── Font sizes ───────────────────────────────────────────────────────────────

export async function loadFontSizes(defaults) {
  try {
    const [arRaw, enRaw] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.ARABIC_FONT),
      AsyncStorage.getItem(STORAGE_KEYS.ENGLISH_FONT),
    ]);
    return {
      arabic: arRaw ? Number(arRaw) : defaults.arabic,
      english: enRaw ? Number(enRaw) : defaults.english,
    };
  } catch {
    return defaults;
  }
}

export async function saveFontSize(key, value) {
  try {
    await AsyncStorage.setItem(key, String(value));
  } catch {}
}

// ─── Notification preference ──────────────────────────────────────────────────

export async function loadNotifEnabled() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.NOTIF_ENABLED);
    return raw === null ? true : raw === 'true'; // default enabled
  } catch {
    return true;
  }
}

export async function saveNotifEnabled(enabled) {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.NOTIF_ENABLED, String(enabled));
  } catch {}
}

// ─── Generic get/set ──────────────────────────────────────────────────────────

export async function getItem(key, fallback = null) {
  try {
    const v = await AsyncStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

export async function setItem(key, value) {
  try {
    await AsyncStorage.setItem(key, String(value));
  } catch {}
}
