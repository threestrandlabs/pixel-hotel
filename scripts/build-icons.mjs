// Generates the app icons in public/icons/: a pixel-art hotel tower on the
// game's night-purple, drawn on a 32x32 grid and scaled up with hard edges.
//   node scripts/build-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pngjs from 'pngjs';

const { PNG } = pngjs;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const C = {
  bg: [27, 20, 48], bg2: [44, 33, 80], star: [184, 166, 234],
  stone: [216, 195, 165], stoneDark: [176, 154, 128], roof: [141, 123, 110],
  win: [127, 182, 208], winLit: [255, 216, 106], door: [90, 56, 38],
  sign: [232, 178, 58], signDark: [176, 126, 38], moon: [255, 246, 192],
};

// 32x32 design. `pad` shrinks the art toward the centre (maskable icons need
// their content inside the middle 80%).
function design(pad) {
  const g = Array.from({ length: 32 }, () => Array(32).fill(C.bg));
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if ((x + y) % 2 === 0 && y > 20) g[y][x] = C.bg2;
  const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < 32 && y < 32) g[y][x] = c; };
  const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, c); };
  // sky details
  for (const [x, y] of [[4, 5], [9, 3], [26, 7], [28, 3], [6, 12]]) put(x, y, C.star);
  rect(24, 2, 26, 4, C.moon); put(24, 2, C.bg); put(26, 4, C.bg);
  // tower
  rect(10, 7, 21, 29, C.stone);
  rect(19, 7, 21, 29, C.stoneDark);
  rect(9, 6, 22, 6, C.roof);
  rect(14, 3, 17, 5, C.roof); // rooftop box
  // lit and unlit windows, 3 columns x 5 rows
  const lit = new Set(['0,1', '2,0', '1,3', '0,4', '2,5', '1,1']);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
    const x = 11 + c * 3; const y = 9 + r * 3;
    rect(x, y, x + 1, y + 1, lit.has(`${c},${r}`) ? C.winLit : C.win);
  }
  // door and the gold "H" sign
  rect(14, 26, 17, 29, C.door);
  rect(13, 23, 18, 25, C.sign);
  for (const y of [23, 24, 25]) { put(14, y, C.signDark); put(17, y, C.signDark); }
  put(15, 24, C.signDark); put(16, 24, C.signDark);
  // ground
  rect(0, 30, 31, 31, C.roof);
  if (!pad) return g;
  // shrink toward the centre for a maskable safe zone
  const s = 32 - pad * 2;
  const out = Array.from({ length: 32 }, () => Array(32).fill(C.bg));
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    out[y + pad][x + pad] = g[Math.floor((y * 32) / s)][Math.floor((x * 32) / s)];
  }
  return out;
}

function png(size, grid) {
  const img = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const [r, gg, b] = grid[Math.floor((y * 32) / size)][Math.floor((x * 32) / size)];
    const i = (y * size + x) * 4;
    img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  return PNG.sync.write(img);
}

mkdirSync(OUT, { recursive: true });
const plain = design(0);
const masked = design(3);
writeFileSync(join(OUT, 'icon-192.png'), png(192, plain));
writeFileSync(join(OUT, 'icon-512.png'), png(512, plain));
writeFileSync(join(OUT, 'icon-maskable-512.png'), png(512, masked));
writeFileSync(join(OUT, 'apple-touch-icon.png'), png(180, masked));
writeFileSync(join(OUT, 'favicon-32.png'), png(32, plain));
console.log('icons written to public/icons');
