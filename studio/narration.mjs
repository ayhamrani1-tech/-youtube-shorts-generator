// Narration workflow (manual Clipchamp export — nothing here generates the final voice).
//   node studio/narration.mjs script  episodes/<slug>   → narration/SCRIPT.md + narration/script.json
//   node studio/narration.mjs import  episodes/<slug>   → narration/incoming/* → audio/final/<scene>.wav
//   node studio/narration.mjs draft   episodes/<slug>   → audio/draft/<scene>.wav (eSpeak, timing test only)
// Accepted incoming files (any of .mp3 .wav .m4a .mp4 .aac .ogg; extension kept from Clipchamp):
//   NN_<id>.*   one scene             e.g. 03_c2.mp3
//   CH_<chapter>.*   one chapter, e.g. CH_ch2.mp3 (split across that chapter's narrated scenes)
//   00_full.* / any single unnamed file  whole narration (split across all scenes)
import { writeFileSync, existsSync, readdirSync, renameSync, readFileSync } from 'node:fs';
import { join, resolve, extname, basename } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ROOT, readJSON, writeJSON, ensureDir, epPaths, ffmpeg, probeDuration, speechSegments, arabicLetters, ESPEAK_DIR, hasAudio } from './lib.mjs';
import { tmpdir } from 'node:os';

const [cmd, epArg] = process.argv.slice(2);
const dir = resolve(epArg ?? '.');
const p = epPaths(dir);
const ep = readJSON(p.config);
const { scenes } = readJSON(p.scenes); // run studio/build.mjs first
const narrated = scenes.filter((s) => s.narration);
const AUDIO_EXT = ['.mp3', '.wav', '.m4a', '.mp4', '.aac', '.ogg', '.opus', '.webm', '.mov'];

function writeScript() {
  const lines = narrated.map((s, i) => ({ n: i + 1, file: `${String(i + 1).padStart(2, '0')}_${s.id}`, id: s.id, chapter: s.chapter, text: s.narration }));
  const chapters = [...new Set(lines.map((l) => l.chapter))];
  const longForm = ep.orientation === 'landscape';
  let md = `# ${ep.subject?.name_ar ?? ep.slug} — نص التعليق الصوتي (${ep.type})\n\n`;
  md += `صدّر من Clipchamp ملفًا لكل مشهد${longForm ? ' أو ملفًا لكل فصل' : ''}، وضعه في المجلد \`narration/incoming/\`.\n`;
  md += `الامتداد يبقى كما يصدّره Clipchamp (mp3 / wav / m4a / mp4).\n\n`;
  md += `| # | اسم الملف المقترح | الفصل | النص المنطوق |\n|---|---|---|---|\n`;
  for (const l of lines) md += `| ${l.n} | \`${l.file}\` | ${l.chapter} | ${l.text} |\n`;
  if (longForm) {
    md += `\n## بديل: ملف واحد لكل فصل\n`;
    chapters.forEach((c) => { md += `- \`CH_${c}\` يحتوي الأسطر: ${lines.filter((l) => l.chapter === c).map((l) => l.n).join('، ')}\n`; });
  }
  md += `\n## توجيهات (لا تُنطق)\n- الصوت والسرعة نفسهما في كل الملفات. لا تسرّع الكلام؛ المشاهد تطول تلقائيًا لتناسبه.\n`;
  md += `- بدون موسيقى أو مؤثرات من Clipchamp؛ المؤثرات تُضاف هنا.\n- في الملفات المجمّعة (فصل أو كامل): اترك ثانية صمت تقريبًا بين الأسطر.\n`;
  md += `- الصمت في البداية والنهاية يُقصّ تلقائيًا.\n`;
  ensureDir(p.incoming);
  writeFileSync(p.script, md);
  writeJSON(join(dir, 'narration', 'script.json'), { lines, chapters });
  console.log(`${lines.length} lines → ${p.script}`);
}

