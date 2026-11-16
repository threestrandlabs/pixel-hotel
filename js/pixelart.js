// js/pixelart.js
// Shared pixel-art projection, outline, selective AA, and ramp helpers.
// Reference: /workspace/sprite-mock/agy_library/core.py (guide Parts 1, 4, 8)

export let DETAIL = 1;

export function getDetail() {
  return DETAIL;
}

const cacheClearHooks = new Set();

export function registerCacheClearHook(fn) {
  cacheClearHooks.add(fn);
  return () => cacheClearHooks.delete(fn);
}

export function notifyCacheClearHooks() {
  for (const fn of cacheClearHooks) {
    try {
      fn();
    } catch (e) {
      // Ignore hook errors to prevent breaking render loop
    }
  }
}

export function setDetail(val) {
  const next = Number(val) === 2 ? 2 : 1;
  const changed = next !== DETAIL;
  DETAIL = next;
  if (changed) {
    notifyCacheClearHooks();
  }
  return DETAIL;
}

// Snapped 2:1 isometric projection: 1 unit along axis = 4*detail across, 2*detail down.
export function projectIso(x, y, z, ox = 0, oy = 0, detail = DETAIL) {
  const d = detail || 1;
  const px = Math.round(ox + (y - x) * 4 * d);
  const py = Math.round(oy + (x + y) * 2 * d - z * 6 * d);
  return [px, py];
}

export function snapToDevice(val, detail = DETAIL) {
  const d = detail || 1;
  return Math.round(val * d) / d;
}

// 2:1 stair line rasteriser: runs of exactly 2*detail pixels per row, verticals single column.
export function rasterize2to1Line(x0, y0, x1, y1, { detail = DETAIL, aa = false } = {}) {
  let ix0 = Math.round(x0);
  let iy0 = Math.round(y0);
  let ix1 = Math.round(x1);
  let iy1 = Math.round(y1);
  const d = detail || 1;

  // Vertical line: single column of pixels
  if (ix0 === ix1) {
    const yStart = Math.min(iy0, iy1);
    const yEnd = Math.max(iy0, iy1);
    const runs = [];
    const pixels = [];
    for (let y = yStart; y <= yEnd; y++) {
      runs.push({ y, xs: [ix0], xStart: ix0, length: 1 });
      pixels.push({ x: ix0, y });
    }
    return { runs, pixels, aaPixels: [] };
  }

  // Diagonal 2:1 line: ensure top-to-bottom scan
  if (iy0 > iy1) {
    const tx = ix0; ix0 = ix1; ix1 = tx;
    const ty = iy0; iy0 = iy1; iy1 = ty;
  }

  const stepX = ix1 > ix0 ? 1 : -1;
  const run = 2 * d;
  const runs = [];
  const pixels = [];
  const aaPixels = [];

  for (let y = iy0; y <= iy1; y++) {
    const k = y - iy0;
    const xStart = stepX > 0 ? (ix0 + run * k) : (ix0 - run * k - run);
    const xs = [];
    for (let i = 0; i < run; i++) {
      const x = xStart + i;
      xs.push(x);
      pixels.push({ x, y });
    }
    runs.push({ y, xs, xStart, length: run });

    // Selective AA notch on diagonal stair steps (k > 0)
    if (aa && k > 0) {
      const notchX = stepX > 0 ? (xStart - 1) : (xStart + run);
      aaPixels.push({ x: notchX, y });
    }
  }

  return { runs, pixels, aaPixels };
}

export function draw2to1Line(ctx, x0, y0, x1, y1, lineColor, { fillColor = null, aa = false, detail = DETAIL } = {}) {
  const { runs, aaPixels } = rasterize2to1Line(x0, y0, x1, y1, { detail, aa: aa && !!fillColor });
  ctx.fillStyle = lineColor;
  for (const r of runs) {
    ctx.fillRect(r.xStart, r.y, r.length, 1);
  }
  if (aa && fillColor && aaPixels.length > 0) {
    ctx.fillStyle = blend5050(lineColor, fillColor);
    for (const p of aaPixels) {
      ctx.fillRect(p.x, p.y, 1, 1);
    }
  }
}

