# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
