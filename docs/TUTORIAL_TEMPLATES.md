# Tutorial: making and changing templates yourself

There are three levels. Most new videos only need level 1.

| Level | You change | Example | Code? |
|---|---|---|---|
| 1. New episode | an `episode.json` | another player's transfer quiz | no |
| 2. Change a template | numbers and words in `studio/templates.mjs` / `studio/html.mjs` | longer clues, different colours | a few characters |
| 3. New template type | add one function | `top-list` (built in this tutorial, tested) | ~20 lines |

Words used below:
- **episode:** one video (folder `episodes/<slug>/`).
- **type:** which template it uses (`"type"` in `episode.json`).
- **scene:** one screen with its narration.
- **layout:** how a scene is drawn (HTML in `studio/html.mjs`).

---

## Level 1: a new episode from an existing template (no code)

### Fastest: let the bot research it
```powershell
.\.venv\Scripts\python.exe -m bot.cli research "Kevin De Bruyne" --quiz transfers
```
This writes `episodes/kevin-de-bruyne-transfers/episode.json` and `sources.md`. Open `sources.md` and check every ⚠️ and ❌. Edit `episode.json` if something is wrong, then:
```powershell
.\.venv\Scripts\python.exe -m bot.cli render kevin-de-bruyne-transfers
```

### By hand (any type, e.g. a documentary)
1. Copy the closest example folder, keeping only `episode.json` and `sources.md`:
   `episodes/mbappe-story` → `episodes/my-new-story`.
2. In `episode.json`, change at least:
   - `slug` (must equal the folder name; it becomes `out/<slug>.mp4`);
   - `subject`, `title_ar`, `targetSeconds`;
   - everything under `data`.
3. Rules for the text:
   - Screen text may use digits: `"year": "2012"`.
   - **Narration writes numbers as words:** `"عام ألفين واثني عشر"`.
   - Names that are mispronounced go into `templates/pronunciation.json`.
4. Record every fact with its source in `sources.md`.
5. Build, check, render:
   ```powershell
   node studio/make.mjs episodes/my-new-story
   ```
6. Open `out/my-new-story.mp4` and read `episodes/my-new-story/build/report.json`.

Which scene layouts can a documentary use? Each one, with an example from a real episode:

| `layout` | Fields | Example |
|---|---|---|
| `text` | `heading`, `body` [paragraphs], optional `year`, `image` + `credit` | `episodes/mbappe-story` ch1 |
| `fact` | `value`, `label`, `note` | `episodes/mbappe-story` (“256”) |
| `timeline` | `heading`, `items` [{`year`,`text`}], `highlight` | `episodes/ucl-greatest-debate` |
| `trophies` | `heading`, `items` [{`count`,`label`,`note`}] (≤ 6), `source` | `episodes/milan-berlusconi` |
| `compare` | `heading`, `a`/`b` {`name`}, `rows` [{`label`,`a`,`b`}], `source` | `episodes/chelsea-mourinho-analysis` |
| `formation` | `heading`, `body`, `players` [{`x`,`y`}], `arrows`, `label` | `episodes/milan-berlusconi` ch2 |
| `quote` | `text`, `by` | `episodes/maradona-story` |

Timelines, trophies and comparisons reveal their items one by one, in step with the narration. Add `"steps": false` to a scene to show them all at once.

## Level 2: change an existing template
| I want… | File | What to change |
|---|---|---|
| clue screens to stay longer | `studio/templates.mjs`, `transferHistory` | `seconds: s.seconds ?? 4.3` → `5` (or set `"seconds"` per stop in `episode.json`) |
| a calmer or stronger bounce | `studio/templates.mjs` | `POP_CARD = { A: 0.06 … }` (`A` = size of the bounce) |
| other colours | `studio/html.mjs` | the `C = { navy, lime, gold … }` palette at the top |
| a different clue sentence | `bot/research/builder.py` | the `say = {…}` dictionary in `transfer_quiz` |
| no captions in one episode | `episode.json` | `"captions": { "enabled": false }` |
| livelier captions | `episode.json` | `"captions": { "intensity": "lively" }` (current word grows slightly) |
| background music | `episode.json` | `"music": { "file": "assets/music/track.mp3", "license": "source + permission", "volume": 0.16 }`. Music is ducked under speech automatically |

After any change: `node studio/make.mjs episodes/<a test episode>` and make sure `report.json` says `"status": "ok"`.
If you changed `html.mjs`, look at a few frames in `episodes/<slug>/build/frames/` and run `node studio/textcheck.mjs episodes/<slug>`.

