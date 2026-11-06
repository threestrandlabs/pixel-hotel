# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
