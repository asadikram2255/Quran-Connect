/**
 * ayah-export.js — shared CSV exporter for word/root occurrence modals.
 *
 * Used by all three modules (Explore Ayaah Connections, Explore Quran, Search Quran).
 * Clicking "Export CSV" first asks which ONE translation to include, then exports
 * the listed ayah refs ("s:a") as a CSV:
 *
 *   Ser, Surah, Juzz, Ayat, Arabic Ayat Actual, Arabic Ayat Cleaned,
 *   <chosen translation>, List of Words, List of Root Words
 *
 * - Arabic Actual  = Uthmani text (with tashkeel), from search/data/quran.json
 * - Arabic Cleaned = diacritics stripped, letter spellings kept
 * - Translation    = the single edition the user picks (its name is the column
 *                    header), loaded from data/translations/<id>.json; the list of
 *                    editions comes from data/translations/index.json
 * - List of Words  = cleaned words in ayah order, comma-separated
 * - List of Roots  = ayah roots in order, comma-separated
 * - Ser            = row number within the exported file (1..N)
 *
 * Inside the Android app a blob <a download> is a dead-end, so when the native
 * bridge is present the finished CSV is handed to QuranAndroid.saveCsv, which
 * writes it through the system "Save as" dialog. On the web it downloads directly.
 */
