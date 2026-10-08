# Arabic voice audition: SILMA TTS (local, free)

**Please listen before any narration is treated as final.** I (Claude) cannot hear audio. The only evidence here is technical: local speech recognition (faster-whisper) transcribing each clip.

| File | Text (spoken) | Speech recognition heard |
|---|---|---|
| `silma_v2_01.m4a` | انتقل لوكا مودريتش من دينامو زغرب إلى توتنهام، ثم إلى ريال مدريد، وأخيرًا إلى إيه سي ميلان. | انتقل لوكا مودريتش من دينامو زغرب إلى توتنهام، ثم إلى ريال مدريد، وأخيرا إلى إيهسي ميلان. |
| `silma_v2_02.m4a` | كيليان مبابي، وغاريث بيل، ودييغو مارادونا، ومحمد صلاح. من هو اللاعب الذي نتحدث عنه اليوم؟ | كيليان مبابي وغاريث بيل وديغ مارادونة ومحمد صلاح. من هو اللاعب الذي نتحدث عنه اليوم؟ |
| `silma_v2_03.m4a` | في الدقيقة الخامسة والخمسين، انطلق مارادونا من نصف ملعبه، وتجاوز خمسة لاعبين من منتخب إنجلترا، ثم سجّل هدف القرن. | في الدقيقة الخامسة والخمسين انطلق مارادون من نصف ملعبه وتجاوز خمسة لاعبين من منتخب إنجلترا ثم سجل هدف القرن. |
| `silma_v2_04.m4a` | في عهد برلسكوني، فاز ميلان بدوري أبطال أوروبا خمس مرات، وصنع جيلًا من الأساطير. | في عهد بيرلوسكوني فاز ميلان بدور أبطال أوروبا خمس مرات وصنع جيلاً من الأساطير. |

`silma_0*.m4a` are the first attempt, **before** the pronunciation lexicon. Recognition heard "توتي نهامي", "ريال مدريدة", "غاري ثبيلي", "صلاحي": the automatic diacritizer was adding Arabic case endings to foreign names. The fix is `templates/pronunciation.json`, which ends names in sukun. Compare the two versions by ear.

## What was evaluated (on this computer: i5-13420H, 7.6 GB RAM, RTX 3050 Laptop 6 GB, Windows 11)

| Option | Arabic | Runs here | License | Decision |
|---|---|---|---|---|
| **SILMA TTS v1** (silma-ai/silma-tts, 150M) | Native MSA, diacritization built in | Yes, GPU, about 2 s per sentence after a 40 s load | Weights Apache-2.0, code MIT; CATT diacritizer Apache-2.0; Vocos vocoder MIT | **Used for previews** |
| Chatterbox Multilingual (Resemble AI) | Supports Arabic | Probably (0.5B, CUDA) | MIT, adds an inaudible watermark | Not installed. Default voice is English-accented; would need a voice reference |
| Meta MMS-TTS (ara) | Basic | Yes | CC-BY-NC 4.0 (**non-commercial**) | Rejected for monetised channels |
| Piper ar_JO-kareem | Basic | Yes | Dataset unlicensed | Rejected (earlier) |
| eSpeak NG | Robotic | Yes | GPL | Timing drafts only, never final |
| Clipchamp TTS | Good | Manual export | Included in your Microsoft account | Kept as the manual path |

## Open issue: the voice reference
SILMA clones the timbre of a short reference clip. The clip used here (`ar.ref.24k.wav`) ships inside SILMA's MIT-licensed package, but its speaker and provenance are **not documented**.
- Fine for this private audition. **Not cleared for publishing.**
- Cleanest fix: record about 8 seconds of your own voice, or of someone who gives written permission, reading one sentence. Set it in `episode.json` → `voice.ref` and `voice.refText`, then run `node studio/narration.mjs tts episodes/<slug>`.

Remaining pronunciation risks to listen for: words without full diacritics are auto-diacritized and can be wrong (e.g. انطلقْ / تجاوزُ). Fix them by diacritizing the word in the script (two or more marks) or by adding a lexicon entry.
