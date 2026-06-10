// POST /api/synthesize  { query, verses: [{ ref, text }], subtopics: string[] }
//
// RAG synthesis: given a question and verses retrieved from quran.json (all 6236 ayaat
// searched client-side), writes a flowing scholarly answer with inline verse citations.
//
// Response: { theme, response: string (prose with [SN:AN] inline citations), timing_ms }

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MODEL        = 'llama-3.1-8b-instant';
const MAX_TOKENS   = 2500;
const TIMEOUT_MS   = 25000;

const SYSTEM_PROMPT = `You are a Quranic scholar answering questions based solely on the Quranic verses provided to you. You write clear, flowing, scholarly prose — not bullet points, not lists.

ABSOLUTE RULES — ACCURACY IS PARAMOUNT:
1. Every statement must come DIRECTLY from one of the provided verses — cite it as [SN:AN].
2. State only what the verse EXPLICITLY says. Do NOT infer, imply, or extrapolate beyond the verse's actual words.
3. If a verse says "those who disbelieve will be punished" — say exactly that, do not rephrase as a broader principle.
4. If a verse is about a specific law (e.g. qisaas) do NOT turn it into a general moral statement.
5. If the provided verses do not clearly answer part of the question, say so briefly — do not fill gaps with general Islamic knowledge.
6. Do NOT make up verse references. Only cite refs exactly as given in the provided list.

HOW TO USE A VERSE CORRECTLY:
- Read the verse text provided. Your sentence should reflect what that text actually says.
- WRONG: "Those who commit murder face divine punishment [2:178]" — 2:178 prescribes the law of qisaas, it doesn't say this.
- RIGHT: "Allah has prescribed qisaas (retribution) for cases of murder [2:178]."
- WRONG: "11:48 shows that rejecting signs leads to punishment" — that verse is about Noah's descendants.
- RIGHT: "The descendants of those saved with Noah are told they will receive brief enjoyment, then a painful punishment will touch them [11:48]."

OUTPUT FORMAT:
- Write continuous prose paragraphs — like a scholar explaining to a student
- Cite verses inline: "The believers establish prayer and give in charity [2:177]."
- Use **bold** for key Arabic terms on first use: **Mu'minoon** (Believers)
- For concept queries: cover what the verses explicitly say about definition, commands, qualities, rewards, warnings
- Length: cover everything the verses say — do not truncate, but do not pad with inferences
- End with a brief concluding sentence

WHAT NOT TO DO:
- Do not use bullet points or numbered lists
- Do not add information not explicitly in the provided verses
- Do not rephrase a verse into a broader claim it doesn't make
- Do not write "According to the verses provided" — just write the answer directly`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });
  if (!GROQ_API_KEY)           return res.status(200).json({ response: '', error: 'Missing GROQ_API_KEY' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  const query      = String(body?.query ?? '').trim().slice(0, 300);
  const verses     = Array.isArray(body?.verses)     ? body.verses.slice(0, 80)      : [];
  const subtopics  = Array.isArray(body?.subtopics)  ? body.subtopics.slice(0, 8)    : [];
  const groupNames = Array.isArray(body?.groupNames) ? body.groupNames.slice(0, 40)  : [];
  const groupVerses = Array.isArray(body?.groupVerses) ? body.groupVerses            : null;

  if (!query || (!verses.length && !groupVerses)) {
    return res.status(400).json({ error: 'Missing query or verses' });
  }

  let userMessage;

  if (groupVerses && groupVerses.length) {
    // Category query: structured format — each group with its own verses
    const groupBlocks = groupVerses
      .map(g => {
        const vLines = (g.verses || [])
          .map(v => `  [${v.ref}] ${String(v.text || '').slice(0, 90)}`)
          .join('\n');
        return `## ${g.name}\n${vLines || '  (no verse found)'}`;
      })
      .join('\n\n');

    userMessage = `Question: "${query}"\n\nVerses grouped by category (write one scholarly paragraph per category, citing only its verses; if a category has no verse, still mention it briefly):\n\n${groupBlocks}`;
  } else {
    // Non-category query: flat verse list
    const verseList = verses
      .map(v => `[${v.ref}] ${String(v.text || '').slice(0, 100)}`)
      .join('\n');

    const subtopicHint = subtopics.length
      ? `\nAspects to cover: ${subtopics.join(', ')}`
      : '';

    userMessage = `Question: "${query}"${subtopicHint}\n\nVerses retrieved from the Quran database:\n${verseList}`;
  }

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
    const text = (data?.choices?.[0]?.message?.content || '').trim();

    if (!text) throw new Error('Empty response from model');

    return res.status(200).json({
      theme:     query.length > 60 ? query.slice(0, 57) + '…' : query,
      response:  text,
      timing_ms: Date.now() - t0,
    });

  } catch (e) {
    console.error('[synthesize] error:', e.message);
    return res.status(200).json({ theme: query, response: '', error: e.message });
  }
}
