// PixiJS 8 room renderer (retained scene graph).
//
// Step 1 of the Pixi rebuild: every object is a greybox (flat-shaded iso box /
// capsule avatar) so the camera, depth sorting, hit testing and input can be
// proven before the hand-made art lands. renderRoom(opts) takes the same
// options main.js used to pass to the old canvas renderer.

import { Application, Assets, Container, Graphics, Sprite, Text, TextStyle, TextureStyle } from 'pixi.js';
import { TILE, getCatalogueItem } from '../data.js';
import {
  TILE_W, TILE_H, WALL_H, tileToScreen, worldToScreen, computeOrigin,
  dayNight, multiplyTint, combineTints,
} from '../iso.js';
import { buildCity, createSky } from './city.js';
import { sortDrawables, furnitureBox, entityBox } from '../depthSort.js';
import { LOOKS } from '../looks.js';
import { faceFor, IRIS_SHAPES } from '../faces.js';
import { validateAvatarLook, DEFAULT_PLAYER_LOOK } from '../avatar.js';

TextureStyle.defaultOptions.scaleMode = 'nearest';

let app = null;
const layers = {};
const furnitureNodes = new Map(); // instanceId -> { node, back?, front?, key }
const entityNodes = new Map(); // entity id -> { node, key }
const labelNodes = new Map(); // entity id -> { tag, bubble }
let floorKey = '';
let tex = {}; // atlas textures by frame name
let poolRec = null; // { key, node, cells: [{water, sprite}] }
let city = null; // { key, node, update }
let sky = null;
const glowNodes = new Map(); // instanceId -> glow sprite
const NIGHT_TINT = 0x5b6bb0;

const HAIR_STYLE_IDS = new Set(['classic', 'bob', 'long', 'ponytail', 'spiky', 'curls', 'bald']);

// Looks come from saves, NPC presets and multiplayer peers; normalise once per
// look object so every optional field has a known value.
const lookCache = new WeakMap();
function normalLook(look) {
  if (!look || typeof look !== 'object') return DEFAULT_PLAYER_LOOK;
  let n = lookCache.get(look);
  if (!n) {
    n = validateAvatarLook(look) || DEFAULT_PLAYER_LOOK;
    // NPC presets may carry a hand-picked brow colour; keep it
    lookCache.set(look, n);
  }
  return n;
}

function hairFrame(facing, pose, look) {
  let style = look?.hairStyle === 'short' ? 'classic' : look?.hairStyle;
  if (!HAIR_STYLE_IDS.has(style)) style = 'classic';
  return `char/${facing}/${pose}/hair_${style}`; // bald has no frame -> hidden
}
const WATER_FRAMES = 8;

// Floor art per room floor material.
const FLOOR_ART = {
  lobby_marble: ['floor/marble_a', 'floor/marble_b'],
  dark_parquet: ['floor/parquet'],
  gym_rubber: ['floor/rubber'],
  spa_stone: ['floor/spa_stone'],
  arcade_neon: ['floor/arcade'],
  library_carpet: ['floor/carpet'],
  grass: ['floor/grass'],
  decking: ['floor/decking'],
};
// Items flagged flat (walkable) that are tall structures drawn over avatars.
const OVERHEAD_ART = new Set(['pergola']);

export const entityScreenBounds = new Map();

export function hitTestNpc(screenX, screenY) {
  let best = null;
  for (const b of entityScreenBounds.values()) {
    if (b.id === 'player') continue;
    if (screenX >= b.x0 && screenX <= b.x1 && screenY >= b.y0 && screenY <= b.y1) {
      if (!best || b.y1 > best.y1) best = b;
    }
  }
  return best ? best.entity : null;
}

export function getPixiApp() {
  return app;
}

/**
 * Create the Pixi application and insert its canvas into `host` just before
 * `beforeEl` (the 2D overlay canvas that keeps receiving pointer input).
 */
export async function initRenderer(host, beforeEl) {
  app = new Application();
  await app.init({
    resizeTo: host,
    backgroundAlpha: 0,
    antialias: false,
    roundPixels: true,
    resolution: Math.min(2, window.devicePixelRatio || 1),
    autoDensity: true,
  });
  app.canvas.id = 'pixiCanvas';
  host.insertBefore(app.canvas, beforeEl);
  app.ticker.stop(); // main.js drives rendering from its own rAF loop
  const sheet = await Assets.load('assets/atlas.json');
  tex = sheet.textures;
  Object.assign(window, { app });

  sky = createSky();
  layers.world = new Container();
  layers.city = new Container();
  layers.floor = new Container({ isRenderGroup: true });
  layers.floorDecor = new Container();
  layers.overlay = new Graphics();
  layers.walls = new Container();
  layers.sorted = new Container();
  layers.overhead = new Container();
  layers.frontRails = new Container();
  layers.glow = new Container();
  layers.world.addChild(
    layers.city, layers.floor, layers.floorDecor, layers.overlay, layers.walls,
    layers.sorted, layers.frontRails, layers.overhead, layers.glow,
  );
  layers.labels = new Container();
  app.stage.addChild(sky.node, layers.world, layers.labels);
  return app;
}

