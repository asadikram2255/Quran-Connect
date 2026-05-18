/* ============================================================
   Quran Better For Me — Motion layer
   Wraps select app.js functions to add Motion One animations.
   Loaded AFTER app.js. Vanilla ES module.
   ============================================================ */

import { animate, stagger, inView } from "https://cdn.jsdelivr.net/npm/motion@10.18.0/+esm";

// ── Reduced-motion gate ───────────────────────────────────────
const RM = window.matchMedia?.("(prefers-reduced-motion: reduce)");
const reducedMotion = () => !!(RM && RM.matches);

// Soft wrapper — no-ops when reduced motion is requested
function play(el, kf, opts) {
  if (!el || reducedMotion()) return;
  try { return animate(el, kf, opts); } catch (e) { /* swallow */ }
}

// ── Easing presets ────────────────────────────────────────────
const easeOut    = [0.16, 1, 0.3, 1];      // expo-out
const easeSpring = [0.34, 1.56, 0.64, 1];  // gentle back-out

// ── Helpers ───────────────────────────────────────────────────
function rafTwice(fn) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

function tween(from, to, ms, onUpdate, onDone) {
  if (reducedMotion()) { onUpdate(to); onDone?.(); return; }
  const start = performance.now();
  function step(now) {
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - Math.pow(1 - t, 3); // cubic ease-out
    onUpdate(from + (to - from) * eased);
    if (t < 1) requestAnimationFrame(step);
    else onDone?.();
  }
  requestAnimationFrame(step);
}

// Clear inline styles set by Motion One so they don't fight CSS :hover etc.
function cleanInline(el) {
  if (!el) return;
  el.style.opacity = "";
  el.style.transform = "";
  el.style.willChange = "";
}

// ── 1. Staggered list entrance ────────────────────────────────
function staggerIn(container, selector = ":scope > *", { duration = 0.32, delayStep = 0.025, y = 8 } = {}) {
  if (!container || reducedMotion()) return;
  const els = Array.from(container.querySelectorAll(selector));
  if (!els.length) return;
  els.forEach(el => {
    el.style.opacity = "0";
    el.style.transform = `translateY(${y}px)`;
    el.style.willChange = "opacity, transform";
  });
  rafTwice(() => {
    const anim = animate(els, {
      opacity: [0, 1],
      transform: [`translateY(${y}px)`, "translateY(0px)"]
    }, {
      duration,
      delay: stagger(delayStep),
      easing: easeOut
    });
    anim?.finished?.then(() => els.forEach(cleanInline))
                   .catch(() => els.forEach(cleanInline));
  });
}

// ── 2. Single-element entrance ────────────────────────────────
function enter(el, { y = 10, scale = 0.98, duration = 0.42 } = {}) {
  if (!el || reducedMotion()) return;
  el.style.willChange = "opacity, transform";
  const anim = play(el, {
    opacity: [0, 1],
    transform: [`translateY(${y}px) scale(${scale})`, "translateY(0) scale(1)"]
  }, { duration, easing: easeOut });
  anim?.finished?.then(() => cleanInline(el))
                 .catch(() => cleanInline(el));
}

// ── 3. Count badge tick ───────────────────────────────────────
function animateCount(el, newText) {
  if (!el) return;
  // Extract integers from "(NNN)" or "NNN"
  const re = /(\d+)/;
  const prevMatch = (el.textContent || "").match(re);
  const nextMatch = (newText || "").match(re);
  if (!prevMatch || !nextMatch || reducedMotion()) {
    el.textContent = newText;
    return;
  }
  const prev = parseInt(prevMatch[1], 10);
  const next = parseInt(nextMatch[1], 10);
  if (prev === next) { el.textContent = newText; return; }
  const wrap = newText.replace(nextMatch[1], "{N}");
  tween(prev, next, 380, v => {
    el.textContent = wrap.replace("{N}", String(Math.round(v)));
  }, () => { el.textContent = newText; });
  // gentle scale pulse
  play(el, { transform: ["scale(1)", "scale(1.12)", "scale(1)"] }, { duration: 0.45, easing: easeOut });
}

