/**
 * Quran Search Engine — Concept Ontology
 * Secondary/boost layer. Primary search now goes through the translation pipeline.
 * These maps add signal for well-known Islamic terms and addressee patterns.
 */

const STOP_WORDS = new Set([
  'a','an','the','in','on','at','to','for','of','and','or','but','is','are',
  'was','were','be','been','being','have','has','had','do','does','did','will',
  'would','could','should','may','might','shall','can','that','this','these',
  'those','it','its','i','me','my','we','our','you','your','he','his','she',
  'her','they','their','them','what','which','who','whom','when','where','why',
  'how','all','each','every','both','few','more','most','other','some','such',
  'no','not','only','same','so','than','too','very','just','with','from','by',
  'about','after','before','between','into','through','during','without','about',
  'against','toward','upon','within','along','following','across','behind','beyond',
  'plus','except','up','out','down','because','though','although','while',
  'allah','god','islamic','islam','verse','ayah','ayat','ayaat',
  'surah','chapter','almighty','lord','says','said','tell','tells','mentioned',
  'mention','mentions','found','find','show','shows','list','give','provides',
  'describe','describes','talk','talks','speak','speaks','discuss','discusses',
]);

/**
 * Phrase agents — when a query mentions "people of X" / "those who X",
 * we want the AGENT FORM of the concept, not the abstract noun.
 * Example: "people of Taqwa" — user means المتقين (the pious), not التقوى (piety).
 *
 * Each entry: trigger phrases (English) → exact Arabic agent-form word(s).
 * Phrases are matched as substrings (whole-phrase scope, not word-level).
 * This is the systematic fix for abstract-concept-vs-people-of-concept confusion.
 */
const PHRASE_AGENTS = {
  // ── Taqwa → Muttaqun ────────────────────────────────────────────────────
  taqwa_people: {
    phrases: [
      'people of taqwa', 'people who fear', 'people who have taqwa',
      'those who fear allah', 'those who fear god', 'those with taqwa',
      'god-fearing people', 'god-conscious', 'pious ones', 'the pious',
      'muttaqun', 'muttaqoon', 'muttaqin', 'muttaqi', 'muttaqi people',
      'al-muttaqun', 'al-muttaqin', 'al-muttaqoon',
    ],
    words:  ['المتقين', 'المتقون', 'متقين', 'متقون', 'تقي'],
    roots:  ['و ق ي'],
  },
  // ── Iman → Mu'minun ─────────────────────────────────────────────────────
  iman_people: {
    phrases: [
      'people of iman', 'people of faith', 'those who believe',
      'those who have faith', 'the believers', 'the faithful',
      'mu\'minun', 'muminun', 'mu\'minin', 'muminin',
      'al-mu\'minun', 'al-muminun', 'al-mu\'minin',
    ],
    words:  ['المؤمنين', 'المؤمنون', 'مؤمنين', 'مؤمنون', 'مؤمن', 'المؤمنات'],
    roots:  ['ا م ن'],
  },
  // ── Ihsan → Muhsinun ────────────────────────────────────────────────────
  ihsan_people: {
    phrases: [
      'people of ihsan', 'those who do good', 'doers of good',
      'people who do good', 'those who excel', 'the good-doers',
      'muhsinun', 'muhsineen', 'muhsinin', 'al-muhsinin', 'al-muhsineen',
    ],
    words:  ['المحسنين', 'المحسنون', 'محسنين', 'محسنون', 'محسن'],
    roots:  ['ح س ن'],
  },
  // ── Sabr → Sabirun ──────────────────────────────────────────────────────
  sabr_people: {
    phrases: [
      'people of sabr', 'patient ones', 'the patient', 'those who are patient',
      'sabirun', 'sabireen', 'sabirin', 'al-sabirin', 'al-sabireen',
    ],
    words:  ['الصابرين', 'الصابرون', 'صابرين', 'صابرون', 'الصبرين'],
    roots:  ['ص ب ر'],
  },
  // ── Falah → Muflihun ────────────────────────────────────────────────────
  falah_people: {
    phrases: [
      'people of success', 'the successful', 'those who succeed',
      'those who attain success', 'muflihun', 'muflihoon', 'muflihin',
      'al-muflihun', 'al-muflihoon',
    ],
    words:  ['المفلحون', 'المفلحين', 'مفلحون'],
    roots:  ['ف ل ح'],
  },
  // ── Truthfulness → Sadiqun ──────────────────────────────────────────────
  sadiq_people: {
    phrases: [
      'truthful ones', 'the truthful', 'those who are truthful',
      'sadiqun', 'sadiqeen', 'sadiqin', 'siddiqun', 'siddiqeen',
      'al-sadiqun', 'al-sadiqeen',
    ],
    words:  ['الصادقين', 'الصادقون', 'صادقين', 'الصديقين'],
    roots:  ['ص د ق'],
  },
  // ── Khasiroon (losers) ──────────────────────────────────────────────────
  khusran_people: {
    phrases: [
      'people of loss', 'the losers', 'those who lose', 'those in loss',
      'khasiroon', 'khasireen', 'al-khasirin', 'al-khasireen',
    ],
    words:  ['الخاسرين', 'الخاسرون', 'خاسرين', 'خاسرون'],
    roots:  ['خ س ر'],
  },
  // ── Disbelievers ────────────────────────────────────────────────────────
  kufr_people: {
    phrases: [
      'people of kufr', 'the disbelievers', 'those who disbelieve',
      'those who reject', 'kafirun', 'kafiroon', 'kafirin', 'al-kafirun',
    ],
    words:  ['الكافرين', 'الكافرون', 'كافرين', 'كافرون', 'كافر'],
    roots:  ['ك ف ر'],
  },
  // ── Hypocrites ──────────────────────────────────────────────────────────
  nifaq_people: {
    phrases: [
      'people of hypocrisy', 'the hypocrites', 'those who are hypocritical',
      'munafiqun', 'munafiqoon', 'munafiqin', 'al-munafiqun',
    ],
    words:  ['المنافقين', 'المنافقون', 'منافقين', 'منافقون'],
    roots:  ['ن ف ق'],
  },
  // ── Zalimun ─────────────────────────────────────────────────────────────
  zulm_people: {
    phrases: [
      'wrongdoers', 'the unjust', 'oppressors', 'transgressors',
      'those who do wrong', 'zalimun', 'zalimoon', 'al-zalimun', 'al-zalimoon',
    ],
    words:  ['الظالمين', 'الظالمون', 'ظالمين', 'ظالمون'],
    roots:  ['ظ ل م'],
  },
  // ── Mushrikoon ──────────────────────────────────────────────────────────
  shirk_people: {
    phrases: [
      'polytheists', 'idolaters', 'those who associate',
      'mushrikun', 'mushrikoon', 'mushrikin', 'al-mushrikun',
    ],
    words:  ['المشركين', 'المشركون', 'مشركين', 'مشركون'],
    roots:  ['ش ر ك'],
  },
  // ── Fasiqoon ────────────────────────────────────────────────────────────
  fisq_people: {
    phrases: [
      'transgressors', 'rebellious', 'the disobedient',
      'fasiqun', 'fasiqoon', 'fasiqin', 'al-fasiqun',
    ],
    words:  ['الفاسقين', 'الفاسقون', 'فاسقين', 'فاسقون'],
    roots:  ['ف س ق'],
  },
};

/**
 * Exact Arabic word forms for key Islamic terms.
 * When a user query contains one of these terms, the search finds ayaat containing
 * the EXACT normalized Arabic word(s) — not just the root — and surfaces them first
 * in Quran order. This powers precise "list all instances of X" queries.
 *
 * All strings are pre-normalized (no diacritics, ى→ي, ة→ه, أإآ→ا).
 */
const EXACT_WORDS = {
  // ── Names / Attributes of Allah ────────────────────────────────────────
  'al-hakeem':    ['الحكيم', 'حكيم'],
  'hakeem':       ['الحكيم', 'حكيم'],
  'al-aleem':     ['العليم', 'عليم'],
  'aleem':        ['العليم', 'عليم'],
  'al-aziz':      ['العزيز', 'عزيز'],
  'aziz':         ['العزيز', 'عزيز'],
  'al-ghafur':    ['الغفور', 'غفور'],
  'ghafur':       ['الغفور', 'غفور'],
  'al-rahman':    ['الرحمن'],
  'al-raheem':    ['الرحيم', 'رحيم'],
  'al-qadir':     ['القدير', 'قدير'],
  'al-karim':     ['الكريم', 'كريم'],
  'al-haleem':    ['الحليم', 'حليم'],
  'al-baseer':    ['البصير', 'بصير'],
  'al-samee':     ['السميع', 'سميع'],
  'al-tawwab':    ['التواب', 'تواب'],
  'al-wahhab':    ['الوهاب', 'وهاب'],
  'al-razzaq':    ['الرزاق', 'رزاق'],
  'al-fattah':    ['الفتاح'],
  'asma ul husna': ['الحسني', 'اسماءه'],

  // ── Quranic commands ────────────────────────────────────────────────────
  'qul':          ['قل'],

  // ── Groups / categories of people ───────────────────────────────────────
  'muttaqoon':    ['المتقين', 'المتقون', 'متقين', 'متقون'],
  'muttaqun':     ['المتقين', 'المتقون', 'متقين'],
  'muttaqi':      ['المتقي', 'متقي'],
  'muhsineen':    ['المحسنين', 'المحسنون', 'محسنين'],
  'muhsinin':     ['المحسنين', 'المحسنون'],
  'muflihoon':    ['المفلحون', 'المفلحين', 'مفلحون'],
  'muflihun':     ['المفلحون', 'المفلحين'],
  'munafiqoon':   ['المنافقون', 'المنافقين', 'منافقون'],
  'munafiqun':    ['المنافقون', 'المنافقين'],
  'sadiqeen':     ['الصادقين', 'الصادقون', 'صادقين'],
  'siddiqeen':    ['الصديقين', 'الصديقون'],
  'sadihin':      ['الصادقين', 'صادقين'],
  'abrar':        ['الابرار', 'ابرار'],
  'rabbaniyin':   ['ربانيين', 'ربانيون', 'رباني'],
  'ulul albab':   ['الالباب', 'الالبب', 'لباب'],
  'ulul-albab':   ['الالباب', 'الالبب', 'لباب'],
  'ahl al-ilm':   ['العلم', 'اهل العلم'],
  'kafiroon':     ['الكافرون', 'الكافرين'],
  'fasiqoon':     ['الفاسقون', 'الفاسقين'],
  'zalimoon':     ['الظالمون', 'الظالمين'],
  'mushrikoon':   ['المشركون', 'المشركين'],

  // ── Prophets (all Quranic spelling variants including with prepositions) ──
  'musa':         ['موسي', 'موسيا', 'ياموسيا', 'ياموسي', 'وموسيا', 'بموسيا', 'لموسيا'],
  'moses':        ['موسي', 'موسيا', 'ياموسيا', 'ياموسي', 'وموسيا'],
  'isa':          ['عيسي', 'عيسيا', 'وعيسيا', 'ياعيسي', 'ياعيسيا', 'بعيسي', 'وعيسي'],
  'jesus':        ['عيسي', 'عيسيا', 'وعيسيا', 'ياعيسي'],
  'ibrahim':      ['ابراهيم', 'ياابراهيم', 'وابراهيم', 'لابراهيم', 'بابراهيم'],
  'abraham':      ['ابراهيم', 'ياابراهيم', 'وابراهيم'],
  'yusuf':        ['يوسف', 'ليوسف', 'ويوسف', 'بيوسف'],
  'joseph':       ['يوسف', 'ليوسف', 'ويوسف'],
  'muhammad':     ['محمد', 'احمد'],
  'nuh':          ['نوح', 'نوحا'],
  'noah':         ['نوح', 'نوحا'],
  'dawud':        ['داود', 'داوود'],
  'david':        ['داود', 'داوود'],
  'sulayman':     ['سليمان', 'سليمن'],
  'solomon':      ['سليمان'],
  'yahya':        ['يحيي', 'يحييا'],
  'zakariya':     ['زكريا', 'زكرياا'],
  'harun':        ['هارون', 'وهارون'],
  'aaron':        ['هارون', 'وهارون'],
  'ayyub':        ['ايوب'],
  'yunus':        ['يونس'],
  'jonah':        ['يونس'],
  'lut':          ['لوط', 'لوطا'],
  'lot':          ['لوط', 'لوطا'],
  'hud':          ['هود', 'هودا'],
  'salih':        ['صالح', 'صالحا'],
  'shuaib':       ['شعيب', 'شعيبا'],
  'maryam':       ['مريم'],
  'mary':         ['مريم'],
  'idris':        ['ادريس'],
  'ilyas':        ['الياس'],
  'adam':         ['ادم'],
  'pharaoh':      ['فرعون', 'لفرعون', 'وفرعون'],
  'firaun':       ['فرعون', 'لفرعون', 'وفرعون'],

  // ── Forbidden things (Q4) ─────────────────────────────────────────────────
  'haram':        ['الحرام', 'حرم', 'حرمنا', 'وحرم', 'حرمت', 'حرما', 'محرم'],
  'forbidden':    ['الحرام', 'حرم', 'حرمت', 'وحرم'],
  'prohibited':   ['الحرام', 'حرم', 'حرمت'],

  // ── Day of Judgment (Q5) ────────────────────────────────────────────────
  'qiyamah':      ['القيامه', 'يومئذ', 'الساعه'],
  'yawm al-qiyamah': ['القيامه'],
  'judgment day': ['القيامه'],
  'last day':     ['القيامه'],
  'hour':         ['الساعه'],

  // ── Parents (Q14, Q28) ──────────────────────────────────────────────────
  'parents':      ['وبالوالدين', 'بوالديه', 'الوالدين', 'ولوالديك', 'لوالديه', 'للوالدين', 'فللوالدين', 'ولابويه', 'ابويه'],
  'walidayn':     ['وبالوالدين', 'بوالديه', 'الوالدين', 'ولوالديك', 'لوالديه'],
  'mother':       ['امه', 'والدته', 'لامه'],
  'father':       ['ابيه', 'اباه', 'لابيه'],

  // ── Quran's self-descriptions (Q21) ─────────────────────────────────────
  'furqan':       ['الفرقان', 'والفرقان'],
  'tanzeel':      ['تنزيل', 'تنزيلا'],
  'kitab':        ['الكتب', 'كتب', 'الكتاب'],

  // ── Hard hearts (Q23) ───────────────────────────────────────────────────
  'hard heart':   ['قلوبهم', 'قلوبكم', 'قلوب', 'القلوب', 'قسوه', 'قاسيه'],
  'hearts':       ['قلوبهم', 'قلوبكم', 'قلوب', 'القلوب', 'قلوبنا'],
  'qalb':         ['قلوبهم', 'قلوبكم', 'قلوب', 'القلوب', 'قلبه', 'قلب'],

  // ── Noor vs Zulumat (Q29) ───────────────────────────────────────────────
  'noor':         ['النور', 'نور', 'نورا', 'والنور', 'ونور', 'نورهم'],
  'zulumat':      ['الظلمات', 'ظلمات'],
  'darkness':     ['الظلمات', 'ظلمات'],
  'light':        ['النور', 'نور', 'نورا'],

  // ── Parables (Q8, Q30) ──────────────────────────────────────────────────
  'amthal':       ['مثل', 'مثلا', 'الامثال', 'كمثل'],
  'parable':      ['مثل', 'مثلا', 'كمثل'],
  'parables':     ['مثل', 'الامثال', 'كمثل'],
  'analogy':      ['مثل', 'مثلا', 'كمثل'],

  // ── Key Quranic concepts (precise word forms) ────────────────────────────
  'ahd':          ['عهد', 'العهد', 'عهده', 'عهودهم'],
  'mithaq':       ['ميثاق', 'الميثاق', 'مواثيقهم'],
  'covenant':     ['عهد', 'العهد', 'ميثاق'],
  'amthal':       ['مثل', 'مثلا', 'الامثال'],
  'parable':      ['مثل', 'مثلا'],
  'parables':     ['مثل', 'الامثال'],
  'birr':         ['البر'],
  'al-birr':      ['البر'],
  'falah':        ['الفلاح', 'يفلحون', 'افلح', 'المفلحون'],
  'khusran':      ['الخسران', 'خسروا', 'خاسرين', 'الخاسرين'],
  'huzn':         ['الحزن', 'حزن', 'حزنا'],
  'khawf':        ['الخوف', 'خوف', 'تخافون'],
  'noor':         ['النور', 'نور'],
  'zulumat':      ['الظلمات', 'ظلمات'],
  'kalam':        ['كلام', 'كلمات', 'كلمه', 'كلمت'],
  'kalam allah':  ['كلمات', 'كلمه'],
  'talaq':        ['الطلاق', 'طلاق', 'طلقتم', 'طلقوهن'],
  'riba':         ['الربا', 'ربا'],
  'nabi':         ['نبي', 'النبيين', 'نبيا'],
  'rasool':       ['رسول', 'الرسل', 'رسولا'],
  'rasul':        ['رسول', 'الرسل'],
  'wali':         ['ولي', 'اولياء', 'الاولياء'],
  'taqwa':        ['التقوي', 'تقواه', 'تقوي'],
  'muamalat':     ['المعاملات', 'تعاملون'],
  'dua':          ['دعاء', 'الدعاء', 'ادعو', 'يدعون'],
  'waseela':      ['الوسيله', 'وسيله', 'الوسيلة', 'وسيلة'],
  'sabeel':       ['السبيل', 'سبيل', 'سبيلنا', 'سبيله', 'سبيلهم'],
  'sabeelillah':  ['سبيل الله', 'في سبيل الله'],
  'zakat':        ['الزكاه', 'زكاه', 'الزكاه'],
  'salah':        ['الصلاه', 'صلاه', 'الصلوه'],
  'jannah':       ['الجنه', 'جنه', 'جنات'],
  'naar':         ['النار', 'نار'],
  'sabr':         ['الصبر', 'صبر', 'اصبروا'],
  'shukr':        ['الشكر', 'شكر', 'يشكرون'],
  'tawbah':       ['التوبه', 'توبه', 'يتوبون'],
  'hubb':         ['حب', 'يحب', 'يحبون'],
  'yuhib':        ['يحب', 'يحبهم', 'يحبون'],
  'la yuhibb':    ['لا يحب'],
  'la yuhibbu':   ['لا يحب'],
  'yuhibbu':      ['يحب'],
  'love':         ['يحب', 'يحبون', 'يحبهم', 'حب', 'احب'],
  'loves':        ['يحب', 'يحبون', 'يحبهم'],
  'does not love': ['لا يحب'],
  'not love':     ['لا يحب'],
  'allah love':   ['يحب'],
  'allah loves':  ['يحب'],

  // ── Rabbana / Rabbi supplications ────────────────────────────────────────
  'rabbana':      ['ربنا'],
  'rabbi':        ['ربي', 'رب'],
  'rabb':         ['رب', 'ربنا', 'ربي'],

  // ── Additional commands / phrases ─────────────────────────────────────────
  'aqimu':        ['اقيموا'],
  'atiu':         ['اطيعوا'],
  'ittaqu':       ['اتقوا'],
  'wadhkuru':     ['واذكروا', 'اذكروا'],
  'yatadhakkaru': ['يتذكرون', 'تذكرون'],
  'afala':        ['افلا', 'افلم'],

  // ── Quranic set phrases ───────────────────────────────────────────────────
  'inna lillahi': ['انا لله'],
  'hasbunallah':  ['حسبنا الله'],
  'subhana':      ['سبحان'],

  // ── Knowledge spectrum (Q6: types of knowing in the Quran) ───────────────
  'fiqh':              ['الفقه', 'فقه', 'يفقهون', 'تفقهوا'],
  'tafakkur':          ['يتفكرون', 'تتفكرون', 'يتفكر'],
  'tadabbur':          ['يتدبرون', 'يتدبر'],
  'basirah':           ['بصيره', 'بصائر', 'بصيرا'],
  'bayyinah':          ['البينه', 'بينه', 'بينات'],
  'burhan':            ['البرهان', 'برهان', 'برهانكم'],
  'zann':              ['الظن', 'ظن', 'يظنون'],
  'wahm':              ['وهم', 'اوهام'],

  // ── Sacred numbers (Q9: numerically significant Quranic references) ───────
  'seven heavens':     ['سبع سماوات'],
  "sab'a samawat":     ['سبع سماوات'],
  'seven':             ['سبع', 'سبعه', 'سبعا', 'سبعون', 'سبعين'],
  'forty':             ['اربعين'],
  'forty days':        ['اربعين ليله', 'اربعين يوما'],
  'forty nights':      ['اربعين ليله'],
  'seventy':           ['سبعين', 'سبعون'],
  'nineteen':          ['تسعه عشر'],
  'twelve':            ['اثنا عشر', 'اثني عشر'],
  'hundred':           ['ماه', 'مائه', 'اماه'],
  'thousand':          ['الف', 'الفا'],
};

