// POST /api/search  { query: string, lang?: "en" | "ar" }
//
// Self-hosted two-stage retrieval — no Qdrant required:
//   1. Embed query with paraphrase-multilingual-mpnet-base-v2 via HF Inference API
//   2. Cosine similarity against pre-computed embeddings in data/embeddings/
//      (ar_emb.bin for Arabic queries, en_emb.bin for English queries)
//   3. Rerank top-50 with BAAI/bge-reranker-v2-m3
//   4. Return top 10
//
// The embedding files are committed to the repo and bundled with the Vercel
// function — no external vector database needed, no monthly expiry.

import fs   from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HF_TOKEN = process.env.HF_TOKEN;

// Must match the model used by 01_build_pairs.py (paraphrase-multilingual-mpnet-base-v2)
// so that query vectors and corpus vectors are in the same space.
const EMBED_MODEL  = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2";
const RERANK_MODEL = "BAAI/bge-reranker-v2-m3";
const HF_BASE      = "https://router.huggingface.co/hf-inference/models";

const TOPK_RETRIEVE = 50;   // cosine similarity candidates fed to reranker
const TOPK_RETURN   = 30;   // returned after reranking; BM25 fills the rest client-side

// ── Embedding files (committed to repo, bundled with Vercel function) ─────
// Vercel path resolution is tricky: process.cwd() varies between builds.
// Try multiple strategies, use the first that has our meta.json.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const _candidates = [
  path.join(process.cwd(), "data", "embeddings"),
  path.join(__dirname, "..", "data", "embeddings"),
  path.join(__dirname, "data", "embeddings"),
  "/var/task/data/embeddings",
];
const EMB_DIR = _candidates.find(d => fs.existsSync(path.join(d, "meta.json"))) || _candidates[0];

// Module-level cache — loaded once per warm serverless instance
let _arEmb = null;
let _enEmb = null;
let _meta  = null;
let _loadError = null;

function loadEmbeddings() {
  if (_meta) return;
  if (_loadError) throw _loadError;
  try {
    const metaPath = path.join(EMB_DIR, "meta.json");
    if (!fs.existsSync(metaPath)) {
      throw new Error(`Embedding files not found. Tried: ${_candidates.join(", ")}. Run scripts/export_embeddings.py and commit data/embeddings/.`);
    }
    _meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    const { n, dims } = _meta;
    const arBuf = fs.readFileSync(path.join(EMB_DIR, "ar_emb.bin"));
    const enBuf = fs.readFileSync(path.join(EMB_DIR, "en_emb.bin"));
    _arEmb = new Float32Array(arBuf.buffer.slice(arBuf.byteOffset, arBuf.byteOffset + n * dims * 4));
    _enEmb = new Float32Array(enBuf.buffer.slice(enBuf.byteOffset, enBuf.byteOffset + n * dims * 4));
    console.log(`Loaded embeddings: ${n} vectors × ${dims} dims from ${EMB_DIR}`);
  } catch (e) {
    _loadError = e;
    throw e;
  }
}

function localSearch(queryVec, useArabic, limit) {
  loadEmbeddings();
  const { ids, en, ar, dims, n } = _meta;
  const corpus = useArabic ? _arEmb : _enEmb;

  // Dot-product (embeddings are L2-normalised so dot = cosine similarity)
  const scores = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let dot = 0;
    const off = i * dims;
    for (let j = 0; j < dims; j++) dot += corpus[off + j] * queryVec[j];
    scores[i] = dot;
  }

  // Partial sort — get top `limit` indices
  const indices = Array.from({ length: n }, (_, i) => i);
  indices.sort((a, b) => scores[b] - scores[a]);

  return indices.slice(0, limit).map(i => ({
    payload: {
      ayah_id:      ids[i],
      surah:        parseInt(ids[i].split(":")[0]),
      ayah:         parseInt(ids[i].split(":")[1]),
      arabic_text:  ar[i],
      english_text: en[i],
      roots:        [],
    },
    score: scores[i],
  }));
}

