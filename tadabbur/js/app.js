/* Tadabbur — reflect on the Qur'an, one random ayah at a time.
 *
 * A reel-style vertical stream: swipe up for a new (random) ayah, swipe down to
 * revisit the previous one. Each card shows the Arabic ayah and the reader's
 * chosen translation. The intent is to reuse the muscle-memory of doomscrolling
 * — the effortless swipe, the "one more", the variable reward of not knowing
 * which ayah comes next — but return Qur'an instead of an endless social feed.
 *
 * Data:
 *   ../data/tadabbur/ayaat.json      slim per-ayah records {i,sn,an,s,sa,ar}
 *   ../data/translations/index.json  list of the app's 35 translations
 *   ../data/translations/<id>.json   chosen edition, keyed "sn:an" -> string
 * Local state (localStorage):
 *   tadabbur-translation   chosen edition id
 *   tadabbur-saved         array of "sn:an" the reader bookmarked
 *   theme                  shared light/dark key
 */
(function () {
  "use strict";

  var DATA = "../data/";
  var els = {
    deck:       document.getElementById("deck"),
    hint:       document.getElementById("hint"),
    picker:     document.getElementById("picker"),
    editionSel: document.getElementById("editionSelect"),
    pickerStart:document.getElementById("pickerStart"),
    editionBtn: document.getElementById("editionBtn"),
    themeToggle:document.getElementById("themeToggle"),
    toast:      document.getElementById("toast"),
  };

  var state = {
    ayaat: [],            // slim records
    editions: [],         // translation index
    editionId: null,
    editionMeta: null,
    trans: null,          // { "sn:an": "text" }
    history: [],          // indices into ayaat, in the order shown
    pos: -1,              // pointer into history
    bag: [],              // shuffle bag of ayah indices (no immediate repeats)
    animating: false,
    animTimer: null,
    current: null,        // current card element
  };

  // ── Boot ────────────────────────────────────────────────────────────────
  function init() {
    els.themeToggle.addEventListener("click", toggleTheme);
    els.editionBtn.addEventListener("click", function () { openPicker(); });
    els.pickerStart.addEventListener("click", onPickerStart);

    Promise.all([
      fetchJSON(DATA + "tadabbur/ayaat.json"),
      fetchJSON(DATA + "translations/index.json"),
    ]).then(function (res) {
      state.ayaat = res[0] || [];
      state.editions = (res[1] || []).filter(function (e) { return e && e.status !== "error"; });
      buildEditionOptions();
      wireGestures();

      var saved = readStr("tadabbur-translation");
      var known = saved && state.editions.some(function (e) { return e.id === saved; });
      if (known) {
        loadEdition(saved).then(start);
      } else {
        openPicker(true);
      }
    }).catch(function (err) {
      console.error("Tadabbur failed to load", err);
      els.deck.innerHTML =
        '<div class="card"><div class="card-inner"><p class="tr">' +
        'Could not load the Qur\'an data. Please refresh.</p></div></div>';
    });
  }

  // ── Data helpers ─────────────────────────────────────────────────────────
  function fetchJSON(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + " -> " + r.status);
      return r.json();
    });
  }

  function loadEdition(id) {
    var meta = state.editions.find(function (e) { return e.id === id; });
    if (!meta) return Promise.reject(new Error("unknown edition " + id));
    // Editions carry a repo-root-relative path (data/translations/x.json);
    // this module lives one level down, so resolve against ../ .
    var path = meta.path ? ("../" + meta.path) : (DATA + "translations/" + id + ".json");
    return fetchJSON(path).then(function (map) {
      state.editionId = id;
      state.editionMeta = meta;
      state.trans = map || {};
      writeStr("tadabbur-translation", id);
    });
  }

  // ── Translation picker ───────────────────────────────────────────────────
  function buildEditionOptions() {
    var byLang = {};
    state.editions.forEach(function (e) {
      (byLang[e.lang] = byLang[e.lang] || []).push(e);
    });
    var LANGS = { en: "English", ur: "اردو — Urdu" };
    var order = ["en", "ur"].concat(Object.keys(byLang).filter(function (l) { return l !== "en" && l !== "ur"; }));
    var html = "";
    order.forEach(function (lang) {
      var list = byLang[lang];
      if (!list) return;
      html += '<optgroup label="' + (LANGS[lang] || lang) + '">';
      list.forEach(function (e) {
        html += '<option value="' + e.id + '">' + escapeHtml(e.name || e.id) + "</option>";
      });
      html += "</optgroup>";
    });
    els.editionSel.innerHTML = html;
    if (state.editionId) els.editionSel.value = state.editionId;
  }

  function openPicker(firstRun) {
    if (state.editionId) els.editionSel.value = state.editionId;
    els.picker.hidden = false;
    els.picker.dataset.firstRun = firstRun ? "1" : "";
  }

  function onPickerStart() {
    var id = els.editionSel.value;
    var firstRun = els.picker.dataset.firstRun === "1";
    els.picker.hidden = true;
    loadEdition(id).then(function () {
      if (firstRun) {
        start();
      } else {
        // Re-render the current ayah with the newly chosen translation.
        if (state.current) rerenderCurrent();
      }
    });
  }

  // ── The reel ─────────────────────────────────────────────────────────────
  function start() {
    // Fresh shuffle bag and first card
    refillBag();
    goNext(true);
    maybeShowHint();
  }

  function refillBag() {
    var n = state.ayaat.length;
    state.bag = [];
    for (var i = 0; i < n; i++) state.bag.push(i);
    // Fisher–Yates
    for (var j = n - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var t = state.bag[j]; state.bag[j] = state.bag[k]; state.bag[k] = t;
    }
  }

  function nextRandomIndex() {
    if (!state.bag.length) refillBag();
    var idx = state.bag.pop();
    // Avoid showing the same ayah twice in a row across a bag refill.
    var last = state.history[state.pos];
    if (idx === last && state.bag.length) {
      var swap = state.bag.pop();
      state.bag.push(idx);
      idx = swap;
    }
    return idx;
  }

  function goNext(first) {
    if (state.animating) return;
    if (state.pos < state.history.length - 1) {
      state.pos++;                       // forward through already-seen history
    } else {
      state.history.push(nextRandomIndex());
      state.pos = state.history.length - 1;
    }
    showCard(state.ayaat[state.history[state.pos]], first ? null : "up");
  }

  function goPrev() {
    if (state.animating || state.pos <= 0) return;
    state.pos--;
    showCard(state.ayaat[state.history[state.pos]], "down");
  }

  function showCard(ayah, dir) {
    var incoming = buildCard(ayah);
    els.deck.appendChild(incoming);
    var outgoing = state.current;
    state.current = incoming;

    if (!dir) return;

    incoming.style.transform = dir === "up" ? "translateY(100%)" : "translateY(-100%)";
    // force layout so the start transform is committed before we transition
    void incoming.getBoundingClientRect().height;

    state.animating = true;
    var EASE = "transform .4s cubic-bezier(.22,.61,.36,1)";
    incoming.style.transition = EASE;
    incoming.style.transform = "translateY(0)";
    if (outgoing) {
      outgoing.style.transition = EASE;
      outgoing.style.transform = dir === "up" ? "translateY(-100%)" : "translateY(100%)";
    }
    // Clean up on a timer rather than `transitionend` — the latter is silently
    // skipped when a transition is interrupted, its element removed, or the page
    // isn't compositing, which would leave `animating` stuck and freeze the reel.
    clearTimeout(state.animTimer);
    state.animTimer = setTimeout(function () {
      if (outgoing && outgoing.parentNode) outgoing.parentNode.removeChild(outgoing);
      incoming.style.transition = "";
      state.animating = false;
    }, 440);
  }

  function rerenderCurrent() {
    var ayah = state.ayaat[state.history[state.pos]];
    var fresh = buildCard(ayah);
    if (state.current && state.current.parentNode) {
      state.current.parentNode.replaceChild(fresh, state.current);
    } else {
      els.deck.appendChild(fresh);
    }
    state.current = fresh;
  }

  function buildCard(ayah) {
    var card = document.createElement("article");
    card.className = "card";

    var inner = document.createElement("div");
    inner.className = "card-inner";

    // Reference pill
    var ref = document.createElement("div");
    ref.className = "ref";
    ref.innerHTML =
      '<span class="ref-ar">' + escapeHtml(ayah.sa) + "</span>" +
      '<span class="ref-dot">·</span>' +
      "<span>" + escapeHtml(ayah.s) + " " + ayah.sn + ":" + ayah.an + "</span>";

    // Arabic ayah
    var ar = document.createElement("div");
    ar.className = "ar";
    ar.textContent = ayah.ar;

    var rule = document.createElement("hr");
    rule.className = "rule";

    // Translation
    var key = ayah.sn + ":" + ayah.an;
    var text = state.trans ? state.trans[key] : "";
    var tr = document.createElement("p");
    tr.className = "tr" + (state.editionMeta && state.editionMeta.lang === "ur" ? " rtl" : "");
    if (text && text.trim()) {
      tr.textContent = text;
    } else {
      tr.className += " empty";
      tr.textContent = "(This edition has no translation for this ayah.)";
    }

    inner.appendChild(ref);
    inner.appendChild(ar);
    inner.appendChild(rule);
    inner.appendChild(tr);
    card.appendChild(inner);
    card.appendChild(buildActions(ayah));
    return card;
  }

  // ── Card actions: save / share / open ────────────────────────────────────
  function buildActions(ayah) {
    var key = ayah.sn + ":" + ayah.an;
    var wrap = document.createElement("div");
    wrap.className = "actions";

    var isSaved = getSaved().indexOf(key) !== -1;
    var save = actionBtn(isSaved ? "♥" : "♡", "Save", "save" + (isSaved ? " saved" : ""));
    save.addEventListener("click", function () { toggleSave(ayah, save); });

    var share = actionBtn("↗", "Share", "share");
    share.addEventListener("click", function () { shareAyah(ayah); });

    var open = document.createElement("a");
    open.className = "act";
    open.href = "../explore/#" + ayah.sn + ":" + ayah.an;
    open.title = "Open the full ayah in Explore Quran";
    open.innerHTML = '<span class="act-ico">↔</span><span class="act-lbl">Open</span>';

    wrap.appendChild(save);
    wrap.appendChild(share);
    wrap.appendChild(open);
    return wrap;
  }

  function actionBtn(icon, label, cls) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "act " + cls;
    b.innerHTML = '<span class="act-ico">' + icon + "</span><span class=\"act-lbl\">" + label + "</span>";
    return b;
  }

  function toggleSave(ayah, btn) {
    var key = ayah.sn + ":" + ayah.an;
    var saved = getSaved();
    var i = saved.indexOf(key);
    if (i === -1) { saved.push(key); btn.classList.add("saved"); btn.querySelector(".act-ico").textContent = "♥"; toast("Saved"); }
    else { saved.splice(i, 1); btn.classList.remove("saved"); btn.querySelector(".act-ico").textContent = "♡"; toast("Removed"); }
    writeJSON("tadabbur-saved", saved);
  }

  function shareAyah(ayah) {
    var key = ayah.sn + ":" + ayah.an;
    var text = state.trans && state.trans[key] ? state.trans[key] : "";
    var body = ayah.ar + "\n\n" + (text ? text + "\n\n" : "") +
      "— " + ayah.s + " " + ayah.sn + ":" + ayah.an + " · Quran Connect";
    if (navigator.share) {
      navigator.share({ title: "Quran Connect", text: body }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(body).then(function () { toast("Copied to clipboard"); },
                                              function () { toast("Could not copy"); });
    } else {
      toast("Sharing not supported");
    }
  }

  // ── Gestures: touch swipe, wheel, keyboard ───────────────────────────────
  function wireGestures() {
    var startY = 0, startX = 0, dragging = false, moved = false, innerAtStart = null;

    els.deck.addEventListener("touchstart", function (e) {
      if (state.animating || !state.current) return;
      var t = e.touches[0];
      startY = t.clientY; startX = t.clientX; dragging = true; moved = false;
      innerAtStart = state.current.querySelector(".card-inner");
    }, { passive: true });

    els.deck.addEventListener("touchmove", function (e) {
      if (!dragging) return;
      var t = e.touches[0];
      var dy = t.clientY - startY;
      var dx = t.clientX - startX;
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) moved = true;
      if (moved && edgeAllows(innerAtStart, dy) && state.current) {
        // Rubber-band the current card with the finger for a tactile feel.
        var damp = dy * 0.5;
        state.current.style.transform = "translateY(" + damp + "px)";
      }
    }, { passive: true });

    els.deck.addEventListener("touchend", function (e) {
      if (!dragging) return;
      dragging = false;
      if (!moved) return;
      var dy = e.changedTouches[0].clientY - startY;
      var THRESH = 70;
      if (state.current) state.current.style.transform = "";
      if (dy < -THRESH && edgeAllows(innerAtStart, dy)) goNext();
      else if (dy > THRESH && edgeAllows(innerAtStart, dy)) goPrev();
    });

    // Desktop wheel — navigate only when the card can't scroll further.
    var wheelLock = false;
    els.deck.addEventListener("wheel", function (e) {
      if (state.animating || wheelLock || !state.current) return;
      var inner = state.current.querySelector(".card-inner");
      if (!edgeAllows(inner, -e.deltaY)) return;   // let the card scroll instead
      if (Math.abs(e.deltaY) < 12) return;
      wheelLock = true;
      setTimeout(function () { wheelLock = false; }, 520);
      if (e.deltaY > 0) goNext(); else goPrev();
    }, { passive: true });

    document.addEventListener("keydown", function (e) {
      if (!els.picker.hidden) return;
      if (e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); goPrev(); }
      else if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); goNext(); }
    });
  }

  // Is the inner scroller at the edge in the direction of the swipe, so that a
  // navigation (rather than a content scroll) is the right response?
  //   dy < 0  → swiping up / wheel down → need to be at the BOTTOM
  //   dy > 0  → swiping down / wheel up → need to be at the TOP
  function edgeAllows(inner, dy) {
    if (!inner) return true;
    var scrollable = inner.scrollHeight - inner.clientHeight > 4;
    if (!scrollable) return true;
    if (dy < 0) return inner.scrollTop + inner.clientHeight >= inner.scrollHeight - 4;
    return inner.scrollTop <= 4;
  }

  // ── Small bits ───────────────────────────────────────────────────────────
  function maybeShowHint() {
    if (readStr("tadabbur-hint-seen")) return;
    els.hint.hidden = false;
    setTimeout(function () { els.hint.hidden = true; writeStr("tadabbur-hint-seen", "1"); }, 4200);
  }

  var toastTimer = null;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    requestAnimationFrame(function () { els.toast.classList.add("show"); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toast.classList.remove("show");
      setTimeout(function () { els.toast.hidden = true; }, 220);
    }, 1500);
  }

  function toggleTheme() {
    var dark = document.documentElement.getAttribute("data-theme") === "dark";
    if (dark) { document.documentElement.removeAttribute("data-theme"); writeStr("theme", "light"); }
    else { document.documentElement.setAttribute("data-theme", "dark"); writeStr("theme", "dark"); }
  }

  // storage + escaping helpers
  function getSaved() { return readJSON("tadabbur-saved", []); }
  function readStr(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function writeStr(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function readJSON(k, fb) { try { var v = JSON.parse(localStorage.getItem(k)); return Array.isArray(v) ? v : fb; } catch (e) { return fb; } }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function escapeHtml(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
