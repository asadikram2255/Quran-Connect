import os
import sys
import re
import json
import math
from collections import defaultdict, Counter
from functools import lru_cache

import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer, CrossEncoder
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import linear_kernel
from sklearn.neighbors import NearestNeighbors

# This version keeps the same output structure and GUI-facing JSON contract,
# but uses a lighter embedding setup so builds can complete reliably on CPU.

print("RUNNING:", os.path.abspath(__file__))
print("PYTHON:", sys.version)
if sys.version_info >= (3, 13):
    print("WARNING: You are on Python >= 3.13. If Torch/sentence-transformers fails, use Python 3.10/3.11.")

# ---------- Paths ----------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
RAW_DIR = os.path.join(REPO_ROOT, "raw")
DATA_DIR = os.path.join(REPO_ROOT, "data")


def first_existing_path(*candidates: str) -> str:
    for p in candidates:
        if os.path.exists(p):
            return p
    return candidates[0]


QURAN_AR_PATH = first_existing_path(
    os.path.join(RAW_DIR, "quran.csv"),
    os.path.join(REPO_ROOT, "quran.csv"),
)
QURAN_EN_PATH = first_existing_path(
    os.path.join(RAW_DIR, "Quran_English.csv"),
    os.path.join(REPO_ROOT, "Quran_English.csv"),
)
HADITH_PATH = first_existing_path(
    os.path.join(RAW_DIR, "All_Hadith_Clean.csv"),
    os.path.join(REPO_ROOT, "All_Hadith_Clean.csv"),
)
ROOT_WORDS_PATH = first_existing_path(
    os.path.join(RAW_DIR, "Root Words.csv"),
    os.path.join(REPO_ROOT, "Root Words.csv"),
)

OUT_META_DIR = os.path.join(DATA_DIR, "meta")
OUT_QURAN_TEXT_DIR = os.path.join(DATA_DIR, "quran_text")
OUT_QURAN_PAIRS_DIR = os.path.join(DATA_DIR, "quran_pairs")
OUT_HADITH_TEXT_DIR = os.path.join(DATA_DIR, "hadith_text")
OUT_SEARCH_DIR = os.path.join(DATA_DIR, "search_index")

for d in [DATA_DIR, OUT_META_DIR, OUT_QURAN_TEXT_DIR, OUT_QURAN_PAIRS_DIR, OUT_HADITH_TEXT_DIR, OUT_SEARCH_DIR]:
    os.makedirs(d, exist_ok=True)

print("Resolved paths:")
print("  QURAN_AR_PATH  =", QURAN_AR_PATH)
print("  QURAN_EN_PATH  =", QURAN_EN_PATH)
print("  HADITH_PATH    =", HADITH_PATH)
print("  ROOT_WORDS_PATH=", ROOT_WORDS_PATH)
print("  DATA_DIR       =", DATA_DIR)

# ---------- Config ----------
HADITH_SHARD_SIZE = 1000

TOPK_QURAN_SEMANTIC = 20
TOPK_HADITH_SEMANTIC = 50
TOPK_HADITH_LEXICAL = 50

QURAN_SEMANTIC_CANDIDATES = 140
HADITH_SEMANTIC_CANDIDATES = 180

# Retrieval model: multilingual, retrieval-focused, Arabic-friendly.
# Lighter multilingual retrieval model that is much more feasible on CPU/16 GB RAM.
# You can override with an environment variable if you want to experiment later.
EMBED_MODEL_NAME = os.getenv("EMBED_MODEL_NAME", "Alibaba-NLP/gte-multilingual-base")
EMBED_BATCH_SIZE = int(os.getenv("EMBED_BATCH_SIZE", "32"))
VEC_PREVIEW_DIMS = 8
MAX_SHARED_ITEMS_STORED = 8

# Optional second-stage reranker.
# Default is OFF because cross-encoders are slow/heavy on CPU and were the next likely bottleneck
# after the original embedding model download problem.
USE_RERANKER = os.getenv("USE_RERANKER", "0") == "1"
RERANK_MODEL_NAME = os.getenv("RERANK_MODEL_NAME", "BAAI/bge-reranker-v2-m3")
RERANK_BATCH_SIZE = int(os.getenv("RERANK_BATCH_SIZE", "8"))
RERANK_MAX_LENGTH = int(os.getenv("RERANK_MAX_LENGTH", "384"))
QURAN_RERANK_TOPN = 8
HADITH_RERANK_TOPN = 10
QURAN_PREFILTER_TOPN = 24
HADITH_PREFILTER_TOPN = 28

GENERIC_TOKEN_DF_RATIO = 0.05
GENERIC_ROOT_DF_RATIO = 0.04
MIN_QQ_SHARED_ROOTS = 2
MIN_QH_SHARED_TOKENS = 1
MIN_QQ_CONTEXT_RAW = 0.33
MIN_QH_CONTEXT_RAW = 0.44
MIN_QH_EMBED = 0.50
VERY_HIGH_QQ_EMBED = 0.78
VERY_HIGH_QH_EMBED = 0.68
VERY_HIGH_RERANK = 0.72

# ---------- Helpers ----------
def safe_str(x):
    return "" if pd.isna(x) else str(x)


def write_json(path: str, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


def require_file(path: str, label: str):
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"{label} file not found at: {path}\n"
            f"Please place it either in:\n  {RAW_DIR}\nor repo root:\n  {REPO_ROOT}"
        )


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


def surah_to_shard_name(surah: int) -> str:
    return f"{surah:03d}"


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


def trigrams(token: str):
    if len(token) <= 3:
        return {token}
    return {token[i:i + 3] for i in range(len(token) - 2)}


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
ARABIC_LEMMATIZER_NAME = "qalsadi"

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
    print("WARNING: Arabic lemmatizer not available. Falling back to normalized tokens only.")
    print("Lemmatizer error:", repr(e))


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

    print("Loaded root-word rows:", len(rw))
    print("Ayat with at least one root:", len(ayah_to_rootset))
    return ayah_to_rootset, ayah_to_rootseq


