// Scene → HTML (rendered to PNG by headless Edge). Chromium/HarfBuzz handles Arabic joining, ligatures,
// tashkeel and bidi; strings are never reversed by hand. Latin/number runs are isolated with <bdi>.
import { join } from 'node:path';
import { ROOT } from './lib.mjs';

const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
const KIT = join(ROOT, 'templates', 'kit');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Isolate LTR runs (years, Latin names) so they keep their own order inside RTL text.
// A run may contain a whole parenthesised Latin group ("Real Madrid (YouTube)"), but a lone ")" as in the
// Arabic "(2017)" stays outside the run so the browser mirrors both brackets correctly.
const LTR_CH = "[A-Za-z0-9 .,:/+–—\\-'’]", LTR_GRP = `\\(${LTR_CH}*\\)`;
const LTR_RUN = new RegExp(`([A-Za-z0-9](?:${LTR_CH}|${LTR_GRP})*(?:[A-Za-z0-9]|${LTR_GRP})|\\d)`, 'g');
export const bdi = (s) => esc(s).replace(LTR_RUN, '<bdi dir="ltr">$1</bdi>');

// Year ranges: pure numbers read left-to-right ("2006 – 2007"); a range containing an Arabic word
// ("2025 – الآن") must be RTL so an Arabic reader reads 2025 first.
const ydir = (y) => (/[؀-ۿ]/.test(String(y)) ? 'rtl' : 'ltr');

const C = { navy: '#0B1E3F', card: '#12305E', past: '#1B3F73', lime: '#C2F622', gold: '#FFD166', mute: '#7F93B8', white: '#FFFFFF' };
const FONT = `"Segoe UI", Tahoma, "Arial", sans-serif`;

const FIT_SCRIPT = `<script>
for (const el of document.querySelectorAll('.fit')) {           // shrink-to-fit single-line text
  let s = parseFloat(getComputedStyle(el).fontSize);
  while (el.scrollWidth > el.clientWidth + 1 && s > 12) { s -= 2; el.style.fontSize = s + 'px'; }
}
for (const el of document.querySelectorAll('.fitbox')) {        // shrink multi-line block to its height
  let s = parseFloat(getComputedStyle(el).fontSize);
  while (el.scrollHeight > el.clientHeight + 1 && s > 12) { s -= 2; el.style.fontSize = s + 'px'; }
}
</script>`;

function page(w, h, bodyClass, css, inner) {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${w}px;height:${h}px;overflow:hidden;background:${C.navy};font-family:${FONT};color:${C.white}}
.abs{position:absolute}.c{text-align:center}.b{font-weight:700}
.fit,.nowrap{white-space:nowrap;overflow:hidden}
.base .anim{visibility:hidden}
bdi{unicode-bidi:isolate;white-space:nowrap}  /* a number or Latin run never breaks across lines (e.g. "2–1" → "–2 / 1") */
${css}</style></head><body class="${bodyClass}">${inner}${FIT_SCRIPT}</body></html>`;
}

// ---------------- portrait (1080×1920) — matches the Canva v2 master layout ----------------
const P = { W: 1080, H: 1920 };
const portraitBg = (withPitchFade) => `
<div class="abs" style="inset:0;background:url('${fileUrl(join(KIT, 'portrait_bg.png'))}') 0 0/1080px 1920px"></div>
${withPitchFade ? `<div class="abs" style="left:22px;top:960px;width:1036px;height:800px;opacity:.3;
  background:url('${fileUrl(join(KIT, 'portrait_pitch.png'))}') -22px -1005px/1080px 1920px"></div>` : ''}`;
const divider = (top) => `<div class="abs" style="left:190px;top:${top}px;width:700px;height:4px;background:linear-gradient(90deg,transparent,${C.lime} 15%,${C.lime} 85%,transparent)"></div>
<div class="abs" style="left:520px;top:${top - 2}px;width:40px;height:40px;border-right:4px solid ${C.lime};border-bottom:4px solid ${C.lime};transform:rotate(45deg) scale(.6);transform-origin:center"></div>`;

/** Layout of the journey rows for N stops inside the 980–1760 band. */
export function rowLayout(n) {
  const top = 980, band = 780, gap = n > 6 ? 12 : 16;
  const h = Math.min(112, Math.floor((band - gap * (n - 1)) / n));
  return Array.from({ length: n }, (_, i) => ({ x: 70, y: top + i * (h + gap), w: 940, h }));
}
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
export const arNum = (n) => String(n).replace(/\d/g, (d) => AR_DIGITS[d]);

function journeyRows(stops, current, mode) {
  const rows = rowLayout(stops.length);
  const fs = Math.round(rows[0].h * 0.5);
  return rows.map((r, i) => {
    const s = stops[i];
    const state = mode === 'all' ? 'past' : i < current ? 'past' : i === current ? 'cur' : 'future';
    const bg = state === 'cur' ? C.lime : state === 'past' ? C.past : 'rgba(18,48,94,.6)';
    const fg = state === 'cur' ? C.navy : C.white;
    const yc = state === 'cur' ? C.navy : C.lime;
    const label = state === 'future' ? `${arNum(i + 1)}. ؟` : `${arNum(i + 1)}. ${s.row ?? s.club}`;
    return `<div class="abs" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;border-radius:${r.h / 2}px;background:${bg}"></div>
