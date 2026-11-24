// PixiJS 8 room renderer (retained scene graph).
//
// Step 1 of the Pixi rebuild: every object is a greybox (flat-shaded iso box /
// capsule avatar) so the camera, depth sorting, hit testing and input can be
// proven before the hand-made art lands. renderRoom(opts) takes the same
// options main.js used to pass to the old canvas renderer.

import { Application, Container, Graphics, Text, TextStyle, TextureStyle } from 'pixi.js';
import { TILE, getCatalogueItem } from '../data.js';
import {
  TILE_W, TILE_H, WALL_H, tileToScreen, worldToScreen, computeOrigin,
} from '../iso.js';
import { sortDrawables, furnitureBox, entityBox } from '../depthSort.js';
import { LOOKS } from '../voxel.js';

TextureStyle.defaultOptions.scaleMode = 'nearest';

let app = null;
const layers = {};
const furnitureNodes = new Map(); // instanceId -> { node, back?, front?, key }
const entityNodes = new Map(); // entity id -> { node, key }
const labelNodes = new Map(); // entity id -> { tag, bubble }
let floorKey = '';

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
  Object.assign(window, { app });

  layers.world = new Container();
  layers.floor = new Container({ isRenderGroup: true });
  layers.floorDecor = new Container();
  layers.overlay = new Graphics();
  layers.walls = new Container();
  layers.sorted = new Container();
  layers.overhead = new Container();
  layers.world.addChild(layers.floor, layers.floorDecor, layers.overlay, layers.walls, layers.sorted, layers.overhead);
  layers.labels = new Container();
  app.stage.addChild(layers.world, layers.labels);
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
  const wall = hexNum(room.wallColor || (room.id === 'rooftop' ? '#6f9ec4' : '#e3a27a'));
  const dim = lightsOn ? 0 : -0.5;
  const g = new Graphics();
  const hw = TILE_W / 2;
  const hh = TILE_H / 2;
  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      const t = room.grid[y][x];
      if (t === TILE.VOID || t === TILE.WALL || t === TILE.WINDOW) continue;
      const { sx, sy } = tileToScreen(x, y, originX, originY);
      const c = shade(base, ((x + y) % 2 ? -0.06 : 0) + dim);
      g.poly([sx, sy - hh, sx + hw, sy, sx, sy + hh, sx - hw, sy]).fill(t === TILE.DOOR ? shade(c, -0.3) : c);
    }
  }
  layers.floor.addChild(g);

  // Back walls: north wall along y === 0, west wall along x === 0.
  const wg = new Graphics();
  const face = (pts, color) => wg.poly(pts).fill(color).stroke({ color: shade(color, -0.4), width: 1, alignment: 1 });
  for (let x = 0; x < room.width; x++) {
    const t = room.grid[0][x];
    if (t === TILE.VOID) continue;
    // north edge of tile (x, 1): from its west corner to its north corner
    const { sx, sy } = tileToScreen(x, 1, originX, originY);
    const a = [sx - hw, sy];
    const b = [sx, sy - hh];
    const col = shade(t === TILE.WINDOW ? 0x9fd4f0 : t === TILE.DOOR ? shade(wall, -0.45) : wall, dim - 0.1);
    face([a[0], a[1], b[0], b[1], b[0], b[1] - WALL_H, a[0], a[1] - WALL_H], col);
  }
  for (let y = 0; y < room.height; y++) {
    const t = room.grid[y][0];
    if (t === TILE.VOID) continue;
    const { sx, sy } = tileToScreen(1, y, originX, originY);
    const a = [sx, sy - hh];
    const b = [sx - hw, sy];
    const col = shade(t === TILE.WINDOW ? 0x9fd4f0 : t === TILE.DOOR ? shade(wall, -0.45) : wall, dim + 0.05);
    face([a[0], a[1], b[0], b[1], b[0], b[1] - WALL_H, a[0], a[1] - WALL_H], col);
  }
  layers.walls.addChild(wg);
}

function furnitureKey(f, lightsOn) {
  return `${f.itemId}|${f.x},${f.y}|${f.footprint.w}x${f.footprint.h}|${lightsOn ? 1 : 0}`;
}

function makeFurnitureNode(f, item, originX, originY, lightsOn) {
  const node = new Graphics();
  // Position at the footprint's north corner.
  const { sx, sy } = tileToScreen(f.x - 0.5, f.y - 0.5, originX, originY);
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

function makeEntityNode(e) {
  const c = entityColors(e);
  const g = new Graphics();
  g.ellipse(0, 0, 12, 5).fill({ color: 0x000000, alpha: 0.22 });
  if (e.lying) {
    g.roundRect(-20, -12, 40, 10, 4).fill(c.shirt);
    g.circle(-20, -10, 6).fill(c.skin);
  } else {
    const legH = e.sitting ? 6 : 14;
    g.rect(-6, -legH, 5, legH).fill(c.pants);
    g.rect(1, -legH, 5, legH).fill(c.pants);
    g.roundRect(-8, -legH - 18, 16, 19, 4).fill(c.shirt).stroke({ color: shade(c.shirt, -0.5), width: 1 });
    g.circle(0, -legH - 25, 8).fill(c.skin).stroke({ color: shade(c.skin, -0.45), width: 1 });
    g.rect(-8, -legH - 34, 16, 5).fill(c.hair);
  }
  return g;
}

function entityKey(e) {
  return `${e.sitting ? 's' : ''}${e.lying ? 'l' : ''}${e.look ? JSON.stringify(e.look) : e.spriteKey}`;
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
  layers.world.position.set(width / 2 + panX - (width / 2) * zoom, height / 2 + panY - (height / 2) * zoom);

  const { originX, originY } = computeOrigin(room, width, height);
  const fk = `${room.id}|${originX},${originY}|${lightsOn ? 1 : 0}`;
  if (fk !== floorKey) {
    floorKey = fk;
    buildFloor(room, originX, originY, lightsOn);
    for (const rec of furnitureNodes.values()) rec.node.destroy();
    furnitureNodes.clear();
  }

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
  for (const f of placedFurniture) {
    const item = getCatalogueItem(f.itemId);
    if (!item) continue;
    const id = f.instanceId || `${f.itemId}@${f.x},${f.y}`;
    seen.add(id);
    const key = furnitureKey(f, lightsOn);
    let rec = furnitureNodes.get(id);
    if (!rec || rec.key !== key) {
      if (rec) rec.node.destroy();
      rec = { node: makeFurnitureNode(f, item, originX, originY, lightsOn), key };
      furnitureNodes.set(id, rec);
    }
    // Overhead first: the chandelier is flagged flat+overhead and used to be
    // drawn on the floor because the flat check won.
    if (item.overhead) overheads.push(rec.node);
    else if (item.flat) flats.push(rec.node);
    else solids.push({ f, item, rec, id });
  }
  for (const [id, rec] of furnitureNodes) {
    if (!seen.has(id)) { rec.node.destroy(); furnitureNodes.delete(id); }
  }
  reparent(layers.floorDecor, flats);
  reparent(layers.overhead, overheads);

  // --- entities ---
  const seenE = new Set();
  const drawables = [];
  const seatOf = new Map(); // seat furniture id -> entity id
  for (const e of entities) {
    seenE.add(e.id);
    const key = entityKey(e);
    let rec = entityNodes.get(e.id);
    if (!rec || rec.key !== key) {
      if (rec) rec.node.destroy();
      rec = { node: makeEntityNode(e), key };
      entityNodes.set(e.id, rec);
    }
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