// ---------- colour helpers ----------

function hexNum(hex, fallback = 0x888888) {
  if (typeof hex !== 'string') return fallback;
  const n = parseInt(hex.replace('#', ''), 16);
  return Number.isFinite(n) ? n : fallback;
}

function shade(color, k) {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  const f = (c) => Math.max(0, Math.min(255, Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k))));
  return (f(r) << 16) | (f(g) << 8) | f(b);
}

const CATEGORY_COLORS = {
  seating: 0xc0506a, tables: 0xa0703c, lighting: 0xf2c94c, plants: 0x4caf50, rugs: 0xb03a48,
  decor: 0x8e7cc3, electronics: 0x4a90d9, outdoor_pool: 0x3bb4c8, gym: 0x607d8b, dining: 0xb5835a,
  kitchen: 0x9e9e9e, arcade: 0x7e57c2, bedroom: 0x5c6bc0,
};

function itemHeight(item) {
  if (item.flat && !item.overhead) return 2;
  if (item.overhead) return 18;
  switch (item.category) {
    case 'seating': return 18;
    case 'rugs': return 2;
    case 'lighting': return 44;
    case 'plants': return 34;
    case 'tables': case 'dining': return 20;
    default: return 30;
  }
}

// ---------- greybox drawing ----------

// Iso box whose ground footprint covers tiles [x, x+w) x [y, y+h), drawn in
// coordinates local to the footprint's south (front) corner.
function drawIsoBox(g, w, h, height, color, lift = 0) {
  const hw = TILE_W / 2;
  const hh = TILE_H / 2;
  // ground corners relative to the north corner of the footprint (0,0)
  const N = [0, 0];
  const E = [w * hw, w * hh];
  const S = [(w - h) * hw, (w + h) * hh];
  const W = [-h * hw, h * hh];
  const up = (p) => [p[0], p[1] - height - lift];
  const dn = (p) => [p[0], p[1] - lift];
  const top = [...up(N), ...up(E), ...up(S), ...up(W)];
  const left = [...up(W), ...up(S), ...dn(S), ...dn(W)];
  const right = [...up(S), ...up(E), ...dn(E), ...dn(S)];
  const outline = shade(color, -0.55);
  g.poly(left).fill(shade(color, -0.25)).stroke({ color: outline, width: 1, alignment: 1 });
  g.poly(right).fill(shade(color, -0.42)).stroke({ color: outline, width: 1, alignment: 1 });
  g.poly(top).fill(color).stroke({ color: outline, width: 1, alignment: 1 });
}

function diamond(g, sx, sy, color, alpha) {
  const hw = TILE_W / 2;
  const hh = TILE_H / 2;
  g.poly([sx, sy - hh, sx + hw, sy, sx, sy + hh, sx - hw, sy]).fill({ color, alpha });
}