// ── helpers ──────────────────────────────────────────────────────

const ARABIC_RE = /[؀-ۿ]/;
function detectLang(text) { return ARABIC_RE.test(text) ? "ar" : "en"; }

function normalizeQuery(text, lang) {
  let t = String(text || "").trim();
  if (lang === "en") t = t.toLowerCase();
  return t.replace(/\s+/g, " ");
}

function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

async function fetchJson(url, options, label) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${label} failed: ${res.status} ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function embedQuery(text) {
  const data = await fetchJson(
    `${HF_BASE}/${EMBED_MODEL}/pipeline/feature-extraction`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
    },
    "HF embed"
  );
  // Returns flat 768-dim vector for single-string input
  const vec = Array.isArray(data[0]) ? data[0] : data;
  // L2-normalise to match normalize_embeddings=True in the build script
  let s = 0;
  for (const x of vec) s += x * x;
  const norm = Math.sqrt(s) || 1;
  return new Float32Array(vec.map(x => x / norm));
}

async function rerankPairs(query, documents) {
  const data = await fetchJson(
    `${HF_BASE}/${RERANK_MODEL}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        inputs: documents.map(d => ({ text: query, text_pair: d })),
        options: { wait_for_model: true },
      }),
    },
    "HF rerank"
  );
  return data.map(entry => {
    const item = Array.isArray(entry) ? entry[0] : entry;
    const raw  = typeof item?.score === "number" ? item.score : 0;
    return sigmoid(raw);
  });
}

// ── handler ──────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });
  if (!HF_TOKEN) return res.status(500).json({ error: "Missing env var: HF_TOKEN" });

  // Pre-flight: make sure embeddings are loadable
  try { loadEmbeddings(); } catch (e) {
    return res.status(500).json({ error: "Embedding load failed: " + e.message, embDir: EMB_DIR });
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const rawQuery = (body?.query ?? "").toString();
  if (!rawQuery.trim()) return res.status(400).json({ error: "Missing 'query'" });

  const lang  = body?.lang === "ar" || body?.lang === "en" ? body.lang : detectLang(rawQuery);
  const query = normalizeQuery(rawQuery, lang);
  const useAr = lang === "ar";

  try {
    // 1. Embed query with HF
    const t0   = Date.now();
    const qvec = await embedQuery(query);
    const t1   = Date.now();

    // 2. Local cosine similarity → top-50 candidates (in-process, ~5 ms)
    const candidates = localSearch(qvec, useAr, TOPK_RETRIEVE);
    const t2 = Date.now();

    if (candidates.length === 0) {
      return res.status(200).json({
        query, lang, results: [],
        debug: "no_candidates",
        cached: false,
      });
    }

    // 3. Rerank top-50 on English text
    const documents = candidates.map(c => c.payload?.english_text || c.payload?.arabic_text || "");
    let rerankScores = [];
    try {
      rerankScores = await rerankPairs(query, documents);
    } catch (e) {
      console.warn("Rerank failed — falling back to embed order:", e.message);
      rerankScores = candidates.map(c => c.score || 0);
    }
    const t3 = Date.now();

    const merged = candidates.map((c, i) => ({
      ayah_id:      c.payload.ayah_id,
      surah:        c.payload.surah,
      ayah:         c.payload.ayah,
      arabic_text:  c.payload.arabic_text,
      english_text: c.payload.english_text,
      roots:        c.payload.roots || [],
      embed_score:  c.score,
      rerank_score: rerankScores[i] ?? null,
    }));

    merged.sort((a, b) => (b.rerank_score ?? -1) - (a.rerank_score ?? -1));
    const results = merged.slice(0, TOPK_RETURN);

    return res.status(200).json({
      query, lang,
      embed_model: EMBED_MODEL,
      results,
      timings_ms: {
        embed:        t1 - t0,
        local_search: t2 - t1,
        rerank:       t3 - t2,
      },
      cached: false,
    });

  } catch (e) {
    console.error("Search error:", e);
    return res.status(500).json({ error: e.message || String(e) });
  }
}
