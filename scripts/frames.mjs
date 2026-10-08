// Download Canva PNG export URLs (one per line, page order) into episodes/<slug>/frames/01.png, 02.png, ...
// Usage: node scripts/frames.mjs episodes/<slug> urls.txt
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const epDir = resolve(process.argv[2]);
const urls = readFileSync(process.argv[3], 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
mkdirSync(join(epDir, 'frames'), { recursive: true });
for (const [i, url] of urls.entries()) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`page ${i + 1}: HTTP ${res.status}`);
  const file = join(epDir, 'frames', String(i + 1).padStart(2, '0') + '.png');
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(file);
}
