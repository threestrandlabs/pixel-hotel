# Pixel Hotel

A cosy, single-player browser game: check into a tiny isometric pixel-art hotel,
chat with the guests, decorate the lobby and rooftop lounge, and work through a
short list of quests. Built with plain HTML/CSS/JS ES modules — no build step,
no frameworks, no network calls.

This is an original homage to the cosy retro "virtual hotel" genre of the late
90s/2000s. It is **not affiliated with, endorsed by, or associated with Habbo,
Sulake, Nexon, or any other company** — every name, character, room, item and
line of dialogue here is original, all pixel art/voxel rendering is generated
procedurally in code, and the floor soundtrack is original music by James
(see **Assets & Attribution** below).

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
| Walk | Click a floor tile — your avatar pathfinds there with A*, respecting furniture collision, and never cuts corners around blockers |
| Talk to an NPC | Click/tap any guest or the receptionist — you'll walk to a free adjacent tile and a dialogue panel opens with their lines/topics |
| Sit / Lie / Use Amenities | Click a chair, sofa, bed, yoga mat, treadmill, lap pool, dining chair, or counter — you'll pathfind to a free slot or safe approach tile and perform a matching animation (`sit`, `lie`, `treadmill`, `swim`, `eat`, `use`) |
| Chat | Type in the chat box and press Enter / Send; nearby guests reply |
| Switch rooms | Walk onto a doorway tile, or open the **🛗 Elevator** (`E`) to travel to any of the 10 floors |
| Visit My Room | Click **🔑 My Room** or select **Floor 8 — My Room** in the Elevator Directory |
| Buy / place furniture | Open **Items**, buy from the Shop tab, then **Place** it and click a tile (ghost preview shows green/red for valid/invalid; items render their own voxel icon instead of a flat square) |
| Move / pick up furniture | Open **Items → In This Room**, use **Move** or **Pick up** |
| Rotate while placing | `R` or the Rotate button |
| Cancel placing | `Esc` or the Cancel button |
| Zoom / pan | Mouse wheel / pinch, the **−** / **+** / **1:1** buttons, or `+`/`-`/`0`; click-drag to pan |
| Music player | Bottom-left widget: play/pause, prev/next track, "Auto: follow room" toggle, volume slider — each floor plays its own licensed track (crossfades on floor change) |
| Audio & mixing settings | Gear button opens Master / Music / SFX / Ambience volume sliders |

### Keyboard shortcuts

`E` elevator directory · `I` inventory · `Q` quests · `M` mute/unmute music · `H` help · `S` manual save · `R` rotate (while placing) · `+`/`-`/`0` zoom in/out/reset · `Esc` cancel/close

## Features