/**
 * Transliteration map — expands Islamic/Arabic/Urdu terms into English keywords + roots.
 * Used as a fast-path boost on top of the translation pipeline.
 */
const TRANSLITERATIONS = {
  // ── Invocation ────────────────────────────────────────────────────────────
  'bismillah':       { english: ['name','name of allah','in the name'], roots: ['س م و','ب س م'] },
  'basmalah':        { english: ['name of allah','in the name'], roots: ['س م و'] },
  'alhamdulillah':   { english: ['praise','all praise','thankful'], roots: ['ح م د'] },
  'subhanallah':     { english: ['glory','glorify','exalt'], roots: ['س ب ح'] },
  'astaghfirullah':  { english: ['forgiveness','forgive','seek pardon'], roots: ['غ ف ر'] },
  'mashallah':       { english: ['will of allah','what allah wills'], roots: ['ش ي ا','و ل ي'] },
  'inshallah':       { english: ['if allah wills','god willing'], roots: ['ش ي ا'] },
  'allahu akbar':    { english: ['greatest','great','magnify'], roots: ['ك ب ر'] },
  'la ilaha illallah': { english: ['no god but allah','monotheism','oneness'], roots: ['و ح د','ا ل ه'] },

  // ── Pillars of Islam ──────────────────────────────────────────────────────
  'salah':      { english: ['prayer','pray','worship'], roots: ['ص ل و','ع ب د'] },
  'salat':      { english: ['prayer','pray','worship'], roots: ['ص ل و'] },
  'namaz':      { english: ['prayer','pray'], roots: ['ص ل و'] },
  'sawm':       { english: ['fasting','fast','abstain'], roots: ['ص و م'] },
  'siyam':      { english: ['fasting','fast'], roots: ['ص و م'] },
  'roza':       { english: ['fasting','fast'], roots: ['ص و م'] },
  'zakat':      { english: ['charity','alms','poor due','purification'], roots: ['ز ك و','ن ف ق'] },
  'zakah':      { english: ['charity','alms','poor due'], roots: ['ز ك و'] },
  'hajj':       { english: ['pilgrimage','kaaba','mecca','sacred house'], roots: ['ح ج ج'] },
  'umrah':      { english: ['pilgrimage','lesser pilgrimage'], roots: ['ع م ر'] },
  'shahadah':   { english: ['testimony','testify','witness','declaration of faith'], roots: ['ش ه د'] },

  // ── Purification ──────────────────────────────────────────────────────────
  'wudu':       { english: ['ablution','purification','wash','cleanse'], roots: ['و ض ا','ط ه ر'] },
  'wudhu':      { english: ['ablution','purification','wash'], roots: ['و ض ا','ط ه ر'] },
  'ghusl':      { english: ['ritual bath','purification','wash'], roots: ['غ س ل','ط ه ر'] },
  'tayammum':   { english: ['dry ablution','purification with dust'], roots: ['ي م م','ط ه ر'] },
  'tahara':     { english: ['purification','purity','clean'], roots: ['ط ه ر'] },
  'taharah':    { english: ['purification','purity','clean'], roots: ['ط ه ر'] },
  'najis':      { english: ['impure','unclean','filth'], roots: ['ن ج س'] },

  // ── Prayer postures ────────────────────────────────────────────────────────
  'sujood':     { english: ['prostration','prostrate','bow down'], roots: ['س ج د'] },
  'sajdah':     { english: ['prostration','prostrate'], roots: ['س ج د'] },
  'ruku':       { english: ['bowing','bow','kneel'], roots: ['ر ك ع'] },
  'qiyam':      { english: ['standing','stand in prayer'], roots: ['ق و م'] },
  'tashahhud':  { english: ['testimony','testify','witness'], roots: ['ش ه د'] },
  'jumuah':     { english: ['friday','friday prayer','congregation'], roots: ['ج م ع'] },
  'jummah':     { english: ['friday','friday prayer'], roots: ['ج م ع'] },
  'azan':       { english: ['call to prayer','adhan'], roots: ['ا ذ ن'] },
  'adhan':      { english: ['call to prayer','announce prayer'], roots: ['ا ذ ن'] },
  'iqamah':     { english: ['prayer call','standing prayer'], roots: ['ق و م'] },

  // ── Spiritual qualities ───────────────────────────────────────────────────
  'taqwa':      { english: ['piety','righteousness','god-fearing','devout','god-consciousness'], roots: ['و ق ي'] },
  'iman':       { english: ['faith','belief','believe','trust'], roots: ['ا م ن'] },
  'ihsan':      { english: ['excellence','perfection','good deeds','righteous'], roots: ['ح س ن'] },
  'ikhlas':     { english: ['sincerity','sincere','purely for allah'], roots: ['خ ل ص'] },
  'tawakkul':   { english: ['trust in allah','reliance','put trust','depend on allah'], roots: ['و ك ل'] },
  'tawakkal':   { english: ['trust in allah','reliance'], roots: ['و ك ل'] },
  'tawakal':    { english: ['trust in allah','reliance','depend on allah'], roots: ['و ك ل'] },
  'tawakul':    { english: ['trust in allah','reliance'], roots: ['و ك ل'] },
  'tawakol':    { english: ['trust in allah','reliance'], roots: ['و ك ل'] },
  'sabr':       { english: ['patience','patient','perseverance','steadfast','endure'], roots: ['ص ب ر'] },
  'shukr':      { english: ['gratitude','grateful','thankful'], roots: ['ش ك ر'] },
  'tawbah':     { english: ['repentance','repent','turn back to allah'], roots: ['ت و ب'] },
  'tawba':      { english: ['repentance','repent'], roots: ['ت و ب'] },
  'istighfar':  { english: ['seek forgiveness','ask forgiveness','repent'], roots: ['غ ف ر'] },
  'dua':        { english: ['supplication','invoke','call upon','ask allah'], roots: ['د ع و'] },
  'dhikr':      { english: ['remembrance of allah','remember allah','mention allah'], roots: ['ذ ك ر'] },
  'zikr':       { english: ['remembrance of allah','remember allah'], roots: ['ذ ك ر'] },
  'tasbih':     { english: ['glorification','glorify','subhan'], roots: ['س ب ح'] },
  'istiqamah':  { english: ['steadfastness','stand firm','upright','straight path'], roots: ['ق و م'] },
  'zuhd':       { english: ['asceticism','detachment from world','simple living'], roots: ['ز ه د'] },
  'wara':       { english: ['caution','scrupulous','avoid doubtful'], roots: ['و ر ع'] },
  'tawadu':     { english: ['humility','humble','modest'], roots: ['و ض ع'] },

  // ── Faith pillars ────────────────────────────────────────────────────────
  'tawheed':    { english: ['monotheism','oneness of allah','one god'], roots: ['و ح د'] },
  'tauhid':     { english: ['monotheism','oneness of allah'], roots: ['و ح د'] },
  'yaqeen':     { english: ['certainty','conviction','sure'], roots: ['ي ق ن'] },
  'yaqin':      { english: ['certainty','certain'], roots: ['ي ق ن'] },
  'niyyah':     { english: ['intention','intend','purpose'], roots: ['ن و ي'] },
  'niyat':      { english: ['intention','intend'], roots: ['ن و ي'] },
  'aqeedah':    { english: ['creed','belief','doctrine','faith'], roots: ['ع ق د'] },
  'aqidah':     { english: ['creed','belief'], roots: ['ع ق د'] },

  // ── Negative traits ───────────────────────────────────────────────────────
  'kufr':       { english: ['disbelief','reject faith','deny','ingratitude'], roots: ['ك ف ر'] },
  'kafir':      { english: ['disbeliever','unbeliever','rejecter'], roots: ['ك ف ر'] },
  'nifaq':      { english: ['hypocrisy','hypocrite','two-faced'], roots: ['ن ف ق'] },
  'munafiq':    { english: ['hypocrite','two-faced','insincere'], roots: ['ن ف ق'] },
  'shirk':      { english: ['polytheism','associating partners','idolatry','idol'], roots: ['ش ر ك'] },
  'mushrik':    { english: ['polytheist','idolater','associating partners'], roots: ['ش ر ك'] },
  'kibr':       { english: ['arrogance','pride','haughty','proud'], roots: ['ك ب ر'] },
  'hasad':      { english: ['envy','jealousy','malice'], roots: ['ح س د'] },
  'zulm':       { english: ['injustice','oppression','wrong','transgress'], roots: ['ظ ل م'] },
  'zulum':      { english: ['injustice','oppression','wrong'], roots: ['ظ ل م'] },
  'fasad':      { english: ['corruption','mischief','spread corruption'], roots: ['ف س د'] },
  'fitnah':     { english: ['trial','tribulation','temptation','discord','strife'], roots: ['ف ت ن'] },
  'fitna':      { english: ['trial','tribulation','temptation'], roots: ['ف ت ن'] },
  'riya':       { english: ['showing off','ostentation','insincerity'], roots: ['ر ا ي'] },
  'ghibah':     { english: ['backbiting','slander','speak ill'], roots: ['غ ي ب'] },
  'nameemah':   { english: ['tale-carrying','gossip','slander'], roots: ['ن م م'] },
  'takabbur':   { english: ['arrogance','haughty','proud'], roots: ['ك ب ر'] },
  'ujub':       { english: ['conceit','self-admiration','vanity'], roots: ['ع ج ب'] },

  // ── Family & social ───────────────────────────────────────────────────────
  'nikah':      { english: ['marriage','marry','wed','spouse'], roots: ['ن ك ح'] },
  'talaq':      { english: ['divorce','separation','dissolve marriage'], roots: ['ط ل ق'] },
  'mahr':       { english: ['dowry','bridal gift','dower'], roots: ['م ه ر'] },
  'iddah':      { english: ['waiting period','divorce waiting'], roots: ['ع د د'] },
  'iddat':      { english: ['waiting period'], roots: ['ع د د'] },
  'mahram':     { english: ['prohibited kin','unmarriageable relatives'], roots: ['ح ر م'] },
  'walimah':    { english: ['wedding feast','marriage feast'], roots: ['و ل م'] },
  'nafaqah':    { english: ['maintenance','provision for family','financial support'], roots: ['ن ف ق'] },
  'yateem':     { english: ['orphan','fatherless child'], roots: ['ي ت م'] },
  'miskin':     { english: ['poor','destitute','needy'], roots: ['م س ك'] },
  'faqeer':     { english: ['poor','impoverished','needy'], roots: ['ف ق ر'] },
  'ibn':        { english: ['son','child'], roots: ['ب ن و'] },
  'umm':        { english: ['mother'], roots: ['ا م م'] },
  'ab':         { english: ['father'], roots: ['ا ب و'] },

  // ── Finance & trade ───────────────────────────────────────────────────────
  'riba':       { english: ['usury','interest','unlawful increase'], roots: ['ر ب و'] },
  'sood':       { english: ['usury','interest'], roots: ['ر ب و'] },
  'bay':        { english: ['trade','sale','sell','buy'], roots: ['ب ي ع'] },
  'tijara':     { english: ['trade','commerce','business'], roots: ['ت ج ر'] },
  'tijarah':    { english: ['trade','commerce','business'], roots: ['ت ج ر'] },
  'halal':      { english: ['permissible','lawful','allowed'], roots: ['ح ل ل'] },
  'haram':      { english: ['forbidden','prohibited','unlawful'], roots: ['ح ر م'] },
  'waqf':       { english: ['endowment','charitable donation'], roots: ['و ق ف'] },
  'mirath':     { english: ['inheritance','estate'], roots: ['و ر ث'] },
  'wirasah':    { english: ['inheritance'], roots: ['و ر ث'] },
  'wasiyyah':   { english: ['will','bequest','testament'], roots: ['و ص ي'] },
  'qard':       { english: ['loan','debt','lend','borrow'], roots: ['ق ر ض'] },

  // ── Legal ─────────────────────────────────────────────────────────────────
  'qisas':      { english: ['retaliation','equal punishment','eye for eye'], roots: ['ق ص ص'] },
  'hudood':     { english: ['prescribed punishment','limits of allah'], roots: ['ح د د'] },
  'hudud':      { english: ['prescribed punishment','limits'], roots: ['ح د د'] },
  'diyah':      { english: ['blood money','compensation'], roots: ['د ي و'] },
  'hadd':       { english: ['boundary','limit','punishment'], roots: ['ح د د'] },
  'zina':       { english: ['adultery','fornication','illegal intercourse'], roots: ['ز ن ي'] },
  'sariqa':     { english: ['theft','steal','stealing'], roots: ['س ر ق'] },

  // ── Soul / metaphysics ────────────────────────────────────────────────────
  'ruh':        { english: ['spirit','soul','breath of life'], roots: ['ر و ح'] },
  'nafs':       { english: ['soul','self','ego','inner self','person'], roots: ['ن ف س'] },
  'qalb':       { english: ['heart','spiritual heart','mind'], roots: ['ق ل ب'] },
  'noor':       { english: ['light','divine light','guidance'], roots: ['ن و ر'] },
  'nur':        { english: ['light','divine light'], roots: ['ن و ر'] },
  'huda':       { english: ['guidance','guide','right path'], roots: ['ه د ي'] },
  'hidayah':    { english: ['guidance','guide','right path'], roots: ['ه د ي'] },
  'ghayb':      { english: ['unseen','hidden','unknown'], roots: ['غ ي ب'] },
  'ghaib':      { english: ['unseen','hidden'], roots: ['غ ي ب'] },
  'barakah':    { english: ['blessing','bounty','abundance'], roots: ['ب ر ك'] },
  'baraka':     { english: ['blessing','bless'], roots: ['ب ر ك'] },
  'rizq':       { english: ['provision','sustenance','livelihood','bounty'], roots: ['ر ز ق'] },
  'ajal':       { english: ['appointed time','death','fixed time'], roots: ['ا ج ل'] },
  'qadr':       { english: ['divine decree','predestination','measure','power'], roots: ['ق د ر'] },
  'qada':       { english: ['divine decree','judgment','decision'], roots: ['ق ض ي'] },
  'taqdeer':    { english: ['divine decree','destiny'], roots: ['ق د ر'] },
  'aql':        { english: ['intellect','reason','mind'], roots: ['ع ق ل'] },
  'ilham':      { english: ['inspiration','inspired'], roots: ['ل ه م'] },

  // ── Cosmos / divine ───────────────────────────────────────────────────────
  'arsh':       { english: ['throne','throne of allah','highest throne'], roots: ['ع ر ش'] },
  'kursi':      { english: ['footstool','seat','chair'], roots: ['ك ر س'] },
  'loh':        { english: ['preserved tablet','written','record'], roots: ['ل و ح'] },
  'lauh':       { english: ['preserved tablet','written record'], roots: ['ل و ح'] },
  'qalam':      { english: ['pen','write','written'], roots: ['ق ل م'] },

  // ── Eschatology ───────────────────────────────────────────────────────────
  'qiyamah':    { english: ['resurrection','day of judgment','last day'], roots: ['ق و م'] },
  'akhirah':    { english: ['hereafter','afterlife','next life'], roots: ['ا خ ر'] },
  'akhira':     { english: ['hereafter','afterlife'], roots: ['ا خ ر'] },
  'jannah':     { english: ['paradise','garden','heaven','bliss'], roots: ['ج ن ن'] },
  'jahannam':   { english: ['hell','hellfire','fire','punishment'], roots: ['ج ح م','ن ا ر'] },
  'naar':       { english: ['fire','hellfire'], roots: ['ن ا ر'] },
  'barzakh':    { english: ['barrier','intermediate state'], roots: ['ب ر ز'] },
  'shafaa':     { english: ['intercession','intercede','pleading'], roots: ['ش ف ع'] },
  'shafaah':    { english: ['intercession','intercede'], roots: ['ش ف ع'] },
  'mizan':      { english: ['scales','balance','weigh deeds'], roots: ['و ز ن'] },
  'hashr':      { english: ['gathering','assembly'], roots: ['ح ش ر'] },
  'hisab':      { english: ['reckoning','account','judgment'], roots: ['ح س ب'] },
  'sirat':      { english: ['bridge','path','crossing'], roots: ['س ر ط'] },
  'mahshar':    { english: ['gathering place','day of assembly'], roots: ['ح ش ر'] },
  'shaheed':    { english: ['martyr','witness'], roots: ['ش ه د'] },
  'siddiq':     { english: ['truthful','sincere','righteous'], roots: ['ص د ق'] },
  'wali':       { english: ['friend of allah','guardian','protector'], roots: ['و ل ي'] },

  // ── Beings ────────────────────────────────────────────────────────────────
  'malaika':    { english: ['angels','angel'], roots: ['م ل ك'] },
  'malaikah':   { english: ['angels','angel'], roots: ['م ل ك'] },
  'jibreel':    { english: ['gabriel','angel gabriel'], roots: ['ج ب ر'] },
  'jibril':     { english: ['gabriel','angel gabriel'], roots: ['ج ب ر'] },
  'mikail':     { english: ['michael','angel michael'], roots: ['م ك ل'] },
  'israfel':    { english: ['israfil','angel of trumpet'], roots: ['ن ف خ'] },
  'izrail':     { english: ['angel of death','take soul'], roots: ['م و ت'] },
  'iblis':      { english: ['satan','devil','enemy','cursed'], roots: ['ب ل س','ش ي ط'] },
  'shaytan':    { english: ['satan','devil','evil','enemy'], roots: ['ش ي ط'] },
  'shaitan':    { english: ['satan','devil','evil'], roots: ['ش ي ط'] },
  'jinn':       { english: ['jinn','spirit beings','invisible beings'], roots: ['ج ن ن'] },
  'ins':        { english: ['mankind','humans','human beings'], roots: ['ا ن س'] },
  'insan':      { english: ['human being','mankind','person'], roots: ['ا ن س'] },
  'bashar':     { english: ['human','mortal','mankind'], roots: ['ب ش ر'] },

  // ── Scripture ────────────────────────────────────────────────────────────
  'injeel':     { english: ['gospel','bible','new testament'], roots: ['ن ج ل'] },
  'injil':      { english: ['gospel','bible'], roots: ['ن ج ل'] },
  'tawrat':     { english: ['torah','old testament','moses scripture'], roots: ['و ر ث'] },
  'taurat':     { english: ['torah','old testament'], roots: ['و ر ث'] },
  'zabur':      { english: ['psalms','psalms of david'], roots: ['ز ب ر'] },
  'wahy':       { english: ['revelation','inspire','divine revelation'], roots: ['و ح ي'] },
  'tanzeel':    { english: ['revelation','sent down','revealed'], roots: ['ن ز ل'] },
  'kitab':      { english: ['book','scripture','written record'], roots: ['ك ت ب'] },
  'furqan':     { english: ['criterion','distinguisher','quran'], roots: ['ف ر ق'] },
  'zikrullah':  { english: ['remembrance of allah','mention of allah'], roots: ['ذ ك ر'] },

  // ── Prophet names ─────────────────────────────────────────────────────────
  'nuh':        { english: ['noah','prophet noah','ark','flood'], roots: ['ن و ح'] },
  'ibrahim':    { english: ['abraham','prophet abraham','father of prophets'], roots: ['ب ر ه'] },
  'ismail':     { english: ['ishmael','prophet ishmael'], roots: ['س م ع'] },
  'ishaq':      { english: ['isaac','prophet isaac'], roots: ['س ح ق'] },
  'yaqub':      { english: ['jacob','prophet jacob','israel'], roots: ['ع ق ب'] },
  'yusuf':      { english: ['joseph','prophet joseph','egypt'], roots: ['ي س ف'] },
  'musa':       { english: ['moses','prophet moses','pharaoh','exodus'], roots: ['م و س'] },
  'harun':      { english: ['aaron','prophet aaron'], roots: ['ه ر ن'] },
  'dawud':      { english: ['david','prophet david','psalms','king'], roots: ['د و د'] },
  'sulayman':   { english: ['solomon','prophet solomon','king'], roots: ['س ل م'] },
  'isa':        { english: ['jesus','prophet jesus','mary son','messiah'], roots: ['ع ي س'] },
  'yahya':      { english: ['john the baptist','prophet john'], roots: ['ي ح ي'] },
  'zakariya':   { english: ['zechariah','prophet zechariah'], roots: ['ز ك ر'] },
  'ayyub':      { english: ['job','prophet job','affliction','patience'], roots: ['ا ي ب'] },
  'yunus':      { english: ['jonah','prophet jonah','whale','fish'], roots: ['ي و ن'] },
  'lut':        { english: ['lot','prophet lot','sodom'], roots: ['ل و ط'] },
  'shuaib':     { english: ['jethro','prophet shuaib','midian'], roots: ['ش ع ب'] },
  'hud':        { english: ['prophet hud','aad people'], roots: ['ه و د'] },
  'salih':      { english: ['prophet salih','thamud','camel'], roots: ['ص ل ح'] },
  'idris':      { english: ['enoch','prophet idris'], roots: ['د ر س'] },
  'dhulkifl':   { english: ['dhul kifl','ezekiel'], roots: ['ك ف ل'] },
  'ilyas':      { english: ['elijah','prophet elijah'], roots: ['ا ل ي'] },
  'alyasa':     { english: ['elisha','prophet elisha'], roots: ['ي س ع'] },
  'maryam':     { english: ['mary','virgin mary','mother of jesus'], roots: ['م ر ي'] },
  'adam':       { english: ['adam','first human','first man'], roots: ['ا د م'] },
  'hawwa':      { english: ['eve','adam wife'], roots: ['ح و ي'] },
  'luqman':     { english: ['luqman','wise man'], roots: ['ل ق م'] },
  'dhulqarnayn':{ english: ['dhul qarnayn','alexander','great king'], roots: ['ق ر ن'] },
  'asiya':      { english: ['asiya','wife of pharaoh'], roots: ['ا س ي'] },

  // ── Companions & figures ──────────────────────────────────────────────────
  'abu bakr':   { english: ['companion','truthful','caliph','siddiq'], roots: ['ص د ق'] },
  'umar':       { english: ['companion','second caliph','just'], roots: ['ع م ر'] },
  'uthman':     { english: ['companion','third caliph'], roots: ['ع ث م'] },
  'ali':        { english: ['companion','fourth caliph','cousin prophet'], roots: ['ع ل و'] },

  // ── Names of Allah ────────────────────────────────────────────────────────
  'rahman':     { english: ['most merciful','merciful','compassionate'], roots: ['ر ح م'] },
  'raheem':     { english: ['most merciful','merciful'], roots: ['ر ح م'] },
  'rahim':      { english: ['merciful','compassionate'], roots: ['ر ح م'] },
  'ghafur':     { english: ['forgiving','oft-forgiving'], roots: ['غ ف ر'] },
  'ghaffar':    { english: ['most forgiving','pardoning'], roots: ['غ ف ر'] },
  'hakeem':     { english: ['wise','all-wise'], roots: ['ح ك م'] },
  'aleem':      { english: ['all-knowing','knowing','omniscient'], roots: ['ع ل م'] },
  'qadeer':     { english: ['powerful','all-powerful'], roots: ['ق د ر'] },
  'aziz':       { english: ['mighty','honorable','exalted'], roots: ['ع ز ز'] },
  'karim':      { english: ['generous','noble','bountiful'], roots: ['ك ر م'] },
  'haleem':     { english: ['forbearing','clement'], roots: ['ح ل م'] },
  'tawwab':     { english: ['acceptor of repentance','forgiving'], roots: ['ت و ب'] },
  'wakeel':     { english: ['trustee','guardian','disposer'], roots: ['و ك ل'] },
  'wahhab':     { english: ['bestower','giver','grantor'], roots: ['و ه ب'] },
  'razzaq':     { english: ['provider','sustainer','bestower'], roots: ['ر ز ق'] },
  'fattah':     { english: ['opener','judge','victory'], roots: ['ف ت ح'] },
  'baseer':     { english: ['all-seeing','seeing'], roots: ['ب ص ر'] },
  'samee':      { english: ['all-hearing','hearing'], roots: ['س م ع'] },
  'malik':      { english: ['king','master','owner'], roots: ['م ل ك'] },
  'quddus':     { english: ['holy','pure','sanctified'], roots: ['ق د س'] },
  'mumin':      { english: ['granter of security','faithful'], roots: ['ا م ن'] },
  'jabbar':     { english: ['compeller','omnipotent'], roots: ['ج ب ر'] },
  'mutakabbir': { english: ['supreme','majestic'], roots: ['ك ب ر'] },
  'musawwir':   { english: ['fashioner','shaper of forms'], roots: ['ص و ر'] },

  // ── Quranic commands ─────────────────────────────────────────────────────
  'qul':          { english: ['say','command','commanded to say'], roots: ['ق و ل'] },

  // ── Groups / categories ──────────────────────────────────────────────────
  'muttaqoon':    { english: ['pious','god-conscious','righteous'], roots: ['و ق ي'] },
  'muttaqun':     { english: ['pious','righteous'], roots: ['و ق ي'] },
  'muttaqi':      { english: ['pious','god-fearing'], roots: ['و ق ي'] },
  'muhsineen':    { english: ['good doers','excellent deeds'], roots: ['ح س ن'] },
  'muhsinin':     { english: ['good doers'], roots: ['ح س ن'] },
  'muflihoon':    { english: ['successful','those who succeed'], roots: ['ف ل ح'] },
  'muflihun':     { english: ['successful','salvation'], roots: ['ف ل ح'] },
  'sadiqeen':     { english: ['truthful','sincere'], roots: ['ص د ق'] },
  'siddiqeen':    { english: ['most truthful','veracious'], roots: ['ص د ق'] },
  'sadihin':      { english: ['truthful','honest'], roots: ['ص د ق'] },
  'abrar':        { english: ['righteous','virtuous','good'], roots: ['ب ر ر'] },
  'rabbaniyin':   { english: ['godly scholars','learned in religion'], roots: ['ر ب ب'] },
  'ulul albab':   { english: ['people of understanding','people of intellect'], roots: ['ل ب ب'] },
  'ulul-albab':   { english: ['people of understanding'], roots: ['ل ب ب'] },
  'kafiroon':     { english: ['disbelievers','rejecters'], roots: ['ك ف ر'] },
  'fasiqoon':     { english: ['transgressors','disobedient'], roots: ['ف س ق'] },
  'zalimoon':     { english: ['wrongdoers','oppressors'], roots: ['ظ ل م'] },

  // ── Means / access / path concepts ──────────────────────────────────────
  // These were missing entirely and caused dangerous fuzzy-match collisions
  'waseela':    { english: ['waseela','intercession','seeking nearness to allah','draw close to allah'], roots: ['و س ل'] },
  'waseelah':   { english: ['waseelah','intercession','nearness to allah'], roots: ['و س ل'] },
  'wasila':     { english: ['wasila','intercession','nearness'], roots: ['و س ل'] },
  'wasilah':    { english: ['wasilah','draw near to allah'], roots: ['و س ل'] },
  'sabeel':     { english: ['path','way','road','sake of allah','fi sabilillah'], roots: ['س ب ل'] },
  'sabeelillah':{ english: ['path of allah','way of allah','cause of allah'], roots: ['س ب ل'] },
  'fi sabilillah': { english: ['in the way of allah','for allah sake','cause of allah'], roots: ['س ب ل'] },
  'manhaj':     { english: ['methodology','clear way','program'], roots: ['ن ه ج'] },
  'minhaj':     { english: ['clear path','methodology'], roots: ['ن ه ج'] },
  'suluk':      { english: ['conduct','behaviour','path','way of life'], roots: ['س ل ك'] },
  // ── Specific Quranic concepts ─────────────────────────────────────────────
  'amthal':       { english: ['parables','analogies','similitudes'], roots: ['م ث ل'] },
  'parable':      { english: ['analogy','similitude','example'], roots: ['م ث ل'] },
  'parables':     { english: ['analogies','similitudes'], roots: ['م ث ل'] },
  'ahd':          { english: ['covenant','promise','pledge','agreement'], roots: ['ع ه د'] },
  'mithaq':       { english: ['solemn covenant','pledge'], roots: ['م ي ث'] },
  'covenant':     { english: ['pledge','agreement','ahd'], roots: ['ع ه د','م ي ث'] },
  'birr':         { english: ['righteousness','piety','virtue','goodness'], roots: ['ب ر ر'] },
  'al-birr':      { english: ['true righteousness','piety'], roots: ['ب ر ر'] },
  'falah':        { english: ['success','prosperity','salvation'], roots: ['ف ل ح'] },
  'khusran':      { english: ['loss','ruin','failure','doom'], roots: ['خ س ر'] },
  'huzn':         { english: ['grief','sorrow','sadness','distress'], roots: ['ح ز ن'] },
  'khawf':        { english: ['fear','anxiety','apprehension'], roots: ['خ و ف'] },
  'zulumat':      { english: ['darkness','ignorance','disbelief'], roots: ['ظ ل م'] },
  'kalam':        { english: ['word','speech','discourse'], roots: ['ك ل م'] },
  'kalam allah':  { english: ['word of allah','speech of god'], roots: ['ك ل م'] },
  'muamalat':     { english: ['financial transactions','dealings','commerce'], roots: ['ع م ل','ب ي ع','ت ج ر','ع ق د'] },
  'yuhib':        { english: ['allah loves','loves'], roots: ['ح ب ب'] },
  'yuhibb':       { english: ['loves'], roots: ['ح ب ب'] },
  'la yuhibb':    { english: ['does not love','allah does not love'], roots: ['ح ب ب'] },
  'nabi':         { english: ['prophet','chosen one','prophethood'], roots: ['ن ب و'] },
  'rasool':       { english: ['messenger','apostle','envoy'], roots: ['ر س ل'] },
  'rasul':        { english: ['messenger','apostle'], roots: ['ر س ل'] },

  // ── Social concepts ───────────────────────────────────────────────────────
  'ummah':      { english: ['community','nation','muslim community','people'], roots: ['ا م م'] },
  'ahl':        { english: ['people','family','household'], roots: ['ا ه ل'] },
  'sunnah':     { english: ['tradition','way','practice','custom'], roots: ['س ن ن'] },
  'sirat':      { english: ['path','way','road','straight path'], roots: ['س ر ط'] },
  'siratal mustaqeem': { english: ['straight path','right way'], roots: ['س ر ط','ق و م'] },
  'amanah':     { english: ['trust','trustworthiness','responsibility'], roots: ['ا م ن'] },
  'adl':        { english: ['justice','fairness','equity'], roots: ['ع د ل'] },
  'haq':        { english: ['truth','right','just','correct'], roots: ['ح ق ق'] },
  'hikmah':     { english: ['wisdom','knowledge','understanding'], roots: ['ح ك م'] },
  'ilm':        { english: ['knowledge','learn','scholar'], roots: ['ع ل م'] },
  'rahmah':     { english: ['mercy','compassion','blessing'], roots: ['ر ح م'] },
  'nimah':      { english: ['blessing','bounty','favor','grace'], roots: ['ن ع م'] },
  'nimat':      { english: ['blessing','bounty'], roots: ['ن ع م'] },
  'azab':       { english: ['punishment','torment','suffering'], roots: ['ع ذ ب'] },
  'ghufraan':   { english: ['forgiveness','pardon'], roots: ['غ ف ر'] },
  'sadaqah':    { english: ['charity','alms','donation'], roots: ['ص د ق'] },
  'sadaqa':     { english: ['charity','donation'], roots: ['ص د ق'] },
  'khilafah':   { english: ['vicegerency','stewardship','successor'], roots: ['خ ل ف'] },
  'khalifah':   { english: ['vicegerent','successor','caliph'], roots: ['خ ل ف'] },
  'akhlaaq':    { english: ['character','morality','ethics','conduct'], roots: ['خ ل ق'] },
  'amr':        { english: ['command','order','matter','affair'], roots: ['ا م ر'] },
  'nahy':       { english: ['prohibition','forbid','stop'], roots: ['ن ه ي'] },
  'shura':      { english: ['consultation','counsel','mutual advice'], roots: ['ش و ر'] },
  'dawah':      { english: ['call to islam','invitation','preaching'], roots: ['د ع و'] },
  'tabligh':    { english: ['convey','preach','deliver message'], roots: ['ب ل غ'] },
  'jihad':      { english: ['strive','striving','effort','struggle'], roots: ['ج ه د'] },
  'ghaneemah':  { english: ['war booty','spoils of war'], roots: ['غ ن م'] },
  'hijaab':     { english: ['veil','covering','screen','barrier'], roots: ['ح ج ب'] },
  'hijab':      { english: ['veil','covering','barrier'], roots: ['ح ج ب'] },
  'pardah':     { english: ['veil','covering','modesty'], roots: ['ح ج ب'] },
  'awrah':      { english: ['modesty','private parts','covering'], roots: ['ع و ر'] },
  'israf':      { english: ['extravagance','waste','excess'], roots: ['س ر ف'] },
  'qanaat':     { english: ['contentment','sufficiency'], roots: ['ق ن ع'] },
  'tawadu':     { english: ['humility','humble'], roots: ['و ض ع'] },
  'karamah':    { english: ['honor','dignity','nobility'], roots: ['ك ر م'] },
  'izzah':      { english: ['honor','dignity','power','might'], roots: ['ع ز ز'] },

  // ── Quranic places ────────────────────────────────────────────────────────
  'makkah':     { english: ['mecca','holy city','kaaba'], roots: ['م ك ك'] },
  'mecca':      { english: ['mecca','holy city'], roots: ['م ك ك'] },
  'madinah':    { english: ['medina','city of prophet'], roots: ['م د ن'] },
  'masjid':     { english: ['mosque','place of worship','prostration'], roots: ['س ج د'] },
  'kaaba':      { english: ['kaaba','sacred house','holy house'], roots: ['ك ع ب'] },
  'bayt':       { english: ['house','sacred house','home'], roots: ['ب ي ت'] },
  'baytullah':  { english: ['house of allah','sacred house'], roots: ['ب ي ت'] },
  'arafah':     { english: ['arafat','pilgrimage','standing'], roots: ['ع ر ف'] },
  'safa':       { english: ['safa','marwa','pilgrimage'], roots: ['ص ف و'] },
  'marwa':      { english: ['marwa','safa','pilgrimage'], roots: ['م ر و'] },
  'egypt':      { english: ['egypt','pharaoh','land of pharaoh'], roots: ['م ص ر'] },
  'misr':       { english: ['egypt','land'], roots: ['م ص ر'] },
  'sham':       { english: ['syria','levant','blessed land'], roots: ['ش ا م'] },
  'tur':        { english: ['mount sinai','mount tur','moses'], roots: ['ط و ر'] },
  'sinai':      { english: ['mount sinai','sinai','moses'], roots: ['ط و ر'] },

  // ── Knowledge spectrum ────────────────────────────────────────────────────
  'fiqh':       { english: ['jurisprudence','deep understanding','religious knowledge','comprehension'], roots: ['ف ق ه'] },
  'tafaqquh':   { english: ['learning religion','gain deep understanding','comprehension'], roots: ['ف ق ه'] },
  'tafakkur':   { english: ['reflection','contemplation','deep thought','pondering'], roots: ['ف ك ر'] },
  'tadabbur':   { english: ['pondering the Quran','deep reflection','careful consideration'], roots: ['د ب ر'] },
  'basirah':    { english: ['insight','discernment','spiritual vision','inner sight'], roots: ['ب ص ر'] },
  'bayyinah':   { english: ['clear proof','manifest evidence','clear signs','plain truth'], roots: ['ب ي ن'] },
  'bayyinat':   { english: ['clear proofs','manifest evidence','clear signs'], roots: ['ب ي ن'] },
  'burhan':     { english: ['proof','evidence','argument','clear evidence','demonstration'], roots: ['ب ر ه'] },
  'zann':       { english: ['conjecture','assumption','speculation','mere supposition','guess'], roots: ['ظ ن ن'] },
  'wahm':       { english: ['illusion','delusion','false assumption','misconception'], roots: ['و ه م'] },
  'fikr':       { english: ['thought','thinking','reflection','intellect'], roots: ['ف ك ر'] },

  // ── Sacred numbers ─────────────────────────────────────────────────────────
  "sab'a":      { english: ['seven','sevenfold'], roots: ['س ب ع'] },
  'saba':       { english: ['seven','seven heavens'], roots: ['س ب ع'] },
  'arbaeen':    { english: ['forty','forty days','forty nights'], roots: ['ر ب ع'] },
  "arba'een":   { english: ['forty'], roots: ['ر ب ع'] },
  'tis\'a':     { english: ['nine','ninety-nine'], roots: ['ت س ع'] },

  // ── Prophet name alternates (common Urdu / English spellings) ─────────────
  'dawood':       { english: ['david','prophet david','psalms'], roots: ['د و د'] },
  'daud':         { english: ['david','prophet david'], roots: ['د و د'] },
  'yaqoob':       { english: ['jacob','prophet jacob','israel'], roots: ['ع ق ب'] },
  'yaqoub':       { english: ['jacob','prophet jacob'], roots: ['ع ق ب'] },
  'yousuf':       { english: ['joseph','prophet joseph','egypt'], roots: ['ي س ف'] },
  'yoosuf':       { english: ['joseph','prophet joseph'], roots: ['ي س ف'] },
  'yosef':        { english: ['joseph','prophet joseph'], roots: ['ي س ف'] },
  'haroon':       { english: ['aaron','prophet aaron'], roots: ['ه ر ن'] },
  'haaroon':      { english: ['aaron','prophet aaron'], roots: ['ه ر ن'] },
  'sulaiman':     { english: ['solomon','prophet solomon','king'], roots: ['س ل م'] },
  'suleiman':     { english: ['solomon','prophet solomon'], roots: ['س ل م'] },
  'ismaeel':      { english: ['ishmael','prophet ishmael'], roots: ['س م ع'] },
  'ismael':       { english: ['ishmael','prophet ishmael'], roots: ['س م ع'] },
  'ishmael':      { english: ['ishmael','prophet ishmael'], roots: ['س م ع'] },
  'ishaaq':       { english: ['isaac','prophet isaac'], roots: ['س ح ق'] },
  'ishak':        { english: ['isaac','prophet isaac'], roots: ['س ح ق'] },
  'saleh':        { english: ['prophet salih','thamud','camel'], roots: ['ص ل ح'] },
  'saalih':       { english: ['prophet salih','thamud'], roots: ['ص ل ح'] },
  'mariam':       { english: ['mary','virgin mary','mother of jesus'], roots: ['م ر ي'] },
  'marium':       { english: ['mary','virgin mary'], roots: ['م ر ي'] },
  'eesa':         { english: ['jesus','prophet jesus','messiah'], roots: ['ع ي س'] },
  'essa':         { english: ['jesus','prophet jesus'], roots: ['ع ي س'] },
  'moosa':        { english: ['moses','prophet moses','pharaoh'], roots: ['م و س'] },
  'moussa':       { english: ['moses','prophet moses'], roots: ['م و س'] },
  'nooh':         { english: ['noah','prophet noah','ark','flood'], roots: ['ن و ح'] },
  'noh':          { english: ['noah','prophet noah'], roots: ['ن و ح'] },
  'ibraheem':     { english: ['abraham','prophet abraham','father of prophets'], roots: ['ب ر ه'] },
  'younus':       { english: ['jonah','prophet jonah','whale'], roots: ['ي و ن'] },
  'younis':       { english: ['jonah','prophet jonah'], roots: ['ي و ن'] },
  'zakariyyah':   { english: ['zechariah','prophet zechariah'], roots: ['ز ك ر'] },
  'zakariyya':    { english: ['zechariah','prophet zechariah'], roots: ['ز ك ر'] },
  'ayub':         { english: ['job','prophet job','affliction','patience'], roots: ['ا ي ب'] },
  'aiyub':        { english: ['job','prophet job'], roots: ['ا ي ب'] },
  'shoaib':       { english: ['prophet shuaib','midian'], roots: ['ش ع ب'] },
  'shuayb':       { english: ['prophet shuaib','midian'], roots: ['ش ع ب'] },
  'idrees':       { english: ['enoch','prophet idris'], roots: ['د ر س'] },
  'idriss':       { english: ['enoch','prophet idris'], roots: ['د ر س'] },
  'loot':         { english: ['lot','prophet lot','sodom'], roots: ['ل و ط'] },

  // ── Common concept alternate spellings ────────────────────────────────────
  // Afterlife
  'jannat':       { english: ['paradise','garden','heaven','bliss'], roots: ['ج ن ن'] },
  'janah':        { english: ['paradise','heaven'], roots: ['ج ن ن'] },
  'jahannum':     { english: ['hell','hellfire','fire','punishment'], roots: ['ج ح م','ن ا ر'] },
  'jehannum':     { english: ['hell','hellfire'], roots: ['ج ح م','ن ا ر'] },
  'qiyamat':      { english: ['resurrection','day of judgment','last day'], roots: ['ق و م'] },
  'qiyama':       { english: ['resurrection','day of judgment'], roots: ['ق و م'] },
  'kiyamat':      { english: ['day of judgment','last day'], roots: ['ق و م'] },
  // Prayer / worship
  'sujud':        { english: ['prostration','prostrate','bow down'], roots: ['س ج د'] },
  'juma':         { english: ['friday','friday prayer','congregation'], roots: ['ج م ع'] },
  'jumua':        { english: ['friday','friday prayer'], roots: ['ج م ع'] },
  'azaan':        { english: ['call to prayer','adhan'], roots: ['ا ذ ن'] },
  'athan':        { english: ['call to prayer','adhan'], roots: ['ا ذ ن'] },
  'wuzu':         { english: ['ablution','purification','wash'], roots: ['و ض ا','ط ه ر'] },
  'ibadah':       { english: ['worship','servitude','devotion','obedience'], roots: ['ع ب د'] },
  'ibadat':       { english: ['worship','devotion','obedience'], roots: ['ع ب د'] },
  // Spiritual qualities
  'ehsan':        { english: ['excellence','perfection','good deeds','righteous'], roots: ['ح س ن'] },
  'tawhid':       { english: ['monotheism','oneness of allah','one god'], roots: ['و ح د'] },
  'tobah':        { english: ['repentance','repent','turn back to allah'], roots: ['ت و ب'] },
  'tauba':        { english: ['repentance','repent'], roots: ['ت و ب'] },
  'toba':         { english: ['repentance'], roots: ['ت و ب'] },
  'duaa':         { english: ['supplication','invoke','call upon','ask allah'], roots: ['د ع و'] },
  'doa':          { english: ['supplication','prayer to allah'], roots: ['د ع و'] },
  'shahid':       { english: ['martyr','witness'], roots: ['ش ه د'] },
  'shuhada':      { english: ['martyrs','witnesses'], roots: ['ش ه د'] },
  'sunna':        { english: ['tradition','way','practice','custom'], roots: ['س ن ن'] },
  // Knowledge / wisdom
  'rahma':        { english: ['mercy','compassion','blessing'], roots: ['ر ح م'] },
  'hikma':        { english: ['wisdom','knowledge','understanding'], roots: ['ح ك م'] },
  'hikmat':       { english: ['wisdom'], roots: ['ح ك م'] },
  'haqq':         { english: ['truth','right','just','correct'], roots: ['ح ق ق'] },
  'akhlaq':       { english: ['character','morality','ethics','conduct'], roots: ['خ ل ق'] },
  // Social / family
  'mehr':         { english: ['dowry','bridal gift','dower'], roots: ['م ه ر'] },
  'mahar':        { english: ['dowry','bridal gift'], roots: ['م ه ر'] },
  'yatim':        { english: ['orphan','fatherless child'], roots: ['ي ت م'] },
  'faqir':        { english: ['poor','impoverished','needy'], roots: ['ف ق ر'] },
  'miskeen':      { english: ['poor','destitute','needy'], roots: ['م س ك'] },
  'maskeen':      { english: ['poor','needy'], roots: ['م س ك'] },
  'izzat':        { english: ['honor','dignity','power'], roots: ['ع ز ز'] },
  // Negative traits
  'kaafir':       { english: ['disbeliever','unbeliever','rejecter'], roots: ['ك ف ر'] },
  'kuffar':       { english: ['disbelievers','rejecters'], roots: ['ك ف ر'] },
  'munafik':      { english: ['hypocrite','two-faced'], roots: ['ن ف ق'] },
  'gheeba':       { english: ['backbiting','slander','speak ill'], roots: ['غ ي ب'] },
  'takabur':      { english: ['arrogance','haughty','proud'], roots: ['ك ب ر'] },
};

