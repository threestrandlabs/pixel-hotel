// Checks on the built sprite atlas (public/assets/atlas*.json, made by
// `npm run art`) and on the pure iso / lighting helpers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadAtlasFrames } from '../scripts/atlas-pages.mjs';
import { CATALOGUE, ROOMS, NPCS } from '../js/data.js';
import { LOOKS } from '../js/looks.js';
import { faceFor } from '../js/faces.js';
import {
  computeGroundDy, dayNight, multiplyTint, combineTints, clampZoom, MIN_ZOOM, MAX_ZOOM,
} from '../js/iso.js';

const ATLAS = loadAtlasFrames(fileURLToPath(new URL('..', import.meta.url)));
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
      assert.ok(frames[`char/${dir}/${pose}/skin`], `char/${dir}/${pose}/skin`);
      // every wardrobe hair style except bald has its own hair layer
      for (const style of ['classic', 'bob', 'long', 'ponytail', 'spiky', 'curls']) {
        assert.ok(frames[`char/${dir}/${pose}/hair_${style}`], `char/${dir}/${pose}/hair_${style}`);
      }
      assert.ok(!frames[`char/${dir}/${pose}/hair_bald`], 'bald has no hair layer');
    }
  }
});

test('atlas: face parts exist for both visible facings, standing and sitting', () => {
  for (const facing of ['down', 'right']) {
    for (const kind of ['stand', 'sit']) {
      const at = (p) => frames[`face/${facing}/${kind}/${p}`];
      for (const shape of ['open', 'half', 'closed', 'happy']) {
        assert.ok(at(`eyeL_${shape}`) && at(`eyeR_${shape}`), `${facing}/${kind} eyes ${shape}`);
      }
      for (const shape of ['open', 'half']) assert.ok(at(`irisL_${shape}`) && at(`irisR_${shape}`), `iris ${shape}`);
      for (const b of ['soft_normal', 'soft_raised', 'thick_normal', 'arched_raised', 'thin_normal', 'sad']) assert.ok(at(`brows_${b}`), `brows ${b}`);
      for (const m of ['smile', 'frown', 'open', 'lips', 'grin', 'cat', 'laugh', 'smug', 'sleepy']) assert.ok(at(`mouth_${m}`), `mouth ${m}`);
      assert.ok(at('lashes') && at('blush'));
    }
  }
  // the back of the head has no face
  assert.ok(!frames['face/up/stand/mouth_smile']);
});

test('faces: wardrobe mouths, emotes and blinking pick the right parts', () => {
  assert.equal(faceFor({ mouth: 'lips', lashes: true }).mouth, 'lips');
  assert.equal(faceFor({ mouth: 'lips', lashes: true }).lashes, true);
  assert.equal(faceFor({ mouth: 'nonsense' }).mouth, 'smile');
  assert.equal(faceFor({ mouth: 'frown' }).brows, 'sad');
  assert.deepEqual(
    [faceFor({}, { emote: 'laugh' }).eyeL, faceFor({}, { emote: 'laugh' }).mouth],
    ['happy', 'laugh'],
  );
  const wink = faceFor({}, { emote: 'heart' });
  assert.deepEqual([wink.eyeL, wink.eyeR], ['open', 'closed']);
  assert.equal(faceFor({}, { emote: 'sleep' }).mouth, 'sleepy');
  const blink = faceFor({}, { blink: true });
  assert.deepEqual([blink.eyeL, blink.eyeR], ['closed', 'closed']);
  // blinking never overrides happy eyes
  assert.equal(faceFor({}, { emote: 'wave', blink: true }).eyeL, 'happy');
  // every face part the logic can ask for exists in the atlas
  const looks = [{}, { mouth: 'frown' }, { mouth: 'open' }, { mouth: 'lips', lashes: true }];
  const emotes = [null, 'wave', 'dance', 'laugh', 'clap', 'heart', 'sleep', 'cheer', 'thumbsup'];
  for (const look of looks) for (const emote of emotes) for (const blinkOn of [false, true]) {
    const f = faceFor(look, { emote, blink: blinkOn });
    for (const part of [`eyeL_${f.eyeL}`, `eyeR_${f.eyeR}`, `brows_${f.brows}`, `mouth_${f.mouth}`]) {
      assert.ok(frames[`face/down/stand/${part}`], `missing face part ${part}`);
    }
    assert.ok(f.brows === 'sad' || f.brows.startsWith('soft_'), 'default brow style is soft');
  }
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
  const rects = Object.entries(frames).map(([name, f]) => ({ name, ...f.frame, a: f.anchor, page: f.page || 0 }));
  for (const r of rects) {
    assert.ok(r.w > 0 && r.h > 0, `${r.name} is empty`);
    // Layer sprites (an eye, a shoe) sit away from the shared pivot, so check
    // the pivot's offset in pixels: it must stay within the original canvas.
    const ox = r.a.x * r.w; const oy = r.a.y * r.h;
    assert.ok(Number.isFinite(ox) && Number.isFinite(oy) && Math.abs(ox) < 160 && Math.abs(oy) < 160, `${r.name} pivot offset ${ox},${oy}`);
  }
  rects.sort((p, q) => p.page - q.page || p.y - q.y || p.x - q.x);
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length && rects[j].page === rects[i].page && rects[j].y < rects[i].y + rects[i].h; j++) {
      const a = rects[i]; const b = rects[j];
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.ok(!overlap, `${a.name} overlaps ${b.name}`);
    }
  }
});

