# Pixel Hotel v0.5 Research: Isometric Room Design, Cutaway Backgrounds, Hotel Facility Layouts, Voxel Characters & Furniture Interactions

> **Compliance & Originality Note:** Legacy virtual hotel and life-sim systems (e.g., Habbo, The Sims) are studied below **strictly for abstract spatial, animation, and UI mechanics** (grid math, heightmap encoding, entrance anchoring, slot routing, and directory patterns). Pixel Hotel v0.5 uses **100% original procedural layouts, geometry, palettes, and naming**, with **zero external runtime assets or network requests** and **S$0 cost**.

Scope:
- **Part A (Sections 1–3):** (1) Legacy isometric room layout principles, irregular footprints, and entrance routing; (2) 3D isometric cutaway backgrounds, perspective alignment, parallax skyline, and time-of-day lighting; (3) Hotel amenities and coherent functional facility layouts.
- **Part B (Sections 4–5):** (4) Voxel/isometric character proportions, face readability, expressions, blinking, and idle variety; (5) Furniture collision, multi-slot occupancy/reservation, safe approach tiles, sit/lie/use state machines, stacking rules, and visibly distinct treadmill, swimming, and eating animations. Grounded against `js/voxel.js`, `js/main.js`, `js/data.js`, `js/inventory.js`, `js/sprites.js`, and `js/render.js`.

---

## 1. Legacy Isometric Room Layout Principles (Reference Only)

### Core Findings
- **2:1 Isometric Tile Grid & Heightmap Matrix:** Classic isometric virtual rooms use a 2D row-major logical matrix (`grid[y][x]`) rendered in 2:1 dimetric projection (`TILE_W = 2 × TILE_H`, ~26.57° slope). Rather than restricting rooms to plain rectangles, floor-plan systems encode void/cutout tiles (`x`/`VOID`) and discrete integer elevation tiers (`0`–`9`) so single rooms can form L-shapes, U-shapes, sunken conversation pits, or raised stage/VIP tiers with auto-generated step transitions.
- **Room Shapes & Silhouette Variety:** Moving beyond uniform rectangular boxes prevents visual fatigue across floors. Non-rectangular footprints (L-wings, recessed alcoves, courtyard cutouts, split-level terraces) naturally divide a single room into micro-zones without blocking line-of-sight over the south/east cutaway edges.
- **Door / Entrance Anchors & Pathfinding Guarantees:** A room entrance requires both a wall cutout coordinate and an adjacent walkable landing/spawn tile with a default facing direction. Floor-plan validation must guarantee that the landing tile remains unblocked by furniture and connected to the main floor graph, preventing spawn-trapping.
- **Public Rooms vs. Personal Suites:** Official/public spaces prioritize wide circulation lanes (2–3 tiles wide), landmark focal centerpieces, and clear social seating clusters, whereas personal suites prioritize high wall-to-floor perimeter ratios and flexible open floor plates for user furniture placement.
- **Navigator / Directory Ergonomics:** Room directories scale best when grouped by functional category (e.g., *Public Amenities*, *Dining & Social*, *Personal Suite*) and enriched with at-a-glance metadata: floor number, room icon, live guest/NPC occupancy indicator, and quick-jump buttons.

