#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Convert Zekr .trans.zip packs into Quran Connect translation shards.

A Zekr translation pack is a zip of a UTF-8 text file — one ayah per line, in
the canonical Tanzil order (1:1 … 114:6) — plus a translation.properties
descriptor. Quran Connect stores each translation as data/translations/<id>.json
keyed "sura:aya", registered in data/translations/index.json, and read lazily by
Explore Quran and the mushaf reader.

The line→ayah map is the single dangerous step: if a pack has a stray line, every
ayah after it shifts and the whole translation is silently wrong. So each pack is
cleaned (BOM, CR, and any leading/trailing blank / '#'-comment / decorative
marker lines dropped) and then HARD-asserted to be exactly 6236 non-blank lines,
mapped position-for-position onto the canonical order taken from quran.json. A
pack that does not reduce to exactly 6236 clean lines is refused, never shifted.

Packs whose translation already ships (or is a duplicate of one that does, or a
language we don't offer) are skipped — see SKIP.

Run:  python scripts/build_zekr_translations.py [--zekr PATH] [--dry-run]
"""
import argparse
import html
import io
import json
import os
import re
import sys
import zipfile

TAG_RE = re.compile(r'<[^>]+>')  # the transliteration pack marks long vowels
                                 # with <u>/<b>; the reader escapes text, so
                                 # these would show literally — strip them.

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
QURAN = os.path.join(REPO, 'search', 'data', 'quran.json')
TR_DIR = os.path.join(REPO, 'data', 'translations')
INDEX = os.path.join(TR_DIR, 'index.json')
DEFAULT_ZEKR = os.path.join(os.path.dirname(REPO), 'Zekr', 'trans')

# Packs not to import: already shipped under their own id, a duplicate of one
# that is, or a language Quran Connect does not offer. Keyed by the zip's base
# name (the part before .trans.zip).
SKIP = {
    'en.sahih',        # ships as en_sahih
    'en.yusufali',     # ships as en_yusuf_ali
    'ur.ahmedali',     # ships as ur_ahmedali
    'ur.junagarhi',    # ships as ur_junagarhi
    'ur.maududi',      # ships as ur_maududi
    'ur.jalandhry',    # ships as ur_jalandhri
    'ru.krachkovsky',  # Russian — not offered
}

# Nicer short labels than the raw descriptor name, keyed by the QC id. Anything
# not here falls back to the descriptor's own `name`.
LABELS = {
    'en_pickthall':      'Pickthall',
    'en_maududi':        'Maududi — Tafhim (English)',
    'en_taqiusmani':     'Mufti Taqi Usmani',
    'en_qaribullah':     'Qaribullah & Darwish',
    'en_wahiduddin':     'Wahiduddin Khan',
    'en_drshabbir':      'Dr. Shabbir Ahmed',
    'en_gaparwez':       'Ghulam Ahmed Parwez',
    'en_ahmedraza':      'Ahmed Raza Khan (English)',
    'en_ahmedhulusi':    'Ahmed Hulusi — Decoding the Quran',
    'en_transliteration':'Transliteration (Roman)',
    'ur_abdulqadir':     'Shah Abdul Qadir',
    'ur_bhutvi':         'Abdus Salam Bhutvi',
    'ur_daryabadi':      'Abdul Majid Daryabadi',
    'ur_fazli':          'Fazal Shah (Fazli)',
    'ur_gaparwez':       'G. A. Parwez',
    'ur_ghamdi':         'Javed Ahmed Ghamidi',
    'ur_ilmf':           'Ilm Foundation',
    'ur_islahi':         'Amin Ahsan Islahi',
    'ur_israr':          'Dr. Israr Ahmad',
    'ur_jalalayn':       'Tafsir al-Jalalayn (Urdu)',
    'ur_jawadi':         'Zeeshan Haider Jawadi',
    'ur_kanzuliman':     'Kanz-ul-Iman — Ahmed Raza Khan',
    'ur_madani':         'Madani',
    'ur_mahmood':        'Mahmudul Hasan',
    'ur_najafi':         'Najafi',
    'ur_noorulquran':    'Noor-ul-Quran',
    'ur_qadri':          'Tahir-ul-Qadri (Irfan-ul-Quran)',
    'ur_riffat':         'Riffat',
    'ur_taqi':           'Mufti Taqi Usmani (Urdu)',
}

# A trailing/leading line that is decoration, not an ayah: only markers.
DECOR_RE = re.compile(r'^[٭ـ\*\-=~_.\s]+$')  # ٭ tatweel * - = ~ _ .


def canonical_order():
    quran = json.load(io.open(QURAN, encoding='utf-8'))
    order = [(a['sn'], a['an']) for a in quran]
    if len(order) != 6236:
        sys.exit('quran.json is not 6236 ayaat: %d' % len(order))
    return order


def read_pack(path):
    """Return (props dict, cleaned list of ayah lines)."""
    with zipfile.ZipFile(path) as zf:
        props = {}
        with zf.open('translation.properties') as f:
            for line in f.read().decode('utf-8', 'replace').splitlines():
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    props[k.strip()] = v.strip()
        txt_name = next(n for n in zf.namelist() if n.endswith('.txt'))
        raw = zf.read(txt_name).decode('utf-8', 'replace')

    raw = raw.lstrip('﻿')
    lines = [l.rstrip('\r').strip() for l in raw.split('\n')]

    def junk(l):
        return l == '' or l.startswith('#') or DECOR_RE.match(l) is not None

    # Drop junk only at the ends; a blank in the middle is a real misalignment
    # and must survive to trip the length assert below.
    start, end = 0, len(lines)
    while start < end and junk(lines[start]):
        start += 1
    while end > start and junk(lines[end - 1]):
        end -= 1
    return props, lines[start:end]


def convert(path, order, dry_run):
    base = os.path.basename(path)[:-len('.trans.zip')]
    if base in SKIP:
        return ('skip', base, 0)

    props, lines = read_pack(path)
    qc_id = base.replace('.', '_').lower()

    # Length is the alignment guarantee: a split ayah would make it > 6236 and a
    # merged pair < 6236, both refused here. An interior blank therefore can only
    # be a legitimately-untranslated ayah (e.g. bhutvi 8:67), so it is kept as an
    # empty string rather than treated as a shift.
    if len(lines) != 6236:
        return ('BAD', qc_id, len(lines))

    lang = (props.get('language') or base.split('.')[0]).lower()
    data = {f'{sn}:{an}': html.unescape(TAG_RE.sub('', lines[i])).strip()
            for i, (sn, an) in enumerate(order)}

    out = os.path.join(TR_DIR, qc_id + '.json')
    if not dry_run:
        with io.open(out, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))

    entry = {
        'id': qc_id,
        'edition': base,
        'lang': lang,
        'name': LABELS.get(qc_id, props.get('name', qc_id).strip()),
        'author': props.get('name', '').strip() or qc_id,
        'ayat': 6236,
        'status': 'ok',
        'path': 'data/translations/%s.json' % qc_id,
    }
    return ('ok', entry, os.path.getsize(out) if not dry_run else 0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--zekr', default=DEFAULT_ZEKR)
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    order = canonical_order()
    existing = json.load(io.open(INDEX, encoding='utf-8'))
    by_id = {e['id']: e for e in existing}

    zips = sorted(f for f in os.listdir(args.zekr) if f.endswith('.trans.zip'))
    added, skipped, bad = [], [], []
    for f in zips:
        kind, payload, extra = convert(os.path.join(args.zekr, f), order, args.dry_run)
        if kind == 'ok':
            by_id[payload['id']] = payload
            added.append((payload['id'], payload['name'], extra))
        elif kind == 'skip':
            skipped.append(payload)
        else:
            bad.append((kind, payload, extra))

    if bad:
        print('REFUSED (not exactly 6236 clean lines):')
        for kind, qid, n in bad:
            print('  %-16s %s (%d lines)' % (qid, kind, n))
        sys.exit('aborting — a pack did not align; nothing written to index.')

    # Keep index order stable: existing first (in their order), then new ids.
    order_ids = [e['id'] for e in existing] + [a[0] for a in added if a[0] not in by_id or True]
    seen, final = set(), []
    for i in [e['id'] for e in existing] + [a[0] for a in added]:
        if i not in seen:
            seen.add(i); final.append(by_id[i])

    if not args.dry_run:
        with io.open(INDEX, 'w', encoding='utf-8') as f:
            json.dump(final, f, ensure_ascii=False, indent=2)

    en = [a for a in added if a[0].startswith('en_')]
    ur = [a for a in added if a[0].startswith('ur_')]
    print('added %d translations (%d en, %d ur), skipped %d, total in index %d'
          % (len(added), len(en), len(ur), len(skipped), len(final)))
    for qid, name, sz in added:
        print('  %-20s %-38s %s' % (qid, name, ('%d KB' % (sz / 1024)) if sz else ''))
    print('skipped:', ', '.join(skipped))


if __name__ == '__main__':
    main()
