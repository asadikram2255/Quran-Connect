#!/usr/bin/env python3
"""Build data/root_dictionary.json from raw/Fatuhat-al-Quran- Final Draft.docx.

The book is a root-by-root Quranic dictionary in Urdu. Each entry starts with a
bold headword run holding the root spelled as separated letters ("أ ب ب"), and
everything up to the next headword is that root's article.

Headwords are found at RUN level, not paragraph level: the DOCX lost many
paragraph breaks, so an entry frequently begins in the middle of the previous
entry's paragraph. Bold + sz in {36,40,44} identifies a headword run reliably.

Two source defects are repaired here:
  * some headwords lost their first letter ("ك ر" for "ذ ك ر") — the enclosing
    باب chapter supplies it, since entries are grouped by first root letter;
  * some headwords are not letter-spaced ("ودع" for "و د ع").
Both repairs only apply when the result is a root the app already knows about,
so they cannot invent entries.

Run:  python scripts/build_root_dictionary.py
"""
import io
import json
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
DOCX = os.path.join(REPO, 'raw', 'Fatuhat-al-Quran- Final Draft.docx')
OUT = os.path.join(REPO, 'data', 'root_dictionary.json')
ROOT_COUNTS = os.path.join(REPO, 'explore', 'data', 'root_counts.json')

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'

# Root letters as the book writes them: Arabic plus the Urdu-keyboard variants
# (heh goal, heh doachashmee, keheh, farsi yeh) that show up in headwords.
LETTERS = 'ء-غف-يىةکھہۃیٱ'
LET = '[' + LETTERS + ']'
ROOT_RE = re.compile(r'^' + LET + r'(?: ' + LET + r'){1,4}$')
HEADCHARS = re.compile(r'^[\s' + LETTERS + r'/،-]+$')
HEAD_SIZES = {'36', '40', '44'}

# Fold the Urdu-keyboard letter forms onto the Arabic ones the app keys on.
FOLD = {'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ى': 'ي', 'ی': 'ي',
        'ہ': 'ه', 'ھ': 'ه', 'ۃ': 'ه', 'ة': 'ه', 'ک': 'ك'}

# باب heading -> the root letter that chapter collects.
BAB = {
    'ھمزۃ': 'ا', 'همزة': 'ا', 'باء': 'ب', 'تاء': 'ت', 'ثاء': 'ث',
    'جیم': 'ج', 'حاء': 'ح', 'خاء': 'خ', 'دال': 'د', 'ذال': 'ذ',
    'راء': 'ر', 'زاي': 'ز', 'زای': 'ز', 'سین': 'س', 'شین': 'ش',
    'صاد': 'ص', 'ضاد': 'ض', 'طاء': 'ط', 'ظاء': 'ظ', 'عین': 'ع',
    'غین': 'غ', 'فاء': 'ف', 'قاف': 'ق', 'کاف': 'ك', 'لام': 'ل',
    'میم': 'م', 'نون': 'ن', 'ھاء': 'ه', 'هاء': 'ه', 'واؤ': 'و',
    'واو': 'و', 'یاء': 'ي',
}

INVISIBLE = dict.fromkeys(map(ord, '​‌‍‎‏‪'
                                   '‫‬‭‮﻿'), None)


def fold(s):
    return ''.join(FOLD.get(c, c) for c in s)


def run_props(r):
    rPr = r.find(W + 'rPr')
    if rPr is None:
        return {}
    sz = rPr.find(W + 'sz')
    return {'sz': sz.get(W + 'val') if sz is not None else None,
            'b': rPr.find(W + 'b') is not None}


def run_text(r):
    buf = []
    for node in r.iter():
        if node.tag == W + 't':
            buf.append(node.text or '')
        elif node.tag in (W + 'tab', W + 'br'):
            buf.append(' ')
    return ''.join(buf)


def clean_text(s):
    """Undo conversion artefacts without touching the author's wording."""
    s = s.translate(INVISIBLE)
    s = s.replace('\t', ' ')
    # RTL-mirrored ayah references: ]2:34[ -> [2:34]
    s = re.sub(r'\](\d{1,3}\s*:\s*\d{1,3})\[', r'[\1]', s)
    # "اور" (and) is split by a stray space throughout the conversion. A lone
    # alef is never a word in Urdu, so joining it to a following ور is safe;
    # the guard keeps real words ending in alef ("کا ورق") intact.
    s = re.sub(r'(?<![\w' + LETTERS + r'])ا\s+ور', 'اور', s)
    s = re.sub(r'[  ]+', ' ', s)
    s = re.sub(r' *\n *', '\n', s)
    s = re.sub(r'\n{2,}', '\n', s)
    return s.strip()


