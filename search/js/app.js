/**
 * Quran Search Engine — Application Controller
 */

const PAGE_SIZE = 20;

class QuranApp {
  constructor() {
    this.ayaat          = null;
    this.surahs         = null;
    this.wordRoots      = null;
    this.engine         = null;
    this.results        = [];
    this.page           = 0;
    this.filters        = { place: '', surah: '', juz: '' };
    this.dark            = localStorage.getItem('theme') === 'dark';
    this._lastQuery      = '';
    this._lastKeywords   = [];
    this._lastParsed     = null;   // last parseQuery() result — shared across re-renders
    this._answerMode     = null;   // null | 'addressee_listing'
    this._activeFilter   = null;   // addressee id currently selected in answer panel
    this._allResults     = [];     // unfiltered results (for answer-panel switching)
    this._flatResults    = [];     // flat list: headers + result items for _renderPage
    this._flatIdx        = 0;      // current position in _flatResults during pagination
    this._renderedCount  = 0;      // number of result cards rendered so far
    this._rootToLabel    = null;   // lazy cache: root → { ar, en }
  }

  // ── Init ─────────────────────────────────────────────────────────────────

  async init() {
    this._applyTheme();
    this._bindStatic();

    try {
      this._setLoading('Loading Quran data…');

      const [ayaatData, surahData, wordRootsData, rootVocabData] = await Promise.all([
        fetch('data/quran.json').then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        }),
        fetch('data/surah.json').then(r => r.json()),
        fetch('data/word_roots.json').then(r => r.json()),
        fetch('data/root_vocab.json').then(r => r.json()),
      ]);

      this.ayaat     = ayaatData;
      this.surahs    = surahData;
      this.wordRoots = wordRootsData;
      this.rootVocab = rootVocabData;

      this._setLoading('Building search index…');
      await new Promise(r => setTimeout(r, 30));

      this.engine = new QuranSearch(this.ayaat, this.wordRoots, this.rootVocab);

