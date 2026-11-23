// Phase 1 Pre-Baked Sprite Atlas Pipeline (PIXI_MIGRATION_PLAN.md §2.3).
// Runs in Node at build time (and on demand via `node scripts/build-atlas.mjs [outDir]`).
// Evaluates every FURNITURE_BUILDERS key x 4 rotations x layers (all/back/front) x DETAIL 1 & 2,
// off (lights-out) variants, floor/wall/window/door/skirting/balustrade pieces, and catalogue
// item icons; packs them into max 2048x2048 RGBA PNG pages with 2px padding; and emits
// PixiJS Spritesheet JSON files (with anchor & pivot from ax/ay) plus manifest.json.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { setDetail, getDetail } from '../js/pixelart.js';
import { CATALOGUE, ROOMS } from '../js/data.js';
import {
  FURNITURE_BUILDERS,
  FLOOR_MATERIALS,
  buildFloorTile,
  buildWallSegment,
  buildWindowSegment,
  buildDoorSegment,
  buildElevatorDoorSegment,
  buildStairwellDoorSegment,
  buildGlassBalustradeSegment,
  buildEdgeRailSegment,
  buildDoorTile,
  buildElevatorTile,
} from '../js/sprites.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const MAX_PAGE_DIM = 2048;
const PADDING = 2;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const tb = Buffer.from(type, 'ascii');
  const body = Buffer.concat([tb, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

export function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

function parseColorToRgba(c) {
  if (!c) return [0, 0, 0, 0];
  if (c[0] === '#') {
    const hex = c.slice(1);
    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
        255,
      ];
    }
    if (hex.length === 8) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
        parseInt(hex.slice(6, 8), 16),
      ];
    }
  }
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(c);
  if (m) {
    return [
      Number(m[1]) & 0xff,
      Number(m[2]) & 0xff,
      Number(m[3]) & 0xff,
      m[4] !== undefined ? Math.max(0, Math.min(255, Math.round(Number(m[4]) * 255))) : 255,
    ];
  }
  return [0, 0, 0, 255];
}

export function spriteToRgbaBitmap(spr, { offVariant = false } = {}) {
  const w = Math.max(1, spr?.w || 1);
  const h = Math.max(1, spr?.h || 1);
  const ax = typeof spr?.ax === 'number' ? spr.ax : Math.round(w / 2);
  const ay = typeof spr?.ay === 'number' ? spr.ay : Math.round(h / 2);
  const rgba = new Uint8Array(w * h * 4);
  const px = spr?.px;
  if (px) {
    for (let y = 0; y < h && y < px.length; y++) {
      const row = px[y];
      if (!row) continue;
      for (let x = 0; x < w && x < row.length; x++) {
        const col = row[x];
        if (!col) continue;
        let [r, g, b, a] = parseColorToRgba(col);
        if (offVariant && a > 0) {
          // Lights-off variant dims warm/emissive highlights & surfaces slightly
          r = Math.round(r * 0.72);
          g = Math.round(g * 0.74);
          b = Math.round(b * 0.82);
        }
        const idx = (y * w + x) * 4;
        rgba[idx] = r;
        rgba[idx + 1] = g;
        rgba[idx + 2] = b;
        rgba[idx + 3] = a;
      }
    }
  }
  const hash = crypto.createHash('sha1').update(Buffer.from([w & 0xff, (w >> 8) & 0xff, h & 0xff, (h >> 8) & 0xff])).update(rgba).digest('hex');
  return { w, h, ax, ay, rgba, hash };
}

function makeIconBitmap(baseBmp, detail = 1) {
  const targetDim = 28 * detail;
  const out = new Uint8Array(targetDim * targetDim * 4);
  const scale = Math.min((targetDim - 4) / baseBmp.w, (targetDim - 4) / baseBmp.h, 1);
  const drawW = Math.max(1, Math.round(baseBmp.w * scale));
  const drawH = Math.max(1, Math.round(baseBmp.h * scale));
  const ox = Math.floor((targetDim - drawW) / 2);
  const oy = Math.floor((targetDim - drawH) / 2);
  for (let dy = 0; dy < drawH; dy++) {
    const sy = Math.min(baseBmp.h - 1, Math.floor(dy / scale));
    for (let dx = 0; dx < drawW; dx++) {
      const sx = Math.min(baseBmp.w - 1, Math.floor(dx / scale));
      const si = (sy * baseBmp.w + sx) * 4;
      const di = ((oy + dy) * targetDim + (ox + dx)) * 4;
      out[di] = baseBmp.rgba[si];
      out[di + 1] = baseBmp.rgba[si + 1];
      out[di + 2] = baseBmp.rgba[si + 2];
      out[di + 3] = baseBmp.rgba[si + 3];
    }
  }
  const hash = crypto.createHash('sha1').update(Buffer.from([targetDim, targetDim])).update(out).digest('hex');
  return {
    w: targetDim,
    h: targetDim,
    ax: Math.round(targetDim / 2),
    ay: Math.round(targetDim / 2),
    rgba: out,
    hash,
  };
}

