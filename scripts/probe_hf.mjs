// Probe Arabic + multilingual embedding models on HF serverless.
// Measures: availability, dim, latency, and (rough) Arabic quality via cosine sim.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(resolve(__dirname, "..", ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^"(.*)"$/, "$1");
}
const HF = process.env.HF_TOKEN;

// Mix of multilingual + Arabic-specific contenders
const candidates = [
  { id: "BAAI/bge-m3",                                              kind: "multilingual" },
  { id: "intfloat/multilingual-e5-base",                            kind: "multilingual",  prefix_q: "query: ", prefix_d: "passage: " },
  { id: "intfloat/multilingual-e5-large",                           kind: "multilingual",  prefix_q: "query: ", prefix_d: "passage: " },
  { id: "sentence-transformers/distiluse-base-multilingual-cased-v2", kind: "multilingual" },
  { id: "sentence-transformers/paraphrase-multilingual-mpnet-base-v2", kind: "multilingual" },
  // Arabic-focused
  { id: "Omartificial-Intelligence-Space/Arabic-mpnet-base-all-nli-triplet", kind: "arabic" },
  { id: "Omartificial-Intelligence-Space/Arabic-Triplet-Matryoshka-V2",      kind: "arabic" },
  { id: "Omartificial-Intelligence-Space/Arabic-MiniLM-L12-v2-all-nli-triplet", kind: "arabic" },
  { id: "silma-ai/silma-embeddding-matryoshka-v0.1",                kind: "arabic" },
];

const QUERY_EN = "patience in hardship";
const VERSE_RELEVANT_AR = "إن مع العسر يسرا";          // "Indeed with hardship comes ease" (94:6)
const VERSE_RELEVANT_EN = "Indeed, with hardship comes ease.";
const VERSE_IRRELEVANT = "The sky is blue and the grass is green.";

const QUERY_AR = "الصبر عند المصيبة";                  // "patience in calamity"

async function embed(model, text, prefix = "") {
  const url = `https://router.huggingface.co/hf-inference/models/${model}/pipeline/feature-extraction`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${HF}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inputs: prefix + text, options: { wait_for_model: true } }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${txt.slice(0, 180)}`);
  const data = JSON.parse(txt);
  return Array.isArray(data[0]) ? data[0] : data;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

for (const c of candidates) {
  console.log(`\n=== [${c.kind}] ${c.id} ===`);
  const t0 = Date.now();
  try {
    const pq = c.prefix_q || "";
    const pd = c.prefix_d || "";
    const [qEn, qAr, dArR, dEnR, dIrr] = await Promise.all([
      embed(c.id, QUERY_EN, pq),
      embed(c.id, QUERY_AR, pq),
      embed(c.id, VERSE_RELEVANT_AR, pd),
      embed(c.id, VERSE_RELEVANT_EN, pd),
      embed(c.id, VERSE_IRRELEVANT, pd),
    ]);
    const dt = Date.now() - t0;
    const dim = qEn.length;

    const en_relAr  = cosine(qEn, dArR).toFixed(3);
    const en_relEn  = cosine(qEn, dEnR).toFixed(3);
    const en_irr    = cosine(qEn, dIrr).toFixed(3);
    const ar_relAr  = cosine(qAr, dArR).toFixed(3);
    const ar_relEn  = cosine(qAr, dEnR).toFixed(3);
    const ar_irr    = cosine(qAr, dIrr).toFixed(3);

    console.log(`  dim=${dim}  total_latency=${dt}ms (5 calls)`);
    console.log(`  EN query  → AR verse: ${en_relAr}  |  EN verse: ${en_relEn}  |  irrelevant: ${en_irr}`);
    console.log(`  AR query  → AR verse: ${ar_relAr}  |  EN verse: ${ar_relEn}  |  irrelevant: ${ar_irr}`);
    // Quality signal = gap between relevant and irrelevant
    const gap_en = parseFloat(en_relEn) - parseFloat(en_irr);
    const gap_ar = parseFloat(ar_relAr) - parseFloat(ar_irr);
    const gap_xl = parseFloat(en_relAr) - parseFloat(en_irr); // crosslingual: EN query → AR verse
    console.log(`  Gap relevant-vs-irrelevant:  EN-EN=${gap_en.toFixed(3)}  AR-AR=${gap_ar.toFixed(3)}  CROSSLING(EN→AR)=${gap_xl.toFixed(3)}`);
  } catch (e) {
    console.log(`  FAILED: ${e.message}`);
  }
}
