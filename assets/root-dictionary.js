/* Fatuhat al-Quran — root-word dictionary, shared by all three modules.
 *
 * One Urdu article per root, keyed by the app's spaced root form ("ص ب ر").
 * Articles are rendered verbatim: the only transformations applied here are
 * escaping, splitting on newlines into paragraphs, and turning the quotation
 * markers into a span so the Quranic text can be set in an Arabic face.
 *
 * scripts/restore_quran_quotes.py wraps every Quranic quotation it restored in
 * U+FDD0 … U+FDD1 — permanent noncharacters, so they can never collide with
 * the book's own text.
 *
 * Usage:  await RootDictionary.load('../');   // path back to the repo root
 *         el.innerHTML = RootDictionary.html('ص ب ر');
 */
(function () {
  "use strict";

  const VERSION = 2;               // bump when data/root_dictionary.json changes
  const SOURCE_EN = "Fatuhat al-Quran";
  const SOURCE_AR = "فتوحات القرآن";
  const OPEN = "\uFDD0";
  const CLOSE = "\uFDD1";
  const MARKERS = /[\uFDD0\uFDD1]/g;

  let entries = null;
  let inflight = null;

  function load(basePath) {
    if (entries) return Promise.resolve(entries);
    if (!inflight) {
      const url = (basePath || "") + "data/root_dictionary.json?v=" + VERSION;
      inflight = fetch(url)
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null)
        .then(d => (entries = (d && d.entries) || {}));
    }
    return inflight;
  }

  function raw(root) {
    return (entries && entries[root]) || "";
  }

  function get(root) {                       // plain text, markers removed
    return raw(root).replace(MARKERS, "");
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Escape first, then swap the markers for tags, so the article can never
  // introduce markup of its own.
  function para(p) {
    let out = "";
    let i = 0;
    for (;;) {
      const a = p.indexOf(OPEN, i);
      if (a < 0) { out += esc(p.slice(i)); break; }
      const b = p.indexOf(CLOSE, a);
      if (b < 0) { out += esc(p.slice(i)); break; }
      out += esc(p.slice(i, a)) +
             '<span class="rootdict-ayah" dir="rtl" lang="ar">' +
             esc(p.slice(a + 1, b)) + "</span>";
      i = b + 1;
    }
    return out.replace(MARKERS, "");        // strip any unpaired marker
  }

  function html(root) {
    const article = raw(root);
    if (!article) {
      return '<p class="rootdict-empty">This root has no entry in ' +
             SOURCE_EN + ".</p>";
    }
    const paras = article.split("\n").filter(p => p.trim());
    return '<div class="rootdict-article" dir="rtl" lang="ur">' +
           paras.map(p => "<p>" + para(p) + "</p>").join("") +
           '</div><div class="rootdict-source">' +
           SOURCE_AR + " · " + SOURCE_EN + "</div>";
  }

  window.RootDictionary = { load, get, html, SOURCE_EN, SOURCE_AR };
})();
