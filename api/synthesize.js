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
const MAX_TOKENS   = 1400;
const TIMEOUT_MS   = 18000;

const SYSTEM_PROMPT = `You are a Quranic scholar. Given a search query and a numbered list of relevant Quranic verses, extract and organise ALL knowledge those verses contain about the topic.

Return ONLY valid JSON — no prose, no markdown fences:
{
  "theme": "Concise topic title (4-7 words)",
  "sections": [
    {
      "type": "definition|command|quality|reward|warning|example|condition|relationship",
      "title": "Section heading (4-8 words)",
      "points": [
        { "text": "One clear statement from the verses (max 160 chars)", "refs": ["2:153", "3:200"] }
      ]
    }
  ]
}

STRICT RULES:
1. Every point MUST cite at least one verse ref from the provided list, using EXACT format "SURAH:AYAH" (e.g. "2:153", "49:13"). The ref MUST appear in the verse list given to you.
2. Use ONLY knowledge present in the provided verses — no additions from outside
3. 3-6 sections, 2-5 points each
4. Points must be concise (max 160 characters)
5. Each section type may appear at most once

QUERY TYPE ADAPTATION — choose your structure based on what is being asked:

• If the query asks about CATEGORIES / TYPES / GROUPS of people (e.g. "categories of human beings", "types of people in Quran", "who are the muttaqeen"):
  - Make EACH SECTION one category/group (e.g. "Mu'minoon — Believers", "Kafireen — Disbelievers", "Munafiqoon — Hypocrites")
  - Use type: "quality" for sections describing a group's characteristics
  - Use type: "reward" for a group's good outcomes, type: "warning" for their punishment
  - List each group's defining qualities AND their outcomes in the points

• If the query asks about a SINGLE CONCEPT (e.g. "patience", "forgiveness", "tawakkul"):
  - Use the section type guide below to organise by aspect

• If the query asks HOW TO DO something or COMMANDS:
  - Lead with "command" sections, follow with "quality" and "reward"

SECTION TYPE GUIDE:
- definition  → what this concept IS in Quranic terms
- command     → what Allah explicitly instructs
- quality     → attributes of those who embody this
- reward      → blessings and outcomes for those who follow
- warning     → consequences and cautions
- example     → Prophetic or narrative examples
- condition   → conditions under which something applies
- relationship→ how this connects to other Quranic themes`;

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
  const verses   = Array.isArray(body?.verses) ? body.verses.slice(0, 35) : [];
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
      .slice(0, 6);

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
