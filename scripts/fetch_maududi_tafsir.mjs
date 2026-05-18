#!/usr/bin/env node
/**
 * fetch_maududi_tafsir.mjs
 * Fetches Tafhim al-Qur'an ("Towards Understanding the Quran") from
 * islamicstudies.info and writes per-surah JSON shards for the quran-connect app.
 *
 * Source:  islamicstudies.info — hosts the English Tafhim with permission from
 *          Islamic Foundation UK.
 *
 * Output:  data/tafsir/maududi/quran_s001.json … quran_s114.json
 *          data/meta/tafsir_index.json  (maududi entry added)
 *
 * Usage:
 *   node scripts/fetch_maududi_tafsir.mjs               # all 114 surahs
 *   node scripts/fetch_maududi_tafsir.mjs --surah 1     # test one surah
 *   node scripts/fetch_maududi_tafsir.mjs --force       # overwrite existing
 */

import https from 'node:https';
import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT    = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'tafsir', 'maududi');
const IDX_PATH = path.join(ROOT, 'data', 'meta', 'tafsir_index.json');

// Verse count per surah (1-indexed; index 0 unused)
const VERSE_COUNTS = [0,
  7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,
  112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,
  59,37,35,38,29,18,45,60,25,22,63,12,20,52,52,44,28,28,20,56,25,22,40,30,
  26,25,25,24,20,40,21,33,51,30,23,33,26,17,47,44,12,18,17,31,34,45,45,8,
  29,25,25,20,25,23,17,24,6,5,17,11,16,16,20,19,18,15,16,8,21,28,8,13,5,8,
  8,5,11,20,9,3,13,11,12,7,5,5,5,3,4,5,3,6,3,5,4,5,5,3,6,5,3,6,5,5,8,5,
  6,5,9,36,5,4,6,3,6,5,5,5,5,4,5,6,5,5,5,5,5,4,4,5,4,6,7,5,6,5,5,5,8,3,5,5,
];

// ── Helpers ────────────────────────────────────────────────

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept':          'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer':         'https://islamicstudies.info/',
      },
    };
    let retries = 3;
    function attempt() {
      https.get(url, opts, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve(data));
        res.on('error', err => { if (--retries > 0) setTimeout(attempt, 3000); else reject(err); });
      }).on('error', err => { if (--retries > 0) setTimeout(attempt, 3000); else reject(err); });
    }
    attempt();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function stripHtml(s) {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim();
}

// ── Parser ─────────────────────────────────────────────────
//
// Page structure (confirmed by inspection):
//   <p class="tr">(S:V) verse text<sup>N</sup> </p>
//   <p class="nt">N. Commentary text for footnote N... </p>
//
// Algorithm:
//   Walk all <p class="tr"> and <p class="nt"> blocks in document order.
//   Each "tr" sets the current verse key.
//   Each "nt" appends its text to the current verse key.
//   Multiple footnotes for the same verse are joined with double newline.

function parseSurahHtml(html, surahNum) {
  const result = {};

  // Collect all tr and nt paragraphs with their document positions
  const elements = [];
  const re = /<p class="(tr|nt)">([\s\S]*?)<\/p>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    elements.push({ type: m[1], pos: m.index, raw: m[2] });
  }

  let currentVerse = null;

  for (const el of elements) {
    if (el.type === 'tr') {
      // Extract verse reference — site uses (S:V) or [S:V] depending on surah
      const vm = el.raw.match(/[(\[](\d+):(\d+)[)\]]/);
      if (vm) {
        currentVerse = `${vm[1]}:${vm[2]}`;
      }
    } else if (el.type === 'nt' && currentVerse) {
      const text = stripHtml(el.raw);
      if (text.length > 15) {
        result[currentVerse] = result[currentVerse]
          ? result[currentVerse] + '\n\n' + text
          : text;
      }
    }
  }

  return result;
}

// ── I/O ────────────────────────────────────────────────────

function writeShard(surahNum, data) {
  const padded = String(surahNum).padStart(3, '0');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, `quran_s${padded}.json`),
    JSON.stringify(data, null, 0),
    'utf8',
  );
}

function shardExists(surahNum) {
  const padded = String(surahNum).padStart(3, '0');
  const p = path.join(OUT_DIR, `quran_s${padded}.json`);
  if (!fs.existsSync(p)) return false;
  // Treat placeholder file as missing
  const content = fs.readFileSync(p, 'utf8');
  return !content.includes('[نمونہ]');
}

function updateTafsirIndex() {
  let idx = { version: 1, sources: {} };
  if (fs.existsSync(IDX_PATH)) {
    try { idx = JSON.parse(fs.readFileSync(IDX_PATH, 'utf8')); } catch {}
  }
  idx.sources = idx.sources || {};
  idx.sources.maududi = {
    label:         "Tafhim al-Qur'an",
    author:        "Sayyid Abul A'la Maududi",
    lang:          'en',
    shard_pattern: 'data/tafsir/maududi/quran_s{NNN}.json',
  };
  fs.writeFileSync(IDX_PATH, JSON.stringify(idx, null, 2), 'utf8');
  console.log('  ✓ tafsir_index.json updated — Tafhim tab is now live.');
}

// ── Main ───────────────────────────────────────────────────

async function main() {
  const args  = process.argv.slice(2);
  const force = args.includes('--force');
  const surahIdx = args.indexOf('--surah');
  const targetSurah = surahIdx >= 0 ? parseInt(args[surahIdx + 1]) : null;

  const surahs = targetSurah
    ? [targetSurah]
    : Array.from({ length: 114 }, (_, i) => i + 1);

  let ok = 0, skip = 0, fail = 0;

  for (const sn of surahs) {
    if (!force && shardExists(sn)) { skip++; continue; }

    const total  = VERSE_COUNTS[sn];
    const padded = String(sn).padStart(3, '0');
    process.stdout.write(`  s${padded} (${total} verses): `);

    try {
      const url  = `https://islamicstudies.info/tafheem.php?sura=${sn}&verse=1&to=${total}`;
      const html = await fetchHtml(url);
      const data = parseSurahHtml(html, sn);
      const n    = Object.keys(data).length;
      writeShard(sn, data);
      console.log(`${n} commentary blocks ✓`);
      ok++;
      if (sn !== surahs[surahs.length - 1]) await sleep(650);
    } catch (e) {
      console.log(`FAILED — ${e.message}`);
      fail++;
    }
  }

  console.log(`\nResult: ${ok} written, ${skip} skipped, ${fail} failed`);
  if (ok > 0) updateTafsirIndex();
}

main().catch(e => { console.error(e); process.exit(1); });
