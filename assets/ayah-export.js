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

  const HEADER = ['Ser', 'Surah', 'Juzz', 'Ayat', 'Arabic Ayat Actual',
    'Arabic Ayat Cleaned', 'Translation',
    'List of Words', 'List of Root Words'];

  // The shared row model both the CSV and the XLSX are built from: the header
  // (with the chosen edition's name in the Translation column) plus one array
  // per ayah. Cells are numbers or strings; the writers format from there.
  async function buildRows(refs, basePath, translation) {
    const [byRef, tr] = await Promise.all([
      loadQuran(basePath || ''),
      loadTranslation(basePath || '', translation.id),
    ]);
    const header = HEADER.slice();
    header[6] = translation.name || 'Translation';
    const rows = [];
    let ser = 0;
    for (const ref of refs) {
      const a = byRef[ref];
      if (!a) continue;
      const cleaned = stripDiacriticsCsv(a.ar).replace(/\s+/g, ' ').trim();
      const words = cleaned.split(' ').filter(Boolean).join(', ');
      const roots = (a.roots || []).join(', ');
      rows.push([++ser, a.sn, a.juz, a.an, a.ar, cleaned,
        tr[ref] || '', words, roots]);
    }
    return { header, rows };
  }

  async function buildCsv(refs, basePath, translation) {
    const { header, rows } = await buildRows(refs, basePath, translation);
    const lines = [header.map(csvField).join(',')];
    for (const r of rows) lines.push(r.map(csvField).join(','));
    return lines.join('\r\n');
  }

  /* ── XLSX (root exports) ───────────────────────────────────────────────────
     A root's export is a real .xlsx so the dictionary page it opens under
     "See Meanings" can be embedded in the sheet. There is no library here (the
     Android app has no network), so the file is hand-built: an .xlsx is just a
     ZIP of XML parts plus the image, which the helpers below assemble. */

  // CRC-32 (used by the ZIP central directory).
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  const utf8 = s => new TextEncoder().encode(s);

  // A ZIP archive, all entries STOREd (no compression — valid for .xlsx and
  // dependency-free). `files` is [{ name, data: Uint8Array }].
  function zipStore(files) {
    const enc = files.map(f => {
      const name = utf8(f.name);
      return { name, nameStr: f.name, data: f.data, crc: crc32(f.data) };
    });
    const chunks = [];
    let offset = 0;
    const central = [];
    const u16 = n => [n & 0xFF, (n >>> 8) & 0xFF];
    const u32 = n => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];

    for (const f of enc) {
      const local = [].concat(
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(f.crc), u32(f.data.length), u32(f.data.length),
        u16(f.name.length), u16(0));
      const localHead = new Uint8Array(local);
      chunks.push(localHead, f.name, f.data);
      const localOffset = offset;
      offset += localHead.length + f.name.length + f.data.length;

      central.push(new Uint8Array([].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(f.crc), u32(f.data.length), u32(f.data.length),
        u16(f.name.length), u16(0), u16(0), u16(0), u16(0), u32(0),
        u32(localOffset))));
      central.push(f.name);
    }
    const centralStart = offset;
    let centralSize = 0;
    for (const c of central) centralSize += c.length;
    const end = new Uint8Array([].concat(
      u32(0x06054b50), u16(0), u16(0), u16(enc.length), u16(enc.length),
      u32(centralSize), u32(centralStart), u16(0)));

    const total = offset + centralSize + end.length;
    const out = new Uint8Array(total);
    let p = 0;
    for (const c of chunks) { out.set(c, p); p += c.length; }
    for (const c of central) { out.set(c, p); p += c.length; }
    out.set(end, p);
    return out;
  }

  const xmlEsc = s => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Strip characters XML 1.0 forbids, so a stray control byte can't corrupt the file.
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  function colName(i) {
    let s = '';
    i += 1;
    while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; }
    return s;
  }

  function sheetXml(header, rows, hasImage) {
    const all = [header, ...rows];
    let body = '';
    all.forEach((row, r) => {
      const rn = r + 1;
      let cells = '';
      row.forEach((val, c) => {
        const ref = colName(c) + rn;
        if (typeof val === 'number' && isFinite(val)) {
          cells += `<c r="${ref}"><v>${val}</v></c>`;
        } else {
          cells += `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(val)}</t></is></c>`;
        }
      });
      body += `<row r="${rn}">${cells}</row>`;
    });
    const drawing = hasImage ? '<drawing r:id="rId1"/>' : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData>${body}</sheetData>${drawing}</worksheet>`;
  }

  const EMU_PER_PX = 9525;   // at 96 dpi

  function drawingXml(anchorRow, cx, cy) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${anchorRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="Dictionary meaning"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`;
  }

  // Fetch a book page (WebP) and re-encode as PNG — Excel cannot render WebP,
  // and the page is text on white, so PNG keeps it crisp. Returns
  // { bytes, width, height } or null if anything about it fails.
  async function pngFromUrl(url) {
    try {
      const img = await new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = rej;
        im.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
      if (!blob) return null;
      return { bytes: new Uint8Array(await blob.arrayBuffer()),
        width: img.naturalWidth, height: img.naturalHeight };
    } catch { return null; }
  }

  // Build the .xlsx bytes from the shared rows plus an optional page image.
  function buildXlsxBytes(header, rows, image) {
    const hasImage = !!image;
    const parts = [];
    parts.push({ name: '[Content_Types].xml', data: utf8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${hasImage ? '<Default Extension="png" ContentType="image/png"/>' : ''}<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>${hasImage ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : ''}</Types>`) });
    parts.push({ name: '_rels/.rels', data: utf8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) });
    parts.push({ name: 'xl/workbook.xml', data: utf8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Ayaat" sheetId="1" r:id="rId1"/></sheets></workbook>`) });
    parts.push({ name: 'xl/_rels/workbook.xml.rels', data: utf8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`) });

    let anchorRow = 0, cx = 0, cy = 0;
    if (hasImage) {
      anchorRow = header.length + rows.length + 2;   // a blank row under the table
      const displayW = Math.min(image.width, 1100);
      const k = displayW / image.width;
      cx = Math.round(image.width * k * EMU_PER_PX);
      cy = Math.round(image.height * k * EMU_PER_PX);
    }
    parts.push({ name: 'xl/worksheets/sheet1.xml', data: utf8(sheetXml(header, rows, hasImage)) });

    if (hasImage) {
      parts.push({ name: 'xl/worksheets/_rels/sheet1.xml.rels', data: utf8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`) });
      parts.push({ name: 'xl/drawings/drawing1.xml', data: utf8(drawingXml(anchorRow, cx, cy)) });
      parts.push({ name: 'xl/drawings/_rels/drawing1.xml.rels', data: utf8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>`) });
      parts.push({ name: 'xl/media/image1.png', data: image.bytes });
    }
    return zipStore(parts);
  }

  // base64 for handing binary to the native saveXlsx bridge (no network).
  function base64FromBytes(bytes) {
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }

  // Build the whole .xlsx for a set of refs, embedding the book page for `book`
  // (a root) when the dictionary has it.
  async function buildXlsx(refs, basePath, translation, book) {
    const { header, rows } = await buildRows(refs, basePath, translation);
    let image = null;
    if (book && window.BookViewer && typeof BookViewer.pageInfo === 'function') {
      // The host module already kicked off BookViewer.load with the right base
      // when the modal opened; awaiting the cached promise makes sure the index
      // is ready before pageInfo reads it.
      try { if (BookViewer.load) await BookViewer.load(); } catch {}
      const info = BookViewer.pageInfo(book);
      if (info) image = await pngFromUrl(info.url);
    }
    return buildXlsxBytes(header, rows, image);
  }

  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  function safeName(label) {
    const safe = String(label || 'ayaat').replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '');
    return safe || 'export';
  }

  function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // A root export is an .xlsx carrying the dictionary meaning page; a word export
  // (or any modal with no root) stays a CSV. `book`, when set, is the root whose
  // page is embedded.
  async function download({ refs, label, basePath, button, translation, book }) {
    const restore = button ? button.textContent : null;
    if (button) { button.disabled = true; button.textContent = 'Exporting…'; }
    try {
      if (book) {
        const bytes = await buildXlsx(refs, basePath || '', translation, book);
        const filename = 'quran-ayaat-' + safeName(label) + '-' + refs.length + '.xlsx';
        // Inside the Android app a blob <a download> silently does nothing, so hand
        // the bytes (base64, since the bridge takes only strings) to the native
        // side, which writes them through the system "Save as" dialog.
        if (window.QuranAndroid && typeof window.QuranAndroid.saveXlsx === 'function') {
          window.QuranAndroid.saveXlsx(filename, base64FromBytes(bytes));
          return;
        }
        downloadBlob(new Blob([bytes], { type: XLSX_MIME }), filename);
        return;
      }
      const csv = await buildCsv(refs, basePath, translation);
      // UTF-8 BOM so Excel renders Arabic/Urdu correctly
      const withBom = '\uFEFF' + csv;
      const filename = 'quran-ayaat-' + safeName(label) + '-' + refs.length + '.csv';
      // Inside the Android app a blob <a download> silently does nothing, so hand
      // the finished CSV to the native side, which writes it through the system
      // "Save as" dialog and shows its own confirmation.
      if (window.QuranAndroid && typeof window.QuranAndroid.saveCsv === 'function') {
        window.QuranAndroid.saveCsv(filename, withBom);
        return;
      }
      downloadBlob(new Blob([withBom], { type: 'text/csv;charset=utf-8' }), filename);
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
      ok.textContent = 'Export';

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
    btn.textContent = 'Export';
    btn.title = 'Download all listed ayaat as a spreadsheet';
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
