# Verification — all requested video types and topics (2026-10-08)

Legend:
- **Template:** working and tested / partially implemented / not implemented.
- **Episode:** complete video / sample only / script only / not produced.

"Sample only" means a playable, verified video with the **unapproved SILMA voice**. It is a preview, not a finished episode. Nobody has listened to it yet: Claude cannot hear audio, so only technical audio checks were done.

| # | Video type / topic | Template | Episode | Config and sources | Canva | Video and measured duration | Missing work / blockers |
|---|---|---|---|---|---|---|---|
| 1 | Guess the player from club transfers (Modrić) | **working and tested** (`transfer-history`, 2–9 clubs) | **sample only** (full-length short; voice unapproved) | `episodes/modric/episode.json`, `sources.md` | https://www.canva.com/d/oNVMJ2IHUP0lzTC (copy of master https://www.canva.com/d/FzYFSpcEXwrh7y7) | `out/modric.mp4`, 54.1 s, 1080×1920 | Approve voice or import Clipchamp narration |
| 2 | Guess from nationality, club, number, position (Salah, season 2024/25) | **working and tested** (`guess-attributes`) | **sample only** | `episodes/salah-attributes/` | none needed (rendered locally in master palette) | `out/salah-attributes.mp4`, 46.7 s, 1080×1920 | Voice approval; second non-Wikipedia source for position |
| 3 | UEFA Champions League: The Greatest Edition (2018/19, criteria stated) | **working and tested** (`story`) | **sample only** (2.3-min condensed edition); full length **script outline only** | `episodes/ucl-2019/`, `narration/FULL_OUTLINE.md` | thumbnail template https://www.canva.com/d/8NX1LYG9TnSBmAW (not yet copied) | `out/ucl-2019.mp4`, 139.5 s, 1920×1080 | Voice approval; story-sample approval before the full 15–18 min |
| 4 | AC Milan: The Berlusconi Revolution | **working and tested** (`club-history`) | **sample only**; full length **outline only** | `episodes/milan-berlusconi/` | thumbnail template (not yet copied) | `out/milan-berlusconi.mp4`, 141.3 s, 1920×1080 | Second itemised source for the 29-trophy breakdown; voice |
| 5 | We Need to Talk About Gareth Bale | **working and tested** (`story`) | **sample only**; full length **outline only** | `episodes/bale-story/` | thumbnail template (not yet copied) | `out/bale-story.mp4`, 147.0 s, 1920×1080 | Voice; full-length research items marked "verify" |
| 6 | The Complete Life Story of Kylian Mbappé | **working and tested** (`story`) | **sample only**; full length **outline only** | `episodes/mbappe-story/` | thumbnail template (not yet copied) | `out/mbappe-story.mp4`, 154.4 s, 1920×1080 | Re-check 2026 World Cup facts (after the model's training data); voice |
| 7 | Tactical analysis of a team under a manager | **working and tested** (`analysis`) | **sample only**; full length **outline only** | `episodes/pep-city-analysis/` | thumbnail template (not yet copied) | `out/pep-city-analysis.mp4`, 114.9 s, 1920×1080 | **Topic corrected:** Pep Guardiola never managed Chelsea → "How Pep turned **Manchester City** into a team every PL club fears". Re-check his May 2026 departure |
| 8 | Guess Who Scored the Goal (Maradona v England 1986) | **working and tested** (`who-scored`, labelled tactical recreation, no footage) | **sample only** | `episodes/who-scored-maradona-1986/` | none needed | `out/who-scored-maradona-1986.mp4`, 56.9 s, 1080×1920 | Voice; recreation is approximate (labelled on screen) |
| 9 | Maradona: The Tragic Genius | **working and tested** (`story`) | **sample only**; full length **outline only** | `episodes/maradona-story/` | thumbnail template (not yet copied) | `out/maradona-story.mp4`, 150.1 s, 1920×1080 | Voice; full-length research items |
| — | 2-minute storytelling test (Modrić) | `story` | **sample only** | `episodes/modric-story/` | https://www.canva.com/d/8NX1LYG9TnSBmAW | `out/modric-story.mp4`, 114.7 s | **Your review gates every full-length render** |

**Complete videos (finished episodes): none.** Every video above is waiting for voice approval (SILMA) or for Clipchamp narration.
**Full-length (15–20 min) episodes: not produced**, as instructed, until the 2-minute storytelling sample is approved.

## What each check proves (all 10 episodes pass)
| Check | Tool | Result |
|---|---|---|
| Container: resolution, h264, AAC audio present and audible, duration within target, timeline = file | `verify.mjs` | PASS ×10 |
| Narration fits its scene without speed-up; source of each line (`tts`/`final`/`draft`) | `verify.mjs` | PASS ×10, all `tts` (SILMA) |
| Countdown exactly 5 s; reveal ≤ 1 s after it (quiz types) | `verify.mjs` | PASS ×3 |
| Text holds still ≥ 3 s after its entrance | `verify.mjs` | PASS ×10 |
| Settled frame from the MP4 = source frame (PSNR ≥ 40 dB) | `verify.mjs` | PASS, min 46.5 dB |
| Mid-transition frame = this scene's own layers only (PSNR ≥ 30 dB), incl. each progressive item | `verify.mjs` | PASS, min ≥ 49.5 dB |
| Arabic text in the rendered page: letters complete, no overflow/crop/overlap, no bad characters, font = Segoe UI | `textcheck.mjs` | PASS ×10 (after the fixes in ARABIC_TEXT_AUDIT.md) |
| Narration intelligibility: speech recognition heard the script (letter match ≥ 80% per line) | `narration.mjs tts` → `audio/tts_report.md` | all lines ≥ 80% after one rewording (pep ch3 title had a dropped word) |
| OCR of final MP4 frames (supporting only) | `ocrcheck.mjs` | 135 frames: median 100% of intended words read, lowest 82% (ucl-2019) |

Not verified by tools: whether the voice sounds natural, and the motion "feel". Claude inspected still frames (including mid-motion frames of the tactical recreation) but did not watch the videos in real time or listen to them.

## Commands actually run (2026-10-08, this machine)
```
node studio/build.mjs episodes/<slug>          # 10 episodes
node studio/textcheck.mjs episodes/<slug>      # 10 episodes, all "text OK"
node studio/narration.mjs script episodes/<slug>
node studio/narration.mjs tts episodes/<slug>  # SILMA + ASR report, 10 episodes
node studio/render.mjs episodes/<slug>         # 10 episodes
node studio/verify.mjs episodes/<slug>         # 10 episodes, all checks PASS
node studio/ocrcheck.mjs episodes/<slug>
node studio/kit-sprites.mjs
node studio/git-status.mjs
```
The `import` path (Clipchamp) was tested earlier with synthetic files (`build_cache/selftest`). The new speech-recognition alignment for full recordings has **not yet been run on a real Clipchamp export**, because none has been supplied for these episodes.
