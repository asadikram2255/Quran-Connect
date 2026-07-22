#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Restore the Quranic quotations inside the Fatuhat al-Quran articles.

The book's Arabic is corrupted at the source (every fatha is encoded as
shadda+fatha, and marks drift across base letters), but its *consonants* are
intact and nearly every quotation is followed by a printed [surah:ayah]
reference. So each quotation can be swapped for the repo's authoritative text.

For every reference we take the text before it, reduce it to a consonant
skeleton, and look for the longest suffix of that skeleton that occurs
contiguously in the cited ayah. The matched span is then replaced by the
corresponding span of the authoritative ayah.

The skeleton drops alef, hamza and every hamza seat (ا أ إ آ ٱ ء ؤ ئ) and folds
the Urdu letter forms onto the Arabic ones, because IndoPak and Tanzil
orthography disagree about exactly those (اللٰه/الله, نبؤا/نبأ) while agreeing
on every consonant that carries meaning.

Both ends of the match must land on a word start, in the article and in the
ayah alike, so a quotation can never be anchored to the tail of the Urdu word
before it or to the wrong word of the ayah. Together with the skeleton match
that gives the guarantee that matters: a replacement only ever changes the
vowel marks and orthography of what the book printed — never the words.

Printed references are themselves sometimes damaged by the conversion
(]2:34[, [407:1] for 4:107, [91:12] for 12:91), so the cited reference is tried
first, then its digit-reversed / swapped variants, then the immediate
neighbours, and finally — for a long, unique match only — the whole Quran.

What none of that can rescue — a reference the conversion destroyed beyond
repair, a quotation the book abridges — is corrected by hand: see
scripts/export_quote_fixes.py, which writes the outstanding cases to a
workbook and ingests the filled-in file to raw/quote_fixes.json. Those
corrections are applied here before anything automatic is tried.

Restored quotations are wrapped in U+FDD0 … U+FDD1 (permanent noncharacters,
so they can never collide with real text); assets/root-dictionary.js turns them
into a span so they can be rendered in an Arabic face.

Run standalone to re-process an existing data/root_dictionary.json:
    python scripts/restore_quran_quotes.py
