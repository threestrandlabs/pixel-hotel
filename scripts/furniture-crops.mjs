// scripts/furniture-crops.mjs
// Pure-Node (no browser) 8x nearest-neighbour crops of furniture sprites (sprites.js grids are
// plain {w,h,px} arrays) for the mandatory 8x style review, at Low (DETAIL=1) and High (DETAIL=2),
// plus a 3x contact sheet of every catalogue item. Usage: node scripts/furniture-crops.mjs <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { FURNITURE_BUILDERS } from '../js/sprites.js';
import { CATALOGUE } from '../js/data.js';
import { setDetail } from '../js/pixelart.js';
import { writeSpritePng } from '../tests/_png.mjs';

const OUT_DIR = process.argv[2] || '/tmp';
fs.mkdirSync(OUT_DIR, { recursive: true });

function bbox(sprite) {
  let minX = sprite.w, maxX = -1, minY = sprite.h, maxY = -1;
  for (let y = 0; y < sprite.h; y++) {
    for (let x = 0; x < sprite.w; x++) {
      if (sprite.px[y][x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

function cropToContent(sprite, pad = 1) {
  const { minX, minY, maxX, maxY } = bbox(sprite);
  const x0 = Math.max(0, minX - pad);
  const y0 = Math.max(0, minY - pad);
  const x1 = Math.min(sprite.w - 1, maxX + pad);
  const y1 = Math.min(sprite.h - 1, maxY + pad);
  const px = [];
  for (let y = y0; y <= y1; y++) px.push(sprite.px[y].slice(x0, x1 + 1));
  return { w: x1 - x0 + 1, h: y1 - y0 + 1, px };
}

const byId = (id) => CATALOGUE.find((i) => i.id === id);
const HERO = ['suite_bed', 'sofa', 'computer_desk', 'lamp', 'plant', 'bar_counter', 'armchair', 'dining_chair', 'dining_table', 'cafe_table', 'stool', 'bookshelf', 'sky_tree', 'kitchen_range', 'wardrobe'];
const NAME = { suite_bed: 'bed', computer_desk: 'desk', bar_counter: 'counter' };

for (const [detail, suffix] of [[1, ''], [2, '_high']]) {
  setDetail(detail);
  for (const id of HERO) {
    const s = cropToContent(FURNITURE_BUILDERS[byId(id).spriteKey](0, 'all'));
    const out = path.join(OUT_DIR, `crop8x_${NAME[id] || id}${suffix}.png`);
    writeSpritePng(s, out, 8);
    console.log(`wrote ${out} (${s.w}x${s.h} px, detail ${detail})`);
  }
}

// contact sheet: every catalogue item at rot 0, Low detail, 3x
setDetail(1);
const cells = CATALOGUE.map((it) => cropToContent(FURNITURE_BUILDERS[it.spriteKey](0, 'all')));
const cols = 10;
const cw = Math.max(...cells.map((c) => c.w)) + 6;
const ch = Math.max(...cells.map((c) => c.h)) + 6;
const rows = Math.ceil(cells.length / cols);
const sheet = { w: cw * cols, h: ch * rows, px: Array.from({ length: ch * rows }, () => new Array(cw * cols).fill('#5a4a6a')) };
cells.forEach((c, i) => {
  const ox = (i % cols) * cw + 3;
  const oy = Math.floor(i / cols) * ch + 3;
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.px[y][x]) sheet.px[oy + y][ox + x] = c.px[y][x];
});
writeSpritePng(sheet, path.join(OUT_DIR, 'sheet_all_low_3x.png'), 3);
console.log('Done generating furniture 8x crops + contact sheet.');
