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
  dRoots:   document.getElementById("dRoots"),
  dTokens:  document.getElementById("dTokens"),
  wordsToggleBtn:   document.getElementById("wordsToggleBtn"),
  anchorWordsPanel: document.getElementById("anchorWordsPanel"),

  wordModal:      document.getElementById("wordModal"),
  wordModalTitle: document.getElementById("wordModalTitle"),
  wordModalSub:   document.getElementById("wordModalSub"),
  wordModalBody:  document.getElementById("wordModalBody"),
  wordModalClose: document.getElementById("wordModalClose"),

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
  engFontIncBtn: document.getElementById("engFontIncBtn"),
  engFontDecBtn: document.getElementById("engFontDecBtn"),
  transSel: document.getElementById("transSel"),

  feelingsBtn:        document.getElementById("feelingsBtn"),
  feelingsModal:      document.getElementById("feelingsModal"),
  feelingsModalClose: document.getElementById("feelingsModalClose"),
  feelingsBody:       document.getElementById("feelingsBody"),
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
  englishFontSize: 13,

  rootToAyahIds: null,

  // Translation system
  activeTranslation: "en_default",
  translationData: new Map(),       // id → {ayah_id: text}
  urHadithShardMap: null,
  urHadithShardCache: new Map(),    // file → {serial: text}
};

// ── Translation options ────────────────────────────────────

const TRANSLATION_OPTIONS = [
  { id: "en_default",   name: "English (Default)",       lang: "en" },
  { id: "en_sahih",     name: "Sahih International",     lang: "en", path: "data/translations/en_sahih.json" },
  { id: "en_yusuf_ali", name: "Yusuf Ali",               lang: "en", path: "data/translations/en_yusuf_ali.json" },
  { id: "ur_maududi",   name: "مودودی (تفہیم)",          lang: "ur", path: "data/translations/ur_maududi.json" },
  { id: "ur_junagarhi", name: "جونا گڑھی",              lang: "ur", path: "data/translations/ur_junagarhi.json" },
  { id: "ur_jalandhri", name: "جالندھری",               lang: "ur", path: "data/translations/ur_jalandhri.json" },
  { id: "ur_ahmedali",  name: "احمد علی",               lang: "ur", path: "data/translations/ur_ahmedali.json" },
];

// ── "What Am I Feeling" — Topic data ──────────────────────

const TOPIC_CATEGORIES = [
  {
    label: "💚 Heart & Emotions",
    topics: [
      "Anxiety & Fear", "Patience (Sabr)", "Hope", "Gratitude (Shukr)",
      "Happiness & Contentment", "Grief & Loss", "Controlling Anger", "Not Giving Up"
    ]
  },
  {
    label: "🤲 Connection with Allah",
    topics: [
      "Trust in Allah (Tawakkul)", "Remembrance of Allah (Dhikr)", "Supplication (Dua)",
      "Repentance (Tawbah)", "Seeking Forgiveness", "Allah's Mercy", "Guidance", "Taqwa"
    ]
  },
  {
    label: "🕌 Acts of Worship",
    topics: [
      "Prayer (Salah)", "Fasting (Sawm)", "Charity (Sadaqah)", "Zakat",
      "Hajj & Pilgrimage", "The Quran"
    ]
  },
  {
    label: "✨ Character & Ethics",
    topics: [
      "Justice (Adl)", "Honesty & Truthfulness", "Kindness to Others",
      "Humility", "Wisdom", "Forgiving Others", "Arrogance & Pride",
      "Respecting Others", "Lying & Deception"
    ]
  },
  {
    label: "👨‍👩‍👧 Family & Society",
    topics: [
      "Marriage & Love", "Parents & Mothers", "Family & Kinship",
      "Brotherhood & Unity", "Helping Others", "Good Deeds"
    ]
  },
  {
    label: "🌍 Life & the World",
    topics: [
      "Death & Afterlife", "Day of Judgement", "Jannah (Paradise)",
      "Nature & Creation", "Wealth & Provision", "Health & Body",
      "Difficulties & Trials", "Knowledge & Learning"
    ]
  },
  {
    label: "⚖️ Islamic Law & Society",
    topics: [
      "Hijab & Modesty", "Halal (Permissible)", "Haram (Forbidden)",
      "Alcohol & Intoxicants", "Peace", "Dawah (Calling to Islam)",
      "Compulsion in Religion"
    ]
  },
  {
    label: "🌟 Theology & Belief",
    topics: [
      "Prophets & Messengers", "Angels", "Shaitan (Satan)",
      "Shirk (Polytheism)", "Disbelievers", "People of the Book"
    ]
  }
];

