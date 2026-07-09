// Fetch the complete Quran word-by-word root data from analyzequran.com's
// backing service (encode12.com/QuranService.svc) — the user-designated
// authority for root words and their occurrences — and rebuild our root data:
//
//   raw/analyzequran/chapter_NNN.json        raw API responses (gitignored cache)
//   data/meta/root_tally_analyzequran.json   root → { count, verses: [refs] }
//   search/data/word_roots.json              normalized word → [roots]   (REBUILT)
//   search/data/root_vocab.json              root → [{n, c}]             (REBUILT)
//   search/data/quran.json                   per-ayah roots arrays       (UPDATED)
//
// Usage: node scripts/fetch_analyzequran_roots.mjs

import fs from 'node:fs';
import path from 'node:path';

const API = 'https://encode12.com/QuranService.svc/chapter';
const RAW_DIR = 'raw/analyzequran';

function normalizeArabic(text) {
  if (!text) return '';
  return text
    // IndoPak long-vowel marks -> their plain-script letters
    .replace(/ٖ/g, 'ي') // subscript alef (khari zer) -> ya
    .replace(/ٗ/g, 'و') // inverted damma (ulta pesh) -> waw
    // IndoPak long-vowel marks -> their plain-script letters
    .replace(/\u0656/g, '\u064A') // subscript alef (khari zer) -> ya
    .replace(/\u0657/g, '\u0648') // inverted damma (ulta pesh) -> waw
    // strip tashkeel, quranic annotation marks, tatweel (dagger alef handled below)
    .replace(/[ؐ-ًؚ-ٟۖ-ۭـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا') // hamza-alefs, wasla -> alef
    .replace(/ء/g, '')       // lone hamza
    .replace(/ى/g, 'ي') // alef maqsura -> ya
    .replace(/ة/g, 'ه') // ta marbuta -> ha
    .replace(/s+/g, ' ')
    .trim();
}

// Both dagger-alef spellings, so lookups work from Uthmani and plain script.
function normVariants(text) {
  const base = normalizeArabic(text);
  const asAlef = base.replace(/ٰ/g, 'ا');
  const stripped = base.replace(/ٰ/g, '');
  return asAlef === stripped ? [asAlef] : [asAlef, stripped];
}

async function fetchJson(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
      console.error(`  HTTP ${r.status} (attempt ${i + 1}) ${url}`);
    } catch (e) {
      console.error(`  ${e.message} (attempt ${i + 1}) ${url}`);
    }
    await new Promise(r => setTimeout(r, 2000 * (i + 1)));
  }
  throw new Error(`Failed: ${url}`);
}

