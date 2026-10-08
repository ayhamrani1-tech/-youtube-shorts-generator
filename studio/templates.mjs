// Template expanders: episode.json (data) → flat scene list. Each scene has:
//   id, chapter, source ('canva' PNG | 'html' layout), seconds (minimum), entrance, pops, sfx, narration.
// Entrances never mix two pages' text: 'cut' (+ pops), 'flash' (page → white → page), 'reveal'
// (text layer fades in over its own background), 'push' (slow zoom on one page).
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { rowLayout, pitchPx } from './html.mjs';

const POP_CARD = { A: 0.06, k: 8, w: 16 };

function transferHistory(ep, dir) {
  const d = ep.data, stops = d.stops, n = stops.length;
  if (n < 2 || n > 9) throw new Error(`transfer-history supports 2–9 stops (got ${n})`);
  const canva = (p) => ({ source: 'canva', file: join(dir, d.canvaPages.dir, `${String(p).padStart(2, '0')}.png`) });
  const rows = rowLayout(n);
  const S = [];
  S.push({ id: 'hook', chapter: 'intro', ...canva(d.canvaPages.cover), seconds: 3.5, entrance: { type: 'push' }, narration: d.hook.narration });
  stops.forEach((s, i) => S.push({
    id: `c${i + 1}`, chapter: 'clues', source: 'html', layout: 'clue', header: d.header, stop: s, stops, index: i,
    seconds: s.seconds ?? 4.3, entrance: { type: 'cut' }, narrLead: 0.55, sfx: ['whoosh'],
    pops: [{ r: [70, 420, 940, 420], at: 0, ...POP_CARD }, { r: [rows[i].x, rows[i].y, rows[i].w, rows[i].h], at: 0.12, ...POP_CARD }],
    narration: s.narration,
  }));
  [5, 4, 3, 2, 1].forEach((digit) => S.push({
    id: `n${digit}`, chapter: 'countdown', source: 'html', layout: 'count', digit, stops, seconds: 1, fixed: true,
    entrance: { type: 'cut' }, sfx: ['tick'], pops: [{ r: [320, 250, 440, 440], at: 0, A: 0.2, k: 9, w: 18 }],
  }));
  S.push({ id: 'mystery', chapter: 'answer', ...canva(d.canvaPages.mystery), seconds: 0.9, fixed: true, entrance: { type: 'flash', d: 0.3 } });
  const answer = { ...d.answer, photoPath: d.answer.photo ? resolve(dir, d.answer.photo) : null };
  S.push({
    id: 'reveal', chapter: 'answer', ...(answer.photoPath ? { source: 'html', layout: 'reveal', answer } : canva(d.canvaPages.reveal)),
    seconds: 4.6, entrance: { type: 'flash', d: 0.3 }, narrLead: 0.55, sfx: ['chime'],
    pops: [{ r: [60, 975, 960, 330], at: 0.3, A: 0.12, k: 6, w: 13 }], narration: d.reveal.narration,
  });
  S.push({ id: 'outro', chapter: 'outro', ...canva(d.canvaPages.outro), seconds: 3.2, entrance: { type: 'cut' }, narrLead: 0.55,
    pops: [{ r: [140, 700, 800, 160], at: 0, A: 0.1, k: 7, w: 14 }], narration: d.outro.narration });
  return S;
}

function story(ep, dir) {
  const S = [];
  const img = (p) => (p ? resolve(dir, p) : null);
  const ord = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'];
  if (ep.data.intro) S.push({ id: 'intro', chapter: 'intro', source: 'html', layout: 'title', ...ep.data.intro,
    seconds: ep.data.intro.seconds ?? 5, entrance: { type: 'reveal', d: 0.6 }, sfx: ['whoosh'] });
  ep.data.chapters.forEach((ch, ci) => {
    const chId = `ch${ci + 1}`, label = `الفصل ${ord[ci] ?? ci + 1}`;
    S.push({ id: `${chId}_title`, chapter: chId, source: 'html', layout: 'title', kicker: label, title: ch.title, subtitle: ch.subtitle,
      seconds: ch.titleSeconds ?? 4, entrance: { type: 'reveal', d: 0.5 }, sfx: ['whoosh'], narration: ch.narration });
    ch.scenes.forEach((sc, si) => S.push({
      id: `${chId}_s${si + 1}`, chapter: chId, chapterLabel: `${label}: ${ch.title}`, source: 'html', ...sc,
      imagePath: img(sc.image), seconds: sc.seconds ?? 6, entrance: { type: 'reveal', d: 0.5 }, motion: 'drift',
    }));
  });
  if (ep.data.end) S.push({ id: 'end', chapter: 'end', source: 'html', layout: 'end', ...ep.data.end,
    seconds: ep.data.end.seconds ?? 5, entrance: { type: 'reveal', d: 0.5 }, sfx: ['chime'] });
  for (const s of S) if (s.imagePath && !existsSync(s.imagePath)) throw new Error(`missing image ${s.imagePath}`);
  return S;
}

// Shared quiz tail: 5→1 countdown over the full list, flash reveal, outro (all HTML, portrait).
function quizTail(S, d, rows, listTitle) {
  [5, 4, 3, 2, 1].forEach((digit) => S.push({
    id: `n${digit}`, chapter: 'countdown', source: 'html', layout: 'count', digit, rows, listTitle, seconds: 1, fixed: true,
    entrance: { type: 'cut' }, sfx: ['tick'], pops: [{ r: [320, 250, 440, 440], at: 0, A: 0.2, k: 9, w: 18 }],
  }));
  const answer = { ...d.answer };
  S.push({ id: 'reveal', chapter: 'answer', source: 'html', layout: 'revealName', answer, seconds: 4.6,
    entrance: { type: 'flash', d: 0.3 }, narrLead: 0.55, sfx: ['chime'], pops: [{ r: [60, 560, 960, 420], at: 0.3, A: 0.12, k: 6, w: 13 }],
    narration: d.reveal.narration });
  S.push({ id: 'outro', chapter: 'outro', source: 'html', layout: 'ptitle', ...d.outro, seconds: d.outro.seconds ?? 3.5,
    entrance: { type: 'reveal', d: 0.4 }, narration: d.outro.narration });
}

