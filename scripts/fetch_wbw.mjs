// Fetch word-by-word glosses (English + Urdu) for all 114 surahs from the
// quran.com v4 API and build the Explore Quran module's data files:
//
//   explore/data/wbw/wbw_s{NNN}.json   { "s:a": [{ar, en, ur, tr}, …] }  per-surah shards
//   explore/data/word_glosses.json     { normWord: { en:[…], ur:[…] } }  distinct glosses per word
//   explore/data/root_glosses.json     { root:     { en:[…], ur:[…] } }  distinct glosses per root
//
// Roots come from search/data/word_roots.json (normalized word → [roots]),
// so normalization here must match normalizeArabic() in search/js/concepts.js.
//
// Usage: node scripts/fetch_wbw.mjs

import fs from 'node:fs';
import path from 'node:path';

const API = 'https://api.quran.com/api/v4/verses/by_chapter';
const OUT_DIR = 'explore/data';
const WBW_DIR = path.join(OUT_DIR, 'wbw');
const MAX_GLOSSES = 12; // distinct glosses kept per word/root, most frequent first

function normalizeArabic(text) {
  if (!text) return '';
  return text
    // strip tashkeel, quranic annotation marks, tatweel (dagger alef handled by caller)
    .replace(/[ؐ-ًؚ-ٟۖ-ۭـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا') // hamza-alefs, wasla -> alef
    .replace(/ء/g, '')       // lone hamza
    .replace(/ى/g, 'ي') // alef maqsura -> ya
    .replace(/ة/g, 'ه') // ta marbuta -> ha
    .replace(/s+/g, ' ')
    .trim();
}

// Uthmani script writes some alefs as dagger alef (U+0670); the root index was
// built from plain script, where the same word may have a full alef or none.
// Return both candidates so lookups can try each.
function normVariants(text) {
  const base = normalizeArabic(text);
  const asAlef = base.replace(/ٰ/g, 'ا');
  const stripped = base.replace(/ٰ/g, '');
  return asAlef === stripped ? [asAlef] : [asAlef, stripped];
}

async function fetchJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
      console.error(`  HTTP ${r.status} on ${url} (attempt ${i + 1})`);
    } catch (e) {
      console.error(`  ${e.message} on ${url} (attempt ${i + 1})`);
    }
    await new Promise(r => setTimeout(r, 1500 * (i + 1)));
  }
  throw new Error(`Failed after ${tries} tries: ${url}`);
}

// Fetch all pages of one chapter in one language.
// Returns Map<verse_key, [{position, text_uthmani, gloss, tr}]>
async function fetchChapter(chapter, lang) {
  const out = new Map();
  let page = 1, totalPages = 1;
  while (page <= totalPages) {
    const url = `${API}/${chapter}?language=${lang}&words=true&word_fields=text_uthmani&per_page=50&page=${page}`;
    const data = await fetchJson(url);
    totalPages = data.pagination?.total_pages || 1;
    for (const v of data.verses) {
      const words = (v.words || [])
        .filter(w => w.char_type_name === 'word')
        .map(w => ({
          position: w.position,
          ar: w.text_uthmani || w.text || '',
          gloss: (w.translation?.text || '').trim(),
          tr: (w.transliteration?.text || '').trim(),
        }));
      out.set(v.verse_key, words);
    }
    page++;
  }
  return out;
}

function addGloss(bucket, key, lang, gloss) {
  if (!gloss) return;
  if (!bucket[key]) bucket[key] = { en: new Map(), ur: new Map() };
  const m = bucket[key][lang];
  m.set(gloss, (m.get(gloss) || 0) + 1);
}

function finalizeGlosses(bucket) {
  const out = {};
  for (const [key, langs] of Object.entries(bucket)) {
    out[key] = {};
    for (const lang of ['en', 'ur']) {
      out[key][lang] = [...langs[lang].entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_GLOSSES)
        .map(([g]) => g);
    }
  }
  return out;
}

async function main() {
  fs.mkdirSync(WBW_DIR, { recursive: true });
  const wordRoots = JSON.parse(fs.readFileSync('search/data/word_roots.json', 'utf8'));

  const wordGlosses = {}; // normWord → {en:Map, ur:Map}
  const rootGlosses = {}; // root     → {en:Map, ur:Map}
  let unmatchedWords = 0, totalWords = 0;

  for (let s = 1; s <= 114; s++) {
    const nnn = String(s).padStart(3, '0');
    const outFile = path.join(WBW_DIR, `wbw_s${nnn}.json`);
    let shard;

    if (fs.existsSync(outFile)) {
      shard = JSON.parse(fs.readFileSync(outFile, 'utf8')); // resume support
      console.log(`surah ${s}: already fetched (${Object.keys(shard).length} ayaat)`);
    } else {
      const [en, ur] = await Promise.all([fetchChapter(s, 'en'), fetchChapter(s, 'ur')]);
      shard = {};
      for (const [key, enWords] of en) {
        const urWords = ur.get(key) || [];
        const urByPos = new Map(urWords.map(w => [w.position, w]));
        shard[key] = enWords.map(w => ({
          ar: w.ar,
          en: w.gloss,
          ur: urByPos.get(w.position)?.gloss || '',
          tr: w.tr,
        }));
      }
      fs.writeFileSync(outFile, JSON.stringify(shard));
      console.log(`surah ${s}: fetched ${Object.keys(shard).length} ayaat`);
    }

    // Aggregate glosses by normalized word and by root
    for (const words of Object.values(shard)) {
      for (const w of words) {
        totalWords++;
        const variants = normVariants(w.ar);
        const norm = variants.find(v => wordRoots[v]) || variants[0];
        addGloss(wordGlosses, norm, 'en', w.en);
        addGloss(wordGlosses, norm, 'ur', w.ur);
        const roots = wordRoots[norm];
        if (roots) {
          for (const root of roots) {
            addGloss(rootGlosses, root, 'en', w.en);
            addGloss(rootGlosses, root, 'ur', w.ur);
          }
        } else {
          unmatchedWords++;
        }
      }
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, 'word_glosses.json'), JSON.stringify(finalizeGlosses(wordGlosses)));
  fs.writeFileSync(path.join(OUT_DIR, 'root_glosses.json'), JSON.stringify(finalizeGlosses(rootGlosses)));

  console.log(`\nDone. ${totalWords} words total, ${Object.keys(wordGlosses).length} distinct normalized words,`);
  console.log(`${Object.keys(rootGlosses).length} roots with glosses, ${unmatchedWords} words without a root mapping (${(100 * unmatchedWords / totalWords).toFixed(1)}%).`);
}

main().catch(e => { console.error(e); process.exit(1); });
