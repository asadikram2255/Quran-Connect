# %% [0] Debug + environment sanity
import os
import sys
import re
import json
from collections import defaultdict, Counter

print("RUNNING:", os.path.abspath(__file__))
print("PYTHON:", sys.version)

if sys.version_info >= (3, 13):
    print("WARNING: You are on Python >= 3.13. If Torch/sentence-transformers fails, use Python 3.10/3.11.")

# %% [1] Imports
import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer
from sklearn.neighbors import NearestNeighbors

# %% [2] Path helpers
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
RAW_DIR = os.path.join(REPO_ROOT, "raw")
DATA_DIR = os.path.join(REPO_ROOT, "data")


def first_existing_path(*candidates: str) -> str:
    for p in candidates:
        if os.path.exists(p):
            return p
    return candidates[0]


# Input datasets
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

# Output dirs
OUT_DATA_DIR = DATA_DIR
OUT_META_DIR = os.path.join(OUT_DATA_DIR, "meta")
OUT_QURAN_TEXT_DIR = os.path.join(OUT_DATA_DIR, "quran_text")
OUT_QURAN_PAIRS_DIR = os.path.join(OUT_DATA_DIR, "quran_pairs")
OUT_HADITH_TEXT_DIR = os.path.join(OUT_DATA_DIR, "hadith_text")
OUT_SEARCH_DIR = os.path.join(OUT_DATA_DIR, "search_index")

for d in [OUT_DATA_DIR, OUT_META_DIR, OUT_QURAN_TEXT_DIR, OUT_QURAN_PAIRS_DIR, OUT_HADITH_TEXT_DIR, OUT_SEARCH_DIR]:
    os.makedirs(d, exist_ok=True)

print("Resolved paths:")
print("  QURAN_AR_PATH  =", QURAN_AR_PATH)
print("  QURAN_EN_PATH  =", QURAN_EN_PATH)
print("  HADITH_PATH    =", HADITH_PATH)
print("  ROOT_WORDS_PATH=", ROOT_WORDS_PATH)
print("  OUT_DATA_DIR   =", OUT_DATA_DIR)

# %% [3] Config
HADITH_SHARD_SIZE = 1000

TOPK_QURAN_SEMANTIC = 20
TOPK_HADITH_SEMANTIC = 50
TOPK_QURAN_LEXICAL = 20
TOPK_HADITH_LEXICAL = 50

EMBED_MODEL_NAME = "intfloat/multilingual-e5-base"
EMBED_BATCH_SIZE = 256
VEC_PREVIEW_DIMS = 8

MAX_SHARED_TOKENS_STORED = 8

# %% [4] Basic helpers
def safe_str(x):
    return "" if pd.isna(x) else str(x)


def write_json(path: str, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


def surah_to_shard_name(surah: int) -> str:
    return f"{surah:03d}"


def require_file(path: str, label: str):
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"{label} file not found at: {path}\n"
            f"Please place it either in:\n"
            f"  {RAW_DIR}\n"
            f"or repo root:\n"
            f"  {REPO_ROOT}"
        )


# %% [5] Robust CSV reader
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


# %% [6] Arabic normalization + tokenization
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


def load_stopwords_ar(path_txt: str) -> set:
    sw = set()
    with open(path_txt, "r", encoding="utf-8") as f:
        for line in f:
            t = line.strip()
            if t and not t.startswith("#"):
                sw.add(normalize_ar(t))
    return sw


def tokenize_ar(text: str, stopwords: set) -> list:
    text = normalize_ar(text)
    toks = [t for t in text.split(" ") if t]
    out = []
    for t in toks:
        if t.isdigit():
            continue
        if len(t) < 2:
            continue
        if t in stopwords:
            continue
        out.append(t)
    return out


# %% [7] English normalization/tokenization
EN_PUNCT_RE = re.compile(r"[^a-z0-9\s]")
EN_MULTI_SPACE_RE = re.compile(r"\s+")


def normalize_en(text: str) -> str:
    text = safe_str(text).lower()
    text = EN_PUNCT_RE.sub(" ", text)
    text = EN_MULTI_SPACE_RE.sub(" ", text).strip()
    return text


def load_stopwords_en_default() -> set:
    return {
        "the","a","an","and","or","but","if","then","than","that","this","those","these",
        "is","are","was","were","be","been","being",
        "of","to","in","on","for","with","as","by","at","from","into","about","over","under",
        "he","she","it","they","them","his","her","its","their","you","your","we","our","us",
        "i","me","my","mine",
        "not","no","nor","so","too","very","can","could","may","might","shall","should","will","would"
    }