- **Grand Lobby (`v0.7.0`)**: A much larger, double-height Floor 1 with a marble floor, Corinthian pillars, an Imperial Crystal Chandelier, a grand mezzanine staircase, lounge seating, an atrium fountain, planters, a luggage trolley, a concierge podium, and a reception desk staffed by Celeste, the Head Receptionist, who greets you, answers hotel-facilities questions, and starts the Welcome Quest.
- **Consistent Storey Scale, City Traffic & Zoom Controls (`v0.7.0`)**: The tower and every neighbouring city building now share one true storey unit, so a 1-storey lobby no longer looks the same height as a 4-storey neighbour. Animated cars, taxis, buses, and scooters drive the isometric roads in-lane, stop at crossings, and light up at night, with procedural engine-hum/horn/brake-hiss traffic ambience that fades with floor height. Wheel/pinch/button/keyboard zoom (clamped 55%–250%, default ≈185%) zooms toward the cursor, pans by drag, and keeps pointer→tile hit-testing correct at every zoom level.
- **Object Collision & Advanced A\* Pathfinding (`v0.7.0`)**: Every piece of furniture has a footprint and a walkable flag — rugs/mats stay walkable, everything else blocks tiles. Pathfinding is a pure A\* with a binary-heap open list, octile heuristic, no corner-cutting, line-of-sight path smoothing, and nearest-reachable-tile fallback; re-clicking mid-walk re-plans seamlessly from the tile being entered instead of stuttering, and NPCs reserve tiles so they and the player never collide.
- **Wandering NPCs & Click-to-Talk Dialogue (`v0.7.0`)**: Guests wander between points of interest using the same pathfinding, pausing naturally and avoiding each other and the player. Clicking any NPC walks you to a free adjacent tile and opens a speech-bubble dialogue panel with greeting/topic lines.
- **Bottom-Left Music Player & Full Audio Mixer (`v0.7.0`, floor soundtrack in `v0.7.1`)**: A collapsible widget shows the current track/room, play/pause, prev/next, an "Auto: follow room" toggle, and a volume slider. A settings panel adds Master/Music/SFX/Ambience sliders. Every floor plays its own licensed music track (Music by James), loading lazily, preloading the next floor, looping seamlessly, and crossfading between floors — all routed through the Music/Master sliders, falling back to the original procedural per-room synth track if a file ever fails to load.
- **Procedural Item Icons (`v0.7.0`)**: Every catalogue item renders its own cached, HiDPI voxel/sprite thumbnail in the Shop, My Items, and placement preview instead of a flat colour square.
- **Crisp Native-DPR Isometric Rendering**: `<canvas>` backing store automatically matches `CSS box × devicePixelRatio` via `ResizeObserver`, with DPR-scaled sprite/voxel caches blitted 1:1 to device pixels and crisp `system-ui` canvas/UI typography.
- **Shared Isometric City & Street Grid (`v0.6.0`)**: Rather than a flat 2D backdrop behind an isometric tower, the surrounding city shares the exact 2:1 isometric ground plane and `(u, v)` axes (`±26.565°`) of the hotel tower. Features isometric avenues, lane dashes, pedestrian zebra crossings, raised sidewalks with kerbs, street trees, glowing streetlamps, landscaped park/fountain plazas, and depth-sorted 3D isometric city blocks/buildings of varied heights with angled facade windows, rooftop penthouses/skylights/gardens, distance haze, and floor-dependent elevation (street-level plaza on lower floors vs neighbouring isometric rooftops on high floors). Both the isometric city backdrop and the lower tower cutaway shaft are cached to offscreen canvases for 60fps performance.
- **Procedural Web Audio Lounge/Lofi Music & Soft Enveloped SFX (`v0.6.0`)**: Warm multi-voice Rhodes/lounge chords, triangle sub-bass, and brushed lofi percussion routed through low-pass `BiquadFilterNode`s, with automatic area/time moods (**Velvet Lounge** for Lobby/Dining/Suite, **Pulse Synth Groove** for Gym/Arcade, **Azure Spa Drift** for Pool/Garden/Rooftop, and **Midnight Lofi** at night). Includes soft filtered/enveloped SFX for UI clicks, footsteps, coin chimes, furniture placement, quest completion, chat, and two-tone elevator bells, plus separate persisted Music and SFX mute/volume controls that defer `AudioContext` creation until a user gesture.
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
- **Varied / Irregular Room Footprints & Door Arrival Protection**: Every floor features an architectural cutout silhouette (`TILE.VOID` alcoves, L-terraces, split-level dining zones, and sky promenades) with silhouette-accurate concrete cutaway slabs, zoned floor accents, and guaranteed door-apron arrival clearance.
- **Perspective-Consistent Parallax Skyline & Emissive Night Lighting**: Skyscrapers in the parallax city backdrop feature 2:1 isometric roof caps and side parapets matching the hotel's projection, high-altitude cloud ribbons on upper floors, streetlamps on the ground plaza, and warm radial emissive light pools over lamps, neon signs, dining tables, and pools at dusk and night.
- **Expressive Voxel Characters & Activity Animations**: Player avatar and 11 original NPC guests/staff feature detailed voxel faces (upper-eyelid creases, iris/pupil/dual catchlights, personality brows, side-profile eyes, and dynamic mouths), asynchronous blinking, subtle breathing idles, multi-slot seating/bed/pool occupancy with pending slot reservation, safe adjacent approach tiles, and visibly distinct **treadmill running**, **pool swimming** (with waterline, wake, and splashes), **restaurant/cafe eating** (with cup/utensil lift and aroma wisps), and **bed/yoga-mat reclining** animations.
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
js/audio.js            floor MP3 soundtrack + procedural WebAudio fallback/SFX
js/main.js             game loop, input, UI wiring, debug hooks
```

The `js/data.js`, `pathfinding.js`, `inventory.js`, `quests.js`, `save.js`,
`npc.js` and `voxel.js` modules have no DOM dependency, so they run and test
directly under Node.

For debugging/tests, the running page exposes `window.__pixelHotel` with
`getState()`, `walkTo(x,y)`, `sendChat(text)`, `buy(itemId)`,
`placeAt(instanceId,x,y,rot)`, `save()`, `reset()`, `getCanvas()`,
`getCamera()`, `setZoom(z)`, `resetZoom()`, `tileToScreen(x,y)`,
`screenToTile(x,y)`, `clickNpc(npcId)`, `closeDialogue()`,
`getDialogueState()`, `getMusicPlayerState()`, `getAudioState()`, and
`getItemIcon(itemId)`.

## Tests

```sh
npm test         # Node built-in test runner: pathfinding, inventory, quests, save/load, voxel/window rendering
npm run test:smoke   # Playwright end-to-end smoke test (needs: npm i -D playwright && npx playwright install chromium)
```

The smoke test boots a local static server, loads the page in headless
Chromium, and checks for console/page errors, a non-blank canvas, click-to-walk
movement, chat, furniture purchase/placement, a room switch through a door,
the per-floor MP3 soundtrack (including crossfade and fallback), and
save/reload persistence — taking screenshots into `tests/screenshots/` along
the way.

## Assets & Attribution

**Music by James.** Every floor's background track (`audio/music/01-grand-lobby.mp3`
through `10-rooftop.mp3`) is original music composed and approved for use in this
project by James; the files are shipped as-is and are never modified or re-encoded.

Every other asset in this project is **generated procedurally in code** —
volumetric 3D voxel character figures are modelled and projected in
`js/voxel.js`, architectural tiles, furniture, and perspective wall windows
are generated mathematically in `js/sprites.js`, and SFX (plus the fallback
soundtrack used if a floor's MP3 ever fails to load) are synthesized at
runtime with the Web Audio API in `js/audio.js`. There are no other downloaded
images, fonts, sound files, or external assets anywhere in this repository,
and the game makes no network requests beyond loading its own files.

All character names, room names, dialogue, and item names are original
creations for this project. Pixel Hotel is an independent homage to the cosy
retro "virtual hotel" game genre and is not affiliated with, endorsed by, or
associated with Habbo, Sulake, Nexon, or any other company or product.
