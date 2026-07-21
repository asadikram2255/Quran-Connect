# Quran Connect — Project Context

> **Maintenance rule (for Claude):** update this file at the end of every work session — refresh the
> "Last Changes" section (newest first, keep ~10 entries) and the "Last updated" line. This file is
> the hand-off context between Claude windows.

**Last updated:** 2026-07-21

## What the project does

Quran Connect (live at https://quran-connect-psi.vercel.app) is a Quran study web app with three modules,
reachable from a landing page (`index.html`) with three module cards:

1. **Explore Quran** (`explore/`) — pure reading module. All 114 surahs, multi-select translations (6)
   and tafseers (5), word & root badges per ayah (hidden behind a "Words & Roots" toggle). Clicking a
   word/root opens a modal with dictionary meanings (English + Urdu) and every ayah containing it.
   Each ayah has a "Pairs →" button deep-linking to Explore Connections.
2. **Explore Connections** (root app: `index.html` + `assets/app.js` + `assets/styles.css`) — deep-dive
   into any ayah: meaning-based & root-word pairs between ayaat, paired Hadith, tafseer, Words & Roots
   modal. Default landing shows a mood/topics browser (`body.view-mood`); search opens the two-panel
   research view (`body.view-research`). Supports `/?ayah=SN:AN` deep links.
3. **Search Quran** (`search/`) — Google-like search grounded ONLY in the Quran (hadith removed
   entirely). BM25 + Arabic root matching + semantic rerank via serverless API. Also has a multi-turn
   **chat mode** ("Ask") grounded in retrieved ayaat with citation validation (`api/chat.js`).

## Authoritative root data (IMPORTANT)

All root words, per-ayah root lists, and occurrence counts across ALL modules come from
**web.analyzequran.com** (user-designated authority; backing service `encode12.com/QuranService.svc`).
- 6,236 verses · 77,428 words · 53,924 root occurrences · 1,664 distinct roots.
- Verified root-by-root against the site's dictionary API (all 1,664 counts match exactly).
- 3 corrections baked in where the site's chapter feed disagrees with its own dictionary
  (2:3 alladhi, 20:94 second root ا م م, 48:29 dropped word ع ظ م).
- Rebuild everything: `node scripts/fetch_analyzequran_roots.mjs` (uses cache in `raw/analyzequran/`).
- Audit against the site: `node scripts/verify_root_tally.mjs all`.
- Root modals everywhere show "occurs N times in the Quran · across M ayaat" (N from
  `root_counts.json`, matching the site; M = ayaat containing the root).
- Root letters render in Noto Naskh Arabic (`--font-ar-root`) because Amiri Quran draws final ya
  dotless, which made ح ي ي look like ح ى ى.

## What it contains

- `index.html`, `assets/{app.js,styles.css,motion.js}` — landing + Explore Connections (root app).
  `DATA_VERSION` const in app.js busts data-file caches; bump when data under `data/` changes.
- `explore/` — Explore Quran module (`index.html`, `css/style.css`, `js/app.js`,
  `data/wbw/` word-by-word en+ur glosses from quran.com, `data/{word_glosses,root_glosses,root_counts}.json`).
- `search/` — Search Quran module (`js/{app,search,concepts,chat,synthesis,root-modal}.js`,
  `data/{quran,surah,word_roots,root_vocab,root_counts}.json`, `tests/`).
- `api/` — Vercel serverless: `search.js` (semantic+rerank), `expand.js`, `synthesize.js`,
  `chat.js` (grounded chat, Groq llama-3.1-8b-instant). All return 200 + `{error}` on failure.
  Configured in `vercel.json` (maxDuration per fn; `/api/chat` = 25s).
- `data/` — shared data: `quran_text/` (114 shards with `roots_ordered` from analyzequran),
  `translations/` (6), `tafsir/` (5 sources), `hadith_text/`, `quran_pairs/`, `search_index/`
  (incl. `root_to_ayahids.json`, spaced AQ keys), `meta/` (manifest.json — version drives the
  service-worker cache; `root_tally_analyzequran.json`; `ayah_roots_analyzequran.{json,csv}` =
  per-word root export for all 6,236 ayaat).
- `scripts/` — Python data pipeline (`01_build_pairs.py` etc.) + Node fetchers:
  `fetch_analyzequran_roots.mjs`, `verify_root_tally.mjs`, `update_quran_text_roots.mjs`,
  `fetch_wbw.mjs` (word-by-word glosses from quran.com API).
- `raw/` — source CSVs + `raw/analyzequran/` API cache (tracked in git since 2026-07-10).
- `sw.js` — service worker, cache-first for `data/*.json`, keyed to manifest version.
- `.vercelignore` — excludes Android-Appl, raw, research papers, scripts from deploys.

## Conventions / gotchas

- Deploys: `npx vercel --prod` (project `quran-connect`; the GitHub auto-deploy integration was
  found unreliable — deploy manually after committing).
- Cache busting: static assets use `?v=N` query params in HTML script/link tags; data files under
  `/data`, `/search/data`, `/explore/data` are cached immutable — bump the `?v=` on their fetch
  URLs when contents change; root-app data uses `DATA_VERSION` + manifest version (service worker).
- Arabic normalization must match across scripts/modules (see `normalizeArabic` + `normVariants`
  in `scripts/fetch_analyzequran_roots.mjs`; handles IndoPak long-vowel marks and dagger alef).
- Never edit Arabic regex literals with editing tools — they get mangled; patch files via a Node
  script using \uXXXX escapes.
- Local preview: `.claude/launch.json` has "root" (port 5501, serves repo root) and "search"
  (port 5500) configs. `/api/*` 404s locally under `npx serve` — expected, client falls back.
- Commit style: plain messages, no attribution footer visible in history; deploy after commit.

## Last changes (newest first)

- **2026-07-21** Cut the root app's landing payload from **118.6 MB → 5.0 MB** (heap 200 → 53 MB).
  `ensureSurahLoaded` was fetching each surah's *pairs* shard alongside its text shard, and the
  25-surah background warm-up therefore pulled ~114 MB of pairs data on every visit. Pairs loading
  is now a separate `ensurePairsLoaded` (with in-flight dedup, `state.loadedPairSurahs`) called
  only from `openDetail`, which already renders a skeleton while it loads. **Do not warm pairs
  shards** — `pairs_s002.json` alone is 17 MB.
- **2026-07-21** Fixed the service worker cache being dead after the first session: `CACHE_NAME`
  was a module `let` assigned only inside `install`, so every worker restart reverted it to the
  fallback and missed the real cache. Verified in-browser — two caches existed, `quran-data-v5`
  (113 entries) and a stray `quran-data-2` (108). Cache name is now resolved lazily via
  `cacheName()` (manifest → existing `quran-data-v*` scan for offline → fallback) and `activate`
  reaps legacy `quran-data*` caches. All 66 data requests now serve from cache, 0 from network.
- **2026-07-21** `/api/search` now returns `200 + {results: [], error}` on failure like the other
  three functions, instead of `500` (client fallback to local BM25 was already equivalent).
- **2026-07-21** Full project audit. Open items NOT yet fixed, highest first: (1) all four `api/*`
  functions are wildcard-CORS, unauthenticated and unthrottled — anyone can drain the Groq/HF
  quota; (2) raw `e.message` (incl. upstream response bodies) returned to clients from all four;
  (3) duplicate `POST /api/expand` per search; (4) `site.webmanifest` has `"icons": []` and stale
  "Quran Better For Me" / "43,000+ Hadith" branding; (5) no favicon on root `index.html`;
  (6) `Android-Appl/` is neither tracked nor gitignored; (7) unused `QDRANT_*` keys in `.env`
  should be revoked; (8) repo is 312 MB packed, `raw/` CSVs are build inputs.

- **2026-07-10** Unified light/dark theming across ALL pages: root app (landing + Explore
  Connections) gained a full warm-parchment light theme + header toggle; all three pages share
  one localStorage key (theme, default dark) so the choice follows the user across modules;
  pre-paint scripts prevent theme flash; search toggle glyph unified.

- **2026-07-10** Added "Pairs →" button to every ayah card in Explore Quran → deep-links to
  Explore Connections at that ayah (`../?ayah=SN:AN`). Created this CLAUDE.md context file.
- **2026-07-10** Fixed remaining root-count display mismatches: Explore Connections root modal now
  shows authoritative occurrence counts ("occurs N times · across M ayaat"); rebuilt
  `data/search_index/root_to_ayahids.json` with spaced AQ keys (chips had silently stopped opening
  the modal); wired `root_counts.json` into Search Quran's root modal too.
- **2026-07-10** Exported per-word root data for all 6,236 ayaat:
  `data/meta/ayah_roots_analyzequran.{json,csv}`. `raw/` now tracked in git (user removed ignore).
- **2026-07-10** Aligned per-ayah root display with analyzequran across all modules: rebuilt
  `roots_ordered` in all `data/quran_text` shards; root letters now use Noto Naskh Arabic.
- **2026-07-10** Verified all 1,664 root occurrence counts against analyzequran's dictionary API;
  fixed 3 discrepancies (site-internal inconsistencies, dictionary wins). Added verify script.
- **2026-07-10** Rebuilt all root data from analyzequran.com as authoritative source
  (`scripts/fetch_analyzequran_roots.mjs`); word_roots grew to 23,510 keys (IndoPak/Uthmani/plain
  spellings); explore glosses re-aggregated.
- **2026-07-09** UI polish: landing module cards widened & reordered (Explore Quran, Explore
  Connections, Search Quran); research-view header now says "Explore Connections"; Explore Quran
  fills viewport; word badges restyled for visibility.
- **2026-07-09** Built the **Explore Quran** module from scratch (third module) with word-by-word
  en+ur glosses fetched from quran.com API (77k words, `scripts/fetch_wbw.mjs`).
- **2026-07-09** Landing page: About/credits panel now flows inline after the topics grid
  (was hidden behind a button, page looked cut off).
- **2026-07-08** Search module: removed hadith entirely; added grounded multi-turn chat
  (`api/chat.js` + `search/js/chat.js`); cleanup (dead `api/rerank.js` removed, `.vercelignore`).
