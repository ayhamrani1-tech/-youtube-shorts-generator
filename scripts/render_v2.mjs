// v2 renderer: page-to-page entrance transitions (xfade between consecutive Canva pages, so only the
// parts that changed animate), a damped "pop" on chosen regions, synthesized whoosh/tick/chime SFX.
// v1 renderer (render.mjs) is unchanged. Usage: node scripts/render_v2.mjs episodes/bale/v2
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const FF = join(ROOT, 'tools', 'ffmpeg-9.0.2-essentials_build', 'bin');
const ffmpeg = join(FF, 'ffmpeg.exe');
const ffprobe = join(FF, 'ffprobe.exe');

const epDir = resolve(process.argv[2] ?? 'episodes/bale/v2');
const cfg = process.argv[3] ?? 'episode.json'; // optional alternate config in the same episode folder
const ep = JSON.parse(readFileSync(join(epDir, cfg), 'utf8'));
const isXfade = (s) => s.enter && s.enter.type !== 'cut';
const { width: W, height: H, fps } = ep;
const frameFile = (n) => join(epDir, 'frames', String(n).padStart(2, '0') + '.png');
const probeDur = (f) =>
  parseFloat(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());

// --- timeline: scene length = max(planned, narration lead + clip + tail)
const TAIL = 0.35;
let t = 0;
const scenes = ep.scenes.map((s, i) => {
  if (!existsSync(frameFile(s.frame))) throw new Error(`missing frame ${s.frame}`);
  const lead = s.narrLead ?? (isXfade(s) ? s.enter.d + 0.05 : 0.2);
  const audio = join(epDir, 'audio', `${s.id}.wav`);
  const narr = s.narration && existsSync(audio) ? audio : null;
  const narrDur = narr ? probeDur(narr) : 0;
  const dur = +Math.max(s.seconds, narr ? lead + narrDur + TAIL : 0).toFixed(3);
  const out = { ...s, i, lead, narr, narrDur, start: +t.toFixed(3), dur };
  t += dur;
  return out;
});
const total = +t.toFixed(3);

const args = ['-y', '-hide_banner', '-loglevel', 'error'];
let idx = 0;
const addInput = (...a) => { args.push(...a); return idx++; };
const F = [];
const norm = `fps=${fps},scale=${W}:${H},format=yuv420p,setsar=1`;

// --- video: one segment per scene
scenes.forEach((s, i) => {
  const n = Math.round(s.dur * fps);
  const cur = addInput('-loop', '1', '-framerate', String(fps), '-t', String(s.dur + 0.1), '-i', frameFile(s.frame));
  F.push(`[${cur}:v]${norm}[c${i}]`);
  let base = `c${i}`;

  if (s.motion === 'push') { // slow push-in on the cover only
    F.push(`[${base}]scale=${W * 2}:${H * 2},zoompan=z='1+0.05*on/${n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${fps}[z${i}]`);
    base = `z${i}`;
  }
  if (isXfade(s) && i > 0) { // transition from the previous page into this one
    const prev = addInput('-loop', '1', '-framerate', String(fps), '-t', String(s.enter.d + 0.05), '-i', frameFile(scenes[i - 1].frame));
    F.push(`[${prev}:v]${norm}[p${i}]`);
    F.push(`[p${i}][${base}]xfade=transition=${s.enter.type}:duration=${s.enter.d}:offset=0[x${i}]`);
    base = `x${i}`;
  }
  // damped scale bounce on regions (countdown ring, answer card, clue card/row). The region is cropped whole
  // from the current page and scaled, so text inside it is never split or mixed with another page.
  const pops = s.pops ?? (s.pop ? [{ r: s.pop, at: s.popAt }] : []);
  pops.forEach((p, j) => {
    const [px, py, pw, ph] = p.r;
    const t0 = p.at ?? 0;
    const [A, k, w] = p.A !== undefined ? [p.A, p.k ?? 9, p.w ?? 18] : s.type === 'reveal' ? [0.28, 6, 13] : [0.2, 9, 18];
    // overlay is switched off once the bounce has decayed (amplitude < 0.25%), so hold frames are the untouched page
    const S = `(1+${A}*exp(-(t-${t0})*${k})*cos((t-${t0})*${w}))`;
    const q = `${i}_${j}`;
    F.push(`[${base}]split[pa${q}][pb${q}]`);
    F.push(`[pb${q}]crop=${pw}:${ph}:${px}:${py},scale=w='2*trunc(iw*${S}/2)':h='2*trunc(ih*${S}/2)':eval=frame[pc${q}]`);
    F.push(`[pa${q}][pc${q}]overlay=x='${px + pw / 2}-overlay_w/2':y='${py + ph / 2}-overlay_h/2':enable='between(t,${t0},${(t0 + 6 / k).toFixed(3)})'[po${q}]`);
    base = `po${q}`;
  });
  F.push(`[${base}]trim=end_frame=${n},setpts=PTS-STARTPTS,format=yuv420p[v${i}]`);
});
F.push(scenes.map((_, i) => `[v${i}]`).join('') + `concat=n=${scenes.length}:v=1:a=0[vout]`);