## Level 3: a new template type (worked example: `top-list`)
Goal: a countdown "five unforgettable numbers" video built **only from existing pieces**.

### Step 1: decide the scenes
```
intro (title layout) → item 5 → item 4 → … → item 1 (fact layout, chip “المركز ٥”) → end (end layout)
```

### Step 2: write the expander (`studio/templates.mjs`)
An expander turns `episode.json` → a list of scenes. This is the real code now in the file:
```js
function topList(ep, dir) {
  const d = ep.data, items = d.items;
  if (items.length < 3 || items.length > 10) throw new Error(`top-list supports 3–10 items (got ${items.length})`);
  const ar = (n) => String(n).replace(/\d/g, (x) => '٠١٢٣٤٥٦٧٨٩'[x]);
  const S = [{ id: 'intro', chapter: 'intro', source: 'html', layout: 'title', ...d.intro, seconds: d.intro.seconds ?? 5,
    entrance: { type: 'reveal', d: 0.6 }, sfx: ['whoosh'] }];
  items.forEach((it, i) => {
    const rank = items.length - i;                       // countdown: 5, 4, 3, 2, 1
    S.push({ id: `r${rank}`, chapter: 'list', source: 'html', layout: 'fact', chapterLabel: `المركز ${ar(rank)}`,
      value: it.value, label: it.label, note: it.note, seconds: it.seconds ?? 6, entrance: { type: 'reveal', d: 0.5 },
      sfx: [rank === 1 ? 'chime' : 'whoosh'], narration: it.narration });
  });
  S.push({ id: 'end', chapter: 'end', source: 'html', layout: 'end', ...d.end, seconds: d.end.seconds ?? 5, entrance: { type: 'reveal', d: 0.5 } });
  return S;
}
```
Then register it in the same file:
```js
export const TEMPLATES = { …, 'top-list': topList };
```
What each scene field means:
| Field | Meaning |
|---|---|
| `id` | unique name; also the narration file name (`audio/tts/r5.wav`) |
| `source: 'html'` + `layout` | drawn by `studio/html.mjs` (or `source: 'canva'` + `file` for a Canva PNG) |
| `seconds` | minimum length; the scene grows to fit its narration (speech is never sped up) |
| `entrance` | `cut`, `reveal`, `flash` or `push`. Never use transitions that mix two pages' text |
| `sfx` | `whoosh`, `tick`, `chime` |
| `narration` | what is spoken (numbers as words) |

### Step 3: an episode for it
`episodes/records-top5/episode.json` (in the repo):
```json
{ "type": "top-list", "slug": "records-top5", "orientation": "landscape", "width": 1920, "height": 1080, "fps": 30,
  "targetSeconds": [40, 120], "captions": { "enabled": true },
  "data": {
    "intro": { "kicker": "أرقام", "title": "خمسة أرقام لا تُنسى", "subtitle": "من الأصغر إلى الأعظم", "narration": "…" },
    "items": [ { "value": "58", "label": "مباراة متتالية بلا هزيمة", "note": "ميلان مع كابيلو", "narration": "…" }, … ],
    "end": { "title": "أي رقم هو الأصعب كسرًا؟", "cta": "اكتب رأيك في التعليقات", "narration": "…" } } }
```

### Step 4: build, check, render
```powershell
node studio/make.mjs episodes/records-top5
```
Result on this PC: `STATUS ok`, 49.4 s, 1920×1080. All checks passed, including captions in sync (21 sampled words).

### Step 5: make the bot aware of it
Add it to `templates/registry.json`, so `/templates` lists it. The bot can already render it: `/create_video slug:records-top5`.

### When you need a new *look* (a new layout)
Add a function to `landscapeTemplates` (or `portraitTemplates`) in `studio/html.mjs`. It returns HTML with absolutely positioned boxes. Use the existing helpers:
- `bdi()` for any text that may contain Latin or digits;
- class `fit` for one line that must shrink to fit, `fitbox` for a paragraph box;
- class `anim` for things that fade in on a `reveal` entrance.

Copy `fact(sc)` as a starting point. Then run `node studio/textcheck.mjs` on an episode that uses the new layout: it catches overflow, overlap and missing letters.

## Checklist before publishing any episode
1. `report.json` says `"status": "ok"`.
2. No ❌ in `sources.md`; every ⚠️ was checked by you.
3. You **listened** to the narration (the automatic voice is a preview until you approve it).
4. Every image has a license entry and an on-screen credit.
5. Opinions ("the greatest…") are worded as opinions.
