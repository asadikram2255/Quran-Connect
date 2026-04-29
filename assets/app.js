const SURAH_NAMES = {
  1:"Al-Fatihah",2:"Al-Baqarah",3:"Aal-Imran",4:"An-Nisa",5:"Al-Ma'idah",
  6:"Al-An'am",7:"Al-A'raf",8:"Al-Anfal",9:"At-Tawbah",10:"Yunus",
  11:"Hud",12:"Yusuf",13:"Ar-Ra'd",14:"Ibrahim",15:"Al-Hijr",
  16:"An-Nahl",17:"Al-Isra",18:"Al-Kahf",19:"Maryam",20:"Ta-Ha",
  21:"Al-Anbiya",22:"Al-Hajj",23:"Al-Mu'minun",24:"An-Nur",25:"Al-Furqan",
  26:"Ash-Shu'ara",27:"An-Naml",28:"Al-Qasas",29:"Al-Ankabut",30:"Ar-Rum",
  31:"Luqman",32:"As-Sajdah",33:"Al-Ahzab",34:"Saba",35:"Fatir",
  36:"Ya-Sin",37:"As-Saffat",38:"Sad",39:"Az-Zumar",40:"Ghafir",
  41:"Fussilat",42:"Ash-Shura",43:"Az-Zukhruf",44:"Ad-Dukhan",45:"Al-Jathiyah",
  46:"Al-Ahqaf",47:"Muhammad",48:"Al-Fath",49:"Al-Hujurat",50:"Qaf",
  51:"Adh-Dhariyat",52:"At-Tur",53:"An-Najm",54:"Al-Qamar",55:"Ar-Rahman",
  56:"Al-Waqi'ah",57:"Al-Hadid",58:"Al-Mujadila",59:"Al-Hashr",60:"Al-Mumtahanah",
  61:"As-Saf",62:"Al-Jumu'ah",63:"Al-Munafiqun",64:"At-Taghabun",65:"At-Talaq",
  66:"At-Tahrim",67:"Al-Mulk",68:"Al-Qalam",69:"Al-Haqqah",70:"Al-Ma'arij",
  71:"Nuh",72:"Al-Jinn",73:"Al-Muzzammil",74:"Al-Muddaththir",75:"Al-Qiyamah",
  76:"Al-Insan",77:"Al-Mursalat",78:"An-Naba",79:"An-Nazi'at",80:"Abasa",
  81:"At-Takwir",82:"Al-Infitar",83:"Al-Mutaffifin",84:"Al-Inshiqaq",85:"Al-Buruj",
  86:"At-Tariq",87:"Al-A'la",88:"Al-Ghashiyah",89:"Al-Fajr",90:"Al-Balad",
  91:"Ash-Shams",92:"Al-Layl",93:"Ad-Duha",94:"Ash-Sharh",95:"At-Tin",
  96:"Al-Alaq",97:"Al-Qadr",98:"Al-Bayyinah",99:"Az-Zalzalah",100:"Al-Adiyat",
  101:"Al-Qari'ah",102:"At-Takathur",103:"Al-Asr",104:"Al-Humazah",105:"Al-Fil",
  106:"Quraysh",107:"Al-Ma'un",108:"Al-Kawthar",109:"Al-Kafirun",110:"An-Nasr",
  111:"Al-Masad",112:"Al-Ikhlas",113:"Al-Falaq",114:"An-Nas"
};

const SEARCH_HINTS = {
  en: "Tip: type a concept in English and press Enter",
  ar: "Tip: type an Arabic word and press Enter",
  id: "Tip: type an ayah reference like 2:255 and press Enter"
};

const SEARCH_PLACEHOLDERS = {
  en: "e.g. patience",
  ar: "مثال: صبر",
  id: "e.g. 2:255"
};

