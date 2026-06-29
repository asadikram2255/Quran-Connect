/**
 * Quran Search Engine — Application Controller
 */

const PAGE_SIZE = 20;

// ── Optional AI reranking ─────────────────────────────────────────────────────
// Active only on Vercel deployments where /api/rerank is a real serverless function.
// Returns '' on GitHub Pages / local dev so that _rerank() is never called,
// avoiding 404 hangs. To enable on a custom domain, replace the condition below
// with: return '/api/rerank';
const RERANK_ENDPOINT = (() => {
  const h = window.location.hostname;
  if (h.endsWith('vercel.app') || h.endsWith('.vercel.app')) return '/api/rerank';
  return '';
})();

class QuranApp {
  constructor() {
    this.ayaat          = null;
    this.surahs         = null;
    this.wordRoots      = null;
    this.engine         = null;
    this.results        = [];
    this.page           = 0;
    this.filters        = { place: '', surah: '', juz: '' };
    this.dark            = localStorage.getItem('theme') !== 'light'; // default dark
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
    this._rerankActive   = false;  // true when AI reranker improved this result set (#7)
    this._topScore       = 1;      // highest raw score in current result set (#2)
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
        fetch('data/surah.json').then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
        fetch('data/word_roots.json').then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
        fetch('data/root_vocab.json').then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
      ]);

      this.ayaat     = ayaatData;
      this.surahs    = surahData;
      this.wordRoots = wordRootsData;
      this.rootVocab = rootVocabData;

      this._setLoading('Building search index…');
      await new Promise(r => setTimeout(r, 30));

      this.engine = new QuranSearch(this.ayaat, this.wordRoots, this.rootVocab);
      this.hadithSearch = new HadithSearch();

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
    document.getElementById('results-layout')?.setAttribute('hidden','');
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
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { this._hideSuggestions(); doSearch(); }
      if (e.key === 'ArrowDown') this._navigateSuggestion(1, e);
      if (e.key === 'ArrowUp')   this._navigateSuggestion(-1, e);
      if (e.key === 'Escape')    this._hideSuggestions();
    });
    input.addEventListener('input', () => this._updateSuggestions(input.value));
    input.addEventListener('focus', () => { if (input.value.trim().length >= 2) this._updateSuggestions(input.value); });
    document.addEventListener('click', e => {
      const sg = document.getElementById('search-suggestions');
      if (sg && !input.contains(e.target) && !sg.contains(e.target)) this._hideSuggestions();
    });
    this._initSuggestions();

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
    this._hideSynthesisPanel();

    document.getElementById('search-section').classList.add('compact');
    document.getElementById('filter-bar').hidden      = true;
    document.getElementById('results-section').hidden = true;
    document.getElementById('results-grid').innerHTML = '';
    const hadithColEl = document.getElementById('hadith-col');
    if (hadithColEl) hadithColEl.hidden = true;
    this._showProgress('translate');

    try {
      // Parse first so we can choose the right search limit (#5 — intent-tuned limits)
      const parsed        = parseQuery(query);
      const useExhaustive = (parsed.exhaustive || parsed.intents.includes('count'))
                            && parsed.exactWords.length > 0;
      const wordCount     = query.trim().split(/\s+/).length;
      const isSharpQuery  = wordCount <= 2 && parsed.matchedConcepts.some(c => c.confidence === 'exact');
      const searchLimit   = useExhaustive ? 6236
                          : isSharpQuery  ? 60    // single precise concept → quality over quantity
                          : wordCount <= 3 ? 120
                          : 200;

      // Fire semantic search in parallel — results arrive later and silently update
      const semanticPromise = this._semanticSearch(query);

      // Mutable metadata — updated in two phases (fast sync, then LLM-enhanced)
      let arabicQuery = '', extractedRoots = [], exactCount = 0, totalMatched = 0, subtopics = [];
      // Track the latest base results for semantic merge (updated when LLM resolves)
      let baseResults = [];

      const buildDisplay = (raw) => {
        const rawDisplay = (useExhaustive && exactCount > 0) ? raw.filter(r => r.isExact) : raw;
        return subtopics.length ? this.engine.tagWithSubtopics(rawDisplay, subtopics) : rawDisplay;
      };

      const renderResults = (displayResults, isSemantic) => {
        this._topScore      = displayResults[0]?.score || 1;
        this._allResults    = displayResults;
        this.results        = displayResults;
        this._flatResults   = this._buildFlatResults(displayResults, parsed);

        if (!isSemantic) {
          this._hideProgress();
          this._renderPipelineInfo(arabicQuery, extractedRoots);
          this._renderConceptBridge(query, parsed, arabicQuery, totalMatched, searchLimit, displayResults.length);
          this._renderSidebarRoots(parsed, extractedRoots);
          this._renderSummary(displayResults, parsed, exactCount, totalMatched, searchLimit);

          const answerType = this._detectAnswerType(query, parsed);
          if (answerType === 'addressee_listing') {
            this._answerMode = 'addressee_listing';
            const vocabRoots = parsed.roots.length > 0 ? parsed.roots : extractedRoots;
            this._renderAnswerPanel(query, parsed, vocabRoots);
          }

          this._runHadithSearch(parsed.keywords);
        }

        this._renderPage(false);
        this._renderWeakMatchHint(query, parsed, displayResults, exactCount);
        if (displayResults.length > 0) this._trackQuery(query);

        document.getElementById('results-layout')?.removeAttribute('hidden');
        document.getElementById('filter-bar').hidden = false;
        document.getElementById('results-section').hidden = false;

        const surahCount = new Set(displayResults.map(r => r.ayah.sn)).size;
        let countText = '';
        if (displayResults.length) {
          if (useExhaustive && exactCount > 0) {
            countText = `${exactCount} exact occurrences across ${surahCount} surahs`;
          } else {
            const capped    = totalMatched > displayResults.length;
            const ayahLabel = capped
              ? `Top ${displayResults.length} of ${totalMatched} ayaat`
              : `${displayResults.length} ayaat`;
            const exactLabel = exactCount > 0 ? ` · ${exactCount} exact` : '';
            countText = `${ayahLabel} across ${surahCount} surahs${exactLabel}${isSemantic ? ' · reranked' : ''}`;
          }
        }
        document.getElementById('results-count').textContent = countText;

        if (!isSemantic) {
          document.getElementById('results-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      };

      this._lastKeywords = parsed.keywords;
      this._lastParsed   = parsed;

      // ── Phase 1 callback: instant results from sync scoring (<50ms) ──────
      // Fired from inside engine.search() before any network call is made.
      // Shows results immediately while LLM expansion runs in the background.
      const onFastResults = (fast) => {
        if (this._searchGen !== myGen) return;
        exactCount   = fast.exactCount;
        totalMatched = fast.totalMatched;
        baseResults  = fast.results;
        renderResults(buildDisplay(fast.results), false);
        // Keep progress bar visible with 'translate' step to signal LLM is still working
        this._showProgress('translate');
      };

      // ── Await LLM-enhanced results (Phase 2) ─────────────────────────────
      const llmResult = await this.engine.search(
        query, this.filters, searchLimit,
        step => { if (this._searchGen === myGen) this._showProgress(step); },
        onFastResults,
      );

      if (this._searchGen !== myGen) return;

      // Update metadata with LLM output and re-render with improved ranking + pipeline info
      arabicQuery    = llmResult.arabicQuery;
      extractedRoots = llmResult.extractedRoots;
      exactCount     = llmResult.exactCount;
      totalMatched   = llmResult.totalMatched;
      subtopics      = llmResult.subtopics;
      baseResults    = llmResult.results;

      renderResults(buildDisplay(llmResult.results), false);

      // Start synthesis with LLM-enhanced results
      const isIdQuery   = /^\d+\s*:\s*\d+/.test(query.trim());
      const isCategoryQ = this._isCategoryQuery(query);
      if (!isIdQuery && this._allResults.length > 0) {
        if (!isCategoryQ) this._renderSynthesisLoading(query, subtopics);
        this._startSynthesis(query, this._allResults, subtopics, myGen);
      }

      // When semantic results arrive, merge with LLM-enhanced base and re-render
      semanticPromise.then(semanticResults => {
        if (this._searchGen !== myGen) return;
        if (!semanticResults || semanticResults.length === 0) return;
        const semanticIds = new Set(semanticResults.map(r => r.ayah.id));
        const baseOnly = baseResults.filter(r => !semanticIds.has(r.ayah.id));
        const merged   = [...semanticResults, ...baseOnly];
        renderResults(buildDisplay(merged), true);
      }).catch(() => {});

    } catch (err) {
      if (this._searchGen !== myGen) return;
      this._hideProgress();
      // Surface a meaningful error rather than a silent spinner
      const msg = err.name === 'AbortError'  ? 'Search timed out — please try again.'
                : !navigator.onLine          ? 'You appear to be offline.'
                : err.message?.includes('500') ? 'Search service error — try again in a moment.'
                : `Search failed: ${err.message || err}`;
      console.error('[search]', err);
      const grid = document.getElementById('results-grid');
      if (grid) {
        grid.innerHTML = `<p style="padding:32px;color:var(--text-sec);font-size:.9rem;">${msg}</p>`;
        document.getElementById('results-section').hidden = false;
        document.getElementById('results-layout').removeAttribute('hidden');
      }
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
               <span class="pi-arabic" dir="rtl" lang="ar">${this._esc(arabicQuery)}</span>`;
    }
    if (extractedRoots.length) {
      html += `<span class="pi-label">Roots found:</span>
               <span class="pi-roots">${extractedRoots.map(r =>
                 `<span class="root-chip" dir="rtl" lang="ar">${this._esc(r)}</span>`
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

    const rerankBadge = this._rerankActive
      ? `<span class="cb-ai-badge" title="Results re-ordered by AI cross-encoder">✦ AI-enhanced</span>`
      : '';

    el.innerHTML = `
      <div class="cb-row">
        <span class="cb-label">You searched</span>
        <span class="cb-query">${this._esc(query)}</span>
        <span class="cb-confidence ${confidence}">${confidenceLabel}</span>
        ${rerankBadge}
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

  // [Root modal moved to root-modal.js]

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
        ? `<span class="pi-arabic" dir="rtl" lang="ar">${this._esc(ar)}</span> (${this._esc(en)})`
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
        ? `<span class="pi-arabic" dir="rtl" lang="ar">${this._esc(arMatch[1])}</span>`
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
    card.id = `card-${ayah.id}`;

    // #2 — Confidence indicator: normalize score against the top result's score
    const rel = Math.min(1, (score || 0) / (this._topScore || 1));
    const confLevel = rel >= 0.65 ? 'conf-high' : rel >= 0.35 ? 'conf-mid' : 'conf-low';
    card.classList.add(confLevel);

    const placeClass = ayah.place === 'Meccan' ? 'badge-mecca' : 'badge-medina';

    const allTrans = [ayah.en, ayah.t1, ayah.t2, ayah.t3].filter(Boolean);
    const primary  = allTrans[0] || '';
    const others   = allTrans.slice(1);

    const highlightedPrimary = this._highlight(primary, matchedKeywords);

    const rootChips    = matchedRoots.slice(0, 5).map(r =>
      `<span class="match-chip match-root" dir="rtl" lang="ar" title="Arabic root">${this._esc(r)}</span>`
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

    // Confidence dots: filled/empty circles  ●●○ / ●●● / ●○○
    const dots = [rel >= 0.35, rel >= 0.65, rel >= 0.85]
      .map(f => `<span class="conf-dot${f ? ' filled' : ''}"></span>`).join('');

    const pairsUrl = `../?ayah=${ayah.sn}:${ayah.an}`;

    card.innerHTML = `
      <div class="card-meta">
        <span class="ref-badge"><span class="ref-surah-ar" dir="rtl" lang="ar">${this._esc(ayah.sna)}</span> ${ayah.sn}:${ayah.an}</span>
        <span class="badge ${placeClass}">${ayah.place}</span>
        <span class="badge badge-juz">Juz ${ayah.juz}</span>
        <span class="conf-dots" title="Relevance: ${Math.round(rel * 100)}%">${dots}</span>
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
      <a href="${pairsUrl}" class="see-pairs-btn" title="Explore thematic connections for this ayah">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        See Pairs
      </a>
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

  // [Synthesis panel methods moved to synthesis.js — see search/js/synthesis.js]

  // [Root modal moved to root-modal.js — see search/js/root-modal.js]

  // [Hadith panel moved to hadith-panel.js — see search/js/hadith-panel.js]

  // ── Curated topic catalogs (methods that use these are in synthesis.js) ──────

  // prettier-ignore
  static QURAN_PEOPLE_GROUPS = [
    { name: 'Mu\'minoon — True Believers',           query: 'mu\'minoon believers faith iman prayer charity' },
    { name: 'Kafireen — Disbelievers',               query: 'kafireen disbelievers kufr reject truth' },
    { name: 'Munafiqoon — Hypocrites',               query: 'munafiqoon hypocrites nifaq deceive' },
    { name: 'Mushrikoon — Polytheists',              query: 'mushrikoon polytheists shirk partners Allah' },
    { name: 'Muttaqoon — The God-Fearing',           query: 'muttaqoon taqwa god-fearing pious' },
    { name: 'Muhsinoon — Those Who Excel in Good',   query: 'muhsinoon ihsan excellence virtue' },
    { name: 'Zalimoon — Oppressors',                 query: 'zalimoon wrongdoers oppressors zulm' },
    { name: 'Fasiqoon — Transgressors',              query: 'fasiqoon transgressors wicked fasiq' },
    { name: 'Siddiqoon — The Truthful',              query: 'siddiqoon truthful sidq' },
    { name: 'Shuhadaa — Martyrs',                    query: 'shuhadaa martyrs shaheed path of Allah' },
    { name: 'Salihoon / Abrar — The Righteous',      query: 'salihoon abrar righteous pious birr' },
    { name: 'Mufsidoon — Corruptors',                query: 'mufsidoon fasad corruptors mischief earth' },
    { name: 'Mustad\'afeen — The Oppressed',         query: 'mustad\'afeen oppressed weak vulnerable' },
    { name: 'Ulul Albab — People of Understanding',  query: 'ulul albab understanding wisdom reflect' },
    { name: 'Sabiqoon — The Foremost',               query: 'sabiqoon foremost first faith deeds' },
    { name: 'Muqarraboon — Those Nearest to Allah',  query: 'muqarraboon nearest close Allah illiyin' },
    { name: 'Ashab al-Yameen — Companions of Right', query: 'ashab yameen right hand record blessed' },
    { name: 'Ashab al-Shimaal — Companions of Left', query: 'ashab shimaal left hand record punishment' },
    { name: 'Fujjar — The Wicked',                   query: 'fujjar wicked evil sijjin punishment' },
    { name: 'Ibaad ur-Rahman — Servants of Rahman',  query: 'ibaad rahman servants walk humbly night prayer' },
    { name: 'Mutrafeen — The Affluent Corrupters',   query: 'mutrafeen affluent luxury arrogant corrupt' },
    { name: 'Ahlul Kitab — People of the Book',      query: 'ahlul kitab people book jews christians' },
    { name: 'Banu Israel — Children of Israel',      query: 'banu israel children israel covenant' },
    { name: 'Muhajiroon — The Emigrants',            query: 'muhajiroon emigrants hijra left homes Allah' },
    { name: 'Ansar — The Helpers',                   query: 'ansar helpers supported believers medina' },
    { name: 'Awliyaa Allah — Friends of Allah',      query: 'awliyaa friends allah no fear grief' },
    { name: 'Mukhlisoona — The Sincerely Devoted',   query: 'mukhlisoona sincere devoted ikhlas purified' },
    { name: 'Sabireen — The Patient',                query: 'sabireen patient steadfast sabr trials' },
    { name: 'Tawwaboon — The Repentant',             query: 'tawwaboon repentant tawbah return Allah' },
    { name: 'Rabbanioon — Lordly Scholars',          query: 'rabbanioon scholars lordly teach practice' },
    { name: 'Mujrimoon — The Criminals',             query: 'mujrimoon criminals sinners guilty' },
    { name: 'Muqsitoon — The Just',                  query: 'muqsitoon just equity fairness qist' },
    { name: 'Mutakabbireen — The Arrogant',          query: 'mutakabbireen arrogant kibr pride' },
    { name: 'A\'raab — The Bedouins',                query: 'a\'raab bedouin desert arab stronger disbelief' },
    { name: 'Awliyaa Shaytan — Allies of Satan',     query: 'awliyaa shaytan allies satan fight disbelievers' },
  ];

  // prettier-ignore
  static QURAN_PROPHETS = [
    { name: 'Adam — The First Man',                  query: 'adam first man clay created garden forbidden tree' },
    { name: 'Idris — Enoch',                         query: 'idris enoch elevated exalted rank truthful patient' },
    { name: 'Nuh — Noah',                            query: 'nuh noah ark flood disbelievers saved warning' },
    { name: 'Hud — Prophet to \'Aad',               query: 'hud aad nation wind punishment storm destroyed' },
    { name: 'Salih — Prophet to Thamud',             query: 'salih thamud camel she-camel hamstring earthquake destroyed' },
    { name: 'Ibrahim — Abraham',                     query: 'ibrahim abraham fire monotheism idols hanif khalilullah friend' },
    { name: 'Lut — Lot',                             query: 'lut lot sodom immorality transgression destroyed saved angels' },
    { name: 'Ismail — Ishmael',                      query: 'ismail ishmael kaaba makkah patient sacrifice promise' },
    { name: 'Ishaq — Isaac',                         query: 'ishaq isaac blessed righteous son ibrahim gift' },
    { name: 'Yaqub — Jacob/Israel',                  query: 'yaqub jacob israel son isaac children tribes covenant' },
    { name: 'Yusuf — Joseph',                        query: 'yusuf joseph egypt dream well prison aziz minister' },
    { name: 'Shuayb — Jethro',                       query: 'shuayb madyan midian measure weight honest trade warned' },
    { name: 'Ayyub — Job',                           query: 'ayyub job patience suffering illness hardship reward restored' },
    { name: 'Musa — Moses',                          query: 'musa moses pharaoh firaun staff sea banu israel tawrat' },
    { name: 'Harun — Aaron',                         query: 'harun aaron brother musa assistant spokesman support' },
    { name: 'Dhul-Kifl — Ezekiel',                  query: 'dhul-kifl righteous patient persevering steadfast' },
    { name: 'Dawud — David',                         query: 'dawud david zabur psalms jalut goliath kingdom wisdom iron' },
    { name: 'Sulayman — Solomon',                    query: 'sulayman solomon wind jinn birds ant bilqis sheba throne' },
    { name: 'Ilyas — Elijah',                        query: 'ilyas elijah ba\'l idol people fire mountain' },
    { name: 'Al-Yasa\' — Elisha',                   query: 'al-yasa elisha chosen righteous among the best guided' },
    { name: 'Yunus — Jonah',                         query: 'yunus jonah whale fish dhul-noon nineveh darkness glorified' },
    { name: 'Zakariyya — Zechariah',                 query: 'zakariyya zechariah yahya son prayer old age miracle' },
    { name: 'Yahya — John the Baptist',              query: 'yahya john baptist wisdom child chaste righteous noble' },
    { name: 'Isa — Jesus',                           query: 'isa jesus miracles mary maryam injeel gospel born virgin' },
    { name: 'Muhammad ﷺ — Seal of Prophets',         query: 'muhammad messenger seal prophets khatam quran revelation warner' },
  ];

  // prettier-ignore
  static QURAN_HARAM_FOODS = [
    { name: 'Maytah — Carrion (Dead Animals)',                query: 'maytah carrion dead animals forbidden eat impure' },
    { name: 'Dam — Flowing Blood',                            query: 'dam blood poured flowing forbidden impure unclean' },
    { name: 'Lahm al-Khinzir — Pork',                        query: 'khinzir pork pig swine forbidden impure abomination' },
    { name: 'Ma Uhilla li-Ghayri Allah — Dedicated to Idols',query: 'slaughtered name other allah idols dedicated impure forbidden' },
    { name: 'Al-Munkhaniqah — Strangled Animals',             query: 'strangled choked suffocated dead animal forbidden' },
    { name: 'Al-Mawqudah — Beaten to Death',                  query: 'beaten killed blow struck dead forbidden' },
    { name: 'Al-Mutaraddiyah — Fallen to Death',              query: 'fallen fell height dead forbidden unless slaughtered' },
    { name: 'Al-Natihah — Gored by Horns',                    query: 'gored horns killed dead animal forbidden' },
    { name: 'Ma Akala Al-Sabu\' — Mauled by Predators',      query: 'eaten predator wild animal mauled partial forbidden' },
    { name: 'Ma Dhubiha \'Ala Al-Nusub — Altar Sacrifice',   query: 'sacrificed altars stones idols pagan divination forbidden' },
    { name: 'Khamr — Intoxicants and Alcohol',                query: 'khamr alcohol intoxicants wine forbidden rijs abomination shaytan' },
  ];

  // prettier-ignore
  static QURAN_JANNAH_FEATURES = [
    { name: 'Al-Firdaus — The Highest Garden',               query: 'firdaus highest paradise garden inherit dwell' },
    { name: 'Anhar — Rivers of Paradise',                    query: 'rivers water milk honey wine paradise flowing beneath' },
    { name: 'Ghurfat — Elevated Chambers',                   query: 'chambers rooms elevated lofty paradise dwellings built' },
    { name: 'Hur al-\'Ayn — Beautiful Companions',           query: 'hur al-ayn beautiful companions paradise pure restrained gaze' },
    { name: 'Wildaan Mukhalladoon — Immortal Youths',        query: 'wildaan youths immortal eternal servants paradise scattered pearls' },
    { name: 'Silk and Gold Garments',                        query: 'bracelets gold silk green garments adorned paradise clothing' },
    { name: 'Fruits and Food of Paradise',                   query: 'fruits paradise thornless lote-tree banana grape date food never forbidden' },
    { name: 'Salam — Peace and Greetings',                   query: 'salam peace greeting paradise salutation blessed angels' },
    { name: 'Vision of Allah — The Greatest Reward',         query: 'see allah face vision greatest reward paradise hearts' },
    { name: 'No Grief, Fatigue, or Sorrow',                  query: 'no grief fatigue toil weariness sorrow pain removed paradise' },
    { name: '\'Illiyin — The Highest Record',                query: 'illiyin highest record register righteous near allah' },
    { name: 'Nearness to Allah — Muqarraboon',               query: 'nearness allah close elevated rank muqarraboon foremost' },
    { name: 'Eternal Bliss — No Death, No Aging',            query: 'eternal immortal no death no aging no toil lasting reward' },
  ];

  // prettier-ignore
  static QURAN_JAHANNAM_FEATURES = [
    { name: 'Seven Gates of Jahannam',                       query: 'gates jahannam hell seven portion assigned each gate' },
    { name: 'Fuel — Humans and Stones Kindle the Fire',      query: 'fuel fire hell humans stones kindle burn prepared' },
    { name: 'Punishment of Burning Skin',                    query: 'burn fire skin punishment roast replaced disbelievers' },
    { name: 'Zaqqum — The Bitter Tree of Hell',              query: 'zaqqum tree hell bitter food boiling oil bellies' },
    { name: 'Boiling Water and Ghassaq — Pus',               query: 'ghassaq pus discharge drink boiling scalding water hell' },
    { name: 'Chains, Shackles, and Yokes',                   query: 'chains shackles yokes collars neck hellfire dragged bound' },
    { name: 'Calling Out — Wishing for Death',               query: 'call out death wish remain punishment no exit eternal' },
    { name: 'Zabaniyah — Guardian Angels of Hell',           query: 'zabaniyah guardians angels punishment drag seize hell nineteen' },
    { name: 'No Intercession for Its People',                query: 'intercession shafa\'ah will not benefit wrongdoers companions fire' },
    { name: 'The Inhabitants Who Enter Jahannam',            query: 'disbelievers arrogant oppressors wrongdoers enter jahannam fire punishment' },
    { name: 'The Levels — Al-Laza, Hutama, Sa\'ir, Saqar',  query: 'laza hutama sair saqar jahim hawiya levels fire hell names' },
    { name: 'Regret and Pleading to Return',                 query: 'return world believe regret wish lord take us out' },
  ];

  // prettier-ignore
  static QURAN_MAJOR_SINS = [
    { name: 'Shirk — Associating Partners with Allah',       query: 'shirk associate partners allah polytheism unforgivable greatest sin' },
    { name: 'Qatl — Unjust Killing/Murder',                  query: 'qatl murder kill unlawfully blood innocent severe punishment eternal' },
    { name: 'Zina — Adultery and Fornication',               query: 'zina adultery fornication lashes punishment forbidden approach' },
    { name: 'Riba — Usury and Interest',                     query: 'riba usury interest war allah messenger forbidden devour' },
    { name: 'Qazf — False Accusation of Chastity',           query: 'qazf false accusation chastity lashes slander believer woman' },
    { name: '\'Uquq al-Walidayn — Disobedience to Parents',  query: 'parents disobedience disrespect say uff harsh forbidden command' },
    { name: 'Akl Mal al-Yatim — Devouring Orphan\'s Wealth', query: 'orphan wealth consume devour unjustly fire sin belly' },
    { name: 'Kibr — Arrogance and Pride',                    query: 'kibr arrogance pride mutakabbireen forbidden paradise haughty' },
    { name: 'Nifaq — Hypocrisy',                             query: 'nifaq hypocrites deceive hell lowest level punishment' },
    { name: 'Fasad — Spreading Corruption in the Land',      query: 'fasad corruption spreading land forbidden severe punishment' },
    { name: 'Sihr — Sorcery and Magic',                      query: 'sihr sorcery magic forbidden disbelief harm separate spouses' },
    { name: 'Sariqah — Theft',                               query: 'sariqah theft cut hand punishment amputate steal recompense' },
    { name: 'Kufr — Ingratitude and Disbelief',              query: 'kufr disbelief ingratitude reject truth punishment severe' },
    { name: 'Abandoning Prayer',                             query: 'abandon neglect prayer heedless woe punishment fire saqar' },
    { name: 'Consuming Haram Wealth Unjustly',               query: 'consume devour wealth unjustly wrongdoing property people' },
  ];

  // prettier-ignore
  static QURAN_DIVINE_NAMES = [
    { name: 'Al-Rahman — The Most Gracious',                 query: 'rahman most gracious mercy vast compassion creation' },
    { name: 'Al-Rahim — The Most Merciful',                  query: 'rahim merciful mercy forgiveness believers specific' },
    { name: 'Al-Malik — The Sovereign King',                 query: 'malik king sovereign dominion master day judgment' },
    { name: 'Al-Quddus — The Holy, The Pure',                query: 'quddus holy pure sanctified glorified free defects' },
    { name: 'Al-Salam — The Source of Peace',                query: 'salam peace source security safety greeting paradise' },
    { name: 'Al-Mu\'min — The Granter of Security',         query: 'mu\'min granter security faithful protects believers guardian faith' },
    { name: 'Al-Muhaymin — The Overseer',                    query: 'muhaymin overseer watchful guardian dominant witness' },
    { name: 'Al-\'Aziz — The Almighty',                     query: 'aziz almighty powerful might honor dominant' },
    { name: 'Al-Jabbar — The Compeller',                     query: 'jabbar compeller overpowering irresistible omnipotent' },
    { name: 'Al-Mutakabbir — The Supremely Great',           query: 'mutakabbir supreme pride greatness majesty exalted above all' },
    { name: 'Al-Khaliq — The Creator',                       query: 'khaliq creator creation brings existence nothing' },
    { name: 'Al-Bari\' — The Originator',                   query: 'bari originator producer fashioner separates forms' },
    { name: 'Al-Musawwir — The Shaper of Forms',             query: 'musawwir shaper forms fashions shapes womb images' },
    { name: 'Al-Ghaffar — The Perpetual Forgiver',           query: 'ghaffar perpetual forgiver forgiveness repeated sins' },
    { name: 'Al-Qahhaar — The Subduer',                      query: 'qahhar subduer dominant overpowers everything irresistible' },
    { name: 'Al-Wahhab — The Bestower of Gifts',             query: 'wahhab bestower gifts bounties grants without measure' },
    { name: 'Al-Razzaq — The Provider',                      query: 'razzaq provider sustainer rizq provision without account' },
    { name: 'Al-\'Alim — The All-Knowing',                  query: 'alim all-knowing knowledge everything seen unseen hidden apparent' },
    { name: 'Al-Hayy Al-Qayyum — The Living, Self-Subsisting',query: 'hayy qayyum living self-subsisting eternal never dies slumber' },
    { name: 'Al-Samee\' — The All-Hearing',                 query: 'samee all-hearing hears prayers calls responds every sound' },
    { name: 'Al-Baseer — The All-Seeing',                    query: 'baseer all-seeing sees everything observes witnesses actions' },
    { name: 'Al-Tawwab — The Acceptor of Repentance',        query: 'tawwab acceptor repentance returns forgives tawbah turn' },
    { name: 'Al-Ghafur — The Oft-Forgiving',                 query: 'ghafur oft-forgiving forgives sins pardon overlooking' },
    { name: 'Al-Wadud — The Most Loving',                    query: 'wadud most loving affectionate love believers warm' },
    { name: 'Al-Majid — The Glorious',                       query: 'majid glorious majestic honor praised exalted throne' },
    { name: 'Al-Ba\'ith — The Resurrector',                  query: 'ba\'ith resurrector raises dead resurrection day judgment' },
    { name: 'Al-Shaheed — The Witness',                      query: 'shaheed witness witnesses all actions aware sufficient' },
    { name: 'Al-Haqq — The Truth',                           query: 'haqq absolute truth real certain manifest clear' },
    { name: 'Al-Wakeel — The Trustee',                       query: 'wakeel trustee guardian sufficient protector rely upon' },
    { name: 'Al-Qadir / Al-Qadeer — The All-Powerful',       query: 'qadir qadeer all-powerful capable able everything' },
    { name: 'Al-\'Afuw — The Pardoner',                     query: 'afuw pardoner erases wipes sins forgives pardons' },
    { name: 'Al-Nur — The Light',                            query: 'nur light heavens earth parable niche lamp' },
    { name: 'Al-Hadi — The Guide',                           query: 'hadi guide guidance leads right path straight' },
    { name: 'Al-Badi\' — The Originator of Creation',        query: 'badi originator heavens earth created without precedent' },
    { name: 'Al-Baqi — The Ever-Lasting',                    query: 'baqi everlasting endures remains face allah eternal' },
  ];

  // prettier-ignore
  static QURAN_WORSHIP_ACTS = [
    { name: 'Salah — Obligatory Prayer',                     query: 'salah prayer establish iqamat obligatory prescribed times' },
    { name: 'Zakat — Obligatory Almsgiving',                 query: 'zakat obligatory charity purification wealth poor needy' },
    { name: 'Sawm — Fasting in Ramadan',                     query: 'sawm fasting ramadan month prescribed abstain dawn sunset' },
    { name: 'Hajj — Pilgrimage to Makkah',                   query: 'hajj pilgrimage makkah kaaba obligatory afford once tawaf' },
    { name: 'Dhikr — Remembrance of Allah',                  query: 'dhikr remembrance allah mention hearts tranquil glorify morning evening' },
    { name: 'Dua — Supplication',                            query: 'dua supplication call upon ask invoke respond near' },
    { name: 'Tilawat — Recitation of the Quran',             query: 'recite quran follow guidance hearts heal listen attentively' },
    { name: 'Tawbah — Sincere Repentance',                   query: 'tawbah repentance return sincere forgiveness cleanse turn' },
    { name: 'Jihad — Striving in Allah\'s Way',              query: 'jihad strive path allah effort sacrifice wealth lives' },
    { name: 'Infaq — Spending Charity for Allah',            query: 'infaq spend charity path allah generosity righteous give' },
    { name: 'Sabr — Patience and Perseverance',              query: 'sabr patience steadfast trials tribulations reward believers' },
    { name: 'Tawakkul — Complete Reliance on Allah',         query: 'tawakkul reliance trust allah sufficient guardian depend' },
    { name: 'Shukr — Gratitude to Allah',                    query: 'shukr gratitude thanks grateful blessings increase deny' },
    { name: 'Tafakkur — Contemplation of Creation',          query: 'tafakkur contemplate reflect ponder creation signs heavens earth' },
    { name: 'Amr bil Ma\'ruf — Enjoining Good',             query: 'amr ma\'ruf enjoin good command righteous community best' },
    { name: 'Nahy \'an al-Munkar — Forbidding Evil',         query: 'nahy munkar forbidding evil preventing wrong society' },
    { name: 'Tawadu\' — Humility',                           query: 'tawadu humility humble walk gentle meek not arrogant' },
    { name: '\'Itikaf and Night Prayer — Qiyam al-Layl',    query: 'night prayer qiyam tahajjud stand portion night gift' },
  ];






  // ── Text helpers ─────────────────────────────────────────────────────────

  _esc(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Autocomplete suggestion dropdown ─────────────────────────────────────
  //
  // Two-tier: instant static completions first, then LLM-powered completions
  // replace them after a 400ms debounce (on Vercel). Like Google — fast first
  // pass, then smarter suggestions arrive without any visible "loading" jank.
  //

  _initSuggestions() {
    const wrapper = document.querySelector('.search-box');
    if (!wrapper || document.getElementById('search-suggestions')) return;

    const sg = document.createElement('div');
    sg.id = 'search-suggestions';
    sg.className = 'search-suggestions';
    sg.setAttribute('role', 'listbox');
    sg.hidden = true;
    wrapper.appendChild(sg);

    this._sgDebounce = null;
    this._sgLastQuery = '';
  }

  _updateSuggestions(val) {
    const q = val.trim();
    if (q.length < 2) { this._hideSuggestions(); return; }

    // Tier 1 — instant static completions from a curated phrase list
    this._showStaticSuggestions(q);

    // Tier 2 — LLM completions after 400ms debounce (Vercel only)
    clearTimeout(this._sgDebounce);
    this._sgDebounce = setTimeout(() => this._fetchLlmSuggestions(q), 400);
  }

  _showStaticSuggestions(q) {
    // Curated list of natural-language queries covering all major Islamic topics
    // Intentionally phrased like real user queries — not just Islamic terms
    const PHRASES = [
      // Emotional & spiritual
      'how to find peace in hardship','mercy of Allah for sinners',
      'what does the Quran say about anxiety','trust in Allah tawakkul',
      'hope after despair and grief','how to seek forgiveness from Allah',
      'gratitude and shukr blessings','patience in trials and tribulations',
      'love of Allah in the Quran','fear of Allah and taqwa',
      'how to strengthen iman faith','signs of a true believer',
      // Worship
      'how to make dua supplication','importance of tahajjud night prayer',
      'virtues of dhikr remembrance','fasting and ramadan',
      'spending in path of Allah sadaqah','hajj and pilgrimage',
      'importance of salah prayer','zakat and charity',
      // Character & ethics
      'rights of parents in Islam','how to treat neighbours',
      'honesty and truthfulness sidq','good character akhlaq',
      'justice and fairness adl','arrogance and pride kibr',
      'envy and jealousy hasad','backbiting and slander',
      'forgiveness and pardoning others',
      // Afterlife
      'Day of Judgment and hisab','paradise jannah description',
      'hellfire jahannam warning','death and afterlife barzakh',
      'intercession shafaah','resurrection qiyamah',
      // Knowledge
      'seeking knowledge in Islam','wisdom and hikmah',
      'purpose of creation','signs of Allah in creation',
      'Quran and its virtues','following the Prophet sunnah',
      // Sacrifice & striving
      'selling soul for Allah 2:207','jihad striving in path of Allah',
      'martyrdom shaheed','sacrifice qurbani',
      'divine pleasure ridha Allah','Allah ki khushnudi',
      // Sin & repentance
      'repentance tawbah how to repent','seeking forgiveness istighfar',
      'major sins in Islam','shirk polytheism',
      'hypocrisy nifaq munafiq','disbelief kufr',
      // Specific terms (common searches)
      'maghzoob those upon whom Allah is angry',
      'dhalleen those who went astray','muttaqeen people of taqwa',
      'muhsineen doers of good','sabireen patient ones',
      'taqwa God-consciousness','ikhlas sincerity intention',
      'tazkiya purification of soul','barakah blessing abundance',
      'rizq provision from Allah','shukr gratitude',
    ];

    const ql = q.toLowerCase();
    const scored = PHRASES
      .filter(p => p.toLowerCase().includes(ql))
      .map(p => {
        const pl = p.toLowerCase();
        const score = pl.startsWith(ql) ? 3
          : pl.split(/\s+/).some(w => w.startsWith(ql)) ? 2
          : 1;
        return { text: p, score };
      })
      .sort((a, b) => b.score - a.score || a.text.length - b.text.length)
      .slice(0, 5);

    if (scored.length) this._renderSuggestions(scored.map(s => s.text), q, false);
  }

  // ── Semantic search via /api/search (HuggingFace multilingual embeddings) ──
  // Returns top-N results mapped to the same format as BM25 results, or null on failure.
  async _semanticSearch(query) {
    try {
      const res = await Promise.race([
        fetch('/api/search', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ query }),
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 20000)),
      ]);
      if (!res.ok) return null;
      const data = await res.json();
      if (!Array.isArray(data?.results) || data.results.length === 0) return null;

      const mapped = [];
      for (const r of data.results) {
        const id   = `${r.surah}:${r.ayah}`;
        const ayah = this.engine.ayaatMap[id];
        if (!ayah) continue;
        mapped.push({
          ayah,
          score:           r.rerank_score ?? r.embed_score ?? 0.5,
          matchedRoots:    ayah.roots || [],
          matchedKeywords: [],
          isExact:         false,
          isSemantic:      true,
        });
      }
      return mapped.length > 0 ? mapped : null;
    } catch (e) {
      console.warn('[QC semantic] unavailable:', e.message);
      return null;
    }
  }

  async _fetchLlmSuggestions(q) {
    if (q === this._sgLastQuery) return;
    this._sgLastQuery = q;
    try {
      const res = await Promise.race([
        fetch('/api/expand', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, mode: 'suggest' }),
        }),
        new Promise((_, rej) => setTimeout(() => rej(), 3500)),
      ]);
      if (!res.ok) return;
      const data = await res.json();
      const suggestions = data?.suggestions;
      // Only update if still typing same prefix and we got good results
      const current = document.getElementById('search-input')?.value?.trim() ?? '';
      if (Array.isArray(suggestions) && suggestions.length > 0
          && current.toLowerCase().startsWith(q.slice(0, 3).toLowerCase())) {
        this._renderSuggestions(suggestions, current, true);
      }
    } catch { /* LLM unavailable — keep static suggestions */ }
  }

  _renderSuggestions(items, query, isLlm) {
    const sg = document.getElementById('search-suggestions');
    if (!sg) return;
    const ql = query.toLowerCase();

    sg.innerHTML = items.map((text, i) =>
      `<div class="sg-item${isLlm ? ' sg-llm' : ''}" role="option" data-q="${this._esc(text)}" data-idx="${i}">
        <span class="sg-icon">${isLlm ? '✦' : '🔍'}</span>
        <span class="sg-text">${this._highlightMatch(text, ql)}</span>
      </div>`
    ).join('');

    sg.querySelectorAll('.sg-item').forEach(item => {
      item.addEventListener('mousedown', e => {
        e.preventDefault();
        const input = document.getElementById('search-input');
        input.value = item.dataset.q;
        this._hideSuggestions();
        this.page = 0;
        this._run(item.dataset.q);
      });
    });

    sg.hidden = false;
  }

  _hideSuggestions() {
    const sg = document.getElementById('search-suggestions');
    if (sg) { sg.hidden = true; this._sgLastQuery = ''; }
  }

  _navigateSuggestion(dir, e) {
    const sg = document.getElementById('search-suggestions');
    if (!sg || sg.hidden) return;
    e.preventDefault();
    const items  = [...sg.querySelectorAll('.sg-item')];
    if (!items.length) return;
    const active = sg.querySelector('.sg-item.active');
    const idx    = active ? items.indexOf(active) : -1;
    const next   = items[Math.max(0, Math.min(items.length - 1, idx + dir))];
    items.forEach(i => i.classList.remove('active'));
    if (next) {
      next.classList.add('active');
      document.getElementById('search-input').value = next.dataset.q;
    }
  }

  _highlightMatch(text, query) {
    const lo  = text.toLowerCase();
    const idx = lo.indexOf(query.toLowerCase());
    if (idx === -1) return this._esc(text);
    return this._esc(text.slice(0, idx))
      + `<mark class="sg-mark">${this._esc(text.slice(idx, idx + query.length))}</mark>`
      + this._esc(text.slice(idx + query.length));
  }

  // ── #3 Weak match detection & suggestion chips ───────────────────────────

  _renderWeakMatchHint(query, parsed, results, exactCount) {
    // Remove any previous hint
    const existing = document.getElementById('weak-match-hint');
    if (existing) existing.remove();

    // Conditions for "weak match": very few results, no exact words found,
    // and no strong concept anchors (concept layer found nothing meaningful)
    const isWeak = results.length < 8
      && exactCount === 0
      && parsed.roots.length < 2
      && parsed.matchedConcepts.every(c => c.confidence !== 'exact');

    if (!isWeak) return;

    const curated = [
      'patience in hardship', 'anxiety and worry', 'trust in Allah',
      'forgiveness and mercy', 'hope after despair', 'gratitude for blessings',
      'grief and sadness', 'Day of Judgment', 'seeking guidance',
    ].filter(s => s.toLowerCase() !== query.toLowerCase());

    const history = this._getHistory()
      .filter(q => q.toLowerCase() !== query.toLowerCase())
      .slice(0, 3);

    const suggestions = [...new Set([...history, ...curated])].slice(0, 6);

    const chips = suggestions.map(s =>
      `<button type="button" class="hint-chip" data-q="${this._esc(s)}">${this._esc(s)}</button>`
    ).join('');

    const hint = document.createElement('div');
    hint.id = 'weak-match-hint';
    hint.className = 'weak-match-hint';
    hint.innerHTML = `
      <p class="hint-title">Low confidence match for <em>"${this._esc(query)}"</em> — try a more conceptual phrasing:</p>
      <div class="hint-chips">${chips}</div>`;

    hint.querySelectorAll('.hint-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById('search-input');
        input.value = btn.dataset.q;
        this.page = 0;
        this._run(btn.dataset.q);
      });
    });

    // Insert above results grid
    const grid = document.getElementById('results-grid');
    grid.parentNode.insertBefore(hint, grid);
  }

  // ── #6 Query history (localStorage) ─────────────────────────────────────

  _trackQuery(query) {
    const q = query.trim();
    if (!q || q.length < 3) return;
    try {
      const raw  = localStorage.getItem('qsm_history');
      let hist   = raw ? JSON.parse(raw) : [];
      // Remove duplicate then push to front
      hist = hist.filter(h => h.q.toLowerCase() !== q.toLowerCase());
      hist.unshift({ q, t: Date.now() });
      hist = hist.slice(0, 20);   // keep last 20
      localStorage.setItem('qsm_history', JSON.stringify(hist));
    } catch (_) { /* localStorage unavailable */ }
  }

  _getHistory() {
    try {
      const raw = localStorage.getItem('qsm_history');
      if (!raw) return [];
      return JSON.parse(raw).map(h => h.q);
    } catch (_) { return []; }
  }

  // [Hadith panel moved to hadith-panel.js]

  // ── #7 AI reranking (optional — only when RERANK_ENDPOINT is set) ────────

  async _rerank(query, results) {
    const TIMEOUT_MS = 4000;
    const top50 = results.slice(0, 50);
    const passages = top50.map(r => [r.ayah.en, r.ayah.t1, r.ayah.t2, r.ayah.t3]
      .filter(Boolean)[0] || r.ayah.ar || '');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(RERANK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, passages }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`Rerank API ${res.status}`);
    const { scores } = await res.json();

    if (!Array.isArray(scores) || scores.length !== top50.length) {
      throw new Error('Unexpected rerank response shape');
    }

    // Merge rerank scores into result objects, sort top-50 by rerank score
    const reranked = top50
      .map((r, i) => ({ ...r, _rerankScore: scores[i] }))
      .sort((a, b) => b._rerankScore - a._rerankScore);

    // Append remaining results (below top-50) unchanged after reranked
    return [...reranked, ...results.slice(50)];
  }

  // ── Text helpers ─────────────────────────────────────────────────────────

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
