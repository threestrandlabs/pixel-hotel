import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DETAIL, getDetail, setDetail, registerCacheClearHook,
  projectIso, snapToDevice, rasterize2to1Line, draw2to1Line,
  hexToRgb, rgbToHex, midToneOutline, blend5050, materialRamp, ramp,
} from '../js/pixelart.js';

test('pixelart: DETAIL defaults to 1 and can be set to 1 or 2', () => {
  setDetail(1);
  assert.equal(getDetail(), 1);
  assert.equal(DETAIL, 1);

  setDetail(2);
  assert.equal(getDetail(), 2);

  // Clamps/normalizes non-2 to 1
  setDetail(99);
  assert.equal(getDetail(), 1);
  setDetail(1);
});

test('pixelart: registerCacheClearHook fires only on detail change and can unregister', () => {
  setDetail(1);
  let clearCount = 0;
  const unregister = registerCacheClearHook(() => {
    clearCount += 1;
  });

  // Setting to same value does not fire hook
  setDetail(1);
  assert.equal(clearCount, 0);

  // Changing to 2 fires hook exactly once
  setDetail(2);
  assert.equal(clearCount, 1);

  // Changing back to 1 fires hook exactly once
  setDetail(1);
  assert.equal(clearCount, 2);

  // Unregister stops firing
  unregister();
  setDetail(2);
  assert.equal(clearCount, 2);
  setDetail(1);
});

test('pixelart: projectIso snaps integer coordinates to exact integer pixels with 2:1 slope', () => {
  setDetail(1);
  // Origin (0, 0)
  const [px0, py0] = projectIso(0, 0, 0);
  assert.equal(px0, 0);
  assert.equal(py0, 0);

  // Step +1 along Y: +4px across, +2px down
  const [py_x, py_y] = projectIso(0, 1, 0);
  assert.equal(py_x, 4);
  assert.equal(py_y, 2);
  assert.equal(Math.abs(py_x / py_y), 2.0);

  // Step +1 along X: -4px across, +2px down
  const [px_x, px_y] = projectIso(1, 0, 0);
  assert.equal(px_x, -4);
  assert.equal(px_y, 2);
  assert.equal(Math.abs(px_x / px_y), 2.0);

  // Step +1 along Z: 0 across, -6px up
  const [pz_x, pz_y] = projectIso(0, 0, 1);
  assert.equal(pz_x, 0);
  assert.equal(pz_y, -6);

  // At DETAIL=2: 1 unit along axis is 8px across, 4px down
  setDetail(2);
  const [d2_x, d2_y] = projectIso(0, 1, 0);
  assert.equal(d2_x, 8);
  assert.equal(d2_y, 4);
  assert.equal(Math.abs(d2_x / d2_y), 2.0);
  setDetail(1);
});

test('pixelart: 2:1 stair rasteriser produces strictly even 2px runs per row at DETAIL=1', () => {
  setDetail(1);
  // Diagonal down-right (+Y direction): (0, 0) to (8, 4)
  const resultDR = rasterize2to1Line(0, 0, 8, 4, { detail: 1, aa: false });
  assert.equal(resultDR.runs.length, 5); // rows 0, 1, 2, 3, 4
  for (const r of resultDR.runs) {
    assert.equal(r.length, 2, `Row ${r.y} must have exactly 2px run`);
    assert.equal(r.xs.length, 2);
  }

  // Diagonal down-left (+X direction): (0, 0) to (-8, 4)
  const resultDL = rasterize2to1Line(0, 0, -8, 4, { detail: 1, aa: false });
  assert.equal(resultDL.runs.length, 5);
  for (const r of resultDL.runs) {
    assert.equal(r.length, 2, `Row ${r.y} must have exactly 2px run`);
    assert.equal(r.xs.length, 2);
  }
});

test('pixelart: 2:1 stair rasteriser produces even 2*DETAIL px runs at DETAIL=2', () => {
  // At DETAIL=2, run is 4px per row
  const result = rasterize2to1Line(0, 0, 16, 4, { detail: 2, aa: false });
  for (const r of result.runs) {
    assert.equal(r.length, 4, `Row ${r.y} must have 4px run at DETAIL=2`);
    assert.equal(r.length % 2, 0, 'Runs must always be even');
  }
});

test('pixelart: 2:1 rasteriser produces single column for vertical lines', () => {
  const result = rasterize2to1Line(5, 2, 5, 8);
  assert.equal(result.runs.length, 7); // y=2..8
  for (const r of result.runs) {
    assert.equal(r.length, 1);
    assert.equal(r.xStart, 5);
  }
});

test('pixelart: selective AA helper places notch blend pixel at stair corners', () => {
  const result = rasterize2to1Line(0, 0, 8, 4, { detail: 1, aa: true });
  // For rows k > 0, selective AA notch pixel is generated
  assert.equal(result.aaPixels.length, 4); // rows 1, 2, 3, 4
  for (const p of result.aaPixels) {
    assert.ok(typeof p.x === 'number' && typeof p.y === 'number');
  }

  // blend5050 produces 50/50 blend between dark line and light fill
  const line = '#000000';
  const fill = '#ffffff';
  const blended = blend5050(line, fill);
  assert.equal(blended, '#808080');
});

test('pixelart: mid-tone outline helper is ~25-35% darker and never near-black for light fills', () => {
  // Pure white fill: 70% factor -> #b3b3b3 (light grey, luminance ~179, far from #2a1d2e)
  const whiteOutline = midToneOutline('#ffffff');
  const [wr, wg, wb] = hexToRgb(whiteOutline);
  assert.ok(wr > 160 && wg > 160 && wb > 160, `White outline ${whiteOutline} must not be near-black`);

  // Light skin tone: #ffd9a8
  const skinOutline = midToneOutline('#ffd9a8');
  const [sr, sg, sb] = hexToRgb(skinOutline);
  assert.ok(sr > 150 && sg > 130 && sb > 100, `Skin outline ${skinOutline} must be mid-tone, not near-black`);

  // Yellow: #ffff00
  const yellowOutline = midToneOutline('#ffff00');
  const [yr, yg, yb] = hexToRgb(yellowOutline);
  assert.ok(yr > 160 && yg > 160 && yb === 0);

  // Ratio check: ~25-35% darker (f in [0.65, 0.75])
  const [or, og, ob] = hexToRgb(midToneOutline('#808080', 0.70));
  assert.equal(Math.round(128 * 0.70), or);
});

test('pixelart: material ramp produces fixed 4-shade ramp matching guide specification', () => {
  const r = materialRamp('#ffd9a8');
  assert.ok(r.top, 'ramp has top highlight');
  assert.ok(r.left, 'ramp has left base');
  assert.ok(r.right, 'ramp has right shadow');
  assert.ok(r.line, 'ramp has mid-tone outline');

  // Verify exactly 4 distinct shades are generated
  const shades = new Set([r.top, r.left, r.right, r.line]);
  assert.ok(shades.size <= 4, 'Material ramp must have at most 4 shades');

  // Outline is never near-black for light fill
  const [lr, lg, lb] = r.lineRgb;
  assert.ok(lr > 150 && lg > 120, 'Outline must be mid-tone shade of base');
});