(function () {
  'use strict';

  let _quranPromise = null;
  let _indexPromise = null;
  const _trCache = {};

  function stripDiacriticsCsv(text) {
    return String(text || '')
      .replace(/[ؐ-ًؚ-ٰٟۖ-ۭ]/g, '')
      .replace(/ـ/g, '')      // tatweel
      .replace(/ٱ/g, 'ا'); // alef wasla → plain alef
  }

  function getJson(url) {
    return fetch(url).then(r => {
      if (!r.ok) throw new Error(url + ' → HTTP ' + r.status);
      return r.json();
    });
  }

  // All 6236 ayaat keyed "sn:an" (Arabic, roots, juz), cached for the session.
  function loadQuran(basePath) {
    if (!_quranPromise) {
      _quranPromise = getJson(basePath + 'search/data/quran.json')
        .then(quran => {
          const byRef = {};
          for (const a of quran) byRef[a.sn + ':' + a.an] = a;
          return byRef;
        })
        .catch(e => { _quranPromise = null; throw e; });
    }
    return _quranPromise;
  }

  // The one translation the user picked, keyed "sn:an"; cached per id.
  function loadTranslation(basePath, id) {
    if (!_trCache[id]) {
      _trCache[id] = getJson(basePath + 'data/translations/' + id + '.json')
        .catch(e => { delete _trCache[id]; throw e; });
    }
    return _trCache[id];
  }

  // The list of available editions (id, name, lang), only the ready ones.
  function loadIndex(basePath) {
    if (!_indexPromise) {
      _indexPromise = getJson(basePath + 'data/translations/index.json')
        .then(list => list.filter(t => t && t.status === 'ok'))
        .catch(e => { _indexPromise = null; throw e; });
    }
    return _indexPromise;
  }

  function csvField(v) {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  async function buildCsv(refs, basePath, translation) {
    const [byRef, tr] = await Promise.all([
      loadQuran(basePath || ''),
      loadTranslation(basePath || '', translation.id),
    ]);
    const header = ['Ser', 'Surah', 'Juzz', 'Ayat', 'Arabic Ayat Actual',
      'Arabic Ayat Cleaned', translation.name || 'Translation',
      'List of Words', 'List of Root Words'];
    const lines = [header.map(csvField).join(',')];
    let ser = 0;
    for (const ref of refs) {
      const a = byRef[ref];
      if (!a) continue;
      const cleaned = stripDiacriticsCsv(a.ar).replace(/\s+/g, ' ').trim();
      const words = cleaned.split(' ').filter(Boolean).join(', ');
      const roots = (a.roots || []).join(', ');
      lines.push([
        ++ser, a.sn, a.juz, a.an,
        csvField(a.ar), csvField(cleaned),
        csvField(tr[ref] || ''),
        csvField(words), csvField(roots),
      ].join(','));
    }
    return lines.join('\r\n');
  }

  async function download({ refs, label, basePath, button, translation }) {
    const restore = button ? button.textContent : null;
    if (button) { button.disabled = true; button.textContent = 'Exporting…'; }
    try {
      const csv = await buildCsv(refs, basePath, translation);
      // UTF-8 BOM so Excel renders Arabic/Urdu correctly
      const withBom = '\uFEFF' + csv;
      const safe = String(label || 'ayaat').replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '');
      const filename = 'quran-ayaat-' + (safe || 'export') + '-' + refs.length + '.csv';
      // Inside the Android app a blob <a download> silently does nothing, so hand
      // the finished CSV to the native side, which writes it through the system
      // "Save as" dialog and shows its own confirmation.
      if (window.QuranAndroid && typeof window.QuranAndroid.saveCsv === 'function') {
        window.QuranAndroid.saveCsv(filename, withBom);
        return;
      }
      const blob = new Blob([withBom], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) {
      console.error('[ayah-export]', e);
      alert('Export failed: ' + e.message);
    } finally {
      if (button) { button.disabled = false; button.textContent = restore; }
    }
  }

  // Small modal that asks which ONE translation to place in the sheet.
  // Resolves with { id, name }, or null if the reader cancels.
  function pickTranslation(basePath) {
    return loadIndex(basePath).then(list => new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'csv-pick-overlay';
      const card = document.createElement('div');
      card.className = 'csv-pick-card';
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'true');
      card.setAttribute('aria-label', 'Choose a translation for the CSV');

      const h = document.createElement('h3');
      h.className = 'csv-pick-title';
      h.textContent = 'Translation for the sheet';
      const note = document.createElement('p');
      note.className = 'csv-pick-note';
      note.textContent = 'Pick one translation to include as the Translation column.';

      const select = document.createElement('select');
      select.className = 'csv-pick-select';
      const labels = { en: 'English', ur: 'Urdu' };
      const seen = [];
      for (const lang of ['en', 'ur', ...list.map(t => t.lang)]) {
        if (seen.includes(lang)) continue;
        seen.push(lang);
        const items = list.filter(t => t.lang === lang);
        if (!items.length) continue;
        const og = document.createElement('optgroup');
        og.label = labels[lang] || lang;
        for (const t of items) {
          const o = document.createElement('option');
          o.value = t.id;
          o.textContent = t.name || t.id;
          og.appendChild(o);
        }
        select.appendChild(og);
      }
      if (list.some(t => t.id === 'en_sahih')) select.value = 'en_sahih';

      const actions = document.createElement('div');
      actions.className = 'csv-pick-actions';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'csv-pick-btn csv-pick-cancel';
      cancel.textContent = 'Cancel';
      const ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'csv-pick-btn csv-pick-ok';
      ok.textContent = 'Export CSV';

      function close(result) {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
        resolve(result);
      }
      function onKey(ev) { if (ev.key === 'Escape') close(null); }

      cancel.addEventListener('click', () => close(null));
      overlay.addEventListener('click', ev => { if (ev.target === overlay) close(null); });
      ok.addEventListener('click', () => {
        const meta = list.find(t => t.id === select.value);
        close(meta ? { id: meta.id, name: meta.name || meta.id } : null);
      });
      document.addEventListener('keydown', onKey);

      actions.append(cancel, ok);
      card.append(h, note, select, actions);
      overlay.appendChild(card);
      document.body.appendChild(overlay);
      select.focus();
    }));
  }

  // Ready-made button, styled to sit inside any of the three modals. Clicking it
  // first asks which translation to include, then exports (native or blob).
  function makeButton(getExport) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'csv-export-btn';
    btn.textContent = 'Export CSV';
    btn.title = 'Download all listed ayaat as a CSV file';
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const opts = getExport();
      if (!opts || !opts.refs || !opts.refs.length) return;
      let translation;
      try {
        translation = await pickTranslation(opts.basePath || '');
      } catch (err) {
        alert('Could not load the translation list: ' + err.message);
        return;
      }
      if (!translation) return; // cancelled
      download({ ...opts, translation, button: btn });
    });
    return btn;
  }

  // Minimal shared styling, injected once so no per-module CSS edits needed.
  const style = document.createElement('style');
  style.textContent = `
    .csv-export-btn {
      display: inline-flex; align-items: center; gap: 6px;
      margin-inline-start: 10px; padding: 4px 12px;
      font: inherit; font-size: 0.78em; font-weight: 600;
      color: inherit; background: transparent;
      border: 1px solid currentColor; border-radius: 999px;
      opacity: 0.75; cursor: pointer; vertical-align: middle;
      transition: opacity .15s;
    }
    .csv-export-btn:hover { opacity: 1; }
    .csv-export-btn:disabled { opacity: 0.4; cursor: wait; }

    .csv-pick-overlay {
      position: fixed; inset: 0; z-index: 10000;
      display: flex; align-items: center; justify-content: center;
      padding: 20px; background: rgba(0, 0, 0, 0.55);
    }
    .csv-pick-card {
      width: min(420px, 100%); box-sizing: border-box;
      padding: 20px 22px; border-radius: 16px;
      background: #17111f; color: #f5efe6;
      border: 1px solid rgba(255, 255, 255, 0.14);
      box-shadow: 0 18px 60px rgba(0, 0, 0, 0.5);
      font: inherit;
    }
    .csv-pick-title { margin: 0 0 6px; font-size: 1.05rem; font-weight: 700; }
    .csv-pick-note { margin: 0 0 14px; font-size: 0.85rem; opacity: 0.75; }
    .csv-pick-select {
      width: 100%; box-sizing: border-box; padding: 10px 12px;
      font: inherit; border-radius: 10px;
      color: #f5efe6; background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.2);
    }
    .csv-pick-select option, .csv-pick-select optgroup { color: #111; }
    .csv-pick-actions {
      display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px;
    }
    .csv-pick-btn {
      padding: 8px 16px; font: inherit; font-weight: 600;
      border-radius: 999px; cursor: pointer; border: 1px solid transparent;
    }
    .csv-pick-cancel {
      color: inherit; background: transparent;
      border-color: rgba(255, 255, 255, 0.25);
    }
    .csv-pick-ok { color: #17111f; background: #f5b75e; }
    .csv-pick-ok:hover { filter: brightness(1.05); }

    :root[data-theme="light"] .csv-pick-card,
    html[data-theme="light"] .csv-pick-card {
      background: #fdf7ec; color: #241a0c;
      border-color: rgba(0, 0, 0, 0.14);
    }
    :root[data-theme="light"] .csv-pick-select,
    html[data-theme="light"] .csv-pick-select {
      color: #241a0c; background: rgba(0, 0, 0, 0.04);
      border-color: rgba(0, 0, 0, 0.2);
    }
    :root[data-theme="light"] .csv-pick-cancel,
    html[data-theme="light"] .csv-pick-cancel {
      border-color: rgba(0, 0, 0, 0.25);
    }
    :root[data-theme="light"] .csv-pick-ok,
    html[data-theme="light"] .csv-pick-ok { color: #fff; background: #b07d1a; }
  `;
  document.head.appendChild(style);

  window.QuranCsvExport = { buildCsv, download, makeButton };
})();