const els = {
  mainQuery: document.getElementById("mainQuery"),
  searchBtn: document.getElementById("searchBtn"),
  clearBtn:  document.getElementById("clearBtn"),
  resultsList: document.getElementById("resultsList"),
  resultsCount: document.getElementById("resultsCount"),
  statusBadge: document.getElementById("statusBadge"),
  searchHint: document.getElementById("searchHint"),

  dAyahId:  document.getElementById("dAyahId"),
  dArabic:  document.getElementById("dArabic"),
  dEnglish: document.getElementById("dEnglish"),

  semQuran:  document.getElementById("semQuran"),
  semHadith: document.getElementById("semHadith"),
  lexQuran:  document.getElementById("lexQuran"),
  lexHadith: document.getElementById("lexHadith"),

  semCount: document.getElementById("semCount"),
  lexCount: document.getElementById("lexCount"),

  tabSemantic: document.getElementById("tabSemantic"),
  tabLexical:  document.getElementById("tabLexical"),

  detailWrap:  document.getElementById("detailWrap"),
  detailEmpty: document.getElementById("detailEmpty"),
  detailView:  document.getElementById("detailView"),

  landingCard: document.getElementById("landingCard"),
  startBtn:    document.getElementById("startBtn"),
  aboutBtn:    document.getElementById("aboutBtn"),

  fontIncBtn: document.getElementById("fontIncBtn"),
  fontDecBtn: document.getElementById("fontDecBtn"),
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

  quranById:   new Map(),
  pairsByAyah: new Map(),
  hadithById:  new Map(),

  selectedAyahId: null,
  lastResults: [],

  activeSearchType: "en",

  searchCache: { id: new Map(), ar: new Map(), en: new Map() },
  jsonCache:   new Map(),
  pendingJson: new Map(),
  searchInFlight: false,
  detailToken: 0,

  arabicFontSize: 18,
};

// ── Helpers ────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function resolveDataPath(path) {
  let p = String(path || "").trim().replace(/\\/g, "/").replace(/^\.?\//, "");
  if (!p) return p;
  return p.startsWith("data/") ? p : `data/${p}`;
}

async function fetchJson(path) {
  const fp = resolveDataPath(path);
  if (state.jsonCache.has(fp))   return state.jsonCache.get(fp);
  if (state.pendingJson.has(fp)) return state.pendingJson.get(fp);

  const p = (async () => {
    const res = await fetch(fp, { cache: "force-cache" });
    if (!res.ok) {
      let txt = "";
      try { txt = await res.text(); } catch (_) {}
      throw new Error(`HTTP ${res.status} for ${fp}${txt ? ` | ${txt.slice(0,120)}` : ""}`);
    }
    try {
      const data = await res.json();
      state.jsonCache.set(fp, data);
      state.pendingJson.delete(fp);
      return data;
    } catch (err) {
      state.pendingJson.delete(fp);
      throw new Error(`Invalid JSON at ${fp}: ${err.message}`);
    }
  })().catch(err => { state.pendingJson.delete(fp); throw err; });

  state.pendingJson.set(fp, p);
  return p;
}

function setBadge(kind, text) {
  els.statusBadge.className = `badge ${kind}`;
  els.statusBadge.textContent = text;
}

function unique(arr) { return [...new Set(arr)]; }

function surahFromAyahId(ayahId) { return String(ayahId).split(":")[0]; }

function surahName(ayahId) {
  return SURAH_NAMES[Number(surahFromAyahId(ayahId))] || "";
}

