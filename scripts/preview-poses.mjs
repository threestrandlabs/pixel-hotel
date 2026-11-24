// QA: every character pose in all four facings, dressed, enlarged.
//   node scripts/preview-poses.mjs [out.png] [poseFilter]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { loadAtlas } from './atlas-pages.mjs';
import { faceFor, IRIS_SHAPES } from '../js/faces.js';
import { POSES, FACE_KIND } from '../art/sprites/character.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { frames, pixel } = loadAtlas(root);
const out = process.argv[2] || path.join(root, 'art/out/pose-preview.png');
const filter = process.argv[3] ? new RegExp(process.argv[3]) : null;

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const tint = (h) => hex(h).map((v) => Math.min(255, v * 255 / 0xde));
const W1 = [255, 255, 255];
const look = {
  skin: '#f5cba7', hair: '#5a3826', hairStyle: 'ponytail', eye: '#2e5b88', brow: '#3a2418', mouth: 'smile',
  shirt: '#e04a4a', pants: '#2c3e63', shoe: '#f4f4f4', outfit: 'tee', bottom: 'pants', shoeStyle: 'sneakers',
  ears: 'normal', eyeShape: 'round', browStyle: 'soft', blush: true, accessory: 'none',
};

function layers(facing, pose) {
  const at = (n) => `char/${facing}/${pose}/${n}`;
  const L = [[at('skin'), tint(look.skin)], [at('ears_normal'), tint(look.skin)], [at('bottom_pants'), tint(look.pants)],
    [at('shoes_sneakers'), tint(look.shoe)], [at('top_tee'), tint(look.shirt)], [at(`hair_${look.hairStyle}`), tint(look.hair)]];
  const kind = FACE_KIND(pose);
  if (frames[`face/${facing}/${kind}/mouth_smile`]) {
    const f = faceFor(look, {});
    const fc = (p) => `face/${facing}/${kind}/${p}`;
    L.push([fc('blush'), W1], [fc(`eyeL_${f.eyeL}`), W1], [fc(`eyeR_${f.eyeR}`), W1]);
    if (IRIS_SHAPES.has(f.eyeL)) L.push([fc(`irisL_${f.eyeL}`), tint(look.eye)], [fc(`irisR_${f.eyeR}`), tint(look.eye)]);
    L.push([fc(`brows_${f.brows}`), tint(look.brow)], [fc(`mouth_${f.mouth}`), W1]);
  }
  return L;
}

const poses = Object.keys(POSES).filter((p) => !filter || filter.test(p));
const facings = ['down', 'right', 'up', 'left'];
const S = 3; const CW = 64 * S; const CH = 70 * S;
const PER_ROW = 4; // poses per row, each with 4 facings
const rows = Math.ceil(poses.length / PER_ROW);
const W = CW * facings.length * PER_ROW; const H = CH * rows;
const png = new PNG({ width: W, height: H });
for (let i = 0; i < W * H; i++) {
  const x = i % W; const cell = Math.floor(x / (CW * 4));
  png.data.set(cell % 2 ? [228, 224, 238, 255] : [240, 236, 248, 255], i * 4);
}
poses.forEach((pose, pi) => {
  const row = Math.floor(pi / PER_ROW); const col0 = (pi % PER_ROW) * facings.length;
  facings.forEach((facing, fi) => {
    const ox = (col0 + fi) * CW; const oy = row * CH;
    const cx = ox + CW / 2; const cy = oy + CH - 10 * S;
    for (const [name, t] of layers(facing, pose)) {
      const f = frames[name];
      if (!f) continue;
      const ax = Math.round(f.anchor.x * f.frame.w); const ay = Math.round(f.anchor.y * f.frame.h);
      for (let y = 0; y < f.frame.h; y++) for (let x = 0; x < f.frame.w; x++) {
        const px0 = pixel(name, x, y);
        const a = px0[3] / 255;
        if (!a) continue;
        const rgb = [0, 1, 2].map((k) => px0[k] * t[k] / 255);
        for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
          const X = cx + (x - ax) * S + dx; const Y = cy + (y - ay) * S + dy;
          if (X < ox || X >= ox + CW || Y < oy || Y >= oy + CH) continue;
          const j = (Y * W + X) * 4;
          for (let k = 0; k < 3; k++) png.data[j + k] = Math.round(png.data[j + k] * (1 - a) + rgb[k] * a);
        }
      }
    }
  });
});
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, PNG.sync.write(png));
console.log(poses.join(' '));