function makeSkirtingBitmap(wallBmp, detail = 1) {
  let maxY = wallBmp.h - 1;
  outer: for (let y = wallBmp.h - 1; y >= 0; y--) {
    for (let x = 0; x < wallBmp.w; x++) {
      if (wallBmp.rgba[(y * wallBmp.w + x) * 4 + 3] > 0) {
        maxY = y;
        break outer;
      }
    }
  }
  const skirtH = Math.min(maxY + 1, 24 * detail);
  const y0 = Math.max(0, maxY - skirtH + 1);
  const out = new Uint8Array(wallBmp.w * skirtH * 4);
  for (let y = 0; y < skirtH; y++) {
    const srcOff = ((y0 + y) * wallBmp.w) * 4;
    const dstOff = (y * wallBmp.w) * 4;
    out.set(wallBmp.rgba.subarray(srcOff, srcOff + wallBmp.w * 4), dstOff);
  }
  const hash = crypto.createHash('sha1').update(Buffer.from([wallBmp.w, skirtH])).update(out).digest('hex');
  return {
    w: wallBmp.w,
    h: skirtH,
    ax: wallBmp.ax,
    ay: Math.max(0, wallBmp.ay - y0),
    rgba: out,
    hash,
  };
}

function nextPow2OrAligned(v, maxDim = MAX_PAGE_DIM) {
  return Math.min(maxDim, Math.max(64, Math.ceil((v + PADDING * 2) / 16) * 16));
}

export function packBitmapsIntoPages(uniqueBitmaps, maxPageDim = MAX_PAGE_DIM, padding = PADDING) {
  // Sort tallest first for shelf packing
  const sorted = [...uniqueBitmaps].sort((a, b) => (b.h - a.h) || (b.w - a.w) || a.hash.localeCompare(b.hash));
  const pages = [];

  function createPage() {
    const page = {
      index: pages.length,
      curX: padding,
      curY: padding,
      shelfH: 0,
      usedW: 0,
      usedH: 0,
      placements: new Map(), // hash -> { x, y, w, h }
      items: [],
    };
    pages.push(page);
    return page;
  }

  let page = createPage();
  for (const bmp of sorted) {
    if (bmp.w + padding * 2 > maxPageDim || bmp.h + padding * 2 > maxPageDim) {
      throw new Error(`Bitmap ${bmp.w}x${bmp.h} exceeds maxPageDim ${maxPageDim}`);
    }
    if (page.curX + bmp.w + padding > maxPageDim) {
      page.curX = padding;
      page.curY += page.shelfH + padding;
      page.shelfH = 0;
    }
    if (page.curY + bmp.h + padding > maxPageDim) {
      page = createPage();
    }
    const x = page.curX;
    const y = page.curY;
    page.placements.set(bmp.hash, { x, y, w: bmp.w, h: bmp.h });
    page.items.push({ bmp, x, y });
    page.curX += bmp.w + padding;
    if (bmp.h > page.shelfH) page.shelfH = bmp.h;
    if (x + bmp.w + padding > page.usedW) page.usedW = x + bmp.w + padding;
    if (y + bmp.h + padding > page.usedH) page.usedH = y + bmp.h + padding;
  }

  return pages.map((p) => {
    const width = nextPow2OrAligned(p.usedW, maxPageDim);
    const height = nextPow2OrAligned(p.usedH, maxPageDim);
    const rgba = new Uint8Array(width * height * 4);
    for (const { bmp, x, y } of p.items) {
      for (let row = 0; row < bmp.h; row++) {
        const srcStart = row * bmp.w * 4;
        const dstStart = ((y + row) * width + x) * 4;
        rgba.set(bmp.rgba.subarray(srcStart, srcStart + bmp.w * 4), dstStart);
      }
    }
    return {
      index: p.index,
      width,
      height,
      rgba,
      placements: p.placements,
      uniqueCount: p.items.length,
    };
  });
}

