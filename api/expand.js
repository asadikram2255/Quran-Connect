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

const SYSTEM_PROMPT = `You are a Quranic search assistant. Given a user search query in any language (English, Roman Urdu, Urdu script, Arabic, Persian, etc.), identify:
1. The relevant Arabic root words (3-letter roots) that appear in the Quran for this concept
2. English keywords that would appear in Quran translations

Key root mappings you must know:
- Selling/trading oneself (2:207, 9:111): ش ر ي, ب ي ع
- Soul/self: ن ف س
- Divine pleasure/approval: ر ض ي, ر ض و
- Striving/jihad: ج ه د
- Martyrdom/witness: ش ه د
- Patience: ص ب ر
- Mercy: ر ح م
- Guidance: ه د ي
- Remembrance: ذ ك ر
- Heart: ق ل ب
- Repentance: ت و ب
- Fear/taqwa: و ق ي, خ و ف
- Trust in Allah: ت و ك ل
- Prayer: ص ل و
- Paradise: ج ن ن
- Hellfire: ن ا ر, ج ح م
- Prophet/messenger: ن ب و, ر س ل
- Believers: ا م ن
- Gratitude: ش ك ر
- Purification: ز ك و, ط ه ر

Respond with JSON only — no preamble, no explanation:
{
  "understood_as": "brief English phrase (max 10 words)",
  "roots": ["ر ض ي", "ن ف س"],
  "keywords": ["pleasure", "soul", "approval", "servants"]
}

Rules:
- Each root: exactly 3 Arabic letters separated by single spaces
- Maximum 8 roots, 8 keywords
- Keywords: plain lowercase English words found in Quran translations
- If unsure, still return your best guess — never return empty arrays for a real query`;

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
