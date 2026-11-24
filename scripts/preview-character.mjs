// QA: composite the tinted character layers from the built atlas into one
// enlarged preview sheet (all facings and poses, a few outfits).
//   node scripts/preview-character.mjs [out.png]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const atlas = PNG.sync.read(fs.readFileSync(path.join(root, 'public/assets/atlas.png')));
const { frames } = JSON.parse(fs.readFileSync(path.join(root, 'public/assets/atlas.json'), 'utf8'));
const out = process.argv[2] || path.join(root, 'art/out/character-preview.png');

const LAYERS = ['skin', 'bottom', 'shoes', 'top', 'hair', 'face'];
const LOOKS = [
  { skin: '#f0c49a', hair: '#5a3826', top: '#4da3ff', bottom: '#2c3e63', shoes: '#f4f4f4' },
  { skin: '#8d5a3b', hair: '#1c1418', top: '#e0507a', bottom: '#3a3040', shoes: '#2a2030' },
  { skin: '#ffd9a8', hair: '#e8c45a', top: '#4fae6a', bottom: '#c8b48a', shoes: '#7a4a2a' },
];
const POSES = ['idle0', 'walk0', 'walk2', 'sit0'];
const S = 4;
const CELL_W = 40 * S;
const CELL_H = 64 * S;
const W = CELL_W * POSES.length * 4;
const H = CELL_H * LOOKS.length;
const png = new PNG({ width: W, height: H });
for (let i = 0; i < W * H; i++) {
  const x = i % W; const y = Math.floor(i / W);
  const c = ((x / (S * 4) | 0) + (y / (S * 4) | 0)) % 2 ? 0xe4 : 0xf2;
  png.data.set([c, c, c, 255], i * 4);
}
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const tintK = 255 / 0xde;

LOOKS.forEach((look, row) => {
  ['down', 'right', 'up', 'left'].forEach((dir, d) => {
    POSES.forEach((pose, p) => {
      const cx = (d * POSES.length + p) * CELL_W + CELL_W / 2;
      const cy = row * CELL_H + CELL_H - 4 * S;
      for (const layer of LAYERS) {
        const f = frames[`char/${dir}/${pose}/${layer}`];
        if (!f) continue;
        const tint = layer === 'face' ? [255, 255, 255] : hex(look[layer]).map((v) => Math.min(255, v * tintK));
        const ax = Math.round(f.anchor.x * f.frame.w);
        const ay = Math.round(f.anchor.y * f.frame.h);
        for (let y = 0; y < f.frame.h; y++) for (let x = 0; x < f.frame.w; x++) {
          const i = ((f.frame.y + y) * atlas.width + f.frame.x + x) * 4;
          if (atlas.data[i + 3] === 0) continue;
          const rgb = [0, 1, 2].map((k) => Math.round(atlas.data[i + k] * tint[k] / 255));
          for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
            const px = cx + (x - ax) * S + dx;
            const py = cy + (y - ay) * S + dy;
            if (px < 0 || py < 0 || px >= W || py >= H) continue;
            png.data.set([...rgb, 255], (py * W + px) * 4);
          }
        }
      }
    });
  });
});
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, PNG.sync.write(png));
console.log(out);