// Split one recording into N lines: dynamic programming over speech segments (from silencedetect)
// choosing contiguous groups whose speaking rate (sec/letter) is most consistent; long pauses preferred
// as boundaries. Returns [{start,end,rate,gapBefore,flag}].
function splitLines(wav, texts) {
  const segs = speechSegments(wav);
  const M = segs.length, N = texts.length;
  if (M < N) return { error: `only ${M} speech segments for ${N} lines — file may be incomplete, or lines run together` };
  const letters = texts.map(arabicLetters);
  const speech = (a, b) => segs.slice(a, b + 1).reduce((x, s) => x + s[1] - s[0], 0);
  const ref = speech(0, M - 1) / letters.reduce((a, b) => a + b, 0);
  const gap = (k) => (k <= 0 ? 1 : segs[k][0] - segs[k - 1][1]); // pause before segment k
  const INF = 1e18, cost = Array.from({ length: N + 1 }, () => Array(M + 1).fill(INF)), back = cost.map((r) => r.map(() => -1));
  cost[0][0] = 0;
  for (let i = 1; i <= N; i++) for (let j = i; j <= M; j++) for (let k = i - 1; k < j; k++) {
    if (cost[i - 1][k] >= INF) continue;
    const r = speech(k, j - 1) / letters[i - 1];
    const c = cost[i - 1][k] + Math.log(r / ref) ** 2 * 4 - (k > 0 ? Math.log(Math.min(gap(k), 2)) * 0.6 : 0);
    if (c < cost[i][j]) { cost[i][j] = c; back[i][j] = k; }
  }
  const groups = []; let j = M;
  for (let i = N; i >= 1; i--) { const k = back[i][j]; groups.unshift([k, j - 1]); j = k; }
  return {
    lines: groups.map(([a, b], i) => {
      const rate = speech(a, b) / letters[i], g = a > 0 ? gap(a) : null;
      const flags = [];
      if (g !== null && g < 0.5) flags.push(`short pause before (${g.toFixed(2)}s)`);
      if (Math.abs(Math.log(rate / ref)) > Math.log(1.45)) flags.push(`unusual speed (${(rate / ref).toFixed(2)}× average)`);
      return { start: segs[a][0], end: segs[b][1], rate: +rate.toFixed(3), gapBefore: g && +g.toFixed(2), flag: flags.join('; ') };
    }), segments: M,
  };
}

// ---------- speech recognition (supporting evidence: script ↔ audio) ----------
import { PY, asrAvailable, asr, norm, words, textSim, alignWords } from './align.mjs';
/** Sentence boundaries of a multi-line recording, confirmed against the script text via ASR word timings. */
function splitByScript(wav, texts) {
  const res = asr([wav])[wav], heard = res.words.filter((w) => norm(w.w));
  const lineOf = [], script = [];
  texts.forEach((t, li) => words(t).forEach((w) => { script.push(w); lineOf.push(li); }));
  const map = alignWords(script, heard.map((w) => norm(w.w)));
  const segs = speechSegments(wav);
  const lines = texts.map((t, li) => {
    const idx = map.filter((h, k) => lineOf[k] === li && h >= 0);
    const total = lineOf.filter((x) => x === li).length;
    return { first: idx.length ? Math.min(...idx) : -1, last: idx.length ? Math.max(...idx) : -1, matched: idx.length / total };
  });
  if (lines.some((l) => l.first < 0)) return { error: `could not find line(s) ${lines.map((l, i) => (l.first < 0 ? i + 1 : null)).filter(Boolean).join(', ')} in the recording (ASR) — check the file is complete` };
  // snap a time to the middle of the silence gap that contains it (if any)
  const snap = (t) => { for (let k = 1; k < segs.length; k++) if (t >= segs[k - 1][1] - 0.05 && t <= segs[k][0] + 0.05) return (segs[k - 1][1] + segs[k][0]) / 2; return t; };
  const out = lines.map((l, li) => {
    const s = li === 0 ? Math.max(0, heard[l.first].s - 0.3) : null, e = li === lines.length - 1 ? heard[l.last].e + 0.35 : null;
    return { s, e, l };
  });
  for (let li = 0; li < lines.length - 1; li++) {
    const b = snap((heard[lines[li].last].e + heard[lines[li + 1].first].s) / 2);
    out[li].e = b; out[li + 1].s = b;
  }
  // within its boundaries, keep each line from just before its first recognised word to just after its last
  out.forEach((o) => { o.s = Math.max(o.s, heard[o.l.first].s - 0.15); o.e = Math.min(o.e, heard[o.l.last].e + 0.35); });
  return { lines: out.map(({ s, e, l }, i) => ({ start: s, end: e, heard: heard.slice(l.first, l.last + 1).map((w) => w.w).join(' '),
    sim: +textSim(texts[i], heard.slice(l.first, l.last + 1).map((w) => w.w).join(' ')).toFixed(2),
    flag: [l.matched < 0.6 ? `only ${Math.round(l.matched * 100)}% of words recognised` : '', (e - s) / arabicLetters(texts[i]) < 0.055 ? 'very fast/short' : ''].filter(Boolean).join('; ') })),
  segments: segs.length, method: 'asr' };
}