def build_idf_from_sets(list_of_sets: list[set[str]]) -> tuple[dict[str, float], Counter]:
    df = Counter()
    n_docs = len(list_of_sets)
    for s in list_of_sets:
        for t in s:
            df[t] += 1
    idf = {}
    for t, c in df.items():
        idf[t] = 1.0 + math.log((1.0 + n_docs) / (1.0 + c))
    return idf, df


def weighted_overlap(base_set: set[str], other_set: set[str], weights: dict[str, float]):
    shared = base_set.intersection(other_set)
    inter = sum(weights.get(t, 1.0) for t in shared)
    union_terms = base_set.union(other_set)
    union = sum(weights.get(t, 1.0) for t in union_terms)
    base_weight = sum(weights.get(t, 1.0) for t in base_set)
    recall = (inter / base_weight) if base_weight > 0 else 0.0
    jacc = (inter / union) if union > 0 else 0.0
    return shared, inter, union, recall, jacc


def minmax01(x: float, low: float, high: float) -> float:
    if high <= low:
        return 0.0
    return max(0.0, min(1.0, (x - low) / (high - low)))


def calibrated_percentage(raw: float, low: float, high: float, power: float = 1.2) -> int:
    x = minmax01(raw, low, high)
    x = x ** power
    return int(round(100.0 * x))


def diversity_penalty(shared_terms: set[str], generic_terms: set[str]) -> float:
    if not shared_terms:
        return 0.0
    generic_count = sum(1 for t in shared_terms if t in generic_terms)
    ratio = generic_count / max(1, len(shared_terms))
    return 0.25 * ratio


def sigmoid_array(x) -> np.ndarray:
    arr = np.asarray(x, dtype=np.float32)
    return 1.0 / (1.0 + np.exp(-arr))


def take_top_items(items: list[dict], n: int, score_key: str) -> list[dict]:
    items.sort(key=lambda x: (-x[score_key], x.get("id", "")))
    return items[:n]


# ---------- Stopwords bootstrap ----------
STOPWORDS_AR_TXT = os.path.join(OUT_SEARCH_DIR, "stopwords_ar.txt")
if not os.path.exists(STOPWORDS_AR_TXT):
    base_ar = [
        "و", "في", "على", "من", "إلى", "عن", "ما", "ماذا", "اذا", "إن", "أن", "كان", "كانت", "يكون", "تكون",
        "هذا", "هذه", "ذلك", "تلك", "هؤلاء", "اولئك", "هو", "هي", "هم", "هن", "نحن", "انت", "انتم", "أنت",
        "لا", "لم", "لن", "قد", "ثم", "او", "أو", "بل", "كل", "حتى", "مع", "بين", "عند", "إذ", "اذ", "الا", "إلا",
        "أي", "أى", "اي", "أين", "اين", "كيف", "لماذا", "لما", "لأن", "لان", "إنما", "إنه", "انه", "إنهم", "انهم"
    ]
    base_ar_norm = sorted({normalize_ar(x) for x in base_ar if x.strip()})
    with open(STOPWORDS_AR_TXT, "w", encoding="utf-8") as f:
        f.write("# Arabic stopwords (normalized). Add more lines as needed.\n")
        for w in base_ar_norm:
            f.write(w + "\n")
    print("Created stopwords file:", STOPWORDS_AR_TXT)

stop_ar = load_stopwords_ar(STOPWORDS_AR_TXT)
stop_en = load_stopwords_en_default()

# ---------- Read raw datasets ----------
q_ar = read_csv_robust(QURAN_AR_PATH)
q_en = read_csv_robust(QURAN_EN_PATH)
h_df = read_csv_robust(HADITH_PATH)

# ---------- Quran Arabic ----------
q_ar_surah_col = find_required_column(q_ar, ["surah", "Surah"], "surah")
q_ar_ayah_col = find_required_column(q_ar, ["ayah", "Ayah", "ayat", "Ayat"], "ayah")
quran_arabic_col = find_optional_column(q_ar, ["arabic_text", "arabic", "uthmani", "simple", "text", "Text"])
if quran_arabic_col is None:
    raise ValueError(f"Could not find Arabic Quran text column in quran.csv. Available: {list(q_ar.columns)}")

q_ar = q_ar.copy()
q_ar["surah"] = pd.to_numeric(q_ar[q_ar_surah_col], errors="raise").astype(int)
q_ar["ayah"] = pd.to_numeric(q_ar[q_ar_ayah_col], errors="raise").astype(int)
q_ar["ayah_id"] = q_ar["surah"].astype(str) + ":" + q_ar["ayah"].astype(str)
q_ar["arabic_text"] = q_ar[quran_arabic_col].astype(str)

# ---------- Quran English ----------
q_en_surah_col = find_required_column(q_en, ["surah", "Surah"], "surah")
q_en_ayah_col = find_required_column(q_en, ["ayah", "Ayah", "ayat", "Ayat"], "ayah")
english_text_col = find_optional_column(q_en, ["english_text", "translation", "text", "english", "English Text", "Text"])
if english_text_col is None:
    raise ValueError(f"Could not find English translation column in Quran_English.csv. Available: {list(q_en.columns)}")

q_en = q_en.copy()
q_en["surah"] = pd.to_numeric(q_en[q_en_surah_col], errors="raise").astype(int)
q_en["ayah"] = pd.to_numeric(q_en[q_en_ayah_col], errors="raise").astype(int)
q_en["ayah_id"] = q_en["surah"].astype(str) + ":" + q_en["ayah"].astype(str)
q_en["english_text"] = q_en[english_text_col].astype(str)

set_ar = set(q_ar["ayah_id"].tolist())
set_en = set(q_en["ayah_id"].tolist())
if set_ar != set_en:
    raise ValueError("English/Arabic join mismatch detected.")

q = q_ar[["ayah_id", "surah", "ayah", "arabic_text"]].merge(
    q_en[["ayah_id", "english_text"]],
    on="ayah_id",
    how="left"
)

# ---------- Hadith ----------
hadith_ar_col = find_optional_column(h_df, ["arabic text", "arabic_text", "arabic", "text_ar", "Arabic Text"])
if hadith_ar_col is None:
    raise ValueError(f"Hadith Arabic text column not found. Available: {list(h_df.columns)}")

