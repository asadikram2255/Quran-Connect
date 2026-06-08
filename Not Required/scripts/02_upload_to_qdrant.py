"""
Upload Quran verses to Qdrant Cloud with NAMED VECTORS for two-stage retrieval.

Each verse stores two embeddings:
  - "ar_lemma": embedding of lemmatized Arabic text (used when user queries in Arabic)
  - "en":       embedding of normalized English translation (used when user queries in English)

Payload includes: ayah_id, surah, ayah, arabic_text, english_text, ar_lemmas, ar_tokens, roots.
Roots come from Root Words.csv (same source 01_build_pairs.py uses).

The Vercel API will embed the user query with the same model and search the matching
named vector based on detected query language.
"""

import os
import sys
import pandas as pd
from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient
from qdrant_client.models import VectorParams, Distance, PointStruct
from dotenv import load_dotenv

from utils import (
    first_existing_path,
    safe_str,
    read_csv_robust,
    find_required_column,
    find_optional_column,
    load_stopwords_ar,
    load_stopwords_en_default,
    normalize_ar,
    normalize_en,
    tokenize_ar,
    build_semantic_text,
    load_root_words_maps,
    HAS_QALSADI,
)

load_dotenv()
print("RUNNING:", os.path.abspath(__file__))
print("Arabic lemmatizer (qalsadi) enabled:", HAS_QALSADI)

# ---------- Paths ----------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
RAW_DIR = os.path.join(REPO_ROOT, "raw")
DATA_DIR = os.path.join(REPO_ROOT, "data")
SEARCH_DIR = os.path.join(DATA_DIR, "search_index")

QURAN_AR_PATH = first_existing_path(
    os.path.join(RAW_DIR, "quran.csv"),
    os.path.join(REPO_ROOT, "quran.csv"),
)
QURAN_EN_PATH = first_existing_path(
    os.path.join(RAW_DIR, "Quran_English.csv"),
    os.path.join(REPO_ROOT, "Quran_English.csv"),
)
ROOT_WORDS_PATH = first_existing_path(
    os.path.join(RAW_DIR, "Root Words.csv"),
    os.path.join(REPO_ROOT, "Root Words.csv"),
)
STOPWORDS_AR_TXT = os.path.join(SEARCH_DIR, "stopwords_ar.txt")

# ---------- Config ----------
QDRANT_URL = os.getenv("QDRANT_URL")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")
if not QDRANT_URL or not QDRANT_API_KEY:
    print("ERROR: Set QDRANT_URL and QDRANT_API_KEY in .env")
    sys.exit(1)

COLLECTION_NAME = os.getenv("QDRANT_COLLECTION", "quran_verses")
# BAAI/bge-m3 — 1024-dim multilingual; strong on English+Arabic+crosslingual; works on HF serverless.
EMBED_MODEL_NAME = os.getenv("EMBED_MODEL_NAME", "BAAI/bge-m3")
EMBED_BATCH_SIZE = int(os.getenv("EMBED_BATCH_SIZE", "8"))
UPSERT_BATCH_SIZE = 256

# ---------- Stopwords ----------
if not os.path.exists(STOPWORDS_AR_TXT):
    print(f"ERROR: Missing {STOPWORDS_AR_TXT}. Run 01_build_pairs.py first to generate it.")
    sys.exit(1)
stop_ar = load_stopwords_ar(STOPWORDS_AR_TXT)

# ---------- Load Quran ----------
print("Loading Quran CSVs...")
q_ar = read_csv_robust(QURAN_AR_PATH)
q_en = read_csv_robust(QURAN_EN_PATH)

ar_surah = find_required_column(q_ar, ["surah", "Surah"], "surah")
ar_ayah  = find_required_column(q_ar, ["ayah", "Ayah", "ayat", "Ayat"], "ayah")
ar_text_col = find_optional_column(q_ar, ["arabic_text", "arabic", "uthmani", "simple", "text", "Text"])
if not ar_text_col:
    raise ValueError(f"Arabic text column not found in {QURAN_AR_PATH}. Columns: {list(q_ar.columns)}")

en_surah = find_required_column(q_en, ["surah", "Surah"], "surah")
en_ayah  = find_required_column(q_en, ["ayah", "Ayah", "ayat", "Ayat"], "ayah")
en_text_col = find_optional_column(q_en, ["english_text", "translation", "text", "english", "English Text", "Text"])
if not en_text_col:
    raise ValueError(f"English text column not found in {QURAN_EN_PATH}. Columns: {list(q_en.columns)}")