function fmtAyahId(ayahId) {
  const name = surahName(ayahId);
  return name ? `${ayahId} — ${name}` : ayahId;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function fmtScore(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "—";
  return `${Math.max(0, Math.min(100, Math.round(n)))}%`;
}

function showLanding(show) {
  if (els.landingCard) els.landingCard.style.display = show ? "" : "none";
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

function updateTabCounts(semQ, semH, lexQ, lexH) {
  const semTotal = semQ + semH;
  const lexTotal = lexQ + lexH;
  if (els.semCount) els.semCount.textContent = semTotal > 0 ? `(${semTotal})` : "";
  if (els.lexCount) els.lexCount.textContent = lexTotal > 0 ? `(${lexTotal})` : "";
}

// ── Search type toggle ──────────────────────────────────────

function setSearchType(type) {
  state.activeSearchType = type;
  document.querySelectorAll(".typeBtn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.type === type);
  });
  els.mainQuery.setAttribute("dir", type === "ar" ? "rtl" : "ltr");
  els.mainQuery.placeholder = SEARCH_PLACEHOLDERS[type] || "";
  if (els.searchHint) els.searchHint.textContent = SEARCH_HINTS[type] || "";
  els.mainQuery.focus();
}

// ── Arabic / English normalisation ─────────────────────────

function normalizeArabic(s) {
  return String(s || "")
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭ]/g, "")
    .replace(/ـ/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/[ؤئ]/g, "ء")
    .replace(/[^؀-ۿ0-9\s]/g, " ")
    .replace(/\s+/g, " ").trim();
}

function normalizeEnglish(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function trigrams(token) {
  if (token.length <= 3) return [token];
  const out = [];
  for (let i = 0; i < token.length - 2; i++) out.push(token.slice(i, i+3));
  return out;
}

function maxAllowedEdits(len) {
  if (len <= 4) return 1;
  if (len <= 8) return 2;
  return 3;
}

function stemVariantsEn(token) {
  const vars = new Set([token]);
  if (token.endsWith("ing") && token.length > 5) vars.add(token.slice(0,-3));
  if (token.endsWith("ed")  && token.length > 4) vars.add(token.slice(0,-2));
  if (token.endsWith("es")  && token.length > 4) vars.add(token.slice(0,-2));
  if (token.endsWith("s")   && token.length > 3) vars.add(token.slice(0,-1));
  if (token.endsWith("ies") && token.length > 5) vars.add(token.slice(0,-3)+"y");
  return [...vars];
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({length: n+1}, (_,i) => i);
  let curr = new Array(n+1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i-1);
    for (let j = 1; j <= n; j++) {
      const cost = ca === b.charCodeAt(j-1) ? 0 : 1;
      curr[j] = Math.min(prev[j]+1, curr[j-1]+1, prev[j-1]+cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// ── Data loading ────────────────────────────────────────────

async function ensureSurahLoaded(surah) {
  surah = String(surah);
  if (state.loadedSurahs.has(surah)) return;
  const qPath = state.shardMapQuran?.[surah];
  const pPath = state.shardMapPairs?.[surah];
  if (!qPath) throw new Error(`No Quran shard for surah ${surah}`);
  if (!pPath) throw new Error(`No pairs shard for surah ${surah}`);
  const [qShard, pShard] = await Promise.all([fetchJson(qPath), fetchJson(pPath)]);
  for (const rec of qShard) state.quranById.set(rec.ayah_id, rec);
  for (const rec of pShard) state.pairsByAyah.set(rec.ayah_id, rec);
  state.loadedSurahs.add(surah);
}

function findHadithShardFileBySerial(serial) {
  for (const x of state.shardMapHadith || [])
    if (serial >= x.start && serial <= x.end) return x.file;
  return null;
}

function hadithSerialFromId(hid) {
  const parts = String(hid).split("|");
  const s = Number(parts[parts.length-1]);
  return Number.isFinite(s) ? s : null;
}

async function ensureHadithById(hadithId) {
  if (state.hadithById.has(hadithId)) return;
  const serial = hadithSerialFromId(hadithId);
  if (serial == null) throw new Error(`Bad hadith id: ${hadithId}`);
  const file = findHadithShardFileBySerial(serial);
  if (!file) throw new Error(`No hadith shard for serial ${serial}`);
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
  await Promise.all(uniq.map(async hid => {
    try { await ensureHadithById(hid); } catch (err) { console.error(err); }
  }));
}

// ── Search ──────────────────────────────────────────────────

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
  await loadSurahsParallel(unique(ids.map(surahFromAyahId)));
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
      for (const g of trigrams(v)) {
        for (const t of (state.enTriToTokens?.[g] || []))
          candidateScores.set(t, (candidateScores.get(t) || 0) + 1);
      }
    }

    const candidates = Array.from(candidateScores.entries())
      .sort((a,b) => b[1]-a[1] || a[0].length-b[0].length)
      .slice(0, 1200).map(x => x[0]);

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
      if (bestD <= maxEd) good.push({ t, d: bestD, trigramScore: candidateScores.get(t) || 0 });
      if (checked % 500 === 0) {
        const now = performance.now();
        if (now - lastYield > 10) { await sleep(0); lastYield = now; }
      }
    }

    good.sort((a,b) => a.d-b.d || (b.trigramScore||0)-(a.trigramScore||0));
    const ayatMatchedThisToken = new Set();

    for (const m of good.slice(0, 12)) {
      const ids = state.enTokenToAyah?.[m.t] || [];
      const base = (maxEd - m.d + 1);
      const exactBonus = m.d === 0 ? 2 : 0;
      for (const id of ids) {
        matchedAyahScores.set(id, (matchedAyahScores.get(id) || 0) + base + exactBonus);
        ayatMatchedThisToken.add(id);
      }
    }
    for (const id of ayatMatchedThisToken)
      matchedTokenCounts.set(id, (matchedTokenCounts.get(id) || 0) + 1);

    if (toks.length > 2) setBadge("warn", `Searching… (${ti+1}/${toks.length})`);
  }

  const minMatch = Math.max(1, Math.ceil(toks.length * 0.6));
  const ranked = Array.from(matchedAyahScores.entries())
    .filter(([id]) => (matchedTokenCounts.get(id) || 0) >= minMatch)
    .sort((a,b) => b[1]-a[1]).slice(0, 200).map(x => x[0]);

  await loadSurahsParallel(unique(ranked.map(surahFromAyahId)));
  const out = ranked.map(id => state.quranById.get(id)).filter(Boolean);
  state.searchCache.en.set(norm, out);
  return out;
}

