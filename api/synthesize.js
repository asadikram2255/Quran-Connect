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

const SYSTEM_PROMPT = `You are a precise Quranic scholar extracting deep, specific knowledge from verses. You do NOT write vague summaries — every point must be a specific, non-obvious fact grounded in the verse text.

Return ONLY valid JSON — no prose, no markdown fences:
{
  "theme": "Concise topic title (4-7 words)",
  "sections": [
    {
      "type": "definition|command|quality|reward|warning|example|condition|relationship",
      "title": "Section heading (4-8 words)",
      "points": [
        { "text": "Specific Quranic statement (max 160 chars)", "refs": ["2:153"] }
      ]
    }
  ]
}

DEPTH RULES — your points must be SPECIFIC, not vague:
BAD (too vague): "Believers have good qualities"
BAD (too vague): "Disbelievers will be punished"
GOOD (specific): "Believers are described as those who bow, prostrate, enjoin good and forbid evil (9:112)"
GOOD (specific): "Disbelievers are called 'worst of creatures' — worse than animals who have no reason (98:6, 8:22)"
GOOD (specific): "Hypocrites outwardly claim faith but their hearts are sealed — they mock believers secretly (2:14-15)"

QUERY TYPE — adapt your STRUCTURE to what is being asked:

▶ CATEGORIES / GROUPS query (e.g. "categories of human beings", "types of people", "who are the muttaqeen"):
  • Scan ALL verses — identify EVERY distinct named group (Mu'minoon, Kafireen, Munafiqoon, Muttaqoon, Muhsinoon, Fasiqoon, Mushrikeen, Zalimoon, Abrar, etc.)
  • Create ONE section per group found in the verses
  • Section title = the group's name + Arabic term (e.g. "Mu'minoon — True Believers")
  • Section type = "quality" for characteristics, "reward" for their outcome, "warning" for punishment
  • Points: list their SPECIFIC defining traits AND their specific outcomes/reward/punishment from the verses
  • Do NOT merge all groups into one section — each group = its own section

▶ SINGLE CONCEPT query (e.g. "patience", "tawakkul", "forgiveness"):
  • Organise by aspect: definition → command → qualities of those who embody it → rewards → warnings

▶ HOW-TO / COMMAND query:
  • Lead with commands, follow with qualities and rewards

CITATION RULES:
1. Every point needs at least one ref in format "SN:AN" (e.g. "2:153") from the provided verse list
2. Use ONLY what the verses say — no outside knowledge
3. For CATEGORY queries: create as many sections as groups exist in the verses — do NOT stop at 6. Every distinct named group = its own section. Aim for completeness.
   For CONCEPT queries: 4-6 sections, 2-4 points each.
4. Be scholarly and precise — a student should learn something new from every point`;

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
  const verses   = Array.isArray(body?.verses) ? body.verses.slice(0, 60) : [];
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
