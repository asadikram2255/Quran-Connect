# Architecture — Quran Connect

A read-only reference for contributors. Keep it up to date when changing data schemas, adding API endpoints, or modifying the search pipeline.

---

## Project Purpose

Full-text and semantic search over the Quran (6,236 ayaat) with Hadith pairing, supporting any natural language — English, Urdu, Arabic script, Roman transliteration — plus a pure-reading module with word-by-word meanings and root exploration.

---

## Repository Map

```
Quran-Connect/
│
├── index.html                   ← Landing page / Explore Connections app
├── sw.js                        ← Service worker (cache-first for data/ JSON, keyed to manifest version)
├── assets/
│   ├── app.js                   ← Main app JS (pairs, tafsir, translations, mood topics, modals)
│   ├── motion.js                ← Scroll-linked entrance animations
│   └── styles.css
│
├── explore/                     ← Explore Quran module (pure reading, self-contained)
│   ├── index.html
│   ├── css/style.css
│   ├── js/app.js                ← ExploreApp class (word-by-word, word/root modals)
│   └── data/
│       ├── wbw/wbw_sNNN.json    ← per-surah word-by-word {ar, en, ur, tr}
│       ├── word_glosses.json    ← normalized word → {en:[…], ur:[…]}
│       ├── root_glosses.json    ← root → {en:[…], ur:[…]}
│       └── root_counts.json     ← authoritative root occurrence counts (analyzequran.com)
│
├── search/                      ← Search Quran module (self-contained)
│   ├── index.html               ← Search UI entry point
│   ├── css/style.css
│   ├── js/
│   │   ├── concepts.js          ← Islamic concept ontology + ENGLISH_STOP_WORDS + normalizeArabic
│   │   ├── search.js            ← BM25 search engine (QuranSearch class)
│   │   ├── app.js               ← UI controller (QuranApp class)
│   │   ├── synthesis.js         ← Synthesis panel (renders /api/synthesize output)
│   │   ├── chat.js              ← "Ask" chat mode (calls /api/chat)
│   │   └── root-modal.js        ← Root occurrences modal
│   └── data/
│       ├── quran.json           ← 6,236 ayaat (see schema below)
│       ├── surah.json           ← 114 surah metadata records
│       ├── word_roots.json      ← normalizedWord → [root, …] lookup
│       ├── root_vocab.json      ← root → [{n: normWord, c: count}, …]
│       └── root_counts.json     ← root occurrence counts (analyzequran.com)
│
├── api/                         ← Vercel serverless functions
│   ├── expand.js                ← Query expansion + autocomplete suggest (Groq LLM → roots + keywords)
│   ├── search.js                ← Semantic search: HF embed → local cosine → BGE rerank (one function)
│   ├── synthesize.js            ← Verse grouping (Groq LLM, zero-hallucination)
│   └── chat.js                  ← Grounded Quran chat (Groq LLM, cites only supplied verses)
│
├── data/                        ← Static pre-computed data served by Vercel
│   ├── embeddings/              ← Binary float32 embeddings (ar_emb.bin, en_emb.bin, meta.json)
│   ├── meta/                    ← manifest.json, shard maps, root tallies, pairing diagnostics
│   ├── quran_text/              ← per-surah ayah shards (quran_sNNN.json)
│   ├── quran_pairs/             ← per-surah semantic + lexical pair shards (pairs_sNNN.json)
│   ├── hadith_text/             ← 43,393 hadith in 1,000-record shards
│   ├── search_index/            ← token/root → ayah-id inverted indexes
│   ├── tafsir/                  ← 5 sources (ibn_kathir, ibn_kathir_ur, maarif, maududi, bayan_ul_quran)
│   └── translations/            ← 6 translations + Urdu hadith shards
│
├── raw/                         ← Source datasets consumed by the offline pipeline
│
├── scripts/                     ← Offline data pipeline (Python + Node)
│   ├── 01_build_pairs.py        ← Embeddings + TF-IDF → quran_pairs/, hadith pairing, search_index/
│   ├── build_search_data.py     ← CSV → search/data/ JSON (accepts --input-dir / --output-dir)
│   ├── export_embeddings.py     ← numpy cache → binary .bin (accepts --cache-dir / --output-dir)
│   ├── fetch_*.{py,mjs,js}      ← Fetchers: tafsir, translations, word-by-word, analyzequran roots
│   ├── verify_root_tally.mjs    ← Cross-check root counts against analyzequran dictionary
│   └── test_normalize.json      ← Normalization test vectors (JS ↔ Python parity check)
│
└── vercel.json                  ← Function config + cache headers
```

