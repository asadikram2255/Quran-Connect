#!/usr/bin/env python3
"""
fetch_tafsir.py — Pull tafsir text from quran.com for all 114 surahs.

Writes one JSON shard per surah per source:
  data/tafsir/<source_key>/quran_s{NNN}.json   (flat {"ayah_id": "text", ...})

Also merges fetched sources into data/meta/tafsir_index.json so the frontend
sees real label/author/lang from the API, not the placeholder values.

Usage:
  python scripts/fetch_tafsir.py                 # all sources, all surahs
  python scripts/fetch_tafsir.py --source maududi
  python scripts/fetch_tafsir.py --surah 1       # test with Al-Fatihah only
  python scripts/fetch_tafsir.py --force         # overwrite existing shards

To add or change sources, edit the TAFSIRS dict below. Slugs come from
  GET https://api.quran.com/api/v4/resources/tafsirs
The script verifies each slug against that list at startup and skips any
that have changed or been removed.

Notes:
- Tafsir text from these sources is under various licenses. Verify you have
  the right to redistribute before deploying to a public-facing app.
- Polite rate-limit defaults to 0.4s between API calls. Don't lower it
  unless you know what you're doing.
"""

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

API_BASE   = "https://api.quran.com/api/v4"
ROOT       = Path(__file__).resolve().parent.parent
TAFSIR_DIR = ROOT / "data" / "tafsir"
INDEX_PATH = ROOT / "data" / "meta" / "tafsir_index.json"

# ── Sources to fetch ─────────────────────────────────────────────────────
# Key = local folder name (matches frontend tafsir_index.json keys).
# slug = quran.com slug from /resources/tafsirs.
#
# Note: Maududi's Tafhim al-Qur'an is NOT on quran.com. The "maududi" slot
# in tafsir_index.json is reserved for when you can source it separately
# (drop matching JSON shards into data/tafsir/maududi/).
TAFSIRS = {
    "ibn_kathir": {
        "slug":            "en-tafisr-ibn-kathir",
        "label_fallback":  "Tafsir Ibn Kathir (Abridged)",
        "author_fallback": "Ismail ibn Kathir",
        "lang_fallback":   "en",
    },
    "maarif": {
        "slug":            "en-tafsir-maarif-ul-quran",
        "label_fallback":  "Maarif-ul-Qur'an",
        "author_fallback": "Mufti Muhammad Shafi Usmani",
        "lang_fallback":   "en",
    },
    "bayan_ul_quran": {
        "slug":            "tafsir-bayan-ul-quran",
        "label_fallback":  "Bayan ul Quran",
        "author_fallback": "Dr. Israr Ahmad",
        "lang_fallback":   "ur",
    },
    "ibn_kathir_ur": {
        "slug":            "tafseer-ibn-e-kaseer-urdu",
        "label_fallback":  "Tafsir Ibn Kathir (Urdu)",
        "author_fallback": "Ismail ibn Kathir",
        "lang_fallback":   "ur",
    },
}

LANG_MAP = {
    "english":   "en",
    "urdu":      "ur",
    "arabic":    "ar",
    "indonesian":"id",
    "turkish":   "tr",
    "russian":   "ru",
    "french":    "fr",
    "spanish":   "es",
    "bengali":   "bn",
}

HEADERS = {
    "User-Agent": "QuranConnect/1.0 (study tool)",
    "Accept":     "application/json",
}

# ── Helpers ─────────────────────────────────────────────────────────────

_HTML_TAG = re.compile(r"<[^>]+>")
_ENT_NUM  = re.compile(r"&#?\w+;")
_WS       = re.compile(r"[ \t]+")
_BLANK_LN = re.compile(r"\n{3,}")
_ENTITIES = {
    "&nbsp;": " ", "&amp;": "&", "&quot;": '"',
    "&#39;":  "'", "&lt;":  "<", "&gt;":   ">",
}

def strip_html(s: str) -> str:
    """Strip HTML tags + entities, collapse whitespace, keep paragraph breaks."""
    if not s:
        return ""
    # Block-level tags → paragraph break
    s = re.sub(r"</p>|<br\s*/?>|</div>", "\n", s, flags=re.IGNORECASE)
    s = _HTML_TAG.sub(" ", s)
    for k, v in _ENTITIES.items():
        s = s.replace(k, v)
    s = _ENT_NUM.sub("", s)
    s = _WS.sub(" ", s)
    s = _BLANK_LN.sub("\n\n", s)
    return s.strip()

def fetch_json(url: str, retries: int = 3, delay: float = 4.0):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            if attempt < retries - 1:
                print(f"    retry {attempt+1}/{retries} in {delay}s ({e})", file=sys.stderr)
                time.sleep(delay)
            else:
                raise

def list_remote_tafsirs():
    data = fetch_json(f"{API_BASE}/resources/tafsirs")
    return data.get("tafsirs", [])

def resolve_meta(slug: str, remote_list):
    for t in remote_list:
        if t.get("slug") == slug:
            return t
    return None