/**
 * Addressees — groups that Allah directly addresses with a vocative.
 */
const ADDRESSEES = [
  {
    id: 'believers',
    label: 'Believers (يَا أَيُّهَا الَّذِينَ آمَنُوا)',
    keywords: [
      'believer','believers','believe','faithful','muslims','who have believed',
      'those who believe','those who believed','o you who believe','o believers',
    ],
    ar_patterns: ['يايها الذين امنوا'],
    description: 'Ayaat where Allah addresses the believers with يَا أَيُّهَا الَّذِينَ آمَنُوا',
  },
  {
    id: 'mankind',
    label: 'Mankind (يَا أَيُّهَا النَّاسُ)',
    keywords: [
      'mankind','humans','humanity','people','human beings','o people',
      'o mankind','o humanity','all people','all humans',
    ],
    ar_patterns: ['يايها الناس'],
    description: 'Ayaat where Allah addresses all of humanity with يَا أَيُّهَا النَّاسُ',
  },
  {
    id: 'disbelievers',
    label: 'Disbelievers (يَا أَيُّهَا الْكَافِرُونَ)',
    keywords: [
      'disbeliever','disbelievers','unbeliever','unbelievers','kafir','kuffar',
      'non believer','non-believer','non believers','non-believers','infidel',
    ],
    ar_patterns: ['يايها الكفرون','الذين كفروا'],
    description: 'Ayaat where Allah addresses disbelievers',
  },
  {
    id: 'prophet',
    label: 'The Prophet (يَا أَيُّهَا النَّبِيُّ)',
    keywords: [
      'prophet','messenger','muhammad','o prophet','o messenger','address prophet',
    ],
    ar_patterns: ['يايها النبي','يايها الرسول'],
    description: 'Ayaat where Allah directly addresses the Prophet ﷺ',
  },
  {
    id: 'people_of_book',
    label: 'People of the Book (يَا أَهْلَ الْكِتَابِ)',
    keywords: [
      'people of the book','people of scripture','ahl al kitab','ahl kitab',
      'jews','christians','o people of the book','scripture people',
    ],
    ar_patterns: ['ياهل الكتب'],
    description: 'Ayaat addressing Jews and Christians (People of Scripture)',
  },
  {
    id: 'children_of_adam',
    label: 'Children of Adam (يَا بَنِي آدَمَ)',
    keywords: [
      'children of adam','sons of adam','descendants of adam',
      'o children of adam','bani adam',
    ],
    ar_patterns: ['يبني ادم'],
    description: 'Ayaat addressing all human beings as children of Adam',
  },
  {
    id: 'children_of_israel',
    label: 'Children of Israel (يَا بَنِي إِسْرَائِيلَ)',
    keywords: [
      'children of israel','sons of israel','israelites','bani israel',
      'o children of israel','o sons of israel',
    ],
    ar_patterns: ['يبني اسريل'],
    description: 'Ayaat addressing the Children of Israel',
  },
  {
    id: 'hypocrites',
    label: 'Hypocrites (الْمُنَافِقُونَ)',
    keywords: [
      'hypocrite','hypocrites','munafiqoon','munafiqin','munafiq',
      'two-faced','nifaq','insincere',
    ],
    ar_patterns: ['المنفقون','المنفقين'],
    description: 'Ayaat about or addressing hypocrites',
  },
  {
    id: 'my_servants',
    label: "O My Servants (يَا عِبَادِي)",
    keywords: [
      'ya ibadi','ya ibad','ibadi','o my servants','my servants',
      'servants of god','servants of allah',
    ],
    ar_patterns: ['يا عبادي','ياعبادي'],
    description: "Ayaat where Allah directly addresses His servants with يَا عِبَادِي",
  },
];

