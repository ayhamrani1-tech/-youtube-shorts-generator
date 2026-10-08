// Generate one narration WAV per scene into episodes/<slug>/audio/<scene-id>.wav
// Draft engine: eSpeak NG (GPL-3.0; generated audio is unrestricted).
// To swap voices later, replace the WAVs in audio/ (same filenames) and re-run render.mjs.
// Usage: node scripts/tts.mjs episodes/<slug> [--voice ar+m3] [--speed 145] [--only c1,c2]
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = resolve(import.meta.dirname, '..');
const ESPEAK_DIR = join(ROOT, 'tools', 'espeak', 'eSpeak NG');
const ffmpeg = join(ROOT, 'tools', 'ffmpeg-9.0.2-essentials_build', 'bin', 'ffmpeg.exe');

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const epDir = resolve(argv.find((a) => !a.startsWith('--') && !argv[argv.indexOf(a) - 1]?.startsWith('--')) ?? 'episodes/bale');
const voice = opt('--voice', 'ar+m3');
const speed = opt('--speed', '165');
const only = opt('--only', '')?.split(',').filter(Boolean);

const ep = JSON.parse(readFileSync(join(epDir, 'episode.json'), 'utf8'));
const audioDir = join(epDir, 'audio');
mkdirSync(audioDir, { recursive: true });

for (const s of ep.scenes) {
  if (!s.narration || (only?.length && !only.includes(s.id))) continue;
  const txt = join(tmpdir(), `fvs_${s.id}.txt`);
  const raw = join(tmpdir(), `fvs_${s.id}_raw.wav`);
  writeFileSync(txt, s.narration, 'utf8');
  execFileSync(join(ESPEAK_DIR, 'espeak-ng.exe'), ['--path=' + ESPEAK_DIR, '-v', voice, '-s', speed, '-p', '45', '-f', txt, '-w', raw]);
  // clean up: trim edge silence, loudness-normalise, 44.1 kHz mono
  execFileSync(ffmpeg, ['-y', '-v', 'error', '-i', raw, '-af',
    'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,highpass=f=80,loudnorm=I=-16:TP=-1.5:LRA=11',
    '-ar', '44100', '-ac', '1', join(audioDir, `${s.id}.wav`)]);
  rmSync(txt); rmSync(raw);
  console.log(`audio/${s.id}.wav`);
}
