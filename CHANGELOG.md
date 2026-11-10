# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.8.7] - 2026-11-11

### Added

- **Arcade Games & Leaderboards (Floor 6)**:
  - **3 Original Classic Game Engines (`js/arcade/games.js`)**:
    - **Noodle Snake**: Snake-style game navigating a 16×16 grid, collecting noodle broth toppings (dumplings, eggs, scallions), growing in length with self-collision and wall-collision detection.
    - **Brick Bash**: Retro paddle/breakout game with paddle physics (deflection angle based on hit offset), ball reflections, multi-color pixel brick destruction with point tiers, multi-wave respawning, and 3-life tracking.
    - **Block Drop**: Classic falling-block line clearer with 7 polyomino tetrominoes, rotation with wall kicks, soft/hard drop, line completion and clearing, and multi-line scoring (100, 300, 500, 800).
  - **6 New Original Arcade Cabinets & Matching Sprites (`js/sprites.js`, `js/data.js`)**:
    - 2 cabinets for Noodle Snake: Classic (`arcade_snake_1`, jade chassis) and Neon (`arcade_snake_2`, magenta chassis).
    - 2 cabinets for Brick Bash: Retro (`arcade_breakout_1`, cobalt chassis) and Turbo (`arcade_breakout_2`, gunmetal chassis).
    - 2 cabinets for Block Drop: Puzzle (`arcade_drop_1`, indigo chassis) and Deluxe (`arcade_drop_2`, cyberpunk chassis).
    - Placed along Floor 6 north wall in non-overlapping positions while keeping elevator arrival route completely clear.
    - Updated NPC Zack's routine to loop through and play all three arcade cabinet pairs.
  - **Arcade Hall of Fame Digital Scoreboard (`arcade_leaderboard`)**:
    - Free-standing 2×1 digital scoreboard placed in the Floor 6 arcade hall.
    - Interacting with the board opens the Arcade Leaderboard modal directly.
  - **Centered Arcade Game & Leaderboard Modals (`index.html`, `css/style.css`, `js/arcade/ui.js`)**:
    - Walking up and Using any arcade cabinet opens a centered modal game screen with retro bezel styling.
    - Keyboard play (<kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> / <kbd>WASD</kbd>, <kbd>Space</kbd>, <kbd>Esc</kbd> to quit).
    - Live score display during gameplay and game-over summary with replay option.
    - **Daily coin rewards capped per day**: Modest coin rewards awarded upon completing runs, capped at 50 coins/day (`ARCADE_DAILY_COIN_CAP = 50`), tracking daily earnings and resetting on new days.
    - **Leaderboard modal with Global, Mine, and Local tabs**: Local top 10 always available offline; Global top 10 and personal bests loaded via Supabase RPC with graceful offline degradation.
  - **Supabase Migration (`supabase/migrations/0003_v087_arcade_scores.sql`)**:
    - `arcade_scores` table with Row Level Security (RLS) enabled.
    - Disallows direct client UPDATE and DELETE.
    - `submit_arcade_score(game, score)` SECURITY DEFINER RPC validating user (`auth.uid()`), game ID, sane score bounds per game, and 20s rate limit per user.
    - `get_arcade_leaderboard(game, mine_only, limit)` read RPC returning top 10 joined to `profiles.display_name`.
    - Executable only by `authenticated` users with client publishable key.
  - **Save Migration & Persistence (`js/save.js`, `js/data.js`)**:
    - Bumped save version to 8 with migration 7 initializing `arcade` state (daily coins, last reward date, local high scores) and updating unmodified Floor 6 rooms.
  - **Comprehensive Unit & Smoke Tests (`tests/arcade.unit.test.mjs`, `tests/smoke.spec.mjs`)**:
    - 28 unit tests covering all 3 game mechanics, score bounds validation, daily coin caps, leaderboard sorting, and mocked Supabase RPCs.
    - Playwright smoke test verifying Floor 6 travel, cabinet interaction, modal display, Esc close, leaderboard screen interaction, and Supabase RPC integration.

## [0.8.6] - 2026-11-11

### Added

