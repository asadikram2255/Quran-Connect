// POST /api/synthesize  { query, verses: [{ ref, text }], subtopics: string[] }
//
// Given a search query and the top retrieved Quranic verses, uses Claude to extract
// and organise ALL knowledge the verses contain into a structured knowledge panel.
//
// Response: { theme, sections: [{ type, title, points: [{ text, refs[] }] }] }
//
// Called by app.js after verse results are rendered. Returns 200 with empty sections
// on any error so the verse list always remains the fallback.

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MODEL        = 'llama-3.3-70b-versatile';
const MAX_TOKENS   = 4000;
const TIMEOUT_MS   = 18000;

const SYSTEM_PROMPT = `You are a Quranic scholar. You will be given a search query and a numbered list of Quranic verses retrieved from a database. Your job is to extract and organise the knowledge contained in THOSE VERSES ONLY into a structured answer.

STRICT RULE: Use ONLY what is stated in the provided verses. Do NOT add information from outside — not from memory, not from Islamic tradition beyond what the verses say. Every single point must be directly traceable to a provided verse.

Return ONLY valid JSON — no prose, no markdown fences:
{
  "theme": "Concise topic title (4-7 words)",
  "sections": [
    {
      "type": "definition|command|quality|reward|warning|example|condition|relationship",
      "title": "Section heading (4-8 words)",
      "points": [
        { "text": "Specific statement from the verses (max 160 chars)", "refs": ["2:153"] }
      ]
    }
  ]
}

━━━ DEPTH RULES — every point must be specific, not vague ━━━
BAD: "Believers have good qualities"
BAD: "Disbelievers will be punished"
GOOD: "Described as those who bow, prostrate, enjoin good and forbid evil — from the verse"
GOOD: "Called 'worst of creatures', worse than animals that lack reason"
GOOD: "Hearts sealed — outwardly claim faith but mock believers in private"

━━━ QUERY TYPE — adapt your structure ━━━

▶ CATEGORY / LIST query (keywords: list, all, every, categories, types, enumerate):
  • Scan ALL provided verses — identify every distinct named group present
  • Create ONE section per group (e.g. "Mu'minoon — True Believers", "Kafireen — Disbelievers")
  • Section type = "quality" for traits, "reward" for good outcomes, "warning" for punishment
  • Per section: 2-4 bullet points with their specific traits AND outcomes from the verses
  • Every distinct group in the verses gets its own section — do NOT cap at 6
  • Only include groups actually mentioned in the provided verses

▶ SINGLE CONCEPT query (patience, tawakkul, forgiveness…):
  • Organise: definition → command → qualities → rewards → warnings (4-6 sections)

▶ COMMAND / HOW-TO query:
  • Lead with commands, follow with qualities and rewards

━━━ CITATION RULES ━━━
• refs format: "SN:AN" e.g. "2:153" — ONLY refs that appear in the provided verse list
• If a point is clearly stated in a verse but you cannot identify the exact ref, use refs:[]
• 2-4 points per section — keep each point under 160 characters`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });
  if (!GROQ_API_KEY)           return res.status(200).json({ sections: [], error: 'Missing GROQ_API_KEY' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  const query    = String(body?.query ?? '').trim().slice(0, 300);
  const verses   = Array.isArray(body?.verses) ? body.verses.slice(0, 120) : [];
  const subtopics = Array.isArray(body?.subtopics) ? body.subtopics.slice(0, 6) : [];

  if (!query || !verses.length) {
    return res.status(400).json({ error: 'Missing query or verses' });
  }

  // Build the verse list for the prompt
  const verseList = verses
    .map((v, i) => `[${v.ref}] ${String(v.text || '').slice(0, 220)}`)
    .join('\n');

  const subtopicHint = subtopics.length
    ? `\nRelated sub-concepts to look for: ${subtopics.join(', ')}`
    : '';

  const userMessage = `Query: "${query}"${subtopicHint}\n\nRetrieved verses:\n${verseList}`;

  try {
    const t0   = Date.now();
    const resp = await Promise.race([
      fetch('https://api.groq.com/openai/v1/chat/completions', {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          model:      MODEL,
          max_tokens: MAX_TOKENS,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user',   content: userMessage },
          ],
        }),
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT_MS)),
    ]);

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Groq ${resp.status}: ${err.slice(0, 200)}`);
    }

    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content || '';

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate and clean sections
    const sections = (Array.isArray(parsed.sections) ? parsed.sections : [])
      .filter(s => s && typeof s.title === 'string' && Array.isArray(s.points))
      .map(s => ({
        type:   String(s.type  || 'definition').slice(0, 20),
        title:  String(s.title || '').slice(0, 80),
        points: (s.points || [])
          .filter(p => p && typeof p.text === 'string' && p.text.trim().length > 0)
          .map(p => ({
            text: String(p.text).slice(0, 200),
            refs: (Array.isArray(p.refs) ? p.refs : [])
              .filter(r => typeof r === 'string' && /^\d+:\d+$/.test(r.trim()))
              .slice(0, 4),
          }))
          .slice(0, 5),
      }))
      .filter(s => s.points.length > 0)
      .slice(0, 20);

    return res.status(200).json({
      theme:     String(parsed.theme || query).slice(0, 80),
      sections,
      timing_ms: Date.now() - t0,
    });

  } catch (e) {
    console.error('[synthesize] error:', e.message);
    return res.status(200).json({ theme: query, sections: [], error: e.message });
  }
}