def tokenize_en(text: str, stopwords: set) -> list:
    text = normalize_en(text)
    toks = [t for t in text.split(" ") if t]
    out = []
    for t in toks:
        if t.isdigit():
            continue
        if len(t) < 2:
            continue
        if t in stopwords:
            continue
        out.append(t)
    return out


def trigrams(token: str):
    if len(token) <= 3:
        return {token}
    return {token[i:i+3] for i in range(len(token)-2)}


# %% [8] Column/header helpers
def normalize_header_name(s: str) -> str:
    s = safe_str(s).strip().lower()
    s = re.sub(r"[\s_\-]+", " ", s)
    return s


def find_required_column(df: pd.DataFrame, accepted_names: list[str], label: str) -> str:
    norm_to_actual = {normalize_header_name(c): c for c in df.columns}
    for name in accepted_names:
        key = normalize_header_name(name)
        if key in norm_to_actual:
            return norm_to_actual[key]
    raise ValueError(
        f"Required column for '{label}' not found.\n"
        f"Expected one of: {accepted_names}\n"
        f"Available columns: {list(df.columns)}"
    )


# %% [9] Root-word helpers
def load_root_words_map(path_csv: str) -> dict[str, set[str]]:
    rw = read_csv_robust(path_csv)

    root_col = find_required_column(
        rw,
        accepted_names=["Arabic Root Word"],
        label="Arabic Root Word"
    )
    chapter_col = find_required_column(
        rw,
        accepted_names=["ChapterNo", "Chapter No", "SurahNo", "Surah No"],
        label="ChapterNo"
    )
    verse_col = find_required_column(
        rw,
        accepted_names=["VerseNo", "Verse No", "AyahNo", "Ayah No"],
        label="VerseNo"
    )
    actual_word_col = find_required_column(
        rw,
        accepted_names=["Actual Arabic Word"],
        label="Actual Arabic Word"
    )

    rw = rw[[root_col, chapter_col, verse_col, actual_word_col]].copy()

    rw[chapter_col] = pd.to_numeric(rw[chapter_col], errors="coerce")
    rw[verse_col] = pd.to_numeric(rw[verse_col], errors="coerce")
    rw = rw.dropna(subset=[chapter_col, verse_col])

    rw[chapter_col] = rw[chapter_col].astype(int)
    rw[verse_col] = rw[verse_col].astype(int)

    rw[root_col] = rw[root_col].map(normalize_ar)
    rw[actual_word_col] = rw[actual_word_col].map(normalize_ar)
    rw = rw[rw[root_col].astype(str).str.len() > 0].copy()

    rw[root_col] = rw[root_col].map(lambda x: x.replace(" ", ""))

    ayah_to_roots = defaultdict(set)
    for _, row in rw.iterrows():
        ayah_id = f"{int(row[chapter_col])}:{int(row[verse_col])}"
        root = safe_str(row[root_col]).strip()
        if root:
            ayah_to_roots[ayah_id].add(root)

    print("Loaded root-word rows:", len(rw))
    print("Ayat with at least one root:", len(ayah_to_roots))
    return ayah_to_roots


# %% [10] Stopwords file
STOPWORDS_AR_TXT = os.path.join(OUT_SEARCH_DIR, "stopwords_ar.txt")

if not os.path.exists(STOPWORDS_AR_TXT):
    base_ar = [
        "و","في","على","من","إلى","عن","ما","ماذا","اذا","إن","أن","كان","كانت","يكون","تكون",
        "هذا","هذه","ذلك","تلك","هؤلاء","اولئك","هو","هي","هم","هن","نحن","انت","انتم","أنت",
        "لا","لم","لن","قد","ثم","او","أو","بل","كل","حتى","مع","بين","عند","إذ","اذ","الا","إلا",
        "أي","أى","اي","أين","اين","كيف","لماذا","لما","لأن","لان","إنما","إنه","انه","إنهم","انهم"
    ]
    base_ar_norm = sorted({normalize_ar(x) for x in base_ar if x.strip()})
    with open(STOPWORDS_AR_TXT, "w", encoding="utf-8") as f:
        f.write("# Arabic stopwords (normalized). Add more lines as needed.\n")
        for w in base_ar_norm:
            f.write(w + "\n")

stop_ar = load_stopwords_ar(STOPWORDS_AR_TXT)
stop_en = load_stopwords_en_default()

# %% [11] Load datasets
q_ar = read_csv_robust(QURAN_AR_PATH)
q_en = read_csv_robust(QURAN_EN_PATH)
h_df = read_csv_robust(HADITH_PATH)

