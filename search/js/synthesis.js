/**
 * synthesis.js — Knowledge Synthesis Panel
 * Augments QuranApp.prototype. Must be loaded AFTER app.js.
 *
 * Curated catalog data (QURAN_PROPHETS, QURAN_PEOPLE_GROUPS, etc.) is defined
 * as static class fields in app.js and referenced here via QuranApp.<CATALOG>.
 */

// ── Synthesis panel methods ────────────────────────────────────────────────

Object.assign(QuranApp.prototype, {

  _hideSynthesisPanel() {
    const p = document.getElementById('synthesis-panel');
    if (p) { p.hidden = true; p.innerHTML = ''; }
  },

  _renderSynthesisLoading(query, subtopics) {
    const p = document.getElementById('synthesis-panel');
    if (!p) return;
    const subtopicChips = (subtopics || []).map(s =>
      `<span class="syn-chip">${this._esc(s.name)}</span>`
    ).join('');
    p.innerHTML = `
      <div class="syn-loading">
        <div class="syn-spinner"></div>
        <div class="syn-loading-text">
          <span>Synthesising Quranic knowledge on <strong>${this._esc(query)}</strong></span>
          ${subtopicChips ? `<div class="syn-chip-row">${subtopicChips}</div>` : ''}
        </div>
      </div>`;
    p.hidden = false;
  },

  _isCategoryQuery(q) {
    return /\b(list|all|every|each|types? of|categories|enumerate|how many|what are the|mention(ed)?|named)\b/i.test(q);
  },

  _detectCatalogType(q) {
    const l = q.toLowerCase();
    if (/\b(prophet|messenger|nabi|rasul|anbiya|apostle|25 prophet)\b/.test(l))                                     return 'prophets';
    if (/\b(haram|forbidden|prohibited|impermissible).{0,30}(food|eat|drink|diet)\b|(food|drink|eat).{0,30}(haram|forbidden|prohibited)\b|\bdietary\b/.test(l)) return 'haram_foods';
    if (/\b(jannah|paradise|firdaus|heaven(?!ly fire)|rivers? of paradise|features? of paradise|description.? of paradise)\b/.test(l)) return 'jannah';
    if (/\b(jahannam|hellfire|hell fire|levels? of hell|gates? of (hell|jahannam)|punishment.{0,20}(hell|fire)|description.? of hell)\b/.test(l)) return 'jahannam';
    if (/\b(major sins?|grave sins?|kaba.ir|biggest sins?|worst sins?|list.{0,10}sins?)\b/.test(l))                return 'major_sins';
    if (/\b(asma.?ul.?husna|names? of allah|attributes? of allah|divine names?|99 names?|beautiful names? of allah)\b/.test(l)) return 'divine_names';
    if (/\b(acts? of worship|ibadat|pillars? of islam|obligations? in islam|forms? of worship)\b/.test(l))          return 'worship';
    return 'people_groups';
  },

  _getCatalog(type) {
    switch (type) {
      case 'prophets':     return QuranApp.QURAN_PROPHETS;
      case 'haram_foods':  return QuranApp.QURAN_HARAM_FOODS;
      case 'jannah':       return QuranApp.QURAN_JANNAH_FEATURES;
      case 'jahannam':     return QuranApp.QURAN_JAHANNAM_FEATURES;
      case 'major_sins':   return QuranApp.QURAN_MAJOR_SINS;
      case 'divine_names': return QuranApp.QURAN_DIVINE_NAMES;
      case 'worship':      return QuranApp.QURAN_WORSHIP_ACTS;
      default:             return QuranApp.QURAN_PEOPLE_GROUPS;
    }
  },

  async _gatherCategoryVerses(catalog) {
    const seen = new Set();
    const pool = [];
    for (const item of catalog) {
      try {
        const { results } = await this.engine.search(item.query, {}, 6);
        for (const r of results) {
          if (!seen.has(r.ayah.id)) {
            seen.add(r.ayah.id);
            pool.push(r);
          }
        }
      } catch (_) { /* skip failed item */ }
    }
    return pool;
  },

  async _gatherGroupedVerses(catalog) {
    const groups = [];
    for (const item of catalog) {
      try {
        const { results } = await this.engine.search(item.query, {}, 8);
        const verses = results.slice(0, 2).map(r => ({
          ref:  `${r.ayah.sn}:${r.ayah.an}`,
          text: (r.ayah.en || r.ayah.t1 || '').slice(0, 90),
        }));
        groups.push({ name: item.name, results, verses });
      } catch (_) {
        groups.push({ name: item.name, results: [], verses: [] });
      }
    }
    return groups;
  },

  async _startSynthesis(query, results, subtopics, gen, signal) {
    if (this._synthesisGen === gen) return;
    this._synthesisGen = gen;
    try {
      let versePool = results;
      let groupNames = [];
      let groupVerses = null;

      if (this._isCategoryQuery(query)) {
        const catalogType = this._detectCatalogType(query);
        const catalog     = this._getCatalog(catalogType);
        groupVerses = await this._gatherGroupedVerses(catalog);
        if (this._searchGen !== gen) return;
        groupNames = catalog.map(g => g.name);
        this._renderGroupedCategoryResults(groupVerses, gen);
      }

      if (groupVerses) return;

      const verses = versePool.slice(0, 15).map(r => ({
        ref:  `${r.ayah.sn}:${r.ayah.an}`,
        text: (r.ayah.en || r.ayah.t1 || '').slice(0, 100),
      }));

      const resp = await Promise.race([
        fetch('/api/synthesize', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            query,
            verses,
            subtopics: subtopics.map(s => s.name),
            groupNames,
            groupVerses,
          }),
          signal,
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 28000)),
      ]);
      if (this._searchGen !== gen) return;
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (this._searchGen !== gen) return;
      this._renderSynthesisPanel(data, results);
    } catch (e) {
      console.error('[QC synthesize] error:', e.message);
      if (this._searchGen === gen) {
        const p = document.getElementById('synthesis-panel');
        if (p) {
          const isRateLimit = e.message.includes('429') || e.message.includes('rate') || e.message.includes('Rate');
          p.innerHTML = `<div class="syn-error">${isRateLimit
            ? '⏳ Knowledge synthesis is rate-limited — please wait a moment and search again.'
            : '⚠️ Knowledge synthesis unavailable right now.'
          }</div>`;
          p.hidden = false;
          setTimeout(() => { if (p) p.hidden = true; }, 6000);
        }
      }
    }
  },

  _renderGroupedCategoryResults(groupVerses, gen) {
    if (this._searchGen !== gen) return;
    const grid = document.getElementById('results-grid');
    if (!grid) return;

    grid.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'category-groups-view';

    for (const group of groupVerses) {
      if (!group.results || !group.results.length) continue;

      const section = document.createElement('div');
      section.className = 'category-group';

      const header = document.createElement('div');
      header.className = 'category-group-header';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'category-group-name';
      nameSpan.textContent = group.name;

      const searchBtn = document.createElement('button');
      searchBtn.className = 'category-search-btn';
      searchBtn.textContent = 'Search all ›';
      const shortName = group.name.split('—')[0].trim();
      searchBtn.addEventListener('click', () => {
        document.getElementById('search-input').value = shortName;
        this.search(shortName);
      });

      header.appendChild(nameSpan);
      header.appendChild(searchBtn);
      section.appendChild(header);

      const versesRow = document.createElement('div');
      versesRow.className = 'category-group-verses';
      for (const r of group.results.slice(0, 4)) {
        versesRow.appendChild(this._buildCard(r));
      }
      section.appendChild(versesRow);
      container.appendChild(section);
    }

    grid.appendChild(container);
  },

  _renderSynthesisPanel(data, allResults) {
    const p = document.getElementById('synthesis-panel');
    if (!p) return;

    // The API returns { theme, groups:[{label, refs}] } — NO prose from the LLM.
    // All verse text is pulled from this.engine.ayaatMap (authenticated local DB).
    const groups = Array.isArray(data?.groups) ? data.groups : [];

    if (!groups.length && !data?.theme) { this._hideSynthesisPanel(); return; }

    const refToCardId = {};
    for (const r of (allResults || [])) {
      const key = `${r.ayah.sn}:${r.ayah.an}`;
      refToCardId[key] = r.ayah.id;
    }

    const groupsHtml = groups.map(g => {
      const refs = Array.isArray(g.refs) ? g.refs : [];
      const rowsHtml = refs.map(ref => {
        const ayah = this.engine.ayaatMap[ref];
        if (!ayah) return '';

        const cardId  = refToCardId[ref] || ayah.id || '';
        const arabic  = ayah.ar  || '';
        const english = ayah.en || ayah.t1 || ayah.t2 || ayah.t3 || '';

        return `
          <div class="syn-verse-row" data-ref="${this._esc(ref)}" data-card-id="${this._esc(cardId)}">
            <span class="syn-verse-ref">${this._esc(ref)}</span>
            ${arabic ? `<span class="syn-verse-arabic" dir="rtl" lang="ar">${this._esc(arabic)}</span>` : ''}
            ${english ? `<span class="syn-verse-english">${this._esc(english)}</span>` : ''}
          </div>`;
      }).filter(Boolean).join('');

      if (!rowsHtml) return '';

      return `
        <div class="syn-group">
          <div class="syn-group-label">${this._esc(g.label || '')}</div>
          <div class="syn-group-verses">${rowsHtml}</div>
        </div>`;
    }).filter(Boolean).join('');

    p.innerHTML = `
      <div class="syn-header">
        <span class="syn-header-icon">🌟</span>
        <div class="syn-header-text">
          <span class="syn-header-title">${this._esc(data.theme || 'Quranic Knowledge')}</span>
          <span class="syn-header-note">All text is directly from the Quran · zero AI-generated content</span>
        </div>
      </div>
      ${groupsHtml || '<p class="syn-empty">No grouped results — see verses on the right.</p>'}`;

    p.hidden = false;

    p.onclick = (e) => {
      const row = e.target.closest('.syn-verse-row[data-card-id]');
      if (!row) return;
      const cardId = row.dataset.cardId;
      if (!cardId) return;
      const el = document.getElementById('card-' + cardId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('syn-highlight');
        setTimeout(() => el.classList.remove('syn-highlight'), 1800);
      }
    };
  },

});
