# Phase 4 Review Notes (city/window AA fix pass)

## Root causes found

The Phase 4 commit's city exterior (buildings, windows, roads, vehicles) looked soft
and antialiased when inspected at 8x, despite the game otherwise using
`imageSmoothingEnabled = false` throughout. Two independent, compounding bugs were
found and fixed:

1. **`js/render.js`'s `fillPoly` used the canvas's own path fill, which always
   antialiases non-axis-aligned edges.** Building facades, windows, roofs and roads
   are all isometric quads (diagonal edges by construction), so every one of them was
   antialiased on every edge. `fillPoly` now rasterises with a crisp pixel-centre
   scanline fill (ported from `sprites.js`'s `scanPoly`), and `drawIsoPrism`'s
   mid-tone silhouette outline now draws with a crisp Bresenham line helper
   (`strokeCrispLine`) instead of `ctx.stroke()`.
2. **Two `imageSmoothingEnabled` gaps.** `blitDeviceAligned`'s camera-transform branch
   (the one used during live gameplay) never set `imageSmoothingEnabled = false`
   before its `drawImage` blit, unlike its sibling branch. Separately, three offscreen
   bake contexts in `js/main.js` (`performBackgroundBake`'s ground/buildings/sky
   layers) explicitly set `imageSmoothingEnabled = true`. Both fixed to `false`.
3. **`css/style.css`'s parallax background canvases were set to
   `image-rendering: smooth`** (`#skyLayer`, `#skyCanvas`, `#bgLayer`, `#bgCanvas`,
   `#vehicleCanvas`, `#buildingsCanvas`, `#beaconCanvas`) — the literal opposite of
   the locked no-AA style. Changed to `pixelated`.

## What the crops actually show now

- `crop8x_building.png`, `crop8x_skyline_edge.png`, `crop8x_car.png` were regenerated
  from scratch. The previous versions were wrong: `crop8x_car.png` was a crop of a
  building corner, not a car, and all three were visibly blurred diagonal-edge
  antialiasing even before any upscaling.
- These three were **not** captured via the live browser, because of a limitation
  described below. Instead they were rendered by calling `js/render.js`'s own
  `renderSkylineToCanvas` / `computeCityVehicles` / `drawCityVehicles` directly from
  Node, through a small Canvas2D-alike backed by a raw pixel buffer
  (`scripts/node-canvas-shim.mjs`, `scripts/node-city-crops.mjs`). That is an honest
  way to show the *drawing code* is now crisp, with zero intermediate scaling.
  - `crop8x_building.png`: a close facade, crisp hard-edged windows, no AA.
  - `crop8x_skyline_edge.png`: the gap between two foreground buildings showing a
    distant stepped skyline silhouette with its mid-tone roofline outline, against the
    flat-banded sky.
  - `crop8x_car.png`: an actual car (cabin, windshield, body panel line, wheels)
    sitting in a traffic lane next to lane-dash markings, not a stretched streak.
- `after-street.png` / `after_street_high.png` / `after_street_low.png` are
  regenerated via `node tests/shot.mjs` (zoomed-out Lobby view). **Important
  limitation found while doing this**: the in-game camera, at any reachable zoom
  level (`MIN_ZOOM = 0.55`), never actually frames the ground-level road — every
  accessible room camera (lobby, pool, etc.) only shows the hotel's own tower walls
  and neighbouring towers, with the street/road/vehicles below the visible frame.
  This is true of the pre-existing `before-street.png` baseline too (no road or
  vehicles visible there either), so it is a pre-existing characteristic of the room
  camera, not something this pass introduced or was able to fix within scope. The
  `after-street*.png` files are an honest "what the player's camera actually shows"
  capture (crisp facades now, confirmed via 8x crop), not a street-level
  establishing shot — that only exists via the direct Node render above.

## Known remaining limitation (not fixed this pass)

The parallax background layer (`#bgCanvas`/`#buildingsCanvas`/`#skyCanvas` in
`js/main.js`) is deliberately baked at quarter resolution (`BG_SCALE = 0.25`) and then
CSS-upscaled ~4x, for performance. Even after the `image-rendering: pixelated` fix
above, this layer still shows some residual softness at certain camera zoom levels in
the live browser — an apparent interaction between the CSS `transform: scale` used for
camera zoom/pan and `image-rendering: pixelated` on a canvas whose backing store
doesn't match its CSS size. Confirmed this is **not** a drawing-code bug: the exact
same `renderSkylineToCanvas` code produces fully crisp, zero-AA pixels when rendered
directly (see the Node crops above and `js/render.js`'s own `fillPoly` fix).

Tried raising `BG_SCALE` from 0.25 to 0.5 to shrink the CSS upscale factor and measured
`restaurant --mobile`: 21.5-25.0 fps across 3 runs, i.e. below the 25.2 fps floor (down
from 27-32 fps at `BG_SCALE = 0.25`). Reverted immediately. A real fix (baking this
layer at native resolution, the way the tower-cutaway system already does) is a larger
architectural change with real perf risk, and is left as follow-up work rather than
risking the hard perf floor in this pass.

## Verification

- `npm test`: 290/290 passing (includes an update to the Phase "vehicles are drawn
  between backdrop and buildings" test, which detected vehicles via `ctx.fill`/`arc`
  calls; vehicles are now drawn via crisp `fillRect`, so the test's detection was
  widened to include `fillRect`).
- `node tests/perf-profile.mjs restaurant --mobile` x3: 27.0 fps, 32.1 fps, 31.5 fps
  (hard floor is 25.2 fps).
- `before-*.png` / `before_*.png` screenshots were not touched.
