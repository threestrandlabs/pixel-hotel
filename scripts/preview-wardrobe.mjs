// QA: the whole wardrobe catalogue on the block character, enlarged.
//   node scripts/preview-wardrobe.mjs [out.png]
// Rows: tops (front + back), bottoms x shoes, accessories, ears, eye shapes,
// brow styles and mouths. Mirrors the renderer's layer stacking.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { faceFor, IRIS_SHAPES } from '../js/faces.js';
import * as A from '../js/avatar.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const atlas = PNG.sync.read(fs.readFileSync(path.join(root, 'public/assets/atlas.png')));
const { frames } = JSON.parse(fs.readFileSync(path.join(root, 'public/assets/atlas.json'), 'utf8'));
const out = process.argv[2] || path.join(root, 'art/out/wardrobe-preview.png');

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const tint = (h) => hex(h).map((v) => Math.min(255, v * 255 / 0xde));
const W1 = [255, 255, 255];

function layers(raw, facing, pose = 'idle0') {
  const look = A.validateAvatarLook(raw);
  const at = (n) => `char/${facing}/${pose}/${n}`;
  const swim = raw.swim;
  const outfit = swim ? 'swimsuit' : look.outfit;
  const L = [[at('skin'), tint(look.skin)]];
  if (look.ears !== 'hidden') L.push([at(`ears_${look.ears}`), tint(look.skin)]);
  if (outfit !== 'dress') L.push([at(`bottom_${swim ? 'shorts' : look.bottom}`), tint(look.pants)]);
  if (!swim) L.push([at(`shoes_${look.shoeStyle}`), tint(look.shoe)]);
  L.push([at(`top_${outfit}`), tint(look.shirt)], [at(`top_${outfit}_trim`), W1]);
  const hatted = look.accessory === 'cap' || look.accessory === 'beanie';
  const hairStyle = hatted && ['spiky', 'curls'].includes(look.hairStyle) ? 'classic' : look.hairStyle;
  L.push([at(`hair_${hairStyle}`), tint(look.hair)]);
  if (facing === 'down' || facing === 'right') {
    const f = faceFor(look, raw.face || {});
    const fc = (p) => `face/${facing}/stand/${p}`;
    if (f.blush) L.push([fc('blush'), W1]);
    if (f.freckles) L.push([fc('freckles'), W1]);
    L.push([fc(`eyeL_${f.eyeL}`), W1]);
    if (IRIS_SHAPES.has(f.eyeL)) L.push([fc(`irisL_${f.eyeL}`), tint(look.eye)]);
    L.push([fc(`eyeR_${f.eyeR}`), W1]);
    if (IRIS_SHAPES.has(f.eyeR)) L.push([fc(`irisR_${f.eyeR}`), tint(look.eye)]);
    if (f.lashes) L.push([fc('lashes'), W1]);
    L.push([fc(`brows_${f.brows}`), tint(look.brow)], [fc(`mouth_${f.mouth}`), W1]);
    if (look.accessory === 'glasses' || look.accessory === 'sunglasses') {
      L.push([fc(look.accessory === 'glasses' ? 'glasses_clear' : 'glasses_dark'), W1], [fc('glasses_frame'), tint(look.accessoryColor)]);
    }
  }
  if (!['none', 'glasses', 'sunglasses'].includes(look.accessory)) L.push([at(`acc_${look.accessory}`), tint(look.accessoryColor)], [at(`acc_${look.accessory}_trim`), W1]);
  return L;
}

const base = {
  skin: '#f5cba7', hair: '#5a3826', hairStyle: 'classic', eye: '#2e5b88', brow: '#3a2418',
  shirt: '#4da3ff', pants: '#2c3e63', shoe: '#f4f4f4', accessoryColor: '#e04a4a',
};
const colours = ['#4da3ff', '#e04a4a', '#38b068', '#f6b834', '#8c52ff', '#ff7fa3', '#f4f6fa', '#282b34', '#38c5ff', '#f6b834'];
const rows = [];
const tops = [...A.TOP_STYLES.map((t) => t.outfit), 'swimsuit'];
rows.push(['Tops (front)', tops.map((o, i) => ({ look: { ...base, outfit: o, swim: o === 'swimsuit', shirt: colours[i % colours.length] }, facing: 'down' }))]);
rows.push(['Tops (back)', tops.map((o, i) => ({ look: { ...base, outfit: o, swim: o === 'swimsuit', shirt: colours[i % colours.length] }, facing: 'up' }))]);
rows.push(['Bottoms x shoes', A.BOTTOM_STYLES.flatMap((b) => A.SHOE_STYLES.map((s) => ({ look: { ...base, bottom: b.id, shoeStyle: s.id, pants: '#5c2c48', shoe: '#5c3824' }, facing: 'right' })))
  .concat([{ look: { ...base, bottom: 'skirt', shoeStyle: 'boots', pants: '#2d5038' }, facing: 'right', pose: 'sit0' },
    { look: { ...base, outfit: 'dress', shirt: '#ff7fa3' }, facing: 'right', pose: 'sit0' },
    { look: { ...base, outfit: 'labcoat', shirt: '#f4f6fa' }, facing: 'right', pose: 'walk0' }])]);
