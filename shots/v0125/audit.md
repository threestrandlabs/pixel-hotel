# Pixel Hotel v0.12.5 Master Art & Catalog Audit Log

This audit covers every item in the hotel catalogue (91 items in `CATALOGUE` in `js/data.js`), inspected at 4x resolution against real-world reference features, physical construction, and 2:1 isometric perspective rules.

Items are evaluated for:
1. **Depth and occlusion errors**: Drawing parts strictly back-to-front by isometric depth (`u+v` ascending: far NW/NE legs/poles first, body/carcass, then near SW/SE components).
2. **Missing legs or supports**: Ensuring every table, piano, cart, rack, and bench is fully grounded without floating corners.
3. **2:1 Isometric alignment**: Ensuring wall-mounted mirrors, sconces, and partitions follow true 2:1 grid planes rather than cutting diagonally across tiles or facing flat forward.
4. **Proportions and real-world features**: Faithful representation of materials, controls, optical assemblies, and structural joinery.

---

## Catalog Audit Table

| # | Item ID | Item Name | Real-World Reference Features | Problems Found | Fix Applied | Status |
|---|---|---|---|---|---|---|
| 1 | `stool` | Pixel Stool | Turned 4-legged wooden stool with cross-stretchers and round padded seat. | None. Draw order is correct: far legs -> stretchers -> seat cushion -> near legs. | Inspected at 4x; no changes required. | `checked` |
| 2 | `sofa` | Cosy Sofa | 2-cushion fabric sofa with turned rear/front legs, deep seat cushions, tufted backrest, piping and armrests. | None. Backrest and rear legs drawn before cushions. | Inspected at 4x; no changes required. | `checked` |
| 3 | `rooftop_sofa` | Rooftop Sofa | Outdoor all-weather wicker sofa with plinth base, deep cushions and back pillows. | None. Back pillows drawn before seat cushions. | Inspected at 4x; no changes required. | `checked` |
| 4 | `lamp` | Lava Lamp | Brushed aluminum conical base, glass vessel with glowing wax suspended in liquid, matching cap. | None. Clean vertical stacking from base to cap. | Inspected at 4x; no changes required. | `checked` |
| 5 | `plant` | Potted Fern | Flared terracotta planter pot with soil bed and arching tiered fern fronds radiating from center. | None. Clean radial layering and pot trim. | Inspected at 4x; no changes required. | `checked` |
| 6 | `rug` | Starburst Rug | Woven flat-weave floor rug with fringed tassels on opposing edges and starburst geometric field. | Tassel fringe draw order caused near fringe to be clipped by field body. | Far fringe drawn before field; near fringe drawn after field for clean overlap. | `fixed` |
| 7 | `neon_sign` | Neon "HOTEL" Sign | Wall-mounted bracket with electrode standoffs, bent glass neon gas tubes, warm glow backing. | None. Follows 2:1 wall angle correctly. | Inspected at 4x; no changes required. | `checked` |
| 8 | `jukebox` | Pixel Jukebox | Arched retro mahogany cabinet with illuminated liquid bubble tubes on chrome pilasters, speaker louvers. | Right bubble tube pilaster was shifted inward (`v = 0.14..0.30`) overlapping front speaker grille. | Moved right pilaster to outer front flank `v = 0.70..0.86`, properly framing speaker louvers. | `fixed` |
| 9 | `armchair` | Plush Armchair | Upholstered club armchair with tapered legs, backrest, bolster arms, seat cushion with piping. | None. Far legs and backrest drawn before seat cushion. | Inspected at 4x; no changes required. | `checked` |
| 10 | `deckchair` | Striped Deckchair | Folding beechwood scissor frame with crossed X-legs and striped canvas sling. | Scissor legs drawn as solid wooden blocks rather than true crossed X-frame legs. | Replaced with true crossed X-scissor legs; far legs drawn before canvas, near legs after canvas. | `fixed` |
| 11 | `reception_desk` | Reception Desk | 3x1 commercial check-in counter with rear desk clerk shelf, key card slots, front marble ledger panel. | None. Clerk desk drawn before front counter face. | Inspected at 4x; no changes required. | `checked` |
| 12 | `bookshelf` | Tall Bookshelf | Solid mahogany upright carcass with backing panel, 4 horizontal shelves loaded with categorized book spines. | None. Backing panel drawn before shelves and book blocks. | Inspected at 4x; no changes required. | `checked` |
| 13 | `bar_counter` | Rooftop Bar | 3x1 curved bar counter with rear work counter, speed rail, brass footrail, and zinc bar top. | None. Rear wells drawn before front facade. | Inspected at 4x; no changes required. | `checked` |
| 14 | `string_lights` | String Light Post | Cast-iron base, slender column, scrolled bracket arms, and hanging festoon Edison light bulbs. | Bulbs and filament glow clipped center column and bracket arms due to unordered box sequence. | Reordered: Base -> column -> scrolled arm -> brackets -> clear festoon bulbs with filaments. | `fixed` |
| 15 | `aquarium` | Luminous Reef Tank | Double-cabinet wooden stand, glass tank with live rock, coral frags, clownfish, water surface highlight. | None. Interior rock and fish drawn before front glass pane. | Inspected at 4x; no changes required. | `checked` |
| 16 | `boba_bar` | Tea-Pearl Boba Bar | Counter service bar with overhead sign board, tapioca dispensers, bubble tea cups, sealing machine. | Overhead menu board floated in mid-air with no rear vertical supports connecting to counter. | Added 2 rear timber support uprights (`z = 24..42`) grounding menu board; drawn before front cups. | `fixed` |
| 17 | `mini_arcade` | Retro Pixel Arcade | Compact upright cabinet with side art, CRT monitor, control deck, joystick, buttons, marquee. | CRT screen and pixel art drawn after control deck, causing visual overlap glitch. | Carcass, CRT monitor & pixel art, and marquee drawn before front control deck, joystick, and coin door. | `fixed` |
| 18 | `noodle_cart` | Midnight Noodle Cart | Mobile street cart with timber canopy, wheels, prep counter, broth pots, condiment jars, lanterns. | Cart rear had no supporting legs, leaving the back end floating off the ground. | Added 2 rear timber support legs (`v = 0.12..0.20, z = 0..8`) grounding cart rear. | `fixed` |
| 19 | `karaoke_machine` | Star Stage Karaoke | Stage podium plinth, microphone stand with boom arm and capsule, amplifier chassis with illuminated VU meters. | None. Base plinth -> stand -> mic -> controls. | Inspected at 4x; no changes required. | `checked` |
| 20 | `telescope` | Stargazer Telescope | Astronomical refractor with alt-azimuth mount on wooden tripod legs with spreader accessory tray. | South (near) leg drawn under barrel while rear legs overlaid front elements. | Far legs (West/East) drawn first, then spreader tray, mount, barrel, and South (near) leg last. | `fixed` |
| 21 | `sky_viewer_nyc` | Skyline Viewer: New York | Tower observation binoculars on raised stone dais, red coin-op column, 360-degree swiveling yoke. | 0.20 unit gap between barrels and eyepieces left eyepieces floating in mid-air detached. | Extended barrels to connect continuously to eyepieces; ordered far eyepieces -> barrels -> near lenses. | `fixed` |
| 22 | `sky_viewer_singapore` | Skyline Viewer: Singapore | Tower observation binoculars on raised stone dais, red coin-op column, 360-degree swiveling yoke. | Same floating eyepiece gap and unordered lens draw order. | Fixed continuous barrel geometry and strictly back-to-front depth order for all 4 rotations. | `fixed` |
| 23 | `sky_viewer_tokyo` | Skyline Viewer: Tokyo | Tower observation binoculars on raised stone dais, red coin-op column, 360-degree swiveling yoke. | Same floating eyepiece gap and unordered lens draw order. | Fixed continuous barrel geometry and strictly back-to-front depth order for all 4 rotations. | `fixed` |
| 24 | `sky_viewer_paris` | Skyline Viewer: Paris | Tower observation binoculars on raised stone dais, red coin-op column, 360-degree swiveling yoke. | Same floating eyepiece gap and unordered lens draw order. | Fixed continuous barrel geometry and strictly back-to-front depth order for all 4 rotations. | `fixed` |
| 25 | `koi_pond` | Zen Koi Stone Pond | 2x2 carved granite coping rim, deep water basin with aquatic plants, submerged swim shadows, swimming koi. | None. Pond floor -> water -> rim -> floating lily pads. | Inspected at 4x; no changes required. | `checked` |
| 26 | `capsule_dispenser` | Gachapon Capsule Toy | Cast metal base, turn crank mechanism, coin slot, clear spherical acrylic globe with multi-color capsules. | None. Rear capsules -> front capsules -> front globe highlight. | Inspected at 4x; no changes required. | `checked` |
| 27 | `gumball_trophy` | Gumball Collector Trophy | Stepped walnut plinth with brass plaque, velvet cushion with central dimple, floating Golden Gumball. | None. Plinth -> plaque -> cushion -> gumball -> glass bell jar. | Inspected at 4x; no changes required. | `checked` |
| 28 | `suite_bed` | Cloud-Soft Suite Bed | 2x2 king bed with tall upholstered headboard, box spring frame, duvet, throw blanket, sleeping pillows. | None. Headboard -> mattress -> duvet -> pillows. | Inspected at 4x; no changes required. | `checked` |
| 29 | `treadmill` | AeroRun Treadmill | 1x2 running machine with floor motor housing, running deck belt with side rails, upright stanchions, console. | None. Deck -> uprights -> console. | Inspected at 4x; no changes required. | `checked` |
| 30 | `weight_bench` | Titan Weight Bench | Heavy steel tube frame, adjustable barbell uprights, flat/incline padded bench, under-bench storage rack. | Barbell upright posts drawn after bench pad, causing visual clipping. | Upright posts drawn before bench pad; barbell cleanly rests on J-hooks. | `fixed` |
| 31 | `dumbbell_rack` | Hex Dumbbell Rack | 2x1 heavy-gauge steel 2-tier rack with saddle cradles, pairs of urethane hex dumbbells in graduated weights. | None. Far posts -> rear tier -> front tier -> near posts. | Inspected at 4x; no changes required. | `checked` |
| 32 | `yoga_mat` | Zen Yoga Mat | High-density foam exercise mat rolled out on floor with textured surface ridges and rolled-up foam end. | None. Floor -> mat body -> rolled edge. | Inspected at 4x; no changes required. | `checked` |
| 33 | `dining_table` | Bistro Dining Table | 2x1 solid oak dining table with 4 tapered legs, apron rails, and bevelled tabletop. | None. Far legs -> apron -> tabletop -> near legs. | Inspected at 4x; no changes required. | `checked` |
| 34 | `dining_chair` | Velvet Dining Chair | Single-tile dining chair with padded velvet seat, contoured backrest, and 4 slender hardwood legs. | None. Far legs -> seat -> backrest -> near legs. | Inspected at 4x; no changes required. | `checked` |
| 35 | `buffet_counter` | Grand Buffet Counter | 3x1 commercial serving station with sneeze guard glass canopy, steam wells with chaffing dishes, plate stacker. | None. Base -> food wells -> sneeze guard. | Inspected at 4x; no changes required. | `checked` |
| 36 | `chef_station` | Teppanyaki Chef Station | 2x1 polished chrome teppan griddle plate, surrounding dining rim, exhaust hood stanchions, cooking utensils. | None. Undercounter -> griddle -> rim. | Inspected at 4x; no changes required. | `checked` |
| 37 | `pool_water` | Heated Lap Pool | 2x2 submerged pool basin tile with ceramic coping rim, underwater tiled floor, and black lane marker line. | Bottom lane marker line was drawn after water surface, appearing to float above the water. | Lane marker line (`z = 1..2`) drawn before water surface (`z = 2..5`). | `fixed` |
| 38 | `sauna_cabin` | Cedar Sauna Entrance | Traditional cedar wood sauna cabin with glass view panel door, stepped interior benches, volcanic rock heater. | Drawn as solid timber box with non-isometric door cutout. | Redrawn with cedar plank back/side walls, interior benches, stone heater, and front glass door. | `fixed` |
| 39 | `towel_rack` | Spa Towel Caddy | Tiered teak washstand caddy with slatted storage shelves, rolled linen towels, and guest hand towel bar. | Front legs were drawn under towels and shelves, causing shelves to clip over posts. | Reordered: Far posts -> shelves & towels -> near posts -> hanging guest towel. | `fixed` |
| 40 | `espresso_bar` | Artisan Espresso Bar | 2x1 cafe counter with dual-boiler commercial espresso machine, portafilters, steam wands, cup warming rack. | None. Counter -> machine carcass -> group heads. | Inspected at 4x; no changes required. | `checked` |
| 41 | `cafe_table` | Marble Cafe Table | 1x1 bistro table with heavy cast-iron pedestal base, central fluted column, and bevelled circular marble top. | None. Base -> column -> marble top. | Inspected at 4x; no changes required. | `checked` |
| 42 | `pool_table` | Championship Billiards | 2x1 slate billiard table with turned mahogany legs, corner pocket irons, drop nets, worsted baize, racked balls. | None. Far legs -> cabinet -> baize -> balls -> near legs. | Inspected at 4x; no changes required. | `checked` |
| 43 | `computer_desk` | Workstation Desk & PC | 2x1 office desk with steel modesty panel, grommet holes, ultrawide curved monitor, keyboard, tower PC. | None. Far legs -> desktop -> monitor -> keyboard. | Inspected at 4x; no changes required. | `checked` |
| 44 | `sky_tree` | Ornamental Sakura Tree | Glazed ceramic planter pot, gnarly bonsai trunk and twisting branches, layered cherry blossom canopy clouds. | None. Pot -> trunk -> far foliage -> near foliage. | Inspected at 4x; no changes required. | `checked` |
| 45 | `garden_bench` | Teak Garden Bench | 2x1 slatted teak park bench with cast-iron ends, slatted seat, armrests, and contoured backrest. | None. Far bench end -> seat slats -> backrest slats -> near bench end. | Inspected at 4x; no changes required. | `checked` |
| 46 | `flower_planter` | Botanical Hedgerow | 2x1 raised ashlar stone planter box with coping lip, dark potting soil, dense billowing hedge foliage, flowers. | None. Stone box -> soil -> foliage -> flowers. | Inspected at 4x; no changes required. | `checked` |
| 47 | `marble_pillar` | Grand Corinthian Pillar | Fluted marble column with square plinth base, astragal torus, and acanthus leaf capital. | None. Base -> shaft -> capital. | Inspected at 4x; no changes required. | `checked` |
| 48 | `chandelier` | Imperial Chandelier | 2x2 ceiling-mounted crystal fixture with brass medallion, drop chain, scrolled ormolu arms, crystal bobeches. | None. Chain -> arms -> crystal drops -> candle bulbs. | Inspected at 4x; no changes required. | `checked` |
| 49 | `grand_staircase` | Grand Mezzanine Staircase | 2x2 sweeping architectural staircase with marble risers and treads, turned brass balusters, mahogany handrail. | None. Lower steps -> upper steps -> balustrade. | Inspected at 4x; no changes required. | `checked` |
| 50 | `lobby_fountain` | Atrium Marble Fountain | Multi-tiered circular marble fountain basin with fluted center bowl, water cascade, and wishing coins. | Wishing coins drawn after water cascade, floating on water surface. | Coins on basin floor (`z = 4.5..5.5`) drawn before cascading water tiers (`z = 4..9.5`). | `fixed` |
| 51 | `luggage_trolley` | Brass Bellhop Trolley | Tubular brass birdcage garment luggage cart with red carpeted base platform, castor wheels, hanging rail. | None. Platform -> luggage -> hanging rail -> frame. | Inspected at 4x; no changes required. | `checked` |
| 52 | `concierge_desk` | Concierge Podium | 2x1 walnut podium desk with brass desk lamp, guest register book, bellhop call bell, and room key slots. | None. Carcass -> counter -> desk lamp -> call bell. | Inspected at 4x; no changes required. | `checked` |
| 53 | `lobby_runner` | Royal Velvet Runner | 2x3 ceremonial velvet carpet runner with gold embroidered borders and gold fringe ends. | Near fringe end was clipped by runner field. | Far fringe drawn before field, near fringe drawn after field for clean overlap. | `fixed` |
| 54 | `gym_mirror` | Gym Mirror Wall | Wall-mounted commercial exercise studio mirror panel with brushed aluminum safety frame and glass bevel. | Authored as solid 3D floor block with broken footprint ([1, 2] vs [1, 1]); did not lie flat on wall plane. | Redrawn as 1x1 wall-mounted panel on 2:1 iso wall plane with brushed frame and diagonal highlights. | `fixed` |
| 55 | `exercise_bike` | Pulse Exercise Bike | Stationary exercise bike with steel frame, front weighted flywheel, pedal cranks, saddle, bullhorn handlebars. | Handlebars and console drawn after near saddle, causing reverse occlusion. | Far foot & flywheel & console drawn first; near foot & saddle drawn last. | `fixed` |
| 56 | `rowing_machine` | HydroRower Machine | Indoor rowing machine with front water flywheel drum, dual aluminum monorail runner, footplates, sliding seat. | Monorail and sliding seat drawn out of order relative to footplates. | Front foot, flywheel, and monorail drawn before handle stalk, footplates, and sliding seat. | `fixed` |
| 57 | `squat_rack` | Titan Squat Rack | Commercial power cage with 4 steel upright posts, pull-up bar, J-hooks, Olympic barbell, bumper weight plates. | Rear upright posts drawn over front barbell and pull-up crossbeam. | Base & rear pegs -> rear uprights -> pull-up bar -> front uprights -> J-hooks & barbell last. | `fixed` |
| 58 | `gym_lockers` | Metal Gym Lockers | 2x1 row of powder-coated steel gym lockers with recessed louvered vents, numbered tags, chrome padlocks. | None. Carcass -> doors -> vents -> locks. | Inspected at 4x; no changes required. | `checked` |
| 59 | `water_cooler` | Spring Water Cooler | Freestanding water dispenser cabinet with cup dispenser tube, drip tray, hot/cold levers, inverted 5-gal bottle. | None. Base cabinet -> levers -> bottle. | Inspected at 4x; no changes required. | `checked` |
| 60 | `round_dining_table` | Grand Dining Table | 2x2 banquet dining table with central carved pedestal base, radial table legs, white linen tablecloth. | None. Pedestal -> tablecloth -> floral centerpiece. | Inspected at 4x; no changes required. | `checked` |
| 61 | `dining_booth` | Velvet Dining Booth | 2x1 upholstered restaurant booth with high fluted privacy backrest, deep bench seat cushion with piping. | None. Base -> backrest -> bench seat. | Inspected at 4x; no changes required. | `checked` |
| 62 | `wine_wall` | Grand Wine Wall | 2x1 temperature-controlled floor-to-ceiling wine storage unit with dark walnut frame, glass display doors. | None. Back panel -> racks -> bottles -> glass doors. | Inspected at 4x; no changes required. | `checked` |
| 63 | `maitre_d_podium` | Maître D' Podium | Slanted restaurant reservation lectern with brass goose-neck reading lamp, open reservation binder. | None. Plinth -> column -> lectern shelf -> reservation book. | Inspected at 4x; no changes required. | `checked` |
| 64 | `grand_piano` | Concert Grand Piano | Concert grand piano with curved bentside rim, propped lid, 88-key keybed, 3 legs with casters, pedal lyre. | Missing 3rd leg! Only 2 legs visible; front leg was completely occluded behind rim keybed. | Added 3rd leg under spine cheek (`u = 0.22, v = 0.52, z = 0..16`); all 3 legs and lyre fully visible. | `fixed` |
| 65 | `wall_sconce` | Brass Wall Sconce | Wall-mounted cast brass bracket arm with fluted frosted glass tulip shade and incandescent bulb. | Filament bulb drawn after shade, appearing outside the frosted glass. | Incandescent filament bulb drawn before frosted tulip shade, placing bulb inside glass. | `fixed` |
| 66 | `kitchen_range` | Commercial Stove Range | 2x1 heavy-duty commercial cooking range with cast-iron burner grates, blue gas pilot flames, backsplash. | None. Oven base -> burners -> backsplash. | Inspected at 4x; no changes required. | `checked` |
| 67 | `kitchen_prep_table` | Stainless Prep Counter | 2x1 commercial prep counter with 4 tubular stainless legs, lower undershelf, hotel pans, cutting board. | Near legs were drawn under undershelf pans, causing pans to overlap near legs. | Far legs -> undershelf & hotel pans -> tabletop & cutting board -> near legs drawn last. | `fixed` |
| 68 | `kitchen_sink` | Commercial Double Sink | 2x1 deep two-compartment stainless commercial wash sink with drainboard, gooseneck pre-rinse faucet. | None. Legs -> basin -> drainboard -> faucet. | Inspected at 4x; no changes required. | `checked` |
| 69 | `kitchen_fridge` | Walk-in Kitchen Fridge | Heavy insulated commercial refrigeration unit with textured stainless steel panels, heavy-duty latch handle. | None. Body -> door -> latch -> thermometer. | Inspected at 4x; no changes required. | `checked` |
| 70 | `kitchen_pass` | Kitchen Service Pass | 2x1 heated food expediting pass window counter with overhead infrared quartz heat lamps, ticket order rail. | None. Counter -> heat lamp stanchions -> order tickets. | Inspected at 4x; no changes required. | `checked` |
| 71 | `starting_block` | Olympic Starting Block | Angled competition swimming block with non-slip textured platform, adjustable kick wedge track, handles. | None. Pedestal -> handles -> angled platform -> kick wedge. | Inspected at 4x; no changes required. | `checked` |
| 72 | `lane_rope` | Pool Lane Divider Rope | Stainless steel tension cable strung with alternating red and white anti-turbulent buoyant turbine discs. | Missing wall anchor bracket on near end; opposing end had no tensioning fixture. | Added near-end opposing wall anchor bracket; buoyant discs drawn back-to-front. | `fixed` |
| 73 | `pool_ladder` | Chrome Pool Ladder | Stainless steel tubular ladder with twin deck anchor flanges, coping arch curve, and 3 non-skid step treads. | Rails drawn as flat vertical stubs without arching forward over the deck coping rim; treads unordered. | Redrawn with sweeping coping arches; far rail drawn first, step treads next, near rail drawn last. | `fixed` |
| 74 | `pool_lounger` | Cushioned Pool Lounger | 1x2 outdoor chaise lounge with teak slatted frame, rear transport wheels, reclining backrest, cushion. | None. Teak frame -> wheels -> cushion -> headrest. | Inspected at 4x; no changes required. | `checked` |
| 75 | `pool_umbrella` | Resort Sun Umbrella | Heavy granite base, eucalyptus center mast, runner hub mechanism, octagonal canvas canopy with valance. | Missing radial stretcher ribs under canopy; canopy appeared to float above runner hub. | Added radial stretcher ribs; far ribs drawn before center mast, near ribs drawn after center mast. | `fixed` |
| 76 | `changing_cubicle` | Changing Room Cubicle | 2x2 modular changing stall with anodised aluminum upright posts, privacy walls, bench, pleated curtain. | None. Posts -> walls -> bench -> curtain. | Inspected at 4x; no changes required. | `checked` |
| 77 | `changing_room_door` | Changing Room Door | Full-height wooden door frame with angled ventilation louvers, brushed satin lever handle, number plate. | None. Frame -> louver slats -> door handle. | Inspected at 4x; no changes required. | `checked` |
| 78 | `salon_chair` | Salon Styling Chair | Hydraulic styling chair with circular chrome disc pump base, foot lever, black leather bucket seat, footrest. | None. Base -> pump lever -> seat -> armrests -> backrest. | Inspected at 4x; no changes required. | `checked` |
| 79 | `massage_bed` | Spa Massage Bed | 1x2 professional spa treatment table with sturdy beechwood frame, lower slatted linen shelf, mattress. | None. Legs -> lower shelf -> mattress -> face cradle -> towels. | Inspected at 4x; no changes required. | `checked` |
| 80 | `spa_partition` | Spa Glass Partition Wall | Floor-mounted privacy screen with chrome stanchion posts, teak base shoe/top rail, frosted etched glass. | Drawn as thick solid block across the diagonal; non-isometric orientation. | Redrawn as 1x1 screen along 2:1 isometric wall lines (U for rot 0, V for rot 1) with clean depth order. | `fixed` |
| 81 | `spa_door` | Spa Glass Door Archway | 2x1 arched doorway portal with stainless tubular arch framing, teak base plinth shoes, frosted push doors. | None. Arch posts -> arch header -> glass doors. | Inspected at 4x; no changes required. | `checked` |
| 82 | `pergola` | Garden Pergola with Vines | 2x2 outdoor cedar arbor with 4 square corner posts, overhead crossbeams and rafters, flowering wisteria vines. | None. Posts -> rafters -> vine foliage -> flowers. | Inspected at 4x; no changes required. | `checked` |
| 83 | `arcade_reserved` | Reserved Arcade Zone | 4x2 open floor area demarcated by painted industrial hazard stripes, polished concrete floor sheen. | None. Flat ground surface -> boundary stripes. | Inspected at 4x; no changes required. | `checked` |
| 84 | `arcade_snake_1` | Noodle Snake (Classic) | Upright cabinet with woodgrain sides, amber T-molding, slanted control deck, red joystick, CRT monitor. | CRT screen and snake graphics drawn after control deck, clipping control panel. | Marquee & CRT screen drawn before slanted control deck, joystick, buttons, and coin door. | `fixed` |
| 85 | `arcade_snake_2` | Noodle Snake (Neon) | Cyberpunk edition cabinet with neon cyan T-molding, illuminated LED joystick, high-contrast CRT graphics. | CRT screen and neon trails drawn after control deck, clipping control panel. | Marquee & CRT screen drawn before slanted control deck, joystick, buttons, and coin door. | `fixed` |
| 86 | `arcade_breakout_1` | Brick Bash (Retro) | Vintage 1970s orange cabinet with rotary paddle spinner knob, launch button, CRT brick wall graphics. | CRT screen and bricks drawn after control deck, clipping rotary spinner and buttons. | Marquee & CRT screen drawn before slanted control deck, spinner knob, and coin door. | `fixed` |
| 87 | `arcade_breakout_2` | Brick Bash (Turbo) | High-speed tournament cabinet with magenta T-molding, dual turbo launch buttons, multi-ball CRT action. | CRT screen and multi-ball graphics drawn after control deck. | Marquee & CRT screen drawn before slanted control deck, buttons, and coin door. | `fixed` |
| 88 | `arcade_drop_1` | Block Drop (Puzzle) | Cobalt blue cabinet with 4-way joystick, rotation buttons, CRT screen with falling tetromino pieces. | CRT monitor drawn after control deck, clipping 4-way joystick and buttons. | Marquee & CRT screen drawn before slanted control deck, joystick, buttons, and coin door. | `fixed` |
| 89 | `arcade_drop_2` | Block Drop (Deluxe) | Deluxe gold edition cabinet with stereo speaker rings, gold joystick, CRT screen with multipliers. | CRT display drawn after control deck, clipping gold joystick and buttons. | Marquee & CRT screen drawn before slanted control deck, joystick, buttons, and coin door. | `fixed` |
| 90 | `arcade_leaderboard` | Arcade Hall of Fame | 2x1 floor-standing scoreboard with heavy pedestal uprights, widescreen monitor enclosure, rank medals. | None. Pedestal -> scoreboard enclosure -> screen -> rank rows -> banner. | Inspected at 4x; no changes required. | `checked` |
| 91 | `wardrobe` | Oak Wardrobe | Tall solid oak bedroom wardrobe with panelled doors, brass drop pull handles, top cornice moulding. | None. Plinth feet -> carcass -> panelled doors -> brass handles -> cornice. | Inspected at 4x; no changes required. | `checked` |