async function main() {
  fs.mkdirSync(RAW_DIR, { recursive: true });

  const rootTally = {};   // root → { count, verses: Set<"s:a"> }
  const wordRoots = {};   // normWord → Set<root>
  const rootVocab = {};   // root → Map<normWord, count>
  const ayahRoots = {};   // "s:a" → Set<root> (ordered by insertion)
  let totalWords = 0, totalVerses = 0, wordsWithRoot = 0;

  for (let s = 1; s <= 114; s++) {
    const rawFile = path.join(RAW_DIR, `chapter_${String(s).padStart(3, '0')}.json`);
    let chapter;
    if (fs.existsSync(rawFile)) {
      chapter = JSON.parse(fs.readFileSync(rawFile, 'utf8'));
    } else {
      chapter = await fetchJson(`${API}/${s}/1`);
      fs.writeFileSync(rawFile, JSON.stringify(chapter));
      console.log(`chapter ${s}: fetched ${chapter.Verses?.length ?? 0} verses`);
    }

    // Position-aligned Uthmani forms from explore/data/wbw close residual
    // script differences (IndoPak vs Uthmani) in word_roots keys.
    const wbwFile = 'explore/data/wbw/wbw_s' + String(s).padStart(3, '0') + '.json';
    const wbwShard = fs.existsSync(wbwFile) ? JSON.parse(fs.readFileSync(wbwFile, 'utf8')) : {};

    for (const v of chapter.Verses || []) {
      totalVerses++;
      const ref = `${s}:${v.ChapterVerseNo}`;
      if (!ayahRoots[ref]) ayahRoots[ref] = new Set();
      for (const w of v.Words || []) {
        totalWords++;
        const root = (w.RootWordAr || '').trim();
        if (!root) continue;
        wordsWithRoot++;

        if (!rootTally[root]) rootTally[root] = { count: 0, verses: new Set() };
        rootTally[root].count++;
        rootTally[root].verses.add(ref);
        ayahRoots[ref].add(root);

        const variants = normVariants(w.WordAr || '');
        for (const norm of variants) {
          if (!norm) continue;
          if (!wordRoots[norm]) wordRoots[norm] = new Set();
          wordRoots[norm].add(root);
        }
        const wbwWords = wbwShard[ref] || [];
        if (wbwWords.length === (v.Words || []).length) {
          const uth = wbwWords[(w.WordNo || 0) - 1];
          if (uth) {
            for (const norm of normVariants(uth.ar)) {
              if (!norm) continue;
              if (!wordRoots[norm]) wordRoots[norm] = new Set();
              wordRoots[norm].add(root);
            }
          }
        }

        // vocab counts use the primary (as-alef) variant only, once per occurrence
        const primary = variants[0];
        if (primary) {
          if (!rootVocab[root]) rootVocab[root] = new Map();
          rootVocab[root].set(primary, (rootVocab[root].get(primary) || 0) + 1);
        }
      }
    }
  }

  console.log(`\n${totalVerses} verses, ${totalWords} words, ${wordsWithRoot} with a root, ${Object.keys(rootTally).length} distinct roots`);

  // ── data/meta/root_tally_analyzequran.json ────────────────────────────────
  const tallyOut = {};
  for (const root of Object.keys(rootTally).sort((a, b) => rootTally[b].count - rootTally[a].count)) {
    tallyOut[root] = { count: rootTally[root].count, verses: [...rootTally[root].verses] };
  }
  fs.writeFileSync('data/meta/root_tally_analyzequran.json', JSON.stringify(tallyOut));

  // ── search/data/word_roots.json ───────────────────────────────────────────
  const oldWordRoots = JSON.parse(fs.readFileSync('search/data/word_roots.json', 'utf8'));
  const wordRootsOut = {};
  for (const [w, roots] of Object.entries(wordRoots).sort()) wordRootsOut[w] = [...roots];
  fs.writeFileSync('search/data/word_roots.json', JSON.stringify(wordRootsOut));

  // ── search/data/root_vocab.json ───────────────────────────────────────────
  const vocabOut = {};
  for (const [root, words] of Object.entries(rootVocab)) {
    vocabOut[root] = [...words.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([n, c]) => ({ n, c }));
  }
  fs.writeFileSync('search/data/root_vocab.json', JSON.stringify(vocabOut));

  // ── search/data/quran.json roots arrays ───────────────────────────────────
  const quran = JSON.parse(fs.readFileSync('search/data/quran.json', 'utf8'));
  let changedAyaat = 0, missingRefs = 0;
  for (const a of quran) {
    const ref = `${a.sn}:${a.an}`;
    const next = ayahRoots[ref] ? [...ayahRoots[ref]] : null;
    if (!next) { missingRefs++; continue; }
    if (JSON.stringify(a.roots || []) !== JSON.stringify(next)) changedAyaat++;
    a.roots = next;
  }
  fs.writeFileSync('search/data/quran.json', JSON.stringify(quran));

  // ── Diff report ───────────────────────────────────────────────────────────
  const oldWords = new Set(Object.keys(oldWordRoots));
  const newWords = new Set(Object.keys(wordRootsOut));
  const added = [...newWords].filter(w => !oldWords.has(w)).length;
  const removed = [...oldWords].filter(w => !newWords.has(w)).length;
  let remapped = 0;
  for (const w of newWords) {
    if (oldWords.has(w) &&
        JSON.stringify([...oldWordRoots[w]].sort()) !== JSON.stringify([...wordRootsOut[w]].sort())) remapped++;
  }
  console.log(`word_roots: ${oldWords.size} -> ${newWords.size} entries (+${added} new, -${removed} gone, ${remapped} remapped)`);
  console.log(`quran.json: roots changed on ${changedAyaat}/${quran.length} ayaat (${missingRefs} refs missing from source)`);
}

main().catch(e => { console.error(e); process.exit(1); });
