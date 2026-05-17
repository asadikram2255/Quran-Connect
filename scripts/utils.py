import os
import re
import pandas as pd
from functools import lru_cache
from collections import defaultdict

def first_existing_path(*candidates: str) -> str:
    for p in candidates:
        if os.path.exists(p):
            return p
    return candidates[0]

def safe_str(x):
    return "" if pd.isna(x) else str(x)

def require_file(path: str, label: str):
    if not os.path.exists(path):
        raise FileNotFoundError(f"{label} file not found at: {path}")

def read_csv_robust(path: str) -> pd.DataFrame:
    require_file(path, "Input CSV")
    last_err = None
    for enc in ["utf-8", "utf-8-sig", "cp1256", "latin1"]:
        try:
            return pd.read_csv(path, encoding=enc)
        except Exception as e:
            last_err = e
    try:
        return pd.read_csv(path, engine="python")
    except Exception as e:
        raise RuntimeError(f"Failed to read CSV: {path}\nLast errors: {last_err}\n{e}")

AR_DIACRITICS_RE = re.compile(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]")
AR_TATWEEL_RE = re.compile(r"\u0640")
AR_PUNCT_RE = re.compile(r"[^\u0600-\u06FF0-9\s]")
AR_MULTI_SPACE_RE = re.compile(r"\s+")

def normalize_ar(text: str) -> str:
    text = safe_str(text)
    text = AR_DIACRITICS_RE.sub("", text)
    text = AR_TATWEEL_RE.sub("", text)
    text = text.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا")
    text = text.replace("ى", "ي")
    text = text.replace("ؤ", "ء").replace("ئ", "ء")
    text = AR_PUNCT_RE.sub(" ", text)
    text = AR_MULTI_SPACE_RE.sub(" ", text).strip()
    return text

EN_PUNCT_RE = re.compile(r"[^a-z0-9\s]")
EN_MULTI_SPACE_RE = re.compile(r"\s+")

def normalize_en(text: str) -> str:
    text = safe_str(text).lower()
    text = EN_PUNCT_RE.sub(" ", text)
    text = EN_MULTI_SPACE_RE.sub(" ", text).strip()
    return text

_MATN_MARKERS = [
    "قال رسول الله", "قال النبي", "أن النبي", "أن رسول الله",
    "عن النبي قال", "عن رسول الله قال",
]

def extract_matn(text: str) -> str:
    text = safe_str(text)
    cutoff = int(len(text) * 0.65)
    for marker in _MATN_MARKERS:
        idx = text.find(marker)
        if idx != -1 and idx < cutoff:
            return text[idx:]
    return text

def load_stopwords_ar(path_txt: str) -> set:
    sw = set()
    with open(path_txt, "r", encoding="utf-8") as f:
        for line in f:
            t = line.strip()
            if t and not t.startswith("#"):
                sw.add(normalize_ar(t))
    return sw

def load_stopwords_en_default() -> set:
    return {
        "the", "a", "an", "and", "or", "but", "if", "then", "than", "that", "this", "those", "these",
        "is", "are", "was", "were", "be", "been", "being",
        "of", "to", "in", "on", "for", "with", "as", "by", "at", "from", "into", "about", "over", "under",
        "he", "she", "it", "they", "them", "his", "her", "its", "their", "you", "your", "we", "our", "us",
        "i", "me", "my", "mine", "not", "no", "nor", "so", "too", "very", "can", "could", "may", "might",
        "shall", "should", "will", "would"
    }

def tokenize_ar(text: str, stopwords: set) -> list[str]:
    toks = [t for t in normalize_ar(text).split(" ") if t]
    out = []
    for t in toks:
        if t.isdigit() or len(t) < 2 or t in stopwords:
            continue
        out.append(t)
    return out

def tokenize_en(text: str, stopwords: set) -> list[str]:
    toks = [t for t in normalize_en(text).split(" ") if t]
    out = []
    for t in toks:
        if t.isdigit() or len(t) < 2 or t in stopwords:
            continue
        out.append(t)
    return out

def normalize_header_name(s: str) -> str:
    s = safe_str(s).strip().lower()
    return re.sub(r"[\s_\-]+", " ", s)

