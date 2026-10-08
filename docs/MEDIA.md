# Where media lives

GitHub repository: public, free plan. Nothing here needs Git LFS or paid storage.

## Uploaded to GitHub (small, needed to rebuild or to review)
| What | Path | Size |
|---|---|---|
| Voice audition clips (SILMA, before and after the lexicon) | `docs/voice-audition/*.m4a` | ~0.9 MB |
| Style-kit backgrounds and sprites | `templates/kit/*.png` | ~3 MB |
| Canva page exports used by the Modrić quiz | `episodes/modric/canva/01–04.png` | ~5 MB |
| Story thumbnail export | `episodes/modric-story/canva/thumbnail.png` | 1.3 MB |
| Licensed photos (credits in each `ATTRIBUTION.md`) | `episodes/modric/assets/`, `episodes/bale/v2/assets/` | <1 MB |
| Arabic text audit before/after images | `docs/text-audit/*.png` | ~1.5 MB |

## Kept on this computer only (`C:\Users\User\Desktop\FootballVideoStudio\`)
| What | Path | Why not on GitHub |
|---|---|---|
| Rendered videos (all samples and previews) | `out/*.mp4`, previous versions in `out/archive/` | Unapproved voice (previews). Every re-render would add another ~5–8 MB to git history forever |
| Narration audio (SILMA `tts`, eSpeak `draft`, Clipchamp `final`) | `episodes/<slug>/audio/{tts,draft,final}/*.wav` | Regenerable; Clipchamp exports are your recordings |
| Your Clipchamp/WhatsApp recordings | `incoming_audio/`, `episodes/bale/v2/incoming_audio/`, `episodes/*/narration/incoming/` | Personal recordings |
| Build output (frames, segments, check frames, OCR frames) | `episodes/<slug>/build/` | Regenerable with `studio/build.mjs` + `render.mjs` |
| Legacy Bale Canva exports and frames | `episodes/bale/**/frames/` | Regenerable from the Canva designs |
| Tools and models (~11 GB): FFmpeg, eSpeak, Piper, Python, PyTorch, SILMA, Whisper | `tools/` | Downloadable dependencies |

Kept in git as text: `audio/tts_report.md` (speech-recognition check of each narration line) and `audio/tts/*.said.txt` (the exact diacritized text SILMA spoke).

To share a finished video later without bloating the repository, attach the MP4 to a GitHub **Release** (free, up to 2 GB per file). That is publishing, so only do it once you approve the episode.
