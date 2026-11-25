// Avatar customization options, presets, and validation for Pixel Hotel v0.9.0.

export const SKIN_TONES = [
  { id: 'pale', name: 'Pale', color: '#ffe0c4' },
  { id: 'peach', name: 'Peach', color: '#ffd9a8' },
  { id: 'warm', name: 'Warm', color: '#f5cba7' },
  { id: 'golden', name: 'Golden', color: '#e0ae7a' },
  { id: 'tan', name: 'Tan', color: '#d99b72' },
  { id: 'bronze', name: 'Bronze', color: '#c98a62' },
  { id: 'chestnut', name: 'Chestnut', color: '#8d5524' },
  { id: 'espresso', name: 'Espresso', color: '#5a3825' },
];

export const EYE_PRESETS = [
  { id: 'classic', name: 'Classic Charcoal', lashes: false, eyeColor: '#2b2230' },
  { id: 'lashes', name: 'Lash Flutter', lashes: true, eyeColor: '#2b2230' },
  { id: 'ocean', name: 'Ocean Blue', lashes: false, eyeColor: '#2e5b88' },
  { id: 'emerald', name: 'Emerald', lashes: false, eyeColor: '#3b7a57' },
  { id: 'amber', name: 'Amber Glow', lashes: false, eyeColor: '#b06822' },
];

export const MOUTH_PRESETS = [
  { id: 'smile', name: 'Smile', mouth: 'smile' },
  { id: 'frown', name: 'Moody', mouth: 'frown' },
  { id: 'open', name: 'Joyful', mouth: 'open' },
  { id: 'lips', name: 'Glamour', mouth: 'lips' },
  { id: 'grin', name: 'Big Grin', mouth: 'grin' },
  { id: 'cat', name: 'Cat Smile', mouth: 'cat' },
];

// v0.14 catalogue: finer face controls. New options are free.
export const EYE_SHAPES = [
  { id: 'round', name: 'Round' },
  { id: 'sparkly', name: 'Sparkly' },
  { id: 'sleepy', name: 'Sleepy' },
  { id: 'sharp', name: 'Sharp' },
];

export const EYE_COLORS = [
  { id: 'charcoal', name: 'Charcoal', color: '#2b2230' },
  { id: 'ocean', name: 'Ocean Blue', color: '#2e5b88' },
  { id: 'emerald', name: 'Emerald', color: '#3b7a57' },
  { id: 'amber', name: 'Amber Glow', color: '#b06822' },
  { id: 'hazel', name: 'Hazel', color: '#7a5a2a' },
  { id: 'violet', name: 'Violet', color: '#6a3fa0' },
  { id: 'grey', name: 'Storm Grey', color: '#5a6878' },
  { id: 'ruby', name: 'Ruby', color: '#a02a3a' },
];

export const BROW_STYLES = [
  { id: 'soft', name: 'Soft' },
  { id: 'thick', name: 'Thick' },
  { id: 'arched', name: 'Arched' },
  { id: 'thin', name: 'Thin' },
];

export const EAR_STYLES = [
  { id: 'normal', name: 'Classic' },
  { id: 'elf', name: 'Pointy Elf' },
  { id: 'hidden', name: 'Hidden' },
];

// Reuses hairstyles from salon chair styling
export const HAIR_STYLES = [
  { id: 'classic', name: 'Classic Short', cost: 0 },
  { id: 'bob', name: 'Bob Cut', cost: 0 },
  { id: 'ponytail', name: 'Ponytail', cost: 0 },
  { id: 'spiky', name: 'Spiky', cost: 0 },
  { id: 'long', name: 'Long Flowing', cost: 0 },
  { id: 'bald', name: 'Minimal Bald', cost: 0 },
  { id: 'curls', name: 'Retro Curls', cost: 25 },
];