hadith_en_col = find_optional_column(h_df, ["english text", "english_text", "english", "translation", "text_en", "English Text"])
if hadith_en_col is None:
    print("WARNING: Hadith English column not found. Hadith English will be blank in UI.")

hadith_book_col = find_optional_column(h_df, ["book", "Book"])
hadith_reference_col = find_optional_column(h_df, ["reference", "Reference"])

h_df = h_df.copy()
h_df["serial"] = np.arange(1, len(h_df) + 1, dtype=np.int32)
h_df["book"] = h_df[hadith_book_col].astype(str) if hadith_book_col else "Unknown"
h_df["reference"] = h_df[hadith_reference_col].astype(str) if hadith_reference_col else ""
h_df["english_text"] = h_df[hadith_en_col].astype(str) if hadith_en_col else ""
h_df["hadith_id"] = h_df["book"].astype(str) + "|" + h_df["reference"].astype(str) + "|" + h_df["serial"].astype(str)
h_keep = h_df[["hadith_id", "serial", "book", "reference", hadith_ar_col, "english_text"]].copy()
h_keep.rename(columns={hadith_ar_col: "arabic_text"}, inplace=True)

print("Loaded Quran:", len(q), "| Hadith:", len(h_keep))

# ---------- Tokenize ----------
q["arabic_norm"] = q["arabic_text"].map(normalize_ar)
q["arabic_tokens"] = q["arabic_text"].map(lambda t: tokenize_ar(t, stop_ar))
q["tok_set"] = q["arabic_tokens"].map(set)
q["tok_len"] = q["tok_set"].map(len)
q["tokens_ordered"] = q["arabic_tokens"].map(dedupe_keep_order)
q_semantic_rows = [build_semantic_text(t, stop_ar) for t in q["arabic_text"].tolist()]
q_semantic_df = pd.DataFrame(q_semantic_rows, columns=["lemma_text", "lemma_tokens"], index=q.index)
q[["lemma_text", "lemma_tokens"]] = q_semantic_df
q["lemma_set"] = q["lemma_tokens"].map(set)
q["lemma_len"] = q["lemma_set"].map(len)

h_keep["arabic_norm"] = h_keep["arabic_text"].map(normalize_ar)
h_keep["arabic_tokens"] = h_keep["arabic_text"].map(lambda t: tokenize_ar(t, stop_ar))
h_keep["tok_set"] = h_keep["arabic_tokens"].map(set)
h_keep["tok_len"] = h_keep["tok_set"].map(len)
h_semantic_rows = [build_semantic_text(t, stop_ar) for t in h_keep["arabic_text"].tolist()]
h_semantic_df = pd.DataFrame(h_semantic_rows, columns=["lemma_text", "lemma_tokens"], index=h_keep.index)
h_keep[["lemma_text", "lemma_tokens"]] = h_semantic_df
h_keep["lemma_set"] = h_keep["lemma_tokens"].map(set)
h_keep["lemma_len"] = h_keep["lemma_set"].map(len)

print("Avg Quran token count:", float(q["tok_len"].mean()))
print("Avg Hadith token count:", float(h_keep["tok_len"].mean()))
print("Avg Quran lemma count:", float(q["lemma_len"].mean()))
print("Avg Hadith lemma count:", float(h_keep["lemma_len"].mean()))
print("Arabic lemmatizer enabled:", HAS_QALSADI)

# ---------- Root sets ----------
ayah_to_rootset, ayah_to_rootseq = load_root_words_maps(ROOT_WORDS_PATH)
q["root_set"] = q["ayah_id"].map(lambda aid: ayah_to_rootset.get(aid, set()))
q["root_len"] = q["root_set"].map(len)
q["roots_ordered"] = q["ayah_id"].map(lambda aid: dedupe_keep_order(ayah_to_rootseq.get(aid, [])))
print("Avg Quran root count:", float(q["root_len"].mean()))
print("Quran ayat with ZERO roots in root file:", int((q["root_len"] == 0).sum()))

# ---------- Search indexes ----------
q["english_tokens"] = q["english_text"].map(lambda t: tokenize_en(t, stop_en))

english_token_to_ayah = defaultdict(list)
for ayah_id, toks in zip(q["ayah_id"], q["english_tokens"]):
    for t in set(toks):
        english_token_to_ayah[t].append(ayah_id)

trigram_to_tokens = defaultdict(list)
for token in english_token_to_ayah.keys():
    for tg in trigrams(token):
        trigram_to_tokens[tg].append(token)

arabic_token_to_ayah = defaultdict(list)
for ayah_id, tset in zip(q["ayah_id"], q["tok_set"]):
    for t in tset:
        arabic_token_to_ayah[t].append(ayah_id)

write_json(os.path.join(OUT_SEARCH_DIR, "english_token_to_ayahids.json"), english_token_to_ayah)
write_json(os.path.join(OUT_SEARCH_DIR, "english_trigram_to_tokens.json"), trigram_to_tokens)
write_json(os.path.join(OUT_SEARCH_DIR, "arabic_token_to_ayahids.json"), arabic_token_to_ayah)
print("English vocab:", len(english_token_to_ayah), "Arabic vocab:", len(arabic_token_to_ayah))

# ---------- Weights / document frequencies ----------
all_token_sets = q["tok_set"].tolist() + h_keep["tok_set"].tolist()
all_lemma_sets = q["lemma_set"].tolist() + h_keep["lemma_set"].tolist()
token_idf, token_df = build_idf_from_sets(all_token_sets)
lemma_idf, lemma_df = build_idf_from_sets(all_lemma_sets)
root_idf, root_df = build_idf_from_sets(q["root_set"].tolist())

generic_tokens = {t for t, c in token_df.items() if c / max(1, len(all_token_sets)) >= GENERIC_TOKEN_DF_RATIO}
generic_lemmas = {t for t, c in lemma_df.items() if c / max(1, len(all_lemma_sets)) >= GENERIC_TOKEN_DF_RATIO}
generic_roots = {t for t, c in root_df.items() if c / max(1, len(q)) >= GENERIC_ROOT_DF_RATIO}