<div class="abs b fit" style="right:${1080 - r.x - r.w + 40}px;top:${r.y}px;width:560px;height:${r.h}px;line-height:${r.h}px;font-size:${fs}px;color:${state === 'future' ? C.mute : fg};text-align:right">${bdi(label)}</div>
${state === 'future' ? '' : `<div class="abs b fit" style="left:${r.x + 40}px;top:${r.y}px;width:300px;height:${r.h}px;line-height:${r.h}px;font-size:${Math.round(fs * 0.86)}px;color:${yc};text-align:left" dir="${ydir(s.years)}">${esc(s.years)}</div>`}`;
  }).join('\n');
}

// Generic rows (attributes, hints): items {right, left?}; state per row like journeyRows.
function listRows(items, current, mode, futureMask = true) {
  const rows = rowLayout(items.length);
  const fs = Math.round(Math.min(rows[0].h * 0.5, 50));
  return rows.map((r, i) => {
    const it = items[i];
    const state = mode === 'all' ? 'past' : i < current ? 'past' : i === current ? 'cur' : 'future';
    const hidden = state === 'future' && futureMask;
    const bg = state === 'cur' ? C.lime : state === 'past' ? C.past : 'rgba(18,48,94,.6)';
    const fg = state === 'cur' ? C.navy : C.white;
    return `<div class="abs" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;border-radius:${r.h / 2}px;background:${bg}"></div>
<div class="abs b fit" style="right:${1080 - r.x - r.w + 40}px;top:${r.y}px;width:${it.left === undefined ? 860 : 420}px;height:${r.h}px;line-height:${r.h}px;font-size:${fs}px;color:${hidden ? C.mute : fg};text-align:right">${bdi(`${arNum(i + 1)}. ${hidden && it.left === undefined ? '؟' : it.right}`)}</div>
${it.left === undefined ? '' : `<div class="abs b fit" style="left:${r.x + 40}px;top:${r.y}px;width:420px;height:${r.h}px;line-height:${r.h}px;font-size:${fs}px;color:${hidden ? C.mute : state === 'cur' ? C.navy : C.lime};text-align:left">${hidden ? '؟' : bdi(it.left)}</div>`}`;
  }).join('\n');
}

// ---- portrait pitch (tactical recreation). Units: x 0–68 across, y 0–105 along; y=0 = goal being attacked (top).
const PITCH = { left: 90, top: 360, s: 900 / 68 };
export const pitchPx = (x, y) => [Math.round(PITCH.left + x * PITCH.s), Math.round(PITCH.top + y * PITCH.s)];
function pitchSVG(sc) {
  const s = PITCH.s, W = 68 * s, H = 105 * s, line = 'rgba(255,255,255,.75)';
  const box = (y0, dir) => {
    const r = (x, y, w, h) => `<rect x="${x * s}" y="${y * s}" width="${w * s}" height="${h * s}" fill="none" stroke="${line}" stroke-width="4"/>`;
    return dir > 0 ? r(13.84, 0, 40.32, 16.5) + r(24.84, 0, 18.32, 5.5) + `<rect x="${30.34 * s}" y="-14" width="${7.32 * s}" height="14" fill="#fff"/>`
      : r(13.84, 105 - 16.5, 40.32, 16.5) + r(24.84, 105 - 5.5, 18.32, 5.5);
  };
  const pts = (sc.path ?? []).map(([x, y]) => `${x * s},${y * s}`).join(' ');
  const players = (sc.players ?? []).map((p) => {
    const [cx, cy] = [p.x * s, p.y * s], att = p.team === 'a';
    return `<circle cx="${cx}" cy="${cy}" r="22" fill="${att ? C.gold : '#F2F2F2'}" stroke="${att ? C.navy : '#C8102E'}" stroke-width="6"/>
