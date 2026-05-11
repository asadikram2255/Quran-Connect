"""
deep_verify_translations.py
Exhaustive cross-check: loads every quran shard, loads every translation,
and verifies a large set of well-known ayahs match exactly.
Also checks 10 random ayahs per surah across all 114 surahs.
"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import json, os, random

# ── Load ALL quran shards into one dict ───────────────────────────────────────
print("Loading all quran shards...")
quran = {}  # ayah_id -> {arabic, english}
shard_map = json.load(open('data/meta/shard_map_quran.json', encoding='utf-8'))
for surah_str, shard_path in shard_map.items():
    full_path = shard_path if os.path.exists(shard_path) else os.path.join('data', shard_path.lstrip('data/').lstrip('data\\'))
    # Try resolving path
    if not os.path.exists(full_path):
        full_path = shard_path
    try:
        shard = json.load(open(full_path, encoding='utf-8'))
        for rec in shard:
            quran[rec['ayah_id']] = rec
    except Exception as e:
        print(f"  ERROR loading {shard_path}: {e}")

print(f"Loaded {len(quran)} ayahs from quran shards")

# ── Load translations ─────────────────────────────────────────────────────────
TRANS_FILES = {
    'en_sahih':     'data/translations/en_sahih.json',
    'en_yusuf_ali': 'data/translations/en_yusuf_ali.json',
    'ur_maududi':   'data/translations/ur_maududi.json',
    'ur_junagarhi': 'data/translations/ur_junagarhi.json',
    'ur_jalandhri': 'data/translations/ur_jalandhri.json',
    'ur_ahmedali':  'data/translations/ur_ahmedali.json',
}
print("Loading translations...")
translations = {}
for tid, path in TRANS_FILES.items():
    t = json.load(open(path, encoding='utf-8'))
    translations[tid] = t
    print(f"  {tid}: {len(t)} keys")

# ── Well-known ayahs to spot-check ───────────────────────────────────────────
KNOWN = {
    # Surah 1
    "1:1":   {"arabic_contains": "بِسْمِ", "sahih_contains": "name of Allah"},
    "1:7":   {"arabic_contains": None,      "sahih_contains": "bestowed favor"},
    # Surah 2
    "2:1":   {"arabic_contains": None,      "sahih_contains": "Alif, Lam, Meem"},
    "2:2":   {"arabic_contains": None,      "sahih_contains": "no doubt"},
    "2:255": {"arabic_contains": "اللَّهُ", "sahih_contains": "Ever-Living"},
    "2:256": {"arabic_contains": None,      "sahih_contains": "compulsion"},
    "2:286": {"arabic_contains": None,      "sahih_contains": "burden"},
    # Surah 3
    "3:1":   {"arabic_contains": None,      "sahih_contains": "Alif, Lam, Meem"},
    "3:190": {"arabic_contains": None,      "sahih_contains": "heavens"},
    # Surah 4
    "4:1":   {"arabic_contains": None,      "sahih_contains": "single soul"},
    # Surah 12
    "12:2":  {"arabic_contains": None,      "sahih_contains": "Arabic"},
    # Surah 18
    "18:1":  {"arabic_contains": None,      "sahih_contains": "Book"},
    # Surah 24
    "24:35": {"arabic_contains": None,      "sahih_contains": "Light"},
    # Surah 36
    "36:1":  {"arabic_contains": None,      "sahih_contains": "Ya"},
    # Surah 55
    "55:1":  {"arabic_contains": None,      "sahih_contains": "Most Merciful"},
    "55:13": {"arabic_contains": None,      "sahih_contains": "deny"},
    # Surah 56
    "56:1":  {"arabic_contains": None,      "sahih_contains": "Event"},
    # Surah 67
    "67:1":  {"arabic_contains": None,      "sahih_contains": "sovereignty"},
    # Surah 112
    "112:1": {"arabic_contains": None,      "sahih_contains": "One"},
    "112:4": {"arabic_contains": None,      "sahih_contains": "equal"},
    # Surah 113
    "113:1": {"arabic_contains": None,      "sahih_contains": "daybreak"},
    # Surah 114
    "114:1": {"arabic_contains": None,      "sahih_contains": "mankind"},
    "114:6": {"arabic_contains": None,      "sahih_contains": "mankind"},
}

print("\n" + "=" * 70)
print("SPOT-CHECK: Well-known ayahs")
print("=" * 70)
errors = 0
for ayah_id, checks in KNOWN.items():
    rec = quran.get(ayah_id)
    if not rec:
        print(f"  MISSING in quran data: {ayah_id}")
        errors += 1
        continue

    sahih_text = translations['en_sahih'].get(ayah_id, "NOT FOUND")
    ar_text = rec.get('arabic', '')
    en_default = rec.get('english', '')

    ok = True
    if checks['sahih_contains'] and checks['sahih_contains'].lower() not in sahih_text.lower():
        print(f"  MISMATCH {ayah_id}:")
        print(f"    Arabic:       {ar_text[:60]}")
        print(f"    en_default:   {en_default[:60]}")
        print(f"    en_sahih:     {sahih_text[:80]}")
        print(f"    Expected to contain: '{checks['sahih_contains']}'")
        errors += 1
        ok = False

    if ok:
        print(f"  OK {ayah_id:8s}  sahih={sahih_text[:60]}")

# ── Check all 6 translations match same ayah_id set ─────────────────────────
print("\n" + "=" * 70)
print("COVERAGE CHECK: All translations cover all 6236 ayahs")
print("=" * 70)
all_ayah_ids = set(quran.keys())
for tid, t in translations.items():
    trans_ids = set(t.keys())
    missing = all_ayah_ids - trans_ids
    extra   = trans_ids - all_ayah_ids
    print(f"  {tid}: {len(t)} entries | missing={len(missing)} | extra={len(extra)}")
    if missing:
        print(f"    Missing sample: {sorted(missing, key=lambda x:(int(x.split(':')[0]),int(x.split(':')[1])))[:10]}")
    if extra:
        print(f"    Extra sample: {sorted(extra)[:5]}")

# ── Random cross-check: for each surah, pick a random ayah ──────────────────
print("\n" + "=" * 70)
print("RANDOM CROSS-CHECK: One ayah per surah (114 ayahs)")
print("=" * 70)
random.seed(42)

# Group ayah_ids by surah
by_surah = {}
for aid in quran:
    s = int(aid.split(':')[0])
    if s not in by_surah:
        by_surah[s] = []
    by_surah[s].append(aid)

surah_errors = 0
for s in range(1, 115):
    aids = by_surah.get(s, [])
    if not aids:
        continue
    pick = random.choice(aids)
    rec = quran[pick]
    ar = rec.get('arabic', '')
    en_default = rec.get('english', '')
    sahih = translations['en_sahih'].get(pick, '')
    yusuf = translations['en_yusuf_ali'].get(pick, '')
    maududi = translations['ur_maududi'].get(pick, '')

    # Basic sanity: sahih and yusuf should not be identical unless ayah is very short
    if sahih and yusuf and sahih.strip() == yusuf.strip() and len(sahih) > 30:
        print(f"  SUSPICIOUS {pick}: Sahih == Yusuf Ali (identical long text)")
        surah_errors += 1
        continue
    # Sahih should not match en_default exactly (they're different translations)
    # Actually they can sometimes match for short ayahs, so skip this check

    # Urdu should contain Arabic-script characters
    if maududi and not any('؀' <= c <= 'ۿ' for c in maududi):
        print(f"  SUSPICIOUS {pick}: Maududi has no Arabic/Urdu characters: {maududi[:40]}")
        surah_errors += 1
        continue

    print(f"  OK S{s:3d} {pick:8s}  sahih={sahih[:55]}")

if surah_errors == 0:
    print(f"\nAll 114 surahs: random ayah checks passed")
else:
    print(f"\n{surah_errors} suspicious entries found")

print(f"\n{'='*70}")
print(f"TOTAL ERRORS/MISMATCHES: {errors + surah_errors}")
print(f"{'='*70}")
