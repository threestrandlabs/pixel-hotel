import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const { CATALOGUE } = await import('../js/data.js');

const categoryResearch = {
  plants: {
    techniques: [
      'Clustered foliage volumes: group leaves into organic cloud/pillow clumps rather than single geometric blocks.',
      '4-5 color ramp: deep shadow (#163e1c), mid-dark (#226c30), base green (#369c4a), bright highlight (#6de478), dew accent (#b2ffb8).',
      'Top-left illumination: highlights on top-left crests, deep undercuts and crevice shadows underneath clumps.',
      'Irregular silhouette with organic leaf jaggies and stray leaf tips spilling beyond the rim.',
      'Petal clusters for flowering plants (hydrangeas, marigolds, blossoms) using delicate 2x dot clusters.'
    ]
  },
  fitness: {
    techniques: [
      'Accurate structural silhouettes: 2:1 angled tubular frames, cylindrical flywheel with metallic sheen bands.',
      'Mechanical articulation: pedal cranks with pedals, saddle on seatpost, contoured aerodynamic handlebars, digital console display with screen glow.',
      'Rowing machine long extruded rail with contoured sliding seat, front flywheel housing, chain handle, footplates with heel cups and straps.',
      'Heavy steel equipment with laser-cut peg holes (squat rack), knurled barbell with cast-iron weight plates.',
      'Locker door vertical seams with ventilation louvers and chrome latch hasps; water cooler with inverted blue bottle, bubble highlight and dual spigots.'
    ]
  },
  entertainment: {
    techniques: [
      'Arcade & tech glow: glowing CRT screens with scanlines/matrix graphics, backlit marquee titles, multi-colored buttons.',
      'Reflective metallic finishes: chrome trim, gold accents, polished piano lacquer with top lid prop stick, brass telescope tubes.',
      'Running belt texture with guide lines and console dashboard on treadmills.',
      'Textured playing surfaces: baize felt with corner pocket castings and ball cluster on pool tables.'
    ]
  },
  seating: {
    techniques: [
      'Fabric upholstery: seam piping along perimeter, button tufting with cross-crease shading, seat cushion compression folds.',
      'Wood craft: slatted bench seats with visible gaps, plank seams, end-grain cut highlights, cast-iron scrolled legs and bolt heads.',
      'Multi-material contrast: polished metal studs, turned wooden legs with brass toe caps, soft fabric pillows.'
    ]
  },
  tables: {
    techniques: [
      'Wood grain & planking: linear grain streaks along table length, plank seams with bevel highlights, end-grain edges.',
      'Marble tops: ivory/carrara marble with subtle mineral veining and polished brass rims.',
      'Architectural joinery: panelled front aprons, turned pedestal legs, mortise-and-tenon details.'
    ]
  },
  lighting: {
    techniques: [
      'Luminous volume: glowing glass bodies with floating wax blobs, filaments, or internal crystal prisms.',
      'Specularity: sharp 1-2px white highlight streaks along cylindrical glass curves and polished chrome/brass caps.',
      'Warm ambient drop shadow / radial floor glow.'
    ]
  },
  rugs: {
    techniques: [
      'Woven fiber texture: fine alternating weave flecks at 2x density, fringed yarn tassels at short ends.',
      'Multi-band borders: contrasting outer framing lines with subtle shadow drop onto floor tiles.'
    ]
  },
  decor: {
    techniques: [
      'Micro-detail at 2x: individual book spines with varying heights, colors, and gold title foil bands on bookshelves.',
      'Classical architectural mouldings: fluted pillar shafts, stepped plinths, carved cornice headers.',
      'Translucent materials: water refraction, glass display cases with specular diagonal sheen lines.'
    ]
  },
  kitchen_food: {
    techniques: [
      'Commercial stainless steel: horizontal brush lines, bright specular edge highlights, cool slate undertones.',
      'Gastronomy micro-props: pans, burners with red control dials, espresso groupheads with portafilters, steam wands.',
      'Wooden street carts with fabric noren curtains and steaming pots.'
    ]
  },
  outdoor_pool: {
    techniques: [
      'Fluid water textures: caustics, subtle ripple highlights, deep gradient transition.',
      'Flagstone / slate coping with mortar lines and rounded bevelled edges.',
      'Marine hardware: polished 316 stainless ladders, anti-wave lane rope discs, textured starting block platforms.'
    ]
  },
  beds: {
    techniques: [
      'Soft fabric draping: duvets with natural folds, plump pillows with center dimples, vertical headboard stitch channels.'
    ]
  }
};

