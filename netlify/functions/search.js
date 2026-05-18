// POST /api/search  { query: string, lang?: "en" | "ar" }
//
// Two-stage retrieval:
//   1. Embed query with Alibaba-NLP/gte-multilingual-base via HF Inference API
//   2. Qdrant search on named vector ("en" or "ar_lemma") → Top 50
//   3. Rerank with BAAI/bge-reranker-v2-m3 on (query, english_text) pairs
//   4. Cache result in Vercel KV (30-day TTL) keyed by sha1(lang:normalized_query)

import { kv } from "@vercel/kv";
import crypto from "node:crypto";

const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const HF_TOKEN = process.env.HF_TOKEN;

const COLLECTION = process.env.QDRANT_COLLECTION || "quran_verses";
const EMBED_MODEL = "BAAI/bge-m3";
const RERANK_MODEL = "BAAI/bge-reranker-v2-m3";

const HF_BASE = "https://router.huggingface.co/hf-inference/models";

const TOPK_RETRIEVE = 50;
const TOPK_RETURN = 10;
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

// ── helpers ─────────────────────────────────────────────────────

const ARABIC_RE = /[؀-ۿ]/;

function detectLang(text) {
  return ARABIC_RE.test(text) ? "ar" : "en";
}

function normalizeQuery(text, lang) {
  let t = String(text || "").trim();
  if (lang === "en") t = t.toLowerCase();
  t = t.replace(/\s+/g, " ");
  return t;
}

function cacheKey(lang, query) {
  const h = crypto.createHash("sha1").update(`${lang}:${query}`).digest("hex");
  return `qs:v1:${h}`;
}

function l2normalize(vec) {
  let s = 0;
  for (const x of vec) s += x * x;
  const n = Math.sqrt(s) || 1;
  return vec.map((x) => x / n);
}

async function fetchJson(url, options, label) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${label} failed: ${res.status} ${body.slice(0, 300)}`);
  }
  return res.json();
}

// ── HF Inference API ────────────────────────────────────────────

async function embedQuery(text) {
  const data = await fetchJson(
    `${HF_BASE}/${EMBED_MODEL}/pipeline/feature-extraction`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
    },
    "HF embed"
  );
  // bge-m3 returns a flat 1024-dim vector for single-string input.
  // L2-normalize to match the index-side normalize_embeddings=True.
  const vec = Array.isArray(data[0]) ? data[0] : data;
  return l2normalize(vec);
}

async function rerankPairs(query, documents) {
  // HF text-classification pipeline for cross-encoder rerankers expects
  // an array of {text, text_pair} objects. Returns nested arrays of
  // {label, score}. Score is the relevance (higher = more relevant).
  const data = await fetchJson(
    `${HF_BASE}/${RERANK_MODEL}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: documents.map((d) => ({ text: query, text_pair: d })),
        options: { wait_for_model: true },
      }),
    },
    "HF rerank"
  );
  // Response shape: [[{label, score}, {label, score}, ...]]
  // (Nested because the API can batch multiple "inputs", but we send one batch.)
  const flat = Array.isArray(data?.[0]) ? data[0] : data;
  return flat.map((item) => (typeof item?.score === "number" ? item.score : 0));
}

// ── Qdrant ──────────────────────────────────────────────────────

async function qdrantSearch(vector, vectorName, limit) {
  const data = await fetchJson(
    `${QDRANT_URL}/collections/${COLLECTION}/points/search`,
    {
      method: "POST",
      headers: {
        "api-key": QDRANT_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        vector: { name: vectorName, vector },
        limit,
        with_payload: true,
      }),
    },
    "Qdrant search"
  );
  return data.result || [];
}

// ── handler ─────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!QDRANT_URL || !QDRANT_API_KEY || !HF_TOKEN) {
    return res.status(500).json({ error: "Missing env vars (QDRANT_URL, QDRANT_API_KEY, HF_TOKEN)" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const rawQuery = (body?.query ?? "").toString();
  if (!rawQuery.trim()) {
    return res.status(400).json({ error: "Missing 'query'" });
  }

  const lang = body?.lang === "ar" || body?.lang === "en" ? body.lang : detectLang(rawQuery);
  const query = normalizeQuery(rawQuery, lang);
  const vectorName = lang === "ar" ? "ar_lemma" : "en";

  // 1. Cache check
  const key = cacheKey(lang, query);
  try {
    const cached = await kv.get(key);
    if (cached) {
      return res.status(200).json({ ...cached, cached: true });
    }
  } catch (e) {
    // Cache miss or KV not configured — continue.
    console.warn("KV read failed:", e.message);
  }

  try {
    // 2. Embed
    const t0 = Date.now();
    const qvec = await embedQuery(query);
    const t1 = Date.now();

    // 3. Qdrant top-K candidates
    const candidates = await qdrantSearch(qvec, vectorName, TOPK_RETRIEVE);
    const t2 = Date.now();

    if (candidates.length === 0) {
      const empty = { query, lang, results: [], timings_ms: { embed: t1 - t0, qdrant: t2 - t1 } };
      try { await kv.set(key, empty, { ex: CACHE_TTL_SECONDS }); } catch {}
      return res.status(200).json({ ...empty, cached: false });
    }

    // 4. Rerank on English text (cross-encoder works best with reader-language text)
    const documents = candidates.map((c) => c.payload?.english_text || c.payload?.arabic_text || "");
    let rerankScores = [];
    try {
      rerankScores = await rerankPairs(query, documents);
    } catch (e) {
      // If reranker fails, fall back to embed order.
      console.warn("Rerank failed, falling back to embedding scores:", e.message);
      rerankScores = candidates.map((c) => c.score || 0);
    }
    const t3 = Date.now();

    const merged = candidates.map((c, i) => ({
      ayah_id: c.payload?.ayah_id,
      surah: c.payload?.surah,
      ayah: c.payload?.ayah,
      arabic_text: c.payload?.arabic_text,
      english_text: c.payload?.english_text,
      roots: c.payload?.roots || [],
      embed_score: typeof c.score === "number" ? c.score : null,
      rerank_score: typeof rerankScores[i] === "number" ? rerankScores[i] : null,
    }));

    merged.sort((a, b) => (b.rerank_score ?? -1) - (a.rerank_score ?? -1));
    const results = merged.slice(0, TOPK_RETURN);

    const payload = {
      query,
      lang,
      vector_used: vectorName,
      results,
      timings_ms: {
        embed: t1 - t0,
        qdrant: t2 - t1,
        rerank: t3 - t2,
      },
    };

    try {
      await kv.set(key, payload, { ex: CACHE_TTL_SECONDS });
    } catch (e) {
      console.warn("KV write failed:", e.message);
    }

    return res.status(200).json({ ...payload, cached: false });
  } catch (e) {
    console.error("Search error:", e);
    return res.status(500).json({ error: e.message || String(e) });
  }
}