// ── 4. Wrap functions defined globally in app.js ──────────────
function wrapGlobals() {
  // 4a. renderResults — stagger items
  if (typeof window.renderResults === "function") {
    const orig = window.renderResults;
    window.renderResults = function (...args) {
      const out = orig.apply(this, args);
      const list = document.getElementById("resultsList");
      if (list && !list.classList.contains("empty")) {
        staggerIn(list, ":scope > .item", { delayStep: 0.022, y: 6 });
      }
      // Animate result count badge
      const rc = document.getElementById("resultsCount");
      // resultsCount text is set inside renderResults — we read it post-call
      if (rc) {
        const current = rc.textContent;
        // Re-apply via animateCount: stash current, blank, restore via tween
        // We need the *previous* count. Track on the element itself.
        const prev = rc.dataset.prev || "";
        if (prev !== current) {
          // Restore prev, then animate to current
          rc.textContent = prev || "";
          animateCount(rc, current);
          rc.dataset.prev = current;
        }
      }
      return out;
    };
  }

  // 4b. setDetailState — animate detailView in/out, animate anchor
  if (typeof window.setDetailState === "function") {
    const orig = window.setDetailState;
    let lastMode = null;
    window.setDetailState = function (mode) {
      const wrap = document.getElementById("detailWrap");
      const prevMode = wrap?.dataset.state;
      const out = orig.call(this, mode);
      if (mode === "detail" && prevMode !== "detail") {
        // Animate anchor card in, then pair lists
        const anchor = document.querySelector(".anchorCard");
        if (anchor) enter(anchor, { y: 12, scale: 0.985, duration: 0.45 });
        // Pair lists may not be populated yet (showSkeletonPairs runs after),
        // so observe them on next frame.
        rafTwice(() => {
          ["semQuran", "semHadith", "lexQuran", "lexHadith"].forEach(id => {
            const el = document.getElementById(id);
            if (el) staggerIn(el, ":scope > *", { delayStep: 0.03, y: 6, duration: 0.30 });
          });
        });
      }
      lastMode = mode;
      return out;
    };
  }

  // 4c. setTab — crossfade between Meaning / Word
  if (typeof window.setTab === "function") {
    const orig = window.setTab;
    window.setTab = function (name) {
      const semOld = document.getElementById("tabSemantic");
      const lexOld = document.getElementById("tabLexical");
      const out = orig.call(this, name);
      const target = name === "semantic"
        ? document.getElementById("tabSemantic")
        : document.getElementById("tabLexical");
      if (target) {
        enter(target, { y: 4, scale: 1, duration: 0.28 });
        // Stagger lists inside
        target.querySelectorAll(".pairsList").forEach(list => {
          staggerIn(list, ":scope > *", { delayStep: 0.025, y: 5, duration: 0.28 });
        });
      }
      return out;
    };
  }

  // 4d. updateTabCounts — animate sem/lex count badges
  if (typeof window.updateTabCounts === "function") {
    const orig = window.updateTabCounts;
    window.updateTabCounts = function (...args) {
      const out = orig.apply(this, args);
      const sem = document.getElementById("semCount");
      const lex = document.getElementById("lexCount");
      if (sem) {
        const cur = sem.textContent;
        const prev = sem.dataset.prev || "";
        if (prev !== cur) {
          sem.textContent = prev || "";
          animateCount(sem, cur);
          sem.dataset.prev = cur;
        }
      }
      if (lex) {
        const cur = lex.textContent;
        const prev = lex.dataset.prev || "";
        if (prev !== cur) {
          lex.textContent = prev || "";
          animateCount(lex, cur);
          lex.dataset.prev = cur;
        }
      }
      return out;
    };
  }
}

// ── 5. Modal entrance animations ──────────────────────────────
function watchModal(overlayId, panelSelector) {
  const overlay = document.getElementById(overlayId);
  if (!overlay) return;
  const panel = overlay.querySelector(panelSelector);
  if (!panel) return;

  const obs = new MutationObserver(() => {
    if (!overlay.classList.contains("hidden")) {
      enter(overlay, { y: 0, scale: 1, duration: 0.20 });
      play(panel, {
        opacity: [0, 1],
        transform: ["translateY(14px) scale(0.96)", "translateY(0) scale(1)"]
      }, { duration: 0.36, easing: easeSpring });
    }
  });
  obs.observe(overlay, { attributes: true, attributeFilter: ["class"] });
}