export function hexToRgb(h) {
  if (!h || typeof h !== 'string') return [0, 0, 0];
  const hex = h.replace(/^#/, '');
  if (hex.length === 3) {
    return [
      parseInt(hex[0] + hex[0], 16),
      parseInt(hex[1] + hex[1], 16),
      parseInt(hex[2] + hex[2], 16),
    ];
  }
  const num = parseInt(hex.slice(0, 6), 16);
  if (Number.isNaN(num)) return [0, 0, 0];
  return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
}

export function rgbToHex(rgb) {
  const [r, g, b] = rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

// Darker shade of adjacent fill (~25-35% darker, same hue, never near-black).
export function midToneOutline(color, factor = 0.70) {
  const isStr = typeof color === 'string';
  const rgb = isStr ? hexToRgb(color) : color;
  const [r, g, b] = rgb;
  const f = Math.max(0.5, Math.min(0.85, factor));
  const outRgb = [Math.round(r * f), Math.round(g * f), Math.round(b * f)];
  return isStr ? rgbToHex(outRgb) : outRgb;
}

// Selective AA helper: 50/50 blend between line outline tone and fill tone.
export function blend5050(colorA, colorB) {
  const isStr = typeof colorA === 'string';
  const rgbA = isStr ? hexToRgb(colorA) : colorA;
  const rgbB = typeof colorB === 'string' ? hexToRgb(colorB) : colorB;
  const out = [
    Math.round(0.5 * rgbA[0] + 0.5 * rgbB[0]),
    Math.round(0.5 * rgbA[1] + 0.5 * rgbB[1]),
    Math.round(0.5 * rgbA[2] + 0.5 * rgbB[2]),
  ];
  return isStr ? rgbToHex(out) : out;
}

function rgbToHls(r, g, b) {
  const nr = r / 255;
  const ng = g / 255;
  const nb = b / 255;
  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);
  let h = 0;
  const l = (max + min) / 2;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case nr: h = (ng - nb) / d + (ng < nb ? 6 : 0); break;
      case ng: h = (nb - nr) / d + 2; break;
      case nb: h = (nr - ng) / d + 4; break;
    }
    h /= 6;
  }
  return [h, l, s];
}

function hue2rgb(p, q, t) {
  let nt = t;
  if (nt < 0) nt += 1;
  if (nt > 1) nt -= 1;
  if (nt < 1 / 6) return p + (q - p) * 6 * nt;
  if (nt < 1 / 2) return q;
  if (nt < 2 / 3) return p + (q - p) * (2 / 3 - nt) * 6;
  return p;
}

