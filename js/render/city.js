// City backdrop for the PixiJS renderer.
//
// - Sky: screen-space banded gradient that follows the time of day, with
//   stars, sun/moon and drifting clouds.
// - Street level: a large iso ground plane far below the current floor with
//   roads, pavements, parks, blocky buildings, street trees and moving cars.
// - The hotel tower: the current floor's footprint extruded down to the street
//   with storey lines and windows.
// Everything at street level lives in world space (moves with the camera) and
// is depth-sorted with the same footprint rule as the room.

import { Container, Graphics, Sprite } from 'pixi.js';
import { tileToScreen, computeGroundDy, dayNight, lerpHex } from '../iso.js';
import { isBehind } from '../depthSort.js';

const SPAN = 60; // tiles of city around the tower that get roads/buildings
const ROAD_W = 3;
const BLOCK = 16;

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

function shade(c, k) {
  const f = (v) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  return (f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255);
}

// ---------- sky ----------

const SKY = {
  nightTop: 0x0b102c, nightMid: 0x1b2452, nightLow: 0x2d3266,
  dayTop: 0x4aa8ff, dayMid: 0x8cd2ff, dayLow: 0xfff0c8,
  duskMid: 0xc85a7c, duskLow: 0xff9a5c,
};

export function skyColors(phase) {
  const { day, dusk } = dayNight(phase);
  const top = lerpHex(SKY.nightTop, SKY.dayTop, day);
  let mid = lerpHex(SKY.nightMid, SKY.dayMid, day);
  let low = lerpHex(SKY.nightLow, SKY.dayLow, day);
  if (dusk > 0.01) {
    mid = lerpHex(mid, SKY.duskMid, dusk * 0.65);
    low = lerpHex(low, SKY.duskLow, dusk * 0.78);
  }
  return { top, mid, low };
}

function drawSky(g, w, h, phase) {
  g.clear();
  const { top, mid, low } = skyColors(phase);
  const BANDS = 14;
  const bandH = Math.ceil(h / BANDS);
  for (let i = 0; i < BANDS; i++) {
    const t = i / (BANDS - 1);
    const c = t < 0.55 ? lerpHex(top, mid, t / 0.55) : lerpHex(mid, low, (t - 0.55) / 0.45);
    g.rect(0, i * bandH, w, bandH + 1).fill(c);
    // 2px dithered seam into the next band, so bands read as pixel art
    if (i < BANDS - 1) {
      const t2 = (i + 1) / (BANDS - 1);
      const c2 = t2 < 0.55 ? lerpHex(top, mid, t2 / 0.55) : lerpHex(mid, low, (t2 - 0.55) / 0.45);
      const y = (i + 1) * bandH - 2;
      for (let x = (i % 2) * 2; x < w; x += 4) g.rect(x, y, 2, 2).fill(c2);
    }
  }
  const { day, night } = dayNight(phase);
  // stars
  if (night > 0.2) {
    const r = rng(7);
    for (let i = 0; i < 90; i++) {
      const x = Math.floor(r() * w); const y = Math.floor(r() * h * 0.6);
      const big = r() > 0.85;
      g.rect(x, y, big ? 2 : 1, big ? 2 : 1).fill({ color: 0xfff6d8, alpha: Math.min(1, (night - 0.2) * 1.4) * (0.5 + r() * 0.5) });
    }
  }
  // sun or moon on an arc across the sky (sun rises at 0.25, sets at 0.75)
  const sunT = (phase - 0.25) / 0.5;
  const moonT = ((phase + 0.25) % 1) / 0.5;
  const body = (t, colour, rad, glowColour) => {
    if (t < 0 || t > 1) return;
    const x = Math.round(w * (0.1 + 0.8 * t));
    const y = Math.round(h * (0.55 - Math.sin(t * Math.PI) * 0.42));
    for (let k = 3; k >= 1; k--) g.circle(x, y, rad + k * 6).fill({ color: glowColour, alpha: 0.08 });
    // pixel disc
    for (let dy = -rad; dy <= rad; dy += 2) {
      const half = Math.floor(Math.sqrt(rad * rad - dy * dy) / 2) * 2;
      g.rect(x - half, y + dy, half * 2, 2).fill(colour);
    }
  };
  if (day > 0) body(sunT, 0xfff1a8, 14, 0xffd86a);
  if (night > 0.3) body(moonT, 0xeef2ff, 10, 0xbfd4ff);
}

