# Running the bot continuously

The bot is light. **Rendering is heavy**: Edge for text pages, FFmpeg encoding, and optionally the GPU voice and speech recognition. Where you run it is mostly a question of where rendering can happen.

## What the system needs
| Resource | Short quiz (≈1 min) | Documentary preview (≈2.5 min) | 20-min documentary (estimate) |
|---|---|---|---|
| Time on this PC | ≈2–4 min | ≈4–8 min | ≈30–60 min |
| Disk per output | 4–8 MB video + ≈40 MB build cache | 6–8 MB + ≈70 MB cache | ≈60–150 MB + ≈500 MB cache |
| GPU | optional (voice + captions) | optional | optional |

Measured here: Salah quiz 71 s end to end; Modrić auto quiz 193 s, including research and voice. The 20-minute figures are estimates (not rendered yet).
The build cache (`episodes/*/build`) can be deleted at any time; it is rebuilt.

## Option A: this laptop (free, works today)
- Keep it awake while the bot runs: Settings → System → Power → Screen and sleep → *Never* when plugged in.
- Start the bot at log-on: Task Scheduler → Create Task → Trigger *At log on* → Action:
  `C:\Users\User\Desktop\FootballVideoStudio\.venv\Scripts\python.exe` with argument `-m bot.main` and "Start in"
  `C:\Users\User\Desktop\FootballVideoStudio`.
- Risks: sleep, Windows updates and reboots stop the bot. Unfinished jobs come back as **interrupted**; use `/retry_job`.

## Option B: an always-on home PC (one-off hardware cost)
Same setup as A on a desktop or mini-PC that never sleeps. An NVIDIA GPU with ≥6 GB is needed only for the local voice and captions. Electricity is the ongoing cost.

## Option C: a cloud server (monthly cost, not set up)
- A small CPU-only Linux VPS can run the **bot and research**, but the engine is **Windows-specific today**:
  - it renders through Microsoft Edge (`studio/lib.mjs`, `EDGE` path);
  - OCR uses Windows OCR (`studio/ocr.ps1`);
  - cancelling uses `taskkill`.
  Porting means configuring Chromium on Linux and skipping the OCR check. That is about a day of work, and it should be tested.
- The voice and speech recognition on CPU would be far slower. Cloud GPUs bill by the hour and are expensive; this conflicts with your no-paid-services rule.
- **Ask before choosing this.** It creates a paid account. Prices change, so check the provider's current pricing.

## Recommended now
Run the bot on this laptop (A). Treat Discord as the remote control and the PC as the studio. Finished videos stay in `out\`. When a file is over Discord's limit, the bot posts a fitted preview, and the full file stays on the PC.

## Job persistence and recovery
- Every job is a JSON file in `jobs\`, so status survives restarts. A job that was running during a crash is marked `interrupted`.
- Renders are cached per scene, so a retried job reuses finished scenes and is much faster.
- Back up `episodes\` (your scripts, sources and approvals). Everything in `out\`, `build\` and `jobs\` can be regenerated.

## Costs
Currently **zero**: Discord bots, Wikidata/Wikipedia, FFmpeg, Edge, SILMA, faster-whisper and the GitHub free plan cost nothing. The only paid options (cloud GPU, a paid language model) are **not** used and would need your approval.