rows.push(['Accessories', A.ACCESSORY_STYLES.filter((a) => a.id !== 'none').flatMap((a, i) => ['down', 'right'].map((f) => ({ look: { ...base, accessory: a.id, accessoryColor: colours[i] }, facing: f })))]);
rows.push(['Ears + hats', A.EAR_STYLES.flatMap((e) => [{ look: { ...base, ears: e.id, hairStyle: 'bald' }, facing: 'down' }, { look: { ...base, ears: e.id, hairStyle: 'bald' }, facing: 'up' }])]);
rows.push(['Eyes', A.EYE_SHAPES.flatMap((s) => A.EYE_COLORS.slice(0, 2).map((c) => ({ look: { ...base, eyeShape: s.id, eye: c.color, lashes: s.id === 'sparkly' }, facing: 'down', head: true }))) ]);
rows.push(['Brows + extras', A.BROW_STYLES.map((b) => ({ look: { ...base, browStyle: b.id }, facing: 'down', head: true }))
  .concat([{ look: { ...base, freckles: true }, facing: 'down', head: true }, { look: { ...base, blush: false }, facing: 'down', head: true }])]);
rows.push(['Mouths', A.MOUTH_PRESETS.map((m) => ({ look: { ...base, mouth: m.mouth }, facing: 'down', head: true }))]);

const S = 4;
const CELL_W = 36 * S;
const CELL_H = 64 * S;
const HEAD_H = 34 * S;
const cols = Math.max(...rows.map((r) => r[1].length));
const rowH = rows.map((r) => (r[1].every((c) => c.head) ? HEAD_H : CELL_H));
const W = CELL_W * cols; const H = rowH.reduce((a, b) => a + b, 0);
const png = new PNG({ width: W, height: H });
let y0 = 0;
rows.forEach(([, cells], ri) => {
  const shade = ri % 2 ? [228, 224, 238] : [240, 236, 248];
  for (let y = y0; y < y0 + rowH[ri]; y++) for (let x = 0; x < W; x++) png.data.set([...shade, 255], (y * W + x) * 4);
  cells.forEach((cell, ci) => {
    const cx = ci * CELL_W + CELL_W / 2;
    const cy = y0 + (cell.head ? 50 * S : rowH[ri] - 6 * S);
    for (const [name, t] of layers(cell.look, cell.facing, cell.pose || 'idle0')) {
      const f = frames[name];
      if (!f) continue;
      const ax = Math.round(f.anchor.x * f.frame.w); const ay = Math.round(f.anchor.y * f.frame.h);
      for (let y = 0; y < f.frame.h; y++) for (let x = 0; x < f.frame.w; x++) {
        const i = ((f.frame.y + y) * atlas.width + f.frame.x + x) * 4;
        const a = atlas.data[i + 3] / 255;
        if (!a) continue;
        const rgb = [0, 1, 2].map((k) => atlas.data[i + k] * t[k] / 255);
        for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
          const px = cx + (x - ax) * S + dx; const py = cy + (y - ay) * S + dy;
          if (px < ci * CELL_W || px >= (ci + 1) * CELL_W || py < y0 || py >= y0 + rowH[ri]) continue;
          const j = (py * W + px) * 4;
          for (let k = 0; k < 3; k++) png.data[j + k] = Math.round(png.data[j + k] * (1 - a) + rgb[k] * a);
        }
      }
    }
  });
  y0 += rowH[ri];
});
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, PNG.sync.write(png));
console.log(rows.map((r) => `${r[0]}: ${r[1].length}`).join(' | '));