### Verified Sources
- [HabboxWiki — Floor Plan Editor (Grid Matrix, Tile Heights & Door Placement)](https://www.habboxwiki.com/Floor_Plan_Editor)
- [HabboxWiki — Rooms (Layout Structures & Guest vs. Public Room Mechanics)](https://habboxwiki.com/Rooms)
- [HabboxWiki — Public Rooms (Official Multi-Zone Social Spaces)](https://habboxwiki.com/Public_Rooms)
- [HabboxWiki — Navigator (Categorized Room Directory & Occupancy Metadata)](https://habboxwiki.com/Navigator)

### Apply to Pixel Hotel (v0.5 Concrete Application Notes)
1. **Non-Rectangular Room Footprints (`TILE.VOID`):** Add a void/cutout cell type (`TILE.VOID = 4`) and per-room `cutouts` / `shape` definitions in `js/data.js` so rooms in `ROOMS` are no longer all uniform `W × H` rectangles (`makeRoomGrid`). Use L-shapes, stepped bays, recessed alcoves, and terrace cutouts while rendering stepped concrete slab edges along cutout boundaries in `js/render.js`.
2. **Zone Accent / Split-Level Visual Tiers (`zoneTiles`):** Support per-room sub-zone floor accents (e.g., Restaurant window dining tier, Pool wet deck perimeter, Lobby welcome promenade, or Rooftop stage deck) rendered with subtle riser/border contrast.
3. **Entrance & Elevator Landing Buffer:** Reserve a clear landing apron in front of every `TILE.DOOR` / elevator tile in `js/data.js` and enforce non-buildable door-landing and spawn clearance in `js/inventory.js` (`canPlaceAt`) so players and NPCs never spawn into or get trapped by furniture bottlenecks.
4. **Enhanced Elevator Navigator (`E`):** Group the 10-floor directory UI into clear functional tiers (*Ground & Dining*, *Recreation & Wellness*, *Suite & Sky Decks*) and display live NPC count badges per floor alongside the existing **🔑 My Room** shortcut.

---

## 2. 3D Isometric Cutaway Backgrounds, Perspective, Parallax & Time-of-Day Lighting

### Core Findings
- **Cutaway ("Dollhouse") Structural Readability:** An architectural cutaway works best when the exterior shell and structural cross-sections (floor slabs, exposed I-beams, exterior columns, and recessed window reveals) use lower-saturation, higher-contrast values than the playable interior floor and furniture. North and west back walls frame the room, while south and east edges remain cleanly sliced at slab level so foreground furniture never occludes avatars.
- **Perspective Alignment vs. Atmospheric Horizon:** While the hotel tower itself must obey strict 2:1 isometric projection (`tileToScreen` along ±26.57° axes), the distant city/coastal backdrop works best as a multi-plane atmospheric diorama whose horizon shifts vertically (`parallaxY`) according to floor elevation—giving Floor 1 a grounded street-plaza context and Floor 10 a panoramic high-altitude vista.
- **Multi-Layer Parallax Depth Cues:** Splitting the background into 3–4 depth planes (far sky/mountains, harbour water, mid-distance city blocks, near-foreground skyscrapers with 3D side faces and roof spires) with progressive scale, window grid density, and atmospheric desaturation creates strong depth without competing with foreground pixel/voxel geometry.
- **Procedural Time-of-Day Lighting & Emissive Passes:** In procedural canvas rendering, smooth continuous shader blurs can muddy crisp pixel/voxel edges. Best practice combines:
  1. **Stepped/Bucketed Sky & Facade Palettes:** Interpolating sky gradients and building silhouettes across discrete time buckets (Dawn, Day, Golden Hour/Dusk, Midnight).
  2. **Secondary Emissive Window/Beacon Passes:** Deterministically lighting distant skyscraper windows, street lamps, and interior wall-window skyboxes as daylight drops below threshold, plus live animated accents (blinking aviation beacons, warm interior floor-lamp pools).
  3. **Directional Face Shading:** Maintaining consistent top > front-left > front-right face luminance ratios on all voxel/cuboid geometry so 3D form stays readable at night.

### Verified Sources
- [Clint Bellanger — Isometric Tiles Introduction](http://clintbellanger.net/articles/isometric_intro/)
- [Clint Bellanger — Isometric Tiles Math (2:1 Projection & Screen/Tile Transforms)](http://clintbellanger.net/articles/isometric_math/)
- [Pixel Parmesan — Fundamentals of Isometric Pixel Art (Planes, Outlines & Lighting)](https://pixelparmesan.com/fundamentals-of-isometric-pixel-art/)
- [Slynyrd — Pixelblog 41: Isometric Pixel Art (2:1 Grid Construction & Cube Face Shading)](https://www.slynyrd.com/blog/2022/11/30/pixelblog-41-isometric-pixel-art)
- [Clip Studio Paint — Isometric View & Pixel Art Style Guide](https://assets.clip-studio.com/en-us/csp/articles/isometric-view-pixel-art)

### Apply to Pixel Hotel (v0.5 Concrete Application Notes)
1. **Floor-Aware Exterior Context & Silhouette-Accurate Cutaway Slabs in `js/render.js`:** Expand `drawStreetPlaza` and `drawTowerCutawayUnder` so lower floors (Floors 1–3) show street-level life (entry canopy, streetlamp light pools at dusk/night, sidewalk trees), mid floors (Floors 4–7) emphasize neighbouring tower facades and structural steel cross-bracing, and upper floors (Floors 8–10) open up to high-altitude cloud bands and setback terrace parapets. Render floor slab cutaway edges per-tile along `TILE.VOID` cutouts so irregular room shapes have accurate 3D concrete cross-sections.
2. **Isometric Distant Building Caps:** Add 2:1 angled isometric roof caps and perspective side-parapet bevels on the parallax skyscraper layers (`seed: 202` and `seed: 303` in `renderSkylineToCanvas`) to bridge the visual transition between the horizon and the 2:1 isometric hotel tower.
3. **Localized Warm Night Emissives:** Alongside the global night tint overlay in `render.js`, add soft warm radial light pools under floor lamps, string lights, neon signs, arcade cabinets, karaoke machines, aquariums, sauna cabins, and wall windows during dusk/night (`day < 0.7`) so rooms feel cosy and luminous rather than uniformly darkened.

---

## 3. Hotel Amenities & Coherent Functional Facility Layouts

### Core Findings
- **Vertical & Acoustic Zoning (Dynamic vs. Static Stack):** Real-world hospitality architecture stacks facilities from public/high-energy at the base to private/quiet at the top (with signature destination lounges at the crown):
  - *Lower Podium (Floors 1–3):* High-traffic arrival, reception, coffee bar, and full-service dining.
  - *Mid-Tower Recreation & Wellness (Floors 4–6):* Active amenities (fitness center, indoor/terrace pool & spa, entertainment/arcade) grouped together with wet/dry separation.
  - *Upper Quiet & Residential Tier (Floors 7–9):* Acoustic buffer floor (library/co-working hub), private guest suites, and quiet botanical sky conservatory.
  - *Crown (Floor 10):* Signature open-air rooftop lounge and observation deck.
- **Lobby Micro-Zoning ("Living Room" Model):** A coherent hotel lobby separates three sub-zones within immediate sightlines of the entrance: (1) *Arrival/Threshold* (clear path from entrance/elevator), (2) *Transactional Anchor* (reception/concierge desk positioned with an unobstructed view of arrivals), and (3) *Social Lounge* (clustered sofa/rug seating anchored away from main circulation lanes).
- **Circulation Spine vs. Activity Pockets:** Every amenity floor should feature an unobstructed primary circulation spine (at least 2 tiles wide from the elevator landing) that feeds into functional activity pockets—preventing NPCs or players from having to weave through tight furniture mazes.
- **Amenity-Specific Functional Adjacencies:**
  - *Cafe & Restaurant:* Service counter / bar / noodle or boba station anchored along a back wall (simulated Back-of-House adjacency), with 2-top and 4-top dining tables arranged near window views.
  - *Gym & Pool/Spa:* Equipment arrayed in clear rows facing windows or mirrors in the gym; wet deck zone (pool basin / koi water feature + loungers) visually separated from dry entry/towel reception by floor color or rug borders.
  - *Library & Personal Suite:* Quiet reading alcoves framed by tall bookshelves; personal suites zoned into entry foyer, lounge/media area, and sleeping/study corner.

### Verified Sources
- [Boom Studio — Hotel Lobby Design: Layout, Furniture and Renovation Guide](https://www.boom-studio.com/journal/hotel-lobby-design-layout-furniture-and-renovation-guide)
- [ArtDirector — Hotel Space Planning: How to Design an Efficient Layout for Guests and Staff](https://artdirector.in/hotel-space-planning-efficient-layout-guide/)
- [SIT Design — Hotel Lobby Furniture Layout and Zoning Guide](https://sitdesign.com/blog/hotel-lobby-furniture-layout-zoning-guide)
- [SIT Design — Hotel Functional Zoning: Lobby, Guest Rooms, Restaurant and Spa](https://sitdesign.com/blog/hotel-functional-zoning-lobby-guest-rooms-restaurant-spa)
- [Amin Naimi Design Studio — Hotel Lobby Design: 5 Key Decisions](https://aminnaimidesignstudio.com/insights/hotel-lobby-design-5-key-decisions/)

### Apply to Pixel Hotel (v0.5 Concrete Application Notes)
1. **Three-Zone Floor Templates in `js/data.js`:** Structure each of the 10 floors in `ROOMS` around three explicit zones:
   - **Elevator Arrival Spine:** Minimum 2×2 clear tiles directly in front of every door / elevator (`TILE.DOOR`).
   - **Service / Anchor Wall (North/West):** Place tall anchor items (reception desk, bar counters, boba bar, bookshelves, arcade cabinets, sauna cabin) flush against the north (`y = 1`) or west (`x = 1`) walls so they never block camera sightlines.
   - **Foreground Activity / Social Cluster (Center/South-East):** Place low-profile seating, tables, rugs, koi ponds, and telescopes toward the center and window sides, preserving clear walk aisles between clusters.
2. **Floor-by-Floor Functional Coherence Audit:**
   - **F1 Grand Lobby:** Elevator + reception desk along north/east wall; central welcome rug; clustered lounge sofas and armchairs on west/central flanks.
   - **F2 Starlight Cafe & F3 Skyline Restaurant:** Counter/bar + boba/espresso/chef/buffet stations on north wall; window-side dining tables and chairs paired cleanly so seated guests face the tables and trigger dining animations.
   - **F4 Gym & F5 Pool/Spa:** Clear dry entry aisle from elevator; treadmills aligned for cardio running on F4; water basin (`pool_water`) and deckchairs grouped in a dedicated wet zone on F5.
   - **F6 Arcade & F7 Library:** High-energy cabinets/karaoke/gachapon clustered with neon signage on F6; quiet reading nook dividers using bookshelves, workstation desk, and warm floor lamps on F7.
   - **F8 My Room:** Keep 65%+ of tiles open in default seed layout (including tile `(7, 6)`) so players have generous room to customize with shop items, while pre-zoning a cosy corner rug + bed/armchair starter nook.
   - **F9 Sky Garden & F10 Rooftop Lounge:** Botanical symmetry (koi pond + planters + sakura trees) on F9; open parapet views, cocktail bar, and social sofa/deckchair lounge on F10.

---

## 4. Character Proportions, Face Readability, Expressions, Blink & Idle Variety

### Verified Sources
- [Isometric Pixel Art: The Three Proportion Traps](https://neta.art/blog/isometric-pixel-art-proportion-traps) — height should anchor to tile *height* (not width); convention is ~4 tile-heights tall; keep the height multiple fixed across the whole cast once chosen.
- [Fundamentals of Isometric Pixel Art](https://pixelparmesan.com/blog/fundamentals-of-isometric-pixel-art) — use isometric construction lines through the head to keep nose/eyes centered and symmetric per facing.
- [The Rules of 16x16 Pixel Art](https://neta.art/blog/16x16-pixel-art-rules) / [sandromaglione: Pixel art eyes](https://www.sandromaglione.com/articles/pixel-art-eyes-techniques-and-styles) — at small scale, eyes read first; keep high contrast between face and hair/hat; 1px eye-position shifts change the read; wider-spaced eyes read younger, tighter/flatter eyes read older or disinterested.
- [Pixel Art Idle Animation: Breathing Sprites in 2–4 Frames](https://piximelon.com/guides/pixel-art-idle-animation/) — 2–4 frame idle at 4–6 FPS; pick **two of three** motions (breath: torso +1px, bob: whole sprite dips, blink: eyes squash one frame) — never sync all three, or it reads robotic; secondary elements (hair, cloth) lag one frame behind the primary motion; blinks fire every 2–4s for one frame, squash don't redraw.
- [Wikipedia: Idle animation](https://en.wikipedia.org/wiki/Idle_animation) — idle loops should be long/varied enough to avoid looking robotic on repeat viewing; blinking + slight arm movement is the baseline "alive" signal.

### Apply to Pixel Hotel (v0.5 Concrete Application Notes)
1. **Consistent Voxel Proportions:** Keep every `LOOKS` entry in `js/voxel.js` anchored to the fixed head/torso/leg box bounds (head `z: 15..23`, torso `z: 7..15`, legs `z: 0..7`) so the fixed height multiple holds across all 12 characters.
2. **Higher-Quality Faces, Side-Profile Eyes & Expressions:** Enhance `headTex` in `js/voxel.js` with upper-eyelid shadow creases, distinct iris/pupil/dual catchlights, personality-tuned eyebrows, side-profile eye/brow hints on `'left'` and `'right'` head faces so profile-facing NPCs remain expressive, and dynamic mouth states (`smile`, `frown`, `open`, `lips`, `chew`, `pant`, `serene`).
3. **Asynchronous Blinking:** Track per-entity `blinkUntil` / `nextBlinkAt` timestamps (or deterministic per-entity offset timers) firing every 2.5–4.5s for ~160ms, feeding `blink: true` into `buildParts` / `headTex` so closed eyelids with lash lines replace the open eye sclera/iris cleanly without unbounded cache growth.
4. **Two-of-Three Idle Motion (Breathing + Blinking):** Parameterize `buildParts` with a discrete `breathe` step (`0 | 1`) that subtly lifts the chest/shoulders and relaxes the arms when standing idle (`!walking && !sitting && !lie`), paired with asynchronous blinking and decoupled per entity so guests never animate in robotic lockstep.

---

## 5. Furniture Collision, Occupancy, Approach Tiles, Sit/Lie/Use State Machines & Activity Animations

### Verified Sources
- [Tile-based video game (Wikipedia)](https://en.wikipedia.org/wiki/Tile-based_video_game) — baseline AABB/grid collision model; confirms grid+flag occupancy is the standard approach for this genre.
- [Mod The Sims: An Introduction to Slots](https://modthesims.info/t/146440) — Sims objects define three slot kinds: **Routing Slots** (where a sim walks to, plus required facing direction, to use the object from outside it), **Container Slots** (invisible holders for an object/sim inside the furniture, e.g. "in the bed"), and **Target Slots** (animation-only reference points). "Snap" transitions a sim from a container slot back to a routing slot so it can walk away again.
- Sims 4 modding docs (`modthesims.info` sleep-pose threads) — animations are driven by a `posture_type` that selects a state machine; e.g. bed sleep uses a transition clip before the idle loop, and a separate transition out — i.e. **enter-transition → idle-loop → exit-transition**, not a single pose swap.
- [Multiple Objects on a Tile (Amit Patel / cs.stanford redirect)](https://en.wikipedia.org/wiki/Tile-based_video_game) *(original Stanford page unreachable — socket closed on both `http://` and `https://`; falling back to the Wikipedia tile-game article above for the occupancy-grid baseline. Treat the specific "linked list per tile" claim from search snippets as unverified.)*
- [framesprite: swimming sprite waterline layering](https://www.framesprite.com/guides/swimming-sprite-animation-waterline-layers) — split a swimmer into 4 independent layers (body, waterline mask, wake, splash); the waterline is a static mask that hides/shows body regions, decoupled from the swim-stroke animation, so water styling and character animation can change independently.
- Walk-cycle/loop timing references ([slynyrd human walk cycle](https://www.slynyrd.com/blog/2024/5/24/pixelblog-50-human-walk-cycle)) — looping in-place animations must have their playback speed matched to perceived effort (e.g., running belt speed), and the last frame must connect cleanly to the first frame with no held pose at the loop seam.

### Apply to Pixel Hotel (v0.5 Concrete Application Notes)
1. **Multi-Slot Furniture Occupancy & Reservation (`seatOffsets`):** Define per-item `seatOffsets` / interaction slots in `js/data.js` and slot-occupancy helpers in `js/inventory.js` so multi-tile furniture (`sofa`, `rooftop_sofa`, `garden_bench`, `suite_bed`, `pool_water`) supports per-slot occupancy and pending reservation (preventing two actors from claiming the exact same seat tile while allowing 2 guests to share a 2-tile sofa).
2. **Safe Approach Tiles (`findApproachTile`):** For non-seat interactive furniture (`buffet_counter`, `espresso_bar`, `boba_bar`, `noodle_cart`, `chef_station`, `dining_table`, `cafe_table`, `bar_counter`, `mini_arcade`, `karaoke_machine`, `capsule_dispenser`, `telescope`, `computer_desk`, `sauna_cabin`, `pool_table`), compute unblocked adjacent routing tiles with required inward facing direction (`dir`) and shortest A* path so players and NPCs walk cleanly up to the front/side of the object without clipping into its solid footprint.
3. **Consistent Sit / Lie / Use Activity State Machine:** Track `activity: { itemId, instanceId, kind: 'sit'|'lie'|'treadmill'|'swim'|'eat'|'use', phase: 'enter'|'loop'|'exit', slotX, slotY, dir, startedAt }` on movers so transitions into and out of furniture postures are consistent across player and NPCs.
4. **Visibly Distinct Treadmill, Swimming & Eating Animations:**
   - **Treadmill (`treadmill`):** Mover mounts the belt slot facing the digital console (`up` at `rot: 0`, `left` at `rot: 1`), driving an energetic in-place running cycle (`action: 'treadmill'`, high-knee leg stride, pumping bent arms, focused/panting expression, and animated belt motion lines + sweat drops in `render.js`).
   - **Swimming (`pool_water`):** Mover enters the pool basin (`action: 'swim'`), rendering a 4-layer waterline split (submerged lower body, alternating freestyle/breaststroke arm strokes in `voxel.js`, translucent turquoise water surface overlay, animated concentric foam wake rings, and water splash droplets in `render.js`).
   - **Eating / Drinking (`eat` at dining chairs next to tables, or at `buffet_counter`, `espresso_bar`, `boba_bar`, `noodle_cart`, `chef_station`, `cafe_table`, `dining_table`):** Mover performs a periodic hand-to-mouth eating/sipping gesture holding a voxel cup/treat with animated chewing mouth (`mouth: 'chew'`) in `voxel.js` and a floating culinary/drink indicator in `render.js`.

### Not Verified Firsthand
- The Stanford/Amit Patel "Multiple Objects on a Tile" page returned a network error (`Socket is closed`) on both `http://` and `https://`; its "linked-list per tile" occupancy claim is cited only via search-snippet and is not relied upon for implementation.
