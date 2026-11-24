// Player / guest character, hand-drawn as ASCII pixel maps.
// Each map mixes several layers; the build splits them into one grey-ramp
// sprite per tintable layer (skin, hair, top, bottom, shoes) plus a fixed
// "face" layer. The renderer stacks them and tints each with the wardrobe
// colour. Facing "down" = toward the screen's lower left; "up" = back view.
import { PixelCanvas } from '../lib/canvas.js';
import { TINT, INK } from '../palette.js';

const W = 22;

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

// Blocky avatar: square head, neck, block torso with separate arms, straight
// block legs. Flat two-tone shading, lit from the upper left.
const head = (rows) => rows.map((r) => `.....${r}.....`); // 12-wide head
const body = (rows) => rows.map((r) => `....${r}....`); // 14-wide body

const DOWN_HEAD = head([
  'HHHHHHHHHHHH',
  'HjjiiiiiiihH',
  'HjiiiiiiiihH',
  'HiiiiiiiihhH',
  'kmmmmmmmihhH',
  'knmmmmmmmhhH',
  'kmKmmKmmmlhH',
  'kmKmmKmmmlhH',
  'kmmmmmmmmlk.',
  'kmmMMMmmmlk.',
  'kmmmmmmmllk.',
  'kkkkkkkkkkk.',
  '...kmlk.....',
]);

const UP_HEAD = head([
  'HHHHHHHHHHHH',
  'HhiiiiiijjjH',
  'HhiiiiiiijjH',
  'HhhiiiiiiijH',
  'HhhiiiiiiiiH',
  'HhhiiiiiiiiH',
  'HhhhiiiiiiiH',
  'HhhhiiiiiiiH',
  'khhhhiiiiiik',
  'klHhhhhhhhmk',
  'kllHHHHHHmmk',
  'kkkkkkkkkkkk',
  '.....klmk...',
]);

const TORSO = body([
  'SSSSSSSSSSSSSS',
  'SuuStttttttSsS',
  'SutStttttttSsS',
  'SutStttttttSsS',
  'SutStttttttSsS',
  'SutStttttttSsS',
  'SutStttttttSsS',
  'SutSttttttsSsS',
  'SutSsssssssSsS',
  'SSSSSSSSSSSSSS',
  'kmkPqqqqqqqPmk',
  'kkkPqqqqqqqPkk',
]);

const DOWN_UPPER = [...DOWN_HEAD, ...TORSO];
const UP_UPPER = [...UP_HEAD, ...TORSO];

// Legs share both facings; left leg is cols < SPLIT, right leg cols >= SPLIT.
const LEGS = body([
  '...PqqqPqqpP..',
  '...PqqqPqqpP..',
  '...PqqqPqqpP..',
  '...PqqqPqqpP..',
  '...PqqqPqqpP..',
  '...PqqqPqqpP..',
  '...PPPPPPPPP..',
  '..OoooOOoooO..',
  '..OOOOOOOOOO..',
]);

const SPLIT = 11;
const UPPER_ROWS = DOWN_UPPER.length;
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
  // Arm swing: the arm on the lifted leg's side drops 1px. It is drawn on top
  // of the unshifted body, so the shoulder never shows a gap.
  const torsoStart = upper.length - TORSO.length;
  upper.forEach((row, j) => { for (let x = 0; x < W; x++) put(x, top + j, row[x]); });
  if (lift) {
    const [a0, a1] = lift === 'L' ? [4, 6] : [15, 17];
    for (let j = torsoStart + 1; j < upper.length; j++) {
      for (let x = a0; x <= a1; x++) put(x, top + j + 1, upper[j][x]);
    }
  }
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