export function collectDetailFrames(detail = 1) {
  const prevDetail = getDetail();
  setDetail(detail);
  try {
    const frames = []; // { name, bmp }
    const uniqueByHash = new Map();

    const register = (name, bmp) => {
      if (!uniqueByHash.has(bmp.hash)) {
        uniqueByHash.set(bmp.hash, bmp);
      }
      frames.push({ name, bmp });
    };

    // 1. Every FURNITURE_BUILDERS key x 4 rotations x layers (all, back, front) + off variant
    const builderKeys = Object.keys(FURNITURE_BUILDERS).sort();
    const rot0Bitmaps = new Map();
    for (const key of builderKeys) {
      const fn = FURNITURE_BUILDERS[key];
      for (let rot = 0; rot < 4; rot++) {
        const sprAll = fn(rot, 'all');
        const bmpAll = spriteToRgbaBitmap(sprAll, { offVariant: false });
        register(`furn:${key}:${rot}:all`, bmpAll);
        if (rot === 0) rot0Bitmaps.set(key, bmpAll);

        const sprBack = fn(rot, 'back');
        const bmpBack = (sprBack === sprAll) ? bmpAll : spriteToRgbaBitmap(sprBack, { offVariant: false });
        register(`furn:${key}:${rot}:back`, bmpBack);

        const sprFront = fn(rot, 'front');
        const bmpFront = (sprFront === sprAll) ? bmpAll : spriteToRgbaBitmap(sprFront, { offVariant: false });
        register(`furn:${key}:${rot}:front`, bmpFront);

        const bmpOff = spriteToRgbaBitmap(sprAll, { offVariant: true });
        register(`furn:${key}:${rot}:all:off`, bmpOff);
      }
    }

    // 1b. Alias CATALOGUE items whose id differs from item.spriteKey (e.g. rooftop_sofa -> rooftopSofa)
    for (const item of CATALOGUE) {
      const spriteKey = item.spriteKey || item.sprite || item.id;
      if (spriteKey !== item.id && FURNITURE_BUILDERS[spriteKey]) {
        const fn = FURNITURE_BUILDERS[spriteKey];
        for (let rot = 0; rot < 4; rot++) {
          const sprAll = fn(rot, 'all');
          const bmpAll = spriteToRgbaBitmap(sprAll, { offVariant: false });
          register(`furn:${item.id}:${rot}:all`, bmpAll);
          if (rot === 0) rot0Bitmaps.set(item.id, bmpAll);
          register(`furn:${item.id}:${rot}:back`, spriteToRgbaBitmap(fn(rot, 'back'), { offVariant: false }));
          register(`furn:${item.id}:${rot}:front`, spriteToRgbaBitmap(fn(rot, 'front'), { offVariant: false }));
          register(`furn:${item.id}:${rot}:all:off`, spriteToRgbaBitmap(sprAll, { offVariant: true }));
        }
      }
    }

    // 2. Item icons for every CATALOGUE item
    for (const item of CATALOGUE) {
      const spriteKey = item.spriteKey || item.sprite || item.id;
      const fn = FURNITURE_BUILDERS[spriteKey] || FURNITURE_BUILDERS.stool;
      const baseBmp = rot0Bitmaps.get(item.id) || rot0Bitmaps.get(spriteKey) || spriteToRgbaBitmap(fn(0, 'all'));
      register(`icon:${item.id}`, makeIconBitmap(baseBmp, detail));
    }

    // 3. Floor tiles across FLOOR_MATERIALS and per-room palettes
    const floorMatList = Array.isArray(FLOOR_MATERIALS) ? FLOOR_MATERIALS : Object.keys(FLOOR_MATERIALS);
    for (const mat of [...floorMatList].sort()) {
      for (let variant = 0; variant < 2; variant++) {
        const spr = buildFloorTile('#e8dcc8', variant, mat);
        const bmp = spriteToRgbaBitmap(spr);
        register(`floor:mat:${mat}:${variant}`, bmp);
        register(`floor:mat:${mat}:${variant}:0`, bmp);
        register(`floor:mat:${mat}:${variant}:1`, bmp);
      }
    }
    for (const room of Object.values(ROOMS)) {
      const zt = room.zoneTiles;
      for (let variant = 0; variant < 2; variant++) {
        const sprBase = buildFloorTile(room.floorColor, variant, room.floorMaterial || 'marble');
        const bmpBase = spriteToRgbaBitmap(sprBase);
        register(`floor:room:${room.id}:base:${variant}`, bmpBase);
        register(`floor:room:${room.id}:${variant}`, bmpBase);
        register(`floor:room:${room.id}:${variant}:0`, bmpBase);
        register(`floor:room:${room.id}:${variant}:1`, bmpBase);

        if (zt) {
          const zColor = zt.color || room.floorColor;
          const zMat = zt.material || room.floorMaterial || 'marble';
          const sprZone = buildFloorTile(zColor, variant, zMat);
          register(`floor:room:${room.id}:zone:${variant}`, spriteToRgbaBitmap(sprZone));
        }

        if (room.zones) {
          for (let zi = 0; zi < room.zones.length; zi++) {
            const z = room.zones[zi];
            const zColor = z.color || room.floorColor;
            const zMat = z.material || room.floorMaterial || 'marble';
            const sprSub = buildFloorTile(zColor, variant, zMat);
            register(`floor:room:${room.id}:subzone:${zi}:${variant}`, spriteToRgbaBitmap(sprSub));
          }
        }
      }
      register(`tile:door:room:${room.id}`, spriteToRgbaBitmap(buildDoorTile(room.floorColor)));
      register(`tile:elevator:room:${room.id}`, spriteToRgbaBitmap(buildElevatorTile(room.floorColor)));
    }
    register('tile:door', spriteToRgbaBitmap(buildDoorTile()));
    register('tile:elevator', spriteToRgbaBitmap(buildElevatorTile()));

    // 4. Wall, window, door, skirting, balustrade, and edge rail segments
    for (const dir of ['north', 'west']) {
      const wallDef = spriteToRgbaBitmap(buildWallSegment('#d8d0c4', dir));
      register(`wall:default:${dir}`, wallDef);
      register(`skirting:default:${dir}`, makeSkirtingBitmap(wallDef, detail));
      register(`window:default:${dir}`, spriteToRgbaBitmap(buildWindowSegment('#d8d0c4', { top: '#8fd0ff', bottom: '#fff6c9' }, dir)));
      register(`door:default:${dir}`, spriteToRgbaBitmap(buildDoorSegment('#d8d0c4', dir)));
      register(`elevator_door:default:${dir}`, spriteToRgbaBitmap(buildElevatorDoorSegment('#d8d0c4', dir)));
      register(`stairwell_door:default:${dir}`, spriteToRgbaBitmap(buildStairwellDoorSegment('#d8d0c4', dir)));
      register(`balustrade:default:${dir}`, spriteToRgbaBitmap(buildGlassBalustradeSegment('#d8d0c4', dir)));
      register(`edge_rail:default:${dir}`, spriteToRgbaBitmap(buildEdgeRailSegment('#d8d0c4', dir)));

      for (const room of Object.values(ROOMS)) {
        const wCol = room.wallColor || '#d8d0c4';
        const roomWall = spriteToRgbaBitmap(buildWallSegment(wCol, dir));
        register(`wall:room:${room.id}:${dir}`, roomWall);
        register(`skirting:room:${room.id}:${dir}`, makeSkirtingBitmap(roomWall, detail));
        register(`window:room:${room.id}:${dir}`, spriteToRgbaBitmap(buildWindowSegment(wCol, { top: '#8fd0ff', bottom: '#fff6c9' }, dir)));
        register(`door:room:${room.id}:${dir}`, spriteToRgbaBitmap(buildDoorSegment(wCol, dir)));
        register(`elevator_door:room:${room.id}:${dir}`, spriteToRgbaBitmap(buildElevatorDoorSegment(wCol, dir)));
        register(`stairwell_door:room:${room.id}:${dir}`, spriteToRgbaBitmap(buildStairwellDoorSegment(wCol, dir)));
      }
    }

    return {
      detail,
      frames,
      uniqueBitmaps: Array.from(uniqueByHash.values()),
    };
  } finally {
    setDetail(prevDetail);
  }
}

