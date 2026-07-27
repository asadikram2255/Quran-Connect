#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build data/mushaf/pages.json — the standard 604-page Madani mushaf layout.

The page boundaries come from Tanzil's uthmani.page.xml (shipped with Zekr): it
records, for each of the 604 pages of the standard Madani mushaf, the (sura,
ayah) that page *begins* with (plus a fake 605th marker for the end of the last
page). We assign every ayah to the page whose start..next-start range contains
it, so each page holds the whole ayaat that open on it. The Uthmani text is our
own already-canonical search/data/quran.json (ids 1..6236 in 1:1 -> 114:6 order),
so no second Arabic source is introduced.

This is a *text* pagination faithful to the mushaf's page boundaries (which ayah
opens each page) and its sura/juz structure — not a glyph-for-glyph scan of a
printed page. It is what "readable, both platforms" allows without the page-based
mushaf font. Android picks the file up through tools/sync_web_assets.py (copies
data/ wholesale).

Run:  python scripts/build_mushaf.py [--zekr PATH]
"""
import argparse
import io
import json
import os
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
QURAN = os.path.join(REPO, 'search', 'data', 'quran.json')
SURA_META = os.path.join(REPO, 'data', 'meta', 'sura_meta.json')
OUT_DIR = os.path.join(REPO, 'data', 'mushaf')
OUT = os.path.join(OUT_DIR, 'pages.json')
DEFAULT_ZEKR = os.path.join(os.path.dirname(REPO), 'Zekr',
                            'Zekr-1.1.0-windows-portable-jre', 'zekr', 'res',
                            'text', 'metadata')


def load_page_starts(page_xml):
    """Return [(index, sura, aya), ...] for the 604 real pages, ordered, plus
    the final (sura, aya) end marker as a sentinel appended at the end."""
    root = ET.parse(page_xml).getroot()
    marks = []
    for pg in root.findall('page'):
        marks.append((int(pg.get('index')), int(pg.get('sura')),
                      int(pg.get('aya'))))
    marks.sort(key=lambda m: m[0])
    return marks


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--zekr', default=DEFAULT_ZEKR)
    args = ap.parse_args()

    page_xml = os.path.join(args.zekr, 'uthmani.page.xml')
    marks = load_page_starts(page_xml)
    if marks[-1][0] != 605:
        raise SystemExit('expected a 605th end marker, got %d' % marks[-1][0])

    quran = json.load(io.open(QURAN, encoding='utf-8'))
    if len(quran) != 6236:
        raise SystemExit('expected 6236 ayaat, got %d' % len(quran))

    meta = {m['index']: m for m in json.load(io.open(SURA_META, encoding='utf-8'))}

    # A fast (sura, aya) -> position lookup in canonical order.
    pos = {(a['sn'], a['an']): i for i, a in enumerate(quran)}

    pages = []
    for k in range(len(marks) - 1):  # 604 real pages; skip the sentinel
        idx, sura, aya = marks[k]
        _, nsura, naya = marks[k + 1]
        start = pos[(sura, aya)]
        end = pos.get((nsura, naya), len(quran))  # exclusive; sentinel -> end
        if end <= start:
            raise SystemExit('page %d has no ayaat (start %d end %d)'
                             % (idx, start, end))

        ayaat = []
        suras_starting = []
        for a in quran[start:end]:
            ayaat.append({'s': a['sn'], 'a': a['an'], 't': a['ar']})
            if a['an'] == 1:
                m = meta.get(a['sn'], {})
                suras_starting.append({
                    'n': a['sn'],
                    'name': m.get('name', ''),          # Arabic name
                    'tname': m.get('tname', ''),        # transliterated
                    'en': m.get('en', ''),              # English meaning
                    'rev': m.get('revelation', ''),     # makki | madani
                    # At-Tawbah (9) is the one sura with no opening bismillah;
                    # Al-Fatihah (1) counts its bismillah as ayah 1 (already text).
                    'bismillah': a['sn'] not in (1, 9),
                })

        pages.append({
            'p': idx,
            'juz': quran[start].get('juz'),
            'suraStart': suras_starting,   # suras that open on this page
            'ayaat': ayaat,
        })

    if len(pages) != 604:
        raise SystemExit('expected 604 pages, got %d' % len(pages))

    out = {
        'version': 1,
        'source': 'Tanzil Uthmani page layout (standard 604-page Madani mushaf); '
                  'text from quran.json (Uthmani).',
        'pageCount': 604,
        'pages': pages,
    }

    os.makedirs(OUT_DIR, exist_ok=True)
    with io.open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))

    total_ayaat = sum(len(p['ayaat']) for p in pages)
    print('wrote %s: %d pages, %d ayaat, %.1f KB'
          % (OUT, len(pages), total_ayaat, os.path.getsize(OUT) / 1024))
    if total_ayaat != 6236:
        raise SystemExit('lost ayaat: %d != 6236' % total_ayaat)
    print('sample page 1 suraStart:',
          json.dumps(pages[0]['suraStart'], ensure_ascii=False))


if __name__ == '__main__':
    main()
