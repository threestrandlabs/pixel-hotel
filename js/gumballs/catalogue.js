// Pure data for Pixel Hotel v0.8.10 Gumball collection. No DOM access here —
// safe for Node tests. Probabilities are fractions of 1 (not percent) and
// must sum to exactly 1 across GUMBALL_CATALOGUE (asserted in tests).

export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'special', 'legendary'];

export const RARITY_LABELS = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  special: 'Special',
  legendary: 'Legendary',
};

const COMMON_P = 0.45 / 6;
const UNCOMMON_P = 0.25 / 4;
const RARE_P = 0.17 / 3;
const SPECIAL_P = 0.02;
const LEGENDARY_P = 0.01;

export const GUMBALL_CATALOGUE = [
  // Common — 45% total, 7.5% each
  { id: 'common_red', name: 'Red', rarity: 'common', p: COMMON_P, colorA: '#ff4d4d', colorB: '#a81f1f', flavor: 'Classic cherry-red, the one every machine starts with.' },
  { id: 'common_orange', name: 'Orange', rarity: 'common', p: COMMON_P, colorA: '#ff9a3d', colorB: '#c4601a', flavor: 'Bright citrus orange, zesty and familiar.' },
  { id: 'common_yellow', name: 'Yellow', rarity: 'common', p: COMMON_P, colorA: '#ffe14d', colorB: '#c9a316', flavor: 'Sunshine yellow with a sugary lemon tang.' },
  { id: 'common_green', name: 'Green', rarity: 'common', p: COMMON_P, colorA: '#5cd65c', colorB: '#2a9d2a', flavor: 'Crisp apple green, always a safe pick.' },
  { id: 'common_blue', name: 'Blue', rarity: 'common', p: COMMON_P, colorA: '#4d8dff', colorB: '#1d58c4', flavor: 'Cool berry blue, smooth and simple.' },
  { id: 'common_pink', name: 'Pink', rarity: 'common', p: COMMON_P, colorA: '#ff7acc', colorB: '#c43d93', flavor: 'Bubblegum pink, sweet as it looks.' },

  // Uncommon — 25% total, 6.25% each
  { id: 'uncommon_mango_swirl', name: 'Mango Swirl', rarity: 'uncommon', p: UNCOMMON_P, colorA: '#ffb347', colorB: '#fff066', flavor: 'Swirled mango and cream, a little fancier than the basics.' },
  { id: 'uncommon_grape_twist', name: 'Grape Twist', rarity: 'uncommon', p: UNCOMMON_P, colorA: '#9d5cff', colorB: '#5e2ca8', flavor: 'Two-tone grape twist with a tart little kick.' },
  { id: 'uncommon_mint_chip', name: 'Mint Chip', rarity: 'uncommon', p: UNCOMMON_P, colorA: '#7ef2c3', colorB: '#2fae82', flavor: 'Cool mint speckled with tiny chocolate flecks.' },
  { id: 'uncommon_bubblegum_sparkle', name: 'Bubblegum Sparkle', rarity: 'uncommon', p: UNCOMMON_P, colorA: '#ff9ad6', colorB: '#ff5cb3', flavor: 'Glittery bubblegum pink that catches the light.' },

  // Rare — 17% total, ~5.67% each
  { id: 'rare_ruby', name: 'Ruby', rarity: 'rare', p: RARE_P, colorA: '#ff2e5b', colorB: '#8c0025', flavor: 'Deep gem-red with a glassy, faceted shine.' },
  { id: 'rare_sapphire', name: 'Sapphire', rarity: 'rare', p: RARE_P, colorA: '#2e6bff', colorB: '#0a2e8c', flavor: 'Rich gem-blue, polished to a mirror gleam.' },
  { id: 'rare_emerald', name: 'Emerald', rarity: 'rare', p: RARE_P, colorA: '#2eff8c', colorB: '#0a8c3e', flavor: 'Vivid gem-green with facets of light inside.' },

  // Special — 12% total, 2% each
  {
    id: 'special_catch_ball', name: 'Catch Ball', rarity: 'special', p: SPECIAL_P,
    colorA: '#e8453f', colorB: '#f5f5f0', special: true,
    flavor: 'Red top, white bottom, a black band and a button on top — a nostalgic nod to classic capture gear.',
  },
  {
    id: 'special_galaxy_swirl', name: 'Galaxy Swirl', rarity: 'special', p: SPECIAL_P,
    colorA: '#2b1550', colorB: '#8a4fff', special: true,
    flavor: 'A swirl of midnight purple and starry flecks, like a pocket nebula.',
  },
  {
    id: 'special_rainbow_prism', name: 'Rainbow Prism', rarity: 'special', p: SPECIAL_P,
    colorA: '#ff5c5c', colorB: '#5c9dff', special: true,
    flavor: 'Every color bends through this one depending on the light.',
  },
  {
    id: 'special_glow_dark', name: 'Glow-in-the-Dark', rarity: 'special', p: SPECIAL_P,
    colorA: '#d4ffb3', colorB: '#7fdb6a', special: true,
    flavor: 'Pale by day, softly luminous once the lights go down.',
  },
  {
    id: 'special_durian_king', name: 'Durian King', rarity: 'special', p: SPECIAL_P,
    colorA: '#8bc34a', colorB: '#4a7a1e', special: true,
    flavor: 'Spiky green rind, famously an acquired taste — handle with care.',
  },
  {
    id: 'special_merlion_pearl', name: 'Merlion Pearl', rarity: 'special', p: SPECIAL_P,
    colorA: '#f0f6ff', colorB: '#b8d4f0', special: true,
    flavor: 'Shimmering pearl-white with a faint lion-and-fish sheen.',
  },

  // Legendary — 1% total
  {
    id: 'legendary_golden', name: 'Golden Gumball', rarity: 'legendary', p: LEGENDARY_P,
    colorA: '#ffe066', colorB: '#c9971a', special: true, legendary: true,
    flavor: 'Solid gold, impossibly rare. Collectors talk about it in whispers.',
  },
];

export const TOTAL_GUMBALLS = GUMBALL_CATALOGUE.length;

export function getGumball(id) {
  return GUMBALL_CATALOGUE.find((g) => g.id === id) || null;
}

export function gumballsByRarity(rarity) {
  return GUMBALL_CATALOGUE.filter((g) => g.rarity === rarity);
}

/** Expected-value weight for trading: rarer gumballs are worth more. */
export function gumballValue(id) {
  const g = getGumball(id);
  return g ? 1 / g.p : 0;
}
