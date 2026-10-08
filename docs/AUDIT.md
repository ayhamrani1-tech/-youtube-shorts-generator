# Project audit (2026-10-08)

Inspected on this machine: every file in `studio/`, `scripts/`, `templates/`, `episodes/*/episode.json`, `docs/`, the new `bot.py`, the `tools/` folder and both Python installations. Where something was *tested*, the command is given.

## 1. The project is two different things today

| Part | Language | Status |
|---|---|---|
| **Video engine** `studio/*.mjs` (≈1,400 lines) | Node.js + FFmpeg + headless Edge; Python helpers for voice (`tts_silma.py`) and speech recognition (`asr.py`) | **Working.** 6 template types, 10 episodes rendered and verified (see `docs/VERIFICATION.md`) |
| **Discord bot** `bot.py` (61 lines, added by you today) | Python 3.14 + discord.py 2.7.1 + gTTS 2.5.4 + MoviePy 1.0.3 | **Broken** (details below) |

It is not a Python project yet: the rendering pipeline is JavaScript. The two parts are not connected.

## 2. Current architecture (engine)
```
episode.json ──build.mjs──▶ scenes.json + PNG frames (Edge renders Arabic correctly)
                │
narration.mjs ──┤ script → SCRIPT.md (for Clipchamp)
                │ tts    → SILMA local voice + speech-recognition check
                │ import → Clipchamp files, split by speech recognition
                ▼
render.mjs ──▶ per-scene cached video+audio segments ──▶ out/<slug>.mp4
verify.mjs / textcheck.mjs / ocrcheck.mjs ──▶ quality reports
```
Entry points: the individual `node studio/<step>.mjs episodes/<slug>` commands. There is no single "make video" command and no job system.

## 3. Feature status

| Feature | Status | Evidence |
|---|---|---|
| Portrait 1080×1920 and landscape 1920×1080 | working | `verify.mjs` on 10 episodes |
| Templates: transfers, attributes, who-scored, story, club-history, analysis | working (sample episodes) | `docs/VERIFICATION.md` |
| Arabic shaping, RTL, mixed text, overflow and overlap checks | working | `textcheck.mjs`, `docs/ARABIC_TEXT_AUDIT.md` |
| Transitions that never mix two pages' text | working | mid-transition PSNR check |
| Progressive reveal of list items in step with narration | working | `verify.mjs` |
| Local Arabic TTS (SILMA, GPU) + pronunciation lexicon | working, **voice not approved by you** | `audio/tts_report.md` |
| Speech-recognition alignment (faster-whisper, word timestamps) | working | synthetic test, 7/7 boundaries exact |
| Sound effects (whoosh, tick, chime), loudness normalisation | working | `render.mjs` |
| Background music + ducking | **missing** | — |
| Word-by-word subtitles / kinetic captions | **missing** (word timestamps exist, no caption renderer) | — |
| English narration | **missing** (SILMA is bilingual, untested) | — |
| Automatic research | **missing**: facts were researched by Claude in-session and written into `sources.md` | — |
| Automatic script writing | **missing**: scripts were written by Claude in-session | — |
| Automatic media collection | **missing**: one licensed photo per episode, added by hand | — |
| Club logos, flags | **missing**: logos are trademarks; licensed sources are needed | — |
| Production plan as an editable stage | partial: `episode.json` *is* the editable plan, but nothing generates it automatically | — |
| Discord bot | **broken** | see §4 |
| Job queue, progress, cancel, retry | **missing** | — |
| Tests (unit/offline) | **missing**: only end-to-end verification scripts | — |
| `.env` / secrets handling | **unsafe** (token hard-coded in `bot.py`) | — |
| `requirements.txt` / `package.json` | **missing** | — |

## 4. `bot.py` problems (tested 2026-10-08)
1. **Security:** a real Discord bot token is hard-coded on line 62. It must be reset in the Discord Developer Portal and moved to `.env`. It has **not** been committed.
2. **Crashes on every request:** `TextClip` needs ImageMagick, which is not installed.
   Test: `python -c "from moviepy.editor import TextClip; TextClip('test', fontsize=40, color='white')"` → ImageMagick error.