# Stronger domain-specific noise handling for hadith formulae.
extra_hadith_noise = {
    "قال", "قالت", "قالوا", "حدثنا", "اخبرنا", "سمعت", "سمع", "عن", "ابو", "ابي", "ابن", "بنت",
    "رسول", "النبي", "الله", "عليه", "وسلم", "صلي", "صلى", "كان", "كانت", "فقال", "فقالت", "فقالوا",
    "رواه", "رجل", "امراه", "امرأة", "ناس", "احد", "احدى", "انه", "انها", "انهم", "هذا", "هذه"
}

generic_tokens_all = generic_tokens.union(extra_hadith_noise)
generic_lemmas_all = generic_lemmas.union({lemmatize_ar_token(t) for t in extra_hadith_noise})

print("Generic Arabic tokens penalized:", len(generic_tokens))
print("Generic Arabic lemmas penalized:", len(generic_lemmas))
print("Generic Quran roots penalized:", len(generic_roots))
print("Extra hadith-noise tokens penalized:", len(extra_hadith_noise))

# ---------- Embeddings ----------
print("Loading embedding model:", EMBED_MODEL_NAME)
print("Embedding batch size:", EMBED_BATCH_SIZE)
print("USE_RERANKER:", USE_RERANKER)
try:
    model = SentenceTransformer(EMBED_MODEL_NAME, trust_remote_code=True)
except TypeError:
    # Some models do not need / accept trust_remote_code.
    model = SentenceTransformer(EMBED_MODEL_NAME)


def embed_passages(texts: list[str]) -> np.ndarray:
    emb = model.encode(
        texts,
        batch_size=EMBED_BATCH_SIZE,
        show_progress_bar=True,
        normalize_embeddings=True,
    )
    return np.asarray(emb, dtype=np.float32)


q_emb = embed_passages(q["arabic_norm"].tolist())
h_emb = embed_passages(h_keep["arabic_norm"].tolist())
print("Embeddings shapes:", q_emb.shape, h_emb.shape)

# ---------- TF-IDF on lemmatized Arabic ----------
TFIDF_MIN_DF = max(2, int(os.getenv("TFIDF_MIN_DF", "2")))
TFIDF_MAX_DF = float(os.getenv("TFIDF_MAX_DF", "0.90"))
TFIDF_NGRAM_MAX = int(os.getenv("TFIDF_NGRAM_MAX", "2"))

print("Building TF-IDF on lemmatized Arabic text...")
vectorizer = TfidfVectorizer(
    analyzer="word",
    token_pattern=r"(?u)\b\w+\b",
    ngram_range=(1, TFIDF_NGRAM_MAX),
    min_df=TFIDF_MIN_DF,
    max_df=TFIDF_MAX_DF,
    sublinear_tf=True,
    norm="l2",
)
combined_lemma_texts = q["lemma_text"].tolist() + h_keep["lemma_text"].tolist()
tfidf_all = vectorizer.fit_transform(combined_lemma_texts)
q_tfidf = tfidf_all[:len(q)]
h_tfidf = tfidf_all[len(q):]
print("TF-IDF matrix shapes:", q_tfidf.shape, h_tfidf.shape)

def tfidf_scores_for_candidates(base_row, cand_rows) -> np.ndarray:
    if cand_rows.shape[0] == 0:
        return np.zeros(0, dtype=np.float32)
    sims = linear_kernel(base_row, cand_rows).reshape(-1)
    return np.asarray(sims, dtype=np.float32)

# ---------- Optional reranker ----------
reranker = None
if USE_RERANKER:
    try:
        print("Loading reranker model:", RERANK_MODEL_NAME)
        reranker = CrossEncoder(RERANK_MODEL_NAME, max_length=RERANK_MAX_LENGTH)
    except Exception as e:
        print("WARNING: Failed to load reranker. Continuing without it.")
        print("Reranker error:", repr(e))
        reranker = None


def rerank_pair_scores(pairs: list[tuple[str, str]]) -> np.ndarray:
    if reranker is None or not pairs:
        return np.zeros(len(pairs), dtype=np.float32)
    scores = reranker.predict(pairs, batch_size=RERANK_BATCH_SIZE, show_progress_bar=False)
    scores = np.asarray(scores, dtype=np.float32).reshape(-1)
    if len(scores) == 0:
        return scores
    if np.min(scores) < 0.0 or np.max(scores) > 1.0:
        scores = sigmoid_array(scores)
    return np.clip(scores, 0.0, 1.0)


# ---------- Candidate retrieval ----------
q_ids = q["ayah_id"].tolist()
h_ids = h_keep["hadith_id"].tolist()
q_norm_texts = q["arabic_norm"].tolist()
h_norm_texts = h_keep["arabic_norm"].tolist()
q_lemma_texts = q["lemma_text"].tolist()
h_lemma_texts = h_keep["lemma_text"].tolist()

nn_q = NearestNeighbors(n_neighbors=QURAN_SEMANTIC_CANDIDATES + 1, metric="cosine", algorithm="brute")
nn_q.fit(q_emb)
dist_qq, ind_qq = nn_q.kneighbors(q_emb, return_distance=True)

nn_h = NearestNeighbors(n_neighbors=HADITH_SEMANTIC_CANDIDATES, metric="cosine", algorithm="brute")
nn_h.fit(h_emb)
dist_qh, ind_qh = nn_h.kneighbors(q_emb, return_distance=True)

# ---------- Semantic reranking ----------
q_tok_sets = q["tok_set"].tolist()
h_tok_sets = h_keep["tok_set"].tolist()
q_lemma_sets = q["lemma_set"].tolist()
h_lemma_sets = h_keep["lemma_set"].tolist()
q_root_sets = q["root_set"].tolist()
q_tok_lens = q["tok_len"].to_numpy()
h_tok_lens = h_keep["tok_len"].to_numpy()
q_lemma_lens = q["lemma_len"].to_numpy()
h_lemma_lens = h_keep["lemma_len"].to_numpy()