def find_required_column(df: pd.DataFrame, accepted_names: list[str], label: str) -> str:
    norm_to_actual = {normalize_header_name(c): c for c in df.columns}
    for name in accepted_names:
        key = normalize_header_name(name)
        if key in norm_to_actual:
            return norm_to_actual[key]
    raise ValueError(
        f"Required column for '{label}' not found. Expected one of {accepted_names}. Available: {list(df.columns)}"
    )

def find_optional_column(df: pd.DataFrame, accepted_names: list[str]) -> str | None:
    norm_to_actual = {normalize_header_name(c): c for c in df.columns}
    for name in accepted_names:
        key = normalize_header_name(name)
        if key in norm_to_actual:
            return norm_to_actual[key]
    return None

def dedupe_keep_order(items: list[str]) -> list[str]:
    seen = set()
    out = []
    for x in items:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out

USE_LEMMATIZER = os.getenv("USE_LEMMATIZER", "1") == "1"

try:
    if USE_LEMMATIZER:
        from qalsadi.lemmatizer import Lemmatizer as QalsadiLemmatizer
        _QALSADI = QalsadiLemmatizer()
        HAS_QALSADI = True
    else:
        _QALSADI = None
        HAS_QALSADI = False
except Exception as e:
    _QALSADI = None
    HAS_QALSADI = False

@lru_cache(maxsize=200000)
def lemmatize_ar_token(token: str) -> str:
    token = normalize_ar(token)
    if not token:
        return ""
    if not HAS_QALSADI:
        return token
    try:
        lemma = normalize_ar(_QALSADI.lemmatize(token))
        return lemma if lemma else token
    except Exception:
        return token

def lemma_tokens_ar(text: str, stopwords: set) -> list[str]:
    base = tokenize_ar(text, stopwords)
    out = []
    for tok in base:
        lemma = lemmatize_ar_token(tok)
        if not lemma or lemma in stopwords or len(lemma) < 2 or lemma.isdigit():
            continue
        out.append(lemma)
    return out

def build_semantic_text(text: str, stopwords: set) -> tuple[str, list[str]]:
    text = safe_str(text)
    lemmas = lemma_tokens_ar(text, stopwords)
    lemma_text = " ".join(lemmas)
    return lemma_text, dedupe_keep_order(lemmas)

def load_root_words_maps(path_csv: str):
    rw = read_csv_robust(path_csv)
    root_col = find_required_column(rw, ["Arabic Root Word"], "Arabic Root Word")
    chapter_col = find_required_column(rw, ["ChapterNo", "Chapter No", "SurahNo", "Surah No"], "ChapterNo")
    verse_col = find_required_column(rw, ["VerseNo", "Verse No", "AyahNo", "Ayah No"], "VerseNo")
    actual_word_col = find_required_column(rw, ["Actual Arabic Word"], "Actual Arabic Word")

    rw = rw[[root_col, chapter_col, verse_col, actual_word_col]].copy()
    rw[chapter_col] = pd.to_numeric(rw[chapter_col], errors="coerce")
    rw[verse_col] = pd.to_numeric(rw[verse_col], errors="coerce")
    rw = rw.dropna(subset=[chapter_col, verse_col])
    rw[chapter_col] = rw[chapter_col].astype(int)
    rw[verse_col] = rw[verse_col].astype(int)
    rw[root_col] = rw[root_col].map(normalize_ar).map(lambda x: x.replace(" ", ""))
    rw[actual_word_col] = rw[actual_word_col].map(normalize_ar)
    rw = rw[rw[root_col].astype(str).str.len() > 0].copy()

    ayah_to_rootset = defaultdict(set)
    ayah_to_rootseq = defaultdict(list)
    for _, row in rw.iterrows():
        ayah_id = f"{int(row[chapter_col])}:{int(row[verse_col])}"
        root = safe_str(row[root_col]).strip()
        if root:
            ayah_to_rootset[ayah_id].add(root)
            ayah_to_rootseq[ayah_id].append(root)

    return ayah_to_rootset, ayah_to_rootseq
