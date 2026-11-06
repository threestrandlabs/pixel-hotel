// Pure seed content for Pixel Hotel. No DOM/canvas access here — safe for Node tests.

export const TILE = {
  FLOOR: 0,
  WALL: 1,
  DOOR: 2,
  WINDOW: 3,
};

export const SAVE_VERSION = 1;

// Grid is row-major: grid[y][x]
function makeRoomGrid(w, h, { doors = [], windows = [] } = {}) {
  const grid = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      let cell = TILE.FLOOR;
      if (y === 0 || x === 0) cell = TILE.WALL;
      row.push(cell);
    }
    grid.push(row);
  }
  for (const d of doors) grid[d.y][d.x] = TILE.DOOR;
  for (const win of windows) grid[win.y][win.x] = TILE.WINDOW;
  return grid;
}

export const ROOMS = {
  lobby: {
    id: 'lobby',
    name: 'Grand Lobby',
    width: 12,
    height: 9,
    grid: makeRoomGrid(12, 9, {
      doors: [{ x: 6, y: 0 }],
      windows: [{ x: 2, y: 0 }, { x: 9, y: 0 }, { x: 0, y: 3 }, { x: 0, y: 6 }],
    }),
    spawn: { x: 6, y: 2 },
    doors: [{ x: 6, y: 0, to: 'rooftop', toTile: { x: 4, y: 5 } }],
  },
  rooftop: {
    id: 'rooftop',
    name: 'Rooftop Lounge',
    width: 10,
    height: 8,
    grid: makeRoomGrid(10, 8, {
      doors: [{ x: 4, y: 0 }],
      windows: [{ x: 1, y: 0 }, { x: 7, y: 0 }, { x: 0, y: 2 }, { x: 0, y: 5 }],
    }),
    spawn: { x: 4, y: 2 },
    doors: [{ x: 4, y: 0, to: 'lobby', toTile: { x: 6, y: 2 } }],
  },
};

