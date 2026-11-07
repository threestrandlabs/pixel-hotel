# Pixel Hotel

A cosy, single-player browser game: check into a tiny isometric pixel-art hotel,
chat with the guests, decorate the lobby and rooftop lounge, and work through a
short list of quests. Built with plain HTML/CSS/JS ES modules — no build step,
no frameworks, no network calls.

This is an original homage to the cosy retro "virtual hotel" genre of the late
90s/2000s. It is **not affiliated with, endorsed by, or associated with Habbo,
Sulake, Nexon, or any other company** — every name, character, room, item and
line of dialogue here is original, and all art/audio is generated procedurally
in code (see **Assets & Attribution** below).

## Running it

No build step and no dependencies are needed to play. From this folder:

```sh
# Linux / macOS
python3 -m http.server 8080

# Windows
python -m http.server 8080
```

Then open **http://localhost:8080** in a modern desktop or mobile browser.

## Controls

| Action | How |
| --- | --- |
| Walk | Click a floor tile — your avatar pathfinds there automatically |
| Sit | Click a chair/sofa/stool — you'll walk over and sit facing it |
| Chat | Type in the chat box and press Enter / Send; nearby guests reply |
| Switch rooms | Walk onto a doorway tile, or open the **🛗 Elevator** (`E`) to travel to any of the 10 floors |
| Visit My Room | Click **🔑 My Room** or select **Floor 8 — My Room** in the Elevator Directory |
| Buy / place furniture | Open **Items**, buy from the Shop tab, then **Place** it and click a tile (ghost preview shows green/red for valid/invalid) |
| Move / pick up furniture | Open **Items → In This Room**, use **Move** or **Pick up** |
| Rotate while placing | `R` or the Rotate button |
| Cancel placing | `Esc` or the Cancel button |

### Keyboard shortcuts

`E` elevator directory · `I` inventory · `Q` quests · `M` mute/unmute music · `H` help · `S` manual save · `R` rotate (while placing) · `Esc` cancel/close

## Features

- **Crisp Native-DPR Isometric Rendering**: `<canvas>` backing store automatically matches `CSS box × devicePixelRatio` via `ResizeObserver`, with DPR-scaled sprite/voxel caches blitted 1:1 to device pixels and crisp `system-ui` canvas/UI typography.
- **Procedural Parallax City Skyline Backdrop**: Day/night sky gradients, sun and moon arcs, twinkling stars, coastal hills, harbour water, 3 deterministic seeded skyscraper layers with windows that light up at dusk/night, and blinking aircraft warning beacons — cached to offscreen canvases per time bucket.
- **Skyscraper Tower Cut-Away**: Every floor is presented as an architectural cut-away slice of a 10-story hotel tower with reinforced concrete floor and ceiling slabs, structural steel beam markers, exterior columns, and lit windows/silhouettes on neighbouring upper and lower floors (with an open-sky parapet on the Floor 10 Rooftop Lounge).
- **10-Floor Hotel Tower & Elevator Navigation**:
  - **Floor 1 — Grand Lobby** (`lobby`)
  - **Floor 2 — Starlight Cafe & Bar** (`cafe`)
  - **Floor 3 — Skyline Restaurant** (`restaurant`)
  - **Floor 4 — Pulse Fitness Gym** (`gym`)
  - **Floor 5 — Azure Pool & Spa** (`pool`)
  - **Floor 6 — Pixel Arcade & Games** (`arcade`)
  - **Floor 7 — Quiet Library & Hub** (`library`)
  - **Floor 8 — My Room** (`myroom`, your personal customizable suite)
  - **Floor 9 — Cloud Nine Sky Garden** (`garden`)
  - **Floor 10 — Rooftop Lounge** (`rooftop`)
  - Ride between any floor using the **🛗 Elevator** button (`E`), **🔑 My Room** shortcut, or the brushed-steel elevator doors in every room, with animated doors and floor counter.
- **Procedural 3D Voxel Characters**: Player avatar and 11 original NPC guests/staff built from volumetric axis-aligned box models with true 4-way rotation, walk strides, sitting poses, custom outfits/accessories, name tags, and soft floor contact shadows.
- Perspective-integrated wall windows cut into north and west wall planes with
  recessed side reveals, inner sills, dynamic daylight sky gradients, sash bars,
  glare highlights, and projecting stone sills and lintels.
- Click-to-walk avatar with A* pathfinding around walls, furniture and guests,
  4-direction facing, walk-cycle animation, and a hover tile highlight.
- Idle NPC wandering, chat bubbles, keyword-triggered responses, and ambient
  one-liners.
- Chat box with stacked speech bubbles above the avatar and a scrolling chat
  log.
