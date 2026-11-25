// QA: every face expression on a front- and side-facing head, enlarged.
//   node scripts/preview-faces.mjs [out.png]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { loadAtlas } from './atlas-pages.mjs';
import { faceFor, IRIS_SHAPES } from '../js/faces.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { frames, pixel } = loadAtlas(root);
const out = process.argv[2] || path.join(root, 'art/out/face-preview.png');

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const tintOf = (h) => hex(h).map((v) => Math.min(255, v * 255 / 0xde));
const WHITE = [255, 255, 255];

const base = { skin: '#f0c49a', hair: '#5a3826', shirt: '#4da3ff', pants: '#2c3e63', shoe: '#f4f4f4', eye: '#2e5b88', brow: '#4a2f20', hairStyle: 'classic' };
const CASES = [
  ['smile', { ...base, mouth: 'smile' }, {}],
  ['moody', { ...base, mouth: 'frown' }, {}],
  ['joyful', { ...base, mouth: 'open' }, {}],
  ['glamour', { ...base, mouth: 'lips', lashes: true, eye: '#3b7a57' }, {}],
  ['blink', { ...base, mouth: 'smile' }, { blink: true }],
  ['wave', { ...base, mouth: 'smile' }, { emote: 'wave' }],
  ['laugh', { ...base, mouth: 'smile' }, { emote: 'laugh' }],
  ['dance', { ...base, mouth: 'smile' }, { emote: 'dance' }],
  ['heart', { ...base, mouth: 'smile' }, { emote: 'heart' }],
  ['sleep', { ...base, mouth: 'smile' }, { emote: 'sleep' }],
];

function layers(look, facing, state) {
  const L = [];
  const hairStyle = look.hairStyle;
  for (const [n, c] of [['skin', look.skin], ['bottom_pants', look.pants], ['shoes_sneakers', look.shoe], ['top_tee', look.shirt]]) L.push([`char/${facing}/idle0/${n}`, tintOf(c)]);
  L.push([`char/${facing}/idle0/hair_${hairStyle}`, tintOf(look.hair)]);
  const f = faceFor(look, state);
  const at = (p) => `face/${facing}/stand/${p}`;
  if (f.blush) L.push([at('blush'), WHITE]);
  L.push([at(`eyeL_${f.eyeL}`), WHITE]);
  if (IRIS_SHAPES.has(f.eyeL)) L.push([at(`irisL_${f.eyeL}`), tintOf(look.eye)]);
  L.push([at(`eyeR_${f.eyeR}`), WHITE]);
  if (IRIS_SHAPES.has(f.eyeR)) L.push([at(`irisR_${f.eyeR}`), tintOf(look.eye)]);
  if (f.lashes) L.push([at('lashes'), WHITE]);
  L.push([at(`brows_${f.brows}`), tintOf(look.brow)]);
  L.push([at(`mouth_${f.mouth}`), WHITE]);
  return L;
}

const S = 6; const CW = 34 * S; const CH = 32 * S;
const W = CW * CASES.length; const H = CH * 2;
const png = new PNG({ width: W, height: H });
for (let i = 0; i < W * H; i++) png.data.set([236, 232, 244, 255], i * 4);
['down', 'right'].forEach((facing, row) => {
  CASES.forEach(([, look, state], col) => {
    const cx = col * CW + CW / 2; const cy = row * CH + CH + 12 * S; // crop to the head
    for (const [name, tint] of layers(look, facing, state)) {
      const f = frames[name];
      if (!f) { console.warn('missing', name); continue; }
      const ax = Math.round(f.anchor.x * f.frame.w); const ay = Math.round(f.anchor.y * f.frame.h);
      for (let y = 0; y < f.frame.h; y++) for (let x = 0; x < f.frame.w; x++) {
        const px0 = pixel(name, x, y);
        const a = px0[3] / 255;
        if (!a) continue;
        const rgb = [0, 1, 2].map((k) => px0[k] * tint[k] / 255);
        for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
          const px = cx + (x - ax) * S + dx; const py = cy + (y - ay) * S + dy;
          if (px < col * CW || px >= (col + 1) * CW || py < row * CH || py >= (row + 1) * CH) continue;
          const j = (py * W + px) * 4;
          for (let k = 0; k < 3; k++) png.data[j + k] = Math.round(png.data[j + k] * (1 - a) + rgb[k] * a);
        }
      }
    }
  });
});
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, PNG.sync.write(png));
console.log(CASES.map((c) => c[0]).join(' | '));