/**
 * Topic concepts — thematic search domains with English keywords and Arabic roots.
 */
const TOPICS = [
  // ── Worship & Pillars ─────────────────────────────────────────────────────
  {
    id: 'prayer',
    label: 'Prayer (الصلاة)',
    keywords: [
      'prayer','pray','salah','salat','namaz','worship','prostrate','prostration',
      'bow','bowing','establish prayer','five prayers','friday prayer','jumuah',
      'call to prayer','adhan','iqamah','congregation',
    ],
    roots: ['ص ل و','ع ب د','س ج د','ر ك ع','ق و م'],
  },
  {
    id: 'fasting',
    label: 'Fasting (الصيام)',
    keywords: [
      'fast','fasting','sawm','siyam','soom','roza','ramadan',
      'abstain','iftar','suhoor','month of ramadan',
    ],
    roots: ['ص و م'],
  },
  {
    id: 'charity',
    label: 'Charity & Zakah (الزكاة والصدقة)',
    keywords: [
      'charity','zakat','zakah','alms','sadaqah','spend in the way of allah',
      'give to the poor','poor due','almsgiving','infaq','nafaq','donation',
    ],
    roots: ['ز ك و','ص د ق','ن ف ق'],
  },
  {
    id: 'pilgrimage',
    label: 'Pilgrimage (الحج)',
    keywords: [
      'pilgrimage','hajj','umrah','kaaba','mecca','ihram','tawaf',
      'arafat','sacrifice','sacred mosque',
    ],
    roots: ['ح ج ج','ط و ف'],
  },
  {
    id: 'purification',
    label: 'Purification (الطهارة)',
    keywords: [
      'purification','purity','pure','clean','ablution','wudu','ghusl',
      'tayammum','ritual bath','wash','unclean','impure',
    ],
    roots: ['ط ه ر','غ س ل','و ض ا'],
  },
  {
    id: 'dua',
    label: 'Supplication (الدعاء)',
    keywords: [
      'supplication','dua','invoke','invocation','call upon','ask allah',
      'pray to allah','beg allah','implore','plead','request from allah',
    ],
    roots: ['د ع و'],
  },
  {
    id: 'dhikr',
    label: 'Remembrance of Allah (الذكر)',
    keywords: [
      'remembrance','remember allah','dhikr','zikr','mention allah',
      'glorify','praise allah','tasbih','glorification',
    ],
    roots: ['ذ ك ر','س ب ح','ح م د'],
  },

  // ── Theology & Creed ──────────────────────────────────────────────────────
  {
    id: 'tawheed',
    label: 'Monotheism (التوحيد)',
    keywords: [
      'monotheism','oneness','one god','only god','tawheed','tauhid',
      'no deity except','lailahaillallah','none worthy of worship',
    ],
    roots: ['و ح د','ش ر ك','ا ل ه'],
  },
  {
    id: 'taqwa',
    label: 'God-Consciousness (التقوى)',
    keywords: [
      'taqwa','piety','righteous','god-fearing','god-consciousness',
      'fear allah','fear of allah','devout','righteousness',
    ],
    roots: ['و ق ي','ص ل ح'],
  },
  {
    id: 'iman',
    label: 'Faith & Belief (الإيمان)',
    keywords: [
      'faith','belief','believe','iman','trust in allah','conviction',
      'certainty','yaqeen','steadfast belief',
    ],
    roots: ['ا م ن','ي ق ن'],
  },
  {
    id: 'angels',
    label: 'Angels (الملائكة)',
    keywords: [
      'angels','angel','malaika','jibreel','gabriel','mikail','michael',
      'angel of death','heavenly beings','messenger angel',
    ],
    roots: ['م ل ك','ج ب ر'],
  },
  {
    id: 'divine_books',
    label: 'Divine Books (الكتب السماوية)',
    keywords: [
      'divine books','torah','tawrat','gospel','injeel','zabur','psalms',
      'scripture','revelation','holy book','sent down book','furqan',
    ],
    roots: ['ك ت ب','و ح ي','ن ز ل'],
  },
  {
    id: 'prophethood',
    label: 'Prophethood (النبوة)',
    keywords: [
      'prophet','messenger','apostle','revelation','message','sent','mission',
      'adam','ibrahim','abraham','noah','nuh','moses','musa','jesus','isa',
      'joseph','yusuf','david','dawud','solomon','sulayman','muhammad',
    ],
    roots: ['ن ب و','ر س ل','و ح ي'],
  },
  {
    id: 'divine_decree',
    label: 'Divine Decree (القدر)',
    keywords: [
      'divine decree','predestination','qadr','qadar','taqdeer','destiny',
      'fate','written','what allah wills','will of allah','appointed time',
    ],
    roots: ['ق د ر','ق ض ي','ا ج ل'],
  },

  // ── Eschatology ───────────────────────────────────────────────────────────
  {
    id: 'judgment_day',
    label: 'Day of Judgment (يوم القيامة)',
    keywords: [
      'judgment','day of judgment','resurrection','qiyamah','last day',
      'reckoning','account','deeds weighed','final hour','hour','day of recompense',
    ],
    roots: ['ق و م','ح س ب','ع ر ض','م ي ز'],
  },
  {
    id: 'paradise',
    label: 'Paradise (الجنة)',
    keywords: [
      'paradise','heaven','jannah','garden','bliss','hereafter reward',
      'eternal life','everlasting life','rivers beneath','gardens of eden',
    ],
    roots: ['ج ن ن','ف ر د س','خ ل د'],
  },
  {
    id: 'hellfire',
    label: 'Hellfire (النار / جهنم)',
    keywords: [
      'hell','hellfire','fire','jahannam','torment','punishment','blazing fire',
      'wrath','doom','eternal punishment','naar','burn','hellfire punishment',
    ],
    roots: ['ن ا ر','ج ح م','س ع ر','ع ذ ب'],
  },
  {
    id: 'resurrection',
    label: 'Resurrection (البعث)',
    keywords: [
      'resurrection','raised','rise again','life after death',
      'hereafter','akhirah','afterlife','barzakh','gathering','hashr',
    ],
    roots: ['ب ع ث','ن ش ر','ح ش ر'],
  },
  {
    id: 'intercession',
    label: 'Intercession (الشفاعة)',
    keywords: [
      'intercession','intercede','shafaa','pleading','advocate','no intercession',
    ],
    roots: ['ش ف ع'],
  },
  {
    id: 'scales',
    label: 'Scales of Deeds (الميزان)',
    keywords: [
      'scales','balance','weigh deeds','mizan','good deeds','bad deeds',
      'deeds recorded','book of deeds','record of deeds',
    ],
    roots: ['و ز ن','ح س ب','ك ت ب'],
  },

  // ── Virtues ───────────────────────────────────────────────────────────────
  {
    id: 'mercy',
    label: 'Mercy & Forgiveness (الرحمة والمغفرة)',
    keywords: [
      'mercy','compassion','merciful','compassionate','rahman','raheem','rahim',
      'forgiveness','forgive','pardon','forgiven','gracious','kind','rahmah',
    ],
    roots: ['ر ح م','غ ف ر','ع ف و','ت و ب'],
  },
  {
    id: 'patience',
    label: 'Patience (الصبر)',
    keywords: [
      'patience','patient','perseverance','endure','sabr','steadfast',
      'forbearance','bear with patience','endurance','withstand',
    ],
    roots: ['ص ب ر'],
  },
  {
    id: 'gratitude',
    label: 'Gratitude (الشكر)',
    keywords: [
      'gratitude','grateful','thankful','thankfulness','shukr',
      'give thanks','be grateful','show gratitude',
    ],
    roots: ['ش ك ر'],
  },
  {
    id: 'justice',
    label: 'Justice & Equity (العدل)',
    keywords: [
      'justice','just','fairness','equity','adl','be fair','deal justly',
      'establish justice','witness justly','judge fairly','equal','balance',
    ],
    roots: ['ع د ل','ق س ط'],
  },
  {
    id: 'truth',
    label: 'Truth & Honesty (الحق)',
    keywords: [
      'truth','true','honest','honesty','truthful','haq','speak truth',
      'truthfulness','sincere','sincerity',
    ],
    roots: ['ح ق ق','ص د ق','خ ل ص'],
  },
  {
    id: 'trust',
    label: 'Trust in Allah (التوكل)',
    keywords: [
      'trust in allah','reliance on allah','tawakkul','put trust','rely on allah',
      'depend on allah','sufficient for us is allah',
    ],
    roots: ['و ك ل'],
  },
  {
    id: 'humility',
    label: 'Humility (التواضع)',
    keywords: [
      'humility','humble','modest','lowly','meek','not arrogant',
      'bow in humility','soften heart','submissive',
    ],
    roots: ['خ ض ع','و ض ع','ذ ل ل'],
  },
  {
    id: 'love',
    label: 'Love (المحبة)',
    keywords: [
      'love','loves','beloved','affection','love of allah','love for allah',
      'loving','dear to allah','allah loves',
    ],
    roots: ['ح ب ب','و د د'],
  },
  {
    id: 'hope',
    label: 'Hope & Fear (الرجاء والخوف)',
    keywords: [
      'hope','hope in allah','fear allah','hope and fear',
      'aspire','long for','yearn','desire mercy',
    ],
    roots: ['ر ج و','خ و ف','ا م ل'],
  },

  // ── Vices ─────────────────────────────────────────────────────────────────
  {
    id: 'arrogance',
    label: 'Arrogance & Pride (الكبر)',
    keywords: [
      'arrogance','arrogant','pride','proud','haughty','kibr',
      'self-conceited','boastful','vain','contemptuous',
    ],
    roots: ['ك ب ر','ف خ ر','ع ج ب'],
  },
  {
    id: 'hypocrisy',
    label: 'Hypocrisy (النفاق)',
    keywords: [
      'hypocrisy','hypocrite','hypocrites','munafiq','munafiqoon',
      'nifaq','showing off','riya','dissimulation','two-faced',
    ],
    roots: ['ن ف ق','ر ا ي'],
  },
  {
    id: 'shirk',
    label: 'Polytheism & Shirk (الشرك)',
    keywords: [
      'shirk','polytheism','idolatry','associate partners','idol','idols',
      'partners with allah','mushrik','mushrikoon','worship others beside allah',
    ],
    roots: ['ش ر ك','و ث ن','ص ن م'],
  },
  {
    id: 'injustice',
    label: 'Injustice & Oppression (الظلم)',
    keywords: [
      'injustice','oppression','wrong','wrongdoer','zulm','transgress','transgressor',
      'oppress','oppressor','persecute','harm others','tyrant',
    ],
    roots: ['ظ ل م','ب غ ي','ع د و'],
  },
  {
    id: 'corruption',
    label: 'Corruption & Mischief (الفساد)',
    keywords: [
      'corruption','mischief','corrupt','spread corruption','fasad',
      'disorder','evil deeds','spread evil','mischief in land',
    ],
    roots: ['ف س د'],
  },
  {
    id: 'trials',
    label: 'Trials & Tribulations (الفتنة والابتلاء)',
    keywords: [
      'trial','tribulation','test','fitnah','fitna','tested','affliction',
      'hardship','difficulty','suffer','calamity','distress','test of faith',
    ],
    roots: ['ف ت ن','ب ل و','م ح ن'],
  },
  {
    id: 'sin',
    label: 'Sin & Wrongdoing (الذنب والخطأ)',
    keywords: [
      'sin','sins','sinful','wrongdoing','transgression','guilt','evil deed',
      'bad deeds','error','mistake','immoral','wicked','iniquity',
    ],
    roots: ['ذ ن ب','خ ط ا','ا ث م','ف ح ش'],
  },
  {
    id: 'backbiting',
    label: 'Backbiting & Slander (الغيبة والبهتان)',
    keywords: [
      'backbiting','slander','speak ill','gossip','defame','mock',
      'ridicule','insult','nickname','spy','suspicion',
    ],
    roots: ['غ ي ب','ن م م','ب ه ت','س خ ر'],
  },

  // ── Family & Social ───────────────────────────────────────────────────────
  {
    id: 'family',
    label: 'Family & Marriage (الأسرة والزواج)',
    keywords: [
      'marriage','husband','wife','family','children','parents','mother','father',
      'divorce','nikah','spouse','offspring','talaq','mahr','dowry',
    ],
    roots: ['ن ك ح','ط ل ق','و ل د','ا م م','ا ب و'],
  },
  {
    id: 'women',
    label: 'Women (المرأة)',
    keywords: [
      'women','woman','female','wife','wives','mother','daughters','sisters',
      'modesty','veil','hijab','rights of women','believing women',
    ],
    roots: ['ن س و','ا م ر','ح ج ب','م ر ا'],
  },
  {
    id: 'children',
    label: 'Children & Upbringing (الأطفال والتربية)',
    keywords: [
      'children','child','son','daughter','offspring','infant',
      'upbringing','education of children','rights of children',
    ],
    roots: ['و ل د','ب ن و','ر ب ب'],
  },
  {
    id: 'parents',
    label: 'Parents & Respect (الوالدان)',
    keywords: [
      'parents','mother','father','respect parents','honor parents',
      'obey parents','kindness to parents','good to parents',
    ],
    roots: ['و ل د','ا م م','ا ب و','ب ر ر'],
  },
  {
    id: 'inheritance',
    label: 'Inheritance (الميراث)',
    keywords: [
      'inheritance','inherit','estate','mirath','will','bequest',
      'division of property','share of inheritance','heirs',
    ],
    roots: ['و ر ث','ن ص ب'],
  },
  {
    id: 'orphans',
    label: 'Orphans (اليتامى)',
    keywords: [
      'orphan','orphans','fatherless','yateem','care for orphans',
      'guardianship','protect orphans','orphan property',
    ],
    roots: ['ي ت م'],
  },
  {
    id: 'neighbors',
    label: 'Neighbors & Community (الجيران)',
    keywords: [
      'neighbor','neighbors','community','near kin','treat kindly',
      'good relations','brotherhood','sisterhood','unity',
    ],
    roots: ['ج و ر','ا خ و','ق ر ب'],
  },

  // ── Finance & Law ─────────────────────────────────────────────────────────
  {
    id: 'usury',
    label: 'Usury / Interest (الربا)',
    keywords: [
      'usury','interest','riba','sood','unlawful gain','charging interest',
      'prohibited interest','lend','borrow','debt','loan',
    ],
    roots: ['ر ب و'],
  },
  {
    id: 'trade',
    label: 'Trade & Commerce (التجارة)',
    keywords: [
      'trade','commerce','business','merchant','buy','sell','market',
      'tijara','bay','contract','deal','transaction','price',
    ],
    roots: ['ت ج ر','ب ي ع','ع ق د'],
  },
  {
    id: 'halal_haram',
    label: 'Lawful & Unlawful (الحلال والحرام)',
    keywords: [
      'halal','haram','lawful','unlawful','permissible','forbidden',
      'allowed','prohibited','permitted','eat what is lawful','forbidden food',
    ],
    roots: ['ح ل ل','ح ر م'],
  },
  {
    id: 'food',
    label: 'Food & Drink (الطعام والشراب)',
    keywords: [
      'food','eat','drink','lawful food','forbidden food','alcohol',
      'wine','pork','slaughter','bismillah before eating',
    ],
    roots: ['ا ك ل','ش ر ب','ط ع م','ذ ب ح'],
  },
  {
    id: 'hudood',
    label: 'Prescribed Punishments (الحدود)',
    keywords: [
      'hudood','hudud','punishment','prescribed punishment','cutting hand',
      'theft punishment','adultery','lash','hadd','qisas','retaliation',
    ],
    roots: ['ح د د','ق ص ص'],
  },
  {
    id: 'contract',
    label: 'Contracts & Agreements (العقود)',
    keywords: [
      'contract','agreement','covenant','promise','oath','fulfill promise',
      'keep covenant','witnesses','documentation','write down',
    ],
    roots: ['ع ق د','ع ه د','و ع د','ك ت ب'],
  },

  // ── Knowledge & Guidance ──────────────────────────────────────────────────
  {
    id: 'knowledge',
    label: 'Knowledge & Wisdom (العلم والحكمة)',
    keywords: [
      'knowledge','knowing','wise','wisdom','aware','all knowing','omniscient',
      'learn','teach','inform','understand','ilm','hikmah','scholar','intellect',
    ],
    roots: ['ع ل م','ح ك م','خ ب ر','ف ق ه','ع ق ل'],
  },
  {
    id: 'guidance',
    label: 'Guidance (الهداية)',
    keywords: [
      'guidance','guide','right path','straight path','huda','hidayah',
      'sirat al mustaqeem','lead astray','misguide','right direction',
    ],
    roots: ['ه د ي','ض ل ل'],
  },
  {
    id: 'light',
    label: 'Light (النور)',
    keywords: [
      'light','noor','nur','divine light','luminous','enlighten',
      'light of allah','bring from darkness to light','illuminate',
    ],
    roots: ['ن و ر'],
  },
  {
    id: 'reading',
    label: 'Reading & Learning (القراءة والتعلم)',
    keywords: [
      'read','recite','quran recitation','reading','learn','study',
      'teach','pen','write','knowledge seeking',
    ],
    roots: ['ق ر ا','ع ل م','ق ل م','ك ت ب'],
  },

  // ── Creation & Nature ─────────────────────────────────────────────────────
  {
    id: 'creation',
    label: 'Creation (الخلق)',
    keywords: [
      'create','creation','creator','created','make','form','originate',
      'universe','heavens','earth','fashioned','brought into existence',
    ],
    roots: ['خ ل ق','ف ط ر','ب د ع','ص و ر'],
  },
  {
    id: 'nature_signs',
    label: 'Signs in Nature (آيات الكون)',
    keywords: [
      'signs','sign of allah','sun','moon','stars','rain','water','sky',
      'rivers','mountains','plants','animals','bees','honey','night','day',
      'seasons','wind','clouds','thunderbolt','lightning',
    ],
    roots: ['ش م س','ق م ر','م ط ر','ج ب ل','ن ج م','ب ح ر'],
  },
  {
    id: 'provision',
    label: 'Provision & Sustenance (الرزق)',
    keywords: [
      'provision','sustenance','livelihood','rizq','bounty','provide',
      'nourishment','food','bestow','grant provision','sustainer',
    ],
    roots: ['ر ز ق'],
  },
  {
    id: 'death',
    label: 'Death & Soul (الموت والروح)',
    keywords: [
      'death','die','soul','ruh','spirit','take soul','moment of death',
      'appointed time','ajal','angel of death','life and death','dying',
    ],
    roots: ['م و ت','ر و ح','ا ج ل'],
  },
  {
    id: 'time',
    label: 'Time (الزمان)',
    keywords: [
      'time','age','era','epoch','eon','century','era','asr','time by',
    ],
    roots: ['ع ص ر','ز م ن','د ه ر','و ق ت'],
  },

  // ── Stories & History ─────────────────────────────────────────────────────
  {
    id: 'stories_prophets',
    label: 'Stories of Prophets (قصص الأنبياء)',
    keywords: [
      'story','stories','narrative','tale','history','what happened to',
      'incident','prophet story','event','nation','destroyed nation','account',
    ],
    roots: ['ق ص ص','ن ب و'],
  },
  {
    id: 'pharaoh',
    label: 'Pharaoh & Egypt (فرعون)',
    keywords: [
      'pharaoh','firaun','firawn','egypt','musa and pharaoh',
      'oppressor','tyrant','drowned','exodus','plagues',
    ],
    roots: ['ف ر ع','م ص ر'],
  },
  {
    id: 'destroyed_nations',
    label: 'Destroyed Nations (الأمم الهالكة)',
    keywords: [
      'destroyed nation','aad','thamud','sodom','people of lut','ad',
      'punishment nations','previous nations','examples','lesson from history',
    ],
    roots: ['ع و د','ث م د','ه ل ك'],
  },

  // ── Inner Self ────────────────────────────────────────────────────────────
  {
    id: 'heart_soul',
    label: 'Heart & Soul (القلب والنفس)',
    keywords: [
      'heart','qalb','soul','nafs','inner self','spiritual heart','hard heart',
      'soft heart','disease in heart','purify soul','tranquility','peace of heart',
    ],
    roots: ['ق ل ب','ن ف س','ر و ح'],
  },
  {
    id: 'unseen',
    label: 'The Unseen (الغيب)',
    keywords: [
      'unseen','hidden','ghayb','ghaib','beyond perception','unknown','invisible',
      'knowledge of unseen','what is hidden',
    ],
    roots: ['غ ي ب'],
  },
  {
    id: 'satan',
    label: 'Satan & Evil (الشيطان)',
    keywords: [
      'satan','devil','iblis','shaytan','shaitan','enemy of adam','cursed',
      'evil whisper','waswas','footsteps of satan','tricks of satan',
    ],
    roots: ['ش ي ط','ب ل س'],
  },
  {
    id: 'jinn',
    label: 'Jinn (الجن)',
    keywords: [
      'jinn','jinni','invisible beings','created from fire','spirit beings',
      'believing jinn','mankind and jinn',
    ],
    roots: ['ج ن ن'],
  },
  {
    id: 'names_of_allah',
    label: "Names & Attributes of Allah (أسماء الله الحسنى)",
    keywords: [
      'names of allah','attributes of allah','asma ul husna','most beautiful names',
      'rahman','raheem','malik','quddus','salam','al aziz','al hakeem',
      'al aleem','al qadir','al karim','al ghafur','al tawwab',
    ],
    roots: ['ا س م','ر ح م','م ل ك','ع ل م','ق د ر'],
  },
  {
    id: 'throne',
    label: 'Throne of Allah (العرش والكرسي)',
    keywords: [
      'throne','arsh','kursi','footstool','seat of allah','throne verse',
      'ayat ul kursi','highest','dominant over creation',
    ],
    roots: ['ع ر ش','ك ر س'],
  },

  // ── Jihad & Defense ───────────────────────────────────────────────────────
  {
    id: 'jihad',
    label: 'Striving in the Way of Allah (الجهاد)',
    keywords: [
      'strive','striving','jihad','fight','battle','war','defend','path of allah',
      'in the way of allah','martyr','shaheed','fight oppression',
    ],
    roots: ['ج ه د','ق ت ل','س ب ل'],
  },
  {
    id: 'peace',
    label: 'Peace & Security (السلام والأمان)',
    keywords: [
      'peace','peaceful','salam','security','safety','tranquility',
      'reconcile','truce','cease conflict','harmony',
    ],
    roots: ['س ل م','ا م ن'],
  },

  // ── Ethics & Character ────────────────────────────────────────────────────
  {
    id: 'good_character',
    label: 'Good Character (حسن الخلق)',
    keywords: [
      'good character','morality','ethics','conduct','good manners',
      'kind','gentle','generous','courteous','noble character',
    ],
    roots: ['خ ل ق','ح س ن','ك ر م'],
  },
  {
    id: 'brotherhood',
    label: 'Brotherhood & Unity (الأخوة والوحدة)',
    keywords: [
      'brotherhood','sisterhood','unity','brothers in faith','reconcile','bond',
      'ummah unity','hold fast to rope of allah','together','community',
    ],
    roots: ['ا خ و','ج م ع','و ح د'],
  },
  {
    id: 'environment',
    label: 'Environment & Earth (البيئة والأرض)',
    keywords: [
      'earth','land','environment','do not corrupt','preserve','stewardship',
      'spread mischief on earth','caretaker','nature','ecosystem',
    ],
    roots: ['ا ر ض','ف س د','خ ل ف'],
  },
];