function buildFloor(room, originX, originY, lightsOn) {
  layers.floor.removeChildren().forEach((c) => c.destroy());
  layers.walls.removeChildren().forEach((c) => c.destroy());
  const base = hexNum(room.floorColor || (room.id === 'rooftop' ? '#d8b98c' : '#e9c48f'));
  const dim = lightsOn ? 0 : -0.5;
  const dimTint = lightsOn ? 0xffffff : 0x7a7090;
  const art = FLOOR_ART[room.floorMaterial || (room.id === 'rooftop' ? 'decking' : '')];
  const g = new Graphics();
  const hw = TILE_W / 2;
  const hh = TILE_H / 2;
  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      const t = room.grid[y][x];
      if (t === TILE.VOID || t === TILE.WALL || t === TILE.WINDOW) continue;
      if (t === TILE.DOOR && (x === 0 || y === 0)) continue;
      const { sx, sy } = tileToScreen(x, y, originX, originY);
      if (art) {
        const sp = new Sprite(tex[art[(x + y) % art.length]]);
        sp.anchor.copyFrom(sp.texture.defaultAnchor);
        sp.position.set(sx, sy);
        sp.tint = dimTint;
        layers.floor.addChild(sp);
      } else {
        const c = shade(base, ((x + y) % 2 ? -0.06 : 0) + dim);
        g.poly([sx, sy - hh, sx + hw, sy, sx, sy + hh, sx - hw, sy]).fill(c);
      }
    }
  }
  layers.floor.addChildAt(g, 0);

  // Back walls stand on the boundary between grid row/column 0 and 1:
  // north wall along y = 0.5, west wall along x = 0.5.
  const kindOf = (t) => (t === TILE.WINDOW ? 'window' : t === TILE.DOOR ? 'door' : 'plain');
  const addWall = (name, x, y) => {
    const sp = new Sprite(tex[name]);
    sp.anchor.copyFrom(sp.texture.defaultAnchor);
    const { sx, sy } = tileToScreen(x, y, originX, originY);
    sp.position.set(sx, sy);
    sp.tint = dimTint;
    layers.walls.addChild(sp);
  };
  layers.frontRails.removeChildren().forEach((c) => c.destroy());
  // Open-air floors get glass railings on every edge instead of walls.
  const open = Boolean(room.openEdges);
  for (let x = 1; x < room.width; x++) {
    const t = room.grid[0][x];
    if (t === TILE.VOID || room.grid[1]?.[x] === TILE.VOID) continue;
    addWall(open && t !== TILE.DOOR ? 'wall/rail_north' : `wall/north_${kindOf(t)}`, x - 0.5, 0.5);
  }
  for (let y = 1; y < room.height; y++) {
    const t = room.grid[y][0];
    if (t === TILE.VOID || room.grid[y][1] === TILE.VOID) continue;
    addWall(open && t !== TILE.DOOR ? 'wall/rail_west' : `wall/west_${kindOf(t)}`, 0.5, y - 0.5);
  }
  if (open) {
    const front = (name, x, y) => {
      const sp = new Sprite(tex[name]);
      sp.anchor.copyFrom(sp.texture.defaultAnchor);
      const { sx, sy } = tileToScreen(x, y, originX, originY);
      sp.position.set(sx, sy);
      layers.frontRails.addChild(sp);
    };
    const S = room.height - 1;
    const E = room.width - 1;
    for (let x = 1; x < room.width; x++) if (room.grid[S][x] !== TILE.VOID) front('wall/rail_north', x - 0.5, S + 0.5);
    for (let y = 1; y < room.height; y++) if (room.grid[y][E] !== TILE.VOID) front('wall/rail_west', E + 0.5, y - 0.5);
  }
}

function furnitureKey(f, lightsOn) {
  return `${f.itemId}|${f.x},${f.y}|${f.rot || 0}|${f.footprint.w}x${f.footprint.h}|${lightsOn ? 1 : 0}`;
}

function furnitureTexture(itemId, rot = 0) {
  const r4 = ((rot % 4) + 4) % 4;
  const t = tex[`furn/${itemId}/${r4 & 2}`];
  return t ? { texture: t, mirrored: (r4 & 1) === 1 } : null;
}

function makeFurnitureNode(f, item, originX, originY, lightsOn) {
  // Position at the footprint's north corner.
  const { sx, sy } = tileToScreen(f.x - 0.5, f.y - 0.5, originX, originY);
  const art = furnitureTexture(f.itemId, f.rot);
  if (art) {
    const sp = new Sprite(art.texture);
    sp.anchor.copyFrom(art.texture.defaultAnchor);
    sp.position.set(sx, sy);
    if (art.mirrored) sp.scale.x = -1;
    if (item.lightSource && !lightsOn) sp.tint = 0x8a7f9a;
    return sp;
  }
  const node = new Graphics();
  node.position.set(sx, sy);
  let color = CATEGORY_COLORS[item.category] ?? 0x9a8c7a;
  if (item.lightSource && !lightsOn) color = shade(color, -0.45);
  if (item.flat && !item.overhead) {
    const { w, h } = f.footprint;
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;
    const water = item.id === 'pool_water';
    node.poly([0, 0, w * hw, w * hh, (w - h) * hw, (w + h) * hh, -h * hw, h * hh])
      .fill({ color: water ? 0x2fa8d8 : color, alpha: water ? 0.85 : 0.9 });
  } else {
    drawIsoBox(node, f.footprint.w, f.footprint.h, itemHeight(item), color, item.overhead ? 70 : 0);
  }
  return node;
}

function entityColors(e) {
  const look = e.look || LOOKS[e.spriteKey] || LOOKS.player || {};
  return {
    skin: hexNum(look.skin, 0xf0c49a),
    shirt: hexNum(look.shirt, 0x4da3ff),
    pants: hexNum(look.pants, 0x2c3e63),
    hair: hexNum(look.hair, 0x5a3826),
  };
}

const ENTITY_H = 46;

// Grey-ramp layers are authored with 0xde as the base tone; scale the tint so
// the base lands exactly on the wardrobe colour.
function tintFor(hexColor, fallback) {
  const c = hexNum(hexColor, fallback);
  const k = 255 / 0xde;
  const ch = (v) => Math.min(255, Math.round(v * k));
  return (ch((c >> 16) & 255) << 16) | (ch((c >> 8) & 255) << 8) | ch(c & 255);
}