- **Doubled pixel density across all procedural art, same world scale (`js/sprites.js`, `js/render.js`, `js/voxel.js`)**:
  - **Raster px-grid sprites** (floor tiles, walls, windows, doors, elevator doors, stairwell doors, glass balustrades, elevator tiles): introduced an `ART = 2` sub-grid density constant in `sprites.js` — every one of these builders now authors its pixel grid at 2× resolution (e.g. a floor tile's logical grid grew from 64×32 to 128×64 cells) while `ISO`'s CSS-pixel/world constants (`TILE_W`/`TILE_H`/`WALL_H`) are untouched, so on-screen tile/wall footprint, collision and pathing are pixel-for-pixel identical to v0.8.5. `bakeSprite` (`render.js`) now rasterises each fine grid cell at `scale/ART` device pixels and divides the sprite's anchor point by `ART`, so the baked bitmap keeps the exact same CSS size, just sourced from a finer, more detailed grid. Every material (marble, dark parquet, gym rubber, spa stone, library carpet, arcade neon, terracotta, grass, stone path, timber deck, kitchen tile, default) gained genuinely new fine-grained detail — secondary veining/sparkle/fleck layers, interlocking seams, individual grout lines, mica/kiln-fired/dew-lit glints — rather than just scaled-up blocks; texture noise periods were deliberately kept the same while the grid coordinates doubled, so patterns read twice as fine instead of twice as blocky. Walls gained finer plank grain and a two-tone ceiling trim; windows gained fine glass-pane speckle and a secondary sash highlight; doors/elevator doors/stairwell doors gained brushed-metal and wood-grain grain; the glass balustrade gained fine glint flecks.
  - **Characters** (`js/voxel.js`, all 14 `LOOKS` plus the swimsuit outfit): character rendering is vector/polygon-based already (resolution-independent), so density work here means genuinely more drawn detail rather than a resolution multiplier — `voxTex` (hair/mustache/hat sheen) now grains at half-voxel steps (4× the stipple cells); eyes gained a secondary catchlight and individual fine lash strokes; added a philtrum shadow and lens-glint on glasses; bald heads gained a 5th comb-over strand row; side-temple faces gained individual hair-strand lines; shoe soles/cuffs gained a welt-stitch/seam line; every outfit (`tee`/`bellhop`/`cardigan`/`labcoat`/`dress`) gained a fabric-specific finishing touch (side seams, braid piping + button highlights, ribbed knit texture, lapel stitching, fabric sheen), and a new **swimsuit** texture (scoop-neckline trim, racing stripe, sheen highlight) replaces the previously flat/untextured swim outfit.
  - **Furniture & decor** (`js/sprites.js`, 75 `FURNITURE_BUILDERS`, and `render.js`'s shared box rasteriser): every box of every furniture piece now gets a fine grounding-AO contact shadow and a polished vertical corner highlight at bake time (`bakeSprite`'s `.boxes` branch), a single low-risk change that adds a genuine finishing pass across all 75 builders at once. On top of that, hand-authored extra detail was added to the most visible pieces: stool (brass toe caps + nailhead trim ring), sofa (piping trim + seat tufting buttons, all 4 rotations), armchair (piping trim + tuft button, all 4 rotations), lamp (rib detailing + rising bubble), plant (rim trim, 3 extra leaf sprigs, flower blossom), rug (fringe tassels + inner gold lattice ring), reception desk (brass inlay strip + slab edge trim), suite bed (piped duvet hem + headboard button-tuft trim), dining table (linen hem shadow + two place settings), dining chair (gold seat piping), pool water (3 extra fine caustic glints).
  - **City backdrop, vehicles & tower** (`js/render.js`): the distant skyline gained fine vertical facade seams and a doubled, finer-pitched window grid (5px row pitch, individually randomised brightness) in place of the old flat 8px dot grid; star count nearly doubled (85 → 160) with a 3-tier size distribution; cars/taxis/buses gained a cabin door-pillar mullion line and dark wheel blobs at all 4 corners; the cut-away tower's neighbour-building windows and the rooftop housing's side window gained fine mullion cross-bars; the rooftop parapet coping gained individual stone-seam ticks; the UI item-icon fallback diamond gained a top-edge highlight.
  - Kept all v0.8.4 performance work intact: `bakeSprite`'s lazy-factory caching, cached static layers, integer pixel snapping and `imageSmoothingEnabled = false` are unchanged — the extra detail above is drawn once per cache key (not per frame), so steady-state frame time is unaffected. Measured on the 11-NPC Restaurant floor (`tests/perf-profile.mjs`): **before** avg 20.29ms (49.3 fps) / p50 16.70ms / p95 16.80ms; **after** avg 20.36-20.47ms (48.9-49.1 fps) / p50 16.70ms / p95 16.80ms — within run-to-run noise, no regression.
  - Crisp at both 1x and 2x device pixel ratio with no shimmer/tearing (verified via `tests/shot.mjs`, a new one-off Playwright screenshot script capturing Lobby/Restaurant/Pool/My Room/street views at DPR 2).
  - All art remains procedural/original — no external or copyrighted assets, no trademarked names.
- Updated `tests/logic.test.mjs` for the new `ART`-scaled sprite dimensions: the glass-balustrade corner-post test and the window-sprite bounding-size test now scale their expected pixel coordinates/bounds by `ART` instead of hardcoding the old 64×32-grid values.

## [0.8.5] - 2026-11-10

### Added

- **Music by James v2 floor soundtrack (`audio/music/v2/`, `js/audio.js`)**: Each floor now plays its matching v2 soundtrack track composed by James (Floor 1 Hotel Lobby, Floor 2 Cafe & Bar, Floor 3 Restaurant, Floor 4 Gym, Floor 5 Pool & Spa, Floor 6 Arcade, Floor 7 Library, Floor 8 My Room, Floor 9 Sky Garden, Floor 42 Rooftop) with clean, concise labels ("Hotel Lobby", "Cafe & Bar", etc.).
- **Playlist extras & classic tracks (`js/audio.js`)**: Added 4 new v2 extras (`main-menu`, `guest-room`, `renovation`, `event-map`), with `renovation` playing while the Room Upgrade Agency modal is open and smoothly restoring the floor audio on modal close. Preserved all 10 classic tracks in `audio/music/*.mp3` as playlist extras labeled "Classic: <old label>".
- **Cassette player playlist & shuffle toggle (`index.html`, `css/style.css`, `js/audio.js`, `js/main.js`)**: Added playlist continuous-play support that advances to the next track on track completion. Added tactile previous/next transport buttons and a shuffle toggle in the expanded cassette player styled to the retro cassette look. Entering any floor starts that floor's theme track.
- **Settings persistence**: Shuffle mode (`state.settings.shuffle`) and player minimised state (`state.settings.playerMinimized`) persist durably across saves and reload.
- **Lazy-loading audio**: Audio files are fetched on demand only when played, eliminating eager preloading of sequential tracks.
- **Procedural fallback**: Maintained the procedural Web Audio multi-room synth fallback if any audio file fails to load or decode.

## [0.8.4] - 2026-11-10

### Added

- **Role-based NPC routines (`js/data.js`, `js/npc.js`, `js/main.js`)**: replaced the old 72%/32% random-wander-or-sit-at-random-furniture logic with authored, cyclic per-NPC routines of real waypoints (seats, kitchen stations, machines, shelves, lanes, plants) across every public floor:
  - Restaurant: chefs/cooks loop between their own kitchen stations; waiters loop kitchen pass → tables → kitchen pass; the maître d' stays at the podium with brief greeting trips to the entrance; diners (Arthur, Sophia, Evelyn) sit at their table for a long dwell and occasionally step toward the entrance before returning.
  - Gym: Coach Rex and Chloe move machine to machine with pauses.
  - Pool & Spa: the stylist/masseuse alternate between their two chairs/beds; Marina swims a lap loop across eight pool tiles; the spa receptionist stays near her desk.
  - Arcade: Zack cycles through the cabinets.
  - Library: Clara browses two bookshelves, reads at the nook sofa, then returns to her desk.
  - Garden: Flora strolls bench → pergola → tree → telescope.
  - Rooftop: Lola alternates sofa/bar; Dr. Pix alternates telescope/deckchair.
  - Lobby: Mochi patrols both lounges and the desk; Gus mostly sits, occasionally shuffling around.
  - Every routine stop was validated against the real seeded furniture/collision data (new tests below) so NPCs never target a wall, void, or a tile that isn't actually reachable.
- **`npc.js` dwell-aware tick engine**: `tickNpc` now gates on a single `nextWanderAt` timer that accounts for travel time plus a per-stop dwell duration (instead of a fixed 3-7s random repick), and supports a `handledDirectly` result for NPCs that are already standing on their next stop. This also fixes a latent bug where any NPC that sat down could never be picked to wander again (the old gate required `npc.sitting === null` before even considering a new target).
- **Render-loop performance fixes (`js/render.js`, `js/data.js`, `js/main.js`)** — profiled with a new `tests/perf-profile.mjs` Playwright script (walks the player back and forth on the 11-NPC Restaurant floor for 480 frames):
  - **Root cause of the reported lag/stutter**: `bakeSprite()`'s whole purpose is to cache baked pixel-art canvases, but every call site was invoking the (expensive, per-pixel) sprite-construction function *before* passing the result in, so the cache only ever saved the final canvas rasterization step — the costly `buildFloorTile`/`buildWallSegment`/furniture-builder work re-ran on literally every tile, every wall segment, and every placed furniture item, every single frame. Fixed by making `bakeSprite` accept a factory function and only invoke it on a cache miss.
  - `drawTowerCutawayUnderCached` (the cached wrapper for the tower cut-away shaft) was defined but never actually called — the uncached `drawTowerCutawayUnder` was being redrawn from scratch every frame instead. Wired the cached version in.
  - Added the equivalent cache for `drawTowerCutawayOver` (ceiling slab/parapet/rooftop housing), which has no day-night or animation dependency and was also being redrawn every frame.
  - `getCatalogueItem()` did a linear `Array.find` over the whole catalogue on every call (hundreds of calls/frame across furniture rendering, collision checks, and NPC AI); switched to an id → item `Map`.
  - Reused fixed buffers for the per-frame depth-sort/name-tag/bubble arrays in `renderRoom` instead of allocating new arrays every frame.
  - Camera pan is now snapped to whole device pixels after each frame's follow-lerp, instead of drifting to arbitrary sub-pixel offsets — this keeps every sprite's rounding in `blitDeviceAligned` consistent with each other frame-to-frame, which is what was actually causing the 1px shimmer/tearing between furniture, floor and characters while the camera eased toward the walking player (confirmed `imageSmoothingEnabled = false` and the single `requestAnimationFrame` loop were already correct; frame drops from the sprite-rebuild bug above were the dominant source of visible tearing).
  - **Measured**: average frame time on the Restaurant floor dropped from **83.0ms (12.0 fps)** to **28.9ms (34.5 fps)**; p95 from 283ms to 50ms; p50 (typical frame) from 66.6ms to 16.7ms — i.e. typical frames now render inside a 60fps budget.
- **Deterministic `npm run test:smoke`**: the suite's own 90-second internal watchdog was racing its own legitimate ~95-110s runtime (two full single-user passes at 1x/2x DPR plus a mocked multiplayer flow), not detecting a real hang — roughly half the time the run would still be mid-action when the watchdog fired and force-exited the process. Raised the watchdog to 180s, which leaves real headroom above the baseline while still catching a genuine hang.
- **Pathing tests (`tests/logic.test.mjs`)**: every NPC's routine stops are validated to be in-bounds, never on a wall/void tile, and (for furniture-interaction stops) anchored to a real seeded placement; every NPC's full routine loop is walked in order from its home tile through the real seeded collision data to confirm it's fully reachable without ever crossing a blocked tile; and `tickNpc`'s new dwell-timer gating is unit-tested for the travel+dwell, instant-interact, previously-seated, and no-target-found cases.

## [0.8.3] - 2026-11-09

### Added

- **Full Public Floor Layout Redesign & Zone System (`js/data.js`, `js/sprites.js`, `js/render.js`)**:
  - Redesigned every expanded public floor with purposeful zones, partition counters, rugs, columns, dense furniture groupings, and clear walking paths:
    - **Grand Lobby (64x48)**: Reception zone with Celeste & Mochi behind a curved marble front desk, luggage staging, central circular rug with grand floral display, four corner conversation salons, concierge counter, and luggage carts.
    - **Starlight Cafe & Bar (20x16)**: Bar counter with barista Milo, espresso machine, pastry display, intimate cafe tables, and corner lounge.
    - **Skyline Restaurant (48x36 [16x area])**: Posh fine dining featuring dark parquet floor with warm amber ambient lighting and radial glow pools; Maître D' Jean-Luc at entrance podium; Sommelier Pierre at grand wine wall display; grand piano with pianist; round white-tablecloth dining tables with candlelight; private velvet dining booths; waiters Luca & Claire carrying trays between tables; and a walk-in commercial kitchen behind pass window with Chef Sora, line cooks Marco (grill) & Kenji (pastry), and dishwasher Sammy.
    - **Pulse Fitness Gym (22x16)**: Rubber athletic floor with full mirror wall showing avatar sheen and reflections, dual treadmills, spin bikes, rowers, free weight benches, squat rack, dumbbell racks, yoga mats, and water cooler.
    - **Azure Pool & Spa (44x36 [16x area])**: Sunken Olympic-style lap pool with stone deck rim, starting blocks, lane dividers, ladders, and poolside loungers with umbrellas; gendered changing cubicles requiring swimsuit change before swimming; swimming activity prompts ("Swim laps" with lap counter advancing fitness quests vs "Free roam"); and an enclosed Spa & Salon room with Antoine's styling salon chair (hairstyle & hair color changes), massage beds (+mood/energy buff), and staff NPCs Elena, Antoine, and Yuki.
    - **Pixel Arcade & Games (22x16)**: Neon floor tiles, dance machine, air hockey, pinball machines, capsule gachas, retro seating lounge, and clearly marked open reserved floor area for upcoming cabinets, pool table, and gumball machine.
    - **Quiet Library & Hub (22x16)**: Herringbone library carpet with warm dim lighting, 14 bookshelf rows and wall stacks, study carrels, computer desks, reading lounge with starburst rug, and librarian desk with Clara.
    - **Cloud Nine Sky Garden (22x18)**: Indoor glasshouse conservatory with koi pond, orchids, ferns, wisteria pergola, and garden benches; outdoor open-air sky terrace with stone path, sakura trees, hedges, and flower planters.
- **42-Storey Hotel Tower Architecture & NPC Rooms (`js/data.js`, `js/main.js`, `tests/logic.test.mjs`)**:
  - Hotel tower exterior and directory structured to 42 storeys: Lobby 1 ... Sky Garden 9, My Room on Floor 11 (tier 1), and Rooftop on Floor 42 (relabelled from 'R' to 42 everywhere).
  - Floors 10–41 designated as non-explorable Hotel Guest Rooms; elevator directory includes a disabled entry for "Guest Rooms (Floors 10–41) • Guests only".
  - Assigned every guest NPC a stable home floor in the F10–F41 band and a unique room number (e.g., Lola Room 3512 · F35, Gus Room 1405 · F14), shown in their hover/nametag and mentioned in dialogue. Hotel staff NPCs clearly designated with "· Staff".
- **Player Room Tiers & Upgrades (`js/data.js`, `js/main.js`, `js/save.js`, `index.html`, `css/style.css`)**:
  - Added 5 purchasable room tiers progressing upwards through tower floor bands: Standard Room (Tier 1, F11, 9x8, 0 coins), Superior Room (Tier 2, F18, 11x9, 250 coins), Deluxe Room (Tier 3, F25, 13x10, 500 coins), Junior Suite (Tier 4, F32, 15x11, 1000 coins), and Presidential Suite (Tier 5, F38, 18x13, 2000 coins).
  - Top Bar "Upgrade Room" button opens upgrade agency modal with tier previews and purchase buttons; placed furniture safely migrates with unplaceable items returned to inventory; multiplayer snapshot sharing reflects the player's active tier.
- **Per-Room Floor Materials & Ambient Lighting Multiply Pass (`js/sprites.js`, `js/render.js`)**:
  - Implemented 11 distinct isometric floor tile materials (`lobby_marble`, `dark_parquet`, `gym_rubber`, `spa_stone`, `arcade_neon`, `arcade_reserved`, `library_carpet`, `grass`, `glasshouse_tile`, `stone_path`, `kitchen_tile`).
  - Added per-room ambient lighting engine with darkness multiply blending and radial warm emissive glow pools for chandeliers, sconces, and table candles.
- **27 New Voxel Catalogue & Furniture Models (`js/data.js`, `js/sprites.js`)**:
  - Built volumetric models for starting blocks, changing cubicles, salon chairs, massage beds, kitchen ranges, prep counters, commercial sinks, dishwashers, kitchen fridges, kitchen pass, maitre d' podium, grand pianos, round tablecloth tables, wine walls, gym mirror wall, squat racks, dumbbell racks, workout benches, spin bikes, rowers, wisteria pergolas, sakura trees, flower planters, and dance machines.
- **Cassette Music Player (`index.html`, `css/style.css`, `js/audio.js`, `js/main.js`, `js/save.js`)**:
  - Restyled the expanded music widget into a retro pixel-art cassette player with code/CSS-drawn cassette shell, vintage tape label showing the current track title, corner screws, and dual tape reels with gear teeth that spin while playing and stop when paused.
  - Implemented live interactive seek bar showing elapsed and total time (`M:SS`) with live progress updates. Supports clicking and dragging via mouse and pointer events (with pointer capture for touch support) and keyboard arrow navigation.
  - Added track seeking engine methods (`seek`, `seekRatio`, `getCurrentTime`, `getDuration`, `formatTime`) supporting file-backed soundtrack audio elements and procedural synth loops.
  - Added minimise toggle (existing `▼`/`▲` button) that collapses the player to compact size (track title, room subtitle, seek bar, transport controls) and expands back to the full cassette view; persists minimised/expanded state in save settings (`state.settings.playerMinimized`).
  - Styled with non-overlapping bounds above the chat dock, crisp at DPR 1x and 2x.
- **Rooftop Elevator & Stairwell Housing Structure (`js/data.js`, `js/render.js`, `tests/logic.test.mjs`)**:
  - Replaced floating elevator and stairwell doors on the open-air glass railing with a solid rooftop housing box (`x = 4..14, y = 0`) with solid building walls, windows, and flat top parapet coping.
  - Mounted elevator door and locked decorative stair door ("Staff Only") on the housing walls, keeping all other roof perimeter edges open-air with glass balustrade railings.

### Fixed

- **Tower Exterior & Floor Overhang Fix (`js/render.js`)**:
  - Fixed expanded floor slabs protruding beyond tower base and hovering over streets; city footprint expanded to 64x48 min parcel and facade/cut-away edges render unclipped at all camera zoom levels.
- **Rooftop Glass Railing Corner Bug (`js/sprites.js`)**:
  - Fixed `buildGlassBalustradeSegment` to strictly constrain pixel generation to its own tile half (columns 0..31 for west, columns 32..63 for north), meeting cleanly with a unified corner post at all roof edges.
- **Library Bookshelf Sprite Model Bug (`js/sprites.js`, `tests/logic.test.mjs`)**:
  - Redrew `buildBookshelf` model for both rotations (0 and 1) with solid upright side panels enclosing the bookcase, recessed book rows with gilded spines, solid base plinth, back panel, and molded top cornice.

## [0.8.2] - 2026-11-09

### Added

- **Public Floor Expansion (`js/data.js`, `js/render.js`)**:
  - Expanded all public hotel floors according to the area size plan: 16x area (4x width, 4x depth) for Grand Lobby (`64x48`), Skyline Restaurant (`48x36`), and Azure Pool & Spa (`44x36`); 4x area (2x width, 2x depth) for Starlight Cafe & Bar (`20x16`), Pulse Fitness Gym (`22x16`), Pixel Arcade (`22x16`), Quiet Library & Hub (`22x16`), and Cloud Nine Sky Garden (`22x18`). My Room remains unchanged (`9x8`).
  - Redistributed and added furniture, lighting, and NPC zones across all expanded rooms with sensible zoning, zero overlaps, and generous open areas reserved for future major facilities.
  - Viewport frustum culling in `renderRoom` transforms visible screen bounds to isometric tile coordinates, drawing only tiles within view to maintain 60 FPS performance on large layouts.
  - Expanded isometric background city corridors and block coverage to wrap seamlessly around the enlarged hotel footprint at all zoom levels.
- **Open-Air Rooftop Rework (`js/data.js`, `js/sprites.js`, `js/render.js`, `js/main.js`, `js/audio.js`)**:
  - Transformed Rooftop Lounge from tower floor 10 into an authentic open-air rooftop observatory above the tower stack (`floor: 'R'`, `isRooftop: true`).
  - Perimeter styled with transparent glass balustrades, stainless steel stanchions, and safety handrails (`buildGlassBalustradeSegment`) replacing standard walls, completely open to the sky and procedural skyline with no ceiling slab cutaway overhead.
  - Features an illuminated outdoor infinity pool along the eastern terrace with water overflow weir and cascading visual against the tower facade, outdoor lounge sofa, cocktail bar, and brass telescopes.
  - Removed legacy non-elevator door pair `Lobby(6,0) <-> Rooftop(4,0)`. Added direct illuminated stairwell door pair between the Sky Garden top floor and Rooftop Lounge ("To Roof" / "To Sky Garden").
  - Elevator system and room labels updated to designate the rooftop as "Floor R" / "R" sorted atop the elevator directory.
- **Save Version 6 Migration (`js/data.js`, `js/save.js`)**:
  - Bumped `SAVE_VERSION` to 6. Added `MIGRATIONS[5]` safely migrating v5 saves: unmodified public floors upgrade to the expanded v0.8.2 layouts, custom furniture placed on changed floors is sanitized with any overlapping or out-of-bounds items returned to player inventory, and players saved on deprecated doors or invalid tiles are safely relocated to room spawn. Multiplayer My Room snapshots remain fully compatible.

### Fixed

- **Rooftop Rendered a Blank Sky (`js/render.js`)**: `buildIsoCityLayout` computed `horizonY` as `height * 0.26 + (floor - 1) * 3`, but the Rooftop's `floor` is now the string `'R'` — `('R' - 1) * 3` is `NaN`, which fed a `NaN` into `ctx.createLinearGradient`, threw an uncaught exception mid-frame, and silently killed the `requestAnimationFrame` loop for the rest of the session (every floor after that, not just the Rooftop, froze on whatever was last drawn). `horizonY` now resolves `'R'` to the same numeric floor (10) the rest of the file already used. The Rooftop (and everything navigated to afterwards) renders correctly again.
- **Camera Didn't Follow the Player on the Bigger Floors (`js/main.js`)**: the camera only recentred on room entry, which was fine when every floor fit on screen; now that the Lobby/Restaurant/Pool are up to 16x their old area, walking across one could carry the player far outside the viewport with no way to see them. The camera now eases toward the player each frame while they're walking (skipped while manually dragging/panning), so they stay in view across the whole floor.
- **Smoke Test's Rooftop Screenshot Was Actually the Lobby (`tests/smoke.spec.mjs`)**: `08-rooftop-night-2x.png` was captured after a stray `takeElevator('lobby')`, so it never exercised the Rooftop at all (and the `NaN` bug above made it an empty blue sky regardless). The Rooftop is now screenshotted in place for both day (`08-rooftop-day-2x.png`) and night (`08-rooftop-night-2x.png`), each asserting the floor indicator reads "Floor R — Rooftop Lounge" first.
- **Flaky Doormat Smoke Check on the Bigger Lobby (`tests/smoke.spec.mjs`)**: the elevator-doormat check walked the player across the now much larger Lobby but only waited a fixed 1200ms, which was no longer enough time to arrive. Swapped the fixed wait for polling until the player reaches the doormat tile.

## [0.8.1] - 2026-11-09

### Fixed

- **City Vehicles Floating Over Buildings (`js/render.js`)**: `drawBackground` now renders the city in three strictly ordered passes onto separate cached canvases — street/sky backdrop (no buildings), animated vehicles, then a buildings layer that **unconditionally redraws every block's building** (not just a "foreground" depth subset as before, which was the actual bug: any building behind that depth cutoff never got redrawn over the vehicle layer). Buildings now always occlude cars correctly regardless of their distance from the hotel, on every floor and at every zoom. Covered by a new Node test that drives `drawBackground` against a fake canvas context and asserts the buildings blit always lands after the vehicle draw calls.
- **Incomplete City Background at Zoom-Out (`js/render.js`)**: `buildIsoCityLayout`'s screen-space culling margins, the road/crossing/block grid extents, and the spire/beacon bounds were all too tight for a fully zoomed-out viewport, leaving an empty sky band with buildings cut off flat along a horizontal line. Extended the over-scan padding and block grid range, and added a procedural distant skyline silhouette plus high-floor cloud ribbons so the city now fills the viewport edge-to-edge at every floor and the full `[0.55, 2.5]` zoom range. Verified with screenshots at min zoom on floors 1, 5, 8, and 10.
- **Player Could Sit On Counters/Bars/Tables (`js/main.js`)**: `applyInteractionArrival`'s sitting-pose decision only checked the interaction *kind* (`'sit'`/`'eat'`), but counters/tables/bars also use kind `'eat'` for their standing "use" interaction — so walking up to use one (or an NPC forced onto one) rendered the avatar sitting on top of it. The sit pose now additionally requires the catalogue item's own `seat: true` flag, so only real seats (chairs, stools, sofas, benches) ever sit; standing-use surfaces render standing. A new logic test asserts every item whose id/name looks like a table/counter/bar/desk has `seat: false`.
- **Floor 9 & 10 Furniture Overlaps (`js/data.js`)**: Sky Garden's two ornamental sakura trees visually fused into the neighbouring flower planter (adjacent-tile sprites with tall canopies overlapping in the isometric projection even without a literal tile collision); repositioned both trees well clear of the planters, the koi pond, and the benches. Rooftop's bar counter/stools were already correctly spaced — the "Lola fused into the bar" symptom traced back to the same sit-pose bug above (an NPC forced onto the bar rendered seated). A new logic test checks every preset floor layout for overlapping non-flat furniture footprints and verifies every door/elevator-mat landing tile stays reachable and unblocked.

### Added

- **Lamp/Light On-Off Toggle (`js/data.js`, `js/main.js`, `js/render.js`)**: Every light-fixture item (Lava Lamp, String Light Post, Neon "HOTEL" Sign, Imperial Crystal Chandelier — tagged `lightSource: true`, interaction `toggle_light`) can now be clicked to toggle the room's lighting. Off darkens the room's floor and walls with a real colour-shade dim (not just an overlay) and renders the fixture's own sprite darkened; on restores normal colours and the fixture's warm emissive glow at night. Only works in the player's own My Room — public floors and a friend's room during a multiplayer Visit show a "Not your room" toast and make no change. The per-room `lightsOn` flag is persisted in the save (`SAVE_VERSION` 4 → 5, with a migration step that defaults any existing room to on and preserves an already-saved choice).
- **Elevator Doormat Trigger + Modal Popup (`index.html`, `css/style.css`, `js/main.js`)**: The floor directory now opens as soon as the avatar steps on the doormat tile directly in front of an elevator door, instead of walking into the door itself (elevator door tiles are now non-walkable). The directory is a centred modal popup with a dimmed backdrop, closable via the X button, Esc, or a click outside the box; the E key shortcut still opens the same popup.
- **Shop/Inventory Category Submenus (`js/data.js`, `js/main.js`, `css/style.css`)**: Every catalogue item now carries a `category` (Seating, Tables, Beds, Lighting, Plants, Rugs, Decor & Signs, Entertainment, Outdoor/Pool, Kitchen/Food). The Shop, My Items, and In This Room tabs all open on a grid of category tiles showing each category's item count; clicking a tile drills into its filtered list with a Back button. Buy/Place/Move/Pick-up/locked behaviour is unchanged. A logic test asserts every catalogue item has a category from the canonical list.

### Testing

- `npm test` (73 Node unit/logic tests) and `npm run test:smoke` (Playwright, DPR 1× and 2×, plus the mocked-multiplayer UI flow) both pass.

## [0.8.0] - 2026-11-08

### Added

- **Basic Multiplayer, opt-in only (`js/multiplayer/*`, `js/config.js`, `supabase/migrations/0001_v08_multiplayer.sql`, `docs/v0.8-multiplayer.md`)**:
  - A new 🌐 Multiplayer panel (Connect / Visit Friend / Party Room tabs). **Nothing network-related runs until the player clicks Connect** — single-player stays fully offline and the existing save (`pixelHotel.save.v1`) is never read or written by any multiplayer code; verified by a Playwright check that asserts zero requests to Supabase/the CDN happen just from opening and using the panel without connecting.
  - **Anonymous identity**: `supabase.auth.signInAnonymously()` plus a chosen display name and a short unique shareable friend code (`profiles` table, `ensure_profile()` RPC).
  - **Visit a friend's room by code**: a persistent guestbook/noteboard per My Room (`room_notes`, max 140 chars, client + DB-side length/character validation, a concurrency-safe per-author-per-room hourly rate limit enforced by a `BEFORE INSERT` trigger using `pg_advisory_xact_lock` so it can't be bypassed by inserting directly) with likes (`room_note_likes`), owner delete-any / author delete-own, and a one-click "View My Guestbook" shortcut to your own board. Visiting someone else's room also renders a **transient, read-only snapshot** of their My Room (`room_snapshots`) — Move/Pick up/Buy/Place are all blocked while visiting, the visitor's own local save is never touched (the snapshot is kept out of the saved game state entirely), and their own room is restored on Leave Visit/Disconnect.
  - **Invite-code party rooms**: create/join via `create_multiplayer_room()`/`join_multiplayer_room()` RPCs, live in a shared My Room scene over a Supabase Realtime **private channel** (`room:<code>`) using Presence (member list) and Broadcast (throttled position updates + interpolated remote avatar movement, speech-bubble chat). Access is granted/revoked only by SECURITY DEFINER RPCs and enforced server-side via Row Level Security on `realtime.messages` — not a client-only check — so a client without a current `multiplayer_room_access` row cannot grant itself access to a room. Incoming Broadcast payloads are independently bounded/validated (finite in-range coordinates, UUID-shaped ids, text length/control-character checks, a per-sender receive throttle) and a received "kicked" event is confirmed against the `check_kicked_from_room` RPC before a client disconnects itself, rather than trusting the broadcast alone — but Realtime Authorization only proves the *sender* holds room access, not that a `userId` they put inside their own payload is really theirs, so this is **not** spoof-proof against another authenticated room member; see `docs/v0.8-multiplayer.md` §4 for the honest threat model. Kicking durably bans the specific user id from that specific room (`multiplayer_room_kicks`) in addition to a best-effort live-disconnect broadcast.
  - **Client-side word filter, HTML-safe rendering, local (per-device) mute, and owner kick** (`js/multiplayer/filter.js`, `js/multiplayer/localPrefs.js`) — documented explicitly as UX-level, not a security control; see `docs/v0.8-multiplayer.md` for the full threat/limits write-up (disposable anonymous identities, guestbook read-scope trade-off, no abuse/moderation tooling).
  - Public client config (`js/config.js`): Supabase URL + publishable key, intentionally public — all access control is server-side RLS. The Supabase JS client itself loads from a pinned CDN ESM URL only at opt-in time, with no bundler/npm dependency added.
  - Unit tests (`tests/multiplayer.unit.test.mjs`) for the filter/validation/rate-limit helpers and a mocked-Supabase-client smoke pass covering auth/guestbook/room flows (create/join/kick, rate limiting, delete permissions), plus a mocked-browser Playwright flow (`tests/smoke.spec.mjs`) driving the real Connect/Visit/note/owner-delete/join/movement/chat-filter/mute/kick UI against an in-page fake Supabase client/Realtime bus — no test ever touches a real database.
  - `supabase/migrations/0001_v08_multiplayer.sql` is a single idempotent migration containing the exact dashboard setup instructions (enable anonymous sign-ins, run this SQL, disable Realtime "Allow public access") plus every RLS policy/grant — intended to be run once by a human via the Supabase SQL Editor. **Not yet applied to or verified against a live project**; see `docs/v0.8-multiplayer.md` §6 for open risks and the required two-browser validation checklist before release.

