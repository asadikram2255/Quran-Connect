// Rewrite the display-only `roots_ordered` field in data/quran_text shards
// (consumed by the Explore Connections "Words & Roots" panel) so the roots
// shown per ayah exactly match analyzequran.com — the same authoritative
// source already used by the Search and Explore Quran modules.
//
// Reads the cached AQ chapter data in raw/analyzequran (run
// scripts/fetch_analyzequran_roots.mjs first if missing) and applies the
// same dictionary corrections.
//
// Usage: node scripts/update_quran_text_roots.mjs

import fs from 'node:fs';

const CORRECTIONS = { '2:3#1': 'ٱلَّذِى' }; // alladhi
const EXTRA = [
  { ref: '20:94', root: 'ا م م' }, // a-m-m
  { ref: '48:29', root: 'ع ظ م' }, // ayn-Za-m
];

// ref → ordered unique AQ roots
const ayahRoots = {};
for (let s = 1; s <= 114; s++) {
  const ch = JSON.parse(fs.readFileSync(`raw/analyzequran/chapter_${String(s).padStart(3, '0')}.json`, 'utf8'));
  for (const v of ch.Verses || []) {
    const ref = `${s}:${v.ChapterVerseNo}`;
    const set = new Set();
    for (const w of v.Words || []) {
      const root = (w.RootWordAr || CORRECTIONS[`${ref}#${w.WordNo}`] || '').trim();
      if (root) set.add(root);
    }
    ayahRoots[ref] = set;
  }
}
for (const { ref, root } of EXTRA) ayahRoots[ref]?.add(root);

let changedVerses = 0, total = 0;
for (let s = 1; s <= 114; s++) {
  const file = `data/quran_text/quran_s${String(s).padStart(3, '0')}.json`;
  const shard = JSON.parse(fs.readFileSync(file, 'utf8'));
  let dirty = false;
  for (const rec of shard) {
    total++;
    const next = [...(ayahRoots[rec.ayah_id] || [])];
    if (JSON.stringify(rec.roots_ordered || []) !== JSON.stringify(next)) {
      rec.roots_ordered = next;
      changedVerses++;
      dirty = true;
    }
  }
  if (dirty) fs.writeFileSync(file, JSON.stringify(shard));
}
console.log(`roots_ordered updated on ${changedVerses}/${total} verses across data/quran_text shards`);
