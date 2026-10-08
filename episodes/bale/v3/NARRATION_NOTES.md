# v3 narration: Clipchamp voice

## Source
- `Video Project 7.m4a` (29.976 s, AAC 48 kHz stereo). It was found in `FootballVideoStudio\incoming_audio\` and `Downloads\`, not in `episodes\bale\v2\incoming_audio\`.
- A copy is saved as `episodes/bale/v2/incoming_audio/00_full__Video Project 7.m4a`. The originals were left in place.

## How it was split
No speech-recognition or forced-alignment tool is installed. Splitting used:
1. Silence detection (−40 dB, ≥ 0.25 s), which found 12 speech segments.
2. A check that each line's length fits its letter count. The chosen mapping gives every line 0.075–0.118 s per letter. Each alternative put one line at an impossible rate.

| Scene | Source span (s) | Notes |
|---|---|---|
| hook | 0.00–2.00 | |
| c1 | 2.84–6.48 | Includes the 0.34 s comma pause after ساوثهامبتون |
| c2 | 6.90–8.66 | **Uncertain boundary:** the c1/c2 gap is only 0.60 s (other line breaks are about 1 s) |
| c3 | 9.43–13.03 | |
| c4 | 13.82–15.88 | |
| c5 | 16.73–18.41 | |
| c6 | 19.32–22.13 | |
| reveal | 23.00–25.40 | Includes the 0.31 s comma pause before غاريث بيل |
| outro | 26.22–29.06 | **Uncertain:** contains a 1.0 s pause, treated as the "؟" break inside this line |

Each clip has a small fade and is normalized to −16 LUFS. There is no tempo or pitch change; raw and final durations are identical. Raw cuts are in `audio/raw/`.

**Do not run `tts.mjs` on this folder**: it would overwrite these clips with eSpeak.