// ── Rendering ───────────────────────────────────────────────

function renderResults(list) {
  state.lastResults = list || [];
  els.resultsList.innerHTML = "";
  if (els.resultsCount) els.resultsCount.textContent = list.length > 0 ? `(${list.length})` : "";

  if (!list.length) {
    els.resultsList.classList.add("empty");
    els.resultsList.textContent = "No results found.";
    return;
  }
  els.resultsList.classList.remove("empty");

  for (const rec of list.slice(0, 60)) {
    const surahNum  = Number(surahFromAyahId(rec.ayah_id));
    const surahNm   = SURAH_NAMES[surahNum] || "";
    const div = document.createElement("div");
    div.className = "item" + (state.selectedAyahId === rec.ayah_id ? " selected" : "");
    div.innerHTML = `
      <div class="itemId">
        <div class="ayahNum">${escapeHtml(rec.ayah_id)}</div>
        <div class="ayahName">${escapeHtml(surahNm)}</div>
      </div>
      <div>
        <div class="txt" dir="rtl">${escapeHtml(rec.arabic || "")}</div>
        <div class="subtxt">${escapeHtml(rec.english || "")}</div>
      </div>
    `;
    div.onclick = () => openDetail(rec.ayah_id);
    els.resultsList.appendChild(div);
  }
}

function setTab(name) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  els.tabSemantic.classList.toggle("hidden", name !== "semantic");
  els.tabLexical.classList.toggle("hidden",  name !== "lexical");
}

document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => setTab(btn.dataset.tab));
});

