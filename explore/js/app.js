/**
 * Explore Quran — pure reading module.
 *
 * Data:
 *   ../search/data/surah.json        surah metadata
 *   ../search/data/quran.json        all 6236 ayaat (plain arabic, roots, en)
 *   ../search/data/word_roots.json   normalized word → [roots]
 *   data/wbw/wbw_sNNN.json           per-surah word-by-word {ar,en,ur,tr}
 *   data/word_glosses.json           normalized word → {en:[…], ur:[…]}   (lazy)
 *   ../data/book_index.json          root → page of Fatuhat al-Quran      (lazy)
 *   ../data/translations/*.json      full translations keyed "s:a"        (lazy)
 *   ../data/tafsir/{src}/quran_sNNN.json  tafsir shards keyed "s:a"       (lazy)
 */

/* ── Arabic normalization (mirrors scripts/fetch_wbw.mjs) ────────────────── */

function normalizeArabic(text) {
  if (!text) return '';
  return text
    // strip tashkeel, quranic annotation marks, tatweel (dagger alef -> normVariants)
    .replace(/[ؐ-ًؚ-ٟۖ-ۭـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا') // hamza-alefs, wasla -> alef
    .replace(/ء/g, '')       // lone hamza
    .replace(/ى/g, 'ي') // alef maqsura -> ya
    .replace(/ة/g, 'ه') // ta marbuta -> ha
    .replace(/s+/g, ' ')
    .trim();
}

function normVariants(text) {
  const base = normalizeArabic(text);
  const asAlef = base.replace(/ٰ/g, 'ا');
  const stripped = base.replace(/ٰ/g, '');
  return asAlef === stripped ? [asAlef] : [asAlef, stripped];
}

/* Wa-prefix detection — Uthmani orthography signal:
   a true وَ "and" conjunction is always followed by alef-wasla (ٱ),
   optionally via an attached ب/ك preposition: وَٱلْأَرْضِ، وَبِٱلْآخِرَةِ.
   A root-letter و (وَالِد "father", وَٰلِدَة "mother") never is, so this
   strips only genuine conjunctions — no lexicon needed. */
const WA_PREFIX_RE = /^و[ً-ٟ]?(?=(?:[بك][ً-ٟ]?)?ٱ)/;

function stripWaPrefix(text) {
  // Drop leading quranic section marks (۞ …) and whitespace so the
  // conjunction check anchors on the word itself.
  const s = String(text ?? '').replace(/^[۝-۩\s]+/, '');
  const m = WA_PREFIX_RE.exec(s);
  return m ? s.slice(m[0].length) : s;
}

/* Display-only stripper: removes tashkeel/quranic marks but keeps letter
   spellings (ة، ى، أ …) intact — unlike normalizeArabic, which folds letters
   for matching and would visibly change the word. */
function stripDiacritics(text) {
  return String(text ?? '')
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭ]/g, '') // harakat, quranic annotation marks, dagger alef
    .replace(/ـ/g, '')   // tatweel
    .replace(/ٱ/g, 'ا');      // alef wasla → plain alef
}

/* ── App ─────────────────────────────────────────────────────────────────── */

class ExploreApp {
  constructor() {
    this.surahs = [];
    this.quran = [];          // full ayaat list
    this.quranByRef = {};     // "s:a" → ayah
    this.wordRoots = {};
    this.arNormCache = null;  // ref → ' norm ar ' (padded, lazy)
    this.wbwCache = {};       // surah → shard
    this.translations = { index: [], loaded: {} }; // id → {"s:a": text}
    this.tafsir = { index: {}, loaded: {} };       // "src:NNN" → shard
    this.glosses = { word: null, root: null };
    this.selectedTranslations = ['en_sahih'];
    this.selectedTafsir = [];
    this.currentSurah = 1;
    this.badgesOn = false;
    this.modalLang = 'en';
  }

