// Step 1: expand the episode template into scenes and render each HTML scene to PNG.
// Usage: node studio/build.mjs episodes/<slug>
import { writeFileSync, readFileSync, existsSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { readJSON, writeJSON, ensureDir, htmlToPng, epPaths } from './lib.mjs';
import { expand } from './templates.mjs';
import { sceneHTML } from './html.mjs';

const STEPPED = ['timeline', 'trophies', 'compare'];
const dir = resolve(process.argv[2] ?? '.');
const p = epPaths(dir);
const ep = readJSON(p.config);
const scenes = expand(ep, dir);
ensureDir(p.html); ensureDir(p.frames);

let rendered = 0, cached = 0;
for (const sc of scenes) {
  if (sc.source === 'canva') {
    if (!existsSync(sc.file)) throw new Error(`missing Canva export ${sc.file} — export the episode design pages first`);
    sc.frame = join(p.frames, `${sc.id}.png`);
    copyFileSync(sc.file, sc.frame);
    continue;
  }
  // multi-item layouts reveal one item at a time with the narration (no long static holds); steps only ADD an item
  const nItems = STEPPED.includes(sc.layout) && sc.steps !== false ? (sc.items ?? sc.rows ?? []).length : 0;
  const stepVariants = nItems >= 2 ? Array.from({ length: nItems - 1 }, (_, k) => [`s${k}`, false, k]) : [];
  const variants = [['full', false], ...(sc.entrance?.type === 'reveal' ? [['base', true]] : []), ...stepVariants];
  if (stepVariants.length) sc.stepFrames = [];
  for (const [name, base, upTo] of variants) {
    const html = sceneHTML(upTo === undefined ? sc : { ...sc, upTo }, ep, { base });
    const htmlFile = join(p.html, `${sc.id}.${name}.html`);
    const png = join(p.frames, `${sc.id}${name === 'full' ? '' : '.' + name}.png`);
    const hash = createHash('sha1').update(html).digest('hex');
    const stamp = png + '.sha1';
    if (existsSync(png) && existsSync(stamp) && readFileSync(stamp, 'utf8') === hash) { cached++; }
    else { writeFileSync(htmlFile, html); htmlToPng(htmlFile, png, ep.width, ep.height); writeFileSync(stamp, hash); rendered++; }
    if (name === 'full') sc.frame = png; else if (name === 'base') sc.baseFrame = png; else sc.stepFrames.push(png);
  }
  if (sc.stepFrames) sc.stepFrames.push(sc.frame); // last step = the full page
}
writeJSON(p.scenes, { type: ep.type, slug: ep.slug, scenes });
console.log(`${scenes.length} scenes (${ep.type}, ${ep.width}×${ep.height}); frames rendered ${rendered}, cached ${cached} → ${p.frames}`);