function makeSharedChips(label, values) {
  if (!values || !values.length) return "";
  const chips = values.map(v => `<span class="rootChip" dir="rtl">${escapeHtml(v)}</span>`).join("");
  return `<div class="sharedRow"><span class="sharedLabel">${escapeHtml(label)}</span><div class="chipGroup">${chips}</div></div>`;
}

function renderPairList(container, items, options = {}) {
  const kind              = options.kind || "quran";
  const emptyMessage      = options.emptyMessage || "No items.";
  const sharedRootsLabel  = options.sharedRootsLabel  || "Shared root words";
  const sharedTokensLabel = options.sharedTokensLabel || "Shared Arabic words";
  const showRootsLine     = Boolean(options.showRootsLine);
  const showCommonHadithTokens = Boolean(options.showCommonHadithTokens);

  container.innerHTML = "";
  if (!items || !items.length) {
    container.innerHTML = `<div class="empty">${escapeHtml(emptyMessage)}</div>`;
    return;
  }

  for (const it of items) {
    const div = document.createElement("div");
    div.className = "pair";

    const isQuranPair = kind === "quran";
    if (isQuranPair) {
      div.classList.add("clickable");
      div.title = "Click to explore pairs for this ayah";
      div.addEventListener("click", () => openDetail(it.id));
    }

    const pairSurahNum  = Number(surahFromAyahId(it.id));
    const pairSurahName = isQuranPair ? (SURAH_NAMES[pairSurahNum] || "") : "";
    const idHtml = isQuranPair
      ? `<div class="pairIdBlock">
           <div class="pairNum">${escapeHtml(it.id)}</div>
           ${pairSurahName ? `<div class="pairSurah">${escapeHtml(pairSurahName)}</div>` : ""}
         </div>`
      : `<div class="pairIdBlock"><div class="pairNum">${escapeHtml(it.id)}</div></div>`;

    let body = "";
    if (isQuranPair) {
      const rec = state.quranById.get(it.id);
      body = rec
        ? `<div class="pairBody"><div dir="rtl">${escapeHtml(rec.arabic || "")}</div></div>
           <div class="pairBodySmall">${escapeHtml(rec.english || "")}</div>`
        : `<div class="pairBodySmall">Loading…</div>`;
    } else {
      const h = state.hadithById.get(it.id);
      if (h) {
        body = `<div class="pairBody"><div dir="rtl">${escapeHtml(h.arabic || "")}</div></div>`;
        if (h.english) {
          body += `<div class="pairBodySmall">${escapeHtml(h.english)}</div>`;
        } else {
          body += `<div class="pairBodySmall">${escapeHtml(h.book || "")} — ${escapeHtml(h.reference || "")}</div>`;
        }
      } else {
        body = `<div class="pairBodySmall">Loading…</div>`;
      }
    }

    const shared = Array.isArray(it.shared_tokens) ? it.shared_tokens : [];
    let sharedBlock = "";
    if (showRootsLine) {
      sharedBlock = makeSharedChips(sharedRootsLabel, shared);
    } else if (showCommonHadithTokens) {
      sharedBlock = makeSharedChips(sharedTokensLabel, shared);
    } else if (shared.length) {
      sharedBlock = makeSharedChips(sharedTokensLabel, shared);
    }

    div.innerHTML = `
      <div class="pairTop">
        ${idHtml}
        <div class="pairScore" title="Relevance score based on meaning similarity and shared Arabic roots">score: ${fmtScore(it.score)}</div>
      </div>
      ${body}
      ${sharedBlock}
    `;
    container.appendChild(div);
  }
}

// ── Open detail ─────────────────────────────────────────────