function makeClouds(w, h) {
  const c = new Container();
  const r = rng(11);
  for (let i = 0; i < 7; i++) {
    const g = new Graphics();
    const cw = 40 + Math.floor(r() * 50);
    for (let k = 0; k < 5; k++) {
      const bx = Math.floor(r() * cw); const bw = 14 + Math.floor(r() * 18); const by = Math.floor(r() * 6);
      g.rect(bx, by, bw, 8).fill(0xffffff);
      g.rect(bx + 2, by - 2, bw - 4, 2).fill(0xffffff);
      g.rect(bx, by + 8, bw, 2).fill(0xdde8f6);
    }
    g.x = Math.floor(r() * w * 1.4);
    g.y = Math.floor(10 + r() * h * 0.35);
    g.speed = 4 + r() * 6;
    g.alpha = 0.85;
    c.addChild(g);
  }
  return c;
}

// ---------- street level ----------

// None of these may be close to the hotel's own stone (0xd8c3a5): a tall
// neighbour in the hotel's colour reads as a misaligned piece of the tower.
const FACADES = [0x8fa3c4, 0xc98f6e, 0xa9b8c9, 0x7c8796, 0xb7a6d2, 0x9bb5a5, 0xc7a3a0];

function roadLines(start, end, size) {
  // road centre lines on one axis: just outside the tower, then every BLOCK
  const lines = [];
  for (let c = start - 5; c >= -SPAN; c -= BLOCK) lines.push(c);
  for (let c = end + 5; c <= size + SPAN; c += BLOCK) lines.push(c);
  return lines.sort((a, b) => a - b);
}

/**
 * Build the city for a room. Returns { node, update(now, phase, night) }.
 * `node` is a world-space container drawn behind the room.
 */