/**
 * Comprehensive set of terms the Quran uses to address or refer to human beings.
 * Grouped by category for the structured answer panel.
 * ar_patterns: normalized Arabic substrings to search in ayah text.
 */
const HUMAN_ADDRESS_TERMS = [

  // ── Direct Vocative Forms (يَا ...) ──────────────────────────────────────
  {
    id: 'ya_ayyuha_nas',
    label: 'O Mankind',
    ar: 'يَا أَيُّهَا النَّاسُ',
    ar_patterns: ['يايها الناس'],
    category: 'vocative',
  },
  {
    id: 'ya_ayyuha_ladhina_amanu',
    label: 'O Believers',
    ar: 'يَا أَيُّهَا الَّذِينَ آمَنُوا',
    ar_patterns: ['يايها الذين امنوا'],
    category: 'vocative',
  },
  {
    id: 'ya_ibadi',
    label: "O My Servants",
    ar: 'يَا عِبَادِي',
    ar_patterns: ['يا عبادي', 'ياعبادي'],
    category: 'vocative',
  },
  {
    id: 'ya_bani_adam',
    label: 'O Children of Adam',
    ar: 'يَا بَنِي آدَمَ',
    ar_patterns: ['يبني ادم'],
    category: 'vocative',
  },
  {
    id: 'ya_qawm',
    label: 'O My People',
    ar: 'يَا قَوْمِ',
    ar_patterns: ['يا قوم', 'ياقوم'],
    category: 'vocative',
  },
  {
    id: 'ya_ayyuha_insan',
    label: 'O Human Being',
    ar: 'يَا أَيُّهَا الْإِنسَانُ',
    ar_patterns: ['يايها الانسان'],
    category: 'vocative',
  },
  {
    id: 'ya_ayyuha_muzzammil',
    label: 'O Wrapped in Garments',
    ar: 'يَا أَيُّهَا الْمُزَّمِّلُ',
    ar_patterns: ['يايها المزمل'],
    category: 'vocative',
  },
  {
    id: 'ya_ayyuha_muddaththir',
    label: 'O Wrapped in a Cloak',
    ar: 'يَا أَيُّهَا الْمُدَّثِّرُ',
    ar_patterns: ['يايها المدثر'],
    category: 'vocative',
  },
  {
    id: 'ya_mashhar_jinn_ins',
    label: 'O Assembly of Jinn & Humans',
    ar: 'يَا مَعْشَرَ الْجِنِّ وَالْإِنسِ',
    ar_patterns: ['يا معشر الجن والانس'],
    category: 'vocative',
  },
  {
    id: 'ayyuha_thaqalan',
    label: 'O Two Weighty Beings',
    ar: 'أَيُّهَا الثَّقَلَانِ',
    ar_patterns: ['ايها الثقلان'],
    category: 'vocative',
  },
  {
    id: 'ya_ayyuha_kafirun',
    label: 'O Disbelievers',
    ar: 'يَا أَيُّهَا الْكَافِرُونَ',
    ar_patterns: ['يايها الكفرون', 'الذين كفروا'],
    category: 'vocative',
  },
  {
    id: 'ya_ahl_kitab',
    label: 'O People of the Book',
    ar: 'يَا أَهْلَ الْكِتَابِ',
    ar_patterns: ['ياهل الكتب'],
    category: 'vocative',
  },
  {
    id: 'ya_bani_israel',
    label: 'O Children of Israel',
    ar: 'يَا بَنِي إِسْرَائِيلَ',
    ar_patterns: ['يبني اسريل'],
    category: 'vocative',
  },
  {
    id: 'ya_ayyuha_nabi',
    label: 'O Prophet',
    ar: 'يَا أَيُّهَا النَّبِيُّ',
    ar_patterns: ['يايها النبي', 'يايها الرسول'],
    category: 'vocative',
  },

  // ── Reference Nouns (general terms for humans) ────────────────────────────
  {
    id: 'al_nas',
    label: 'Mankind',
    ar: 'النَّاسُ',
    ar_patterns: ['الناس'],
    category: 'noun',
  },
  {
    id: 'al_insan',
    label: 'The Human Being',
    ar: 'الْإِنسَانُ',
    ar_patterns: ['الانسان'],
    category: 'noun',
  },
  {
    id: 'al_ins',
    label: 'Humankind',
    ar: 'الْإِنسُ',
    ar_patterns: ['الانس'],
    category: 'noun',
  },
  {
    id: 'al_bashar',
    label: 'Mortals / Human Beings',
    ar: 'الْبَشَرُ',
    ar_patterns: ['البشر'],
    category: 'noun',
  },
  {
    id: 'al_ibad',
    label: "Allah's Servants",
    ar: 'الْعِبَادُ',
    ar_patterns: ['العباد'],
    category: 'noun',
  },
  {
    id: 'abd',
    label: 'A Servant',
    ar: 'عَبْدٌ',
    ar_patterns: ['عبد'],
    category: 'noun',
  },

  // ── Group Terms (named categories of people) ──────────────────────────────
  {
    id: 'al_muminun',
    label: 'Believers (m.)',
    ar: 'الْمُؤْمِنُونَ',
    ar_patterns: ['المومنون'],
    category: 'group',
  },
  {
    id: 'al_muminat',
    label: 'Believing Women',
    ar: 'الْمُؤْمِنَاتُ',
    ar_patterns: ['المومنات'],
    category: 'group',
  },
  {
    id: 'al_muslimun',
    label: 'Muslims (m.)',
    ar: 'الْمُسْلِمُونَ',
    ar_patterns: ['المسلمون'],
    category: 'group',
  },
  {
    id: 'al_muslimat',
    label: 'Muslim Women',
    ar: 'الْمُسْلِمَاتُ',
    ar_patterns: ['المسلمات'],
    category: 'group',
  },
  {
    id: 'alladhina_amanu',
    label: 'Those Who Believe',
    ar: 'الَّذِينَ آمَنُوا',
    ar_patterns: ['الذين امنوا'],
    category: 'group',
  },
  {
    id: 'ummah',
    label: 'Community / Nation',
    ar: 'أُمَّةٌ',
    ar_patterns: ['امه'],
    category: 'group',
  },
  {
    id: 'rijal',
    label: 'Men',
    ar: 'رِجَالٌ',
    ar_patterns: ['رجال'],
    category: 'group',
  },
  {
    id: 'nisa',
    label: 'Women',
    ar: 'نِسَاءٌ',
    ar_patterns: ['نساء'],
    category: 'group',
  },
  {
    id: 'dhurriyyah',
    label: 'Offspring / Descendants',
    ar: 'ذُرِّيَّةٌ',
    ar_patterns: ['ذريه'],
    category: 'group',
  },
  {
    id: 'ahl',
    label: 'People / Family',
    ar: 'أَهْلٌ',
    ar_patterns: ['اهل'],
    category: 'group',
  },

  // ── Qualitative Terms (people defined by understanding/insight) ────────────
  {
    id: 'ulu_albab',
    label: 'People of Understanding',
    ar: 'أُولُو الْأَلْبَابِ',
    ar_patterns: ['اولو الالباب'],
    category: 'qualitative',
  },
  {
    id: 'ulu_nuha',
    label: 'People of Intellect',
    ar: 'أُولُو النُّهَى',
    ar_patterns: ['اولو النهي'],
    category: 'qualitative',
  },
  {
    id: 'ulu_absar',
    label: 'People of Insight',
    ar: 'أُولُو الْأَبْصَارِ',
    ar_patterns: ['اولو الابصار'],
    category: 'qualitative',
  },
];

