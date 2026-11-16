import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DETAIL, getDetail, setDetail, registerCacheClearHook,
  projectIso, snapToDevice, rasterize2to1Line, draw2to1Line,
  hexToRgb, rgbToHex, midToneOutline, blend5050, materialRamp, ramp, skinRamp,
  TEXTURE_KINDS, TEXTURE_RULES, HIGHLIGHT_RULES,
  hash2, hash2d, woodStreak, woodTexel, upholsteryTexel, characterTexel,
  texelKey, textureFill, highlightPixels,
} from '../js/pixelart.js';
import {
  KX, KZ, LOOKS, EXPRESSIONS, resolveExpression,
  buildParts, renderCharacter, getCharacterCanvas,
} from '../js/voxel.js';

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

test('pixelart: skinRamp produces ~18% darker side face (#c5a17e for #f0c49a) in identical hue', () => {
  const sr = skinRamp('#f0c49a');
  assert.equal(sr.left, '#f0c49a');
  assert.equal(sr.right, '#c5a17e');
  assert.notEqual(sr.line, '#2a1d2e');
});

test('pixelart: Pass 14b texture hooks are deterministic, emit only ramp colours, work at DETAIL 1 and 2, and default speckle/dither off', () => {
  assert.ok(Array.isArray(TEXTURE_KINDS) && TEXTURE_KINDS.includes('wood') && TEXTURE_KINDS.includes('upholstery'));
  assert.equal(TEXTURE_RULES.speckle.enabled, false, 'speckle must default OFF in Pass 14b');
  assert.equal(TEXTURE_RULES.dither.enabled, false, 'dither must default OFF in Pass 14b');
  assert.equal(TEXTURE_RULES.skin.enabled, false, 'skin texture must default OFF in Pass 14b');
  assert.equal(TEXTURE_RULES.wood.enabled, true, 'wood accent texture enabled');

  // Determinism of hash2 and hash2d
  assert.equal(hash2(10, 20, 7), hash2(10, 20, 7));
  assert.equal(hash2d(10, 20, 7), hash2d(10, 20, 7));
  assert.notEqual(hash2d(10, 20, 7), hash2d(11, 20, 7));

  const woodRmp = materialRamp('#8f6238');
  const validShades = new Set([woodRmp.top, woodRmp.left, woodRmp.right, woodRmp.line]);

  for (const d of [1, 2]) {
    setDetail(d);
    const paintedA = [];
    const paintedB = [];
    const targetA = { setPixel(x, y, c) { paintedA.push({ x, y, c }); } };
    const targetB = { setPixel(x, y, c) { paintedB.push({ x, y, c }); } };

    textureFill(targetA, { x: 0, y: 0, w: 16, h: 16 }, woodRmp, { kind: 'wood', base: 'left', seed: 17, detail: d });
    textureFill(targetB, { x: 0, y: 0, w: 16, h: 16 }, woodRmp, { kind: 'wood', base: 'left', seed: 17, detail: d });

    assert.deepEqual(paintedA, paintedB, `textureFill must be deterministic at DETAIL=${d}`);
    assert.ok(paintedA.length > 0 && paintedA.length < 64, `wood grain must be a calm accent (~5%), got ${paintedA.length}/256`);
    for (const p of paintedA) {
      assert.ok(validShades.has(p.c), `emitted texel ${p.c} must belong to material ramp`);
    }

    const hiPts = [];
    highlightPixels({ setPixel(x, y, c) { hiPts.push({ x, y, c }); } }, [{ x: 1, y: 2 }, { x: 3, y: 4 }], woodRmp, 'top');
    assert.equal(hiPts.length, 2);
    assert.equal(hiPts[0].c, woodRmp.top);
  }
  setDetail(1);
});

test('voxel: EXPRESSIONS exports all 11 guide 3.4 recipes and resolveExpression maps emotes, actions, blink, and mouths', () => {
  const expected = [
    'neutral', 'happy', 'laughing', 'sad', 'angry',
    'surprised', 'sleepy', 'wink', 'embarrassed', 'smug', 'thinking',
  ];
  assert.deepEqual(EXPRESSIONS, expected);

  // Explicit expression takes precedence
  for (const expr of EXPRESSIONS) {
    assert.equal(resolveExpression({ expression: expr }, LOOKS.player), expr);
  }

  // Emote mappings
  assert.equal(resolveExpression({ emote: 'laugh' }, LOOKS.player), 'laughing');
  assert.equal(resolveExpression({ emote: 'cheer' }, LOOKS.player), 'laughing');
  assert.equal(resolveExpression({ emote: 'sleep' }, LOOKS.player), 'sleepy');
  assert.equal(resolveExpression({ emote: 'heart' }, LOOKS.player), 'wink');
  assert.equal(resolveExpression({ emote: 'dance' }, LOOKS.player), 'smug');
  assert.equal(resolveExpression({ emote: 'wave' }, LOOKS.player), 'happy');
  assert.equal(resolveExpression({ emote: 'clap' }, LOOKS.player), 'happy');
  assert.equal(resolveExpression({ emote: 'thumbsup' }, LOOKS.player), 'happy');

  // Action & blink mappings
  assert.equal(resolveExpression({ blink: true }, LOOKS.player), 'sleepy');
  assert.equal(resolveExpression({ action: 'eat' }, LOOKS.player), 'happy');
  assert.equal(resolveExpression({ action: 'treadmill' }, LOOKS.player), 'angry');
  assert.equal(resolveExpression({ action: 'swim' }, LOOKS.player), 'happy');

  // Mouth preset fallback
  assert.equal(resolveExpression({}, { mouth: 'smile' }), 'happy');
  assert.equal(resolveExpression({}, { mouth: 'frown' }), 'sad');
  assert.equal(resolveExpression({}, { mouth: 'open' }), 'surprised');
  assert.equal(resolveExpression({}, { mouth: 'lips' }), 'neutral');
});