---

## End-to-End Search Pipeline

```
User query (any language)
        │
        ▼
[search.js — Phase 1, sync, <50ms]
  ├─ parseQuery()         concepts.js — ontology lookup, Roman transliteration
  ├─ Arabic patterns      addressee matching (يَا أَيُّهَا etc.)
  ├─ Concept root scoring IDF-weighted root index lookup
  ├─ BM25                 stemmed + direct English term scoring
  ├─ Phrase boost         adjacent word pairs + quoted phrases
  ├─ Exact Arabic match   all prefix variants (و ف ب ك ال …)
  └─ → onFastResults()   ← cards appear instantly (<50ms)

        │ (parallel, async)
        ▼
[/api/expand]             Groq Llama-3.1-8B
  Returns: {roots, keywords, subtopics, understood_as}
  Fallback: MyMemory translation pipeline (en|ar → ur|ar → ur|en)

        │ LLM roots merged into existing scores
        ▼
[search.js — Phase 2]
  Apply LLM roots + keywords additively to Phase 1 scores
  Root coverage bonus: ×(1 + 0.5 × covered/total) when ≥2 roots
  → renderResults() called again with richer ranking

        │ (parallel, optional)
        ▼
[/api/search]             HF embed query → local cosine over bundled
                          embeddings → top-50 → BGE cross-encoder rerank
                          (in the same function) → top-30 merged into results

        │ (after fast results, async)
        ▼
[/api/synthesize]         Groq organizes verse refs into {theme, groups}
  └─ synthesis panel      All text fetched from local quran.json — zero hallucination
```

In "Ask" mode, `search/js/chat.js` runs the same retrieval, then sends the top verses plus the conversation to `/api/chat`, which may only cite the supplied refs.

---

## Data Schemas

### `search/data/quran.json`

```json
[
  {
    "id":   1,          // global 1-indexed sequence (1–6236)
    "sn":   1,          // surah number (1–114)
    "an":   1,          // ayah number within surah
    "ar":   "بِسْمِ اللَّهِ …",  // original Arabic (with full tashkeel)
    "en":   "In the name of Allah …",  // primary English translation
    "t1":   "…",        // Sahih International
    "t2":   "…",        // Yusuf Ali
    "t3":   "…",        // additional translation
    "sne":  "Al-Fatihah",  // surah name English
    "sna":  "الفاتحة",     // surah name Arabic
    "snr":  "Al-Fatiha",   // surah name Roman
    "juz":  1,
    "ruku": 1,
    "manzil": 1,
    "place": "Meccan",  // "Meccan" | "Medinan"
    "roots": ["ب س م", "ر ح م"]  // space-separated 3-letter Arabic roots
  }
]
```

### Arabic Normalization (MUST match in both Python and JS)

The same normalization is applied at **build time** (`scripts/build_search_data.py:normalize_arabic`) and at **query time** (`search/js/concepts.js:normalizeArabic`). They must stay identical.

Test vectors are in `scripts/test_normalize.json`. If you change either implementation, run:

```python
import json, re

def normalize_arabic(text): ...  # paste current Python impl

vectors = json.load(open("scripts/test_normalize.json"))
for v in vectors:
    result = normalize_arabic(v["input"])
    assert result == v["expected"], f"FAIL: {v['comment']}\n  got: {result}\n  want: {v['expected']}"
print("All normalization tests passed.")
```