const TOPIC_VERSES = {
  "Anxiety & Fear":            ["2:38","2:112","2:277","3:170","3:173","4:147","6:48","10:62","10:63","41:30","58:22","65:3"],
  "Patience (Sabr)":           ["2:45","2:153","2:155","2:156","2:157","2:177","3:120","3:200","8:46","16:96","16:126","39:10","70:5","103:3"],
  "Hope":                      ["3:139","12:87","15:56","39:53","47:35","65:3","93:5","94:5","94:6"],
  "Gratitude (Shukr)":         ["2:152","2:172","14:7","16:18","27:40","31:12","34:13","54:35"],
  "Happiness & Contentment":   ["10:64","13:28","16:97","3:170","98:8"],
  "Grief & Loss":              ["2:155","2:156","2:157","2:286","3:145","57:22","57:23"],
  "Controlling Anger":         ["3:133","3:134","7:199","41:34","42:37"],
  "Not Giving Up":             ["3:139","12:87","39:53","47:35","94:5","94:6"],

  "Trust in Allah (Tawakkul)": ["3:159","3:173","8:49","9:129","11:123","12:67","39:38","65:3"],
  "Remembrance of Allah (Dhikr)": ["2:152","2:186","3:41","13:28","33:35","33:41","62:10","76:25"],
  "Supplication (Dua)":        ["2:186","3:38","7:55","17:11","21:83","21:87","27:62","40:60"],
  "Repentance (Tawbah)":       ["2:222","3:135","4:17","4:110","9:112","11:3","39:53","66:8"],
  "Seeking Forgiveness":       ["2:199","3:31","3:135","4:110","11:90","42:25","71:10"],
  "Allah's Mercy":             ["2:143","6:12","7:156","12:87","21:107","27:46","39:9","39:53"],
  "Guidance":                  ["1:5","1:6","1:7","2:2","2:5","2:186","17:9"],
  "Taqwa":                     ["2:2","2:177","2:183","3:102","4:131","49:13","65:2","65:3"],

  "Prayer (Salah)":            ["2:3","2:43","2:45","2:238","4:103","11:114","20:130","23:9","70:23","70:34"],
  "Fasting (Sawm)":            ["2:183","2:184","2:185","2:187"],
  "Charity (Sadaqah)":         ["2:177","2:261","2:262","2:274","3:92","57:7","63:10"],
  "Zakat":                     ["2:43","2:110","2:177","9:60","9:103","23:4"],
  "Hajj & Pilgrimage":         ["2:196","2:197","2:203","3:97","22:27","22:28"],
  "The Quran":                 ["2:2","2:185","4:82","10:57","12:2","15:9","17:9","17:82","41:44"],

  "Justice (Adl)":             ["4:58","4:135","5:8","6:152","7:29","16:90","42:15","49:9","57:25"],
  "Honesty & Truthfulness":    ["3:17","5:8","9:119","33:70","33:71","39:33","56:88"],
  "Kindness to Others":        ["2:195","2:263","3:134","4:36","6:54","16:128","28:77"],
  "Humility":                  ["7:199","17:37","25:63","25:64","31:18","31:19","57:23"],
  "Wisdom":                    ["2:269","3:190","3:191","31:12","59:21"],
  "Forgiving Others":          ["2:237","3:134","4:149","24:22","42:37","42:40","64:14"],
  "Arrogance & Pride":         ["4:36","7:13","16:23","17:37","31:18","35:43","39:60","40:35"],
  "Respecting Others":         ["4:36","6:108","17:53","49:11","49:12"],
  "Lying & Deception":         ["3:61","3:78","4:105","9:43","22:30","39:3"],

  "Marriage & Love":           ["2:187","4:34","25:74","30:21","33:35","35:11"],
  "Parents & Mothers":         ["2:83","2:215","2:233","4:36","6:151","17:23","17:24","19:32","29:8","31:14","31:15","46:15"],
  "Family & Kinship":          ["2:177","2:215","4:1","4:11","13:25","16:90","47:22"],
  "Brotherhood & Unity":       ["3:103","49:10","49:11","49:12","59:9"],
  "Helping Others":            ["2:177","2:261","3:92","4:36","5:2","9:71","28:77"],
  "Good Deeds":                ["2:177","2:195","3:92","3:133","16:97","18:30","99:7"],

  "Death & Afterlife":         ["2:28","2:156","3:145","3:185","4:78","16:61","23:15","39:42","56:60"],
  "Day of Judgement":          ["2:48","4:87","7:8","21:47","22:7","56:1","75:1","82:1","84:1","99:1"],
  "Jannah (Paradise)":         ["2:25","3:15","3:133","3:198","13:35","22:14","47:15","55:46","55:48","56:15","57:21"],
  "Nature & Creation":         ["2:164","3:190","3:191","13:3","16:65","30:22","30:24","55:5","55:6"],
  "Wealth & Provision":        ["2:261","11:6","17:29","17:30","51:22","65:3","87:16"],
  "Health & Body":             ["2:195","5:1","7:31","16:69","17:70","21:35"],
  "Difficulties & Trials":     ["2:155","2:156","2:157","2:286","65:7","94:5","94:6"],
  "Knowledge & Learning":      ["2:31","20:114","39:9","58:11","96:1","96:3","96:4","96:5"],

  "Hijab & Modesty":           ["24:31","33:53","33:59"],
  "Halal (Permissible)":       ["2:168","2:172","5:1","5:88","16:114"],
  "Haram (Forbidden)":         ["2:173","5:3","6:151","16:115","17:32","17:33"],
  "Alcohol & Intoxicants":     ["2:219","4:43","5:90","5:91"],
  "Peace":                     ["2:208","4:90","4:128","5:32","8:61","49:9"],
  "Dawah (Calling to Islam)":  ["3:104","3:110","6:108","12:108","16:125","41:33"],
  "Compulsion in Religion":    ["2:256","10:99","18:29","88:21","88:22"],

  "Prophets & Messengers":     ["2:136","2:253","3:84","4:163","4:164","6:83","7:59","21:73"],
  "Angels":                    ["2:30","2:98","4:136","6:61","13:11","16:2","32:11","82:10"],
  "Shaitan (Satan)":           ["2:36","2:208","4:76","7:12","12:5","14:22","17:53","36:60"],
  "Shirk (Polytheism)":        ["2:22","4:36","4:48","4:116","6:148","31:13","39:65"],
  "Disbelievers":              ["2:6","2:7","3:116","9:23","47:7","98:6"],
  "People of the Book":        ["2:62","3:110","4:131","5:5","5:69","29:46","57:29"]
};