${p.label ? `<text x="${cx}" y="${cy + 58}" text-anchor="middle" font-size="30" font-weight="700" fill="#fff" stroke="#0B1E3F" stroke-width="6" paint-order="stroke">${esc(p.label)}</text>` : ''}`;
  }).join('');
  return `<svg class="abs" style="left:${PITCH.left}px;top:${PITCH.top}px;overflow:visible" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><pattern id="st" width="${W}" height="${H / 10}" patternUnits="userSpaceOnUse"><rect width="${W}" height="${H / 20}" fill="#1E7A34"/><rect y="${H / 20}" width="${W}" height="${H / 20}" fill="#1A6E2F"/></pattern>
<marker id="ar" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0L10,5L0,10z" fill="${C.lime}"/></marker></defs>
<rect width="${W}" height="${H}" fill="url(#st)" rx="10"/><rect width="${W}" height="${H}" fill="none" stroke="${line}" stroke-width="5" rx="10"/>
<line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="${line}" stroke-width="4"/><circle cx="${W / 2}" cy="${H / 2}" r="${9.15 * s}" fill="none" stroke="${line}" stroke-width="4"/>
${box(0, 1)}${box(105, -1)}
${pts ? `<polyline points="${pts}" fill="none" stroke="${C.lime}" stroke-width="7" stroke-dasharray="18 14" stroke-linecap="round" opacity=".9" marker-end="url(#ar)"/>` : ''}
${players}</svg>`;
}
const matchCard = (m, top, compact) => {
  const h = compact ? 250 : 420;
  return `<div class="abs" style="left:70px;top:${top}px;width:940px;height:${h}px;border-radius:44px;background:${C.card};border:6px solid ${C.lime}"></div>
<div class="abs b c fit" style="left:100px;top:${top + (compact ? 22 : 34)}px;width:880px;font-size:${compact ? 40 : 50}px;color:${C.gold}">${bdi(m.competition)}</div>
<div class="abs b fit" style="right:110px;top:${top + (compact ? 85 : 120)}px;width:330px;height:${compact ? 90 : 130}px;line-height:${compact ? 90 : 130}px;font-size:${compact ? 56 : 72}px;text-align:center">${bdi(m.home)}</div>
<div class="abs b c" style="left:440px;top:${top + (compact ? 85 : 120)}px;width:200px;height:${compact ? 90 : 130}px;line-height:${compact ? 90 : 130}px;font-size:${compact ? 64 : 90}px;color:${C.lime}" dir="ltr">${(() => { const [h, a] = String(m.score).split(/\s*[–-]\s*/); return `${esc(a)} – ${esc(h)}`; })()}</div>
<div class="abs b fit" style="left:110px;top:${top + (compact ? 85 : 120)}px;width:330px;height:${compact ? 90 : 130}px;line-height:${compact ? 90 : 130}px;font-size:${compact ? 56 : 72}px;text-align:center">${bdi(m.away)}</div>
${compact ? '' : `<div class="abs b c fit" style="left:100px;top:${top + 280}px;width:880px;font-size:44px;color:#DCE6F5">${bdi(m.date)} · ${bdi(m.venue)}</div>`}`;
};

const portraitTemplates = {
  ptitle(sc) {
    return portraitBg(false) + `
<div class="abs b c anim" style="left:0;right:0;top:${sc.top ?? 560}px;height:100px"><span style="display:inline-block;height:100px;line-height:100px;padding:0 56px;border-radius:50px;background:${C.lime};color:${C.navy};font-size:56px">${bdi(sc.kicker ?? '')}</span></div>
<div class="abs b c anim fitbox" style="left:70px;width:940px;top:${(sc.top ?? 560) + 150}px;height:430px;font-size:${sc.titleSize ?? 120}px;line-height:1.3">${bdi(sc.title)}</div>
<div class="abs b c anim fitbox" style="left:90px;width:900px;top:${(sc.top ?? 560) + 600}px;height:260px;font-size:58px;line-height:1.4;color:${C.gold}">${bdi(sc.subtitle ?? '')}</div>
${sc.footnote ? `<div class="abs c anim" style="left:60px;width:960px;top:1760px;font-size:36px;color:#B8C4DA">${bdi(sc.footnote)}</div>` : ''}`;
  },
  attr(sc) {
    const a = sc.attrs[sc.index], n = sc.attrs.length;
    return portraitBg(true) + `
