// POST /api/rerank  { query: string, passages: string[] }
//
// Lightweight cross-encoder reranking endpoint.
// Takes an already-retrieved set of passages and returns relevance scores
// using BAAI/bge-reranker-v2-m3 via HF Inference API.
//
// Used by the Search Quran module to re-order BM25+root results by semantic
// relevance, without re-doing the full embedding + retrieval pipeline.
//
// Response: { scores: number[], timings_ms: { rerank: number } }

const HF_TOKEN     = process.env.HF_TOKEN;
const RERANK_MODEL = 'BAAI/bge-reranker-v2-m3';
const HF_BASE      = 'https://router.huggingface.co/hf-inference/models';

function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

async function fetchJson(url, options, label) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${label} failed: ${res.status} ${body.slice(0, 300)}`);
  }
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });
  if (!HF_TOKEN) return res.status(500).json({ error: 'Missing env var: HF_TOKEN' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  const query    = String(body?.query ?? '').trim();
  const passages = Array.isArray(body?.passages) ? body.passages : [];

  if (!query)            return res.status(400).json({ error: "Missing 'query'" });
  if (!passages.length)  return res.status(400).json({ error: "Missing 'passages'" });
  const truncated = passages.length > 100;
  if (truncated) return res.status(400).json({ error: 'Too many passages (max 100)', truncated: true, passage_limit: 100 });

  try {
    const t0   = Date.now();
    const data = await fetchJson(
      `${HF_BASE}/${RERANK_MODEL}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${HF_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs: passages.map(p => ({ text: query, text_pair: String(p || '') })),
          options: { wait_for_model: true },
        }),
      },
      'HF rerank'
    );
    const t1 = Date.now();

    // Normalise to 0-1 via sigmoid
    const scores = data.map(entry => {
      const item = Array.isArray(entry) ? entry[0] : entry;
      const raw  = typeof item?.score === 'number' ? item.score : 0;
      return sigmoid(raw);
    });

    return res.status(200).json({ scores, timings_ms: { rerank: t1 - t0 }, passage_limit: 100 });

  } catch (e) {
    console.error('Rerank error:', e);
    return res.status(500).json({ error: e.message || String(e) });
  }
}
