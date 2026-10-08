# How FootballVideoStudio works: a guide for maintaining it yourself

You need basic Python and to be able to read JavaScript. Each section answers: what is it for, what goes in and comes out, which file do I edit, an example, how do I test my change, and what usually goes wrong.

## 0. The big picture
```
Discord /guess_player ─▶ bot/main.py ─▶ bot/pipeline.py ─▶ bot/research/* (Wikidata + Wikipedia)
                                              │                    │
                                              │                    ▼
                                              │        episodes/<slug>/episode.json  ◀── you can edit this (the "production plan")
                                              ▼
                       [Approve] ─▶ bot/jobs.py (queue) ─▶ node studio/make.mjs episodes/<slug>
                                                            ├─ build.mjs      template → scenes → PNG frames (Edge)
                                                            ├─ textcheck.mjs  Arabic text checks
                                                            ├─ narration.mjs  voice (SILMA) or your Clipchamp files
                                                            ├─ captions.mjs   word timings → caption sheets
                                                            ├─ render.mjs     FFmpeg: motion, sound, captions → out/<slug>.mp4 + .srt
                                                            └─ verify.mjs     checks → build/report.json
                       bot/delivery.py ◀── report.json ─── the video (or a fitted preview) is posted in the channel
```
Two languages, on purpose:
- **Python** (`bot/`): Discord, the job queue and research.
- **Node.js** (`studio/`): the video engine, which was already working and tested before the bot existed.

They talk through one command (`node studio/make.mjs …`), its `PROGRESS` lines and `report.json`.

---

## 1. Project layout
| Folder | Purpose | In git? |
|---|---|---|
| `bot/` | Discord bot, queue, research (Python) | yes |
| `studio/` | video engine (Node.js) + `asr.py`, `tts_silma.py` | yes |
| `templates/` | `registry.json` (types), `pronunciation.json` (names), `kit/` (art) | yes |
| `episodes/<slug>/` | one video: `episode.json`, `sources.md`, narration, audio, build | config yes; audio/build no |
| `out/` | finished videos (+ `archive/` older versions) | no |
| `tests/` | offline tests | yes |
| `tools/` | FFmpeg, Python venv for voice/ASR, model weights | no |
| `jobs/`, `logs/`, `research_cache/` | bot runtime data | no |

## 2. How a Discord command becomes a job
- **File:** `bot/main.py` → `register_commands()`.
- **Input:** a slash command. **Output:** a job in `bot/jobs.py`.
- Every command first calls `allowed()`, which checks `ALLOWED_USER_IDS`. Research runs in a thread (`asyncio.to_thread`), so Discord never freezes. Rendering runs in a **separate process**, through `JobQueue.submit()`.
- **Example (new command):** copy the `create_video` function, rename it, and change what it calls. Restart the bot. With `DISCORD_GUILD_ID` set, the command appears at once.
- **Test:** add its name to `test_all_slash_commands_are_registered` in `tests/test_bot_offline.py`, then run `.\.venv\Scripts\python.exe -m pytest -q`.
- **Common mistakes:** doing slow work before `interaction.response.defer()` (Discord allows only 3 s); posting `str(exception)` (use `safe()`; details belong in `logs/bot.log`).

## 3. The job queue
- **File:** `bot/jobs.py`.
- **Input:** a command line. **Output:** a `jobs/<id>.json` status file plus `jobs/<id>.log`.
- One job runs at a time and the others wait. Progress comes from `PROGRESS <stage> <percent>` lines. `cancel()` kills the whole process tree. On restart, unfinished jobs become `interrupted`, and `/retry_job` runs them again.
- **Test:** `tests/test_jobs.py` uses a fake engine script, so no rendering is needed.
- **Common mistake:** printing progress without `flush=True` (Python) or buffering it, so updates arrive all at once.