// Guess the player from attributes (nationality, club, number, position) — reference season mandatory.
function guessAttributes(ep, dir) {
  const d = ep.data, attrs = d.attributes;
  if (!d.asOf) throw new Error('guess-attributes needs data.asOf (reference date or season, e.g. "حسب موسم 2024/25")');
  if (attrs.length < 2 || attrs.length > 8) throw new Error(`guess-attributes supports 2–8 attributes (got ${attrs.length})`);
  const rows = rowLayout(attrs.length), S = [];
  S.push({ id: 'hook', chapter: 'intro', source: 'html', layout: 'ptitle', ...d.hook, footnote: d.asOf, seconds: d.hook.seconds ?? 3.5,
    entrance: { type: 'reveal', d: 0.4 }, sfx: ['whoosh'], narration: d.hook.narration });
  attrs.forEach((a, i) => S.push({
    id: `a${i + 1}`, chapter: 'clues', source: 'html', layout: 'attr', header: d.header, asOf: d.asOf, attrs, index: i,
    seconds: a.seconds ?? 4.3, entrance: { type: 'cut' }, narrLead: 0.55, sfx: ['whoosh'],
    pops: [{ r: [70, 420, 940, 420], at: 0, ...POP_CARD }, { r: [rows[i].x, rows[i].y, rows[i].w, rows[i].h], at: 0.12, ...POP_CARD }],
    narration: a.narration,
  }));
  quizTail(S, d, attrs.map((a) => ({ right: a.label, left: a.value })), 'كل المعلومات');
  return S;
}

// Who scored the goal? Match card → tactical recreation (moving ball/scorer markers, clearly labelled) → hints → countdown → reveal.
function whoScored(ep, dir) {
  const d = ep.data, r = d.recreation;
  if (!r.label) throw new Error('who-scored recreation needs a visible label stating it is a recreation, not match footage');
  const S = [];
  S.push({ id: 'hook', chapter: 'intro', source: 'html', layout: 'match', header: d.header, match: d.match, question: d.hook.question,
    seconds: d.hook.seconds ?? 4, entrance: { type: 'reveal', d: 0.4 }, sfx: ['whoosh'], narration: d.hook.narration });
  // ball path in pitch units → px; time split by distance
  const px = r.path.map(([x, y]) => pitchPx(x, y));
  const len = px.slice(1).map((q, i) => Math.hypot(q[0] - px[i][0], q[1] - px[i][1])), L = len.reduce((a, b) => a + b, 0);
  const t0 = r.moveStart ?? 0.8, T = r.moveSeconds ?? 6;
  const times = [t0]; len.forEach((l) => times.push(times.at(-1) + T * l / L));
  S.push({ id: 'tactic', chapter: 'recreation', source: 'html', layout: 'tactic', ...r, seconds: Math.max(r.seconds ?? 0, t0 + T + 2.5),
    entrance: { type: 'cut' }, narrLead: 0.4, sfx: ['whoosh'], narration: r.narration,
    moves: [{ sprite: 'scorer', size: 64, pts: px.map(([x, y], i) => [x, y + 0, times[i]]) }, { sprite: 'ball', size: 30, pts: px.map(([x, y], i) => [x + 22, y - 30, times[i]]) }],
    psnrCrop: [0, 0, 1080, 320] }); // title, subtitle and recreation label; the ball ends inside the goal just below
  d.hints.forEach((h, i) => S.push({ id: `h${i + 1}`, chapter: 'hints', source: 'html', layout: 'hint', match: d.match, hints: d.hints, index: i,
    seconds: h.seconds ?? 4.3, entrance: { type: 'cut' }, narrLead: 0.55, sfx: ['whoosh'],
    pops: [{ r: [70, 480, 940, 360], at: 0, ...POP_CARD }], narration: h.narration }));
  quizTail(S, d, d.hints.map((h) => ({ right: h.short ?? h.text })), 'كل التلميحات');
  return S;
}

// Long-form documentaries share the story engine; types add their own required fields.
function clubHistory(ep, dir) {
  if (!ep.subject?.club_ar) throw new Error('club-history needs subject.club_ar');
  return story(ep, dir);
}
function analysis(ep, dir) {
  const c = ep.data.criteria;
  if (!Array.isArray(c) || !c.length) throw new Error('analysis needs data.criteria — the explicit comparison criteria shown and narrated');
  if (!ep.data.chapters.some((ch) => ch.scenes.some((s) => s.layout === 'compare' || s.layout === 'formation')))
    throw new Error('analysis needs at least one compare or formation scene');
  return story(ep, dir);
}

export const TEMPLATES = { 'transfer-history': transferHistory, 'guess-attributes': guessAttributes, 'who-scored': whoScored,
  story, 'club-history': clubHistory, analysis };

export function expand(ep, dir) {
  const fn = TEMPLATES[ep.type];
  if (!fn) throw new Error(`video type "${ep.type}" has no working template (see templates/registry.json)`);
  const scenes = fn(ep, dir);
  const ids = new Set();
  for (const s of scenes) { if (ids.has(s.id)) throw new Error(`duplicate scene id ${s.id}`); ids.add(s.id); }
  return scenes;
}