<div class="abs b c fit" style="left:40px;top:95px;width:1000px;font-size:56px">${bdi(sc.header)}</div>${divider(200)}
<div class="abs" style="left:260px;top:268px;width:560px;height:110px;border-radius:55px;background:${C.lime}"></div>
<div class="abs b c fit" style="left:260px;top:268px;width:560px;height:110px;line-height:110px;font-size:60px;color:${C.navy}">المعلومة ${arNum(sc.index + 1)} من ${arNum(n)}</div>
<div class="abs" style="left:70px;top:420px;width:940px;height:420px;border-radius:48px;background:${C.card};border:6px solid ${C.lime}"></div>
<div class="abs b c fit" style="left:100px;top:460px;width:880px;font-size:64px;color:${C.gold}">${bdi(a.label)}</div>
<div class="abs b c fit" style="left:100px;top:585px;width:880px;height:170px;line-height:170px;font-size:${a.size ?? 130}px">${bdi(a.value)}</div>
<div class="abs b c fit" style="left:100px;top:760px;width:880px;font-size:40px;color:${C.lime}">${bdi(sc.asOf)}</div>
<div class="abs b c" style="left:40px;top:880px;width:1000px;font-size:48px;color:${C.lime}">المعلومات حتى الآن</div>
${listRows(sc.attrs.map((x) => ({ right: x.label, left: x.value })), sc.index, 'progress')}`;
  },
  match(sc) {
    return portraitBg(false) + `
<div class="abs b c fit anim" style="left:40px;top:95px;width:1000px;font-size:80px">${bdi(sc.header)}</div>${divider(230)}
<div class="anim">${matchCard(sc.match, 330, false)}</div>
<div class="abs anim" style="left:290px;top:800px;width:500px;height:150px;border-radius:75px;background:${C.lime}"></div>
<div class="abs b c anim" style="left:290px;top:800px;width:500px;height:150px;line-height:150px;font-size:76px;color:${C.navy}">الدقيقة ${bdi(sc.match.minute)}</div>
<div class="abs b c anim fitbox" style="left:90px;top:1020px;width:900px;height:560px;font-size:64px;line-height:1.45">${bdi(sc.question ?? 'من سجّل هذا الهدف؟')}</div>`;
  },
  tactic(sc) {
    return portraitBg(false) + `
<div class="abs b c fit" style="left:40px;top:70px;width:1000px;font-size:64px">${bdi(sc.title)}</div>
<div class="abs b c fit" style="left:40px;top:170px;width:1000px;font-size:42px;color:${C.gold}">${bdi(sc.subtitle ?? '')}</div>
<div class="abs b c fit" style="left:60px;top:250px;width:960px;height:64px;line-height:64px;border-radius:32px;background:rgba(194,246,34,.15);font-size:34px;color:${C.lime}">${bdi(sc.label)}</div>
${pitchSVG(sc)}
<div class="abs b c fit" style="left:40px;top:1790px;width:1000px;font-size:42px">${bdi(sc.caption ?? '')}</div>`;
  },
  hint(sc) {
    return portraitBg(true) + matchCard(sc.match, 60, true) + `
<div class="abs" style="left:260px;top:345px;width:560px;height:100px;border-radius:50px;background:${C.lime}"></div>
<div class="abs b c fit" style="left:260px;top:345px;width:560px;height:100px;line-height:100px;font-size:56px;color:${C.navy}">تلميح ${arNum(sc.index + 1)} من ${arNum(sc.hints.length)}</div>
<div class="abs" style="left:70px;top:480px;width:940px;height:360px;border-radius:48px;background:${C.card};border:6px solid ${C.lime}"></div>
<div class="abs b c fitbox" style="left:110px;top:510px;width:860px;height:300px;font-size:68px;line-height:1.4;display:flex;align-items:center;justify-content:center">${bdi(sc.hints[sc.index].text)}</div>
<div class="abs b c" style="left:40px;top:880px;width:1000px;font-size:48px;color:${C.lime}">التلميحات</div>
${listRows(sc.hints.map((h) => ({ right: h.short ?? h.text })), sc.index, 'progress')}`;
  },
  revealName(sc) {
    const a = sc.answer;
    return portraitBg(false) + `
<div class="abs b c" style="left:40px;top:220px;width:1000px;font-size:110px">الإجابة</div>${divider(400)}
<div class="abs" style="left:60px;top:560px;width:960px;height:420px;border-radius:56px;background:${C.lime}"></div>
<div class="abs b c fit" style="left:80px;top:610px;width:920px;height:200px;line-height:200px;font-size:140px;color:${C.navy}">${bdi(a.name)}</div>
<div class="abs b c fitbox" style="left:90px;top:820px;width:900px;height:140px;font-size:58px;line-height:1.2;color:${C.card}">${bdi(a.sub ?? '')}</div>
<div class="abs b c fitbox" style="left:70px;top:1060px;width:940px;height:420px;font-size:56px;line-height:1.5;color:#DCE6F5">${bdi(a.detail ?? '')}</div>
<div class="abs b c" style="left:40px;top:1560px;width:1000px;font-size:68px;color:${C.gold}">هل كانت إجابتك صحيحة؟</div>`;
  },
  clue(sc) {
    const s = sc.stop, n = sc.stops.length;
    return portraitBg(true) + `
