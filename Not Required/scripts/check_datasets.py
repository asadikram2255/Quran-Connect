import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import pandas as pd, re
from collections import Counter

EXPECTED_AYAT = 6236
EXPECTED_SURAHS = 114
SURAH_SIZES = {
    1:7,2:286,3:200,4:176,5:120,6:165,7:206,8:75,9:129,10:109,
    11:123,12:111,13:43,14:52,15:99,16:128,17:111,18:110,19:98,20:135,
    21:112,22:78,23:118,24:64,25:77,26:227,27:93,28:88,29:69,30:60,
    31:34,32:30,33:73,34:54,35:45,36:83,37:182,38:88,39:75,40:85,
    41:54,42:53,43:89,44:59,45:37,46:35,47:38,48:29,49:18,50:45,
    51:60,52:49,53:62,54:55,55:78,56:96,57:29,58:22,59:24,60:13,
    61:14,62:11,63:11,64:18,65:12,66:12,67:30,68:52,69:52,70:44,
    71:28,72:28,73:20,74:56,75:40,76:31,77:50,78:40,79:46,80:42,
    81:29,82:19,83:36,84:25,85:22,86:17,87:19,88:26,89:30,90:20,
    91:15,92:21,93:11,94:8,95:8,96:19,97:5,98:8,99:8,100:11,
    101:11,102:8,103:3,104:9,105:5,106:4,107:7,108:3,109:6,110:3,
    111:5,112:4,113:5,114:6
}

print("=" * 60)
print("DATASET 1: raw/quran.csv (Arabic Quran)")
print("=" * 60)
try:
    df = pd.read_csv('raw/quran.csv', encoding='utf-8')
    print(f"Rows: {len(df)}, Columns: {list(df.columns)}")

    surah_col = [c for c in df.columns if c.lower() in ['surah','chapter']][0]
    ayah_col  = [c for c in df.columns if c.lower() in ['ayah','verse','ayat']][0]
    text_col  = [c for c in df.columns if c.lower() in ['arabic_text','arabic','uthmani','text']][0]

    df['surah'] = pd.to_numeric(df[surah_col], errors='coerce')
    df['ayah']  = pd.to_numeric(df[ayah_col],  errors='coerce')
    df = df.dropna(subset=['surah','ayah'])
    df['surah'] = df['surah'].astype(int)
    df['ayah']  = df['ayah'].astype(int)
    df['ayah_id'] = df['surah'].astype(str) + ':' + df['ayah'].astype(str)

    print(f"Valid rows after parsing: {len(df)}")
    print(f"Unique surahs: {df['surah'].nunique()} (expected {EXPECTED_SURAHS})")
    print(f"Unique ayahs: {df['ayah_id'].nunique()} (expected {EXPECTED_AYAT})")

    # Duplicates
    dups = df[df['ayah_id'].duplicated(keep=False)]
    print(f"Duplicate ayah_ids: {len(dups)}")
    if len(dups):
        print(f"  Sample: {list(dups['ayah_id'].head(5))}")

    # Per-surah count check
    wrong_size = []
    for s, expected in SURAH_SIZES.items():
        actual = len(df[df['surah'] == s])
        if actual != expected:
            wrong_size.append((s, expected, actual))
    if wrong_size:
        print(f"Surahs with wrong ayah count: {len(wrong_size)}")
        for s, exp, act in wrong_size[:10]:
            print(f"  Surah {s}: expected {exp}, got {act}")
    else:
        print("All 114 surahs have correct ayah counts ✓")

    # Empty text
    empty = df[df[text_col].isna() | (df[text_col].astype(str).str.strip() == '')]
    print(f"Ayahs with empty Arabic text: {len(empty)}")

    # Non-Arabic content check (should be mostly Arabic unicode range)
    non_arabic = df[~df[text_col].astype(str).str.contains(r'[؀-ۿ]', regex=True)]
    print(f"Ayahs with no Arabic characters: {len(non_arabic)}")

    print(f"Sample row: surah={df['surah'].iloc[0]}, ayah={df['ayah'].iloc[0]}, text={str(df[text_col].iloc[0])[:50]}")

except Exception as e:
    print(f"ERROR: {e}")

