"""
shard_hadith_urdu.py
Splits ur_hadith.json (22MB) into 1000-per-shard files
matching the existing hadith_text shard structure.
"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import os, json

SRC  = os.path.join('data', 'translations', 'ur_hadith.json')
DEST = os.path.join('data', 'translations', 'ur_hadith_shards')
SHARD_SIZE = 1000
TOTAL = 43393

os.makedirs(DEST, exist_ok=True)

print("Loading ur_hadith.json...")
with open(SRC, 'r', encoding='utf-8') as f:
    full = json.load(f)  # {serial_str: text}

print(f"Loaded {len(full)} entries")

shard_map = []
shard_num = 0
start = 1
while start <= TOTAL:
    end = min(start + SHARD_SIZE - 1, TOTAL)
    shard = {}
    for s in range(start, end + 1):
        key = str(s)
        if key in full:
            shard[key] = full[key]

    fname = f"ur_hadith_{start:05d}_{end:05d}.json"
    fpath = os.path.join(DEST, fname)
    with open(fpath, 'w', encoding='utf-8') as f:
        json.dump(shard, f, ensure_ascii=False)

    size_kb = os.path.getsize(fpath) / 1024
    entries = len(shard)
    print(f"  Shard {start:5d}-{end:5d}: {entries:4d} entries, {size_kb:6.0f} KB")

    shard_map.append({
        "start": start, "end": end,
        "file": f"translations/ur_hadith_shards/{fname}"
    })
    start = end + 1
    shard_num += 1

# Save shard map
shard_map_path = os.path.join('data', 'translations', 'ur_hadith_shard_map.json')
with open(shard_map_path, 'w', encoding='utf-8') as f:
    json.dump(shard_map, f)

print(f"\nCreated {shard_num} shards → {DEST}/")
print(f"Shard map → {shard_map_path}")

# Remove the large monolithic file
os.remove(SRC)
print(f"Removed monolithic {SRC}")
print("DONE")