# preserve original names first
q_ar_original_columns = list(q_ar.columns)
q_en_original_columns = list(q_en.columns)
h_original_columns = list(h_df.columns)

# normalize for matching
q_ar.columns = [c.strip().lower() for c in q_ar.columns]
q_en.columns = [c.strip().lower() for c in q_en.columns]
h_df.columns = [c.strip().lower() for c in h_df.columns]

# Quran Arabic
if "surah" not in q_ar.columns or "ayah" not in q_ar.columns:
    raise ValueError(f"quran.csv must contain surah and ayah. Found: {list(q_ar.columns)}")

quran_arabic_col = None
for c in ["arabic_text", "text", "arabic", "uthmani", "simple"]:
    if c in q_ar.columns:
        quran_arabic_col = c
        break

if quran_arabic_col is None:
    raise ValueError(
        f"quran.csv must contain one of these Arabic text columns: "
        f"['arabic_text','text','arabic','uthmani','simple'].\n"
        f"Found: {list(q_ar.columns)}"
    )

q_ar["surah"] = pd.to_numeric(q_ar["surah"], errors="raise").astype(int)
q_ar["ayah"] = pd.to_numeric(q_ar["ayah"], errors="raise").astype(int)
q_ar["ayah_id"] = q_ar["surah"].astype(str) + ":" + q_ar["ayah"].astype(str)
q_ar["arabic_text"] = q_ar[quran_arabic_col].astype(str)

# Quran English
if "surah" not in q_en.columns or "ayat" not in q_en.columns:
    raise ValueError(f"Quran_English.csv must contain surah and ayat. Found: {list(q_en.columns)}")

english_text_col = None
for c in ["english_text", "translation", "text", "english"]:
    if c in q_en.columns:
        english_text_col = c
        break

if english_text_col is None:
    raise ValueError(
        f"Could not find English translation column in Quran_English.csv. "
        f"Found: {list(q_en.columns)}"
    )

q_en["surah"] = pd.to_numeric(q_en["surah"], errors="raise").astype(int)
q_en["ayat"] = pd.to_numeric(q_en["ayat"], errors="raise").astype(int)
q_en["ayah_id"] = q_en["surah"].astype(str) + ":" + q_en["ayat"].astype(str)
q_en["english_text"] = q_en[english_text_col].astype(str)

# Join validation
set_ar = set(q_ar["ayah_id"].tolist())
set_en = set(q_en["ayah_id"].tolist())
if set_ar != set_en:
    missing_en = sorted(list(set_ar - set_en))[:10]
    missing_ar = sorted(list(set_en - set_ar))[:10]
    raise ValueError(
        "English/Arabic join mismatch detected.\n"
        f"Arabic IDs missing in English (sample): {missing_en}\n"
        f"English IDs missing in Arabic (sample): {missing_ar}\n"
    )

q = q_ar[["ayah_id", "surah", "ayah", "arabic_text"]].merge(
    q_en[["ayah_id", "english_text"]],
    on="ayah_id",
    how="left"
)

# Hadith
hadith_ar_col = None
for c in ["arabic text", "arabic_text", "arabic", "text_ar"]:
    if c in h_df.columns:
        hadith_ar_col = c
        break

if hadith_ar_col is None:
    raise ValueError(
        f"Hadith Arabic text column not found. "
        f"Expected one of ['arabic text','arabic_text','arabic','text_ar'].\n"
        f"Found: {list(h_df.columns)}"
    )

hadith_en_col = None
for c in ["english text", "english_text", "english", "translation", "text_en"]:
    if c in h_df.columns:
        hadith_en_col = c
        break

if hadith_en_col is None:
    print("WARNING: Hadith English column not found. Hadith translation will be blank in UI.")

h_df["serial"] = np.arange(1, len(h_df) + 1, dtype=np.int32)
h_df["book"] = h_df["book"].astype(str) if "book" in h_df.columns else "Unknown"
h_df["reference"] = h_df["reference"].astype(str) if "reference" in h_df.columns else ""
h_df["english_text"] = h_df[hadith_en_col].astype(str) if hadith_en_col else ""
h_df["hadith_id"] = h_df["book"].astype(str) + "|" + h_df["reference"].astype(str) + "|" + h_df["serial"].astype(str)

h_keep = h_df[["hadith_id", "serial", "book", "reference", hadith_ar_col, "english_text"]].copy()
h_keep.rename(columns={hadith_ar_col: "arabic_text"}, inplace=True)

print("Loaded Quran:", len(q), "| Hadith:", len(h_keep))

