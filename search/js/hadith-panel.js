/**
 * hadith-panel.js — Hadith search panel
 * Augments QuranApp.prototype. Must be loaded AFTER app.js.
 */

Object.assign(QuranApp.prototype, {

  async _runHadithSearch(keywords) {
    const col  = document.getElementById('hadith-col');
    const grid = document.getElementById('hadith-grid');
    const countEl = document.getElementById('hadith-count');
    if (!col || !grid) return;

    if (!keywords || keywords.length === 0) { col.hidden = true; return; }

    grid.innerHTML = '<div class="hadith-loading"><div class="hadith-loading-spinner"></div> Searching hadith…</div>';
    col.hidden = false;

    try {
      await this.hadithSearch.ensureLoaded();
    } catch (_) {
      col.hidden = true;
      return;
    }

    const results = this.hadithSearch.search(keywords, '', 15);
    if (!results.length) { col.hidden = true; return; }

    if (countEl) countEl.textContent = `${results.length} found`;

    grid.innerHTML = results.map(h => `
      <div class="hadith-card">
        <div class="hadith-card-meta">
          <span class="hadith-collection-badge">${this._esc(h.book)}</span>
          <span class="hadith-ref">${this._esc(h.ref)}</span>
        </div>
        <p class="hadith-text">${this._esc(h.text.slice(0, 320))}${h.text.length > 320 ? '…' : ''}</p>
      </div>`
    ).join('');
  },

});