## [0.7.2] - 2026-11-08

### Fixed

- **Crisp Rendering at Every DPR × Zoom (`js/render.js`)**: All baked bitmaps (furniture, characters/NPCs, floor/wall/window/door tiles, the tower cut-away, and the city skyline/foreground) are now rasterised at `deviceScale(dpr, zoom) = ceil(dpr * zoom)` instead of raw `dpr`, so zooming in no longer upscales a lower-resolution bitmap into a blurry one — every layer stays 1:1 or sharper in device pixels at any supported DPR/zoom combination.
- **Zoomed-Out Background Gap (`js/render.js`)**: `drawBackground`/`renderSkylineToCanvas` now over-scan the baked city canvas (bucketed to 96px steps) by exactly the margin a zoom-out below 100% exposes, so the sky/city/ground always fills the viewport edge-to-edge with no empty margin, and the bottom-left music player is never clipped.
- **Vehicles Floating Over Building Facades (`js/render.js`)**: City blocks nearer the camera than street level are redrawn in a second transparent pass over the animated vehicle layer (`renderSkylineToCanvas(..., foregroundOnly)`), so a car on a road behind a building is correctly occluded instead of appearing to drive across its windows; headlight/taillight cones stay clipped to the ground-plane band.
- **Music Not Restarting After Unmute Then Room Change (`js/audio.js`)**: `_playFileTrack` now cancels any pending deferred-pause timer left over from a prior fade-out of the track it is about to (re)play, so a stale timer scheduled before the mute/room-change sequence can no longer pause the audio element seconds after playback has already resumed.

