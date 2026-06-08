/**
 * Quran Search Engine — Search Engine
 *
 * Pipeline:
 *   1. Translate English query → Arabic  (MyMemory API, cached)
 *   2. Extract Arabic roots from translation  (word_roots.json lookup)
 *   3. BM25 on English text  (all 3 translations, with stemming)
 *   4. Root-index matching  (translation roots + concept ontology roots)
 *   5. Arabic pattern matching  (addressee detection)
 *   6. Phrase boost
 *   Combine → filter → rank → return with match explanations.
 */

class QuranSearch {
  constructor(ayaat, wordRoots, rootVocab) {
    this.ayaat     = ayaat;
    this.wordRoots = wordRoots;   // { normalizedWord: [root, …] }
    this.rootVocab = rootVocab;   // { root: [{ n: normWord, c: count }, …] }
    this.ayaatMap  = {};
    this.invIndex  = {};          // term → { docId: tf }
    this.docLens   = {};
    this.arNorm    = {};          // docId → normalized Arabic
    this.rootIdx   = {};          // root → Set<docId>
    this.avgLen    = 0;
    this.N         = ayaat.length;
    this._cache    = {};          // translation cache (session)

    this._build();
  }

  // ── Build index ──────────────────────────────────────────────────────────

  _build() {
    let total = 0;
    for (const ayah of this.ayaat) {
      this.ayaatMap[ayah.id] = ayah;

      // Index all English text fields together
      const text = [ayah.en, ayah.t1, ayah.t2, ayah.t3].filter(Boolean).join(' ');
      const tokens = this._tokenize(text);
      this.docLens[ayah.id] = tokens.length;
      total += tokens.length;

      const tf = {};
      for (const tok of tokens) {
        tf[tok] = (tf[tok] || 0) + 1;
        // Also index the stemmed form
        const stem = this._stem(tok);
        if (stem !== tok) tf[stem] = (tf[stem] || 0) + 0.7;
      }
      for (const [term, freq] of Object.entries(tf)) {
        if (!this.invIndex[term]) this.invIndex[term] = {};
        this.invIndex[term][ayah.id] = freq;
      }

      this.arNorm[ayah.id] = normalizeArabic(ayah.ar);

      for (const root of (ayah.roots || [])) {
        if (!this.rootIdx[root]) this.rootIdx[root] = new Set();
        this.rootIdx[root].add(ayah.id);
      }
    }
    this.avgLen = total / this.N;

    // Pre-compute IDF weight for each root:
    //   rootIdf[root] = log(N / |ayaatContainingRoot| + 1) × 2
    // Rarer roots score higher; ubiquitous roots (ق و ل, ك و ن) score ~0.5.
    // Result is clamped to [0.5, 8] so no root dominates or disappears.
    this.rootIdf = {};
    for (const [root, ids] of Object.entries(this.rootIdx)) {
      const raw = Math.log(this.N / ids.size + 1) * 2;
      this.rootIdf[root] = Math.min(8, Math.max(0.5, raw));
    }
  }

  // ── Tokenize / Stem ──────────────────────────────────────────────────────

