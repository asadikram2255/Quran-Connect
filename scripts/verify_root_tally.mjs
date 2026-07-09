// Cross-check our root tally against analyzequran.com's own dictionary API.
//
//  1. Root set: /rootwordsforletterid/{1..28} lists every dictionary root.
//     Every root we tallied (by RootWordId from the chapter data) must appear
//     there, and vice versa.
//  2. Counts: /arabicwordsgrouped/{rootWordId}/1 lists every occurrence the
//     site shows for a root. The occurrence count must equal our tally.
//
// Usage: node scripts/verify_root_tally.mjs [sampleSize|all]

import fs from 'node:fs';

const SVC = 'https://encode12.com/QuranService.svc';

async function fetchJson(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch {}
    await new Promise(r => setTimeout(r, 1500 * (i + 1)));
  }
  throw new Error(`Failed: ${url}`);
}

// Rebuild tally by RootWordId from the cached raw chapter data
function tallyFromChapters() {
  const tally = {}; // id → { root, count, verses:Set }
  for (let s = 1; s <= 114; s++) {
    const f = `raw/analyzequran/chapter_${String(s).padStart(3, '0')}.json`;
    const ch = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const v of ch.Verses || []) {
      for (const w of v.Words || []) {
        if (!w.RootWordId || !w.RootWordAr) continue;
        if (!tally[w.RootWordId]) tally[w.RootWordId] = { root: w.RootWordAr.trim(), count: 0, verses: new Set() };
        tally[w.RootWordId].count++;
        tally[w.RootWordId].verses.add(`${s}:${v.ChapterVerseNo}`);
      }
    }
  }
  return tally;
}

function countOccurrences(grouped) {
  // Response: [{ArabicWordsGroupedList:[{ArabicWords:[occurrence,…]},…]},…]
  let n = 0;
  for (const g of grouped || []) {
    for (const l of g.ArabicWordsGroupedList || []) {
      n += (l.ArabicWords || []).length;
    }
  }
  return n;
}

async function main() {
  const arg = process.argv[2] || '40';
  const tally = tallyFromChapters();
  const ourIds = new Set(Object.keys(tally).map(Number));
  console.log(`Our tally: ${ourIds.size} distinct roots (by RootWordId)`);

  // ── 1. Root set comparison ────────────────────────────────────────────────
  const dictRoots = new Map(); // id → RootAr
  for (let letter = 1; letter <= 28; letter++) {
    const list = await fetchJson(`${SVC}/rootwordsforletterid/${letter}`);
    for (const r of list) dictRoots.set(r.RootWordId, r.RootAr);
  }
  console.log(`Site dictionary: ${dictRoots.size} roots across 28 letters`);

  const missingFromOurs = [...dictRoots.keys()].filter(id => !ourIds.has(id));
  const extraInOurs = [...ourIds].filter(id => !dictRoots.has(id));
  console.log(`Dictionary roots missing from our tally: ${missingFromOurs.length}`);
  for (const id of missingFromOurs.slice(0, 10)) console.log(`  missing: ${id} ${dictRoots.get(id)}`);
  console.log(`Our roots not in dictionary: ${extraInOurs.length}`);
  for (const id of extraInOurs.slice(0, 10)) console.log(`  extra: ${id} ${tally[id].root} (${tally[id].count} occ)`);

  // ── 2. Count verification ─────────────────────────────────────────────────
  let ids;
  if (arg === 'all') {
    ids = [...ourIds];
  } else {
    const sorted = [...ourIds].sort((a, b) => tally[b].count - tally[a].count);
    const n = parseInt(arg, 10);
    const top = sorted.slice(0, Math.floor(n / 2));
    const rest = sorted.slice(Math.floor(n / 2));
    const rand = [];
    for (let i = 0; i < n - top.length && rest.length; i++) {
      rand.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0]);
    }
    ids = [...top, ...rand];
  }

  let ok = 0, bad = 0, checked = 0;
  for (const id of ids) {
    const grouped = await fetchJson(`${SVC}/arabicwordsgrouped/${id}/1`);
    const siteCount = countOccurrences(grouped);
    checked++;
    if (siteCount === tally[id].count) { ok++; }
    else {
      bad++;
      console.log(`  MISMATCH ${tally[id].root} (id ${id}): site=${siteCount} ours=${tally[id].count}`);
    }
    if (checked % 25 === 0) console.log(`  …${checked}/${ids.length} checked (${ok} ok, ${bad} mismatched)`);
  }
  console.log(`\nCount check: ${ok}/${checked} roots match exactly, ${bad} mismatches`);
  console.log(missingFromOurs.length === 0 && extraInOurs.length === 0 && bad === 0
    ? 'VERIFIED: root set and occurrence counts match the site exactly.'
    : 'DIFFERENCES FOUND — see above.');
}

main().catch(e => { console.error(e); process.exit(1); });