// Every sprite that makes up one character, back to front:
// [frame name, tint]. Shared by the room renderer and the previews.
function characterLayers(rawLook, facing, pose, faceState = {}, outfitOverride = null) {
  const look = normalLook(rawLook);
  const at = (name) => `char/${facing}/${pose}/${name}`;
  const layers = [];
  const swim = outfitOverride === 'swimsuit';
  const outfit = swim ? 'swimsuit' : look.outfit;
  const bottom = swim ? 'shorts' : look.bottom;
  const skin = tintFor(look.skin, 0xf0c49a);
  layers.push([at('skin'), skin]);
  if (look.ears !== 'hidden') layers.push([at(`ears_${look.ears}`), skin]);
  if (outfit !== 'dress') layers.push([at(`bottom_${bottom}`), tintFor(look.pants, 0x2c3e63)]);
  if (!swim) layers.push([at(`shoes_${look.shoeStyle}`), tintFor(look.shoe, 0xf4f4f4)]);
  layers.push([at(`top_${outfit}`), tintFor(look.shirt, 0x4da3ff)]);
  layers.push([at(`top_${outfit}_trim`), 0xffffff]);
  // Tall styles tuck under a hat instead of poking through its crown.
  const hatted = look.accessory === 'cap' || look.accessory === 'beanie';
  const hairLook = hatted && (look.hairStyle === 'spiky' || look.hairStyle === 'curls') ? { ...look, hairStyle: 'classic' } : look;
  layers.push([hairFrame(facing, pose, hairLook), tintFor(look.hair, 0x5a3826)]);
  if (facing === 'down' || facing === 'right') {
    const kind = pose === 'sit0' ? 'sit' : 'stand';
    const f = faceFor(look, faceState);
    const face = (part) => `face/${facing}/${kind}/${part}`;
    const iris = tintFor(look.eye, 0x2b2230);
    if (f.blush) layers.push([face('blush'), 0xffffff]);
    if (f.freckles) layers.push([face('freckles'), 0xffffff]);
    layers.push([face(`eyeL_${f.eyeL}`), 0xffffff]);
    if (IRIS_SHAPES.has(f.eyeL)) layers.push([face(`irisL_${f.eyeL}`), iris]);
    layers.push([face(`eyeR_${f.eyeR}`), 0xffffff]);
    if (IRIS_SHAPES.has(f.eyeR)) layers.push([face(`irisR_${f.eyeR}`), iris]);
    if (f.lashes) layers.push([face('lashes'), 0xffffff]);
    layers.push([face(`brows_${f.brows}`), tintFor(rawLook?.brow || look.brow || look.hair, 0x4a2f20)]);
    layers.push([face(`mouth_${f.mouth}`), 0xffffff]);
    if (look.accessory === 'glasses' || look.accessory === 'sunglasses') {
      layers.push([face(look.accessory === 'glasses' ? 'glasses_clear' : 'glasses_dark'), 0xffffff]);
      layers.push([face('glasses_frame'), tintFor(look.accessoryColor, 0x2a2030)]);
    }
  }
  if (look.accessory !== 'none' && look.accessory !== 'glasses' && look.accessory !== 'sunglasses') {
    layers.push([at(`acc_${look.accessory}`), tintFor(look.accessoryColor, 0x2a2030)]);
    layers.push([at(`acc_${look.accessory}_trim`), 0xffffff]);
  }
  return layers;
}

function characterPose(e, now) {
  if (e.walking) return `walk${Math.floor(now / 140) % 4}`;
  if (e.sitting) return 'sit0';
  return 'idle0';
}

function makeEntityNode() {
  const node = new Container();
  const shadow = new Graphics().ellipse(0, 0, 9, 4).fill({ color: 0x1e1428, alpha: 0.25 });
  node.addChild(shadow);
  node.body = new Container();
  node.addChild(node.body);
  return node;
}

function updateEntityNode(node, e, now) {
  const look = e.look || LOOKS[e.spriteKey] || LOOKS.player || {};
  // Block characters are rendered natively for all four facings.
  const facing = ['down', 'right', 'up', 'left'].includes(e.dir) ? e.dir : 'down';
  const pose = characterPose(e, now);
  const layers = characterLayers(look, facing, pose, { emote: e.emote || null, blink: Boolean(e.blink) }, e.outfit);
  const kids = node.body.children;
  while (kids.length < layers.length) node.body.addChild(new Sprite());
  for (let i = 0; i < kids.length; i++) {
    const sp = kids[i];
    const t = i < layers.length ? tex[layers[i][0]] : null;
    sp.visible = Boolean(t);
    if (!t) continue;
    if (sp.texture !== t) {
      sp.texture = t;
      sp.anchor.copyFrom(t.defaultAnchor);
    }
    sp.tint = layers[i][1];
  }
  node.body.y = e.sitting ? -9 : 0; // up onto the seat cushion
}

