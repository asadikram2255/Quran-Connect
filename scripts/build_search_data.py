#!/usr/bin/env python3
"""
Quran Search Engine - Data Preprocessing Script
Rebuilds the search module JSON data from raw CSV sources.

Run from repo root:
    pip install -r scripts/requirements.txt
    python scripts/build_search_data.py

Inputs  (from raw/):
    raw/10. Quran Detailed.csv                                      ← main ayah data
    raw/3. Quran Pak with three English translations ...csv         ← 3 English translations
    raw/Root Words.csv                                               ← root word mappings
    raw/8. Surah Info.csv                                           ← surah metadata

Outputs (to search/data/):
    search/data/quran.json        — 6,236 ayaat with roots + translations
    search/data/surah.json        — 114 surah metadata records
    search/data/juz.json          — 30 juz records
    search/data/word_roots.json   — normalised Arabic word → roots lookup
    search/data/root_vocab.json   — root → word frequency list
"""

import pandas as pd
import json
import os
import sys
import re
from collections import defaultdict


def normalize_arabic(text):
    """Mirror the JS normalizeArabic() function exactly for consistent lookups.
    IMPORTANT: superscript alef (U+0670) is converted to regular alef before the
    diacritic strip — Quran uses it on words like مُنَٰفِق."""
    if not text:
        return ''
    text = text.replace('ٰ', 'ا')   # superscript alef → regular alef
    # Remove tashkeel and Quranic annotation marks
    text = re.sub(r'[ؐ-ًؚ-ٰۖ-ۜ۟-۪ۤۧۨ-ۭݿ]', '', text)
    # Normalize alef variants → plain alef
    text = re.sub(r'[أإآٱ]', 'ا', text)
    # Remove standalone hamza
    text = text.replace('ء', '')
    # alef maqsura → ya
    text = text.replace('ى', 'ي')
    # ta marbuta → ha
    text = text.replace('ة', 'ه')
    text = re.sub(r'\s+', ' ', text).strip()
    return text

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET_DIR = os.path.join(ROOT, "raw")          # raw CSV source files
OUTPUT_DIR = os.path.join(ROOT, "search", "data") # outputs to search/data/

os.makedirs(OUTPUT_DIR, exist_ok=True)


def log(msg): print(f"  {msg}".encode('ascii', 'replace').decode('ascii'))
def section(msg): print(f"\n=== {msg} ===".encode('ascii', 'replace').decode('ascii'))
def clean(val):
    if val is None or (isinstance(val, float) and str(val) == 'nan'):
        return ''
    s = str(val).strip()
    return '' if s in ('nan', 'NA', 'N/A', 'None') else s


# ─────────────────────────────────────────────────────────
# 1. Load datasets
# ─────────────────────────────────────────────────────────
section("Loading datasets")

# Primary: Quran Detailed (full metadata)
log("10. Quran Detailed.csv ...")
df_main = pd.read_csv(os.path.join(DATASET_DIR, "10. Quran Detailed.csv"), dtype=str)
log(f"   {len(df_main)} rows loaded")

# 3 English translations
log("3. Quran Pak with three English translations ...")
df_trans = pd.read_csv(
    os.path.join(DATASET_DIR,
                 "3. Quran Pak with three English translations and two english tafseers.csv"),
    dtype=str,
    on_bad_lines='skip'
)
log(f"   {len(df_trans)} rows loaded")

# Root words (word-level Arabic roots)
log("Root Words.csv ...")
df_roots = pd.read_csv(os.path.join(DATASET_DIR, "Root Words.csv"), dtype=str)
log(f"   {len(df_roots)} rows loaded")

# Surah metadata
log("8. Surah Info.csv ...")
df_surah = pd.read_csv(os.path.join(DATASET_DIR, "8. Surah Info.csv"), dtype=str)
log(f"   {len(df_surah)} rows loaded")