test('wardrobe: every catalogue option has art in every facing and pose', async () => {
  const A = await import('../js/avatar.js');
  const missing = [];
  for (const dir of ['down', 'right', 'up', 'left']) {
    for (const pose of ['idle0', 'walk0', 'walk2', 'sit0']) {
      const need = (n) => { if (!frames[`char/${dir}/${pose}/${n}`]) missing.push(`${dir}/${pose}/${n}`); };
      for (const t of A.TOP_STYLES) need(`top_${t.outfit}`);
      need('top_swimsuit');
      for (const b of A.BOTTOM_STYLES) need(`bottom_${b.id}`);
      for (const sh of A.SHOE_STYLES) need(`shoes_${sh.id}`);
      for (const e of A.EAR_STYLES) if (e.id !== 'hidden') need(`ears_${e.id}`);
      for (const a of A.ACCESSORY_STYLES) if (!['none', 'glasses', 'sunglasses'].includes(a.id)) need(`acc_${a.id}`);
    }
  }
  assert.deepEqual(missing, []);
  // fixed-colour trims: gold buttons, tie, glasses lenses
  assert.ok(frames['char/down/idle0/top_bellhop_trim']);
  assert.ok(frames['char/down/idle0/top_suit_trim']);
  // glasses are drawn on the face grid
  for (const p of ['glasses_frame', 'glasses_clear', 'glasses_dark']) assert.ok(frames[`face/down/stand/${p}`], p);
});

test('wardrobe: every face option maps to existing face parts', async () => {
  const A = await import('../js/avatar.js');
  for (const shape of A.EYE_SHAPES) for (const brow of A.BROW_STYLES) for (const m of A.MOUTH_PRESETS) {
    const f = faceFor({ eyeShape: shape.id, browStyle: brow.id, mouth: m.mouth, freckles: true });
    for (const part of [`eyeL_${f.eyeL}`, `eyeR_${f.eyeR}`, `brows_${f.brows}`, `mouth_${f.mouth}`, 'freckles']) {
      assert.ok(frames[`face/down/stand/${part}`], `missing face part ${part} for ${shape.id}/${brow.id}/${m.id}`);
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

// ---------- poses ----------
import { poseFor, LIE_SURFACE } from '../js/poses.js';
import { POSES } from '../art/sprites/character.js';

test('poses: activities, lying, swimming and emotes pick the right pose', () => {
  assert.equal(poseFor({ walking: true }, 0).pose, 'walk0');
  assert.deepEqual(poseFor({ action: 'swim' }, 0), { pose: 'swim0', face: 'swim' });
  assert.equal(poseFor({ action: 'swim', walking: true }, 0).face, 'swim', 'moving through water is swimming, not walking');
  assert.deepEqual(poseFor({ lying: true, sitting: 'bed1', action: 'lie' }, 0), { pose: 'lie0', face: 'lie' });
  assert.equal(poseFor({ action: 'treadmill' }, 0).pose, 'run0');
  assert.equal(poseFor({ action: 'exercise_bike', sitting: 'b' }, 0).face, 'sit');
  assert.equal(poseFor({ action: 'rowing', sitting: 'r' }, 700).pose, 'row1');
  assert.equal(poseFor({ action: 'piano', sitting: 'p' }, 0).pose, 'play0');
  assert.deepEqual(poseFor({ action: 'eat', sitting: 'c' }, 0), { pose: 'eatsit0', face: 'sit' });
  assert.deepEqual(poseFor({ action: 'eat' }, 0), { pose: 'eat0', face: 'stand' });
  assert.equal(poseFor({ action: 'use' }, 0).pose, 'use0');
  assert.equal(poseFor({ action: 'arcade_brick_bash' }, 0).pose, 'use0');
  assert.equal(poseFor({ emote: 'wave' }, 0).pose, 'wave0');
  assert.equal(poseFor({ emote: 'dance' }, 220 * 3).pose, 'dance3');
  assert.equal(poseFor({ emote: 'laugh' }, 0).pose, 'idle0'); // laughing is a face, not a gesture
  assert.equal(poseFor({ emote: 'wave', sitting: 's' }, 0).pose, 'sit0'); // seated people stay seated
  assert.equal(poseFor({}, 0).pose, 'idle0');
  assert.ok(LIE_SURFACE.suite_bed > LIE_SURFACE.yoga_mat);
});

test('poses: every pose the renderer can pick exists in the atlas for every facing', () => {
  const entities = [
    { walking: true }, { action: 'swim' }, { lying: true }, { action: 'treadmill' },
    { action: 'exercise_bike', sitting: 'x' }, { action: 'rowing', sitting: 'x' }, { action: 'piano', sitting: 'x' },
    { action: 'eat', sitting: 'x' }, { action: 'eat' }, { sitting: 'x' }, { action: 'use' }, {},
    ...['wave', 'clap', 'cheer', 'dance', 'thumbsup', 'heart', 'laugh', 'sleep'].map((emote) => ({ emote })),
  ];
  for (const e of entities) for (let t = 0; t < 3000; t += 55) {
    const { pose, face } = poseFor(e, t);
    assert.ok(POSES[pose], `unknown pose ${pose}`);
    for (const dir of ['down', 'right', 'up', 'left']) {
      assert.ok(frames[`char/${dir}/${pose}/skin`], `missing char/${dir}/${pose}/skin`);
      assert.ok(frames[`char/${dir}/${pose}/top_tee`], `missing char/${dir}/${pose}/top_tee`);
    }
    // faces show on the viewer-facing sides, and from every side when lying
    const faceDirs = face === 'lie' ? ['down', 'right', 'up', 'left'] : ['down', 'right'];
    for (const dir of faceDirs) assert.ok(frames[`face/${dir}/${face}/mouth_smile`], `missing face/${dir}/${face}`);
  }
});
