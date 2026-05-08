/**
 * dataManager.js
 * Handles fetching and caching of all Quran data.
 * Strategy:
 *   - Manifest + search indexes: fetched from GitHub Pages and cached in FileSystem
 *   - Quran/Hadith shards: fetched on demand and cached in FileSystem
 *   - Cache invalidation: CACHE_VERSION string in AsyncStorage
 */

import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DATA_BASE_URL, CACHE_VERSION, STORAGE_KEYS } from '../constants/config';

const CACHE_DIR = FileSystem.cacheDirectory + 'qbm/';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  }
}

function urlToFilename(url) {
  // Convert URL path to a safe filename
  return url.replace(DATA_BASE_URL, '').replace(/\//g, '_').replace(/\?.*$/, '');
}

async function isCacheValid() {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.CACHE_VERSION);
    return stored === CACHE_VERSION;
  } catch {
    return false;
  }
}

async function markCacheValid() {
  await AsyncStorage.setItem(STORAGE_KEYS.CACHE_VERSION, CACHE_VERSION);
}

/**
 * Fetch JSON from URL, optionally caching to FileSystem.
 * If cached file exists and cache is valid, returns cached version.
 */
export async function fetchJson(url, { useCache = true } = {}) {
  await ensureDir();
  const filename = urlToFilename(url);
  const filePath = CACHE_DIR + filename;

  if (useCache) {
    const valid = await isCacheValid();
    if (valid) {
      const info = await FileSystem.getInfoAsync(filePath);
      if (info.exists) {
        const content = await FileSystem.readAsStringAsync(filePath);
        return JSON.parse(content);
      }
    } else {
      // Wipe old cache if version changed
      try { await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true }); } catch {}
      await ensureDir();
    }
  }

  // Download
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const text = await res.text();
  const data = JSON.parse(text);

  if (useCache) {
    await FileSystem.writeAsStringAsync(filePath, text);
  }
  return data;
}

// ─── Manifest & indexes ───────────────────────────────────────────────────────

let _manifest = null;
let _shardMapQuran = null;
let _shardMapPairs = null;
let _shardMapHadith = null;
let _enTokenIndex = null;
let _enTrigramIndex = null;
let _arTokenIndex = null;
let _rootToAyahIds = null;

export async function loadManifest() {
  if (_manifest) return _manifest;
  _manifest = await fetchJson(`${DATA_BASE_URL}data/meta/manifest.json`);
  await markCacheValid();
  return _manifest;
}

export async function loadShardMaps() {
  const manifest = await loadManifest();
  const [smq, smp, smh] = await Promise.all([
    fetchJson(`${DATA_BASE_URL}${manifest.paths.shard_map_quran}`),
    fetchJson(`${DATA_BASE_URL}${manifest.paths.shard_map_pairs}`),
    fetchJson(`${DATA_BASE_URL}${manifest.paths.shard_map_hadith}`),
  ]);
  _shardMapQuran = smq;
  _shardMapPairs = smp;
  _shardMapHadith = smh;
  return { smq, smp, smh };
}

export async function loadSearchIndexes() {
  const manifest = await loadManifest();
  const [enTok, enTrig, arTok, rootIdx] = await Promise.all([
    fetchJson(`${DATA_BASE_URL}${manifest.paths.english_token_to_ayahids}`),
    fetchJson(`${DATA_BASE_URL}${manifest.paths.english_trigram_to_tokens}`),
    fetchJson(`${DATA_BASE_URL}${manifest.paths.arabic_token_to_ayahids}`),
    fetchJson(`${DATA_BASE_URL}${manifest.paths.root_to_ayahids}`),
  ]);
  _enTokenIndex = enTok;
  _enTrigramIndex = enTrig;
  _arTokenIndex = arTok;
  _rootToAyahIds = rootIdx;
  return { enTok, enTrig, arTok, rootIdx };
}

// ─── Shard loading ────────────────────────────────────────────────────────────

function getShardKey(smq, ayahId) {
  // shard_map_quran: { shardKey: [ayahId, ...] }
  for (const [key, ids] of Object.entries(smq)) {
    if (ids.includes(ayahId)) return key;
  }
  return null;
}

const _quranShardCache = {};
const _pairsShardCache = {};
const _hadithShardCache = {};

async function loadShard(baseUrl, shardMap, shardKey, localCache) {
  if (localCache[shardKey]) return localCache[shardKey];
  const shardPath = shardMap[shardKey];
  const data = await fetchJson(`${baseUrl}${shardPath}`);
  localCache[shardKey] = data;
  return data;
}

/**
 * Load a quran shard by shard key (e.g. "quran_shard_000")
 */
export async function loadQuranShard(shardKey) {
  if (!_shardMapQuran) await loadShardMaps();
  return loadShard(DATA_BASE_URL, _shardMapQuran, shardKey, _quranShardCache);
}

/**
 * Load a pairs shard by shard key
 */