---

## Summary of Audit Statistics
- **Total Catalogue Items Audited**: 91 / 91 (100% complete, 0 skipped)
- **Items Fixed**: 25 items
  - `rug` (far/near fringe depth order)
  - `jukebox` (bubble tube pilaster repositioned to frame speaker louvers)
  - `deckchair` (scissor X-frame legs with back-to-front depth)
  - `string_lights` (festoon bulbs & filaments clean spacing and bracket order)
  - `boba_bar` (added rear upright support posts grounding menu board)
  - `mini_arcade` (CRT monitor drawn before control deck and joystick)
  - `noodle_cart` (added rear timber support legs grounding cart)
  - `telescope` (reordered tripod legs and mount back-to-front)
  - `sky_viewer_nyc` (connected continuous optical barrel, fixed depth)
  - `sky_viewer_singapore` (connected continuous optical barrel, fixed depth)
  - `sky_viewer_tokyo` (connected continuous optical barrel, fixed depth)
  - `sky_viewer_paris` (connected continuous optical barrel, fixed depth)
  - `weight_bench` (barbell uprights drawn before bench pad)
  - `pool_water` (lane markers drawn before water surface)
  - `sauna_cabin` (redrawn cedar walls, interior benches, stone heater, glass door)
  - `towel_rack` (far posts -> shelves & towels -> near posts -> guest towel)
  - `lobby_fountain` (wishing coins drawn before cascading water)
  - `lobby_runner` (far/near fringe depth order)
  - `gym_mirror` (redrawn as 1x1 wall-mounted panel on 2:1 iso wall plane)
  - `exercise_bike` (far foot & flywheel -> frame & pedals -> near foot & saddle)
  - `rowing_machine` (monorail & flywheel -> handles -> footplates -> sliding seat)
  - `squat_rack` (base & rear pegs -> rear posts -> pull-up bar -> front posts -> barbell)
  - `grand_piano` (added missing 3rd leg under spine cheek)
  - `wall_sconce` (filament bulb drawn before frosted tulip shade)
  - `kitchen_prep_table` (far legs -> undershelf -> tabletop -> near legs)
  - `lane_rope` (added opposing near-end wall anchor bracket)
  - `pool_ladder` (coping arch rails descending into water; far rail -> treads -> near rail)
  - `pool_umbrella` (added radial stretcher ribs supporting canopy)
  - `spa_partition` (redrawn along 2:1 isometric wall lines with clean depth)
  - `arcade_snake_1`, `arcade_snake_2`, `arcade_breakout_1`, `arcade_breakout_2`, `arcade_drop_1`, `arcade_drop_2` (CRT screen & marquee drawn before control deck, joystick, buttons, and coin door)
- **Items Verified (`checked`)**: 66 items
- **High-Resolution Contact Sheet**: Generated at `/workspace/ph-v0125/shots/v0125/after_contact_sheet.png` (8x12 grid, 180px cells, >= 2x scale)
- **High-Resolution Closeups**:
  - `shots/v0125/closeup_piano.png` (Concert Grand Piano with 3 visible legs and lyre)
  - `shots/v0125/closeup_gym_mirror.png` (Gym Mirror Wall on 2:1 iso wall plane)
  - `shots/v0125/closeup_occlusion_1.png` (String Light Post occlusion)
  - `shots/v0125/closeup_occlusion_2.png` (Stargazer Telescope occlusion)
  - `shots/v0125/closeup_occlusion_3.png` (Pool Ladder occlusion)