3. **Arabic would render broken anyway:** MoviePy/ImageMagick text does not shape Arabic or lay out RTL. That is the bug class this project already fixed by rendering text in Edge.
4. **Blocks the bot:** `write_videofile` runs inside the async command, so Discord interactions freeze during a render and the bot may disconnect.
5. **Shared output names** (`voice.mp3`, `output_video.mp4`): two simultaneous requests overwrite each other.
6. **Leaks internals:** `str(e)` is posted to the channel.
7. **No research:** the "script" is one fixed sentence.
8. **gTTS** uses Google Translate's unofficial endpoint: robotic voice, unclear terms for commercial use, needs internet.
9. **MoviePy 1.0.3** is the legacy API (`moviepy.editor` was removed in MoviePy 2.x).
10. No upload-size handling (Discord's free limit is 10 MB for bots in most servers; longer videos exceed it).

Recommendation: keep `discord.py` (maintained, already installed), replace the rest of `bot.py` with a thin bot that hands jobs to the existing engine.

## 5. Dependencies found
- Node.js 24.21 (system), FFmpeg 9.0.2 (`tools/`), Edge (system)
- Python 3.14.8 at `%LOCALAPPDATA%\Programs\Python\Python314` (yours: discord.py, gTTS, MoviePy, Pillow). **Not on PATH** in this shell.
- Python 3.11 venv `tools/tts-venv` (mine: PyTorch 2.6 CUDA, SILMA, faster-whisper)
- Hardware: i5-13420H, 7.6 GB RAM, RTX 3050 Laptop 6 GB

## 6. Technical risks
- **Automatic research and script writing need a language model.** A good one is either paid (e.g. the Claude API, which is billed separately from Claude Pro) or local and much weaker on 6 GB VRAM. **This is your decision.**
- Football footage and club logos are copyrighted or trademarked. "Publicly visible" is not "reusable" (your own rule). Automatic media must come from licensed sources (Wikimedia Commons with license metadata, your own uploads).
- A Discord bot on this laptop stops when the laptop sleeps.
- The 2-minute story sample is still awaiting your review before any 20-minute render.

## 7. Prioritised plan (milestones; each is finished and tested before the next)
1. **M1, secure baseline:** keep `bot.py` out of git; push the verified engine to GitHub; `.env.example`; `requirements.txt` / `package.json`.
2. **M2, one-command pipeline:** `studio/make.mjs` runs build → textcheck → tts → render → verify and writes a JSON production report (the contract the bot uses).
3. **M3, Discord bot (Python):** slash commands `/templates /create_video /guess_player /player_story /goal_quiz /job_status /cancel_job /preview /help`; a background job queue (one render at a time, cancellable, persistent on disk); size-aware delivery; safe error messages; offline tests with a fake Discord client.
4. **M4, structured research (free, no key):** Wikidata + Wikipedia APIs for clubs and dates, nationality, position, shirt number, with source URLs and retrieval dates. Enough to auto-build *transfer* and *attribute* quizzes. Ambiguous names stop and ask.
5. **M5, captions:** word-by-word highlighted Arabic/English subtitles from the existing word timestamps, rendered by Edge (RTL-safe), with intensity presets per template.
6. **M6, music and ducking:** licensed/royalty-free music folder, sidechain ducking, loudness to −14 LUFS for YouTube.
7. **M7, documentary scripts:** depends on your LLM decision (§6). Without an LLM, the bot creates the research pack and an editable plan, and you (or Claude Code) write the narration.
8. **M8, media providers:** Wikimedia Commons search with license filtering, plus "upload your own asset" through Discord.
9. **M9, teaching material:** module-by-module guide, template tutorial, Windows setup, deployment options.

## 8. Decisions needed from you
- Template 7: *Pep + Manchester City* or *Chelsea under a specific manager*? (Pep never managed Chelsea.) The current sample uses Man City; it will not be treated as final until you choose.
- Template 3: which Champions League season? The sample uses 2018/19 as a candidate.
- Reference videos for the editing style: none are in the project. Please send URLs or files.
- Language model for automatic research and scripts: paid API, local model, or semi-automatic.
- A new Discord bot token (after the reset), and a test server where the bot may post.
