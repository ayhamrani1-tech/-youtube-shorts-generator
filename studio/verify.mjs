// Step 4: verify the rendered episode. Usage: node studio/verify.mjs episodes/<slug>
// Checks container/streams/duration/audio, narration fit and sources, countdown and reveal (transfer),
// and compares every scene's settled frame with its source PNG (PSNR) to prove text was not altered.
import { execFileSync, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { readJSON, writeJSON, ensureDir, epPaths, FFMPEG, FFPROBE } from './lib.mjs';

const dir = resolve(process.argv[2] ?? '.');
const p = epPaths(dir);
const ep = readJSON(p.config);
const tl = readJSON(p.timeline);
const mp4 = tl.out;
const probe = JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,r_frame_rate', '-of', 'json', mp4]).toString());
const v = probe.streams.find((s) => s.codec_type === 'video'), a = probe.streams.find((s) => s.codec_type === 'audio');
const dur = parseFloat(probe.format.duration);
const vd = spawnSync(FFMPEG, ['-hide_banner', '-i', mp4, '-map', '0:a', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
const mean = vd.match(/mean_volume: (-?[\d.]+)/)?.[1], max = vd.match(/max_volume: (-?[\d.]+)/)?.[1];
const [lo, hi] = ep.targetSeconds ?? [0, 1e9];

const checks = [
  [`duration ${lo}–${hi}s`, dur >= lo && dur <= hi, `${dur.toFixed(2)}s`],
  [`resolution ${ep.width}x${ep.height}`, v?.width === ep.width && v?.height === ep.height, `${v?.width}x${v?.height}`],
  ['video h264', v?.codec_name === 'h264', `${v?.codec_name} @ ${v?.r_frame_rate}`],
  ['audio present and audible', !!a && parseFloat(max) > -40, `mean ${mean} dB, max ${max} dB`],
  ['timeline matches file', Math.abs(dur - tl.total) < 0.15, `timeline ${tl.total}s`],
];
const late = tl.scenes.filter((s) => s.narrDur && s.narrStart + s.narrDur > s.start + s.dur + 0.01);
checks.push(['narration fits its scene (no speed-up)', late.length === 0, late.length ? late.map((s) => s.id).join(',') : 'all fit']);
const srcs = tl.scenes.filter((s) => s.narrSource !== '—').reduce((m, s) => (m[s.narrSource] = (m[s.narrSource] ?? 0) + 1, m), {});
checks.push(['narration source', !srcs.missing, JSON.stringify(srcs) + (srcs.draft ? '  (draft = eSpeak timing test, not final)' : '') + (srcs.tts ? '  (tts = SILMA automatic voice, not yet approved)' : '')]);
if (tl.scenes.some((s) => /^n\d$/.test(s.id))) { // every quiz type: 5→1 countdown then reveal
  const counts = tl.scenes.filter((s) => /^n\d$/.test(s.id)), cEnd = counts.at(-1).start + counts.at(-1).dur;
  const rev = tl.scenes.find((s) => s.id === 'reveal');
  checks.push(['countdown exactly 5s', Math.abs(counts.reduce((x, s) => x + s.dur, 0) - 5) < 0.01, `${counts.reduce((x, s) => x + s.dur, 0)}s`]);
  checks.push(['name reveal ≤1s after countdown', rev.start - cEnd <= 1.0 && rev.start >= cEnd, `countdown ends ${cEnd.toFixed(2)}s, reveal ${rev.start}s`]);
}
const holds = tl.scenes.filter((s) => ['clue', 'attr', 'hint', 'text', 'fact', 'timeline', 'trophies', 'compare', 'formation', 'quote'].includes(s.layout));
const short = holds.filter((s) => s.dur - Math.max(s.settle, 0.5) < 3.0);
if (holds.length) checks.push(['text holds still ≥3s after entrance', short.length === 0, short.length ? short.map((s) => s.id).join(',') : `${holds.length} scenes`]);

// settled frame vs source PNG
const out = ensureDir(p.check), bad = [];
for (const s of tl.scenes) {
  const at = Math.min(s.start + s.dur - 0.05, s.start + Math.max(s.settle, s.entrance === 'push' ? 0 : 0.7) + 0.05);
  // scenes with moving sprites compare only their static text region (psnrCrop = [x,y,w,h])
  const crop = s.psnrCrop ? `,crop=${s.psnrCrop[2]}:${s.psnrCrop[3]}:${s.psnrCrop[0]}:${s.psnrCrop[1]}` : '';
  const r = spawnSync(FFMPEG, ['-hide_banner', '-ss', at.toFixed(3), '-i', mp4, '-i', s.frame, '-frames:v', '1', '-lavfi',
    `[0:v]format=yuv420p${crop}[x];[1:v]scale=${ep.width}:${ep.height},format=yuv420p${crop}[y];[x][y]psnr`, '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const ps = parseFloat(r.match(/average:([\d.]+|inf)/)?.[1] ?? '0');
  s.psnr = ps;
  if (s.entrance !== 'push' && ps < 40) bad.push(`${s.id}:${ps.toFixed(1)}`);
  execFileSync(FFMPEG, ['-y', '-v', 'error', '-ss', at.toFixed(3), '-i', mp4, '-frames:v', '1', '-vf', `scale=${Math.round(ep.width / 3)}:-1`, join(out, `${s.id}.jpg`)]);
}
checks.push(['settled frames identical to source (PSNR ≥ 40 dB)', bad.length === 0, bad.length ? bad.join(' ') : `min ${Math.min(...tl.scenes.filter((s) => s.entrance !== 'push').map((s) => s.psnr)).toFixed(1)} dB`]);

// mid-transition frames: must equal the exact blend of this scene's own layers (no other page's text can leak in)
const trans = tl.scenes.filter((s) => (s.entrance === 'reveal' && s.baseFrame) || s.entrance === 'flash'), tbad = [];
let tmin = Infinity;
for (const s of trans) {
  // reference = the same entrance filter applied, without compression, to ONLY this scene's own images
  const d = s.entranceD ?? (s.entrance === 'flash' ? 0.3 : 0.5), fps = ep.fps, n = Math.max(1, Math.round((d / 2) * fps));
  const at = (Math.round(s.start * fps) + n) / fps - 0.0005, norm = `fps=${fps},scale=${ep.width}:${ep.height},format=yuv420p,setsar=1`;
  const ins = s.entrance === 'flash' ? ['-loop', '1', '-framerate', String(fps), '-t', '1', '-i', s.frame]
    : ['-loop', '1', '-framerate', String(fps), '-t', String(d + 0.1), '-i', s.baseFrame, '-loop', '1', '-framerate', String(fps), '-t', '1', '-i', s.stepFrames?.[0] ?? s.frame];
  const pick = `select=eq(n\\,${n}),setpts=PTS-STARTPTS[e]`;
  const ref = s.entrance === 'flash' ? `[1:v]${norm},fade=t=in:st=0:d=${d}:color=white,${pick}`
    : `[1:v]${norm}[vb];[2:v]${norm}[vf];[vb][vf]xfade=transition=fade:duration=${d}:offset=0,${pick}`;
  const r = spawnSync(FFMPEG, ['-hide_banner', '-ss', at.toFixed(4), '-i', mp4, ...ins, '-frames:v', '1', '-lavfi',
    `${ref};[0:v]format=yuv420p,setpts=PTS-STARTPTS[x];[x][e]psnr`, '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const ps = parseFloat(r.match(/average:([\d.]+|inf)/)?.[1] ?? '0'); tmin = Math.min(tmin, ps);
  if (ps < 30) tbad.push(`${s.id}:${ps.toFixed(1)}`);
  execFileSync(FFMPEG, ['-y', '-v', 'error', '-ss', at.toFixed(4), '-i', mp4, '-frames:v', '1', '-vf', `scale=${Math.round(ep.width / 3)}:-1`, join(out, `${s.id}.mid.jpg`)]);
}
// progressive items: the frame halfway through each item's fade = xfade(previous step, this step) of the scene's own frames
for (const s of tl.scenes.filter((x) => x.stepTimes?.length)) {
  s.stepTimes.forEach((st, i) => {
    const fps = ep.fps, n = Math.round(0.2 * fps), at = (Math.round(s.start * fps) + Math.round(st * fps) + n) / fps - 0.0005;
    const norm = `fps=${fps},scale=${ep.width}:${ep.height},format=yuv420p,setsar=1`;
    const r = spawnSync(FFMPEG, ['-hide_banner', '-ss', at.toFixed(4), '-i', mp4, '-loop', '1', '-framerate', String(fps), '-t', '1', '-i', s.stepFrames[i],
      '-loop', '1', '-framerate', String(fps), '-t', '1', '-i', s.stepFrames[i + 1], '-frames:v', '1', '-lavfi',
      `[1:v]${norm}[a];[2:v]${norm}[b];[a][b]xfade=transition=fade:duration=0.4:offset=0,select=eq(n\\,${n}),setpts=PTS-STARTPTS[e];[0:v]format=yuv420p,setpts=PTS-STARTPTS[x];[x][e]psnr`,
      '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
    const ps = parseFloat(r.match(/average:([\d.]+|inf)/)?.[1] ?? '0'); trans.push(s); tmin = Math.min(tmin, ps);
    if (ps < 30) tbad.push(`${s.id}/item${i + 2}:${ps.toFixed(1)}`);
  });
}
if (trans.length) checks.push(['mid-transition frames = blend of the scene\'s own layers (PSNR ≥ 30 dB)', tbad.length === 0, tbad.length ? tbad.join(' ') : `${trans.length} transitions, min ${tmin.toFixed(1)} dB`]);
writeJSON(join(dir, "build", "verify.json"), { mp4, duration: +dur.toFixed(3), width: v?.width, height: v?.height, narration: srcs, checks: checks.map(([name, ok, info]) => ({ name, ok, info })) });
for (const [name, ok, info] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${info})`);
console.log(`Check frames: ${out}`);
process.exitCode = checks.every((c) => c[1]) ? 0 : 1;
