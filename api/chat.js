// POST /api/chat  { messages: [{role:'user'|'assistant', content}], verses: [{ref, text}] }
//
// Grounded Quran chat: the model may ONLY answer using the supplied verses.
// It must cite refs for every claim and say so explicitly if the verses don't
// cover the question — it must never draw on outside knowledge of hadith,
// tafsir, or general world knowledge.
//
// Response: { reply: string, citedRefs: string[], timing_ms }

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MODEL         = 'llama-3.1-8b-instant';
const MAX_TOKENS    = 700;
const TIMEOUT_MS    = 20000;

const SYSTEM_PROMPT = `You are a Quran study assistant. You may ONLY use the Quran verses provided to you in each turn as your source of truth — never hadith, tafsir, scholarly opinion, or general world knowledge.

RULES:
- Answer using ONLY the provided verses. Cite every claim inline with its reference in square brackets, e.g. [2:153].
- If the provided verses do not contain enough information to answer, say so plainly instead of guessing or using outside knowledge.
- Never invent a verse reference that was not provided to you.
- Keep answers concise (under 180 words) and written in plain English.
- Do not mention hadith collections, scholars, or non-Quranic sources, even if the user asks about them — redirect to what the Quran itself says.`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });
  if (!GROQ_API_KEY)           return res.status(200).json({ reply: '', citedRefs: [], error: 'Missing GROQ_API_KEY' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  const REF_RE = /^\d{1,3}:\d{1,3}$/;
  const rawVerses = Array.isArray(body?.verses) ? body.verses : [];
  const verses = rawVerses
    .slice(0, 20)
    .filter(v => v && typeof v.ref === 'string' && REF_RE.test(v.ref.trim()));

  const rawMessages = Array.isArray(body?.messages) ? body.messages : [];
  const messages = rawMessages
    .slice(-10)
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: String(m.content).slice(0, 1000) }));

  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'Missing messages or last message is not from user' });
  }
  if (!verses.length) {
    return res.status(200).json({
      reply: "I couldn't find any Quran verses related to that — try rephrasing your question.",
      citedRefs: [],
    });
  }

  const verseBlock = verses
    .map(v => `[${v.ref.trim()}] ${String(v.text || '').slice(0, 200)}`)
    .join('\n');

  const groqMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: `Verses available for this turn:\n${verseBlock}` },
    ...messages,
  ];

  try {
    const t0 = Date.now();
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
          messages:   groqMessages,
        }),
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT_MS)),
    ]);

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Groq ${resp.status}: ${err.slice(0, 200)}`);
    }

    const data  = await resp.json();
    const reply = (data?.choices?.[0]?.message?.content || '').trim();

    const validRefs = new Set(verses.map(v => v.ref.trim()));
    const citedRefs = [...new Set(
      (reply.match(/\[(\d{1,3}:\d{1,3})\]/g) || []).map(m => m.slice(1, -1))
    )].filter(r => validRefs.has(r));

    return res.status(200).json({
      reply,
      citedRefs,
      timing_ms: Date.now() - t0,
    });

  } catch (e) {
    console.error('[chat] error:', e.message);
    const isRateLimit = e.message.includes('429') || /rate/i.test(e.message);
    return res.status(200).json({
      reply: '',
      citedRefs: [],
      error: isRateLimit ? 'rate_limited' : e.message,
    });
  }
}
