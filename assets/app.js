const els = {
  enQuery: document.getElementById("enQuery"),
  arQuery: document.getElementById("arQuery"),
  idQuery: document.getElementById("idQuery"),
  searchBtn: document.getElementById("searchBtn"),
  clearBtn: document.getElementById("clearBtn"),
  resultsList: document.getElementById("resultsList"),
  statusBadge: document.getElementById("statusBadge"),

  dAyahId: document.getElementById("dAyahId"),
  dArabic: document.getElementById("dArabic"),
  dEnglish: document.getElementById("dEnglish"),

  semQuran: document.getElementById("semQuran"),
  semHadith: document.getElementById("semHadith"),
  lexQuran: document.getElementById("lexQuran"),
  lexHadith: document.getElementById("lexHadith"),

  tabSemantic: document.getElementById("tabSemantic"),
  tabLexical: document.getElementById("tabLexical"),

  detailWrap: document.getElementById("detailWrap"),
  detailEmpty: document.getElementById("detailEmpty"),
  detailView: document.getElementById("detailView"),

  landingCard: document.getElementById("landingCard"),
  startBtn: document.getElementById("startBtn"),
  aboutBtn: document.getElementById("aboutBtn")
};

const state = {
  manifest: null,
  shardMapQuran: null,
  shardMapPairs: null,
  shardMapHadith: null,
  enTokenToAyah: null,
  enTriToTokens: null,
  arTokenToAyah: null,

  loadedSurahs: new Set(),
  loadedHadithShardFiles: new Set(),

  quranById: new Map(),
  pairsByAyah: new Map(),
  hadithById: new Map(),

  selectedAyahId: null,
  lastResults: [],

  searchCache: {
    id: new Map(),
    ar: new Map(),
    en: new Map()
  },

  // performance
  jsonCache: new Map(),
  pendingJson: new Map(),
  searchInFlight: false,
  detailToken: 0
};

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function resolveDataPath(path) {
  let p = String(path || "").trim();
  p = p.replace(/\\/g, "/");
  p = p.replace(/^\.?\//, "");
  if (!p) return p;
  if (p.startsWith("data/")) return p;
  return `data/${p}`;
}

async function fetchJson(path) {
  const finalPath = resolveDataPath(path);

  if (state.jsonCache.has(finalPath)) {
    return state.jsonCache.get(finalPath);
  }
  if (state.pendingJson.has(finalPath)) {
    return state.pendingJson.get(finalPath);
  }

  const p = (async () => {
    const res = await fetch(finalPath, { cache: "force-cache" });
    if (!res.ok) {
      let txt = "";
      try {
        txt = await res.text();
      } catch (_) {}
      throw new Error(`HTTP ${res.status} for ${finalPath}${txt ? ` | ${txt.slice(0, 120)}` : ""}`);
    }

    let data;
    try {
      data = await res.json();
    } catch (err) {
      throw new Error(`Invalid JSON at ${finalPath}: ${err.message}`);
    }

    state.jsonCache.set(finalPath, data);
    state.pendingJson.delete(finalPath);
    return data;
  })().catch(err => {
    state.pendingJson.delete(finalPath);
    throw err;
  });

  state.pendingJson.set(finalPath, p);
  return p;
}

function setBadge(kind, text) {
  els.statusBadge.className = `badge ${kind}`;
  els.statusBadge.textContent = text;
}

function unique(arr) {
  return [...new Set(arr)];
}

function surahFromAyahId(ayahId) {
  return String(ayahId).split(":")[0];
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtScore(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "—";
  return `${Math.max(0, Math.min(100, Math.round(n)))}%`;
}

function showLanding(show) {
  if (!els.landingCard) return;
  els.landingCard.style.display = show ? "" : "none";
}

function setDetailState(mode) {
  if (!els.detailWrap) return;
  els.detailWrap.dataset.state = mode;
  if (mode === "detail") {
    els.detailEmpty?.classList.add("hidden");
    els.detailView?.classList.remove("hidden");
  } else {
    els.detailEmpty?.classList.remove("hidden");
    els.detailView?.classList.add("hidden");
  }
}

function clearOtherInputs(keep) {
  if (keep !== "en") els.enQuery.value = "";
  if (keep !== "ar") els.arQuery.value = "";
  if (keep !== "id") els.idQuery.value = "";
}

function normalizeArabic(s) {
  return String(s || "")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[ؤئ]/g, "ء")
    .replace(/[^\u0600-\u06FF0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEnglish(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trigrams(token) {
  if (token.length <= 3) return [token];
  const out = [];
  for (let i = 0; i < token.length - 2; i++) out.push(token.slice(i, i + 3));
  return out;
}

function maxAllowedEdits(len) {
  if (len <= 4) return 1;
  if (len <= 8) return 2;
  return 3;
}

function stemVariantsEn(token) {
  const vars = new Set([token]);
  if (token.endsWith("ing") && token.length > 5) vars.add(token.slice(0, -3));
  if (token.endsWith("ed") && token.length > 4) vars.add(token.slice(0, -2));
  if (token.endsWith("es") && token.length > 4) vars.add(token.slice(0, -2));
  if (token.endsWith("s") && token.length > 3) vars.add(token.slice(0, -1));
  if (token.endsWith("ies") && token.length > 5) vars.add(token.slice(0, -3) + "y");
  return [...vars];
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = (ca === b.charCodeAt(j - 1)) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

async function ensureSurahLoaded(surah) {
  surah = String(surah);
  if (state.loadedSurahs.has(surah)) return;

  const qPath = state.shardMapQuran?.[surah];
  const pPath = state.shardMapPairs?.[surah];

  if (!qPath) throw new Error(`No Quran shard path found for surah ${surah}`);
  if (!pPath) throw new Error(`No pair shard path found for surah ${surah}`);

  const [qShard, pShard] = await Promise.all([
    fetchJson(qPath),
    fetchJson(pPath)
  ]);

  for (const rec of qShard) state.quranById.set(rec.ayah_id, rec);
  for (const rec of pShard) state.pairsByAyah.set(rec.ayah_id, rec);
  state.loadedSurahs.add(surah);
}

function findHadithShardFileBySerial(serial) {
  for (const x of state.shardMapHadith || []) {
    if (serial >= x.start && serial <= x.end) return x.file;
  }
  return null;
}

function hadithSerialFromId(hid) {
  const parts = String(hid).split("|");
  const s = Number(parts[parts.length - 1]);
  return Number.isFinite(s) ? s : null;
}

async function ensureHadithById(hadithId) {
  if (state.hadithById.has(hadithId)) return;

  const serial = hadithSerialFromId(hadithId);
  if (serial == null) throw new Error(`Could not parse hadith serial from id: ${hadithId}`);

  const file = findHadithShardFileBySerial(serial);
  if (!file) throw new Error(`No hadith shard file found for serial ${serial} (${hadithId})`);

  if (!state.loadedHadithShardFiles.has(file)) {
    const shard = await fetchJson(file);
    for (const rec of shard) state.hadithById.set(rec.hadith_id, rec);
    state.loadedHadithShardFiles.add(file);
  }
}

async function loadSurahsParallel(surahs) {
  const uniq = unique((surahs || []).map(String).filter(Boolean));
  if (!uniq.length) return;
  await Promise.all(uniq.map(s => ensureSurahLoaded(s)));
}

async function preloadHadithIds(ids) {
  const uniq = unique((ids || []).filter(Boolean));
  if (!uniq.length) return;
  await Promise.all(
    uniq.map(async hid => {
      try {
        await ensureHadithById(hid);
      } catch (err) {
        console.error(err);
      }
    })
  );
}

async function searchByAyahId(raw) {
  const norm = String(raw || "").trim();
  if (state.searchCache.id.has(norm)) return state.searchCache.id.get(norm);

  const m = norm.match(/^(\d+)\s*:\s*(\d+)$/);
  if (!m) return [];

  const id = `${Number(m[1])}:${Number(m[2])}`;
  await ensureSurahLoaded(surahFromAyahId(id));

  const rec = state.quranById.get(id);
  const out = rec ? [rec] : [];
  state.searchCache.id.set(norm, out);
  return out;
}

async function searchByArabicKeyword(raw) {
  const norm = normalizeArabic(raw);
  if (!norm) return [];
  if (state.searchCache.ar.has(norm)) return state.searchCache.ar.get(norm);

  const ids = state.arTokenToAyah?.[norm] || [];
  const surahs = unique(ids.map(surahFromAyahId));

  await loadSurahsParallel(surahs);

  const out = ids.map(id => state.quranById.get(id)).filter(Boolean);
  state.searchCache.ar.set(norm, out);
  return out;
}

async function searchByEnglishSmart(raw) {
  const norm = normalizeEnglish(raw);
  if (!norm) return [];
  if (state.searchCache.en.has(norm)) return state.searchCache.en.get(norm);

  const toks = norm.split(" ").filter(Boolean);
  if (!toks.length) return [];

  const matchedAyahScores = new Map();
  const matchedTokenCounts = new Map();
  let lastYield = performance.now();

  for (let ti = 0; ti < toks.length; ti++) {
    const qt = toks[ti];
    const variants = stemVariantsEn(qt);

    const candidateScores = new Map();

    for (const v of variants) {
      const grams = trigrams(v);
      for (const g of grams) {
        const c = state.enTriToTokens?.[g] || [];
        for (const t of c) {
          candidateScores.set(t, (candidateScores.get(t) || 0) + 1);
        }
      }
    }

    let candidates = Array.from(candidateScores.entries())
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].length - b[0].length;
      })
      .slice(0, 1200)
      .map(x => x[0]);

    const maxEd = maxAllowedEdits(qt.length);
    const good = [];
    let checked = 0;

    for (const t of candidates) {
      checked++;
      if (Math.abs(t.length - qt.length) > maxEd) continue;

      let bestD = 999;
      for (const v of variants) {
        const d = levenshtein(v, t);
        if (d < bestD) bestD = d;
        if (bestD === 0) break;
      }
      if (bestD <= maxEd) {
        good.push({ t, d: bestD, trigramScore: candidateScores.get(t) || 0 });
      }

      if (checked % 500 === 0) {
        const now = performance.now();
        if (now - lastYield > 10) {
          await sleep(0);
          lastYield = now;
        }
      }
    }

    good.sort((a, b) => {
      if (a.d !== b.d) return a.d - b.d;
      return (b.trigramScore || 0) - (a.trigramScore || 0);
    });

    const best = good.slice(0, 12);
    const ayatMatchedThisToken = new Set();

    for (const m of best) {
      const ids = state.enTokenToAyah?.[m.t] || [];
      const base = (maxEd - m.d + 1);
      const exactBonus = (m.d === 0 ? 2 : 0);

      for (const id of ids) {
        matchedAyahScores.set(id, (matchedAyahScores.get(id) || 0) + base + exactBonus);
        ayatMatchedThisToken.add(id);
      }
    }

    for (const id of ayatMatchedThisToken) {
      matchedTokenCounts.set(id, (matchedTokenCounts.get(id) || 0) + 1);
    }

    if (toks.length > 2) {
      setBadge("warn", `Searching… (${ti + 1}/${toks.length})`);
    }
  }

  const minMatch = Math.max(1, Math.ceil(toks.length * 0.6));
  const ranked = Array.from(matchedAyahScores.entries())
    .filter(([id]) => (matchedTokenCounts.get(id) || 0) >= minMatch)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 200)
    .map(x => x[0]);

  const surahs = unique(ranked.map(surahFromAyahId));
  await loadSurahsParallel(surahs);

  const out = ranked.map(id => state.quranById.get(id)).filter(Boolean);
  state.searchCache.en.set(norm, out);
  return out;
}

function rootsLineHtml(rec) {
  const roots = Array.isArray(rec?.roots_ordered) ? rec.roots_ordered : [];
  if (!roots.length) return `<div class="subtxt"><b>Root words:</b> —</div>`;
  return `<div class="subtxt"><b>Root words:</b> <span dir="rtl">${escapeHtml(roots.join(" • "))}</span></div>`;
}

function tokensLineHtml(rec) {
  const tokens = Array.isArray(rec?.tokens_ordered) ? rec.tokens_ordered : Array.isArray(rec?.arabic_tokens) ? rec.arabic_tokens : [];
  if (!tokens.length) return `<div class="subtxt"><b>Tokens:</b> —</div>`;
  return `<div class="subtxt"><b>Tokens:</b> <span dir="rtl">${escapeHtml(tokens.join(" • "))}</span></div>`;
}

function renderResults(list) {
  state.lastResults = list || [];
  els.resultsList.innerHTML = "";

  if (!list.length) {
    els.resultsList.classList.add("empty");
    els.resultsList.textContent = "No results found.";
    return;
  }
  els.resultsList.classList.remove("empty");

  for (const rec of list.slice(0, 60)) {
    const div = document.createElement("div");
    div.className = "item" + (state.selectedAyahId === rec.ayah_id ? " selected" : "");
    div.innerHTML = `
      <div class="id">${escapeHtml(rec.ayah_id)}</div>
      <div>
        <div class="txt" dir="rtl">${escapeHtml(rec.arabic || "")}</div>
        <div class="subtxt">${escapeHtml(rec.english || "")}</div>
        ${rootsLineHtml(rec)}
        ${tokensLineHtml(rec)}
      </div>
    `;
    div.onclick = () => openDetail(rec.ayah_id);
    els.resultsList.appendChild(div);
  }
}

function setTab(name) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  els.tabSemantic.classList.toggle("hidden", name !== "semantic");
  els.tabLexical.classList.toggle("hidden", name !== "lexical");
}

document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => setTab(btn.dataset.tab));
});

