"""
Fetches all topic verse lists from myislam.org/quran-verses/ and
rewrites the TOPIC_CATEGORIES + TOPIC_VERSES blocks in assets/app.js.
"""

import re
import json
import time
import urllib.request
from pathlib import Path

APP_JS = Path(__file__).parent.parent / "assets" / "app.js"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://myislam.org/",
}

SURAH_MAP = {
    "fatiha":1,"baqarah":2,"imran":3,"an-nisa":4,"nisa":4,"maidah":5,"al-maidah":5,
    "al-anam":6,"anam":6,"al-araf":7,"araf":7,"al-anfal":8,"anfal":8,"tawbah":9,
    "at-tawbah":9,"yunus":10,"hud":11,"yusuf":12,"rad":13,"ar-rad":13,"ibrahim":14,
    "al-hijr":15,"hijr":15,"nahl":16,"an-nahl":16,"isra":17,"al-isra":17,"kahf":18,
    "al-kahf":18,"maryam":19,"taha":20,"al-anbiya":21,"anbiya":21,"al-hajj":22,"hajj":22,
    "al-muminun":23,"muminun":23,"nur":24,"an-nur":24,"furqan":25,"al-furqan":25,
    "ash-shuara":26,"shuara":26,"naml":27,"an-naml":27,"qasas":28,"al-qasas":28,
    "ankabut":29,"al-ankabut":29,"rum":30,"ar-rum":30,"luqman":31,"as-sajdah":32,
    "sajdah":32,"ahzab":33,"al-ahzab":33,"saba":34,"fatir":35,"yasin":36,"saffat":37,
    "as-saffat":37,"sad":38,"zumar":39,"az-zumar":39,"ghafir":40,"fussilat":41,
    "shura":42,"ash-shura":42,"zukhruf":43,"az-zukhruf":43,"ad-dukhan":44,"dukhan":44,
    "al-jathiyah":45,"jathiyah":45,"al-ahqaf":46,"ahqaf":46,"muhammad":47,"al-fath":48,
    "fath":48,"hujurat":49,"al-hujurat":49,"qaf":50,"adh-dhariyat":51,"dhariyat":51,
    "tur":52,"at-tur":52,"najm":53,"an-najm":53,"qamar":54,"al-qamar":54,"rahman":55,
    "ar-rahman":55,"waqiah":56,"al-waqiah":56,"hadid":57,"al-hadid":57,"mujadila":58,
    "al-mujadila":58,"al-hashr":59,"hashr":59,"mumtahanah":60,"al-mumtahanah":60,
    "as-saf":61,"saf":61,"jumuah":62,"al-jumuah":62,"munafiqun":63,"al-munafiqun":63,
    "taghabun":64,"at-taghabun":64,"talaq":65,"at-talaq":65,"tahrim":66,"at-tahrim":66,
    "mulk":67,"al-mulk":67,"qalam":68,"al-qalam":68,"al-haqqah":69,"haqqah":69,
    "maarij":70,"al-maarij":70,"nuh":71,"jinn":72,"al-jinn":72,"muzzammil":73,
    "al-muzzammil":73,"muddaththir":74,"al-muddaththir":74,"al-qiyamah":75,"qiyamah":75,
    "insan":76,"al-insan":76,"mursalat":77,"al-mursalat":77,"naba":78,"an-naba":78,
    "naziat":79,"an-naziat":79,"abasa":80,"takwir":81,"infitar":82,"mutaffifin":83,
    "al-mutaffifin":83,"inshiqaq":84,"al-inshiqaq":84,"buruj":85,"al-buruj":85,
    "tariq":86,"at-tariq":86,"ala":87,"al-ala":87,"ghashiyah":88,"al-ghashiyah":88,
    "fajr":89,"al-fajr":89,"balad":90,"al-balad":90,"shams":91,"ash-shams":91,
    "layl":92,"al-layl":92,"ad-duha":93,"duha":93,"ash-sharh":94,"sharh":94,
    "tin":95,"at-tin":95,"alaq":96,"al-alaq":96,"qadr":97,"al-qadr":97,
    "bayyinah":98,"al-bayyinah":98,"zalzalah":99,"az-zalzalah":99,"adiyat":100,
    "al-adiyat":100,"qariah":101,"al-qariah":101,"takathur":102,"at-takathur":102,
    "asr":103,"al-asr":103,"humazah":104,"al-humazah":104,"fil":105,"al-fil":105,
    "quraysh":106,"maun":107,"al-maun":107,"kawthar":108,"al-kawthar":108,
    "kafirun":109,"al-kafirun":109,"nasr":110,"an-nasr":110,"masad":111,"al-masad":111,
    "ikhlas":112,"al-ikhlas":112,"falaq":113,"al-falaq":113,"nas":114,"an-nas":114,
}

