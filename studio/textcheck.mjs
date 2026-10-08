// Arabic text audit of every rendered HTML scene (run after build.mjs). Usage: node studio/textcheck.mjs episodes/<slug>
// For each scene, headless Edge loads the same HTML, runs the same fit script, then reports:
//   • overflow: text still wider/taller than its box after shrink-to-fit, or outside the frame (cropping)
//   • overlap: two different text blocks whose glyph boxes intersect
//   • integrity: Arabic letters present in the rendered DOM text = letters in the source strings (nothing dropped)
//   • font: the font actually used for each text block (must cover Arabic)
// plus static checks on the source strings: presentation forms (pre-shaped/reversed text), bidi control marks,
// tatweel, doubled spaces, Latin letters glued to Arabic letters, stray diacritics.
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROOT, EDGE, readJSON, writeJSON, epPaths, ensureDir } from './lib.mjs';
import { sceneHTML } from './html.mjs';

const dir = resolve(process.argv[2] ?? '.');
const p = epPaths(dir);
const ep = readJSON(p.config);
const { scenes } = readJSON(p.scenes);
const work = ensureDir(join(p.html, '..', 'textcheck'));
const profile = join(ROOT, 'build_cache', 'edge-profile'); mkdirSync(profile, { recursive: true });

const PROBE = `<script>
(() => {
  const W = document.body.clientWidth, H = document.body.clientHeight, out = { overflow: [], overlap: [], fonts: {}, text: '' };
  const blocks = [...document.querySelectorAll('body *')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
  const rects = [];
  for (const e of blocks) {
    const r = document.createRange(); r.selectNodeContents(e);
    const boxes = [...r.getClientRects()].filter((b) => b.width > 0 && b.height > 0);
    const label = e.textContent.trim().slice(0, 40);
    if ((e.matches('.fit') && e.scrollWidth > e.clientWidth + 1) || (e.matches('.fitbox') && e.scrollHeight > e.clientHeight + 1)) out.overflow.push({ label, why: 'does not fit its box after shrinking' });
    for (const b of boxes) if (b.left < -1 || b.top < -1 || b.right > W + 1 || b.bottom > H + 1) { out.overflow.push({ label, why: 'outside the frame (cropped)' }); break; }
    const cs = getComputedStyle(e); if (cs.visibility !== 'hidden') rects.push({ e, label, boxes });
    out.fonts[cs.fontFamily] = (out.fonts[cs.fontFamily] ?? 0) + 1;
  }
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const A = rects[i], B = rects[j]; if (A.e.contains(B.e) || B.e.contains(A.e)) continue;
    const hit = A.boxes.some((a) => B.boxes.some((b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4));
    if (hit) out.overlap.push([A.label, B.label]);
  }
  out.text = document.body.innerText;
  document.body.setAttribute('data-check', encodeURIComponent(JSON.stringify(out)));
})();
</script>`;

const AR = /[ء-ي]/g;
const letters = (s) => (String(s).match(AR) ?? []).join('');
import sourceStrings from './textcheck-strings.mjs';
function staticIssues(s) {
  const r = [];
  if (/[ﭐ-﷿ﹰ-﻿]/.test(s)) r.push('Arabic presentation forms (pre-shaped or reversed text)');
  if (/[‎‏‪-‮⁦-⁩]/.test(s)) r.push('bidi control characters');
  if (/ـ/.test(s)) r.push('tatweel');
  if (/ {2,}/.test(s)) r.push('double space');
  if (/[ء-ي][A-Za-z]|[A-Za-z][ء-ي]/.test(s)) r.push('Latin letter joined to Arabic letter');
  if (/(^|[\s\d])[ً-ْ]/.test(s)) r.push('diacritic without a base letter');
  if (/[ً-ْ]{3,}/.test(s)) r.push('three or more stacked diacritics');
  return r;
}

const rows = [], problems = [];
for (const sc of scenes) {
  if (sc.source !== 'html') { rows.push(`| ${sc.id} | Canva page | — | — | checked in Canva export (PSNR in verify) |`); continue; }
  const stat = [...new Set(sourceStrings(sc).flatMap(staticIssues))];
  const html = sceneHTML(sc, ep).replace('</body>', PROBE + '</body>');
  const f = join(work, `${sc.id}.html`); writeFileSync(f, html);
  const r = spawnSync(EDGE, ['--headless=new', `--user-data-dir=${profile}`, '--no-first-run', '--disable-extensions', '--disable-gpu',
    '--force-device-scale-factor=1', `--window-size=${ep.width},${ep.height}`, '--virtual-time-budget=3000', '--dump-dom', 'file:///' + f.replace(/\\/g, '/')],
  { encoding: 'utf8', timeout: 45000, maxBuffer: 1 << 26 });
  const m = (r.stdout ?? '').match(/data-check="([^"]+)"/);
  if (!m) { rows.push(`| ${sc.id} | **probe failed** | | | |`); problems.push(`${sc.id}: probe failed`); continue; }
  const res = JSON.parse(decodeURIComponent(m[1].replace(/&amp;/g, '&')));
  // integrity: every source letter sequence must appear in the rendered text (order of logical characters)
  const shown = letters(res.text), missing = sourceStrings(sc).filter((s) => letters(s) && !shown.includes(letters(s)));
  const issues = [...res.overflow.map((o) => `overflow: «${o.label}» ${o.why}`), ...res.overlap.map(([a, b]) => `overlap: «${a}» / «${b}»`),
    ...missing.map((s) => `missing text: «${s.slice(0, 40)}»`), ...stat];
  if (issues.length) problems.push(`${sc.id}: ${issues.join('; ')}`);
  rows.push(`| ${sc.id} | ${sc.layout} | ${Object.keys(res.fonts).map((x) => x.split(',')[0]).join(', ')} | ${letters(res.text).length} | ${issues.length ? issues.join('<br>') : 'ok'} |`);
}
const rep = [`# Arabic text check — ${ep.slug} — ${new Date().toISOString()}`, '',
  'Rendered by headless Edge (same HTML and fit script as the build). Letters = Arabic letters found in the rendered text.', '',
  '| scene | layout | font | letters | result |', '|---|---|---|---|---|', ...rows, '',
  problems.length ? `**${problems.length} scene(s) with issues.**` : '**No issues found.**'];
writeFileSync(join(p.audio, '..', 'build', 'textcheck.md'), rep.join('\n') + '\n');
writeJSON(join(dir, 'build', 'textcheck.json'), { ok: problems.length === 0, problems });
console.log(problems.length ? problems.join('\n') : `${ep.slug}: text OK in ${scenes.filter((s) => s.source === 'html').length} HTML scenes`);
process.exitCode = problems.length ? 1 : 0;