// ---------- pool water ----------

function buildPool(items, originX, originY) {
  const cells = new Set();
  for (const f of items) {
    for (let dy = 0; dy < f.footprint.h; dy++) {
      for (let dx = 0; dx < f.footprint.w; dx++) cells.add(`${f.x + dx},${f.y + dy}`);
    }
  }
  const key = [...cells].sort().join(';') + `|${originX},${originY}`;
  if (poolRec && poolRec.key === key) return poolRec;
  if (poolRec) poolRec.node.destroy({ children: true });
  const node = new Container();
  const water = [];
  const rims = new Container();
  for (const c of cells) {
    const [x, y] = c.split(',').map(Number);
    const { sx, sy } = tileToScreen(x, y, originX, originY);
    const w = new Sprite(tex['water/frame0_00']);
    w.anchor.copyFrom(w.texture.defaultAnchor);
    w.position.set(sx, sy);
    w.parity = `${x & 1}${y & 1}`;
    node.addChild(w);
    water.push(w);
    const edges = { n: `${x},${y - 1}`, w: `${x - 1},${y}`, s: `${x},${y + 1}`, e: `${x + 1},${y}` };
    for (const [edge, n] of Object.entries(edges)) {
      if (cells.has(n)) continue;
      const r = new Sprite(tex[`water/rim_${edge}`]);
      r.anchor.copyFrom(r.texture.defaultAnchor);
      r.position.set(sx, sy);
      rims.addChild(r);
    }
  }
  node.addChild(rims);
  poolRec = { key, node, water };
  return poolRec;
}

// ---------- labels ----------

const tagStyle = new TextStyle({ fontFamily: 'system-ui, sans-serif', fontSize: 11, fontWeight: '600', fill: 0xffffff });
const bubbleStyle = new TextStyle({ fontFamily: 'system-ui, sans-serif', fontSize: 12, fill: 0x2b2230, wordWrap: true, wordWrapWidth: 220 });

function makeTag(name) {
  const c = new Container();
  const t = new Text({ text: name, style: tagStyle, resolution: 2 });
  const bg = new Graphics().roundRect(-t.width / 2 - 5, 0, t.width + 10, t.height + 2, 4).fill({ color: 0x1a1430, alpha: 0.72 });
  t.position.set(-t.width / 2, 1);
  c.addChild(bg, t);
  c.label = name;
  return c;
}

function makeBubble(text) {
  const c = new Container();
  const t = new Text({ text, style: bubbleStyle, resolution: 2 });
  const w = t.width + 16;
  const h = t.height + 10;
  const bg = new Graphics()
    .roundRect(-w / 2, -h - 8, w, h, 6).fill(0xffffff).stroke({ color: 0x2b2230, width: 1.5 })
    .poly([-6, -8.5, 6, -8.5, 0, 0]).fill(0xffffff);
  t.position.set(-t.width / 2, -h - 3);
  c.addChild(bg, t);
  c.label = text;
  return c;
}

// ---------- main entry ----------