# All 157 topics from myislam.org/quran-verses/ — (display name, url slug)
TOPICS = [
    ("Allah has no son",            "allah-has-no-son"),
    ("Allah is near (qareeb)",      "fa-inni-qareeb"),
    ("Allah knows the unseen",      "allah-knows-the-unseen-al-ghaib"),
    ("About the grave",             "about-the-grave"),
    ("Lowering Gaze",               "lowering-gaze"),
    ("Haram & Forbidden",           "haram-and-forbidden"),
    ("On Alcohol",                  "alcohol"),
    ("Allah's Mercy",               "allahs-mercy"),
    ("Allah's Protection",          "allahs-protection"),
    ("On Animals",                  "animals"),
    ("About Arrogance",             "arrogance-pride"),
    ("Compulsion into Religion",    "no-compulsion-in-religion"),
    ("On Deception",                "deception"),
    ("About Difficulties",          "difficulties-adversity"),
    ("About Disbelievers",          "disbelievers"),
    ("Doing Good to Others",        "doing-good-to-others"),
    ("Family Ties / Kinship",       "about-family-ties-kinship"),
    ("Halal / Permissible",         "halal"),
    ("On Happiness",                "happiness"),
    ("Hardship",                    "hardship"),
    ("Health",                      "health"),
    ("Helping Others",              "helping-others"),
    ("Hijab",                       "hijab"),
    ("Homosexuality",               "homosexuality"),
    ("Hope",                        "about-hope"),
    ("Human Body",                  "human-body"),
    ("Jannah",                      "jannah"),
    ("Prophet Jesus (as)",          "jesus-isa"),
    ("On Justice",                  "justice"),
    ("Verses on Killing",           "on-killing"),
    ("Kindness to others",          "kindness-to-others"),
    ("On Knowledge",                "knowledge"),
    ("Listening to Quran",          "listening-to-quran"),
    ("Love and Marriage",           "love-and-marriage"),
    ("Allah Loves",                 "allah-loves"),
    ("Quran on Love",               "love"),
    ("On Lying",                    "lying"),
    ("Marriage",                    "marriage"),
    ("Mothers",                     "mothers"),
    ("Beauty of Nature",            "nature"),
    ("Not Giving Up",               "never-giving-up"),
    ("Obedience To Parents",        "obedience-to-parents"),
    ("Patience",                    "patience"),
    ("Peace",                       "peace"),
    ("People of the Book",          "people-of-the-book"),
    ("On The Prayer",               "prayer"),
    ("Pregnancy",                   "pregnancy"),
    ("Prophet Hud (as)",            "prophet-hud"),
    ("About Prostitution",          "prostitution"),
    ("Respecting Other Religions",  "respecting-other-religions"),
    ("Respecting Others",           "respecting-others"),
    ("Overcoming Sadness",          "overcoming-sadness"),
    ("About Shirk",                 "shirk"),
    ("On Sin",                      "sin"),
    ("Slander",                     "on-slander"),
    ("Stealing",                    "on-stealing"),
    ("Strength",                    "strength"),
    ("Tyranny",                     "tyranny"),
    ("On The Universe",             "universe"),
    ("Vanity",                      "vanity"),
    ("War",                         "war"),
    ("Wife",                        "wife"),
    ("On Women",                    "women"),
    ("Women's Rights",              "womens-right"),
    ("Yajuj and Majuj",             "yajuj-and-majuj"),
    ("Youth",                       "youth"),
    ("Zulm",                        "zulm"),
    ("Prophet Harun (as)",          "prophet-harun"),
    ("Adoption",                    "adoption"),
    ("Adultery / Fornication",      "adultery-and-fornication"),
    ("Adversity",                   "adversity"),
    ("Angel",                       "angels"),
    ("On Anger",                    "anger"),
    ("Anxiety",                     "anxiety"),
    ("Atheism",                     "atheism"),
    ("Backbiting",                  "backbiting"),
    ("Generosity",                  "generosity"),
    ("Blessings",                   "blessings"),
    ("Brotherhood",                 "brotherhood"),
    ("Business",                    "business"),
    ("Cain and Abel",               "cain-and-abel"),
    ("Charity / Sadaqah",           "charity"),
    ("Chastity",                    "chasity"),
    ("Contentment",                 "contentment"),
    ("Corruption",                  "corruption"),
    ("Creation",                    "creation"),
    ("Cursing",                     "cursing"),
    ("Dawah",                       "dawah"),
    ("Discipline",                  "discipline"),
    ("Divorce",                     "divorce"),
    ("Dunya",                       "dunya"),
    ("Eating Meat",                 "eating"),
    ("Ego",                         "ego"),
    ("Eid",                         "eid"),
    ("Prophet Elijah (as)",         "prophet-elijah"),
    ("Faith",                       "faith"),
    ("Fear Allah (swt)",            "fear-of-allah"),
    ("Forgiveness",                 "forgiveness"),
    ("Good Character",              "good-character"),
    ("Grief",                       "grief"),
    ("Guidance",                    "guidance"),
    ("Hajar",                       "hajar"),
    ("Hajj & Umrah",                "hajj-and-umrah"),
    ("Jahannam / Hell",             "jahannam"),
    ("Humility",                    "humility"),
    ("Hurting Others",              "hurting-others"),
    ("Hypocrites",                  "hypocrites"),
    ("Inheritance",                 "inheritance"),
    ("Intention",                   "intention"),
    ("Jealousy",                    "jealousy"),
    ("Jinn",                        "jinn"),
    ("Judging Others",              "judging-others"),
    ("Kaabah",                      "kaabah"),
    ("Karma",                       "karma"),
    ("Khimar",                      "khimar"),
    ("Leadership",                  "leadership"),
    ("Luqman",                      "luqman"),
    ("Prophet Musa (as)",           "prophet-musa"),
    ("Music",                       "music"),
    ("Nafs",                        "nafs"),
    ("Neighbor",                    "neighbor"),
    ("Nikkah",                      "nikkah"),
    ("Prophet Nuh (as)",            "prophet-nuh"),
    ("Oneness of Allah (swt)",      "oneness-of-allah"),
    ("Orphan",                      "orphan"),
    ("Prophet Adam (as)",           "prophet-adam"),
    ("Prophet Ayyub (as)",          "prophet-ayyub"),
    ("Prophet Ibrahim (as)",        "prophet-ibrahim"),
    ("Provision",                   "provision"),
    ("Qiyam Al-Layl",               "qiyam-al-layl"),
    ("Revenge",                     "revenge"),
    ("Riba (interest)",             "riba"),
    ("Rizq",                        "rizq"),
    ("Shaitan / Satan",             "shaitan"),
    ("Sodomy",                      "sodomy"),
    ("Prophet Suleiman (as)",       "prophet-sulaiman"),
    ("Swearing",                    "swearing"),
    ("Taqwa",                       "taqwa"),
    ("Tawakkul",                    "tawakkul"),
    ("People of Thamud",            "people-of-thamud"),
    ("Quran Verses on the Quran",   "on-the-quran"),
    ("Remembrance of Allah (swt)",  "remembrance-of-allah"),
    ("Trials of Life",              "trials-of-life"),
    ("Truth and Honesty",           "truth-and-honesty"),
    ("Ungratefulness",              "ungratefulness"),
    ("Widows",                      "widows"),
    ("On Wisdom",                   "wisdom"),
    ("Prophet Yaqub (as)",          "prophet-yaqub"),
    ("Zakat",                       "zakat"),
    ("Prophet Zakariya (as)",       "prophet-zakariya"),
    ("Zina",                        "zina"),
    ("Qiyamah",                     "qiyamah"),
    ("Disobedience",                "disobedience"),
    ("Livelihood",                  "livelihood"),
    ("Prophet Dhul Kifl (as)",      "prophet-dhul-kifl"),
    ("Prophet Idris (as)",          "prophet-idris"),
    ("Prophet Isaac (as)",          "prophet-isaac"),
]

