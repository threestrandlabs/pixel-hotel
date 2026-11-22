// scripts/node-canvas-shim.mjs
// Minimal CanvasRenderingContext2D-alike backed by a plain RGBA pixel buffer, just
// enough of the API surface for js/render.js's exterior city drawing (fillRect, the
// fillPoly/strokeCrispLine scanline helpers, save/restore/clip/transform, and a handful
// of decorative stroke/arc/ellipse calls) to run outside a browser. No smoothing is ever
// applied, so output pixel-for-pixel reflects the drawing logic with zero AA.
function parseColor(c) {
  if (!c) return [0, 0, 0, 255];
  if (c.startsWith('#')) {
    const n = c.length === 4
      ? c.slice(1).split('').map((ch) => parseInt(ch + ch, 16))
      : [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    return [n[0], n[1], n[2], 255];
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(',').map((s) => parseFloat(s));
    return [parts[0], parts[1], parts[2], Math.round((parts[3] ?? 1) * 255)];
  }
  return [0, 0, 0, 255];
}

export function makeNodeCanvas(w, h) {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < buf.length; i += 4) buf[i + 3] = 255; // opaque black base
  let t = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const stack = [];
  let clipRect = { x0: 0, y0: 0, x1: w, y1: h };
  let path = [];
  let cur = null;

  const setPixel = (x, y, rgba) => {
    x = Math.round(x); y = Math.round(y);
    if (x < clipRect.x0 || x >= clipRect.x1 || y < clipRect.y0 || y >= clipRect.y1) return;
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const o = (y * w + x) * 4;
    const a = (rgba[3] / 255) * ctx.globalAlpha;
    if (a >= 1) { buf[o] = rgba[0]; buf[o + 1] = rgba[1]; buf[o + 2] = rgba[2]; buf[o + 3] = 255; return; }
    buf[o] = buf[o] * (1 - a) + rgba[0] * a;
    buf[o + 1] = buf[o + 1] * (1 - a) + rgba[1] * a;
    buf[o + 2] = buf[o + 2] * (1 - a) + rgba[2] * a;
  };
  const tx = (x, y) => [t.a * x + t.c * y + t.e, t.b * x + t.d * y + t.f];

  const ctx = {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
    setTransform(a, b, c, d, e, f) { t = { a, b, c, d, e, f }; },
    getTransform() { return { ...t }; },
    save() { stack.push({ t: { ...t }, clipRect: { ...clipRect } }); },
    restore() { const s = stack.pop(); if (s) { t = s.t; clipRect = s.clipRect; } },
    fillRect(x, y, ww, hh) {
      const rgba = parseColor(ctx.fillStyle);
      const [x0, y0] = tx(x, y);
      const [x1, y1] = tx(x + ww, y + hh);
      const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
      const ya = Math.min(y0, y1), yb = Math.max(y0, y1);
      for (let yy = Math.floor(ya); yy < Math.ceil(yb); yy++) {
        for (let xx = Math.floor(xa); xx < Math.ceil(xb); xx++) setPixel(xx, yy, rgba);
      }
    },
    clearRect() {},
    beginPath() { path = []; cur = null; },
    moveTo(x, y) { cur = tx(x, y); path = [cur]; },
    lineTo(x, y) { cur = tx(x, y); path.push(cur); },
    closePath() { if (path.length) path.push(path[0]); },
    rect(x, y, ww, hh) {
      const p0 = tx(x, y), p1 = tx(x + ww, y), p2 = tx(x + ww, y + hh), p3 = tx(x, y + hh);
      path = [p0, p1, p2, p3, p0];
    },
    clip() {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of path) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
      clipRect = {
        x0: Math.max(clipRect.x0, Math.floor(x0)), y0: Math.max(clipRect.y0, Math.floor(y0)),
        x1: Math.min(clipRect.x1, Math.ceil(x1)), y1: Math.min(clipRect.y1, Math.ceil(y1)),
      };
    },
    fill() {
      const rgba = parseColor(ctx.fillStyle);
      if (path.length < 3) return;
      let minY = Infinity, maxY = -Infinity;
      for (const p of path) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
      for (let y = Math.floor(minY); y < Math.ceil(maxY); y++) {
        const yc = y + 0.5;
        let xa = Infinity, xb = -Infinity;
        for (let i = 0; i < path.length - 1; i++) {
          const [x1p, y1p] = path[i], [x2p, y2p] = path[i + 1];
          if ((y1p <= yc && y2p > yc) || (y2p <= yc && y1p > yc)) {
            const x = x1p + ((yc - y1p) / (y2p - y1p)) * (x2p - x1p);
            if (x < xa) xa = x; if (x > xb) xb = x;
          }
        }
        if (xb > xa) for (let x = Math.ceil(xa - 0.5); x < Math.ceil(xb - 0.5); x++) setPixel(x, y, rgba);
      }
    },
    stroke() {
      const rgba = parseColor(ctx.strokeStyle);
      for (let i = 0; i < path.length - 1; i++) {
        let [x0, y0] = path[i].map(Math.round), [x1, y1] = path[i + 1].map(Math.round);
        const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
        const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
        let err = dx + dy;
        for (;;) {
          setPixel(x0, y0, rgba);
          if (x0 === x1 && y0 === y1) break;
          const e2 = 2 * err;
          if (e2 >= dy) { err += dy; x0 += sx; }
          if (e2 <= dx) { err += dx; y0 += sy; }
        }
      }
    },
    arc(cx, cy, r) {
      const rgba = parseColor(ctx.fillStyle);
      const [px, py] = tx(cx, cy);
      const rr = r * Math.abs(t.a);
      for (let y = Math.floor(py - rr); y <= Math.ceil(py + rr); y++) {
        for (let x = Math.floor(px - rr); x <= Math.ceil(px + rr); x++) {
          if ((x - px) ** 2 + (y - py) ** 2 <= rr * rr) setPixel(x, y, rgba);
        }
      }
      path = [];
    },
    ellipse(cx, cy, rx, ry) {
      const rgba = parseColor(ctx.fillStyle);
      const [px, py] = tx(cx, cy);
      const rrx = rx * Math.abs(t.a), rry = ry * Math.abs(t.d);
      for (let y = Math.floor(py - rry); y <= Math.ceil(py + rry); y++) {
        for (let x = Math.floor(px - rrx); x <= Math.ceil(px + rrx); x++) {
          if (((x - px) / rrx) ** 2 + ((y - py) / rry) ** 2 <= 1) setPixel(x, y, rgba);
        }
      }
    },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
  };
  return { ctx, w, h, buf };
}