// ── Feelings modal ─────────────────────────────────────────

function buildFeelingsModal() {
  if (!els.feelingsBody) return;
  els.feelingsBody.innerHTML = "";
  for (const cat of TOPIC_CATEGORIES) {
    const catEl = document.createElement("div");
    catEl.className = "feelingsCat";

    const labelEl = document.createElement("div");
    labelEl.className = "feelingsCatLabel";
    labelEl.textContent = cat.label;
    catEl.appendChild(labelEl);

    const chipsEl = document.createElement("div");
    chipsEl.className = "feelingsChips";
    for (const topic of cat.topics) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "feelingsChip";
      chip.textContent = topic;
      chip.addEventListener("click", () => selectTopic(topic));
      chipsEl.appendChild(chip);
    }
    catEl.appendChild(chipsEl);
    els.feelingsBody.appendChild(catEl);
  }
}

function openFeelingsModal() {
  if (!els.feelingsModal) return;
  buildFeelingsModal();
  els.feelingsModal.classList.remove("hidden");
}

function closeFeelingsModal() {
  if (els.feelingsModal) els.feelingsModal.classList.add("hidden");
}

async function selectTopic(topicName) {
  closeFeelingsModal();
  showLanding(false);

  const ayahIds = TOPIC_VERSES[topicName] || [];
  if (!ayahIds.length) return;

  setBadge("warn", `Loading "${topicName}"…`);

  // Load all required surahs in parallel
  const surahs = [...new Set(ayahIds.map(id => id.split(":")[0]))];
  try {
    await Promise.all(surahs.map(s => ensureSurahLoaded(s).catch(() => {})));
  } catch (_) {}

  // Build result records — preserve topic order
  const records = ayahIds.map(id => state.quranById.get(id)).filter(Boolean);

  // Show in search results panel
  if (els.mainQuery) els.mainQuery.value = topicName;
  state.selectedAyahId = null;
  setDetailState("empty");
  updateTabCounts(0, 0, 0, 0);
  renderResults(records);
  if (els.searchHint) els.searchHint.textContent = `Showing ${records.length} verses on "${topicName}"`;
  setBadge("ok", `${records.length} verses · ${topicName}`);
}