def score_shared_terms(terms: set[str], weights: dict[str, float]) -> float:
    return float(sum(weights.get(t, 1.0) for t in terms))


def sort_display_terms(roots: set[str], tokens: set[str]) -> list[str]:
    ranked_roots = sorted(list(roots), key=lambda r: (-root_idf.get(r, 1.0), r))
    ranked_tokens = sorted(list(tokens), key=lambda t: (-token_idf.get(t, 1.0), t))
    display = ranked_roots[:MAX_SHARED_ITEMS_STORED]
    if len(display) < MAX_SHARED_ITEMS_STORED:
        need = MAX_SHARED_ITEMS_STORED - len(display)
        display.extend(ranked_tokens[:need])
    return display[:MAX_SHARED_ITEMS_STORED]


def rerank_quran_quran(i: int):
    base_tok = q_tok_sets[i]
    base_lemma = q_lemma_sets[i]
    base_root = q_root_sets[i]
    candidate_js = []
    candidate_dists = []

    for d, j in zip(dist_qq[i].tolist(), ind_qq[i].tolist()):
        if j == i:
            continue
        candidate_js.append(j)
        candidate_dists.append(float(d))

    if not candidate_js:
        return []

    tfidf_scores = tfidf_scores_for_candidates(q_tfidf[i], q_tfidf[candidate_js])
    provisional = []

    for j, d, tfidf_sim in zip(candidate_js, candidate_dists, tfidf_scores.tolist()):
        embed_sim = float(1.0 - d)
        other_tok = q_tok_sets[j]
        other_lemma = q_lemma_sets[j]
        other_root = q_root_sets[j]

        shared_tok, tok_inter, _, tok_recall, tok_jacc = weighted_overlap(base_tok, other_tok, token_idf)
        shared_lemmas, lemma_inter, _, lemma_recall, lemma_jacc = weighted_overlap(base_lemma, other_lemma, lemma_idf)
        shared_roots, root_inter, _, root_recall, root_jacc = weighted_overlap(base_root, other_root, root_idf)

        if root_inter <= 0 and tok_inter <= 0 and lemma_inter <= 0:
            continue

        meaningful_roots = {r for r in shared_roots if r not in generic_roots}
        meaningful_tokens = {t for t in shared_tok if t not in generic_tokens}
        meaningful_lemmas = {t for t in shared_lemmas if t not in generic_lemmas}
        meaningful_root_weight = score_shared_terms(meaningful_roots, root_idf)
        meaningful_token_weight = score_shared_terms(meaningful_tokens, token_idf)
        meaningful_lemma_weight = score_shared_terms(meaningful_lemmas, lemma_idf)

        length_ratio = min(q_lemma_lens[i], q_lemma_lens[j]) / max(1, max(q_lemma_lens[i], q_lemma_lens[j]))
        generic_pen = (
            diversity_penalty(shared_tok, generic_tokens) +
            diversity_penalty(shared_lemmas, generic_lemmas) +
            diversity_penalty(shared_roots, generic_roots)
        )

        semantic_core = minmax01(embed_sim, 0.48, 0.92)
        tfidf_core = minmax01(float(tfidf_sim), 0.03, 0.55)
        token_core = minmax01(tok_jacc, 0.00, 0.34)
        lemma_core = minmax01(lemma_jacc, 0.00, 0.36)
        root_core = minmax01(root_jacc, 0.00, 0.58)
        lemma_recall_core = minmax01(lemma_recall, 0.00, 0.82)
        token_recall_core = minmax01(tok_recall, 0.00, 0.80)
        root_recall_core = minmax01(root_recall, 0.00, 0.90)
        len_core = minmax01(length_ratio, 0.20, 1.00)
        support_bonus = minmax01(meaningful_root_weight + 0.50 * meaningful_token_weight + 0.90 * meaningful_lemma_weight, 0.0, 10.0)

        pre_raw = (
            0.31 * semantic_core +
            0.19 * tfidf_core +
            0.12 * lemma_core +
            0.10 * lemma_recall_core +
            0.12 * root_core +
            0.06 * root_recall_core +
            0.04 * token_core +
            0.02 * token_recall_core +
            0.02 * support_bonus +
            0.02 * len_core -
            generic_pen
        )

        if not meaningful_roots and meaningful_lemma_weight < 1.0 and meaningful_token_weight < 1.0 and embed_sim < VERY_HIGH_QQ_EMBED and tfidf_sim < 0.22:
            continue
        if meaningful_root_weight <= 0 and meaningful_lemma_weight <= 0 and tfidf_sim < 0.12 and embed_sim < VERY_HIGH_QQ_EMBED:
            continue

        provisional.append({
            "j": j,
            "id": q_ids[j],
            "embed_sim": embed_sim,
            "tfidf_sim": float(tfidf_sim),
            "shared_roots": meaningful_roots,
            "shared_tokens": meaningful_lemmas if meaningful_lemmas else meaningful_tokens,
            "all_shared_tokens": shared_lemmas if shared_lemmas else shared_tok,
            "all_shared_roots": shared_roots,
            "pre_raw": float(pre_raw),
            "semantic_core": semantic_core,
            "tfidf_core": tfidf_core,
            "lemma_core": lemma_core,
            "lemma_recall_core": lemma_recall_core,
            "token_core": token_core,
            "token_recall_core": token_recall_core,
            "root_core": root_core,
            "root_recall_core": root_recall_core,
            "len_core": len_core,
            "support_bonus": support_bonus,
        })

    provisional = take_top_items(provisional, QURAN_PREFILTER_TOPN, "pre_raw")
    rerank_subset = provisional[:QURAN_RERANK_TOPN]
    rerank_scores = {}
    if rerank_subset:
        pairs = [(q_lemma_texts[i], q_lemma_texts[item["j"]]) for item in rerank_subset]
        scores = rerank_pair_scores(pairs)
        rerank_scores = {item["j"]: float(score) for item, score in zip(rerank_subset, scores)}

    out = []
    for item in provisional:
        rerank_score = rerank_scores.get(item["j"], 0.0)
        rerank_core = minmax01(rerank_score, 0.45, 0.92) if reranker is not None else 0.0
        raw = (
            0.20 * item["semantic_core"] +
            0.18 * item["tfidf_core"] +
            0.10 * rerank_core +
            0.14 * item["lemma_core"] +
            0.08 * item["lemma_recall_core"] +
            0.16 * item["root_core"] +
            0.06 * item["root_recall_core"] +
            0.03 * item["token_core"] +
            0.02 * item["token_recall_core"] +
            0.02 * item["len_core"] +
            0.01 * item["support_bonus"]
        )

        if not item["shared_roots"] and rerank_score < VERY_HIGH_RERANK and item["embed_sim"] < VERY_HIGH_QQ_EMBED and item["tfidf_sim"] < 0.22:
            continue
        if raw < MIN_QQ_CONTEXT_RAW:
            continue

        score = calibrated_percentage(raw, 0.28, 0.88, power=1.18)
        display_shared = sort_display_terms(item["shared_roots"], item["shared_tokens"])
        if not display_shared:
            display_shared = sort_display_terms(item["all_shared_roots"], item["all_shared_tokens"])

        out.append({
            "id": item["id"],
            "score": score,
            "shared_tokens": display_shared,
            "raw_score": round(float(raw), 6),
        })

    out.sort(key=lambda x: (-x["score"], -x["raw_score"], x["id"]))
    return [{k: v for k, v in item.items() if k != "raw_score"} for item in out[:TOPK_QURAN_SEMANTIC]]