- Volumetric 3D isometric furniture & decor models: every furniture piece
  (chairs, stools, sofas, lamps, plants, thin cuboid rugs, neon signs, jukeboxes,
  reception desks, bookshelves, bars, string lights, and the new collection) is
  modelled with genuine top, front-left, and front-right surfaces, coherent
  elliptical floor contact shadows, calibrated seating contact planes, and lighting
  matching room and character voxels.
- Original v0.3.0 collection (8 distinctive new furniture/decor items with original
  names, descriptions, and geometry; not copies of Habbo):
  - **Luminous Reef Tank** (`aquarium`): deep oceanic aquarium with living coral reef and darting clownfish.
  - **Tea-Pearl Boba Bar** (`boba_bar`): specialty counter brewing tapioca milk tea with tea urns and shaker machine.
  - **Retro Pixel Arcade** (`mini_arcade`): coin-op upright arcade cabinet running "Cosmic Bellhop".
  - **Midnight Noodle Cart** (`noodle_cart`): street vendor cart with steaming broth cauldron and red paper lantern.
  - **Star Stage Karaoke** (`karaoke_machine`): digital kiosk with LED spectrum VU meters, disco dome, and chrome mic.
  - **Stargazer Telescope** (`telescope`): mahogany tripod with equatorial mount and angled brass refractor tube.
  - **Zen Koi Stone Pond** (`koi_pond`): carved slate basin with water, stepping stones, lily pads, and swimming koi.
  - **Gachapon Capsule Toy** (`capsule_dispenser`): retro prize dispenser with coin turn crank and toy capsules.
- Furniture catalogue with buy / place / move / 4-way rotate / pick-up, full overlap
  and occupancy validation, and a ghost preview while placing. Rugs are physically thin
  cuboid surfaces that remain walkable floor decor.
- Multiple seat types; clicking a seat walks you there and sits you facing it with
  clean seat contact. NPCs occasionally sit down too.
- Coins, a quest list (greet guests, place furniture, sit on the rooftop
  sofa, visit both rooms) with coin rewards and catalogue unlocks.
- A slow day/night lighting cycle that tints the room and glows the windows,
  plus an optional procedural chiptune (WebAudio, muted by default) with a
  mute toggle.
- Versioned localStorage save/load with auto-save, manual Save/Reset, and
  migration/corruption handling.
- Responsive layout for desktop and mobile, a first-run help overlay, and
  keyboard shortcuts.

## Project structure

```
index.html          entry point
css/style.css        UI styling
js/data.js            seed content: rooms, NPCs, catalogue, quests (pure)
js/pathfinding.js     A* grid pathfinding (pure)
js/inventory.js       buy/place/move/pickup validation (pure)
js/quests.js          quest progress, rewards, unlocks (pure)
js/save.js            versioned localStorage save/load (pure)
js/npc.js             NPC wandering/dialogue logic (pure)
js/voxel.js           procedural 3D voxel character models & projection (pure)
js/sprites.js         procedural pixel-art generation & wall/window geometry
js/render.js           isometric rendering, depth sort, lighting (canvas)
js/audio.js            procedural WebAudio chiptune + SFX
js/main.js             game loop, input, UI wiring, debug hooks
```

The `js/data.js`, `pathfinding.js`, `inventory.js`, `quests.js`, `save.js`,
`npc.js` and `voxel.js` modules have no DOM dependency, so they run and test
directly under Node.

For debugging/tests, the running page exposes `window.__pixelHotel` with
`getState()`, `walkTo(x,y)`, `sendChat(text)`, `buy(itemId)`,
`placeAt(instanceId,x,y,rot)`, `save()`, `reset()`, and `getCanvas()`.

## Tests

```sh
npm test         # Node built-in test runner: pathfinding, inventory, quests, save/load, voxel/window rendering
npm run test:smoke   # Playwright end-to-end smoke test (needs: npm i -D playwright && npx playwright install chromium)
```

The smoke test boots a local static server, loads the page in headless
Chromium, and checks for console/page errors, a non-blank canvas, click-to-walk
movement, chat, furniture purchase/placement, a room switch through a door,
and save/reload persistence — taking screenshots into `tests/screenshots/`
along the way.

## Assets & Attribution

Every visual and audio asset in this project is **generated procedurally in
code** — volumetric 3D voxel character figures are modelled and projected in
`js/voxel.js`, architectural tiles, furniture, and perspective wall windows
are generated mathematically in `js/sprites.js`, and the background music/SFX
are synthesized at runtime with the Web Audio API in `js/audio.js`. There are
no downloaded images, fonts, sound files, or other external assets anywhere in
this repository, and the game makes no network requests.

All character names, room names, dialogue, and item names are original
creations for this project. Pixel Hotel is an independent homage to the cosy
retro "virtual hotel" game genre and is not affiliated with, endorsed by, or
associated with Habbo, Sulake, Nexon, or any other company or product.