TOPIC_CATEGORIES = [
    {"label": "💚 Heart & Emotions",
     "topics": ["Anxiety","Hope","Grief","Overcoming Sadness","On Happiness","Contentment",
                "Jealousy","Ego","Nafs","On Anger","Not Giving Up","Patience"]},
    {"label": "🤲 Connection with Allah",
     "topics": ["Allah is near (qareeb)","Allah knows the unseen","Allah's Mercy","Allah's Protection",
                "Allah Loves","Allah has no son","Oneness of Allah (swt)","Tawakkul","Taqwa",
                "Fear Allah (swt)","Remembrance of Allah (swt)","Guidance","Faith"]},
    {"label": "🕌 Worship & Devotion",
     "topics": ["On The Prayer","Charity / Sadaqah","Zakat","Hajj & Umrah",
                "Quran Verses on the Quran","Listening to Quran","Qiyam Al-Layl","Eid","Kaabah"]},
    {"label": "✨ Character & Ethics",
     "topics": ["On Justice","Truth and Honesty","Kindness to others","Humility","On Wisdom",
                "Forgiveness","About Arrogance","Respecting Others","On Lying","Backbiting",
                "Slander","Hurting Others","Good Character","Strength","Discipline","Intention",
                "Judging Others","On Deception","Cursing","Swearing","Vanity","Ungratefulness","Revenge"]},
    {"label": "👨‍👩‍👧 Family & Relationships",
     "topics": ["Marriage","Love and Marriage","Quran on Love","Mothers","Family Ties / Kinship",
                "Brotherhood","Helping Others","Doing Good to Others","Generosity",
                "Obedience To Parents","Adoption","Divorce","Wife","Nikkah","Widows",
                "Pregnancy","Orphan","Neighbor"]},
    {"label": "🌍 Life & the World",
     "topics": ["Dunya","Provision","Rizq","Livelihood","Blessings","Health","Human Body",
                "Business","Youth","Inheritance","Beauty of Nature","On The Universe","Creation",
                "On Animals","Hardship","About Difficulties","Adversity","Trials of Life",
                "Karma","Luqman","Leadership","On Knowledge"]},
    {"label": "☠️ Death & Afterlife",
     "topics": ["About the grave","Qiyamah","Jannah","Jahannam / Hell"]},
    {"label": "⚖️ Islamic Law & Society",
     "topics": ["Hijab","Khimar","Lowering Gaze","Halal / Permissible","Haram & Forbidden",
                "On Alcohol","Riba (interest)","Stealing","War","Tyranny","Zulm",
                "Adultery / Fornication","Chastity","Homosexuality","Sodomy","About Prostitution",
                "Zina","Verses on Killing","Peace","Compulsion into Religion","Women's Rights",
                "On Women","On Sin","Disobedience","Eating Meat","Music","Corruption"]},
    {"label": "🌟 Theology & Belief",
     "topics": ["Angel","Shaitan / Satan","About Shirk","About Disbelievers","People of the Book",
                "Atheism","Jinn","Hypocrites","Respecting Other Religions","Dawah"]},
    {"label": "📖 Prophets & Stories",
     "topics": ["Prophet Adam (as)","Prophet Ibrahim (as)","Prophet Musa (as)","Prophet Jesus (as)",
                "Prophet Nuh (as)","Prophet Yaqub (as)","Prophet Hud (as)","Prophet Harun (as)",
                "Prophet Suleiman (as)","Prophet Elijah (as)","Prophet Ayyub (as)",
                "Prophet Dhul Kifl (as)","Prophet Idris (as)","Prophet Zakariya (as)",
                "Prophet Isaac (as)","Cain and Abel","Hajar","People of Thamud",
                "Yajuj and Majuj"]},
]


