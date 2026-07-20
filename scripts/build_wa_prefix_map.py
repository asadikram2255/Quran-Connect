# Build wa-prefix unification map: normalized "و-prefixed" token → bare token.
#
# In the Uthmani script a genuine conjunction prefix (وَ "and") is always
# followed by alef-wasla (U+0671) — the connective hamza that marks a
# standalone word boundary: وَٱلْأَرْضِ = wa + ٱلْأَرْضِ. A root-letter و
# never is: وَالِدٌ (father) has a plain alef, وَٰلِدَة (mother) a dagger
# alef. That makes wasla a lexicon-free, zero-false-positive discriminator.
#
# Source: explore/data/wbw/wbw_sNNN.json (word-by-word, full diacritics).
# Output: data/search_index/wa_prefix_map.json  { prefixedNorm: bareNorm }
# used by assets/app.js to display و-prefixed words as their bare form and
# to union their ayah lists in the word modal.
#
# Normalization mirrors scripts/utils.py:normalize_ar (which built
# data/search_index/arabic_token_to_ayahids.json) plus wasla→alef, because
# the token index was built from plain-alef source text.

import glob
import json
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
WBW_GLOB = os.path.join(REPO_ROOT, "explore", "data", "wbw", "wbw_s*.json")
TOKEN_INDEX = os.path.join(REPO_ROOT, "data", "search_index", "arabic_token_to_ayahids.json")
OUT_PATH = os.path.join(REPO_ROOT, "data", "search_index", "wa_prefix_map.json")

DAGGER = "ٰ"  # superscript (dagger) alef
WASLA = "ٱ"   # alef wasla
# All diacritics EXCEPT dagger alef (handled separately as a spelling bridge)
AR_DIACRITICS_RE = re.compile(r"[ؐ-ًؚ-ٟۖ-ۭ]")
AR_TATWEEL_RE = re.compile(r"ـ")
AR_PUNCT_RE = re.compile(r"[^؀-ۿ0-9\s]")
AR_MULTI_SPACE_RE = re.compile(r"\s+")


def _norm_base(text: str) -> str:
    """Pipeline-compatible normalization, dagger alef left in place."""
    text = AR_DIACRITICS_RE.sub("", str(text or ""))
    text = AR_TATWEEL_RE.sub("", text)
    text = text.replace(WASLA, "ا")  # wasla → plain alef
    text = text.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا")  # أإآ → ا
    text = text.replace("ى", "ي")  # ى → ي
    text = text.replace("ؤ", "ء").replace("ئ", "ء")  # ؤئ → ء
    text = AR_PUNCT_RE.sub(" ", text)
    return AR_MULTI_SPACE_RE.sub(" ", text).strip()


def norm_variants(text: str) -> list[str]:
    """Normalized spellings bridging Uthmani orthography to the plain-alef
    orthography the token index was built from. Dagger alef either drops
    (Uthmani-faithful), becomes plain alef (كِتَٰب→كتاب), or — when riding
    on a waw — replaces the waw entirely (صَلَوٰة→صلاة)."""
    base = _norm_base(text)
    out = []
    for v in (
        base.replace(DAGGER, ""),
        base.replace(DAGGER, "ا"),
        base.replace("و" + DAGGER, "ا").replace(DAGGER, "ا"),
    ):
        if v not in out:
            out.append(v)
    return out


# وَ + (optionally ب/ك with its haraka) + wasla. Strips ONLY the و + haraka;
# a following preposition stays attached (وَبِٱلْآخِرَة → بِٱلْآخِرَة).
WA_PREFIX_RE = re.compile(
    r"^و[ً-ٟ]?(?=(?:[بك][ً-ٟ]?)?ٱ)"
)


def main():
    with open(TOKEN_INDEX, encoding="utf-8") as f:
        index_keys = set(json.load(f))

    mapping = {}
    for path in sorted(glob.glob(WBW_GLOB)):
        with open(path, encoding="utf-8") as f:
            shard = json.load(f)
        for words in shard.values():
            for w in words:
                ar = str(w.get("ar", "")).strip()
                m = WA_PREFIX_RE.match(ar)
                if not m:
                    continue
                bare = ar[m.end():]
                pairs = list(zip(norm_variants(ar), norm_variants(bare)))
                # Prefer the spelling variant that exists as an index token;
                # if none does, keep all variants (dead keys are harmless).
                in_idx = [p for p in pairs if p[0] in index_keys]
                for pk, bk in (in_idx[:1] or pairs):
                    if pk and bk and pk != bk and len(bk) >= 2:
                        prev = mapping.get(pk)
                        if prev is not None and prev != bk:
                            print(f"WARN: conflicting map {pk} -> {prev} vs {bk}")
                        mapping[pk] = bk

    in_idx_n = sum(1 for k in mapping if k in index_keys)
    base_in_idx = sum(1 for v in mapping.values() if v in index_keys)
    print(f"mappings: {len(mapping)}")
    print(f"prefixed keys present in token index: {in_idx_n}/{len(mapping)}")
    print(f"bare forms present in token index:    {base_in_idx}/{len(mapping)}")
    missing = [k for k in mapping if k not in index_keys][:10]
    if missing:
        print("sample prefixed keys NOT in index:", missing)

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(dict(sorted(mapping.items())), f, ensure_ascii=False,
                  separators=(",", ":"))
    print(f"wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
