# Arabic text fix: bale_v3_textfix

## Finding
- The static Arabic text was correct on all 15 pages, checked character by character at full resolution against `episode.json` and the Canva v2 design `DAHXWMJz0OY`. That covers letters, joining, the lam-alef ligature, shadda, RTL order, digits, parentheses, `؟`/`!`/`—`, and cropping.
- The defects came from **transitions** in `render_v2.mjs`:
  - `wipeleft` and `wipeup`: a hard wipe edge passed through words, joining half of the old page to half of the new one. Examples: "توتنهمبتون", "ريال مهام", "توتنهدريد", and wrong years "2006 – 2013" / "2013 – 2021".
  - `circleopen`: its soft edge blended "؟ / من هو؟" into "غاريث بيل".
  - `slideleft` / `slideup`: lines were cut at the seam between two pages.
  - The settled bounce overlay was rescaled every frame, which slightly softened text edges.
- No defect came from the Canva export, the font, glyphs, or shaping. The frames were not changed and nothing was re-exported.

## Fix (`episode_textfix.json`, `render_v2.mjs` options)
- Clue entrances, cover→clue 1, clue 6→countdown, reveal→closing: a hard `cut`, then a whole-region bounce. The card and current row bounce at 1.06×; the closing pill at 1.10×.
- Countdown→mystery and mystery→reveal: `fadewhite`, which only mixes one page with white.
- Name-card bounce capped at 1.12×, so the card (960 px wide) stays inside the 1080 px frame.
- Each bounce overlay switches off after it settles (6/k seconds), so hold frames are the untouched page. Hold frames score 49–54 dB PSNR against the source PNGs, versus about 50 dB in v3.
- Narration lead is kept at 0.55 s, so scene and narration timing match v3 exactly.
