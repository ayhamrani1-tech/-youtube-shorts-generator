// Build an episode MP4 from Canva-exported frames + optional narration clips.
// Usage: node scripts/render.mjs episodes/<slug>
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const FF = join(ROOT, 'tools', 'ffmpeg-9.0.2-essentials_build', 'bin');
const ffmpeg = join(FF, 'ffmpeg.exe');
const ffprobe = join(FF, 'ffprobe.exe');

const epDir = resolve(process.argv[2] ?? 'episodes/bale');
const ep = JSON.parse(readFileSync(join(epDir, 'episode.json'), 'utf8'));
const { width: W, height: H, fps } = ep;

const probeDur = (f) =>
  parseFloat(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());

// --- timeline: a scene lasts at least its narration + padding
const NARR_LEAD = 0.3, NARR_TAIL = 0.4;
let t = 0;
const scenes = ep.scenes.map((s, i) => {
  const frame = join(epDir, 'frames', String(i + 1).padStart(2, '0') + '.png');
  if (!existsSync(frame)) throw new Error(`missing ${frame}`);
  const audio = join(epDir, 'audio', `${s.id}.wav`);
  const narr = s.narration && existsSync(audio) ? audio : null;
  const narrDur = narr ? probeDur(narr) : 0;
  const dur = s.type === 'count' ? s.seconds : Math.max(s.seconds, narrDur + NARR_LEAD + NARR_TAIL);
  const out = { ...s, frame, narr, narrDur, start: t, dur: +dur.toFixed(3) };
  t += out.dur;
  return out;
});
const total = +t.toFixed(3);

// --- inputs
const args = ['-y', '-hide_banner', '-loglevel', 'error'];
scenes.forEach((s) => args.push('-loop', '1', '-framerate', String(fps), '-t', String(s.dur), '-i', s.frame));
let idx = scenes.length;
const audioIn = [];
scenes.forEach((s) => { if (s.narr) { args.push('-i', s.narr); audioIn.push({ i: idx++, at: s.start + NARR_LEAD, kind: 'narr' }); } });
// sound effects (generated, no third-party assets)
scenes.forEach((s) => {
  if (s.type === 'count') { args.push('-f', 'lavfi', '-i', 'sine=frequency=1000:duration=0.12'); audioIn.push({ i: idx++, at: s.start, kind: 'tick' }); }
  if (s.type === 'reveal') {
    args.push('-f', 'lavfi', '-i', 'sine=frequency=660:duration=0.18'); audioIn.push({ i: idx++, at: s.start, kind: 'ding' });
    args.push('-f', 'lavfi', '-i', 'sine=frequency=990:duration=0.45'); audioIn.push({ i: idx++, at: s.start + 0.16, kind: 'ding' });
  }
});
args.push('-f', 'lavfi', '-t', String(total), '-i', 'anullsrc=r=44100:cl=stereo');
const silence = idx++;

// --- video graph: gentle push-in on normal scenes, pop-in on countdown/reveal, short fades
const F = [];
scenes.forEach((s, i) => {
  const n = Math.round(s.dur * fps);
  const pop = s.type === 'count' || s.type === 'reveal';
  const z = pop ? `if(lt(on,8),1.12-0.015*on,1)` : `1+0.04*on/${n}`;
  let chain = `[${i}:v]scale=${W * 2}:${H * 2},zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${fps},` +
    `trim=end_frame=${n},setpts=PTS-STARTPTS,format=yuv420p`;
  if (s.type !== 'count') chain += `,fade=t=in:st=0:d=0.25`;
  if (s.type !== 'count' && i < scenes.length - 1 && scenes[i + 1].type !== 'count') chain += `,fade=t=out:st=${(s.dur - 0.25).toFixed(3)}:d=0.25`;
  if (i === scenes.length - 1) chain += `,fade=t=out:st=${(s.dur - 0.5).toFixed(3)}:d=0.5`;
  F.push(`${chain}[v${i}]`);
});
F.push(scenes.map((_, i) => `[v${i}]`).join('') + `concat=n=${scenes.length}:v=1:a=0[vout]`);

// --- audio graph
const mixIns = [`[${silence}:a]`];
audioIn.forEach((a, k) => {
  const ms = Math.round(a.at * 1000);
  const vol = a.kind === 'narr' ? 1.0 : a.kind === 'tick' ? 0.35 : 0.4;
  F.push(`[${a.i}:a]aresample=44100,aformat=channel_layouts=stereo,afade=t=in:d=0.01,volume=${vol},adelay=${ms}|${ms}[a${k}]`);
  mixIns.push(`[a${k}]`);
});
F.push(`${mixIns.join('')}amix=inputs=${mixIns.length}:normalize=0:duration=first,alimiter=limit=0.95[aout]`);

mkdirSync(join(ROOT, 'out'), { recursive: true });
const outFile = join(ROOT, 'out', `${ep.slug}.mp4`);
args.push('-filter_complex', F.join(';'), '-map', '[vout]', '-map', '[aout]',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-r', String(fps), '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k', '-t', String(total), '-movflags', '+faststart', outFile);

console.log(`Rendering ${scenes.length} scenes, ${total}s, ${audioIn.filter((a) => a.kind === 'narr').length} narration clips...`);
execFileSync(ffmpeg, args, { stdio: 'inherit' });
writeFileSync(join(epDir, 'timeline.json'), JSON.stringify({ total, scenes: scenes.map(({ id, type, start, dur, narrDur }) => ({ id, type, start: +start.toFixed(3), dur, narrDur: +narrDur.toFixed(3) })) }, null, 2));
console.log(`Done: ${outFile}`);