## [0.7.1] - 2026-11-07

### Added

- **Licensed Floor Soundtrack (`audio/music/`, `js/audio.js`, `js/main.js`)**: Replaced the procedural per-floor loops with James's original MP3 tracks (`01-grand-lobby.mp3` … `10-rooftop.mp3`, one per floor, Music by James). Each floor's file loads lazily when first visited, the next floor in sequence preloads in the background, the current track loops seamlessly via the browser's native media loop, and switching floors crossfades the old track out and the new one in over the Web Audio graph — all routed through the existing Music and Master volume sliders and the play/pause/prev/next/Auto: Room controls. If a floor's file fails to load or play, that floor instantly and silently falls back to the original procedural synth track. Still no autoplay: playback only starts after the first user gesture, exactly as before.
- **Bottom-Left Player Track Titles (`js/audio.js`, `index.html`)**: The music player now shows the licensed track title for the current floor — Grand Lobby Jazz Lounge, Cafe and Bar Bossa Nova, Restaurant Smooth Jazz, Gym Pulse Fitness Electronic, Pool and Spa Calm Ambient, Arcade Chiptune, Library Soft Piano, My Room Lofi Chill, Sky Garden Nature Acoustic, Rooftop Sunset Night House — falling back to the original procedural track title whenever a floor's file isn't playing.