def fetch_verses(slug):
    url = f"https://myislam.org/quran-verses/{slug}/"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            html = r.read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"  ERROR fetching {slug}: {e}")
        return []

    verses = []
    seen = set()
    for m in re.finditer(r'/surah-([^/]+)/ayat-(\d+)/', html):
        name_part = m.group(1)
        ayah = m.group(2)
        surah_num = SURAH_MAP.get(name_part)
        if surah_num:
            key = f"{surah_num}:{ayah}"
            if key not in seen:
                seen.add(key)
                verses.append(key)
    return verses


def build_js_block(topic_verses):
    # TOPIC_CATEGORIES
    cats_json = json.dumps(TOPIC_CATEGORIES, ensure_ascii=False, indent=2)
    cats_code = f"const TOPIC_CATEGORIES = {cats_json};"

    # TOPIC_VERSES
    lines = []
    for name, verses in topic_verses.items():
        lines.append(f"  {json.dumps(name)}: {json.dumps(verses)}")
    verses_code = "const TOPIC_VERSES = {\n" + ",\n".join(lines) + "\n};"

    return (
        "// ── \"What Am I Feeling\" — Topic data ──────────────────────\n"
        "// Topics and verses sourced from myislam.org/quran-verses/ — used with attribution\n\n"
        + cats_code + "\n\n" + verses_code
    )


