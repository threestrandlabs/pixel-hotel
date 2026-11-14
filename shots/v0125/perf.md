# Grand Lobby Performance Profile (v0.12.5)

## Baseline vs Optimized (10s Continuous Walk in Grand Lobby, 1200x800 Desktop Viewport)

| Metric | Before (v0.12.4 Baseline) | After (v0.12.5 Fix) | Target | Result |
| :--- | :---: | :---: | :---: | :---: |
| **Avg FPS** | 23.6 fps | **59.8 fps** | 60 fps | **+153% improvement** |
| **Avg Frame Time** | 42.40 ms | **16.72 ms** | <= 20 ms | **PASS** |
| **p95 Frame Time** | 50.10 ms | **16.70 ms** | <= 20 ms | **PASS** |
| **p99 Frame Time** | 66.70 ms | **16.80 ms** | <= 25 ms | **PASS** |
| **Frames > 33ms** | 235 / 237 (99.2% dropped) | **2 / 599 (0.3% dropped)** | minimal | **PASS** |

## Root Causes Identified & Fixes Applied

1. **Expensive CSS Filter on Background and Sky Layers**:
   - `filter: blur(...) brightness(...) saturate(...)` on `#bgLayer` and `#skyLayer` forced Chromium's CPU compositor to run multi-pass image convolutions over 2500x1600+ canvas surfaces on every frame during camera panning/zooming.
   - *Fix*: Removed the CSS blur/color filters from `#bgLayer` and `#skyLayer`.

2. **Frequent Canvas Transform State Switching in Render Loop**:
   - `blitDeviceAligned` switched transforms (`setTransform(1, 0, 0, 1, 0, 0)` and back to camera matrix) twice for every single sprite and piece of furniture, causing ~100 transform state flushes and over 130ms of CPU overhead per second.
   - *Fix*: Introduced transform state tracking with `ensureDeviceTransform` and `ensureCameraTransform`. Furniture shadows and sprite blits run in continuous device transform mode without redundant matrix switches.

3. **Synchronous Layout Invalidation on Every Frame**:
   - `syncCanvasSize()` called `canvas.getBoundingClientRect()` every frame inside `frame()`, forcing synchronous browser layout recalculation.
   - *Fix*: Gated `syncCanvasSize()` behind dirty flags triggered only by `ResizeObserver`, `window.resize`, and orientation changes.

4. **Sprite Cache Warm-up & Pre-warming**:
   - Entering the 64x48 Grand Lobby triggered on-the-fly rasterization of new detailed furniture items and player walking animations.
   - *Fix*: Added `warmUpRoomSprites(room, placedFurniture, dpr)` which pre-compiles all furniture sprites in the room and all directional walking animation frames for the avatar during room transitions.

5. **Pathfinding Line-of-Sight Smoothing Overhead**:
   - `smoothPath` ran full 8-directional step constructions for every candidate probe across long paths in the large 64x48 lobby.
   - *Fix*: Added lightweight `supercoverHasLineOfSight` raycast check for candidate pruning, constructing full steps only for confirmed waypoint segments.

6. **Cutaway Geometry Culling**:
   - Interior floor tiles covered completely by the static floor layer were redundantly filled with individual polygons in `drawTowerCutawayUnder`.
   - *Fix*: Skipped interior non-boundary tiles in cutaway rendering, reducing polygon count by ~30x.