// Furniture catalogue. footprint is {w,h} in tiles (pre-rotation). seat items
// define sitDir, the facing direction an avatar takes once seated (relative,
// rotates with the item's `rot`).
export const CATALOGUE = [
  {
    id: 'stool',
    name: 'Pixel Stool',
    price: 15,
    category: 'seat',
    footprint: { w: 1, h: 1 },
    seat: true,
    spriteKey: 'stool',
    unlockRequires: null,
    description: 'A sturdy four-legged wooden stool with tufted leather cushion.',
  },
  {
    id: 'sofa',
    name: 'Cosy Sofa',
    price: 45,
    category: 'seat',
    footprint: { w: 2, h: 1 },
    seat: true,
    spriteKey: 'sofa',
    unlockRequires: null,
    description: 'A cosy two-seater lounge sofa upholstered in plush berry fabric.',
  },
  {
    id: 'rooftop_sofa',
    name: 'Rooftop Sofa',
    price: 60,
    category: 'seat',
    footprint: { w: 2, h: 1 },
    seat: true,
    spriteKey: 'rooftopSofa',
    unlockRequires: null,
    description: 'An outdoor poolside two-seater sofa in vibrant azure canvas.',
  },
  {
    id: 'lamp',
    name: 'Lava Lamp',
    price: 20,
    category: 'decor',
    footprint: { w: 1, h: 1 },
    seat: false,
    spriteKey: 'lamp',
    unlockRequires: null,
    description: 'A retro brushed-chrome lava lamp with glowing thermal wax.',
  },
  {
    id: 'plant',
    name: 'Potted Fern',
    price: 10,
    category: 'decor',
    footprint: { w: 1, h: 1 },
    seat: false,
    spriteKey: 'plant',
    unlockRequires: null,
    description: 'A potted tropical fern in a terracotta planter with lush fronds.',
  },
  {
    id: 'rug',
    name: 'Starburst Rug',
    price: 25,
    category: 'decor',
    footprint: { w: 2, h: 2 },
    seat: false,
    spriteKey: 'rug',
    flat: true, // floor decor: walkable, drawn under avatars, may sit under other items
    unlockRequires: 'quest_greet',
    description: 'A woven geometric starburst floor rug with crimson and gold accents.',
  },
  {
    id: 'neon_sign',
    name: 'Neon "HOTEL" Sign',
    price: 35,
    category: 'decor',
    footprint: { w: 1, h: 1 },
    seat: false,
    spriteKey: 'neonSign',
    unlockRequires: 'quest_place',
    description: 'A glowing art-deco electric neon sign mounted on an iron frame.',
  },
  {
    id: 'jukebox',
    name: 'Pixel Jukebox',
    price: 80,
    category: 'decor',
    footprint: { w: 1, h: 1 },
    seat: false,
    spriteKey: 'jukebox',
    unlockRequires: 'quest_sit',
    description: 'A vintage bubble-tube jukebox loaded with classic hotel tunes.',
  },
  { id: 'armchair', name: 'Plush Armchair', price: 30, category: 'seat', footprint: { w: 1, h: 1 }, seat: true, spriteKey: 'armchair', unlockRequires: null, description: 'A deep-seated plush wingback armchair in warm amber velvet.' },
  { id: 'deckchair', name: 'Striped Deckchair', price: 35, category: 'seat', footprint: { w: 1, h: 1 }, seat: true, spriteKey: 'deckchair', unlockRequires: null, description: 'A folding beechwood sun lounger with cheerful striped canvas.' },
  { id: 'reception_desk', name: 'Reception Desk', price: 70, category: 'decor', footprint: { w: 3, h: 1 }, seat: false, spriteKey: 'receptionDesk', unlockRequires: null, description: 'A polished mahogany reception counter with brass service bell.' },
  { id: 'bookshelf', name: 'Tall Bookshelf', price: 55, category: 'decor', footprint: { w: 2, h: 1 }, seat: false, spriteKey: 'bookshelf', unlockRequires: null, description: 'A tall timber bookcase packed with travelogues and hotel ledgers.' },
  { id: 'bar_counter', name: 'Rooftop Bar', price: 75, category: 'decor', footprint: { w: 3, h: 1 }, seat: false, spriteKey: 'barCounter', unlockRequires: null, description: 'A teak cocktail bar counter stocked with glassware and spirits.' },
  { id: 'string_lights', name: 'String Light Post', price: 25, category: 'decor', footprint: { w: 1, h: 1 }, seat: false, spriteKey: 'stringLights', unlockRequires: null, description: 'A wrought-iron lantern post draped with glowing festive bulbs.' },
  // Original v0.3.0 collection
  { id: 'aquarium', name: 'Luminous Reef Tank', price: 70, category: 'decor', footprint: { w: 2, h: 1 }, seat: false, spriteKey: 'aquarium', unlockRequires: null, description: 'Deep oceanic aquarium with luminous corals and darting neon clownfish.' },
  { id: 'boba_bar', name: 'Tea-Pearl Boba Bar', price: 65, category: 'decor', footprint: { w: 2, h: 1 }, seat: false, spriteKey: 'bobaBar', unlockRequires: null, description: 'Specialty counter brewing brown-sugar tapioca milk teas with shaker machine.' },
  { id: 'mini_arcade', name: 'Retro Pixel Arcade', price: 85, category: 'decor', footprint: { w: 1, h: 1 }, seat: false, spriteKey: 'miniArcade', unlockRequires: null, description: 'Upright coin-op arcade cabinet running the classic "Cosmic Bellhop" game.' },
  { id: 'noodle_cart', name: 'Midnight Noodle Cart', price: 90, category: 'decor', footprint: { w: 2, h: 1 }, seat: false, spriteKey: 'noodleCart', unlockRequires: null, description: 'Traditional street vendor cart with steaming broth vat, ladles and red lantern.' },
  { id: 'karaoke_machine', name: 'Star Stage Karaoke', price: 75, category: 'decor', footprint: { w: 1, h: 1 }, seat: false, spriteKey: 'karaokeMachine', unlockRequires: null, description: 'Digital karaoke kiosk with twin microphones, equalizer display and disco floor.' },
  { id: 'telescope', name: 'Stargazer Telescope', price: 50, category: 'decor', footprint: { w: 1, h: 1 }, seat: false, spriteKey: 'telescope', unlockRequires: null, description: 'Heavy brass astronomical refractor on an equatorial wooden tripod mount.' },
  { id: 'koi_pond', name: 'Zen Koi Stone Pond', price: 80, category: 'decor', footprint: { w: 2, h: 2 }, seat: false, spriteKey: 'koiPond', unlockRequires: null, description: 'Carved slate floor water garden with floating lily pads and swimming calico koi.' },
  { id: 'capsule_dispenser', name: 'Gachapon Capsule Toy', price: 40, category: 'decor', footprint: { w: 1, h: 1 }, seat: false, spriteKey: 'capsuleDispenser', unlockRequires: null, description: 'Retro Japanese twin-globe prize capsule dispenser with coin turn keys.' },
];

