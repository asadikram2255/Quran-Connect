/**
 * notes-ui.js — the "Add Notes" button, the note editor, and the backup box.
 *
 * Shared by every module, so a note written in Explore Quran is the same note
 * everywhere. Requires assets/notes.js (window.QuranNotes) to be loaded first.
 *
 * Notes are saved in this browser. The backup box exports them to a file that
 * the Android app reads too, and imports one back, so they move between devices
 * without an account or a server.
 *
 * Usage:  card.appendChild(NotesUI.ayahButton(2, 255));
 *         NotesUI.open(2, 255, { arabic, translation, surah });
 *         header.appendChild(NotesUI.backupChip());
 */
(function () {
  "use strict";

  const CSS = `
.qn-ayah-btn{font:inherit;font-size:.76rem;font-weight:600;letter-spacing:.01em;
  padding:4px 11px;border-radius:999px;cursor:pointer;white-space:nowrap;
  color:var(--text-sec,var(--text-muted,#b9a7d6));
  background:var(--surface2,var(--panel2,rgba(255,255,255,.05)));
  border:1px solid var(--border,rgba(255,255,255,.14));
  transition:color .15s,border-color .15s,background .15s}
.qn-ayah-btn:hover{color:var(--accent,#f5b75e);border-color:var(--accent,#f5b75e)}
.qn-ayah-btn.has{color:var(--accent,#f5b75e);border-color:var(--accent,#f5b75e)}
.qn-ayah-btn .qn-dot{display:inline-block;width:5px;height:5px;border-radius:50%;
  background:currentColor;margin-inline-end:5px;vertical-align:middle}

.qn-overlay{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;
  justify-content:center;padding:24px;background:rgba(8,4,18,.72);
  backdrop-filter:blur(3px)}
.qn-overlay[hidden]{display:none}
.qn-panel{display:flex;flex-direction:column;width:min(680px,100%);
  max-height:min(86vh,860px);border-radius:14px;overflow:hidden;
  background:var(--surface,var(--panel,#1b1030));
  border:1px solid var(--border,rgba(255,255,255,.14));
  box-shadow:0 24px 60px rgba(0,0,0,.5);
  color:var(--text,#efe7ff);font-family:var(--font,inherit)}
.qn-bar{display:flex;align-items:center;gap:12px;padding:14px 16px;flex:0 0 auto;
  border-bottom:1px solid var(--border,rgba(255,255,255,.12))}
.qn-title{font-weight:700;font-size:1rem}
.qn-sub{font-size:.8rem;color:var(--text-sec,var(--text-muted,#b9a7d6))}
.qn-bar .qn-spacer{flex:1}
.qn-x{font:inherit;font-size:1rem;line-height:1;cursor:pointer;padding:6px 10px;
  border-radius:8px;color:var(--text-sec,var(--text-muted,#b9a7d6));
  background:transparent;border:1px solid var(--border,rgba(255,255,255,.14))}
.qn-x:hover{color:var(--text,#efe7ff)}
.qn-body{flex:1 1 auto;overflow:auto;padding:16px;display:flex;
  flex-direction:column;gap:14px}

.qn-ctx{padding:12px 14px;border-radius:10px;
  background:var(--surface2,var(--panel2,rgba(255,255,255,.04)));
  border:1px solid var(--border,rgba(255,255,255,.1))}
.qn-ctx-ar{font-family:var(--font-ar,'Amiri Quran',serif);font-size:1.4rem;
  line-height:2.1;direction:rtl;text-align:right}
.qn-ctx-tr{margin-top:6px;font-size:.88rem;line-height:1.6;
  color:var(--text-sec,var(--text-muted,#b9a7d6))}

.qn-note{padding:12px 14px;border-radius:10px;
  background:var(--surface2,var(--panel2,rgba(255,255,255,.04)));
  border:1px solid var(--border,rgba(255,255,255,.1))}
.qn-note-head{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.qn-note-date{font-size:.74rem;letter-spacing:.02em;text-transform:uppercase;
  color:var(--text-ter,var(--text-dim,#8d7ba8))}
.qn-note-head .qn-spacer{flex:1}
.qn-note-body{white-space:pre-wrap;line-height:1.65;font-size:.95rem;
  overflow-wrap:anywhere}
.qn-empty{padding:18px;text-align:center;font-size:.9rem;
  color:var(--text-sec,var(--text-muted,#b9a7d6))}

.qn-write label{display:block;font-size:.8rem;font-weight:600;margin-bottom:6px;
  color:var(--text-sec,var(--text-muted,#b9a7d6))}
.qn-ta{width:100%;box-sizing:border-box;min-height:110px;resize:vertical;
  padding:11px 13px;border-radius:10px;font:inherit;font-size:.95rem;
  line-height:1.6;color:var(--text,#efe7ff);
  background:var(--bg,rgba(0,0,0,.25));
  border:1px solid var(--border,rgba(255,255,255,.16))}
.qn-ta:focus{outline:none;border-color:var(--accent,#f5b75e)}
.qn-row{display:flex;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap}
.qn-row .qn-spacer{flex:1}

.qn-btn{font:inherit;font-size:.85rem;font-weight:600;padding:8px 16px;
  border-radius:9px;cursor:pointer;border:1px solid transparent;
  background:var(--accent,#f5b75e);color:#1a1004;transition:filter .15s}
.qn-btn:hover{filter:brightness(1.08)}
.qn-btn:disabled{opacity:.5;cursor:default;filter:none}
.qn-btn.ghost{background:transparent;color:var(--text-sec,var(--text-muted,#b9a7d6));
  border-color:var(--border,rgba(255,255,255,.16))}
.qn-btn.ghost:hover{color:var(--text,#efe7ff)}
.qn-btn.danger{background:transparent;border-color:rgba(224,90,90,.5);color:#e05a5a}
.qn-btn.danger:hover{background:rgba(224,90,90,.12)}
.qn-btn.small{font-size:.78rem;padding:5px 11px}

.qn-foot{flex:0 0 auto;padding:10px 16px;font-size:.78rem;
  color:var(--text-ter,var(--text-dim,#8d7ba8));
  border-top:1px solid var(--border,rgba(255,255,255,.12));
  display:flex;align-items:center;gap:8px}
.qn-foot .qn-spacer{flex:1}
.qn-err{color:#e0705a}

.qn-note-note{font-size:.84rem;line-height:1.6;
  color:var(--text-sec,var(--text-muted,#b9a7d6))}

.qn-chip{display:inline-flex;align-items:center;gap:7px;font:inherit;
  font-size:.8rem;font-weight:600;padding:7px 13px;border-radius:999px;
  cursor:pointer;color:var(--text-sec,var(--text-muted,#b9a7d6));
  background:var(--surface2,var(--panel2,rgba(255,255,255,.05)));
  border:1px solid var(--border,rgba(255,255,255,.14))}
.qn-chip:hover{color:var(--accent,#f5b75e);border-color:var(--accent,#f5b75e)}
.qn-chip.on{color:var(--accent,#f5b75e)}

@media (max-width:640px){
  .qn-overlay{padding:0}
  .qn-panel{width:100%;height:100%;max-height:none;border-radius:0;border:0}
  .qn-ctx-ar{font-size:1.25rem;line-height:1.95}
}`;

  let root = null;      // the overlay element, built once and reused
  let els = null;
  let onEsc = null;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function build() {
    if (root) return;
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    root = document.createElement("div");
    root.className = "qn-overlay";
    root.hidden = true;
    root.innerHTML = `
      <div class="qn-panel" role="dialog" aria-modal="true" aria-labelledby="qn-title">
        <div class="qn-bar">
          <div>
            <div class="qn-title" id="qn-title"></div>
            <div class="qn-sub"></div>
          </div>
          <div class="qn-spacer"></div>
          <button class="qn-x" type="button" aria-label="Close">&#10005;</button>
        </div>
        <div class="qn-body"></div>
        <div class="qn-foot"><span class="qn-status"></span></div>
      </div>`;
    document.body.appendChild(root);
    els = {
      panel: root.querySelector(".qn-panel"),
      title: root.querySelector(".qn-title"),
      sub: root.querySelector(".qn-sub"),
      body: root.querySelector(".qn-body"),
      foot: root.querySelector(".qn-foot"),
      status: root.querySelector(".qn-status"),
    };
    root.querySelector(".qn-x").addEventListener("click", close);
    root.addEventListener("click", e => { if (e.target === root) close(); });
  }

  function open() {
    root.hidden = false;
    document.body.style.overflow = "hidden";
    onEsc = e => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onEsc);
  }

  function close() {
    if (!root) return;
    root.hidden = true;
    document.body.style.overflow = "";
    if (onEsc) document.removeEventListener("keydown", onEsc);
    onEsc = null;
  }

  const fmt = iso => {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) +
      " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  };

  /* ── Note editor ───────────────────────────────────────────────────────── */

  function openNotes(sn, an, ctx) {
    build();
    ctx = ctx || {};
    const ref = `${sn}:${an}`;
    els.title.textContent = "Notes on " + ref;
    els.sub.textContent = ctx.surah ? String(ctx.surah) : "";

    const render = () => {
      els.body.innerHTML = "";

      if (ctx.arabic || ctx.translation) {
        const c = document.createElement("div");
        c.className = "qn-ctx";
        c.innerHTML =
          (ctx.arabic ? `<div class="qn-ctx-ar" lang="ar" dir="rtl">${esc(ctx.arabic)}</div>` : "") +
          (ctx.translation ? `<div class="qn-ctx-tr">${esc(ctx.translation)}</div>` : "");
        els.body.appendChild(c);
      }

      const existing = QuranNotes.list(sn, an);
      if (!existing.length) {
        const e = document.createElement("div");
        e.className = "qn-empty";
        e.textContent = "No notes on this ayah yet.";
        els.body.appendChild(e);
      }
      for (const n of existing) els.body.appendChild(noteCard(n, render));

      /* new note */
      const w = document.createElement("div");
      w.className = "qn-write";
      w.innerHTML = `
        <label for="qn-new">${existing.length ? "Add another note" : "Your note"}</label>
        <textarea class="qn-ta" id="qn-new" placeholder="What do you want to remember about this ayah?"></textarea>
        <div class="qn-row"><div class="qn-spacer"></div>
          <button class="qn-btn" type="button">Save note</button></div>`;
      const ta = w.querySelector("textarea");
      const save = w.querySelector("button");
      const commit = () => {
        const body = ta.value.trim();
        if (!body) return;
        QuranNotes.add(sn, an, body);
        render();
      };
      save.addEventListener("click", commit);
      // Ctrl/Cmd+Enter saves, so a long note does not need a mouse trip.
      ta.addEventListener("keydown", e => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") commit();
      });
      els.body.appendChild(w);
      ta.focus();

      status();
    };

    render();
    open();
  }

  function noteCard(n, rerender) {
    const el = document.createElement("div");
    el.className = "qn-note";

    const view = () => {
      el.innerHTML = `
        <div class="qn-note-head">
          <span class="qn-note-date">${esc(fmt(n.created))}${
            n.updated !== n.created ? " · edited" : ""}</span>
          <span class="qn-spacer"></span>
          <button class="qn-btn ghost small" type="button" data-act="edit">Edit</button>
          <button class="qn-btn danger small" type="button" data-act="del">Delete</button>
        </div>
        <div class="qn-note-body">${esc(n.body)}</div>`;
      el.querySelector('[data-act="edit"]').addEventListener("click", edit);
      el.querySelector('[data-act="del"]').addEventListener("click", () => {
        const head = el.querySelector(".qn-note-head");
        head.innerHTML = `<span class="qn-note-date">Delete this note?</span>
          <span class="qn-spacer"></span>
          <button class="qn-btn danger small" type="button" data-act="yes">Delete</button>
          <button class="qn-btn ghost small" type="button" data-act="no">Keep</button>`;
        head.querySelector('[data-act="yes"]').addEventListener("click", () => {
          QuranNotes.remove(n.id);
          rerender();
        });
        head.querySelector('[data-act="no"]').addEventListener("click", view);
      });
    };

    const edit = () => {
      el.innerHTML = `
        <div class="qn-note-head">
          <span class="qn-note-date">${esc(fmt(n.created))}</span>
        </div>
        <textarea class="qn-ta"></textarea>
        <div class="qn-row"><div class="qn-spacer"></div>
          <button class="qn-btn ghost small" type="button" data-act="cancel">Cancel</button>
          <button class="qn-btn small" type="button" data-act="save">Save</button></div>`;
      const ta = el.querySelector("textarea");
      ta.value = n.body;
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
      el.querySelector('[data-act="cancel"]').addEventListener("click", view);
      el.querySelector('[data-act="save"]').addEventListener("click", () => {
        const body = ta.value.trim();
        if (body) QuranNotes.update(n.id, body);
        else QuranNotes.remove(n.id);
        rerender();
      });
    };

    view();
    return el;
  }

  /* ── Backup: export / import ───────────────────────────────────────────── */

  function status(msg, isErr) {
    if (!els) return;
    const err = QuranNotes.error();
    if (msg) { els.status.className = "qn-status" + (isErr ? " qn-err" : ""); els.status.textContent = msg; return; }
    if (err) { els.status.className = "qn-status qn-err"; els.status.textContent = err; return; }
    els.status.className = "qn-status";
    els.status.textContent = "Saved on this device.";
  }

  function exportFile() {
    const doc = QuranNotes.export();
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    const stamp = new Date().toISOString().slice(0, 10);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `quran-connect-notes-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return doc.count;
  }

  function importFile(file, done) {
    const reader = new FileReader();
    reader.onerror = () => done(new Error("Could not read that file."));
    reader.onload = () => {
      let doc;
      try { doc = JSON.parse(reader.result); }
      catch (e) { return done(new Error("That file is not valid JSON.")); }
      try { done(null, QuranNotes.import(doc)); }
      catch (e) { done(e); }
    };
    reader.readAsText(file);
  }

  function openBackup() {
    build();
    els.title.textContent = "Your notes";
    els.sub.textContent = "";

    const render = () => {
      els.body.innerHTML = "";
      const n = QuranNotes.total();
      const box = document.createElement("div");
      box.innerHTML = `
        <p class="qn-note-note">
          ${n} note${n === 1 ? "" : "s"}, saved in this browser. They stay on this
          device — export them to a file to keep a backup or to carry them to the
          Android app, and import a file to bring them back. The same file works
          both ways; importing merges by note, so importing twice changes nothing.
        </p>
        <div class="qn-row">
          <button class="qn-btn" type="button" data-act="export"${n ? "" : " disabled"}>Export notes…</button>
          <button class="qn-btn ghost" type="button" data-act="import">Import notes…</button>
        </div>
        <input type="file" accept="application/json,.json" hidden>`;
      const file = box.querySelector('input[type="file"]');

      box.querySelector('[data-act="export"]').addEventListener("click", () => {
        try {
          const c = exportFile();
          status(`Exported ${c} note${c === 1 ? "" : "s"}.`);
        } catch (e) {
          status(e.message || "Export failed.", true);
        }
      });
      box.querySelector('[data-act="import"]').addEventListener("click", () => file.click());
      file.addEventListener("change", () => {
        const f = file.files && file.files[0];
        if (!f) return;
        status("Importing…");
        importFile(f, (err, r) => {
          file.value = "";              // let the same file be chosen again
          if (err) { status(err.message || "Import failed.", true); return; }
          const parts = [];
          if (r.added) parts.push(`${r.added} added`);
          if (r.updated) parts.push(`${r.updated} updated`);
          if (r.skipped) parts.push(`${r.skipped} skipped`);
          status(parts.length
            ? "Imported: " + parts.join(", ") + "."
            : "Already up to date — nothing to import.");
          render();
        });
      });

      els.body.appendChild(box);
      status();
    };

    render();
    open();
  }

  /* ── Buttons ───────────────────────────────────────────────────────────── */

  function label(btn) {
    const [sn, an] = btn.dataset.qnRef.split(":").map(Number);
    const n = QuranNotes.count(sn, an);
    btn.classList.toggle("has", n > 0);
    btn.innerHTML = n
      ? `<span class="qn-dot"></span>Notes · ${n}`
      : "Add Notes";
    btn.title = n ? `${n} note${n === 1 ? "" : "s"} on ${sn}:${an}` : `Write a note on ${sn}:${an}`;
  }

  function ayahButton(sn, an, ctx) {
    build();
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "qn-ayah-btn";
    btn.dataset.qnRef = `${sn}:${an}`;
    label(btn);
    btn.addEventListener("click", () =>
      openNotes(sn, an, typeof ctx === "function" ? ctx() : ctx));
    return btn;
  }

  function backupChip() {
    build();
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "qn-chip";
    const paint = () => {
      const n = QuranNotes.total();
      btn.classList.toggle("on", n > 0);
      btn.textContent = n ? `Notes · ${n}` : "Notes";
      btn.title = "Export or import your notes";
    };
    paint();
    btn.addEventListener("click", openBackup);
    QuranNotes.subscribe(paint);
    return btn;
  }

  // One subscription repaints every button on the page, so nothing leaks when
  // the ayah list is thrown away and rebuilt.
  QuranNotes.subscribe(() => {
    document.querySelectorAll(".qn-ayah-btn[data-qn-ref]").forEach(label);
  });

  window.NotesUI = { open: openNotes, openBackup, ayahButton, backupChip, close };
})();