# %% [12] Tokenize Quran + Hadith
q["arabic_norm"] = q["arabic_text"].map(normalize_ar)
q["arabic_tokens"] = q["arabic_text"].map(lambda t: tokenize_ar(t, stop_ar))
q["tok_set"] = q["arabic_tokens"].map(set)
q["tok_len"] = q["tok_set"].map(len)

h_keep["arabic_norm"] = h_keep["arabic_text"].map(normalize_ar)
h_keep["arabic_tokens"] = h_keep["arabic_text"].map(lambda t: tokenize_ar(t, stop_ar))
h_keep["tok_set"] = h_keep["arabic_tokens"].map(set)
h_keep["tok_len"] = h_keep["tok_set"].map(len)

print("Avg Quran token count:", float(q["tok_len"].mean()))
print("Avg Hadith token count:", float(h_keep["tok_len"].mean()))

# %% [13] Root sets for Quran-Quran lexical pairs
ayah_to_rootset = load_root_words_map(ROOT_WORDS_PATH)
q["root_set"] = q["ayah_id"].map(lambda aid: ayah_to_rootset.get(aid, set()))
q["root_len"] = q["root_set"].map(len)

missing_root_ayat = int((q["root_len"] == 0).sum())
print("Avg Quran root count:", float(q["root_len"].mean()))
print("Quran ayat with ZERO roots in root file:", missing_root_ayat)

# %% [14] Search indexes
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

# %% [15] Embeddings
model = SentenceTransformer(EMBED_MODEL_NAME)

def embed_passages(texts: list[str]) -> np.ndarray:
    texts = [f"passage: {t}" for t in texts]
    emb = model.encode(
        texts,
        batch_size=EMBED_BATCH_SIZE,
        show_progress_bar=True,
        normalize_embeddings=True
    )
    return np.asarray(emb, dtype=np.float32)

q_emb = embed_passages(q["arabic_norm"].tolist())
h_emb = embed_passages(h_keep["arabic_norm"].tolist())

print("Embeddings shapes:", q_emb.shape, h_emb.shape)

# %% [16] Semantic nearest neighbors
q_ids = q["ayah_id"].tolist()
h_ids = h_keep["hadith_id"].tolist()

nn_q = NearestNeighbors(
    n_neighbors=TOPK_QURAN_SEMANTIC + 1,
    metric="cosine",
    algorithm="brute"
)
nn_q.fit(q_emb)
dist_qq, ind_qq = nn_q.kneighbors(q_emb, return_distance=True)

nn_h = NearestNeighbors(
    n_neighbors=TOPK_HADITH_SEMANTIC,
    metric="cosine",
    algorithm="brute"
)
nn_h.fit(h_emb)
dist_qh, ind_qh = nn_h.kneighbors(q_emb, return_distance=True)

semantic_pairs_quran = {}
semantic_pairs_hadith = {}

for i, ayah_id in enumerate(q_ids):
    sims = []
    for d, j in zip(dist_qq[i].tolist(), ind_qq[i].tolist()):
        if j == i:
            continue
        sims.append({"id": q_ids[j], "score": float(1.0 - d)})
        if len(sims) == TOPK_QURAN_SEMANTIC:
            break
    semantic_pairs_quran[ayah_id] = sims

    hsims = [{"id": h_ids[j], "score": float(1.0 - d)} for d, j in zip(dist_qh[i].tolist(), ind_qh[i].tolist())]
    semantic_pairs_hadith[ayah_id] = hsims

print("Semantic pairing done.")

# %% [17] Lexical similarity
post_q_roots = defaultdict(list)
for idx, rset in enumerate(q["root_set"]):
    for r in rset:
        post_q_roots[r].append(idx)

post_h = defaultdict(list)
for idx, tset in enumerate(h_keep["tok_set"]):
    for t in tset:
        post_h[t].append(idx)

q_root_lens = q["root_len"].to_numpy()
h_tok_lens = h_keep["tok_len"].to_numpy()

def topk_jaccard_generic(
    base_set: set,
    base_index: int,
    postings: dict,
    other_lens: np.ndarray,
    other_ids: list,
    topk: int,
    other_set_getter,
    skip_self: bool
):
    base_len = int(len(base_set))
    if base_len == 0:
        return []

    counts = Counter()
    for term in base_set:
        for j in postings.get(term, []):
            if skip_self and j == base_index:
                continue
            counts[j] += 1

    scored = []
    for j, inter in counts.items():
        union = base_len + int(other_lens[j]) - int(inter)
        if union <= 0:
            continue
        score = inter / union
        scored.append((score, j, inter))

    scored.sort(reverse=True, key=lambda x: (x[0], x[2], other_ids[x[1]]))
    scored = scored[:topk]

    out = []
    for score, j, inter in scored:
        other_set = other_set_getter(j)
        shared = sorted(list(base_set.intersection(other_set)))[:MAX_SHARED_TOKENS_STORED]
        out.append({
            "id": other_ids[j],
            "score": float(score),
            "shared_tokens": shared,
            "intersection": int(inter)
        })
    return out

