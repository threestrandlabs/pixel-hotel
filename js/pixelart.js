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
export function materialRamp(hexcol) {
  const norm = String(hexcol).toLowerCase();
  if (rampCache.has(norm)) return rampCache.get(norm);
  const [r, g, b] = hexToRgb(norm);
  const [h, l, s] = rgbToHls(r, g, b);

  const mk = (hh, ds, dl, minl = 0.045) => {
    const nl = Math.max(minl, Math.min(0.97, l + dl));
    const ns = Math.max(0.0, Math.min(1.0, s + ds));
    return hlsToRgb(hh, nl, ns);
  };

  const topRgb = mk(towards(h, 0.15, 0.022), -0.05, +0.085);
  const leftRgb = [r, g, b];
  const rightRgb = mk(towards(h, 0.72, 0.035), +0.05, -0.20);
  const lineRgb = midToneOutline([r, g, b], 0.70);

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
