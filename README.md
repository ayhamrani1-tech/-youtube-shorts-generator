# FootballVideoStudio

Arabic football videos built from free local tools (FFmpeg, headless Edge, SILMA TTS, faster-whisper) and Canva designs.
- **Arabic operating guide:** [docs/دليل_التشغيل.md](docs/دليل_التشغيل.md)
- **Status of every requested video:** [docs/VERIFICATION.md](docs/VERIFICATION.md)

## Video types (all six have a working template and a verified sample)
| Type | Size | Sample episode |
|---|---|---|
| `transfer-history`: guess the player from his transfers (2–9 clubs) | 1080×1920 | `episodes/modric` |
| `guess-attributes`: nationality, club, number, position, with a stated reference season | 1080×1920 | `episodes/salah-attributes` |
| `who-scored`: match card + labelled tactical recreation (no footage) + hints | 1080×1920 | `episodes/who-scored-maradona-1986` |
| `story`: biographies and documentaries, chapters, up to ~20 min | 1920×1080 | `episodes/modric-story` (2-min test), `mbappe-story`, `bale-story`, `maradona-story`, `ucl-2019` |
| `club-history` | 1920×1080 | `episodes/milan-berlusconi` |
| `analysis` (explicit criteria, compare and formation scenes) | 1920×1080 | `episodes/pep-city-analysis` |

All samples use the **unapproved** SILMA voice. They are previews until you approve the voice or import Clipchamp narration. Full-length (15–20 min) episodes are planned in `episodes/*/narration/FULL_OUTLINE.md` and have not been rendered.

## Pipeline (each command tested on this machine)
```bash
node studio/build.mjs episodes/modric
```
```bash
node studio/textcheck.mjs episodes/modric
```
```bash
node studio/narration.mjs script episodes/modric
```
```bash
node studio/narration.mjs tts episodes/modric
```
```bash
node studio/narration.mjs import episodes/modric
```
```bash
node studio/render.mjs episodes/modric
```
```bash
node studio/verify.mjs episodes/modric
```
```bash
node studio/ocrcheck.mjs episodes/modric
```
- **`build`**: template → scenes → PNG frames (Edge shapes the Arabic).
- **`textcheck`**: overflow, cropping, overlap, missing letters, bad characters.
- **`script`**: writes `narration/SCRIPT.md` for Clipchamp.
- **`tts`**: SILMA local voice, plus a speech-recognition check of every line in `audio/tts_report.md`.
- **`import`**: Clipchamp files. A single full recording is split at sentence boundaries confirmed against the script with speech recognition.
- **`render`**: scenes stretch to the narration and speech is never sped up. Multi-item scenes reveal items as they are narrated.
- **`verify`**: streams, duration, sync, countdown/reveal. Settled and mid-transition frames are compared with their own sources.
- **`ocrcheck`**: Windows Arabic OCR as supporting evidence.

Narration priority when rendering: `audio/final` (Clipchamp) › `audio/tts` (SILMA) › `audio/draft` (eSpeak) › silence.

## Canva
| Design | Link |
|---|---|
| Master transfer template (copy per episode, never edit) `DAHXWMJz0OY` | https://www.canva.com/d/FzYFSpcEXwrh7y7 |
| Style kit `DAHXW4ID8t0` | https://www.canva.com/d/BEQl_Usw6USqFSg |
| Modrić episode pages `DAHXWxLVlU0` | https://www.canva.com/d/oNVMJ2IHUP0lzTC |
| Story thumbnail `DAHXWz8LU_o` | https://www.canva.com/d/8NX1LYG9TnSBmAW |
| Bale v1 `DAHXV3JkknM` | preserved |

## More
- [docs/ARABIC_TEXT_AUDIT.md](docs/ARABIC_TEXT_AUDIT.md): Arabic text defects found, causes, fixes, before/after
- [docs/voice-audition/README.md](docs/voice-audition/README.md): voice options, licenses, audition clips
- [docs/MEDIA.md](docs/MEDIA.md): what is on GitHub vs kept locally
- Legacy Bale pilot: `scripts/*.mjs` + `episodes/bale/{,v2,v3}`, kept unchanged

## Tools (in `tools/`, not in git)
- FFmpeg 9.0.2 (GPL); eSpeak NG (GPL-3.0, drafts only)
- uv + Python 3.11 venv `tools/tts-venv`: PyTorch 2.6 (CUDA 12.4), SILMA TTS 1.0.5 (weights Apache-2.0, code MIT), CATT diacritizer (Apache-2.0), Vocos (MIT), faster-whisper with Whisper large-v3-turbo (MIT)
- Model weights cache: `tools/hf-cache`
- Piper is unpacked but unused: `ar_JO-kareem` has an unlicensed dataset