// Reuses hair colors from Azure Salon palette
export const HAIR_COLORS = [
  { id: 'chestnut', name: 'Chestnut', color: '#5a3826' },
  { id: 'espresso', name: 'Espresso', color: '#2c221e' },
  { id: 'golden', name: 'Golden', color: '#e6a15c' },
  { id: 'auburn', name: 'Auburn', color: '#b83828' },
  { id: 'ocean', name: 'Ocean', color: '#4aa3df' },
  { id: 'rose', name: 'Rose', color: '#e75480' },
  { id: 'lavender', name: 'Lavender', color: '#b088f0' },
  { id: 'silver', name: 'Silver', color: '#e4e4ea' },
];

export const TOP_STYLES = [
  { id: 'tee', name: 'Classic Tee', outfit: 'tee', cost: 0 },
  { id: 'cardigan', name: 'Knit Cardigan', outfit: 'cardigan', cost: 20 },
  { id: 'hoodie', name: 'Cosy Hoodie', outfit: 'hoodie', cost: 30 },
  { id: 'bellhop', name: 'Hotel Jacket', outfit: 'bellhop', cost: 35 },
  { id: 'labcoat', name: 'Smart Coat', outfit: 'labcoat', cost: 25 },
  { id: 'dress', name: 'Summer Dress', outfit: 'dress', cost: 30 },
  { id: 'tank', name: 'Tank Top', outfit: 'tank', cost: 0 },
  { id: 'sweater', name: 'Striped Sweater', outfit: 'sweater', cost: 0 },
  { id: 'suit', name: 'Sharp Suit', outfit: 'suit', cost: 0 },
];

export const TOP_COLORS = [
  { id: 'sky', name: 'Sky Blue', color: '#4da3ff' },
  { id: 'crimson', name: 'Crimson', color: '#e04a4a' },
  { id: 'emerald', name: 'Emerald', color: '#38b068' },
  { id: 'amber', name: 'Amber Gold', color: '#f6b834' },
  { id: 'purple', name: 'Royal Purple', color: '#8c52ff' },
  { id: 'rose', name: 'Pastel Rose', color: '#ff7fa3' },
  { id: 'white', name: 'Pure White', color: '#f4f6fa' },
  { id: 'onyx', name: 'Charcoal Onyx', color: '#282b34' },
];

export const BOTTOM_STYLES = [
  { id: 'pants', name: 'Trousers', skirt: false, cost: 0 },
  { id: 'skirt', name: 'Tailored Skirt', skirt: true, cost: 20 },
  { id: 'shorts', name: 'Shorts', skirt: false, cost: 0 },
];

export const SHOE_STYLES = [
  { id: 'sneakers', name: 'Sneakers' },
  { id: 'boots', name: 'Boots' },
];

export const BOTTOM_COLORS = [
  { id: 'denim', name: 'Navy Denim', color: '#2c3e63' },
  { id: 'charcoal', name: 'Charcoal', color: '#1e222a' },
  { id: 'khaki', name: 'Khaki Tan', color: '#5c4838' },
  { id: 'cream', name: 'Cream Linen', color: '#e8e4dc' },
  { id: 'forest', name: 'Forest Green', color: '#2d5038' },
  { id: 'plum', name: 'Deep Plum', color: '#5c2c48' },
];

export const SHOE_COLORS = [
  { id: 'white', name: 'White Kicks', color: '#f4f4f4', cost: 0 },
  { id: 'black', name: 'Black Leather', color: '#2a2030', cost: 0 },
  { id: 'brown', name: 'Brown Loafers', color: '#5c3824', cost: 0 },
  { id: 'red', name: 'Red Sneakers', color: '#ff5252', cost: 15 },
  { id: 'blue', name: 'Blue Trainers', color: '#4aa3df', cost: 15 },
  { id: 'gold', name: 'Golden Soles', color: '#f6c667', cost: 25 },
];

export const ACCESSORY_STYLES = [
  { id: 'none', name: 'None', cost: 0 },
  { id: 'glasses', name: 'Glasses', cost: 20 },
  { id: 'cap', name: 'Baseball Cap', cost: 25 },
  { id: 'headphones', name: 'Headphones', cost: 30 },
  { id: 'sunglasses', name: 'Sunglasses', cost: 0 },
  { id: 'beanie', name: 'Beanie', cost: 0 },
  { id: 'bow', name: 'Hair Bow', cost: 0 },
  { id: 'earrings', name: 'Earrings', cost: 0 },
];

