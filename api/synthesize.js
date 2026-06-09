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
1. Every point MUST cite at least one verse ref from the provided list, using exact format "SN:AN" (e.g. "2:153")
2. Use ONLY knowledge present in the provided verses — no additions from outside
3. 3-6 sections, 2-5 points each
4. Choose the most relevant section types for this specific topic
5. Points must be concise (max 160 characters including refs)
6. Each section type may appear at most once

SECTION TYPE GUIDE:
- definition  → what this concept IS in Quranic terms, its meaning and scope
- command     → what Allah / the Quran explicitly instructs (use "Allah commands..." / "The Quran instructs...")
- quality     → attributes and characteristics of those who embody this concept
- reward      → blessings, promises, and outcomes for those who follow
- warning     → prohibitions, consequences, and cautions
- example     → Prophetic or Quranic narrative examples
- condition   → conditions under which something applies
- relationship→ how this concept connects to other Quranic themes`;

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
          .filter(p => p && typeof p.text === 'string')
          .map(p => ({
            text: String(p.text).slice(0, 200),
            refs: (Array.isArray(p.refs) ? p.refs : [])
              .filter(r => typeof r === 'string' && /^\d+:\d+$/.test(r.trim()))
              .slice(0, 4),
          }))
          .filter(p => p.refs.length > 0)
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