async function openDetail(ayahId) {
  const myToken = ++state.detailToken;
  state.selectedAyahId = ayahId;
  renderResults(state.lastResults);

  await ensureSurahLoaded(surahFromAyahId(ayahId));
  if (myToken !== state.detailToken) return;

  const rec   = state.quranById.get(ayahId);
  const pairs = state.pairsByAyah.get(ayahId);
  if (!rec || !pairs) return;

  setDetailState("detail");

  // Populate anchor card
  els.dAyahId.textContent  = fmtAyahId(ayahId);
  els.dArabic.textContent  = rec.arabic  || "";
  els.dEnglish.textContent = rec.english || "";

  const semQ = pairs.semantic?.quran_top20   || [];
  const semH = pairs.semantic?.hadith_top50  || [];
  const lexQ = pairs.lexical?.quran_all_2plus || pairs.lexical?.quran_top20 || [];
  const lexH = pairs.lexical?.hadith_top50   || [];

  updateTabCounts(semQ.length, semH.length, lexQ.length, lexH.length);

  renderPairList(els.semQuran, semQ, { kind:"quran",  emptyMessage:"No meaning-based Quran matches found.", sharedTokensLabel:"Shared meaning cues" });
  renderPairList(els.semHadith,semH, { kind:"hadith", emptyMessage:"No meaning-based Hadith matches found.", sharedTokensLabel:"Shared meaning cues" });
  renderPairList(els.lexQuran, lexQ, { kind:"quran",  emptyMessage:"No Quran passages share ≥2 root words with this ayah.", showRootsLine:true, sharedRootsLabel:"Shared root words" });
  renderPairList(els.lexHadith,lexH, { kind:"hadith", emptyMessage:"No word-based Hadith matches found.", showCommonHadithTokens:true, sharedTokensLabel:"Shared Arabic words" });

  const neededSurahs = new Set([
    ...semQ.map(x => surahFromAyahId(x.id)),
    ...lexQ.map(x => surahFromAyahId(x.id))
  ]);

  const firstHadithIds = unique([...semH.slice(0,8).map(x=>x.id), ...lexH.slice(0,8).map(x=>x.id)]);
  const restHadithIds  = unique([...semH.slice(8,20).map(x=>x.id),...lexH.slice(8,20).map(x=>x.id)]);

  await Promise.all([loadSurahsParallel([...neededSurahs]), preloadHadithIds(firstHadithIds)]);
  if (myToken !== state.detailToken) return;

  renderPairList(els.semQuran, semQ, { kind:"quran",  emptyMessage:"No meaning-based Quran matches found.", sharedTokensLabel:"Shared meaning cues" });
  renderPairList(els.semHadith,semH, { kind:"hadith", emptyMessage:"No meaning-based Hadith matches found.", sharedTokensLabel:"Shared meaning cues" });
  renderPairList(els.lexQuran, lexQ, { kind:"quran",  emptyMessage:"No Quran passages share ≥2 root words with this ayah.", showRootsLine:true, sharedRootsLabel:"Shared root words" });
  renderPairList(els.lexHadith,lexH, { kind:"hadith", emptyMessage:"No word-based Hadith matches found.", showCommonHadithTokens:true, sharedTokensLabel:"Shared Arabic words" });

  preloadHadithIds(restHadithIds).then(() => {
    if (myToken !== state.detailToken) return;
    renderPairList(els.semHadith,semH, { kind:"hadith", emptyMessage:"No meaning-based Hadith matches found.", sharedTokensLabel:"Shared meaning cues" });
    renderPairList(els.lexHadith,lexH, { kind:"hadith", emptyMessage:"No word-based Hadith matches found.", showCommonHadithTokens:true, sharedTokensLabel:"Shared Arabic words" });
  });
}

function warmPreloadTopResults(results) {
  const surahs = unique((results || []).slice(0,8).map(r => surahFromAyahId(r.ayah_id)));
  loadSurahsParallel(surahs).catch(err => console.error("warm preload error:", err));
}

// ── Search run ──────────────────────────────────────────────

