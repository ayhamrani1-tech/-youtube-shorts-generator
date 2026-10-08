// Word-by-word captions synchronised with the narration. Usage: node studio/captions.mjs episodes/<slug>
// (run after narration exists; make.mjs does this automatically when captions are enabled).
//
// 1. Pick each scene's narration file (final › tts › draft, same rule as render.mjs).
// 2. Local speech recognition (studio/asr.py) gives word timestamps; they are aligned to the SCRIPT words,
//    so captions always show the script's spelling, never the recogniser's. Unmatched words get interpolated times.
// 3. Words are grouped into short lines (phrases). For every word, Edge renders the phrase with that word
//    highlighted (RTL-safe Arabic shaping) into one transparent "sheet" PNG per scene; render.mjs crops the right
//    strip at the right time. Names from the pronunciation lexicon are emphasised.
// 4. Writes build/captions.json; render.mjs also writes out/<slug>.srt from it.
//
// episode.json → "captions": { "enabled": true, "intensity": "calm" | "lively", "maxChars": 42 }
// Defaults: enabled for landscape documentaries, disabled for portrait quizzes (their screens are already text).
import { existsSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROOT, readJSON, writeJSON, ensureDir, epPaths, htmlToPng } from './lib.mjs';
import { asr, asrAvailable, norm, alignWords } from './align.mjs';

const dir = resolve(process.argv[2] ?? '.');
const p = epPaths(dir);
const ep = readJSON(p.config);
const { scenes } = readJSON(p.scenes);
const landscape = ep.orientation === 'landscape';
const cfg = { enabled: landscape, intensity: 'calm', maxChars: landscape ? 46 : 26, ...(ep.captions ?? {}) };
export const BAND = landscape ? { y: 944, h: 92, font: 44 } : { y: 1780, h: 120, font: 52 };
const out = join(dir, 'build', 'captions.json');

if (!cfg.enabled) { writeJSON(out, { enabled: false, scenes: {} }); console.log('captions disabled for this episode'); process.exit(0); }
if (!asrAvailable()) { console.log('captions need speech recognition (tools/tts-venv) — skipped'); writeJSON(out, { enabled: false, scenes: {} }); process.exit(0); }

const prefer = ep.voice?.prefer ?? ['final', 'tts', 'draft'];
const clipFor = (id) => prefer.map((k) => join(p.audio, k, `${id}.wav`)).find((f) => existsSync(f));
const narrated = scenes.filter((s) => s.narration && clipFor(s.id));
const heard = narrated.length ? asr(narrated.map((s) => clipFor(s.id))) : {};

const lexicon = readJSON(join(ROOT, 'templates', 'pronunciation.json'));
const names = new Set(Object.keys(lexicon).filter((k) => !k.startsWith('_')).map(norm));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function timedWords(text, rec) {
  const shown = text.split(/\s+/).filter(Boolean);
  const map = alignWords(shown.map(norm), rec.words.map((w) => norm(w.w)));
  const t = shown.map((w, i) => (map[i] >= 0 ? { w, s: rec.words[map[i]].s, e: rec.words[map[i]].e } : { w, s: null, e: null }));
  // interpolate unmatched words between matched neighbours, proportionally to their length
  for (let i = 0; i < t.length; i++) {
    if (t[i].s !== null) continue;
    let j = i; while (j < t.length && t[j].s === null) j++;
    const a = i > 0 ? t[i - 1].e : (rec.words[0]?.s ?? 0), b = j < t.length ? t[j].s : (rec.words.at(-1)?.e ?? a + 0.4 * (j - i));
    const lens = t.slice(i, j).map((x) => x.w.length), tot = lens.reduce((x, y) => x + y, 0) || 1;
    let cur = a;
    for (let k = i; k < j; k++) { const d = (b - a) * lens[k - i] / tot; t[k].s = cur; t[k].e = cur + d; cur += d; }
    i = j;
  }
  return t;
}

function phrases(words) {
  const out = []; let cur = [];
  for (const w of words) {
    const len = cur.reduce((x, y) => x + y.w.length + 1, 0);
    if (cur.length && len + w.w.length > cfg.maxChars) { out.push(cur); cur = []; }
    cur.push(w);
    if (/[.،,؟?!:؛]$/.test(w.w) && cur.reduce((x, y) => x + y.w.length + 1, 0) > cfg.maxChars * 0.45) { out.push(cur); cur = []; }
  }
  if (cur.length) out.push(cur);
  return out;
}

function sheetHTML(rows) {
  const W = ep.width, H = BAND.h, F = BAND.font;
  const scale = cfg.intensity === 'lively' ? 'transform:scale(1.12);display:inline-block;' : '';
  const strip = (ph, cur) => `<div class="s"><span class="pill">${ph.map((w, i) => {
    const name = names.has(norm(w.w));
    const style = i === cur ? `color:#C2F622;${scale}` : name ? 'color:#FFD166' : '';
    return `<span style="${style}">${esc(w.w)}</span>`;
  }).join(' ')}</span></div>`;
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}html,body{width:${W}px;background:transparent;font-family:"Segoe UI",Tahoma,sans-serif}
.s{height:${H}px;display:flex;align-items:center;justify-content:center}
.pill{display:inline-block;max-width:${W - 120}px;padding:8px 34px;border-radius:${H / 2}px;background:rgba(7,20,39,.82);color:#fff;
font-weight:700;font-size:${F}px;line-height:${H - 24}px;white-space:nowrap;overflow:hidden}
</style></head><body>${rows.map(([ph, cur]) => strip(ph, cur)).join('')}</body></html>`;
}

const result = { enabled: true, band: BAND, scenes: {} };
const capDir = ensureDir(join(dir, 'build', 'captions'));
for (const s of narrated) {
  const rec = heard[clipFor(s.id)];
  if (!rec?.words?.length) continue;
  const words = timedWords(s.narration, rec), ph = phrases(words);
  const rows = [], events = [], lines = [];
  ph.forEach((line, li) => {
    line.forEach((w, wi) => {
      const next = line[wi + 1]?.s ?? w.e + 0.25;   // hold the highlight until the next word starts
      events.push({ s: +w.s.toFixed(3), e: +Math.max(next, w.e).toFixed(3), row: rows.length });
      rows.push([line, wi]);
    });
    const nextStart = ph[li + 1]?.[0].s ?? Infinity;   // a line ends before the next one starts (no overlapping cues)
    lines.push({ s: +line[0].s.toFixed(3), e: +Math.min(line.at(-1).e + 0.25, nextStart - 0.02).toFixed(3), text: line.map((w) => w.w).join(' ') });
  });
  // render.mjs SUMS the active intervals to pick a strip, so intervals must never overlap
  for (let i = 0; i < events.length - 1; i++) events[i].e = +Math.min(events[i].e, events[i + 1].s - 0.002).toFixed(3);
  const html = join(capDir, `${s.id}.html`), png = join(capDir, `${s.id}.png`);
  writeFileSync(html, sheetHTML(rows));
  htmlToPng(html, png, ep.width, rows.length * BAND.h);
  const st = statSync(clipFor(s.id));   // fingerprint: render.mjs ignores captions if the narration changed since
  result.scenes[s.id] = { sheet: png, rows: rows.length, events, lines, clip: clipFor(s.id), clipStamp: `${st.size}:${st.mtimeMs}` };
}
writeJSON(out, result);
console.log(`captions: ${Object.keys(result.scenes).length} scenes, ${Object.values(result.scenes).reduce((x, c) => x + c.rows, 0)} word states → ${out}`);
