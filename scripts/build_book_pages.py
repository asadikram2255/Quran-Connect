#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Render Fatuhat al-Quran to page images and index where each root sits.

The book's text layer is corrupt — every fatha is encoded as shadda+fatha, and
even the printed [surah:ayah] references come out scrambled ([51:47] extracts
as [517:4]). The *drawn* page is perfect, though: the glyphs are addressed by
index, so what the reader sees was never damaged. So the root modals show the
page itself rather than extracted text.

This writes:
  assets/book/p###.webp   one image per page of the body
  data/book_index.json    root -> [page, y] plus the printed page numbers

`y` is the vertical centre of the root's printed headword as a fraction of the
page height, so the viewer can scroll to it and mark it.

Headwords are found the same way build_root_dictionary.py finds them in the
DOCX, and carry the same two source defects, repaired the same way: some lost
their first letter (the enclosing باب supplies it) and a few proper nouns are
not letter-spaced (matched on their consonant skeleton). Both repairs are
gated on the app's own root list, so neither can invent an entry.

Run:  python scripts/build_book_pages.py [--pages] [--index]
"""
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_root_dictionary as B

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
PDF = os.path.join(REPO, 'raw', 'Fatuhat-al-Quran- Final Draft.pdf')
IMG_DIR = os.path.join(REPO, 'assets', 'book')
INDEX = os.path.join(REPO, 'data', 'book_index.json')
DICT = os.path.join(REPO, 'data', 'root_dictionary.json')
ROOT_COUNTS = os.path.join(REPO, 'explore', 'data', 'root_counts.json')

DPI = 144                    # 2x nominal; a page lands around 95 KB as WebP
QUALITY = 74
HEAD_MIN_SIZE = 14           # body text is 11-12pt, headwords 18-22pt

LET = '[' + B.LETTERS + ']'
SPACED = re.compile(r'^\s*(' + LET + r'(?: +' + LET + r'){1,4})\s*$')
BAB_RE = re.compile(r'باب\s*ال?(\S+)')
# The corrupt text layer sometimes glues a full stop (or another sentence mark)
# onto a headword's last letter, so the isolated root prints clean but extracts
# with a trailing punctuation glyph. SPACED is end-anchored and would reject it,
# so these marks are trimmed off both ends before the match. U+06D4 Arabic full
# stop, U+060C comma, U+061B semicolon, U+061F question mark, colon, dot.
HEAD_TRIM = '۔،؛؟:.'


def page_lines(page):
    """Text lines with their font size and vertical centre (0-1)."""
    d = page.get_text('dict')
    h = d['height'] or 1
    out = []
    for blk in d['blocks']:
        for line in blk.get('lines', []):
            spans = line.get('spans') or []
            if not spans:
                continue
            txt = ''.join(s['text'] for s in spans)
            if not txt.strip():
                continue
            out.append({
                'text': txt,
                'size': max(s['size'] for s in spans),
                'y': (line['bbox'][1] + line['bbox'][3]) / 2 / h,
            })
    return out


def scan(doc, known):
    """root -> (pdf page, y), plus the printed page number of every page."""
    roots, printed, unspaced = {}, {}, []
    bab = None
    for i in range(doc.page_count):
        page = doc[i]
        lines = page_lines(page)
        # The printed number is the first line of the page when it is a number.
        if lines and lines[0]['text'].strip().isdigit():
            printed[i + 1] = int(lines[0]['text'].strip())

        for ln in lines:
            txt = ln['text'].strip()
            if 'باب' in txt and ln['size'] >= HEAD_MIN_SIZE:
                m = BAB_RE.search(txt)
                if m:
                    bab = B.BAB.get(m.group(1).strip(), bab)
                continue
            if ln['size'] < HEAD_MIN_SIZE:
                continue
            m = SPACED.match(txt.strip(HEAD_TRIM))
            if not m:
                # A headword that is not letter-spaced — the proper nouns and
                # particles the app also keys on. Resolved after the scan.
                if len(txt) <= 12:
                    unspaced.append((txt, i + 1, ln['y']))
                continue
            spaced = ' '.join(B.fold(c) for c in m.group(1).split())
            for cand in (spaced, (bab + ' ' + spaced) if bab else None):
                # As printed first, then with the letter the باب supplies:
                # "ب ب" inside باب الھمزۃ is the book's "ا ب ب".
                if cand and cand in known and cand not in roots:
                    roots[cand] = (i + 1, round(ln['y'], 4))
                    break
            else:
                roots.setdefault(spaced, (i + 1, round(ln['y'], 4)))

    # Carry the printed number forward over pages that print none.
    last = None
    for p in range(1, doc.page_count + 1):
        if p in printed:
            last = printed[p]
        elif last is not None:
            last += 1
            printed[p] = last
    return roots, printed, unspaced


def match_unspaced(unspaced, roots, wanted):
    """Proper nouns and particles, matched on their consonant skeleton."""
    by_skel = {}
    for txt, page, y in unspaced:
        by_skel.setdefault(B.skeleton(txt), (page, round(y, 4)))
    added = 0
    for key in wanted:
        if key in roots:
            continue
        hit = by_skel.get(B.skeleton(key))
        if hit:
            roots[key] = hit
            added += 1
    return added


def render(doc, first, last):
    import fitz                                        # noqa: F401
    from PIL import Image

    os.makedirs(IMG_DIR, exist_ok=True)
    total = 0
    for p in range(first, last + 1):
        pix = doc[p - 1].get_pixmap(dpi=DPI)
        img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        path = os.path.join(IMG_DIR, 'p%03d.webp' % p)
        img.save(path, 'WEBP', quality=QUALITY, method=4)
        total += os.path.getsize(path)
        if (p - first) % 50 == 0:
            print('  rendered %d/%d' % (p - first + 1, last - first + 1))
    return total


def main():
    import fitz

    do_pages = '--index' not in sys.argv
    do_index = '--pages' not in sys.argv
    if not os.path.exists(PDF):
        sys.exit('missing source: ' + PDF)

    known = set(json.load(io.open(ROOT_COUNTS, encoding='utf-8')))
    entries = set(json.load(io.open(DICT, encoding='utf-8'))['entries'])
    doc = fitz.open(PDF)

    roots, printed, unspaced = scan(doc, known)
    extra = match_unspaced(unspaced, roots, entries | known)
    print('headwords located   : %d (%d unspaced)' % (len(roots), extra))
    print('app root keys covered: %d / %d' % (len(known & set(roots)), len(known)))
    print('dictionary entries   : %d / %d' % (len(entries & set(roots)), len(entries)))

    # Only the body of the book is published: from the first page carrying a
    # headword to the last. Pages in between that have none of their own are
    # kept, because an article that runs over the page break has to stay
    # readable.
    pages = sorted(p for p, _ in roots.values())
    first, last = pages[0], doc.page_count
    print('pages published     : %d-%d (%d of %d)'
          % (first, last, last - first + 1, doc.page_count))

    if do_index:
        payload = {
            'version': 1,
            'source': 'Fatuhat al-Quran',
            'dpi': DPI,
            'first': first,
            'last': last,
            # Printed number for each published page, in order.
            'printed': [printed.get(p) for p in range(first, last + 1)],
            'roots': {k: [v[0], v[1]] for k, v in sorted(roots.items())},
        }
        with io.open(INDEX, 'w', encoding='utf-8') as f:
            json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))
        print('index               : %s (%.0f KB)'
              % (INDEX, os.path.getsize(INDEX) / 1024))

    if do_pages:
        total = render(doc, first, last)
        print('images              : %s (%.1f MB, %.0f KB/page)'
              % (IMG_DIR, total / 1048576, total / 1024 / (last - first + 1)))


if __name__ == '__main__':
    main()
