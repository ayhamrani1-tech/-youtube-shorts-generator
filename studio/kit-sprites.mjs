// One-off: render the small transparent sprites used by tactical recreations → templates/kit/{ball,scorer}.png
// Usage: node studio/kit-sprites.mjs
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, htmlToPng, ensureDir, ffmpeg } from './lib.mjs';

const kit = join(ROOT, 'templates', 'kit'), tmp = ensureDir(join(ROOT, 'build_cache', 'sprites'));
const page = (s, body) => `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>*{margin:0}html,body{width:600px;height:600px;background:transparent;overflow:hidden}</style></head><body>${body}</body></html>`;
const sprites = {
  ball: page(60, `<svg style="position:absolute;left:0;top:0" width="60" height="60"><circle cx="30" cy="30" r="25" fill="#fff" stroke="#0B1E3F" stroke-width="6"/><circle cx="30" cy="30" r="8" fill="#0B1E3F"/></svg>`),
  scorer: page(128, `<svg style="position:absolute;left:0;top:0" width="128" height="128"><circle cx="64" cy="64" r="54" fill="#C2F622" stroke="#0B1E3F" stroke-width="10"/>
<text x="64" y="88" text-anchor="middle" font-family="Segoe UI, Tahoma" font-size="72" font-weight="700" fill="#0B1E3F">؟</text></svg>`),
};
for (const [name, html] of Object.entries(sprites)) {
  const f = join(tmp, `${name}.html`), size = name === 'ball' ? 60 : 128;
  writeFileSync(f, html);
  const big = join(tmp, `${name}.big.png`);
  htmlToPng(f, big, 600, 600);
  ffmpeg(['-i', big, '-vf', `crop=${size}:${size}:0:0,format=rgba`, join(kit, `${name}.png`)]);
  console.log(`${name}.png`);
}