<div class="abs b c fit" style="left:40px;top:95px;width:1000px;font-size:56px">${bdi(sc.header)}</div>${divider(200)}
<div class="abs" style="left:260px;top:268px;width:560px;height:110px;border-radius:55px;background:${C.lime}"></div>
<div class="abs b c fit" style="left:260px;top:268px;width:560px;height:110px;line-height:110px;font-size:60px;color:${C.navy}">المحطة ${arNum(sc.index + 1)} من ${arNum(n)}</div>
<div class="abs" style="left:70px;top:420px;width:940px;height:420px;border-radius:48px;background:${C.card};border:6px solid ${C.lime}"></div>
<div class="abs b c fit" style="left:100px;top:455px;width:880px;height:150px;line-height:150px;font-size:${s.cardSize ?? 120}px">${bdi(s.card ?? s.club)}</div>
<div class="abs b c" style="left:100px;top:625px;width:880px;font-size:84px;color:${C.lime}" dir="${ydir(s.years)}">${esc(s.years)}</div>
<div class="abs b c fit" style="left:100px;top:748px;width:880px;font-size:54px;color:${C.gold}">${bdi(s.note ?? '')}</div>
<div class="abs b c" style="left:40px;top:880px;width:1000px;font-size:48px;color:${C.lime}">المسيرة حتى الآن</div>
${journeyRows(sc.stops, sc.index, 'progress')}`;
  },
  count(sc) {
    return portraitBg(true) + `
<div class="abs b c" style="left:40px;top:80px;width:1000px;font-size:96px">هل عرفته؟</div>
<div class="abs" style="left:320px;top:250px;width:440px;height:440px;border-radius:50%;background:${C.card};border:16px solid ${C.lime}"></div>
<div class="abs b c" style="left:320px;top:250px;width:440px;height:440px;line-height:420px;font-size:290px;color:${C.lime}">${arNum(sc.digit)}</div>
<div class="abs b c" style="left:40px;top:740px;width:1000px;font-size:58px;color:${C.gold}">الإجابة بعد لحظات...</div>
<div class="abs b c" style="left:40px;top:880px;width:1000px;font-size:48px;color:${C.lime}">${esc(sc.listTitle ?? 'المسيرة كاملة')}</div>
${sc.stops ? journeyRows(sc.stops, sc.stops.length, 'all') : listRows(sc.rows, sc.rows.length, 'all')}`;
  },
  reveal(sc) {
    const a = sc.answer;
    return portraitBg(false) + `
<div class="abs b c" style="left:40px;top:70px;width:1000px;font-size:96px">الإجابة</div>
<div class="abs" style="left:175px;top:205px;width:730px;height:730px;border-radius:48px;background:${C.lime}"></div>
<img class="abs" src="${fileUrl(a.photoPath)}" style="left:190px;top:220px;width:700px;height:700px;object-fit:cover;object-position:${a.photoPosition ?? '50% 30%'};border-radius:36px">
<div class="abs" style="left:60px;top:975px;width:960px;height:330px;border-radius:56px;background:${C.lime}"></div>
<div class="abs b c fit" style="left:80px;top:1010px;width:920px;height:170px;line-height:170px;font-size:130px;color:${C.navy}">${bdi(a.name)}</div>
<div class="abs b c fit" style="left:80px;top:1195px;width:920px;font-size:72px;color:${C.card}">${bdi(a.sub ?? '')}</div>
<div class="abs b c" style="left:40px;top:1380px;width:1000px;font-size:68px;color:${C.gold}">هل كانت إجابتك صحيحة؟</div>
<div class="abs" style="left:472px;top:1520px;width:136px;height:137px;background:url('${fileUrl(join(KIT, 'portrait_pitch.png'))}') -472px -1577px/1080px 1920px;border-radius:50%"></div>
<div class="abs c" style="left:60px;top:1765px;width:960px;font-size:30px;color:#B8C4DA" dir="ltr">${esc(a.credit ?? '')}</div>`;
  },
};

// ---------------- landscape (1920×1080) — long-form, same palette ----------------
const L = { W: 1920, H: 1080 };
const landscapeBg = (pitch) => `
<div class="abs" style="inset:0;background:radial-gradient(ellipse 900px 520px at 65% 22%,rgba(34,150,60,.55),rgba(11,30,63,0) 70%),linear-gradient(180deg,#0B1E3F,#071427)"></div>

