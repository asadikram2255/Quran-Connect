# Quran Connect — Project Context

> **Maintenance rule (for Claude):** update this file at the end of every work session — refresh the
> "Last Changes" section (newest first, keep ~10 entries) and the "Last updated" line. This file is
> the hand-off context between Claude windows.

**Last updated:** 2026-07-24 (book-viewer toolbar made phone-safe — Back + root heading always
visible, zoom/nav controls wrap to a second row; Android-only accordion pairs + compact anchor +
module explanations moved to About, shipped as APK 1.3.0)

## What the project does

Quran Connect (live at https://quran-connect-psi.vercel.app) is a Quran study web app with four modules,
reachable from a landing page (`index.html`) with four module cards:

1. **Explore Quran** (`explore/`) — pure reading module. All 114 surahs, multi-select translations (6)
   and tafseers (5), word & root badges per ayah (hidden behind a "Words & Roots" toggle). Clicking a
   word/root opens a modal with dictionary meanings (English + Urdu) and every ayah containing it.
   Each ayah has a "Pairs →" button deep-linking to Explore Ayaah Connections. On narrow screens the
   surah sidebar is a slide-in drawer opened by a "☰ Surahs" button (`_wireMobileSidebar` in js/app.js).
2. **Explore Ayaah Connections** (root app: `index.html` + `assets/app.js` + `assets/styles.css`) —
   deep-dive into any ayah: meaning-based & root-word pairs between ayaat, paired Hadith, tafseer,
   Words & Roots modal. Default landing shows a mood/topics browser (`body.view-mood`, headline "Ideas
   and Topics"); search opens the two-panel research view (`body.view-research`). Supports `/?ayah=SN:AN`
   and `/?root=<spaced letters>` deep links (the latter opens the root modal, used by the directory).
3. **Search Quran** (`search/`) — Google-like search grounded ONLY in the Quran (hadith removed
   entirely). BM25 + Arabic root matching + semantic rerank via serverless API. Also has a multi-turn
   **chat mode** ("Ask") grounded in retrieved ayaat with citation validation (`api/chat.js`).
4. **Root Words Directory** (`roots/`) — every root analyzequran finds, in one searchable list
   (search by letters or English meaning, sort by frequency or alphabetically). Data is the prebuilt
   `data/root_directory.json`; each row deep-links to Explore Ayaah Connections' root modal via
   `../?root=<letters>`. Mirrors the Android app's native directory.

Two more surfaces (not module cards): the **Prophet Stories** nav button (formerly "Prophet Module")
and per-ayah **study notes** (see below).

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

- `assets/book/p010.webp … p477.webp` + `data/book_index.json` + `assets/book-viewer.js` — the
  **root meaning shown in the app**: page images of Fatuhat al-Quran and a root → page index, with
  a shared "See Meanings" viewer used by the root modal in all three modules. Built by
  `scripts/build_book_pages.py` from the PDF in `raw/`.
- `data/root_dictionary.json` + `assets/root-dictionary.js` — the extracted *text* of the same
  articles. Built by `scripts/build_root_dictionary.py` from the DOCX. **No page loads this any
  more** (the Arabic in it is corrupt — see below); kept as a build input and for search/analysis.
- `assets/{notes.js,notes-ui.js}` + `notes/` — per-ayah study notes, **fully local, no accounts**.
  `notes.js` is the store (localStorage `quran-notes-v1`, many notes per ayah, tombstoned deletes) with
  a platform-independent versioned import/export (`{format:"quran-connect-notes",version:1,…}`, merge by
  id, last-write-wins on `updated`, the same JSON the Android app reads); `notes-ui.js` is the "Add
  Notes" button, the note editor, and a **Backup** box (Export / Import); `notes/` is the printable "My
  Notes" page. (Supabase, the account UI, and `notes-config.js` were removed in milestone 5.)
- `index.html`, `assets/{app.js,styles.css,motion.js}` — landing + Explore Ayaah Connections (root app).
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
- **The book PDF's text layer is corrupt but its rendering is exact.** Glyphs are addressed by
  index in the content stream, so extraction returns `[517:4]` where the page prints `[51:47]` and
  every fatha comes out as shadda+fatha — yet what the page *draws* is what the author typeset.
  Anything that must be faithful to the book should therefore use the page image, not the text.

## Last changes (newest first)

- **2026-07-24** **The book viewer's toolbar no longer breaks on a phone (shared web fix).** On a
  narrow screen `assets/book-viewer.js`'s `.bookv-bar` was a single non-wrapping flex row of eight
  fixed-width items, so the ✕ close was pushed off the right edge and the RTL root heading was crushed
  — leaving no visible way back to the root modal underneath. The bar now wraps: the root heading and a
  relabelled **"‹ Back"** button share the top row (`order:1`/`order:2`, `white-space:nowrap` on
  `.bookv-root` so it can't stack), and the zoom −/％/＋ and ‹Prev·page·Next› controls are grouped in a
  new `.bookv-tools` div that takes `flex-basis:100%` (`order:3`) to drop onto its own centred second
  row below 640px. On desktop it stays one row. Verified in-browser at 375px: Back at top-right (x=299,
  within the 375 viewport), heading at top-left, tools wrapped below — all on screen. Bumped
  book-viewer.js `?v=2→3` in `index.html`, `explore/index.html`, `search/index.html` (it sits under
  `/assets`, not `/data`, so the `?v=` bump is what busts its cache). **This was the only web-repo
  change this session** — the pairs accordion, compact anchor and About-screen consolidation that went
  with it are Android-only (overlay + native), shipped as **APK 1.3.0**; see the Android repo's
  CLAUDE.md.

- **2026-07-24** **Two reader fixes, both shared with the Android app (they reach it through
  `tools/sync_web_assets.py`).** (1) **Jump-to-ayah in Explore Quran.** The surah header now carries a
  "Go to ayah" number field (`.sh-jump`, wired by `_wireAyahJump` in `explore/js/app.js`, bounded
  1–`meta.verses`); submitting scrolls the card into view **instantly** (`_scrollToAyah`, `block:
  'start'` — a jump can span the whole surah, so `behavior:'smooth'` would crawl) and flashes it via a
  new `@keyframes ayah-flash` (the old `.flash` rule was a static border). It also updates the hash to
  `#SN:AN` and closes the mobile surah drawer. (2) **Pinch-to-zoom on the book page.** `assets/book-viewer.js`
  gained width-based zoom (a CSS transform makes no scrollable overflow; scaling `.bookv-stage` width
  does): −/＋ toolbar buttons + a % label, ctrl+wheel, two-finger pinch (`touchstart/move/end` with
  dist/mid helpers) and double-tap toggling 1×↔2.5×, clamped 1–5×, focal-point-preserving via
  scrollLeft/Top; `resetZoom()` on every `show()`. Bumped: `explore/index.html` css `?v=7`,
  book-viewer.js `?v=2`, app.js `?v=14`; `index.html`/`search/index.html` book-viewer.js `?v=2`.
  Committed `500d5f2`, deployed to Vercel prod and pushed to GitHub (Pages had been serving stale
  pages until the push). **Android side:** synced in, plus native fixes — see the Android repo's
  CLAUDE.md (WebView opaque bg + hardware layer for scroll; drawer opens only from ☰; notes
  import/export wired through the device DB) — shipped as **APK 1.2.0**.

- **2026-07-24** **Android APK 1.1.0 device-verified end-to-end** on a Redmi Note 10 (MIUI, Android 12),
  **fully offline the whole time (airplane mode on)**. Verified: durood splash (the ﷺ invocation in
  gold Nastaliq); Explore Quran reading + per-ayah controls; **Words & Roots → See Meanings** opening
  the book page (root ر ح م → page 162, headword highlight band, crisp Urdu Nastaliq, restored Arabic
  quotes); **offline notes** create / edit (an `· EDITED` marker proves `updated` is tracked) / delete /
  "Saved on this device" (no accounts); the notes **export format is byte-identical** to the web
  contract (`{format:"quran-connect-notes",version:1,source:{platform:"android",app:"1.1.0"},notes:[…]}`)
  and the **round-trip works both ways** — the Android export imported into the deployed web app as
  `{added:1}` then idempotently `{unchanged:1}` (UUID merge, no dupes), and a web export imported back
  onto the phone landed on 2:255 with its timestamp intact; the **My Notes** hub (Export / Import /
  Search notes); the nav drawer carrying **all three renames** (Explore Ayaah Connections, Prophet
  Stories, Ideas and Topics) plus Root Words Directory / Statistics / My Notes / About; the **native
  Root Words Directory** (1,664 rows, same data as web `root_directory.json` — ا ل ه 2851×/1879 ayaat/
  p.19 first, الَّذِى flagged "not a root · not in the book"); the **per-ayah Share** native bottom
  sheet (toggleable Arabic / Translation / My-notes with a live preview); Explore Ayaah Connections
  (search modes, 113 results offline); Prophet Stories (25-prophet grid); Ideas and Topics.
  **Gotcha (MIUI):** `adb shell input`/`am` event injection is refused with
  `SecurityException: … requires INJECT_EVENTS permission` even with USB debugging authorised —
  MIUI gates it behind a separate "USB debugging (Security settings)" toggle that won't persist without
  a SIM + Mi account, so the walkthrough was driven by the user tapping while `adb exec-out screencap`
  (which works regardless) captured each screen. Everything here is the **Android** repo's artifact;
  **no web-repo files changed** this session apart from this note. Still owed there: the
  `webapp-overlay/assets/{notes.js,notes-ui.js}` Import/Backup sync and the orphaned `notes-config.js`.

- **2026-07-24** **Milestone 5 — the web app now matches the Android app.** Six pieces, all deployed:
  - **Renames** everywhere: "Explore Connections" → **Explore Ayaah Connections**, "Prophet Module" →
    **Prophet Stories**, "How are you feeling today?" / "What Am I Feeling?" → **Ideas and Topics**.
    ("Quran Connect" and "Explore Quran" unchanged.)
  - **Notes are fully local now — no accounts, no Supabase.** `assets/notes.js` was rewritten to a
    localStorage-only store with a platform-independent versioned import/export
    (`{format:"quran-connect-notes",version:1,notes:[{id,sn,an,body,created,updated,deleted}]}`, merge
    by id, last-write-wins on `updated`, tombstones, accepts legacy `{v:1,…}`, rejects a newer version
    — byte-for-byte the format the Android app reads). `notes-ui.js`'s account box became a **Backup**
    box (Export / Import a `.json`). `assets/notes-config.js` and `supabase/notes_schema.sql` were
    deleted. Notes still work offline exactly as before; the phone and the laptop exchange notes by
    exporting and importing the file.
  - **Explore Quran got a surah drawer on narrow screens.** Below 860px `explore/css/style.css` used to
    hide `.sidebar` outright, stranding a phone on whatever surah it opened; it now slides in from a new
    "☰ Surahs" button over a backdrop (`_wireMobileSidebar` in `explore/js/app.js`; picking a surah,
    Escape, or a backdrop tap closes it). Desktop unchanged.
  - **New Root Words Directory** (`roots/`), a fourth landing card. A searchable list of every root
    analyzequran finds (search by letters — normalised, marks optional — or by English meaning; sort by
    frequency or A–Z), each row deep-linking to Explore Ayaah Connections' root modal via a new
    **`/?root=<spaced letters>`** handler in `assets/app.js` (opens the same modal a root badge does:
    the book's page plus every ayah the root occurs in — no second ayah renderer). Data is the prebuilt
    `data/root_directory.json` (206 KB, 1,664 rows), built by **`scripts/build_root_directory.mjs`**, a
    port of the Android `tools/build_root_directory.py` (same schema, same gloss aggregation).
  - **Credits fixed** on the landing page: all 5 tafsir sources now named (Maududi/Tafhim was missing),
    **Fatuhat al-Quran** credited as the source of every root meaning, plus word-by-word (quran.com),
    analyzequran, and the typefaces; contributor / "Built by" names removed (also from the taglines in
    `index.html` and `assets/app.js`). MyMemory and the two Reference Works were kept — unlike Android,
    the web genuinely uses them (`search/js/{search,concepts}.js`).
  - **`explore/data/root_glosses.json` regenerated** correctly. It had been aggregated 2026-07-09,
    before the roots were rebuilt from analyzequran on 2026-07-10, so 46 entries were misfiled (و ع د,
    "promise", glossed "Allah"). New **`scripts/build_root_glosses.mjs`** re-aggregates offline against
    `data/meta/ayah_roots_analyzequran.json` (skipping 20:94, one more root than words); `fetch_wbw.mjs`
    no longer does it. 1,663 roots (ل ح ي occurs only in the skipped 20:94; its count still comes from
    `root_counts.json`). No page loads this file yet — it is the data source for a future richer view.
  **Cross-repo still owed (Android milestone 5, not started):** the Android `webapp-overlay/assets/`
  copy of `notes.js`/`notes-ui.js` needs the same `import`/Backup changes on its next sync, and its
  `notes-config.js` overlay reference is now orphaned.

- **2026-07-23** **The Android app now lives in its own repository —
  `../quran-connect-android`.** This repo stays the web version and the source of truth for the
  data pipeline (`scripts/`, `raw/`); **nothing here was modified for Android.** The app copies
  what it needs from here with its own `tools/sync_web_assets.py` and layers app-only files over
  the copy, so `explore/js/app.js` and the rest stay byte-identical on both sides. It is native
  Kotlin/Compose for the shell (splash, navigation, notes, share) and a WebView for the reading
  surfaces, which are this repo's HTML/CSS/JS unmodified — parity in Nastaliq and Uthmani shaping
  is why. It ships **fully offline**: 427.3 MB of assets → a **130.6 MB signed release APK**
  (version 1.1.0, all six modules plus notes and a Root Words Directory), with **no `INTERNET`
  permission** and **no Supabase** (notes are a device SQLite database, exported in a versioned
  JSON format both platforms read).
  **Milestone 5 (web parity with the Android app) is now done in this repo — see the 2026-07-24
  entry above.**

- **2026-07-22** **Per-ayah notes, with accounts and a printable notebook.** Every ayah card in
  Explore Quran carries an **Add Notes** button (it becomes "Notes · N" with a dot once notes
  exist); it opens an editor listing every previous note on that ayah, each dated, each editable
  and deletable, plus a box for a new one (Ctrl/Cmd+Enter saves). The landing page's header has a
  **Print Notes** link to `notes/?auto=1` — a page that lays every note out in Quran order with the
  Arabic and the Saheeh International translation and opens the browser's print dialog once
  `document.fonts.ready` resolves (the browser is what shapes Arabic and Urdu correctly; a JS PDF
  builder does not). Storage is **local-first**: `assets/notes.js` writes to localStorage
  immediately, so notes work offline and never block on the network. Signing in mirrors them to
  **Supabase** for cross-device access — talked to over plain `fetch` against its auth and REST
  endpoints, so no third-party bundle is loaded. Sync is last-write-wins per note id (the client
  mints the uuid, so an offline note keeps its identity and syncing twice cannot duplicate it), and
  deletes are tombstones so a delete on the phone doesn't get re-uploaded by the laptop. **Sync is
  configured** (project `anitonryhccpgfisrzlm`): `supabase/notes_schema.sql` has been run there
  (table + four RLS policies keyed to `auth.uid()`) and `assets/notes-config.js` carries the
  project URL and anon key — both public-by-design values, never the service_role key. Verified
  `GET /rest/v1/notes` → `200 []` anonymously, i.e. RLS hides every row without a session.
  **Gotchas hit while setting it up:** the SQL Editor refused DDL with `25006: cannot execute
  CREATE TABLE in a read-only transaction` (session-level read-only; cleared by running
  `set default_transaction_read_only = 'off';` alone first — noted at the top of the schema file),
  and email auth ships disabled on a new project, so sign-in returns
  `422 email_provider_disabled` until **Authentication → Sign In / Providers → Email** is enabled.
  With no config at all the feature still works fully, saved on one device, and the account box
  says so.

- **2026-07-22** **Root meanings are now the book's own page, not extracted text.** The root modal
  in all three modules shows a **"See Meanings"** button (plus "Fatuhat al-Quran · page N"); it
  opens `assets/book-viewer.js`, an overlay that displays the rendered page image scrolled to the
  root's headword with a highlight band. This sidesteps the text-layer corruption entirely — the
  reader sees exactly what the book prints, including the isolated Arabic word-forms that could
  never be repaired from the text. `scripts/build_book_pages.py` renders pages 10–477 at 144 dpi
  to WebP (`assets/book/pNNN.webp`, 468 files, 44.7 MB, ~98 KB/page) and writes
  `data/book_index.json` (41 KB: `{version, source, dpi, first, last, printed[], roots{root:
  [page, y]}}`, y = vertical position as a fraction of page height). Headwords are found the same
  way `build_root_dictionary.py` finds them (large spaced-letter lines, باب fallback for headwords
  missing their first letter, skeleton match for unspaced ones): **1,697 located, covering
  1,619 / 1,664 app root keys**. The 45 without a page are 11 particles (ٱلَّذِى, إِلَىٰ, إِذَا …,
  2,931 occurrences — not roots, the book has no article for them) and 34 real roots
  (730 occurrences, 1.4%); for those the modal says "This root is not in the book's dictionary."
  Pages between headwords are published too, so an article running past a page break stays
  readable via Next. Arrow keys are reversed for RTL (← next, → previous).
  `assets/root-dictionary.js` and the 1.9 MB `data/root_dictionary.json` fetch are no longer loaded
  by any page (saving that download on every root click); the quote-restoration pipeline still
  builds the JSON. **Gotcha:** `data/book_index.json` sits under `/data`, so `sw.js` caches it
  cache-first — a change to the index needs `data/meta/manifest.json` `version` bumped, `?v=` does
  nothing.

- **2026-07-22** **The 416 quotations that could not be restored are exported for hand correction.**
  `scripts/export_quote_fixes.py` writes `raw/quote_fixes.xlsx` — one row per unmatched
  `[surah:ayah]` reference with the root, the **printed book page** (the PDF is indexed page by
  page; printed number = PDF page − 5, carried forward across pages that print none), the quote as
  the book prints it, the Urdu leading up to it, why it was left alone, and blank columns for the
  correct reference / Arabic. 412 of 416 rows resolve to a page (378 to the exact page carrying the
  reference); 24 carry an auto-suggested reference found by rearranging the scrambled digits and
  keeping the ayah that actually contains the quote (`[5:253]` → 25:53).
  `python scripts/export_quote_fixes.py --ingest` reads the filled-in workbook into
  **`raw/quote_fixes.json`**, which `restore_quran_quotes.py` applies *before* anything automatic.
  A correction may name a reference or supply the Arabic directly (for a part-verse); either way it
  must still line up with the printed quote under the same word-boundary skeleton rule, so a
  mistaken correction is **reported (`manual_failed`), never substituted**. An export refuses to
  overwrite an existing workbook without `--force`; the durable record is the JSON, which an export
  never touches. `build_root_dictionary.main()` was split into `build_entries()` so the exporter
  reuses the parse — output byte-identical. **Re-deploy is still pending the filled-in sheet.**

- **2026-07-22** **Quranic quotations inside the dictionary articles are restored** from the repo's
  own Quran text, working around the source corruption described in the entry below.
  `scripts/restore_quran_quotes.py` (called from `build_root_dictionary.py`) walks every printed
  `[surah:ayah]` reference, reduces the text before it to a **consonant skeleton** (alef, hamza and
  every hamza seat dropped; Urdu letter forms folded onto Arabic ones), finds the longest suffix of
  that skeleton occurring contiguously in the cited ayah, and substitutes the authoritative text.
  **Both ends of a match must land on a word boundary in the article and in the ayah alike** —
  without that, a quote picks up the tail of the Urdu word before it (…ادراک matching the ـك of
  سبحانك) or anchors to the wrong ayah word (the و of الربوا matching وَيُرْبِي). Damaged references
  are repaired (digit-reversed / swapped / ±3 neighbours), else a long *unique* whole-Quran match is
  searched for. **4,711 of 5,127 references restored (91.9%)**; the remaining 416 stay as printed.
  Verified: all 4,711 replacements are skeleton-identical to what the book printed (so only vowels
  and orthography changed, never the wording) and all 1,668 entries' Urdu prose is byte-identical.
  Restored quotes are wrapped in **U+FDD0 / U+FDD1** in the JSON (permanent noncharacters, cannot
  collide with real text); `RootDictionary.html()` escapes first, then turns each pair into
  `<span class="rootdict-ayah">` so quotes render in an Arabic face, not Nastaliq (CSS added in all
  three stylesheets). `RootDictionary.get()` returns marker-free plain text.
  **Gotcha learned:** `sw.js` strips the query string when building its cache key, so `?v=` does
  **not** invalidate cached JSON — only bumping `data/meta/manifest.json` `version` does (now 6;
  `DATA_VERSION` in app.js now `v6`).

- **2026-07-22** **Root meanings now come from Fatuhat al-Quran** (the user's book, in
  `raw/Fatuhat-al-Quran- Final Draft.{docx,pdf}`). `scripts/build_root_dictionary.py` extracts the
  DOCX into `data/root_dictionary.json` (1.9 MB, `{source,lang,entries:{root:article}}`) — 1,668
  roots, 1,612/1,664 app keys, **98.5% occurrence-weighted coverage** of real roots. Headwords are
  found at RUN level (bold + `w:sz` 36/40/44), because the DOCX lost paragraph breaks; two source
  defects are repaired (headwords missing their first letter → supplied by the enclosing باب;
  headwords not letter-spaced), both gated on the app's known-root set. New shared loader
  `assets/root-dictionary.js` (`RootDictionary.load(basePath)` / `.html(root)`), wired into all
  three modules: Explore Quran (replaces the `meaning-chip` list; lang tabs hidden for roots,
  word glosses untouched; `root_glosses.json` no longer loaded), Explore Connections (new article
  block at the top of `wordModalBody` for `kind === "root"`), Search Quran (article at the top of
  `root-modal-body`; the one-word `rm-en` English label removed). Articles render verbatim —
  escaped and split on newlines only.
  **Known source defect:** the Arabic *inside* the articles is corrupted in both the DOCX and the
  PDF (every fatha is encoded as shadda+fatha, so genuine shadda is unrecoverable; marks also drift
  across base letters). The Urdu prose is clean. *Quoted ayaat carrying a `[S:A]` reference are now
  repaired from the repo's own text — see the entry above.* Arabic that is **not** a referenced
  quotation (isolated word forms such as صَّبرًْا at the head of an article) is still corrupt and can
  only be fixed by a clean source file from the author.

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