def rerank_quran_hadith(i: int):
    base_tok = q_tok_sets[i]
    base_lemma = q_lemma_sets[i]
    candidate_js = ind_qh[i].tolist()
    candidate_dists = [float(x) for x in dist_qh[i].tolist()]

    if not candidate_js:
        return []

    tfidf_scores = tfidf_scores_for_candidates(q_tfidf[i], h_tfidf[candidate_js])
    provisional = []

    for j, d, tfidf_sim in zip(candidate_js, candidate_dists, tfidf_scores.tolist()):
        embed_sim = float(1.0 - d)
        if embed_sim < MIN_QH_EMBED and tfidf_sim < 0.08:
            continue

        other_tok = h_tok_sets[j]
        other_lemma = h_lemma_sets[j]
        shared_tok, _, _, tok_recall, tok_jacc = weighted_overlap(base_tok, other_tok, token_idf)
        shared_lemmas, lemma_inter, _, lemma_recall, lemma_jacc = weighted_overlap(base_lemma, other_lemma, lemma_idf)
        filtered_shared = {t for t in shared_tok if t not in generic_tokens_all}
        filtered_lemmas = {t for t in shared_lemmas if t not in generic_lemmas_all}
        filtered_tok_inter = score_shared_terms(filtered_shared, token_idf)
        filtered_lemma_inter = score_shared_terms(filtered_lemmas, lemma_idf)

        length_ratio = min(q_lemma_lens[i], h_lemma_lens[j]) / max(1, max(q_lemma_lens[i], h_lemma_lens[j]))
        generic_pen = diversity_penalty(shared_tok, generic_tokens_all) + diversity_penalty(shared_lemmas, generic_lemmas_all)
        support_bonus = minmax01(0.55 * filtered_tok_inter + 1.00 * filtered_lemma_inter, 0.0, 9.0)

        semantic_core = minmax01(embed_sim, 0.52, 0.92)
        tfidf_core = minmax01(float(tfidf_sim), 0.02, 0.42)
        token_core = minmax01(tok_jacc, 0.00, 0.18)
        lemma_core = minmax01(lemma_jacc, 0.00, 0.22)
        token_recall_core = minmax01(tok_recall, 0.00, 0.45)
        lemma_recall_core = minmax01(lemma_recall, 0.00, 0.55)
        len_core = minmax01(length_ratio, 0.08, 0.95)

        pre_raw = (
            0.40 * semantic_core +
            0.22 * tfidf_core +
            0.12 * lemma_core +
            0.06 * lemma_recall_core +
            0.05 * token_core +
            0.04 * token_recall_core +
            0.07 * support_bonus +
            0.04 * len_core -
            generic_pen
        )

        if filtered_lemma_inter < 1.10 and filtered_tok_inter < 1.10 and embed_sim < VERY_HIGH_QH_EMBED and tfidf_sim < 0.18:
            continue

        provisional.append({
            "j": j,
            "id": h_ids[j],
            "embed_sim": embed_sim,
            "tfidf_sim": float(tfidf_sim),
            "filtered_shared": filtered_lemmas if filtered_lemmas else filtered_shared,
            "all_shared_tokens": shared_lemmas if shared_lemmas else shared_tok,
            "filtered_tok_inter": filtered_tok_inter,
            "filtered_lemma_inter": filtered_lemma_inter,
            "semantic_core": semantic_core,
            "tfidf_core": tfidf_core,
            "lemma_core": lemma_core,
            "lemma_recall_core": lemma_recall_core,
            "token_core": token_core,
            "token_recall_core": token_recall_core,
            "len_core": len_core,
            "support_bonus": support_bonus,
            "pre_raw": float(pre_raw),
        })

    provisional = take_top_items(provisional, HADITH_PREFILTER_TOPN, "pre_raw")
    rerank_subset = provisional[:HADITH_RERANK_TOPN]
    rerank_scores = {}
    if rerank_subset:
        pairs = [(q_lemma_texts[i], h_lemma_texts[item["j"]]) for item in rerank_subset]
        scores = rerank_pair_scores(pairs)
        rerank_scores = {item["j"]: float(score) for item, score in zip(rerank_subset, scores)}

    out = []
    for item in provisional:
        rerank_score = rerank_scores.get(item["j"], 0.0)
        rerank_core = minmax01(rerank_score, 0.44, 0.92) if reranker is not None else 0.0
        raw = (
            0.22 * item["semantic_core"] +
            0.23 * item["tfidf_core"] +
            0.20 * rerank_core +
            0.11 * item["lemma_core"] +
            0.05 * item["lemma_recall_core"] +
            0.05 * item["token_core"] +
            0.04 * item["token_recall_core"] +
            0.07 * item["support_bonus"] +
            0.03 * item["len_core"]
        )

        if not item["filtered_shared"] and rerank_score < VERY_HIGH_RERANK and item["embed_sim"] < VERY_HIGH_QH_EMBED and item["tfidf_sim"] < 0.20:
            continue
        if item["filtered_lemma_inter"] < 1.20 and item["filtered_tok_inter"] < 1.40 and rerank_score < 0.60 and item["embed_sim"] < 0.62 and item["tfidf_sim"] < 0.20:
            continue
        if raw < MIN_QH_CONTEXT_RAW:
            continue

        score = calibrated_percentage(raw, 0.34, 0.90, power=1.08)
        display_shared = sorted(
            list(item["filtered_shared"] if item["filtered_shared"] else item["all_shared_tokens"]),
            key=lambda t: (-lemma_idf.get(t, token_idf.get(t, 1.0)), t)
        )[:MAX_SHARED_ITEMS_STORED]

        out.append({
            "id": item["id"],
            "score": score,
            "shared_tokens": display_shared,
            "raw_score": round(float(raw), 6),
        })

    out.sort(key=lambda x: (-x["score"], -x["raw_score"], x["id"]))
    return [{k: v for k, v in item.items() if k != "raw_score"} for item in out[:TOPK_HADITH_SEMANTIC]]


