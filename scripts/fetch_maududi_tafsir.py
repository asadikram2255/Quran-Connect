#!/usr/bin/env python3
"""
fetch_maududi_tafsir.py
=======================
Fetch Tafhim al-Qur'an (English: "Towards Understanding the Quran")
from islamicstudies.info and write per-surah JSON shard files.

Source: islamicstudies.info — hosts the English edition of Tafhim al-Qur'an
        ("Towards Understanding the Quran") by Sayyid Abul A'la Maududi,
        published with permission from the Islamic Foundation UK.

Output:  data/tafsir/maududi/quran_s001.json … quran_s114.json
         data/meta/tafsir_index.json  (maududi entry added/updated)

Each shard:  { "2:255": "commentary text …", "2:256": "…", … }
Groups are keyed at the FIRST verse they cover (matching the existing pattern
used by ibn_kathir, maarif, and bayan_ul_quran shards).

Usage:
  pip install beautifulsoup4         # one-time dependency
  python scripts/fetch_maududi_tafsir.py                    # all 114 surahs
  python scripts/fetch_maududi_tafsir.py --surah 1          # test one surah
  python scripts/fetch_maududi_tafsir.py --force            # re-fetch existing
  python scripts/fetch_maududi_tafsir.py --sleep 1.0        # slower (polite)
"""

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

try:
    from bs4 import BeautifulSoup, NavigableString
except ImportError:
    sys.exit("Dependency missing — run:  pip install beautifulsoup4")

# ── Constants ──────────────────────────────────────────────────────────────

BASE_URL  = "https://islamicstudies.info/tafheem.php"
ROOT      = Path(__file__).resolve().parent.parent
OUT_DIR   = ROOT / "data" / "tafsir" / "maududi"
IDX_PATH  = ROOT / "data" / "meta" / "tafsir_index.json"