# ─────────────────────────────────────────────────────────
# 2. Build lookup maps
# ─────────────────────────────────────────────────────────
section("Building lookup maps")

# Translation lookup: (surah, ayah) -> {t1, t2, t3}
trans_lookup = {}
missing_trans = 0
for _, row in df_trans.iterrows():
    try:
        k = (int(float(row['Surah'])), int(float(row['Ayat'])))
        trans_lookup[k] = {
            't1': clean(row.get('Translation1', '')),
            't2': clean(row.get('Translation2', '')),
            't3': clean(row.get('Translation3', '')),
        }
    except (ValueError, TypeError, KeyError):
        missing_trans += 1

log(f"Translation lookup: {len(trans_lookup)} entries  ({missing_trans} skipped)")

# Root words lookup: (chapter, verse) -> [roots]
roots_lookup = defaultdict(list)
for _, row in df_roots.iterrows():
    try:
        k = (int(float(row['ChapterNo'])), int(float(row['VerseNo'])))
        root = clean(row.get('Arabic Root Word', ''))
        if root and root not in roots_lookup[k]:
            roots_lookup[k].append(root)
    except (ValueError, TypeError, KeyError):
        pass

log(f"Root words lookup: {len(roots_lookup)} (surah,ayah) entries")


# ─────────────────────────────────────────────────────────
# 3. Build quran.json
# ─────────────────────────────────────────────────────────
section("Building quran.json")

ayaat = []
skipped = 0

for _, row in df_main.iterrows():
    try:
        sn  = int(float(row['surah_no']))
        an  = int(float(row['ayah_no_surah']))
        aqn = int(float(row['ayah_no_quran']))
    except (ValueError, TypeError, KeyError):
        skipped += 1
        continue

    k     = (sn, an)
    trans = trans_lookup.get(k, {})
    roots = roots_lookup.get(k, [])

    def safe_int(col, fallback=0):
        try:
            v = row.get(col, '')
            return int(float(v)) if v and clean(v) else fallback
        except (ValueError, TypeError):
            return fallback

    ayah = {
        'id':    aqn,
        'sn':    sn,
        'an':    an,
        'sne':   clean(row.get('surah_name_en', '')),
        'sna':   clean(row.get('surah_name_ar', '')),
        'snr':   clean(row.get('surah_name_roman', '')),
        'ar':    clean(row.get('ayah_ar', '')),
        'en':    clean(row.get('ayah_en', '')),
        't1':    trans.get('t1', ''),
        't2':    trans.get('t2', ''),
        't3':    trans.get('t3', ''),
        'juz':   safe_int('juz_no'),
        'ruku':  safe_int('ruko_no'),
        'manzil': safe_int('manzil_no'),
        'place': clean(row.get('place_of_revelation', '')),
        'roots': roots,
    }
    ayaat.append(ayah)

ayaat.sort(key=lambda x: x['id'])

out_path = os.path.join(OUTPUT_DIR, 'quran.json')
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(ayaat, f, ensure_ascii=False, separators=(',', ':'))

size_kb = os.path.getsize(out_path) / 1024
log(f"Written {len(ayaat)} ayaat  ({skipped} skipped)  -> data/quran.json  ({size_kb:.0f} KB)")

# Verify coverage
no_t1 = sum(1 for a in ayaat if not a['t1'])
no_t2 = sum(1 for a in ayaat if not a['t2'])
no_t3 = sum(1 for a in ayaat if not a['t3'])
log(f"Translation coverage  t1:{len(ayaat)-no_t1}  t2:{len(ayaat)-no_t2}  t3:{len(ayaat)-no_t3}")


# ─────────────────────────────────────────────────────────
# 4. Build surah.json
# ─────────────────────────────────────────────────────────
section("Building surah.json")