semantic_pairs_quran = {}
semantic_pairs_hadith = {}
for i, ayah_id in enumerate(q_ids):
    if (i + 1) % 250 == 0 or i == 0:
        print(f"Semantic pairing progress: {i + 1}/{len(q_ids)}")
    semantic_pairs_quran[ayah_id] = rerank_quran_quran(i)
    semantic_pairs_hadith[ayah_id] = rerank_quran_hadith(i)

print("Semantic pairing done with embedding retrieval + stronger filtering + optional reranker.")

# ---------- Lexical pairing ----------
post_q_roots = defaultdict(list)
for idx, rset in enumerate(q_root_sets):
    for r in rset:
        post_q_roots[r].append(idx)

post_h_tokens = defaultdict(list)
for idx, tset in enumerate(h_tok_sets):
    for t in tset:
        post_h_tokens[t].append(idx)


def quran_root_pairs_all_with_2plus(i: int):
    base_roots = q_root_sets[i]
    if not base_roots:
        return []

    counts = Counter()
    for root in base_roots:
        for j in post_q_roots.get(root, []):
            if j != i:
                counts[j] += 1

    out = []
    for j, inter_count in counts.items():
        if inter_count < MIN_QQ_SHARED_ROOTS:
            continue

        other_roots = q_root_sets[j]
        shared, _, _, recall, jacc = weighted_overlap(base_roots, other_roots, root_idf)
        raw = (
            0.55 * minmax01(jacc, 0.06, 0.70) +
            0.30 * minmax01(recall, 0.12, 0.95) +
            0.15 * minmax01(inter_count, 2.0, 7.0)
        )
        score = calibrated_percentage(raw, 0.10, 0.92, power=1.08)
        display_shared = sorted(list(shared), key=lambda r: (-root_idf.get(r, 1.0), r))[:MAX_SHARED_ITEMS_STORED]

        out.append({
            "id": q_ids[j],
            "score": score,
            "shared_tokens": display_shared,
            "intersection": int(inter_count),
        })

    out.sort(key=lambda x: (-x["intersection"], -x["score"], x["id"]))
    return out


def hadith_lexical_pairs(i: int):
    base_tokens = q_tok_sets[i]
    if not base_tokens:
        return []

    counts = Counter()
    for tok in base_tokens:
        for j in post_h_tokens.get(tok, []):
            counts[j] += 1

    out = []
    for j, inter_count in counts.items():
        if inter_count < MIN_QH_SHARED_TOKENS:
            continue

        other_tokens = h_tok_sets[j]
        shared, _, _, recall, jacc = weighted_overlap(base_tokens, other_tokens, token_idf)
        display_shared = sorted(
            list(shared), key=lambda t: (-token_idf.get(t, 1.0), t)
        )[:MAX_SHARED_ITEMS_STORED]

        raw = (
            0.45 * minmax01(jacc, 0.02, 0.45) +
            0.35 * minmax01(recall, 0.05, 0.90) +
            0.20 * minmax01(inter_count, 1.0, 6.0)
        )
        score = calibrated_percentage(raw, 0.08, 0.85, power=1.10)

        out.append({
            "id": h_ids[j],
            "score": score,
            "shared_tokens": display_shared,
            "intersection": int(inter_count),
        })

    out.sort(key=lambda x: (-x["score"], -x["intersection"], x["id"]))
    return out[:TOPK_HADITH_LEXICAL]


lex_pairs_quran = {}
lex_pairs_hadith = {}
for i, ayah_id in enumerate(q_ids):
    lex_pairs_quran[ayah_id] = quran_root_pairs_all_with_2plus(i)
    lex_pairs_hadith[ayah_id] = hadith_lexical_pairs(i)

print("Lexical pairing done.")
print("Quran-Quran lexical now includes ALL ayat with >= 2 shared roots.")
print("Quran-Hadith lexical includes shared Arabic tokens for display.")