export function renderRoom(opts) {
  const {
    room, placedFurniture, entities, hoverTile, ghost, walkTarget,
    width, height, now = 0, camera = null, lightsOn = true,
  } = opts;
  if (!app) return;
  entityScreenBounds.clear();
  const zoom = camera?.zoom ?? 1;
  const panX = camera?.panX ?? 0;
  const panY = camera?.panY ?? 0;
  // world -> screen: translate(w/2 + pan) * scale(zoom) * translate(-w/2)
  layers.world.scale.set(zoom);
  // Snap the camera to whole screen pixels so tiles never land on half pixels.
  layers.world.position.set(
    Math.round(width / 2 + panX - (width / 2) * zoom),
    Math.round(height / 2 + panY - (height / 2) * zoom),
  );

  const { originX, originY } = computeOrigin(room, width, height);
  const fk = `${room.id}|${originX},${originY}|${lightsOn ? 1 : 0}`;
  if (fk !== floorKey) {
    floorKey = fk;
    buildFloor(room, originX, originY, lightsOn);
    for (const rec of furnitureNodes.values()) { rec.node.destroy(); rec.floorNode?.destroy(); }
    furnitureNodes.clear();
  }

  // --- sky, city and lighting ---
  const phase = opts.phase ?? 0.5;
  sky.update(width, height, phase, now, panX, Boolean(opts.lowDetail));
  const cityKey = `${room.id}|${originX},${originY}`;
  if (!city || city.key !== cityKey) {
    if (city) city.node.destroy({ children: true });
    city = { key: cityKey, ...buildCity(room, originX, originY, tex) };
    layers.city.addChild(city.node);
  }
  city.update(now, phase, Boolean(opts.lowDetail));
  const { night } = dayNight(phase);
  const amb = room.ambientLighting;
  const cityTint = multiplyTint(NIGHT_TINT, 0.5 * night);
  const roomTint = combineTints(
    multiplyTint(NIGHT_TINT, 0.42 * night),
    amb ? multiplyTint(hexNum(amb.tint), amb.darkness || 0.3) : 0xffffff,
  );
  layers.city.tint = cityTint;
  for (const l of [layers.floor, layers.floorDecor, layers.walls, layers.sorted, layers.frontRails, layers.overhead]) l.tint = roomTint;
  const glowStrength = Math.min(1, Math.max(night * 1.1, amb?.warmGlow ? (amb.darkness || 0.3) * 2.2 : 0));
  updateGlows(placedFurniture, originX, originY, lightsOn, glowStrength);

  // --- overlays (hover, ghost, walk target) ---
  const ov = layers.overlay;
  ov.clear();
  if (walkTarget) {
    const { sx, sy } = tileToScreen(walkTarget.x, walkTarget.y, originX, originY);
    const age = Math.min(1, (now - (walkTarget.bornAt || now)) / 420);
    diamond(ov, sx, sy, walkTarget.blocked ? 0xff6b6b : 0xfff6c9, 0.5 * (1 - age) + 0.15);
  }
  if (hoverTile) {
    const { sx, sy } = tileToScreen(hoverTile.x, hoverTile.y, originX, originY);
    diamond(ov, sx, sy, 0xfff6c9, 0.35);
  }
  if (ghost) {
    for (const c of ghost.cells) {
      const { sx, sy } = tileToScreen(c.x, c.y, originX, originY);
      diamond(ov, sx, sy, ghost.valid ? 0x7cfc9a : 0xff6b6b, 0.45);
    }
  }

  // --- furniture nodes (create/update/remove) ---
  const seen = new Set();
  const flats = [];
  const overheads = [];
  const solids = [];
  const poolItems = [];
  for (const f of placedFurniture) {
    const item = getCatalogueItem(f.itemId);
    if (!item) continue;
    if (f.itemId === 'pool_water') { poolItems.push(f); continue; }
    const id = f.instanceId || `${f.itemId}@${f.x},${f.y}`;
    seen.add(id);
    const key = furnitureKey(f, lightsOn);
    let rec = furnitureNodes.get(id);
    if (!rec || rec.key !== key) {
      if (rec) { rec.node.destroy(); rec.floorNode?.destroy(); }
      rec = { node: makeFurnitureNode(f, item, originX, originY, lightsOn), key };
      furnitureNodes.set(id, rec);
    }
    // Overhead first: the chandelier is flagged flat+overhead and used to be
    // drawn on the floor because the flat check won.
    if (item.overhead || OVERHEAD_ART.has(f.itemId)) {
      overheads.push(rec.node);
      // optional floor part (e.g. the chandelier's medallion) drawn on the floor
      const floorTex = tex[`furn/${f.itemId}_floor/0`];
      if (floorTex) {
        if (!rec.floorNode) {
          rec.floorNode = new Sprite(floorTex);
          rec.floorNode.anchor.copyFrom(floorTex.defaultAnchor);
          rec.floorNode.position.copyFrom(rec.node.position);
        }
        flats.push(rec.floorNode);
      }
    }
    else if (item.flat) flats.push(rec.node);
    else solids.push({ f, item, rec, id });
  }
  for (const [id, rec] of furnitureNodes) {
    if (!seen.has(id)) { rec.node.destroy(); rec.floorNode?.destroy(); furnitureNodes.delete(id); }
  }
  if (poolItems.length) {
    const pool = buildPool(poolItems, originX, originY);
    const f = Math.floor(now / 160) % WATER_FRAMES;
    for (const w of pool.water) w.texture = tex[`water/frame${f}_${w.parity}`];
    flats.unshift(pool.node);
  } else if (poolRec) {
    poolRec.node.destroy({ children: true });
    poolRec = null;
  }
  reparent(layers.floorDecor, flats);
  reparent(layers.overhead, overheads);

  // --- entities ---
  const seenE = new Set();
  const drawables = [];
  const seatOf = new Map(); // seat furniture id -> entity id
  for (const e of entities) {
    seenE.add(e.id);
    let rec = entityNodes.get(e.id);
    if (!rec) {
      rec = { node: makeEntityNode() };
      entityNodes.set(e.id, rec);
    }
    updateEntityNode(rec.node, e, now);
    const { sx, sy } = tileToScreen(e.x, e.y, originX, originY);
    rec.node.position.set(Math.round(sx), Math.round(sy));
    const d = { id: `e:${e.id}`, node: rec.node, box: entityBox(e.x, e.y), entity: e };
    if (e.sitting && e.sittingInstanceId) seatOf.set(e.sittingInstanceId, d);
    drawables.push(d);

    // screen-space bounds for click hit-testing and labels
    const top = worldToScreen(sx, sy - ENTITY_H, camera, width, height);
    const foot = worldToScreen(sx, sy, camera, width, height);
    const hw = 12 * zoom;
    entityScreenBounds.set(e.id, { id: e.id, x0: top.sx - hw, y0: top.sy, x1: top.sx + hw, y1: foot.sy, entity: e });
  }
  for (const [id, rec] of entityNodes) {
    if (!seenE.has(id)) { rec.node.destroy(); entityNodes.delete(id); }
  }

  for (const s of solids) {
    const box = furnitureBox(s.f.x, s.f.y, s.f.footprint.w, s.f.footprint.h);
    const sitter = seatOf.get(s.id);
    if (sitter) {
      // Seat drawn before its occupant; the occupant is pinned in front of it.
      sitter.bias = 0.1;
      drawables.push({ id: `f:${s.id}`, node: s.rec.node, box, bias: -0.05, before: [sitter.id] });
    } else {
      drawables.push({ id: `f:${s.id}`, node: s.rec.node, box });
    }
  }

  const sorted = sortDrawables(drawables);
  reparent(layers.sorted, sorted.map((d) => d.node));

  // --- labels in screen space ---
  const seenL = new Set();
  for (const e of entities) {
    const b = entityScreenBounds.get(e.id);
    if (!b) continue;
    let rec = labelNodes.get(e.id);
    if (!rec) { rec = { tag: null, bubble: null }; labelNodes.set(e.id, rec); }
    seenL.add(e.id);
    if (e.nameTag) {
      if (!rec.tag || rec.tag.label !== e.nameTag) {
        rec.tag?.destroy({ children: true });
        rec.tag = makeTag(e.nameTag);
        layers.labels.addChild(rec.tag);
      }
      rec.tag.position.set(Math.round((b.x0 + b.x1) / 2), Math.round(b.y1 + 4));
    } else if (rec.tag) { rec.tag.destroy({ children: true }); rec.tag = null; }
    if (e.bubbleText) {
      if (!rec.bubble || rec.bubble.label !== e.bubbleText) {
        rec.bubble?.destroy({ children: true });
        rec.bubble = makeBubble(e.bubbleText);
        layers.labels.addChild(rec.bubble);
      }
      rec.bubble.position.set(Math.round((b.x0 + b.x1) / 2), Math.round(b.y0 - 4));
    } else if (rec.bubble) { rec.bubble.destroy({ children: true }); rec.bubble = null; }
  }
  for (const [id, rec] of labelNodes) {
    if (seenL.has(id)) continue;
    rec.tag?.destroy({ children: true });
    rec.bubble?.destroy({ children: true });
    labelNodes.delete(id);
  }
  // keep bubbles from stacking on top of each other
  const bubbles = [...labelNodes.values()].map((r) => r.bubble).filter(Boolean).sort((a, b) => b.y - a.y);
  const placed = [];
  for (const bub of bubbles) {
    for (const p of placed) {
      if (Math.abs(p.x - bub.x) < 155 && Math.abs(p.y - bub.y) < 48) bub.y = p.y - 50;
    }
    placed.push(bub);
  }

  app.render();
}

