"""
verify_translation_keys.py
Checks: what keys are actually stored in the translation files,
and whether they match our quran data's ayah_ids.
Also fetches a small API sample to expose the exact field structure.
"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import json, urllib.request

# ── 1. Check what keys are stored in en_sahih.json ───────────────────────────
print("=" * 60)
print("STORED TRANSLATION KEYS (en_sahih.json)")
print("=" * 60)
with open('data/translations/en_sahih.json', 'r', encoding='utf-8') as f:
    sahih = json.load(f)

all_keys = sorted(sahih.keys(), key=lambda x: (int(x.split(':')[0]), int(x.split(':')[1])))
print(f"Total keys: {len(all_keys)}")
print(f"\nFirst 15 keys and their translations:")
for k in all_keys[:15]:
    print(f"  {k:10s} → {sahih[k][:70]}")

print(f"\nKeys around surah 2 start:")
surah2_keys = [k for k in all_keys if k.startswith('2:')][:10]
for k in surah2_keys:
    print(f"  {k:10s} → {sahih[k][:70]}")

# ── 2. Fetch a live API sample to inspect the structure ───────────────────────
print("\n" + "=" * 60)
print("LIVE API SAMPLE — Surah 1 (Al-Fatihah)")
print("=" * 60)
url = "http://api.alquran.cloud/v1/surah/1/en.sahih"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req, timeout=30) as resp:
    data = json.loads(resp.read().decode('utf-8'))

ayahs = data['data']['ayahs']
print(f"Ayahs in surah 1: {len(ayahs)}")
print("First 3 ayah objects:")
for a in ayahs[:3]:
    print(f"  number={a.get('number')}  numberInSurah={a.get('numberInSurah')}  text={a.get('text','')[:60]}")

print("\n" + "=" * 60)
print("LIVE API SAMPLE — Surah 2 (Al-Baqarah), first 5 ayahs")
print("=" * 60)
url2 = "http://api.alquran.cloud/v1/surah/2/en.sahih"
req2 = urllib.request.Request(url2, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req2, timeout=30) as resp2:
    data2 = json.loads(resp2.read().decode('utf-8'))

ayahs2 = data2['data']['ayahs']
print(f"Ayahs in surah 2: {len(ayahs2)}")
print("First 5 ayah objects:")
for a in ayahs2[:5]:
    print(f"  number={a.get('number')}  numberInSurah={a.get('numberInSurah')}  text={a.get('text','')[:60]}")

# ── 3. Cross-check against our quran data ─────────────────────────────────────
print("\n" + "=" * 60)
print("CROSS-CHECK: stored key vs expected")
print("=" * 60)
# Expected: "2:1" = "Alif, Lam, Meem" (Bismillah not in surah 2)
# Check what "2:1" returns from stored data
for test_id in ["1:1", "1:7", "2:1", "2:2", "2:255", "36:1", "112:1"]:
    stored = sahih.get(test_id, "NOT FOUND")
    print(f"  {test_id:8s} → {stored[:80]}")
