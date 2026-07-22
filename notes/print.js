/**
 * print.js — every note you have written, in Quran order, ready to print.
 *
 * One entry per ayah: the Arabic, the Saheeh International translation, then
 * each note on that ayah with the date it was written. Printing is the
 * browser's own dialog ("Save as PDF" in the destination list), which is what
 * gets Arabic and Urdu shaped correctly — a JS PDF builder does not.
 *
 * ?auto=1 opens the print dialog once the page has rendered and its fonts are
 * ready; that is the link the landing page's "Print Notes" button uses.
 */
(function () {
  "use strict";

  const stateEl = document.getElementById("state");
  const docEl = document.getElementById("doc");
  const printBtn = document.getElementById("print-btn");
  const acct = document.getElementById("notes-account");
  if (acct && window.NotesUI) acct.appendChild(NotesUI.accountChip());

  const esc = s => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const fmtDate = iso => {
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString(undefined,
      { day: "numeric", month: "long", year: "numeric" });
  };

  function say(title, detail) {
    docEl.hidden = true;
    stateEl.hidden = false;
    stateEl.innerHTML = `<b>${esc(title)}</b>${esc(detail || "")}`;
  }

  async function json(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.json();
  }

  async function render() {
    await QuranNotes.ready;
    const notes = QuranNotes.all();
    if (!notes.length) {
      say("No notes yet.",
        "Open Explore Quran, press “Add Notes” on any ayah, and what you " +
        "write will appear here.");
      return;
    }

    let surahs, quran, sahih;
    try {
      [surahs, quran, sahih] = await Promise.all([
        json("../search/data/surah.json"),
        json("../search/data/quran.json?v=3"),
        json("../data/translations/en_sahih.json"),
      ]);
    } catch (e) {
      say("Could not load the Quran text.", e.message);
      return;
    }

    const surahByNo = {};
    for (const s of surahs) surahByNo[s.no] = s;
    const arByRef = {};
    for (const a of quran) arByRef[`${a.sn}:${a.an}`] = a.ar;

    // QuranNotes.all() is already in surah → ayah → written-at order, so a
    // single pass groups it.
    const groups = [];
    let surah = null;
    let entry = null;
    for (const n of notes) {
      if (!surah || surah.no !== n.sn) {
        surah = { no: n.sn, entries: [] };
        groups.push(surah);
        entry = null;
      }
      if (!entry || entry.an !== n.an) {
        entry = { an: n.an, notes: [] };
        surah.entries.push(entry);
      }
      entry.notes.push(n);
    }

    const user = QuranNotes.user();
    const ayahCount = groups.reduce((t, g) => t + g.entries.length, 0);
    let html = `
      <div class="doc-head">
        <h2 class="doc-title">My Notes on the Qur'an</h2>
        <div class="doc-meta">
          ${notes.length} note${notes.length === 1 ? "" : "s"} on ${ayahCount}
          ayah${ayahCount === 1 ? "" : "s"} across ${groups.length}
          surah${groups.length === 1 ? "" : "s"}
          · printed ${esc(fmtDate(new Date().toISOString()))}
          ${user ? "· " + esc(user.email) : ""}
        </div>
      </div>`;

    for (const g of groups) {
      const meta = surahByNo[g.no] || { en: "Surah " + g.no, ar: "" };
      html += `
        <div class="surah-head">
          <span>${g.no}. ${esc(meta.en)}</span>
          <span class="sh-ar" lang="ar" dir="rtl">${esc(meta.ar)}</span>
        </div>`;
      for (const e of g.entries) {
        const ref = `${g.no}:${e.an}`;
        html += `
          <article class="entry">
            <span class="entry-ref">${ref}</span>
            <div class="entry-ar" lang="ar" dir="rtl">${esc(arByRef[ref] || "")}</div>
            <div class="entry-tr"><span class="src">Saheeh International</span>${esc(sahih[ref] || "")}</div>
            ${e.notes.map(n => `
              <div class="note">
                <div class="note-date">${esc(fmtDate(n.created))}${
                  n.updated !== n.created ? " · edited " + esc(fmtDate(n.updated)) : ""}</div>
                <div class="note-body">${esc(n.body)}</div>
              </div>`).join("")}
          </article>`;
      }
    }

    docEl.innerHTML = html;
    stateEl.hidden = true;
    docEl.hidden = false;
    printBtn.disabled = false;

    if (!autoPrinted && new URLSearchParams(location.search).get("auto") === "1") {
      autoPrinted = true;                 // only ever on the first render
      // Wait for Amiri Quran, otherwise the Arabic prints in a fallback face.
      try { await document.fonts.ready; } catch (e) { /* older browsers */ }
      setTimeout(() => window.print(), 250);
    }
  }

  let autoPrinted = false;
  printBtn.addEventListener("click", () => window.print());

  // A sync finishing, or a note edited in another tab, should refresh the page.
  let pending = null;
  QuranNotes.subscribe(() => {
    clearTimeout(pending);
    pending = setTimeout(render, 400);
  });

  render();
})();