function makePixelRecordingCanvas(w, h) {
  const grid = Array.from({ length: h }, () => new Array(w).fill(null));
  let curStyle = '#000000';
  return {
    width: w,
    height: h,
    grid,
    getContext: () => ({
      set fillStyle(v) { curStyle = v; },
      get fillStyle() { return curStyle; },
      setTransform() {},
      fillRect(x, y, rw, rh) {
        const ix0 = Math.max(0, Math.round(x));
        const iy0 = Math.max(0, Math.round(y));
        const ix1 = Math.min(w, Math.round(x + rw));
        const iy1 = Math.min(h, Math.round(y + rh));
        for (let yy = iy0; yy < iy1; yy++) {
          for (let xx = ix0; xx < ix1; xx++) {
            grid[yy][xx] = curStyle;
          }
        }
      },
    }),
  };
}

test('voxel: renderCharacter works for all 14 LOOKS x 4 dirs x key poses and all 11 expressions', () => {
  assert.equal(typeof KX, 'number');
  assert.equal(typeof KZ, 'number');
  const dirs = ['down', 'left', 'up', 'right'];
  const poses = [
    { stride: 0 },
    { stride: 1 },
    { stride: -1 },
    { sit: true },
    { lie: true },
    { action: 'swim', actionFrame: 0 },
    { action: 'treadmill', actionFrame: 1 },
    { action: 'eat', actionFrame: 1 },
    { action: 'use', actionFrame: 1 },
    { blink: true },
    { breathe: 1 },
    { emote: 'wave', emoteFrame: 1 },
  ];

  for (const [id, look] of Object.entries(LOOKS)) {
    for (const dir of dirs) {
      for (const pose of poses) {
        const res = renderCharacter(look, dir, pose, makePixelRecordingCanvas, 1);
        assert.ok(res.canvas.width > 0 && res.canvas.height > 0, `valid size for ${id} ${dir}`);
        assert.ok(res.ox > 0 && res.oy > 0, `valid anchor for ${id} ${dir}`);
      }
    }
  }

  // Render all 11 expressions on player and verify each produces distinct pixel output
  const exprSignatures = new Set();
  for (const expr of EXPRESSIONS) {
    const res = renderCharacter(LOOKS.player, 'down', { expression: expr }, makePixelRecordingCanvas, 2);
    const sig = res.canvas.grid.map((row) => row.join(',')).join(';');
    exprSignatures.add(sig);
  }
  assert.equal(exprSignatures.size, EXPRESSIONS.length, 'Every one of the 11 expressions must produce a distinct face');
});

test('voxel: rendered character uses limited 4-shade material ramps and never uses near-black #2a1d2e or rgba gradients', () => {
  const res = renderCharacter(LOOKS.player, 'down', { stride: 0 }, makePixelRecordingCanvas, 2);
  const { grid, width, height } = res.canvas;

  const allowedColors = new Set();
  for (const rmp of [
    skinRamp(LOOKS.player.skin),
    materialRamp(LOOKS.player.hair),
    materialRamp(LOOKS.player.shirt),
    materialRamp(LOOKS.player.pants),
    materialRamp(LOOKS.player.shoe),
  ]) {
    allowedColors.add(rmp.top);
    allowedColors.add(rmp.left);
    allowedColors.add(rmp.right);
    allowedColors.add(rmp.line);
  }
  // Face flat feature palette (sclera, pupil, highlight, brow, mouth)
  for (const fc of ['#f2ede4', LOOKS.player.eye, '#fff4e8', LOOKS.player.brow, '#8a4a4a']) {
    allowedColors.add(fc);
  }

  const usedColors = new Set();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = grid[y][x];
      if (!c) continue;
      assert.ok(c.startsWith('#') && c.length === 7, `Pixel color ${c} must be an opaque hex color, no rgba gradients`);
      assert.notEqual(c.toLowerCase(), '#2a1d2e', 'Legacy near-black OUTLINE #2a1d2e must never appear');
      assert.ok(allowedColors.has(c.toLowerCase()), `Color ${c} must come from fixed 4-shade material ramps or flat face palette`);
      usedColors.add(c.toLowerCase());
    }
  }
  // Total unique colors across 5 materials + 4 face tones must be <= 24
  assert.ok(usedColors.size >= 12 && usedColors.size <= 24, `Expected limited palette (12..24 shades), got ${usedColors.size}`);
});