// ── 6. Status badge subtle pulse while "warn" (loading) ───────
function watchStatusBadge() {
  const badge = document.getElementById("statusBadge");
  if (!badge) return;
  const obs = new MutationObserver(() => {
    if (badge.classList.contains("warn")) {
      badge.style.animation = "statusPulse 1.6s ease-in-out infinite";
    } else {
      badge.style.animation = "";
    }
  });
  obs.observe(badge, { attributes: true, attributeFilter: ["class"] });
  // Initial check
  if (badge.classList.contains("warn")) {
    badge.style.animation = "statusPulse 1.6s ease-in-out infinite";
  }
}

// Inject keyframe for status pulse
const style = document.createElement("style");
style.textContent = `
  @keyframes statusPulse {
    0%, 100% { opacity: 1; }
    50%      { opacity: .55; }
  }
  @media (prefers-reduced-motion: reduce) {
    @keyframes statusPulse { 0%,100% { opacity: 1; } 50% { opacity: 1; } }
  }
`;
document.head.appendChild(style);

// ── 7. Landing card scroll-reveal of grid boxes ───────────────
function revealLandingGrid() {
  const grid = document.querySelector(".landingGrid");
  if (!grid || reducedMotion()) return;
  const boxes = grid.querySelectorAll(".landingBox");
  if (!boxes.length) return;
  boxes.forEach(b => {
    b.style.opacity = "0";
    b.style.transform = "translateY(14px)";
  });
  rafTwice(() => {
    const anim = animate(boxes, {
      opacity: [0, 1],
      transform: ["translateY(14px)", "translateY(0)"]
    }, { duration: 0.55, delay: stagger(0.08), easing: easeOut });
    anim?.finished?.then(() => boxes.forEach(cleanInline))
                   .catch(() => boxes.forEach(cleanInline));
  });
}

// ── 8. Initial header entrance ────────────────────────────────
function initialEntrance() {
  const header = document.querySelector(".header");
  if (header) enter(header, { y: 8, scale: 1, duration: 0.45 });

  // Phase 5 — mood hero entrance (daily ayah, headline, then categories)
  const hero = document.getElementById("moodHero");
  if (hero && !hero.offsetParent === false) {
    const daily = document.getElementById("dailyAyah");
    if (daily) enter(daily, { y: 18, scale: 0.99, duration: 0.7 });
    const top = hero.querySelector(".moodHeroTop");
    if (top) enter(top, { y: 18, scale: 0.985, duration: 0.65 });
    rafTwice(() => {
      const cats = hero.querySelectorAll(".moodCat");
      if (cats.length) {
        cats.forEach(c => { c.style.opacity = "0"; c.style.transform = "translateY(16px)"; });
        rafTwice(() => {
          const anim = animate(cats, {
            opacity: [0, 1],
            transform: ["translateY(16px)", "translateY(0)"]
          }, { duration: 0.55, delay: stagger(0.10), easing: easeOut });
          anim?.finished?.then(() => cats.forEach(cleanInline))
                         .catch(() => cats.forEach(cleanInline));
        });
      }
      const footer = hero.querySelector(".moodHeroFooter");
      if (footer) enter(footer, { y: 12, scale: 1, duration: 0.55 });
    });
  }

  const landing = document.getElementById("landingCard");
  if (landing && !landing.classList.contains("hidden")) {
    enter(landing, { y: 12, scale: 0.99, duration: 0.55 });
    revealLandingGrid();
  }
  const search = document.querySelector(".stickyTop");
  if (search && !document.body.classList.contains("view-mood")) {
    enter(search, { y: 10, scale: 1, duration: 0.50 });
  }
}

// ── Boot ──────────────────────────────────────────────────────
function boot() {
  wrapGlobals();
  watchModal("wordModal",     ".wordModalPanel");
  watchModal("feelingsModal", ".feelingsPanel");
  watchModal("statsModal",    ".statsPanel");
  watchModal("prophetsModal", ".prophetsPanel");
  watchStatusBadge();
  initialEntrance();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