function makeSharedLine(label, values) {
  if (!values || !values.length) return `<div class="small"><b>${escapeHtml(label)}:</b> —</div>`;
  return `<div class="small"><b>${escapeHtml(label)}:</b> <span dir="rtl">${escapeHtml(values.join(" · "))}</span></div>`;
}

function renderPairList(container, items, options = {}) {
  const kind = options.kind || "quran";
  const emptyMessage = options.emptyMessage || "No items.";
  const sharedRootsLabel = options.sharedRootsLabel || "Root words";
  const sharedTokensLabel = options.sharedTokensLabel || "Shared Arabic tokens";
  const showRootsLine = Boolean(options.showRootsLine);
  const showCommonHadithTokens = Boolean(options.showCommonHadithTokens);

  container.innerHTML = "";
  if (!items || !items.length) {
    container.innerHTML = `<div class="empty">${escapeHtml(emptyMessage)}</div>`;
    return;
  }

  for (const it of items) {
    const div = document.createElement("div");
    div.className = "pair";

    let body = "";
    if (kind === "quran") {
      const rec = state.quranById.get(it.id);
      body = rec
        ? `<div dir="rtl">${escapeHtml(rec.arabic || "")}</div><div class="small">${escapeHtml(rec.english || "")}</div>`
        : `<div class="small">Loading…</div>`;
    } else {
      const h = state.hadithById.get(it.id);
      if (h) {
        body = `<div dir="rtl">${escapeHtml(h.arabic || "")}</div>`;
        if (h.english) {
          body += `<div class="small">${escapeHtml(h.english)}</div>`;
        } else {
          body += `<div class="small">${escapeHtml(h.book || "")} — ${escapeHtml(h.reference || "")}</div>`;
        }
      } else {
        body = `<div class="small">Loading…</div>`;
      }
    }

    const shared = Array.isArray(it.shared_tokens) ? it.shared_tokens : [];
    let sharedBlock = "";

    if (showRootsLine) {
      sharedBlock += makeSharedLine(sharedRootsLabel, shared);
    }

    if (showCommonHadithTokens) {
      sharedBlock += makeSharedLine(sharedTokensLabel, shared);
    }

    if (!showRootsLine && !showCommonHadithTokens) {
      if (shared.length) {
        sharedBlock += makeSharedLine(sharedTokensLabel, shared);
      }
    }

    div.innerHTML = `
      <div class="pairTop">
        <div class="pairId">${escapeHtml(it.id)}</div>
        <div class="pairScore">score: ${fmtScore(it.score)}</div>
      </div>
      <div class="pairBody">${body}</div>
      ${sharedBlock}
    `;
    container.appendChild(div);
  }
}