### Changed

- **Deploy Workflow (`.github/workflows/deploy.yml`)**: The GitHub Pages deploy step now copies `audio/` into `_site` alongside `index.html`, `css`, and `js` so the floor soundtrack ships with the live site.

## [0.7.0] - 2026-11-07

### Added

- **Grand Lobby Expansion (`js/data.js`)**:
  - Expanded Floor 1 into a much larger 16×12 double-height Grand Lobby with a marble checkerboard floor, 4 Corinthian marble pillars, an Imperial Crystal Chandelier, a sweeping grand mezzanine staircase, lounge seating (sofa, armchairs, cafe table), an Atrium Marble Fountain, flower planters, a luggage trolley, a Concierge Podium, and a 3-tile Reception Desk staffed by **Celeste**, the Head Receptionist, who greets the player, answers hotel-facilities/check-in questions through dialogue topics, and kicks off the starter Welcome Quest.
- **True-to-Storey Isometric City Scale (`js/render.js`)**: Reworked `computeGroundDy`/`computeCityGroundDy`/`storiesBelowFloor` and the isometric city layout so every room floor corresponds to exactly one storey of window rows — the lobby shows a ground-level street with no storeys below, Floor 4 shows 3 storeys below, and neighbouring city buildings (3–30 storeys) use the same storey unit, giving the tower and its neighbours consistent, believable proportions.
- **Animated Isometric Traffic & Procedural Traffic Ambience (`js/render.js`, `js/audio.js`)**:
  - Added `computeCityVehicles`/`drawCityVehicles`: animated cars, taxis, buses, and scooters that follow the isometric road lanes in the correct direction, stop at pedestrian crossings, and switch on headlights/taillights at night.
  - Added procedural Web Audio traffic ambience (engine hum, occasional horn, bus brake hiss) tied to the SFX volume/mute toggle and automatically quieter on higher floors and inside rooms than at street level.