export function buildCity(room, originX, originY, tex) {
  const W = room.width;
  const H = room.height;
  const G = computeGroundDy(room.floor || 1);
  const gp = (u, v, z = 0) => {
    const { sx, sy } = tileToScreen(u - 0.5, v - 0.5, originX, originY);
    return [sx, sy + G - z];
  };
  const quad = (g, pts, colour) => g.poly(pts.flat()).fill(colour);
  const r = rng(hashStr(`city:${room.id}`));

  const node = new Container();
  const ground = new Graphics();
  node.addChild(ground);
  const objects = new Container();
  node.addChild(objects);
  // Atmospheric haze over the street level: thicker the higher the floor, so
  // the room stands out from the city below.
  const haze = new Graphics();
  const HAZE = 4000;
  haze.rect(originX - HAZE, originY - HAZE, HAZE * 2, HAZE * 2).fill(0xffffff);
  haze.alpha = Math.min(0.38, 0.06 + G / 2600);

  // --- ground plane ---
  const FAR = 160;
  quad(ground, [gp(-FAR, -FAR), gp(W + FAR, -FAR), gp(W + FAR, H + FAR), gp(-FAR, H + FAR)], 0xb9b2a6);
  const ru = roadLines(0, W, W);
  const rv = roadLines(0, H, H);
  const roadCol = 0x4a4652;
  const dash = 0xe8d27a;
  for (const v of rv) {
    quad(ground, [gp(-FAR, v - ROAD_W / 2), gp(W + FAR, v - ROAD_W / 2), gp(W + FAR, v + ROAD_W / 2), gp(-FAR, v + ROAD_W / 2)], roadCol);
    for (let u = -SPAN; u < W + SPAN; u += 1.5) quad(ground, [gp(u, v - 0.05), gp(u + 0.7, v - 0.05), gp(u + 0.7, v + 0.05), gp(u, v + 0.05)], dash);
  }
  for (const u of ru) {
    quad(ground, [gp(u - ROAD_W / 2, -FAR), gp(u + ROAD_W / 2, -FAR), gp(u + ROAD_W / 2, H + FAR), gp(u - ROAD_W / 2, H + FAR)], roadCol);
    for (let v = -SPAN; v < H + SPAN; v += 1.5) quad(ground, [gp(u - 0.05, v), gp(u + 0.05, v), gp(u + 0.05, v + 0.7), gp(u - 0.05, v + 0.7)], dash);
  }
  // crossings: plain asphalt squares so the dashes don't run through them
  for (const u of ru) for (const v of rv) {
    quad(ground, [gp(u - ROAD_W / 2, v - ROAD_W / 2), gp(u + ROAD_W / 2, v - ROAD_W / 2), gp(u + ROAD_W / 2, v + ROAD_W / 2), gp(u - ROAD_W / 2, v + ROAD_W / 2)], roadCol);
    for (let i = 0; i < 4; i++) {
      const o = -ROAD_W / 2 + 0.3 + i * 0.6;
      quad(ground, [gp(u + o, v - ROAD_W / 2 - 0.6), gp(u + o + 0.3, v - ROAD_W / 2 - 0.6), gp(u + o + 0.3, v - ROAD_W / 2), gp(u + o, v - ROAD_W / 2)], 0xf2efe8);
    }
  }
  // tower plaza
  quad(ground, [gp(-2, -2), gp(W + 2, -2), gp(W + 2, H + 2), gp(-2, H + 2)], 0xddd3c4);

  // --- blocks: parks or buildings ---
  const statics = [];
  const addObj = (display, u0, v0, u1, v1) => {
    objects.addChild(display);
    statics.push({ display, box: { minX: u0, maxX: u1, minY: v0, maxY: v1 } });
  };
  const nightWindows = [];
  const edgesU = [-FAR, ...ru, W + FAR];
  const edgesV = [-FAR, ...rv, H + FAR];
  const towerBox = { minX: 0, maxX: W, minY: 0, maxY: H };
  for (let i = 0; i + 1 < edgesU.length; i++) {
    for (let j = 0; j + 1 < edgesV.length; j++) {
      const u0 = edgesU[i] + ROAD_W / 2 + 1; const u1 = edgesU[i + 1] - ROAD_W / 2 - 1;
      const v0 = edgesV[j] + ROAD_W / 2 + 1; const v1 = edgesV[j + 1] - ROAD_W / 2 - 1;
      if (u1 - u0 < 2 || v1 - v0 < 2) continue;
      if (u1 < -SPAN || v1 < -SPAN || u0 > W + SPAN || v0 > H + SPAN) continue;
      // the tower's own block
      if (u0 <= W && u1 >= 0 && v0 <= H && v1 >= 0) continue;
      const box = { minX: u0, maxX: u1, minY: v0, maxY: v1 };
      const behind = isBehind(box, towerBox);
      // anything in front of the tower stays well below the current floor so it
      // never crowds the room; buildings behind it may tower over it
      const frontMaxH = Math.max(0, Math.round(G * 0.55) - 20);
      const maxH = behind ? 420 : frontMaxH;
      if (maxH < 30 || r() < 0.22) {
        quad(ground, [gp(u0, v0), gp(u1, v0), gp(u1, v1), gp(u0, v1)], 0x7fae5c);
        for (let k = 0; k < 6; k++) {
          const tu = u0 + 0.5 + r() * (u1 - u0 - 1); const tv = v0 + 0.5 + r() * (v1 - v0 - 1);
          addTree(tu, tv);
        }
        continue;
      }
      // split the block into 1-3 buildings along its longer side
      const n = 1 + Math.floor(r() * 3);
      const alongU = u1 - u0 >= v1 - v0;
      for (let k = 0; k < n; k++) {
        const a0 = k / n; const a1 = (k + 1) / n;
        const bu0 = alongU ? u0 + (u1 - u0) * a0 + 0.2 : u0;
        const bu1 = alongU ? u0 + (u1 - u0) * a1 - 0.2 : u1;
        const bv0 = alongU ? v0 : v0 + (v1 - v0) * a0 + 0.2;
        const bv1 = alongU ? v1 : v0 + (v1 - v0) * a1 - 0.2;
        const storeys = 2 + Math.floor(r() * (behind ? 12 : 6));
        // A tall building behind the tower whose silhouette reaches the
        // tower's left or right outline would appear to grow out of the
        // hotel's corner; keep those below the floor like the ones in front.
        const capped = behind && hugsTowerOutline(bu0, bv0, bu1, bv1, W, H) ? frontMaxH : maxH;
        const height = Math.min(capped, storeys * 28);
        if (height < 28) continue;
        addBuilding(bu0, bv0, bu1, bv1, height, FACADES[Math.floor(r() * FACADES.length)]);
      }
    }
  }
  // street trees along the plaza edge
  for (let u = -1.5; u <= W + 1.5; u += 3) { addTree(u, H + 1.5); addTree(u, -1.5); }
  for (let v = -1.5; v <= H + 1.5; v += 3) { addTree(W + 1.5, v); addTree(-1.5, v); }

  // --- the hotel tower under the current floor ---
  addTower();

  function addTree(u, v) {
    const t = tex[`city/tree${Math.floor(r() * 2)}`];
    if (!t) return;
    const sp = new Sprite(t);
    sp.anchor.copyFrom(t.defaultAnchor);
    const [x, y] = gp(u - 0.5, v - 0.5);
    sp.position.set(Math.round(x), Math.round(y));
    addObj(sp, u - 0.4, v - 0.4, u + 0.4, v + 0.4);
  }

  function windowGrid(g, nightG, face, a0, a1, z0, z1, storeyH, dayCol) {
    // face: 'v' = the +v face at v = fixed (a runs along u); 'u' = +u face (a along v)
    for (let z = z0 + 6; z + 12 <= z1 - 4; z += storeyH) {
      for (let a = a0 + 0.25; a + 0.35 <= a1 - 0.1; a += 0.6) {
        const pts = face.fixed === 'v'
          ? [gp(a, face.at, z + 12), gp(a + 0.35, face.at, z + 12), gp(a + 0.35, face.at, z), gp(a, face.at, z)]
          : [gp(face.at, a, z + 12), gp(face.at, a + 0.35, z + 12), gp(face.at, a + 0.35, z), gp(face.at, a, z)];
        quad(g, pts, dayCol);
        if (r() < 0.55) quad(nightG, pts, r() < 0.8 ? 0xffd27a : 0xfff1c0);
      }
    }
  }

  function addBuilding(u0, v0, u1, v1, height, colour) {
    const c = new Container();
    const g = new Graphics();
    const lit = colour; const dark = shade(colour, -0.28); const top = shade(colour, 0.22);
    quad(g, [gp(u0, v1, height), gp(u1, v1, height), gp(u1, v1, 0), gp(u0, v1, 0)], lit);
    quad(g, [gp(u1, v1, height), gp(u1, v0, height), gp(u1, v0, 0), gp(u1, v1, 0)], dark);
    quad(g, [gp(u0, v0, height), gp(u1, v0, height), gp(u1, v1, height), gp(u0, v1, height)], top);
    // parapet line and a rooftop plant room
    quad(g, [gp(u0, v1, height), gp(u1, v1, height), gp(u1, v1, height - 3), gp(u0, v1, height - 3)], shade(colour, 0.35));
    if (u1 - u0 > 2 && v1 - v0 > 2) {
      const pu = u0 + (u1 - u0) * 0.3; const pv = v0 + (v1 - v0) * 0.3;
      const ph = 10;
      quad(g, [gp(pu, pv + 1, height + ph), gp(pu + 1.2, pv + 1, height + ph), gp(pu + 1.2, pv + 1, height), gp(pu, pv + 1, height)], 0xb9b2a6);
      quad(g, [gp(pu + 1.2, pv + 1, height + ph), gp(pu + 1.2, pv, height + ph), gp(pu + 1.2, pv, height), gp(pu + 1.2, pv + 1, height)], 0x8d8579);
      quad(g, [gp(pu, pv, height + ph), gp(pu + 1.2, pv, height + ph), gp(pu + 1.2, pv + 1, height + ph), gp(pu, pv + 1, height + ph)], 0xd8d1c4);
    }
    const nightG = new Graphics();
    windowGrid(g, nightG, { fixed: 'v', at: v1 }, u0, u1, 0, height, 28, shade(0x8fc9de, 0.1));
    windowGrid(g, nightG, { fixed: 'u', at: u1 }, v0, v1, 0, height, 28, shade(0x6f9fb8, -0.05));
    // outline the silhouette edges
    g.poly([...gp(u0, v1, 0), ...gp(u0, v1, height), ...gp(u0, v0, height), ...gp(u1, v0, height), ...gp(u1, v0, 0), ...gp(u1, v1, 0)])
      .stroke({ color: shade(colour, -0.6), width: 1, alignment: 0.5 });
    c.addChild(g, nightG);
    nightWindows.push(nightG);
    addObj(c, u0, v0, u1, v1);
  }

  function addTower() {
    const c = new Container();
    const g = new Graphics();
    const nightG = new Graphics();
    const stone = 0xd8c3a5; const stoneDark = 0xb09a80; const slab = 0x8d7b6e;
    const top = G; // the room floor sits on top of the tower
    if (top > 16) {
      quad(g, [gp(0, H, top), gp(W, H, top), gp(W, H, 0), gp(0, H, 0)], stone);
      quad(g, [gp(W, H, top), gp(W, 0, top), gp(W, 0, 0), gp(W, H, 0)], stoneDark);
      // storey bands at each floor level below this one
      for (let f = 2; f <= (room.floor === 42 ? 42 : room.floor || 1); f++) {
        const z = computeGroundDy(f) - 16;
        if (z >= top - 16) break;
        quad(g, [gp(0, H, z + 3), gp(W, H, z + 3), gp(W, H, z), gp(0, H, z)], shade(stone, -0.18));
        quad(g, [gp(W, H, z + 3), gp(W, 0, z + 3), gp(W, 0, z), gp(W, H, z)], shade(stoneDark, -0.18));
      }
      const storeyH = (room.floor || 1) <= 5 ? 56 : 32;
      windowGrid(g, nightG, { fixed: 'v', at: H }, 0, W, 4, top - 16, storeyH, 0x7fb6d0);
      windowGrid(g, nightG, { fixed: 'u', at: W }, 0, H, 4, top - 16, storeyH, 0x5f93ad);
    }
    // roof deck at floor level: shows wherever the room's floor plan has cut-outs
    quad(g, [gp(0, 0, top), gp(W, 0, top), gp(W, H, top), gp(0, H, top)], 0xa39a8e);
    for (let u = 2; u < W; u += 4) quad(g, [gp(u, 0, top), gp(u + 0.08, 0, top), gp(u + 0.08, H, top), gp(u, H, top)], 0x948b80);
    // concrete floor slab directly under the room
    quad(g, [gp(0, H, top), gp(W, H, top), gp(W, H, top - 16), gp(0, H, top - 16)], slab);
    quad(g, [gp(W, H, top), gp(W, 0, top), gp(W, 0, top - 16), gp(W, H, top - 16)], shade(slab, -0.2));
    c.addChild(g, nightG);
    nightWindows.push(nightG);
    addObj(c, 0, 0, W, H);
  }

  // --- static draw order ---
  statics.sort((a, b) => (a.box.minX + a.box.minY) - (b.box.minX + b.box.minY));
  const order = topo(statics);

  // --- cars: two per road near the tower, each lane in its own direction ---
  const carNames = ['red', 'blue', 'yellow', 'white', 'green'];
  const cars = [];
  for (const v of rv) {
    if (v < -40 || v > H + 40) continue;
    for (const lane of [-1, 1]) {
      const t = tex[`city/car_${carNames[Math.floor(r() * carNames.length)]}_u`];
      const sp = new Sprite(t);
      sp.anchor.copyFrom(t.defaultAnchor);
      cars.push({ sp, axis: 'u', line: v + lane * 0.75 - 0.25, dir: lane, offset: r() * 200, speed: 1.6 + r() * 1.4 });
    }
  }
  for (const u of ru) {
    if (u < -40 || u > W + 40) continue;
    for (const lane of [-1, 1]) {
      const t = tex[`city/car_${carNames[Math.floor(r() * carNames.length)]}_v`];
      const sp = new Sprite(t);
      sp.anchor.copyFrom(t.defaultAnchor);
      cars.push({ sp, axis: 'v', line: u - lane * 0.75 - 0.25, dir: lane, offset: r() * 200, speed: 1.6 + r() * 1.4 });
    }
  }

  const span = 2 * 40;
  function update(now, phase, lowDetail = false) {
    const { night } = dayNight(phase);
    haze.tint = skyColors(phase).low;
    for (const g of nightWindows) g.alpha = night;
    const t = now / 1000;
    const placed = [];
    for (const c of cars) {
      c.sp.visible = !lowDetail;
      if (lowDetail) continue;
      const p = ((c.offset + t * c.speed * c.dir) % span + span) % span - 40;
      let u0; let v0; let box;
      if (c.axis === 'u') { u0 = p + W / 2; v0 = c.line; box = { minX: u0, maxX: u0 + 1, minY: v0, maxY: v0 + 0.5 }; }
      else { u0 = c.line; v0 = p + H / 2; box = { minX: u0, maxX: u0 + 0.5, minY: v0, maxY: v0 + 1 }; }
      const [x, y] = gp(u0, v0);
      c.sp.position.set(Math.round(x), Math.round(y));
      c.sp.scale.x = 1;
      placed.push({ display: c.sp, box });
    }
    // Insert each car right after the last static object that is behind it.
    const merged = [];
    const insertAt = new Map();
    for (const car of placed) {
      let idx = -1;
      for (let i = order.length - 1; i >= 0; i--) {
        const o = order[i];
        if (!overlapX(o.box, car.box)) continue;
        if (isBehind(o.box, car.box)) { idx = i; break; }
      }
      if (!insertAt.has(idx)) insertAt.set(idx, []);
      insertAt.get(idx).push(car.display);
    }
    for (const d of insertAt.get(-1) || []) merged.push(d);
    for (let i = 0; i < order.length; i++) {
      merged.push(order[i].display);
      for (const d of insertAt.get(i) || []) merged.push(d);
    }
    objects.removeChildren();
    for (const d of merged) objects.addChild(d);
  }

  node.addChild(haze);

  return { node, update, haze, objectCount: () => statics.length, carCount: () => cars.length };
}