async function openDetail(ayahId) {
  const myToken = ++state.detailToken;
  state.selectedAyahId = ayahId;
  renderResults(state.lastResults);

  await ensureSurahLoaded(surahFromAyahId(ayahId));
  if (myToken !== state.detailToken) return;

  const rec = state.quranById.get(ayahId);
  const pairs = state.pairsByAyah.get(ayahId);
  if (!rec || !pairs) return;

  setDetailState("detail");
  els.dArabic.textContent = rec.arabic || "";
  els.dEnglish.textContent = rec.english || "";
  els.dAyahId.textContent = rec.ayah_id || "";

  const semQ = pairs.semantic?.quran_top20 || [];
  const semH = pairs.semantic?.hadith_top50 || [];
  const lexQ = pairs.lexical?.quran_all_2plus || pairs.lexical?.quran_top20 || [];
  const lexH = pairs.lexical?.hadith_top50 || [];

  renderPairList(els.semQuran, semQ, {
    kind: "quran",
    emptyMessage: "No context-matched Quran ayat passed the reranking filter.",
    sharedTokensLabel: "Shared context cues"
  });

  renderPairList(els.semHadith, semH, {
    kind: "hadith",
    emptyMessage: "No context-matched Hadith passed the stricter filter.",
    sharedTokensLabel: "Shared context cues"
  });

  renderPairList(els.lexQuran, lexQ, {
    kind: "quran",
    emptyMessage: "No Quran ayat share at least 2 root words with this ayah.",
    showRootsLine: true,
    sharedRootsLabel: "Root words"
  });

  renderPairList(els.lexHadith, lexH, {
    kind: "hadith",
    emptyMessage: "No Hadith lexical matches found.",
    showCommonHadithTokens: true,
    sharedTokensLabel: "Common Hadith Tokens"
  });

  const neededSurahs = new Set();
  for (const it of semQ) neededSurahs.add(surahFromAyahId(it.id));
  for (const it of lexQ) neededSurahs.add(surahFromAyahId(it.id));

  const quranLoadPromise = loadSurahsParallel([...neededSurahs]);

  const firstHadithIds = unique([
    ...semH.slice(0, 8).map(x => x.id),
    ...lexH.slice(0, 8).map(x => x.id)
  ]);
  const restHadithIds = unique([
    ...semH.slice(8, 15).map(x => x.id),
    ...lexH.slice(8, 15).map(x => x.id)
  ]);

  const firstHadithPromise = preloadHadithIds(firstHadithIds);

  await Promise.all([quranLoadPromise, firstHadithPromise]);
  if (myToken !== state.detailToken) return;

  renderPairList(els.semQuran, semQ, {
    kind: "quran",
    emptyMessage: "No context-matched Quran ayat passed the reranking filter.",
    sharedTokensLabel: "Shared context cues"
  });

  renderPairList(els.semHadith, semH, {
    kind: "hadith",
    emptyMessage: "No context-matched Hadith passed the stricter filter.",
    sharedTokensLabel: "Shared context cues"
  });

  renderPairList(els.lexQuran, lexQ, {
    kind: "quran",
    emptyMessage: "No Quran ayat share at least 2 root words with this ayah.",
    showRootsLine: true,
    sharedRootsLabel: "Root words"
  });

  renderPairList(els.lexHadith, lexH, {
    kind: "hadith",
    emptyMessage: "No Hadith lexical matches found.",
    showCommonHadithTokens: true,
    sharedTokensLabel: "Common Hadith Tokens"
  });

  preloadHadithIds(restHadithIds).then(() => {
    if (myToken !== state.detailToken) return;

    renderPairList(els.semHadith, semH, {
      kind: "hadith",
      emptyMessage: "No context-matched Hadith passed the stricter filter.",
      sharedTokensLabel: "Shared context cues"
    });

    renderPairList(els.lexHadith, lexH, {
      kind: "hadith",
      emptyMessage: "No Hadith lexical matches found.",
      showCommonHadithTokens: true,
      sharedTokensLabel: "Common Hadith Tokens"
    });
  });
}