- **Zoom & Pan Controls (`js/render.js`, `js/main.js`, `index.html`, `css/style.css`)**: Mouse wheel, trackpad pinch, on-screen **−** / **+** / **1:1** buttons, and `+`/`-`/`0` keyboard shortcuts zoom toward the cursor and clamp between 55%–250%; click-drag pans the camera and a recentre action snaps back to the player. The new default zoom (≈185%) matches the reference close-up framing, is crisp at every zoom level under HiDPI, is persisted in settings, and pointer→tile hit-testing (`tileToScreen`/`screenToTile`) stays correct at every zoom and pan offset.
- **Object Collision & Advanced A\* Pathfinding (`js/pathfinding.js`, `js/inventory.js`, `js/main.js`)**:
  - Every furniture item now declares a footprint and a `walkable` flag; blocking items (sofas, tables, counters, plants, lamps, machines, beds, desks…) block their tiles while rugs, floor mats, door mats, and yoga mats stay walkable. Seats and beds are reached via a free adjacent tile before sitting/lying.
  - Rewrote pathfinding as a pure, DOM-free A\* (`findPath`) with a binary-heap open list, octile heuristic, 8-directional movement with strict no-corner-cutting, line-of-sight path smoothing/string-pulling, straight-path tie-breaking, and nearest-reachable-tile fallback (`findNearestReachableTile`) when a clicked tile is blocked.
  - Added seamless mid-step re-targeting (`retargetMover`/`advanceMover`): a new click while walking continues the current interpolated step and re-plans from the tile being entered instead of snapping back or replaying a tile, duplicate clicks on the same target are ignored, and rapid repeated clicks no longer cause stutter/back-and-forth movement.
  - Added tile reservation (`reservedTilesExcluding`) so the player and NPCs dynamically re-plan around each other instead of colliding, and placement validation that prevents furniture from trapping the player or blocking a door/elevator tile.
  - Bumped `SAVE_VERSION` with a migration that reconciles overlapping placed items from older saves against the new collision rules.
