"""
fetch_translations.py
Fetches 6 Quran translations + Urdu Hadith translation from public APIs,
saves them as flat {ayah_id: text} JSON files in data/translations/.
Also inspects existing hadith CSV to plan Urdu hadith matching.
"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import os, json, time, urllib.request, urllib.error
import pandas as pd
from collections import defaultdict

OUT_DIR = os.path.join('data', 'translations')
os.makedirs(OUT_DIR, exist_ok=True)

# ── Quran translations to fetch ──────────────────────────────────────────────
TRANSLATIONS = [
    { 'id': 'en_sahih',      'edition': 'en.sahih',      'lang': 'en', 'name': 'Sahih International',        'author': 'Saheeh International' },
    { 'id': 'en_yusuf_ali',  'edition': 'en.yusufali',   'lang': 'en', 'name': 'Yusuf Ali',                  'author': 'Abdullah Yusuf Ali' },
    { 'id': 'ur_maududi',    'edition': 'ur.maududi',    'lang': 'ur', 'name': 'Maududi (Tafheem)',           'author': 'Abul A\'la Maududi' },
    { 'id': 'ur_junagarhi',  'edition': 'ur.junagarhi',  'lang': 'ur', 'name': 'Junagarhi',                  'author': 'Muhammad Junagarhi' },
    { 'id': 'ur_jalandhri',  'edition': 'ur.jalandhry',  'lang': 'ur', 'name': 'Fateh Muhammad Jalandhri',   'author': 'Fateh Muhammad Jalandhri' },
    { 'id': 'ur_ahmedali',   'edition': 'ur.ahmedali',   'lang': 'ur', 'name': 'Ahmed Ali',                  'author': 'Ahmed Ali' },
]

BASE_URL = 'http://api.alquran.cloud/v1/quran/{edition}'

def fetch_json(url, retries=3, delay=4):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except Exception as e:
            print(f"  Attempt {attempt+1} failed: {e}")
            if attempt < retries - 1:
                time.sleep(delay)
    raise RuntimeError(f"Failed to fetch: {url}")

def fetch_quran_translation(t):
    url = BASE_URL.format(edition=t['edition'])
    print(f"\n[{t['id']}] Fetching {t['name']}...")
    print(f"  URL: {url}")
    data = fetch_json(url)

    if data.get('code') != 200:
        raise RuntimeError(f"API error: {data}")

    surahs = data['data']['surahs']
    result = {}
    for surah in surahs:
        s_num = surah['number']
        for ayah in surah['ayahs']:
            a_num = ayah['number']   # number within surah
            ayah_id = f"{s_num}:{a_num}"
            result[ayah_id] = ayah['text']

    print(f"  Got {len(result)} ayahs")
    assert len(result) == 6236, f"Expected 6236, got {len(result)}"

    out_path = os.path.join(OUT_DIR, f"{t['id']}.json")
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False)
    size_kb = os.path.getsize(out_path) / 1024
    print(f"  Saved to {out_path} ({size_kb:.0f} KB)")
    return len(result)

# ── Fetch all Quran translations ─────────────────────────────────────────────
print("=" * 60)
print("FETCHING QURAN TRANSLATIONS")
print("=" * 60)

meta = []
for t in TRANSLATIONS:
    try:
        count = fetch_quran_translation(t)
        meta.append({**t, 'ayat': count, 'status': 'ok',
                     'path': f"data/translations/{t['id']}.json"})
    except Exception as e:
        print(f"  ERROR: {e}")
        meta.append({**t, 'status': 'error', 'error': str(e)})
    time.sleep(2)  # polite delay between requests

# ── Save translation metadata ─────────────────────────────────────────────────
meta_path = os.path.join(OUT_DIR, 'index.json')
with open(meta_path, 'w', encoding='utf-8') as f:
    json.dump(meta, f, ensure_ascii=False, indent=2)
print(f"\nSaved translation index to {meta_path}")

# ── Inspect Hadith CSV for Urdu matching ──────────────────────────────────────
print("\n" + "=" * 60)
print("INSPECTING HADITH CSV FOR URDU MATCHING")
print("=" * 60)

try:
    df = pd.read_csv('raw/All_Hadith_Clean.csv', encoding='utf-8')
    print(f"Columns: {list(df.columns)}")
    print(f"Total rows: {len(df)}")

    book_col = next((c for c in df.columns if 'book' in c.lower()), None)
    ref_col  = next((c for c in df.columns if 'ref'  in c.lower()), None)
    ar_col   = next((c for c in df.columns if 'arabic' in c.lower()), None)

    print(f"Book col: {book_col}, Ref col: {ref_col}")

    if book_col:
        books = df[book_col].value_counts()
        print(f"\nBooks found ({len(books)} unique):")
        for book, cnt in books.items():
            print(f"  {str(book)[:60]}: {cnt}")

    if ref_col:
        print(f"\nRef column sample (first 10):")
        for v in df[ref_col].head(10):
            print(f"  {repr(v)}")
        print(f"\nRef column dtype: {df[ref_col].dtype}")
        # Check if ref looks numeric
        numeric_refs = pd.to_numeric(df[ref_col], errors='coerce').notna().sum()
        print(f"Numeric refs: {numeric_refs}/{len(df)}")

    # Show first 3 rows
    print("\nFirst 3 rows:")
    print(df.head(3).to_string())

except Exception as e:
    print(f"ERROR reading hadith CSV: {e}")

print("\n" + "=" * 60)
print("DONE")
print("=" * 60)