function warmPreloadTopResults(results) {
  const top = (results || []).slice(0, 8);
  const surahs = unique(top.map(rec => surahFromAyahId(rec.ayah_id)));
  loadSurahsParallel(surahs).catch(err => console.error("warm preload error:", err));
}

async function runSearch() {
  if (state.searchInFlight) return;
  state.searchInFlight = true;

  try {
    const en = els.enQuery.value.trim();
    const ar = els.arQuery.value.trim();
    const id = els.idQuery.value.trim();
    const count = [en, ar, id].filter(Boolean).length;

    state.selectedAyahId = null;
    setDetailState("empty");

    if (count === 0) {
      setBadge("warn", "Enter a query first");
      renderResults([]);
      return;
    }
    if (count > 1) {
      setBadge("warn", "Please use ONE input: English OR Arabic OR Ayah ID");
      return;
    }

    setBadge("warn", "Searching…");
    await sleep(0);

    let results = [];
    if (id) results = await searchByAyahId(id);
    else if (ar) results = await searchByArabicKeyword(ar);
    else if (en) results = await searchByEnglishSmart(en);

    renderResults(results);
    warmPreloadTopResults(results);
    setBadge("ok", `Found ${results.length} ayat`);
  } catch (err) {
    console.error("runSearch error:", err);
    setBadge("err", String(err.message || err).slice(0, 140));
  } finally {
    state.searchInFlight = false;
  }
}