function isUrduActive() {
  return TRANSLATION_OPTIONS.find(o => o.id === state.activeTranslation)?.lang === "ur";
}

function getQuranTranslation(ayahId) {
  const id = state.activeTranslation;
  if (id === "en_default") return null;
  return state.translationData.get(id)?.[ayahId] ?? null;
}

function getHadithUrduText(hadithId) {
  if (!isUrduActive()) return null;
  const serial = hadithSerialFromId(hadithId);
  if (!serial) return null;
  for (const shard of state.urHadithShardCache.values()) {
    const t = shard[String(serial)];
    if (t) return t;
  }
  return null;
}

async function loadTranslation(id) {
  if (id === "en_default" || state.translationData.has(id)) return;
  const opt = TRANSLATION_OPTIONS.find(o => o.id === id);
  if (!opt?.path) return;
  // Append ?v=3 so any browser-cached old translation file (with wrong keys)
  // is bypassed — the versioned URL is treated as a fresh resource.
  const fp = resolveDataPath(opt.path) + "?v=3";
  const res = await fetch(fp, { cache: "no-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${fp}`);
  const data = await res.json();
  state.translationData.set(id, data);
}

function findUrHadithShardFile(serial) {
  for (const x of state.urHadithShardMap || [])
    if (serial >= x.start && serial <= x.end) return x.file;
  return null;
}

async function preloadUrHadithShards(hadithIds) {
  if (!isUrduActive() || !state.urHadithShardMap) return;
  const files = new Set();
  for (const hid of hadithIds) {
    const serial = hadithSerialFromId(hid);
    if (!serial) continue;
    const file = findUrHadithShardFile(serial);
    if (file && !state.urHadithShardCache.has(file)) files.add(file);
  }
  if (!files.size) return;
  await Promise.all([...files].map(async file => {
    const fp = resolveDataPath(file);
    const res = await fetch(fp, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${fp}`);
    const data = await res.json();
    state.urHadithShardCache.set(file, data);
  }));
}

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

  const urdu = isUrduActive();
  for (const rec of list.slice(0, 60)) {
    const surahNum  = Number(surahFromAyahId(rec.ayah_id));
    const surahNm   = SURAH_NAMES[surahNum] || "";
    const transText = getQuranTranslation(rec.ayah_id);
    const displayEn = transText || rec.english || "";
    const div = document.createElement("div");
    div.className = "item" + (state.selectedAyahId === rec.ayah_id ? " selected" : "");
    div.innerHTML = `
      <div class="itemId">
        <div class="ayahNum">${escapeHtml(rec.ayah_id)}</div>
        <div class="ayahName">${escapeHtml(surahNm)}</div>
      </div>
      <div>
        <div class="txt" dir="rtl">${escapeHtml(rec.arabic || "")}</div>
        <div class="subtxt${urdu ? " urdu-text" : ""}">${escapeHtml(displayEn)}</div>
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

function makeWordChips(values) {
  if (!values || !values.length) return `<span class="small">—</span>`;
  return values.map(v => `<span class="rootChip" dir="rtl">${escapeHtml(v)}</span>`).join("");
}

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

    const urdu = isUrduActive();
    let body = "";
    if (isQuranPair) {
      const rec = state.quranById.get(it.id);
      if (rec) {
        const transText = getQuranTranslation(it.id);
        const displayEn = transText || rec.english || "";
        body = `<div class="pairBody"><div dir="rtl">${escapeHtml(rec.arabic || "")}</div></div>
           <div class="pairBodySmall${urdu ? " urdu-text" : ""}">${escapeHtml(displayEn)}</div>`;
      } else {
        body = `<div class="pairBodySmall">Loading…</div>`;
      }
    } else {
      const h = state.hadithById.get(it.id);
      if (h) {
        const urText = getHadithUrduText(it.id);
        const displayText = urText || h.english || "";
        body = `<div class="pairBody"><div dir="rtl">${escapeHtml(h.arabic || "")}</div></div>`;
        if (displayText) {
          body += `<div class="pairBodySmall${urdu && urText ? " urdu-text" : ""}">${escapeHtml(displayText)}</div>`;
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

// ── Word / Root modal ───────────────────────────────────────

function sortAyahIds(ids) {
  return [...ids].sort((a, b) => {
    const [as, aa] = a.split(":").map(Number);
    const [bs, ba] = b.split(":").map(Number);
    return as !== bs ? as - bs : aa - ba;
  });
}

function groupBySurah(ayahIds) {
  const groups = new Map();
  for (const id of ayahIds) {
    const s = surahFromAyahId(id);
    if (!groups.has(s)) groups.set(s, []);
    groups.get(s).push(id);
  }
  return groups;
}

function closeWordModal() {
  if (els.wordModal) els.wordModal.classList.add("hidden");
}

async function openWordModal(word, kind) {
  // kind: "root" | "token"
  let ayahIds;
  if (kind === "root") {
    ayahIds = state.rootToAyahIds?.[word] || [];
  } else {
    const norm = normalizeArabic(word);
    ayahIds = state.arTokenToAyah?.[norm] || [];
    ayahIds = sortAyahIds(ayahIds);
  }

  const count = ayahIds.length;
  if (!count) return;

  const kindLabel = kind === "root" ? "Root Word" : "Arabic Word";
  els.wordModalTitle.textContent = word;
  els.wordModalSub.textContent   = `${kindLabel} · appears ${count} time${count !== 1 ? "s" : ""} in the Quran`;
  els.wordModalBody.innerHTML    = `<div class="wordModalLoading">Loading ayaat…</div>`;
  els.wordModal.classList.remove("hidden");

  const groups   = groupBySurah(ayahIds);
  const surahs   = [...groups.keys()];

  // Load all needed surahs in parallel (cached shards serve instantly)
  await Promise.all(surahs.map(s => ensureSurahLoaded(s).catch(() => {})));

  // Render grouped by surah
  els.wordModalBody.innerHTML = "";
  for (const surahNum of surahs) {
    const surahNm  = SURAH_NAMES[Number(surahNum)] || "";
    const groupEl  = document.createElement("div");
    groupEl.className = "wordModalGroup";

    const titleEl = document.createElement("div");
    titleEl.className   = "wordModalGroupTitle";
    titleEl.textContent = `Surah ${surahNum}${surahNm ? " — " + surahNm : ""}`;
    groupEl.appendChild(titleEl);

    for (const id of groups.get(surahNum)) {
      const rec  = state.quranById.get(id);
      const item = document.createElement("div");
      item.className = "wordModalItem";
      const modalUrdu = isUrduActive();
      const modalTrans = getQuranTranslation(id);
      const modalDisplayEn = modalTrans || (rec?.english ?? "");
      item.innerHTML = `
        <div class="wordModalItemId">${escapeHtml(fmtAyahId(id))}</div>
        ${rec
          ? `<div class="wordModalItemAr" dir="rtl">${escapeHtml(rec.arabic || "")}</div>
             <div class="wordModalItemEn${modalUrdu ? " urdu-text" : ""}">${escapeHtml(modalDisplayEn)}</div>`
          : `<div class="wordModalLoading">Unavailable</div>`}
      `;
      item.onclick = () => { closeWordModal(); openDetail(id); };
      groupEl.appendChild(item);
    }

    els.wordModalBody.appendChild(groupEl);
  }
}

// Wire modal close
if (els.wordModalClose) els.wordModalClose.onclick = closeWordModal;
if (els.wordModal) els.wordModal.addEventListener("click", e => {
  if (e.target === els.wordModal) closeWordModal();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeWordModal();
});

// Chip click delegation on the Words & Roots panel
if (els.dRoots) els.dRoots.addEventListener("click", e => {
  const chip = e.target.closest(".rootChip");
  if (chip) openWordModal(chip.textContent.trim(), "root");
});
if (els.dTokens) els.dTokens.addEventListener("click", e => {
  const chip = e.target.closest(".rootChip");
  if (chip) openWordModal(chip.textContent.trim(), "token");
});

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
  const anchorTrans = getQuranTranslation(ayahId);
  els.dEnglish.textContent = anchorTrans || rec.english || "";
  els.dEnglish.className   = "anchorEnglish" + (isUrduActive() ? " urdu-text" : "");

  // Words & Roots panel — reset to hidden on each new selection
  if (els.anchorWordsPanel) els.anchorWordsPanel.classList.add("hidden");
  if (els.wordsToggleBtn)   els.wordsToggleBtn.textContent = "Words & Roots";
  if (els.dRoots)   els.dRoots.innerHTML   = makeWordChips(rec.roots_ordered  || []);
  if (els.dTokens)  els.dTokens.innerHTML  = makeWordChips(rec.tokens_ordered || []);

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

  await Promise.all([
    loadSurahsParallel([...neededSurahs]),
    preloadHadithIds(firstHadithIds),
    preloadUrHadithShards(firstHadithIds),
  ]);
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

if (els.wordsToggleBtn) els.wordsToggleBtn.onclick = () => {
  const panel = els.anchorWordsPanel;
  if (!panel) return;
  const open = panel.classList.toggle("hidden") === false;
  els.wordsToggleBtn.textContent = open ? "Hide Words" : "Words & Roots";
};

if (els.fontIncBtn) els.fontIncBtn.onclick = () => {
  state.arabicFontSize = Math.min(30, state.arabicFontSize + 2);
  document.documentElement.style.setProperty("--arabic-font-size", state.arabicFontSize + "px");
};
if (els.fontDecBtn) els.fontDecBtn.onclick = () => {
  state.arabicFontSize = Math.max(13, state.arabicFontSize - 2);
  document.documentElement.style.setProperty("--arabic-font-size", state.arabicFontSize + "px");
};

if (els.engFontIncBtn) els.engFontIncBtn.onclick = () => {
  state.englishFontSize = Math.min(24, state.englishFontSize + 1);
  document.documentElement.style.setProperty("--english-font-size", state.englishFontSize + "px");
};
if (els.engFontDecBtn) els.engFontDecBtn.onclick = () => {
  state.englishFontSize = Math.max(10, state.englishFontSize - 1);
  document.documentElement.style.setProperty("--english-font-size", state.englishFontSize + "px");
};

// ── Init ────────────────────────────────────────────────────

async function init() {
  try {
    const manifest = await fetchJson("data/meta/manifest.json");
    state.manifest = manifest;

    const [shardMapQuran, shardMapPairs, shardMapHadith, enTokenToAyah, enTriToTokens, arTokenToAyah, rootToAyahIds] =
      await Promise.all([
        fetchJson(manifest.paths.shard_map_quran),
        fetchJson(manifest.paths.shard_map_pairs),
        fetchJson(manifest.paths.shard_map_hadith),
        fetchJson(manifest.paths.english_token_to_ayahids),
        fetchJson(manifest.paths.english_trigram_to_tokens),
        fetchJson(manifest.paths.arabic_token_to_ayahids),
        fetchJson(manifest.paths.root_to_ayahids),
      ]);

    state.shardMapQuran   = shardMapQuran;
    state.shardMapPairs   = shardMapPairs;
    state.shardMapHadith  = shardMapHadith;
    state.enTokenToAyah   = enTokenToAyah;
    state.enTriToTokens   = enTriToTokens;
    state.arTokenToAyah   = arTokenToAyah;
    state.rootToAyahIds   = rootToAyahIds;

    setBadge("ok", `Ready — Quran: ${manifest.counts.quran_ayat} | Hadith: ${manifest.counts.hadith}`);
    setDetailState("empty");

    // Load Urdu hadith shard map in background
    if (manifest.paths.ur_hadith_shard_map) {
      fetchJson(manifest.paths.ur_hadith_shard_map)
        .then(sm => { state.urHadithShardMap = sm; })
        .catch(err => console.warn("Urdu hadith shard map load failed:", err));
    }

    // Translation switch handler
    if (els.transSel) {
      els.transSel.addEventListener("change", async () => {
        const newId = els.transSel.value;
        if (newId === state.activeTranslation) return;
        if (!state.shardMapQuran) { els.transSel.value = state.activeTranslation; return; } // not ready yet

        const prevId = state.activeTranslation;
        state.activeTranslation = newId;

        // Load translation data if not already cached
        if (newId !== "en_default" && !state.translationData.has(newId)) {
          setBadge("warn", "Loading translation…");
          try {
            await loadTranslation(newId);
          } catch (err) {
            console.error("Translation load error:", err);
            // Roll back — revert to previous translation
            state.activeTranslation = prevId;
            els.transSel.value = prevId;
            setBadge("err", "Translation failed to load — check network");
            return;
          }
        }

        setBadge("ok", "Translation applied");
        // Re-render everything currently visible with new translation
        renderResults(state.lastResults);
        if (state.selectedAyahId) openDetail(state.selectedAyahId);
      });
    }

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

    // Feelings modal
    if (els.feelingsBtn) els.feelingsBtn.addEventListener("click", openFeelingsModal);
    if (els.feelingsModalClose) els.feelingsModalClose.addEventListener("click", closeFeelingsModal);
    if (els.feelingsModal) {
      els.feelingsModal.addEventListener("click", e => {
        if (e.target === els.feelingsModal) closeFeelingsModal();
      });
    }
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") { closeFeelingsModal(); closeWordModal(); }
    });

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
