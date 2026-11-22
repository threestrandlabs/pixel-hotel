// Bake-context pixel snapping for the city backdrop (see main.js performBackgroundBake).
// At a bake scale below 1 a canvas fillRect blends edge coverage into in-between shades, which
// reads as soft. snapBakeCtx replaces fillRect on one context with a version that lands on whole
// bake pixels, so the output stays hard-edged. Rects sample bake-pixel centres (fillPoly's 1px
// scanline rows therefore become true 2:1 stairs at the bake resolution); 1px dots (outline
// pixels) keep one bake pixel; thin poles (>= 2px) keep at least one. At scale 1 it restores the
// native fillRect. `g.lowBake` tells render.js when it is drawing into a sub-1 bake.
export function snapBakeCtx(g, scale) {
  if (!g.rawFillRect) g.rawFillRect = g.fillRect;
  const raw = g.rawFillRect;
  g.lowBake = scale < 1;
  if (scale >= 1) { g.fillRect = raw; g.bakeT = null; return; }
  const t = g.getTransform();
  const { a, d, e, f } = t;
  const invA = 1 / a;
  const invD = 1 / d;
  g.bakeT = t;
  g.fillRect = function snappedFillRect(x, y, w, h) {
    const X0 = a * x + e;
    const Y0 = d * y + f;
    const X1 = a * (x + w) + e;
    const Y1 = d * (y + h) + f;
    let x0 = Math.ceil(X0 - 0.5);
    let x1 = Math.ceil(X1 - 0.5);
    let y0 = Math.ceil(Y0 - 0.5);
    let y1 = Math.ceil(Y1 - 0.5);
    if (w <= 1 && h <= 1) { x0 = Math.round(X0); y0 = Math.round(Y0); x1 = x0 + 1; y1 = y0 + 1; }
    if (x1 <= x0 && w >= 2) { x0 = Math.round(X0); x1 = x0 + 1; }
    if (y1 <= y0 && h >= 2) { y0 = Math.round(Y0); y1 = y0 + 1; }
    if (x1 <= x0 || y1 <= y0) return;
    raw.call(this, (x0 - e) * invA, (y0 - f) * invD, (x1 - x0) * invA, (y1 - y0) * invD);
  };
}
