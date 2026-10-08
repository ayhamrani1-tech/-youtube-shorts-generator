# FootballVideoStudio

Arabic football videos (Shorts 9:16 and YouTube 16:9), made by a local engine and controlled from Discord.
Free tools only: FFmpeg, Microsoft Edge, Node.js, Python, Wikidata/Wikipedia, SILMA TTS, faster-whisper. **No paid APIs.**

```
/guess_player name:"Luka Modric" quiz:Transfers
   → facts from Wikidata + Wikipedia, each marked verified / single-source / disputed
   → plan card in Discord → [Approve & render]
   → narration (local voice) → captions → render → automatic checks → video posted in the channel
```

## Start here
| I want to… | Read |
|---|---|
| install and run it on Windows | [docs/SETUP_WINDOWS.md](docs/SETUP_WINDOWS.md) |
| understand every module (and change it safely) | [docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md) |
| create or modify templates myself | [docs/TUTORIAL_TEMPLATES.md](docs/TUTORIAL_TEMPLATES.md) |
| know what works and what is missing | [docs/LIMITATIONS.md](docs/LIMITATIONS.md) · [docs/AUDIT.md](docs/AUDIT.md) |
| keep the bot running | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| Arabic operating guide | [docs/دليل_التشغيل.md](docs/دليل_التشغيل.md) |
| QA evidence | [docs/VERIFICATION.md](docs/VERIFICATION.md) · [docs/ARABIC_TEXT_AUDIT.md](docs/ARABIC_TEXT_AUDIT.md) · [docs/voice-audition/](docs/voice-audition/README.md) |

## Quick start (Windows PowerShell, in this folder)
```powershell
py -m venv .venv
```
```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```
```powershell
.\.venv\Scripts\python.exe -m pytest -q
```
```powershell
.\.venv\Scripts\python.exe -m bot.cli research "Luka Modric" --quiz transfers
```
```powershell
.\.venv\Scripts\python.exe -m bot.cli render luka-modric-transfers
```
```powershell
Copy-Item .env.example .env
```
```powershell
.\.venv\Scripts\python.exe -m bot.main
```
- **Tests:** the pytest step runs 28 offline tests (no network, no Discord).
- **CLI research and render:** a local video without Discord, written to `out\luka-modric-transfers.mp4`.
- **`.env`:** put your **new** bot token in it before starting the bot.

## Templates (engine types)
| Type | Size | Example episode | From a name in Discord |
|---|---|---|---|
| `transfer-history`: guess the player from transfers | 1080×1920 | `modric`, `luka-modric-transfers` | ✅ automatic |
| `guess-attributes`: nationality / club / number / position | 1080×1920 | `salah-attributes` | ✅ automatic |
| `who-scored`: labelled tactical recreation + hints | 1080×1920 | `who-scored-maradona-1986` | written by hand |
| `story`: biographies and documentaries (up to ~20 min) | 1920×1080 | `mbappe-story`, `bale-story`, `maradona-story`, `ucl-greatest-debate` | skeleton + research pack |
| `club-history` | 1920×1080 | `milan-berlusconi` | written by hand |
| `analysis`: explicit comparison criteria | 1920×1080 | `chelsea-mourinho-analysis` | written by hand |
| `top-list`: countdown of records (tutorial example) | 1920×1080 | `records-top5` | written by hand |

All rendered videos so far are **previews**: the automatic voice is not yet approved by you.

## Discord commands
`/guess_player` · `/player_story` · `/goal_quiz` · `/create_video` · `/preview` · `/templates` · `/episodes` · `/job_status` · `/cancel_job` · `/retry_job` · `/help`

## Engine commands (Node.js)
```powershell
node studio/make.mjs episodes/<slug>
```
That runs build → textcheck → narration → captions → render → verify and writes `episodes/<slug>/build/report.json`.
The steps can also be run one by one: `node studio/build.mjs | textcheck.mjs | narration.mjs <script|tts|import|draft> | captions.mjs | render.mjs | verify.mjs | ocrcheck.mjs  episodes/<slug>`.

## Canva
| Design | Link |
|---|---|
| Master transfer template (copy per episode, never edit) `DAHXWMJz0OY` | https://www.canva.com/d/FzYFSpcEXwrh7y7 |
| Style kit `DAHXW4ID8t0` | https://www.canva.com/d/BEQl_Usw6USqFSg |
| Modrić episode pages `DAHXWxLVlU0` | https://www.canva.com/d/oNVMJ2IHUP0lzTC |
| Story thumbnail `DAHXWz8LU_o` | https://www.canva.com/d/8NX1LYG9TnSBmAW |

Automatic episodes do not need Canva: every page is drawn locally in the same style.

## Repository rules
- **Secrets:** only in `.env` (git-ignored). The old `bot.py` contained a token and is git-ignored. Reset that token.
- **Kept local, not in git:** videos, audio, tools and models, and runtime data (`jobs/`, `logs/`, `research_cache/`). See [docs/MEDIA.md](docs/MEDIA.md).
- **Legacy Bale pilot:** `scripts/*.mjs` + `episodes/bale/{,v2,v3}` are kept unchanged.
