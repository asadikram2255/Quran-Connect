#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build data/meta/sura_meta.json from the Tanzil metadata shipped with Zekr.

quran-properties.xml gives, per sura: the Arabic name, an English name, a
transliterated name, the ayah count and whether it was revealed in Makkah
(makki) or Madinah (madani). uthmani.page.xml gives the standard 604-page Madani
mushaf boundaries, from which we take the page each sura begins on.

The result is one authoritative record per sura that both the web reader and the
Android app consume (Android picks it up through tools/sync_web_assets.py, which
copies data/meta wholesale).

Run:  python scripts/build_sura_meta.py [--zekr PATH]
"""
import argparse
import io
import json
import os
import re
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
OUT = os.path.join(REPO, 'data', 'meta', 'sura_meta.json')
DEFAULT_ZEKR = os.path.join(os.path.dirname(REPO), 'Zekr',
                            'Zekr-1.1.0-windows-portable-jre', 'zekr', 'res',
                            'text', 'metadata')


def first_pages(page_xml):
    """sura index -> first Madani-mushaf page it appears on."""
    root = ET.parse(page_xml).getroot()
    pages = {}
    for pg in root.findall('page'):
        idx = int(pg.get('index'))
        sura = int(pg.get('sura'))
        aya = int(pg.get('aya'))
        # The page where a sura's ayah 1 sits is its start page.
        if aya == 1 and sura not in pages:
            pages[sura] = idx
    return pages


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--zekr', default=DEFAULT_ZEKR)
    args = ap.parse_args()

    props = os.path.join(args.zekr, 'quran-properties.xml')
    ext = os.path.join(args.zekr, 'quran-properties-extendedenglish.xml')
    page_xml = os.path.join(args.zekr, 'uthmani.page.xml')

    pages = first_pages(page_xml)

    # Diacriticised transliterations (Al-Fātiḥaħ) from the extended file, keyed
    # by sura index, used to enrich the plain tname.
    ext_tname = {}
    if os.path.exists(ext):
        for s in ET.parse(ext).getroot().find('sura-detail').findall('sura'):
            ext_tname[int(s.get('index'))] = s.get('tname')

    root = ET.parse(props).getroot()
    out = []
    for s in root.find('sura-detail').findall('sura'):
        i = int(s.get('index'))
        out.append({
            'index': i,
            'ayaCount': int(s.get('ayaCount')),
            'name': s.get('name'),            # Arabic name
            'en': s.get('en'),                # English meaning
            'tname': s.get('tname'),          # transliterated name
            'tnameFull': ext_tname.get(i, s.get('tname')),  # diacriticised
            'revelation': s.get('descent'),   # "makki" | "madani"
            'page': pages.get(i),             # first Madani-mushaf page
        })

    if len(out) != 114:
        raise SystemExit('expected 114 suras, got %d' % len(out))

    with io.open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    makki = sum(1 for r in out if r['revelation'] == 'makki')
    print('wrote %s: 114 suras (%d makki, %d madani), %.1f KB'
          % (OUT, makki, 114 - makki, os.path.getsize(OUT) / 1024))
    print('sample:', json.dumps(out[0], ensure_ascii=False))


if __name__ == '__main__':
    main()