export function getCatalogueItem(id) {
  return CATALOGUE.find((c) => c.id === id) || null;
}

// Furnishings a brand-new game starts with (old saves keep their own rooms).
// Keep the door-approach tiles, spawn points and NPC homes free; tests verify it.
// rot: 0 faces down, 1 right, 2 up, 3 left (seats); 2-wide items turn 1x2 on odd rot.
export const SEED_FURNITURE = {
  lobby: [
    { itemId: 'reception_desk', x: 8, y: 2, rot: 0 },
    { itemId: 'stool', x: 9, y: 3, rot: 0 },
    { itemId: 'bookshelf', x: 1, y: 4, rot: 1 },
    { itemId: 'rug', x: 3, y: 4, rot: 0 },
    { itemId: 'sofa', x: 3, y: 3, rot: 0 },
    { itemId: 'armchair', x: 2, y: 5, rot: 1 },
    { itemId: 'armchair', x: 5, y: 5, rot: 3 },
    { itemId: 'lamp', x: 5, y: 3, rot: 0 },
    { itemId: 'lamp', x: 1, y: 7, rot: 0 },
    { itemId: 'plant', x: 5, y: 1, rot: 0 },
    { itemId: 'plant', x: 7, y: 1, rot: 0 },
    { itemId: 'plant', x: 1, y: 1, rot: 0 },
    { itemId: 'plant', x: 11, y: 8, rot: 0 },
  ],
  rooftop: [
    { itemId: 'bar_counter', x: 7, y: 1, rot: 0 },
    { itemId: 'stool', x: 7, y: 2, rot: 0 },
    { itemId: 'stool', x: 8, y: 2, rot: 0 },
    { itemId: 'rug', x: 2, y: 4, rot: 0 },
    { itemId: 'rooftop_sofa', x: 2, y: 3, rot: 0 },
    { itemId: 'deckchair', x: 5, y: 4, rot: 3 },
    { itemId: 'deckchair', x: 5, y: 5, rot: 3 },
    { itemId: 'string_lights', x: 1, y: 1, rot: 0 },
    { itemId: 'string_lights', x: 5, y: 1, rot: 0 },
    { itemId: 'string_lights', x: 9, y: 7, rot: 0 },
    { itemId: 'plant', x: 1, y: 7, rot: 0 },
    { itemId: 'plant', x: 9, y: 4, rot: 0 },
    { itemId: 'lamp', x: 6, y: 6, rot: 0 },
  ],
};