const itemFeatures = {
  // Plants
  plant: ['Flared terracotta pot with raised rim band', 'Rich dark potting soil with depth', 'Arching multi-tiered fern fronds with organic silhouettes in 4 greens', 'Blossom accent with petal details'],
  sky_tree: ['Gnarled branching sakura trunk with bark texture', 'Volumetric cherry blossom cloud clumps with organic jaggies', 'Falling petal flecks in breeze', 'Stone tree surround base with soil'],
  flower_planter: ['Ashlar stone planter box with block texture and coping lip', 'Rich dark soil bed', 'Dense billowing hedge mass rising above rim with 4-shade leafy clumps', 'Hydrangea blue and marigold orange flower petal clusters', 'Trailing leaves spilling over the edge'],
  pergola: ['Sturdy timber posts with metal footing brackets', 'Overhead slatted crossbeams and rafters with wood grain', 'Climbing wisteria/ivy vines with leafy clusters', 'Draping floral clusters hanging between slats'],

  // Fitness
  gym_mirror: ['Bevelled mirror glass panels with silver seams', 'Diagonal reflection sheen streaks', 'Brushed aluminum base retaining rail', 'Clear depth separation from back wall'],
  exercise_bike: ['Angular 2:1 steel chassis frame', 'Cylindrical flywheel housing with metallic sheen reflection', 'Pedal crank arms with foot pedals', 'Ergonomic racing saddle on adjustable seatpost', 'Curved handlebars with glowing digital workout console'],
  rowing_machine: ['Long extruded dual-rail slide beam', 'Contoured ergonomic sliding seat on runner wheels', 'Front air/water resistance flywheel fan housing', 'Handle bar and chain linkage', 'Angled footplates with heel cups and strap details'],
  squat_rack: ['Dual heavy-gauge steel uprights with laser-cut peg holes', 'Adjustable red J-hooks and safety spotter arms', 'Knurled barbell resting on hooks with cast-iron Olympic plates', 'Overhead knurled pull-up crossbar'],
  gym_lockers: ['3-tier steel locker bank with vertical door seams', 'Ventilation louvers stamped at top and bottom of each locker', 'Chrome latch hasps with padlock eyelets', 'Recessed plinth base and side trim'],
  water_cooler: ['Inverted translucent blue polycarbonate 5-gallon jug with water level line', 'Air bubble highlight in bottle', 'White dispenser body with drip tray', 'Dual red (hot) and blue (cold) push taps and side paper cup stack'],

  // Seating
  stool: ['4 turned timber legs with foot stretchers', 'Polished brass toe caps on legs', 'Nailhead brass trim ring around seat base', 'Tufted leather cushion with center button indent'],
  sofa: ['Plush three-cushion seat with welted piping seams', 'Button-tufted backrest with diagonal crease shading', 'Curved padded roll arms', 'Turned wooden bun feet with floor shadow'],
  rooftop_sofa: ['Low-profile modern teak outdoor frame with plank slats', 'Weatherproof teal seat and back cushions with piping', 'Matching bolster accent pillows', 'Recessed plinth base'],
  armchair: ['Winged club armchair silhouette with rounded piped armrests', 'Tufted backrest with deep button accents', 'Plump removable seat cushion with natural fabric sag', 'Tapered hardwood legs'],
  deckchair: ['Folding beechwood scissor frame with brass pivot rivets', 'Striped durable canvas sling seat with natural body sag', 'Multi-slot adjustment notches on rear frame', 'Fabric fringe hem'],
  weight_bench: ['Heavy boxed steel frame with rubber end caps', 'Dense vinyl-upholstered pad with stitched seam borders', 'Incline adjustment support strut with selector pin', 'High-grip non-slip textured finish'],
  dining_chair: ['Curved upholstered velvet backrest with piped border', 'Plump cushioned seat with welt cord', 'Slender tapered legs with polished brass ferrules', 'Solid wood stretcher underframe'],
  garden_bench: ['Ornate cast-iron arched legs and scrolled armrests with bolt heads', 'Contoured seat and backrest made of separate teak slats with visible gaps', 'Wood grain texture on each individual plank slat', 'Reinforcing iron center support bracket'],
  dining_booth: ['High-back dining booth with vertical channel tufting', 'Deep velvet bench cushion with piped edge', 'Sturdy wooden end panels with laminate kickplate', 'Plush comfortable silhouette'],
  pool_lounger: ['Water-resistant slatted chaise frame with wood grain', 'Multi-position ratchet recline backrest', 'Thick full-length padded lounger mattress with tie-downs', 'Rear wheel casters for moving on pool deck'],
  salon_chair: ['Heavy circular chrome hydraulic base with foot pump pedal', 'Contoured black faux-leather bucket seat with ribbed stitching', 'Polished chrome armrests', 'Padded chrome footrest bar with rubber grip'],
  massage_bed: ['Solid natural beechwood frame with lower storage slatted shelf', 'Thick multi-layer mattress with ultra-soft white vinyl covering', 'Contoured ergonomic face cradle cushion', 'Rolled white spa towel accent on end'],

  // Lighting
  lamp: ['Tiered brushed chrome pedestal base with cooling ribs', 'Clear glass chamber with glowing thermal liquid', 'Rising floating wax blobs with internal temperature highlights', 'Chrome conical cap and finial'],
  neon_sign: ['Hand-bent glowing neon glass tubing spelling HOTEL', 'Wall mounting standoffs and dark transformer box', 'Intense neon core with diffuse outer color bloom', 'Drop glow casting colored light on wall'],
  string_lights: ['Wrought iron lantern post with decorative scroll bracket', 'Catenary swag cable with vintage Edison bulbs', 'Glowing spiral filaments visible through clear glass', 'Warm ambient halo around each bulb'],
  chandelier: ['Tiered multi-ring polished brass frame', 'Cascading multifaceted cut-crystal teardrop pendants with sparkles', 'Candelabra candle sleeves with warm flame bulbs', 'Center brass finial and hanging chain'],
  wall_sconce: ['Polished brass wall escutcheon plate with mounting screws', 'Graceful curved swan-neck support arm', 'Frosted fluted glass tulip shade', 'Warm incandescent bulb illumination'],

  // Rugs
  rug: ['Woven woolen pile with starburst geometric medallion', 'Contrasting concentric inner and outer border bands', 'Twisted yarn fringe tassels along short ends', 'Fine woven thread texture at 2x density'],
  yoga_mat: ['Textured closed-cell foam mat with rounded corners', 'Embossed non-slip alignment grip lines', 'Partially rolled end showing thickness', 'Carrying strap buckle detail'],
  lobby_runner: ['Deep crimson velvet runner carpet with rich nap', 'Intricate gold bullion braided border', 'Gold fringe tassels on ends', 'Subtle repeating damask pattern'],

  // Tables
  reception_desk: ['Curved architectural front with vertical timber slats', 'Polished slab counter with overhang', 'Recessed receptionist desk with desktop monitor and service bell', 'Base toe-kick with concealed LED runner'],
  dining_table: ['Solid hardwood top with perimeter bevel and plank seams', 'Four turned timber legs with mortise corner brackets', 'Woven fabric table runner down center', 'Subtle wood grain flecks and highlights'],
  cafe_table: ['Heavy ornate 3-legged cast-iron pedestal base', 'Polished circular white Carrara marble top with grey mineral veining', 'Protective brass edge bullnose banding', 'Central support column with fluting'],
  computer_desk: ['Executive workstation desk with drawer pedestal and brushed handles', 'Dual-screen computer setup with active illuminated desktop screens', 'Mechanical keyboard, mouse on mat, and desk grommet cable pass', 'Cable management cutout'],
  concierge_desk: ['High-standing solid mahogany podium with raised moulding panels', 'Slanted reading top with leather blotter and open guest register book', 'Polished brass swan-neck reading lamp', 'Brass corner protectors and foot rail'],
  round_dining_table: ['Large circular banquet table with radiating wood veneer quarters', 'Substantial central turned timber pedestal with scrolled base feet', 'Cascading white linen tablecloth with draped hem folds', 'Polished surface sheen'],

  // Decor
  bookshelf: ['Full-height solid mahogany cabinet with plinth base and top cornice', 'Upright side gable panels and three recessed sturdy shelves', 'At least 15 individual books with varying heights, spine colors, and gold title foil bands', 'Book end bookends holding leaning volumes'],
  aquarium: ['Opti-white clear glass tank with top water meniscus', 'Lively underwater reef scape with purple/orange corals and live rock', 'Rising aerator bubble stream and swimming tropical clownfish', 'Modern matte black cabinet base with push-latch doors'],
  marble_pillar: ['Carved Corinthian column capital with acanthus leaves', 'Fluted vertical column shaft with 2x shadow grooves', 'Stepped circular torus base with polished gold band', 'Subtle creamy marble veining throughout'],
  grand_staircase: ['Wide flared marble stair treads with shadowed riser steps', 'Carved mahogany handrail supported by turned baluster spindles', 'Opulent royal red carpet runner centered down the flight with brass stair rods', 'Grand starting newel post with finial'],
  lobby_fountain: ['Carved stone tiered basin with projecting coping lips', 'Central stone fountain spire with tiered overflow bowls', 'Water ripples with concentric wave highlights and sparkle glints', 'Submerged wishing coins scattered on floor of basin'],
  luggage_trolley: ['Tubular polished brass birdcage frame with coat hanging hooks', 'Red plush carpeted luggage platform deck with rubber bumper guard', 'Four heavy-duty swivel caster wheels', 'Stacked leather vintage suitcases with brass corner locks and straps'],
  wine_wall: ['Floor-to-ceiling dark oak temperature-controlled wine display', 'Diamond lattice and horizontal bottle rack shelving', 'Individual green and amber glass wine bottles with neck foils and labels', 'Subtle interior LED strip downlighting on bottles'],
  maitre_d_podium: ['Slender dark walnut podium with brass accent inlay', 'Tilted reading lectern holding the daily hotel dining ledger book with bookmark ribbon', 'Brass goose-neck adjustable desk lamp', 'Locking lower storage cabinet'],
  spa_partition: ['Frameless frosted acoustic glass partition wall', 'Laser-etched zen bamboo reed silhouettes on glass', 'Satin stainless steel top and bottom recessed mounting channels', 'Subtle translucent light transmission'],
  spa_door: ['Tempered glass double door set with satin steel perimeter frame', 'Full-height vertical architectural ladder pull handles', 'Overhead glass transom panel with pivot hardware', 'Clear frosted privacy bands'],
  arcade_reserved: ['Pair of polished mirror-chrome stanchion posts with weighted dome bases', 'Heavy twisted crimson velvet barrier rope with snap-hook ends', 'Natural catenary drape curve of the barrier rope', 'VIP floor indicator'],
  wardrobe: ['Double-door solid oak wardrobe with recessed panel mouldings', 'Deep carved top cornice and sturdy plinth base with bun feet', 'Ornate brass keyhole escutcheons and teardrop pull handles', 'Wood grain texture on door panels with plank seams'],

  // Kitchen & Food
  bar_counter: ['Solid dark mahogany bar counter with curved bullnose drink rail', 'Raised wood-panelled front with fluted pilasters', 'Polished brass foot rail with floor mounting brackets', 'Stainless steel back-bar work deck with bottle tiers'],
  boba_bar: ['Stainless steel commercial counter with clear sneeze guard canopy', 'Chilled insert wells filled with tapioca pearls, fruit jellies, and syrups', 'Countertop cup-sealing machine with digital readout', 'Straw holder dispenser and shaker tins'],
  noodle_cart: ['Traditional artisan timber street cart with cloth noren entrance banner', 'Boiling noodle broth cauldron with steam puffs', 'Tiered ingredient containers with bamboo noodle strainers', 'Spoked timber wheels and cart handles'],
  buffet_counter: ['Multi-bay heated stainless steel food warming counter', 'Polished chafing dishes with domed roll-top covers', 'Angled glass sneeze-guard canopy with overhead warming heat lamps', 'Lower plate warmer cabinet with stainless doors'],
  chef_station: ['Heavy Japanese steel teppanyaki flat-top plancha griddle', 'Surrounding timber dining ledge with place settings', 'Stainless commercial overhead exhaust ventilation hood', 'Chef squeeze bottles, spatulas, and seasoning shakers'],
  espresso_bar: ['Commercial dual-group polished chrome espresso machine with portafilters', 'Twin steam wands with milk pitchers and top cup warmer with demitasses', 'Bean hopper grinder alongside knock box for espresso pucks', 'Syrup bottles and barista tamp mat'],
  kitchen_range: ['Heavy-duty commercial 6-burner gas range with heavy cast-iron trivets', 'Vibrant red burner control knobs along front manifold', 'Full-width front towel/plate rail', 'Twin commercial standard baking ovens below with pull-down handles'],
  kitchen_prep_table: ['Commercial NSF 304 food-grade stainless steel top with rolled bullnose front edge', 'Heavy tubular stainless legs with adjustable levelling bullet feet', 'Galvanised lower undershelf holding stainless hotel pans', 'Smooth polished metallic reflection'],
  kitchen_sink: ['Deep double-bowl commercial stainless steel sink compartments', 'High-arc commercial pre-rinse spring gooseneck faucet with spray valve', 'Sloped corrugated drainboards on left and right for drying racks', 'Basket strainer drains and splashback wall guard'],
  kitchen_fridge: ['Massive double-door commercial reach-in stainless steel refrigerator', 'Top-mounted refrigeration compressor housing with ventilation grille', 'Heavy-duty chrome cam-lift latch handles with keylocks', 'Exterior digital temperature readout display'],
  kitchen_pass: ['Heated stainless steel plating pass-through counter', 'Overhead dual infrared heat lamp strip casting warm culinary glow', 'Order ticket spinning wheel / ticket rail with guest check slips', 'Chrome service bell for server pick-up'],

  // Outdoor & Pool
  telescope: ['Classic polished brass refractor telescope tube with focus knob and dew shield', 'Sturdy wooden surveyor tripod with brass spreader chains', 'Alt-azimuth swivel mount with locking dials', 'Glass objective lens with specular glint'],
  koi_pond: ['Natural irregular flagstone rim with mortar joints and coping overhang', 'Deep layered aquatic gradient from turquoise shallows to deep teal abyss', 'Floating circular lily pads with signature leaf notches and pink water lily blossoms', 'Swimming orange, white, and black Nishikigoi koi fish silhouettes beneath surface'],
  pool_water: ['Inviting cyan swimming pool water surface with animated caustic ripple reflections', 'Deep blue mosaic tile lining visible underwater with depth gradient', 'Smooth white cast-stone pool coping edge with water-drop highlights', 'Submerged pool step ledge'],
  sauna_cabin: ['Horizontal tongue-and-groove Nordic cedar plank siding with grain texture', 'Full-height bronze tempered glass door with wooden safety handle', 'Volcanic sauna stone rock basket stove with glowing heating elements and steam', 'Upper and lower cedar slatted interior benches visible through glass'],
  towel_rack: ['Three-tier teak spa caddy with slatted shelves', 'Neat bundles of fluffy rolled white spa towels stacked on upper shelves', 'Woven natural wicker laundry basket for used towels on lower shelf', 'Moisture-resistant oil finish on teak'],
  starting_block: ['Official Olympic pool starting block with forward-angled platform', 'High-traction textured non-slip tread surface on platform with lane number decal', 'Stainless steel backstroke starting grab bar mounted to front', 'Sturdy powder-coated pedestal base bolted to pool deck'],
  lane_rope: ['Floating racing lane divider cable with alternating high-density red and white anti-turbulent discs', 'Heavy-duty stainless steel tensioning ratchet reel at deck anchor', 'Water line ripples where floats meet the pool surface', 'Crisp repeating buoyant disc pattern'],
  pool_ladder: ['Polished 316 marine-grade stainless steel tubular handrails with smooth bends', 'Three wide non-skid stainless step treads with rubber grip pads', 'Twin round deck escutcheon anchor flanges securing rails to coping', 'Submerged lower bumpers resting against pool wall'],
  pool_umbrella: ['Large 8-panel octagonal resort canvas parasol canopy with wind vent cap', 'Solid eucalyptus center mast and rib hub mechanism', 'Heavy weighted circular granite slab base with locking collar', 'Scalloped canopy valance hem with drop shade'],
  changing_cubicle: ['Commercial privacy changing stall with white melamine panel walls', 'Satin anodized aluminum upright corner posts and ceiling bracing', 'Swinging privacy modesty door with red/green occupied indicator latch', 'Interior clothing hook and small bench corner'],
  changing_room_door: ['White painted solid wooden door with horizontal louvered ventilation slats', 'Satin chrome commercial lever handle with privacy lock cylinder', 'Stainless steel protective kickplate on bottom', 'Deep door frame moulding and shadowed threshold'],

  // Entertainment (Arcade, Viewers, Trophy, Games)
  treadmill: ['Inclined running deck with heavy-duty black textured rubber running belt', 'White central lane alignment guide stripes on belt', 'Integrated side foot rails with non-skid treads', 'Ergonomic upright support arms with heart-rate pulse sensor handgrips', 'Wide illuminated digital console with simulated speed/incline display and red safety clip'],
  dumbbell_rack: ['Heavy two-tier commercial steel rack with angled saddle cradles', 'Array of paired cast-iron rubber-encased hex dumbbells graduating from small to large', 'Knurled chrome handles visible on each dumbbell', 'Non-marking rubber foot pads on rack legs'],
  jukebox: ['Iconic retro arched wooden cabinet with bubble tubes and chrome trim', 'Luminous rainbow neon lighting framing the perimeter', 'Glowing curved selection glass displaying title strips and record carousel mechanism', 'Chrome speaker grille bars with illuminated acoustic cloth'],
  mini_arcade: ['Classic upright coin-op arcade cabinet with angled side art', 'Illuminated top marquee sign with custom retro pixel title', 'Tilted CRT monitor display with vivid gameplay graphics and screen glare', 'Slanted control panel deck with joystick and 6 action buttons, plus coin door with coin return slots'],
  karaoke_machine: ['High-powered sound tower with dual glowing speaker woofer cones and mesh grilles', 'Central widescreen color monitor with animated lyric prompt bars', 'Dual wireless microphones resting in side docking cradles', 'Pulsing multicolor LED base wash light'],
  sky_viewer_nyc: ['Heavy-duty tourist viewing binocular turret on 360-degree swivel yoke', 'Cast-iron stepped circular base platform with non-slip footpad', 'Twin rubber-hooded optical eyepieces and focusing wheel', 'Polished brass and steel finish with coin acceptor slot for viewing timer'],
  sky_viewer_singapore: ['Marina-themed binocular viewing turret with nautical brass finish', 'Stepped platform base and coin-operated timer box', 'Dual optical viewing eyepieces aimed toward the waterfront', 'Sturdy swivel fork mounting'],
  sky_viewer_tokyo: ['Sleek cybernetic-styled coin-op binocular tower with illuminated accents', 'Twin high-magnification eyepieces with weather-sealed rubber gaskets', 'Heavy weighted round base pedestal with diamond-plate footing', 'Swiveling observation telescope body'],
  sky_viewer_paris: ['Vintage Parisian cast-iron binocular viewer with antique verdigris patina', 'Stepped round mounting dais with decorative fluting', 'Twin brass eyepieces and viewing coin slot', 'Heavy balanced yoke assembly'],
  capsule_dispenser: ['Transparent spherical gachapon globe packed with multi-colored toy capsules', 'Cast-metal crimson housing body with chrome coin slide and turn crank handle', 'Clear drop chute door showing an awarded capsule ready to collect', 'Heavy pedestal stand with stable base'],
  gumball_trophy: ['Polished dark walnut stepped pedestal plinth with engraved brass nameplate', 'Hand-blown clear glass bell jar cloche with crystal top handle', 'Legendary floating Golden Gumball displayed on velvet cushion inside with star glints', 'Showcase museum presentation'],
  pool_table: ['Solid hardwood cabinet with fluted corner legs and cast brass corner pocket irons', 'Tournament-grade worsted wool green felt playing surface with head string marker', 'Drop pockets with leather nets holding balls', 'Racked triangle ball cluster and white cue ball on baize, with cue sticks in side clips'],
  grand_piano: ['Glossy mirror-ebony lacquer curved piano rim and soundboard', 'Open piano lid propped high on wooden lid prop stick', 'Cast-iron harp plate with gold finish and silver piano strings', '88-key ivories keybed with fallboard, music desk, and 3 brass pedals on pedal lyre'],
  arcade_snake_1: ['Retro green woodgrain arcade cabinet with "Noodle Snake" classic marquee art', 'CRT monitor displaying moving green pixel snake eating glowing fruit on dark grid', 'Angled control panel with ball-top joystick and large retro push buttons', 'Coin insert door with dual 25-cent illuminated reject buttons'],
  arcade_snake_2: ['Cyberpunk neon-cyan cabinet with custom holographic "Neon Snake" marquee banner', 'High-contrast glowing neon CRT screen with trailing snake light trails', 'Illuminated LED joystick and glow buttons', 'Speaker grille and side vector art decals'],
  arcade_breakout_1: ['Vintage 1970s orange-toned cabinet with "Brick Bash" retro lettering', 'Tilted screen showing multi-colored brick wall and reflecting paddle ball with angle lines', 'Precision spinner paddle dial knob and ball-launch button on deck', 'Authentic speaker slots and coin door'],
  arcade_breakout_2: ['High-octane purple/magenta "Turbo Brick" cabinet with explosive side artwork', 'CRT display showing multi-ball powerups, lasers, and crumbling bricks', 'Dual launch buttons and heavy-duty spinner controller', 'Black light illuminated coin return'],
  arcade_drop_1: ['Deep blue cabinet with "Block Drop" puzzle tetromino marquee', 'Vibrant screen displaying falling polyomino shapes and clearing matrix line flashes', '4-way arcade joystick with hard-drop and rotation buttons', 'Sturdy plywood cabinet with T-molding edge trim'],
  arcade_drop_2: ['Deluxe golden edition "Block Drop" cabinet with gleaming gold T-molding trim', 'Screen displaying high-tier puzzle action with glowing combo multipliers', 'Premium arcade joystick and backlit pushbuttons', 'Front stereo sound speakers with chrome rings'],
  arcade_leaderboard: ['Massive floor-standing illuminated Hall of Fame scoreboard marquee', 'Multi-line high score matrix with glowing amber/cyan LED text showing player ranks and scores', 'Crown ornament with gold, silver, and bronze trophy emblems', 'Flanking neon pillar lights and polished chrome frame'],
  wardrobe: ['Double-door solid oak wardrobe with recessed panel mouldings', 'Deep carved top cornice and sturdy plinth base with bun feet', 'Ornate brass keyhole escutcheons and teardrop pull handles', 'Wood grain texture on door panels with plank seams'],
  suite_bed: ['King platform bed with upholstered tall headboard with vertical seam channels', 'Crisp white hotel duvet folded neatly with contrasting velvet bed runner', 'Four plump sleeping pillows propped against headboard with center indentations', 'Flanking integrated walnut nightstands with bedside lamps']
};

