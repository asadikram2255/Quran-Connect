"""
fetch_hadith_urdu.py
Fetches Urdu translations for Hadith from fawazahmed0/hadith-api CDN.
Matches by reference number (extracted from our Reference column).
Output: data/translations/ur_hadith.json  {serial: urdu_text}
Coverage: Bukhari, Muslim, Nasai, Abudawud, Ibnmajah, Tirmidhi
          (Mishkat, Darimi, Ahmad not available in Urdu from this source)
"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import os, json, re, time, urllib.request
import pandas as pd

OUT_DIR = os.path.join('data', 'translations')
os.makedirs(OUT_DIR, exist_ok=True)

# Map our book names → fawazahmed0 edition codes
# Using .min.json (minified) for smaller payload
CDN_BASE = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/{code}.min.json'
FALLBACK  = 'https://raw.githubusercontent.com/fawazahmed0/hadith-api/1/editions/{code}.min.json'

BOOK_MAP = {
    'Bukhari':  'urd-bukhari',
    'Muslim':   'urd-muslim',
    'Nasai':    'urd-nasai',
    'Abudawud': 'urd-abudawud',
    'Ibnmajah': 'urd-ibnmajah',
    'Tirmidhi': 'urd-tirmidhi',
    # Mishkat, Darimi, Ahmad: no Urdu edition available
}

def fetch_json_large(url, retries=3, delay=5):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = resp.read()
                return json.loads(data.decode('utf-8'))
        except Exception as e:
            print(f"  Attempt {attempt+1} failed ({type(e).__name__}): {e}")
            if attempt < retries - 1:
                time.sleep(delay)
    raise RuntimeError(f"All attempts failed for {url}")

def extract_ref_number(reference_str):
    """Extract trailing number from reference: 'Sahih al-Bukhari 5046' → 5046"""
    m = re.search(r'\d+$', str(reference_str).strip())
    return int(m.group()) if m else None

# ── Load our Hadith CSV ───────────────────────────────────────────────────────
print("Loading hadith CSV...")
df = pd.read_csv('raw/All_Hadith_Clean.csv', encoding='utf-8')
df['ref_num'] = df['Reference'].apply(extract_ref_number)
df['Serial'] = pd.to_numeric(df['Serial'], errors='coerce').fillna(0).astype(int)
print(f"Loaded {len(df)} hadith rows")
print(f"Books: {df['Book'].value_counts().to_dict()}")

# serial in CSV is 0-based; hadith_id uses 1-based (Serial+1)
df['serial_1based'] = df['Serial'] + 1

# ── Fetch each Urdu edition and build lookup ──────────────────────────────────
result = {}  # {serial_1based: urdu_text}
coverage = {}

for book_name, edition_code in BOOK_MAP.items():
    book_df = df[df['Book'] == book_name].copy()
    if len(book_df) == 0:
        print(f"\n[{book_name}] No rows in CSV, skipping")
        continue

    url_cdn = CDN_BASE.format(code=edition_code)
    url_raw = FALLBACK.format(code=edition_code)

    print(f"\n[{book_name}] Fetching {edition_code} ({len(book_df)} hadith)...")
    print(f"  URL: {url_cdn}")

    try:
        data = fetch_json_large(url_cdn)
    except Exception as e:
        print(f"  CDN failed, trying raw GitHub: {e}")
        try:
            data = fetch_json_large(url_raw)
        except Exception as e2:
            print(f"  Both failed: {e2}")
            coverage[book_name] = 0
            continue

    # Build hadithnumber → text dict
    hadiths = data.get('hadiths', [])
    ur_by_num = {}
    for h in hadiths:
        num = h.get('hadithnumber')
        text = h.get('text', '')
        if num is not None and text:
            ur_by_num[int(num)] = text.strip()

    print(f"  Fetched {len(ur_by_num)} Urdu hadiths")

    # Match by reference number
    matched = 0
    unmatched = 0
    for _, row in book_df.iterrows():
        ref_num = row['ref_num']
        serial = row['serial_1based']
        if ref_num and ref_num in ur_by_num:
            result[str(serial)] = ur_by_num[ref_num]
            matched += 1
        else:
            unmatched += 1

    pct = 100 * matched / len(book_df) if len(book_df) else 0
    print(f"  Matched {matched}/{len(book_df)} ({pct:.1f}%), unmatched {unmatched}")
    coverage[book_name] = matched
    time.sleep(3)  # polite delay

# ── Summary ───────────────────────────────────────────────────────────────────
print(f"\n{'='*60}")
print(f"TOTAL URDU HADITH MAPPED: {len(result)} / {len(df)}")
print(f"Coverage by book:")
for book, cnt in coverage.items():
    book_total = len(df[df['Book'] == book])
    pct = 100 * cnt / book_total if book_total else 0
    print(f"  {book}: {cnt}/{book_total} ({pct:.1f}%)")

skipped = [b for b in df['Book'].unique() if b not in BOOK_MAP]
if skipped:
    print(f"  Skipped (no Urdu source): {skipped}")

# ── Save output ───────────────────────────────────────────────────────────────
out_path = os.path.join(OUT_DIR, 'ur_hadith.json')
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False)

size_kb = os.path.getsize(out_path) / 1024
print(f"\nSaved to {out_path} ({size_kb:.0f} KB)")
print("DONE")
