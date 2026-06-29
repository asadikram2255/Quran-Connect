/**
 * HadithSearch — lazy-loaded client-side hadith keyword search.
 *
 * The hadith_index.json is loaded once on first search, then cached in memory.
 * Format: { books: string[], data: [serial, book_idx, reference, text][] }
 *
 * Uses an inverted index (token → [rowIndex, tf]) built at load time so that
 * search is O(K × hits) instead of O(N × K) linear scan over 43,000 hadiths.
 *
 * Scoring uses standard BM25 (k1=1.5, b=0.75) so results are comparable to
 * the Quran verse ranking in search.js.
 *
 * Language note (F15): tokenization strips all non-ASCII characters, so searches
 * are English-only. Arabic or Urdu hadith text will return zero matches until a
 * separate Arabic/Urdu tokenizer path is added.
 */
class HadithSearch {
  constructor() {
    this._books  = null;
    this._data   = null;
    this._inv    = {};    // token → Map<rowIdx, tf>
    this._avgLen = 0;     // average token count per hadith (for BM25 b-normalization)
    this._lens   = null;  // Uint16Array of token counts per row
    this._load   = null;
    this.loaded  = false;
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
    // First pass: tokenize, record TF per doc and accumulate doc lengths for avgLen
    const rawLens = new Uint16Array(data.length);
    let total = 0;
    for (let i = 0; i < data.length; i++) {
      const tokens = this._tokenize(data[i][3]);
      rawLens[i] = tokens.length;
      total += tokens.length;

      const tf = {};
      for (const tok of tokens) tf[tok] = (tf[tok] || 0) + 1;
      for (const [tok, freq] of Object.entries(tf)) {
        if (!this._inv[tok]) this._inv[tok] = new Map();
        this._inv[tok].set(i, freq);
      }
    }
    this._lens   = rawLens;
    this._avgLen = total / data.length || 1;
  }

  _tokenize(text) {
    return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length >= 3);
  }

  // ── Standard BM25 score ───────────────────────────────────────────────────

  _bm25(tf, df, docLen, N, k1 = 1.5, b = 0.75) {
    const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
    return idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * docLen / this._avgLen));
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
    const N = this._data.length;
    const scores = new Map();

    for (const kw of ql) {
      const postings = this._inv[kw];
      if (!postings) continue;
      const df = postings.size;
      for (const [idx, tf] of postings) {
        if (targetBook >= 0 && this._data[idx][1] !== targetBook) continue;
        const sc = this._bm25(tf, df, this._lens[idx], N);
        scores.set(idx, (scores.get(idx) || 0) + sc);
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