// NPCs: original cosy-hotel cast with personalities, idle ambient lines and
// keyword-triggered responses.
export const NPCS = [
  {
    id: 'mochi',
    name: 'Mochi',
    color: '#ff9fc7',
    personality: 'cheerful bellhop',
    room: 'lobby',
    home: { x: 4, y: 4 },
    greetLines: ["Hiya! Welcome to the hotel!", "Oh hello there, friend!"],
    ambientLines: [
      'Did you know the elevator hums in F major?',
      'I polished every brass button twice today!',
      'Rooftop sunsets are the best around 6pm.',
    ],
    keywords: {
      hello: ["Hiya! Welcome to the hotel!", 'So nice to see a new face!'],
      quest: ['Try chatting with a few other guests — that always brightens their day!'],
      coins: ['Coins jingle nicest in a full pocket, don\'t you think?'],
      room: ['The Rooftop Lounge has the comfiest sofas, just saying.'],
      bye: ['Safe travels! Come back soon!'],
      help: ['Click a tile to walk, or click a seat to sit. Type to chat!'],
      dance: ['I wish I could dance, but my feet are stuck polishing floors!'],
    },
  },
  {
    id: 'gus',
    name: 'Gus',
    color: '#8fa6c7',
    personality: 'grumpy old guest',
    room: 'lobby',
    home: { x: 9, y: 5 },
    greetLines: ['Eh? Oh. Hello, I suppose.', "Hmph. Didn't see you there."],
    ambientLines: [
      "Back in my day we didn't need pixels to have fun.",
      'This lobby carpet has seen better decades.',
      "I've been waiting for the lift for eleven years.",
    ],
    keywords: {
      hello: ['Eh? Oh. Hello, I suppose.', 'Hmph. Hello.'],
      quest: ['Quests, schmests. Though the rewards are decent, I admit.'],
      coins: ['Hold onto your coins. Prices only go up.'],
      room: ['The rooftop is too breezy for my joints.'],
      bye: ['Finally. Off you go then.'],
      help: ["Figure it out yourself — oh fine, click tiles to walk."],
      weather: ['Weather\'s always the same in here. Stuffy.'],
    },
  },
  {
    id: 'drpix',
    name: 'Dr. Pix',
    color: '#b6ff9f',
    personality: 'eccentric scientist guest',
    room: 'rooftop',
    home: { x: 6, y: 3 },
    greetLines: ['Ah, a new test subject— I mean, friend! Hello!', 'Salutations! Fascinating timing.'],
    ambientLines: [
      "I'm calculating the optimal angle for sofa-based relaxation.",
      "My latest invention: a lamp that lavas. Revolutionary.",
      'The pixels up here are 23% shinier. I measured.',
    ],
    keywords: {
      hello: ['Ah, hello! Delighted by this encounter!'],
      quest: ['My research suggests completing quests yields... coins! Try it.'],
      coins: ['Currency is just encoded trust. Fascinating stuff.'],
      room: ['The lobby lacks my lab equipment, tragically.'],
      bye: ['Farewell! Mind the gravity on your way out.'],
      help: ['Walk by clicking. Sit by clicking seats. Science!'],
      invention: ['My next invention will be a self-polishing shoe. Mark my words.'],
    },
  },
  {
    id: 'lola',
    name: 'Lola',
    color: '#ffe08a',
    personality: 'lounge singer',
    room: 'rooftop',
    home: { x: 2, y: 5 },
    greetLines: ['Well hello, darling~', 'Oh, a new audience member!'],
    ambientLines: [
      'Humming a little tune under these string lights...',
      'I wrote a song about elevators once. It flopped.',
      'The rooftop acoustics are simply divine tonight.',
    ],
    keywords: {
      hello: ['Well hello, darling~'],
      quest: ['A quest? How dramatic. I love it.'],
      coins: ['Coins, schmoins — it\'s the applause I\'m after.'],
      room: ['Do visit the lobby, the chandelier is divine.'],
      bye: ['Ta-ta, darling. Encore anytime.'],
      help: ['Click to walk, click a seat to sit, type to chat. Simple as a scale.'],
      sing: ['*hums a soft pixelated melody*'],
      dance: ['Ooh, a dance request! *twirls*'],
    },
  },
];

export const QUESTS = [
  {
    id: 'quest_greet',
    title: 'Friendly Face',
    description: 'Say hello to 3 different guests.',
    type: 'greet',
    target: 3,
    reward: { coins: 40, unlock: 'rug' },
  },
  {
    id: 'quest_place',
    title: 'Interior Decorator',
    description: 'Place 2 furniture items in a room.',
    type: 'place',
    target: 2,
    reward: { coins: 50, unlock: 'neon_sign' },
  },
  {
    id: 'quest_sit',
    title: 'Rooftop Relaxation',
    description: 'Sit on the Rooftop Sofa.',
    type: 'sit',
    target: 1,
    reward: { coins: 60, unlock: 'jukebox' },
  },
  {
    id: 'quest_visit',
    title: 'Grand Tour',
    description: 'Visit both the Lobby and the Rooftop Lounge.',
    type: 'visit',
    target: 2,
    reward: { coins: 30, unlock: null },
  },
];

export const STARTING_COINS = 80;
