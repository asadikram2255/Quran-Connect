/**
 * transliteration.js — common Roman transliterations of Arabic/Quranic and
 * Roman-Urdu terms, resolved to English search keywords and Arabic roots,
 * with spelling-variant tolerance.
 *
 * Extracted from search/js/concepts.js's TRANSLITERATIONS dictionary and its
 * matching functions (parseQuery's word-lookup pass) — that module is the
 * server-backed "Search Quran" natural-language search, which the Quranic-
 * term dictionary here has no dependency on (it's pure data + string
 * matching, no embeddings, no network). Pulling it out into its own file
 * lets every offline keyword search in the app — Explore Quran, Explore
 * Ayaah Connections, Read Through Roots — resolve "sabar"/"sabr", "salah"/
 * "salat"/"namaz", "wudu"/"wudhu", and the rest of this ~600-term dictionary
 * to the right Arabic root or English concept, without needing a server.
 *
 * Usage:
 *   QuranTranslit.lookup('sabr')
 *     → { entry: { english: [...], roots: ['ص ب ر'] }, key: 'sabr', confidence: 'exact' }
 *   QuranTranslit.lookup('sabar')   // spelling variant
 *     → same entry, confidence: 'canonical'
 *   QuranTranslit.lookup('sabbr')   // typo
 *     → same entry, confidence: 'fuzzy' (root-gated Levenshtein, see _lookupTranslit)
 *   QuranTranslit.lookup('xyz')     // no match
 *     → null
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QuranTranslit = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

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

  // ── Blessings upon the Prophet (Durood / Salawat) ─────────────────────────
  // Uses EXACT_WORDS (يصلون, صلوا, وسلموا, تسليما) for precise matching.
  // Roots kept narrow — only س ل م (peace/salutation), NOT ص ل و (general prayer)
  // which would flood results with all prayer-related ayaat.
  'durood':     { english: ['blessings upon prophet','send blessings','salutations','peace be upon him'], roots: ['س ل م'] },
  'darood':     { english: ['blessings upon prophet','send blessings','salutations'], roots: ['س ل م'] },
  'salawat':    { english: ['blessings upon prophet','send blessings','salutations','prayers upon prophet'], roots: ['س ل م'] },
  'salawaat':   { english: ['blessings upon prophet','send blessings'], roots: ['س ل م'] },

  // ── Pillars of Islam ──────────────────────────────────────────────────────
  'salah':      { english: ['prayer','pray','worship'], roots: ['ص ل و','ع ب د'] },
  'salat':      { english: ['prayer','pray','worship'], roots: ['ص ل و'] },
  'namaz':      { english: ['prayer','pray'], roots: ['ص ل و'] },
  'sawm':       { english: ['fasting','fast','abstain'], roots: ['ص و م'] },
  'siyam':      { english: ['fasting','fast'], roots: ['ص و م'] },
  'roza':       { english: ['fasting','fast'], roots: ['ص و م'] },
  'zakat':      { english: ['charity','alms','poor due','purification', 'purification tax', 'compulsory charity', 'obligatory charity', 'give alms', 'pay zakah', 'purifying dues'], roots: ['ز ك و','ن ف ق'] },
  'zakah':      { english: ['charity','alms','poor due'], roots: ['ز ك و'] },
  'hajj':       { english: ['pilgrimage','kaaba','mecca','sacred house', 'perform pilgrimage', 'pilgrimage to mecca', 'sacred journey', 'holy pilgrimage'], roots: ['ح ج ج'] },
  'umrah':      { english: ['pilgrimage','lesser pilgrimage'], roots: ['ع م ر'] },
  'shahadah':   { english: ['testimony','testify','witness','declaration of faith'], roots: ['ش ه د'] },

  // ── Purification ──────────────────────────────────────────────────────────
  'wudu':         { english: ['ablution','purification','wash','cleanse'], roots: ['و ض ا','ط ه ر'] },
  'wudhu':        { english: ['ablution','purification','wash'], roots: ['و ض ا','ط ه ر'] },
  'ghusl':        { english: ['ritual bath','purification','wash'], roots: ['غ س ل','ط ه ر'] },
  'tayammum':     { english: ['dry ablution','purification with dust'], roots: ['ي م م','ط ه ر'] },
  'tahara':       { english: ['purification','purity','clean'], roots: ['ط ه ر'] },
  'taharah':      { english: ['purification','purity','clean'], roots: ['ط ه ر'] },
  'najis':        { english: ['impure','unclean','filth'], roots: ['ن ج س'] },
  // Tazkiyah — spiritual purification of the soul (تزكية النفس)
  // Root: ز ك و (same as Zakat — growth/purification). Distinct from ط ه ر (ritual purity).
  'tazkiya':      { english: ['purification of soul','self-purification','spiritual growth','cleansing heart'], roots: ['ز ك و'] },
  'tazkiyah':     { english: ['purification of soul','spiritual purification','self-growth'], roots: ['ز ك و'] },
  'tazkiyya':     { english: ['purification of soul','spiritual purification'], roots: ['ز ك و'] },
  'tazkiyyah':    { english: ['purification of soul','self-purification'], roots: ['ز ك و'] },
  'tazkia':       { english: ['purification','self-purification','spiritual growth'], roots: ['ز ك و'] },
  'tazkiye':      { english: ['purification of soul','spiritual purification'], roots: ['ز ك و'] },
  'tazkiyae':     { english: ['purification of soul'], roots: ['ز ك و'] },
  'tazkiyat':     { english: ['purification','spiritual cleansing'], roots: ['ز ك و'] },
  'tazkiyatun':   { english: ['purification of soul'], roots: ['ز ك و'] },
  // Common Urdu compound forms — matched as whole phrases
  'tazkiya e nafs':  { english: ['purification of soul','spiritual self-development'], roots: ['ز ك و','ن ف س'] },
  'tazkiyah e nafs': { english: ['purification of soul','spiritual growth'], roots: ['ز ك و','ن ف س'] },
  'tazkiye nafs':    { english: ['purification of soul'], roots: ['ز ك و','ن ف س'] },

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

  // ── Forerunners / Sabiqun ─────────────────────────────────────────────────
  'sabiqun':    { english: ['forerunners','foremost','pioneers','first in faith'], roots: ['س ب ق'] },
  'sabiqeen':   { english: ['forerunners','foremost believers','those who are first'], roots: ['س ب ق'] },
  'saabiqun':   { english: ['forerunners','foremost','first'], roots: ['س ب ق'] },
  'saabiqeen':  { english: ['forerunners','foremost','first in faith'], roots: ['س ب ق'] },
  'as-sabiqun': { english: ['the forerunners','the foremost','the first'], roots: ['س ب ق'] },

  // ── Greeting & Peace ───────────────────────────────────────────────────────
  'salam':      { english: ['peace','greeting','safety','security','submission'], roots: ['س ل م'] },
  'salaam':     { english: ['peace','greeting','safety','security'], roots: ['س ل م'] },
  'assalamu alaikum': { english: ['peace be upon you','greeting'], roots: ['س ل م'] },

  // ── Spiritual qualities ───────────────────────────────────────────────────
  'taqwa':      { english: ['piety','righteousness','god-fearing','devout','god-consciousness', 'ward off evil', 'those who ward off evil', 'god conscious', 'those who guard themselves', 'those who guard against evil', 'righteous ones', 'pious ones', 'devout ones', 'those who are pious', 'those who are righteous', 'those who fear allah', 'those who fear god', 'guarding oneself from evil', 'avoiding evil', 'refraining from evil', 'mindful', 'consciousness of god'], roots: ['و ق ي'] },
  'iman':       { english: ['faith','belief','believe','trust', 'those who believe', 'we believe', 'have faith', 'the believers', 'true faith', 'sincere faith', 'firm belief', 'trust in allah'], roots: ['ا م ن'] },
  'ihsan':      { english: ['excellence','perfection','good deeds','righteous', 'those who do good', 'doers of good', 'those who excel', 'those who act beautifully', 'excellence in deeds', 'those who are good'], roots: ['ح س ن'] },
  'ikhlas':     { english: ['sincerity','sincere','purely for allah', 'exclusive devotion', 'those who are sincere', 'devoted exclusively'], roots: ['خ ل ص'] },
  'tawakkul':   { english: ['trust in allah','reliance','put trust','depend on allah', 'place trust', 'rely on allah', 'entrust', 'those who put their trust', 'those who rely on allah', 'repose trust', 'place reliance'], roots: ['و ك ل'] },
  'tawakkal':   { english: ['trust in allah','reliance'], roots: ['و ك ل'] },
  'tawakal':    { english: ['trust in allah','reliance','depend on allah'], roots: ['و ك ل'] },
  'tawakul':    { english: ['trust in allah','reliance'], roots: ['و ك ل'] },
  'tawakol':    { english: ['trust in allah','reliance'], roots: ['و ك ل'] },
  'sabr':       { english: ['patience','patient','perseverance','steadfast','endure', 'persevere', 'steadfastness', 'those who are patient', 'bearing with patience', 'constancy', 'fortitude', 'remain firm'], roots: ['ص ب ر'] },
  'shukr':      { english: ['gratitude','grateful','thankful', 'thankfulness', 'give thanks', 'those who are grateful', 'those who give thanks', 'be thankful', 'expressing gratitude'], roots: ['ش ك ر'] },
  'tawbah':     { english: ['repentance','repent','turn back to allah', 'turn back', 'turn to allah', 'seek forgiveness', 'those who repent', 'those who turn back', 'returning in repentance', 'turning in repentance', 'return to allah'], roots: ['ت و ب'] },
  'tawba':      { english: ['repentance','repent'], roots: ['ت و ب'] },
  'istighfar':  { english: ['seek forgiveness','ask forgiveness','repent'], roots: ['غ ف ر'] },
  'dua':        { english: ['supplication','invoke','call upon','ask allah', 'supplicate', 'pray to', 'appeal', 'make invocation', 'call out to', 'appeal to allah', 'beseech', 'implore'], roots: ['د ع و'] },
  'dhikr':      { english: ['remembrance of allah','remember allah','mention allah', 'remember', 'remembrance', 'mention', 'remind', 'those who remember', 'commemorate', 'keep in mind', 'call to mind', 'recollect'], roots: ['ذ ك ر'] },
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
  'kufr':       { english: ['disbelief','reject faith','deny','ingratitude', 'disbelieve', 'disbelievers', 'those who disbelieve', 'ungrateful', 'those who reject faith', 'deniers', 'those who deny', 'infidels', 'rejectors', 'those who cover up truth'], roots: ['ك ف ر'] },
  'kafir':      { english: ['disbeliever','unbeliever','rejecter'], roots: ['ك ف ر'] },
  'nifaq':      { english: ['hypocrisy','hypocrite','two-faced', 'hypocrites', 'those who beguile', 'those who deceive', 'pretenders', 'those who make pretense', 'double-faced', 'those who show off', 'insincerity'], roots: ['ن ف ق'] },
  'munafiq':    { english: ['hypocrite','two-faced','insincere'], roots: ['ن ف ق'] },
  'shirk':      { english: ['polytheism','associating partners','idolatry','idol', 'idols', 'altars', 'associates', 'those who associate partners', 'polytheists', 'idolaters', 'false gods', 'worship others besides allah', 'partners with allah'], roots: ['ش ر ك'] },
  'mushrik':    { english: ['polytheist','idolater','associating partners'], roots: ['ش ر ك'] },
  'kibr':       { english: ['arrogance','pride','haughty','proud'], roots: ['ك ب ر'] },
  'hasad':      { english: ['envy','jealousy','malice'], roots: ['ح س د'] },
  'zulm':       { english: ['injustice','oppression','wrong','transgress', 'wrongdoers', 'oppressors', 'those who wrong', 'unjust ones', 'those who oppress', 'transgressors', 'those who do wrong', 'those who are unjust', 'evil-doers'], roots: ['ظ ل م'] },
  'zulum':      { english: ['injustice','oppression','wrong'], roots: ['ظ ل م'] },
  'fasad':      { english: ['corruption','mischief','spread corruption', 'mischief makers', 'those who make mischief', 'corrupters', 'those who corrupt', 'cause disorder', 'those who cause mischief'], roots: ['ف س د'] },
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
  'nafs':       { english: ['soul','self','ego','inner self','person','individual','own self','every soul','each person'], roots: ['ن ف س'] },
  'qalb':       { english: ['heart','spiritual heart','mind'], roots: ['ق ل ب'] },
  'noor':       { english: ['light','divine light','guidance'], roots: ['ن و ر'] },
  'nur':        { english: ['light','divine light'], roots: ['ن و ر'] },
  'huda':       { english: ['guidance','guide','right path'], roots: ['ه د ي'] },
  'hidayah':    { english: ['guidance','guide','right path'], roots: ['ه د ي'] },
  'ghayb':      { english: ['unseen','hidden','unknown', 'secret', 'invisible', 'that which is hidden', 'the unseen', 'matters of the unseen', 'knowledge of the unseen', 'unknown to senses'], roots: ['غ ي ب'] },
  'ghaib':      { english: ['unseen','hidden'], roots: ['غ ي ب'] },
  'barakah':    { english: ['blessing','bounty','abundance', 'blessed', 'blessings', 'full of blessings', 'blessed land', 'abundant in blessings', 'give blessings to', 'bestow blessings'], roots: ['ب ر ك'] },
  'baraka':     { english: ['blessing','bless'], roots: ['ب ر ك'] },
  'rizq':       { english: ['provision','sustenance','livelihood','bounty', 'provided', 'bestowed', 'provisions', 'blessed with livelihood', 'daily bread', 'sustains', 'provides livelihood', 'endowed with livelihood', 'given provision', 'bestows provision', 'bestows sustenance'], roots: ['ر ز ق'] },
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
  'qiyamah':    { english: ['resurrection','day of judgment','last day', 'day of resurrection', 'day of standing', 'day they are raised', 'the great day', 'day of gathering'], roots: ['ق و م'] },
  'akhirah':    { english: ['hereafter','afterlife','next life', 'life after death', 'the next life', 'the other world', 'life to come', 'everlasting life', 'eternal life', 'the world to come'], roots: ['ا خ ر'] },
  'akhira':     { english: ['hereafter','afterlife'], roots: ['ا خ ر'] },
  'jannah':     { english: ['paradise','garden','heaven','bliss', 'gardens', 'garden of paradise', 'rivers flowing beneath', 'everlasting life', 'eternal life', 'gardens of eden', 'abiding therein forever', 'permanent abode', 'eternal home'], roots: ['ج ن ن'] },
  'jahannam':   { english: ['hell','hellfire','fire','punishment'], roots: ['ج ح م','ن ا ر'] },
  'naar':       { english: ['fire','hellfire', 'blazing fire', 'burning fire', 'those in the fire', 'hell fire', 'the fire', 'torment of fire', 'punishment of fire'], roots: ['ن ا ر'] },
  'barzakh':    { english: ['barrier','intermediate state'], roots: ['ب ر ز'] },
  'shafaa':     { english: ['intercession','intercede','pleading'], roots: ['ش ف ع'] },
  'shafaah':    { english: ['intercession','intercede'], roots: ['ش ف ع'] },
  'mizan':      { english: ['scales','balance','weigh deeds'], roots: ['و ز ن'] },
  'hashr':      { english: ['gathering','assembly'], roots: ['ح ش ر'] },
  'hisab':      { english: ['reckoning','account','judgment', 'accounting', 'settled account', 'day of reckoning', 'settle accounts', 'called to account', 'taken to account'], roots: ['ح س ب'] },
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
  'wahy':       { english: ['revelation','inspire','divine revelation', 'revealed', 'what was revealed', 'inspired', 'revealed to', 'send down revelation'], roots: ['و ح ي'] },
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
  'ghafur':     { english: ['forgiving','oft-forgiving', 'forgive', 'most forgiving', 'pardon', 'pardonable', 'forgiver', 'all-forgiving', 'forgiveness', 'seeks forgiveness'], roots: ['غ ف ر'] },
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
  'nabi':         { english: ['prophet','chosen one','prophethood', 'prophets', 'those who prophesy', 'messenger of allah', 'envoy of allah', 'sent by allah'], roots: ['ن ب و'] },
  'rasool':       { english: ['messenger','apostle','envoy'], roots: ['ر س ل'] },
  'rasul':        { english: ['messenger','apostle'], roots: ['ر س ل'] },

  // ── Common Urdu search terms ──────────────────────────────────────────────

  // World & life
  'duniya':     { english: ['world','worldly life','this world','temporary world','material world'], roots: ['د ن و', 'ح ي ي'] },
  'amal':       { english: ['deeds','actions','good deeds','righteous deeds','works'], roots: ['ع م ل'] },
  'dil':        { english: ['heart','mind','soul','inner self'], roots: ['ق ل ب'] },
  'sukoon':     { english: ['peace','tranquility','comfort','contentment','rest','serenity'], roots: ['س ك ن', 'ط م ن'] },
  'itminan':    { english: ['contentment','peace of heart','reassurance','serenity'], roots: ['ط م ن'] },
  'umeed':      { english: ['hope','expectation','wish','aspiration'], roots: ['ر ج و', 'ا م ل'] },
  'salamti':    { english: ['safety','wellbeing','security','soundness'], roots: ['س ل م', 'ا م ن'] },
  'daulat':     { english: ['wealth','riches','treasure','property','affluence'], roots: ['م ا ل', 'ث ر و'] },
  'izzat':      { english: ['honour','dignity','respect','prestige'], roots: ['ع ز ز', 'ك ر م'] },
  'dhillat':    { english: ['humiliation','disgrace','lowliness','abasement'], roots: ['ذ ل ل', 'خ ز ي'] },

  // Emotions
  'muhabbat':   { english: ['love','affection','fondness','devotion','deep love'], roots: ['ح ب ب', 'و د د'] },
  'ulfat':      { english: ['love','affection','intimacy','fondness'], roots: ['ا ل ف', 'ح ب ب'] },
  'gham':       { english: ['grief','sorrow','sadness','distress','affliction'], roots: ['ح ز ن', 'غ م م'] },
  'khushi':     { english: ['happiness','joy','delight','pleasure'], roots: ['ف ر ح', 'س ر ر'] },

  // Worship & practice
  'bandagi':    { english: ['worship','servitude','devotion','obedience to allah','slavery to allah'], roots: ['ع ب د'] },
  'banda':      { english: ['servant','slave of allah','worshipper','human being'], roots: ['ع ب د'] },
  'tilawat':    { english: ['recitation of quran','reading quran','quran recitation'], roots: ['ت ل و', 'ق ر ا'] },
  'taraweeh':   { english: ['night prayers in ramadan','ramadan prayers','extra night prayers'], roots: ['ص ل و', 'ق و م'] },
  'tehajjud':   { english: ['night vigil prayer','late night prayer','optional night prayer'], roots: ['ه ج د', 'ص ل و'] },
  'qurbani':    { english: ['sacrifice','animal sacrifice','eid sacrifice','slaughter for allah'], roots: ['ق ر ب', 'ذ ب ح'] },
  'zabiha':     { english: ['slaughtered animal','halal slaughter','sacrifice'], roots: ['ذ ب ح'] },
  'eid':        { english: ['celebration','festival','eid ul fitr','eid ul adha'], roots: ['ع ي د', 'ف ط ر'] },
  'khatam':     { english: ['seal','completion','end','finish','seal of prophets'], roots: ['خ ت م'] },
  'khatimah':   { english: ['ending','conclusion','seal','final outcome'], roots: ['خ ت م'] },
  'janazah':    { english: ['funeral prayer','funeral','funeral rites','prayer for the dead'], roots: ['ص ل و', 'م و ت'] },
  'wafat':      { english: ['death','passing away','natural death'], roots: ['و ف ي', 'م و ت'] },
  'kafan':      { english: ['burial shroud','shroud','white cloth for burial'], roots: ['م و ت', 'ق ب ر'] },
  'dafan':      { english: ['burial','to bury','interment'], roots: ['ق ب ر', 'م و ت'] },

  // Fiqh categories
  'halaal':     { english: ['permissible','lawful','allowed','permitted in islam'], roots: ['ح ل ل'] },
  'haraam':     { english: ['forbidden','prohibited','unlawful','not permitted'], roots: ['ح ر م'] },
  'makrooh':    { english: ['disliked','discouraged','reprehensible','detestable'], roots: ['ك ر ه'] },
  'farz':       { english: ['obligatory','mandatory','compulsory duty','religious obligation'], roots: ['ف ر ض', 'و ج ب'] },
  'wajib':      { english: ['obligatory','necessary','required','compulsory'], roots: ['و ج ب'] },
  'sunnat':     { english: ['prophetic tradition','sunnah','way of the prophet','recommended'], roots: ['س ن ن'] },
  'mustahab':   { english: ['recommended','praiseworthy','preferred','desirable'], roots: ['ح ب ب', 'ن د ب'] },
  'mubah':      { english: ['permissible','neutral','neither forbidden nor obligatory'], roots: ['ب و ح', 'ح ل ل'] },

  // Character & ethics
  'naseehat':   { english: ['advice','counsel','sincere advice','guidance','admonition'], roots: ['ن ص ح', 'و ع ظ'] },
  'ikhlaas':    { english: ['sincerity','purity of intention','devotion solely for allah'], roots: ['خ ل ص'] },
  'iraadah':    { english: ['will','intention','desire','divine will'], roots: ['ر و د', 'ا ر د'] },
  'naiki':      { english: ['good deed','righteousness','virtue','goodness'], roots: ['ح س ن', 'خ ي ر', 'ب ر ر'] },
  'nek':        { english: ['righteous','good','virtuous','pious'], roots: ['ص ل ح', 'ب ر ر'] },
  'burai':      { english: ['evil','bad deed','wickedness','wrongdoing'], roots: ['س و ا', 'ف ح ش', 'م ن ك'] },
  'barkaat':    { english: ['blessings','divine blessings','abundance','increase in goodness'], roots: ['ب ر ك'] },
  'shukrana':   { english: ['gratitude','thanksgiving','gratefulness','expression of thanks'], roots: ['ش ك ر'] },
  'ziarat':     { english: ['visit','pilgrimage','visiting graves','sacred visit'], roots: ['ز و ر', 'ح ج ج'] },

  // Social
  'walidain':   { english: ['parents','father and mother','both parents','respect parents'], roots: ['و ل د', 'ا ب و'] },
  'aulaad':     { english: ['children','offspring','sons and daughters','progeny'], roots: ['و ل د', 'ب ن و'] },
  'ittehad':    { english: ['unity','solidarity','togetherness','oneness'], roots: ['و ح د', 'ا خ و'] },
  'khidmat':    { english: ['service','serving others','helping others','duty'], roots: ['خ د م', 'ع م ل'] },

  // Sin & forgiveness
  'gunah':      { english: ['sin','crime','transgression','wrongdoing','evil act'], roots: ['ذ ن ب', 'ا ث م', 'خ ط ا'] },
  'muaafi':     { english: ['forgiveness','pardon','amnesty','excuse','clemency'], roots: ['ع ف و', 'غ ف ر'] },
  'bakshish':   { english: ['forgiveness','divine pardon','mercy','grant','gift'], roots: ['غ ف ر', 'ع ف و'] },
  'afv':        { english: ['pardon','forgiveness','to overlook','to excuse'], roots: ['ع ف و'] },

  // Knowledge & guidance
  'sabaq':      { english: ['lesson','teaching','moral lesson','what to learn'], roots: ['ع ل م', 'ع ب ر'] },
  'ahmiyat':    { english: ['importance','significance','value'], roots: ['ا ه م', 'ع ظ م'] },
  'zaroorat':   { english: ['necessity','need','requirement'], roots: ['ض ر ر', 'ح ج ج'] },
  'azmat':      { english: ['greatness','majesty','glory','magnificence'], roots: ['ع ظ م', 'ك ب ر'] },
  'mushkil':    { english: ['difficulty','hardship','trouble','problem'], roots: ['ع س ر', 'ض ر ر'] },
  'mushkilat':  { english: ['difficulties','hardships','problems','tribulations'], roots: ['ع س ر', 'ب ل و'] },

  // Prophets (Urdu/Persian spellings)
  'paighambar': { english: ['prophet','messenger','one who brings message from god'], roots: ['ن ب و', 'ر س ل'] },
  'payambar':   { english: ['prophet','messenger'], roots: ['ن ب و', 'ر س ل'] },

  // Mercy (Urdu spellings)
  'rehmat':     { english: ['mercy','divine mercy','compassion','grace','blessing'], roots: ['ر ح م'] },
  'rehman':     { english: ['the merciful','most gracious','attribute of allah'], roots: ['ر ح م'] },

  // ── Help / Aid / Victory ─────────────────────────────────────────────────
  'nasr':       { english: ['help','victory','support','divine aid'], roots: ['ن ص ر'] },
  'nusrat':     { english: ['help','support','assistance','divine help'], roots: ['ن ص ر'] },
  'nasir':      { english: ['helper','supporter','one who helps'], roots: ['ن ص ر'] },
  'madad':      { english: ['help','aid','assistance'], roots: ['ن ص ر', 'ع و ن'] },
  'awn':        { english: ['help','assistance','aid'], roots: ['ع و ن'] },
  'istaana':    { english: ['seek help','ask for help'], roots: ['ع و ن'] },
  'wali':       { english: ['guardian','protector','helper','friend of allah'], roots: ['و ل ي'] },
  'mawla':      { english: ['guardian','master','protector','helper'], roots: ['و ل ي'] },

  // ── Book-derived terms (Afzal-ur-Rahman Subject Index) ─────────────────
  'barak':               { english: ['blessing', 'barakah'], roots: ['ب ر ك'] },
  'barakah':             { english: ['blessing', 'divine blessing', 'abundance'], roots: ['ب ر ك'] },
  'barzakh':             { english: ['barrier', 'intermediate realm', 'grave period'], roots: ['ب ر ز'] },
  'fasad':               { english: ['corruption', 'mischief', 'disorder'], roots: ['ف س د'] },
  'ghaib':               { english: ['unseen', 'hidden'], roots: ['غ ي ب'] },
  'ghayb':               { english: ['unseen', 'hidden', 'unknown'], roots: ['غ ي ب'] },
  'hasad':               { english: ['envy', 'jealousy'], roots: ['ح س د'] },
  'hashr':               { english: ['gathering', 'assembling on judgment day'], roots: ['ح ش ر'] },
  'haya':                { english: ['modesty', 'shyness', 'self-restraint'], roots: ['ح ي ي'] },
  'hayaa':               { english: ['modesty', 'shyness'], roots: ['ح ي ي'] },
  'hayah':               { english: ['modesty', 'bashfulness'], roots: ['ح ي ي'] },
  'hifzul quran':        { english: ['memorisation of quran', 'quran memorization'], roots: ['ح ف ظ', 'ق ر ا'] },
  'hudood':              { english: ['prescribed punishments', 'limits of allah'], roots: ['ح د د'] },
  'hudud':               { english: ['limits of allah', 'prescribed punishments'], roots: ['ح د د'] },
  'ijaz':                { english: ['inimitability of quran', 'miraculous nature'], roots: ['ع ج ز'] },
  'ijaz al quran':       { english: ['inimitability of quran', 'quran is miracle'], roots: ['ع ج ز', 'ق ر ا'] },
  'infaq':               { english: ['spending in path of allah', 'charity', 'donation'], roots: ['ن ف ق'] },
  'khashya':             { english: ['fear of allah', 'awe'], roots: ['خ ش ي'] },
  'khashyah':            { english: ['awe of allah', 'fear of allah', 'reverence'], roots: ['خ ش ي'] },
  'kibr':                { english: ['arrogance', 'haughtiness'], roots: ['ك ب ر'] },
  'kufr':                { english: ['disbelief', 'ingratitude', 'rejection of faith'], roots: ['ك ف ر'] },
  'mahr':                { english: ['dowry', 'bridal gift', 'wedding gift'], roots: ['م ه ر'] },
  'mahram':              { english: ['unmarriageable kin', 'close relative'], roots: ['ح ر م'] },
  'mizan':               { english: ['scales of justice', 'balance'], roots: ['و ز ن'] },
  'muhasabah':           { english: ['self-accountability', 'self-reckoning'], roots: ['ح س ب'] },
  'muraqabah':           { english: ['self-awareness', 'watchfulness', 'allah is watching'], roots: ['ر ق ب'] },
  'naar':                { english: ['hellfire', 'fire of hell'], roots: ['ن ا ر', 'ج ح م'] },
  'nimah':               { english: ['blessing', 'bounty', 'favour'], roots: ['ن ع م'] },
  'nimat':               { english: ['blessings', 'favours'], roots: ['ن ع م'] },
  'nifaq':               { english: ['hypocrisy', 'two-facedness'], roots: ['ن ف ق'] },
  'nikah':               { english: ['marriage', 'islamic matrimony'], roots: ['ن ك ح'] },
  'nikkah':              { english: ['marriage', 'islamic marriage', 'matrimony'], roots: ['ن ك ح'] },
  'nimah':               { english: ['blessing', 'bounty', 'favour', 'favours', 'bounties', 'blessings', 'bestow favour', 'divine favour', 'gifts of allah'], roots: ['ن ع م'] },
  'noor':                { english: ['light', 'divine light'], roots: ['ن و ر'] },
  'nubuwwah':            { english: ['prophethood', 'prophetship'], roots: ['ن ب و'] },
  'nur':                 { english: ['light', 'divine light'], roots: ['ن و ر'] },
  'purdah':              { english: ['veil', 'covering', 'hijab'], roots: ['ح ج ب'] },
  'qard':                { english: ['loan', 'lending to allah', 'benevolent loan'], roots: ['ق ر ض'] },
  'qard hasan':          { english: ['good loan', 'loan to allah'], roots: ['ق ر ض', 'ح س ن'] },
  'qisas':               { english: ['retribution', 'equal retaliation'], roots: ['ق ص ص'] },
  'razzaq':              { english: ['the provider', 'sustenance from allah'], roots: ['ر ز ق'] },
  'risalah':             { english: ['messengership', 'message', 'mission'], roots: ['ر س ل'] },
  'riya':                { english: ['showing off', 'ostentation'], roots: ['ر ا ي'] },
  'rizq':                { english: ['sustenance', 'provision', 'livelihood'], roots: ['ر ز ق'] },
  'sadaqa':              { english: ['charity', 'donation'], roots: ['ص د ق'] },
  'sadaqah':             { english: ['charity', 'voluntary charity', 'donation'], roots: ['ص د ق'] },
  'sadaqat':             { english: ['charities', 'alms'], roots: ['ص د ق'] },
  'shirk':               { english: ['polytheism', 'associating partners with allah'], roots: ['ش ر ك'] },
  'sirat':               { english: ['bridge over hell', 'straight path', 'sirat al mustaqeem'], roots: ['س ر ط'] },
  'taghut':              { english: ['false deity', 'idols', 'tyrant'], roots: ['ط غ و'] },
  'takabbur':            { english: ['arrogance', 'pride'], roots: ['ك ب ر'] },
  'talaq':               { english: ['divorce', 'dissolution of marriage'], roots: ['ط ل ق'] },
  'tawagheet':           { english: ['false deities', 'idols'], roots: ['ط غ و'] },
  'wahi':                { english: ['revelation', 'divine inspiration'], roots: ['و ح ي'] },
  'wahy':                { english: ['revelation', 'divine inspiration'], roots: ['و ح ي'] },
  'waqf':                { english: ['endowment', 'religious trust'], roots: ['و ق ف'] },
  'wara':                { english: ['caution', 'avoiding doubtful things'], roots: ['و ر ع'] },
  'zuhd':                { english: ['asceticism', 'detachment from world'], roots: ['ز ه د'] },
  'zulm':                { english: ['oppression', 'injustice', 'wrongdoing'], roots: ['ظ ل م'] },
  'zulmat':              { english: ['darkness', 'oppressions'], roots: ['ظ ل م'] },

  // ── Social concepts ───────────────────────────────────────────────────────
  'ummah':      { english: ['community','nation','muslim community','people', 'followers', 'group of people', 'all people', 'whole community', 'nation of believers'], roots: ['ا م م'] },
  'ahl':        { english: ['people','family','household'], roots: ['ا ه ل'] },
  'sunnah':     { english: ['tradition','way','practice','custom'], roots: ['س ن ن'] },
  'sirat':      { english: ['path','way','road','straight path'], roots: ['س ر ط'] },
  'siratal mustaqeem': { english: ['straight path','right way'], roots: ['س ر ط','ق و م'] },
  'amanah':     { english: ['trust','trustworthiness','responsibility'], roots: ['ا م ن'] },
  'adl':        { english: ['justice','fairness','equity'], roots: ['ع د ل'] },
  'haq':        { english: ['truth','right','just','correct'], roots: ['ح ق ق'] },
  'hikmah':     { english: ['wisdom','knowledge','understanding'], roots: ['ح ك م'] },
  'ilm':        { english: ['knowledge','learn','scholar'], roots: ['ع ل م'] },
  'rahmah':     { english: ['mercy','compassion','blessing', 'merciful', 'compassionate', 'most merciful', 'most compassionate', 'bestow mercy', 'shower mercy', 'show mercy', 'full of mercy', 'most kind'], roots: ['ر ح م'] },
  'nimah':      { english: ['blessing','bounty','favor','grace'], roots: ['ن ع م'] },
  'nimat':      { english: ['blessing','bounty'], roots: ['ن ع م'] },
  'azab':       { english: ['punishment','torment','suffering'], roots: ['ع ذ ب'] },
  'ghufraan':   { english: ['forgiveness','pardon'], roots: ['غ ف ر'] },
  'sadaqah':    { english: ['charity','alms','donation'], roots: ['ص د ق'] },
  'sadaqa':     { english: ['charity','donation'], roots: ['ص د ق'] },
  'khilafah':   { english: ['vicegerency','stewardship','successor'], roots: ['خ ل ف'] },
  'khalifah':   { english: ['vicegerent','successor','caliph', 'steward', 'trustee on earth', 'deputy', 'those placed in authority', 'those given authority'], roots: ['خ ل ف'] },
  'akhlaaq':    { english: ['character','morality','ethics','conduct'], roots: ['خ ل ق'] },
  'amr':        { english: ['command','order','matter','affair'], roots: ['ا م ر'] },
  'nahy':       { english: ['prohibition','forbid','stop'], roots: ['ن ه ي'] },
  'shura':      { english: ['consultation','counsel','mutual advice'], roots: ['ش و ر'] },
  'dawah':      { english: ['call to islam','invitation','preaching'], roots: ['د ع و'] },
  'tabligh':    { english: ['convey','preach','deliver message'], roots: ['ب ل غ'] },
  'jihad':      { english: ['strive','striving','effort','struggle', 'struggle in the way of allah', 'fight in the way of allah', 'those who strive', 'striving with wealth and life', 'make effort', 'exert effort'], roots: ['ج ه د'] },
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

  // ── Allah's pleasure / Ridha (Urdu terms) ────────────────────────────────
  'khushnudi':  { english: ['pleasure of allah','divine pleasure','allah pleased','satisfaction','contentment'], roots: ['ر ض ي', 'ر ض و'] },
  'khushnood':  { english: ['pleased','satisfied','content','allah pleased'], roots: ['ر ض ي'] },
  'ridha':      { english: ['divine pleasure','satisfaction of allah','contentment'], roots: ['ر ض ي', 'ر ض و'] },
  'ridhwan':    { english: ['pleasure of allah','allah pleased','divine satisfaction'], roots: ['ر ض ي', 'ر ض و'] },
  'ridwan':     { english: ['divine pleasure','allah pleased'], roots: ['ر ض ي', 'ر ض و'] },
  // compound phrase — most natural Urdu query form
  'allah ki khushnudi': { english: ['allah pleasure','seeking allah satisfaction','allah pleased','divine approval'], roots: ['ر ض ي', 'ر ض و'] },
  'khushnudi k liyay':  { english: ['for pleasure of allah','seeking divine pleasure'], roots: ['ر ض ي', 'ر ض و'] },

  // ── Soul / life / self (Urdu terms) ──────────────────────────────────────
  'jaan':       { english: ['soul','life','self','one life','beloved'], roots: ['ن ف س', 'ر و ح'] },
  'jan':        { english: ['soul','life','self'], roots: ['ن ف س', 'ر و ح'] },
  'rooh':       { english: ['soul','spirit','ruh','breath of life'], roots: ['ر و ح'] },
  'ruh':        { english: ['soul','spirit','the spirit'], roots: ['ر و ح'] },
  'nafs':       { english: ['soul','self','ego','inner self'], roots: ['ن ف س'] },

  // ── Sacrifice / selling soul / martyrdom (Urdu terms) ────────────────────
  'bechna':     { english: ['sell','trade','give in exchange','sacrifice','sold'], roots: ['ب ي ع', 'ش ر ي'] },
  'bech':       { english: ['sell','selling','give away','traded'], roots: ['ب ي ع', 'ش ر ي'] },
  'khareedna':  { english: ['buy','purchase','acquire'], roots: ['ب ي ع', 'ش ر ي'] },
  'kharidna':   { english: ['buy','purchase'], roots: ['ب ي ع', 'ش ر ي'] },
  // compound sacrifice phrases — ش ر ي is the root used in 2:207 (يشري نفسه) and 9:111 (اشترى)
  'jaan dena':     { english: ['sacrifice life','give life','die for cause','lay down life','martyrdom'], roots: ['ن ف س', 'ج ه د', 'ش ه د', 'ش ر ي', 'ب ي ع'] },
  'jaan nisaar':   { english: ['self-sacrifice','devoted completely','life devoted'], roots: ['ن ف س', 'ج ه د', 'ش ه د', 'ش ر ي'] },
  'jaan qurban':   { english: ['sacrifice life','life as sacrifice'], roots: ['ن ف س', 'ق ر ب', 'ش ه د', 'ش ر ي'] },
  'fidaa hona':    { english: ['sacrifice','devote','give life for','ransom'], roots: ['ف د ي', 'ن ف س', 'ش ر ي'] },
  'shaheed hona':  { english: ['martyrdom','die as martyr','die in path of allah'], roots: ['ش ه د', 'ج ه د'] },
  'shaheed':       { english: ['martyr','witness','die for allah'], roots: ['ش ه د'] },
  // the Quranic transaction — 2:207 يشري نفسه ابتغاء مرضات الله & 9:111 اشترى من المؤمنين
  'jaan bechna':   { english: ['sell life for allah','sacrifice soul','trade life for paradise'], roots: ['ش ر ي', 'ب ي ع', 'ن ف س', 'ج ه د', 'ش ه د', 'ر ض ي'] },
  'jaan ko bech':  { english: ['selling life','sacrifice soul for allah','trade soul'], roots: ['ش ر ي', 'ب ي ع', 'ن ف س', 'ج ه د', 'ش ه د'] },

  // ── Emotional / psychological states (Urdu/Islamic terms) ───────────────
  'musibah':    { english: ['calamity','hardship','affliction','disaster','trial'], roots: ['ص ب ر', 'ب ل و'] },
  'musibat':    { english: ['calamity','hardship','affliction'], roots: ['ص ب ر', 'ب ل و'] },
  'museebah':   { english: ['calamity','affliction','hardship'], roots: ['ص ب ر', 'ب ل و'] },
  'gham':       { english: ['grief','sorrow','sadness','distress'], roots: ['ح ز ن', 'ص ب ر'] },
  'dard':       { english: ['pain','grief','sorrow','anguish'], roots: ['ح ز ن', 'ا ذ ي'] },
  'takleef':    { english: ['suffering','pain','difficulty','burden'], roots: ['ص ب ر', 'ب ل و'] },
  'pareshani':  { english: ['worry','anxiety','trouble','distress'], roots: ['خ و ف', 'ت و ك ل'] },
  'pareshan':   { english: ['worried','troubled','anxious'], roots: ['خ و ف', 'ت و ك ل'] },
  'sukoon':     { english: ['peace','tranquility','contentment','inner peace'], roots: ['س ك ن', 'ط م ن', 'ذ ك ر'] },
  'sakoon':     { english: ['peace','tranquility','inner peace'], roots: ['س ك ن', 'ط م ن'] },
  'itminan':    { english: ['contentment','peace of mind','tranquility'], roots: ['ط م ن', 'ق ل ب'] },
  'ummeed':     { english: ['hope','expectation','wish'], roots: ['ر ج و'] },
  'umeed':      { english: ['hope','expectation'], roots: ['ر ج و'] },
  'khushi':     { english: ['happiness','joy','delight'], roots: ['ف ر ح', 'ن ع م'] },
  'raza':       { english: ['satisfaction','contentment','pleasure of allah'], roots: ['ر ض ي', 'ق ن ع'] },
  'rida':       { english: ['satisfaction','divine pleasure','contentment'], roots: ['ر ض ي'] },
  'tafweez':    { english: ['surrender to allah','leaving to allah','tawakkul'], roots: ['ت و ك ل', 'ف و ض'] },
  'tawfeeq':    { english: ['divine assistance','guidance from allah','success'], roots: ['و ف ق', 'ه د ي'] },
  'baas':       { english: ['suffering','misery','hardship'], roots: ['ب ا س', 'ص ب ر'] },

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
 * pure vowels (a e i o u). w and y are kept because in Arabic transliteration
 * they almost always represent actual consonants (و / ي).
 *
 * This is the linguistic gate for fuzzy matching: two words with different
 * consonant skeletons come from different Arabic roots and must NEVER be
 * treated as spelling variants of each other, no matter how similar they look.
 *
 *   wasila  → wsl  (و س ل — waseela, means/intercession)
 *   wasiya  → wsy  (و ص ي — wasiyyah, will/bequest)  ← different root: BLOCKED
 */
