// Shared helpers for the FootballVideoStudio engine (no external npm packages).
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '..');
const FFBIN = join(ROOT, 'tools', 'ffmpeg-9.0.2-essentials_build', 'bin');
export const FFMPEG = join(FFBIN, 'ffmpeg.exe');
export const FFPROBE = join(FFBIN, 'ffprobe.exe');
export const ESPEAK_DIR = join(ROOT, 'tools', 'espeak', 'eSpeak NG');
export const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find(existsSync);

export const readJSON = (f) => JSON.parse(readFileSync(f, 'utf8'));
export const writeJSON = (f, o) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(o, null, 2) + '\n'); };
export const ensureDir = (d) => { mkdirSync(d, { recursive: true }); return d; };
export const listFiles = (d) => (existsSync(d) ? readdirSync(d) : []);

/** Run ffmpeg; retries once on the transient Windows EPERM spawn error seen earlier. */
export function ffmpeg(args, opts = {}) {
  for (let attempt = 0; ; attempt++) {
    try { return execFileSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: opts.stdio ?? 'pipe', maxBuffer: 1 << 26 }); }
    catch (e) { if (e.code === 'EPERM' && attempt < 2) continue; throw e; }
  }
}
export const probeDuration = (f) =>
  parseFloat(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
export const hasAudio = (f) =>
  execFileSync(FFPROBE, ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', f]).toString().trim().length > 0;

/** Speech segments via silencedetect: returns [[start,end],...] in seconds. */
export function speechSegments(file, noiseDb = -40, minSil = 0.25) {
  const out = spawnSync(FFMPEG, ['-hide_banner', '-i', file, '-af', `silencedetect=noise=${noiseDb}dB:d=${minSil}`, '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const dur = probeDuration(file);
  const sil = [];
  let s = null;
  for (const line of out.split('\n')) {
    const a = line.match(/silence_start: ([\d.]+)/); if (a) s = +a[1];
    const b = line.match(/silence_end: ([\d.]+)/); if (b) { sil.push([s ?? 0, +b[1]]); s = null; }
  }
  if (s !== null) sil.push([s, dur]);
  const segs = []; let t = 0;
  for (const [a, b] of sil) { if (a - t > 0.05) segs.push([t, a]); t = b; }
  if (dur - t > 0.05) segs.push([t, dur]);
  return segs;
}

/** Count Arabic letters (used to estimate speaking length per line). */
export const arabicLetters = (s) => [...(s || '')].filter((c) => /[\u0621-\u064A]/.test(c)).length || [...(s || '')].filter((c) => /\p{L}/u.test(c)).length;

/** Screenshot an HTML file to PNG with headless Edge (Chromium shaping: correct Arabic joining + RTL). */
export function htmlToPng(htmlFile, pngFile, w, h) {
  if (!EDGE) throw new Error('Microsoft Edge not found');
  const url = 'file:///' + htmlFile.replace(/\\/g, '/');
  // Own throw-away profile so headless Edge never attaches to (or waits on) the user's open Edge windows.
  const profile = join(ROOT, 'build_cache', 'edge-profile');
  mkdirSync(profile, { recursive: true });
  if (existsSync(pngFile)) rmSync(pngFile);
  for (let attempt = 0; attempt < 3; attempt++) {
    spawnSync(EDGE, ['--headless=new', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
      '--disable-extensions', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      '--default-background-color=00000000', `--window-size=${w},${h}`, `--screenshot=${pngFile}`, url],
    { encoding: 'utf8', timeout: 45000 });
    if (existsSync(pngFile)) return;
  }
  throw new Error(`screenshot failed: ${htmlFile}`);
}

export const epPaths = (epDir) => ({
  dir: epDir,
  config: join(epDir, 'episode.json'),
  scenes: join(epDir, 'build', 'scenes.json'),
  html: join(epDir, 'build', 'html'),
  frames: join(epDir, 'build', 'frames'),
  segments: join(epDir, 'build', 'segments'),
  timeline: join(epDir, 'build', 'timeline.json'),
  audio: join(epDir, 'audio'),
  incoming: join(epDir, 'narration', 'incoming'),
  script: join(epDir, 'narration', 'SCRIPT.md'),
  check: join(epDir, 'build', 'check'),
});