"""
import collections
import glob
import io
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
DICT = os.path.join(REPO, 'data', 'root_dictionary.json')
QURAN_DIR = os.path.join(REPO, 'data', 'quran_text')
FIXES = os.path.join(REPO, 'raw', 'quote_fixes.json')

OPEN, CLOSE = '﷐', '﷑'

REF = re.compile(r'\[\s*(\d{1,3})\s*:\s*(\d{1,3})\s*\]')
WINDOW = 300                 # how far back a quotation may reach
MIN_CITED = 6                # letters needed when the printed reference matches
MIN_REPAIRED = 10            # …when the reference had to be repaired/guessed
MIN_GLOBAL = 12              # …when the quote is found by searching the Quran
MIN_MANUAL = 4               # …when a human supplied the reference by hand

FOLD = {'ى': 'ي', 'ی': 'ي', 'ة': 'ه', 'ہ': 'ه', 'ھ': 'ه', 'ۃ': 'ه', 'ک': 'ك'}
DROP_LETTERS = set('اأإآٱءؤئ')
URDU_ONLY = set('ٹڈڑژگپچںے')
MARKS = set('ـ') | {chr(c) for c in
                         list(range(0x064B, 0x0660)) + [0x0670] +
                         list(range(0x06D6, 0x06EE))}


def is_letter(c):
    return 'ؠ' <= c <= 'ي' or c in URDU_ONLY


def is_quote_char(c):
    return is_letter(c) or c in MARKS


def skel(s):
    """Consonant skeleton plus a map from each skeleton index back into `s`."""
    out, idx = [], []
    for i, ch in enumerate(s):
        c = FOLD.get(ch, ch)
        if c in DROP_LETTERS or not is_letter(c):
            continue
        out.append(c)
        idx.append(i)
    return ''.join(out), idx


def restored_total(st):
    return (st['cited'] + st['repaired'] + st['global'] +
            st['manual-ref'] + st['manual-text'])


def load_quran():
    ayaat, last = {}, collections.Counter()
    for path in sorted(glob.glob(os.path.join(QURAN_DIR, 'quran_s*.json'))):
        for rec in json.load(io.open(path, encoding='utf-8')):
            ayaat[rec['ayah_id']] = rec['arabic']
            s, a = (int(x) for x in rec['ayah_id'].split(':'))
            last[s] = max(last[s], a)
    return ayaat, last


def load_overrides(path=None):
    """Corrections made by hand, from raw/quote_fixes.json.

    scripts/export_quote_fixes.py writes one row per quotation this script
    could not restore into a workbook; a reader fills in the correct reference
    (and, where the reference alone will not resolve the quotation, the Arabic
    itself); `export_quote_fixes.py --ingest` turns the filled workbook into
    that JSON. Each correction is keyed on the root, the reference *as the book
    prints it* and the quotation as printed, so it keeps pointing at the same
    quotation however the articles are re-parsed.
    """
    path = path or FIXES
    if not os.path.exists(path):
        return {}
    doc = json.load(io.open(path, encoding='utf-8'))
    return {(f['root'], f['ref'], f['quote']): (f.get('fix_ref', ''),
                                                f.get('fix_text', ''))
            for f in doc.get('fixes', [])}


def reference_candidates(sr, ar, last):
    """Printed reference first, then the ways the conversion mangles one."""
    seen, out = set(), []

    def add(si, ai):
        if 1 <= si <= 114 and 1 <= ai <= last[si] and (si, ai) not in seen:
            seen.add((si, ai))
            out.append((si, ai))

    for first, second in ((sr, ar), (ar, sr)):          # printed, and swapped
        for x in (first, first[::-1]):
            for y in (second, second[::-1]):
                add(int(x), int(y))
    if out:
        s0, a0 = out[0]
        for d in (1, -1, 2, -2, 3, -3):
            add(s0, a0 + d)
    return out


def at_word_start(s, i):
    """Is s[i] the first consonant of its word? Alef, hamza and the marks are
    skipped, since the skeleton drops them and a quotation legitimately begins
    with e.g. أَبَدًا."""
    while i > 0 and (s[i - 1] in MARKS or s[i - 1] in DROP_LETTERS):
        i -= 1
    return i == 0 or s[i - 1].isspace()


def at_word_end(s, i):
    """Is s[i] the last consonant of its word? Mirror of at_word_start."""
    while i + 1 < len(s) and (s[i + 1] in MARKS or s[i + 1] in DROP_LETTERS):
        i += 1
    return i + 1 == len(s) or s[i + 1].isspace()


def longest_suffix(ws, wi, window, ayah_skel, a_idx, ayah, minlen):
    """Longest suffix of `ws` occurring contiguously in `ayah_skel`.

    Both ends of the match must fall on a word boundary, in the article and in
    the ayah alike. Without that, a quotation can pick up the tail of the Urdu
    word before it (…ادراک matching the ـك of سبحانك) or be anchored to the
    wrong word of the ayah (the final و of الربوا matching the وَ of وَيُرْبِي),
    and the substitution would then change the wording, not just the vowels."""
    for length in range(min(len(ws), len(ayah_skel)), minlen - 1, -1):
        if not (at_word_start(window, wi[len(ws) - length]) and
                at_word_end(window, wi[-1])):
            continue
        start = 0
        while True:
            pos = ayah_skel.find(ws[-length:], start)
            if pos < 0:
                break
            if (at_word_start(ayah, a_idx[pos]) and
                    at_word_end(ayah, a_idx[pos + length - 1])):
                return length, pos
            start = pos + 1
    return None


def manual_target(fix, ayaat):
    """The authoritative text a hand-made correction points at: the ayah it
    names, or — where the reference alone cannot resolve the quotation (a part
    verse, two verses run together) — the Arabic the reader typed in."""
    fix_ref, fix_txt = fix
    if fix_txt:
        return fix_txt, 'manual-text'
    return ayaat.get(fix_ref.replace(' ', '')), 'manual-ref'


def grow(s, i, j, limit):
    """Extend [i, j] over the rest of the Arabic word at each end."""
    while i > 0 and is_quote_char(s[i - 1]):
        i -= 1
    while j + 1 < min(len(s), limit) and is_quote_char(s[j + 1]):
        j += 1
    return i, j


def restore_all(entries, overrides=None):
    ayaat, last = load_quran()
    index = [(aid, *skel(txt), txt) for aid, txt in ayaat.items()]
    if overrides is None:
        overrides = load_overrides()

    st = collections.Counter()
    log = []

    for root, text in entries.items():
        out, cursor, prev_end = [], 0, 0
        for m in REF.finditer(text):
            st['refs'] += 1
            start = max(prev_end, cursor, m.start() - WINDOW)
            prev_end = m.end()
            window = text[start:m.start()]
            # Urdu prose runs right up to the quotation; the last Urdu-only
            # letter is therefore a hard left boundary for it.
            cut = max((window.rfind(c) for c in URDU_ONLY), default=-1)
            if cut >= 0:
                start += cut + 1
                window = window[cut + 1:]
            ws, wi = skel(window)
            if not ws:
                st['no_quote'] += 1
                continue

            hit = None
            # A correction made by hand outranks anything found automatically.
            fix = overrides.get((root, m.group(0), ' '.join(window.split())))
            if fix:
                target, kind = manual_target(fix, ayaat)
                found = None
                if target:
                    t_skel, t_idx = skel(target)
                    found = longest_suffix(ws, wi, window, t_skel, t_idx,
                                           target, MIN_MANUAL)
                if found:
                    hit = (kind, fix[0] or '(text)', target, t_idx, found)
                else:
                    # The correction does not line up with what the book
                    # printed; say so rather than substituting blindly.
                    st['manual_failed'] += 1
                    log.append((root, m.group(0), fix[0], 'manual-failed',
                                window, fix[1]))

            if not hit:
                for i, (s, a) in enumerate(reference_candidates(
                        m.group(1), m.group(2), last)):
                    aid = '%d:%d' % (s, a)
                    a_skel, a_idx = skel(ayaat[aid])
                    found = longest_suffix(ws, wi, window, a_skel, a_idx,
                                           ayaat[aid],
                                           MIN_CITED if i == 0 else MIN_REPAIRED)
                    if found:
                        hit = ('cited' if i == 0 else 'repaired',
                               aid, ayaat[aid], a_idx, found)
                        break

            if not hit:
                # Reference unusable: search the whole Quran, and accept only a
                # long match that is unique, so the vowels cannot be ambiguous.
                best, ties = None, 0
                tail = ws[-MIN_GLOBAL:]
                for aid, a_skel, a_idx, txt in index:
                    if tail not in a_skel:              # cheap prefilter
                        continue
                    found = longest_suffix(ws, wi, window, a_skel, a_idx,
                                           txt, MIN_GLOBAL)
                    if not found:
                        continue
                    if best is None or found[0] > best[4][0]:
                        best, ties = ('global', aid, txt, a_idx, found), 1
                    elif found[0] == best[4][0]:
                        ties += 1
                if best and ties == 1:
                    hit = best

            if not hit:
                st['nomatch'] += 1
                # For a failure the last two fields are the quote as printed
                # and the article text leading up to it, so the reference can
                # be found in the book and corrected by hand.
                log.append((root, m.group(0), '', 'nomatch', window,
                            text[max(0, start - 220):start]))
                continue

            kind, aid, ayah, a_idx, (length, pos) = hit
            i0 = start + wi[len(ws) - length]
            i1 = start + wi[-1]
            i0, i1 = grow(text, i0, i1, m.start())
            span = text[i0:i1 + 1]
            if URDU_ONLY & set(span):                   # safety net
                st['rejected'] += 1
                continue
            j0, j1 = grow(ayah, a_idx[pos], a_idx[pos + length - 1], len(ayah))
            if i0 < cursor:                             # overlaps a previous fix
                st['rejected'] += 1
                continue

            out.append(text[cursor:i0])
            out.append(OPEN + ayah[j0:j1 + 1] + CLOSE)
            cursor = i1 + 1
            st[kind] += 1
            st['letters'] += length
            log.append((root, m.group(0), aid, kind, span, ayah[j0:j1 + 1]))

        if out:
            out.append(text[cursor:])
            entries[root] = ''.join(out)

    return entries, st, log


def main():
    doc = json.load(io.open(DICT, encoding='utf-8'))
    entries, st, log = restore_all(doc['entries'])
    doc['entries'] = entries
    doc['quotes_restored'] = restored_total(st)
    with io.open(DICT, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
    for k in ('refs', 'cited', 'repaired', 'global', 'manual-ref',
              'manual-text', 'manual_failed', 'nomatch', 'no_quote',
              'rejected'):
        print('%-10s %5d' % (k, st[k]))
    print('output    ', DICT, '(%.0f KB)' % (os.path.getsize(DICT) / 1024))


if __name__ == '__main__':
    main()
