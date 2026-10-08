// One command for a whole episode: build → textcheck → narration → render → verify, then a production report.
// This is the contract the Discord bot uses: it prints `PROGRESS <stage> <percent>` lines and writes
// episodes/<slug>/build/report.json. Exit code 0 only when every essential check passed.
// Usage: node studio/make.mjs episodes/<slug> [--voice tts|none] [--skip-render]
//   --voice tts   generate SILMA narration for lines without a Clipchamp (final) file (default when SILMA is installed)
//   --voice none  use whatever audio exists (final › tts › draft › silence)
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROOT, readJSON, writeJSON, epPaths } from './lib.mjs';

const args = process.argv.slice(2);
const dir = resolve(args.find((a) => !a.startsWith('--')) ?? '.');
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };
const p = epPaths(dir);
const ep = readJSON(p.config);
const silma = existsSync(join(ROOT, 'tools', 'tts-venv', 'Scripts', 'python.exe'));
const voice = opt('voice', silma ? 'tts' : 'none');
const started = new Date();
const report = { slug: ep.slug, type: ep.type, started: started.toISOString(), status: 'running', stages: [], warnings: [], errors: [] };
const save = () => writeJSON(join(dir, 'build', 'report.json'), report);

function stage(name, pct, script, { pre = [], essential = true } = {}) {
  console.log(`PROGRESS ${name} ${pct}`);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [join(ROOT, 'studio', script), ...pre, dir], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const st = { name, ok: r.status === 0, seconds: +((Date.now() - t0) / 1000).toFixed(1), tail: (r.stdout + r.stderr).trim().split('\n').slice(-6) };
  report.stages.push(st); save();
  if (!st.ok && essential) { report.status = 'failed'; report.errors.push(`${name} failed`); save(); finish(); }
  if (!st.ok) report.warnings.push(`${name} reported problems`);
  return st;
}
function finish() {
  report.finished = new Date().toISOString();
  report.seconds = +((Date.now() - started) / 1000).toFixed(1);
  save();
  console.log(`REPORT ${join(dir, 'build', 'report.json')}`);
  console.log(`STATUS ${report.status}`);
  process.exit(report.status === 'ok' ? 0 : 1);
}

stage('build', 5, 'build.mjs');
stage('textcheck', 15, 'textcheck.mjs');
if (voice === 'tts') stage('narration', 25, 'narration.mjs', { pre: ['tts'] });
if (args.includes('--skip-render')) { report.status = 'ok'; report.warnings.push('render skipped (preview of frames only)'); finish(); }
stage('render', 60, 'render.mjs');
const v = stage('verify', 90, 'verify.mjs', { essential: false });

// collect results
const vj = join(dir, 'build', 'verify.json');
if (existsSync(vj)) {
  const res = readJSON(vj);
  Object.assign(report, { output: res.mp4, duration: res.duration, resolution: `${res.width}x${res.height}`, narration: res.narration, checks: res.checks });
  const failed = res.checks.filter((c) => !c.ok);
  if (failed.length) { report.status = 'failed'; report.errors.push(...failed.map((c) => `check failed: ${c.name} (${c.info})`)); }
  if (res.narration?.draft) report.warnings.push('some narration is the eSpeak timing draft (robotic) — not publishable');
  if (res.narration?.tts) report.warnings.push('narration is the automatic SILMA voice — preview until you approve it by ear');
  if (res.narration?.missing) report.warnings.push('some lines have no narration');
} else if (v.ok) report.warnings.push('verify.json missing');
const tj = join(dir, 'build', 'textcheck.json');
if (existsSync(tj) && !readJSON(tj).ok) { report.status = 'failed'; report.errors.push('Arabic text check found problems (build/textcheck.md)'); }
if (report.status === 'running') report.status = 'ok';
finish();