function hlsToRgb(h, l, s) {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hue2rgb(p, q, h + 1 / 3);
  const g = hue2rgb(p, q, h);
  const b = hue2rgb(p, q, h - 1 / 3);
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function towards(h, t, amt) {
  const d = ((t - h + 1.5) % 1.0) - 0.5;
  const sign = d > 0 ? 1.0 : (d < 0 ? -1.0 : 0.0);
  return (h + sign * Math.min(Math.abs(d), amt) + 1.0) % 1.0;
}

const rampCache = new Map();

// Fixed 4-tone hue-shifted material ramp: top=highlight, left=base, right=shadow, line=mid-tone outline.
// Preserves hue within a few degrees, never boosts HSL saturation, and guarantees top > left > right > line lightness.
export function materialRamp(hexcol) {
  const norm = String(hexcol).toLowerCase();
  if (rampCache.has(norm)) return rampCache.get(norm);
  const [r, g, b] = hexToRgb(norm);
  const [h, l, s] = rgbToHls(r, g, b);
  const C = s * (1 - Math.abs(2 * l - 1));

  const shadeAtL = (nl, hTarget, hAmt, cScale = 0.98) => {
    const ratio = l > 1e-6 ? Math.min(1, nl / l) : 0;
    const nC = C * ratio * cScale;
    const denom = 1 - Math.abs(2 * nl - 1);
    const ns = denom > 1e-6 ? Math.min(s * cScale, nC / denom) : 0;
    const nh = C > 0.12 ? towards(h, hTarget, hAmt) : h;
    return hlsToRgb(nh, nl, ns);
  };

  const topL = Math.min(0.995, Math.max(l + 0.018, l + (0.995 - l) * 0.24));
  const rightL = Math.max(0.016, Math.min(l - 0.015, l * 0.702));
  const lineL = Math.max(0.006, Math.min(rightL - 0.012, l * 0.61));

  const topH = C > 0.12 ? towards(h, 0.15, 0.008) : h;
  const topRgb = hlsToRgb(topH, topL, Math.max(0, s - 0.05));
  const leftRgb = [r, g, b];
  const rightRgb = shadeAtL(rightL, 0.72, 0.002, 0.96);
  const lineRgb = shadeAtL(lineL, 0.72, 0.005, 0.94);

  const result = {
    top: rgbToHex(topRgb),
    left: rgbToHex(leftRgb),
    right: rgbToHex(rightRgb),
    line: rgbToHex(lineRgb),
    topRgb,
    leftRgb,
    rightRgb,
    lineRgb,
  };
  rampCache.set(norm, result);
  return result;
}

export const ramp = materialRamp;

const skinRampCache = new Map();

// Skin ramp per guide 1.3, 4.1, 8.12: side face (right) is ~18% darker same hue (e.g. #f0c49a -> #c5a17e).
export function skinRamp(hexcol) {
  const norm = String(hexcol).toLowerCase();
  if (skinRampCache.has(norm)) return skinRampCache.get(norm);
  const base = materialRamp(norm);
  const [r, g, b] = base.leftRgb;
  const rightRgb = [Math.round(r * 0.821), Math.round(g * 0.821), Math.round(b * 0.821)];
  const result = {
    top: base.top,
    left: base.left,
    right: rgbToHex(rightRgb),
    line: base.line,
    topRgb: base.topRgb,
    leftRgb: base.leftRgb,
    rightRgb,
    lineRgb: base.lineRgb,
  };
  skinRampCache.set(norm, result);
  return result;
}

// ---------- pixel textures (phase 1b, Pass 14b calm-accent recipes from texture.py) ----------
// No AA and no gradients: every texel is picked from the material's fixed 4-shade ramp
// (top / left / right / line) by a deterministic rule at bake time only.
// Speckle/dither kinds are OFF by default per locked Pass 14b style.
export const TEXTURE_KINDS = ['wood', 'upholstery', 'character', 'grain', 'dither', 'weave', 'speckle', 'carpet'];
export const TEXTURE_RULES = {
  wood: { kind: 'wood', density: 0.05, rowMod: 2, segMod: 3, enabled: true },
  upholstery: { kind: 'upholstery', density: 0.04, enabled: true },
  cloth: { kind: 'character', slot: 'shirt_torso', density: 0.05, enabled: true },
  hair: { kind: 'character', slot: 'hair_cap', density: 0.05, enabled: true },
  shoe: { kind: 'speckle', density: 0, enabled: false },
  skin: { kind: 'grain', density: 0, enabled: false },
  speckle: { kind: 'speckle', density: 0, enabled: false },
  dither: { kind: 'dither', density: 0, enabled: false },
  weave: { kind: 'weave', density: 0, enabled: false },
  carpet: { kind: 'carpet', density: 0, enabled: false },
  plain: { kind: 'speckle', density: 0, enabled: false },
};

// Highlight pixels on top edges/corners (guide: a few hand-placed pixels, never a gradient).
export const HIGHLIGHT_RULES = { wood: true, upholstery: true, cloth: true, hair: true, shoe: false, skin: false };

const BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

// Deterministic 31-bit integer hash matching texture.py hash2d(x, y, seed).
export function hash2d(x, y, seed = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 12741261)) & 0x7fffffff;
  h = Math.imul(h ^ (h >>> 13), 12741261) & 0x7fffffff;
  return (h ^ (h >>> 16)) & 0x7fffffff;
}