## 4. How the template is chosen
- **Automatic quizzes:** `bot/pipeline.py` → `QUIZ_TYPES`: `transfers` → `builder.transfer_quiz`, `attributes` → `builder.attribute_quiz`, `story` → `builder.story_draft`.
- **Rendering:** `"type"` in `episode.json` picks the expander in `studio/templates.mjs` → `TEMPLATES`.
- The nine requested topics map onto six engine types (see `README.md`). For example, Bale, Mbappé and Maradona all use `story`.

## 5. How research becomes a script (the production plan)
- **Files:** `bot/research/wikidata.py`, `wikipedia.py`, `builder.py`.
- **Input:** a name. **Output:** `episodes/<slug>/episode.json` (not approved) + `sources.md` (+ `narration/RESEARCH.md` for stories).
1. `search_footballers()` finds people whose occupation is "association football player". Several hits → the bot asks you to pick; it never guesses.
2. `get_player()` reads clubs (P54), loans (P1642), shirt numbers (P1618), nationality (P1532/P27) and positions (P413). National and youth teams are dropped.
3. `get_infobox()` reads the English Wikipedia infobox.
4. `cross_check()` labels each fact **verified**, **single-source** or **disputed**. Disputed facts block the Approve button.
5. `transfer_quiz()` / `attribute_quiz()` write the narration from fixed phrases. Numbers become words (`arabic.number_words`).
- **The plan is editable:** open `episode.json`, change any text, years or narration, then render.
- **Example:** to change the clue wording, edit the `say = {...}` dictionary in `builder.transfer_quiz`.
- **Test:** `tests/test_research.py` (recorded API answers in `tests/fixtures/research.json`).
- **Common mistakes:**
  - Trusting a single source. Read `sources.md` before approving.
  - Changing the research code without re-recording the fixtures. Re-record with `.\.venv\Scripts\python.exe -m tests.record_fixtures`.

## 6. How the script becomes scenes
- **File:** `studio/templates.mjs`.
- **Input:** `episode.json`. **Output:** a list of scenes, each with id, layout, seconds, entrance, pops, sound effects and narration.
- **Example:** in `transferHistory`, each club becomes a `clue` scene of 4.3 s with a pop on the card. Change `seconds: s.seconds ?? 4.3` to make clues longer.
- **Layouts** (what a scene looks like) are in `studio/html.mjs`: portrait (`clue`, `attr`, `hint`, `match`, `tactic`, `count`, `reveal`, `revealName`, `ptitle`) and landscape (`title`, `text`, `fact`, `timeline`, `trophies`, `compare`, `formation`, `quote`, `end`).
- **Test:** `node studio/build.mjs episodes/<slug>`, then open `episodes/<slug>/build/frames/*.png`, then `node studio/textcheck.mjs episodes/<slug>`.
- **Common mistakes:**
  - Reversing Arabic by hand. Never do it: Edge shapes it.
  - Forgetting `bdi()` around mixed Latin/number text.
  - Text too long for its box. textcheck reports overflow; shorten the text or use a `.fit` element.

## 7. Narration and pronunciation
- **Files:** `studio/narration.mjs`, `studio/tts_silma.py`, `templates/pronunciation.json`.
- **Input:** the scenes' `narration`. **Output:** `episodes/<slug>/audio/{final,tts,draft}/<scene>.wav`.
- **Priority:** your Clipchamp files (`final`) › SILMA (`tts`) › eSpeak (`draft`) › silence.
- **Pronunciation is two-layered:**
  1. Automatic diacritization (CATT).
  2. The lexicon replaces names with a fixed spelling ending in sukun, so no Arabic case ending is spoken.
  Hand-diacritized words in the script (two or more marks) win over both.
- **SILMA has no SSML or phoneme input.** Control comes from spelling and diacritics only; that is what the lexicon does.
- **Example:** a name read wrongly → add `"غوارديولا": "غْوَارْدِيُولَا"` to `pronunciation.json` → `node studio/narration.mjs tts episodes/<slug>`. Only lines that contain the name are regenerated (cache keys).
- **Check:** `audio/tts_report.md` shows what speech recognition heard. Below 80% (⚠) means listen to that line. The report is evidence, not a replacement for listening.
- **Common mistakes:**
  - Digits in narration (write numbers as words).
  - Very long lines; SILMA is better with sentences under about 25 words.

