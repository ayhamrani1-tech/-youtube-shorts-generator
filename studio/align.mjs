// Shared speech-recognition helpers (faster-whisper via studio/asr.py) and script/word alignment.
// Used by narration.mjs (import + tts checks) and captions.mjs (word-by-word subtitles).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './lib.mjs';

export const PY = join(ROOT, 'tools', 'tts-venv', 'Scripts', 'python.exe');
export const asrAvailable = () => existsSync(PY);
export function asr(files) {
  const r = spawnSync(PY, [join(ROOT, 'studio', 'asr.py'), ...files], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ASR failed: ${(r.stderr || '').split('\n').slice(-4).join(' ')}`);
  return JSON.parse(r.stdout);
}
export const norm = (w) => w.replace(/[ً-ْٰـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
  .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/[^ء-ي0-9a-zA-Z]/g, '');
// ASR writes numbers as digits; the scripts spell them out — convert digits to Arabic words before comparing.
const U1 = ['', 'واحد', 'اثنين', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
const T1 = ['', 'عشرة', 'عشرين', 'ثلاثين', 'أربعين', 'خمسين', 'ستين', 'سبعين', 'ثمانين', 'تسعين'];
const TEEN = ['عشرة', 'أحد عشر', 'اثني عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
const H1 = ['', 'مئة', 'مئتين', 'ثلاثمئة', 'أربعمئة', 'خمسمئة', 'ستمئة', 'سبعمئة', 'ثمانمئة', 'تسعمئة'];
export function numWords(n) {
  if (n === 0) return 'صفر';
  const parts = [], th = Math.floor(n / 1000), h = Math.floor((n % 1000) / 100), r = n % 100;
  if (th) parts.push(th === 1 ? 'ألف' : th === 2 ? 'ألفين' : `${numWords(th)} آلاف`);
  if (h) parts.push(H1[h]);
  if (r) parts.push(r < 10 ? U1[r] : r < 20 ? TEEN[r - 10] : (r % 10 ? `${U1[r % 10]} و${T1[Math.floor(r / 10)]}` : T1[r / 10]));
  return parts.join(' و');
}
export const spellDigits = (t) => t.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\d+/g, (d) => numWords(parseInt(d, 10)));
export const words = (t) => spellDigits(t).split(/\s+/).map(norm).filter(Boolean);
export function lev(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) { let p = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1)); p = t; } }
  return d[b.length];
}
export const wsim = (a, b) => 1 - lev(a, b) / Math.max(a.length, b.length, 1);
/** Letter-level similarity between script text and recognised text (0–1). */
export const textSim = (a, b) => { const x = words(a).join(''), y = words(b).join(''); return 1 - lev(x, y) / Math.max(x.length, y.length, 1); };
/** Align script words to recognised words (Needleman–Wunsch); returns, per script word, the matched ASR word index or -1. */
export function alignWords(script, heard) {
  const n = script.length, m = heard.length, G = 0.8;
  const D = Array.from({ length: n + 1 }, (_, i) => new Float64Array(m + 1).fill(0).map((_, j) => (i === 0 ? j * G : j === 0 ? i * G : 0)));
  const B = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const s = wsim(script[i - 1], heard[j - 1]), sub = D[i - 1][j - 1] + (s >= 0.5 ? 1 - s : 1.2);
    const del = D[i - 1][j] + G, ins = D[i][j - 1] + G;
    D[i][j] = Math.min(sub, del, ins); B[i][j] = D[i][j] === sub ? 0 : D[i][j] === del ? 1 : 2;
  }
  const map = new Array(n).fill(-1); let i = n, j = m;
  while (i > 0 && j > 0) { const b = B[i][j]; if (b === 0) { if (wsim(script[i - 1], heard[j - 1]) >= 0.5) map[i - 1] = j - 1; i--; j--; } else if (b === 1) i--; else j--; }
  return map;
}
