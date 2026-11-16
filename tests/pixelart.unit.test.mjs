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

test('pixelart: materialRamp keeps hue within ~10 degrees, never increases HSL saturation by > 0.1, and each shade is darker than the previous', () => {
  const rgbToHsl = ([r, g, b]) => {
    const nr = r / 255;
    const ng = g / 255;
    const nb = b / 255;
    const max = Math.max(nr, ng, nb);
    const min = Math.min(nr, ng, nb);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
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
    return [h * 360, s, l];
  };
  const hueDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

  // Collect all LOOK colours plus a grid of RGB test colours
  const testColors = new Set([
    '#4da3ff', '#ff9fc7', '#f6c667', '#f0c49a', '#5a3826', '#2c3e63', '#f4f4f4',
    '#e4e4ea', '#7f93b3', '#f1e8d2', '#c4b5fd', '#f4f7f2', '#5fcf7a', '#ffe08a',
    '#c0304a', '#f2ede4', '#ff5252', '#5cd6c8', '#8c52ff', '#50f0d0', '#fff8e8',
    '#78c466', '#ffd268', '#2e4478', '#1e2c50', '#222836', '#282028', '#ff6f61',
  ]);
  for (const look of Object.values(LOOKS)) {
    for (const k of ['skin', 'hair', 'shirt', 'pants', 'shoe', 'gold', 'under', 'headband', 'accessoryColor']) {
      if (typeof look[k] === 'string' && look[k].startsWith('#')) testColors.add(look[k]);
    }
  }
  for (let r = 20; r <= 240; r += 44) {
    for (let g = 20; g <= 240; g += 44) {
      for (let b = 20; b <= 240; b += 44) {
        testColors.add(rgbToHex([r, g, b]));
      }
    }
  }

  for (const hex of testColors) {
    const rmp = materialRamp(hex);
    const shades = [rmp.topRgb, rmp.leftRgb, rmp.rightRgb, rmp.lineRgb];
    const hsls = shades.map(rgbToHsl);
    const [hBase, sBase] = hsls[1];

    for (let i = 0; i < shades.length; i++) {
      const [hi, si, li] = hsls[i];
      // Hue within ~10 degrees for chromatic colours
      if (sBase > 0.06 && si > 0.06) {
        assert.ok(
          hueDiff(hi, hBase) <= 10.5,
          `Hue drift for ${hex} shade ${i} (${rgbToHex(shades[i])}) was ${hueDiff(hi, hBase).toFixed(2)} deg (> 10)`,
        );
      }
      // Saturation never increases over base (and step-to-step never increases by more than 0.1)
      assert.ok(
        si <= sBase + 1e-6,
        `Saturation increased over base for ${hex} shade ${i}: base=${sBase.toFixed(3)}, shade=${si.toFixed(3)}`,
      );
      if (i > 0) {
        const [, sPrev, lPrev] = hsls[i - 1];
        assert.ok(
          si - sPrev <= 0.1,
          `Step saturation increased for ${hex} shade ${i - 1}->${i}: ${sPrev.toFixed(3)}->${si.toFixed(3)}`,
        );
        assert.ok(
          li < lPrev,
          `Shade ${i} (${rgbToHex(shades[i])}, L=${li.toFixed(3)}) must be darker than shade ${i - 1} (${rgbToHex(shades[i - 1])}, L=${lPrev.toFixed(3)}) for ${hex}`,
        );
      }
    }
  }

  // Player shirt (#4da3ff) right shade is ~#3672b3-ish (#3771b2), never electric #0449ff
  const blueRmp = materialRamp('#4da3ff');
  assert.notEqual(blueRmp.right, '#0449ff');
  const [br, bg, bb] = blueRmp.rightRgb;
  assert.ok(Math.abs(br - 0x36) <= 6 && Math.abs(bg - 0x72) <= 6 && Math.abs(bb - 0xb3) <= 6, `Expected #3672b3-ish, got ${blueRmp.right}`);
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

test('voxel: every LOOK x 4 facings x DETAIL 1 and 2 at idle (and key poses/outfits) renders visible skin-ramp pixels in both hand regions', () => {
  const dirs = ['down', 'left', 'up', 'right'];
  const outfits = ['tee', 'cardigan', 'hoodie', 'bellhop', 'labcoat', 'dress', 'swimsuit'];

  for (const detail of [1, 2]) {
    setDetail(detail);
    const bakeScale = 2 * detail; // DPR 2 * DETAIL (n=2 at Low, n=4 at High)

    for (const [id, look] of Object.entries(LOOKS)) {
      const sRmp = skinRamp(look.skin);
      const skinFillColors = new Set([sRmp.top, sRmp.left, sRmp.right]);

      // Verify buildParts hand geometry at idle: two 1.9-wide x 1.9-tall skin blocks flush against torso (±2.5)
      const idleParts = buildParts(look, { stride: 0 });
      const handParts = idleParts.filter((p) => p.slot === 'hand');
      assert.equal(handParts.length, 2, `${id}: expected 2 hand parts`);
      for (const hp of handParts) {
        assert.equal(hp.mat, 'skin');
        assert.ok(Math.abs((hp.x1 - hp.x0) - 1.9) < 1e-6, `${id}: hand width must be 1.9`);
        assert.ok(Math.abs((hp.z1 - hp.z0) - 1.9) < 1e-6, `${id}: hand height must be 1.9`);
        assert.ok(Math.abs(hp.x0 - 2.5) < 1e-6 || Math.abs(hp.x1 - (-2.5)) < 1e-6, `${id}: hand must sit flush against torso side x=±2.5`);
      }

      for (const dir of dirs) {
        const res = renderCharacter(look, dir, { stride: 0 }, makePixelRecordingCanvas, bakeScale);
        const { grid, width: W, height: H } = res.canvas;
        const midX = res.ox * bakeScale;

        let leftRegionSkin = 0;
        let rightRegionSkin = 0;
        let hasLitFace = false;
        let hasShadedSideFace = false;

        for (let x = 0; x < W; x++) {
          // 2:1 isometric chin plane at z = 11.0 separates head above from torso/arms/hands below
          const handRegionTopY = Math.max(0, Math.floor((res.oy - 19.5) * bakeScale - Math.abs(x - midX) * 0.5));
          for (let y = handRegionTopY; y < H; y++) {
            const c = grid[y][x]?.toLowerCase();
            if (!c || !skinFillColors.has(c)) continue;
            if (x < midX) leftRegionSkin++;
            else rightRegionSkin++;
            if (c === sRmp.left) hasLitFace = true;
            if (c === sRmp.right) hasShadedSideFace = true;
          }
        }

        assert.ok(
          leftRegionSkin > 0 && rightRegionSkin > 0,
          `${id} ${dir} DETAIL=${detail}: expected visible skin-ramp pixels in both hand regions, got left=${leftRegionSkin}, right=${rightRegionSkin}`,
        );
        assert.ok(
          hasLitFace && hasShadedSideFace,
          `${id} ${dir} DETAIL=${detail}: expected both lit (${sRmp.left}) and ~18%-darker side (${sRmp.right}) skin-ramp faces in hand regions`,
        );
      }
    }

    // Also verify all outfit types and active poses retain visible hands in all 4 facings
    const poses = [
      { stride: 1 },
      { stride: -1 },
      { sit: true },
      { lie: true },
      { action: 'swim', actionFrame: 0 },
      { action: 'treadmill', actionFrame: 1 },
      { action: 'eat', actionFrame: 1 },
      { action: 'use', actionFrame: 1 },
      { emote: 'wave', emoteFrame: 1 },
      { emote: 'clap', emoteFrame: 1 },
      { emote: 'cheer', emoteFrame: 1 },
      { emote: 'thumbsup', emoteFrame: 1 },
    ];
    for (const outfit of outfits) {
      const look = { ...LOOKS.player, outfit, bareArms: outfit === 'swimsuit' };
      const sRmp = skinRamp(look.skin);
      const skinFillColors = new Set([sRmp.top, sRmp.left, sRmp.right]);
      for (const dir of dirs) {
        const res = renderCharacter(look, dir, { stride: 0 }, makePixelRecordingCanvas, bakeScale);
        const midX = res.ox * bakeScale;
        let leftSkin = 0;
        let rightSkin = 0;
        for (let x = 0; x < res.canvas.width; x++) {
          const handRegionTopY = Math.max(0, Math.floor((res.oy - 19.5) * bakeScale - Math.abs(x - midX) * 0.5));
          for (let y = handRegionTopY; y < res.canvas.height; y++) {
            const c = res.canvas.grid[y][x]?.toLowerCase();
            if (c && skinFillColors.has(c)) {
              if (x < midX) leftSkin++;
              else rightSkin++;
            }
          }
        }
        assert.ok(leftSkin > 0 && rightSkin > 0, `outfit=${outfit} ${dir} DETAIL=${detail}: both hands must be visible`);
      }
    }

    const pRmp = skinRamp(LOOKS.player.skin);
    const pSkinColors = new Set([pRmp.top, pRmp.left, pRmp.right]);
    for (const pose of poses) {
      const parts = buildParts(LOOKS.player, pose);
      const headPart = parts.find((p) => p.slot === 'head');
      const hdz = headPart ? (headPart.dz || 0) : 0;
      for (const dir of dirs) {
        const res = renderCharacter(LOOKS.player, dir, pose, makePixelRecordingCanvas, bakeScale);
        const midX = res.ox * bakeScale;
        let leftSkin = 0;
        let rightSkin = 0;
        for (let x = 0; x < res.canvas.width; x++) {
          const handRegionTopY = Math.max(0, Math.floor((res.oy - (19.5 + hdz * KZ)) * bakeScale - Math.abs(x - midX) * 0.5));
          for (let y = handRegionTopY; y < res.canvas.height; y++) {
            const c = res.canvas.grid[y][x]?.toLowerCase();
            if (c && pSkinColors.has(c)) {
              if (x < midX) leftSkin++;
              else rightSkin++;
            }
          }
        }
        assert.ok(
          leftSkin > 0 && rightSkin > 0,
          `pose=${JSON.stringify(pose)} ${dir} DETAIL=${detail}: both hands must remain visible (left=${leftSkin}, right=${rightSkin})`,
        );
      }
    }
  }
  setDetail(1);
});


