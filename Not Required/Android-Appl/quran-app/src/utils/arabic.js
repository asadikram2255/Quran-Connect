// Arabic text normalization utilities (ported from web app)

/**
 * Normalize Arabic text by removing diacritics and normalizing common variants
 */
export function normalizeArabic(text) {
  if (!text) return '';
  return text
    .replace(/[ً-ٰٟ]/g, '')  // Remove tashkeel / diacritics
    .replace(/آ|أ|إ/g, 'ا') // Normalize alef variants → bare alef
    .replace(/ة/g, 'ه')           // Ta marbuta → ha
    .replace(/ى/g, 'ي')           // Alef maqsura → ya
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokenize Arabic text into words
 */
export function tokenizeArabic(text) {
  if (!text) return [];
  return normalizeArabic(text)
    .split(/\s+/)
    .filter(t => t.length > 0);
}

/**
 * Generate trigrams from a string (for search index lookups)
 */
export function trigrams(str) {
  const s = str.toLowerCase().trim();
  if (s.length < 3) return [s];
  const result = [];
  for (let i = 0; i <= s.length - 3; i++) {
    result.push(s.slice(i, i + 3));
  }
  return result;
}

/**
 * Format ayah ID (e.g. "2:255") as "2:255"
 */
export function parseAyahId(id) {
  const [surah, ayah] = id.split(':').map(Number);
  return { surah, ayah };
}

/**
 * Sort ayah IDs by surah then ayah number
 */
export function sortAyahIds(ids) {
  return [...ids].sort((a, b) => {
    const [sa, aa] = a.split(':').map(Number);
    const [sb, ab] = b.split(':').map(Number);
    return sa !== sb ? sa - sb : aa - ab;
  });
}

/**
 * Group sorted ayah IDs by surah number
 * Returns: { surahNum: [ayahIds] }
 */
export function groupBySurah(ayahIds) {
  const groups = {};
  for (const id of ayahIds) {
    const surah = id.split(':')[0];
    if (!groups[surah]) groups[surah] = [];
    groups[surah].push(id);
  }
  return groups;
}
