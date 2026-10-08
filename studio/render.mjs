// Step 3: render every scene to its own cached segment (video + audio), then concatenate.
// Scene length = max(planned seconds, narration lead + clip + tail) — speech is never sped up.
// Narration per scene: audio/final/<id>.wav (Clipchamp import) › audio/tts/<id>.wav (SILMA, local) › audio/draft/<id>.wav (eSpeak) › silence.
// Usage: node studio/render.mjs episodes/<slug>
import { writeFileSync, existsSync, readFileSync, renameSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { ROOT, readJSON, writeJSON, ensureDir, epPaths, ffmpeg, probeDuration } from './lib.mjs';

const dir = resolve(process.argv[2] ?? '.');
const p = epPaths(dir);
const ep = readJSON(p.config);
const { scenes } = readJSON(p.scenes);
const { width: W, height: H, fps } = ep;
const TAIL = 0.35;
ensureDir(p.segments);

// ---------- timeline ----------
let t = 0;
const tl = scenes.map((s) => {
  const fin = join(p.audio, 'final', `${s.id}.wav`), tt = join(p.audio, 'tts', `${s.id}.wav`), dr = join(p.audio, 'draft', `${s.id}.wav`);
  const pick = (ep.voice?.prefer ?? ['final', 'tts', 'draft']).map((k) => ({ final: fin, tts: tt, draft: dr })[k]).find((f) => existsSync(f));
  const narr = s.narration ? pick ?? null : null;
  const narrSource = !s.narration ? '—' : narr === fin ? 'final' : narr === tt ? 'tts' : narr === dr ? 'draft' : 'missing';
  const narrDur = narr ? probeDuration(narr) : 0;
  const lead = s.narrLead ?? (s.entrance?.type === 'reveal' ? (s.entrance.d ?? 0.5) + 0.1 : 0.35);
  const dur = s.fixed ? s.seconds : Math.max(s.seconds, narr ? lead + narrDur + TAIL : 0);
  const n = Math.round(dur * fps);
  // progressive items: item k appears as the narration reaches it (even split of the spoken time), last item ≥3 s before the end
  let stepTimes;
  if (s.stepFrames?.length > 1) {
    const k = s.stepFrames.length, d0 = (s.entrance?.d ?? 0.5) + 0.6, span = narr ? narrDur : s.seconds - 1;
    stepTimes = Array.from({ length: k - 1 }, (_, i) => {
      const at = Math.max(d0 + i * 0.8, (narr ? lead : 0.3) + span * (i + 1) / k);
      return +Math.min(at, n / fps - 3.4 - (k - 2 - i) * 0.5).toFixed(3);
    });
  }
  const row = { ...s, narr, narrSource, narrDur: +narrDur.toFixed(3), lead, start: +t.toFixed(3), frames: n, dur: +(n / fps).toFixed(3), stepTimes };
  t += n / fps;
  return row;
});
const total = +t.toFixed(3);

// ---------- per-scene video ----------
const fileHash = (f) => createHash('sha1').update(readFileSync(f)).digest('hex').slice(0, 12);
function videoSegment(s) {
  const n = s.frames, args = [], F = [];
  let idx = 0; const inp = (f, len) => { args.push('-loop', '1', '-framerate', String(fps), '-t', String(len), '-i', f); return idx++; };
  const norm = `fps=${fps},scale=${W}:${H},format=yuv420p,setsar=1`;
  const first = s.stepFrames ? s.stepFrames[0] : s.frame;
  const full = inp(first, s.dur + 0.2);
  F.push(`[${full}:v]${norm}[v0]`); let cur = 'v0';
  const e = s.entrance ?? { type: 'cut' };
  if (e.type === 'push') { F.push(`[${cur}]scale=${W * 2}:${H * 2},zoompan=z='1+0.05*on/${n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${fps}[vz]`); cur = 'vz'; }
  if (e.type === 'reveal' && s.baseFrame) { // text layer fades in over the identical background
    const b = inp(s.baseFrame, e.d + 0.1); F.push(`[${b}:v]${norm}[vb]`, `[vb][${cur}]xfade=transition=fade:duration=${e.d}:offset=0[vr]`); cur = 'vr';
  }
  if (e.type === 'flash') { F.push(`[${cur}]fade=t=in:st=0:d=${e.d ?? 0.3}:color=white[vf]`); cur = 'vf'; }
  (s.stepTimes ?? []).forEach((at, i) => { // next item fades in over the identical previous step
    const k = inp(s.stepFrames[i + 1], s.dur - at + 0.3);
    F.push(`[${k}:v]${norm}[st${i}]`, `[${cur}][st${i}]xfade=transition=fade:duration=0.4:offset=${at}[sx${i}]`); cur = `sx${i}`;
  });
  (s.pops ?? []).forEach((q, j) => { // whole-region damped bounce; switched off once settled
    const [x, y, w, h] = q.r, t0 = q.at ?? 0, k = q.k ?? 9, S = `(1+${q.A}*exp(-(t-${t0})*${k})*cos((t-${t0})*${q.w ?? 18}))`;
    F.push(`[${cur}]split[pa${j}][pb${j}]`, `[pb${j}]crop=${w}:${h}:${x}:${y},scale=w='2*trunc(iw*${S}/2)':h='2*trunc(ih*${S}/2)':eval=frame[pc${j}]`,
      `[pa${j}][pc${j}]overlay=x='${x + w / 2}-overlay_w/2':y='${y + h / 2}-overlay_h/2':enable='between(t,${t0},${(t0 + 6 / k).toFixed(3)})'[po${j}]`);
    cur = `po${j}`;
  });
  (s.moves ?? []).forEach((m, j) => { // sprite following a piecewise-linear path [[x,y,t],...] (tactical recreation)
    const sp = inp(join(ROOT, 'templates', 'kit', `${m.sprite}.png`), s.dur + 0.2), h = m.size / 2;
    const seg = (ax) => m.pts.slice(1).reduceRight((acc, q, i) => { const a = m.pts[i];
      return `if(lt(t,${q[2].toFixed(3)}),${a[ax]}+(${q[ax] - a[ax]})*(t-${a[2].toFixed(3)})/${(q[2] - a[2]).toFixed(3)},${acc})`; }, String(m.pts.at(-1)[ax]));
    const ex = (ax) => `if(lt(t,${m.pts[0][2].toFixed(3)}),${m.pts[0][ax]},${seg(ax)})-${h}`;
    F.push(`[${sp}:v]format=rgba,scale=${m.size}:${m.size}[sp${j}]`, `[${cur}][sp${j}]overlay=x='${ex(0)}':y='${ex(1)}':eval=frame[mv${j}]`);
    cur = `mv${j}`;
  });
  F.push(`[${cur}]trim=end_frame=${n},setpts=PTS-STARTPTS,format=yuv420p[out]`);
  const sprites = (s.moves ?? []).map((m) => fileHash(join(ROOT, 'templates', 'kit', `${m.sprite}.png`)));
  const key = createHash('sha1').update(JSON.stringify([F, n, fileHash(s.frame), s.baseFrame && fileHash(s.baseFrame), sprites, (s.stepFrames ?? []).map(fileHash)])).digest('hex').slice(0, 16);
  const out = join(p.segments, `${s.id}.mp4`), stamp = out + '.key';
  if (existsSync(out) && existsSync(stamp) && readFileSync(stamp, 'utf8') === key) return { out, cached: true };
  ffmpeg([...args, '-filter_complex', F.join(';'), '-map', '[out]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    '-r', String(fps), '-pix_fmt', 'yuv420p', '-video_track_timescale', '15360', '-an', out]);
  writeFileSync(stamp, key);
  return { out, cached: false };
}

// ---------- per-scene audio (exact scene length) ----------
const SFX = {
  whoosh: { src: 'anoisesrc=d=0.45:c=pink:a=0.6', at: 0, vol: 0.22, fx: ',highpass=f=500,lowpass=f=5000,afade=t=in:d=0.08,afade=t=out:st=0.12:d=0.33' },
  tick: { src: 'sine=frequency=1000:duration=0.12', at: 0, vol: 0.35, fx: ',afade=t=in:d=0.01' },
  chime: [{ src: 'sine=frequency=660:duration=0.18', at: 0.15, vol: 0.4, fx: ',afade=t=in:d=0.01' },
    { src: 'sine=frequency=990:duration=0.5', at: 0.3, vol: 0.4, fx: ',afade=t=in:d=0.01,afade=t=out:st=0.2:d=0.3' }],
};
function audioSegment(s) {
  const args = ['-f', 'lavfi', '-t', String(s.dur), '-i', 'anullsrc=r=44100:cl=stereo'], F = [], mix = ['[0:a]'];
  let idx = 1;
  const add = (inputArgs, at, vol, fx = '') => { args.push(...inputArgs); const ms = Math.round(at * 1000), k = idx++;
    F.push(`[${k}:a]aresample=44100,aformat=channel_layouts=stereo${fx},volume=${vol},adelay=${ms}|${ms}[a${k}]`); mix.push(`[a${k}]`); };
  if (s.narr) add(['-i', s.narr], s.lead, 1.0);
  for (const name of s.sfx ?? []) for (const x of [].concat(SFX[name])) add(['-f', 'lavfi', '-i', x.src], x.at, x.vol, x.fx);
  F.push(`${mix.join('')}amix=inputs=${mix.length}:normalize=0:duration=first,alimiter=limit=0.95,atrim=0:${s.dur}[out]`);
  const out = join(p.segments, `${s.id}.wav`);
  ffmpeg([...args, '-filter_complex', F.join(';'), '-map', '[out]', '-c:a', 'pcm_s16le', out]);
  return out;
}

let cached = 0;
const vlist = [], alist = [];
for (const s of tl) {
  const v = videoSegment(s); if (v.cached) cached++;
  vlist.push(`file '${v.out.replace(/\\/g, '/')}'`);
  alist.push(`file '${audioSegment(s).replace(/\\/g, '/')}'`);
}
writeFileSync(join(p.segments, 'video.txt'), vlist.join('\n') + '\n');
writeFileSync(join(p.segments, 'audio.txt'), alist.join('\n') + '\n');
const vcat = join(p.segments, '_video.mp4'), acat = join(p.segments, '_audio.wav');
ffmpeg(['-f', 'concat', '-safe', '0', '-i', join(p.segments, 'video.txt'), '-c', 'copy', vcat]);
ffmpeg(['-f', 'concat', '-safe', '0', '-i', join(p.segments, 'audio.txt'), '-c', 'copy', acat]);

const outDir = ensureDir(join(ROOT, 'out')), outFile = join(outDir, `${ep.slug}.mp4`);
if (existsSync(outFile)) { // keep the previous render
  const arch = ensureDir(join(outDir, 'archive')), ts = statSync(outFile).mtime.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  renameSync(outFile, join(arch, `${ep.slug}_${ts}.mp4`));
}
ffmpeg(['-i', vcat, '-i', acat, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', outFile]);
writeJSON(p.timeline, { total, slug: ep.slug, out: outFile, scenes: tl.map(({ id, chapter, layout, source, start, dur, lead, narrSource, narrDur, entrance, pops, fixed, frame, baseFrame, moves, psnrCrop, stepFrames, stepTimes }) =>
  ({ id, chapter, layout: layout ?? source, start, dur, narrStart: +(start + lead).toFixed(3), narrDur, narrSource, entrance: entrance?.type,
    settle: Math.max(0, ...(pops ?? []).map((q) => (q.at ?? 0) + 6 / (q.k ?? 9)), ...(moves ?? []).map((m) => m.pts.at(-1)[2]), ...(stepTimes ?? []).map((x) => x + 0.4)), fixed: !!fixed, frame, baseFrame, entranceD: entrance?.d, psnrCrop, stepFrames, stepTimes })) });
const src = tl.filter((s) => s.narration).reduce((m, s) => (m[s.narrSource] = (m[s.narrSource] ?? 0) + 1, m), {});
console.log(`${ep.slug}: ${tl.length} scenes, ${total}s (${cached} video segments cached) → ${outFile}`);
console.log(`narration: ${JSON.stringify(src)}`);
