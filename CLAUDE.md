# FootballVideoStudio

## Goal
A reusable studio for Arabic football videos: short portrait quizzes (1080×1920) and long landscape stories (1920×1080, up to ~20 min, chapters).
Canva holds the visual identity and each episode's own pages. The `studio/` engine renders data-driven scenes locally (headless Edge), syncs narration, and renders with FFmpeg.

## Budget (hard rule)
- No spending beyond the user's existing Claude Pro subscription. No trials, upgrades, Pro elements or paid APIs/keys.
- Canva: only features included in the account. A tool being available doesn't prove the plan includes it.

## Working rules
- Never edit or delete Canva designs this project didn't create. Never edit the master `DAHXWMJz0OY` in place: copy pages per episode.
- Verify facts from at least two sources and record them in `episodes/<slug>/sources.md`. Photos must have a verified reusable license (CC BY / CC0 with clear provenance); record them in `ATTRIBUTION.md` with an on-screen credit. Wikimedia blocks Canva's URL import, so the video composites photos locally.
- Arabic text is rendered by Canva or by Chromium (headless Edge, `studio/html.mjs`). Both shape correctly. Never use FFmpeg drawtext and never reverse strings by hand. Isolate LTR runs with `<bdi>`. Year ranges: numeric → LTR; with an Arabic word ("2025 – الآن") → RTL.
- Transitions must never mix two pages' text (an old bug: wipes created fake words like "توتنهمبتون"). Allowed: `cut` + region pops, `flash` (white), `reveal` (text layer over its own background), `push` (zoom on one page). Pop overlays switch off when settled.
- Narration: final voice = **manual Clipchamp export** (`narration.mjs import`) OR the local SILMA voice (`narration.mjs tts`) **once the user approves it by ear**. eSpeak (`draft`) is only for timing. SILMA output is a preview until approved; its bundled reference voice has undocumented provenance (not cleared for publishing). Never claim narration is final or that Claude listened. Never speed up speech; scenes stretch.
- Pronunciation: `templates/pronunciation.json` (names end in sukun); diacritize ambiguous words in the script (≥2 marks wins over auto-diacritization). Check `audio/tts_report.md` (ASR round trip).
- Do NOT use Piper `ar_JO-kareem` (unlicensed dataset). Any new voice needs clear terms first.
- Verify every render with `studio/textcheck.mjs` + `studio/verify.mjs` (settled + mid-transition frames) and look at the check frames before reporting. `studio/ocrcheck.mjs` is supporting evidence only.
- Facts: only list sources that were actually opened; anything after June 2026 needs a web source.
- Git: repo https://github.com/ayhamrani1-tech/-youtube-shorts-generator (note the leading hyphen), branch `main`. Commit/push only when the user asks; never force-push. Videos/audio/tools stay local (docs/MEDIA.md).
- No dashboards or publishing systems.

## Layout
- `studio/` — engine: `build.mjs`, `textcheck.mjs`, `narration.mjs` (script/import/draft/tts), `render.mjs`, `verify.mjs`, `ocrcheck.mjs` + `ocr.ps1`, `tts_silma.py`, `asr.py`, `git-status.mjs`, `templates.mjs` (6 types), `html.mjs` (layouts), `lib.mjs`.
- `templates/registry.json` — video types (working vs planned) and Canva IDs. `templates/kit/` — style-kit PNGs. `templates/planned/` — example configs for planned types.
- `episodes/<slug>/` — `episode.json`, `sources.md`, `ATTRIBUTION.md`, `canva/` (exports), `assets/`, `narration/` (SCRIPT.md, incoming/), `audio/final|draft/`, `build/` (generated).
- Legacy Bale pipeline: `scripts/*.mjs` + `episodes/bale/{,v2,v3}` (kept for reproducibility).
- Guides: `docs/دليل_التشغيل.md` (Arabic), `README.md`.