// Deterministic 2D integer hash -> [0,1).
export function hash2(x, y, seed = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Port of texture.py _streaks(iu, iv, s, n, row_mod, seg_mod, row_step=2):
// Sparse broken wood grain (4-10px streaks at n=4, 2-5px at n=2, staggered per row).
export function woodStreak(iu, iv, seed = 0, { detail = DETAIL, rowMod = 2, segMod = 3, rowStep = 2 } = {}) {
  const n = 2 * (detail || 1);
  const L = Math.max(3, Math.floor((6 * n) / 4));
  const off = hash2d(iv, 3, seed) % L;
  const k = Math.floor((iu + off) / L);
  const pos = (((iu + off) % L) + L) % L;
  const rowOn = (iv % rowStep === 0) && (hash2d(Math.floor(iv / rowStep), 5, seed) % rowMod === 0);
  const segOn = (hash2d(k, iv, seed + 7) % segMod === 0);
  const ln = Math.max(1, Math.floor(((2 + (hash2d(k, iv, seed + 11) % 4)) * n) / 4));
  return rowOn && segOn && pos < ln;
}

// Port of texture.py wood(): sparse broken grain on top/left faces, faint hint on right, rim on lit top edge.
export function woodTexel(iu, iv, base = 'left', { detail = DETAIL, seed = 17, isRim = false } = {}) {
  if (base === 'top') {
    return woodStreak(iu, iv, seed + 202, { detail, rowMod: 2, segMod: 3 }) ? 'left' : null;
  }
  if (base === 'left') {
    if (isRim) return 'top';
    return woodStreak(iu, iv, seed + 101, { detail, rowMod: 2, segMod: 3 }) ? 'line' : null;
  }
  if (base === 'right') {
    return woodStreak(iu, iv, seed + 303, { detail, rowMod: 4, segMod: 5 }) ? 'line' : null;
  }
  return null;
}

// Port of texture.py upholstery(): near-flat fabric with 1px top-edge highlight row, optional 1px seam, and shadow-corner hash dither.
export function upholsteryTexel(iu, iv, base = 'left', { seed = 19, isRim = false, isSeam = false, du = 99, dv = 99 } = {}) {
  if (base === 'top') return isSeam ? 'left' : null;
  if (base === 'left') return isRim ? 'top' : null;
  if (base === 'right') {
    if (isRim) return 'left';
    const h = hash2d(iu, iv, seed) % 100;
    if ((du < 4 && dv < 3 && h < 45) || (dv === 0 && h < 20)) return 'line';
  }
  return null;
}

// Port of texture.py character(): small highlight cluster on hair_cap top, subtle broken 1-row waist crease on shirt_torso.
export function characterTexel(slot, iu, iv, base = 'left', { detail = DETAIL, cu = 0, cv = 0, hz = 0, lx } = {}) {
  if (slot === 'hair_cap' && base === 'top') {
    const du = iu - cu;
    const dv = iv - cv;
    return (du * du + dv * dv) <= 2 * (detail || 1) ? 'top' : null;
  }
  if (slot === 'shirt_torso' && base === 'left') {
    const inCreaseX = lx === undefined || (lx >= -1.45 && lx <= -0.45) || (lx >= 0.55 && lx <= 1.25);
    return (hz >= 6.45 && hz <= 6.55 && inCreaseX) ? 'right' : null;
  }
  return null;
}

// Shade a texel one ramp step lighter / darker than the face's base shade.
const LIGHTER = { top: null, left: 'top', right: 'left', line: 'right' };
const DARKER = { top: 'left', left: 'right', right: 'line', line: null };

// Returns the ramp key to paint at texel (x, y) over a face whose base shade is `base`, or null.
export function texelKey(kind, x, y, base = 'left', opts = {}) {
  const { density = 0.2, seed = 0, detail = DETAIL } = opts;
  const light = LIGHTER[base];
  const dark = DARKER[base];
  const pick = (h2) => (h2 < 0.5 ? (light || dark) : (dark || light));
  switch (kind) {
    case 'wood':
      return woodTexel(x, y, base, { detail, seed, isRim: opts.isRim });
    case 'upholstery':
      return upholsteryTexel(x, y, base, { seed, isRim: opts.isRim, isSeam: opts.isSeam, du: opts.du, dv: opts.dv });
    case 'character':
      return characterTexel(opts.slot || 'shirt_torso', x, y, base, { detail, cu: opts.cu, cv: opts.cv, hz: opts.hz });
    case 'dither':
      return density > 0 && (BAYER4[y & 3][x & 3] + 0.5) / 16 < density ? (light || dark) : null;
    case 'speckle': {
      if (density <= 0) return null;
      const h = hash2(x, y, seed);
      return h < density ? pick(hash2(y, x, seed + 7)) : null;
    }
    case 'grain':
      return density > 0 && hash2(x >> 2, y, seed) < density ? ((y & 1) ? (dark || light) : (light || dark)) : null;
    case 'weave': {
      if (density <= 0 || ((x + ((y & 1) ? 2 : 0)) & 3) !== 0) return null;
      return hash2(x, y, seed) < density * 1.2 ? (light || dark) : null;
    }
    case 'carpet':
      return density > 0 && ((x + y) & 1) === 0 && hash2(x, y, seed) < density ? (dark || light) : null;
    default:
      return null;
  }
}

function paintPixel(target, x, y, color) {
  if (typeof target.setPixel === 'function') target.setPixel(x, y, color);
  else { target.fillStyle = color; target.fillRect(x, y, 1, 1); }
}

// target: canvas 2D ctx or any { setPixel(x, y, color) }. area: {x,y,w,h} or {spans:[{y,x0,x1}]}.
// Only texels from `ramp` are emitted; the base fill is assumed to be painted already.
export function textureFill(target, area, ramp, opts = {}) {
  const { kind = 'wood', base = 'left' } = opts;
  const emit = (x, y) => {
    const k = texelKey(kind, x, y, base, opts);
    if (k && ramp[k] !== undefined) paintPixel(target, x, y, ramp[k]);
  };
  if (area.spans) {
    for (const s of area.spans) for (let x = s.x0; x < s.x1; x++) emit(x, s.y);
  } else {
    for (let y = area.y; y < area.y + area.h; y++) for (let x = area.x; x < area.x + area.w; x++) emit(x, y);
  }
}

// pts: [{x,y}] hand-placed highlight pixels (top edges / corners) in the ramp's lightest shade.
export function highlightPixels(target, pts, ramp, key = 'top') {
  if (!ramp || ramp[key] === undefined) return;
  for (const p of pts) paintPixel(target, p.x, p.y, ramp[key]);
}