const completedItems = new Set(CATALOGUE.map(i => i.id));

let md = `# v0.12.4 Art Detail Pass — Master Item Redesign Checklist

Owner feedback: items currently read as flat, smooth single-colour boxes. This release is a **full item-by-item redesign** at **2x pixel density**, lit from top-left with a consistent dark outline (\`#2a1d2e\`), giving every piece authentic texture, defining silhouette features, and material realism.

---

## Category Research & Pixel-Art Techniques

`;

for (const [cat, data] of Object.entries(categoryResearch)) {
  md += `### ${cat.toUpperCase()}\n`;
  for (const t of data.techniques) {
    md += `- ${t}\n`;
  }
  md += `\n`;
}

md += `---

## Master Checklist (${CATALOGUE.length} Catalogue Items)

| # | Item ID | Category | Item Name | 3–5 Defining Features | Status | Before | After |
|---|---|---|---|---|---|---|---|
`;

for (let i = 0; i < CATALOGUE.length; i++) {
  const item = CATALOGUE[i];
  const feats = itemFeatures[item.id] || [
    'Authentic materials with 2x texture detail',
    'Lit from top-left with highlights and deep shadows',
    'Consistent dark outline (#2a1d2e)',
    'Identifiable silhouette at default mobile zoom'
  ];
  const featStr = feats.join('; ');
  const status = completedItems.has(item.id) ? 'Completed' : 'Pending';
  md += `| ${i + 1} | \`${item.id}\` | ${item.category} | ${item.name} | ${featStr} | ${status} | <img src="items/before_${item.id}.png" width="48" height="48" /> | <img src="items/after_${item.id}.png" width="48" height="48" /> |\n`;
}

fs.writeFileSync(path.join(ROOT, 'shots', 'v0124', 'checklist.md'), md);
console.log('Successfully wrote shots/v0124/checklist.md with all', CATALOGUE.length, 'items');
