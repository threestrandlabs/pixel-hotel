// Checks on the built sprite atlas (public/assets/atlas.json, made by
// `npm run art`) and on the pure iso / lighting helpers.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CATALOGUE, ROOMS, NPCS } from '../js/data.js';
import { LOOKS } from '../js/looks.js';
import {
  computeGroundDy, dayNight, multiplyTint, combineTints, clampZoom, MIN_ZOOM, MAX_ZOOM,
} from '../js/iso.js';

const ATLAS = JSON.parse(fs.readFileSync(new URL('../public/assets/atlas.json', import.meta.url), 'utf8'));
const frames = ATLAS.frames;

test('atlas: every catalogue item has a front and back sprite', () => {
  const missing = [];
  for (const item of CATALOGUE) {
    for (const rot of [0, 2]) if (!frames[`furn/${item.id}/${rot}`]) missing.push(`${item.id}/${rot}`);
  }
  assert.deepEqual(missing, []);
});

test('atlas: characters have every layer pose for all four facings', () => {
  for (const dir of ['down', 'right', 'up', 'left']) {
    for (const pose of ['idle0', 'walk0', 'walk1', 'walk2', 'walk3', 'sit0']) {
      for (const layer of ['skin', 'top', 'bottom', 'shoes']) {
        assert.ok(frames[`char/${dir}/${pose}/${layer}`], `char/${dir}/${pose}/${layer}`);
      }
      // every wardrobe hair style except bald has its own hair layer
      for (const style of ['classic', 'bob', 'long', 'ponytail', 'spiky', 'curls']) {
        assert.ok(frames[`char/${dir}/${pose}/hair_${style}`], `char/${dir}/${pose}/hair_${style}`);
      }
      assert.ok(!frames[`char/${dir}/${pose}/hair_bald`], 'bald has no hair layer');
    }
  }
  // faces only show on the two facings toward the viewer
  assert.ok(frames['char/down/idle0/face']);
  assert.ok(frames['char/right/idle0/face']);
});

test('atlas: water animates in 8 frames x 4 parities and has rims on every edge', () => {
  for (let f = 0; f < 8; f++) for (const p of ['00', '01', '10', '11']) assert.ok(frames[`water/frame${f}_${p}`]);
  for (const e of ['n', 'w', 's', 'e']) assert.ok(frames[`water/rim_${e}`]);
});

test('atlas: every room floor material and wall kind has art', () => {
  const FLOOR_FOR = {
    lobby_marble: 'floor/marble_a', dark_parquet: 'floor/parquet', gym_rubber: 'floor/rubber',
    spa_stone: 'floor/spa_stone', arcade_neon: 'floor/arcade', library_carpet: 'floor/carpet', grass: 'floor/grass',
  };
  for (const room of Object.values(ROOMS)) {
    if (!room.floorMaterial) continue;
    assert.ok(FLOOR_FOR[room.floorMaterial], `no floor art mapping for ${room.floorMaterial}`);
    assert.ok(frames[FLOOR_FOR[room.floorMaterial]], `atlas missing ${FLOOR_FOR[room.floorMaterial]}`);
  }
  for (const side of ['north', 'west']) for (const kind of ['plain', 'window', 'door']) assert.ok(frames[`wall/${side}_${kind}`]);
  assert.ok(frames['wall/rail_north'] && frames['wall/rail_west']);
});

test('atlas: frame anchors are sane and frames do not overlap', () => {
  const rects = Object.entries(frames).map(([name, f]) => ({ name, ...f.frame, a: f.anchor }));
  for (const r of rects) {
    assert.ok(r.w > 0 && r.h > 0, `${r.name} is empty`);
    // small layer sprites (a shoe, a fringe) sit away from the shared pivot,
    // so anchors may fall outside their own box, but never absurdly far
    assert.ok(Number.isFinite(r.a.x) && Number.isFinite(r.a.y) && Math.abs(r.a.x) < 6 && Math.abs(r.a.y) < 8, `${r.name} anchor ${JSON.stringify(r.a)}`);
  }
  rects.sort((p, q) => p.y - q.y || p.x - q.x);
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length && rects[j].y < rects[i].y + rects[i].h; j++) {
      const a = rects[i]; const b = rects[j];
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.ok(!overlap, `${a.name} overlaps ${b.name}`);
    }
  }
});

test('looks: every wardrobe hair style has art (or is bald)', async () => {
  const { HAIR_STYLES } = await import('../js/avatar.js');
  for (const h of HAIR_STYLES) {
    if (h.id === 'bald') continue;
    assert.ok(frames[`char/down/idle0/hair_${h.id}`], `missing hair art for ${h.id}`);
  }
});

test('looks: every NPC sprite key and the player have an appearance preset', () => {
  assert.ok(LOOKS.player);
  const missing = NPCS.filter((n) => n.spriteKey && !LOOKS[n.spriteKey]).map((n) => n.id);
  assert.deepEqual(missing, []);
});

test('iso: ground drop grows with every floor and day/night spans the cycle', () => {
  let prev = -1;
  for (const f of [1, 2, 5, 6, 9, 11, 42]) {
    const g = computeGroundDy(f);
    assert.ok(g > prev, `floor ${f}`);
    prev = g;
  }
  assert.equal(dayNight(0.5).day, 1);
  assert.equal(dayNight(0).night, 1);
  assert.ok(dayNight(0.2).dusk > 0.5, 'dawn has a dusk glow');
});

test('iso: tints multiply as expected and zoom only takes whole steps', () => {
  assert.equal(multiplyTint(0x000000, 0), 0xffffff);
  assert.equal(multiplyTint(0x000000, 1), 0x000000);
  assert.equal(combineTints(0xffffff, 0x808080), 0x808080);
  for (const z of [0.2, 1.4, 2.6, 9]) {
    const c = clampZoom(z);
    assert.ok(Number.isInteger(c) && c >= MIN_ZOOM && c <= MAX_ZOOM);
  }
});
