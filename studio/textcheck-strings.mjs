// The strings each scene is meant to show on screen (shared by textcheck.mjs and ocrcheck.mjs).
// Quiz layouts hide future clues as "؟", so only the revealed items are expected.
const shown = {
  clue: (sc) => [sc.header, sc.stop.card ?? sc.stop.club, sc.stop.years, sc.stop.note, ...sc.stops.slice(0, sc.index + 1).flatMap((s) => [s.row ?? s.club, s.years])],
  attr: (sc) => [sc.header, sc.asOf, ...sc.attrs.map((a) => a.label), ...sc.attrs.slice(0, sc.index + 1).map((a) => a.value)],
  hint: (sc) => [sc.match.competition, sc.match.home, sc.match.away, sc.hints[sc.index].text, ...sc.hints.slice(0, sc.index + 1).map((h) => h.short ?? h.text)],
  count: (sc) => [sc.listTitle ?? 'المسيرة كاملة', ...(sc.stops ? sc.stops.flatMap((s) => [s.row ?? s.club, s.years]) : sc.rows.flatMap((r) => [r.right, r.left]))],
  revealName: (sc) => [sc.answer.name, sc.answer.sub, sc.answer.detail],
  reveal: (sc) => [sc.answer.name, sc.answer.sub],
};
export function allStrings(sc) { // every string field of the scene that is drawn on screen
  const out = [], skip = new Set(['narration', 'id', 'chapter', 'source', 'layout', 'file', 'frame', 'baseFrame', 'imagePath', 'photoPath', 'image', 'photo', 'imagePosition', 'photoPosition', 'credit', 'sprite', 'team', 'better', 'entrance', 'sfx', 'motion', 'stepFrames', 'pops', 'moves', 'psnrCrop', 'narrLead', 'steps']);
  const walk = (v, k) => { if (skip.has(k)) return; if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach((x) => walk(x)); else if (v && typeof v === 'object') for (const [kk, vv] of Object.entries(v)) walk(vv, kk); };
  walk(sc); return out;
}
export default function sourceStrings(sc) {
  if (shown[sc.layout]) return shown[sc.layout](sc).filter((s) => typeof s === 'string' || typeof s === 'number').map(String);
  return allStrings(sc);
}