function _consonants(s) {
  return s.replace(/[aeiou]/g, '');
}

// Canonical-form → TRANSLITERATIONS entry, built once. When multiple keys
// share a canonical form the first one wins — TRANSLITERATIONS is ordered
// primary-spelling-first by convention.
const _TRANSLIT_CANON = (() => {
  const idx = {};
  for (const [key, val] of Object.entries(TRANSLITERATIONS)) {
    const canon = _normTranslit(key);
    if (!idx[canon]) idx[canon] = val;
  }
  return idx;
})();

/**
 * Look up a single Roman-script word against TRANSLITERATIONS using three
 * passes:
 *   1. Exact key match
 *   2. Canonical-form match  (handles long-vowel / doubled-consonant variants)
 *   3. Root-safe fuzzy match — Levenshtein ≤ 1 (len 5-7) or ≤ 2 (len 8+),
 *      GATED by consonant-skeleton identity to prevent cross-root false
 *      positives (see _consonants above).
 *
 * Returns { entry, key, confidence } where confidence is
 * 'exact' | 'canonical' | 'fuzzy', or null if no match. Words under 4
 * characters are skipped entirely — too short for any of this to be safe.
 */
function _lookupTranslit(word) {
  if (!word || word.length < 4) return null;

  if (TRANSLITERATIONS[word]) return { entry: TRANSLITERATIONS[word], key: word, confidence: 'exact' };

  const canon = _normTranslit(word);
  if (_TRANSLIT_CANON[canon]) {
    const origKey = Object.keys(TRANSLITERATIONS).find(k => _normTranslit(k) === canon) || word;
    return { entry: _TRANSLIT_CANON[canon], key: origKey, confidence: 'canonical' };
  }

  if (word.length < 5) return null;
  const maxDist = word.length >= 8 ? 2 : 1;
  const queryConsonants = _consonants(canon);

  let best = null, bestKey = null, bestDist = maxDist + 1;
  for (const [normKey, val] of Object.entries(_TRANSLIT_CANON)) {
    if (_consonants(normKey) !== queryConsonants) continue;
    const d = _editDistance(canon, normKey, maxDist);
    if (d < bestDist) { bestDist = d; best = val; bestKey = normKey; }
  }
  if (!best) return null;
  const origKey = Object.keys(TRANSLITERATIONS).find(k => _normTranslit(k) === bestKey) || bestKey;
  return { entry: best, key: origKey, confidence: 'fuzzy' };
}

return {
  VERSION: 1,
  TRANSLITERATIONS: TRANSLITERATIONS,
  lookup: _lookupTranslit,
  normCanon: _normTranslit,
};
});
