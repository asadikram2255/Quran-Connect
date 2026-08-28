#!/usr/bin/env python3
"""
build_urdu_search_index.py — Urdu-language ayah search index, unioned across
every bundled Urdu translation edition.

Unlike build_search_data.py's English index (built from the single English
field baked into quran.json), Urdu was never indexed for search at all —
data/translations/ur_*.json exist only for display. This script reads all of
them directly (no dependency on the raw CSV pipeline) and builds:

  data/search_index/urdu_token_to_ayahids.json   — normalized token -> [ayah ids]
  data/search_index/urdu_trigram_to_tokens.json  — 3-char trigram -> [tokens]
                                                     (fuzzy-match candidates,
                                                     mirrors the English index)

normalize_urdu() MUST be mirrored exactly by the JS-side normalizer used at
query time (assets/app.js / webapp-overlay/assets/android-search.js), the
same discipline normalize_arabic() already documents for the Arabic index.

Usage:
    python scripts/build_urdu_search_index.py
"""

from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
TRANSLATIONS_DIR = REPO_ROOT / "data" / "translations"
INDEX_DIR = REPO_ROOT / "data" / "search_index"
MANIFEST = TRANSLATIONS_DIR / "index.json"

# ── Urdu normalization ───────────────────────────────────────────────────────
# Deliberately narrower than a full linguistic normalizer: it folds cosmetic
# script variance (diacritics, alef/hamza forms, Arabic-vs-Urdu letterforms
# that are the same sound) but leaves letters that change the WORD alone —
# ھ (do-chashmi heh, the aspiration marker in کھا/تھا/بھا etc.) is kept,
# since dropping it would conflate genuinely different words.
_MARKS_RE = re.compile(
    "["
    "ً-ٟ"  # harakat (fatha..sukun) + Quranic small marks
    "ٰ"          # superscript alef (dagger alef)
    "ۖ-ۭ"  # Quranic annotation signs
    "]"
)
_ALEF_RE = re.compile("[آأإٱ]")  # آ أ إ ٱ -> ا
_YEH_RE = re.compile("[يےۓ]")          # ي (Arabic yeh), ے, ۓ -> ی (Urdu yeh)
_KAF_RE = re.compile("ك")                          # ك (Arabic kaf) -> ک (keheh)
_HEH_RE = re.compile("[ةه]")                  # ة (teh marbuta), ه (Arabic heh) -> ہ (Urdu heh goal)
_HAMZA_RE = re.compile("[ءؤئ]")          # ء ؤ ئ -> dropped (matches Arabic-index convention)
_TATWEEL_RE = re.compile("ـ")
_NON_URDU_RE = re.compile(r"[^؀-ۿ\s]")  # keep the Arabic/Urdu block + whitespace only
_WS_RE = re.compile(r"\s+")


def normalize_urdu(text: str) -> str:
    if not text:
        return ""
    s = text
    s = _MARKS_RE.sub("", s)
    s = _TATWEEL_RE.sub("", s)
    s = _ALEF_RE.sub("ا", s)   # -> ا
    s = _YEH_RE.sub("ی", s)    # -> ی
    s = _KAF_RE.sub("ک", s)    # -> ک
    s = _HEH_RE.sub("ہ", s)    # -> ہ
    s = _HAMZA_RE.sub("", s)
    s = _NON_URDU_RE.sub(" ", s)
    s = _WS_RE.sub(" ", s).strip()
    return s


def bundled_urdu_ids() -> list[str]:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    return [
        entry["id"]
        for entry in manifest
        if entry.get("lang") == "ur" and entry.get("status") == "ok"
    ]


def main() -> None:
    ur_ids = bundled_urdu_ids()
    print(f"Indexing {len(ur_ids)} bundled Urdu editions: {', '.join(ur_ids)}")

    token_to_ayahs: dict[str, set[str]] = defaultdict(set)

    for ur_id in ur_ids:
        path = TRANSLATIONS_DIR / f"{ur_id}.json"
        if not path.exists():
            print(f"  ! skipping {ur_id} — file not found at {path}")
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        count = 0
        for ayah_id, text in data.items():
            if not text:
                continue
            norm = normalize_urdu(text)
            if not norm:
                continue
            for word in norm.split(" "):
                if len(word) < 2:
                    continue
                token_to_ayahs[word].add(ayah_id)
            count += 1
        print(f"  {ur_id}: {count} ayaat")

    # Sort ayah ids in Quran order (surah, ayah), not string order.
    def sort_key(ayah_id: str) -> tuple[int, int]:
        sn, an = ayah_id.split(":")
        return (int(sn), int(an))

    token_out = {
        token: sorted(ayahs, key=sort_key)
        for token, ayahs in sorted(token_to_ayahs.items())
    }

    print(f"Total distinct Urdu tokens: {len(token_out)}")

    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    token_path = INDEX_DIR / "urdu_token_to_ayahids.json"
    with token_path.open("w", encoding="utf-8") as f:
        json.dump(token_out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote {token_path} ({token_path.stat().st_size / 1024:.0f} KB)")

    # Trigram index for fuzzy matching, mirroring the English index's shape
    # (english_trigram_to_tokens.json) — same technique, different script.
    trigram_to_tokens: dict[str, set[str]] = defaultdict(set)
    for token in token_out:
        if len(token) < 3:
            continue
        for i in range(len(token) - 2):
            trigram_to_tokens[token[i:i + 3]].add(token)

    # Cap candidates per trigram the same way the English index effectively
    # does via downstream filtering — keep the list bounded so a very common
    # trigram doesn't balloon the file or the runtime candidate set.
    MAX_PER_TRIGRAM = 400
    trigram_out = {
        tri: sorted(tokens)[:MAX_PER_TRIGRAM]
        for tri, tokens in sorted(trigram_to_tokens.items())
    }

    print(f"Total distinct Urdu trigrams: {len(trigram_out)}")

    trigram_path = INDEX_DIR / "urdu_trigram_to_tokens.json"
    with trigram_path.open("w", encoding="utf-8") as f:
        json.dump(trigram_out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote {trigram_path} ({trigram_path.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
