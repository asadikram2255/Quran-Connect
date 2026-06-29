# Architecture — Quran Connect

A read-only reference for contributors. Keep it up to date when changing data schemas, adding API endpoints, or modifying the search pipeline.

---

## Project Purpose

Full-text and semantic search over the Quran (6,236 ayaat) with Hadith pairing, supporting any natural language — English, Urdu, Arabic script, Roman transliteration.

---

## Repository Map

```
quran-better-for-me/
│
├── index.html                   ← Landing page / main Quran Connect app
├── assets/app.js                ← Main app JS (tafsir, translations, navigation)
│
├── search/                      ← Search Quran module (self-contained)
│   ├── index.html               ← Search UI entry point
│   ├── css/style.css
│   └── js/
│       ├── concepts.js          ← Islamic concept ontology + ENGLISH_STOP_WORDS
│       ├── search.js            ← BM25 search engine (QuranSearch class)
│       ├── hadith_search.js     ← Client-side hadith keyword search (HadithSearch class)
│       └── app.js               ← UI controller (QuranApp class, 2000+ lines)
│
├── api/                         ← Vercel serverless functions
│   ├── expand.js                ← Query expansion (Groq LLM → roots + keywords)
│   ├── search.js                ← Semantic search (HF embeddings + BGE reranker)
│   ├── synthesize.js            ← Verse grouping (Groq LLM, zero-hallucination)
│   └── rerank.js                ← Cross-encoder reranking (BGE via HF API)
│
├── data/                        ← Static data served by Vercel
│   ├── embeddings/              ← Binary float32 embeddings (ar_emb.bin, en_emb.bin)
│   ├── meta/manifest.json       ← Data version manifest
│   └── ...
│
├── search/data/                 ← Static data for the search module
│   ├── quran.json               ← 6,236 ayaat (see schema below)
│   ├── surah.json               ← 114 surah metadata records
│   ├── word_roots.json          ← normalizedWord → [root, …] lookup
│   ├── root_vocab.json          ← root → [{n: normWord, c: count}, …]
│   └── hadith_index.json        ← {books, data:[serial, bookIdx, ref, text][]}
│
├── scripts/                     ← Offline data pipeline (Python)
│   ├── build_search_data.py     ← CSV → JSON (accepts --input-dir / --output-dir)
│   ├── export_embeddings.py     ← numpy cache → binary .bin (accepts --cache-dir / --output-dir)
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
[/api/search]             HF embed query → local cosine similarity → top-50
  └─ [/api/rerank]        BGE cross-encoder → top-30 merged into results

        │ (after fast results, async)
        ▼
[/api/synthesize]         Groq organizes verse refs into {theme, groups}
  └─ synthesis panel      All text fetched from local quran.json — zero hallucination
```

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

---

## API Endpoints

| Endpoint | Method | Input | Output | Timeout | Used when |
|---|---|---|---|---|---|
| `/api/expand` | POST | `{query: string}` | `{roots, keywords, subtopics, understood_as}` | 15s | Vercel only; GitHub Pages falls back to MyMemory |
| `/api/search` | POST | `{query, lang?}` | `{results[{ayah_id, arabic_text, english_text, embed_score, rerank_score}]}` | 30s | Optional semantic layer |
| `/api/synthesize` | POST | `{query, verses[{ref,text}]}` | `{theme, groups[{label, refs[]}], truncated, verse_limit}` | 10s | After BM25 results arrive |
| `/api/rerank` | POST | `{query, passages[]}` | `{scores[], passage_limit}` | 20s | Optional; Vercel only |

All endpoints return `200` even on error (with `{error: "..."}`) so callers can degrade gracefully.

**Limits:**
- `/api/synthesize`: max 30 verses (returns `truncated: true` if caller sent more)
- `/api/rerank`: max 100 passages (returns 400 with `truncated: true` if exceeded)

---

## Environment Variables

| Variable | Required | Used by |
|---|---|---|
| `HF_TOKEN` | Yes (Vercel) | `api/search.js` (embed + rerank via HF Inference) |
| `GROQ_API_KEY` | Yes (Vercel) | `api/expand.js`, `api/synthesize.js` |

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

- **Root lexicon provenance**: `search/data/word_roots.json` is derived from `raw/Root Words.csv`. The source authority of that CSV is undocumented. Sample against Hans Wehr or Lane's Lexicon if adding new terms.
- **Quran text source**: The Arabic text source recitation (Hafs 'an 'Asim, Uthmani orthography?) is undocumented. Should be confirmed and added to this file.
- **Embedding model choice**: `paraphrase-multilingual-mpnet-base-v2` was chosen for multilingual support. No benchmark comparing it to Arabic-specific models (AraBERT, CAMeL) has been run.
- **Hadith search is English-only**: `hadith_search.js` tokenizer strips all non-ASCII. Arabic/Urdu hadith searches return zero results.
- **No automated tests**: There is no test suite. The normalization test vectors in `scripts/test_normalize.json` are the only formal correctness check.