def safe_int_cell(val, fallback=0):
    """Handle NaN, date strings like '2-Jan', plain numbers."""
    if val is None:
        return fallback
    s = str(val).strip()
    if s in ('', 'nan', 'NaN', 'NA'):
        return fallback
    # Excel date mangling e.g. '2-Jan' -> extract leading number
    import re
    m = re.match(r'^(\d+)', s)
    if m:
        return int(m.group(1))
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return fallback

surahs = []
for _, row in df_surah.iterrows():
    try:
        no = safe_int_cell(row.get('SurahNumber'))
        if not no:
            continue
        surahs.append({
            'no':     no,
            'en':     clean(row.get('EnglishTitle', '')),
            'ar':     clean(row.get('ArabicTitle', '')),
            'roman':  clean(row.get('RomanTitle', '')),
            'verses': safe_int_cell(row.get('NumberOfVerses')),
            'rukus':  safe_int_cell(row.get('NumberOfRukus')),
            'place':  clean(row.get('PlaceOfRevelation', '')),
        })
    except (ValueError, TypeError, KeyError):
        pass

surahs.sort(key=lambda x: x['no'])

with open(os.path.join(OUTPUT_DIR, 'surah.json'), 'w', encoding='utf-8') as f:
    json.dump(surahs, f, ensure_ascii=False, separators=(',', ':'))

log(f"Written {len(surahs)} surahs  →  data/surah.json")


# ─────────────────────────────────────────────────────────
# 5. Build juz.json (boundaries derived from quran.json)
# ─────────────────────────────────────────────────────────
section("Building juz.json")

juz_map = defaultdict(lambda: {'start': None, 'end': None, 'ayaat': 0})
for a in ayaat:
    j = a['juz']
    if j:
        if juz_map[j]['start'] is None:
            juz_map[j]['start'] = a['id']
        juz_map[j]['end'] = a['id']
        juz_map[j]['ayaat'] += 1

juz_list = [{'no': k, **v} for k, v in sorted(juz_map.items())]

with open(os.path.join(OUTPUT_DIR, 'juz.json'), 'w', encoding='utf-8') as f:
    json.dump(juz_list, f, ensure_ascii=False, separators=(',', ':'))

log(f"Written {len(juz_list)} juz  →  data/juz.json")


# ─────────────────────────────────────────────────────────
# 6. Build word_roots.json (Arabic word → root lookup)
#    AND root_vocab.json (root → top words with counts)
# ─────────────────────────────────────────────────────────
section("Building word_roots.json")

from collections import Counter

word_root_map  = defaultdict(set)
root_word_freq = defaultdict(Counter)   # root -> Counter(normWord -> count)

for _, row in df_roots.iterrows():
    root = clean(row.get('Arabic Root Word', ''))
    word = clean(row.get('Actual Arabic Word', ''))
    if root and word:
        norm = normalize_arabic(word)
        if norm:
            word_root_map[norm].add(root)
            root_word_freq[root][norm] += 1

word_root_out = {k: list(v) for k, v in word_root_map.items()}
with open(os.path.join(OUTPUT_DIR, 'word_roots.json'), 'w', encoding='utf-8') as f:
    json.dump(word_root_out, f, ensure_ascii=False, separators=(',', ':'))
log(f"Written {len(word_root_out)} unique normalized words -> data/word_roots.json")

# root_vocab: root -> top-25 words sorted by frequency (for answer panel vocab lookup)
root_vocab_out = {}
for root, counter in root_word_freq.items():
    top = counter.most_common(25)
    root_vocab_out[root] = [{'n': w, 'c': c} for w, c in top]

with open(os.path.join(OUTPUT_DIR, 'root_vocab.json'), 'w', encoding='utf-8') as f:
    json.dump(root_vocab_out, f, ensure_ascii=False, separators=(',', ':'))
log(f"Written {len(root_vocab_out)} roots -> data/root_vocab.json")


# ─────────────────────────────────────────────────────────
# Done
# ─────────────────────────────────────────────────────────
section("Complete")
print(f"\n  All data files ready in /data/")
print(f"  Open index.html to launch the search engine.\n")