def update_app_js(new_block):
    src = APP_JS.read_text(encoding="utf-8")

    # Find the block to replace: from the comment header to end of TOPIC_VERSES
    start_marker = '// ── "What Am I Feeling" — Topic data'
    end_marker = "};\n\n// ── Feelings modal"

    start = src.find(start_marker)
    end = src.find(end_marker)
    if start == -1 or end == -1:
        print(f"ERROR: Could not find markers in app.js (start={start}, end={end})")
        return False

    end += len(end_marker)
    new_src = src[:start] + new_block + "\n\n// ── Feelings modal" + src[end:]
    APP_JS.write_text(new_src, encoding="utf-8")
    return True


def main():
    print(f"Fetching {len(TOPICS)} topics from myislam.org...")
    topic_verses = {}

    for i, (name, slug) in enumerate(TOPICS, 1):
        print(f"  [{i:3d}/{len(TOPICS)}] {name}...", end=" ", flush=True)
        verses = fetch_verses(slug)
        topic_verses[name] = verses
        print(f"{len(verses)} verses")
        if i % 10 == 0:
            time.sleep(0.5)  # small pause every 10 to be polite

    empty = [n for n, v in topic_verses.items() if not v]
    if empty:
        print(f"\nWARNING: {len(empty)} topics got 0 verses: {empty}")

    print("\nGenerating JS block...")
    new_block = build_js_block(topic_verses)
    print(f"  Block size: {len(new_block):,} chars")

    print("Updating app.js...")
    if update_app_js(new_block):
        print("✓ app.js updated successfully!")
    else:
        print("✗ Failed to update app.js")


if __name__ == "__main__":
    main()
