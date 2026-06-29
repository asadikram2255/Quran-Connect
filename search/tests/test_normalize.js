#!/usr/bin/env node
/**
 * test_normalize.js
 * =================
 * Validates that the JS normalizeArabic() implementation produces the same
 * output as the shared test vectors in scripts/test_normalize.json.
 *
 * Run from repo root:
 *   node search/tests/test_normalize.js
 *
 * Exit code 0 = all tests pass.  Exit code 1 = failures found.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── normalizeArabic — mirrors concepts.js exactly ─────────────────────────
// All Arabic characters are expressed as \uXXXX escapes to avoid encoding
// ambiguity when this script is run outside the browser environment.
//
// Ranges used in the diacritic strip:
//   ؐ-ؚ  Arabic honorific signs
//   ً-ٰ  tashkeel (fathatan through superscript alef)
//   ۖ-ۜ  Quranic annotation signs
//   ۟-ۤ  more Quranic signs
//   ۧۨ   two Quranic marks
//   ۪-ۭ  more Quranic marks
//   ݿ         Arabic letter extended
function normalizeArabic(text) {
  if (!text) return '';
  return text
    .replace(/ٰ/g, 'ا')  // superscript alef → regular alef (before strip)
    .replace(/[ؐ-ًؚ-ٰۖ-ۜ۟-۪ۤۧۨ-ۭݿ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')  // alef variants → plain alef
    .replace(/ء/g, '')        // standalone hamza removed
    .replace(/ى/g, 'ي')  // alef maqsura → ya
    .replace(/ة/g, 'ه')  // ta marbuta → ha
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Load test vectors ──────────────────────────────────────────────────────
const vectorsPath = resolve(__dirname, '../../scripts/test_normalize.json');
const vectors = JSON.parse(readFileSync(vectorsPath, 'utf8'));

// ── Run tests ──────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

for (const v of vectors) {
  const result = normalizeArabic(v.input);
  if (result === v.expected) {
    console.log(`  ✓  ${v.comment}`);
    passed++;
  } else {
    console.error(`  ✗  ${v.comment}`);
    console.error(`       input:    ${JSON.stringify(v.input)}`);
    console.error(`       expected: ${JSON.stringify(v.expected)}`);
    console.error(`       got:      ${JSON.stringify(result)}`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed — ${vectors.length} total`);
process.exit(failed > 0 ? 1 : 0);