/**
 * True when a building's screen silhouette (iso x is proportional to u - v)
 * reaches within `margin` tiles of the tower's left (-H) or right (W) outline.
 */
export function hugsTowerOutline(u0, v0, u1, v1, W, H, margin = 2) {
  const left = u0 - v1;
  const right = u1 - v0;
  const near = (edge) => left - margin < edge && right + margin > edge;
  return near(W) || near(-H);
}

function overlapX(a, b) {
  const aL = a.minX - a.maxY; const aR = a.maxX - a.minY;
  const bL = b.minX - b.maxY; const bR = b.maxX - b.minY;
  return !(aR <= bL || bR <= aL);
}

// Topological order of static city objects (behind -> in front).
function topo(items) {
  const n = items.length;
  const out = Array.from({ length: n }, () => []);
  const indeg = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = items[i].box; const b = items[j].box;
      if (!overlapX(a, b)) continue;
      if (isBehind(a, b)) { out[i].push(j); indeg[j]++; } else if (isBehind(b, a)) { out[j].push(i); indeg[i]++; }
    }
  }
  const res = [];
  const ready = [];
  for (let i = 0; i < n; i++) if (!indeg[i]) ready.push(i);
  const done = new Uint8Array(n);
  while (res.length < n) {
    let pick = ready.length ? ready.shift() : -1;
    if (pick < 0) { for (let i = 0; i < n; i++) if (!done[i]) { pick = i; break; } }
    if (done[pick]) continue;
    done[pick] = 1;
    res.push(items[pick]);
    for (const t of out[pick]) if (--indeg[t] === 0) ready.push(t);
  }
  return res;
}

// ---------- screen-space sky ----------

export function createSky() {
  const node = new Container();
  const g = new Graphics();
  node.addChild(g);
  let clouds = null;
  let key = '';
  return {
    node,
    update(w, h, phase, now, panX, lowDetail = false) {
      const bucket = Math.round(phase * 96);
      const k = `${w}x${h}|${bucket}`;
      if (k !== key) {
        key = k;
        drawSky(g, w, h, phase);
        if (!clouds || clouds.w !== w) {
          clouds?.destroy({ children: true });
          clouds = makeClouds(w, h);
          clouds.w = w;
          node.addChild(clouds);
        }
      }
      const { night } = dayNight(phase);
      clouds.visible = !lowDetail;
      clouds.alpha = 0.9 - night * 0.6;
      for (const c of clouds.children) {
        const span = w * 1.4 + 200;
        c.x = ((((c.x0 ??= c.x) + now / 1000 * c.speed + panX * 0.15) % span) + span) % span - 100;
      }
    },
  };
}
