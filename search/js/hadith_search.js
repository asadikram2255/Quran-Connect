/**
 * HadithSearch — lazy-loaded client-side hadith keyword search.
 *
 * The hadith_index.json is loaded once on first search, then cached in memory.
 * Format: { books: string[], data: [serial, book_idx, reference, text][] }
 */
class HadithSearch {
  constructor() {
    this._books = null;
    this._data  = null;
    this._load  = null;   // Promise (in-flight or resolved)
    this.loaded = false;
  }

  // ── Load ──────────────────────────────────────────────────────────────────

  async ensureLoaded() {
    if (this._data) return;
    if (!this._load) {
      this._load = fetch('data/hadith_index.json')
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then(({ books, data }) => {
          this._books = books;
          this._data  = data;
          this.loaded = true;
        });
    }
    return this._load;
  }

  // ── Search ────────────────────────────────────────────────────────────────

  /**
   * @param {string[]} keywords  - English keyword tokens (from parseQuery)
   * @param {string}   bookFilter - exact book display name, or '' for all
   * @param {number}   limit      - max results to return
   * @returns {Array}  scored hadith objects
   */
  search(keywords, bookFilter = '', limit = 20) {
    if (!this._data || !this._data.length) return [];

    const ql = keywords
      .map(k => k.toLowerCase())
      .filter(k => k.length >= 3);
    if (!ql.length) return [];

    const targetBook = bookFilter
      ? this._books.indexOf(bookFilter)
      : -1;

    const results = [];

    for (let i = 0; i < this._data.length; i++) {
      const [serial, bidx, ref, text] = this._data[i];

      if (targetBook >= 0 && bidx !== targetBook) continue;

      const tl = text.toLowerCase();
      let score = 0;

      for (const kw of ql) {
        let pos = 0;
        let hits = 0;
        while ((pos = tl.indexOf(kw, pos)) !== -1) {
          hits++;
          pos += kw.length;
        }
        if (hits > 0) {
          // Partial-word boundary bonus: higher if the match starts at a word boundary
          const boundaryBonus = tl[tl.indexOf(kw) - 1] === ' '
            || tl.indexOf(kw) === 0 ? 1.4 : 1.0;
          score += hits * boundaryBonus;
        }
      }

      if (score > 0) {
        // Penalise very long hadiths slightly (they match more by chance)
        const normScore = score / Math.sqrt(text.length / 100);
        results.push({
          serial,
          book: this._books[bidx],
          ref,
          text,
          score: normScore,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  get books() { return this._books || []; }
}