Rules applied (in order):
1. Superscript alef `ٰ` (U+0670) → regular alef (must precede diacritic strip)
2. Strip all harakat / tashkeel (U+064B–U+0652 range + Quranic annotation marks)
3. Alef variants `أ إ آ ٱ` → plain alef `ا`
4. Standalone hamza `ء` → removed
5. Alef maqsura `ى` → ya `ي`
6. Ta marbuta `ة` → ha `ه`
7. Collapse whitespace

Note: `explore/js/app.js` and `scripts/fetch_wbw.mjs` carry their own mirrored copy of this normalizer for word-by-word lookups — keep those in sync too.

---

## API Endpoints

| Endpoint | Method | Input | Output | Timeout | Used when |
|---|---|---|---|---|---|
| `/api/expand` | POST | `{query, mode?}` | `{roots, keywords, subtopics, understood_as}`; `mode:"suggest"` → `{suggestions[]}` | 15s | Vercel only; GitHub Pages falls back to MyMemory |
| `/api/search` | POST | `{query, lang?}` | `{results[{ayah_id, arabic_text, english_text, embed_score, rerank_score}]}` | 30s | Optional semantic layer; reranking happens inside this function |
| `/api/synthesize` | POST | `{query, verses[{ref,text}]}` | `{theme, groups[{label, refs[]}], truncated, verse_limit}` | 10s | After BM25 results arrive |
| `/api/chat` | POST | `{messages[], verses[{ref,text}]}` | `{reply, citedRefs[]}` | 25s | "Ask" mode in the Search module |

All endpoints return `200` even on error (with `{error: "..."}`) so callers can degrade gracefully.

**Limits:**
- `/api/synthesize`: max 30 verses (returns `truncated: true` if caller sent more)
- `/api/chat`: max 20 verses, last 10 messages, 1,000 chars per message

---

## Environment Variables

| Variable | Required | Used by |
|---|---|---|
| `HF_TOKEN` | Yes (Vercel) | `api/search.js` (embed + rerank via HF Inference) |
| `GROQ_API_KEY` | Yes (Vercel) | `api/expand.js`, `api/synthesize.js`, `api/chat.js` |

Copy `.env.example` to `.env` to run locally with `vercel dev`.

---

## Rebuilding Data from Scratch

```bash
# 1. Install Python deps
pip install -r scripts/requirements.txt

# 2. Build search data JSON from raw CSVs
python scripts/build_search_data.py
#   --input-dir  path/to/raw/    (default: <repo-root>/raw/)
#   --output-dir path/to/output/ (default: <repo-root>/search/data/)

# 3. Build + export embeddings (requires 01_build_pairs.py to have been run first)
python scripts/export_embeddings.py
#   --cache-dir  path/to/cache/  (default: <repo-root>/data/cache/)
#   --output-dir path/to/output/ (default: <repo-root>/data/embeddings/)

# 4. Commit data/embeddings/ — they are bundled with the Vercel function
git add search/data/ data/embeddings/
```

---

## Known Limitations & Open Questions

- **Root lexicon provenance**: `search/data/word_roots.json` is derived from `raw/Root Words.csv`. Root occurrence counts have since been verified against analyzequran.com (`scripts/verify_root_tally.mjs`), but the CSV's original source authority remains undocumented.
- **Quran text source**: The Arabic text source recitation (Hafs 'an 'Asim, Uthmani orthography?) is undocumented. Should be confirmed and added to this file.
- **Embedding model choice**: `paraphrase-multilingual-mpnet-base-v2` was chosen for multilingual support. No benchmark comparing it to Arabic-specific models (AraBERT, CAMeL) has been run.
- **No live hadith search**: Hadith connections are pre-computed offline by `scripts/01_build_pairs.py` and served as static pair shards; there is no runtime hadith keyword search.
- **No automated tests**: There is no test suite. The normalization test vectors in `scripts/test_normalize.json` and `scripts/verify_root_tally.mjs` are the only formal correctness checks.