print()
print("=" * 60)
print("DATASET 2: raw/Quran_English.csv (English Translation)")
print("=" * 60)
try:
    df_en = pd.read_csv('raw/Quran_English.csv', encoding='utf-8')
    print(f"Rows: {len(df_en)}, Columns: {list(df_en.columns)}")

    surah_col = [c for c in df_en.columns if c.lower() in ['surah','chapter']][0]
    ayah_col  = [c for c in df_en.columns if c.lower() in ['ayah','verse','ayat']][0]
    text_col  = [c for c in df_en.columns if c.lower() in ['english_text','translation','text','english']][0]

    df_en['surah'] = pd.to_numeric(df_en[surah_col], errors='coerce')
    df_en['ayah']  = pd.to_numeric(df_en[ayah_col],  errors='coerce')
    df_en = df_en.dropna(subset=['surah','ayah'])
    df_en['surah'] = df_en['surah'].astype(int)
    df_en['ayah']  = df_en['ayah'].astype(int)
    df_en['ayah_id'] = df_en['surah'].astype(str) + ':' + df_en['ayah'].astype(str)

    print(f"Valid rows: {len(df_en)}")
    print(f"Unique ayahs: {df_en['ayah_id'].nunique()} (expected {EXPECTED_AYAT})")

    dups = df_en[df_en['ayah_id'].duplicated(keep=False)]
    print(f"Duplicate ayah_ids: {len(dups)}")

    wrong_size = []
    for s, expected in SURAH_SIZES.items():
        actual = len(df_en[df_en['surah'] == s])
        if actual != expected:
            wrong_size.append((s, expected, actual))
    if wrong_size:
        print(f"Surahs with wrong ayah count: {len(wrong_size)}")
        for s, exp, act in wrong_size[:10]:
            print(f"  Surah {s}: expected {exp}, got {act}")
    else:
        print("All 114 surahs have correct ayah counts ✓")

    empty = df_en[df_en[text_col].isna() | (df_en[text_col].astype(str).str.strip() == '')]
    print(f"Ayahs with empty English text: {len(empty)}")
    if len(empty):
        print(f"  Sample missing: {list(empty['ayah_id'].head(5))}")

    very_short = df_en[df_en[text_col].astype(str).str.len() < 5]
    print(f"Ayahs with suspiciously short translation (<5 chars): {len(very_short)}")

    # Check for placeholder or repeated text
    counts = Counter(df_en[text_col].astype(str).str.strip().tolist())
    repeated = [(t, c) for t, c in counts.most_common(10) if c > 3]
    if repeated:
        print(f"Suspiciously repeated translations:")
        for t, c in repeated[:5]:
            print(f"  '{t[:60]}' appears {c} times")

    print(f"Avg translation length: {df_en[text_col].astype(str).str.len().mean():.0f} chars")
    print(f"Sample: surah={df_en['surah'].iloc[0]}, ayah={df_en['ayah'].iloc[0]}, text={str(df_en[text_col].iloc[0])[:60]}")

except Exception as e:
    print(f"ERROR: {e}")

print()
print("=" * 60)
print("DATASET 3: raw/All_Hadith_Clean.csv (Hadith)")
print("=" * 60)
try:
    df_h = pd.read_csv('raw/All_Hadith_Clean.csv', encoding='utf-8')
    print(f"Rows: {len(df_h)}, Columns: {list(df_h.columns)}")

    ar_col   = [c for c in df_h.columns if 'arabic' in c.lower()][0]
    en_col   = [c for c in df_h.columns if 'english' in c.lower() or 'translation' in c.lower()][0] if any('english' in c.lower() or 'translation' in c.lower() for c in df_h.columns) else None
    book_col = [c for c in df_h.columns if 'book' in c.lower()][0] if any('book' in c.lower() for c in df_h.columns) else None
    ref_col  = [c for c in df_h.columns if 'ref' in c.lower()][0] if any('ref' in c.lower() for c in df_h.columns) else None

    print(f"Arabic col: {ar_col}, English col: {en_col}, Book col: {book_col}, Ref col: {ref_col}")

    # Empty Arabic
    empty_ar = df_h[df_h[ar_col].isna() | (df_h[ar_col].astype(str).str.strip() == '')]
    print(f"Hadiths with empty Arabic text: {len(empty_ar)} ({100*len(empty_ar)/len(df_h):.1f}%)")

    # Empty English
    if en_col:
        empty_en = df_h[df_h[en_col].isna() | (df_h[en_col].astype(str).str.strip().isin(['','nan']))]
        print(f"Hadiths with empty English text: {len(empty_en)} ({100*len(empty_en)/len(df_h):.1f}%)")

    # Books breakdown
    if book_col:
        book_counts = df_h[book_col].value_counts()
        print(f"Books ({len(book_counts)} unique):")
        for book, count in book_counts.head(10).items():
            print(f"  {str(book)[:50]}: {count}")

    # Non-Arabic in Arabic column
    non_arabic_h = df_h[~df_h[ar_col].astype(str).str.contains(r'[؀-ۿ]', regex=True, na=False)]
    print(f"Hadiths with no Arabic characters in Arabic column: {len(non_arabic_h)}")
    if len(non_arabic_h):
        print(f"  Sample: {list(non_arabic_h[ar_col].head(3))}")

    # Very short hadiths
    short_ar = df_h[df_h[ar_col].astype(str).str.len() < 10]
    print(f"Hadiths with Arabic text < 10 chars: {len(short_ar)}")

    # Duplicate detection
    dup_ar = df_h[df_h[ar_col].astype(str).duplicated(keep=False)]
    print(f"Exact duplicate Arabic texts: {len(dup_ar)} ({100*len(dup_ar)/len(df_h):.1f}%)")

    print(f"Avg Arabic length: {df_h[ar_col].astype(str).str.len().mean():.0f} chars")
    if en_col:
        print(f"Avg English length: {df_h[en_col].astype(str).str.len().mean():.0f} chars")

    print(f"Sample hadith Arabic: {str(df_h[ar_col].iloc[0])[:80]}")

except Exception as e:
    print(f"ERROR: {e}")
