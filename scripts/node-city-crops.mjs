// scripts/node-city-crops.mjs
// Renders the exterior city (sky, horizon skyline, road, buildings, vehicles) straight
// from js/render.js's exported drawing functions into a pure-Node pixel buffer (see
// node-canvas-shim.mjs) — no browser, no CSS/GPU scaling, so the output is a direct,
// unambiguous picture of the fixed drawing code. Usage: node scripts/node-city-crops.mjs <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { makeNodeCanvas } from './node-canvas-shim.mjs';
import { renderSkylineToCanvas, getCachedIsoCityLayout, computeCityVehicles, drawCityVehicles } from '../js/render.js';
import { writeRgbaPng } from '../tests/_png.mjs';

const OUT_DIR = process.argv[2] || '/tmp';
fs.mkdirSync(OUT_DIR, { recursive: true });

const W = 1400, H = 900;
const room = { id: 'lobby', width: 12, height: 9, floor: 1 };
const phase = 0.5; // midday
const { ctx, buf } = makeNodeCanvas(W, H);
ctx.setTransform(1, 0, 0, 1, 0, 0);

renderSkylineToCanvas(ctx, W, H, phase, 1, room, 0, 0, 'backdrop');

const layout = getCachedIsoCityLayout(room, W, H, phase, 400, 320);
// Scan a long time window for a frame where a vehicle sits clearly inside the frame.
let bestVehicles = null;
for (let now = 0; now < 40000; now += 400) {
  const vehicles = computeCityVehicles(layout, now, phase);
  const onScreen = vehicles.filter((v) => v.screenY >= layout.horizonY && v.screenY < H - 20 && v.screenX > 40 && v.screenX < W - 40);
  if (onScreen.length && (!bestVehicles || onScreen.length > bestVehicles.onScreen.length)) {
    bestVehicles = { now, vehicles, onScreen };
  }
}
console.log('best frame:', bestVehicles?.now, 'vehicles on screen:', bestVehicles?.onScreen.length);
if (bestVehicles) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, layout.horizonY, W, H - layout.horizonY);
  ctx.clip();
  drawCityVehicles(ctx, layout, bestVehicles.vehicles, phase, 1);
  ctx.restore();
}

renderSkylineToCanvas(ctx, W, H, phase, 1, room, 0, 0, 'buildings');

writeRgbaPng(buf, W, H, path.join(OUT_DIR, '_debug_node_overview.png'), 1);
console.log('wrote _debug_node_overview.png', W, 'x', H);
if (bestVehicles?.onScreen.length) {
  console.log('onscreen vehicle coords:', bestVehicles.onScreen.map((v) => [Math.round(v.screenX), Math.round(v.screenY), v.type, v.color]));
}
