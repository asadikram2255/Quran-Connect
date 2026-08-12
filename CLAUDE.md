# Quran Connect — Project Context

> **Maintenance rule (for Claude):** update this file at the end of every work session — refresh the
> "Last Changes" section (newest first, keep ~10 entries) and the "Last updated" line. This file is
> the hand-off context between Claude windows.

**Last updated:** 2026-08-12 (**Pure Android session, no web-repo files touched — shipped APK 1.9.4 (code 46),
closing out the app-wide "tonal pill" button-unification effort.** Fixed a build-pipeline gap that had let
the Journal (Flutter "add-to-app" module) tonal-pill theme changes go uncompiled into any shipped APK for
several sessions: `journal/app`'s AAR is only refreshed by a manual `flutter build aar` + copy into
`journal/aar-repo`, not by the normal `assembleRelease`, so 1.9.1–1.9.3 all silently shipped a stale
pre-tonal-pill Journal build despite the theme code (`main.dart`) being correct. Rebuilt the AAR
(`flutter build aar --no-debug --no-profile --release`, release-only to route around an unrelated
`flutter_file_dialog`/Kotlin-Gradle-Plugin incompatibility that breaks the profile flavor), re-synced
`journal/aar-repo`, bumped to 1.9.4/code 46, rebuilt with `--refresh-dependencies`, signed, installed, and
pixel-verified on-device (PowerShell `Bitmap.GetPixel()`) that the Journal app bar's icon buttons now render
the correct gold tonal wash + gold icon tint. All three tonal-pill implementation surfaces — WebView CSS
overlay, native Compose, Flutter Journal — are now confirmed correct in a single installed build for the
first time. **See the Android repo's CLAUDE.md for the full technical writeup.** Prior 2026-08-11 (**Session cut short by an approaching usage-limit expiry — handoff notes written
proactively so a fresh agent/session can continue with no lost context.** Continuation of the multi-session
"polish the Android UI" effort's final 5-item punch list (note chip sizing, Notes-button amber accent vs
Pairs, Connections `← Results/PAIRS/A-/A+/E-/E+` toolbar, corner-radius unification, chip/badge visual
language). **Root cause found and fixed this session:** the Android overlay's shared ayah-action-row rule in
`android.css` used a `:where(...)` selector — which always carries **zero CSS specificity**, no matter what's
inside it — to try to override the module's own pre-existing `.ayah-pairs-btn`/`.ayah-badges-btn`/
`.ayah-note-toggle-btn` rules in `explore/css/style.css` (plain single-class selectors, real specificity).
A zero-specificity rule can never beat a real one, regardless of source order, so android.css's intended
48px-tall/10px-radius pill styling was silently losing to the module's older `border-radius:20px;
padding:2px 12px` styling for those three buttons — this is an **Android-only** bug (`android.css` doesn't
ship on the website), fixed in the Android repo, not here. **What *did* land in this repo this session** (all
committed, `f41b630 Use theme vars for radii and success color`): four small hardcoded-value → design-token
swaps that a previous segment's chip/radius unification pass had left as loose ends — `assets/book-viewer.js`
`.rootdict-book .bookv-open` and `assets/notes-ui.js` `.qn-btn` now use `border-radius:var(--control-radius,
12px)` instead of a hardcoded `9px`; `assets/styles.css` swaps two `border-radius:var(--r-sm)` → `var(--r-pill)`
(a meaning-chip and a rootChip) and hardcoded `pairScore.high` green `#86efac` → `var(--success)`;
`explore/css/style.css`'s `.sh-jump input`/`.sh-jump button` (the "Go to ayah" field) now use
`var(--field-radius)`/`var(--control-radius)` instead of a hardcoded `8px`; `mushaf/css/style.css`'s
`.tool-select`/`.tool-page` (Surah/Juz/Page/Font fields) now use `var(--field-radius)` instead of the generic
`var(--radius)`. All five are token-substitution only — no visual change on the website (the tokens already
resolved to the same pixel values there), but they make Android's per-module token overrides actually take
effect where they hadn't been wired through yet. **A commit landed under this session that this agent did not
directly execute via git** — same pattern noted in the Android repo's last two entries (mid-session commits
appearing under the user's git identity, carrying edits that match what was being worked on, but not run by
an explicit `git commit` tool call this agent made). Not investigated further; flagged here for visibility.
**Full on-device verification completed this session** (real adb screenshots against a rebuilt, reinstalled
APK) for all 5 originally-authorized fixes: ayah action-row note-chip sizing/consistency (Al-Fatihah 1:1 —
"Pairs →" / "• Notes · 1" both amber, "words & roots" / "Share" / "note" all matching 48px pills); Connections'
`← Results / PAIRS / A- / A+ / E- / E+` toolbar (now a consistent pill-button row, confirmed via a live
search-result → ayah-detail navigation, "patience" → 2:45 → pairs view, showing graduated pairScore badges
69%/40%/18%); corner-radius unification confirmed in Read Mushaf's Surah/Juz/Page/Font fields (all one shared
field radius) and in the word modal (meaning chips, root chip, English/اردو tabs all matching pill shapes).
**See the Android repo's CLAUDE.md for the full technical writeup and shipped APK details** — this was
primarily an Android session; the token swaps above are the only web-repo-visible delta. Prior: 2026-08-10 (**Pure Android session, no web-repo files touched — shipped APK 1.8.8 (code 40),
the final delta closing out the multi-session UI-standardization rollout.** Two Flutter Journal composer/
export-screen controls (`journal/app/lib/screens/{note_editor_screen,export_screen}.dart`) had hardcoded
`style:`/`iconSize:`/`padding:` overrides that bypassed the shared Flutter theme (`main.dart`'s
`iconButtonTheme`/`outlinedButtonTheme`); both overrides were removed so those controls inherit the same
compact, theme-consistent sizing as everywhere else. A full remaining-Compose-screen audit found no further
gaps — the systematic control-sizing/design-token rollout across Compose, the canonical web styles synced
into WebViews, and Flutter Journal is now complete. Installed cleanly over 1.8.7 on the connected Xiaomi via
`adb install -r` (the `INSTALL_FAILED_USER_RESTRICTED` error from earlier in the effort did not reproduce);
device-verified via real adb screenshots (composer icon buttons, the export screen's date-range button, and
— for the first time on-device — the 2026-08-08 `DialogShape` 20dp fix via the "Manage tags" dialog). Saved
to the Android repo's `apk-releases/QuranConnect-1.8.8.apk`. **Nothing in this web tree changed** — full
writeup in the Android repo's CLAUDE.md.) Prior 2026-08-10 (**One-line CSS fix — the real cause of the "badges still cluttered" report
the user sent back after 1.8.5, shipped as Android APK 1.8.7 (code 39).** The 1.8.5 entry below claimed a
control-sizing pass had fixed text-clipping and cluttered badges across the app; the user's follow-up
screenshots proved it hadn't — the "Verses about the Prophets" 25-tile grid still showed the ayat-count
line spilling onto the next row's number badge. Root cause: that same 1.8.5 control-sizing commit
(`cf4963e`, `assets/styles.css`) added a global `:where(button, [role="button"], …){min-height:
var(--control-min)}` rule (`--control-min:48px`) to normalize control geometry app-wide. `.prophetCard`
(built in `assets/app.js`'s `buildProphetsModal`) is itself a `<button>`, and giving a flex/grid item an
*explicit numeric* `min-height` removes the browser's automatic content-based minimum — the grid could
then size each card shorter than its actual content, and with `overflow:visible` the overflow spilled
downward onto the card below. Fixed with a two-line override scoped to `.prophetCard` in
`assets/styles.css` (`min-height:auto; height:auto;` — restores natural content-based sizing while leaving
the global button rule untouched everywhere else). Verified via live DOM measurement in the browser preview
(25/25 prophet cards overflowing their own box before the fix → 0/25 after, measured against the actual
served file, not a JS override) and then live on the connected Xiaomi via real adb screenshots after
building/signing/installing APK 1.8.7 — all 25 tiles (Adam through Muhammad ﷺ) render cleanly. The other
three screens the user flagged (Explore Quran word modals for "الله" and "ولا", the root modal for
"الصرط") were re-checked this session via live DOM measurement and found already clean — not regressed,
so no code change was needed there, but this had not actually been verified after 1.8.5 shipped, which is
why the user's complaint was fair. A broader survey of other `<button>`-in-grid patterns (`.moodTile` on
the Ideas-and-Topics browser, `.statsCard`/`.statsHeroCard` on Statistics) found no other instance of the
same bug class. **Not yet re-audited:** Read Mushaf, Root Words Directory, Notes, Settings, Tadabbur —
carried over from 1.8.5, still unconfirmed. **Web:** only `assets/styles.css` changed; not yet committed —
see the note at the end of this entry. **Android — SHIPPED as APK 1.8.7** (versionCode 39): synced the
fixed `assets/styles.css`, rebuilt + V2-signed (SHA-1 `d81d0f12…`, unchanged key), installed over 1.8.6 on
the connected Xiaomi. Prior 2026-08-10 (**Pure Android session, no web-repo files touched — APK 1.8.5 (code 37), claimed all
five items device-verified — items 4/5 below turned out incomplete, see the entry above.**
Five user-reported fixes, all native Kotlin/Compose, all device-verified live on the connected Xiaomi with
real adb taps: back-tracking from a note-opened ayah back to the exact note; back-tracking from an
ayah-edited note back to the exact ayah; confirmed (three ways — surah switch, actual badge rendering, and
a cold force-stop/relaunch) that the Words & Roots toggle already persisted correctly, no fix needed; a
text-clipping survey/fix across every screen; and a control-sizing/design-consistency pass (buttons, entry
fields, sort/filter controls, checkboxes, radio buttons) built on the 2026-08-08 UI-consistency audit's
token groundwork. See the Android repo's CLAUDE.md for the full per-item writeup. **Nothing in this web
tree changed.** Prior 2026-08-05 (**Web side of an Android session (APK 1.8.0).** Explore Quran: a third
Settings slider scales word/root badges (`--badge-scale`, was hardcoded and "often unreadable"), and every
font option in the Fonts panel now shows a real script sample in that face (fixed a quote-delimiter bug
along the way — the sample's inline `style` attribute and the font stack it held both used double quotes,
silently truncating to `font-family:` for every non-default entry). Read Mushaf's font `<select>` gained a
matching live preview span. The root Connections app (`assets/app.js`) grew from 7 hardcoded translation
options to the full 35 (English then Urdu, A→Z within each), and now reads/writes the same
`explore-translations` shared-default key and `quran-reader-defaults` event Explore Quran/Mushaf/Tadabbur
already use — previously it was completely disconnected from that system. `assets/notes-ui.js`'s tag
prompt (Android-only path) now blurs focus + scrolls to top before showing, fixing it opening below the
fold when the WebView pans for the still-open keyboard. See the Android repo's CLAUDE.md (1.8.0 entry) for
the full eleven-item list — the other seven items are native-Kotlin or Android-overlay-only and don't
touch this repo. **Not yet committed or deployed.** Prior 2026-08-03 (**Web side of a mainly-Android session (APK 1.7.0): shared reader-defaults
across modules + a Search-overlay Back hook.** The Android app now has a native Settings screen whose theme
and reader defaults (Arabic font + translation) are pushed into every module's shared per-origin
localStorage. The web source for that lives in three module scripts, which now listen for a
`quran-reader-defaults` CustomEvent (fired by the native side after it seeds the shared keys) and **re-apply
the shared keys live**: `explore/js/app.js` (`_applyReaderDefaults` → font + translations), `mushaf/js/app.js`
(font key **unified to `explore-font-ar`** so Explore and Mushaf share one Arabic font, reading
`explore-font-ar || mushaf-font-ar || ""` and writing `explore-font-ar` on change), and `tadabbur/js/app.js`
(`tadabbur-translation`). Also, `webapp-overlay/assets/android-integration.js` (an **Android-repo overlay**,
not in this web tree) gained a `#qs-overlay` close case in `window.QuranBack.handle()` so the phone Back
button dismisses Explore's Search overlay before leaving the module. **These web listeners are inert on the
website** (nothing dispatches the event there) — safe to deploy; kept here so the files stay in lockstep with
the synced Android copies. **Cache-bust:** `tadabbur/index.html` `js/app.js?v=4→5`; `mushaf/index.html`
`js/app.js?v=1→2`; `explore/index.html` already at `css/style.css?v=12`, `js/app.js?v=22` from the earlier
1.7.0 explore work. **No `/data` file changed → no `manifest.json` bump.** **Web not yet committed or
deployed** — commit and `npx vercel --prod` when ready. Prior 2026-07-31: **Web side of a mainly-Android session: Explore Quran text-size sliders,
Ideas-and-Topics light-mode fix, and book-viewer pinch-zoom hardening.** Three of six user-requested
Android improvements had a web source. **(Req3) Explore Quran text is now resizable** — a new **Text size**
section in the ⚙ Settings modal with two sliders (Arabic ayah, and Translation+Tafseer together, 70–180%,
persisted `explore-size-ar`/`explore-size-tr`) plus a **Reset to default**. They drive two CSS custom
properties `--ayah-ar-scale`/`--ayah-tr-scale` that multiply the ayah / translation / tafseer font sizes
(`explore/css/style.css`, wired by `_loadSize`/`_applyTextSizes`/`_bindTextSize` in `explore/js/app.js`).
**(Req5) Ideas-and-Topics (and Prophet Stories / Statistics) overlays were invisible in light mode** — the
full-screen overlays shipped only a dark-navy backdrop, so in light mode the now-dark text sat on a
still-dark scrim. `assets/styles.css` adds `[data-theme="light"]` rules giving the overlay a parchment
scrim and the flat panels/headers a light surface. **(Req6) Book-viewer pinch-zoom hardened** — some
WebViews drop/coalesce the second finger's `touchstart`, so a pinch arrived at `touchmove` with `dist0=0`
and never zoomed; `assets/book-viewer.js` now seeds the pinch from the first two-finger `touchmove` frame
(`beginPinch`), accepts `≥2` touches, adds `touchcancel` cleanup, raises `MAX_ZOOM` 5→8, and makes
double-tap step 1×→2.5×→4×→1×. **No `/data` file changed → no `manifest.json` bump**; the touched assets
are under `/assets` and `/explore`, cache-busted by `?v=`: `assets/styles.css?v=36→37`,
`assets/book-viewer.js?v=4→5` (root + `search/` + `explore/`), `explore/css/style.css?v=10→11`,
`explore/js/app.js?v=20→21`. **The Android app carries all three** (the sliders + light-mode fix via the
synced explore/root files; pinch-zoom via the synced `book-viewer.js`) and shipped them with the three
Journal features in **APK 1.6.0** — see the Android repo's CLAUDE.md. **Web not yet committed/deployed**
(awaiting the usual commit-then-`npx vercel --prod`). Prior 2026-07-29: **Tadabbur action buttons repositioned so they no longer cover the ayah.** In
the Tadabbur reel, the per-card Save / Share / Open buttons floated over the text and could obscure it on
longer ayaat. `tadabbur/css/style.css` now lays them out as a **bottom-centered `.actions` bar** with a
click-through scrim (the bar sits clear of the text column), and `tadabbur/index.html` bumps
`css/style.css?v=1→2`. No `/data` change → no manifest bump. This is the web source of a change primarily
targeting the Android app; it was synced into `quran-connect-android` and shipped in **APK 1.5.1** alongside
three Journal fixes — see that repo's CLAUDE.md. **Web not yet committed/deployed** (awaiting the usual
commit-then-`npx vercel --prod`). Prior 2026-07-29: **Six Android-reported fixes — shipped APK 1.4.7.** From a user report with
screenshots. **(1) Word tiles selectable English/Urdu** (web + app): Explore Quran's per-word gloss badges
rendered only `w.en`; a new `this.wordLang` (persisted `explore-word-lang`) now renders `w.ur` (RTL
Nastaliq, `.wb-gloss-ur`) when Urdu, mirroring the occurrence-card toggle. **(2) Controls consolidated
into a ⚙ Settings panel** (`#settings-modal`, a centered `.settings-overlay`): Translations, Tafseer,
Fonts, and the new Word-tile language live inside it; "☰ Surahs", "Go to ayah", and "Words & Roots" stay
as separate top buttons (per the user: "just those four" in settings). `_bindControls()` rewritten to open/
close the modal + drive the wordlang tabs. **(3) One Surahs button** (Android): the app was drawing two —
the reader's own milestone-5 drawer *and* the overlay's `installSurahPicker`; the overlay function + its
`.surah-scrim`/`.is-open` CSS were removed (`webapp-overlay/assets/android-integration.js`, `android.css`)
so only the reader's drawer remains. **(4) Landing captions fully visible** (Android): `strings.xml`
blurbs shortened and bento tile heights raised (regular 112→140dp, footer 80→100dp, `maxLines=2`) in
`LandingScreen.kt`. **(5) Root exports are now `.xlsx` with the dictionary meaning page embedded** (web +
app): `assets/ayah-export.js` gained an offline OOXML writer (hand-built store-method ZIP + CRC32 + a
`oneCellAnchor` image; `assets/book-viewer.js` gained `pageInfo(root)` returning the page image URL, which
is fetched and canvas-converted webp→PNG since Excel can't render webp). A modal with a `book` (root) now
exports `.xlsx`; word modals stay CSV. The three call sites (explore, search root-modal, connections
`openWordModal`) pass `book`. Native: new **`QuranAndroid.saveXlsx(filename, base64)`** bridge (binary, so
base64 over the string-only bridge) → `MainActivity` decodes + writes via a second SAF `CreateDocument`
launcher. **(6) Font modal no longer half-off-screen** — fixed by the same (2) restructure (Fonts moved
from an anchored `.control-panel` dropdown into the centered Settings modal). Cache-bust: `ayah-export.js
?v=2→3`, `book-viewer.js?v=3→4` in all three module HTMLs; explore already at `css/style.css?v=10`, `js/
app.js?v=20` from the settings work; **no `/data` change → no manifest bump**. Verified in-browser: the
ZIP/OOXML output opens in openpyxl (sheet "Ayaat", numeric + inlineStr cells, 1 embedded image); a real
root export via `QuranCsvExport.download` yields a valid `.xlsx` (PK sig, correct MIME, ~584 KB with the
page); a word export still yields `text/csv`; the canvas webp→PNG conversion of a real book page produces
a valid PNG. **Android — SHIPPED as APK 1.4.7** (versionCode 18): synced the changed web + overlay files,
added the `saveXlsx` bridge + SAF launcher, bumped the two explore PATCHES anchors to v10/v20, rebuilt +
V2-signed (SHA-1 d81d0f12…). **Web committed (`69da682`) + pushed and DEPLOYED to Vercel prod** (aliased
quran-connect-psi.vercel.app; live assets verified). Android committed (`b499167`), pushed. Prior 2026-07-29: **CSV export fixed for the Android app + Urdu occurrence cards — shipped
APK 1.4.6.** Two reader improvements from user reports. **(1) "Export CSV" now works inside the app.**
The word/root modal's Export CSV button (shared exporter `assets/ayah-export.js`, used by Explore Quran,
Connections, Search) built a blob and clicked `<a download>` — which a **WebView silently drops**, so
nothing happened on the phone. Fix: `download()` now checks for the native bridge and, when present,
hands the finished CSV text to **`QuranAndroid.saveCsv(filename, content)`** instead of the blob path;
the web build keeps the blob download. The new bridge method (`AppBridge.kt`) routes to `MainActivity`,
which writes the file through the **Storage Access Framework** (`ActivityResultContracts.CreateDocument
("text/csv")` → system "Save as" picker → `contentResolver`, no storage permission on any API level) and
toasts the result. Per the user's ask the export now **first asks which single translation to include**
(`pickTranslation` modal, all 35 editions grouped English/Urdu, default en_sahih) and that edition
becomes the sheet's **one Translation column**, replacing the two previously-hardcoded columns.
**(2) Urdu on the occurrence cards.** Explore Quran's word-modal occurrence list showed only the English
translation; it now shows Urdu too (ur_junagarhi, RTL Nastaliq), toggled by the **same English/اردو
switch that already governs the meanings block** — the occurrence render was split into
`_renderOccurrences()`, the lang-tab handler repaints both, and the Urdu edition is lazy-loaded
(`_ensureOccUrdu`); roots keep English (no toggle). Cache-bust: `ayah-export.js?v=1→2` in all three
module HTMLs; `explore/index.html` `css/style.css?v=8→9`, `js/app.js?v=18→19`; **no `/data` file changed
→ no manifest bump**. Verified in-browser: Export CSV opens the 35-edition picker (12 en / 23 ur),
choosing Maududi(Urdu) yields a CSV whose single translation column is headed "Maududi (Urdu)" with the
Urdu text; the word modal's اردو tab renders Urdu occurrence cards RTL and toggling back restores English.
**Android — SHIPPED as APK 1.4.6** (versionCode 17): synced the four changed web files, added the
`saveCsv` bridge + SAF launcher, bumped the two explore PATCHES anchors to v9/v19, rebuilt + V2-signed
(SHA-1 d81d0f12…). Prior 2026-07-29: **Tadabbur "Open" now targets Explore Quran, not Connections** — the web
Tadabbur Open already linked to `../explore/#SN:AN`, but the *Android* bridge branch was calling
`openConnections`. Fixed by adding a **`window.QuranExplore.open(id)`** deep-link entry point in
`explore/js/app.js` (mirrors the reader's own `#SN:AN` hash jump: waits for the stored `app._ready =
app.init()` promise, then `openSurah(sn, an)` → `_scrollToAyah` flash) and switching `tadabbur/js/app.js`
Open to prefer `QuranAndroid.openExplore` over `openConnections`; the native side adds an `openExplore`
bridge method that navigates the app's Explore Quran destination. `explore/index.html` `app.js?v=17→18`,
`tadabbur/index.html` `js/app.js?v=2→3`; no `/data` change → no manifest bump. Verified in-browser:
`QuranExplore.open('2:255')` resolves, sets `#2:255`, flashes the ayah. **Shipped in the Android app as
APK 1.4.5** (code 16) alongside a native landing-grid polish (footer tile no longer clipped by the nav
bar); see the Android repo's CLAUDE.md. Prior 2026-07-28: **New module — Tadabbur**, a reel-style, swipeable stream of the Qur'an
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
`.tr.rtl` (Noto Nastaliq Urdu, RTL). **Now also on Android — shipped as APK 1.4.3** after the user
clarified the phone was the real target ("I just wanted it on the android application not the web one"):
Share/Open became **bridge-aware** (`QuranAndroid.share`/`openConnections` when `window.QuranAndroid` is
present, `app.js?v=1→2`, commit `cdd42f5`) and the module was synced into the app with a native Tadabbur
destination + `android-tadabbur.css` overlay — see the Android repo's CLAUDE.md and the Last-changes
entry below. New file under `/data`, so
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

- **2026-08-03 — Web source for APK 1.7.0: shared reader-defaults listeners + Mushaf font-key unification.**
  The Android app grew a native Settings screen (theme + reader defaults: Arabic font and translation) that
  writes those defaults into every WebView module's **shared per-origin localStorage** and, on an explicit
  change, force-pushes them to all built routes. The web-side half of that contract is a `quran-reader-defaults`
  CustomEvent the native side dispatches after seeding the keys; three module scripts now **listen for it and
  re-apply the shared keys live** without a reload:
  - **`explore/js/app.js`** — `_applyReaderDefaults` re-reads `explore-font-ar` (calls `_applyFonts`) and
    `explore-translations` (JSON array) and re-renders.
  - **`mushaf/js/app.js`** — the Arabic-font key was **unified to `explore-font-ar`** so Explore and Read Mushaf
    share one font choice: it reads `explore-font-ar || mushaf-font-ar || ""`, writes `explore-font-ar` when the
    Mushaf picker changes, and re-applies on the event.
  - **`tadabbur/js/app.js`** — re-reads `tadabbur-translation` and re-renders the current ayah in place.
  The matching **Back-button** piece (a `#qs-overlay` close case added to `window.QuranBack.handle()` so Back
  dismisses Explore's Search overlay before leaving the module, plus a `WebViewCache.back()` `goBack()`
  fallback) lives in the **Android repo's** overlay/native code (`webapp-overlay/assets/android-integration.js`,
  `WebModule.kt` / `WebViewCache`), **not in this web tree**. **All three listeners are inert on the website**
  (nothing dispatches the event there), so the change is safe to deploy; it is kept here only so these files
  stay byte-identical to the synced Android copies. **Cache-bust:** `tadabbur/index.html` `js/app.js?v=4→5`,
  `mushaf/index.html` `js/app.js?v=1→2` (`explore/index.html` was already `css/style.css?v=12` / `js/app.js?v=22`
  from the earlier 1.7.0 explore work). **No `/data` file changed → no `manifest.json` bump.** **Android —
  SHIPPED as APK 1.7.0** (versionCode 24): the sync copied the changed explore/mushaf/tadabbur module files
  (explore PATCHES anchors bumped `css/style.css?v=11→12`, `js/app.js?v=21→22`), added the native Settings
  screen + `applyReaderDefaults`/`changeReaderDefaults` wiring, flattened the drawer to Settings + About (the
  landing page now owns every module), added Notes sorting and the "Verses about the Prophets" rename, and
  expanded About — rebuilt + V2-signed (SHA-1 `d81d0f12…`), archived. See the Android repo's CLAUDE.md.
  **Web not yet committed or deployed** — commit and `npx vercel --prod` when ready.

- **2026-07-31 — Tadabbur `window.QuranBack` hook (for the Android app's Back-button rework, APK 1.6.2).**
  The Android app now wires the hardware Back button to a page's own in-page state before it leaves the
  module: the native side evaluates `window.QuranBack.handle()`, which closes the topmost overlay and
  returns true, or false when there is nothing to undo. Added that hook to `tadabbur/js/app.js` — it
  dismisses the edition/translation picker when open (except on the mandatory first-run, where a choice is
  required before the reel loads). **Inert on the website** (nothing calls it there), so it is safe to
  deploy; kept here only so the file stays in lockstep with the Android copy. The Explore and Connections
  `QuranBack` handlers live in the Android repo's app-only overlays (`android-integration.js`,
  `android-connections.js`), not here. **Redeploy** to keep the site current (no user-visible change).

- **2026-07-31 — Web side of three Android reader improvements: text-size sliders, light-mode overlay fix,
  pinch-zoom hardening.** From a six-item user request against the Android app; three items had a web
  source (the other three — Journal ayah deep-link, ayah counter, two-mode note export — are Android-only,
  see that repo). Standing "ask, don't hallucinate" applied (the slider/bundled-font/translation scopes were
  confirmed with the user in a prior window).
  1. **(Req3) Explore Quran fonts/sizes are now adjustable.** A new **Text size** section in the ⚙ Settings
     modal (`explore/index.html`) holds two range sliders — **Arabic (ayah)** and **Translation & tafseer**
     — each 70–180% (step 5) with a live `%` readout and a **Reset to default** button. They persist to
     `explore-size-ar` / `explore-size-tr` and drive two CSS custom properties `--ayah-ar-scale` /
     `--ayah-tr-scale` that multiply the base font sizes of `.ayah-arabic`, `.ayah-tr`(+`.urdu`) and
     `.tafsir-text`(+`.urdu`) — including the narrow-screen `.ayah-arabic` override
     (`explore/css/style.css`). Wired by `_loadSize` (clamps to 70–180, default 100), `_applyTextSizes`
     (sets the root vars) and `_bindTextSize` (sliders + reset), called from `init()` after `_applyFonts`
     (`explore/js/app.js`). The Fonts family picker already existed; this adds the *size* control the user
     asked for.
  2. **(Req5) "Ideas and Topics" (and Prophet Stories / Statistics) were invisible in light mode.** Those
     full-screen overlays (`.feelingsOverlay` / `.prophetsOverlay` / `.statsOverlay`) shipped only a
     dark-navy backdrop; in light mode the text flips dark and vanished against it. `assets/styles.css`
     adds `[data-theme="light"]` rules: a parchment radial scrim on the overlays, `--surface-3` on the flat
     panels, and a faint dark tint on the headers. Dark mode untouched.
  3. **(Req6) Book-viewer pinch-zoom failed for some pages/opens.** Some WebViews drop or coalesce the
     second finger's `touchstart`, so a pinch reached `touchmove` with `dist0` still 0 and never zoomed.
     `assets/book-viewer.js` now **seeds the pinch from the first `≥2`-finger `touchmove` frame**
     (`beginPinch`) instead of ignoring it, accepts `≥2` touches throughout, adds a `touchcancel` cleanup,
     raises `MAX_ZOOM` 5→8, and makes double-tap **step** 1×→2.5×→4×→1× (was a 1×↔2.5× toggle).
  **Cache-bust:** `assets/styles.css?v=36→37` (root `index.html`); `assets/book-viewer.js?v=4→5` in
  `index.html`, `search/index.html`, `explore/index.html`; `explore/css/style.css?v=10→11`,
  `explore/js/app.js?v=20→21`. **No `/data` file changed → no `manifest.json` bump.** **Android — carries all
  three and shipped them with the three Journal features as APK 1.6.0** (versionCode 21): the sync copied the
  changed root/explore files + `book-viewer.js` (its PATCHES anchors bumped `styles.css?v=36→37`,
  explore `css/style.css?v=10→11`, `app.js?v=20→21`), rebuilt + V2-signed (SHA-1 `d81d0f12…`). **Web not
  yet committed or deployed** — commit and `npx vercel --prod` when ready.

- **2026-07-29 — Tadabbur buttons no longer cover the ayah text.** User report: in the Tadabbur reel the
  per-card **Save / Share / Open** controls floated on top of the ayah and, on longer ayaat, obscured the text.
  `tadabbur/css/style.css` moves them into a **bottom-centered `.actions` bar** kept clear of the text column,
  with a click-through scrim so the bar's surround doesn't swallow swipes; `tadabbur/index.html` bumps
  `css/style.css?v=1→2`. **No `/data` file changed → no `manifest.json` bump.** This is the web source for an
  Android-targeted fix: it was synced into `quran-connect-android` (sync PATCHES anchor for `tadabbur/index.html`
  bumped `css/style.css?v=1→2` to match) and shipped in **APK 1.5.1** with three Journal fixes — see that
  repo's CLAUDE.md. **Web change is not yet committed or deployed** — commit and `npx vercel --prod` when ready.

- **2026-07-29 — Six Android-reported reader fixes (web + APK 1.4.7).** From a user report with three
  screenshots; standing instruction "ask questions, do not hallucinate" applied (Settings scope and the
  xlsx-vs-CSV decision were both confirmed with the user in the prior window).
  1. **Word tiles selectable English/Urdu** (issue 1, web + app). Explore Quran's per-word gloss badge
     rendered only `w.en`. A new `this.wordLang` (constructor-loaded from `explore-word-lang`, default
     `en`) makes the badge render `w.ur` when Urdu (class `wb-gloss-ur`, `lang="ur" dir="rtl"`, Nastaliq),
     the same edition the occurrence cards already toggle. Toggled from the Settings panel (below).
  2. **Controls consolidated into ⚙ Settings** (issue 2, web + app). The reader-controls row was a line of
     separate popover buttons (Translations, Tafseer, Fonts…). Now Translations, Tafseer, Fonts and the
     new Word-tile-language control live in one centered modal (`#settings-modal` → `.settings-overlay` →
     `.settings-card`, five `.settings-section`s incl. `#audio-section` which stays hidden on Android). Per
     the user's "just those four", the "☰ Surahs", "Go to ayah" and "Words & Roots" controls stay as
     separate top buttons. `_bindControls()` rewritten to open/close the modal (button, ✕, backdrop click,
     Escape) and drive the `#wordlang-tabs` `.wordlang-tab[data-lang]` pills → `this.wordLang` + repaint.
     `explore/css/style.css` dropped `.control-group`/`.control-panel`, added the overlay/card/section/
     wordlang styles.
  3. **One Surahs button** (issue 3, Android). The app drew *two*: the reader's own milestone-5 slide-in
     drawer (`#sidebar-toggle` "☰ Surahs", `.sidebar.open` + `#sidebar-backdrop`) **and** the overlay's
     `installSurahPicker` (`.surah-open-btn` + `.surah-scrim`). Removed the overlay picker entirely —
     `installSurahPicker()` and its `start()` call deleted from `webapp-overlay/assets/android-integration.js`,
     and the `.is-open`/`.surah-scrim` slide-over rules in `android.css` replaced by a small
     `@media (max-width:860px){ .sidebar{ top:0; height:100% } }` so the reader's own drawer sits flush
     under the hidden web header. Web unaffected (its drawer was already the only one).
  4. **Landing captions fully visible** (issue 4, Android). The bento tiles clipped their two-line blurb.
     `strings.xml` blurbs shortened to one tight line each; `LandingScreen.kt` tile heights raised
     (featured/regular 124/112 → 140dp, footer 80 → 100dp) with `maxLines = 2` on the description.
  5. **Root exports are now `.xlsx` carrying the dictionary meaning page** (issue 5, web + app). Answer to
     "the exported sheet should also have the actual meaning page from the dictionary in it" was **embed
     the page image (.xlsx)**. `assets/ayah-export.js` gained a dependency-free, **offline** OOXML writer:
     a store-method (no-deflate) ZIP with a CRC32 table, the minimal workbook parts, and a `oneCellAnchor`
     drawing placing the page below the table (`EMU = px × 9525`). The page comes from a new
     `BookViewer.pageInfo(root)` (returns `{page, printed, y, url}`); it is fetched and **canvas-converted
     WebP→PNG** (`pngFromUrl`) because Excel cannot render WebP. `download()` branches on an `opts.book`:
     present (a root) → `.xlsx` (native `saveXlsx` or blob), absent (a word) → CSV as before. `book` is
     threaded from the three export call sites — `explore/js/app.js` (`st.book`), `search/js/root-modal.js`
     (`root`), `assets/app.js` `openWordModal` (`kind === "root" ? word : undefined`). The button/label say
     "Export" (not "Export CSV") since the format now varies. Native: **`AppBridge.saveXlsx(filename,
     base64)`** (workbook is binary, so base64 over the string-only bridge → `Base64.decode`) →
     `MainActivity.saveXlsx` holds the bytes and launches a second SAF `CreateDocument(
     "…spreadsheetml.sheet")`, writing via `writeBytes`.
  6. **Font modal no longer half off-screen** (issue 6, both). Was the anchored `.control-panel` Fonts
     dropdown overflowing the pane; resolved by (2) — Fonts is now a section of the centered Settings modal.
  **Cache-bust:** `ayah-export.js?v=2→3` and `book-viewer.js?v=3→4` in `index.html`, `explore/index.html`,
  `search/index.html`; explore was already `css/style.css?v=10` / `js/app.js?v=20` from the settings work.
  **No `/data` file changed → no `manifest.json` bump.** **Verified in-browser** (served tree): the ZIP/
  OOXML output passes `unzip -t` and opens in openpyxl (sheet "Ayaat", numeric + inline-string cells, one
  embedded image); `QuranCsvExport.download` with a real root (`ر ح م`) yields a valid `.xlsx` (PK sig,
  correct MIME, ~584 KB including the page) while a word export stays `text/csv`; a real book page
  (`p162.webp`, 1191×1684) canvas-converts to a valid PNG. **Android — SHIPPED as APK 1.4.7** (versionCode
  18): synced the changed web + overlay files (sync `--check` clean, only the 9 edited files stale), added
  the `saveXlsx` bridge + SAF launcher, bumped the two explore PATCHES anchors 9/19 → 10/20, rebuilt +
  V2-signed (SHA-1 `d81d0f12…`, verified), archived as `apk-releases/QuranConnect-1.4.7.apk`. **Web —
  committed (`69da682`) + pushed and DEPLOYED to Vercel prod** (`npx vercel --prod`, aliased to
  quran-connect-psi.vercel.app; verified live: `explore/index.html` serves `ayah-export.js?v=3`,
  `book-viewer.js?v=4`, `css/style.css?v=10`, `js/app.js?v=20`, and the live `ayah-export.js` carries the
  `saveXlsx` path). Android committed as `b499167`. Both repos clean + pushed to `origin/main`.

- **2026-07-29 — CSV export works in the Android app + Urdu on the occurrence cards (web + APK 1.4.6).**
  Two user-reported reader gaps.
  **(1) "Export CSV" was dead inside the app.** The shared exporter `assets/ayah-export.js`
  (`window.QuranCsvExport = { buildCsv, download, makeButton }`, used by Explore Quran, Explore Ayaah
  Connections and Search) built the CSV as a Blob and triggered a `<a href="blob:…" download>.click()`.
  That works in a desktop browser but a **WebView silently drops the blob download**, so on the phone the
  button did nothing. Fix: `download()` now, *before* the blob path, checks
  `window.QuranAndroid && typeof QuranAndroid.saveCsv === 'function'` and if so calls
  **`QuranAndroid.saveCsv(filename, withBom)`** (the CSV text, UTF-8 BOM already prepended) and returns;
  the web build is unchanged (still downloads the blob). Native side (Android repo): a new
  `AppBridge.Host.saveCsv` + `@JavascriptInterface fun saveCsv` hands the text to `MainActivity`, which
  saves it via the **Storage Access Framework** — a field-registered
  `registerForActivityResult(ActivityResultContracts.CreateDocument("text/csv"))` launcher opens the
  system "Save as" picker (no storage permission on any API level, minSdk 26), and the result callback
  writes the held `pendingCsv` through `contentResolver.openOutputStream` and toasts success/failure.
  **Also (user's second ask):** the export now **asks which single translation to include first** — a new
  `pickTranslation(basePath)` modal (`.csv-pick-*`) lists all 35 editions grouped English/Urdu (default
  `en_sahih`); the chosen edition becomes the sheet's **one dynamically-named Translation column**,
  replacing the two previously-hardcoded translation columns. `buildCsv(refs, basePath, translation)`
  emits that single column (`translation.name` as its header); `makeButton`'s click handler is now async
  (show picker → cancel aborts → `download({…, translation})`). The data loaders were also reworked
  (`loadQuran`/`loadTranslation`/`loadIndex`, per-id translation cache) since the file no longer loads a
  fixed pair of translations.
  **(2) Urdu on the occurrence cards.** In Explore Quran's word modal, the occurrence list under
  "Occurrences — N ayaat contain this word" rendered only the English translation, even though the
  meanings block above it has an English/اردو toggle. Now each occurrence card follows that **same
  toggle**: the render was extracted into `_renderOccurrences()`, the `.lang-tab` handler (`_bindModal`)
  repaints both meanings and occurrences, the Urdu edition (`ur_junagarhi`) is lazy-loaded by a new
  `_ensureOccUrdu()`, and Urdu text renders `.occ-ur` (RTL, Nastaliq — new CSS in `explore/css/style.css`).
  **Root** modals keep English (they have no language toggle). `_renderModal` also pre-loads Urdu when the
  modal opens already on the اردو tab.
  **Cache-bust:** `ayah-export.js?v=1→2` in `explore/index.html`, `index.html`, `search/index.html`;
  `explore/index.html` `css/style.css?v=8→9`, `js/app.js?v=18→19`. **No `/data` file changed, so no
  `manifest.json` bump.**
  **Verified in-browser** (served tree, real DOM): opening a word badge → modal with 5 English occurrence
  cards + an Export CSV button; the اردو tab repaints the occurrence cards as RTL Nastaliq Urdu
  (ur_junagarhi) and English restores on toggle-back; Export CSV opens the picker listing 35 editions
  (12 English / 23 Urdu, default Sahih Intl); building with Maududi(Urdu) yields a CSV whose header has a
  single `Maududi (Urdu)` column carrying the Urdu text, columns
  `Ser,Surah,Juzz,Ayat,Arabic Ayat Actual,Arabic Ayat Cleaned,<Translation>,List of Words,List of Root Words`.
  **Android — SHIPPED as APK 1.4.6** (versionCode 17, versionName 1.4.6; see the Android repo's CLAUDE.md):
  `tools/sync_web_assets.py` copied the four changed web files (ayah-export.js is in TREES, verbatim), the
  two `explore/index.html` PATCHES anchors were bumped **v8→v9 / v18→v19** (a stale anchor is a hard sync
  error), and the native `saveCsv` bridge + SAF launcher were added; rebuilt and **V2-signed** with the
  unchanged v2 release key (SHA-1 `d81d0f12…`), so 1.4.5→1.4.6 upgrades cleanly.

- **2026-07-29 — Tadabbur "Open" now opens Explore Quran (not Explore Ayaah Connections).** The user
  reported that in the Android app, tapping **Open** on a Tadabbur card landed in *Explore Ayaah
  Connections* instead of *Explore Quran*. On the web the Open control was already correct (an
  `<a href="../explore/#SN:AN">`), but the Android bridge branch was calling `QuranAndroid.openConnections`.
  - **`explore/js/app.js` — new deep-link entry `window.QuranExplore.open(id)`.** Parses/clamps the
    `"sn:an"` id, waits for a stored `app._ready` promise, then resolves with `app.openSurah(sn, an)`
    (loads the surah and `_scrollToAyah`-flashes the ayah — the same jump the `#SN:AN` hash performs on a
    fresh load). `DOMContentLoaded` now stores `app._ready = app.init().catch(…)` so the entry point can
    await the reader being ready. This mirrors the existing `window.QuranConnections.open` contract the
    native side already drives for the "Pairs →" jump.
  - **`tadabbur/js/app.js` — Open prefers `QuranAndroid.openExplore`.** When the native bridge exposes
    `openExplore`, the Open button calls `openExplore("sn:an")`; otherwise it stays the
    `../explore/#SN:AN` link (unchanged web behaviour). One source of truth the sync copies verbatim.
  - **Native (Android repo):** `AppBridge` gains an AYAH_ID-validated `openExplore` method and
    `MainActivity` an `exploreAyah` state + `LaunchedEffect` that queues an `openExploreScript` (polls for
    `window.QuranExplore`) into the Explore Quran WebView, then navigates there — the exact mirror of the
    Connections jump. **Shipped as APK 1.4.5 (code 16)** together with a native landing-grid polish (the
    bento footer tile was being clipped by the nav bar; tile heights trimmed + 28 dp bottom content-pad).
  - **Cache-bust:** `explore/index.html` `app.js?v=17→18`, `tadabbur/index.html` `js/app.js?v=2→3`. No
    `/data` file changed → **no `manifest.json` bump**. Verified in-browser (served tree):
    `QuranExplore.open('2:255')` resolves, sets `location.hash` to `#2:255`, and the target ayah card
    flashes into view. Sync `--check` showed only the 4 edited files differing, no PATCHES anchor drift.

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
  - **Android — SHIPPED as APK 1.4.3** (code 14; see the Android repo's CLAUDE.md). The user clarified
    the real target was the phone ("I just wanted it on the android application not the web one"), so the
    web module became the WebView source for the app. Two web-repo changes made it app-ready, then it was
    synced: (1) `data/tadabbur` + `tadabbur/{index.html,css,js}` added to the sync's TREES, with a native
    `Tadabbur` Reading destination + landing card and an `android-tadabbur.css` overlay that collapses the
    in-page `.topbar` (the native `TopAppBar` owns ☰/title/theme) while floating the ⚙ translation
    switcher; (2) **Share and Open are now bridge-aware** (`tadabbur/js/app.js`, commit `cdd42f5`): when
    `window.QuranAndroid` is present Share routes through `QuranAndroid.share({sn,an,surahName,arabic,
    translation,translationName,notes})` and Open through `QuranAndroid.openConnections("sn:an")`; on the
    web both keep the `navigator.share`/clipboard and `<a href="../explore/#SN:AN">` fallbacks — one
    source of truth the sync copies verbatim (`app.js?v=1→2`). No `/data` change → still no manifest bump.

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
