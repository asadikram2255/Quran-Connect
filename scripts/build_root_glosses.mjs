// build_root_glosses.mjs — regenerate explore/data/root_glosses.json.
//
//   node scripts/build_root_glosses.mjs            # write it
//   node scripts/build_root_glosses.mjs --check    # is it stale?
//
// Maps every root to its commonest English and Urdu word-by-word glosses:
//   { "<root>": { en: [...], ur: [...] } }
//
// Why this exists instead of fetch_wbw.mjs doing it: fetch_wbw aggregated root
// glosses through search/data/word_roots.json (a normalized word -> roots map)
// at fetch time, before the roots were rebuilt from analyzequran on 2026-07-10.
// 46 of the 1,664 entries ended up filed under the wrong root — و ع د,
// "promise", was glossed "Allah". This re-aggregates offline against the
// current per-word root assignment (data/meta/ayah_roots_analyzequran.json),
// the same source every root badge in the app uses, so a root is glossed with
// the words that actually carry it. Matches the Android build_root_directory.py
// aggregation exactly.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(REPO, 'explore', 'data', 'root_glosses.json');

// How many distinct meanings to keep per root, after collapsing grammatical
// variants ("the Book" / "(of) the Book" / "a Book" are one meaning).
const EN_GLOSSES = 12;
const UR_GLOSSES = 12;

// 20:94 is one of the three ayaat where the analyzequran chapter feed disagrees
// with its own dictionary, and the correction added a root the word list has no
// slot for (19 roots against 18 words). Every other ayah is word-for-word
// aligned; rather than guess where the extra root belongs, this one ayah
// contributes no glosses. Its occurrences still count elsewhere (root_counts).
const UNALIGNED = new Set(['20:94']);

const load = rel => JSON.parse(fs.readFileSync(path.join(REPO, rel), 'utf-8'));

const TRIM = /[()[\].,;:!?"']/g;
const LEAD = /^(and|the|a|an|of|to|in|is|be|are|that|it|its|for|so)\s+/;

// Collapses near-duplicate glosses to a comparison key, so the kept list holds
// distinct meanings rather than the same word in four grammatical hats.
function glossKey(text) {
  let t = text.replace(TRIM, '').trim().toLowerCase();
  for (;;) {
    const stripped = t.replace(LEAD, '');
    if (stripped === t) return stripped;
    t = stripped;
  }
}

// The most frequent distinct glosses, keeping the first surface form seen for
// each meaning (Counter is iterated most-common first).
function pick(counter, limit) {
  const chosen = [];
  const seen = new Set();
  const entries = [...counter.entries()].sort((a, b) => b[1] - a[1]);
  for (const [text] of entries) {
    const key = glossKey(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    chosen.push(text);
    if (chosen.length === limit) break;
  }
  return chosen;
}

function bump(map, root, text) {
  const s = (text || '').trim();
  if (!s) return;
  let c = map.get(root);
  if (!c) { c = new Map(); map.set(root, c); }
  c.set(s, (c.get(s) || 0) + 1);
}

function build() {
  const ayahRoots = load('data/meta/ayah_roots_analyzequran.json');

  const words = {};
  const wbwDir = path.join(REPO, 'explore', 'data', 'wbw');
  for (const file of fs.readdirSync(wbwDir).filter(f => /^wbw_s\d+\.json$/.test(f)).sort()) {
    Object.assign(words, JSON.parse(fs.readFileSync(path.join(wbwDir, file), 'utf-8')));
  }

  const english = new Map();   // root -> Map<gloss, count>
  const urdu = new Map();

  for (const [ayah, roots] of Object.entries(ayahRoots)) {
    if (UNALIGNED.has(ayah)) continue;
    const row = words[ayah];
    if (!row || row.length !== roots.length) {
      throw new Error(
        `${ayah}: ${roots.length} roots against ${(row || []).length} words. ` +
        'The word-by-word data and the root export have drifted apart; ' +
        'one has been rebuilt without the other.');
    }
    for (let i = 0; i < roots.length; i++) {
      const root = roots[i];
      if (!root) continue;
      bump(english, root, row[i].en);
      bump(urdu, root, row[i].ur);
    }
  }

  // Sorted by root so the file is stable across runs (aids --check + diffs).
  const roots = new Set([...english.keys(), ...urdu.keys()]);
  const out = {};
  for (const root of [...roots].sort()) {
    out[root] = {
      en: pick(english.get(root) || new Map(), EN_GLOSSES),
      ur: pick(urdu.get(root) || new Map(), UR_GLOSSES),
    };
  }
  return out;
}

function main() {
  const check = process.argv.includes('--check');
  const glosses = build();
  const text = JSON.stringify(glosses);
  const n = Object.keys(glosses).length;
  console.log(`${n} roots glossed · ${(text.length / 1024).toFixed(0)} KB`);

  if (check) {
    if (!fs.existsSync(OUT)) { console.log('\nroot_glosses.json has not been built.'); process.exit(1); }
    if (fs.readFileSync(OUT, 'utf-8') !== text) { console.log('\nroot_glosses.json is out of date — run without --check.'); process.exit(1); }
    console.log('\nroot_glosses.json is up to date.');
    return;
  }
  fs.writeFileSync(OUT, text);
  console.log(`\nwrote ${path.relative(REPO, OUT)}`);
}

main();
