# Leftovers notes (branch art-leftovers, from 2694df1)

Nothing pushed, tagged or deployed. package.json version untouched.

## What changed (Round 1)
- **a) Backdrop** (`js/main.js`, `js/bakeSnap.js`, `js/render.js`). Cause of the softness: at a 0.25 bake every 1px `fillRect` blended partial coverage into in-between shades. Now:
  - High detail (DETAIL=2): bake scale 1 (native, CSS scale integer). Guard: >6M px falls back to 0.5.
  - Low (DETAIL=1): still 0.25 (0.5 tested: 22.8 and 20.3 fps, rejected). `snapBakeCtx` snaps rects to whole bake pixels, sampling pixel centres.
  - Rebake triggers when detail flips (bake scale is tied to `getDetail()`); vehicles/beacons use the live scale. Beacon arcs became squares; hills/spires/pavement joints no longer use AA paths.
- **b) Monitor** (`buildComputerDeskSprite`): navy `#1d2c5c` glass, grey bezel `#4a515e`, neck and base unchanged geometry.
- **c) Fern** (`paintFern` + `isoSprite(..., after)` hook): 10 cubic-curve fronds from the soil centre, tapered 4-step terracotta pot, lighter rim, dark soil `#5a3e2c`.
- **d) Street tree** (`drawStreetTree` in `js/render.js`): trunk + lumpy canopy mask, flat 3-step ramp, mid-tone outline, a few accent pixels.

## What changed (Round 2)
- **1. Desk monitor glare** (`buildComputerDeskSprite` in `js/sprites.js`): replaced the bright `#5b7fd0` glare block with a thin 3-step diagonal glint in flat `#2c437e` (one step lighter than the `#1d2c5c` navy screen, with no dark 3D side-wall shading).
- **2. Fern front fronds** (`paintFern` in `js/sprites.js`): replaced uniform radial angles with explicit `FERN_SPEC` angles so the four front-side fronds sweep outward past the left and right flanks of the pot instead of hanging over the front face; the lighter terracotta rim and dark soil now read clearly while all 10 fronds stay one connected green component.
- **3. Low-quality city backdrop windows & perf** (`fillWindow` in `js/render.js`, `js/bakeSnap.js`, `requiredCityMargin` in `js/main.js`):
  - On sub-1 bakes (`g.lowBake`), `fillWindow` now draws 2-bake-pixel column pairs stepping 1 bake pixel vertically per 2 horizontally along the facade's 2:1 slope instead of flat-topped rectangles.
  - `snapBakeCtx` caches `g.getTransform()` once per bake instead of calling `this.getTransform()` on every `fillRect`, and `requiredCityMargin` divides `|pan|` by actual zoom `z` rather than clamping to `1.0` when zoomed in, avoiding oversized offscreen margins and mid-walk rebakes in large rooms.
- **4. Street tree** (`drawStreetTree` in `js/render.js`): added a bottom-centre lobe `[12, 14, 6, 5]` to soften the flat canopy bottom and switched the outline to a mid-tone green (`shadeColor(leaf, -0.1)`).
- Tests updated in `tests/logic.test.mjs` (`npm test`: 294/294 pass).

## FPS (`node tests/perf-profile.mjs restaurant --mobile`, 390x844 DPR3 CPU 4x)
- Round 1 final: 27.4, 28.9, 26.9 (all >= 25.2).
- Round 2 final (3 sequential foreground runs): **30.5, 32.3, 33.0 fps** (all >= 25.2, no regression vs Round 1).

## 8x self-review (shots in `/workspace/ph-rework-shots/leftovers/round2/`)
- `round2/crop8x_desk_high.png` (and `crop8x_desk.png`): dark grey bezel, navy `#1d2c5c` screen, small thin diagonal `#2c437e` highlight in the top-left (one step lighter than the navy, no bright blob or 3D block striping), upright on neck and flat base.
- `round2/crop8x_plant_high.png` (and `crop8x_plant.png`): 10 continuous connected fronds arching out and down past the sides in a wide fountain silhouette; front of the lighter terracotta rim and the dark soil crescent are unobstructed and read clearly. Honest note: at Low (`crop8x_plant.png`), the two lower side fronds on each flank touch along part of their curve, though the fountain silhouette, soil and rim remain clear.
- `round2/backdrop_low_8x.png` (live browser shot at Low, zoomed out): hard-edged pixels, zero AA blending, and window panes now step at the facade's 2:1 isometric slant (two 2-bake-pixel columns stepping 1 bake pixel vertically) instead of upright rectangles. Honest note: because Low is still a 0.25 bake viewed at 65% zoom, each window only has two 2-bake-pixel columns (one vertical step per pane) and block widths vary by 1 screen pixel under non-integer zoom.
- `round2/backdrop_high_8x.png` (live browser shot at High): crisp 1:1 native bake, slanted 2:1 windows with regular 2px stair runs and zero AA.
- `round2/crop8x_street_tree_city_high.png` (and `crop8x_street_tree.png`): mid-tone green outline around the canopy and a rounded, stepped bottom instead of the previous 14px flat bottom.

## Remaining
- Low backdrop remains a 0.25 bake by design to keep mobile frame rates well above the 25.2 fps floor, so Low windows have 1 step across their 4-bake-pixel width rather than the 7 steps of High.
- Street-level tree crops are pure-Node renders of the same drawing code because the in-game room camera does not pan down to street level.
