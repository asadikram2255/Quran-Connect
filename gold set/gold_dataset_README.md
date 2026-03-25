# Small Gold Dataset Starter

Use this to evaluate Quran↔Quran and Quran↔Hadith pairing quality.

## Recommended labels
- `2` = strong match
- `1` = partial / acceptable
- `0` = not a good match
- `-1` = misleading / bad match
- `HN` = hard negative (looks similar by words but should rank low)

## Minimum target size
Start with:
- 15 ayat
- for each ayah, label 3-5 good candidates
- and 3-5 bad or hard-negative candidates

That gives you a useful first evaluation set without becoming too large.

## Best workflow
1. Pick 10-15 anchor ayat with themes you care about.
2. Run your site and collect top semantic results.
3. Mark each returned pair with one of the labels above.
4. Save both good and bad examples.
5. Use the same set every time you change weights or models.

## Suggested anchor ayat
- 2:153 — patience in hardship
- 2:177 — righteousness / sincerity / charity
- 2:222 — repentance and purification
- 3:104 — calling to good
- 4:58 — trusts and justice
- 5:8 — fairness and anti-oppression
- 9:119 — truthfulness
- 24:22 — forgiveness after personal hurt
- 39:53 — repentance after sin
- 49:11 — mockery / dignity
- 49:12 — suspicion / spying / backbiting

## What counts as a hard negative
A result that:
- shares obvious words
- looks plausible at first glance
- but is not actually the same concept or explanatory relationship

These are the most useful examples for tuning.
