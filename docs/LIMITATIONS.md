# What is done, what is partial, what is missing (2026-10-08)

## Status of the nine requested formats
| # | Format | Engine type | Automatic from a name in Discord? | Sample episode | State |
|---|---|---|---|---|---|
| 1 | Guess the player from transfers | `transfer-history` | **yes** (`/guess_player`, quiz *Transfers*) | `episodes/modric`, `episodes/luka-modric-transfers` (auto), `episodes/kevin-de-bruyne-transfers` (auto, not rendered) | working |
| 2 | Nationality, club, number, position | `guess-attributes` | **yes** (`/guess_player`, quiz *attributes*) | `episodes/salah-attributes` | working; the shirt number is often single-source |
| 3 | UCL: the greatest edition | `story` | no: written episode (your choice: debate) | `episodes/ucl-greatest-debate` | preview |
| 4 | Milan: Berlusconi's revolution | `club-history` | no: written episode | `episodes/milan-berlusconi` | preview |
| 5 | We need to talk about Gareth Bale | `story` | skeleton only (`/player_story`) | `episodes/bale-story` (written), `episodes/gareth-bale-story` (auto skeleton) | preview |
| 6 | Mbappé, the complete life story | `story` | skeleton only | `episodes/mbappe-story` | preview |
| 7 | Chelsea under Mourinho (your choice) | `analysis` | no: written episode | `episodes/chelsea-mourinho-analysis` | preview |
| 8 | Guess who scored the goal | `who-scored` | no: match data must be written | `episodes/who-scored-maradona-1986` | preview |
| 9 | Maradona: the tragic genius | `story` | skeleton only | `episodes/maradona-story` | preview |
| + | Top-5 numbers (tutorial example) | `top-list` | no | `episodes/records-top5` | preview |

"Preview" means a rendered, verified video with the **unapproved** automatic voice. No episode is final until you listen to it and approve the voice, or supply Clipchamp narration.

## Fully implemented and tested
- **Discord bot.** Code and offline tests are done; the live run is still pending (see "Needs you").
  - Slash commands, an allow-list, plan approval with fact statuses, and an ambiguity picker.
  - A persistent queue with cancel, retry and restart recovery.
  - Progress messages, and size-aware delivery with a fitted preview.
- **Research for quizzes:** Wikidata + Wikipedia cross-check (verified / single-source / disputed), source URLs and retrieval dates. A name with several matches stops and asks.
- **Engine:** six original types plus `top-list`; portrait and landscape; correct Arabic; never-mixing transitions; progressive reveals; music ducking; −14 LUFS when music is used.
- **Narration:** local SILMA voice with a pronunciation lexicon and a speech-recognition report; Clipchamp import with boundaries confirmed by speech recognition.
- **Captions:** word-by-word highlight synchronised from speech recognition, names emphasised, `.srt` export.
- **QA:** container, duration, sync, countdown, settled and mid-transition frames, caption sync, Arabic DOM text, OCR cross-check, all summarised in `report.json`.

## Partially implemented
| Feature | What works | What is missing |
|---|---|---|
| Automatic documentaries | verified club timeline + research pack (`RESEARCH.md`) | storytelling chapters: you (or Claude Code) write them. This is your "free, semi-automatic" choice; an LLM would be paid or weaker |
| Goal-scorer quiz | template, labelled tactical recreation, hints | free structured goal data. Wikidata does not hold goal-by-goal records, so match briefs are written by hand |
| Pronunciation | lexicon + hand diacritics; speech-recognition check | no SSML or phonemes (SILMA does not support them); final approval is by your ear |
| English narration | SILMA is bilingual (Arabic/English) | English templates, lexicon and tests not built |
| Time-sensitive facts | retrieval date on every fact; auto quizzes say «المعلومات حسب …» | no scheduled re-check of written documentaries (re-run research before publishing) |

## Not implemented
- **Automatic media collection** (photos, logos, flags). Club logos and most football photos are copyrighted or trademarked. Planned: a Wikimedia Commons search that keeps only CC0 / CC BY / CC BY-SA files, with attribution, plus "upload your own asset" through Discord.
- **Reproducing your reference editing style.** No reference videos are in the project. Send links or files and I can analyse their structure (pacing, transitions, text motion).
- **Cloud deployment.** The engine is Windows-specific (Edge, Windows OCR); see `DEPLOYMENT.md`.

## Needs you (nothing here costs money)
1. **Reset the Discord bot token** (the old one was in `bot.py`), put the new one in `.env`, and add your user ID to `ALLOWED_USER_IDS`.
2. A **test server**, plus your OK for the bot to post there. I have not sent any Discord message.
3. **Listen** to `docs/voice-audition/*.m4a` and some episode audio, then approve or reject SILMA. To publish with SILMA, record an 8-second reference of your own voice.
4. Approve the **2-minute story sample** (`out/modric-story.mp4`) before any 20-minute render.
5. **Reference videos** for the editing style.
6. **Music tracks** you are allowed to use (e.g. from YouTube Audio Library), each with its license noted.

## Known technical risks
- **Wikidata gaps and type quirks:** De Bruyne's Chelsea spell was dropped until the club filter learnt the "men's football team" class. The bot always shows the plan before rendering for this reason.
- **discord.py on Python 3.14** prints a deprecation warning (from the library itself). Pin Python 3.12/3.13 if a future discord.py release breaks.
- **Long renders on the laptop:** one job at a time; sleep or updates interrupt jobs (they can be retried).