// --- audio: narration + generated SFX (no third-party audio)
const mix = [];
const place = (inIdx, at, vol, extra = '') => {
  const ms = Math.round(at * 1000), k = mix.length;
  F.push(`[${inIdx}:a]aresample=44100,aformat=channel_layouts=stereo${extra},volume=${vol},adelay=${ms}|${ms}[a${k}]`);
  mix.push(`[a${k}]`);
};
scenes.forEach((s) => {
  if (s.narr) place(addInput('-i', s.narr), s.start + s.lead, 1.0);
  if (s.whoosh) place(addInput('-f', 'lavfi', '-i', 'anoisesrc=d=0.45:c=pink:a=0.6'), s.start, 0.22,
    ',highpass=f=500,lowpass=f=5000,afade=t=in:d=0.08,afade=t=out:st=0.12:d=0.33');
  if (s.type === 'count') place(addInput('-f', 'lavfi', '-i', 'sine=frequency=1000:duration=0.12'), s.start, 0.35, ',afade=t=in:d=0.01');
  if (s.type === 'reveal') {
    place(addInput('-f', 'lavfi', '-i', 'sine=frequency=660:duration=0.18'), s.start + 0.45, 0.4, ',afade=t=in:d=0.01');
    place(addInput('-f', 'lavfi', '-i', 'sine=frequency=990:duration=0.5'), s.start + 0.6, 0.4, ',afade=t=in:d=0.01,afade=t=out:st=0.2:d=0.3');
  }
});
const sil = addInput('-f', 'lavfi', '-t', String(total), '-i', 'anullsrc=r=44100:cl=stereo');
F.push(`[${sil}:a]${mix.join('')}amix=inputs=${mix.length + 1}:normalize=0:duration=first,alimiter=limit=0.95[aout]`);

mkdirSync(join(ROOT, 'out'), { recursive: true });
const outFile = join(ROOT, 'out', `${ep.slug}.mp4`);
args.push('-filter_complex', F.join(';'), '-map', '[vout]', '-map', '[aout]',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-r', String(fps), '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k', '-t', String(total), '-movflags', '+faststart', outFile);

console.log(`Rendering ${scenes.length} scenes, ${total}s ...`);
execFileSync(ffmpeg, args, { stdio: 'inherit' });
writeFileSync(join(epDir, cfg === 'episode.json' ? 'timeline.json' : `timeline_${ep.slug}.json`), JSON.stringify({ total, scenes: scenes.map(({ id, type, start, dur, lead, narrDur, enter }) =>
  ({ id, type: type ?? (id.startsWith('c') ? 'clue' : id), start, dur, enter: enter?.type ?? null, enterDur: enter && enter.type !== 'cut' ? enter.d : 0, narrStart: +(start + lead).toFixed(3), narrDur: +narrDur.toFixed(3) })) }, null, 2));
console.log(`Done: ${outFile}`);