export function buildContactSheet({ frames, cols = 12, cellW = 72, cellH = 84 }) {
  // Select representative frames: 1 per furniture builder (rot 0 all) + sample wall/window/door/floor
  const selected = [];
  for (const f of frames) {
    if (f.name.endsWith(':0:all') && f.name.startsWith('furn:')) {
      selected.push(f);
    } else if (
      f.name === 'wall:default:north' ||
      f.name === 'window:default:north' ||
      f.name === 'door:default:north' ||
      f.name === 'skirting:default:north' ||
      f.name === 'floor:mat:lobby_marble:0:0' ||
      f.name === 'floor:mat:dark_parquet:0:0'
    ) {
      selected.push(f);
    }
  }
  const rows = Math.max(1, Math.ceil(selected.length / cols));
  const width = cols * cellW;
  const height = rows * cellH;
  const rgba = new Uint8Array(width * height * 4);

  // Fill dark neutral checkerboard background so silhouette & outline contrast are obvious
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const check = ((x >> 3) + (y >> 3)) & 1;
      const v = check ? 48 : 38;
      const idx = (y * width + x) * 4;
      rgba[idx] = v;
      rgba[idx + 1] = v + 2;
      rgba[idx + 2] = v + 8;
      rgba[idx + 3] = 255;
    }
  }

  selected.forEach((entry, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const cellX = col * cellW;
    const cellY = row * cellH;
    const bmp = entry.bmp;
    const scale = Math.min((cellW - 6) / bmp.w, (cellH - 6) / bmp.h, 1);
    const drawW = Math.max(1, Math.round(bmp.w * scale));
    const drawH = Math.max(1, Math.round(bmp.h * scale));
    const ox = cellX + Math.floor((cellW - drawW) / 2);
    const oy = cellY + Math.floor((cellH - drawH) / 2);

    for (let dy = 0; dy < drawH; dy++) {
      const sy = Math.min(bmp.h - 1, Math.floor(dy / scale));
      for (let dx = 0; dx < drawW; dx++) {
        const sx = Math.min(bmp.w - 1, Math.floor(dx / scale));
        const si = (sy * bmp.w + sx) * 4;
        const a = bmp.rgba[si + 3];
        if (a === 0) continue;
        const di = ((oy + dy) * width + (ox + dx)) * 4;
        if (a === 255) {
          rgba[di] = bmp.rgba[si];
          rgba[di + 1] = bmp.rgba[si + 1];
          rgba[di + 2] = bmp.rgba[si + 2];
          rgba[di + 3] = 255;
        } else {
          const inv = 255 - a;
          rgba[di] = (bmp.rgba[si] * a + rgba[di] * inv) >> 8;
          rgba[di + 1] = (bmp.rgba[si + 1] * a + rgba[di + 1] * inv) >> 8;
          rgba[di + 2] = (bmp.rgba[si + 2] * a + rgba[di + 2] * inv) >> 8;
          rgba[di + 3] = 255;
        }
      }
    }
  });

  // Also build an 8x nearest-neighbour upscale of the top 4x3 grid (so the 8x PNG stays compact and fast to inspect)
  const cropCols = Math.min(cols, 6);
  const cropRows = Math.min(rows, 4);
  const cropW = cropCols * cellW;
  const cropH = cropRows * cellH;
  const scale8 = 8;
  const w8 = cropW * scale8;
  const h8 = cropH * scale8;
  const rgba8 = new Uint8Array(w8 * h8 * 4);
  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      const si = (y * width + x) * 4;
      const r = rgba[si];
      const g = rgba[si + 1];
      const b = rgba[si + 2];
      const a = rgba[si + 3];
      for (let dy = 0; dy < scale8; dy++) {
        for (let dx = 0; dx < scale8; dx++) {
          const di = ((y * scale8 + dy) * w8 + (x * scale8 + dx)) * 4;
          rgba8[di] = r;
          rgba8[di + 1] = g;
          rgba8[di + 2] = b;
          rgba8[di + 3] = a;
        }
      }
    }
  }

  return {
    sheet1x: { width, height, png: encodePNG(width, height, rgba) },
    sheet8x: { width: w8, height: h8, png: encodePNG(w8, h8, rgba8) },
    itemCount: selected.length,
  };
}

