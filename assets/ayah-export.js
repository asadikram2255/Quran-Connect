/**
 * ayah-export.js — shared CSV exporter for word/root occurrence modals.
 *
 * Used by all three modules (Explore Connections, Explore Quran, Search Quran).
 * Exports a list of ayah refs ("s:a") as a CSV matching the user's
 * "Exported File Columns.xlsx" template:
 *
 *   Ser, Surah, Juzz, Ayat, Arabic Ayat Actual, Arabic Ayat Cleaned,
 *   English Translation, Urdu Translation, List of Words, List of Root Words
 *
 * - Arabic Actual  = Uthmani text (with tashkeel), from search/data/quran.json
 * - Arabic Cleaned = diacritics stripped, letter spellings kept
 * - English        = Sahih International (data/translations/en_sahih.json)
 * - Urdu           = Muhammad Junagarhi (data/translations/ur_junagarhi.json)
 * - List of Words  = cleaned words in ayah order, comma-separated
 * - List of Roots  = ayah roots in order, comma-separated
 * - Ser            = row number within the exported file (1..N)
 */
(function () {
  'use strict';

  let _dataPromise = null;

  function stripDiacriticsCsv(text) {
    return String(text || '')
      .replace(/[ؐ-ًؚ-ٰٟۖ-ۭ]/g, '')
      .replace(/ـ/g, '')      // tatweel
      .replace(/ٱ/g, 'ا'); // alef wasla → plain alef
  }

  function loadData(basePath) {
    if (!_dataPromise) {
      const get = url => fetch(basePath + url).then(r => {
        if (!r.ok) throw new Error(url + ' → HTTP ' + r.status);
        return r.json();
      });
      _dataPromise = Promise.all([
        get('search/data/quran.json'),
        get('data/translations/en_sahih.json'),
        get('data/translations/ur_junagarhi.json'),
      ]).then(([quran, en, ur]) => {
        const byRef = {};
        for (const a of quran) byRef[a.sn + ':' + a.an] = a;
        return { byRef, en, ur };
      }).catch(e => { _dataPromise = null; throw e; });
    }
    return _dataPromise;
  }

  function csvField(v) {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  async function buildCsv(refs, basePath) {
    const { byRef, en, ur } = await loadData(basePath || '');
    const header = ['Ser', 'Surah', 'Juzz', 'Ayat', 'Arabic Ayat Actual',
      'Arabic Ayat Cleaned', 'English Translation', 'Urdu Translation',
      'List of Words', 'List of Root Words'];
    const lines = [header.join(',')];
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
        csvField(en[ref] || ''), csvField(ur[ref] || ''),
        csvField(words), csvField(roots),
      ].join(','));
    }
    return lines.join('\r\n');
  }

  async function download({ refs, label, basePath, button }) {
    const restore = button ? button.textContent : null;
    if (button) { button.disabled = true; button.textContent = 'Exporting…'; }
    try {
      const csv = await buildCsv(refs, basePath);
      // UTF-8 BOM so Excel renders Arabic/Urdu correctly
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
      const safe = String(label || 'ayaat').replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'quran-ayaat-' + (safe || 'export') + '-' + refs.length + '.csv';
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

  // Ready-made button, styled to sit inside any of the three modals.
  function makeButton(getExport) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'csv-export-btn';
    btn.textContent = 'Export CSV';
    btn.title = 'Download all listed ayaat as a CSV file';
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const opts = getExport();
      if (!opts || !opts.refs || !opts.refs.length) return;
      download({ ...opts, button: btn });
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
  `;
  document.head.appendChild(style);

  window.QuranCsvExport = { buildCsv, download, makeButton };
})();
