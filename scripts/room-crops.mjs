// scripts/room-crops.mjs
// Pure-Node (no browser) 8x nearest-neighbour crops of the Phase 2 room-shell
// sprites (sprites.js grids are plain {w,h,px} arrays, no canvas needed) for
// the mandatory 8x style review. Usage: node scripts/room-crops.mjs <outDir>
import fs from 'node:fs';
import path from 'node:path';
import {
  buildWallSegment, buildWindowSegment, buildDoorSegment, buildElevatorDoorSegment,
  buildFloorTile, FLOOR_MATERIALS,
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

function composite(...sprites) {
  const w = sprites[0].w;
  const h = sprites[0].h;
  const px = [];
  for (let y = 0; y < h; y++) px.push(new Array(w).fill(null));
  for (const s of sprites) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (s.px[y][x]) px[y][x] = s.px[y][x];
      }
    }
  }
  return { w, h, px };
}

const baseColor = '#e3a27a';
const sky = { top: '#8fd0ff', bottom: '#fff6c9' };

// Wall corner: north + west wall segments composited exactly as render.js
// tiles them, so the join at the room corner is visible with no seam/gap.
const corner = composite(buildWallSegment(baseColor, 'north'), buildWallSegment(baseColor, 'west'));
writeSpritePng(cropToContent(corner, 2), path.join(OUT_DIR, 'crop8x_wall_corner.png'), 8);
console.log('wrote crop8x_wall_corner.png');

writeSpritePng(cropToContent(buildWindowSegment(baseColor, sky, 'north')), path.join(OUT_DIR, 'crop8x_window.png'), 8);
console.log('wrote crop8x_window.png');

writeSpritePng(cropToContent(buildDoorSegment(baseColor, 'north')), path.join(OUT_DIR, 'crop8x_door.png'), 8);
console.log('wrote crop8x_door.png');

writeSpritePng(cropToContent(buildElevatorDoorSegment(baseColor, 'north')), path.join(OUT_DIR, 'crop8x_elevator.png'), 8);
console.log('wrote crop8x_elevator.png');

for (const material of FLOOR_MATERIALS) {
  const tile = buildFloorTile('#e9c48f', 0, material);
  writeSpritePng(cropToContent(tile), path.join(OUT_DIR, `crop8x_floor_${material}.png`), 8);
  console.log(`wrote crop8x_floor_${material}.png`);
}

console.log('Done generating room-shell 8x crops.');
