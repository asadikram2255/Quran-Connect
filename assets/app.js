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
  }
};

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

async function fetchJson(path){
  const res = await fetch(path);
  if(!res.ok) throw new Error(`Failed to fetch ${path}`);
  return res.json();
}

function setBadge(kind, text){
  els.statusBadge.className = `badge ${kind}`;
  els.statusBadge.textContent = text;
}

function unique(arr){
  return [...new Set(arr)];
}

function surahFromAyahId(ayahId){
  return String(ayahId).split(":")[0];
}

function escapeHtml(s){
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtScore(x){
  const n = Number(x);
  if(!Number.isFinite(n)) return "—";
  return `${Math.max(0, Math.min(100, Math.round(n)))}%`;
}

function showLanding(show){
  if(!els.landingCard) return;
  els.landingCard.style.display = show ? "" : "none";
}

function setDetailState(mode){
  if(!els.detailWrap) return;
  els.detailWrap.dataset.state = mode;
  if (mode === "detail") {
    els.detailEmpty?.classList.add("hidden");
    els.detailView?.classList.remove("hidden");
  } else {
    els.detailEmpty?.classList.remove("hidden");
    els.detailView?.classList.add("hidden");
  }
}

function clearOtherInputs(keep){
  if(keep !== "en") els.enQuery.value = "";
  if(keep !== "ar") els.arQuery.value = "";
  if(keep !== "id") els.idQuery.value = "";
}

function normalizeArabic(s){
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

function normalizeEnglish(s){
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trigrams(token){
  if(token.length <= 3) return [token];
  const out = [];
  for(let i = 0; i < token.length - 2; i++) out.push(token.slice(i, i + 3));
  return out;
}

function maxAllowedEdits(len){
  if(len <= 4) return 1;
  if(len <= 8) return 2;
  return 3;
}

function stemVariantsEn(token){
  const vars = new Set([token]);
  if(token.endsWith("ing") && token.length > 5) vars.add(token.slice(0, -3));
  if(token.endsWith("ed") && token.length > 4) vars.add(token.slice(0, -2));
  if(token.endsWith("es") && token.length > 4) vars.add(token.slice(0, -2));
  if(token.endsWith("s") && token.length > 3) vars.add(token.slice(0, -1));
  if(token.endsWith("ies") && token.length > 5) vars.add(token.slice(0, -3) + "y");
  return [...vars];
}

function levenshtein(a, b){
  if(a === b) return 0;
  const m = a.length, n = b.length;
  if(m === 0) return n;
  if(n === 0) return m;

  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for(let j = 0; j <= n; j++) prev[j] = j;

  for(let i = 1; i <= m; i++){
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for(let j = 1; j <= n; j++){
      const cost = (ca === b.charCodeAt(j - 1)) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

async function ensureSurahLoaded(surah){
  surah = String(surah);
  if(state.loadedSurahs.has(surah)) return;

  const qPath = state.shardMapQuran[surah];
  const pPath = state.shardMapPairs[surah];
  if(!qPath || !pPath) return;

  const qShard = await fetchJson(qPath);
  const pShard = await fetchJson(pPath);

  for(const rec of qShard) state.quranById.set(rec.ayah_id, rec);
  for(const rec of pShard) state.pairsByAyah.set(rec.ayah_id, rec);
  state.loadedSurahs.add(surah);
}

function findHadithShardFileBySerial(serial){
  for(const x of state.shardMapHadith){
    if(serial >= x.start && serial <= x.end) return x.file;
  }
  return null;
}

function hadithSerialFromId(hid){
  const parts = String(hid).split("|");
  const s = Number(parts[parts.length - 1]);
  return Number.isFinite(s) ? s : null;
}

async function ensureHadithById(hadithId){
  if(state.hadithById.has(hadithId)) return;
  const serial = hadithSerialFromId(hadithId);
  if(serial == null) return;

  const file = findHadithShardFileBySerial(serial);
  if(!file) return;

  if(!state.loadedHadithShardFiles.has(file)){
    const shard = await fetchJson(file);
    for(const rec of shard) state.hadithById.set(rec.hadith_id, rec);
    state.loadedHadithShardFiles.add(file);
  }
}

async function searchByAyahId(raw){
  const norm = String(raw || "").trim();
  if(state.searchCache.id.has(norm)) return state.searchCache.id.get(norm);

  const m = norm.match(/^(\d+)\s*:\s*(\d+)$/);
  if(!m) return [];

  const id = `${Number(m[1])}:${Number(m[2])}`;
  await ensureSurahLoaded(surahFromAyahId(id));
  const rec = state.quranById.get(id);
  const out = rec ? [rec] : [];
  state.searchCache.id.set(norm, out);
  return out;
}

async function searchByArabicKeyword(raw){
  const norm = normalizeArabic(raw);
  if(!norm) return [];
  if(state.searchCache.ar.has(norm)) return state.searchCache.ar.get(norm);

  const ids = state.arTokenToAyah[norm] || [];
  const surahs = unique(ids.map(surahFromAyahId));
  for(const s of surahs) await ensureSurahLoaded(s);

  const out = ids.map(id => state.quranById.get(id)).filter(Boolean);
  state.searchCache.ar.set(norm, out);
  return out;
}

async function searchByEnglishSmart(raw){
  const norm = normalizeEnglish(raw);
  if(!norm) return [];
  if(state.searchCache.en.has(norm)) return state.searchCache.en.get(norm);

  const toks = norm.split(" ").filter(Boolean);
  if(!toks.length) return [];

  const matchedAyahScores = new Map();
  const matchedTokenCounts = new Map();
  let lastYield = performance.now();

  for(let ti = 0; ti < toks.length; ti++){
    const qt = toks[ti];
    const variants = stemVariantsEn(qt);

    const candidates = new Set();
    for(const v of variants){
      const grams = trigrams(v);
      for(const g of grams){
        const c = state.enTriToTokens[g] || [];
        for(const t of c) candidates.add(t);
      }
    }

    const maxEd = maxAllowedEdits(qt.length);
    const good = [];
    let checked = 0;

    for(const t of candidates){
      checked++;
      if(Math.abs(t.length - qt.length) > maxEd) continue;

      let bestD = 999;
      for(const v of variants){
        const d = levenshtein(v, t);
        if(d < bestD) bestD = d;
        if(bestD === 0) break;
      }
      if(bestD <= maxEd) good.push({ t, d: bestD });

      if(checked % 800 === 0){
        const now = performance.now();
        if(now - lastYield > 10){
          await sleep(0);
          lastYield = now;
        }
      }
    }

    good.sort((a, b) => a.d - b.d);
    const best = good.slice(0, 12);
    const ayatMatchedThisToken = new Set();

    for(const m of best){
      const ids = state.enTokenToAyah[m.t] || [];
      const base = (maxEd - m.d + 1);
      const exactBonus = (m.d === 0 ? 2 : 0);

      for(const id of ids){
        matchedAyahScores.set(id, (matchedAyahScores.get(id) || 0) + base + exactBonus);
        ayatMatchedThisToken.add(id);
      }
    }

    for(const id of ayatMatchedThisToken){
      matchedTokenCounts.set(id, (matchedTokenCounts.get(id) || 0) + 1);
    }

    if(toks.length > 2) setBadge("warn", `Searching… (${ti + 1}/${toks.length})`);
  }

  const minMatch = Math.max(1, Math.ceil(toks.length * 0.6));
  const ranked = Array.from(matchedAyahScores.entries())
    .filter(([id]) => (matchedTokenCounts.get(id) || 0) >= minMatch)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 200)
    .map(x => x[0]);

  const surahs = unique(ranked.map(surahFromAyahId));
  for(const s of surahs) await ensureSurahLoaded(s);

  const out = ranked.map(id => state.quranById.get(id)).filter(Boolean);
  state.searchCache.en.set(norm, out);
  return out;
}

function rootsLineHtml(rec){
  const roots = Array.isArray(rec?.roots_ordered) ? rec.roots_ordered : [];
  if(!roots.length) return `<div class="subtxt"><b>Root words:</b> —</div>`;
  return `<div class="subtxt"><b>Root words:</b> <span dir="rtl">${escapeHtml(roots.join(" • "))}</span></div>`;
}

function renderResults(list){
  state.lastResults = list || [];
  els.resultsList.innerHTML = "";

  if(!list.length){
    els.resultsList.classList.add("empty");
    els.resultsList.textContent = "No results found.";
    return;
  }
  els.resultsList.classList.remove("empty");

  for(const rec of list.slice(0, 60)){
    const div = document.createElement("div");
    div.className = "item" + (state.selectedAyahId === rec.ayah_id ? " selected" : "");
    div.innerHTML = `
      <div class="id">${escapeHtml(rec.ayah_id)}</div>
      <div>
        <div class="txt" dir="rtl">${escapeHtml(rec.arabic || "")}</div>
        <div class="subtxt">${escapeHtml(rec.english || "")}</div>
        ${rootsLineHtml(rec)}
      </div>
    `;
    div.onclick = () => openDetail(rec.ayah_id);
    els.resultsList.appendChild(div);
  }
}

function setTab(name){
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  els.tabSemantic.classList.toggle("hidden", name !== "semantic");
  els.tabLexical.classList.toggle("hidden", name !== "lexical");
}

document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => setTab(btn.dataset.tab));
});

function makeSharedLine(label, values){
  if(!values || !values.length) return `<div class="small"><b>${escapeHtml(label)}:</b> —</div>`;
  return `<div class="small"><b>${escapeHtml(label)}:</b> <span dir="rtl">${escapeHtml(values.join(" · "))}</span></div>`;
}

function renderPairList(container, items, options = {}){
  const kind = options.kind || "quran";
  const emptyMessage = options.emptyMessage || "No items.";
  const sharedRootsLabel = options.sharedRootsLabel || "Shared roots";
  const sharedTokensLabel = options.sharedTokensLabel || "Shared Arabic tokens";
  const showRootsLine = Boolean(options.showRootsLine);
  const showHadithTokens = Boolean(options.showHadithTokens);

  container.innerHTML = "";
  if(!items || !items.length){
    container.innerHTML = `<div class="empty">${escapeHtml(emptyMessage)}</div>`;
    return;
  }

  for(const it of items){
    const div = document.createElement("div");
    div.className = "pair";

    let body = "";
    if(kind === "quran"){
      const rec = state.quranById.get(it.id);
      body = rec
        ? `<div dir="rtl">${escapeHtml(rec.arabic || "")}</div><div class="small">${escapeHtml(rec.english || "")}</div>`
        : `<div class="small">Loading…</div>`;
    } else {
      const h = state.hadithById.get(it.id);
      if(h){
        body = `<div dir="rtl">${escapeHtml(h.arabic || "")}</div>`;
        if(h.english){
          body += `<div class="small">${escapeHtml(h.english)}</div>`;
        } else {
          body += `<div class="small">${escapeHtml(h.book || "")} — ${escapeHtml(h.reference || "")}</div>`;
        }
      } else {
        body = `<div class="small">Loading…</div>`;
      }
    }

    let sharedBlock = "";
    if(showRootsLine){
      const shared = Array.isArray(it.shared_tokens) ? it.shared_tokens : [];
      sharedBlock += makeSharedLine(sharedRootsLabel, shared);
    }
    if(showHadithTokens){
      const hadithTokens = Array.isArray(it.shared_tokens) ? it.shared_tokens : [];
      sharedBlock += makeSharedLine(sharedTokensLabel, hadithTokens);
    }
    if(!showRootsLine && !showHadithTokens){
      const shared = Array.isArray(it.shared_tokens) ? it.shared_tokens : [];
      if(shared.length){
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

async function openDetail(ayahId){
  state.selectedAyahId = ayahId;
  renderResults(state.lastResults);

  await ensureSurahLoaded(surahFromAyahId(ayahId));

  const rec = state.quranById.get(ayahId);
  const pairs = state.pairsByAyah.get(ayahId);
  if(!rec || !pairs) return;

  setDetailState("detail");
  els.dArabic.textContent = rec.arabic || "";
  els.dEnglish.textContent = rec.english || "";
  els.dAyahId.textContent = rec.ayah_id || "";

  const semQ = pairs.semantic?.quran_top20 || [];
  const semH = pairs.semantic?.hadith_top50 || [];
  const lexQ = pairs.lexical?.quran_all_2plus || pairs.lexical?.quran_top20 || [];
  const lexH = pairs.lexical?.hadith_top50 || [];

  const neededSurahs = new Set();
  for(const it of semQ) neededSurahs.add(surahFromAyahId(it.id));
  for(const it of lexQ) neededSurahs.add(surahFromAyahId(it.id));
  for(const s of neededSurahs) await ensureSurahLoaded(s);

  const preloadHadithIds = new Set([
    ...semH.slice(0, 15).map(x => x.id),
    ...lexH.slice(0, 15).map(x => x.id)
  ]);
  for(const hid of preloadHadithIds) await ensureHadithById(hid);

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
    showRootsLine: true,
    sharedRootsLabel: "Root words",
    showHadithTokens: true,
    sharedTokensLabel: "Hadith tokens"
  });

  setTimeout(async () => {
    const allHadithIds = new Set([...semH.map(x => x.id), ...lexH.map(x => x.id)]);
    for(const hid of allHadithIds) await ensureHadithById(hid);

    renderPairList(els.semHadith, semH, {
      kind: "hadith",
      emptyMessage: "No context-matched Hadith passed the stricter filter.",
      sharedTokensLabel: "Shared context cues"
    });

    renderPairList(els.lexHadith, lexH, {
      kind: "hadith",
      emptyMessage: "No Hadith lexical matches found.",
      showRootsLine: true,
      sharedRootsLabel: "Root words",
      showHadithTokens: true,
      sharedTokensLabel: "Hadith tokens"
    });
  }, 0);
}

async function runSearch(){
  const en = els.enQuery.value.trim();
  const ar = els.arQuery.value.trim();
  const id = els.idQuery.value.trim();
  const count = [en, ar, id].filter(Boolean).length;

  state.selectedAyahId = null;
  setDetailState("empty");

  if(count === 0){
    setBadge("warn", "Enter a query first");
    renderResults([]);
    return;
  }
  if(count > 1){
    setBadge("warn", "Please use ONE input: English OR Arabic OR Ayah ID");
    return;
  }

  try{
    setBadge("warn", "Searching…");
    await sleep(0);

    let results = [];
    if(id) results = await searchByAyahId(id);
    else if(ar) results = await searchByArabicKeyword(ar);
    else if(en) results = await searchByEnglishSmart(en);

    renderResults(results);
    setBadge("ok", `Found ${results.length} ayat`);
  } catch(err){
    console.error(err);
    setBadge("err", "Search failed");
  }
}

async function init(){
  try{
    const manifest = await fetchJson("data/meta/manifest.json");
    state.manifest = manifest;

    state.shardMapQuran = await fetchJson(manifest.paths.shard_map_quran);
    state.shardMapPairs = await fetchJson(manifest.paths.shard_map_pairs);
    state.shardMapHadith = await fetchJson(manifest.paths.shard_map_hadith);
    state.enTokenToAyah = await fetchJson(manifest.paths.english_token_to_ayahids);
    state.enTriToTokens = await fetchJson(manifest.paths.english_trigram_to_tokens);
    state.arTokenToAyah = await fetchJson(manifest.paths.arabic_token_to_ayahids);

    setBadge("ok", `Ready — Quran: ${manifest.counts.quran_ayat} | Hadith: ${manifest.counts.hadith}`);
    setDetailState("empty");

    if(els.startBtn){
      els.startBtn.addEventListener("click", () => {
        showLanding(false);
        els.enQuery.scrollIntoView({ behavior: "smooth", block: "center" });
        els.enQuery.focus();
      });
    }

    if(els.aboutBtn){
      els.aboutBtn.addEventListener("click", () => showLanding(true));
    }

    document.querySelectorAll(".exampleBtn").forEach(btn => {
      btn.addEventListener("click", () => {
        const fill = btn.dataset.fill;
        const val = btn.dataset.value || "";
        if(fill === "en"){ els.enQuery.value = val; clearOtherInputs("en"); }
        if(fill === "ar"){ els.arQuery.value = val; clearOtherInputs("ar"); }
        if(fill === "id"){ els.idQuery.value = val; clearOtherInputs("id"); }
        showLanding(false);
        runSearch();
      });
    });

    els.enQuery.addEventListener("input", () => { if(els.enQuery.value.trim()) clearOtherInputs("en"); });
    els.arQuery.addEventListener("input", () => { if(els.arQuery.value.trim()) clearOtherInputs("ar"); });
    els.idQuery.addEventListener("input", () => { if(els.idQuery.value.trim()) clearOtherInputs("id"); });

    [els.enQuery, els.arQuery, els.idQuery].forEach(inp => {
      inp.addEventListener("keydown", e => {
        if(e.key === "Enter"){
          e.preventDefault();
          runSearch();
        }
      });
    });
  } catch(err){
    console.error(err);
    setBadge("err", "Failed to load required JSON files");
  }
}

els.searchBtn.onclick = runSearch;
els.clearBtn.onclick = () => {
  els.enQuery.value = "";
  els.arQuery.value = "";
  els.idQuery.value = "";

  state.selectedAyahId = null;
  state.lastResults = [];

  renderResults([]);
  setDetailState("empty");
  setBadge("ok", "Ready");
};

init();