q_ar["surah"] = pd.to_numeric(q_ar[ar_surah], errors="raise").astype(int)
q_ar["ayah"]  = pd.to_numeric(q_ar[ar_ayah],  errors="raise").astype(int)
q_ar["ayah_id"] = q_ar["surah"].astype(str) + ":" + q_ar["ayah"].astype(str)
q_ar["arabic_text"] = q_ar[ar_text_col].astype(str)

q_en["surah"] = pd.to_numeric(q_en[en_surah], errors="raise").astype(int)
q_en["ayah"]  = pd.to_numeric(q_en[en_ayah],  errors="raise").astype(int)
q_en["ayah_id"] = q_en["surah"].astype(str) + ":" + q_en["ayah"].astype(str)
q_en["english_text"] = q_en[en_text_col].astype(str)

q = q_ar[["ayah_id", "surah", "ayah", "arabic_text"]].merge(
    q_en[["ayah_id", "english_text"]], on="ayah_id", how="left"
)
q["arabic_text"]  = q["arabic_text"].fillna("")
q["english_text"] = q["english_text"].fillna("")
print(f"Loaded {len(q)} ayat.")

# ---------- Root words ----------
print("Loading root words...")
ayah_to_rootset, _ = load_root_words_maps(ROOT_WORDS_PATH)
q["roots"] = q["ayah_id"].map(lambda aid: sorted(ayah_to_rootset.get(aid, set())))

# ---------- Lemmas / tokens ----------
print("Lemmatizing Arabic text (this is the slow step)...")
lemma_rows = [build_semantic_text(t, stop_ar) for t in q["arabic_text"].tolist()]
q["ar_lemma_text"] = [row[0] for row in lemma_rows]
q["ar_lemmas"]     = [row[1] for row in lemma_rows]
q["ar_tokens"]     = q["arabic_text"].map(lambda t: tokenize_ar(t, stop_ar))
q["en_norm"]       = q["english_text"].map(normalize_en)

# ---------- Embed ----------
print(f"Loading embedding model: {EMBED_MODEL_NAME}")
try:
    model = SentenceTransformer(EMBED_MODEL_NAME, trust_remote_code=True)
except TypeError:
    model = SentenceTransformer(EMBED_MODEL_NAME)

vector_size = model.get_sentence_embedding_dimension()
print(f"Vector dimension: {vector_size}")

def embed(texts):
    return model.encode(
        texts,
        batch_size=EMBED_BATCH_SIZE,
        show_progress_bar=True,
        normalize_embeddings=True,
    )

print("Embedding lemmatized Arabic...")
ar_emb = embed(q["ar_lemma_text"].tolist())
print("Embedding English translations...")
en_emb = embed(q["en_norm"].tolist())

# ---------- Qdrant collection ----------
print(f"Connecting to Qdrant at {QDRANT_URL}...")
client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)

if client.collection_exists(COLLECTION_NAME):
    print(f"Collection '{COLLECTION_NAME}' exists. Recreating...")
    client.delete_collection(COLLECTION_NAME)

client.create_collection(
    collection_name=COLLECTION_NAME,
    vectors_config={
        "ar_lemma": VectorParams(size=vector_size, distance=Distance.COSINE),
        "en":       VectorParams(size=vector_size, distance=Distance.COSINE),
    },
)
print("Created collection with named vectors: ar_lemma, en")

# ---------- Upload ----------
print("Building points...")
points = []
for idx, row in q.iterrows():
    points.append(PointStruct(
        id=int(idx) + 1,
        vector={
            "ar_lemma": ar_emb[idx].tolist(),
            "en":       en_emb[idx].tolist(),
        },
        payload={
            "ayah_id":      row["ayah_id"],
            "surah":        int(row["surah"]),
            "ayah":         int(row["ayah"]),
            "arabic_text":  safe_str(row["arabic_text"]),
            "english_text": safe_str(row["english_text"]),
            "ar_lemmas":    list(row["ar_lemmas"]),
            "ar_tokens":    list(row["ar_tokens"]),
            "roots":        list(row["roots"]),
        },
    ))

print(f"Uploading {len(points)} points in batches of {UPSERT_BATCH_SIZE}...")
for i in range(0, len(points), UPSERT_BATCH_SIZE):
    batch = points[i:i + UPSERT_BATCH_SIZE]
    client.upsert(collection_name=COLLECTION_NAME, points=batch, wait=False)
    print(f"  {min(i + UPSERT_BATCH_SIZE, len(points))}/{len(points)}")

print("Done. All verses uploaded to Qdrant with named vectors.")