HEADERS = {
    "User-Agent": "QuranConnect/1.0 (educational Quran study tool)",
    "Accept":     "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

# Verse counts per surah (index 0 = surah 1)
VERSE_COUNTS = [
    7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,
    112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,
    59,37,35,38,29,18,45,60,25,22,63,12,20,52,52,44,28,28,20,56,25,22,40,30,
    26,25,25,24,20,40,21,33,51,30,23,33,26,17,47,44,12,18,17,31,34,45,45,8,
    29,25,25,20,25,23,17,24,6,5,17,11,16,16,20,19,18,15,16,8,21,28,8,13,5,8,
    8,5,11,20,9,3,13,11,12,7,5,5,5,3,4,5,3,6,3,5,4,5,5,3,6,5,3,6,5,5,8,5,
    6,5,9,36,5,4,6,3,6,5,5,5,5,4,5,6,5,5,5,5,5,4,4,5,4,6,7,5,6,5,5,5,8,3,5,5,
]

# ── Helpers ────────────────────────────────────────────────────────────────

def fetch_html(url: str, retries: int = 3, base_delay: float = 5.0) -> str:
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as exc:
            if attempt < retries - 1:
                wait = base_delay * (attempt + 1)
                print(f"    retry {attempt+1}/{retries} in {wait:.0f}s ({exc})",
                      file=sys.stderr)
                time.sleep(wait)
            else:
                raise


def clean_text(s: str) -> str:
    """Collapse whitespace, strip leading/trailing."""
    s = re.sub(r"[ \t\r]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def parse_surah_page(html: str, surah: int, total_verses: int) -> dict:
    """
    Parse islamicstudies.info Tafhim HTML for one surah.

    The page structure (verified by inspection):
      • Arabic verse + English translation in a table row, with superscript
        footnote anchors like <sup><a href="#foot42">42</a></sup>
      • Below the verse table, footnotes are listed as:
          <a name="foot42"><b>42.</b></a> Commentary text …

    Strategy
    --------
    1. Walk every <tr> that contains a verse.  Each row has a "verse_key" cell
       (the surah:ayah reference) and collects the superscript footnote numbers
       referenced in that row.
    2. Build a mapping  footnote_num → verse_key.
    3. Find all footnote anchor blocks and collect their text.
    4. Group footnote texts per verse_key; combine multi-footnote verses.

    Returns  { "S:A": "commentary text", … }  (only verses with commentary).
    Verses that share a commentary block with a previous verse are NOT
    duplicated; the frontend's walk-backward logic in getTafsir() handles them.
    """
    soup = BeautifulSoup(html, "html.parser")
    result: dict[str, str] = {}

    # ── Step 1: map footnote number → verse key ───────────────────────────
    #
    # islamicstudies.info marks footnote references as superscript <a> tags
    # whose href is "#footN".  They appear inside the verse row.
    # We iterate all <tr> rows looking for a pattern that identifies the verse.

    fn_to_verse: dict[int, str] = {}   # footnote_num → "S:V"

    # Try to locate verse rows — they usually contain Arabic + English + sup refs
    # A reliable heuristic: look for <sup><a href="#footN"> inside any cell,
    # and identify the verse from an adjacent cell that has text matching S:V
    # or from the page-global verse sequence if explicit labels are absent.

    current_verse = 0
    for row in soup.find_all("tr"):
        cells = row.find_all(["td", "th"])
        if not cells:
            continue

        # Look for footnote references in this row
        refs_in_row = []
        for sup in row.find_all("sup"):
            a = sup.find("a", href=re.compile(r"#foot\d+"))
            if a:
                m = re.search(r"#foot(\d+)", a["href"])
                if m:
                    refs_in_row.append(int(m.group(1)))

        if not refs_in_row:
            continue

        # Try to determine the verse number for this row.
        # Strategy A: explicit "S:V" text in a cell
        verse_key = None
        for cell in cells:
            txt = cell.get_text(" ", strip=True)
            m = re.search(rf"\b{surah}:(\d+)\b", txt)
            if m:
                verse_key = f"{surah}:{m.group(1)}"
                current_verse = int(m.group(1))
                break

        # Strategy B: implicit sequencing — count verse rows
        if not verse_key:
            current_verse += 1
            if 1 <= current_verse <= total_verses:
                verse_key = f"{surah}:{current_verse}"

        if verse_key:
            for fn in refs_in_row:
                if fn not in fn_to_verse:   # first occurrence wins
                    fn_to_verse[fn] = verse_key

    # ── Step 2: collect footnote texts ────────────────────────────────────
    #
    # Footnotes look like:
    #   <a name="foot42"><b>42.</b></a> some text …
    # or variants.  We find all <a name="footN"> anchors and grab their
    # subsequent sibling text until the next footnote anchor.

    fn_texts: dict[int, str] = {}

    # All foot anchors
    foot_anchors = soup.find_all("a", attrs={"name": re.compile(r"^foot\d+$")})

    for anchor in foot_anchors:
        m = re.match(r"foot(\d+)", anchor.get("name", ""))
        if not m:
            continue
        fn_num = int(m.group(1))

        # Collect text from this anchor's parent and subsequent siblings
        # until we hit the next foot anchor or a <hr>/<table> block.
        parts = []
        node = anchor.parent   # usually <p> or <td>

        def gather_text(el):
            """Recursively gather visible text from an element."""
            if isinstance(el, NavigableString):
                return str(el)
            if el.name in ("script", "style"):
                return ""
            return " ".join(gather_text(c) for c in el.children)

        # Text within the anchor's own parent element
        parent_text = gather_text(node)
        # Strip the leading "N." or "N " prefix that's part of the anchor label
        parent_text = re.sub(r"^\s*\d+\s*[.:]?\s*", "", parent_text, count=1)
        parts.append(parent_text)

        # Walk subsequent siblings of the parent
        for sib in node.next_siblings:
            if isinstance(sib, NavigableString):
                parts.append(str(sib))
                continue
            # Stop at the next footnote anchor
            if sib.find("a", attrs={"name": re.compile(r"^foot\d+$")}):
                break
            # Stop at block separators
            if sib.name in ("hr", "table"):
                break
            parts.append(sib.get_text(" "))

        text = clean_text(" ".join(parts))
        if text:
            fn_texts[fn_num] = text

    # ── Step 3: group footnote texts by verse key ─────────────────────────

    verse_parts: dict[str, list[str]] = {}
    for fn_num, text in sorted(fn_texts.items()):
        vk = fn_to_verse.get(fn_num)
        if vk:
            verse_parts.setdefault(vk, []).append(text)

    for vk, parts in verse_parts.items():
        combined = "\n\n".join(parts)
        result[vk] = combined

    # ── Fallback: if no footnotes were mapped, try plain paragraph extraction
    # This handles surahs where the entire surah has one block of commentary
    # (e.g. very short surahs with a single explanatory paragraph).
    if not result:
        result = _fallback_paragraph_parse(soup, surah, total_verses)

    return result


def _fallback_paragraph_parse(soup, surah: int, total_verses: int) -> dict:
    """
    Simpler fallback: extract all paragraph text from the page and assign
    it to verse 1 of the surah as a single commentary block.
    Used when the footnote-mapping strategy finds nothing.
    """
    paras = []
    for p in soup.find_all("p"):
        txt = clean_text(p.get_text(" "))
        # Skip very short or navigation-like paragraphs
        if len(txt) > 60 and not txt.startswith("Previous") and not txt.startswith("Next"):
            paras.append(txt)
    if paras:
        return {f"{surah}:1": "\n\n".join(paras)}
    return {}


def write_shard(path: Path, data: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=0)


def update_tafsir_index():
    """Add/update the maududi entry in tafsir_index.json."""
    existing = {"version": 1, "sources": {}}
    if IDX_PATH.exists():
        try:
            with IDX_PATH.open(encoding="utf-8") as f:
                existing = json.load(f)
        except Exception:
            pass

    existing.setdefault("sources", {})["maududi"] = {
        "label":         "Tafhim al-Qur'an",
        "author":        "Sayyid Abul A'la Maududi",
        "lang":          "en",
        "shard_pattern": "data/tafsir/maududi/quran_s{NNN}.json",
    }

    with IDX_PATH.open("w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)
    print(f"  Updated {IDX_PATH.relative_to(ROOT)}")


# ── Main ───────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--surah", type=int, metavar="N",
                    help="Fetch only surah N (1–114).  Useful for testing.")
    ap.add_argument("--force", action="store_true",
                    help="Re-fetch and overwrite existing shard files.")
    ap.add_argument("--sleep", type=float, default=0.6, metavar="SEC",
                    help="Seconds to wait between requests (default 0.6).")
    ap.add_argument("--dry-run", action="store_true",
                    help="Print what would be fetched, write nothing.")
    args = ap.parse_args()

    surahs = [args.surah] if args.surah else list(range(1, 115))

    ok = skip = fail = 0
    for sn in surahs:
        if sn < 1 or sn > 114:
            print(f"  ! invalid surah {sn}, skipping", file=sys.stderr)
            continue

        total = VERSE_COUNTS[sn - 1]
        padded = f"{sn:03d}"
        out_path = OUT_DIR / f"quran_s{padded}.json"

        if out_path.exists() and not args.force:
            skip += 1
            continue

        url = f"{BASE_URL}?sura={sn}&verse=1&to={total}"
        print(f"  s{padded} ({total} verses): fetching…", end=" ", flush=True)

        if args.dry_run:
            print(f"(dry-run) {url}")
            continue

        try:
            html = fetch_html(url)
        except Exception as exc:
            print(f"FAILED ({exc})", file=sys.stderr)
            fail += 1
            continue

        entries = parse_surah_page(html, sn, total)
        print(f"{len(entries)} commentary blocks")

        write_shard(out_path, entries)
        ok += 1
        time.sleep(args.sleep)

    if not args.dry_run:
        print(f"\nDone — {ok} written, {skip} skipped, {fail} failed")
        if ok > 0:
            update_tafsir_index()
            print("\nTafsir index updated.  Maududi tab will appear in the app.")
            print("NOTE: After running, also update assets/app.js:")
            print("  In defaultTafsirForTranslation(), change bayan_ul_quran back to maududi")
            print("  for the ur prefix so ur_maududi users see Tafhim by default.")
    else:
        print(f"\nDry-run complete.  {len(surahs)} surah(s) would be fetched.")


if __name__ == "__main__":
    main()
