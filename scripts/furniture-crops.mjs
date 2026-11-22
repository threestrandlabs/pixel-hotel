// scripts/furniture-crops.mjs
// Pure-Node (no browser) 8x nearest-neighbour crops of representative Phase 3
// furniture sprites (sprites.js grids are plain {w,h,px} arrays) for
// the mandatory 8x style review. Usage: node scripts/furniture-crops.mjs <outDir>
import fs from 'node:fs';
import path from 'node:path';
import {
  buildSuiteBedSprite, buildSofaSprite, buildComputerDeskSprite, buildLampSprite,
  buildPlantSprite, buildBarCounter, buildBookshelf, buildArmchairSprite,
  buildDiningTableSprite, buildDiningChairSprite,
} from '../js/sprites.js';
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
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const px = [];
  for (let y = 0; y < h; y++) px.push(sprite.px[y0 + y].slice(x0, x0 + w));
  return { w, h, px };
}

const items = {
  bed: buildSuiteBedSprite(0),
  sofa: buildSofaSprite('#e2607a', 0),
  desk: buildComputerDeskSprite(0),
  lamp: buildLampSprite(),
  plant: buildPlantSprite(),
  counter: buildBarCounter(0),
  bookshelf: buildBookshelf(0),
  armchair: buildArmchairSprite(0),
  dining_table: buildDiningTableSprite(0),
  dining_chair: buildDiningChairSprite(0),
};

for (const [name, s] of Object.entries(items)) {
  const cropped = cropToContent(s);
  const outFile = path.join(OUT_DIR, `crop8x_${name}.png`);
  writeSpritePng(cropped, outFile, 8);
  console.log(`wrote ${outFile} (${cropped.w}x${cropped.h} px)`);
}

console.log('Done generating Phase 3 furniture 8x crops.');
