// Check a rendered episode: duration, resolution, audio stream, loudness, and grab one frame per scene.
// Usage: node scripts/verify.mjs episodes/<slug>
import { readFileSync, mkdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const FF = join(ROOT, 'tools', 'ffmpeg-9.0.2-essentials_build', 'bin');
const epDir = resolve(process.argv[2] ?? 'episodes/bale');
const cfg = process.argv[3] ?? 'episode.json';
const ep = JSON.parse(readFileSync(join(epDir, cfg), 'utf8'));
const tl = JSON.parse(readFileSync(join(epDir, cfg === 'episode.json' ? 'timeline.json' : `timeline_${ep.slug}.json`), 'utf8'));
const mp4 = join(ROOT, 'out', `${ep.slug}.mp4`);
const [minS, maxS] = ep.targetSeconds ?? [40, 50];

const probe = JSON.parse(execFileSync(join(FF, 'ffprobe.exe'),
  ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels', '-of', 'json', mp4]).toString());
const v = probe.streams.find((s) => s.codec_type === 'video');
const a = probe.streams.find((s) => s.codec_type === 'audio');
const dur = parseFloat(probe.format.duration);

// mean/max volume of the audio track (detects a silent track)
const vd = spawnSync(join(FF, 'ffmpeg.exe'), ['-hide_banner', '-i', mp4, '-map', '0:a', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
const mean = vd.match(/mean_volume: (-?[\d.]+)/)?.[1], max = vd.match(/max_volume: (-?[\d.]+)/)?.[1];

const checks = [
  [`duration in ${minS}–${maxS}s`, dur >= minS && dur <= maxS, `${dur.toFixed(2)}s`],
  ['resolution 1080x1920', v?.width === ep.width && v?.height === ep.height, `${v?.width}x${v?.height}`],
  ['video codec h264', v?.codec_name === 'h264', `${v?.codec_name} @ ${v?.r_frame_rate}`],
  ['audio stream present', !!a, a ? `${a.codec_name} ${a.sample_rate}Hz ${a.channels}ch` : 'none'],
  ['audio not silent', max !== undefined && parseFloat(max) > -40, `mean ${mean} dB, max ${max} dB`],
];
const reveal = tl.scenes.find((s) => s.type === 'reveal');
const lastCount = tl.scenes.filter((s) => s.type === 'count');
const countLen = lastCount.reduce((x, s) => x + s.dur, 0);
checks.push(['countdown is 5s', Math.abs(countLen - 5) < 0.01, `${countLen}s`]);
const countEnd = lastCount.at(-1).start + lastCount.at(-1).dur;
const gap = reveal.start - countEnd; // v2 has a short "mystery" lead-in page before the name
checks.push(['reveal within 1s after countdown', gap >= -0.01 && gap <= 1.0, `countdown ends ${countEnd.toFixed(2)}s, name reveal at ${reveal.start}s`]);
const late = tl.scenes.filter((s) => s.narrDur && s.narrStart + s.narrDur > s.start + s.dur + 0.01);
checks.push(['narration fits inside its scene', late.length === 0, late.length ? late.map((s) => s.id).join(',') : 'all clips fit']);
if (tl.scenes[0].enterDur !== undefined) {
  const short = tl.scenes.filter((s) => s.type === 'clue' && s.dur - s.enterDur < 3.5);
  checks.push(['clue text holds still >= 3.5s', short.length === 0, short.length ? short.map((s) => s.id).join(',') : 'all clues']);
}

for (const [name, ok, info] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${info})`);

// one frame per scene, at its midpoint, for visual inspection
const out = join(epDir, cfg === 'episode.json' ? 'check' : `check_${ep.slug}`);
mkdirSync(out, { recursive: true });
for (const s of tl.scenes) {
  const at = (s.start + s.dur / 2).toFixed(2);
  execFileSync(join(FF, 'ffmpeg.exe'), ['-y', '-v', 'error', '-ss', at, '-i', mp4, '-frames:v', '1', '-vf', 'scale=540:-1', join(out, `${s.id}.jpg`)]);
}
console.log(`Frames written to ${out}`);