export function buildAtlas(opts = {}) {
  const outDir = opts.outDir || path.join(ROOT, 'atlas');
  const contactOutDir = opts.contactOutDir || null;
  fs.mkdirSync(outDir, { recursive: true });

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const manifest = {
    version: pkg.version,
    generatedAt: new Date().toISOString(),
    maxPageDim: MAX_PAGE_DIM,
    padding: PADDING,
    totalFrames: 0,
    totalUniqueBitmaps: 0,
    totalPages: 0,
    totalBytes: 0,
    detail: {},
  };

  let lowFramesForContact = null;

  for (const detail of [1, 2]) {
    const tag = detail === 1 ? 'low' : 'high';
    const collected = collectDetailFrames(detail);
    if (detail === 1) lowFramesForContact = collected.frames;
    const pages = packBitmapsIntoPages(collected.uniqueBitmaps, MAX_PAGE_DIM, PADDING);

    // Map each bitmap hash to its page index and placement
    const hashToPagePlacement = new Map();
    for (const p of pages) {
      for (const [hash, rect] of p.placements.entries()) {
        hashToPagePlacement.set(hash, { pageIndex: p.index, rect });
      }
    }

    // Group frame entries per page
    const pageFrames = pages.map(() => ({}));
    const frameIndex = {};
    for (const { name, bmp } of collected.frames) {
      const found = hashToPagePlacement.get(bmp.hash);
      if (!found) throw new Error(`Missing placement for frame ${name}`);
      const { pageIndex, rect } = found;
      const anchorX = Number((bmp.ax / bmp.w).toFixed(6));
      const anchorY = Number((bmp.ay / bmp.h).toFixed(6));
      pageFrames[pageIndex][name] = {
        frame: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: rect.w, h: rect.h },
        sourceSize: { w: rect.w, h: rect.h },
        anchor: { x: anchorX, y: anchorY },
        pivot: { x: bmp.ax, y: bmp.ay },
      };
      frameIndex[name] = {
        page: `atlas-${tag}-${pageIndex}.json`,
        image: `atlas-${tag}-${pageIndex}.png`,
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: rect.h,
        ax: bmp.ax,
        ay: bmp.ay,
      };
    }

    const pageSummaries = [];
    for (const p of pages) {
      const pngName = `atlas-${tag}-${p.index}.png`;
      const jsonName = `atlas-${tag}-${p.index}.json`;
      const pngBuf = encodePNG(p.width, p.height, p.rgba);
      fs.writeFileSync(path.join(outDir, pngName), pngBuf);

      const sheetJson = {
        frames: pageFrames[p.index],
        meta: {
          app: 'pixel-hotel-atlas-builder',
          version: pkg.version,
          detail,
          image: pngName,
          format: 'RGBA8888',
          size: { w: p.width, h: p.height },
          scale: '1',
        },
      };
      fs.writeFileSync(path.join(outDir, jsonName), JSON.stringify(sheetJson, null, 2) + '\n');

      manifest.totalBytes += pngBuf.length;
      pageSummaries.push({
        index: p.index,
        image: pngName,
        json: jsonName,
        width: p.width,
        height: p.height,
        bytes: pngBuf.length,
        uniqueBitmaps: p.uniqueCount,
        frameCount: Object.keys(pageFrames[p.index]).length,
      });
    }

    manifest.totalFrames += collected.frames.length;
    manifest.totalUniqueBitmaps += collected.uniqueBitmaps.length;
    manifest.totalPages += pages.length;
    manifest.detail[detail] = {
      tag,
      detail,
      frameCount: collected.frames.length,
      uniqueBitmapCount: collected.uniqueBitmaps.length,
      pages: pageSummaries,
      frames: frameIndex,
    };
  }

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  if (contactOutDir && lowFramesForContact) {
    fs.mkdirSync(contactOutDir, { recursive: true });
    const contact = buildContactSheet({ frames: lowFramesForContact });
    fs.writeFileSync(path.join(contactOutDir, 'atlas_contact_1x.png'), contact.sheet1x.png);
    fs.writeFileSync(path.join(contactOutDir, 'atlas_contact_8x.png'), contact.sheet8x.png);
  }

  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let outDir = path.join(ROOT, 'atlas');
  let contactOutDir = null;
  for (const a of args) {
    if (a.startsWith('--contact-dir=')) {
      contactOutDir = path.resolve(a.slice('--contact-dir='.length));
    } else if (!a.startsWith('--')) {
      outDir = path.resolve(a);
    }
  }
  const t0 = Date.now();
  const manifest = buildAtlas({ outDir, contactOutDir });
  const elapsed = Date.now() - t0;
  console.log(
    `Built atlas in ${elapsed}ms -> ${outDir} (pages=${manifest.totalPages}, frames=${manifest.totalFrames}, unique=${manifest.totalUniqueBitmaps}, size=${(manifest.totalBytes / (1024 * 1024)).toFixed(2)} MB)`,
  );
  for (const d of [1, 2]) {
    const info = manifest.detail[d];
    for (const p of info.pages) {
      console.log(
        `  [DETAIL=${d}] ${p.image} (${p.width}x${p.height}, ${(p.bytes / 1024).toFixed(1)} KB, frames=${p.frameCount}, unique=${p.uniqueBitmaps})`,
      );
    }
  }
}