const HUMAN_TERM_CATEGORIES = {
  vocative:    'Direct Vocatives (يَا ...)',
  noun:        'Reference Nouns',
  group:       'Group Terms',
  qualitative: 'Qualitative Terms',
};

/**
 * Concept expansions — maps common English concept words to Arabic roots.
 * Generic (not query-specific): any query containing these words gets expanded roots.
 * Enables data-driven vocabulary lookup for "terms" answer panels.
 */
const CONCEPT_EXPANSIONS = {
  // ── Human beings ──────────────────────────────────────────────────────────
  'human beings': ['ب ش ر', 'ا ن س', 'ن ف س', 'ع ب د', 'ا م ن', 'س ل م'],
  'human being':  ['ب ش ر', 'ا ن س'],
  'human':        ['ب ش ر', 'ا ن س'],
  'mankind':      ['ا ن س', 'ب ش ر', 'ا م م'],
  'humanity':     ['ا ن س', 'ب ش ر', 'ن ف س'],
  'people':       ['ا ن س', 'ا م م'],
  'person':       ['ن ف س', 'ب ش ر'],
  'mortal':       ['ب ش ر', 'م و ت'],
  'creation':     ['خ ل ق', 'ف ط ر', 'ب د ع'],
  'creature':     ['خ ل ق', 'ب ش ر'],
  'servants':     ['ع ب د'],
  'servant':      ['ع ب د'],

  // ── Faith groups ──────────────────────────────────────────────────────────
  'believers':    ['ا م ن'],
  'believer':     ['ا م ن'],
  'muslims':      ['س ل م'],
  'muslim':       ['س ل م'],
  'disbelievers': ['ك ف ر'],
  'disbeliever':  ['ك ف ر'],
  'hypocrites':   ['ن ف ق'],
  'hypocrite':    ['ن ف ق'],
  'polytheists':  ['ش ر ك'],
  'righteous':    ['ص ل ح', 'ب ر ر'],

  // ── Worship ───────────────────────────────────────────────────────────────
  'worship':      ['ع ب د', 'ص ل و'],
  'prayer':       ['ص ل و', 'د ع و', 'س ج د', 'ر ك ع'],
  'supplication': ['د ع و'],
  'fasting':      ['ص و م'],
  'charity':      ['ص د ق', 'ز ك و', 'ن ف ق'],
  'alms':         ['ز ك و', 'ص د ق'],
  'pilgrimage':   ['ح ج ج', 'ط و ف'],
  'purification': ['ط ه ر', 'غ س ل'],
  'remembrance':  ['ذ ك ر'],

  // ── Character virtues ─────────────────────────────────────────────────────
  'patience':     ['ص ب ر'],
  'gratitude':    ['ش ك ر'],
  'mercy':        ['ر ح م'],
  'compassion':   ['ر ح م'],
  'forgiveness':  ['غ ف ر', 'ع ف و', 'ت و ب'],
  'repentance':   ['ت و ب', 'غ ف ر'],
  'justice':      ['ع د ل', 'ق س ط'],
  'honesty':      ['ص د ق'],
  'sincerity':    ['خ ل ص', 'ص د ق'],
  'trust':        ['و ك ل', 'ا م ن'],
  'humility':     ['خ ض ع', 'و ض ع'],
  'generosity':   ['ك ر م', 'ن ف ق'],

  // ── Vices ─────────────────────────────────────────────────────────────────
  'arrogance':    ['ك ب ر', 'ف خ ر'],
  'pride':        ['ك ب ر', 'ع ج ب'],
  'envy':         ['ح س د'],
  'injustice':    ['ظ ل م'],
  'oppression':   ['ظ ل م', 'ب غ ي'],
  'corruption':   ['ف س د'],
  'hypocrisy':    ['ن ف ق', 'ر ا ي'],
  'sin':          ['ذ ن ب', 'ا ث م', 'خ ط ا'],
  'wrongdoing':   ['ظ ل م', 'ا ث م'],

  // ── Theology ──────────────────────────────────────────────────────────────
  'faith':        ['ا م ن', 'ي ق ن'],
  'belief':       ['ا م ن'],
  'monotheism':   ['و ح د'],
  'oneness':      ['و ح د'],
  'knowledge':    ['ع ل م', 'ح ك م'],
  'wisdom':       ['ح ك م', 'ع ل م'],
  'guidance':     ['ه د ي'],
  'truth':        ['ح ق ق', 'ص د ق'],
  'light':        ['ن و ر'],
  'piety':        ['و ق ي', 'ص ل ح'],

  // ── Afterlife ─────────────────────────────────────────────────────────────
  'paradise':     ['ج ن ن', 'خ ل د'],
  'heaven':       ['ج ن ن'],
  'hell':         ['ن ا ر', 'ج ح م', 'ع ذ ب'],
  'hellfire':     ['ن ا ر', 'ج ح م'],
  'punishment':   ['ع ذ ب', 'ن ا ر'],
  'reward':       ['ا ج ر', 'ث و ب'],
  'judgment':     ['ق ض ي', 'ح س ب', 'ح ك م'],
  'resurrection': ['ب ع ث', 'ق و م', 'ح ش ر'],
  'death':        ['م و ت', 'ا ج ل'],
  'soul':         ['ن ف س', 'ر و ح'],
  'hereafter':    ['ا خ ر'],
  'intercession': ['ش ف ع'],

  // ── Social & family ───────────────────────────────────────────────────────
  'family':       ['ا ه ل', 'ا ب و', 'و ل د'],
  'parents':      ['و ل د', 'ا ب و'],
  'children':     ['و ل د', 'ب ن و'],
  'women':        ['ن س و', 'م ر ا'],
  'men':          ['ر ج ل', 'ذ ك ر'],
  'orphans':      ['ي ت م'],
  'marriage':     ['ن ك ح'],
  'divorce':      ['ط ل ق'],

  // ── Finance & law ─────────────────────────────────────────────────────────
  'usury':        ['ر ب و'],
  'interest':     ['ر ب و'],
  'trade':        ['ت ج ر', 'ب ي ع'],
  'inheritance':  ['و ر ث'],
  'lawful':       ['ح ل ل'],
  'forbidden':    ['ح ر م'],

  // ── Prophets & scripture ──────────────────────────────────────────────────
  'prophets':     ['ن ب و', 'ر س ل'],
  'messengers':   ['ر س ل'],
  'revelation':   ['و ح ي', 'ن ز ل'],
  'angels':       ['م ل ك'],
  'signs':        ['ا ي ي', 'خ ل ق'],
  'provision':    ['ر ز ق'],

  // ── Nature ────────────────────────────────────────────────────────────────
  'heaven and earth': ['س م و', 'ا ر ض'],
  'heavens':      ['س م و'],
  'earth':        ['ا ر ض'],
  'water':        ['م ا و'],

  // ── Quran / scripture ────────────────────────────────────────────────────
  'quran':        ['ق ر ا', 'ن ز ل', 'ك ت ب'],
  'scripture':    ['ك ت ب', 'ن ز ل'],
  'book':         ['ك ت ب'],
  'titles':       ['ا س م', 'ك ت ب'],
  'describes itself': ['ك ت ب', 'ن ز ل', 'ذ ك ر'],

  // ── Heart ──────────────────────────────────────────────────────────────
  'heart':        ['ق ل ب'],
  'hard heart':   ['ق ل ب', 'ق س و'],
  'hard hearts':  ['ق ل ب', 'ق س و'],
  'hardness':     ['ق س و'],
};