def parse_entries():
    with zipfile.ZipFile(DOCX) as z:
        doc = ET.fromstring(z.read('word/document.xml'))
    body = doc.find(W + 'body')

    entries = []
    cur = None
    bab = None
    pending_head = None

    def flush_head():
        nonlocal cur, pending_head
        if pending_head is None:
            return
        h = re.sub(r'\s+', ' ', pending_head).strip()
        pending_head = None
        if not h or not HEADCHARS.match(h):
            if cur is not None:
                cur['body'].append(h)
            return
        cur = {'head': h, 'bab': bab, 'body': []}
        entries.append(cur)

    for p in body.iter(W + 'p'):
        pPr = p.find(W + 'pPr')
        style = ''
        if pPr is not None:
            ps = pPr.find(W + 'pStyle')
            if ps is not None:
                style = ps.get(W + 'val') or ''
        if style.startswith('TOC'):
            continue
        flush_head()
        if cur is not None:
            cur['body'].append('\n')
        for r in p.iter(W + 'r'):
            t = run_text(r)
            if not t:
                continue
            if style == 'Heading1' and 'باب' in t:
                flush_head()
                key = re.sub(r'^\s*باب\s*ال', '', t).strip()
                bab = BAB.get(key, bab)
                continue
            d = run_props(r)
            if d.get('sz') in HEAD_SIZES and d.get('b'):
                pending_head = (pending_head or '') + t
            else:
                flush_head()
                if cur is not None:
                    cur['body'].append(t)
    flush_head()
    return entries


def resolve_keys(head, bab, known):
    """Map a printed headword to the app's root keys."""
    out = []
    for part in re.split(r'[/،]', head):
        part = part.strip(' -۔')
        if not part:
            continue
        letters = [c for c in part if c not in ' \t-۔']
        spaced = ' '.join(fold(c) for c in letters)
        # As printed, when the app already knows that root.
        if ROOT_RE.match(part) and spaced in known:
            out.append(spaced)
            continue
        # Headword that lost its first letter: the باب supplies it. Checked
        # before the as-printed fallback so "ك ر" in باب الذال becomes "ذ ك ر"
        # rather than being written under the bogus two-letter key.
        if bab and 1 <= len(letters) <= 4:
            cand = bab + ' ' + spaced
            if cand in known:
                out.append(cand)
                continue
        # Not letter-spaced in the source ("ودع").
        if 2 <= len(letters) <= 5 and spaced in known:
            out.append(spaced)
            continue
        if ROOT_RE.match(part):
            out.append(spaced)
    return out


DIACRITICS = re.compile(r'[ً-ْٰـ]')


def skeleton(s):
    """Bare consonant skeleton, for matching the app's non-root keys
    (proper nouns and particles) against the book's headwords."""
    return fold(DIACRITICS.sub('', s)).replace(' ', '').replace('ٱ', 'ا')


def main():
    if not os.path.exists(DOCX):
        sys.exit('missing source: ' + DOCX)
    known = set(json.load(io.open(ROOT_COUNTS, encoding='utf-8')))

    entries = parse_entries()
    out = {}
    unmatched = []
    for e in entries:
        text = clean_text(''.join(e['body']))
        if not text:
            continue
        head = re.sub(r'\s+', ' ', e['head']).strip()
        keys = resolve_keys(e['head'], e['bab'], known)
        if not keys:
            unmatched.append((head, text))
            continue
        for k in keys:
            if k in out:
                # Same root printed twice: keep both articles in order.
                out[k] += '\n' + text
            else:
                out[k] = text

    # The app also keys a few proper nouns and particles (إِبْرَاهِيم, إِلَّا …)
    # that the book carries as unspaced headwords rather than roots.
    by_skel = {}
    for head, text in unmatched:
        for part in re.split(r'[/،]', head):
            sk = skeleton(part)
            if sk:
                by_skel.setdefault(sk, (head, text))
    matched_extra = 0
    for k in known:
        if k in out:
            continue
        hit = by_skel.get(skeleton(k))
        if hit:
            out[k] = hit[1]
            matched_extra += 1
    print(f'non-root keys matched: {matched_extra}')

    payload = {
        'source': 'Fatuhat al-Quran',
        'lang': 'ur',
        'entries': out,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with io.open(OUT, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))

    covered = sorted(set(out) & known)
    print(f'entries parsed      : {len(entries)}')
    print(f'roots written       : {len(out)}')
    print(f'known roots covered : {len(covered)} / {len(known)}')
    print(f'headwords unmatched : {len(unmatched)}')
    print(f'output              : {OUT} '
          f'({os.path.getsize(OUT)/1024:.0f} KB)')
    counts = json.load(io.open(ROOT_COUNTS, encoding='utf-8'))
    tot = sum(counts.values())
    cov = sum(counts[k] for k in covered)
    print(f'occurrence coverage : {cov}/{tot} = {100*cov/tot:.2f}%')
    missing = sorted(((counts[k], k) for k in known if k not in out), reverse=True)
    print('top uncovered roots :', [m[1] for m in missing[:15]])


if __name__ == '__main__':
    main()
