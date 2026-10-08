# Windows setup (tested on this PC: Windows 11, i5-13420H, 7.6 GB RAM, RTX 3050 Laptop 6 GB)

All commands run in **PowerShell** from the project folder:
```powershell
cd C:\Users\User\Desktop\FootballVideoStudio
```

## 1. What is needed
| Component | Why | Where it lives | Check |
|---|---|---|---|
| Node.js 20+ | the video engine (`studio/*.mjs`) | system install (this PC: 24.21) | `node --version` |
| Microsoft Edge | draws every Arabic text page (correct shaping) | built into Windows | — |
| FFmpeg 9 | video/audio | `tools\ffmpeg-9.0.2-essentials_build\bin` (already here) | `tools\ffmpeg-9.0.2-essentials_build\bin\ffmpeg.exe -version` |
| Python 3.11+ | the Discord bot + research | your install: `%LOCALAPPDATA%\Programs\Python\Python314` | `py --version` |
| Voice + speech recognition (optional, GPU) | SILMA TTS, faster-whisper | `tools\tts-venv` (already here, ~11 GB with models) | `tools\tts-venv\Scripts\python.exe -c "import torch; print(torch.cuda.is_available())"` |

If `node` is not found: install the LTS version from https://nodejs.org and open a new PowerShell window.

## 2. Bot environment (once)
```powershell
py -m venv .venv
```
```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```
You do not need to "activate" the venv; just call `.\.venv\Scripts\python.exe`. If you prefer to activate it:
`.\.venv\Scripts\Activate.ps1`. If PowerShell blocks scripts, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.

## 3. Secrets: `.env`
1. **Reset your bot token first.** The old one was written in `bot.py` and must be treated as leaked:
   Discord Developer Portal → Applications → your bot → **Bot** → **Reset Token**.
2. Copy the template, then edit it in Notepad:
   ```powershell
   Copy-Item .env.example .env
   ```
   ```powershell
   notepad .env
   ```
   Fill `DISCORD_TOKEN`, `ALLOWED_USER_IDS` (your Discord user ID) and optionally `DISCORD_GUILD_ID` (your test server).
3. `.env` is listed in `.gitignore`, so it is never committed. Do not paste the token into code or Discord.
4. Delete or empty the old `bot.py` once you have reset the token. It is not used any more and is ignored by git.

## 4. Invite the bot to your test server
Developer Portal → OAuth2 → URL Generator: scopes **bot** + **applications.commands**; bot permissions **Send Messages**, **Attach Files**, **Embed Links**, **Read Message History**. Open the generated URL and pick your test server.
No privileged intents are needed (the bot uses slash commands only).

## 5. Run
| What | Command |
|---|---|
| Tests (offline, no Discord, no internet) | `.\.venv\Scripts\python.exe -m pytest -q` |
| A local test video without Discord | `.\.venv\Scripts\python.exe -m bot.cli research "Luka Modric" --quiz transfers` then `.\.venv\Scripts\python.exe -m bot.cli render luka-modric-transfers` |
| Render an existing episode | `node studio/make.mjs episodes/modric` |
| Start the Discord bot | `.\.venv\Scripts\python.exe -m bot.main` |

The finished video is in `out\<slug>.mp4`, with `out\<slug>.srt` subtitles when captions are on. The production report is `episodes\<slug>\build\report.json`.

## 6. Logs and diagnosis
| File | Contains |
|---|---|
| `logs\bot.log` | bot events and full error details (never shown in Discord) |
| `jobs\<id>.json` / `jobs\<id>.log` | one job's status and the full engine output |
| `episodes\<slug>\build\report.json` | stages, timings, checks, warnings |
| `episodes\<slug>\build\textcheck.md`, `ocrcheck.md`, `audio\tts_report.md` | Arabic text, OCR and narration checks |
| `episodes\<slug>\build\check\*.jpg` | still frames taken from the final video |

Common problems:
| Symptom | Fix |
|---|---|
| `DISCORD_TOKEN is missing` | create `.env` (step 3) |
| Slash commands do not appear | set `DISCORD_GUILD_ID` (instant), or wait up to an hour for global sync; re-invite with `applications.commands` |
| "You are not allowed" | add your user ID to `ALLOWED_USER_IDS` |
| `screenshot failed` / textcheck "probe failed" | Edge is blocked or updating: close all Edge windows or reboot; run `node studio/build.mjs episodes/modric` |
| `CERTIFICATE_VERIFY_FAILED` | antivirus HTTPS scanning; already handled in `bot/research/http.py`. If it persists, check the system clock |
| SILMA/Whisper `CUDA` errors | update the NVIDIA driver; check with the torch command in §1 |
| Render failed: `check failed: duration` | narration made the video longer than `targetSeconds`; widen it in `episode.json` |

## 7. Updating safely
```powershell
git pull
```
```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```
```powershell
.\.venv\Scripts\python.exe -m pytest -q
```
Then render one known episode (`node studio/make.mjs episodes/salah-attributes`) and compare its `report.json` with the previous one before relying on the update.