export const ACCESSORY_COLORS = [
  { id: 'onyx', name: 'Midnight Onyx', color: '#2a2030' },
  { id: 'crimson', name: 'Ruby Crimson', color: '#e04a4a' },
  { id: 'cyan', name: 'Neon Cyan', color: '#38c5ff' },
  { id: 'gold', name: 'Burnished Gold', color: '#f6c667' },
  { id: 'white', name: 'Chalk White', color: '#ffffff' },
  { id: 'purple', name: 'Ultraviolet', color: '#8c52ff' },
];

export const DEFAULT_PLAYER_LOOK = {
  skin: '#ffd9a8',
  hair: '#5a3826',
  hairStyle: 'classic',
  eye: '#2b2230',
  mouth: 'smile',
  brow: '#4a2f20',
  lashes: false,
  eyeShape: 'round',
  browStyle: 'soft',
  ears: 'normal',
  freckles: false,
  blush: true,
  shirt: '#4da3ff',
  outfit: 'tee',
  pants: '#2c3e63',
  skirt: false,
  bottom: 'pants',
  shoe: '#f4f4f4',
  shoeStyle: 'sneakers',
  accessory: 'none',
  accessoryColor: '#2a2030',
};

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function isValidHexColor(c) {
  return typeof c === 'string' && HEX_COLOR_RE.test(c);
}

const VALID_HAIR_STYLES = new Set(['classic', 'short', 'bob', 'ponytail', 'spiky', 'curls', 'long', 'bald']);
const VALID_MOUTHS = new Set(MOUTH_PRESETS.map((m) => m.mouth));
const VALID_OUTFITS = new Set(TOP_STYLES.map((t) => t.outfit));
const VALID_ACCESSORIES = new Set(ACCESSORY_STYLES.map((a) => a.id));
const VALID_EYE_SHAPES = new Set(EYE_SHAPES.map((e) => e.id));
const VALID_BROWS = new Set(BROW_STYLES.map((b) => b.id));
const VALID_EARS = new Set(EAR_STYLES.map((e) => e.id));
const VALID_BOTTOMS = new Set(BOTTOM_STYLES.map((b) => b.id));
const VALID_SHOE_STYLES = new Set(SHOE_STYLES.map((s) => s.id));

/**
 * Validates and sanitizes an avatar look object received from peers or storage.
 * Ensures peers can only send known option IDs and safe hex colors.
 */