lex_pairs_quran = {}
lex_pairs_hadith = {}

for i, ayah_id in enumerate(q_ids):
    # Quran-Quran lexical now uses ROOT overlap
    lex_pairs_quran[ayah_id] = topk_jaccard_generic(
        base_set=q.at[i, "root_set"],
        base_index=i,
        postings=post_q_roots,
        other_lens=q_root_lens,
        other_ids=q_ids,
        topk=TOPK_QURAN_LEXICAL,
        other_set_getter=lambda j: q.at[j, "root_set"],
        skip_self=True
    )

    # Quran-Hadith lexical remains token-based
    lex_pairs_hadith[ayah_id] = topk_jaccard_generic(
        base_set=q.at[i, "tok_set"],
        base_index=i,
        postings=post_h,
        other_lens=h_tok_lens,
        other_ids=h_ids,
        topk=TOPK_HADITH_LEXICAL,
        other_set_getter=lambda j: h_keep.at[j, "tok_set"],
        skip_self=False
    )

print("Lexical pairing done.")
print("Quran-Quran lexical uses ROOT overlap.")
print("Quran-Hadith lexical uses TOKEN overlap.")

# %% [18] Quran text shards
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
            "vec_preview": row["vec_preview"]
        })
    fn = f"quran_s{surah_to_shard_name(s)}.json"
    shard_map_quran[str(s)] = f"quran_text/{fn}"
    write_json(os.path.join(OUT_QURAN_TEXT_DIR, fn), recs)

write_json(os.path.join(OUT_META_DIR, "shard_map_quran.json"), shard_map_quran)
print("Wrote Quran text shards:", len(shard_map_quran))

# %% [19] Hadith text shards
h_sorted = h_keep.sort_values("serial").reset_index(drop=True)

shard_map_hadith = []
n = len(h_sorted)

for start in range(0, n, HADITH_SHARD_SIZE):
    end = min(n, start + HADITH_SHARD_SIZE)
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
            "english": safe_str(row["english_text"])
        })

    write_json(os.path.join(OUT_HADITH_TEXT_DIR, fn), out)
    shard_map_hadith.append({
        "start": serial_start,
        "end": serial_end,
        "file": f"hadith_text/{fn}"
    })

write_json(os.path.join(OUT_META_DIR, "shard_map_hadith.json"), shard_map_hadith)
print("Wrote Hadith shards:", len(shard_map_hadith))

# %% [20] Pair shards
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
                "hadith_top50": semantic_pairs_hadith[ayah_id]
            },
            "lexical": {
                "quran_top20": lex_pairs_quran[ayah_id],
                "hadith_top50": lex_pairs_hadith[ayah_id]
            }
        })

    fn = f"pairs_s{surah_to_shard_name(s)}.json"
    shard_map_pairs[str(s)] = f"quran_pairs/{fn}"
    write_json(os.path.join(OUT_QURAN_PAIRS_DIR, fn), out)

write_json(os.path.join(OUT_META_DIR, "shard_map_pairs.json"), shard_map_pairs)
print("Wrote pair shards:", len(shard_map_pairs))

# %% [21] Manifest
manifest = {
    "version": 1,
    "counts": {
        "quran_ayat": int(len(q)),
        "hadith": int(len(h_sorted)),
        "english_vocab": int(len(english_token_to_ayah)),
        "arabic_vocab": int(len(arabic_token_to_ayah))
    },
    "paths": {
        "shard_map_quran": "data/meta/shard_map_quran.json",
        "shard_map_pairs": "data/meta/shard_map_pairs.json",
        "shard_map_hadith": "data/meta/shard_map_hadith.json",
        "english_token_to_ayahids": "data/search_index/english_token_to_ayahids.json",
        "english_trigram_to_tokens": "data/search_index/english_trigram_to_tokens.json",
        "arabic_token_to_ayahids": "data/search_index/arabic_token_to_ayahids.json"
    }
}

write_json(os.path.join(OUT_META_DIR, "manifest.json"), manifest)
print("DONE ✅ Manifest written:", os.path.join(OUT_META_DIR, "manifest.json"))