## 8. Subtitles synchronised with audio
- **File:** `studio/captions.mjs` (uses `studio/align.mjs`).
- **Input:** the narration files. **Output:** `build/captions.json`, caption sheets, and `out/<slug>.srt`.
- Speech recognition gives word timestamps. They are aligned to the **script** words (so spelling is always yours). Missing words get interpolated times.
- Words are grouped into lines of `maxChars`. Each word state is pre-drawn by Edge with the current word in lime and names in gold.
- **Settings in `episode.json`:** `"captions": {"enabled": true, "intensity": "calm"|"lively", "maxChars": 46}`. Defaults: on for landscape documentaries, off for portrait quizzes (their screens are already text).
- If the narration changes after captions were made, render skips the stale captions and says so. Run `make.mjs` again.

## 9. Text animations and transitions
- **File:** `studio/render.mjs` → `videoSegment()`.
- **Rule:** a transition may never mix two different pages' text. Allowed entrances: `cut`, `flash`, `reveal`, `push`. Plus `pops` (a damped bounce of one region), `moves` (sprites along a path, used by the tactical recreation) and progressive `stepFrames` (list items appear as the narration reaches them).
- **Example:** a stronger bounce on clue cards: `POP_CARD = { A: 0.06, … }` in `templates.mjs`; raise `A` to `0.09`.
- **Test:** `node studio/render.mjs episodes/<slug>` then `node studio/verify.mjs episodes/<slug>`. The "mid-transition" check proves the motion frames contain only this scene's own layers.

## 10. Rendering
- **File:** `studio/render.mjs`.
- **Input:** scenes + audio. **Output:** `out/<slug>.mp4` (H.264 CRF 18, AAC 192k), `.srt`, `build/timeline.json`.
- Every scene is rendered to its own cached segment, keyed by a hash of its frames, filters and timing. A re-render only rebuilds what changed.
- Scene length = max(planned seconds, narration + lead + tail). Speech is never sped up.
- **Reduce render time:**
  - Edit only what you need (the cache does the rest).
  - Use `--skip-render` (frames only) or `/preview` while iterating.
  - Narration is the slowest step on the first run; it is cached afterwards.

## 11. Delivery to Discord
- **File:** `bot/delivery.py`.
- If the file is under `MAX_UPLOAD_MB` (default 10), the bot uploads it. Otherwise it encodes a 720p preview sized to fit, and the full file stays in `out\`. Previews that would be unwatchable (very long videos) are not sent.

## 12. Creating a new template
See [TUTORIAL_TEMPLATES.md](TUTORIAL_TEMPLATES.md) (step-by-step, with a worked example).

## 13. Troubleshooting
See [SETUP_WINDOWS.md](SETUP_WINDOWS.md) §6. First look at `episodes/<slug>/build/report.json` → `errors` and the failing stage's `tail`.

## 14. Adding voices and media sources
- **Another voice for SILMA:** record about 8 s of clean speech (your own or with written permission). Then set `"voice": {"ref": "narration/myvoice.wav", "refText": "<exact words spoken>"}` in `episode.json`.
- **Clipchamp:** `node studio/narration.mjs script …`, export, put the files in `narration/incoming/`, then `node studio/narration.mjs import …`.
- **A new TTS engine:** write a script like `studio/tts_silma.py` that reads a jobs JSON and writes WAVs. Call it from `narration.mjs` in a new command, and write into `audio/tts/` (or a new folder added to `voice.prefer`). Check its license first.
- **Media:** photos must have a verified reusable license (`ATTRIBUTION.md` + on-screen `credit`). The `text` layout takes `"image": "assets/x.jpg"`.

## 15. Run, test, deploy
- **Tests:** `.\.venv\Scripts\python.exe -m pytest -q`. The engine checks are `textcheck.mjs` and `verify.mjs` on a real episode.
- **Deploy:** [DEPLOYMENT.md](DEPLOYMENT.md).
- **Costs:** zero today; nothing paid is used.
