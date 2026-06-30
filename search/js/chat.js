/**
 * chat.js — Quran-grounded multi-turn chat client
 * Augments QuranApp.prototype. Must be loaded AFTER app.js (uses this.engine, this._esc).
 */

Object.assign(QuranApp.prototype, {

  _initChat() {
    this._chatHistory = [];   // [{ role:'user'|'assistant', content, citedRefs? }]
    this._chatAbort    = null;

    const toggle   = document.getElementById('mode-toggle');
    const chatIn   = document.getElementById('chat-input');
    const chatSend = document.getElementById('chat-send-btn');
    const chatClr  = document.getElementById('chat-clear-btn');
    if (!toggle) return;

    toggle.addEventListener('click', e => {
      const btn = e.target.closest('.mode-btn');
      if (!btn) return;
      this._setMode(btn.dataset.mode);
    });

    const send = () => {
      const text = chatIn.value.trim();
      if (!text) return;
      chatIn.value = '';
      this._sendChatMessage(text);
    };
    chatSend.addEventListener('click', send);
    chatIn.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    chatClr.addEventListener('click', () => this._clearChat());
  },

  _setMode(mode) {
    this._mode = mode;
    document.querySelectorAll('.mode-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === mode));

    const isChat = mode === 'chat';
    document.getElementById('chat-layout').hidden = !isChat;
    document.getElementById('search-input').placeholder = isChat
      ? 'Switch to Search mode to browse ayaat directly'
      : 'e.g. mercy and forgiveness · taqwa · how should I treat my parents';

    const searchBoxWrapper = document.querySelector('.search-box-wrapper');
    if (searchBoxWrapper) searchBoxWrapper.hidden = isChat;
    document.getElementById('search-progress').hidden = true;

    if (isChat) {
      document.getElementById('results-layout')?.setAttribute('hidden', '');
      document.getElementById('loading-state').hidden = true;
      document.getElementById('chat-input')?.focus();
    } else {
      document.getElementById('chat-layout').hidden = true;
    }
  },

  async _sendChatMessage(text) {
    const messagesEl = document.getElementById('chat-messages');
    const emptyEl     = document.getElementById('chat-empty');
    if (emptyEl) emptyEl.hidden = true;

    this._chatHistory.push({ role: 'user', content: text });
    messagesEl.appendChild(this._buildChatBubble('user', text));

    const thinkingEl = document.createElement('div');
    thinkingEl.className = 'chat-bubble chat-assistant chat-thinking';
    thinkingEl.innerHTML = '<span class="chat-dot"></span><span class="chat-dot"></span><span class="chat-dot"></span>';
    messagesEl.appendChild(thinkingEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    if (this._chatAbort) this._chatAbort.abort();
    this._chatAbort = new AbortController();

    try {
      // Ground the question in real ayaat via the same engine used for search —
      // sync phase only (fast, no network) is enough for retrieval context.
      const { results } = await this.engine.search(text, {}, 12);
      const verses = results.slice(0, 12).map(r => ({
        ref:  `${r.ayah.sn}:${r.ayah.an}`,
        text: (r.ayah.en || r.ayah.t1 || '').slice(0, 200),
      }));

      const resp = await Promise.race([
        fetch('/api/chat', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ messages: this._chatHistory, verses }),
          signal:  this._chatAbort.signal,
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 25000)),
      ]);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      thinkingEl.remove();

      if (data.error || !data.reply) {
        const isRateLimit = data.error === 'rate_limited';
        const msg = isRateLimit
          ? '⏳ Chat is rate-limited right now — please wait a moment and try again.'
          : '⚠️ Chat is unavailable right now.';
        messagesEl.appendChild(this._buildChatBubble('assistant', msg, [], true));
        return;
      }

      this._chatHistory.push({ role: 'assistant', content: data.reply });
      messagesEl.appendChild(this._buildChatBubble('assistant', data.reply, data.citedRefs || []));
      messagesEl.scrollTop = messagesEl.scrollHeight;

    } catch (e) {
      thinkingEl.remove();
      if (e.name === 'AbortError') return;
      messagesEl.appendChild(this._buildChatBubble('assistant', `⚠️ ${e.message || 'Something went wrong.'}`, [], true));
    }
  },

  _buildChatBubble(role, text, citedRefs = [], isError = false) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble chat-${role}${isError ? ' chat-error' : ''}`;

    const textWithLinks = this._esc(text).replace(
      /\[(\d{1,3}:\d{1,3})\]/g,
      (m, ref) => `<button type="button" class="chat-ref-chip" data-ref="${ref}">${ref}</button>`
    );
    bubble.innerHTML = `<div class="chat-bubble-text">${textWithLinks}</div>`;

    bubble.querySelectorAll('.chat-ref-chip').forEach(chip => {
      chip.addEventListener('click', () => this._showChatVerse(chip.dataset.ref, bubble));
    });

    if (citedRefs.length) {
      const cardsWrap = document.createElement('div');
      cardsWrap.className = 'chat-cited-verses';
      for (const ref of citedRefs) {
        const ayah = this.engine.ayaatMap[ref];
        if (!ayah) continue;
        cardsWrap.appendChild(this._buildCard({ ayah, score: 0, matchedRoots: [], matchedKeywords: [], matchedPatterns: [] }));
      }
      if (cardsWrap.children.length) bubble.appendChild(cardsWrap);
    }

    return bubble;
  },

  _showChatVerse(ref, bubble) {
    const existing = bubble.querySelector('.chat-cited-verses');
    if (existing) { existing.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    const ayah = this.engine.ayaatMap[ref];
    if (!ayah) return;
    const wrap = document.createElement('div');
    wrap.className = 'chat-cited-verses';
    wrap.appendChild(this._buildCard({ ayah, score: 0, matchedRoots: [], matchedKeywords: [], matchedPatterns: [] }));
    bubble.appendChild(wrap);
  },

  _clearChat() {
    if (this._chatAbort) this._chatAbort.abort();
    this._chatHistory = [];
    document.getElementById('chat-messages').innerHTML = '';
    const emptyEl = document.getElementById('chat-empty');
    if (emptyEl) emptyEl.hidden = false;
  },

});