/**
 * Intent detection — what the user wants to do with the results.
 */
const INTENTS = {
  address:  ['address','addressed','addresses','call','called','say to','speak to',
              'term','terms','phrase','phrases','expression','expressions','vocative',
              'how does allah address','how does god address','what term','what terms',
              'what word','what phrase','what phrases','how addressed','ways to address',
              'ways allah','ways god','referred to as','known as','called by','uses to address',
              'used by quran','used to address','used for addressing'],
  command:  ['command','commanded','order','instruction','obligatory','must','prescribed',
              'duty','what are we ordered','told to','required to','mandatory'],
  forbid:   ['forbid','forbidden','prohibited','haram','not allowed','must not',
              'avoid','what is prohibited','what is not allowed'],
  reward:   ['reward','promise','good news','promised','paradise for','heaven for',
              'what reward','what is promised','what is the reward'],
  warn:     ['warn','warning','threat','consequence','punishment for','result of',
              'what happens if','what is the punishment','what does allah warn'],
  count:    ['how many','how many times','how often','count','frequency','number of times',
              'occurs','appear','appears','mentioned how many','times is','times does',
              'times mentioned','all mentions','total mentions','mentioned in quran',
              'number of ayat','number of verses','times it'],
  story:    ['story','stories','narrative','tale','history','what happened to',
              'incident','event','account of'],
  list:     ['list','enumerate','name all','what are the','give all','show all',
              'all the','all types','all ways','all terms','all groups',
              'all commands','all duas','all parables','all places','all instances',
              'all occurrences','list all','full list','complete list','every place',
              'wherever','all that mention','all that'],
};

/**
 * Binary concept pairs — complementary Quranic themes often queried together.
 *
 * When a query spans both poles of a binary (e.g. "light and darkness"),
 * parseQuery() pushes both root sets so the root-grouping layer naturally
 * separates results into two clearly labelled groups.
 *
 * Principle: no hardwired answers — the pair only broadens the ROOT set fed
 * to the retrieval engine. What appears in the results is still grounded in
 * what the Quran actually contains.
 *
 * pairA / pairB:
 *   label   — Quranic Arabic label (shown in group header)
 *   roots   — Arabic roots for this pole
 *   words   — raw Arabic word forms (normalizeArabic() is called on each in parseQuery)
 */
const BINARY_CONCEPTS = [
  {
    id: 'light_dark',
    phrases: [
      'light and dark','light vs dark','noor and zulmat','noor and zulumat',
      'light and darkness','nur and zulmat','light darkness',
      'noor darkness','zulumat and noor','noor and dark',
    ],
    pairA: { label: 'النور (Light)',          roots: ['ن و ر'],          words: ['النور','نور'] },
    pairB: { label: 'الظلمات (Darkness)',     roots: ['ظ ل م'],          words: ['الظلمات','ظلمات'] },
  },
  {
    id: 'jannah_naar',
    phrases: [
      'paradise and hell','heaven and hell','jannah and naar',
      'jannah and jahannam','jannah naar','garden and fire',
      'paradise and hellfire','heaven and hellfire','jannah and fire',
    ],
    pairA: { label: 'الجنة (Paradise)',       roots: ['ج ن ن'],          words: ['الجنة','جنات'] },
    pairB: { label: 'النار / جهنم (Hellfire)', roots: ['ن ا ر','ج ح م'],  words: ['النار','جهنم'] },
  },
  {
    id: 'iman_kufr',
    phrases: [
      'faith and disbelief','belief and unbelief','iman and kufr',
      'belief and kufr','iman kufr','faith disbelief','iman vs kufr',
      'believing and disbelieving','belief vs disbelief',
    ],
    pairA: { label: 'الإيمان (Faith)',        roots: ['ا م ن'],          words: ['الإيمان','آمنوا'] },
    pairB: { label: 'الكفر (Disbelief)',       roots: ['ك ف ر'],          words: ['الكفر','كفروا'] },
  },
  {
    id: 'guidance_misguidance',
    phrases: [
      'guidance and misguidance','huda and dalal','huda and dalalah',
      'guided and misguided','right path and wrong path',
      'guidance misguidance','hidayah and dalalah',
    ],
    pairA: { label: 'الهدى (Guidance)',        roots: ['ه د ي'],         words: ['الهدى','هدى'] },
    pairB: { label: 'الضلال (Misguidance)',    roots: ['ض ل ل'],         words: ['الضلال','ضلوا'] },
  },
  {
    id: 'ilm_jahl',
    phrases: [
      'knowledge and ignorance','ilm and jahl','knowing and not knowing',
      'those who know and those who do not','knowledge ignorance','ilm jahl',
      'who knows and who does not know',
    ],
    pairA: { label: 'العلم (Knowledge)',       roots: ['ع ل م'],         words: ['العلم','يعلمون'] },
    pairB: { label: 'الجهل (Ignorance)',       roots: ['ج ه ل'],         words: ['الجاهلين','جهل'] },
  },
  {
    id: 'sabr_shukr',
    phrases: [
      'patience and gratitude','sabr and shukr','patient and grateful',
      'sabr shukr','endurance and thankfulness',
    ],
    pairA: { label: 'الصبر (Patience)',        roots: ['ص ب ر'],         words: ['الصبر','صبروا'] },
    pairB: { label: 'الشكر (Gratitude)',       roots: ['ش ك ر'],         words: ['الشكر','يشكرون'] },
  },
  {
    id: 'rahmah_azab',
    phrases: [
      'mercy and punishment','rahma and azab','mercy and wrath',
      'compassion and punishment','hope and fear in quran',
      'reward and punishment','promise and warning',
    ],
    pairA: { label: 'الرحمة (Mercy)',          roots: ['ر ح م'],         words: ['الرحمة','رحمة'] },
    pairB: { label: 'العذاب (Punishment)',     roots: ['ع ذ ب'],         words: ['العذاب','عذاب'] },
  },
  {
    id: 'birr_ithm',
    phrases: [
      'righteousness and sin','birr and ithm','virtue and sin',
      'piety and sin','good and evil in quran',
    ],
    pairA: { label: 'البر (Righteousness)',    roots: ['ب ر ر'],         words: ['البر','أبرار'] },
    pairB: { label: 'الإثم (Sin)',             roots: ['ا ث م'],         words: ['الإثم','آثم'] },
  },
  {
    id: 'dhikr_ghafla',
    phrases: [
      'remembrance and heedlessness','dhikr and ghafla','remembrance and forgetfulness',
      'dhikr ghafla','mindfulness and heedlessness',
    ],
    pairA: { label: 'الذكر (Remembrance)',     roots: ['ذ ك ر'],         words: ['الذكر','ذكروا'] },
    pairB: { label: 'الغفلة (Heedlessness)',   roots: ['غ ف ل'],         words: ['الغافلين','غفلة'] },
  },
];

/**
 * Normalize Arabic text — mirrors the Python normalize_arabic() for consistent matching.
 * IMPORTANT: superscript alef (ٰ U+0670) is converted to regular alef before
 * the diacritic strip, because Quran encodes words like مُنَٰفِق with it.
 */
