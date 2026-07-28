# Quran Connect — Project Context

> **Maintenance rule (for Claude):** update this file at the end of every work session — refresh the
> "Last Changes" section (newest first, keep ~10 entries) and the "Last updated" line. This file is
> the hand-off context between Claude windows.

**Last updated:** 2026-07-28 (**New module — Tadabbur**, a reel-style, swipeable stream of the Qur'an
built to answer doomscrolling: same effortless vertical swipe as Instagram/TikTok, but every swipe
returns a *random* ayah (Arabic + the reader's chosen translation) to read and reflect on. Lives at
`tadabbur/` (`index.html` + `css/style.css` + `js/app.js`), a new 5th? — actually 6th — landing card
(inserted after Read Mushaf, before Search, with a "New" pill). First run asks the reader to pick ONE
translation from all 35 (persisted `tadabbur-translation`); ⚙ changes it any time and re-renders the
current ayah in place. Data is a slim `data/tadabbur/ayaat.json` (1.7 MB, 6236 records `{i,sn,an,s,sa,ar}`
built from `search/data/quran.json`) — deliberately NOT the 6.6 MB quran.json, for a fast first paint;
the translation text comes from the same `data/translations/<id>.json` the other modules use. Mechanics:
a Fisher–Yates **shuffle bag** (no immediate repeats, reshuffles when drained), a `history[]`+`pos`
model so swipe-down revisits and swipe-up re-advances through what you've seen. Cards are absolutely
stacked and slid with a transform transition; **cleanup runs on a `setTimeout(440ms)` timer, NOT
`transitionend`** — the latter is silently skipped when a transition is interrupted / its element is
removed / the page isn't compositing, which had frozen the reel (`animating` stuck true) in the
non-displayed preview pane. Per-card actions: Save/bookmark (heart, localStorage `tadabbur-saved`),
Share (`navigator.share` → clipboard fallback), and Open (`../explore/#SN:AN`). Urdu editions get
`.tr.rtl` (Noto Nastaliq Urdu, RTL). **Web-only so far** — user said "in my application"; Android would
follow later via the sync + a native Destination (NOT started, confirm first). New file under `/data`, so
**no manifest bump** (a brand-new path is never in any cache); module assets are fresh `?v=1`. Verified
in-browser: picker lists 35, first card renders, ArrowDown advances through 7 distinct ayaat with no
adjacent dup and leaves 1 card in the DOM, ArrowUp revisits history + ArrowDown re-advances, Save toggles
♡↔♥ + writes LS, Open href `../explore/#6:66`, and switching to `ur_maududi` re-renders the current ayah
as RTL Nastaliq. `index.html` `styles.css?v=35→36` (added `.moduleCardBadge`). Prior 2026-07-27: UI consistency pass — **Explore Ayaah Connections now opens with a
prominent top-left `← Quran Connect` back link**, like every other module. The root `index.html` is both
the landing (mood view) and Connections (research view) and shares one header; a `#backHome` button always
existed but sat on the far RIGHT, buried among 8 controls (translation select, Ideas and Topics, Prophet
Stories, Statistics, Print Notes, About, theme, status) — so users reported "no back button" in
Connections. It was moved into a new `.headerLead` cluster at the header's LEFT, beside the title, and
relabelled `← Home` → `← Quran Connect` to match the other four modules verbatim. Hidden in mood view
(`body.view-mood .backHome{display:none}`, unchanged), so the landing is untouched; in research view it
returns to the landing via `exitToMoodView`. Verified in-browser at 1280px (back at x=24, title at x=140)
and 375px (back at x=16, no overflow), and that clicking it restores mood view. Only `index.html` +
`assets/styles.css` changed (`styles.css?v=34→35`). Prior this session: **Search Quran's header rebuilt to the shared
module pattern**. It was the only module using a divergent header (an SVG-chevron "Quran Connect" link
+ a separate `☾ Keyword Search` brand block, name mismatched against the landing card's "Search Quran"
and the hero's "Search the Quran"). Now it matches Explore Quran / Read Mushaf / Root Words exactly:
a full-bleed sticky bar with a plain `← Quran Connect` back-link, `☾ Search Quran` (icon + h1), and a
circular theme toggle on the right — verified in-browser at 393px (one row) and live on Vercel prod
(`search/css/style.css?v=4`). Only `search/index.html` + `search/css/style.css` changed; committed and
deployed. Also this session: **Explore Quran now remembers the selected translations and tafsirs across
reads** (fonts/reciter already did) — persisted to `explore-translations`/`explore-tafsir` in
localStorage and validated against the loaded index on boot (a removed source is dropped; en_sahih is
the floor for translations), `explore/js/app.js?v=17`. **Android shipped in the same session as APK
1.4.1** (see the Android repo's CLAUDE.md): Read Mushaf no longer double-draws a header on the phone,
the bottom bar was rebalanced to the four distinct destinations, the drawer was grouped, and it carries
the same translation/tafsir persistence. Prior 2026-07-27: big feature session from the Zekr dataset: **29 more translations**
(10 English + 19 Urdu → **35 total**, Explore Quran), **per-ayah audio** (8 reciters, everyayah.com,
**web only** — gated off on Android), **4 more selectable Quran fonts** (self-hosted woff2, both
platforms), **complete per-sura metadata** (Makki/Madani + mushaf page, both platforms), and a new
**Read Mushaf** module — 604-page Madani-layout reader, both platforms. Asbab/"why revealed" was
**dropped** (no authentic dataset). Web committed + deployed to Vercel prod; Android shipped as APK
1.4.0. See the top Last-changes entry. Prior 2026-07-27: deployed pending root work to Vercel prod. Prior 2026-07-26:
Explore Quran showed **wrong root badges** — `search/data/word_roots.json`
had leaked a *collocating neighbour's* root onto common words (الله→و ع د, في→س و م/م ث ل, من→و ج ه,
امنوا→ٱلَّذِى, الصالحات→ع م ل …), so ~54% of ayaat / starting at Al-Fatihah 1:1 showed an irrelevant root.
**Two-part fix:** (1) `explore/js/app.js` root-badge row now renders each ayah's verified `roots` field
(the analyzequran list already in `quran.json`) instead of a per-word `word_roots` union — `app.js?v=15`
in `explore/index.html`; (2) `word_roots.json` regenerated from position-aligned per-word roots
(`data/meta/ayah_roots_analyzequran.json` zipped with the wbw words, 6,235/6,236 ayaat align; keys via the
app's exact `normalizeArabic`/`normVariants` + wa-stripped variants; non-wbw particle keys cleaned by
letter-overlap so في/و were dropped) — `word_roots.json?v=3`, 23,751 keys. Verified live: 1:1 →
[س م و، ا ل ه، ر ح م]. **Committed here** (`Use ayah.roots for root badges`) and copied verbatim to the
Android repo, shipped as signed APK 1.3.6 (v2 key, cert 7921ec06). **Deployed to Vercel prod 2026-07-27**
(`npx vercel --prod`, aliased to quran-connect-psi.vercel.app; verified live: manifest v8, `app.js?v=15`,
`word_roots.json?v=3` with الله→[ا ل ه], في dropped) — this deploy also carried the earlier undeployed
root→book audit and ص ر ط fix. Prior: 2026-07-24 root→book audit + alias map, APK 1.3.4; ص ر ط recovery, APK 1.3.3)

## What the project does

Quran Connect (live at https://quran-connect-psi.vercel.app) is a Quran study web app with five modules,
reachable from a landing page (`index.html`) with five module cards:

1. **Explore Quran** (`explore/`) — pure reading module. All 114 surahs, multi-select translations
   (**35** — see below) and tafseers (5), word & root badges per ayah (hidden behind a "Words & Roots"
   toggle). Clicking a word/root opens a modal with dictionary meanings (English + Urdu) and every ayah
   containing it. Each ayah has a "Pairs →" button and (**web only**) a "▶ Play" button; a **Fonts**
   picker (4 Arabic + 3 Urdu families) and a **Reciter** picker (8 reciters + continuous auto-advance)
   sit in the controls. Surah list/header show a Makki/Madani chip and the mushaf page. Each ayah shows
   its revelation metadata. On narrow screens the surah sidebar is a slide-in drawer opened by a
   "☰ Surahs" button (`_wireMobileSidebar` in js/app.js).
2. **Read Mushaf** (`mushaf/`) — the newest module. Reads the Qur'an page by page in the **standard
   604-page Madani mushaf layout**: exact page boundaries from Tanzil's `uthmani.page.xml`, full Uthmani
   text with ayah-end rosettes, ornamental sura header bands + bismillah, and jump-to page / sura / juz.
   Data is `data/mushaf/pages.json` (built by `scripts/build_mushaf.py`). This is a *text* pagination
   faithful to the page boundaries — not a glyph-for-glyph scan (no page-based mushaf font).
3. **Explore Ayaah Connections** (root app: `index.html` + `assets/app.js` + `assets/styles.css`) —
   deep-dive into any ayah: meaning-based & root-word pairs between ayaat, paired Hadith, tafseer,
   Words & Roots modal. Default landing shows a mood/topics browser (`body.view-mood`, headline "Ideas
   and Topics"); search opens the two-panel research view (`body.view-research`). Supports `/?ayah=SN:AN`
   and `/?root=<spaced letters>` deep links (the latter opens the root modal, used by the directory).
4. **Search Quran** (`search/`) — Google-like search grounded ONLY in the Quran (hadith removed
   entirely). BM25 + Arabic root matching + semantic rerank via serverless API. Also has a multi-turn
   **chat mode** ("Ask") grounded in retrieved ayaat with citation validation (`api/chat.js`).
5. **Root Words Directory** (`roots/`) — every root analyzequran finds, in one searchable list
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

- **2026-07-28 — New module: Tadabbur (web only).** A reel-style, swipeable stream of the Qur'an built
  to answer *doomscrolling* — the user wanted a module that reuses the muscle-memory of
  Instagram/TikTok reels (effortless vertical swipe, "one more", variable reward of not knowing what's
  next) but returns the Qur'an to read and reflect on. Every swipe shows a **random** ayah with the
  reader's chosen translation. Named "Tadabbur" (the user picked it); card content = Arabic +
  translation; swipe = vertical; actions = Save / Share / Open (all per the user's answers).
  - **Files:** `tadabbur/{index.html, css/style.css, js/app.js}` + a slim `data/tadabbur/ayaat.json`
    (1.7 MB, 6236 records `{i,sn,an,s,sa,ar}` = id, surah#, ayah#, transliterated + Arabic surah name,
    Arabic text). **Built from `search/data/quran.json`** (stays 6236 canonical order):
    `node -e "const q=require('./search/data/quran.json'); const out=q.map(r=>({i:r.id,sn:r.sn,an:r.an,s:r.snr,sa:r.sna,ar:r.ar})); require('fs').writeFileSync('data/tadabbur/ayaat.json', JSON.stringify(out));"`.
    Deliberately NOT the 6.6 MB quran.json — a slim file gives the reel a fast first paint; the
    translation text still comes from the shared `data/translations/<id>.json`.
  - **Landing card:** new `<a href="tadabbur/">` module card in `index.html`, inserted after Read Mushaf
    / before Search, carrying a **"New" pill** (`.moduleCardBadge`, new CSS in `assets/styles.css`).
  - **First run** asks the reader to pick ONE translation from all 35 (grouped English / Urdu in the
    picker); persisted to `tadabbur-translation`. The ⚙ button reopens the picker any time and
    **re-renders the current ayah in place** (`rerenderCurrent`) with the new edition — Urdu editions
    get `.tr.rtl` (Noto Nastaliq Urdu, RTL).
  - **Randomness:** a Fisher–Yates **shuffle bag** (`refillBag`/`nextRandomIndex`) — no immediate
    repeats, reshuffles when drained. A `history[]` + `pos` model means swipe-down (ArrowUp) revisits
    the previous ayah and swipe-up (ArrowDown) re-advances forward through what you've already seen
    before drawing a new random one.
  - **Animation gotcha (important):** cards are absolutely stacked and slid with a transform transition;
    cleanup runs on a **`setTimeout(440ms)` timer, NOT `transitionend`**. `transitionend` is silently
    skipped when a transition is interrupted, its element is removed, or the page isn't compositing —
    which froze the reel (`state.animating` stuck `true`, blocking all further nav) in the
    non-displayed preview pane. The timer is robust to all three.
  - **Actions per card:** Save/bookmark (heart ♡↔♥, localStorage `tadabbur-saved` array of "sn:an"),
    Share (`navigator.share`, clipboard fallback → toast), Open (an `<a href="../explore/#SN:AN">`
    into Explore Quran at that ayah). Gestures: touch swipe (rubber-band + `edgeAllows` edge-gating so
    long ayaat scroll before they navigate), wheel, ArrowUp/Down/Space.
  - **Cache/versioning:** `data/tadabbur/ayaat.json` is a brand-new `/data` path (never in any sw
    cache), so **no `manifest.json` bump needed**; module assets are fresh `?v=1`; `index.html`
    `styles.css?v=35→36` for the badge CSS.
  - **Verified in-browser** (served tree, real gestures via keyboard/JS): picker lists 35 editions;
    first card renders with Arabic + Sahih Intl; ArrowDown advances through 7 **distinct** ayaat, **no
    adjacent duplicate**, leaving exactly 1 card in the DOM; ArrowUp revisits history and ArrowDown
    re-advances to the same next card; Save toggles ♡↔♥ and writes localStorage; Open href
    `../explore/#6:66`; switching to `ur_maududi` re-renders the current ayah as RTL Nastaliq Urdu.
  - **Android:** not started. This was framed "in my application" (web); Tadabbur would later reach the
    phone via `tools/sync_web_assets.py` (add `tadabbur/*` + `data/tadabbur` to TREES) plus a native
    `Destination` — **confirm with the user before doing that work.**

- **2026-07-27 — UI consistency + persistence pass (web + Android APK 1.4.1).** Two threads.
  **(1) Web — Search Quran header normalized.** Search Quran was the only module drawing a *divergent*
  header: a `.header-left` with an SVG-chevron "Quran Connect" link plus a separate `☾ Keyword Search`
  `.brand` block, and its name disagreed three ways (landing card "Search Quran", hero "Search the
  Quran", header "Keyword Search"). Rebuilt to the exact shared pattern the other four modules use — a
  full-bleed sticky bar (`display:flex; height:var(--header-h)`) with a plain `← Quran Connect`
  `.back-link`, a `.header-title` (`☾` `.header-icon` + `<h1>Search Quran</h1>`), and a circular
  `.theme-toggle` in `.header-actions`; dropped `.header .container`/`.header-left`/`.back-home-link`/
  `.brand`/`.theme-btn`. Only `search/index.html` + `search/css/style.css` changed (`style.css?v=4`).
  Verified in-browser at 393px (one row) and live on Vercel prod. Committed `e879e27`, deployed.
  **(2) Both platforms — translations & tafsirs now persist across reads.** Explore Quran already
  remembered fonts/reciter but reset the translation and tafsir selection to `['en_sahih']`/`[]` every
  visit. Now `_toggleTranslation`/`_toggleTafsir` write `explore-translations`/`explore-tafsir` to
  localStorage (JSON arrays); the constructor restores them via a new `_loadIds(key, fallback)` helper
  (corrupt/non-array → fallback), and `init()` **validates against the loaded index** after fetch —
  any id whose source no longer exists is dropped, and if translations empties, `en_sahih` is restored
  as a floor. `_renderControlPanels` now ticks the tafsir checkboxes from `selectedTafsir` (was
  hardcoded `false`) and seeds both count badges from the restored selection. `explore/js/app.js?v=17`.
  Verified in-browser: toggled a 2nd translation + a tafsir → localStorage written → reload restored 2
  checked / 1 checked, counts 2/1, Yusuf-Ali text + tafsir rendered, no console errors. **No `/data`
  file changed, so no manifest bump** — the `?v=17` bump busts app.js.
  **Android (APK 1.4.1, versionCode 12 — same session):** (a) Read Mushaf's WebView no longer
  double-draws a header — the sync now appends `../assets/android.css` to `mushaf/index.html` (new
  PATCHES entry) as the other readers already had, and android.css pins the mushaf `.toolbar` at
  `top:0` (it reserved room for the now-hidden `var(--header-h)` header). (b) Bottom bar reduced from
  six items to the app's **four distinct destinations** (Explore Quran · Read Mushaf · Connections ·
  Root Words); Prophet Stories + Ideas and Topics — which are Connections *modes*, not destinations —
  moved to the drawer. (c) New `immersive` flag on `Destination` hides the bottom bar on the two
  full-screen readers (Explore Quran, Read Mushaf) so the ayah text gets the whole height; the ☰ drawer
  is still one tap away. (d) Drawer grouped into **Read / Explore / Library / App** sections
  (`DrawerSection` enum + `drawerSections` grouping) and made vertically scrollable. (e) Same
  translation/tafsir persistence via the synced `app.js?v=17` (sync anchor bumped 16→17). Rebuilt +
  V2-signed with the unchanged v2 release key (SHA-1 `d81d0f12…`), so 1.4.0→1.4.1 upgrades cleanly.

- **2026-07-27 — Big feature session from the Zekr dataset (`D:\Users\asadi\Documents\GitHub\Zekr`,
  user-supplied, "no copyright issue"): translations, audio, fonts, metadata, and a new Read Mushaf
  module. Shipped web (Vercel prod) + Android APK 1.4.0.** The user asked for six things "both
  platforms" and answered clarifiers: Asbab/"why revealed" → **drop if no dataset** (dropped — no
  authentic source); Mushaf → **build if a complete readable dataset exists** (built as a 604-page
  text pagination); Fonts → **bundle all**.
  1. **All translations (both platforms).** `scripts/build_zekr_translations.py` converts Zekr
     `.trans.zip` packs (each a 6236-line UTF-8 txt in canonical 1:1→114:6 order + a
     `translation.properties`) into `data/translations/<id>.json` keyed `"sn:an"` and registers them in
     `data/translations/index.json`. **29 added (10 English, 19 Urdu) → 35 total.** The converter
     hard-asserts `len==6236` (that equality is the position-alignment guarantee — a split would give
     >6236, a merge <6236); interior blank lines are kept as empty strings (legit untranslated ayaat).
     Transliteration packs have their HTML tags stripped + entities unescaped (the reader escapes text).
     Explore Quran's multi-select panel already handled an arbitrary count, so no reader change was
     needed. **Android gets these free** via the WebView reader (sync copies `data/translations`).
  2. **Per-ayah audio — WEB ONLY (8 reciters).** `explore/js/app.js` gained a `RECITERS` list
     (everyayah.com per-ayah MP3, filename `%03d%03d.mp3`), a **Reciter** picker + "continuous
     auto-advance" checkbox, and a "▶ Play" button on every ayah card. **Gated off on Android**
     (`this.isAndroid = !!(window.QuranAndroid && window.QuranAndroid.share)`; `_renderAudioPanel`
     returns early and the play button is omitted) because the app ships with **no INTERNET
     permission**. Verified live: 1:1 → `Alafasy_128kbps/001001.mp3`, currentTime advancing.
  3. **4 more selectable Quran fonts (both platforms).** `assets/quran-fonts.css` self-hosts, as WOFF2
     in `assets/fonts/`, four faces the base six don't include — **Al Mushaf** & **Noore Huda** (Arabic),
     **Jameel Noori Nastaleeq** & **Alvi Nastaleeq** (Urdu) — so the same stylesheet works on web and in
     the app with nothing for the sync to patch. Explore Quran's new **Fonts** picker (two radio groups)
     points `--font-ar` / `--font-ur` at a family and persists to `explore-font-ar/-ur`. These faces come
     from the user's Zekr collection; **their licensing is the user's to determine** (noted in the CSS).
  4. **Complete per-sura metadata (both platforms).** `scripts/build_sura_meta.py` →
     `data/meta/sura_meta.json` (114 records: Arabic/English/transliterated name, ayah count,
     **Makki/Madani**, and first **mushaf page**) from Zekr's `quran-properties*.xml` + `uthmani.page.xml`
     (86 makki / 28 madani). Explore Quran shows a revelation chip + mushaf page in the surah list/header.
  5. **New Read Mushaf module (both platforms).** `mushaf/` (`index.html` + `css/style.css` +
     `js/app.js`) reads the Qur'an page by page over the **standard 604-page Madani layout**.
     `scripts/build_mushaf.py` → `data/mushaf/pages.json` (1.5 MB): page boundaries from Tanzil's
     `uthmani.page.xml` (604 pages + a fake 605th end marker), Uthmani text from the already-canonical
     `search/data/quran.json`, each ayah assigned to the page whose start..next-start range contains it
     (whole ayaat per page). Verified the boundaries match a real mushaf: p2 = Al-Baqarah 2:1–2:5,
     p50 = Aali Imran 3:1, p582 = juz 30, p604 = 112:1→114:6 with three bismillahs. Sura bands +
     bismillah (skipped for Al-Fatihah, whose bismillah is ayah 1, and At-Tawbah, which has none),
     ayah-end rosettes with Arabic-Indic numbers, jump-to page/sura/juz, its own Arabic-font picker,
     shared theme + RTL arrow keys (← next). New landing card (2nd, after Explore Quran). **It is a
     *text* pagination faithful to the page boundaries — NOT a glyph-for-glyph scan** (there is no
     page-based mushaf font in the dataset); flagged as such on delivery. **If pages.json is ever
     rebuilt, use `build_mushaf.py` — it depends on quran.json staying 6236 ids in canonical order.**
  Cache-bust: `data/meta/manifest.json` **8 → 9** (busts every new/changed `/data` file — mushaf,
  sura_meta, translations — through the service worker); `explore/index.html` `css/style.css?v=7→8`,
  `js/app.js?v=15→16`. **Android:** `tools/sync_web_assets.py` gained `mushaf/*`, `data/mushaf`,
  `assets/quran-fonts.css`, `assets/fonts` in TREES, a mushaf Google-Fonts→bundled patch, and its
  explore patch anchors were bumped to v8/v16 (a stale anchor is a hard sync error). New `ReadMushaf`
  destination (`Destinations.kt`, drawer only) + string; routing is data-driven so the WebView renders
  it with no further wiring. APK **versionCode 11 / versionName 1.4.0**. **Do not forget:** the four
  new WOFF2 fonts merge *under* the overlay's TTFs (different filenames — both survive); if the sync
  ever rmtree's mid-run this could regress.

- **2026-07-26 — Wrong root badges in Explore Quran fixed (shipped Android APK 1.3.6).** Inspecting
  Al-Fatihah 1:1 showed root badge **و ع د** ("promise") on بِسْمِ ٱللَّهِ… — irrelevant.
  `search/data/word_roots.json` (word → roots, read ONLY by Explore Quran's per-word badge/modal code)
  had **leaked a collocating neighbour's root onto common words**: الله→[ا ل ه, **و ع د**] (from
  "وَعَدَ اللهُ"), في→[**س و م, م ث ل**], من→[م ن ن, **و ج ه**], امنوا→[ا م ن, **ٱلَّذِى**],
  الصالحات→[ص ل ح, **ع م ل**], الصلاة→**ق و م**, الزكاة→**ا ت ي**, وعد→**ك ف ر** … 19 words / 21 bad
  pairs. As these are the highest-frequency words, **3,383/6,236 ayaat (54%)** showed ≥1 wrong badge.
  The other three modules were unaffected — they use the correct per-ayah `roots` field from
  `quran.json` (via `build_search_data.py`'s `roots_lookup`), which aggregates the same CSV *by ayah*
  and dedups, hiding the misaligned per-word rows. **Fix, two parts:**
  1. **Badge row uses the ayah's own roots.** In `explore/js/app.js` the root-badge row was
     `∪ word_roots[normVariants(word)]`; it now renders `ayah.roots` (already on every `quran.json`
     record, identical to what Connections shows). Removes the word-union for badges entirely.
  2. **`word_roots.json` regenerated correctly.** Root cause: it was built (in `build_search_data.py`)
     from `Root Words.csv` rows, some of which pair a word with a neighbour's root. Rebuilt instead
     from `data/meta/ayah_roots_analyzequran.json` (roots listed in **word order**) zipped with the
     wbw words — **6,235/6,236 ayaat align 1:1** (only 20:94, the analyzequran +1 correction, differs);
     each word gets exactly its position-aligned root(s), union across occurrences. Keys use the app's
     exact `normalizeArabic`/`normVariants` (mark ranges U+0610–061A, U+064B–065F, U+06D6–06ED, U+0640;
     dagger-alef 0670 kept) plus `stripWaPrefix` variants so every reader lookup resolves. Non-wbw keys
     (particles analyzequran leaves rootless) carried over from the old file but cleaned by a
     letter-overlap rule (drop a root sharing ≤1 letter with its word) — في and و ended up rootless and
     were dropped. Result: **23,751 keys**, الله→[ا ل ه], من→[م ن ن], all 21 spurious pairs gone, no
     legitimate word lost a key. Verified live in-browser (served tree, real `normVariants`).
  Cache-bust: `explore/index.html` `app.js?v=14→15`, `app.js` `word_roots.json?v=2→3`. **Both files
  committed here and copied verbatim to the Android repo** (targeted copy, not a full re-sync).
  **Deployed to Vercel prod 2026-07-27** (`npx vercel --prod`) — live users now get the fix; the same
  deploy also shipped the earlier undeployed root→book audit and ص ر ط recovery. **If `word_roots.json`
  is ever rebuilt from the CSV again the leak returns — regenerate from `ayah_roots_analyzequran.json`
  instead, or fix `build_search_data.py`'s word-level source.**

- **2026-07-24** **Root→book audit finished across the whole 1,664-root list** (the task the ص ر ط
  fix below opened). ص ر ط was one symptom of a general gap: 44 app roots had no book page. Reading
  the book chapter by chapter showed **35 of them do have an article** — the book just files the root
  under a spelling the automatic headword scan can't reach: a different weak letter (app ر ض و = book
  ر ض ي, غ ش و = غ ش ي, ن ص ي = ن ص و, ن د و = ن د ي, ه ز ا = ه ز ء …), a shorter or augmented root
  (ب ر ه ن = ب ر ه, ا ز ز = ا ز, ذ ب ذ ب = ذ ب ب, د س و = د س س), a related root the word actually sits
  under (ق س ط س قسطاس → ق س ط, ع ر ج ن عرجون → ع ر ج, ت ر ق تراقي → ر ق ي, ن و س الناس → ا ن س), a
  biliteral-extracted trilateral (ت ر ك, ا ر ك), or a proper-noun / loanword sub-entry (آدَم→ا د م,
  آزَر→ا ز ر, إِبْلِيس→ب ل س, إِسْتَبْرَق→ب ر ق, أَبَارِيق→ابریق, أَمْس→ا م س; and **ا ب و**, "father",
  117 occ — the biggest miss — under the book's own headword "أ ب / أ ب و" on p9). Each mapping was
  read off the page by hand, `[page, y]` and all. **New mechanism:** `scripts/book_root_aliases.json`
  (35 entries, each with a provenance comment) plus a new `apply_aliases()` in
  `scripts/build_book_pages.py` that adds an alias **only if** the key is in `root_counts.json` and the
  scan didn't already find it — so it can't invent or overwrite an entry. Rebuilding `book_index.json`
  added exactly those 35 keys (0 removed, 0 changed) and dropped `first` 10 → 9 (p9 now published, so
  **p009.webp was rendered** — the only new image). App-root coverage **1,620 → 1,655 / 1,664**. The
  remaining **9 are genuinely absent** and left unmapped on purpose: the five relatives/particles
  (ٱلَّذِى, إِلَىٰ, إِذَا, إِذ, إِذًا — not roots) and ز ي ل / س و ل / ن و ن / ك ب ك ب (the book has no
  article for them — e.g. it has only ز و ل, not يزال/زيّل). `data/root_directory.json` (web, 1,655
  with a page) and the Android native one both rebuilt; `data/meta/manifest.json` **7 → 8**. **Synced
  to Android and shipped as signed APK 1.3.4** (versionCode 8) — see the Android repo's CLAUDE.md.
  **Web deploy to Vercel still pending** (carries this + the 1.3.3 ص ر ط fix).

- **2026-07-24** **The book index now finds the root ص ر ط (ṣ-r-ṭ, "path" — as in ٱلصِّرَٰطَ
  ٱلْمُسْتَقِيمَ, 1:6).** Its root modal in every module wrongly said "not in the book's dictionary",
  though the book plainly has the article (printed page 240). Cause: the same PDF text-layer corruption
  documented above — the isolated headword drew clean but *extracted* as `ص ر ط۔`, a full stop
  (U+06D4) glued onto the final ط. `scripts/build_book_pages.py`'s `SPACED` headword pattern is
  end-anchored (`…\s*$`), so the trailing punctuation made it reject the line and the root fell into
  the "45 not located" bucket. Fix: a new `HEAD_TRIM` constant (`۔،؛؟:.`, defined so the Arabic marks
  survive tool edits) is stripped from both ends of each line before the `SPACED` match —
  `SPACED.match(txt.strip(HEAD_TRIM))`. This only ever *adds* matches (a clean headword has nothing to
  trim), so it can't regress: rebuilding `data/book_index.json` added exactly `ص ر ط → [245, 0.5428]`
  (printed p.240) and changed nothing else; app-root coverage 1619 → 1620. `data/root_directory.json`
  rebuilt too (its one changed row, `ص ر ط`, gained `p: 240`). `data/meta/manifest.json` version
  **6 → 7** so the service worker refetches the changed `/data` JSON (a `?v=` bump does nothing there).
  **Synced to Android and shipped as APK 1.3.3** (the Android native `root_directory.json`, built by
  its own `tools/build_root_directory.py` from the synced `book_index.json`, picked up the page the
  same way); that APK also carries the new launcher icon (see the Android repo's CLAUDE.md).

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
