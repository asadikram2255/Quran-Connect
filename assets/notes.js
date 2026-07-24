/**
 * notes.js — per-ayah study notes.
 *
 * Notes live in this browser and only in this browser: they are written to
 * localStorage the moment they are saved, so they work offline, survive a
 * refresh, and never wait on a network call. There is no account, no server
 * and no sync service — notes move between devices as an exported file that
 * both this app and the Android app read (assets/notes-ui.js has the buttons;
 * the format is documented at docs/notes-format.md in the Android repo).
 *
 * Usage:  await QuranNotes.ready;
 *         QuranNotes.list(2, 255)          // notes on 2:255, oldest first
 *         QuranNotes.add(2, 255, "…")
 *         QuranNotes.subscribe(fn)         // fn() on every change
 *         QuranNotes.export()              // interchange document (with tombstones)
 *         QuranNotes.import(doc)           // merge one back in
 */
(function () {
  "use strict";

  const LS_NOTES = "quran-notes-v1";
  const FORMAT = "quran-connect-notes";   // the interchange format's marker
  const FORMAT_VERSION = 1;               // highest version this reader understands
  const APP = "web";

  let notes = {};                   // id → note (including tombstones)
  let lastError = "";
  const listeners = new Set();

  /* ── Local store ───────────────────────────────────────────────────────── */

  function uid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    // Fallback for older WebViews: RFC-4122 v4 from crypto.getRandomValues.
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  function readJSON(k, fallback) {
    try {
      const raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function loadLocal() {
    const doc = readJSON(LS_NOTES, null);
    notes = (doc && doc.notes) || {};
  }

  function persist() {
    try {
      localStorage.setItem(LS_NOTES, JSON.stringify({ v: 1, notes }));
    } catch (e) {
      lastError = "This browser is out of storage space for notes.";
    }
    emit();
  }

  function emit() {
    for (const fn of listeners) {
      try { fn(); } catch (e) { /* a bad listener must not stop the rest */ }
    }
  }

  const alive = n => n && !n.deleted;
  const byCreated = (a, b) => (a.created < b.created ? -1 : a.created > b.created ? 1 : 0);

  function list(sn, an) {
    return Object.values(notes)
      .filter(n => alive(n) && n.sn === +sn && n.an === +an)
      .sort(byCreated);
  }

  function all() {
    return Object.values(notes)
      .filter(alive)
      .sort((a, b) => a.sn - b.sn || a.an - b.an || byCreated(a, b));
  }

  function count(sn, an) {
    return list(sn, an).length;
  }

  function total() {
    return Object.values(notes).filter(alive).length;
  }

  function add(sn, an, body) {
    const now = new Date().toISOString();
    const note = { id: uid(), sn: +sn, an: +an, body: String(body), created: now, updated: now, deleted: false };
    notes[note.id] = note;
    persist();
    return note;
  }

  function update(id, body) {
    const n = notes[id];
    if (!n) return null;
    n.body = String(body);
    n.updated = new Date().toISOString();
    persist();
    return n;
  }

  function remove(id) {
    const n = notes[id];
    if (!n) return;
    // A tombstone, not an erasure, so the delete travels on export.
    n.deleted = true;
    n.body = "";
    n.updated = new Date().toISOString();
    persist();
  }

  /* ── Import / export (docs/notes-format.md) ────────────────────────────── */

  // Every note, tombstones included — a faithful interchange writer, so a
  // delete made here is honoured by whatever reads the file. (The printable
  // notebook and the on-screen lists use all(), which hides tombstones.)
  function exportDoc() {
    const rows = Object.values(notes)
      .map(n => ({
        id: n.id, sn: n.sn, an: n.an,
        body: n.deleted ? "" : String(n.body || ""),
        created: n.created, updated: n.updated, deleted: !!n.deleted,
      }))
      .sort((a, b) => a.sn - b.sn || a.an - b.an || byCreated(a, b));
    return {
      format: FORMAT,
      version: FORMAT_VERSION,
      exported: new Date().toISOString(),
      source: { platform: APP, app: APP },
      count: rows.length,
      notes: rows,
    };
  }

  const validRef = (sn, an) =>
    Number.isInteger(sn) && sn >= 1 && sn <= 114 && Number.isInteger(an) && an >= 1;
  const newer = (a, b) => new Date(a).getTime() > new Date(b).getTime();

  // Merge one interchange document into the store. Last write wins per id;
  // one bad entry never aborts the rest. Returns a tally for the UI.
  function importDoc(doc) {
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
      throw new Error("That file is not a Quran Connect notes export.");
    }
    // A document with no "format" is the web app's first-release export.
    if (doc.format != null && doc.format !== FORMAT) {
      throw new Error("That file is not a Quran Connect notes export.");
    }
    const version = doc.version == null ? 1 : doc.version;
    if (!Number.isInteger(version) || version > FORMAT_VERSION) {
      throw new Error(`This file was written by a newer version (format ${version}). Update the app, then import it.`);
    }
    if (!Array.isArray(doc.notes)) {
      throw new Error("That file has no notes in it.");
    }

    let added = 0, updated = 0, skipped = 0, unchanged = 0;
    for (const r of doc.notes) {
      if (!r || typeof r !== "object") { skipped++; continue; }
      const sn = +r.sn, an = +r.an;
      const created = r.created || r.updated;
      if (!r.id || !created || !validRef(sn, an)) { skipped++; continue; }
      const incoming = {
        id: String(r.id), sn, an,
        body: r.deleted ? "" : String(r.body || ""),
        created, updated: r.updated || created, deleted: !!r.deleted,
      };
      const cur = notes[incoming.id];
      if (!cur) {
        notes[incoming.id] = incoming;
        added++;
      } else if (newer(incoming.updated, cur.updated)) {
        notes[incoming.id] = incoming;
        updated++;
      } else {
        unchanged++;
      }
    }
    if (added || updated) persist(); else emit();
    return { added, updated, unchanged, skipped, total: doc.notes.length };
  }

  /* ── Boot ──────────────────────────────────────────────────────────────── */

  loadLocal();

  // A second tab on this device edited the same store.
  window.addEventListener("storage", e => {
    if (e.key === LS_NOTES) { loadLocal(); emit(); }
  });

  window.QuranNotes = {
    ready: Promise.resolve(),
    list, all, count, total,
    add, update, remove,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    error: () => lastError,
    import: importDoc,
    // The full interchange document, tombstones and all, for the export button.
    export: exportDoc,
  };
})();