function cutClip(src, start, end, out) {
  const s = Math.max(0, start - 0.08), e = end + 0.12;
  ffmpeg(['-ss', String(s), '-to', String(e), '-i', src, '-af', // input seeking: filters see only the cut
    // trim leading/trailing silence inside the cut (keeps 60 ms), then short fades and loudness normalisation
    'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.06,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.06,areverse,afade=t=in:d=0.02,areverse,afade=t=in:d=0.04,areverse,loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '44100', '-ac', '1', out]);
}

function importAudio() {
  const files = existsSync(p.incoming) ? readdirSync(p.incoming).filter((f) => AUDIO_EXT.includes(extname(f).toLowerCase())) : [];
  if (!files.length) { console.log(`No audio in ${p.incoming}. Expected names: see ${p.script}`); process.exitCode = 2; return; }
  const finalDir = ensureDir(join(p.audio, 'final'));
  const work = ensureDir(join(tmpdir(), 'fvs_import'));
  const { lines, chapters } = readJSON(join(dir, 'narration', 'script.json'));
  const report = [`# Narration import — ${new Date().toISOString()}`, '', `Incoming: ${files.join(', ')}`, ''];
  const done = new Set();
  const toWav = (f) => {
    const src = join(p.incoming, f), wav = join(work, basename(f) + '.wav');
    if (!hasAudio(src)) throw new Error(`${f} has no audio stream`);
    ffmpeg(['-i', src, '-vn', '-ac', '1', '-ar', '44100', wav]); return wav;
  };
  const backup = (id) => { const out = join(finalDir, `${id}.wav`); if (existsSync(out)) renameSync(out, join(finalDir, `${id}.prev_${Date.now()}.wav`)); return out; };
  const multi = (f, group, label) => {
    const wav = toWav(f), texts = group.map((l) => l.text);
    // preferred: boundaries confirmed against the script with local ASR; fallback: pauses + text length
    let res = asrAvailable() ? splitByScript(wav, texts) : null;
    if (res?.error) report.push(`ASR alignment failed (${res.error}) — falling back to pause-based split`);
    if (!res || res.error) res = splitLines(wav, texts);
    report.push(`## ${label}: ${f} (${probeDuration(wav).toFixed(2)}s)`);
    if (res.error) { report.push(`**NOT IMPORTED** — ${res.error}`, ''); return; }
    if (res.method === 'asr') {
      report.push(`Boundaries confirmed against the script with local speech recognition (faster-whisper) and snapped to pauses.`, '',
        '| # | scene | from | to | match | heard (ASR) | flag |', '|---|---|---|---|---|---|---|');
      res.lines.forEach((r, i) => { cutClip(wav, r.start, r.end, backup(group[i].id)); done.add(group[i].id);
        report.push(`| ${group[i].n} | ${group[i].id} | ${r.start.toFixed(2)} | ${r.end.toFixed(2)} | ${Math.round(r.sim * 100)}% | ${r.heard} | ${r.flag || 'ok'} |`); });
    } else {
      report.push(`Speech segments: ${res.segments}. Split by pauses + text-length consistency (ASR unavailable) — check flagged lines.`, '', '| # | scene | from | to | s/letter | flag |', '|---|---|---|---|---|---|');
      res.lines.forEach((r, i) => { cutClip(wav, r.start, r.end, backup(group[i].id)); done.add(group[i].id);
        report.push(`| ${group[i].n} | ${group[i].id} | ${r.start.toFixed(2)} | ${r.end.toFixed(2)} | ${r.rate} | ${r.flag || 'ok'} |`); });
    }
    report.push('');
  };
  const single = files.filter((f) => /^\d{2,3}_/.test(f));
  for (const f of single) {
    const n = parseInt(f, 10), line = lines.find((l) => l.n === n);
    if (!line) { report.push(`- ${f}: no script line #${n} — skipped`); continue; }
    const wav = toWav(f), segs = speechSegments(wav);
    if (!segs.length) { report.push(`- ${f}: silent — skipped`); continue; }
    const rate = segs.reduce((x, s) => x + s[1] - s[0], 0) / arabicLetters(line.text);
    cutClip(wav, segs[0][0], segs.at(-1)[1], backup(line.id)); done.add(line.id);
    report.push(`- ${f} → ${line.id} (${(segs.at(-1)[1] - segs[0][0]).toFixed(2)}s, ${rate.toFixed(3)} s/letter${rate < 0.065 ? ' — **TOO SHORT for this text: file may be truncated or only a sample — check it**' : ''})`);
  }
  for (const f of files.filter((f) => /^CH_/i.test(f))) {
    const ch = basename(f, extname(f)).slice(3);
    if (!chapters.includes(ch)) { report.push(`- ${f}: unknown chapter "${ch}" (chapters: ${chapters.join(', ')})`); continue; }
    multi(f, lines.filter((l) => l.chapter === ch && !done.has(l.id)), `Chapter ${ch}`);
  }
  const rest = files.filter((f) => !/^\d{2,3}_/.test(f) && !/^CH_/i.test(f));
  if (rest.length === 1) multi(rest[0], lines.filter((l) => !done.has(l.id)), 'Full narration');
  else if (rest.length > 1) report.push(`- Unrecognised names (rename to NN_<scene> or CH_<chapter>): ${rest.join(', ')}`);
  const missing = lines.filter((l) => !done.has(l.id) && !existsSync(join(finalDir, `${l.id}.wav`)));
  report.push('', missing.length ? `**Missing final narration for:** ${missing.map((l) => `${l.n} ${l.id}`).join(', ')} (draft or silence will be used)` : 'All lines have final narration.');
  writeFileSync(join(p.audio, 'import_report.md'), report.join('\n') + '\n');
  console.log(report.join('\n'));
}

function draft() {
  const out = ensureDir(join(p.audio, 'draft'));
  for (const s of narrated) {
    const txt = join(tmpdir(), `fvs_${s.id}.txt`), raw = join(tmpdir(), `fvs_${s.id}.raw.wav`);
    writeFileSync(txt, s.narration, 'utf8');
    execEspeak(['-v', 'ar+m3', '-s', '160', '-p', '45', '-f', txt, '-w', raw]);
    ffmpeg(['-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '44100', '-ac', '1', join(out, `${s.id}.wav`)]);
  }
  console.log(`${narrated.length} DRAFT clips (eSpeak, timing only) → ${out}`);
}
const execEspeak = (a) => execFileSync(join(ESPEAK_DIR, 'espeak-ng.exe'), ['--path=' + ESPEAK_DIR, ...a]);

// ---------- SILMA local TTS (automatic, unapproved until you listen) ----------
// Voice reference: episode.json voice.ref / voice.refText, else the sample shipped with SILMA (publishing NOT cleared).
function silmaConfig() {
  const v = ep.voice ?? {};
  const ref = v.ref ? resolve(dir, v.ref) : join(ROOT, 'tools', 'tts-venv', 'Lib', 'site-packages', 'silma_tts', 'infer', 'ref_audio_samples', 'ar.ref.24k.wav');
  const refText = v.refText ?? 'ويدقق النظر في القرآن الكريم وسائر الكتب السماوية ويتبع مسالك الرسل العظام عليهم الصلاة والسلام.';
  const lexicon = { ...readJSON(join(ROOT, 'templates', 'pronunciation.json')), ...(v.lexicon ?? {}) };
  return { ref, refText, lexicon, seed: v.seed ?? 1234, speed: v.speed ?? 1.0 };
}
function runSilma(jobs) {
  const cfg = { ...silmaConfig(), jobs }, jf = join(tmpdir(), `fvs_silma_${process.pid}.json`);
  writeFileSync(jf, JSON.stringify(cfg));
  const r = spawnSync(PY, [join(ROOT, 'studio', 'tts_silma.py'), jf], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`SILMA failed: ${(r.stderr || '').split('\n').filter(Boolean).slice(-3).join(' | ')}`);
  return r.stdout.split('\n').filter((l) => l.startsWith('SAY ')).map((l) => l.slice(4));
}
function tts() {
  if (!asrAvailable()) { console.log('SILMA not installed (tools/tts-venv). See docs/دليل_التشغيل.md'); process.exitCode = 2; return; }
  const out = ensureDir(join(p.audio, 'tts')), raw = ensureDir(join(tmpdir(), 'fvs_tts_raw'));
  const cfg = silmaConfig(), key = (s) => createHash('sha1').update(JSON.stringify([s.narration, cfg])).digest('hex').slice(0, 16);
  const todo = narrated.filter((s) => { const f = join(out, `${s.id}.wav`); return !(existsSync(f) && existsSync(f + '.key') && readFileSync(f + '.key', 'utf8') === key(s)); });
  const said = todo.length ? runSilma(todo.map((s) => ({ text: s.narration, out: join(raw, `${s.id}.wav`) }))) : [];
  todo.forEach((s, i) => {
    ffmpeg(['-i', join(raw, `${s.id}.wav`), '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '44100', '-ac', '1', join(out, `${s.id}.wav`)]);
    writeFileSync(join(out, `${s.id}.wav.key`), key(s)); writeFileSync(join(out, `${s.id}.said.txt`), said[i] ?? '');
  });
  // ASR round trip on every clip: does the recogniser hear the script?
  const files = narrated.map((s) => join(out, `${s.id}.wav`)), heard = asr(files);
  const rep = [`# SILMA narration check — ${new Date().toISOString()}`, '', `Voice reference: \`${cfg.ref}\``, '',
    'Automatic local TTS. **Not approved** until you listen. Match = letter similarity between the script and what local speech recognition heard (supporting evidence only).', '',
    '| scene | sec | match | heard (ASR) |', '|---|---|---|---|'];
  let low = 0;
  narrated.forEach((s, i) => { const h = heard[files[i]].text, sim = textSim(s.narration, h); if (sim < 0.8) low++;
    rep.push(`| ${s.id} | ${probeDuration(files[i]).toFixed(2)} | ${Math.round(sim * 100)}%${sim < 0.8 ? ' ⚠' : ''} | ${h} |`); });
  writeFileSync(join(p.audio, 'tts_report.md'), rep.join('\n') + '\n');
  console.log(`${todo.length} generated, ${narrated.length - todo.length} cached → ${out}; ${low} line(s) below 80% ASR match (see audio/tts_report.md)`);
}

const run = { script: writeScript, import: importAudio, draft, tts }[cmd];
if (run) run(); else console.log('usage: node studio/narration.mjs <script|import|draft|tts> episodes/<slug>');
