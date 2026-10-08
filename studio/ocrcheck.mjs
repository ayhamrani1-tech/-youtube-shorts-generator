// Supporting evidence only: OCR (Windows ar-SA) of settled frames taken FROM THE FINAL MP4, compared with the
// intended on-screen words. Word order is ignored (Windows OCR returns Arabic lines in visual order).
// Primary proof stays studio/textcheck.mjs (DOM text) + verify.mjs (PSNR vs source frames).
// Usage: node studio/ocrcheck.mjs episodes/<slug>
import { spawnSync, execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROOT, FFMPEG, readJSON, epPaths, ensureDir } from './lib.mjs';

const dir = resolve(process.argv[2] ?? '.');
const p = epPaths(dir);
const ep = readJSON(p.config), tl = readJSON(p.timeline), { scenes } = readJSON(p.scenes);
const out = ensureDir(join(dir, 'build', 'ocr'));
const norm = (w) => w.replace(/[ً-ْٰـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[^ء-ي0-9A-Za-z]/g, '');
const words = (s) => String(s ?? '').split(/[\s،,.:؛؟?!()«»—–\-·/]+/).map(norm).filter((w) => w.length > 1);

const byId = Object.fromEntries(scenes.map((s) => [s.id, s]));
const shots = [];
for (const s of tl.scenes) {
  const sc = byId[s.id];
  if (sc.source !== 'html') continue;
  const at = (Math.round(s.start * ep.fps) + Math.round((Math.max(s.settle, 0.7) + 0.2) * ep.fps)) / ep.fps;
  const f = join(out, `${s.id}.png`);
  execFileSync(FFMPEG, ['-y', '-v', 'error', '-ss', at.toFixed(3), '-i', tl.out, '-frames:v', '1', f]);
  shots.push({ id: s.id, f, sc, at });
}
// one PowerShell call per image: Windows OCR stalls when many images are recognised in one session
const ocr = {};
for (const x of shots) {
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(ROOT, 'studio', 'ocr.ps1'), x.f], { encoding: 'utf8', maxBuffer: 1 << 24, stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
  if (r.status !== 0 || !r.stdout.trim()) { ocr[x.f] = ''; console.log('OCR failed for ' + x.id); continue; }
  Object.assign(ocr, JSON.parse(r.stdout.trim()));
}
const { default: tc } = await import('./textcheck-strings.mjs');
const rows = [];
let low = 0;
for (const x of shots) {
  const want = [...new Set(tc(x.sc).flatMap(words))], got = new Set(words(ocr[x.f] ?? ''));
  const found = want.filter((w) => got.has(w)), pct = want.length ? found.length / want.length : 1;
  if (pct < 0.75) low++;
  const miss = want.filter((w) => !got.has(w)).slice(0, 8).join(' ');
  rows.push(`| ${x.id} | ${x.at.toFixed(2)} | ${Math.round(pct * 100)}% | ${miss || '—'} |`);
}
const rep = [`# OCR cross-check (supporting evidence) — ${ep.slug} — ${new Date().toISOString()}`, '',
  `Frames taken from \`${tl.out}\` after each scene settles; Windows OCR (ar-SA). "found" = share of intended words OCR also read.`,
  'OCR misreads are expected (small text, digits, Latin); a low score means "look at this frame", not "text is wrong".', '',
  '| scene | time (s) | found | words OCR did not read |', '|---|---|---|---|', ...rows];
writeFileSync(join(dir, 'build', 'ocrcheck.md'), rep.join('\n') + '\n');
console.log(`${ep.slug}: ${shots.length} frames OCR'd, ${low} below 75% word match → build/ocrcheck.md`);
