/**
 * root-modal.js — Root word modal panel
 * Augments QuranApp.prototype. Must be loaded AFTER app.js.
 */

Object.assign(QuranApp.prototype, {

  _openRootModal(root, label) {
    const overlay = document.getElementById('root-modal-overlay');
    const title   = document.getElementById('root-modal-title');
    const body    = document.getElementById('root-modal-body');

    const ids   = this.engine.rootIdx[root] ? [...this.engine.rootIdx[root]] : [];
    const count = ids.length;
    const en    = (label && label.en) ? label.en : '';

    title.innerHTML = `
      <span class="rm-root" dir="rtl" lang="ar">${this._esc(root)}</span>
      ${en ? `<span class="rm-en">${this._esc(en)}</span>` : ''}
      <span class="rm-count">${count} ayaat</span>`;

    body.innerHTML = '<div class="root-modal-loading">Loading…</div>';
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';

    const BATCH = 50;
    const sorted = ids.slice().sort((a, b) => a - b);

    const renderBatch = (offset) => {
      const batch = sorted.slice(offset, offset + BATCH);
      for (const id of batch) {
        const ayah = this.engine.ayaatMap[id];
        if (!ayah) continue;
        const card = this._buildCard({ ayah, score: 0, matchedRoots: [root], matchedKeywords: [], matchedPatterns: [] });
        body.appendChild(card);
      }
      const remaining = sorted.length - (offset + BATCH);
      const btn = body.querySelector('.rm-load-more');
      if (btn) btn.remove();
      if (remaining > 0) {
        const more = document.createElement('button');
        more.className = 'rm-load-more';
        more.textContent = `Load ${Math.min(remaining, BATCH)} more of ${remaining} remaining`;
        more.addEventListener('click', () => renderBatch(offset + BATCH));
        body.appendChild(more);
      }
    };

    requestAnimationFrame(() => {
      body.innerHTML = '';
      if (!sorted.length) {
        body.innerHTML = '<div class="root-modal-loading">No ayaat found.</div>';
        return;
      }
      renderBatch(0);
    });

    const onKey = e => { if (e.key === 'Escape') close(); };
    const close = () => {
      overlay.hidden = true;
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
    document.getElementById('root-modal-close').onclick = close;
    overlay.onclick = e => { if (e.target === overlay) close(); };
    document.addEventListener('keydown', onKey);
  },

});
