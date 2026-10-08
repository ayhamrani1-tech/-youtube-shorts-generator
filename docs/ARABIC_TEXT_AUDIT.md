# Arabic text audit (2026-10-08)

## How text is checked
| Layer | Tool | What it proves |
|---|---|---|
| Source strings | `studio/textcheck.mjs` (static rules) | No presentation forms (pre-shaped/reversed text), no bidi control marks, no tatweel, no doubled spaces, no Latin letter glued to an Arabic letter, no stray or stacked diacritics |
| Rendered page (DOM) | `studio/textcheck.mjs` (headless Edge, same HTML and fit script as the build) | Every intended Arabic letter sequence is present in the rendered text. Nothing overflows its box after shrink-to-fit, nothing is cropped at the frame edge, no two text blocks overlap. Font in use: Segoe UI (full Arabic coverage) |
| Final MP4, settled frames | `studio/verify.mjs` | Each scene's settled frame from the MP4 equals its source PNG (PSNR ≥ 40 dB; measured 47.5–54 dB) |
| Final MP4, during motion | `studio/verify.mjs` | Each transition's mid-frame equals the same filter applied to this scene's own layers only (PSNR ≥ 30 dB; measured ≥ 49.5 dB). No other page's text can be present |
| Final MP4, OCR | `studio/ocrcheck.mjs` (Windows OCR ar-SA) | Supporting evidence only: share of intended words that OCR also reads |

Strings are never reversed by hand. Chromium/HarfBuzz shapes, joins and orders the text. Latin and number runs are isolated with `<bdi>`.

## Defects found and fixed

| # | Where | Scene and time | Before | Cause | Fix (at the source) | After (verified in final MP4) |
|---|---|---|---|---|---|---|
| 1 | `out/bale_v2.mp4`, `out/bale_v3_clipchamp.mp4` (legacy) | c2–c6 at 7.9–29.7 s (wipeleft), n5 at 29.7 s (wipeup), reveal at 35.6 s (circleopen), c1/outro (slides) | Chimeric words during transitions: «توتنهمبتون», «ريال مهام», «توتنهدريد», wrong year pairs, «؟ / من هو؟» blended into «غاريث بيل» | Wipe/circle/slide transitions mixed two pages' text | Engine default: only cut+pop, white flash, own-layer reveal, push. Pops switch off after settling | `out/bale_v3_textfix.mp4`; all new episodes. Details: `episodes/bale/v3/TEXTFIX_NOTES.md` |
| 2 | Earlier `story` builds | text/timeline years | «2025 – الآن» read in the wrong order | A range containing an Arabic word was forced LTR | `ydir()`: LTR only for purely numeric ranges | modric-story frames |
| 3 | `who-scored-maradona-1986` reveal (first build) | reveal, ~52 s | «فازت الأرجنتين –2 / 1، ثم…»: the score split across a line break | A number run inside `<bdi>` was allowed to wrap | `bdi { white-space: nowrap }` in `studio/html.mjs` | «2–1» on one line. Before/after: `docs/text-audit/who-scored_reveal_before_after.png` |
| 4 | `milan-berlusconi` trophies (first build) | ch4_s2, ~132 s | «…عند بيع النادي ((2017» | The Latin-run regex swallowed the closing bracket, so the brackets could not mirror | The run may include a whole parenthesised Latin group, never a lone «)» | «(2017)». Before/after from the final MP4: `docs/text-audit/milan_ch4_s2_before_after.png` |
| 5 | `bale-story` fact (first build) | ch1_s2 | «2011 · 2013» wrapped onto two lines over the label | The big value was not shrink-to-fit | Fact values are single-line `.fit` | textcheck: no overlap |
| 6 | `salah-attributes` | a3 | «11» touching its label and the season note | Value line box overlapped the neighbours | Value moved down; size 140 | textcheck: no overlap |
| 7 | `maradona-story` quote card | ch6_s2 | Decorative quote mark overlapping the quote | Position | Mark centred above the text | textcheck: no overlap |

Checked and found correct (no change needed): the score order on the match card (home team on the right, «الأرجنتين 2 – 1 إنجلترا»), «(1–0 على إنتر)», «المحطة ٣ من ٧», the mirrored «؟», «لوس أنجلوس إف سي — LAFC», and every Canva export (Bale v2 audit).

## Current status
`node studio/textcheck.mjs episodes/<slug>` reports **no issues** for all 10 episodes. `node studio/verify.mjs episodes/<slug>` passes for all 10, including the transition check.
Canva-rendered pages (Modrić cover, mystery and outro) are compared at full resolution through PSNR. Their text is set in Canva and was checked visually when they were exported.