# ---------- Diagnostics ----------
diagnostics = {
    "embedding_model": EMBED_MODEL_NAME,
    "arabic_lemmatizer_enabled": HAS_QALSADI,
    "arabic_lemmatizer_name": ARABIC_LEMMATIZER_NAME if HAS_QALSADI else None,
    "reranker_model": RERANK_MODEL_NAME if reranker is not None else None,
    "avg_quran_semantic_pairs": round(float(np.mean([len(v) for v in semantic_pairs_quran.values()])), 3),
    "avg_hadith_semantic_pairs": round(float(np.mean([len(v) for v in semantic_pairs_hadith.values()])), 3),
    "min_qq_context_raw": MIN_QQ_CONTEXT_RAW,
    "min_qh_context_raw": MIN_QH_CONTEXT_RAW,
    "min_qh_embed": MIN_QH_EMBED,
    "tfidf": {
        "min_df": TFIDF_MIN_DF,
        "max_df": TFIDF_MAX_DF,
        "ngram_max": TFIDF_NGRAM_MAX,
        "feature_count": int(q_tfidf.shape[1]),
    },
    "candidate_counts": {
        "quran_semantic_candidates": QURAN_SEMANTIC_CANDIDATES,
        "hadith_semantic_candidates": HADITH_SEMANTIC_CANDIDATES,
        "quran_prefilter_topn": QURAN_PREFILTER_TOPN,
        "hadith_prefilter_topn": HADITH_PREFILTER_TOPN,
        "quran_rerank_topn": QURAN_RERANK_TOPN,
        "hadith_rerank_topn": HADITH_RERANK_TOPN,
    },
}
write_json(os.path.join(OUT_META_DIR, "pairing_diagnostics.json"), diagnostics)
print("Wrote diagnostics:", os.path.join(OUT_META_DIR, "pairing_diagnostics.json"))

# ---------- Quran text shards ----------
q["vec_preview"] = [np.round(v[:VEC_PREVIEW_DIMS], 4).tolist() for v in q_emb]

shard_map_quran = {}
for surah in sorted(q["surah"].unique().tolist()):
    s = int(surah)
    shard_df = q[q["surah"] == s]
    recs = []
    for _, row in shard_df.iterrows():
        recs.append({
            "ayah_id": row["ayah_id"],
            "surah": int(row["surah"]),
            "ayah": int(row["ayah"]),
            "arabic": safe_str(row["arabic_text"]),
            "english": safe_str(row["english_text"]),
            "roots_ordered": row["roots_ordered"],
            "tokens_ordered": row["tokens_ordered"],
            "vec_preview": row["vec_preview"],
        })

    fn = f"quran_s{surah_to_shard_name(s)}.json"
    shard_map_quran[str(s)] = f"quran_text/{fn}"
    write_json(os.path.join(OUT_QURAN_TEXT_DIR, fn), recs)

write_json(os.path.join(OUT_META_DIR, "shard_map_quran.json"), shard_map_quran)
print("Wrote Quran text shards:", len(shard_map_quran))

# ---------- Hadith shards ----------
h_sorted = h_keep.sort_values("serial").reset_index(drop=True)
shard_map_hadith = []

for start in range(0, len(h_sorted), HADITH_SHARD_SIZE):
    end = min(len(h_sorted), start + HADITH_SHARD_SIZE)
    block = h_sorted.iloc[start:end]
    serial_start = int(block["serial"].iloc[0])
    serial_end = int(block["serial"].iloc[-1])
    fn = f"hadith_{serial_start:05d}_{serial_end:05d}.json"

    out = []
    for _, row in block.iterrows():
        out.append({
            "hadith_id": row["hadith_id"],
            "serial": int(row["serial"]),
            "book": safe_str(row["book"]),
            "reference": safe_str(row["reference"]),
            "arabic": safe_str(row["arabic_text"]),
            "english": safe_str(row["english_text"]),
        })

    write_json(os.path.join(OUT_HADITH_TEXT_DIR, fn), out)
    shard_map_hadith.append({
        "start": serial_start,
        "end": serial_end,
        "file": f"hadith_text/{fn}",
    })

write_json(os.path.join(OUT_META_DIR, "shard_map_hadith.json"), shard_map_hadith)
print("Wrote Hadith shards:", len(shard_map_hadith))

# ---------- Pair shards ----------
shard_map_pairs = {}
for surah in sorted(q["surah"].unique().tolist()):
    s = int(surah)
    ayah_ids_in_surah = q[q["surah"] == s]["ayah_id"].tolist()

    out = []
    for ayah_id in ayah_ids_in_surah:
        out.append({
            "ayah_id": ayah_id,
            "semantic": {
                "quran_top20": semantic_pairs_quran[ayah_id],
                "hadith_top50": semantic_pairs_hadith[ayah_id],
            },
            "lexical": {
                "quran_all_2plus": lex_pairs_quran[ayah_id],
                "hadith_top50": lex_pairs_hadith[ayah_id],
            },
        })

    fn = f"pairs_s{surah_to_shard_name(s)}.json"
    shard_map_pairs[str(s)] = f"quran_pairs/{fn}"
    write_json(os.path.join(OUT_QURAN_PAIRS_DIR, fn), out)

write_json(os.path.join(OUT_META_DIR, "shard_map_pairs.json"), shard_map_pairs)
print("Wrote pair shards:", len(shard_map_pairs))

# ---------- Manifest ----------
manifest = {
    "version": 3,
    "counts": {
        "quran_ayat": int(len(q)),
        "hadith": int(len(h_sorted)),
        "english_vocab": int(len(english_token_to_ayah)),
        "arabic_vocab": int(len(arabic_token_to_ayah)),
    },
    "paths": {
        "shard_map_quran": "data/meta/shard_map_quran.json",
        "shard_map_pairs": "data/meta/shard_map_pairs.json",
        "shard_map_hadith": "data/meta/shard_map_hadith.json",
        "english_token_to_ayahids": "data/search_index/english_token_to_ayahids.json",
        "english_trigram_to_tokens": "data/search_index/english_trigram_to_tokens.json",
        "arabic_token_to_ayahids": "data/search_index/arabic_token_to_ayahids.json",
        "pairing_diagnostics": "data/meta/pairing_diagnostics.json",
    },
    "pairing": {
        "context_match": "embedding retrieval + lemmatized Arabic TF-IDF + stricter filtering + lexical/root support + optional reranker + calibrated percentage scores",
        "lexical_quran_rule": "all Quran ayat with at least 2 shared roots",
        "lexical_hadith_rule": "top 50 hadith by shared Arabic token overlap",
        "semantic_embedding_model": EMBED_MODEL_NAME,
        "semantic_reranker_model": RERANK_MODEL_NAME if reranker is not None else None,
    },
}

write_json(os.path.join(OUT_META_DIR, "manifest.json"), manifest)
print("DONE ✅ Manifest written:", os.path.join(OUT_META_DIR, "manifest.json"))