function normalizeArabic(text) {
  if (!text) return '';
  return text
    .replace(/ٰ/g, 'ا')   // superscript alef → regular alef
    .replace(/[ؐ-ًؚ-ٰۖ-ۜ۟-۪ۤۧۨ-ۭݿ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ء/g, '')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Fuzzy transliteration lookup — instead of manually adding every spelling
// variant, we:
//   1. Normalize both the query word and every TRANSLITERATIONS key to a
//      canonical form (collapse long vowels, doubled consonants, -ah endings).
//   2. Build a pre-computed index from canonical → entry at startup (O(1) later).
//   3. Fall back to Levenshtein fuzzy match (edit distance ≤ 2) so genuinely
//      misspelled words are still caught.
//
// This covers ALL past and future spelling variants automatically.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Collapse the most common Arabic-transliteration spelling variations to a
 * single canonical form, making comparisons spelling-invariant.
 *
 *   Long-vowel collapsing : aa→a, ee/iy/ey→i, oo/ou→u
 *   Doubled consonants    : kk→k, ll→l, nn→n, ss→s, rr→r, mm→m, tt→t, bb→b
 *   Taa-marbuta endings   : -ah/-at/-eh → -a  (rahmah→rahma, niyyah→niyya)
 *   Trailing silent h     : -uh → -u, -ih → -i
 */
function _normTranslit(s) {
  return s.toLowerCase()
    .replace(/aa/g, 'a')
    .replace(/ee|iy|ey/g, 'i')
    .replace(/oo|ou/g, 'u')
    .replace(/([bcdfghjklmnpqrstvwxyz])\1/g, '$1')  // doubled consonants → single
    .replace(/ah\b/g, 'a')
    .replace(/at\b/g, 'a')
    .replace(/uh\b/g, 'u')
    .replace(/ih\b/g, 'i');
}

/**
 * Levenshtein edit-distance (Wagner-Fischer).
 * Returns early when the length difference alone exceeds maxDist.
 */
function _editDistance(a, b, maxDist) {
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev = curr;
  }
  return prev[n];
}

/**
 * Extract the consonant skeleton of a transliterated word by removing all
 * pure vowels (a e i o u).  w and y are kept because in Arabic transliteration
 * they almost always represent actual consonants (و / ي).
 *
 * This is the linguistic gate for fuzzy matching: two words with different
 * consonant skeletons come from different Arabic roots and must NEVER be
 * treated as spelling variants of each other, no matter how similar they look.
 *
 * Examples:
 *   wasila  → wsl    (و س ل  — waseela, means/intercession)
 *   wasiya  → wsy    (و ص ي  — wasiyyah, will/bequest)  ← different root: BLOCKED
 *   tawakul → twkl   (تَوَكُّل — tawakkul)
 *   tawakal → twkl   ← same root: ALLOWED ✓
 *   rahma   → rhm    (ر ح م)
 *   rahmah  → rhm    ← same root: ALLOWED ✓
 */
function _consonants(s) {
  return s.replace(/[aeiou]/g, '');
}

// Build canonical-form → TRANSLITERATIONS entry at parse time (runs once).
// When multiple keys share the same canonical form the first one wins —
// which is always the "primary" spelling since TRANSLITERATIONS is
// ordered primary-first by convention.
const _TRANSLIT_CANON = (() => {
  const idx = {};
  for (const [key, val] of Object.entries(TRANSLITERATIONS)) {
    const canon = _normTranslit(key);
    if (!idx[canon]) idx[canon] = val;
  }
  return idx;
})();

/**
 * Look up a single query word against TRANSLITERATIONS using three passes:
 *   1. Exact key match
 *   2. Canonical-form match  (handles long-vowel / doubled-consonant variants)
 *   3. Root-safe fuzzy match — Levenshtein ≤ 1 (len 5-7) or ≤ 2 (len 8+),
 *      GATED by consonant-skeleton identity to prevent cross-root false positives.
 *
 *      The consonant gate is the critical fix: it ensures that words like
 *      "waseela" (root و س ل → skeleton wsl) never match "wasiyyah"
 *      (root و ص ي → skeleton wsy), even though they are edit-distance 1 apart.
 *
 * Returns { entry, key, confidence } where confidence is 'exact'|'canonical'|'fuzzy',
 * or null if no match.
 */
function _lookupTranslit(word) {
  if (!word || word.length < 4) return null;

  // Pass 1 — exact
  if (TRANSLITERATIONS[word]) return { entry: TRANSLITERATIONS[word], key: word, confidence: 'exact' };

  // Pass 2 — canonical form (collapses aa→a, ee→i, doubled consonants, -ah endings)
  const canon = _normTranslit(word);
  if (_TRANSLIT_CANON[canon]) {
    const origKey = Object.keys(TRANSLITERATIONS).find(k => _normTranslit(k) === canon) || word;
    return { entry: _TRANSLIT_CANON[canon], key: origKey, confidence: 'canonical' };
  }

  // Pass 3 — root-safe fuzzy match
  // Only runs for words long enough that a 1-char difference is meaningful.
  // GATE: candidate must share the same consonant skeleton as the query — this
  // ensures we only match within the same Arabic root family.
  if (word.length < 5) return null;
  const maxDist       = word.length >= 8 ? 2 : 1;
  const queryConsonants = _consonants(canon);

  let best = null, bestKey = null, bestDist = maxDist + 1;
  for (const [normKey, val] of Object.entries(_TRANSLIT_CANON)) {
    // ── Consonant-skeleton gate ───────────────────────────────────────────
    // If the consonant skeletons differ this is a different Arabic root — skip.
    if (_consonants(normKey) !== queryConsonants) continue;
    // ─────────────────────────────────────────────────────────────────────
    const d = _editDistance(canon, normKey, maxDist);
    if (d < bestDist) { bestDist = d; best = val; bestKey = normKey; }
  }
  if (!best) return null;
  const origKey = Object.keys(TRANSLITERATIONS).find(k => _normTranslit(k) === bestKey) || bestKey;
  return { entry: best, key: origKey, confidence: 'fuzzy' };
}

/**
 * Parse a natural-language query into a structured search request.
 */
function parseQuery(rawQuery) {
  const q = rawQuery.toLowerCase();

  // Normalise hyphens so al-hakeem / al hakeem / alhakeem all hit the same key
  const qNorm = q.replace(/-/g, ' ');

  const matched = {
    keywords:       [],
    arabicPatterns: [],
    roots:          [],
    intents:        [],
    addresseeIds:   [],
    topicIds:       [],
    exactWords:     [],   // normalized Arabic word-forms for exact-match boosting
    exactRoots:     [],   // fallback: TRANSLITERATIONS roots for the exact-matched terms
    exhaustive:     false, // true → caller should retrieve ALL matching ayaat (no top-N cutoff)
    binaryPairId:   null, // id of matched BINARY_CONCEPTS entry (for grouping hints)
    // Rich concept-mapping data for the concept-bridge UI panel:
    // Each entry: { key, label, arabicWords[], roots[], confidence, source }
    matchedConcepts: [],
  };

  // 1a. Expand concept words → roots (longest match first to avoid partial matches)
  const conceptKeys = Object.keys(CONCEPT_EXPANSIONS).sort((a, b) => b.length - a.length);
  for (const concept of conceptKeys) {
    const esc = concept.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp('(?:^|[^a-z])' + esc + '(?:$|[^a-z])', 'i').test(qNorm)) {
      for (const root of CONCEPT_EXPANSIONS[concept]) {
        if (!matched.roots.includes(root)) matched.roots.push(root);
      }
    }
  }

  // 1a-bis. Phrase agents — "people of X" / "those who X" maps to agent forms
  // (e.g. "people of taqwa" → المتقين, not just التقوى)
  for (const entry of Object.values(PHRASE_AGENTS)) {
    const hit = entry.phrases.some(p => q.includes(p.toLowerCase()));
    if (hit) {
      for (const w of entry.words) {
        const norm = normalizeArabic(w);
        if (norm && !matched.exactWords.includes(norm)) matched.exactWords.push(norm);
      }
      for (const root of (entry.roots || [])) {
        if (!matched.exactRoots.includes(root)) matched.exactRoots.push(root);
        if (!matched.roots.includes(root))      matched.roots.push(root);
      }
    }
  }

  // 1a-ter. Binary concept pairs — complementary Quranic themes queried together.
  // Pushes both poles' roots into matched.roots so root-based grouping separates them.
  for (const binary of BINARY_CONCEPTS) {
    if (binary.phrases.some(p => qNorm.includes(p))) {
      matched.binaryPairId = binary.id;
      for (const root of binary.pairA.roots) {
        if (!matched.roots.includes(root)) matched.roots.push(root);
      }
      for (const root of binary.pairB.roots) {
        if (!matched.roots.includes(root)) matched.roots.push(root);
      }
      // Push exact word forms for both poles to surface the most relevant ayaat
      for (const w of [...binary.pairA.words, ...binary.pairB.words]) {
        const norm = normalizeArabic(w);
        if (norm && !matched.exactWords.includes(norm)) matched.exactWords.push(norm);
      }
      break; // only one binary pair per query
    }
  }

  // 1b. Exact Arabic word forms — collected for precise word-level boosting
  const exactKeys = Object.keys(EXACT_WORDS).sort((a, b) => b.length - a.length);
  for (const term of exactKeys) {
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp('(?:^|[^a-z])' + esc + '(?:$|[^a-z])', 'i').test(qNorm)) {
      for (const word of EXACT_WORDS[term]) {
        const norm = normalizeArabic(word);
        if (norm && !matched.exactWords.includes(norm)) matched.exactWords.push(norm);
      }
      // Also collect roots from TRANSLITERATIONS for this same term — used as
      // fallback in search when word-form encoding mismatches prevent exact matching
      const transEntry = TRANSLITERATIONS[term];
      if (transEntry && transEntry.roots) {
        for (const root of transEntry.roots) {
          if (!matched.exactRoots.includes(root)) matched.exactRoots.push(root);
        }
      }
    }
  }

  // 1c. Expand transliterations → English keywords + roots
  //
  // Phase A — exact regex match for all keys (handles multi-word keys like
  //           'allahu akbar', 'la ilaha illallah', 'siratal mustaqeem').
  const _seenTranslitKeys = new Set();
  const _addConcept = (key, expansion, confidence, source) => {
    if (_seenTranslitKeys.has(key)) return;
    _seenTranslitKeys.add(key);

    // ── Core rule: Arabic-precise vs English-fallback ──────────────────────
    // When a term has specific Arabic word forms in EXACT_WORDS, those are
    // used for precise Quranic word matching (+30 score in search.js Step 6).
    // In that case, DO NOT also push English keywords into BM25 — doing so
    // causes severe result inflation because common English words like "means",
    // "medium", "access" appear in thousands of unrelated ayah translations.
    //
    // Example: 'waseela' has EXACT_WORDS → الوسيله, وسيله
    //   Without this guard: 'means' hits 3,939 ayaat via BM25
    //   With this guard:    only the 2 ayaat containing الوسيلة are found ✓
    //
    // English keywords are ONLY added when no exact Arabic form is known —
    // they serve as a fallback to catch thematic context the Arabic lookup
    // would miss.
    // Suppress English BM25 keywords when we have Arabic-level precision:
    // either explicit word forms (EXACT_WORDS) or Arabic roots.
    // English keywords are ONLY a fallback for entries with zero Arabic signal.
    const hasArabicPrecision = !!(
      (EXACT_WORDS[key] && EXACT_WORDS[key].length > 0) ||
      (expansion.roots && expansion.roots.length > 0)
    );
    if (!hasArabicPrecision) {
      for (const eng of expansion.english) {
        if (!matched.keywords.includes(eng)) matched.keywords.push(eng);
      }
    }

    for (const root of expansion.roots) {
      if (!matched.roots.includes(root)) matched.roots.push(root);
    }
    // Collect Arabic word forms for this concept from EXACT_WORDS (if available)
    const arabicWords = EXACT_WORDS[key] ? [...EXACT_WORDS[key]] : [];
    matched.matchedConcepts.push({ key, label: key, arabicWords, roots: expansion.roots, confidence, source });
  };

  for (const [term, expansion] of Object.entries(TRANSLITERATIONS)) {
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp('(?:^|\\s|[^a-z])' + esc + '(?:$|\\s|[^a-z])', 'i').test(qNorm)) {
      _addConcept(term, expansion, 'exact', 'transliteration');
    }
  }
  //
  // Phase B — fuzzy / canonical-form match on individual query words.
  // Catches spelling variants that exact regex missed (e.g. 'tawakal', 'dawood',
  // 'jannat', 'moosa') without requiring manual entry of every variant.
  const qTokens = qNorm.split(/\s+/);
  for (const token of qTokens) {
    if (token.length < 4) continue;
    const hit = _lookupTranslit(token);
    if (hit) {
      _addConcept(hit.key, hit.entry, hit.confidence === 'exact' ? 'exact' : 'concept', 'fuzzy-translit');
    }
  }

  // 1d. Detect intents
  for (const [intent, triggers] of Object.entries(INTENTS)) {
    if (triggers.some(t => q.includes(t))) matched.intents.push(intent);
  }

  // Whole-word match helper — prevents 'ad' matching inside 'address' etc.
  const kwMatch = kw => {
    const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(?:^|[^a-z])' + esc + '(?:$|[^a-z])', 'i').test(q);
  };

  // 3. Detect addressees
  for (const addr of ADDRESSEES) {
    if (addr.keywords.some(kwMatch)) {
      matched.addresseeIds.push(addr.id);
      matched.arabicPatterns.push(...addr.ar_patterns);
      // Record for bridge panel
      const arMatch = addr.label.match(/\(([^)]+)\)/);
      matched.matchedConcepts.push({
        key:         addr.id,
        label:       addr.label.replace(/\s*\([^)]*\)/, '').trim(),
        arabicWords: addr.ar_patterns,
        roots:       [],
        confidence:  'exact',
        source:      'addressee',
      });
    }
  }

  // 3b. Vocative shortcut — "O [addressee]" / "ya ayyuha..." short queries
  // These are ONLY asking for the direct address; don't dilute with generic BM25.
  // Solution: push the Arabic pattern into exactWords so Step 6 fires (+30, Quran-order)
  // and set exhaustive=true so the result set is trimmed to only those matches.
  const vocativePrefix = /^(o |ya ayyuha[l]?\s*|ya\s+ayyuhal\s+)/i;
  if (vocativePrefix.test(qNorm) && matched.addresseeIds.length > 0) {
    const afterPrefix = qNorm.replace(vocativePrefix, '').trim();
    const extraWords  = afterPrefix.split(/\s+/)
                          .filter(w => w.length > 2 && !STOP_WORDS.has(w));
    // Only activate when the query is essentially just "O <addressee name>"
    if (extraWords.length <= 2) {
      for (const addrId of matched.addresseeIds) {
        const addr = ADDRESSEES.find(a => a.id === addrId);
        if (addr) {
          for (const pat of addr.ar_patterns) {
            const norm = normalizeArabic(pat);
            if (norm && !matched.exactWords.includes(norm)) matched.exactWords.push(norm);
          }
        }
      }
      matched.exhaustive = true;
    }
  }

  // 4. Detect topics
  for (const topic of TOPICS) {
    const hits = topic.keywords.filter(kwMatch);
    if (hits.length > 0) {
      matched.topicIds.push(topic.id);
      matched.roots.push(...topic.roots);
      matched.keywords.push(...hits);
      // Record for bridge panel (only if not already covered by a transliteration)
      if (!matched.matchedConcepts.some(c => c.roots.some(r => topic.roots.includes(r)))) {
        const arMatch = topic.label.match(/\(([^)]+)\)/);
        matched.matchedConcepts.push({
          key:         topic.id,
          label:       topic.label.replace(/\s*\([^)]*\)/, '').trim(),
          arabicWords: arMatch ? [arMatch[1]] : [],
          roots:       topic.roots,
          confidence:  'concept',
          source:      'topic',
        });
      }
    }
  }

  // 5. Generic tokenization of remaining meaningful words
  const tokens = rawQuery
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));

  for (const t of tokens) {
    if (!matched.keywords.includes(t)) matched.keywords.push(t);
  }

  // 6. If the query contains Arabic characters, normalise and add directly to exactWords
  if (/[؀-ۿ]/.test(rawQuery)) {
    const arWords = normalizeArabic(rawQuery).split(/\s+/).filter(w => w.length > 1);
    for (const w of arWords) {
      if (!matched.exactWords.includes(w)) matched.exactWords.push(w);
    }
  }

  // 7. Exhaustive mode — user wants ALL instances (not just top-N by relevance)
  // Triggered by count/frequency intent words OR explicit "list all" / "all X" phrasing
  const exhaustiveTriggers = [
    'list all', 'all instances', 'how many times', 'how often',
    'collect all', 'all occurrences', 'all mentions', 'full list',
    'complete list', 'every time', 'each time', 'how many',
    'count all', 'all commands', 'all duas', 'all parables',
    'all qul', 'all places', 'wherever mentioned', 'total mentions',
    'times mentioned', 'times is', 'times does', 'all that mention',
    'all the', 'every instance', 'list every',
  ];
  // Use ||= so a vocative shortcut that already set exhaustive=true is preserved
  matched.exhaustive = matched.exhaustive || exhaustiveTriggers.some(t => q.includes(t));

  matched.keywords       = [...new Set(matched.keywords)];
  matched.arabicPatterns = [...new Set(matched.arabicPatterns)];
  matched.roots          = [...new Set(matched.roots)];

  return matched;
}