<div class="abs" style="inset:26px;border:4px solid ${C.lime};border-radius:34px"></div>
<div class="abs" style="left:70px;bottom:44px;width:230px;height:40px;background:repeating-linear-gradient(115deg,${C.lime} 0 22px,transparent 22px 40px)"></div>`;
const chapterChip = (sc) => sc.chapterLabel ? `<div class="abs b" style="right:110px;top:90px;height:64px;line-height:64px;padding:0 34px;border-radius:32px;background:${C.lime};color:${C.navy};font-size:36px">${bdi(sc.chapterLabel)}</div>` : '';

// Progressive reveal: build.mjs renders one frame per item with sc.upTo = k; later items are hidden but keep their place.
const step = (sc, i, html) => (sc.upTo !== undefined && i > sc.upTo ? `<div style="visibility:hidden">${html}</div>` : html);

const landscapeTemplates = {
  title(sc) {
    return landscapeBg(0.35) + `
<div class="abs b c anim" style="left:0;right:0;top:330px;height:84px"><span style="display:inline-block;height:84px;line-height:84px;padding:0 48px;border-radius:42px;background:${C.lime};color:${C.navy};font-size:46px">${bdi(sc.kicker ?? '')}</span></div>
<div class="abs b c fit anim" style="left:140px;width:1640px;top:450px;font-size:132px;line-height:1.25">${bdi(sc.title)}</div>
<div class="abs b c anim" style="left:200px;width:1520px;top:640px;font-size:54px;color:${C.gold}">${bdi(sc.subtitle ?? '')}</div>`;
  },
  text(sc) {
    const img = sc.imagePath;
    const tw = img ? 900 : 1560;
    return landscapeBg(0.18) + chapterChip(sc) + `
${img ? `<div class="abs" style="left:110px;top:210px;width:700px;height:700px;border-radius:40px;background:${C.lime}"></div>
<img class="abs" src="${fileUrl(img)}" style="left:124px;top:224px;width:672px;height:672px;object-fit:cover;object-position:${sc.imagePosition ?? '50% 30%'};border-radius:30px">
${sc.credit ? `<div class="abs c" style="left:110px;top:925px;width:700px;font-size:22px;color:#B8C4DA" dir="ltr">${esc(sc.credit)}</div>` : ''}` : ''}
${sc.year ? `<div class="abs b anim" style="right:110px;top:220px;font-size:64px;color:${C.lime}" dir="${ydir(sc.year)}">${esc(sc.year)}</div>` : ''}
<div class="abs b anim" style="right:110px;top:${sc.year ? 310 : 230}px;width:${tw}px;font-size:84px;line-height:1.3;text-align:right">${bdi(sc.heading)}</div>
<div class="abs anim fitbox" style="right:110px;top:${sc.year ? 450 : 380}px;width:${tw}px;height:${sc.year ? 470 : 540}px;font-size:52px;line-height:1.6;text-align:right;color:#DCE6F5">${(sc.body || []).map((p) => `<p style="margin-bottom:18px">${bdi(p)}</p>`).join('')}</div>`;
  },
  fact(sc) {
    return landscapeBg(0.25) + chapterChip(sc) + `
<div class="abs" style="left:360px;top:230px;width:1200px;height:560px;border-radius:56px;background:${C.card};border:6px solid ${C.lime}"></div>
<div class="abs b c fit anim" style="left:380px;width:1160px;top:270px;height:270px;font-size:230px;line-height:1.15;color:${C.lime}">${bdi(sc.value)}</div>
<div class="abs b c fit anim" style="left:400px;width:1120px;top:560px;font-size:76px">${bdi(sc.label)}</div>
<div class="abs b c anim" style="left:400px;width:1120px;top:680px;font-size:46px;color:${C.gold}">${bdi(sc.note ?? '')}</div>`;
  },
  timeline(sc) {
    const items = sc.items, n = items.length;
    const top = 300, band = 640, gap = 18, h = Math.min(110, Math.floor((band - gap * (n - 1)) / n));
    return landscapeBg(0.15) + chapterChip(sc) + `
