// scripts/crop-png.mjs
// Cuts an exact-pixel region from an existing screenshot PNG (no browser, no recompression)
// and writes an 8x nearest-neighbour crop for style review.
// Usage: node scripts/crop-png.mjs <srcPng> <x> <y> <w> <h> <outPng> [scale]
import { readPng, writeRgbaPng } from '../tests/_png.mjs';

const [src, x, y, w, h, out, scale] = process.argv.slice(2);
const { w: srcW, h: srcH, data } = readPng(src);
const X = Number(x), Y = Number(y), W = Number(w), H = Number(h);
const region = Buffer.alloc(W * H * 4);
for (let yy = 0; yy < H; yy++) {
  for (let xx = 0; xx < W; xx++) {
    const sOff = ((Y + yy) * srcW + (X + xx)) * 4;
    const dOff = (yy * W + xx) * 4;
    data.copy(region, dOff, sOff, sOff + 4);
  }
}
writeRgbaPng(region, W, H, out, Number(scale) || 8);
console.log(`wrote ${out} (${W}x${H} src region from ${srcW}x${srcH}, ${scale || 8}x)`);