export function validateAvatarLook(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const skin = isValidHexColor(raw.skin) ? raw.skin : DEFAULT_PLAYER_LOOK.skin;
  const hair = isValidHexColor(raw.hair || raw.hairColor)
    ? (raw.hair || raw.hairColor)
    : DEFAULT_PLAYER_LOOK.hair;
  const hairStyle = VALID_HAIR_STYLES.has(raw.hairStyle)
    ? (raw.hairStyle === 'short' ? 'classic' : raw.hairStyle)
    : DEFAULT_PLAYER_LOOK.hairStyle;
  const eye = isValidHexColor(raw.eye) ? raw.eye : DEFAULT_PLAYER_LOOK.eye;
  const mouth = VALID_MOUTHS.has(raw.mouth) ? raw.mouth : DEFAULT_PLAYER_LOOK.mouth;
  const brow = isValidHexColor(raw.brow) ? raw.brow : DEFAULT_PLAYER_LOOK.brow;
  const lashes = Boolean(raw.lashes);
  const shirt = isValidHexColor(raw.shirt) ? raw.shirt : DEFAULT_PLAYER_LOOK.shirt;
  const outfit = VALID_OUTFITS.has(raw.outfit) ? raw.outfit : DEFAULT_PLAYER_LOOK.outfit;
  const pants = isValidHexColor(raw.pants) ? raw.pants : DEFAULT_PLAYER_LOOK.pants;
  // bottom style; older saves only had the skirt flag
  const bottom = VALID_BOTTOMS.has(raw.bottom) ? raw.bottom : (raw.skirt ? 'skirt' : 'pants');
  const skirt = bottom === 'skirt';
  const shoe = isValidHexColor(raw.shoe) ? raw.shoe : DEFAULT_PLAYER_LOOK.shoe;
  const shoeStyle = VALID_SHOE_STYLES.has(raw.shoeStyle) ? raw.shoeStyle : DEFAULT_PLAYER_LOOK.shoeStyle;
  const eyeShape = VALID_EYE_SHAPES.has(raw.eyeShape) ? raw.eyeShape : DEFAULT_PLAYER_LOOK.eyeShape;
  const browStyle = VALID_BROWS.has(raw.browStyle) ? raw.browStyle : DEFAULT_PLAYER_LOOK.browStyle;
  const ears = VALID_EARS.has(raw.ears) ? raw.ears : DEFAULT_PLAYER_LOOK.ears;
  const freckles = Boolean(raw.freckles);
  const blush = raw.blush === undefined ? DEFAULT_PLAYER_LOOK.blush : Boolean(raw.blush);
  const accessory = VALID_ACCESSORIES.has(raw.accessory)
    ? raw.accessory
    : (raw.glasses ? 'glasses' : 'none');
  const accessoryColor = isValidHexColor(raw.accessoryColor)
    ? raw.accessoryColor
    : DEFAULT_PLAYER_LOOK.accessoryColor;

  return {
    skin,
    hair,
    hairStyle,
    eye,
    mouth,
    brow,
    lashes,
    eyeShape,
    browStyle,
    ears,
    freckles,
    blush,
    shirt,
    outfit,
    pants,
    skirt,
    bottom,
    shoe,
    shoeStyle,
    accessory,
    accessoryColor,
  };
}

/** Generates a randomized look using available free or unlocked options. */
export function randomizeLook(unlocked = []) {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const isAvailable = (item, prefix) => !item.cost || unlocked.includes(`${prefix}:${item.id}`);

  const skin = pick(SKIN_TONES).color;
  const eyePreset = pick(EYE_PRESETS);
  const mouthPreset = pick(MOUTH_PRESETS);

  const availHairs = HAIR_STYLES.filter((h) => isAvailable(h, 'hair'));
  const hairStyle = pick(availHairs.length ? availHairs : HAIR_STYLES.slice(0, 4)).id;
  const hair = pick(HAIR_COLORS).color;

  const availTops = TOP_STYLES.filter((t) => isAvailable(t, 'top'));
  const topDef = pick(availTops.length ? availTops : TOP_STYLES.slice(0, 2));
  const shirt = pick(TOP_COLORS).color;

  const availBottoms = BOTTOM_STYLES.filter((b) => isAvailable(b, 'bottom'));
  const bottomDef = pick(availBottoms.length ? availBottoms : BOTTOM_STYLES.slice(0, 1));
  const pants = pick(BOTTOM_COLORS).color;

  const availShoes = SHOE_COLORS.filter((s) => isAvailable(s, 'shoe'));
  const shoe = pick(availShoes.length ? availShoes : SHOE_COLORS.slice(0, 3)).color;

  const availAcc = ACCESSORY_STYLES.filter((a) => isAvailable(a, 'accessory'));
  const accessory = pick(availAcc.length ? availAcc : ACCESSORY_STYLES.slice(0, 1)).id;
  const accessoryColor = pick(ACCESSORY_COLORS).color;

  return {
    skin,
    hair,
    hairStyle,
    eye: pick(EYE_COLORS).color,
    mouth: mouthPreset.mouth,
    brow: '#4a2f20',
    lashes: Math.random() < 0.4 || eyePreset.lashes,
    eyeShape: pick(EYE_SHAPES).id,
    browStyle: pick(BROW_STYLES).id,
    ears: pick(EAR_STYLES).id,
    freckles: Math.random() < 0.25,
    blush: Math.random() < 0.7,
    shirt,
    outfit: topDef.outfit,
    pants,
    skirt: bottomDef.id === 'skirt',
    bottom: bottomDef.id,
    shoe,
    shoeStyle: pick(SHOE_STYLES).id,
    accessory,
    accessoryColor,
  };
}
