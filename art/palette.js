// Master palette. Every sprite draws from these ramps (highlight -> outline)
// so the whole hotel shares one colour language. Warm, slightly desaturated
// "boutique hotel at golden hour" mood; shadows lean purple, never grey-black.

export const INK = '#1e1428'; // darkest outline / eye ink

export const RAMPS = {
  // neutrals
  cream: ['#fbf4e6', '#efe2c9', '#dcc9a9', '#bfa784', '#8d7660'],
  stone: ['#e9e4dc', '#cfc7bc', '#aea398', '#857a72', '#564d52'],
  plum: ['#8c6f9e', '#6a5281', '#4d3a63', '#352847', '#1e1428'],
  // materials
  walnut: ['#c58b5a', '#a66a3f', '#83502f', '#5f3824', '#3b2219'],
  brass: ['#fff1a8', '#f2cd5c', '#d9a23a', '#a8722a', '#6e4520'],
  chrome: ['#ffffff', '#dfe8ee', '#b6c3cf', '#7f8fa3', '#4a5468'],
  glass: ['#eaffff', '#bfe8f2', '#8fc9de', '#5c97b8', '#38608a'],
  // fabrics / accents
  berry: ['#f08aa0', '#d65a7a', '#ad3d62', '#7e2a4e', '#4e1d3a'],
  teal: ['#8fe3d8', '#4fc2b8', '#2f9a99', '#1f6e78', '#174554'],
  moss: ['#b8dc7a', '#7fbf4f', '#4f9440', '#356a36', '#22422a'],
  // water
  water: ['#c9f6ff', '#7fe0f0', '#3cbdd9', '#2390bb', '#1b5f8f'],
  // walls
  wallpaper: ['#f6dcc0', '#ecc6a2', '#d9a985', '#b8846a', '#7f5552'],
  wainscot: ['#a8705a', '#8c5745', '#704236', '#52302b', '#341d1f'],
};

// Accessors: r(name)[0] highlight, [1] light, [2] base, [3] shade, [4] outline
export const r = (name) => RAMPS[name];

// Grey ramp used for runtime-tinted character layers (skin, hair, clothes).
// The renderer multiplies these by the wardrobe colour, so 0xde (base) maps
// to the chosen colour and the rest become its highlight/shade/outline.
export const TINT = {
  hi: '#ffffff',
  base: '#dedede',
  shade: '#aaaaaa',
  deep: '#7a7a7a',
  line: '#474747',
};
