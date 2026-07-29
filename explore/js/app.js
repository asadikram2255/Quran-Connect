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

/* ── Selectable fonts ──────────────────────────────────────────────────────
   Each option is a CSS font stack applied by pointing --font-ar / --font-ur at
   it (see _applyFonts). id '' means "leave the stylesheet default". The extra
   faces are declared in assets/quran-fonts.css and self-host on both web and
   the offline app. */

const AR_FONTS = [
  { id: '',          label: 'Amiri Quran (default)',   stack: '' },
  { id: 'almushaf',  label: 'Al Mushaf (Uthmani)',     stack: '"Al Mushaf", "Amiri Quran", serif' },
  { id: 'noorehuda', label: 'Noore Huda (IndoPak)',    stack: '"Noore Huda", "Amiri Quran", serif' },
  { id: 'naskh',     label: 'Noto Naskh Arabic',       stack: '"Noto Naskh Arabic", "Amiri", serif' },
];

const UR_FONTS = [
  { id: '',       label: 'Noto Nastaliq Urdu (default)',  stack: '' },
  { id: 'jameel', label: 'Jameel Noori Nastaleeq',        stack: '"Jameel Noori Nastaleeq", "Noto Nastaliq Urdu", serif' },
  { id: 'alvi',   label: 'Alvi Nastaleeq',                stack: '"Alvi Nastaleeq", "Noto Nastaliq Urdu", serif' },
];

/* ── Recitation (web only) ──────────────────────────────────────────────────
   Per-ayah MP3s streamed from everyayah.com; the file name is the 3-digit sura
   and 3-digit ayah. Base URLs (spaces pre-encoded) are the ones the Zekr audio
   descriptors ship. The app has no network, so this whole feature is switched
   off there (see this.isAndroid). */