<div class="abs b" style="right:110px;top:180px;font-size:68px;text-align:right">${bdi(sc.heading)}</div>
${items.map((it, i) => {
      const y = top + i * (h + gap), cur = i === sc.highlight;
      return step(sc, i, `<div class="abs anim" style="left:240px;top:${y}px;width:1440px;height:${h}px;border-radius:${h / 2}px;background:${cur ? C.lime : C.past}"></div>
<div class="abs b fit anim" style="right:290px;top:${y}px;width:1000px;height:${h}px;line-height:${h}px;font-size:${Math.round(h * 0.46)}px;text-align:right;color:${cur ? C.navy : C.white}">${bdi(it.text)}</div>
<div class="abs b anim" style="left:290px;top:${y}px;width:320px;height:${h}px;line-height:${h}px;font-size:${Math.round(h * 0.44)}px;text-align:left;color:${cur ? C.navy : C.lime}" dir="${ydir(it.year)}">${esc(it.year)}</div>`);
    }).join('\n')}`;
  },
  // Trophy cabinet: items [{count, label, note?}] (max 6).
  trophies(sc) {
    const it = sc.items, n = it.length, cols = n <= 3 ? n : 3, rows = Math.ceil(n / cols);
    const cw = 480, ch = rows > 1 ? 290 : 400, gx = 40, gy = 34, x0 = (1920 - (cols * cw + (cols - 1) * gx)) / 2, y0 = rows > 1 ? 300 : 360;
    return landscapeBg(0.2) + chapterChip(sc) + `
<div class="abs b" style="right:110px;top:180px;width:1100px;font-size:68px;text-align:right">${bdi(sc.heading)}</div>
${it.map((t, i) => {
      const c = i % cols, r = Math.floor(i / cols), x = 1920 - x0 - (c + 1) * cw - c * gx, y = y0 + r * (ch + gy);
      return step(sc, i, `<div class="abs anim" style="left:${x}px;top:${y}px;width:${cw}px;height:${ch}px;border-radius:36px;background:${C.card};border:5px solid ${C.lime}"></div>
<div class="abs b c anim" style="left:${x}px;top:${y + ch * 0.06}px;width:${cw}px;font-size:${ch * 0.42}px;line-height:1.2;color:${C.lime}">${bdi(t.count)}</div>
<div class="abs b c fit anim" style="left:${x + 20}px;top:${y + ch * 0.58}px;width:${cw - 40}px;font-size:${Math.round(ch * 0.15)}px">${bdi(t.label)}</div>
${t.note ? `<div class="abs b c fit anim" style="left:${x + 20}px;top:${y + ch * 0.79}px;width:${cw - 40}px;font-size:${Math.round(ch * 0.09)}px;color:${C.gold}">${bdi(t.note)}</div>` : ''}`);
    }).join('\n')}
${sc.source ? `<div class="abs c" style="left:200px;width:1520px;top:950px;font-size:26px;color:#B8C4DA">${bdi(sc.source)}</div>` : ''}`;
  },
  // Comparison on explicit criteria: a/b {name}, rows [{label, a, b, unit?, better:'high'|'low'}].
  compare(sc) {
    const rows = sc.rows, n = rows.length, top = 330, band = 560, rh = Math.min(140, Math.floor(band / n));
    const bar = (v, max, color, y, h) => `<div class="abs anim" style="left:240px;top:${y}px;width:${Math.max(8, Math.round(980 * v / max))}px;height:${h}px;border-radius:${h / 2}px;background:${color}"></div>`;
    return landscapeBg(0.15) + chapterChip(sc) + `
<div class="abs b" style="right:110px;top:170px;width:1300px;font-size:64px;text-align:right">${bdi(sc.heading)}</div>
<div class="abs b" style="left:110px;top:186px;font-size:38px;color:${C.lime}">■ ${bdi(sc.a.name)}</div>
<div class="abs b" style="left:110px;top:240px;font-size:38px;color:${C.gold}">■ ${bdi(sc.b.name)}</div>
${rows.map((r, i) => {
      const y = top + i * rh, max = Math.max(r.a, r.b) * 1.08, h = Math.round(rh * 0.3);
      return step(sc, i, `<div class="abs b fit anim" style="right:110px;top:${y + rh * 0.12}px;width:440px;font-size:${Math.round(rh * 0.27)}px;text-align:right">${bdi(r.label)}</div>
${bar(r.a, max, C.lime, y + rh * 0.08, h)}${bar(r.b, max, C.gold, y + rh * 0.08 + h + 8, h)}
<div class="abs b anim" style="left:${250 + Math.round(980 * r.a / max)}px;top:${y + rh * 0.08}px;height:${h}px;line-height:${h}px;font-size:${Math.round(h * 0.8)}px;color:${C.lime}" dir="ltr">${esc(r.a)}${esc(r.unit ?? '')}</div>
<div class="abs b anim" style="left:${250 + Math.round(980 * r.b / max)}px;top:${y + rh * 0.08 + h + 8}px;height:${h}px;line-height:${h}px;font-size:${Math.round(h * 0.8)}px;color:${C.gold}" dir="ltr">${esc(r.b)}${esc(r.unit ?? '')}</div>`);
    }).join('\n')}
