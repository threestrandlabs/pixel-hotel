# Leftovers notes (branch art-leftovers, from 2694df1)

Nothing pushed, tagged or deployed. package.json version untouched.

## What changed
- **a) Backdrop** (`js/main.js`, `js/bakeSnap.js`, `js/render.js`). Cause of the softness: at a 0.25 bake every 1px `fillRect` blended partial coverage into in-between shades. Now:
  - High detail (DETAIL=2): bake scale 1 (native, CSS scale integer). Guard: >6M px falls back to 0.5.
  - Low (DETAIL=1): still 0.25 (0.5 tested: 22.8 and 20.3 fps, rejected). `snapBakeCtx` snaps rects to whole bake pixels, sampling pixel centres. Window panes become flat-topped rects at Low.
  - Rebake triggers when detail flips (bake scale is tied to `getDetail()`); vehicles/beacons use the live scale. Beacon arcs became squares; hills/spires/pavement joints no longer use AA paths.
- **b) Monitor** (`buildComputerDeskSprite`): navy `#1d2c5c` glass, small `#5b7fd0` glare patch, grey bezel `#4a515e`, neck and base unchanged geometry.
- **c) Fern** (`paintFern` + `isoSprite(..., after)` hook): 10 cubic-curve fronds from the soil centre, tapered 4-step terracotta pot, lighter rim, dark soil `#5a3e2c`.
- **d) Street tree** (`drawStreetTree` in `js/render.js`): trunk + lumpy canopy mask, flat 3-step ramp, mid-tone outline, a few accent pixels.
- Tests added to `tests/logic.test.mjs` (snap math, monitor colours, fern connectivity/wide-and-low at both details). `npm test`: 293/293 pass.

## FPS (`node tests/perf-profile.mjs restaurant --mobile`, 390x844 DPR3 CPU 4x)
- Baseline on this branch: 26.0
- Experiment, Low at 0.5 bake: 22.8, 20.3 (rejected)
- Final: **27.4, 28.9, 26.9** (all >= 25.2). Run-to-run spread is ~2 fps, so the margin over 25.2 is not large.
- High desktop fps not measured.

## 8x self-review (shots in `/workspace/ph-rework-shots/leftovers/{before,after}/`)
- `after/backdrop_high_8x.png` (live, High, DPR1 crop): flat colours, no blended in-between shades, slanted windows with clean stair edges (mostly 2px runs). Honest note: the old darker window edge strip is gone, so windows are one flat colour.
- `after/backdrop_low_8x.png` (live, Low): hard-edged flat rects, no blending. It is clearly coarse (4px blocks, windows no longer follow the iso slant) and widths vary by a block because zoom is 65%. Crisp, not pretty.
- `after/crop8x_desk.png` (+`_high`): dark grey bezel, navy glass, small blue glare, upright on neck + flat base. Reads as a monitor. The glare is a fairly saturated block, larger than a "small highlight" would ideally be.
- `after/crop8x_plant.png` / `_high`: wide, low fountain of arching fronds past a lighter rim; terracotta tapered pot, dark soil. Reads as a fern/spider-plant. Front fronds hide part of the pot; not every frond is clearly individual at Low.
- `after/crop8x_street_tree.png`, `crop8x_street_tree_city_high.png`: trunk + round canopy with outline and shading; reads as a tree. Canopy bottom is fairly flat (dome-like).
- `after/crop8x_street_tree_city_low.png`: the 0.25 bake turns the tree into ~6x5 blocks with a 1-block trunk: recognisable as a tree but very coarse.
- Tree crops are Node renders (`scripts/leftovers-tree-crop.mjs`), not browser shots: the in-game camera never frames the street. The backdrop crops are real browser screenshots.

## Remaining
- Low backdrop is still chunky by design (perf floor). A finer Low would need cheaper compositing, not a bigger bake.
- Glare patch could shrink; fern front fronds could be trimmed so more of the pot shows.
- No phone-device check of the Low snapped look beyond the headless 390x844 perf run.
