// build_root_directory.mjs — build the Root Words Directory's index.
//
//   node scripts/build_root_directory.mjs            # write it
//   node scripts/build_root_directory.mjs --check    # is it stale?
//
// The directory page (roots/) needs one row per root, but the web layer keeps
// that spread across five files. This collapses them into a single asset the
// page fetches once: data/root_directory.json.
//
// This is the web twin of the Android app's tools/build_root_directory.py and
// produces the same schema. It aggregates the glosses the same way, and for the
// same reason: explore/data/root_glosses.json maps root -> meanings already,
// but it was aggregated before the roots were rebuilt from analyzequran on
// 2026-07-10 and 46 of its entries are filed under the wrong root. The glosses
// here are re-aggregated from the word-by-word data against the current root
// assignment (data/meta/ayah_roots_analyzequran.json), the same source every
// root badge uses. Web rows are wider than a phone's, so they carry a couple
// more meanings than the Android build (4 English / 3 Urdu vs 3 / 2).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(REPO, 'data', 'root_directory.json');

const VERSION = 1;

// How many meanings a row carries. Web rows are wider than the phone's, so a
// few more fit than the Android build keeps.
const EN_GLOSSES = 4;
const UR_GLOSSES = 3;

// 20:94 is one of the three places the analyzequran chapter feed disagrees with
// its own dictionary, and the correction added a root the word list has no slot
// for (19 roots against 18 words). Every other ayah is word-for-word aligned;
// rather than guess where the extra root belongs, this one ayah contributes no
// glosses. Its occurrences still count — the tallies come from root_counts.json.
const UNALIGNED = new Set(['20:94']);

const load = rel => JSON.parse(fs.readFileSync(path.join(REPO, rel), 'utf-8'));

// True for a triliteral (or quadriliteral) root, false for a headword.
// analyzequran indexes 22 entries that are not roots — function words like
// إِذَا and proper names like إِبْرَاهِيم. They are real entries and are badged
// like any other, so they are listed, just marked, so the directory does not
// silently claim they are roots. A root is single letters separated by spaces.
function isRoot(key) {
  const parts = key.split(' ');
  return parts.length > 1 && parts.every(p => [...p].length === 1);
}

const TRIM = /[()[\].,;:!?"']/g;
const LEAD = /^(and|the|a|an|of|to|in|is|be|are|that|it|its|for|so)\s+/;

// Collapses the near-duplicates the word-by-word glosses are full of: "the
// Book", "(of) the Book", "a Book", "And the Book" are one meaning. Reducing to
// a comparison key keeps a row informative instead of spending every slot on
// the same word in four grammatical hats.
function glossKey(text) {
  let t = text.replace(TRIM, '').trim().toLowerCase();
  for (;;) {
    const stripped = t.replace(LEAD, '');
    if (stripped === t) return stripped;
    t = stripped;
  }
}

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

// Sheet number -> the number printed on that sheet. book_index.json indexes
// roots by sheet (the nth image rendered out of the PDF), but every part of the
// app names the printed page to the reader, because that is the number in their
// copy of the book — and the number the modal this row opens will show.
function printedPages(index) {
  const first = index.first;
  const out = {};
  (index.printed || []).forEach((number, offset) => {
    if (number) out[first + offset] = number;
  });
  return out;
}

function build() {
  const counts = load('explore/data/root_counts.json');
  const ayahRoots = load('data/meta/ayah_roots_analyzequran.json');
  const ayahIds = load('data/search_index/root_to_ayahids.json');
  const bookIndex = load('data/book_index.json');
  const book = bookIndex.roots;
  const printed = printedPages(bookIndex);

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

  const rows = [];
  for (const [root, occurrences] of Object.entries(counts)) {
    const row = {
      r: root,
      c: occurrences,
      a: (ayahIds[root] || []).length,
      g: pick(english.get(root) || new Map(), EN_GLOSSES),
      u: pick(urdu.get(root) || new Map(), UR_GLOSSES),
    };
    const page = book[root];
    if (page && printed[page[0]]) row.p = printed[page[0]];
    if (!isRoot(root)) row.w = true;
    rows.push(row);
  }

  // Commonest first: the directory opens on the roots a reader is likeliest to
  // have just met. The page sorts alphabetically on demand.
  rows.sort((a, b) => (b.c - a.c) || (a.r < b.r ? -1 : a.r > b.r ? 1 : 0));

  return {
    version: VERSION,
    source: 'analyzequran.com (roots and counts), quran.com (glosses), ' +
            'Fatuhat al-Quran (page numbers)',
    roots: rows,
  };
}

function main() {
  const check = process.argv.includes('--check');
  const index = build();
  const text = JSON.stringify(index);
  const rows = index.roots;

  const named = rows.filter(r => !('w' in r)).length;
  const paged = rows.filter(r => 'p' in r).length;
  const glossed = rows.filter(r => r.g.length).length;
  console.log(`${rows.length} entries — ${named} roots, ${rows.length - named} headwords`);
  console.log(`${paged} with a page in the book, ${glossed} with an English meaning`);
  console.log(`${(text.length / 1024).toFixed(0)} KB`);

  if (check) {
    if (!fs.existsSync(OUT)) { console.log('\nroot_directory.json has not been built.'); process.exit(1); }
    if (fs.readFileSync(OUT, 'utf-8') !== text) { console.log('\nroot_directory.json is out of date — run without --check.'); process.exit(1); }
    console.log('\nroot_directory.json is up to date.');
    return;
  }
  fs.writeFileSync(OUT, text);
  console.log(`\nwrote ${path.relative(REPO, OUT)}`);
}

main();