async function runSearch() {
  if (state.searchInFlight) return;
  state.searchInFlight = true;

  try {
    const val  = els.mainQuery.value.trim();
    const type = state.activeSearchType;

    state.selectedAyahId = null;
    setDetailState("empty");
    updateTabCounts(0,0,0,0);

    if (!val) {
      setBadge("warn", "Enter a query first");
      renderResults([]);
      return;
    }

    setBadge("warn", "Searching…");
    await sleep(0);

    let results = [];
    if      (type === "id") results = await searchByAyahId(val);
    else if (type === "ar") results = await searchByArabicKeyword(val);
    else                    results = await searchByEnglishSmart(val);

    renderResults(results);
    warmPreloadTopResults(results);
    setBadge("ok", `Found ${results.length} ayat`);
  } catch (err) {
    console.error("runSearch error:", err);
    setBadge("err", String(err.message || err).slice(0,140));
  } finally {
    state.searchInFlight = false;
  }
}

// ── Buttons & key bindings ──────────────────────────────────

if (els.searchBtn) els.searchBtn.onclick = runSearch;

if (els.clearBtn) els.clearBtn.onclick = () => {
  if (els.mainQuery) els.mainQuery.value = "";
  state.selectedAyahId = null;
  state.lastResults = [];
  state.detailToken++;
  renderResults([]);
  setDetailState("empty");
  updateTabCounts(0,0,0,0);
  setBadge("ok", "Ready");
};

if (els.mainQuery) els.mainQuery.addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); runSearch(); }
});

if (els.fontIncBtn) els.fontIncBtn.onclick = () => {
  state.arabicFontSize = Math.min(30, state.arabicFontSize + 2);
  document.documentElement.style.setProperty("--arabic-font-size", state.arabicFontSize + "px");
};
if (els.fontDecBtn) els.fontDecBtn.onclick = () => {
  state.arabicFontSize = Math.max(13, state.arabicFontSize - 2);
  document.documentElement.style.setProperty("--arabic-font-size", state.arabicFontSize + "px");
};

// ── Init ────────────────────────────────────────────────────

async function init() {
  try {
    const manifest = await fetchJson("data/meta/manifest.json");
    state.manifest = manifest;

    const [shardMapQuran, shardMapPairs, shardMapHadith, enTokenToAyah, enTriToTokens, arTokenToAyah] =
      await Promise.all([
        fetchJson(manifest.paths.shard_map_quran),
        fetchJson(manifest.paths.shard_map_pairs),
        fetchJson(manifest.paths.shard_map_hadith),
        fetchJson(manifest.paths.english_token_to_ayahids),
        fetchJson(manifest.paths.english_trigram_to_tokens),
        fetchJson(manifest.paths.arabic_token_to_ayahids),
      ]);

    state.shardMapQuran   = shardMapQuran;
    state.shardMapPairs   = shardMapPairs;
    state.shardMapHadith  = shardMapHadith;
    state.enTokenToAyah   = enTokenToAyah;
    state.enTriToTokens   = enTriToTokens;
    state.arTokenToAyah   = arTokenToAyah;

    setBadge("ok", `Ready — Quran: ${manifest.counts.quran_ayat} | Hadith: ${manifest.counts.hadith}`);
    setDetailState("empty");

    // Type toggle buttons
    document.querySelectorAll(".typeBtn").forEach(btn => {
      btn.addEventListener("click", () => setSearchType(btn.dataset.type));
    });

    // Start / About buttons
    if (els.startBtn) {
      els.startBtn.addEventListener("click", () => {
        showLanding(false);
        els.mainQuery.focus();
      });
    }
    if (els.aboutBtn) {
      els.aboutBtn.addEventListener("click", () => showLanding(true));
    }

    // Example chips
    document.querySelectorAll(".exampleBtn").forEach(btn => {
      btn.addEventListener("click", () => {
        const type = btn.dataset.type;
        const val  = btn.dataset.value || "";
        setSearchType(type);
        els.mainQuery.value = val;
        showLanding(false);
        runSearch();
      });
    });

  } catch (err) {
    console.error("init error:", err);
    setBadge("err", String(err.message || err).slice(0,140));
  }
}

init();