      this._hideLoading();
      this._populateFilters();
      this._bindSearch();

    } catch (err) {
      console.error(err);
      this._setLoading(`Error: ${err.message} — Make sure you have run scripts/build_data.py first.`, true);
    }
  }

  // ── Theme ────────────────────────────────────────────────────────────────

  _applyTheme() {
    document.documentElement.setAttribute('data-theme', this.dark ? 'dark' : 'light');
  }

  _toggleTheme() {
    this.dark = !this.dark;
    localStorage.setItem('theme', this.dark ? 'dark' : 'light');
    this._applyTheme();
  }

  // ── Loading state ────────────────────────────────────────────────────────

  _setLoading(msg, isError = false) {
    const el = document.getElementById('loading-state');
    el.hidden = false;
    el.querySelector('#loading-text').textContent = msg;
    el.querySelector('.loading-spinner').style.display = isError ? 'none' : '';
    document.getElementById('results-section').hidden = true;
    document.getElementById('filter-bar').hidden = true;
  }

  _hideLoading() {
    document.getElementById('loading-state').hidden = true;
  }

  // ── Populate filter dropdowns ─────────────────────────────────────────────

  _populateFilters() {
    const surahSel = document.getElementById('filter-surah');
    for (const s of this.surahs) {
      const opt = document.createElement('option');
      opt.value = s.no;
      opt.textContent = `${s.no}. ${s.en} (${s.ar})`;
      surahSel.appendChild(opt);
    }
    const juzSel = document.getElementById('filter-juz');
    for (let j = 1; j <= 30; j++) {
      const opt = document.createElement('option');
      opt.value = j;
      opt.textContent = `Juz ${j}`;
      juzSel.appendChild(opt);
    }
  }

  // ── Event binding ────────────────────────────────────────────────────────

  _bindStatic() {
    document.getElementById('theme-toggle').addEventListener('click', () => this._toggleTheme());
  }

  _bindSearch() {
    const input  = document.getElementById('search-input');
    const btn    = document.getElementById('search-btn');
    const fPlace = document.getElementById('filter-place');
    const fSurah = document.getElementById('filter-surah');
    const fJuz   = document.getElementById('filter-juz');
    const fClear = document.getElementById('clear-filters');
    const more   = document.getElementById('load-more-btn');

    const doSearch = () => {
      this.page = 0;
      this._run(input.value.trim());
    };

    btn.addEventListener('click', doSearch);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

    const filterChange = () => {
      this.filters.place = fPlace.value;
      this.filters.surah = fSurah.value;
      this.filters.juz   = fJuz.value;
      if (input.value.trim()) { this.page = 0; this._run(input.value.trim()); }
    };
    fPlace.addEventListener('change', filterChange);
    fSurah.addEventListener('change', filterChange);
    fJuz.addEventListener('change', filterChange);

    fClear.addEventListener('click', () => {
      fPlace.value = fSurah.value = fJuz.value = '';
      this.filters = { place: '', surah: '', juz: '' };
      if (input.value.trim()) { this.page = 0; this._run(input.value.trim()); }
    });

    more.addEventListener('click', () => {
      this.page++;
      this._renderPage(true);
    });
  }

  // ── Question / answer-type detection ─────────────────────────────────────

  _isQuestionQuery(query) {
    const q = query.trim().toLowerCase();
    if (q.endsWith('?')) return true;
    return /^(what|which|how|where|when|why|list|name|tell|show|give|mention|are there|is there|does|do the|does the)/i.test(q);
  }

  /**
   * Returns 'addressee_listing' or null.
   *
   * Only triggers when the query is SPECIFICALLY asking about what TERMS, NAMES,
   * or VOCATIVES the Quran uses — not for "what are the characteristics of X",
   * "how does X behave", "what does the Quran say about X" etc.
   *
   * Key principle: must have BOTH a question intent AND explicit term/address clues.
   * Broad triggers like 'what are the' or 'how does' intentionally removed —
   * they caused false positives on characteristics/description queries.
   */
  _detectAnswerType(query, parsed) {
    if (!this._isQuestionQuery(query)) return null;

    const q = query.toLowerCase();

    // Strong address/term clues — these unambiguously ask about word forms or vocatives
    const strongTermClues = [
      'term','terms','address','addresses','addressed',
      'call','called','refer to','referred to',
      'phrase','phrases','expression','expressions','vocative',
      'used to address','uses to address','used by quran to address',
      'how allah address','how allah call','how god address','how god call',
      'what does quran call','what name','what names',
      'what word','what words','what title','what titles',
    ];

    // Trigger only if address/list intent AND a strong term clue is present
    const hasAddressIntent = parsed.intents.includes('address');
    const hasListIntent    = parsed.intents.includes('list');
    const hasTermClue      = strongTermClues.some(c => q.includes(c));

    if ((hasAddressIntent || hasListIntent) && hasTermClue) return 'addressee_listing';

    // Also trigger when address intent is present AND a specific addressee group
    // was detected in the query (e.g. "how does Allah address believers")
    if (hasAddressIntent && parsed.addresseeIds.length > 0) return 'addressee_listing';

    return null;
  }

  // ── Run search ───────────────────────────────────────────────────────────

  async _run(query) {
    if (!query) return;

    // Generation counter: if a newer search fires before this one finishes,
    // this instance will see gen !== this._searchGen and abort before touching the DOM.
    this._searchGen = (this._searchGen || 0) + 1;
    const myGen = this._searchGen;

    this._lastQuery    = query;
    this._answerMode   = null;
    this._activeFilter = null;
    this._allResults   = [];

    // Hard-reset panels immediately — clear HTML so stale content never bleeds
    const answerPanel = document.getElementById('answer-panel');
    answerPanel.hidden    = true;
    answerPanel.innerHTML = '';
    const summaryEl = document.getElementById('search-summary');
    summaryEl.hidden    = true;
    summaryEl.innerHTML = '';
    const bridgeEl = document.getElementById('concept-bridge');
    bridgeEl.hidden    = true;
    bridgeEl.innerHTML = '';
    const rootCardsEl = document.getElementById('root-cards-list');
    if (rootCardsEl) rootCardsEl.innerHTML = '';
    document.getElementById('sidebar-roots').hidden = true;

    document.getElementById('search-section').classList.add('compact');
    document.getElementById('filter-bar').hidden     = true;
    document.getElementById('results-section').hidden = true;
    document.getElementById('results-grid').innerHTML = '';
    this._showProgress('translate');

    try {
      // Parse first so we can choose the right search limit
      const parsed        = parseQuery(query);
      const useExhaustive = (parsed.exhaustive || parsed.intents.includes('count'))
                            && parsed.exactWords.length > 0;
      const searchLimit   = useExhaustive ? 6236 : 200;

      const { results, arabicQuery, extractedRoots, exactCount, totalMatched } = await this.engine.search(
        query, this.filters, searchLimit,
        step => { if (this._searchGen === myGen) this._showProgress(step); },
      );

      // A newer search has started — discard these results entirely
      if (this._searchGen !== myGen) return;

      const answerType = this._detectAnswerType(query, parsed);

      this._lastKeywords = parsed.keywords;
      this._lastParsed   = parsed;

      // Exhaustive mode: only surface the exact-match hits (all of them, Quran-ordered)
      const displayResults = (useExhaustive && exactCount > 0)
        ? results.filter(r => r.isExact)
        : results;

      this._allResults  = displayResults;
      this.results      = displayResults;
      this._flatResults = this._buildFlatResults(displayResults, parsed);

      this._hideProgress();
      this._renderPipelineInfo(arabicQuery, extractedRoots);
      this._renderConceptBridge(query, parsed, arabicQuery, totalMatched, searchLimit, displayResults.length);
      this._renderSidebarRoots(parsed, extractedRoots);
      this._renderSummary(displayResults, parsed, exactCount, totalMatched, searchLimit);

      if (answerType === 'addressee_listing') {
        this._answerMode = 'addressee_listing';
        // Use concept-expansion roots for vocab (translation roots carry query-context noise)
        // Fall back to translation roots only when concept expansion found nothing
        const vocabRoots = parsed.roots.length > 0 ? parsed.roots : extractedRoots;
        this._renderAnswerPanel(query, parsed, vocabRoots);
      }

      this._renderPage(false);

      document.getElementById('filter-bar').hidden = false;
      document.getElementById('results-section').hidden = false;

      const surahCount = new Set(displayResults.map(r => r.ayah.sn)).size;
      let countText = '';
      if (displayResults.length) {
        if (useExhaustive && exactCount > 0) {
          countText = `${exactCount} exact occurrences across ${surahCount} surahs`;
        } else {
          const capped     = totalMatched > displayResults.length;
          const ayahLabel  = capped
            ? `Top ${displayResults.length} of ${totalMatched} ayaat`
            : `${displayResults.length} ayaat`;
          const exactLabel = exactCount > 0 ? ` · ${exactCount} exact` : '';
          countText = `${ayahLabel} across ${surahCount} surahs${exactLabel}`;
        }
      }
      const countEl = document.getElementById('results-count');
      countEl.textContent = countText;

      document.getElementById('results-section').scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (err) {
      console.error(err);
      if (this._searchGen === myGen) this._hideProgress();
    }
  }

  // ── Search progress bar ──────────────────────────────────────────────────

  _showProgress(step) {
    const bar = document.getElementById('search-progress');
    bar.hidden = false;
    ['translate', 'roots', 'search'].forEach((s, i) => {
      const idx = ['translate', 'roots', 'search'].indexOf(step);
      const el  = bar.querySelector(`[data-step="${s}"]`);
      if (!el) return;
      el.classList.toggle('active', i === idx);
      el.classList.toggle('done',   i < idx);
    });
  }

  _hideProgress() {
    document.getElementById('search-progress').hidden = true;
  }

  // ── Pipeline info strip ───────────────────────────────────────────────────

  _renderPipelineInfo(arabicQuery, extractedRoots) {
    const strip = document.getElementById('pipeline-info');
    if (!arabicQuery && !extractedRoots.length) { strip.hidden = true; return; }

    let html = '';
    if (arabicQuery) {
      html += `<span class="pi-label">Arabic:</span>
               <span class="pi-arabic" dir="rtl">${this._esc(arabicQuery)}</span>`;
    }
    if (extractedRoots.length) {
      html += `<span class="pi-label">Roots found:</span>
               <span class="pi-roots">${extractedRoots.map(r =>
                 `<span class="root-chip" dir="rtl">${this._esc(r)}</span>`
               ).join('')}</span>`;
    }
    strip.innerHTML = html;
    strip.hidden = false;
  }

  // ── Answer panel ─────────────────────────────────────────────────────────

  _renderAnswerPanel(query, parsed, allRoots) {
    const panel = document.getElementById('answer-panel');
    const q     = query.toLowerCase();

    // ── Section 1: Vocative patterns (يَا ... forms) ─────────────────────
    const addrWithCounts = this.engine.countForAddressees();
    const matchedIds     = new Set(parsed.addresseeIds);
    // Show all addressees, matched ones first
    addrWithCounts.sort((a, b) => {
      const am = matchedIds.has(a.id) ? 1 : 0;
      const bm = matchedIds.has(b.id) ? 1 : 0;
      return bm - am || b.count - a.count;
    });

    const vocativeCards = addrWithCounts.map(addr => {
      const arMatch = addr.label.match(/\(([^)]+)\)/);
      const arText  = arMatch ? arMatch[1] : addr.ar_patterns[0] || '';
      const enLabel = addr.label.replace(/\s*\([^)]*\)/, '').trim();
      return `<button class="addr-card" data-type="pattern" data-addr-id="${this._esc(addr.id)}" type="button">
        <span class="addr-en">${this._esc(enLabel)}</span>
        <span class="addr-ar" dir="rtl" lang="ar">${this._esc(arText)}</span>
        <span class="addr-count">${addr.count} ayaat</span>
      </button>`;
    }).join('');

    // ── Section 2: Reference vocabulary terms ─────────────────────────────
    const vocabTerms = this.engine.getTermsForRoots(allRoots, 30);

    const vocabCards = vocabTerms.map(term =>
      `<button class="addr-card" data-type="word" data-norm-word="${this._esc(term.normWord)}" type="button">
        <span class="addr-ar" dir="rtl" lang="ar">${this._esc(term.normWord)}</span>
        <span class="addr-count">${term.count}× in Quran</span>
      </button>`
    ).join('');

    // Build a natural-language header
    let header = 'Quranic terms for the concept in your query:';
    if (q.includes('human') || q.includes('mankind') || q.includes('people'))
      header = 'Terms the Quran uses to refer to human beings:';
    else if (q.includes('believer') || q.includes('muslim'))
      header = 'Terms the Quran uses to refer to believers:';
    else if (q.includes('prophet') || q.includes('messenger'))
      header = 'Terms the Quran uses to refer to prophets and messengers:';

    panel.innerHTML = `
      <div class="answer-header">
        <span class="answer-icon">📋</span>
        <span>${this._esc(header)}</span>
      </div>

      ${vocativeCards ? `
      <div class="answer-section-label">Direct address terms (يَا … vocatives)</div>
      <div class="addr-grid">${vocativeCards}</div>` : ''}

      ${vocabCards ? `
      <div class="answer-section-label" style="margin-top:14px">Reference terms (actual Quranic vocabulary)</div>
      <div class="addr-grid">${vocabCards}</div>` : ''}

      <div class="addr-filter-label" id="addr-filter-label">
        Click any term to filter the results below
      </div>
    `;
    panel.hidden = false;

    panel.querySelectorAll('.addr-card').forEach(btn => {
      btn.addEventListener('click', () => this._selectTermFilter(btn));
    });
  }

  _selectTermFilter(btn) {
    const panel   = document.getElementById('answer-panel');
    const type    = btn.dataset.type;
    const filterKey = type === 'pattern' ? `pat:${btn.dataset.addrId}` : `word:${btn.dataset.normWord}`;

    // Deselect if already selected
    if (this._activeFilter === filterKey) {
      this._activeFilter = null;
      panel.querySelectorAll('.addr-card').forEach(b => b.classList.remove('selected'));
      document.getElementById('addr-filter-label').textContent = 'Click any term to filter the results below';
      this.results      = this._allResults;
      this._flatResults = this._buildFlatResults(this._allResults, this._lastParsed);
      this._updateResultsCount(this.results.length);
      this.page = 0;
      this._renderPage(false);
      this._renderSummary(this._allResults, this._lastParsed, 0);
      return;
    }

    this._activeFilter = filterKey;
    panel.querySelectorAll('.addr-card').forEach(b => b.classList.toggle('selected', b === btn));

    let filtered, label;
    if (type === 'pattern') {
      const addr = ADDRESSEES.find(a => a.id === btn.dataset.addrId);
      if (!addr) return;
      filtered = this.engine.searchByPattern(addr.ar_patterns, addr.label);
      label    = `Showing ${filtered.length} ayaat: ${addr.label.replace(/\s*\([^)]*\)/, '')}`;
    } else {
      const normWord = btn.dataset.normWord;
      filtered = this.engine.filterByNormWord(normWord, normWord);
      label    = `Showing ${filtered.length} ayaat containing: ${normWord}`;
    }

    document.getElementById('addr-filter-label').textContent = label;
    this._updateResultsCount(filtered.length);
    this.results      = filtered;
    this._flatResults = this._buildFlatResults(filtered, this._lastParsed);
    this.page         = 0;
    this._renderPage(false);
    this._renderSummary(filtered, this._lastParsed, filtered.length);
  }

  _updateResultsCount(n) {
    document.getElementById('results-count').textContent =
      n ? `${n} ayaat found` : '';
  }

  // ── Render result page ───────────────────────────────────────────────────

  _renderPage(append) {
    const grid     = document.getElementById('results-grid');
    const noRes    = document.getElementById('no-results');
    const moreWrap = document.getElementById('load-more-wrapper');

    if (!append) {
      grid.innerHTML      = '';
      this._flatIdx       = 0;
      this._renderedCount = 0;
    }

    if (this.results.length === 0) {
      noRes.hidden    = false;
      moreWrap.hidden = true;
      return;
    }
    noRes.hidden = true;

    // Walk the flat list (headers + results) until PAGE_SIZE result cards rendered
    let rendered = 0;
    while (this._flatIdx < this._flatResults.length && rendered < PAGE_SIZE) {
      const item = this._flatResults[this._flatIdx++];
      if (item.type === 'header') {
        grid.appendChild(this._buildGroupHeader(item));
      } else {
        grid.appendChild(this._buildCard(item.result));
        rendered++;
        this._renderedCount++;
      }
    }

    moreWrap.hidden = this._renderedCount >= this.results.length;
  }

  // ── Concept bridge ───────────────────────────────────────────────────────

  /**
   * "You searched for ___ → in the Quran this is ___ (Arabic), found in N ayaat"
   * Always shown; confidence badge reflects how tightly the pipeline mapped the query.
   */
  _renderConceptBridge(query, parsed, arabicQuery, totalMatched, searchLimit, displayCount) {
    const el = document.getElementById('concept-bridge');
    if (!displayCount) { el.hidden = true; return; }

    const concepts = (parsed && parsed.matchedConcepts) || [];

    // ── Determine overall confidence level ─────────────────────────────────
    let confidence = 'approximate';
    let confidenceLabel = '~ Approximate match';
    if (concepts.some(c => c.confidence === 'exact')) {
      confidence = 'exact'; confidenceLabel = '🎯 Exact Quranic term';
    } else if (concepts.some(c => c.confidence === 'concept' || c.confidence === 'canonical')) {
      confidence = 'concept'; confidenceLabel = '✓ Concept match';
    }

    // ── Build concept chips ─────────────────────────────────────────────────
    let conceptsHtml = '';
    const shownConcepts = concepts.slice(0, 5); // cap at 5 to avoid clutter
    for (const c of shownConcepts) {
      const arabicDisplay = c.arabicWords.slice(0, 3).join(' · ');
      conceptsHtml += `
        <div class="cb-concept">
          <span class="cb-concept-label">${this._esc(c.label)}</span>
          ${arabicDisplay
            ? `<span class="cb-concept-arabic" dir="rtl" lang="ar">${this._esc(arabicDisplay)}</span>`
            : ''}
        </div>`;
    }

    // Fallback: if no concepts mapped, show the Arabic translation if available
    if (!conceptsHtml && arabicQuery) {
      conceptsHtml = `<div class="cb-concept">
        <span class="cb-concept-label">Arabic translation</span>
        <span class="cb-concept-arabic" dir="rtl" lang="ar">${this._esc(arabicQuery)}</span>
      </div>`;
    }

    // ── Ayah count footer ───────────────────────────────────────────────────
    const capped = totalMatched > displayCount;
    const ayahNote = capped
      ? `Found in <strong>${totalMatched}</strong> ayaat across the Quran (showing top ${displayCount})`
      : `Found in <strong>${displayCount}</strong> ayaat across the Quran`;

    el.innerHTML = `
      <div class="cb-row">
        <span class="cb-label">You searched</span>
        <span class="cb-query">${this._esc(query)}</span>
        <span class="cb-confidence ${confidence}">${confidenceLabel}</span>
      </div>
      ${conceptsHtml ? `
      <div class="cb-row">
        <span class="cb-label">Quranic terms</span>
        <div class="cb-concepts">${conceptsHtml}</div>
      </div>` : ''}
      <div class="cb-footer">${ayahNote} — as shown below</div>
    `;
    el.hidden = false;
  }

  // ── Sidebar root cards ───────────────────────────────────────────────────

  /**
   * Render root-word cards in the sidebar. Each card shows the Arabic root,
   * an English gloss, and the ayah count. Clicking opens a modal.
   */
  _renderSidebarRoots(parsed, extractedRoots) {
    const container = document.getElementById('root-cards-list');
    const section   = document.getElementById('sidebar-roots');
    if (!container) return;

    // Collect all unique roots: from concept mapping + from translation extraction
    const allRoots = [...new Set([
      ...((parsed && parsed.roots) || []),
      ...(extractedRoots || []),
    ])].slice(0, 12);  // cap at 12 to keep sidebar clean

    if (!allRoots.length) { section.hidden = true; return; }

    const rootMap = this._buildRootToLabel();
    container.innerHTML = '';

    for (const root of allRoots) {
      const label = rootMap[root] || { ar: root, en: '' };
      // Count ayaat in the engine's root index
      const count = this.engine.rootIdx[root] ? this.engine.rootIdx[root].size : 0;
      if (!count) continue;

      const btn = document.createElement('button');
      btn.className = 'root-card';
      btn.dataset.root = root;
      btn.innerHTML = `
        <span class="root-card-ar" dir="rtl" lang="ar">${this._esc(root)}</span>
        <span class="root-card-meta">
          <span class="root-card-en">${this._esc(label.en)}</span>
          <span class="root-card-count">${count} ayaat</span>
        </span>`;
      btn.addEventListener('click', () => this._openRootModal(root, label));
      container.appendChild(btn);
    }

    section.hidden = container.children.length === 0;
  }

  // ── Root modal ───────────────────────────────────────────────────────────

  _openRootModal(root, label) {
    const overlay = document.getElementById('root-modal-overlay');
    const title   = document.getElementById('root-modal-title');
    const body    = document.getElementById('root-modal-body');

    // Count
    const ids   = this.engine.rootIdx[root] ? [...this.engine.rootIdx[root]] : [];
    const count = ids.length;
    const en    = (label && label.en) ? label.en : '';

    title.innerHTML = `
      <span class="rm-root" dir="rtl" lang="ar">${this._esc(root)}</span>
      ${en ? `<span class="rm-en">${this._esc(en)}</span>` : ''}
      <span class="rm-count">${count} ayaat</span>`;

    // Show loading then render
    body.innerHTML = '<div class="root-modal-loading">Loading…</div>';
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';

    // Render after a tick so the modal animates in first
    requestAnimationFrame(() => {
      // Sort by Quran order
      const sorted = ids.sort((a, b) => a - b);
      body.innerHTML = '';
      for (const id of sorted) {
        const ayah = this.engine.ayaatMap[id];
        if (!ayah) continue;
        const card = this._buildCard({ ayah, score: 0, matchedRoots: [root], matchedKeywords: [], matchedPatterns: [] });
        body.appendChild(card);
      }
      if (!body.children.length) {
        body.innerHTML = '<div class="root-modal-loading">No ayaat found.</div>';
      }
    });

    // Close handlers
    const close = () => {
      overlay.hidden = true;
      document.body.style.overflow = '';
    };
    document.getElementById('root-modal-close').onclick = close;
    overlay.onclick = e => { if (e.target === overlay) close(); };
    document.onkeydown = e => { if (e.key === 'Escape') close(); };
  }

  // ── Summary paragraph ────────────────────────────────────────────────────

  _renderSummary(results, parsed, exactCount, totalMatched, searchLimit) {
    const el = document.getElementById('search-summary');
    if (!results || !results.length) { el.hidden = true; return; }

    const surahSet     = new Set(results.map(r => r.ayah.sn));
    const meccanCount  = results.filter(r => r.ayah.place === 'Meccan').length;
    const medinanCount = results.filter(r => r.ayah.place === 'Medinan').length;

    // Core sentence — show real total when results were capped at the search limit
    const capped = totalMatched != null && searchLimit != null && totalMatched > results.length;
    const ayahCount = capped
      ? `<strong>${totalMatched} ayaat</strong> (showing top ${results.length})`
      : `<strong>${results.length} ayaat</strong>`;

    let para = `The Quran addresses this in ${ayahCount} `;
    para += `across <strong>${surahSet.size} surah${surahSet.size !== 1 ? 's' : ''}</strong>`;

    if (meccanCount > 0 && medinanCount > 0) {
      // dir="ltr" on each tag prevents the browser bidi algorithm from swapping
      // the number and the Arabic label when rendered inside a LTR paragraph
      para += ` — <span class="place-tag place-mecca" dir="ltr">${meccanCount}&thinsp;مَكِّي</span>`;
      para += ` &middot; <span class="place-tag place-medina" dir="ltr">${medinanCount}&thinsp;مَدَنِي</span>`;
    } else if (meccanCount > 0) {
      para += ` — <span class="place-tag place-mecca" dir="ltr">مَكِّي (Meccan)</span> revelation`;
    } else if (medinanCount > 0) {
      para += ` — <span class="place-tag place-medina" dir="ltr">مَدَنِي (Medinan)</span> revelation`;
    }
    para += '.';

    // Exact term count
    if (exactCount > 0 && exactCount < results.length) {
      para += ` Of these, <strong>${exactCount}</strong> contain the exact Quranic term.`;
    }

    // Matched Quranic topics (Arabic labels from TOPICS)
    const topicLabels = (parsed && parsed.topicIds || []).map(id => {
      const t = TOPICS.find(tp => tp.id === id);
      if (!t) return null;
      const arMatch = t.label.match(/\(([^)]+)\)/);
      const ar = arMatch ? arMatch[1] : '';
      const en = t.label.replace(/\s*\([^)]*\)/, '').trim();
      return ar
        ? `<span class="pi-arabic" dir="rtl">${this._esc(ar)}</span> (${this._esc(en)})`
        : this._esc(en);
    }).filter(Boolean).slice(0, 4);

    if (topicLabels.length) {
      para += ` Quranic themes: ${topicLabels.join(' · ')}.`;
    }

    // Matched addressees (Arabic vocative form)
    const addrLabels = (parsed && parsed.addresseeIds || []).map(id => {
      const a = ADDRESSEES.find(ad => ad.id === id);
      if (!a) return null;
      const arMatch = a.label.match(/\(([^)]+)\)/);
      return arMatch
        ? `<span class="pi-arabic" dir="rtl">${this._esc(arMatch[1])}</span>`
        : this._esc(a.label.replace(/\s*\([^)]*\)/, '').trim());
    }).filter(Boolean);

    if (addrLabels.length) {
      para += ` Addressing: ${addrLabels.join(', ')}.`;
    }

    // Binary concept pairs — show both poles explicitly
    if (parsed && parsed.binaryPairId) {
      const binary = (typeof BINARY_CONCEPTS !== 'undefined' ? BINARY_CONCEPTS : [])
        .find(b => b.id === parsed.binaryPairId);
      if (binary) {
        para += ` Showing both Quranic poles: `
          + `<strong dir="rtl" lang="ar">${this._esc(binary.pairA.label)}</strong>`
          + ` and `
          + `<strong dir="rtl" lang="ar">${this._esc(binary.pairB.label)}</strong>.`;
      }
    }

    para += ' The referenced ayaat are grouped below.';

    el.innerHTML = `<span class="summary-icon">📖</span><div class="summary-text">${para}</div>`;
    el.hidden = false;
  }

  // ── Grouping ──────────────────────────────────────────────────────────────

  /**
   * Build the flat array that _renderPage() consumes:
   * [{ type:'header', label, labelAr, count }, { type:'result', result }, …]
   */
  _buildFlatResults(results, parsed) {
    const groups = this._groupResults(results, parsed);
    const flat   = [];
    for (const g of groups) {
      if (g.label) {
        flat.push({ type: 'header', label: g.label, labelAr: g.labelAr || '', count: g.results.length });
      }
      for (const r of g.results) {
        flat.push({ type: 'result', result: r });
      }
    }
    return flat;
  }

  /**
   * Determine the best grouping for the given results.
   *
   * Priority:
   *  1. Multiple distinct Arabic roots (2–6) → group by root  (best for Dhikr, Knowledge, etc.)
   *  2. Multiple matched TOPICS (2–5)        → group by topic
   *  3. Meccan + Medinan both present        → group by revelation period
   *  4. Fallback                             → single unlabelled group
   *
   * All group labels use Quranic Arabic terms from TOPICS / ADDRESSEES / the root itself.
   */
  _groupResults(results, parsed) {
    if (!results || !results.length) return [{ label: null, labelAr: null, results: [] }];

    const rootMap = this._buildRootToLabel();

    // ── 0. Binary concept pair grouping (highest priority) ─────────────────
    // When the query spans two complementary Quranic themes (light/dark, faith/disbelief…),
    // group exactly by those two poles using their Quranic Arabic labels.
    if (parsed && parsed.binaryPairId) {
      const BCLIST = (typeof BINARY_CONCEPTS !== 'undefined') ? BINARY_CONCEPTS : [];
      const binary = BCLIST.find(b => b.id === parsed.binaryPairId);
      if (binary) {
        const pairARoots = new Set(binary.pairA.roots);
        const pairBRoots = new Set(binary.pairB.roots);
        const groupA = { label: binary.pairA.label, labelAr: '', results: [] };
        const groupB = { label: binary.pairB.label, labelAr: '', results: [] };
        const ungrouped = [];

        for (const r of results) {
          const roots = r.matchedRoots || [];
          if (roots.some(rt => pairARoots.has(rt))) {
            groupA.results.push(r);
          } else if (roots.some(rt => pairBRoots.has(rt))) {
            groupB.results.push(r);
          } else {
            ungrouped.push(r);
          }
        }

        const groups = [];
        if (groupA.results.length) groups.push(groupA);
        if (groupB.results.length) groups.push(groupB);
        if (ungrouped.length)
          groups.push({ label: 'Other references', labelAr: '', results: ungrouped });
        if (groups.length >= 2) return groups;
      }
    }

    // ── 1. Root-level grouping ──────────────────────────────────────────────
    const rootGroupMap = {};
    const noRootBucket = [];

    for (const r of results) {
      const primaryRoot = (r.matchedRoots || []).find(rt => rootMap[rt]);
      if (primaryRoot) {
        if (!rootGroupMap[primaryRoot]) {
          const info = rootMap[primaryRoot];
          rootGroupMap[primaryRoot] = { label: info.en, labelAr: info.ar, results: [] };
        }
        rootGroupMap[primaryRoot].results.push(r);
      } else {
        noRootBucket.push(r);
      }
    }

    const rootGroups = Object.values(rootGroupMap)
      .sort((a, b) => b.results.length - a.results.length);

    // Use root groups when there are 2–6 distinct roots (avoids noise for broad queries)
    if (rootGroups.length >= 2 && rootGroups.length <= 6) {
      if (noRootBucket.length) {
        rootGroups.push({ label: 'Other references', labelAr: '', results: noRootBucket });
      }
      return rootGroups;
    }

    // ── 2. Topic-level grouping (when too many roots or no root hits) ──────
    const topicGroupMap = {};
    const topicIds      = (parsed && parsed.topicIds) || [];

    if (topicIds.length >= 2) {
      for (const r of results) {
        let placed = false;
        for (const tid of topicIds) {
          const topic = TOPICS.find(t => t.id === tid);
          if (!topic) continue;
          if ((r.matchedRoots || []).some(rt => topic.roots.includes(rt))) {
            if (!topicGroupMap[tid]) {
              const arMatch = topic.label.match(/\(([^)]+)\)/);
              topicGroupMap[tid] = {
                label:   topic.label.replace(/\s*\([^)]*\)/, '').trim(),
                labelAr: arMatch ? arMatch[1] : '',
                results: [],
              };
            }
            topicGroupMap[tid].results.push(r);
            placed = true;
            break;
          }
        }
        if (!placed) {
          if (!topicGroupMap['_other'])
            topicGroupMap['_other'] = { label: 'Other references', labelAr: '', results: [] };
          topicGroupMap['_other'].results.push(r);
        }
      }
      const tgArr = Object.values(topicGroupMap)
        .sort((a, b) => b.results.length - a.results.length);
      if (tgArr.filter(g => g.label !== 'Other references').length >= 2) return tgArr;
    }

    // ── 2b. Exact-match grouping ────────────────────────────────────────────
    // When EXACT_WORDS produced hits, show them as a priority group above
    // the rest. This ensures e.g. "durood" shows 33:56 at the top, not
    // buried under 93 Meccan ayaat that merely share root س ل م.
    const exactResults = results.filter(r => r.isExact);
    const nonExact     = results.filter(r => !r.isExact);
    if (exactResults.length > 0 && nonExact.length > 0) {
      const groups = [
        { label: 'Exact Quranic matches', labelAr: '', results: exactResults },
      ];
      // Sub-group the rest by revelation period for structure
      const mecR = nonExact.filter(r => r.ayah.place === 'Meccan');
      const medR = nonExact.filter(r => r.ayah.place === 'Medinan');
      if (mecR.length && medR.length) {
        groups.push({ label: 'Meccan Revelation', labelAr: 'مَكِّي',  results: mecR });
        groups.push({ label: 'Medinan Revelation', labelAr: 'مَدَنِي', results: medR });
      } else {
        groups.push({ label: 'Other references', labelAr: '', results: nonExact });
      }
      return groups;
    }

    // ── 3. Revelation period grouping ──────────────────────────────────────
    const meccan  = results.filter(r => r.ayah.place === 'Meccan');
    const medinan = results.filter(r => r.ayah.place === 'Medinan');
    if (meccan.length > 0 && medinan.length > 0) {
      return [
        { label: 'Meccan Revelation', labelAr: 'مَكِّي',  results: meccan  },
        { label: 'Medinan Revelation', labelAr: 'مَدَنِي', results: medinan },
      ];
    }

    // ── 4. No useful grouping ───────────────────────────────────────────────
    return [{ label: null, labelAr: null, results }];
  }

  /**
   * Lazy-build a map: Arabic root → { ar: Arabic label, en: English label }
   * Labels sourced from TRANSLITERATIONS first (term-quality), then TOPICS.
   */
  _buildRootToLabel() {
    if (this._rootToLabel) return this._rootToLabel;
    const map = {};

    // TRANSLITERATIONS gives the best per-root label (uses the transliterated term)
    for (const [, exp] of Object.entries(TRANSLITERATIONS)) {
      for (const root of exp.roots) {
        if (!map[root]) {
          map[root] = { ar: root, en: exp.english[0] };
        }
      }
    }

    // TOPICS fills in any remaining roots with their standardised Arabic label
    for (const topic of TOPICS) {
      const arMatch = topic.label.match(/\(([^)]+)\)/);
      const ar = arMatch ? arMatch[1] : '';
      const en = topic.label.replace(/\s*\([^)]*\)/, '').trim();
      for (const root of topic.roots) {
        if (!map[root]) map[root] = { ar, en };
      }
    }

    this._rootToLabel = map;
    return map;
  }

  // ── Group header element ──────────────────────────────────────────────────

  _buildGroupHeader(item) {
    const el        = document.createElement('div');
    el.className    = 'result-group-header';
    const arPart    = item.labelAr
      ? `<span class="group-label-ar" dir="rtl" lang="ar">${this._esc(item.labelAr)}</span>`
      : '';
    el.innerHTML    = `
      <div class="group-label-wrap">
        ${arPart}
        <span class="group-label-en">${this._esc(item.label)}</span>
      </div>
      <span class="group-count-badge">${item.count} ayaat</span>`;
    return el;
  }

  // ── Build result card ────────────────────────────────────────────────────

  _buildCard({ ayah, score, matchedRoots, matchedKeywords, matchedPatterns }) {
    const card = document.createElement('article');
    card.className = 'result-card';

    const placeClass = ayah.place === 'Meccan' ? 'badge-mecca' : 'badge-medina';

    const allTrans = [ayah.en, ayah.t1, ayah.t2, ayah.t3].filter(Boolean);
    const primary  = allTrans[0] || '';
    const others   = allTrans.slice(1);

    const highlightedPrimary = this._highlight(primary, matchedKeywords);

    const rootChips    = matchedRoots.slice(0, 5).map(r =>
      `<span class="match-chip match-root" dir="rtl" title="Arabic root">${this._esc(r)}</span>`
    ).join('');
    const kwChips      = matchedKeywords.slice(0, 4).map(k =>
      `<span class="match-chip match-kw">${this._esc(k)}</span>`
    ).join('');
    const patternChips = matchedPatterns.slice(0, 2).map(p =>
      `<span class="match-chip match-pattern">${this._esc(p)}</span>`
    ).join('');

    const hasReasons = rootChips || kwChips || patternChips;

    const othersHtml = others.length
      ? `<div class="other-trans" hidden>
           ${others.map((t, i) => `
             <div class="other-trans-item">
               <span class="trans-label">Translation ${i + 2}</span>
               <p>${this._highlight(t, matchedKeywords)}</p>
             </div>
           `).join('')}
         </div>
         <button class="toggle-trans" type="button">
           + ${others.length} more translation${others.length > 1 ? 's' : ''}
         </button>`
      : '';

    card.innerHTML = `
      <div class="card-meta">
        <span class="ref-badge">${this._esc(ayah.sne)} ${ayah.sn}:${ayah.an}</span>
        <span class="badge ${placeClass}">${ayah.place}</span>
        <span class="badge badge-juz">Juz ${ayah.juz}</span>
      </div>
      <div class="ayah-arabic" dir="rtl" lang="ar">${this._esc(ayah.ar)}</div>
      <div class="ayah-translation">
        <p class="primary-trans">${highlightedPrimary}</p>
        ${othersHtml}
      </div>
      ${hasReasons ? `
      <div class="match-info">
        <span class="match-via">Matched via</span>
        ${rootChips}${kwChips}${patternChips}
      </div>` : ''}
    `;

    const toggleBtn = card.querySelector('.toggle-trans');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const panel = card.querySelector('.other-trans');
        const open  = !panel.hidden;
        panel.hidden = open;
        toggleBtn.textContent = open
          ? `+ ${others.length} more translation${others.length > 1 ? 's' : ''}`
          : '− Hide translations';
      });
    }

    return card;
  }

  // ── Text helpers ─────────────────────────────────────────────────────────

  _esc(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  _highlight(rawText, keywords) {
    if (!rawText) return '';
    if (!keywords || !keywords.length) return this._esc(rawText);

    const patterns = keywords
      .filter(k => k && k.length >= 3)
      .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    if (!patterns) return this._esc(rawText);

    const re    = new RegExp(`\\b(${patterns})\\w*`, 'gi');
    const parts = [];
    let last    = 0;

    for (const m of rawText.matchAll(re)) {
      parts.push(this._esc(rawText.slice(last, m.index)));
      parts.push(`<mark>${this._esc(m[0])}</mark>`);
      last = m.index + m[0].length;
    }
    parts.push(this._esc(rawText.slice(last)));
    return parts.join('');
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────────

const app = new QuranApp();
document.addEventListener('DOMContentLoaded', () => app.init());
