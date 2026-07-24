/* Root Words Directory — every root analyzequran finds in the Quran, in one
 * searchable list. Data is data/root_directory.json, built by
 * scripts/build_root_directory.mjs (the web twin of the Android app's
 * tools/build_root_directory.py — same schema, same aggregation).
 *
 * Tapping a root does not open a root view of its own: it hands the root to
 * Explore Ayaah Connections (../?root=<letters>), whose modal already shows the
 * book's page for the root and every ayah it occurs in. Mirrors the Android
 * screen, which hands off the same way rather than keeping a second ayah
 * renderer in step with the first.
 *
 * Every Arabic character in normalizeArabic below is a \u escape, never a
 * literal: Arabic in source is mangled by editing tools (reordered, or silently
 * stripped of its marks), and a normaliser that has quietly lost a character
 * does not crash — it just stops matching, the hardest kind of bug to notice.
 */

(function () {
  "use strict";

  // ── Arabic normalisation (mirrors RootIndex.normalizeArabic on Android) ──
  const TATWEEL      = "ـ";
  const ALEF         = "ا";
  const YEH          = "ي";
  const HEH          = "ه";
  const ALEF_MAKSURA = "ى";
  const TEH_MARBUTA  = "ة";
  const DAGGER_ALEF  = "ٰ";
  const ALEF_FORMS   = new Set(["آ", "أ", "إ", "ٱ"]);

  function isMark(c) {
    const code = c.charCodeAt(0);
    return (code >= 0x064b && code <= 0x065f) ||   // fathatan … wavy hamza below
           c === DAGGER_ALEF ||                     // superscript alef
           (code >= 0x06d6 && code <= 0x06ed);      // Quranic annotation signs
  }

  // Reduces Arabic to what a reader can actually type: no marks, no spaces, one
  // spelling per letter. The directory prints its roots spaced and vocalised,
  // but nobody searching types them that way.
  function normalizeArabic(text) {
    let out = "";
    for (const c of text) {
      if (c === " " || c === "\t" || c === "\n" || c === TATWEEL || isMark(c)) continue;
      if (ALEF_FORMS.has(c)) out += ALEF;
      else if (c === ALEF_MAKSURA) out += YEH;
      else if (c === TEH_MARBUTA) out += HEH;
      else out += c;
    }
    return out;
  }

  // True if the query is Arabic rather than Latin, so the two searches don't cross.
  function isArabic(text) {
    for (const c of text) {
      const code = c.charCodeAt(0);
      if (code >= 0x0600 && code <= 0x06ff) return true;
    }
    return false;
  }

  // ── State ────────────────────────────────────────────────────────────────
  let roots = [];          // enriched rows
  let alphabetical = false;

  const els = {
    search:  document.getElementById("search"),
    count:   document.getElementById("count"),
    sortBtn: document.getElementById("sort-btn"),
    sortLbl: document.getElementById("sort-label"),
    loading: document.getElementById("loading"),
    empty:   document.getElementById("empty"),
    list:    document.getElementById("root-list"),
  };

  // ── Theme toggle (shared 'theme' key across all modules) ─────────────────
  document.getElementById("theme-toggle").addEventListener("click", () => {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    if (dark) document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", "dark");
    try { localStorage.setItem("theme", dark ? "light" : "dark"); } catch (e) {}
  });

  // ── Detail line: "151× · 130 ayaat · not a root · book p. 457" ───────────
  function detailLine(r) {
    const parts = [r.c + "×", r.a + " ayaat"];
    if (r.w) parts.push("not a root");
    parts.push(r.p ? "book p. " + r.p : "not in the book");
    return parts;
  }

  function makeRow(r) {
    const a = document.createElement("a");
    a.className = "root-row";
    a.href = "../?root=" + encodeURIComponent(r.r);

    const letters = document.createElement("div");
    letters.className = "root-letters";
    letters.setAttribute("dir", "rtl");
    letters.setAttribute("lang", "ar");
    letters.textContent = r.r;
    a.appendChild(letters);

    const body = document.createElement("div");
    body.className = "root-body";

    const en = document.createElement("div");
    if (r.g && r.g.length) {
      en.className = "root-en";
      r.g.forEach((g, i) => {
        if (i) { const s = document.createElement("span"); s.className = "sep"; s.textContent = "·"; en.appendChild(s); }
        en.appendChild(document.createTextNode(g));
      });
    } else {
      en.className = "root-none";
      en.textContent = "—";
    }
    body.appendChild(en);

    if (r.u && r.u.length) {
      const ur = document.createElement("div");
      ur.className = "root-ur";
      ur.setAttribute("dir", "rtl");
      ur.setAttribute("lang", "ur");
      r.u.forEach((g, i) => {
        if (i) { const s = document.createElement("span"); s.className = "sep"; s.textContent = "·"; ur.appendChild(s); }
        ur.appendChild(document.createTextNode(g));
      });
      body.appendChild(ur);
    }

    const meta = document.createElement("div");
    meta.className = "root-meta";
    detailLine(r).forEach((part, i) => {
      if (i) { const d = document.createElement("span"); d.className = "dot"; d.textContent = "·"; meta.appendChild(d); }
      const span = document.createElement("span");
      if (part === "not a root") span.className = "tag-word";
      span.textContent = part;
      meta.appendChild(span);
    });
    body.appendChild(meta);

    a.appendChild(body);
    return a;
  }

  // ── Filter + render ──────────────────────────────────────────────────────
  function render() {
    const q = els.search.value.trim();
    const arabic = q && isArabic(q) ? normalizeArabic(q) : "";
    const latin  = q && !arabic ? q.toLowerCase() : "";

    let results = roots;
    if (arabic) results = roots.filter(r => r.searchable.includes(arabic));
    else if (latin) results = roots.filter(r => r.enSearch.includes(latin));

    if (alphabetical) {
      results = results.slice().sort((a, b) => (a.searchable < b.searchable ? -1 : a.searchable > b.searchable ? 1 : 0));
    }

    els.count.textContent = results.length === roots.length
      ? roots.length + " roots and headwords"
      : results.length + " of " + roots.length;

    const frag = document.createDocumentFragment();
    for (const r of results) frag.appendChild(makeRow(r));
    els.list.replaceChildren(frag);
    els.empty.hidden = results.length !== 0;
  }

  let timer = null;
  function scheduleRender() {
    clearTimeout(timer);
    timer = setTimeout(render, 110);
  }

  els.search.addEventListener("input", scheduleRender);
  els.sortBtn.addEventListener("click", () => {
    alphabetical = !alphabetical;
    els.sortBtn.setAttribute("aria-pressed", alphabetical ? "true" : "false");
    els.sortLbl.textContent = alphabetical ? "A–Z" : "Commonest";
    render();
  });

  // ── Load ─────────────────────────────────────────────────────────────────
  fetch("../data/root_directory.json?v=1")
    .then(res => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
    .then(data => {
      roots = (data.roots || []).map(r => ({
        r: r.r, c: r.c, a: r.a, g: r.g || [], u: r.u || [], p: r.p, w: !!r.w,
        searchable: normalizeArabic(r.r),
        enSearch: (r.g || []).join(" ").toLowerCase(),
      }));
      els.loading.hidden = true;
      render();
    })
    .catch(err => {
      els.loading.textContent = "Could not load the roots. " + (err && err.message ? err.message : "");
    });

})();
