/**
 * HadithSearch — lazy-loaded client-side hadith keyword search.
 *
 * The hadith_index.json is loaded once on first search, then cached in memory.
 * Format: { books: string[], data: [serial, book_idx, reference, text][] }
 *
 * Uses an inverted index (token → [rowIndex, tf]) built at load time so that
 * search is O(K × hits) instead of O(N × K) linear scan over 43,000 hadiths.
 */
class HadithSearch {
  constructor() {
    this._books = null;
    this._data  = null;
    this._inv   = {};    // token → Map<rowIdx, tf>
    this._lens  = null;  // Float32Array of text lengths (for length normalisation)
    this._load  = null;
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
          this._buildIndex(data);
          this.loaded = true;
        });
    }
    return this._load;
  }

  // ── Build inverted index ──────────────────────────────────────────────────

  _buildIndex(data) {
    this._lens = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
      const text = data[i][3];
      this._lens[i] = text.length;
      const tokens = this._tokenize(text);
      const tf = {};
      for (const tok of tokens) tf[tok] = (tf[tok] || 0) + 1;
      for (const [tok, freq] of Object.entries(tf)) {
        if (!this._inv[tok]) this._inv[tok] = new Map();
        this._inv[tok].set(i, freq);
      }
    }
  }

  _tokenize(text) {
    return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length >= 3);
  }

  // ── Search ────────────────────────────────────────────────────────────────

  /**
   * @param {string[]} keywords   - English keyword tokens
   * @param {string}   bookFilter - exact book display name, or '' for all
   * @param {number}   limit      - max results to return
   * @returns {Array}  scored hadith objects
   */
  search(keywords, bookFilter = '', limit = 20) {
    if (!this._data || !this._data.length) return [];

    const ql = keywords.map(k => k.toLowerCase()).filter(k => k.length >= 3);
    if (!ql.length) return [];

    const targetBook = bookFilter ? this._books.indexOf(bookFilter) : -1;
    const scores = new Map();

    for (const kw of ql) {
      const postings = this._inv[kw];
      if (!postings) continue;
      for (const [idx, tf] of postings) {
        if (targetBook >= 0 && this._data[idx][1] !== targetBook) continue;
        // Length-normalised TF: penalise very long hadiths
        const norm = tf / Math.sqrt(this._lens[idx] / 100);
        scores.set(idx, (scores.get(idx) || 0) + norm);
      }
    }

    const results = [];
    for (const [idx, score] of scores) {
      const [serial, bidx, ref, text] = this._data[idx];
      results.push({ serial, book: this._books[bidx], ref, text, score });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  get books() { return this._books || []; }
}
