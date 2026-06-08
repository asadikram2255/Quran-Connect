#!/usr/bin/env python3
"""
Build compact hadith search index for Quran Connect search module.
Output: search/data/hadith_index.json

Format:
{
  "books": ["Bukhari", "Muslim", ...],
  "data": [
    [serial, book_idx, "reference", "english text ≤320 chars"],
    ...
  ]
}
"""
import json, os, re, sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT       = os.path.join(SCRIPT_DIR, '..')
DATA_DIR   = os.path.join(ROOT, 'data')
OUT_FILE   = os.path.join(ROOT, 'search', 'data', 'hadith_index.json')
SHARD_MAP  = os.path.join(DATA_DIR, 'meta', 'shard_map_hadith.json')
MAX_TEXT   = 320


BOOK_DISPLAY = {
    'Bukhari':  'Sahih al-Bukhari',
    'Muslim':   'Sahih Muslim',
    'Abudawud': 'Abu Dawud',
    'Tirmidhi': 'Tirmidhi',
    'Nasai':    'An-Nasai',
    'Ibnmajah': 'Ibn Majah',
    'Mishkat':  'Mishkat al-Masabih',
    'Ahmad':    'Musnad Ahmad',
    'Darimi':   'Darimi',
}


def clean(text):
    if not text:
        return ''
    text = re.sub(r'\s+', ' ', str(text)).strip()
    return text[:MAX_TEXT]


def main():
    with open(SHARD_MAP, encoding='utf-8') as f:
        shards = json.load(f)

    books_list = []
    books_idx  = {}
    entries    = []
    skipped    = 0

    total_shards = len(shards)
    for i, shard in enumerate(shards, 1):
        path = os.path.join(DATA_DIR, shard['file'])
        with open(path, encoding='utf-8') as f:
            hadiths = json.load(f)

        for h in hadiths:
            text = clean(h.get('english', ''))
            if not text or len(text) < 20:
                skipped += 1
                continue

            raw_book = h.get('book', '') or ''
            book = BOOK_DISPLAY.get(raw_book, raw_book or 'Other')

            if book not in books_idx:
                books_idx[book] = len(books_list)
                books_list.append(book)

            entries.append([
                h['serial'],
                books_idx[book],
                h.get('reference', ''),
                text,
            ])

        if i % 5 == 0 or i == total_shards:
            print(f'  [{i}/{total_shards}] {len(entries):,} hadiths indexed…', flush=True)

    result = {'books': books_list, 'data': entries}

    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, separators=(',', ':'))

    size_mb = os.path.getsize(OUT_FILE) / (1024 * 1024)
    print(f'\nDone.')
    print(f'  Hadiths indexed : {len(entries):,}')
    print(f'  Skipped (no text): {skipped:,}')
    print(f'  Collections     : {books_list}')
    print(f'  Output size     : {size_mb:.1f} MB  →  {OUT_FILE}')


if __name__ == '__main__':
    main()
