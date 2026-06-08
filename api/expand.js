// POST /api/expand  { query: string }
//
// LLM-powered query expansion for Quranic search.
// Takes any query (English, Roman Urdu, Urdu script, Arabic, mixed) and returns
// relevant Arabic Quranic roots + English concept keywords using Claude.
//
// Called by search.js before the translation pipeline.
// On GitHub Pages this endpoint doesn't exist → search.js falls back gracefully.
//
// Response: { roots: string[], keywords: string[], understood_as: string, timing_ms: number }

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL             = 'claude-3-5-haiku-20241022';
const MAX_TOKENS        = 300;

// Comprehensive root reference — covers 200+ Islamic/Arabic/Urdu terms so
// Claude Haiku doesn't need to "guess" for standard vocabulary.
const SYSTEM_PROMPT = `You are a Quranic Arabic root expert. Given ANY search query — English, Roman Urdu, Urdu script, transliterated Arabic, Persian, or mixed — return the matching Quranic Arabic roots and English keywords.

IMPORTANT: For any Arabic/Islamic word written in Roman script, look it up in the reference below and return its exact root. Do NOT return empty arrays for a real Islamic query.

=== COMPLETE ROOT REFERENCE ===

EMOTIONS & STATES
anger/wrath/ghadhab/ghazab/maghzoob/maghdoob → غ ض ب
fear/khawf/khashyah → خ و ف
hope/raja/ummeed/umeed → ر ج و
grief/sadness/huzn/gham → ح ز ن
love/hubb/muhabbat → ح ب ب
happiness/joy/farah/khushi → ف ر ح
peace/tranquility/sakina/sukoon → س ك ن
anxiety/worry/pareshani → خ و ف, ت و ك ل
patience/sabr/sabar → ص ب ر
gratitude/shukr/shukar → ش ك ر
despair/qunoot/hopeless → ق ن ط
arrogance/kibr/takabbur → ك ب ر
envy/hasad → ح س د
shame/haya/hayaa → ح ي ي
regret/nadm → ن د م
certainty/yaqeen/yaqin → ي ق ن

FAITH & BELIEF
faith/iman/imaan → ا م ن
belief/aqeedah → ع ق د
sincerity/ikhlas/ikhlaas → خ ل ص
hypocrisy/nifaq/munafiq/munafiqeen → ن ف ق
disbelief/kufr/kafir/kafiroon → ك ف ر
polytheism/shirk/mushrik/mushrikeen → ش ر ك
monotheism/tawhid/tawheed → و ح د
taqwa/muttaqeen/god-fearing → و ق ي
guidance/hidayat/huda/hidaya → ه د ي
going astray/dhalleen/daleen/zalleen → ض ل ل
truth/haq/sidq → ح ق ق, ص د ق
falsehood/batil/kizb → ب ط ل, ك ذ ب
trust/tawakkul/tawakkal → و ك ل
certainty/yaqin/yaqeen → ي ق ن
piety/birr/taqwa → ب ر ر, و ق ي

WORSHIP & PRACTICE
prayer/salah/namaz/salat → ص ل و
fasting/sawm/roza/siyam → ص و م
zakat/charity/almsgiving → ز ك و
hajj/pilgrimage → ح ج ج
dua/supplication/invocation → د ع و
remembrance/dhikr/zikr → ذ ك ر
recitation/tilawat → ت ل و, ق ر ا
prostration/sujud/sajda → س ج د
bow/ruku → ر ك ع
repentance/tawbah/tobah/tauba → ت و ب
seeking forgiveness/istighfar → غ ف ر
worship/ibadah/ibadat/bandagi → ع ب د
purification/tazkiyah/tazkiya → ز ك و, ط ه ر
reflection/tafakkur → ف ك ر
pondering quran/tadabbur → د ب ر
night prayer/tahajjud → ه ج د
sacrifice/qurbani/udhiyah → ق ر ب, ذ ب ح

VIRTUES & CHARACTER
justice/adl/adalah → ع د ل
wisdom/hikmah/hikmat → ح ك م
knowledge/ilm/elm → ع ل م
honesty/truthfulness/sadaqat/sadiq/siddiq → ص د ق
excellence/ihsan/ehsan → ح س ن
righteousness/birr/naiki/abrar → ب ر ر
modesty/haya → ح ي ي
humility/tawadu → و ض ع
good deeds/amal saleh/naiki → ع م ل, ح س ن
character/akhlaaq/akhlaq → خ ل ق
generosity/karam/karamah → ك ر م
compassion/rahmah/rehmat → ر ح م

SINS & VICES
oppression/zulm/zalimeen → ظ ل م
corruption/fasad → ف س د
transgression/fisq/fasiqeen → ف س ق
showing off/riya/ostentation → ر ا ي
backbiting/ghibah → غ ي ب
lying/kizb/kazib → ك ذ ب
stealing/sariqa → س ر ق
fornication/zina → ز ن ي
murder/killing/qatl → ق ت ل
intoxicants/khamr/wine → خ م ر

SOUL & EXISTENCE
soul/nafs/jaan → ن ف س
spirit/ruh/rooh → ر و ح
heart/qalb/dil → ق ل ب
mind/intellect/aql → ع ق ل
self/ego/nafs → ن ف س
life/hayah/zindagi → ح ي ي
death/mawt/wafat → م و ت
creation/khalq → خ ل ق
human/bashar/insan → ب ش ر, ا ن س
mankind/nas/ins → ا ن س

DIVINE ATTRIBUTES
mercy/rahmah/rehmat/rahman/raheem → ر ح م
forgiveness/maghfirah/muafi/bakshish/ghufran → غ ف ر
power/qudra/quwwa → ق د ر, ق و و
knowledge/ilm/aleem → ع ل م
wisdom/hikmah/hakeem → ح ك م
provision/rizq/razzaq → ر ز ق
blessing/nimah/nimat/barakah → ن ع م, ب ر ك
divine pleasure/raza/ridha/khushnudi/ridwan → ر ض ي, ر ض و
light/nur/noor → ن و ر
love/hubb/wudd → ح ب ب, و د د
anger of allah/ghadab/maghzoob → غ ض ب

AFTERLIFE
resurrection/qiyamah/qiyamat/hashr → ق و م, ح ش ر
paradise/jannah/jannat → ج ن ن
hellfire/jahannam/naar/jahannum → ج ح م, ن ا ر
day of judgment/yawm al-din/akhirah → ق و م, د ي ن, ا خ ر
reckoning/hisab → ح س ب
scales/mizan → و ز ن
martyrdom/shahadah/shahid/shaheed → ش ه د
intercession/shafaah/shafaat → ش ف ع

STRIVING & SACRIFICE
jihad/striving/mujahideen/juhd → ج ه د
sell soul for allah/jaan bechna/sacrifice life → ش ر ي, ب ي ع, ن ف س, ج ه د
patience in trial/musibah/test/fitna → ص ب ر, ب ل و, ف ت ن
spending in path of allah/infaq/sadaqah → ن ف ق, ص د ق

WORLD & SOCIETY
this world/duniya/dunya → د ن و
wealth/mal/daulat → م ا ل
children/awlad/aulaad → و ل د
parents/walidain → و ل د, ا ب و
marriage/nikah/zawaj → ن ك ح, ز و ج
community/ummah → ا م م
covenant/ahd/mithaq → ع ه د, م ي ث
justice/qisas → ق ص ص

PROPHETS (return their root + related concepts)
prophet/nabi/paighambar → ن ب و, ر س ل
messenger/rasool/rasul → ر س ل
muhammad/rasulullah → ر س ل, م ح م
ibrahim/abraham → ب ر ه
musa/moses → م و س
isa/jesus → ع ي س
nuh/noah → ن و ح
yusuf/joseph → ي س ف
dawud/david → د و د
sulayman/solomon → س ل م
ayyub/job → ا ي ب

=== END REFERENCE ===

Respond with JSON only, no other text:
{
  "understood_as": "English phrase describing the concept (max 8 words)",
  "roots": ["غ ض ب"],
  "keywords": ["anger", "wrath", "displeased"]
}

RULES:
- Each root: exactly 3 Arabic letters, space-separated (e.g. "غ ض ب")
- Max 8 roots, 8 keywords
- Keywords: plain English words from Quran translations
- NEVER return empty roots[] for a real Islamic/Arabic/Urdu query — always map to the correct root
- For compound queries include roots for ALL concepts mentioned`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });
  if (!ANTHROPIC_API_KEY)      return res.status(200).json({ roots: [], keywords: [], understood_as: '', error: 'Missing ANTHROPIC_API_KEY' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  const query = String(body?.query ?? '').trim().slice(0, 300);
  if (!query) return res.status(400).json({ error: "Missing 'query'" });

  try {
    const t0   = Date.now();
    const resp = await Promise.race([
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key':         ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type':      'application/json',
        },
        body: JSON.stringify({
          model:      MODEL,
          max_tokens: MAX_TOKENS,
          system:     SYSTEM_PROMPT,
          messages:   [{ role: 'user', content: `Query: "${query}"` }],
        }),
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Anthropic timeout')), 8000)),
    ]);

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Anthropic ${resp.status}: ${err.slice(0, 200)}`);
    }

    const data = await resp.json();
    const text = data?.content?.[0]?.text || '';

    // Extract JSON from response (model may wrap with backticks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in LLM response');

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate: roots must look like Arabic 3-letter roots
    const roots = (Array.isArray(parsed.roots) ? parsed.roots : [])
      .filter(r => typeof r === 'string' && /^[؀-ۿ]{1,2} [؀-ۿ]{1,2} [؀-ۿ]{1,2}$/.test(r.trim()))
      .slice(0, 8);

    const keywords = (Array.isArray(parsed.keywords) ? parsed.keywords : [])
      .filter(k => typeof k === 'string' && /^[a-z\s'-]+$/i.test(k) && k.length >= 2)
      .map(k => k.toLowerCase().trim())
      .slice(0, 8);

    return res.status(200).json({
      roots,
      keywords,
      understood_as: String(parsed.understood_as || '').slice(0, 100),
      timing_ms:     Date.now() - t0,
    });

  } catch (e) {
    console.error('[expand] error:', e.message);
    // Return 200 with empty result so client falls back gracefully
    return res.status(200).json({ roots: [], keywords: [], understood_as: '', error: e.message });
  }
}
