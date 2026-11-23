# Pixel Hotel — Phase 0 & Phase 1 Migration Notes

**Branch**: `pixi-migration`  
**Base commit**: `5487625` (Pixel Hotel v0.13.1)  
**Date**: 2026-11-23  
**Status**: P0, P1 & P1B COMPLETE  

---

## 1. Executive Summary

Phase 0 (architectural seam, Pixi 8.23.0 vendoring, perf baseline harness, and test gates), Phase 1 (offline Node sprite builder atlas pipeline, runtime atlas cache/fallback, and James's P1 art/data fixes J10, J3, J7, J6/F1-F5), and Phase 1B (placement refinements for restaurant sconces, lobby floor lamp clearances, lobby rug centering, and clean after2 visual verification) are fully complete.

- **Unit tests**: 11/11 suites, 305/305 passing (`npm test`).
- **Smoke tests**: 100% passing (`npm run test:smoke` — prints "All smoke checks passed.").
- **Complaints checklist (`CHECKLIST.md`)**: 45 rows tracked: **33 PASS**, **12 PENDING** (scheduled for P2–P6), **0 FAIL**.
- **Data fixes verified**:
  - J10/F1: lobby crevice removed, solid carpet floor.
  - J3/F2: restaurant west wall sconces mounted flush at `x=1, rot=1` on bare wall sections between windows (`y=2,10,18,26`), zero window frame occlusion.
  - J7/F3: pool spa glass partition line aligned along y (`rot 1` at `x=24`).
  - J6/F5: lobby floor lamps moved to `(2,8)` and `(34,8)` with $\ge 1$ clear tile (Chebyshev distance $\ge 2$) from all seats.
  - Lobby sofa rugs: centered under sofa groups at `x=5` and `x=37` (delta < 2px).
  - F4: cafe rug groups centered under table + 4 armchair clusters.
  - F8/F9: atlas manifest completeness and pivot anchors.
- **In-game after-shots**: Clean `_after2` full screenshots and 8x nearest-neighbour crops verified in `/workspace/ph-rework-shots/pixi/p1/` with 0 non-uniform pixels per 8x block and floor-transition banner overlays fully faded.

---

## 2. Commit Log & Progression

### Phase 0 Commits
1. `5d9ed4a` — `refactor(render): renderer interface wrapping LegacyCanvasRenderer`
   - Introduced `Renderer` abstraction interface in `js/renderer/index.js`.
   - Wrapped `LegacyCanvasRenderer` (`js/renderer/legacy.js`) preserving existing canvas rendering.
2. `48a0b4c` — `build: vendor pixi 8.23.0 in CI and dev script`
   - Added `vendor/pixi.min.mjs` and npm scripts (`vendor:pixi`, `dev`).
3. `607517c` — `test(p0): add load-gate, floor-shots, complaints-checklist and perf-baseline.json`
   - Established load gate (`tests/load-gate.mjs`), complaints checklist generator (`tests/complaints-checklist.mjs`), floor shots tool (`tests/floor-shots.mjs`), and recorded v0.12.7 vs v0.13.1 performance baselines (`tests/perf-baseline.json`).

### Phase 1 Commits
4. `438002f` — `feat(atlas): Node pre-bake of sprite builders, runtime fallback + cache, and atlas QA`
   - Implemented `scripts/build-atlas.mjs` running headless in Node to bake all furniture, walls, skirting, windows, doors, and rails.
   - Generated 6 atlas pages (`atlas/manifest.json`, 5,762 frames across Detail 1 & 2).
   - Added runtime atlas loader seam with fallback to dynamic canvas builders.
   - Captured initial atlas contact sheets (`atlas_contact_1x.png`, `atlas_contact_8x.png`).
5. `33cab5c` — `fix(data): remove lobby VOID crevice cutout {14..15, 10..11}` (J10/F1)
   - Removed `{ x0: 14, y0: 10, x1: 15, y1: 11 }` from `ROOMS.lobby.cutouts` and `ROOMS.lobby.grid` in `js/data.js`.
   - Updated test fixture in `tests/logic.test.mjs` to use outer VOID cutout `{58..63, 42..47}`.
   - Enforced test rule: every `TILE.VOID` tile must touch an outer boundary of the room.
6. `159c61e` — `fix(data): mount restaurant wall sconces on west wall with rot 1` (J3/F2)
   - Moved 4 restaurant sconces from `x=2, y=6/14/22/30, rot=0` (floating 1 tile off the wall) to `x=1, rot=1` flush against west wall `x=0`.
   - Added test in `tests/complaints-checklist.mjs` verifying wall-mounted items touch outer wall on back side.
7. `4fdf6ad` — `fix(data): align pool spa partition line at x=24 along y (rot 1)` (J7/F3)
   - Updated all 24 `spa_partition` items at `x=24` (north: `y=2..13`, south: `y=16..27`) from `rot: 0` to `rot: 1`, aligning with the y-axis wall and `spa_door` at `(24,14)`.
   - Added regression test `checkSpaPartitionLineRotation()`.
8. `ace401a` — `fix(data): move lobby lamps clear of armchairs to (3,9) and (35,9)` (J6/F5)
   - Moved lamps from `(2,9)` and `(34,9)` to `(3,9)` and `(35,9)`.
9. `9a824a8` — `test(p1): update CHECKLIST.md and add p1 after-shots capture script`
   - Re-evaluated `CHECKLIST.md` (33 PASS, 12 PENDING, 0 FAIL).
   - Added headless browser capture script `scripts/capture-p1-afters.mjs`.

### Phase 1B Commits
10. `6fb3af6` — `fix(data): move restaurant wall sconces onto bare wall at y=2,10,18,26`
    - In initial P1 after-shots, sconces at `y=6,14,22,30` sat directly on top of small wall windows, covering window frames.
    - Moved sconces along west wall to bare solid wall between windows: `y=2, 10, 18, 26` at `x=1, rot=1`.
    - Added window occlusion check in `tests/complaints-checklist.mjs` and logic test verifying wall sconces never mount on `TILE.WINDOW`.
11. `dcd5ecc` — `fix(data): move lobby floor lamps to (2,8) and (34,8) with >=1 clear tile from seats`
    - Initial placement at `(3,9)` / `(35,9)` was jammed directly behind the pink sofa and tan armchair corner.
    - Repositioned lamps to `(2,8)` and `(34,8)`, establishing $\ge 1$ clear empty tile (Chebyshev distance $\ge 2$) from all seating.
    - Updated checklist check `checkLobbyLampsNotBehindArmchairs()` and added logic test verifying distance to armchair and sofa bounding boxes.
12. `b86f3fc` — `fix(data): centre lobby red rugs under sofa groups at x=5 and x=37`
    - Starburst rug is $2 \times 2$ diamond whereas sofa is $2 \times 1$. At `x=4`, the rug projected 96.5px left of the sofa group visual center.
    - Moved rug X from 4 to 5 (and 36 to 37), centering the rug directly beneath the sofa (visual center delta reduced to 1.9px).
    - Added regression test for sofa group rug centering.
13. `docs(notes): record P1B placement fixes, after2 shots, and verification metrics` (this commit)
    - Updated `scripts/capture-p1-afters.mjs` with elevation offsets, clearance framing, and 1500ms elevator transition overlay wait.
    - Captured and verified 5 clean `_after2` screenshots and 8x nearest-neighbour crops in `/workspace/ph-rework-shots/pixi/p1/`.

---

## 3. Data-Fix Before / After Visual Comparisons

All `_after2` shots and 8x nearest-neighbour crops were captured at DPR 2 and verified with **0 non-uniform pixels per 8x block**. Transition overlays ("FLOOR N / room name" banner and dimmed gold bar) were allowed to completely fade before capturing.

| Fixture / Subject | Target Room & Coords | After2 Full Shot | After2 8x Nearest-Neighbour Crop | Visual Verification & Status |
| :--- | :--- | :--- | :--- | :--- |
| **Cafe Rugs** | Cafe `(6.5, 8.5)` | `cafe_rugs_after2.png` | `cafe_rugs_after2_8x.png` | **CLEAN**. Captured after elevator transition fully cleared (no dimmed overlay / gold bars). Table + rug + 4 armchairs dead-center (mean X=119.8, mean Y=89.3 in 240x180 crop). |
| **Restaurant Sconces** | Restaurant west wall `(1.2, 9.85)` | `restaurant_sconces_after2.png` | `restaurant_sconces_after2_8x.png` | **MOUNTED ON BARE WALL**. Sconces moved from window frames (`y=6,14,22,30`) to solid wall between windows (`y=2,10,18,26`). 8x crop centered directly on brass sconce fixture with zero window frame overlap. |
| **Lobby Floor Lamp** | Lobby lamp & armchair `(2.1, 8.9)` | `lobby_lamps_after2.png` | `lobby_lamps_after2_8x.png` | **SEAT CLEARANCE PASS**. Lamp at `(2,8)` clearly separated from armchair at `(2,10)` and sofa corner by a 90px wide clear floor tile span ($\ge 1$ clear tile / Chebyshev distance $\ge 2$). |
| **Lobby Sofa Rug** | Lobby sofa & rug `(5.2, 10.5)` | `lobby_sofa_rug_after2.png` | `lobby_sofa_rug_after2_8x.png` | **CENTERED**. Sofa center (X=139.4) and red starburst rug center (X=137.5) match with only 1.9px delta in the 260x200 crop, resolving previous leftward overhang. |
| **Lobby Crevice Area** | Lobby former hole `(14.5, 10.5)` | `lobby_crevice_after2.png` | `lobby_crevice_after2_8x.png` | **VOID CLOSED**. Wide shot confirms continuous, seamless carpet floor tiles with 0 void pixels where cutout `{14..15, 10..11}` was removed. |

All shots and crops reside in: `/workspace/ph-rework-shots/pixi/p1/`.

---

## 4. Atlas Pipeline Statistics

From `atlas/manifest.json`:
- **Atlas Version**: 0.13.1
- **Total Frames**: 5,762
  - **Detail 1 (Low)**: 2,881 frames across 2 pages (`atlas-low-0.png` [2048x2000], `atlas-low-1.png` [2048x224])
  - **Detail 2 (High)**: 2,881 frames across 4 pages (`atlas-high-0.png` [2048x1920], `atlas-high-1.png` [2048x1984], `atlas-high-2.png` [2048x2000], `atlas-high-3.png` [2048x1360])
- **Total Unique Bitmaps**: 1,002
- **Total Atlas Pages**: 6 PNG sheets (total payload: 1,218,441 bytes / ~1.22 MB)
- **Atlas Padding**: 2px edge margin
- **Anchor Metadata**: Every frame records original sprite pivot coordinates `(ax, ay)`.
- **Multi-layer splits**: 3-tile furniture items pre-split into `all`, `back`, and `front` layers for Phase 3 depth sorting.
- **Lighting variants**: State variants pre-baked with `:off` frames for room night/tinting modes.
- **Contact sheets**: Available in `/workspace/ph-rework-shots/pixi/p1/atlas_contact_1x.png` and `atlas_contact_8x.png`.

---

## 5. Performance Baselines (`tests/perf-baseline.json`)

Recorded across 3 runs per floor, evaluating the 3-second entry window and steady walking FPS:

### Desktop High Profile (1440x900 @ 2x DPR, CPU 1x)
| Floor | v0.12.7 Avg FPS | v0.12.7 Frames >100ms | v0.13.1 Avg FPS | v0.13.1 Frames >100ms | v0.13.1 Max Frame (ms) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **lobby** | 51.0 | 2 | 23.9 | 2 | 1116.5 |
| **cafe** | 44.7 | 1 | 28.3 | 2 | 583.3 |
| **restaurant** | 32.5 | 2 | 20.2 | 2 | 866.6 |
| **gym** | 57.7 | 1 | 27.4 | 2 | 600.0 |
| **pool** | 37.3 | 2 | 19.2 | 1 | 749.9 |
| **arcade** | 35.3 | 2 | 23.5 | 2 | 650.0 |
| **library** | 35.6 | 2 | 27.7 | 2 | 633.3 |
| **garden** | 47.3 | 2 | 22.2 | 1 | 333.3 |
| **myroom** | 57.3 | 1 | 26.7 | 1 | 133.4 |
| **rooftop** | 32.5 | 4 | 18.8 | 3 | 1049.9 |

### Mobile Low Profile (390x844 @ 3x DPR, CPU 4x Throttle)
| Floor | v0.12.7 Avg FPS | v0.12.7 Frames >100ms | v0.13.1 Avg FPS | v0.13.1 Frames >100ms | v0.13.1 Max Frame (ms) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **lobby** | 25.9 | 1 | 25.4 | 2 | 3883.1 |
| **cafe** | 23.7 | 3 | 21.5 | 1 | 600.0 |
| **restaurant** | 14.3 | 1 | 21.4 | 3 | 2399.9 |
| **gym** | 28.1 | 4 | 28.1 | 2 | 866.6 |
| **pool** | 17.4 | 1 | 24.1 | 4 | 2166.6 |
| **arcade** | 21.6 | 4 | 18.5 | 2 | 883.3 |
| **library** | 25.0 | 5 | 18.9 | 2 | 450.0 |
| **garden** | 30.1 | 4 | 24.6 | 3 | 933.3 |
| **myroom** | 32.6 | 4 | 37.8 | 2 | 699.9 |
| **rooftop** | 16.1 | 4 | 14.9 | 3 | 1433.2 |

*Note*: In Phase 2, `PixiRenderer` will leverage the pre-baked atlas and WebGL rendering to eliminate the room-entry sprite baking spikes and restore frame rates to baseline.

---

## 6. What Remains for Phase 2 (P2)

Per `/workspace/ph-rework/PIXI_MIGRATION_PLAN.md` §4.2:
1. **PixiRenderer Implementation**:
   - Implement `PixiRenderer` class adhering to the `Renderer` interface (`init()`, `resize()`, `render()`, `destroy()`).
   - Create PixiJS Application / Stage hierarchy: backdrop layer, tile floor layer, furniture/entity world container, and wall/decor layer.
2. **Atlas Integration**:
   - Ingest `atlas/manifest.json` and 6 atlas pages using Pixi Assets / `Spritesheet`.
   - Map atlas frames to `PIXI.Sprite` instances with integer pixel coordinates (`roundPixels: true`) and nearest-neighbour sampling (`scaleMode: 'nearest'`).
3. **Seam Toggle & Fallback**:
   - Support `?renderer=pixi` and `?renderer=legacy` URL query parameter.
   - Automatic fallback to `LegacyCanvasRenderer` if WebGL context creation fails.
4. **Phase 2 Gate Validation**:
   - Re-run `tests/load-gate.mjs` verifying 0 frame drops >100ms on room entry with DETAIL=2.
   - Verify phone frame rates never regress below v0.12.7 baseline.

---

## 7. Disclosures & What Was Not Done

- **Public Room Save Migration**: Save state version remains at 14. Players cannot edit public rooms, and public room furniture layout is defined in `js/data.js`. No player save migration was required for P1/P1B; pool save migration is scheduled for Phase 4.
- **Phase 2 Scope**: No Pixi rendering code or scene graph changes were started in P1 or P1B, keeping the commit history clean and strictly scoped.
- **Screenshots**: Dirty files `shots/v0123/bg-zoom-*.png` generated by smoke tests were intentionally left uncommitted per instructions.
- **Asset Report**: `asset_report` tool was not available in this environment; atlas statistics were computed directly from `atlas/manifest.json`.