${sc.source ? `<div class="abs c" style="left:200px;width:1520px;top:955px;font-size:26px;color:#B8C4DA">${bdi(sc.source)}</div>` : ''}`;
  },
  // Formation / tactical board, horizontal pitch (x 0–105 left→right attacking, y 0–68). players [{x,y,label}], arrows [[x1,y1,x2,y2]].
  formation(sc) {
    const s = 10, W = 1050, H = 680, L0 = 110, T0 = 220, line = 'rgba(255,255,255,.7)';
    const P = (sc.players ?? []).map((p) => `<circle cx="${p.x * s}" cy="${p.y * s}" r="24" fill="${p.team === 'b' ? '#F2F2F2' : C.lime}" stroke="${C.navy}" stroke-width="5"/>
${p.label ? `<text x="${p.x * s}" y="${p.y * s + 56}" text-anchor="middle" font-size="26" font-weight="700" fill="#fff" stroke="#0B1E3F" stroke-width="6" paint-order="stroke">${esc(p.label)}</text>` : ''}`).join('');
    const A = (sc.arrows ?? []).map(([a, b, c, d]) => `<line x1="${a * s}" y1="${b * s}" x2="${c * s}" y2="${d * s}" stroke="${C.gold}" stroke-width="6" stroke-dasharray="16 10" marker-end="url(#fa)"/>`).join('');
    return landscapeBg(0.1) + chapterChip(sc) + `
<svg class="abs" style="left:${L0}px;top:${T0}px" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><marker id="fa" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0L10,5L0,10z" fill="${C.gold}"/></marker></defs>
<rect width="${W}" height="${H}" rx="12" fill="#1C7432"/><rect width="${W}" height="${H}" rx="12" fill="none" stroke="${line}" stroke-width="4"/>
<line x1="${W / 2}" y1="0" x2="${W / 2}" y2="${H}" stroke="${line}" stroke-width="3"/><circle cx="${W / 2}" cy="${H / 2}" r="91" fill="none" stroke="${line}" stroke-width="3"/>
<rect x="0" y="${138}" width="165" height="403" fill="none" stroke="${line}" stroke-width="3"/><rect x="${W - 165}" y="${138}" width="165" height="403" fill="none" stroke="${line}" stroke-width="3"/>
${A}${P}</svg>
<div class="abs b anim" style="right:110px;top:220px;width:560px;font-size:60px;line-height:1.25;text-align:right">${bdi(sc.heading)}</div>
<div class="abs anim fitbox" style="right:110px;top:${sc.heading.length > 18 ? 400 : 330}px;width:560px;height:${sc.heading.length > 18 ? 530 : 600}px;font-size:40px;line-height:1.55;text-align:right;color:#DCE6F5">${(sc.body || []).map((p) => `<p style="margin-bottom:14px">${bdi(p)}</p>`).join('')}</div>
${sc.label ? `<div class="abs c" style="left:${L0}px;width:${W}px;top:${T0 + H + 20}px;font-size:28px;color:${C.lime}">${bdi(sc.label)}</div>` : ''}`;
  },
  // Quote card: text + attribution.
  quote(sc) {
    return landscapeBg(0.2) + chapterChip(sc) + `
<div class="abs b c anim" style="left:0;right:0;top:150px;font-size:200px;line-height:1;color:${C.lime}">”</div>
<div class="abs b c anim fitbox" style="left:220px;width:1480px;top:330px;height:420px;font-size:72px;line-height:1.5;display:flex;align-items:center;justify-content:center">${bdi(sc.text)}</div>
<div class="abs b c anim" style="left:220px;width:1480px;top:790px;font-size:44px;color:${C.gold}">${bdi(sc.by ?? '')}</div>`;
  },
  end(sc) {
    return landscapeBg(0.4) + `
<div class="abs b c anim" style="left:140px;width:1640px;top:250px;font-size:104px;line-height:1.3">${bdi(sc.title)}</div>
<div class="abs anim" style="left:560px;top:640px;width:800px;height:130px;border-radius:65px;background:${C.lime}"></div>
<div class="abs b c anim" style="left:560px;top:640px;width:800px;height:130px;line-height:130px;font-size:60px;color:${C.navy}">${bdi(sc.cta ?? 'اكتب رأيك في التعليقات')}</div>`;
  },
};

export function sceneHTML(sc, ep, { base = false } = {}) {
  const portrait = ep.orientation === 'portrait';
  const tpl = (portrait ? portraitTemplates : landscapeTemplates)[sc.layout];
  if (!tpl) throw new Error(`no ${ep.orientation} layout "${sc.layout}" (scene ${sc.id})`);
  const { W, H } = portrait ? P : L;
  return page(W, H, base ? 'base' : '', '', tpl(sc));
}