def fetch_chapter(tafsir_id: int, chapter: int) -> dict:
    """Returns {'1:1': 'text', '1:2': 'text', ...} for one chapter.

    The API paginates at 10 entries/page by default; we request 500 to fit
    even the longest surah (Al-Baqarah, 286 ayat) in one call. Falls back to
    paging if a future surah exceeds that.
    """
    out = {}
    page = 1
    while True:
        url = f"{API_BASE}/tafsirs/{tafsir_id}/by_chapter/{chapter}?per_page=500&page={page}"
        data = fetch_json(url)
        for entry in data.get("tafsirs", []):
            key  = entry.get("verse_key")
            text = strip_html(entry.get("text", ""))
            if key and text:
                out[key] = text
        nxt = (data.get("pagination") or {}).get("next_page")
        if not nxt:
            break
        page = nxt
    return out

def write_shard(path: Path, entries: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=0)

def merge_index(populated: dict):
    """Merge fetched sources into existing tafsir_index.json — never drop entries we didn't touch."""
    existing = {"version": 1, "sources": {}}
    if INDEX_PATH.exists():
        try:
            with INDEX_PATH.open() as f:
                existing = json.load(f)
        except Exception:
            pass
    sources = existing.get("sources", {})
    for key, info in populated.items():
        sources[key] = {
            "label":         info["label"],
            "author":        info["author"],
            "lang":          info["lang"],
            "shard_pattern": f"data/tafsir/{key}/quran_s{{NNN}}.json",
        }
    INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
    with INDEX_PATH.open("w", encoding="utf-8") as f:
        json.dump(
            {"version": existing.get("version", 1), "sources": sources},
            f, ensure_ascii=False, indent=2,
        )

# ── Main ────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--source", action="append",
                    help="Source key (repeatable). Default: all sources in TAFSIRS.")
    ap.add_argument("--surah", type=int,
                    help="Fetch only one surah (1–114) — useful for testing.")
    ap.add_argument("--force", action="store_true",
                    help="Overwrite existing shard files.")
    ap.add_argument("--sleep", type=float, default=0.4,
                    help="Seconds between API calls (default 0.4).")
    ap.add_argument("--dry-run", action="store_true",
                    help="Print what would be fetched, write nothing.")
    args = ap.parse_args()

    wanted = args.source or list(TAFSIRS.keys())
    bad = [s for s in wanted if s not in TAFSIRS]
    if bad:
        sys.exit(f"Unknown source(s): {bad}\nAvailable: {list(TAFSIRS.keys())}")

    print("Resolving tafsir IDs from quran.com…")
    try:
        remote = list_remote_tafsirs()
    except Exception as e:
        sys.exit(f"Could not reach quran.com API: {e}")
    print(f"  {len(remote)} tafsirs available remotely\n")

    resolved = {}
    for key in wanted:
        cfg = TAFSIRS[key]
        meta = resolve_meta(cfg["slug"], remote)
        if not meta:
            print(f"  ! slug '{cfg['slug']}' not found — skipping '{key}'", file=sys.stderr)
            continue
        lang_raw = (meta.get("language_name") or cfg["lang_fallback"]).lower()
        lang = LANG_MAP.get(lang_raw, cfg["lang_fallback"])
        resolved[key] = {
            "id":     meta["id"],
            "label":  meta.get("name")        or cfg["label_fallback"],
            "author": meta.get("author_name") or cfg["author_fallback"],
            "lang":   lang,
        }
        print(f"  ✓ {key:12s} id={meta['id']:<4d} {meta.get('name')} — {meta.get('author_name')} [{lang}]")

    if not resolved:
        sys.exit("Nothing to fetch — verify slugs in TAFSIRS against /resources/tafsirs.")

    surahs = [args.surah] if args.surah else list(range(1, 115))
    populated = {}

    for key, info in resolved.items():
        out_dir = TAFSIR_DIR / key
        print(f"\n=== {key} ({info['label']}) ===")
        ok_count = skip_count = fail_count = 0
        for sn in surahs:
            padded = f"{sn:03d}"
            out_path = out_dir / f"quran_s{padded}.json"

            if out_path.exists() and not args.force:
                skip_count += 1
                continue

            print(f"  s{padded}: fetching…", end=" ", flush=True)
            if args.dry_run:
                print("(dry-run)")
                continue
            try:
                entries = fetch_chapter(info["id"], sn)
            except Exception as e:
                print(f"FAILED ({e})")
                fail_count += 1
                continue
            print(f"{len(entries)} ayat")
            write_shard(out_path, entries)
            ok_count += 1
            time.sleep(args.sleep)

        print(f"  → {ok_count} written, {skip_count} skipped, {fail_count} failed")
        populated[key] = info

    if not args.dry_run and populated:
        merge_index(populated)
        print(f"\nMerged {len(populated)} source(s) into {INDEX_PATH.relative_to(ROOT)}")

    print("\nDone.")

if __name__ == "__main__":
    main()