- **Wandering, Pathfinding NPCs & Click-to-Talk Dialogue (`js/npc.js`, `js/main.js`)**:
  - NPCs now wander between points of interest and furniture using the same A\* pathfinding as the player, pause naturally, and avoid the player and each other via tile reservation; the receptionist stays stationary behind her desk.
  - Clicking/tapping any NPC (wandering guests or the receptionist) walks the player to a free tile adjacent to them (picking an actually *reachable* adjacent tile, not just the nearest one, so a desk/NPC's own tile can no longer trap the approach), opens a speech-bubble dialogue panel with greeting/topic lines, and the NPC resumes wandering after a pause or when the player walks away. Hit-testing uses each NPC's on-screen sprite bounds at the current zoom so NPC clicks never fall through to a floor walk.
- **Compact Bottom-Left Music Player (`index.html`, `css/style.css`, `js/main.js`, `js/audio.js`)**: A collapsible widget showing the current track title and room/mood, play/pause, prev/next track cycling, an "Auto: follow room" toggle (on by default), a small animated equaliser/progress bar, and a volume slider linked to the Music volume.
- **Settings Panel with Master/Music/SFX/Ambience Mixing & Per-Room Tracks (`js/audio.js`, `index.html`)**: A gear-button settings panel with Master, Music, SFX, and Ambience (traffic) volume sliders (0–100%, live preview, persisted), raised default music loudness via gain staging and a light compressor/limiter, and a distinct procedural track per room/floor (lobby jazz lounge, cafe bossa, restaurant smooth jazz, gym upbeat electronic, pool & spa ambient, arcade chiptune, library soft piano, My Room lo-fi, sky garden acoustic, rooftop sunset/night house) with smooth crossfades between rooms and night variants.
- **Procedurally Rendered Item Icons (`js/render.js`)**: Every catalogue item now renders its own voxel/sprite model into a cached, HiDPI-crisp, transparent, auto-fit thumbnail (`getItemIconDataUrl`/`renderItemIcon`) used across the Shop, My Items, In This Room tabs, and placement preview, replacing the old flat colour squares, with a fallback for any item whose model can't render.

### Fixed

- Fixed a `ReferenceError: tileToScreen is not defined` crash (missing import in `js/main.js`) that broke the exposed `window.__pixelHotel.tileToScreen` debug/test hook and left the pointer→tile round-trip test unable to run; `tileToScreen` results are now additionally passed through `worldToScreen` so they match the zoom/pan-aware coordinates `screenToTile` expects.
- Fixed `tests/smoke.spec.mjs` hanging indefinitely on any mid-test failure: the Playwright `browser` handle was never closed on an error path, keeping the Node process alive forever. The browser is now always closed in a `finally` block, and a 90s watchdog timer forces an exit as a last resort.

## [0.6.0] - 2026-11-07

### Added

- **Shared Isometric City & Street Grid (`js/render.js`)**:
  - Replaced the flat front-facing 2D skyline and horizontal road strip with a unified 3D isometric city and ground plane (`projectIsoCityPoint`, `buildIsoCityLayout`, `computeGroundDy`, `computeCityGroundDy`) projected on the exact same 2:1 `(u, v)` axes as the hotel tower.
  - Added isometric avenues along the `u` and `v` axes, dashed centre lane markings, pedestrian zebra crossings at intersections, raised block sidewalks with kerbs and paving joints, isometric street trees, streetlamps with warm dusk/night glow pools, and foreground fountain park plazas.
  - Added depth-sorted neighbouring 3D isometric buildings of varied heights (`2`–`10` stories) with true isometric facade windows on both left (`+u`) and right (`+v`) walls, recessed roof decks, rooftop penthouses/spires, HVAC units, skylights, sky-garden terraces, atmospheric distance haze, and floor-dependent camera elevation (street-level avenues on lower floors vs neighbouring isometric rooftops on high floors).
  - Added offscreen static layer caching (`cutawayCache` + `skylineCache`) for both the isometric city backdrop and the lower tower cutaway shaft.
- **Procedural Web Audio Lounge/Lofi Music & Soft Enveloped SFX (`js/audio.js`, `js/main.js`, `js/save.js`, `index.html`)**:
  - Replaced harsh square-wave chiptune beeps with warm procedural Web Audio lounge/lofi looping music featuring low-pass filtered Rhodes/pad 7th chords, triangle sub-bass, bell plucks, and brushed pink-noise percussion.
  - Added area and time-of-day musical moods (`MOOD_PROFILES`, `moodForRoom`): **Velvet Lounge** (`lobby`), **Pulse Synth Groove** (`gym`), **Azure Spa Drift** (`spa`), and **Midnight Lofi** (`night`).
  - Added soft low-pass filtered, smooth-enveloped SFX for UI clicks (`click`), player footsteps (`footstep`), shop coins (`coin`), furniture placement (`place`), quest completion (`quest`), chat (`chat`), and two-tone luxury elevator bells (`elevator`).
  - Added separate Music and SFX mute buttons (`#btnMusicMute`, `#btnSfxMute`) and volume sliders (`#musicVolume`, `#sfxVolume` in `#audioPanel`), persisted in `state.settings` (`musicMuted`, `sfxMuted`, `musicVolume`, `sfxVolume`), and deferred `AudioContext` creation until the first user gesture (`unlockGesture`).

## [0.5.0] - 2026-11-07

### Added

- **v0.5.0 Research Synthesis (`docs/research-v0.5.md`)**:
  - Combined Parts A and B of the v0.5 research notes into `docs/research-v0.5.md`, retaining all verified source URLs and concrete implementation mappings across room geometry, cutaway parallax skylines, hotel amenity zoning, expressive voxel characters, and furniture interaction/animation systems.
- **Varied / Irregular Room Shapes & Door Arrival Clearance**:
  - Added `TILE.VOID = 4` cutouts (`makeRoomGrid`) and `zoneTiles` (with optional split-level step risers) across all 10 hotel floors (`atrium-step`, `l-terrace`, `split-dining`, `workout-wing`, `spa-deck`, `arcade-alcove`, `reading-nook`, `suite-alcove`, `conservatory-terrace`, and `sky-promenade`).
  - Added `hasDoorArrivalRoute` and 1-tile door landing apron protection (`'door_clearance'`) in `canPlaceAt` so doors and elevators remain unobstructed while flat rugs can still sit on door aprons.
  - Added `SAVE_VERSION = 3` migration (`MIGRATIONS[2]`) upgrading v2 saves while filtering legacy furniture on `VOID` tiles and rescuing any player coordinates on `VOID` cells.
- **Perspective-Consistent Isometric Cutaway Skyline & Emissive Night Lighting**:
  - Upgraded parallax skyscraper layers in `renderSkylineToCanvas` with 2:1 isometric roof caps and angled side parapets matching the room's 2:1 projection, high-altitude cloud ribbons on upper floors (F7–F10), and illuminated streetlamps on the ground-floor plaza.
  - Upgraded `drawTowerCutawayUnder` to follow per-tile non-`VOID` floor boundaries with stepped reinforced concrete slabs and I-beam markers.
  - Added localized warm dusk/night radial emissive light pools (`screen` blend) for lamps, neon signs, string lights, arcade cabinets, karaoke machines, aquariums, dining tables, sauna cabins, and heated pools.
- **Categorised Elevator Navigator & Functional Amenity Arrangements**:
  - Grouped the 10-floor Elevator Directory into 3 themed wings (**Suite & Sky Decks**, **Recreation & Wellness**, **Ground & Dining**) with live NPC guest counts per floor.
- **Expressive Voxel Faces, Asynchronous Blinking & Breathing Idle Variety**:
  - Upgraded `headTex` and `buildParts` in `js/voxel.js` with upper-eyelid creases, iris/pupil/dual catchlights, personality-tuned eyebrows, side-profile eyes and brows on `'left'` and `'right'` head faces, dynamic mouths (`chew`, `pant`, `lips`, `open`, `frown`, `smile`), asynchronous per-entity blinking (`blink`), and subtle 2-phase breathing torso/head bob (`breathe`).
- **Multi-Slot Occupancy, Safe Approach Tiles & Distinct Activity Animations**:
  - Added `interactionSlots`, `findFreeInteractionSlot`, `findApproachTile`, and `isDiningSeat` in `js/inventory.js` plus pending slot reservations (`reservedTilesExcluding`) in `js/main.js`, allowing 2 occupants on 2-tile sofas/beds and 4 swimmers in lap pools while routing solid counter/machine interactions to unblocked adjacent tiles facing inward.
  - Added visibly distinct multi-frame animations and canvas effects for **Treadmill Running** (`action: 'treadmill'` with high-knee stride, bent arm drive, moving belt chevrons, and sweat droplets), **Pool Swimming** (`action: 'swim'` with submerged lower body, alternating freestyle/breaststroke arms, animated waterline, V-wake, and splash droplets), **Dining / Eating** (`action: 'eat'` with right-arm cup/utensil lift, chewing mouth, and rising aroma wisps), and **Reclining / Lying** (`action: 'lie'` on suite beds and yoga mats).

## [0.4.0] - 2026-11-07

### Added

- **Crisp Native-DPR Rendering**:
  - Dynamic canvas backing store sized to `CSS box * window.devicePixelRatio` with `ResizeObserver` and resize handling.
  - DPR-aware sprite and voxel character caching (`scale` included in cache keys) blitted 1:1 to integer device pixels.
  - High-DPI volumetric 3D prism rasterisation for furniture and finer detail on voxel characters.
  - Readable UI and canvas typography (`system-ui` / sans-serif `>= 13px`, high-contrast pill badges, NPC name tags, and speech bubbles).
- **Procedural Parallax City Skyline Backdrop**:
  - Time-of-day sky gradients (noon cerulean, sunset coral/amber, starry midnight navy), sun & moon arcs, twinkling stars, coastal hills, harbour water, 3 deterministic seeded skyscraper layers with windows that light up at dusk/night, and blinking aircraft warning beacons.
  - Offscreen canvas caching keyed by viewport size, DPR, floor parallax, and quantised time bucket.
- **Skyscraper Tower Cut-Away Architecture**:
  - Every room is presented as a cut-away floor of a tall hotel tower with reinforced concrete floor/ceiling slabs, structural steel beam markers, exterior columns, and neighbouring upper/lower floor facade windows and silhouettes (open sky parapet on the Floor 10 Rooftop Lounge). Lower floors stand on a street-level plaza with sidewalk trees and a road; higher floors run off-screen down the tower.
  - Floor indicator in the top bar (`Floor 1 — Grand Lobby` .. `Floor 10 — Rooftop Lounge`).
- **10-Floor Hotel Expansion, My Room & Elevator Navigation**:
  - 8 new rooms across Floors 2–9: **Starlight Cafe & Bar** (F2), **Skyline Restaurant** (F3), **Pulse Fitness Gym** (F4), **Azure Pool & Spa** (F5), **Pixel Arcade & Games** (F6), **Quiet Library & Hub** (F7), **My Room** private player suite (F8), and **Cloud Nine Sky Garden** (F9).
  - 7 new NPCs (Pip, Chef Sora, Coach Rex, Marina, Zack, Clara, Flora) with custom voxel outfits and themed dialogue.
  - 19 new volumetric 3D furniture & decor items (`suite_bed`, `treadmill`, `weight_bench`, `dumbbell_rack`, `yoga_mat`, `dining_table`, `dining_chair`, `buffet_counter`, `chef_station`, `pool_water`, `sauna_cabin`, `towel_rack`, `espresso_bar`, `cafe_table`, `pool_table`, `computer_desk`, `sky_tree`, `garden_bench`, `flower_planter`).
  - **Elevator Directory UI** (`🛗 Elevator` button, `🔑 My Room` shortcut button, keyboard shortcut `E`, and brushed-steel elevator doors in every room) with animated elevator door & floor counter transitions.
  - 4 new quests (`quest_gym`, `quest_dine`, `quest_myroom`, `quest_explorer`) and `SAVE_VERSION = 2` migration preserving v1 saves.

## [0.3.1] - 2026-11-07

### Added

- GitHub Actions deploy to GitHub Pages (tests run first; only index.html, css and js are published).
- Gitleaks secret scanning in CI and as a pre-commit hook; reviewed false positive (save-slot key name) listed in .gitleaksignore.

## [0.3.0] - 2026-11-07

### Added

- 8 original distinctive catalogue furniture and decor items with unique geometry and sensible pricing (no external assets, no Habbo copies):
  - **Luminous Reef Tank** (`aquarium`): 2x1 oceanic aquarium with living coral reef and darting neon clownfish.
  - **Tea-Pearl Boba Bar** (`boba_bar`): 2x1 specialty drink counter with dual tea urns, cup sealer, and boba cups.
  - **Retro Pixel Arcade** (`mini_arcade`): 1x1 upright coin-op arcade cabinet with glowing CRT monitor and illuminated marquee.
  - **Midnight Noodle Cart** (`noodle_cart`): 2x1 street vendor cart with steaming broth cauldron, ramen bowls, striped awning, and glowing paper lantern.
  - **Star Stage Karaoke** (`karaoke_machine`): 1x1 digital kiosk with LED spectrum VU meters, lyric display, disco dome, and chrome microphone stand.
  - **Stargazer Telescope** (`telescope`): 1x1 mahogany equatorial tripod with angled brass refractor tube, counterweight, and coated objective.
  - **Zen Koi Stone Pond** (`koi_pond`): 2x2 hand-carved slate basin with clear turquoise water, stepping stone, flowering lily pad, and swimming calico koi.
  - **Gachapon Capsule Toy** (`capsule_dispenser`): 1x1 retro prize dispenser with coin turn crank, clear globe, and colorful toy capsules.
- Consistent volumetric 3D isometric voxel projection and lighting across all furniture and decor models (chairs, stools, sofas, lamps, plants, rugs, neon signs, jukeboxes, string lights, counters, and new collection), matching character voxel cameras and room lighting (`LIGHT.top = 0.14`, `LIGHT.py = 0`, `LIGHT.px = -0.22`, and `#2a1d2e` silhouette outline).
- 4-way rotation support for seats, chairs, and directional furniture.
- Coherent contact plane and floor contact shadows under all non-flat furniture.
- Thin rugs upgraded to physically thin cuboid surfaces (2px height) that maintain non-solid walkable pathing and allow furniture on top.
- Calibrated seat contact plane so sitting avatars' thighs rest directly on seat cushions with correct depth sorting and clean contact planes.
- Item descriptions displayed in Shop and Bag inventory tabs.
- Focused unit test suite for all 22 catalogue item sprites (non-empty, bounded, verified multi-toned volumetric faces), new item purchasing/balance validation, placement collision across rotations, and seating interactions.
- Showroom screenshot capture (`06-showroom.png`) and debug hook for visual verification.

### Changed

- Replaced all flat 2D billboard furniture models (chairs, lamps, plants, jukeboxes, signs, string lights) with genuine volumetric voxel geometry.
- `furnitureCanvas` now caches and renders with full 4-way rotation (`rot % 4`).

## [0.2.0] - 2026-11-07

### Added

- Volumetric 3D voxel character models (`js/voxel.js`) for the player and all 4
  NPC guests (Mochi, Gus, Dr. Pix, Lola), built from axis-aligned 3D boxes and
  projected isometrically with true 4-way rotation (no 2D mirroring).
- Character poses: distinct walk-cycle strides and seated poses, unique outfits,
  and customized accessories (glasses, mustache, bellhop hat, goggles, flower).
- Soft elliptical floor contact shadows under characters matching room lighting.
- Perspective-integrated wall windows cut into the north and west wall planes,
  featuring recessed reveals, inner sills, dynamic daylight sky gradients,
  sash bars, glare highlights, and projecting stone sills and lintels.
- Quantised daylight steps for efficient caching of daylight-dependent window
  sprites.
- Unit regression tests verifying bounded sprite generation across all 4 facings,
  walk strides, and sitting frames for all characters, plus both window
  orientations.

### Changed

- Replaced 2D flat character sprite sheet generation with procedural voxel
  model projection.
- Character stride state wired into entity rendering for walk animation.

## [0.1.1] - 2026-11-07

### Changed

- Back walls now stand on the floor's back edges and join into one continuous
  wall (previously they floated a row away with gaps); added baseboards.
- Doors are framed doorways cut into the wall with a welcome mat on the floor.
- Floor has visible front thickness and no hairline gaps between tiles.
- Brighter warm daytime palette; the game starts at noon. Night is dimmer but
  stays readable (lighter blue tint).
- Avatars redrawn: outlined, nicer faces (eyes, blush, mouth), hands, drop
  shadow, and feet anchored at the tile centre in walking and seated poses.
  Seated avatars now draw in front of multi-tile sofas.
- Help overlay closes with Escape or a click outside the box.

### Added

- New game starts with a cosy furnished Grand Lobby (reception desk, sofa,
  armchairs, rug, lamps, bookshelf, plants) and Rooftop Lounge (bar, rooftop
  sofa for the quest, deckchairs, string-light posts). Doors, spawn points and
  NPC homes stay reachable. Existing saves are untouched.
- Catalogue: Plush Armchair, Striped Deckchair, Reception Desk, Tall Bookshelf,
  Rooftop Bar, String Light Post — all procedural pixel art.
- Rugs are now walkable floor decor that furniture can sit on.
- Tests for seed integrity/reachability, old-save loading, and help overlay.

## [0.1.0] - 2026-11-06

### Added

- Isometric canvas renderer with procedurally drawn pixel-art floor/wall
  tiles, depth-sorted furniture/avatar/NPC rendering, and crisp (non-smoothed)
  pixel scaling.
- Two connected rooms — Grand Lobby and Rooftop Lounge — with door tiles that
  switch rooms on contact.
- Click-to-walk avatar with A* pathfinding, 4-direction facing, walk-cycle
  animation, and hover tile highlighting.
- Four original NPC guests with idle wandering, speech bubbles, keyword-based
  dialogue, and ambient chatter.
- Chat box with stacked speech bubbles and a scrolling chat log.
- Furniture catalogue with buy/place/move/rotate/pick-up, placement
  validation (walls, overlap, occupants), and a ghost preview.
- Multiple seat types; click-to-sit for the player, with occasional NPC
  auto-sit behaviour.
- Coins, a 4-quest quest line with coin rewards and catalogue unlocks.
- Day/night lighting cycle and an optional procedural WebAudio chiptune with
  a mute toggle (off by default).
- Versioned localStorage save/load with auto-save, manual Save/Reset, and
  corrupt-data/migration handling.
- Responsive desktop/mobile layout, first-run help overlay, and keyboard
  shortcuts.
- Node (`node:test`) unit tests for pathfinding, inventory, quests, and
  save/load, plus a Playwright smoke test with screenshots.
