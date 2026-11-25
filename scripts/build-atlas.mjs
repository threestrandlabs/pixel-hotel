// Builds the sprite atlas from the hand-authored pixel art in art/.
//   node scripts/build-atlas.mjs
// Output: public/assets/atlas.png + atlas.json (PixiJS spritesheet format,
// with a per-frame `anchor` taken from each sprite's pivot) and
// art/out/contact-sheet.png for QA.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import { PixelCanvas } from '../art/lib/canvas.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const spriteDir = path.join(root, 'art', 'sprites');
const outDir = path.join(root, 'public', 'assets');
const qaDir = path.join(root, 'art', 'out');

const sprites = [];
function add(name, cv, pivot = [cv.w / 2, cv.h]) {
  if (sprites.some((s) => s.name === name)) throw new Error(`duplicate sprite name ${name}`);
  sprites.push({ name, cv, pivot });
}

const files = fs.readdirSync(spriteDir).filter((f) => f.endsWith('.js')).sort();
for (const f of files) {
  const mod = await import(pathToFileURL(path.join(spriteDir, f)).href);
  if (typeof mod.default !== 'function') throw new Error(`${f} must export default build(add)`);
  mod.default(add);
}

// Trim transparent borders (keeps pivots correct) so the atlas stays small.
function trim(s) {
  const { cv } = s;
  let x0 = cv.w; let y0 = cv.h; let x1 = -1; let y1 = -1;
  for (let y = 0; y < cv.h; y++) for (let x = 0; x < cv.w; x++) {
    if (cv.opaque(x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  if (x1 < 0) throw new Error(`sprite ${s.name} is empty`);
  const out = new PixelCanvas(x1 - x0 + 1, y1 - y0 + 1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const p = cv.get(x, y);
    if (p) out.set(x - x0, y - y0, p);
  }
  return { ...s, cv: out, pivot: [s.pivot[0] - x0, s.pivot[1] - y0] };
}

const trimmed = sprites.map(trim).sort((a, b) => b.cv.h - a.cv.h || b.cv.w - a.cv.w);

// Shelf packing with 1px extruded borders (prevents bleeding when zoomed),
// spread over as many 2048x2048 pages as needed. Page 0 is atlas.json /
// atlas.png and lists the other pages in meta.related_multi_packs (PixiJS
// loads them automatically). atlas-index.json lists every page for tools.
const PAD = 1;
const GAP = 2;
const PAGE = 2048;
const pages = [];
let page = null;
const newPage = () => { page = { sprites: [], x: 0, y: 0, shelfH: 0, h: 0 }; pages.push(page); };
newPage();
for (const s of trimmed) {
  const w = s.cv.w + PAD * 2;
  const h = s.cv.h + PAD * 2;
  if (page.x + w > PAGE) { page.x = 0; page.y += page.shelfH + GAP; page.shelfH = 0; }
  if (page.y + h > PAGE) { newPage(); }
  s.at = [page.x + PAD, page.y + PAD];
  page.x += w + GAP;
  page.shelfH = Math.max(page.shelfH, h);
  page.h = Math.max(page.h, page.y + h);
  page.sprites.push(s);
}

fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) if (/^atlas(-\d+)?\.(png|json)$/.test(f)) fs.unlinkSync(path.join(outDir, f));
const pageName = (i) => (i === 0 ? 'atlas' : `atlas-${i}`);
const index = [];
pages.forEach((pg, pi) => {
  let H = 1;
  while (H < pg.h) H *= 2;
  const png = new PNG({ width: PAGE, height: H });
  png.data.fill(0);
  const put = (px, py, p) => {
    const i = (py * PAGE + px) * 4;
    png.data[i] = p[0]; png.data[i + 1] = p[1]; png.data[i + 2] = p[2]; png.data[i + 3] = p[3];
  };
  const frames = {};
  for (const s of pg.sprites) {
    const [ax, ay] = s.at;
    const { cv } = s;
    for (let yy = -PAD; yy < cv.h + PAD; yy++) {
      for (let xx = -PAD; xx < cv.w + PAD; xx++) {
        const p = cv.get(Math.max(0, Math.min(cv.w - 1, xx)), Math.max(0, Math.min(cv.h - 1, yy)));
        if (p) put(ax + xx, ay + yy, p);
      }
    }
    frames[s.name] = {
      frame: { x: ax, y: ay, w: cv.w, h: cv.h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: cv.w, h: cv.h },
      sourceSize: { w: cv.w, h: cv.h },
      anchor: { x: s.pivot[0] / cv.w, y: s.pivot[1] / cv.h },
    };
  }
  const meta = { image: `${pageName(pi)}.png`, format: 'RGBA8888', size: { w: PAGE, h: H }, scale: '1' };
  if (pi === 0 && pages.length > 1) meta.related_multi_packs = pages.slice(1).map((_, i) => `${pageName(i + 1)}.json`);
  fs.writeFileSync(path.join(outDir, `${pageName(pi)}.png`), PNG.sync.write(png));
  fs.writeFileSync(path.join(outDir, `${pageName(pi)}.json`), JSON.stringify({ frames, meta }));
  index.push({ json: `${pageName(pi)}.json`, image: `${pageName(pi)}.png`, sprites: pg.sprites.length });
});
fs.writeFileSync(path.join(outDir, 'atlas-index.json'), JSON.stringify({ pages: index }));

// Contact sheet: every sprite at 3x over a checkerboard, for review.
const S = Number(process.env.SHEET_SCALE || 3);
const cell = (s) => [s.cv.w * S + 12, s.cv.h * S + 12];
let cx = 0; let cy = 0; let rowH = 0; const SHEET_W = 1600;
const placed = [];
// SHEET=furn/ limits the contact sheet to sprites whose name starts with it.
const sheetFilter = process.env.SHEET || '';
for (const s of [...trimmed].filter((t) => t.name.startsWith(sheetFilter)).sort((a, b) => a.name.localeCompare(b.name))) {
  const [w, h] = cell(s);
  if (cx + w > SHEET_W) { cx = 0; cy += rowH; rowH = 0; }
  placed.push([s, cx, cy]);
  cx += w; rowH = Math.max(rowH, h);
}
const sheetH = cy + rowH;
const sheet = new PNG({ width: SHEET_W, height: sheetH });
for (let yy = 0; yy < sheetH; yy++) for (let xx = 0; xx < SHEET_W; xx++) {
  const c = ((xx >> 3) + (yy >> 3)) % 2 ? 0xd8 : 0xf0;
  const i = (yy * SHEET_W + xx) * 4;
  sheet.data[i] = c; sheet.data[i + 1] = c; sheet.data[i + 2] = c; sheet.data[i + 3] = 255;
}
for (const [s, ox, oy] of placed) {
  for (let yy = 0; yy < s.cv.h; yy++) for (let xx = 0; xx < s.cv.w; xx++) {
    const p = s.cv.get(xx, yy);
    if (!p) continue;
    for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
      const i = ((oy + 6 + yy * S + dy) * SHEET_W + (ox + 6 + xx * S + dx)) * 4;
      sheet.data[i] = p[0]; sheet.data[i + 1] = p[1]; sheet.data[i + 2] = p[2]; sheet.data[i + 3] = 255;
    }
  }
}
fs.mkdirSync(qaDir, { recursive: true });
fs.writeFileSync(path.join(qaDir, 'contact-sheet.png'), PNG.sync.write(sheet));

console.log(`atlas: ${trimmed.length} sprites on ${pages.length} page(s) of ${PAGE}px`);