  async init() {
    this._initTheme();
    const acc = document.getElementById('notes-account');
    if (acc && window.NotesUI) acc.appendChild(NotesUI.backupChip());
    const [surahs, quran, wordRoots, trIndex, tafsirIndex] = await Promise.all([
      this._json('../search/data/surah.json'),
      this._json('../search/data/quran.json?v=3'),
      this._json('../search/data/word_roots.json?v=2'),
      this._json('../data/translations/index.json'),
      this._json('../data/meta/tafsir_index.json'),
    ]);
    this.surahs = surahs;
    this.quran = quran;
    for (const a of quran) this.quranByRef[`${a.sn}:${a.an}`] = a;
    this.wordRoots = wordRoots;
    this.translations.index = trIndex.filter(t => t.status === 'ok');
    this.tafsir.index = tafsirIndex.sources || {};

    this._renderSurahList();
    this._renderControlPanels();
    this._bindControls();
    this._bindModal();

    const hash = location.hash.match(/^#(\d{1,3})(?::(\d{1,3}))?$/);
    const s = hash ? Math.min(114, Math.max(1, +hash[1])) : 1;
    await this.openSurah(s, hash && hash[2] ? +hash[2] : null);
  }

  async _json(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.json();
  }

  /* ── Theme ─────────────────────────────────────────────────────────────── */

  _initTheme() {
    // Shared theme key across all modules (migrates old 'explore-theme'); default dark
    const saved = localStorage.getItem('theme') || localStorage.getItem('explore-theme');
    const dark = saved !== 'light';
    if (dark) document.documentElement.dataset.theme = 'dark';
    document.getElementById('theme-toggle').addEventListener('click', () => {
      const isDark = document.documentElement.dataset.theme === 'dark';
      if (isDark) delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = 'dark';
      localStorage.setItem('theme', isDark ? 'light' : 'dark');
    });
  }

  /* ── Sidebar ───────────────────────────────────────────────────────────── */

  _renderSurahList() {
    const host = document.getElementById('surah-list');
    host.innerHTML = '';
    for (const s of this.surahs) {
      const btn = document.createElement('button');
      btn.className = 'surah-item';
      btn.type = 'button';
      btn.dataset.no = s.no;
      btn.innerHTML = `
        <span class="surah-num">${s.no}</span>
        <span class="surah-names">
          <span class="surah-name-en">${this._esc(s.en)}</span>
          <span class="surah-meta">${s.verses} verses · ${this._esc(s.place)}</span>
        </span>
        <span class="surah-ar" lang="ar">${this._esc(s.ar)}</span>`;
      btn.addEventListener('click', () => this.openSurah(s.no));
      host.appendChild(btn);
    }
    document.getElementById('surah-filter').addEventListener('input', e => {
      const q = e.target.value.trim().toLowerCase();
      host.querySelectorAll('.surah-item').forEach(el => {
        el.hidden = q && !el.textContent.toLowerCase().includes(q);
      });
    });
  }

  /* ── Controls ──────────────────────────────────────────────────────────── */

  _renderControlPanels() {
    const trPanel = document.getElementById('translations-panel');
    trPanel.innerHTML = '';
    for (const t of this.translations.index) {
      trPanel.appendChild(this._panelOption(t.id, `${t.name}`, `${t.author} · ${t.lang}`,
        this.selectedTranslations.includes(t.id), id => this._toggleTranslation(id)));
    }
    const tfPanel = document.getElementById('tafsir-panel');
    tfPanel.innerHTML = '';
    for (const [id, src] of Object.entries(this.tafsir.index)) {
      tfPanel.appendChild(this._panelOption(id, src.label, `${src.author} · ${src.lang}`,
        false, i => this._toggleTafsir(i)));
    }
  }

  _panelOption(id, name, sub, checked, onToggle) {
    const label = document.createElement('label');
    label.className = 'panel-option';
    label.innerHTML = `
      <input type="checkbox" ${checked ? 'checked' : ''}>
      <span><span class="opt-name">${this._esc(name)}</span><span class="opt-sub">${this._esc(sub)}</span></span>`;
    label.querySelector('input').addEventListener('change', () => onToggle(id));
    return label;
  }

  _bindControls() {
    for (const kind of ['translations', 'tafsir']) {
      const btn = document.getElementById(`${kind}-btn`);
      const panel = document.getElementById(`${kind}-panel`);
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const wasHidden = panel.hidden;
        document.querySelectorAll('.control-panel').forEach(p => p.hidden = true);
        panel.hidden = !wasHidden;
        btn.classList.toggle('open', !panel.hidden);
      });
      panel.addEventListener('click', e => e.stopPropagation());
    }
    document.addEventListener('click', () => {
      document.querySelectorAll('.control-panel').forEach(p => p.hidden = true);
      document.querySelectorAll('.control-btn').forEach(b => b.classList.remove('open'));
    });
    document.getElementById('badges-toggle').addEventListener('change', e => {
      this.badgesOn = e.target.checked;
      document.querySelectorAll('.ayah-badges').forEach(el => el.hidden = !this.badgesOn);
    });
  }

  async _toggleTranslation(id) {
    const i = this.selectedTranslations.indexOf(id);
    if (i >= 0) this.selectedTranslations.splice(i, 1);
    else this.selectedTranslations.push(id);
    document.getElementById('translations-count').textContent = this.selectedTranslations.length;
    await this._ensureTranslations();
    this._rerenderAyaat();
  }

  async _toggleTafsir(id) {
    const i = this.selectedTafsir.indexOf(id);
    if (i >= 0) this.selectedTafsir.splice(i, 1);
    else this.selectedTafsir.push(id);
    document.getElementById('tafsir-count').textContent = this.selectedTafsir.length;
    await this._ensureTafsir(this.currentSurah);
    this._rerenderAyaat();
  }

  async _ensureTranslations() {
    await Promise.all(this.selectedTranslations.map(async id => {
      if (this.translations.loaded[id]) return;
      const meta = this.translations.index.find(t => t.id === id);
      if (!meta) return;
      this.translations.loaded[id] = await this._json(`../${meta.path}`);
    }));
  }

  async _ensureTafsir(surahNo) {
    const nnn = String(surahNo).padStart(3, '0');
    await Promise.all(this.selectedTafsir.map(async id => {
      const key = `${id}:${nnn}`;
      if (this.tafsir.loaded[key]) return;
      const src = this.tafsir.index[id];
      if (!src) return;
      const path = src.shard_pattern.replace('{NNN}', nnn);
      try { this.tafsir.loaded[key] = await this._json(`../${path}`); }
      catch { this.tafsir.loaded[key] = {}; }
    }));
  }

  /* ── Reader ────────────────────────────────────────────────────────────── */

  async openSurah(no, jumpAyah = null) {
    this.currentSurah = no;
    history.replaceState(null, '', `#${no}${jumpAyah ? ':' + jumpAyah : ''}`);
    document.querySelectorAll('.surah-item').forEach(el =>
      el.classList.toggle('active', +el.dataset.no === no));

    const meta = this.surahs.find(s => s.no === no);
    document.getElementById('surah-header').innerHTML = `
      <div class="sh-ar" lang="ar">${this._esc(meta.ar)}</div>
      <div class="sh-en">${meta.no}. ${this._esc(meta.en)}</div>
      <div class="sh-meta">${this._esc(meta.roman)} · ${meta.verses} verses · ${this._esc(meta.place)}</div>`;

    const listEl = document.getElementById('ayah-list');
    listEl.innerHTML = '';
    document.getElementById('loading').hidden = false;

    const nnn = String(no).padStart(3, '0');
    if (!this.wbwCache[no]) {
      try { this.wbwCache[no] = await this._json(`data/wbw/wbw_s${nnn}.json`); }
      catch { this.wbwCache[no] = {}; }
    }
    await this._ensureTranslations();
    await this._ensureTafsir(no);

    document.getElementById('loading').hidden = true;
    this._rerenderAyaat();

    if (jumpAyah) {
      const el = document.getElementById(`ayah-${no}-${jumpAyah}`);
      if (el) { el.scrollIntoView({ block: 'start' }); el.classList.add('flash'); }
    } else {
      scrollTo({ top: 0 });
    }
  }

  _rerenderAyaat() {
    const listEl = document.getElementById('ayah-list');
    listEl.innerHTML = '';
    const no = this.currentSurah;
    const meta = this.surahs.find(s => s.no === no);
    const wbw = this.wbwCache[no] || {};
    const nnn = String(no).padStart(3, '0');

    for (let a = 1; a <= meta.verses; a++) {
      const ref = `${no}:${a}`;
      const ayah = this.quranByRef[ref];
      const words = wbw[ref] || [];
      const card = document.createElement('article');
      card.className = 'ayah-card';
      card.id = `ayah-${no}-${a}`;

      let html = `
        <div class="ayah-topline">
          <span class="ayah-ref">${ref}</span>
          <a class="ayah-pairs-btn" href="../?ayah=${ref}" title="Explore this ayah's connections — meaning & root-word pairs">Pairs →</a>
          <button class="ayah-badges-btn" type="button" data-ref="${ref}">words &amp; roots</button>
        </div>
        <div class="ayah-arabic" lang="ar">${
          words.length
            ? words.map((w, i) => this._esc(w.ar)).join(' ')
            : this._esc(ayah?.ar || '')
        }</div>`;

      // Translations
      html += '<div class="ayah-translations">';
      for (const id of this.selectedTranslations) {
        const meta2 = this.translations.index.find(t => t.id === id);
        const text = this.translations.loaded[id]?.[ref];
        if (!text) continue;
        const isUr = meta2?.lang === 'ur';
        html += `<div class="ayah-tr${isUr ? ' urdu' : ''}"><span class="tr-label">${this._esc(meta2?.name || id)}</span>${this._esc(text)}</div>`;
      }
      html += '</div>';

      // Badges (hidden initially)
      if (words.length) {
        const rootSet = new Map(); // root → true (ordered)
        for (const w of words) {
          const variants = normVariants(w.ar);
          const norm = variants.find(v => this.wordRoots[v]) || variants[0];
          for (const r of (this.wordRoots[norm] || [])) rootSet.set(r, true);
        }
        html += `<div class="ayah-badges" ${this.badgesOn ? '' : 'hidden'}>
          <div class="badges-label">Words</div>
          <div class="badges-row">${
            words.map((w, i) =>
              `<button class="word-badge" type="button" data-ref="${ref}" data-idx="${i}">
                 <span class="wb-ar" lang="ar">${this._esc(stripDiacritics(stripWaPrefix(w.ar)))}</span>
                 <span class="wb-gloss">${this._esc(w.en)}</span>
               </button>`).join('')
          }</div>
          ${rootSet.size ? `<div class="badges-label">Roots</div>
          <div class="badges-row">${
            [...rootSet.keys()].map(r =>
              `<button class="root-badge" type="button" data-root="${this._esc(r)}">
                 <span class="rb-tag">root</span>
                 <span class="rb-ar" lang="ar">${this._esc(stripDiacritics(r))}</span>
               </button>`).join('')
          }</div>` : ''}
        </div>`;
      }

      // Tafsir
      if (this.selectedTafsir.length) {
        html += '<div class="ayah-tafsir">';
        for (const id of this.selectedTafsir) {
          const src = this.tafsir.index[id];
          const text = this.tafsir.loaded[`${id}:${nnn}`]?.[ref];
          if (!text) continue;
          const isUr = src?.lang === 'ur';
          html += `<details class="tafsir-block">
            <summary>${this._esc(src?.label || id)}</summary>
            <div class="tafsir-text${isUr ? ' urdu' : ''}">${this._esc(text)}</div>
          </details>`;
        }
        html += '</div>';
      }

      card.innerHTML = html;

      card.querySelector('.ayah-badges-btn')?.addEventListener('click', e => {
        const badges = card.querySelector('.ayah-badges');
        if (!badges) return;
        badges.hidden = !badges.hidden;
        e.target.classList.toggle('on', !badges.hidden);
      });
      card.querySelectorAll('.word-badge').forEach(btn =>
        btn.addEventListener('click', () => {
          const w = (this.wbwCache[no][btn.dataset.ref] || [])[+btn.dataset.idx];
          if (w) this.openWordModal(w);
        }));
      card.querySelectorAll('.root-badge').forEach(btn =>
        btn.addEventListener('click', () => this.openRootModal(btn.dataset.root)));

      // A study note belongs to the ayah, so its button sits on the same line
      // as the reference. The context is read at click time so the note editor
      // shows whichever translation is on screen right then.
      if (window.NotesUI) {
        card.querySelector('.ayah-topline').appendChild(
          NotesUI.ayahButton(no, a, () => ({
            surah: `${meta.no}. ${meta.en}`,
            arabic: ayah?.ar || '',
            translation: this.translations.loaded.en_sahih?.[ref]
              || this.translations.loaded[this.selectedTranslations[0]]?.[ref] || '',
          })));
      }

      listEl.appendChild(card);
    }
  }

  /* ── Modal ─────────────────────────────────────────────────────────────── */

  _bindModal() {
    const overlay = document.getElementById('word-modal');
    document.getElementById('modal-close').addEventListener('click', () => overlay.hidden = true);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.hidden = true; });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') overlay.hidden = true; });
    document.querySelectorAll('.lang-tab').forEach(tab =>
      tab.addEventListener('click', () => {
        this.modalLang = tab.dataset.lang;
        document.querySelectorAll('.lang-tab').forEach(t =>
          t.classList.toggle('active', t === tab));
        this._renderMeanings();
      }));
  }

  async _ensureGlosses() {
    if (!this.glosses.word) {
      // root_glosses.json is no longer loaded: a root's meaning is the page of
      // Fatuhat al-Quran it is printed on (assets/book-viewer.js).
      [this.glosses.word, this.rootCounts] = await Promise.all([
        this._json('data/word_glosses.json?v=2'),
        this._json('data/root_counts.json?v=1'),
      ]);
    }
  }

  async openWordModal(word) {
    await this._ensureGlosses();
    // Fold a وَ-conjunction prefix so والأرض opens as الأرض and its
    // occurrence list covers both bare and و-prefixed appearances.
    const bareAr = stripWaPrefix(word.ar);
    const bareVariants = normVariants(bareAr);
    // Prefer dictionary entries for the bare form; fall back to the raw form.
    const variants = [...new Set([...bareVariants, ...normVariants(word.ar)])];
    const norm = variants.find(v => this.wordRoots[v] || this.glosses.word[v]) || variants[0];
    const roots = this.wordRoots[norm] || [];

    this._modalState = {
      arabic: stripDiacritics(bareAr),
      sub: `${word.tr || ''}${roots.length ? ' · root: ' + roots.map(stripDiacritics).join(' ، ') : ''}`,
      meanings: this.glosses.word[norm] || { en: [], ur: [] },
      occurrences: this._findWordOccurrences(bareVariants),
      occLabel: 'this word',
    };
    this._renderModal();
  }

  async openRootModal(root) {
    await Promise.all([this._ensureGlosses(), BookViewer.load('../')]);
    const occ = this.quran.filter(a => (a.roots || []).includes(root));
    const count = this.rootCounts?.[root];
    this._modalState = {
      arabic: stripDiacritics(root),
      sub: `Arabic root · occurs ${count || occ.length} times in the Quran · across ${occ.length} ayaat`,
      // A root's meaning is the page of Fatuhat al-Quran it is printed on.
      book: root,
      occurrences: occ,
      occLabel: 'this root',
    };
    this._renderModal();
  }

  _findWordOccurrences(variants) {
    if (!this.arNormCache) {
      // Haystack: every word of the ayah in all normalized spellings
      // (dagger-alef as alef AND dropped), plus — for وَ-conjunction words —
      // the bare form, so searching الارض also hits ayaat with والارض.
      this.arNormCache = {};
      for (const a of this.quran) {
        const parts = [];
        for (const t of String(a.ar).split(/\s+/)) {
          parts.push(...normVariants(t));
          const s = stripWaPrefix(t);
          if (s !== t) parts.push(...normVariants(s));
        }
        this.arNormCache[a.id] = ` ${parts.join(' ')} `;
      }
    }
    const needles = variants.map(v => ` ${v} `);
    return this.quran.filter(a => {
      const t = this.arNormCache[a.id];
      return needles.some(n => t.includes(n));
    });
  }

  _renderModal() {
    const st = this._modalState;
    document.getElementById('modal-arabic').textContent = st.arabic;
    document.getElementById('modal-sub').textContent = st.sub;
    this._renderMeanings();

    const occTitle = document.getElementById('modal-occ-title');
    occTitle.textContent =
      `Occurrences — ${st.occurrences.length} ayaat contain ${st.occLabel}`;
    if (window.QuranCsvExport && st.occurrences.length) {
      occTitle.appendChild(QuranCsvExport.makeButton(() => ({
        refs: st.occurrences.map(a => `${a.sn}:${a.an}`),
        label: st.arabic,
        basePath: '../',
      })));
    }
    const host = document.getElementById('modal-occurrences');
    host.innerHTML = '';
    const MAX = 60;
    for (const a of st.occurrences.slice(0, MAX)) {
      const btn = document.createElement('button');
      btn.className = 'occ-item';
      btn.type = 'button';
      btn.innerHTML = `
        <span class="occ-ref">${a.sn}:${a.an} · ${this._esc(a.snr)}</span>
        <span class="occ-ar" lang="ar">${this._esc(a.ar)}</span>
        <span class="occ-en">${this._esc((a.en || '').slice(0, 180))}</span>`;
      btn.addEventListener('click', () => {
        document.getElementById('word-modal').hidden = true;
        this.openSurah(a.sn, a.an);
      });
      host.appendChild(btn);
    }
    if (st.occurrences.length > MAX) {
      const more = document.createElement('div');
      more.className = 'occ-more';
      more.textContent = `…and ${st.occurrences.length - MAX} more`;
      host.appendChild(more);
    }
    document.getElementById('word-modal').hidden = false;
    document.querySelector('.modal').scrollTop = 0;
  }

  _renderMeanings() {
    const st = this._modalState;
    if (!st) return;
    const host = document.getElementById('modal-meanings');
    const head = document.getElementById('modal-meanings-title');
    const tabs = document.querySelector('#modal-meanings-section .lang-tabs');

    // Roots: the book's own page, opened at this root (no language choice).
    if (st.book) {
      head.textContent = 'Meaning';
      tabs.hidden = true;
      host.className = 'meanings';
      host.innerHTML = '';
      host.appendChild(BookViewer.button(st.book));
      return;
    }

    head.textContent = 'Possible meanings';
    tabs.hidden = false;
    const lang = this.modalLang;
    const list = (st.meanings || {})[lang] || [];
    host.className = `meanings${lang === 'ur' ? ' urdu' : ''}`;
    host.innerHTML = list.length
      ? list.map(m => `<span class="meaning-chip">${this._esc(m)}</span>`).join('')
      : '<span class="meanings-empty">No dictionary entries found for this item.</span>';
  }

  _esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

const app = new ExploreApp();
document.addEventListener('DOMContentLoaded', () => {
  app.init().catch(e => {
    document.getElementById('loading').hidden = false;
    document.getElementById('loading').textContent = `Failed to load data: ${e.message}`;
  });
});