function reparent(container, nodes) {
  // Re-order children to match `nodes` without destroying them.
  const keep = new Set(nodes);
  for (let i = container.children.length - 1; i >= 0; i--) {
    const c = container.children[i];
    if (!keep.has(c)) container.removeChildAt(i);
  }
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.parent !== container) container.addChildAt(n, i);
    else if (container.children[i] !== n) container.setChildIndex(n, i);
  }
}

// ---------- item icons (shop / inventory) ----------

const iconCache = new Map();

/**
 * Data URL of an item's rotation-0 sprite fitted into a size x size square,
 * scaled by a whole number (or 1/2) so the pixels stay crisp.
 */
export function getItemIconDataUrl(itemId, size = 52, dpr = 1) {
  const key = `${itemId}:${size}@${dpr}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const t = tex[`furn/${itemId}/0`];
  const res = t?.source?.resource;
  if (!t || !res) return '';
  const px = Math.max(1, Math.round(size * dpr));
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const { x, y, width: w, height: h } = t.frame;
  const fit = Math.min((px - 4) / w, (px - 4) / h);
  const scale = fit >= 1 ? Math.floor(fit) : fit >= 0.5 ? 0.5 : fit;
  const dw = Math.round(w * scale);
  const dh = Math.round(h * scale);
  ctx.drawImage(res, x, y, w, h, Math.round((px - dw) / 2), Math.round((px - dh) / 2), dw, dh);
  const url = canvas.toDataURL();
  iconCache.set(key, url);
  return url;
}

// ---------- light glows ----------

function updateGlows(placedFurniture, originX, originY, lightsOn, strength) {
  const seen = new Set();
  if (strength > 0.02 && tex['fx/glow']) {
    for (const f of placedFurniture) {
      const item = getCatalogueItem(f.itemId);
      const em = item?.emissive;
      if (!em) continue;
      if (item.lightSource && !lightsOn) continue;
      const id = f.instanceId || `${f.itemId}@${f.x},${f.y}`;
      seen.add(id);
      let sp = glowNodes.get(id);
      if (!sp) {
        sp = new Sprite(tex['fx/glow']);
        sp.anchor.set(0.5);
        sp.blendMode = 'add';
        layers.glow.addChild(sp);
        glowNodes.set(id, sp);
      }
      const { sx, sy } = tileToScreen(f.x + f.footprint.w / 2 - 0.5, f.y + f.footprint.h / 2 - 0.5, originX, originY);
      sp.position.set(Math.round(sx), Math.round(sy));
      sp.scale.set((em.radius || 60) / 48);
      sp.tint = hexNum(em.color, 0xffe29a);
      sp.alpha = Math.min(1, (em.intensity || 0.4) * strength * 1.6);
    }
  }
  for (const [id, sp] of glowNodes) {
    if (!seen.has(id)) { sp.destroy(); glowNodes.delete(id); }
  }
}

// ---------- character previews (wardrobe, salon) ----------

const PREVIEW_MAG = 3; // previews show the avatar 3x larger than in the room

/**
 * Composite the tinted character layers into a 2D canvas.
 * Returns { canvas } sized so that canvas.width / scale is the on-screen size
 * (callers divide by `scale`), with the art magnified PREVIEW_MAG times.
 */
export function renderCharacter(look, dir = 'down', pose = {}, makeCanvas = null, scale = 1) {
  const facing = ['down', 'right', 'up', 'left'].includes(dir) ? dir : 'down';
  const poseName = pose?.sit ? 'sit0' : pose?.stride ? 'walk0' : 'idle0';
  const l = look || LOOKS.player || {};
  const parts = [];
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const [frame, tint] of characterLayers(l, facing, poseName)) {
    const t = tex[frame];
    if (!t?.source?.resource) continue;
    const { width: w, height: h } = t.frame;
    const ax = Math.round(t.defaultAnchor.x * w);
    const ay = Math.round(t.defaultAnchor.y * h);
    parts.push({ t, tint, ax, ay, w, h });
    x0 = Math.min(x0, -ax); y0 = Math.min(y0, -ay); x1 = Math.max(x1, w - ax); y1 = Math.max(y1, h - ay);
  }
  if (!parts.length) return null;
  const W = x1 - x0; const H = y1 - y0;
  // compose at 1x, tinting each layer by per-pixel multiply
  const base = document.createElement('canvas');
  base.width = W; base.height = H;
  const bctx = base.getContext('2d');
  for (const p of parts) {
    const tmp = document.createElement('canvas');
    tmp.width = p.w; tmp.height = p.h;
    const tctx = tmp.getContext('2d');
    tctx.drawImage(p.t.source.resource, p.t.frame.x, p.t.frame.y, p.w, p.h, 0, 0, p.w, p.h);
    const { tint } = p;
    if (tint !== 0xffffff) {
      const img = tctx.getImageData(0, 0, p.w, p.h);
      const tr = (tint >> 16) & 255; const tg = (tint >> 8) & 255; const tb = tint & 255;
      for (let i = 0; i < img.data.length; i += 4) {
        img.data[i] = (img.data[i] * tr) / 255;
        img.data[i + 1] = (img.data[i + 1] * tg) / 255;
        img.data[i + 2] = (img.data[i + 2] * tb) / 255;
      }
      tctx.putImageData(img, 0, 0);
    }
    bctx.drawImage(tmp, -p.ax - x0, -p.ay - y0);
  }
  const k = PREVIEW_MAG * scale;
  const out = makeCanvas ? makeCanvas(Math.round(W * k), Math.round(H * k)) : document.createElement('canvas');
  out.width = Math.round(W * k);
  out.height = Math.round(H * k);
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = false;
  octx.drawImage(base, 0, 0, out.width, out.height);
  return { canvas: out, width: out.width, height: out.height };
}

// ---------- debug / smoke-test stats ----------

export function getRenderStats() {
  return {
    backend: app?.renderer?.name || null,
    cityObjects: city?.objectCount?.() ?? 0,
    cars: city?.carCount?.() ?? 0,
    glows: glowNodes.size,
    furniture: furnitureNodes.size,
    entities: entityNodes.size,
  };
}
