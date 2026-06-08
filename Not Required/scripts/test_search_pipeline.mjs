// Standalone smoke test for the two-stage retrieval pipeline.
// Mirrors api/search.js but bypasses Vercel KV so we can validate locally.
//
// Usage:  node scripts/test_search_pipeline.mjs "feeling overwhelmed"

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env");
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^"(.*)"$/, "$1");
}

const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const HF_TOKEN = process.env.HF_TOKEN;
const COLLECTION = process.env.QDRANT_COLLECTION || "quran_verses";

const EMBED_MODEL = "BAAI/bge-m3";
const RERANK_MODEL = "BAAI/bge-reranker-v2-m3";
const HF_BASE = "https://router.huggingface.co/hf-inference/models";

function l2normalize(v) {
  let s = 0; for (const x of v) s += x*x;
  const n = Math.sqrt(s) || 1;
  return v.map(x => x/n);
}

async function step(label, fn) {
  process.stdout.write(`  → ${label}... `);
  const t = Date.now();
  try { const o = await fn(); console.log(`OK (${Date.now()-t}ms)`); return o; }
  catch (e) { console.log(`FAILED (${Date.now()-t}ms)`); throw e; }
}

async function embedQuery(text) {
  const res = await fetch(`${HF_BASE}/${EMBED_MODEL}/pipeline/feature-extraction`, {
    method: "POST",
    headers: { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${txt.slice(0, 400)}`);
  const data = JSON.parse(txt);
  const vec = Array.isArray(data[0]) ? data[0] : data;
  return { vec: l2normalize(vec), dim: vec.length };
}

async function qdrantSearch(vector, name, limit = 50) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
    method: "POST",
    headers: { "api-key": QDRANT_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ vector: { name, vector }, limit, with_payload: true }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${txt.slice(0, 400)}`);
  return (JSON.parse(txt).result) || [];
}

async function rerank(query, docs) {
  const res = await fetch(`${HF_BASE}/${RERANK_MODEL}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      inputs: docs.map((d) => ({ text: query, text_pair: d })),
      options: { wait_for_model: true },
    }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${txt.slice(0, 400)}`);
  const data = JSON.parse(txt);
  const flat = Array.isArray(data?.[0]) ? data[0] : data;
  return flat.map((it) => (typeof it?.score === "number" ? it.score : 0));
}

// ── Main ──────────────────────────────────────────────────────────
const query = process.argv[2] || "patience in hardship";
console.log(`\n🔍 Query: "${query}"\n`);

if (!QDRANT_URL || !QDRANT_API_KEY || !HF_TOKEN) {
  console.error("Missing env vars in .env");
  process.exit(1);
}

const { vec, dim } = await step(`Embed query (${EMBED_MODEL})`, () => embedQuery(query));
console.log(`     dim = ${dim}`);

const isArabic = /[؀-ۿ]/.test(query);
const vectorName = isArabic ? "ar_lemma" : "en";
console.log(`     vector = ${vectorName} (lang=${isArabic ? "ar" : "en"})`);
const hits = await step(`Qdrant search top 50 on '${vectorName}' vector`, () => qdrantSearch(vec, vectorName, 50));
console.log(`     candidates = ${hits.length}`);
if (hits.length === 0) {
  console.error("⚠️  Empty result — re-upload likely needed (collection has wrong-dim vectors).");
  process.exit(2);
}

console.log("\n  Top 5 by embedding score:");
hits.slice(0,5).forEach((h, i) => {
  const en = (h.payload?.english_text || "").slice(0, 90).replace(/\s+/g, " ");
  console.log(`    ${i+1}. ${h.payload?.ayah_id}  embed=${h.score?.toFixed(3)}  "${en}…"`);
});

const docs = hits.map(h => h.payload?.english_text || "");
const scores = await step(`Rerank top ${docs.length} (${RERANK_MODEL})`, () => rerank(query, docs));
console.log(`     scores = ${scores.length}`);

const merged = hits.map((h, i) => ({
  ayah_id: h.payload?.ayah_id,
  english: (h.payload?.english_text || "").slice(0, 120).replace(/\s+/g, " "),
  embed_score: h.score,
  rerank_score: scores[i],
})).sort((a, b) => (b.rerank_score ?? -1) - (a.rerank_score ?? -1));

console.log("\n✅ Final Top 10 (reranked):\n");
merged.slice(0, 10).forEach((r, i) => {
  console.log(`  ${i+1}. ${r.ayah_id}  rerank=${(r.rerank_score ?? 0).toFixed(4)}  embed=${(r.embed_score ?? 0).toFixed(3)}`);
  console.log(`     "${r.english}…"\n`);
});