  _tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2 && !STOP_WORDS.has(t));
  }

  _stem(tok) {
    if (tok.length < 5) return tok;
    let stem = tok;
    if (tok.endsWith('tion'))  stem = tok.slice(0, -4);
    else if (tok.endsWith('ness'))  stem = tok.slice(0, -4);
    else if (tok.endsWith('ment'))  stem = tok.slice(0, -4);
    else if (tok.endsWith('ing'))   stem = tok.slice(0, -3);
    else if (tok.endsWith('ful'))   stem = tok.slice(0, -3);
    else if (tok.endsWith('ed'))    stem = tok.slice(0, -2);
    else if (tok.endsWith('er'))    stem = tok.slice(0, -2);
    else if (tok.endsWith('ly'))    stem = tok.slice(0, -2);
    else if (tok.endsWith('rs'))    stem = tok.slice(0, -1);
    else if (tok.endsWith('s') && !tok.endsWith('ss')) stem = tok.slice(0, -1);
    // Reject stems shorter than 3 chars — they are almost always wrong
    // (e.g. "water"→"wat", "father"→"fath", "class"→"clas")
    return stem.length >= 3 ? stem : tok;
  }

  // ── BM25 ─────────────────────────────────────────────────────────────────

  _bm25(term, docId, k1 = 1.5, b = 0.75) {
    const postings = this.invIndex[term];
    if (!postings) return 0;
    const tf = postings[docId] || 0;
    if (tf === 0) return 0;
    const df   = Object.keys(postings).length;
    const idf  = Math.log((this.N - df + 0.5) / (df + 0.5) + 1);
    const dlen = this.docLens[docId] || 1;
    return idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dlen / this.avgLen));
  }

  // ── Main search (async) ───────────────────────────────────────────────────

  async search(rawQuery, filters = {}, limit = 150, onProgress) {
    if (!rawQuery.trim()) return { results: [], arabicQuery: '', extractedRoots: [], exactCount: 0, exactWords: [] };

    const parsed = parseQuery(rawQuery);
    const scores  = {};
    const reasons = {}; // docId → { roots: Set, keywords: Set, patterns: Set }

    const addScore = (id, delta, type, label) => {
      scores[id] = (scores[id] || 0) + delta;
      if (!reasons[id]) reasons[id] = { roots: new Set(), keywords: new Set(), patterns: new Set() };
      if (label) reasons[id][type].add(label);
    };

    // ── Step 1: Translate uncovered tokens to Arabic ─────────────────────────
    //
    // The concept layer (TRANSLITERATIONS + CONCEPT_EXPANSIONS) handles known
    // Islamic/Urdu terms. For everything it DOESN'T recognise, the translation
    // API fills the gap — turning any unknown English or Roman-Urdu word into
    // Arabic roots on the fly.
    //
    // Key principle: translate ONLY the tokens the concept layer left uncovered
    // (these are in parsed.keywords — the _arabicPreciseTokens guard in
    // parseQuery already removed anything handled by the concept layer).
    // Then ADD the translation roots to the existing concept roots instead of
    // replacing/suppressing them. This lets both layers work together.
    //
    // Examples:
    //   "tazkiya e nafs"  → "nafs" covered (ن ف س), "tazkiya" uncovered
    //                     → translate "tazkiya" → ز ك و → both roots scored ✓
    //   "ikhlaas"         → concept layer handles it precisely → skip translation ✓
    //   "feeling hopeless"→ nothing covered → translate full query → ر ج و, ق ن ط ✓
    //   "musibat zindagi" → both uncovered → translate both → ب ل و, ح ي ي ✓
    onProgress?.('translate');
    let arabicQuery = '';
    let translationRoots = [];
    try {
      // Build translation input from UNCOVERED tokens only.
      // If the concept layer handled everything (no uncovered keywords and
      // roots already exist), skip translation entirely.
      const uncoveredKws = parsed.keywords.filter(k => k.length > 2).slice(0, 6);
      const hasConceptCoverage = parsed.roots.length > 0 || (parsed.exactWords || []).length > 0;
      const translationInput = uncoveredKws.length > 0
        ? uncoveredKws.join(' ')                          // translate only the unknown parts
        : hasConceptCoverage ? ''                         // fully covered — skip
        : rawQuery.trim();                                // nothing covered — translate all

      if (translationInput) {
        // Pass 1 — English → Arabic
        arabicQuery = await this._translateToArabic(translationInput, 'en|ar');
        if (arabicQuery) {
          translationRoots = this._extractRootsFromArabic(arabicQuery);
        }

        // Pass 2 — Urdu → Arabic fallback (MyMemory en|ar doesn't know Urdu/Persian)
        if (!translationRoots.length) {
          onProgress?.('roots');
          const urduInput  = uncoveredKws.length > 0 ? uncoveredKws.join(' ') : rawQuery.trim();
          const urduArabic = await this._translateToArabic(urduInput, 'ur|ar');
          if (urduArabic) {
            const urduRoots = this._extractRootsFromArabic(urduArabic);
            if (urduRoots.length) {
              arabicQuery      = urduArabic;
              translationRoots = urduRoots;
            }
          }
        }

        // Pass 3 — Urdu/Roman → English → concept layer (deepest fallback)
        //
        // When Passes 1+2 fail to extract Arabic roots (the translated Arabic
        // word form often doesn't appear verbatim in the Quran corpus), translate
        // the uncovered tokens to ENGLISH and run the result through parseQuery.
        // This lets the existing English concept layer do the heavy lifting:
        //
        //   "tazkiya"        → ur|en → "purification" → CONCEPT_EXPANSIONS → ز ك و
        //   "husn e akhlaq"  → ur|en → "good character"  → خ ل ق
        //   "musibat"        → ur|en → "calamity"         → ص ب ر, ب ل و
        //   "qanaah"         → ur|en → "contentment"      → ق ن ع, ر ض ي
        //   "zindagi"        → ur|en → "life"              → ح ي ي
        //   "pareshani"      → ur|en → "anxiety"          → خ و ف, ت و ك ل
        //
        // Works for any Islamic/Urdu/Persian term without manual entries.
        if (!translationRoots.length && uncoveredKws.length > 0) {
          const engText = await this._translate(uncoveredKws.join(' '), 'ur|en');
          if (engText && /[a-z]/i.test(engText)) {
            const engNorm = engText.toLowerCase().replace(/[^\w\s]/g, ' ').trim();
            // Guard: skip if translation returned the same words (no-op translation)
            const isSame = engNorm === uncoveredKws.join(' ').toLowerCase();
            if (!isSame && engNorm.length > 1) {
              const engParsed = parseQuery(engNorm);
              for (const root of engParsed.roots) {
                if (!translationRoots.includes(root)) translationRoots.push(root);
              }
              // Use the English translation as the UI label if we got useful roots
              if (translationRoots.length && !arabicQuery) {
                arabicQuery = engText;  // show what the engine understood
              }
            }
          }
        }
      }

      // Add translation roots that are genuinely NEW — not already covered by
      // the concept layer. This avoids double-counting roots that both layers found.
      const newRoots = translationRoots.filter(r => !parsed.roots.includes(r));
      if (newRoots.length > 0) {
        onProgress?.('roots');
        for (const root of newRoots) {
          const ids = this.rootIdx[root];
          if (ids) {
            const w = this.rootIdf[root] || 4;
            for (const id of ids) addScore(id, w, 'roots', root);
          }
        }
        translationRoots = newRoots;  // expose only the net-new roots to the UI strip
      } else {
        // Translation found nothing new — hide the strip to avoid clutter
        arabicQuery      = '';
        translationRoots = [];
      }
    } catch (_) { /* translation failed — concept roots already scored, continue */ }

    // ── Step 2: Arabic pattern matching (addressees) ───────────────────────
    onProgress?.('search');
    for (const pattern of parsed.arabicPatterns) {
      const normPat = normalizeArabic(pattern);
      for (const ayah of this.ayaat) {
        if (this.arNorm[ayah.id].includes(normPat)) {
          const concept = ADDRESSEES.find(a => a.ar_patterns.includes(pattern));
          addScore(ayah.id, 25, 'patterns', concept ? concept.label : 'Arabic pattern');
        }
      }
    }

    // ── Step 3: Concept root matching — IDF-weighted ─────────────────────
    // Rarer roots (e.g. و س ل → 2 ayaat) score much higher than common ones
    // (e.g. ق و ل → 1000+ ayaat). Floor/ceil keep scores meaningful.
    for (const root of parsed.roots) {
      if (translationRoots.includes(root)) continue;
      const ids = this.rootIdx[root];
      if (ids) {
        const w = this.rootIdf[root] || 2;
        for (const id of ids) addScore(id, w, 'roots', root);
      }
    }

    // ── Step 4: English BM25 (stemmed + direct, with spell correction) ──────
    // For any keyword not found in the index, find the closest known word
    // (edit distance ≤ 2) so that "mersy" → "mercy", "patiance" → "patience".
    // Reuses _editDistance() from concepts.js (loaded before this file).
    const _corrected = parsed.keywords.map(k => {
      if (k.length < 5 || this.invIndex[k]) return k;  // short or already known
      const maxDist = k.length >= 8 ? 2 : 1;
      let best = k, bestDist = maxDist + 1;
      for (const key of Object.keys(this.invIndex)) {
        if (Math.abs(key.length - k.length) > maxDist) continue;
        const d = _editDistance(k, key, maxDist);
        if (d < bestDist) { bestDist = d; best = key; }
        if (bestDist === 1 && maxDist === 1) break; // can't do better
      }
      return best;
    });
    const allKeywords = [...new Set([
      ...parsed.keywords, ..._corrected,
      ...parsed.keywords.map(k => this._stem(k)),
    ])];
    for (const term of allKeywords) {
      const postings = this.invIndex[term] || {};
      for (const idStr of Object.keys(postings)) {
        const id = +idStr;
        const sc = this._bm25(term, id);
        if (sc > 0) addScore(id, sc, 'keywords', term.length > 4 ? term : null);
      }
    }

    // ── Step 5: Phrase boost ──────────────────────────────────────────────
    const phrases = this._extractPhrases(rawQuery);
    for (const phrase of phrases) {
      const lo = phrase.toLowerCase();
      for (const ayah of this.ayaat) {
        const txt = [ayah.en, ayah.t1, ayah.t2, ayah.t3].filter(Boolean).join(' ').toLowerCase();
        if (txt.includes(lo)) addScore(ayah.id, 6, 'keywords', phrase);
      }
    }

    // ── Step 6: Exact Arabic word/phrase matching ────────────────────────
    // Single-word entries: generate prefix variants (للمتقين, والمتقين, etc.)
    // Multi-word entries (e.g. لا يحب, ربنا phrase): substring match in full text.
    const exactSet = new Set();
    for (const normWord of (parsed.exactWords || [])) {
      if (normWord.includes(' ')) {
        // Phrase match — substring inclusion in normalised Arabic
        for (const ayah of this.ayaat) {
          if (this.arNorm[ayah.id].includes(normWord)) {
            addScore(ayah.id, 30, 'patterns', normWord);
            exactSet.add(ayah.id);
          }
        }
      } else {
        // Single word — prefix-variant matching
        const variants = this._arabicVariants(normWord);
        for (const ayah of this.ayaat) {
          const words = this.arNorm[ayah.id].split(/\s+/);
          if (words.some(w => variants.has(w))) {
            addScore(ayah.id, 30, 'patterns', normWord);
            exactSet.add(ayah.id);
          }
        }
      }
    }

    // ── Step 6b: Root fallback for encoding mismatches ─────────────────────
    // Some Quranic words (e.g. الألباب) use superscript alef (ٰ U+0670) which
    // normalisation removes, causing a mismatch between EXACT_WORDS forms and arNorm.
    // When exact words matched nothing but the same terms have known roots via
    // TRANSLITERATIONS, use those specific roots at near-exact priority.
    if (parsed.exactWords.length > 0 && exactSet.size === 0 &&
        (parsed.exactRoots || []).length > 0) {
      for (const root of parsed.exactRoots) {
        const ids = this.rootIdx[root];
        if (ids) {
          for (const id of ids) {
            addScore(id, 28, 'patterns', root);
            exactSet.add(id);
          }
        }
      }
    }

    // ── Build & rank ──────────────────────────────────────────────────────
    let results = Object.entries(scores).map(([idStr, score]) => {
      const id = +idStr;
      const r  = reasons[id] || { roots: new Set(), keywords: new Set(), patterns: new Set() };
      return {
        ayah:            this.ayaatMap[id],
        score,
        isExact:         exactSet.has(id),
        matchedRoots:    [...r.roots],
        matchedKeywords: [...r.keywords].filter(k => k && k.length > 2),
        matchedPatterns: [...r.patterns],
      };
    }).filter(r => r.ayah);

    if (filters.place) {
      const p = filters.place.toLowerCase();
      results = results.filter(r => r.ayah.place.toLowerCase() === p);
    }
    if (filters.surah) {
      results = results.filter(r => r.ayah.sn === +filters.surah);
    }
    if (filters.juz) {
      results = results.filter(r => r.ayah.juz === +filters.juz);
    }

    // When exact words were searched: exact matches first in Quran order,
    // then other BM25/root matches by score. This makes "list all X" queries comprehensive.
    if (exactSet.size > 0) {
      const exactResults = results.filter(r => exactSet.has(r.ayah.id))
        .sort((a, b) => a.ayah.id - b.ayah.id);
      const otherResults = results.filter(r => !exactSet.has(r.ayah.id))
        .sort((a, b) => b.score - a.score);
      results = [...exactResults, ...otherResults];
    } else {
      results.sort((a, b) => b.score - a.score || a.ayah.id - b.ayah.id);
    }

    return {
      results:        results.slice(0, limit),
      arabicQuery,
      extractedRoots: translationRoots,
      exactCount:     exactSet.size,
      totalMatched:   results.length,   // pre-limit count; used by UI to show "Top N of M"
    };
  }

  // ── Translation API ───────────────────────────────────────────────────────

  // langpair: 'en|ar' (default) or 'ur|ar' for Urdu input
  async _translateToArabic(query, langpair = 'en|ar') {
    const key = `qt_${langpair}_${query.trim().toLowerCase()}`;
    if (this._cache[key] !== undefined) return this._cache[key];
    try {
      const stored = sessionStorage.getItem(key);
      if (stored !== null) { this._cache[key] = stored; return stored; }
    } catch (_) {}

    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(query)}&langpair=${langpair}`;
    const res = await Promise.race([
      fetch(url).then(r => r.json()),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
    ]);

    const text = res?.responseData?.translatedText || '';
    const result = /[؀-ۿ]/.test(text) ? text : '';
    this._cache[key] = result;
    try { if (result) sessionStorage.setItem(key, result); } catch (_) {}
    return result;
  }

  // Generic translation — returns whatever the API gives, no Arabic filter.
  // Used for ur|en (Urdu → English) so the result can feed the English concept layer.
  async _translate(query, langpair) {
    const key = `qt_${langpair}_${query.trim().toLowerCase()}`;
    if (this._cache[key] !== undefined) return this._cache[key];
    try {
      const stored = sessionStorage.getItem(key);
      if (stored !== null) { this._cache[key] = stored; return stored; }
    } catch (_) {}
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(query)}&langpair=${langpair}`;
    const res = await Promise.race([
      fetch(url).then(r => r.json()),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000)),
    ]);
    const text = (res?.responseData?.translatedText || '').trim();
    this._cache[key] = text;
    try { if (text) sessionStorage.setItem(key, text); } catch (_) {}
    return text;
  }

  // ── Root extraction from Arabic text ─────────────────────────────────────

  _extractRootsFromArabic(arabicText) {
    const roots = [];
    const norm  = normalizeArabic(arabicText);
    const words = norm.split(/\s+/).filter(w => w.length > 1);

    // Common attached prefixes that translation APIs emit
    const PREFIXES = ['ال','وال','فال','بال','كال','ولل','فلل','لل','و','ف','ب','ك','ل'];

    // Expand a single stem into lookup candidates by stripping common suffixes.
    // Many Arabic nouns/gerunds returned by translation APIs end in ة (normalized
    // to ه), but word_roots.json indexes the stem WITHOUT the taa marbuta.
    // e.g. تزكيه → تزكي (root ز ك و)  |  رحمه → رحم (root ر ح م)
    // We also try stripping pronoun suffixes (ها، هم، كم، نا) and plural ون/ين.
    const _stems = stem => {
      const out = [stem];
      const SUFFIXES = ['ها','هم','هن','كم','كن','نا','ني','هو','ون','ين','ات','وا','ه'];
      for (const sfx of SUFFIXES) {
        if (stem.endsWith(sfx) && stem.length > sfx.length + 1)
          out.push(stem.slice(0, -sfx.length));
      }
      return out;
    };

    for (const word of words) {
      // Build the full candidate set: word + prefix-stripped + suffix-stripped combos
      const prefixForms = [word];
      for (const pfx of PREFIXES) {
        if (word.startsWith(pfx) && word.length > pfx.length + 1)
          prefixForms.push(word.slice(pfx.length));
      }
      // Apply suffix stripping to every prefix form
      const candidates = [...new Set(prefixForms.flatMap(_stems))];

      for (const cand of candidates) {
        for (const root of (this.wordRoots[cand] || [])) {
          if (!roots.includes(root)) roots.push(root);
        }
      }
    }
    return roots;
  }

  // ── Arabic prefix variants ────────────────────────────────────────────────
  /**
   * Generate all attached-prefix variants of a normalized Arabic word so that
   * an exact-word search for e.g. المتقين also matches للمتقين, والمتقين, etc.
   *
   * Quranic prefixes: و (and), ف (then), ل (to/for), ب (by/with), ك (as/like).
   * Definite article ال attaches to nouns. When ل meets ال, the alef elides:
   *   ل + ال + متقين → للمتقين
   */
  _arabicVariants(word) {
    const out  = new Set([word]);
    const hasAl = word.startsWith('ال');
    const stem  = hasAl ? word.slice(2) : word;
    if (!stem) return out;

    // Bare stem + al-stem
    out.add(stem);
    out.add('ال' + stem);

    // Simple consonant prefixes (و ف ب ك)
    for (const pfx of ['و', 'ف', 'ب', 'ك']) {
      out.add(pfx + stem);
      out.add(pfx + 'ال' + stem);
    }
    // ل-prefix with alef elision: ل + ال + X → للX
    out.add('ل' + stem);
    out.add('لل' + stem);

    // ل combined with و/ف
    for (const pfx of ['و', 'ف']) {
      out.add(pfx + 'ل' + stem);
      out.add(pfx + 'لل' + stem);
      out.add(pfx + 'ال' + stem);
    }
    // س (future) prefix on verbs
    out.add('س' + stem);

    return out;
  }

  // ── Vocabulary lookup (for terms answer panel) ───────────────────────────

  /**
   * Returns top unique Arabic words across the given roots, sorted by frequency.
   * Each entry: { normWord, count, roots[] }
   */
  getTermsForRoots(roots, limit = 30) {
    // Arabic function words to exclude from term panels
    const AR_STOP = new Set([
      'التي','الذي','الذين','اللاتي','ما','من','في','على','إلي','عن',
      'هذا','هذه','ذلك','تلك','هو','هي','هم','هن','انا','نحن',
      'انت','انتم','كان','كانت','كانوا','ليس','قد','لا','ان','اي',
      'له','لهم','لك','لكم','بل','ثم','او','لو','كل','حتي',
      'بعد','قبل','عند','مع','عن','منه','منها','منهم','فيه','فيها',
    ]);

    const wordMap = {}; // normWord → { count, roots }
    for (const root of roots) {
      const entries = this.rootVocab[root] || [];
      for (const { n, c } of entries) {
        if (n.length < 3 || AR_STOP.has(n)) continue;
        if (!wordMap[n]) wordMap[n] = { count: 0, roots: [] };
        if (c > wordMap[n].count) wordMap[n].count = c;
        if (!wordMap[n].roots.includes(root)) wordMap[n].roots.push(root);
      }
    }
    return Object.entries(wordMap)
      .map(([normWord, { count, roots }]) => ({ normWord, count, roots }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Returns all ayaat containing the exact normalized Arabic word, in Quran order.
   */
  filterByNormWord(normWord, label) {
    const results = [];
    for (const ayah of this.ayaat) {
      if (this.arNorm[ayah.id].split(/\s+/).includes(normWord)) {
        results.push({
          ayah,
          score: 1,
          matchedRoots:    this.wordRoots[normWord] || [],
          matchedKeywords: [],
          matchedPatterns: label ? [label] : [normWord],
        });
      }
    }
    results.sort((a, b) => a.ayah.id - b.ayah.id);
    return results;
  }

  // ── Pattern search (for addressee filter) ────────────────────────────────

  searchByPattern(patterns, label) {
    const normPats = patterns.map(p => normalizeArabic(p));
    const results  = [];
    for (const ayah of this.ayaat) {
      const arN = this.arNorm[ayah.id];
      if (normPats.some(np => arN.includes(np))) {
        results.push({
          ayah,
          score: 1,
          matchedRoots:    [],
          matchedKeywords: [],
          matchedPatterns: label ? [label] : [],
        });
      }
    }
    results.sort((a, b) => a.ayah.id - b.ayah.id);
    return results;
  }

  // Count ayaat matching each addressee's Arabic patterns
  countForAddressees() {
    return ADDRESSEES.map(addr => {
      const normPats = addr.ar_patterns.map(p => normalizeArabic(p));
      let count = 0;
      for (const id in this.arNorm) {
        if (normPats.some(np => this.arNorm[id].includes(np))) count++;
      }
      return { ...addr, count };
    });
  }

  // ── Phrase extraction ─────────────────────────────────────────────────────

  _extractPhrases(query) {
    const phrases = [];
    // Quoted phrases
    for (const m of query.matchAll(/"([^"]{4,})"/g)) phrases.push(m[1]);
    // Adjacent meaningful word pairs
    const words = query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));
    for (let i = 0; i < words.length - 1; i++) phrases.push(`${words[i]} ${words[i + 1]}`);
    return phrases;
  }
}
