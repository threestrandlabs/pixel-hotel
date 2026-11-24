// Player / guest character, hand-drawn as ASCII pixel maps.
// Each map mixes several layers; the build splits them into one grey-ramp
// sprite per tintable layer (skin, hair, top, bottom, shoes) plus a fixed
// "face" layer. The renderer stacks them and tints each with the wardrobe
// colour. Facing "down" = toward the screen's lower left; "up" = back view.
import { PixelCanvas } from '../lib/canvas.js';
import { TINT, INK } from '../palette.js';

const W = 20;

//  skin  k line  l shade  m base  n hi
//  hair  H line  h shade  i base  j hi
//  top   S line  s shade  t base  u hi
//  legs  P line  p shade  q base
//  shoes O line  o base
//  face  K ink   W white  M mouth
const LAYER = {
  k: ['skin', 'line'], l: ['skin', 'shade'], m: ['skin', 'base'], n: ['skin', 'hi'],
  H: ['hair', 'line'], h: ['hair', 'shade'], i: ['hair', 'base'], j: ['hair', 'hi'],
  S: ['top', 'line'], s: ['top', 'shade'], t: ['top', 'base'], u: ['top', 'hi'],
  P: ['bottom', 'line'], p: ['bottom', 'shade'], q: ['bottom', 'base'],
  O: ['shoes', 'line'], o: ['shoes', 'base'],
  K: ['face', INK], W: ['face', '#ffffff'], M: ['face', '#b4485a'],
};

const DOWN_UPPER = [
  '......HHHHHHH.......',
  '....HHjjjiiiiHH.....',
  '...HjjiiiiiiiihH....',
  '..HjiiiiiiiiiihhH...',
  '..HiiiiiiiiiiihhH...',
  '..HiiiihhhiiihhhH...',
  '..HiihmmmmhhmhhhH...',
  '..HihmnnmmmmmmlhH...',
  '..HhmnmmmmmmmmlhH...',
  '..kmmKKmmmmKKmlkH...',
  '..kmmKWmmmmKWmlk....',
  '..kmmmmmmmmmmmlk....',
  '..klmmmmMMmmmllk....',
  '...kllmmmmmlllk.....',
  '....kkllllllkk......',
  '.......klllk........',
  '....SSSttttttSS.....',
  '...SuutttttttssS....',
  '..SuttttttttttssS...',
  '..StuStttttttSssS...',
  '..StuStttttttSssS...',
  '..StuStttttttSssS...',
  '..StuSttttttsSssS...',
  '..kmlSssssssssSlmk..',
  '...kkPqqqqqqqqpPkk..',
];

const UP_UPPER = [
  '.......HHHHHHH......',
  '.....HHiiiijjjHH....',
  '....HiiiiiiiiijjH...',
  '...HhiiiiiiiiiiijH..',
  '...HhiiiiiiiiiiiiH..',
  '...HhhiiiiiiiiiiiH..',
  '...HhhiiiiiiiiiiiH..',
  '...HhhhiiiiiiiiiiH..',
  '...HhhhhiiiiiiiihH..',
  '...HhhhhhiiiiiihhH..',
  '...kHhhhhhhhhhhhHk..',
  '...klHHhhhhhhhhHmk..',
  '....klHHHHHHHHHmk...',
  '.....kllllmmmmmk....',
  '......kkllllmkk.....',
  '........klllk.......',
  '.....SSsssttttSS....',
  '....SssssstttuuuS...',
  '...SsssssssttttuuS..',
  '...SssSssssttttStuS.',
  '...SssSssssttttStuS.',
  '...SssSssssttttStuS.',
  '...SssSsssstttsStuS.',
  '..kmlSsssssssssSlmk.',
  '..kkPqqqqqqqqqqpPkk.',
];

// Legs share both facings; split into left (cols < 10) and right (>= 10) legs.
const LEGS = [
  '.....Pqqqqqqqqpp....',
  '.....PqqqPPqqqpP....',
  '.....PqqqP.PqqpP....',
  '.....PqqqP.PqqpP....',
  '.....PqqqP.PqqpP....',
  '.....OoooO.OoooO....',
  '....OooooO.OoooO....',
  '....OOOOOO.OOOOO....',
];

const SPLIT = 10;
const UPPER_ROWS = 25;
const H = UPPER_ROWS + LEGS.length + 1; // +1 row of headroom for the walk bob

function check(rows, name) {
  rows.forEach((row, i) => {
    if (row.length !== W) throw new Error(`${name} row ${i} is ${row.length} wide, expected ${W}`);
  });
}
check(DOWN_UPPER, 'DOWN_UPPER');
check(UP_UPPER, 'UP_UPPER');
check(LEGS, 'LEGS');

// Compose a frame into a grid of characters.
// lift: which leg is lifted 1px ('L', 'R' or null); bob: body raised 1px.
function compose(upper, { lift = null, bob = false } = {}) {
  const grid = Array.from({ length: H }, () => new Array(W).fill('.'));
  const put = (x, y, ch) => { if (ch !== '.' && y >= 0 && y < H) grid[y][x] = ch; };
  const top = 1 - (bob ? 1 : 0);
  LEGS.forEach((row, j) => {
    for (let x = 0; x < W; x++) {
      const isLeft = x < SPLIT;
      const raised = (lift === 'L' && isLeft) || (lift === 'R' && !isLeft);
      put(x, top + UPPER_ROWS + j - (raised ? 1 : 0), row[x]);
    }
  });
  upper.forEach((row, j) => { for (let x = 0; x < W; x++) put(x, top + j, row[x]); });
  return grid;
}

function splitLayers(grid) {
  const layers = {};
  const get = (name) => (layers[name] ??= new PixelCanvas(W, H));
  grid.forEach((row, y) => row.forEach((ch, x) => {
    if (ch === '.') return;
    const spec = LAYER[ch];
    if (!spec) throw new Error(`character: unknown pixel '${ch}'`);
    const [layer, tone] = spec;
    get(layer).set(x, y, layer === 'face' ? tone : TINT[tone]);
  }));
  return layers;
}

export const CHARACTER_LAYERS = ['skin', 'bottom', 'shoes', 'top', 'hair', 'face'];

export default function build(add) {
  const pivot = [SPLIT, H];
  const poses = {
    idle0: {},
    walk0: { lift: 'L', bob: true },
    walk1: {},
    walk2: { lift: 'R', bob: true },
    walk3: {},
  };
  for (const [dir, upper] of [['down', DOWN_UPPER], ['up', UP_UPPER]]) {
    for (const [pose, opts] of Object.entries(poses)) {
      const layers = splitLayers(compose(upper, opts));
      for (const name of CHARACTER_LAYERS) {
        if (layers[name]) add(`char/${dir}/${pose}/${name}`, layers[name], pivot);
      }
    }
  }
}