export async function loadPairsShard(shardKey) {
  if (!_shardMapPairs) await loadShardMaps();
  return loadShard(DATA_BASE_URL, _shardMapPairs, shardKey, _pairsShardCache);
}

/**
 * Load a hadith shard by shard key
 */
export async function loadHadithShard(shardKey) {
  if (!_shardMapHadith) await loadShardMaps();
  return loadShard(DATA_BASE_URL, _shardMapHadith, shardKey, _hadithShardCache);
}

// ─── Ayah lookup ─────────────────────────────────────────────────────────────

/**
 * Get full ayah data (arabic, english, roots, tokens) for a given ayah_id
 */
export async function getAyah(ayahId) {
  if (!_shardMapQuran) await loadShardMaps();
  // Find which shard this ayah lives in
  for (const [key, ids] of Object.entries(_shardMapQuran)) {
    if (ids.includes(ayahId)) {
      const shard = await loadQuranShard(key);
      return shard[ayahId] || null;
    }
  }
  return null;
}

/**
 * Get pairs data for a given ayah_id
 */
export async function getPairs(ayahId) {
  if (!_shardMapPairs) await loadShardMaps();
  for (const [key, ids] of Object.entries(_shardMapPairs)) {
    if (ids.includes(ayahId)) {
      const shard = await loadPairsShard(key);
      return shard[ayahId] || { quran_pairs: [], hadith_pairs: [] };
    }
  }
  return { quran_pairs: [], hadith_pairs: [] };
}

/**
 * Get a hadith by its ID
 */
export async function getHadith(hadithId) {
  if (!_shardMapHadith) await loadShardMaps();
  for (const [key, ids] of Object.entries(_shardMapHadith)) {
    if (ids.includes(hadithId)) {
      const shard = await loadHadithShard(key);
      return shard[hadithId] || null;
    }
  }
  return null;
}

// ─── Batch ayah loading ───────────────────────────────────────────────────────

/**
 * Load multiple ayahs efficiently (groups by shard)
 */
export async function getAyahsBatch(ayahIds) {
  if (!_shardMapQuran) await loadShardMaps();

  // Group by shard
  const shardGroups = {};
  for (const id of ayahIds) {
    for (const [key, ids] of Object.entries(_shardMapQuran)) {
      if (ids.includes(id)) {
        if (!shardGroups[key]) shardGroups[key] = [];
        shardGroups[key].push(id);
        break;
      }
    }
  }

  // Load shards in parallel
  const results = {};
  await Promise.all(
    Object.entries(shardGroups).map(async ([key, ids]) => {
      const shard = await loadQuranShard(key);
      for (const id of ids) {
        if (shard[id]) results[id] = shard[id];
      }
    })
  );
  return results;
}

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * English keyword search — trigram → token → ayah_ids
 */
export function searchEnglish(query, maxResults = 50) {
  if (!_enTrigramIndex || !_enTokenIndex) return [];
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);

  const candidateSets = words.map(word => {
    // Direct token lookup first
    if (_enTokenIndex[word]) {
      return new Set(_enTokenIndex[word]);
    }
    // Trigram fallback
    const tris = [];
    for (let i = 0; i <= word.length - 3; i++) tris.push(word.slice(i, i + 3));
    if (tris.length === 0) return new Set();

    const tokenCandidates = new Set();
    for (const tri of tris) {
      const tokens = _enTrigramIndex[tri] || [];
      for (const tok of tokens) tokenCandidates.add(tok);
    }

    const ayahSet = new Set();
    for (const tok of tokenCandidates) {
      if (_enTokenIndex[tok]) {
        for (const id of _enTokenIndex[tok]) ayahSet.add(id);
      }
    }
    return ayahSet;
  });

  if (candidateSets.length === 0) return [];

  // Intersect all word sets
  let result = candidateSets[0];
  for (let i = 1; i < candidateSets.length; i++) {
    result = new Set([...result].filter(id => candidateSets[i].has(id)));
  }

  return [...result].slice(0, maxResults);
}

/**
 * Arabic word/root search
 */
export function searchArabic(query, maxResults = 50) {
  if (!_arTokenIndex) return [];
  const normalized = query.replace(/[ً-ٰٟ]/g, '').replace(/آ|أ|إ/g, 'ا').trim();
  const ids = _arTokenIndex[normalized] || [];
  return ids.slice(0, maxResults);
}

/**
 * Root search
 */
export function searchByRoot(root, maxResults = 200) {
  if (!_rootToAyahIds) return [];
  return (_rootToAyahIds[root] || []).slice(0, maxResults);
}

/**
 * Check if indexes are loaded
 */
export function isReady() {
  return !!(
    _manifest &&
    _shardMapQuran &&
    _enTokenIndex &&
    _enTrigramIndex &&
    _arTokenIndex &&
    _rootToAyahIds
  );
}

export function getRootToAyahIds() { return _rootToAyahIds; }
export function getArTokenIndex() { return _arTokenIndex; }