const RECITERS = [
  { id: 'afasy',      name: 'Mishary Al-Afasy',        base: 'https://everyayah.com/data/Alafasy_128kbps/' },
  { id: 'abdulbasit', name: 'Abdul Basit (Murattal)',  base: 'https://everyayah.com/data/AbdulSamad_64kbps_QuranExplorer.Com/' },
  { id: 'sudais',     name: 'Abdurrahman As-Sudais',   base: 'https://everyayah.com/data/Abdurrahmaan_As-Sudais_192kbps/' },
  { id: 'shuraim',    name: 'Saood Ash-Shuraim',       base: 'https://everyayah.com/data/Saood%20bin%20Ibraaheem%20Ash-Shuraym_128kbps/' },
  { id: 'shatri',     name: 'Abu Bakr Ash-Shatri',     base: 'https://everyayah.com/data/Abu%20Bakr%20Ash-Shaatree_128kbps/' },
  { id: 'muaiqly',    name: 'Maher Al-Muaiqly',        base: 'https://everyayah.com/data/MaherAlMuaiqly128kbps/' },
  { id: 'ghamdi',     name: 'Saad Al-Ghamdi',          base: 'https://everyayah.com/data/Ghamadi_40kbps/' },
  { id: 'minshawi',   name: 'Muhammad Al-Minshawi',    base: 'https://everyayah.com/data/Menshawi_16kbps/' },
];

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
    // Translation/tafsir choices persist across reads (validated against the
    // loaded index in init, so a removed source can't strand the picker).
    this.selectedTranslations = this._loadIds('explore-translations', ['en_sahih']);
    this.selectedTafsir = this._loadIds('explore-tafsir', []);
    this.currentSurah = 1;
    this.badgesOn = false;
    // Language of the per-word gloss under each Arabic word tile (persisted).
    this.wordLang = localStorage.getItem('explore-word-lang') === 'ur' ? 'ur' : 'en';
    this.modalLang = 'en';
    this.occUrdu = null;         // lazy Urdu translation for occurrence cards

    // Font choices (persisted). '' = stylesheet default.
    this.fonts = {
      ar: localStorage.getItem('explore-font-ar') || '',
      ur: localStorage.getItem('explore-font-ur') || '',
    };

    // Recitation. Disabled entirely in the offline app (no network there).
    this.isAndroid = !!(window.QuranAndroid && window.QuranAndroid.share);
    this.reciter = localStorage.getItem('explore-reciter') || 'afasy';
    this.continuous = localStorage.getItem('explore-audio-continuous') === '1';
    this.audio = null;         // lazily created <audio>
    this.playingRef = null;    // "s:a" currently playing, or null
  }

  // A persisted list of selected ids, or the fallback if none/corrupt.
  _loadIds(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback.slice();
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : fallback.slice();
    } catch (e) {
      return fallback.slice();
    }
  }

  async init() {
    this._initTheme();
    const acc = document.getElementById('notes-account');
    if (acc && window.NotesUI) acc.appendChild(NotesUI.backupChip());
    const [surahs, quran, wordRoots, trIndex, tafsirIndex, suraMeta] = await Promise.all([
      this._json('../search/data/surah.json'),
      this._json('../search/data/quran.json?v=3'),
      this._json('../search/data/word_roots.json?v=3'),
      this._json('../data/translations/index.json'),
      this._json('../data/meta/tafsir_index.json'),
      this._json('../data/meta/sura_meta.json?v=1'),
    ]);
    this.surahs = surahs;
    this.suraMeta = {};
    for (const m of suraMeta) this.suraMeta[m.index] = m;
    this.quran = quran;
    for (const a of quran) this.quranByRef[`${a.sn}:${a.an}`] = a;
    this.wordRoots = wordRoots;
    this.translations.index = trIndex.filter(t => t.status === 'ok');
    this.tafsir.index = tafsirIndex.sources || {};

    // Drop any persisted id whose source no longer exists, so a stale choice
    // can't leave a phantom count or a broken fetch. Keep en_sahih as a floor
    // for translations so the reader always shows at least one.
    const trIds = new Set(this.translations.index.map(t => t.id));
    this.selectedTranslations = this.selectedTranslations.filter(id => trIds.has(id));
    if (!this.selectedTranslations.length && trIds.has('en_sahih')) this.selectedTranslations = ['en_sahih'];
    const tafIds = new Set(Object.keys(this.tafsir.index));
    this.selectedTafsir = this.selectedTafsir.filter(id => tafIds.has(id));

    this._applyFonts();
    this._renderSurahList();
    this._wireMobileSidebar();
    this._renderControlPanels();
    this._renderFontPanel();
    this._renderAudioPanel();
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
      const m = this.suraMeta[s.no];
      const rev = m ? (m.revelation === 'madani' ? 'Madani' : 'Makki') : this._esc(s.place);
      btn.innerHTML = `
        <span class="surah-num">${s.no}</span>
        <span class="surah-names">
          <span class="surah-name-en">${this._esc(s.en)}</span>
          <span class="surah-meta"><span class="rev-chip rev-${m ? m.revelation : 'makki'}">${rev}</span> ${s.verses} verses</span>
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

  // On narrow screens the sidebar is hidden and reached through the "☰ Surahs"
  // button as a slide-in drawer. On desktop the button and backdrop are display:
  // none, so this wiring is inert there.
  _wireMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const toggle = document.getElementById('sidebar-toggle');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (!sidebar || !toggle || !backdrop) return;
    const setOpen = open => {
      sidebar.classList.toggle('open', open);
      backdrop.hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    toggle.addEventListener('click', () => setOpen(!sidebar.classList.contains('open')));
    backdrop.addEventListener('click', () => setOpen(false));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
    // Picking a surah closes the drawer so the reader is visible again.
    this._closeMobileSidebar = () => setOpen(false);
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
        this.selectedTafsir.includes(id), i => this._toggleTafsir(i)));
    }
    // Reflect the restored (persisted) selection in the count badges.
    document.getElementById('translations-count').textContent = this.selectedTranslations.length;
    document.getElementById('tafsir-count').textContent = this.selectedTafsir.length;
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
    // Translations, Tafseer, Fonts, word-gloss language and Reciter all live in
    // one Settings modal now (was four separate dropdown buttons that could
    // overflow the viewport on a phone).
    const modal = document.getElementById('settings-modal');
    const openSettings = () => {
      modal.hidden = false;
      document.getElementById('settings-btn')?.classList.add('open');
    };
    const closeSettings = () => {
      modal.hidden = true;
      document.getElementById('settings-btn')?.classList.remove('open');
    };
    document.getElementById('settings-btn')?.addEventListener('click', openSettings);
    document.getElementById('settings-close')?.addEventListener('click', closeSettings);
    modal.addEventListener('click', e => { if (e.target === modal) closeSettings(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !modal.hidden) closeSettings();
    });

    // Word-gloss language tabs (English / اردو).
    const tabs = document.querySelectorAll('#wordlang-tabs .wordlang-tab');
    const syncTabs = () => tabs.forEach(t =>
      t.classList.toggle('active', t.dataset.lang === this.wordLang));
    syncTabs();
    tabs.forEach(tab => tab.addEventListener('click', () => {
      this.wordLang = tab.dataset.lang === 'ur' ? 'ur' : 'en';
      localStorage.setItem('explore-word-lang', this.wordLang);
      syncTabs();
      this._rerenderAyaat();
    }));

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
    localStorage.setItem('explore-translations', JSON.stringify(this.selectedTranslations));
    await this._ensureTranslations();
    this._rerenderAyaat();
  }

  async _toggleTafsir(id) {
    const i = this.selectedTafsir.indexOf(id);
    if (i >= 0) this.selectedTafsir.splice(i, 1);
    else this.selectedTafsir.push(id);
    document.getElementById('tafsir-count').textContent = this.selectedTafsir.length;
    localStorage.setItem('explore-tafsir', JSON.stringify(this.selectedTafsir));
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

  /* ── Fonts ─────────────────────────────────────────────────────────────── */

  _applyFonts() {
    const root = document.documentElement.style;
    const ar = AR_FONTS.find(f => f.id === this.fonts.ar);
    const ur = UR_FONTS.find(f => f.id === this.fonts.ur);
    if (ar && ar.stack) root.setProperty('--font-ar', ar.stack);
    else root.removeProperty('--font-ar');
    if (ur && ur.stack) root.setProperty('--font-ur', ur.stack);
    else root.removeProperty('--font-ur');
  }

  _renderFontPanel() {
    const panel = document.getElementById('fonts-panel');
    if (!panel) return;
    const group = (title, list, current, kind) => {
      const wrap = document.createElement('div');
      wrap.className = 'font-group';
      wrap.innerHTML = `<div class="font-group-title">${title}</div>`;
      for (const opt of list) {
        const label = document.createElement('label');
        label.className = 'panel-option';
        label.innerHTML = `
          <input type="radio" name="font-${kind}" ${opt.id === current ? 'checked' : ''}>
          <span><span class="opt-name" style="${opt.stack ? `font-family:${opt.stack}` : ''}">${this._esc(opt.label)}</span></span>`;
        label.querySelector('input').addEventListener('change', () => this._setFont(kind, opt.id));
        wrap.appendChild(label);
      }
      return wrap;
    };
    panel.innerHTML = '';
    panel.appendChild(group('Arabic (Quran text)', AR_FONTS, this.fonts.ar, 'ar'));
    panel.appendChild(group('Urdu (translations)', UR_FONTS, this.fonts.ur, 'ur'));
  }

  _setFont(kind, id) {
    this.fonts[kind] = id;
    localStorage.setItem(`explore-font-${kind}`, id);
    this._applyFonts();
  }

  /* ── Recitation (web only) ─────────────────────────────────────────────── */

  _renderAudioPanel() {
    const section = document.getElementById('audio-section');
    if (!section) return;
    if (this.isAndroid) { section.hidden = true; return; }   // no network in the app

    const panel = document.getElementById('audio-panel');
    panel.innerHTML = '<div class="font-group-title">Reciter</div>';
    for (const r of RECITERS) {
      const label = document.createElement('label');
      label.className = 'panel-option';
      label.innerHTML = `
        <input type="radio" name="reciter" ${r.id === this.reciter ? 'checked' : ''}>
        <span><span class="opt-name">${this._esc(r.name)}</span></span>`;
      label.querySelector('input').addEventListener('change', () => {
        this.reciter = r.id;
        localStorage.setItem('explore-reciter', r.id);
      });
      panel.appendChild(label);
    }
    const cont = document.createElement('label');
    cont.className = 'panel-option cont-option';
    cont.innerHTML = `
      <input type="checkbox" ${this.continuous ? 'checked' : ''}>
      <span><span class="opt-name">Continuous — auto-play next ayah</span></span>`;
    cont.querySelector('input').addEventListener('change', e => {
      this.continuous = e.target.checked;
      localStorage.setItem('explore-audio-continuous', this.continuous ? '1' : '0');
    });
    panel.appendChild(cont);
  }

  _audioUrl(sn, an) {
    const r = RECITERS.find(x => x.id === this.reciter) || RECITERS[0];
    const p = n => String(n).padStart(3, '0');
    return `${r.base}${p(sn)}${p(an)}.mp3`;
  }

  _playAyah(sn, an) {
    const ref = `${sn}:${an}`;
    if (this.playingRef === ref && this.audio && !this.audio.paused) {
      this._stopAudio();
      return;
    }
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.addEventListener('ended', () => this._onAudioEnded());
      this.audio.addEventListener('error', () => this._markPlaying(null, 'error'));
    }
    this.audio.src = this._audioUrl(sn, an);
    this.audio.play().catch(() => this._markPlaying(null, 'error'));
    this._markPlaying(ref, 'playing');
  }

  _stopAudio() {
    if (this.audio) { this.audio.pause(); this.audio.currentTime = 0; }
    this._markPlaying(null);
  }

  _onAudioEnded() {
    const prev = this.playingRef;
    this._markPlaying(null);
    if (!this.continuous || !prev) return;
    const [sn, an] = prev.split(':').map(Number);
    const meta = this.surahs.find(s => s.no === sn);
    if (meta && an < meta.verses) {
      this._playAyah(sn, an + 1);
      this._scrollToAyah(an + 1);
    }
  }

  // Reflect play state on the cards: highlight the active one and set every
  // play button's glyph/label.
  _markPlaying(ref, state) {
    this.playingRef = ref;
    document.querySelectorAll('.ayah-card').forEach(card => {
      const btn = card.querySelector('.ayah-audio-btn');
      const on = card.id === (ref ? `ayah-${ref.replace(':', '-')}` : '');
      card.classList.toggle('playing', on);
      if (btn) {
        btn.classList.toggle('on', on);
        btn.textContent = on ? '⏸ Playing' : '▶ Play';
        btn.title = on ? 'Stop recitation' : 'Play recitation';
      }
    });
  }

  /* ── Reader ────────────────────────────────────────────────────────────── */

  async openSurah(no, jumpAyah = null) {
    if (this.audio) this._stopAudio();       // don't keep reciting the old surah
    this.currentSurah = no;
    history.replaceState(null, '', `#${no}${jumpAyah ? ':' + jumpAyah : ''}`);
    if (this._closeMobileSidebar) this._closeMobileSidebar();
    document.querySelectorAll('.surah-item').forEach(el =>
      el.classList.toggle('active', +el.dataset.no === no));

    const meta = this.surahs.find(s => s.no === no);
    const sm = this.suraMeta[no];
    const revText = sm ? (sm.revelation === 'madani' ? 'Madani' : 'Makki') : this._esc(meta.place);
    const pageText = sm && sm.page ? ` · Mushaf p.${sm.page}` : '';
    document.getElementById('surah-header').innerHTML = `
      <div class="sh-ar" lang="ar">${this._esc(meta.ar)}</div>
      <div class="sh-en">${meta.no}. ${this._esc(meta.en)}${sm ? ' — ' + this._esc(sm.en) : ''}</div>
      <div class="sh-meta"><span class="rev-chip rev-${sm ? sm.revelation : 'makki'}">${revText}</span> ${this._esc(sm ? sm.tname : meta.roman)} · ${meta.verses} verses${pageText}</div>
      <form class="sh-jump" id="ayah-jump-form" autocomplete="off">
        <label for="ayah-jump">Go to ayah</label>
        <input type="number" id="ayah-jump" inputmode="numeric" min="1"
               max="${meta.verses}" placeholder="1–${meta.verses}" aria-label="Ayah number">
        <button type="submit">Go</button>
      </form>`;
    this._wireAyahJump(no, meta.verses);

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

    if (jumpAyah) this._scrollToAyah(jumpAyah);
    else scrollTo({ top: 0 });
  }

  /* Scroll the open surah to a given ayah number and flash it. Returns false
     if that ayah isn't on the page (out of range). */
  _scrollToAyah(a) {
    const el = document.getElementById(`ayah-${this.currentSurah}-${a}`);
    if (!el) return false;
    // Instant, not smooth: a jump can span the whole surah (thousands of px),
    // and animating that would crawl for seconds. The flash marks where we land.
    el.scrollIntoView({ block: 'start' });
    el.classList.remove('flash');
    void el.offsetWidth;              // restart the animation if it's re-triggered
    el.classList.add('flash');
    return true;
  }

  /* "Go to ayah" input in the surah header. */
  _wireAyahJump(no, verses) {
    const form = document.getElementById('ayah-jump-form');
    const input = document.getElementById('ayah-jump');
    if (!form || !input) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const n = parseInt(input.value, 10);
      if (!Number.isFinite(n) || n < 1 || n > verses) {
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      input.removeAttribute('aria-invalid');
      history.replaceState(null, '', `#${no}:${n}`);
      this._scrollToAyah(n);
      if (this._closeMobileSidebar) this._closeMobileSidebar();
    });
    input.addEventListener('input', () => input.removeAttribute('aria-invalid'));
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
          ${this.isAndroid ? '' : `<button class="ayah-audio-btn" type="button" data-ref="${ref}" title="Play recitation">▶ Play</button>`}
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
        // Root badges come from the ayah's own verified root list (analyzequran,
        // the same data the Connections module uses), NOT a per-word union of
        // word_roots.json. That union leaked a collocating neighbour's root onto
        // common words — e.g. الله → و ع د, في → س و م، م ث ل — putting a wrong
        // root badge on ~54% of ayaat. The ayah's `roots` field is clean.
        const ayahRoots = (ayah && ayah.roots) || [];
        html += `<div class="ayah-badges" ${this.badgesOn ? '' : 'hidden'}>
          <div class="badges-label">Words</div>
          <div class="badges-row">${
            words.map((w, i) => {
              const ur = this.wordLang === 'ur';
              const gloss = ur ? (w.ur || w.en || '') : (w.en || '');
              return `<button class="word-badge" type="button" data-ref="${ref}" data-idx="${i}">
                 <span class="wb-ar" lang="ar">${this._esc(stripDiacritics(stripWaPrefix(w.ar)))}</span>
                 <span class="wb-gloss${ur ? ' wb-gloss-ur' : ''}"${ur ? ' lang="ur" dir="rtl"' : ''}>${this._esc(gloss)}</span>
               </button>`;
            }).join('')
          }</div>
          ${ayahRoots.length ? `<div class="badges-label">Roots</div>
          <div class="badges-row">${
            ayahRoots.map(r =>
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
      card.querySelector('.ayah-audio-btn')?.addEventListener('click', () =>
        this._playAyah(no, a));

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
      tab.addEventListener('click', async () => {
        this.modalLang = tab.dataset.lang;
        document.querySelectorAll('.lang-tab').forEach(t =>
          t.classList.toggle('active', t === tab));
        this._renderMeanings();
        if (this.modalLang === 'ur') { try { await this._ensureOccUrdu(); } catch (e) {} }
        this._renderOccurrences();
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
        book: st.book,
      })));
    }
    this._renderOccurrences();
    // Word modals remember the last language choice. If it is Urdu, the Urdu
    // translation for the occurrence cards may not be loaded yet — fetch it,
    // then repaint the list. (Roots always stay English — see _renderOccurrences.)
    if (this.modalLang === 'ur' && !st.book && !this.occUrdu) {
      this._ensureOccUrdu().then(() => this._renderOccurrences()).catch(() => {});
    }
    document.getElementById('word-modal').hidden = false;
    document.querySelector('.modal').scrollTop = 0;
  }

  // Lazily loads the Urdu edition used for the occurrence cards' translation.
  async _ensureOccUrdu() {
    if (!this.occUrdu) {
      this.occUrdu = await this._json('../data/translations/ur_junagarhi.json');
    }
    return this.occUrdu;
  }

  // The occurrence list. Each card shows the ayah's Arabic plus — following the
  // meanings language toggle — either the English or the Urdu translation. Root
  // modals hide the toggle, so their occurrence list stays English.
  _renderOccurrences() {
    const st = this._modalState;
    if (!st) return;
    const urdu = !st.book && this.modalLang === 'ur';
    const host = document.getElementById('modal-occurrences');
    host.innerHTML = '';
    const MAX = 60;
    for (const a of st.occurrences.slice(0, MAX)) {
      const text = urdu ? (this.occUrdu?.[`${a.sn}:${a.an}`] || '') : (a.en || '');
      const btn = document.createElement('button');
      btn.className = 'occ-item';
      btn.type = 'button';
      btn.innerHTML = `
        <span class="occ-ref">${a.sn}:${a.an} · ${this._esc(a.snr)}</span>
        <span class="occ-ar" lang="ar">${this._esc(a.ar)}</span>
        <span class="occ-en${urdu ? ' occ-ur' : ''}"${urdu ? ' lang="ur" dir="rtl"' : ''}>${this._esc(text.slice(0, 180))}</span>`;
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

/* Native (Android) deep-link entry point. Tadabbur's "Open" hands an ayah id
   here so the reader jumps straight to it — the same jump the web build gets
   from the `#SN:AN` hash, but driven from the native side, which navigates to
   this module's own WebView rather than following a link. Waits for init() to
   have loaded the data before opening, so it is safe to call the moment the
   page's script tag has run. */
window.QuranExplore = {
  open(id) {
    const m = /^(\d{1,3}):(\d{1,3})$/.exec(String(id));
    if (!m) return Promise.reject(new Error(`bad ayah id: ${id}`));
    const sn = Math.min(114, Math.max(1, +m[1]));
    const an = +m[2];
    return new Promise((resolve, reject) => {
      (function wait(tries) {
        if (app._ready) { resolve(app._ready.then(() => app.openSurah(sn, an))); return; }
        if (tries > 200) { reject(new Error('Explore Quran did not finish loading')); return; }
        setTimeout(() => wait(tries + 1), 50);
      })(0);
    });
  },
};

document.addEventListener('DOMContentLoaded', () => {
  app._ready = app.init().catch(e => {
    document.getElementById('loading').hidden = false;
    document.getElementById('loading').textContent = `Failed to load data: ${e.message}`;
  });
});
