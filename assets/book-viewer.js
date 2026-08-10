/**
 * book-viewer.js — show a root's meaning as the page of the book it is on.
 *
 * The dictionary's text layer is corrupt at the source (vowel marks land on
 * the wrong letters, printed references come out scrambled), but the drawn
 * page is exactly what the author typeset. So a root's meaning is shown as
 * the page image, opened at the root's own headword.
 *
 * Usage:  await BookViewer.load('../');          // path back to the repo root
 *         if (BookViewer.has(root))              // the book covers this root
 *           el.appendChild(BookViewer.button(root));
 *
 * Self-contained: it injects its own overlay and styles, themed from the
 * host page's --accent / --text / --border variables, so it drops into all
 * three modules unchanged.
 */
(function () {
  "use strict";

  const VERSION = 1;               // bump when data/book_index.json changes

  let index = null;                // { first, last, printed[], roots{} }
  let loading = null;
  let base = "";                   // path back to the repo root
  let ui = null;                   // built on first open
  let current = 0;                 // page on screen
  let scale = 1;                   // book-page zoom (1 = fit width)
  const MIN_ZOOM = 1, MAX_ZOOM = 8;

  function load(basePath) {
    if (loading) return loading;
    base = basePath || "";
    loading = fetch(base + "data/book_index.json?v=" + VERSION)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { index = d; return d; })
      .catch(() => null);
    return loading;
  }

  function has(root) {
    return !!(index && index.roots && index.roots[root]);
  }

  function printedPage(page) {
    if (!index || !index.printed) return null;
    return index.printed[page - index.first] ?? null;
  }

  function pageUrl(page) {
    return base + "assets/book/p" + String(page).padStart(3, "0") + ".webp";
  }

  const CSS = `
.bookv-overlay{position:fixed;inset:0;z-index:9000;display:flex;
  align-items:center;justify-content:center;padding:clamp(8px,2vw,28px);
  background:rgba(8,5,14,.72);backdrop-filter:blur(3px)}
.bookv-overlay[hidden]{display:none}
.bookv-panel{display:flex;flex-direction:column;width:min(940px,100%);
  height:min(100%,1100px);border-radius:14px;overflow:hidden;
  background:var(--surface,var(--panel,#1b1030));
  border:1px solid var(--border,rgba(255,255,255,.14));
  box-shadow:0 24px 70px rgba(0,0,0,.5)}
.bookv-bar{display:flex;align-items:center;gap:8px;flex:0 0 auto;flex-wrap:wrap;
  padding:10px 12px;border-bottom:1px solid var(--border,rgba(255,255,255,.12))}
.bookv-title{display:flex;align-items:baseline;gap:10px;min-width:0;flex:1 1 auto}
.bookv-root{font-family:var(--font-ar-root,'Noto Naskh Arabic',serif);
  font-size:1.35rem;line-height:1.2;color:var(--accent,#f5b75e);white-space:nowrap}
.bookv-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap;
  justify-content:center;flex:0 0 auto}
.bookv-close{flex:0 0 auto;font-weight:600}
.bookv-src{font-size:.78rem;color:var(--text-sec,var(--text-muted,#9c8d7e));
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bookv-btn{flex:0 0 auto;font:inherit;font-size:.82rem;cursor:pointer;
  padding:6px 11px;border-radius:8px;color:var(--text,#faf7f2);
  background:transparent;border:1px solid var(--border,rgba(255,255,255,.18));
  transition:background .15s ease,border-color .15s ease}
.bookv-btn:hover:not(:disabled){background:var(--accent,#f5b75e);
  border-color:var(--accent,#f5b75e);color:#1a1208}
.bookv-btn:disabled{opacity:.38;cursor:default}
.bookv-page{font-size:.82rem;min-width:8.5em;text-align:center;
  color:var(--text-sec,var(--text-muted,#9c8d7e));
  font-variant-numeric:tabular-nums}
.bookv-scroll{flex:1 1 auto;overflow:auto;background:#fff;
  -webkit-overflow-scrolling:touch;touch-action:pan-x pan-y;overscroll-behavior:contain}
.bookv-stage{position:relative;width:100%;transform-origin:top left}
.bookv-img{display:block;width:100%;height:auto;
  user-select:none;-webkit-user-drag:none}
.bookv-zlabel{font-size:.78rem;min-width:3.2em;text-align:center;
  color:var(--text-sec,var(--text-muted,#9c8d7e));
  font-variant-numeric:tabular-nums}
.bookv-mark{position:absolute;left:0;right:0;pointer-events:none;
  border-top:2px solid var(--accent,#f5b75e);
  border-bottom:2px solid var(--accent,#f5b75e);
  background:linear-gradient(90deg,rgba(245,183,94,.30),rgba(245,183,94,.10));
  opacity:0;transition:opacity .5s ease}
.bookv-mark.on{opacity:1}
.bookv-hint{flex:0 0 auto;padding:7px 12px;font-size:.74rem;text-align:center;
  color:var(--text-ter,var(--text-dim,#6b5e51));
  border-top:1px solid var(--border,rgba(255,255,255,.1))}
@media (max-width:640px){
  .bookv-overlay{padding:0}
  .bookv-panel{height:100%;width:100%;border-radius:0}
  .bookv-src{display:none}
  .bookv-title{order:1;flex:1 1 auto}
  .bookv-close{order:2}
  .bookv-tools{order:3;flex-basis:100%;margin-top:2px}
  .bookv-page{min-width:0}
}
.rootdict-book{display:flex;align-items:center;gap:10px;flex-wrap:wrap;
  margin:0 0 14px}
.rootdict-book .bookv-open{font:inherit;font-size:.9rem;cursor:pointer;
  padding:9px 16px;border-radius:9px;font-weight:600;
  color:#1a1208;background:var(--accent,#f5b75e);border:1px solid transparent;
  transition:filter .15s ease,transform .15s ease}
.rootdict-book .bookv-open:hover{filter:brightness(1.08)}
.rootdict-book .bookv-open:active{transform:translateY(1px)}
.rootdict-book .bookv-where{font-size:.78rem;
  color:var(--text-sec,var(--text-muted,#9c8d7e))}`;

  let styled = false;
  function ensureStyle() {
    if (styled) return;
    styled = true;
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function build() {
    ensureStyle();

    const overlay = document.createElement("div");
    overlay.className = "bookv-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="bookv-panel" role="dialog" aria-modal="true"
           aria-label="Page from the book">
        <div class="bookv-bar">
          <div class="bookv-title">
            <span class="bookv-root" dir="rtl" lang="ar"></span>
            <span class="bookv-src">Fatuhat al-Quran</span>
          </div>
          <button class="bookv-btn bookv-close" type="button"
                  aria-label="Back">‹ Back</button>
          <div class="bookv-tools">
            <button class="bookv-btn bookv-zout" type="button"
                    aria-label="Zoom out">−</button>
            <span class="bookv-zlabel">100%</span>
            <button class="bookv-btn bookv-zin" type="button"
                    aria-label="Zoom in">+</button>
            <button class="bookv-btn bookv-prev" type="button">‹ Prev</button>
            <span class="bookv-page"></span>
            <button class="bookv-btn bookv-next" type="button">Next ›</button>
          </div>
        </div>
        <div class="bookv-scroll">
          <div class="bookv-stage">
            <img class="bookv-img" alt="" decoding="async">
            <div class="bookv-mark"></div>
          </div>
        </div>
        <div class="bookv-hint">Page of the book as printed — meanings,
          examples and the ayaat quoted for this root.
          Pinch or double-tap to zoom.</div>
      </div>`;
    document.body.appendChild(overlay);

    ui = {
      overlay,
      root:   overlay.querySelector(".bookv-root"),
      stage:  overlay.querySelector(".bookv-stage"),
      img:    overlay.querySelector(".bookv-img"),
      mark:   overlay.querySelector(".bookv-mark"),
      scroll: overlay.querySelector(".bookv-scroll"),
      label:  overlay.querySelector(".bookv-page"),
      prev:   overlay.querySelector(".bookv-prev"),
      next:   overlay.querySelector(".bookv-next"),
      zin:    overlay.querySelector(".bookv-zin"),
      zout:   overlay.querySelector(".bookv-zout"),
      zlabel: overlay.querySelector(".bookv-zlabel"),
    };
    ui.prev.addEventListener("click", () => show(current - 1, null));
    ui.next.addEventListener("click", () => show(current + 1, null));
    overlay.querySelector(".bookv-close").addEventListener("click", close);
    overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
    document.addEventListener("keydown", e => {
      if (ui.overlay.hidden) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") show(current + 1, null);   // book is RTL
      else if (e.key === "ArrowRight") show(current - 1, null);
    });
    wireZoom();
    return ui;
  }

  // ── Zoom (pinch, double-tap, buttons, ctrl+wheel) ────────────────────────
  function centre() {
    const r = ui.scroll.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  // Zoom to `next`, keeping the point under (cx,cy) — in client coords — fixed.
  // The stage width drives layout, so the scroll container gets real scrollbars
  // to pan across the enlarged page (a CSS transform would not).
  function zoomTo(next, cx, cy) {
    next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    const sc = ui.scroll, r = sc.getBoundingClientRect();
    if (cx == null) { const c = centre(); cx = c.x; cy = c.y; }
    const ratio = next / scale;
    const contentX = sc.scrollLeft + (cx - r.left);
    const contentY = sc.scrollTop + (cy - r.top);
    scale = next;
    ui.stage.style.width = (scale * 100) + "%";
    sc.scrollLeft = contentX * ratio - (cx - r.left);
    sc.scrollTop  = contentY * ratio - (cy - r.top);
    ui.zlabel.textContent = Math.round(scale * 100) + "%";
    ui.zout.disabled = scale <= MIN_ZOOM;
    ui.zin.disabled  = scale >= MAX_ZOOM;
  }

  function resetZoom() {
    scale = 1;
    ui.stage.style.width = "100%";
    ui.zlabel.textContent = "100%";
    ui.zout.disabled = true;
    ui.zin.disabled = false;
  }

  function wireZoom() {
    ui.zin.addEventListener("click", () => zoomTo(scale + 0.5, null, null));
    ui.zout.addEventListener("click", () => zoomTo(scale - 0.5, null, null));

    ui.scroll.addEventListener("wheel", e => {
      if (!e.ctrlKey) return;                 // let normal scroll through
      e.preventDefault();
      zoomTo(scale * (e.deltaY < 0 ? 1.12 : 0.89), e.clientX, e.clientY);
    }, { passive: false });

    let dist0 = 0, scale0 = 1, lastTap = 0;
    const dist = t =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = t => ({ x: (t[0].clientX + t[1].clientX) / 2,
                        y: (t[0].clientY + t[1].clientY) / 2 });

    // Begin (or re-seed) a pinch from the current two fingers.
    const beginPinch = touches => { dist0 = dist(touches) || 0; scale0 = scale; };

    ui.scroll.addEventListener("touchstart", e => {
      if (e.touches.length >= 2) beginPinch(e.touches);
    }, { passive: true });

    ui.scroll.addEventListener("touchmove", e => {
      if (e.touches.length >= 2) {
        // Some WebViews drop or coalesce the second finger's touchstart, so a
        // pinch can arrive here with dist0 still 0 and never zoom. Seed it from
        // this frame instead of ignoring the gesture — this is the fix for
        // "pinch doesn't work" on certain pages/opens.
        if (dist0 <= 0) { beginPinch(e.touches); return; }
        e.preventDefault();                   // we drive the zoom, not the page
        const m = mid(e.touches);
        zoomTo(scale0 * (dist(e.touches) / dist0), m.x, m.y);
      }
    }, { passive: false });

    const endPinch = e => {
      if (e.touches.length < 2) dist0 = 0;    // drop back to pan/tap handling
      if (e.touches.length === 0 && e.changedTouches.length === 1) {
        const now = Date.now(), t = e.changedTouches[0];
        if (now - lastTap < 300) {            // double-tap steps through zoom
          const nextScale = scale > 3.5 ? 1 : scale > 1 ? 4 : 2.5;
          zoomTo(nextScale, t.clientX, t.clientY);
          lastTap = 0;
        } else { lastTap = now; }
      }
    };
    ui.scroll.addEventListener("touchend", endPinch);
    ui.scroll.addEventListener("touchcancel", endPinch);
  }

  // `y` is where the root's headword sits, 0-1 down the page; null when we are
  // just turning pages and have nothing in particular to point at.
  function show(page, y) {
    if (!index) return;
    page = Math.min(Math.max(page, index.first), index.last);
    current = page;

    resetZoom();
    ui.img.src = pageUrl(page);
    ui.mark.classList.remove("on");
    ui.mark.style.top = ((y ?? 0) * 100) + "%";
    ui.mark.style.height = "0";

    const printed = printedPage(page);
    ui.label.textContent = printed ? "Page " + printed : "Page " + page + " (sheet)";
    ui.prev.disabled = page <= index.first;
    ui.next.disabled = page >= index.last;

    const place = () => {
      const h = ui.img.clientHeight || 1;
      if (y == null) { ui.scroll.scrollTop = 0; return; }
      // A headword band roughly one line tall, then scrolled a third of the
      // way down the viewport so the article under it is visible too.
      const band = Math.max(26, h * 0.022);
      ui.mark.style.top = (y * h - band / 2) + "px";
      ui.mark.style.height = band + "px";
      ui.mark.classList.add("on");
      ui.scroll.scrollTop = Math.max(0, y * h - ui.scroll.clientHeight / 3);
    };
    if (ui.img.complete && ui.img.naturalHeight) place();
    else ui.img.onload = place;
  }

  function open(root) {
    if (!has(root)) return false;
    if (!ui) build();
    const [page, y] = index.roots[root];
    ui.root.textContent = root;
    ui.overlay.hidden = false;
    document.body.style.overflow = "hidden";
    show(page, y);
    return true;
  }

  function close() {
    if (!ui) return;
    ui.overlay.hidden = true;
    document.body.style.overflow = "";
  }

  /** The "See Meanings" control, with the page it will open. */
  function button(root, label) {
    ensureStyle();
    const wrap = document.createElement("div");
    wrap.className = "rootdict-book";
    if (!has(root)) {
      wrap.innerHTML = '<span class="bookv-where">This root is not in the ' +
        "book's dictionary.</span>";
      return wrap;
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bookv-open";
    btn.textContent = label || "See Meanings";
    btn.addEventListener("click", () => open(root));
    const where = document.createElement("span");
    where.className = "bookv-where";
    const printed = printedPage(index.roots[root][0]);
    where.textContent = "Fatuhat al-Quran" + (printed ? " · page " + printed : "");
    wrap.appendChild(btn);
    wrap.appendChild(where);
    return wrap;
  }

  /** Where a root's article is, for callers that need the page rather than the
   *  viewer — the CSV/XLSX exporter embeds this page image in a root's sheet.
   *  Returns { page, printed, y, url } or null when the book lacks the root. */
  function pageInfo(root) {
    if (!has(root)) return null;
    const [page, y] = index.roots[root];
    return { page, printed: printedPage(page), y, url: pageUrl(page) };
  }

  window.BookViewer = { load, has, open, close, button, pageInfo, VERSION };
})();
