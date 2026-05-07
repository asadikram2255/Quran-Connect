import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import pandas as pd

q = pd.read_csv('raw/quran.csv', encoding='utf-8')
q_surah = [c for c in q.columns if c.lower() in ['surah','chapter']][0]
q_ayah  = [c for c in q.columns if c.lower() in ['ayah','verse','ayat']][0]
q_text  = [c for c in q.columns if c.lower() in ['arabic_text','arabic','uthmani','text']][0]
q['ayah_id'] = q[q_surah].astype(str) + ':' + q[q_ayah].astype(str)
q['word_count'] = q[q_text].astype(str).str.split().str.len()
all_ayat = set(q['ayah_id'])
total_words = int(q['word_count'].sum())
MUQATTAAT = {'2:1','3:1','7:1','19:1','20:1','26:1','28:1','29:1','30:1','31:1',
             '32:1','36:1','40:1','41:1','42:1','42:2','43:1','44:1','45:1','46:1'}
TARGET_MISSING = {'44:34','70:15','81:26','93:1'}

print(f'Quran: {len(all_ayat)} ayahs, {total_words} total word-tokens, avg {q["word_count"].mean():.2f} words/ayah')
print()

def report(label, df, root_col, chapter_col, verse_col, actual_col):
    df = df.copy()
    df[chapter_col] = pd.to_numeric(df[chapter_col], errors='coerce')
    df[verse_col]   = pd.to_numeric(df[verse_col],   errors='coerce')
    df = df.dropna(subset=[chapter_col, verse_col])
    df['ayah_id'] = df[chapter_col].astype(int).astype(str) + ':' + df[verse_col].astype(int).astype(str)
    covered = set(df['ayah_id'])
    missing_all = sorted(all_ayat - covered, key=lambda x: (int(x.split(':')[0]), int(x.split(':')[1])))
    real_missing = [a for a in missing_all if a not in MUQATTAAT]
    target_fixed = [a for a in TARGET_MISSING if a in covered]
    words_per_ayah = df.groupby('ayah_id')[actual_col].count()
    merged = q[['ayah_id','word_count']].merge(
        words_per_ayah.reset_index().rename(columns={actual_col:'csv_words'}),
        on='ayah_id', how='left'
    ).fillna(0)
    spaced = df[root_col].astype(str).str.contains(' ', na=False).sum()
    unique_roots = df[root_col].astype(str).str.strip().nunique()
    total_entries = int(merged['csv_words'].sum())
    coverage_pct = 100 * total_entries / total_words
    dups = df.groupby(['ayah_id', root_col]).size()
    dup_combos = int((dups > 1).sum())

    print(f'=== {label} ===')
    print(f'  Total rows:           {len(df)}')
    print(f'  Ayahs covered:        {len(covered)}/{len(all_ayat)} ({100*len(covered)/len(all_ayat):.1f}%)')
    print(f'  Non-muqattaat missing:{real_missing}')
    print(f'  Target ayahs fixed:   {target_fixed} / {sorted(TARGET_MISSING)}')
    print(f'  Unique roots:         {unique_roots}')
    print(f'  Spaced (ف ع ل) fmt:   {spaced}/{len(df)} ({100*spaced/max(1,len(df)):.1f}%)')
    print(f'  Dup root+ayah combos: {dup_combos}')
    print(f'  Total entries:        {total_entries} / {total_words} words ({coverage_pct:.1f}%)')
    print(f'  Avg entries/ayah:     {merged["csv_words"].mean():.2f}')
    if 'GrammarFormDesc' in df.columns:
        print(f'  Has grammar info:     YES - {dict(df["GrammarFormDesc"].value_counts().head(5))}')
    if 'MeaningEn' in df.columns:
        print(f'  Has English meaning:  YES')
    print()

# Current
cur = pd.read_csv('raw/Root Words.csv', encoding='utf-8')
report('CURRENT (raw/Root Words.csv)', cur, 'Arabic Root Word', 'ChapterNo', 'VerseNo', 'Actual Arabic Word')

# File 1
f1 = pd.read_csv('Sample Roots/1. Root Words.csv', encoding='utf-8')
print('=== FILE 1 (1. Root Words.csv) ===')
print(f'  Rows: {len(f1)}, Columns: {list(f1.columns)}')
print(f'  WARNING: First row RootAr={repr(str(f1["RootAr"].iloc[0]))} — looks like header row is offset/corrupted')
valid1 = f1.dropna(subset=['ChapterNo','VerseNo']).copy()
valid1['ChapterNo'] = pd.to_numeric(valid1['ChapterNo'], errors='coerce')
valid1['VerseNo']   = pd.to_numeric(valid1['VerseNo'],   errors='coerce')
valid1 = valid1.dropna(subset=['ChapterNo','VerseNo'])
print(f'  Rows with valid ChapterNo+VerseNo: {len(valid1)}')
print(f'  Sample RootAr: {list(f1["RootAr"].dropna().head(3))}')
print()

# File 2
f2 = pd.read_csv('Sample Roots/2. Root Words.csv', encoding='utf-8')
report('FILE 2 (2. Root Words.csv)', f2, 'RootAr', 'ChapterNo', 'VerseNo', 'WordAr')

# File 3
f3 = pd.read_csv('Sample Roots/3. Root Words.csv', encoding='utf-8')
report('FILE 3 (3. Root Words.csv)', f3, 'RootAr', 'ChapterNo', 'VerseNo', 'WordAr')

# File 4 (xlsx)
f4 = pd.read_excel('Sample Roots/4. Root Words.xlsx')
f4 = f4.dropna(subset=['ID','Root_Letters']).copy()
f4['ID'] = f4['ID'].astype(str).str.strip()
f4 = f4[f4['ID'].str.match(r'^\d+:\d+$')]
f4_work = f4.rename(columns={'ID':'ayah_id_pre','ARABIC':'WordAr','Root_Letters':'RootAr'})
f4_work['ChapterNo'] = f4_work['ayah_id_pre'].str.split(':').str[0]
f4_work['VerseNo']   = f4_work['ayah_id_pre'].str.split(':').str[1]
report('FILE 4 (4. Root Words.xlsx)', f4_work, 'RootAr', 'ChapterNo', 'VerseNo', 'WordAr')
