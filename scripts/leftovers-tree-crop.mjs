// Pure-Node 8x crops of the street tree: (1) isolated on pavement, (2) in place in the city,
// each at native 1:1 (High backdrop) and through the Low 0.25 snapped bake (nearest-upscaled 4x
// so it matches what the browser shows). Usage: node scripts/leftovers-tree-crop.mjs <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { makeNodeCanvas } from './node-canvas-shim.mjs';
import { renderSkylineToCanvas, drawStreetTree } from '../js/render.js';
import { snapBakeCtx } from '../js/bakeSnap.js';
import { writeRgbaPng } from '../tests/_png.mjs';

const OUT = process.argv[2] || '/tmp';
fs.mkdirSync(OUT, { recursive: true });

function crop(buf, W, x0, y0, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = ((y0 + y) * W + x0 + x) * 4;
    const d = (y * w + x) * 4;
    out[d] = buf[s]; out[d + 1] = buf[s + 1]; out[d + 2] = buf[s + 2]; out[d + 3] = 255;
  }
  return out;
}
function up(buf, w, h, k) { // nearest upscale by an integer factor
  const out = Buffer.alloc(w * k * h * k * 4);
  for (let y = 0; y < h * k; y++) for (let x = 0; x < w * k; x++) {
    const s = (Math.floor(y / k) * w + Math.floor(x / k)) * 4;
    const d = (y * w * k + x) * 4;
    out[d] = buf[s]; out[d + 1] = buf[s + 1]; out[d + 2] = buf[s + 2]; out[d + 3] = 255;
  }
  return out;
}

// (1) isolated tree, three trees in a row
{
  const { ctx, buf } = makeNodeCanvas(120, 60);
  ctx.fillStyle = '#9aa0ab';
  ctx.fillRect(0, 0, 120, 60);
  for (const x of [25, 60, 95]) drawStreetTree(ctx, x, 52, '#54ac60', '#4e3624');
  writeRgbaPng(buf, 120, 60, path.join(OUT, 'crop8x_street_tree.png'), 8);
}

// (2) in place in the city, at 1:1 (High) and 0.25 snapped (Low)
const W = 1400, H = 900;
const room = { id: 'lobby', width: 12, height: 9, floor: 1 };
for (const [name, scale] of [['high', 1], ['low', 0.25]]) {
  const bw = Math.round(W * scale), bh = Math.round(H * scale);
  const { ctx, buf } = makeNodeCanvas(bw, bh);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  snapBakeCtx(ctx, scale);
  const spots = [];
  const rawRect = ctx.fillRect;
  ctx.fillRect = function spy(x, y, w, h) { // tree shadow rect: unique 12x3 + translucent fill
    if (w === 12 && h === 3 && String(this.fillStyle).startsWith('rgba(18, 12, 28')) spots.push([x + 6, y + 2]);
    return rawRect.call(this, x, y, w, h);
  };
  renderSkylineToCanvas(ctx, W, H, 0.5, 1, room, 0, 0, 'ground');
  renderSkylineToCanvas(ctx, W, H, 0.5, 1, room, 0, 0, 'buildings');
  // keep only trees whose canopy centre is still green (not hidden behind a nearer building)
  const green = ([x, y]) => {
    const o = (Math.round((y - 18) * scale) * bw + Math.round(x * scale)) * 4;
    return buf[o + 1] > buf[o] + 15 && buf[o + 1] > buf[o + 2] + 15;
  };
  const inFrame = spots.filter(([x, y]) => x > 90 && x < W - 90 && y > 120 && y < H - 30 && green([x, y]));
  console.log(name, 'trees drawn:', spots.length, 'in frame:', inFrame.length);
  writeRgbaPng(buf, bw, bh, path.join(OUT, `_debug_city_${name}.png`), 1);
  if (inFrame.length) {
    const [tx, ty] = inFrame[0];
    const cw = 40, ch = 40; // world px
    const bx = Math.max(0, Math.min(bw - Math.round(cw * scale), Math.round((tx - cw / 2) * scale)));
    const by = Math.max(0, Math.min(bh - Math.round(ch * scale), Math.round((ty - ch + 6) * scale)));
    const w = Math.round(cw * scale), h = Math.round(ch * scale);
    const c = crop(buf, bw, bx, by, w, h);
    // Low: the browser shows each bake pixel as 4x4 CSS px, so nearest-upscale 4x first, then 8x review zoom
    const k = scale < 1 ? Math.round(1 / scale) : 1;
    const pre = up(c, w, h, k);
    writeRgbaPng(pre, w * k, h * k, path.join(OUT, `crop8x_street_tree_city_${name}.png`), 8);
  }
}
