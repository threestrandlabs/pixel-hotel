# Pixel Hotel v0.5 Research — Part A: Isometric Room Design, Cutaway Backgrounds & Hotel Facility Layouts

> **Compliance & Originality Note:** Legacy virtual hotel systems (e.g., Habbo) are studied below **strictly for abstract spatial and UI mechanics** (grid math, heightmap encoding, entrance anchoring, and directory patterns). Pixel Hotel v0.5 must use **100% original procedural layouts, geometry, palettes, and naming**, with **zero external runtime assets or network requests** and **S$0 cost**.

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

### Apply to Pixel Hotel (v0.5 Recommendations)
1. **Non-Rectangular Room Footprints (`TILE.VOID`):** Add a void/cutout cell type (or per-room shape mask in `js/data.js`) so rooms in `ROOMS` are no longer all `W × H` rectangles (`makeRoomGrid`). Use L-shapes, recessed alcoves, or terrace cutouts while generating inner north/west wall segments along cutout boundaries.
2. **Single-Step Split Levels (Optional Elevation Tier):** Support a simple 1-step raised platform zone (e.g., `height: 1` on a sub-rectangle for the Restaurant window dining tier, Rooftop stage, or Suite sleeping nook) rendered with a 6–8 px vertical riser and automatic step transition.
3. **Entrance & Elevator Landing Buffer:** Reserve a 2-tile clear landing apron in front of every `TILE.DOOR` / elevator tile in `js/data.js` and enforce a non-buildable spawn clearance in `js/inventory.js` so players and NPCs never spawn into furniture bottlenecks.
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

### Apply to Pixel Hotel (v0.5 Recommendations)
1. **Floor-Aware Exterior Context in `js/render.js`:** Expand the existing `drawStreetPlaza` and `drawTowerCutawayUnder` pipeline so lower floors (Floors 1–3) clearly show street-level life (entry canopy, streetlamp pools at dusk/night, sidewalk trees), mid floors (Floors 4–7) emphasize neighbouring tower facades and structural steel cross-bracing, and upper floors (Floors 8–10) open up to cloud/skyline vistas and setback terrace parapets.
2. **Isometric Distant Building Caps:** Add subtle 2:1 angled roof caps or perspective side-parapet lines on the nearest parallax skyscraper layer (`seed: 303` in `renderSkylineToCanvas`) to bridge the visual transition between the flat orthographic horizon and the isometric hotel tower.
3. **Localized Warm Night Emissives:** Alongside the global night tint overlay in `render.js`, add soft warm radial light pools under floor lamps, neon signs, arcade cabinets, and streetlamps during dusk/night (`day < 0.6`) so rooms feel cosier rather than uniformly darkened.

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

### Apply to Pixel Hotel (v0.5 Recommendations)
1. **Three-Zone Floor Templates in `js/data.js`:** Structure each of the 10 floors in `ROOMS` around three explicit zones:
   - **Elevator Arrival Spine:** Minimum 2×3 clear tiles directly in front of the elevator (`TILE.DOOR` with `elevator: true`).
   - **Service / Anchor Wall (North/West):** Place tall anchor items (reception desk, bar counters, boba bar, bookshelves, arcade cabinets, aquarium) flush against the north (`y = 1`) or west (`x = 1`) walls so they never block camera sightlines.
   - **Foreground Activity / Social Cluster (Center/South-East):** Place low-profile seating, tables, rugs, koi ponds, and telescopes toward the center and window sides, preserving 1-tile walk aisles between clusters.
2. **Floor-by-Floor Functional Coherence Audit:**
   - **F1 Grand Lobby:** Elevator + reception desk along north wall; central welcome rug;对称/clustered lounge sofas on east/west flanks.
   - **F2 Starlight Cafe & F3 Skyline Restaurant:** Counter/bar + boba/noodle stations on north wall; window-side dining tables along west (`x = 1..2`) and south-east perimeter.
   - **F4 Gym & F5 Pool/Spa:** Clear dry entry aisle from elevator; water/pond centerpiece and loungers grouped in a dedicated wet zone on F5.
   - **F6 Arcade & F7 Library:** High-energy cabinets/karaoke/gachapon clustered with neon signage on F6; quiet reading nook dividers using bookshelves and warm floor lamps on F7.
   - **F8 My Room:** Keep 65%+ of tiles open in default seed layout so players have generous room to customize with shop items, while pre-zoning a cosy corner rug + bed/sofa starter nook.
   - **F9 Sky Garden & F10 Rooftop Lounge:** Botanical symmetry (koi pond + planters) on F9; open parapet views, telescope observation corner, and social stage/sofa lounge on F10.