async function init() {
  try {
    const manifest = await fetchJson("data/meta/manifest.json");
    state.manifest = manifest;

    const [
      shardMapQuran,
      shardMapPairs,
      shardMapHadith,
      enTokenToAyah,
      enTriToTokens,
      arTokenToAyah
    ] = await Promise.all([
      fetchJson(manifest.paths.shard_map_quran),
      fetchJson(manifest.paths.shard_map_pairs),
      fetchJson(manifest.paths.shard_map_hadith),
      fetchJson(manifest.paths.english_token_to_ayahids),
      fetchJson(manifest.paths.english_trigram_to_tokens),
      fetchJson(manifest.paths.arabic_token_to_ayahids)
    ]);

    state.shardMapQuran = shardMapQuran;
    state.shardMapPairs = shardMapPairs;
    state.shardMapHadith = shardMapHadith;
    state.enTokenToAyah = enTokenToAyah;
    state.enTriToTokens = enTriToTokens;
    state.arTokenToAyah = arTokenToAyah;

    setBadge("ok", `Ready — Quran: ${manifest.counts.quran_ayat} | Hadith: ${manifest.counts.hadith}`);
    setDetailState("empty");

    if (els.startBtn) {
      els.startBtn.addEventListener("click", () => {
        showLanding(false);
        els.enQuery.scrollIntoView({ behavior: "smooth", block: "center" });
        els.enQuery.focus();
      });
    }

    if (els.aboutBtn) {
      els.aboutBtn.addEventListener("click", () => showLanding(true));
    }

    document.querySelectorAll(".exampleBtn").forEach(btn => {
      btn.addEventListener("click", () => {
        const fill = btn.dataset.fill;
        const val = btn.dataset.value || "";
        if (fill === "en") { els.enQuery.value = val; clearOtherInputs("en"); }
        if (fill === "ar") { els.arQuery.value = val; clearOtherInputs("ar"); }
        if (fill === "id") { els.idQuery.value = val; clearOtherInputs("id"); }
        showLanding(false);
        runSearch();
      });
    });

    els.enQuery.addEventListener("input", () => { if (els.enQuery.value.trim()) clearOtherInputs("en"); });
    els.arQuery.addEventListener("input", () => { if (els.arQuery.value.trim()) clearOtherInputs("ar"); });
    els.idQuery.addEventListener("input", () => { if (els.idQuery.value.trim()) clearOtherInputs("id"); });

    [els.enQuery, els.arQuery, els.idQuery].forEach(inp => {
      inp.addEventListener("keydown", e => {
        if (e.key === "Enter") {
          e.preventDefault();
          runSearch();
        }
      });
    });
  } catch (err) {
    console.error("init error:", err);
    setBadge("err", String(err.message || err).slice(0, 140));
  }
}

els.searchBtn.onclick = runSearch;
els.clearBtn.onclick = () => {
  els.enQuery.value = "";
  els.arQuery.value = "";
  els.idQuery.value = "";

  state.selectedAyahId = null;
  state.lastResults = [];
  state.detailToken++;

  renderResults([]);
  setDetailState("empty");
  setBadge("ok", "Ready");
};

init();