// Appearance presets for the player default and every NPC (keyed by the
// NPC's spriteKey). Colours feed the tinted character layers in the renderer.

export const LOOKS = {
  player: {
    skin: '#f0c49a', hair: '#5a3826', hairStyle: 'short', eye: '#1b1230', brow: '#1b1230', mouth: 'smile',
    shirt: '#4da3ff', outfit: 'tee', pants: '#2c3e63', shoe: '#f4f4f4',
  },
  mochi: { // cheerful bellhop: pink jacket, gold buttons, pillbox hat
    skin: '#ffdcb4', hair: '#4a2c2a', hairStyle: 'bob', eye: '#1b1230', brow: '#4a2c2a', mouth: 'smile',
    shirt: '#ff9fc7', outfit: 'bellhop', gold: '#f6c667', cuff: '#f6c667', hat: true, pants: '#6b3a55', shoe: '#2a2030',
  },
  gus: { // grumpy old guest: bald top, white hair/mustache, glasses, cardigan
    skin: '#f0c8a0', hair: '#e4e4ea', hairStyle: 'bald', eye: '#1b1230', brow: '#d0d0d8', mouth: 'frown',
    shirt: '#7f93b3', under: '#f1e8d2', outfit: 'cardigan', belly: true, mustache: true, glasses: true,
    pants: '#6b5a48', shoe: '#4a3a2e',
  },
  drpix: { // eccentric scientist: lab coat, wild hair, goggles
    skin: '#ffe0c0', hair: '#c4b5fd', hairStyle: 'spiky', eye: '#1b1230', brow: '#6d6698', mouth: 'open',
    shirt: '#f4f7f2', under: '#5fcf7a', outfit: 'labcoat', goggles: true, skirt: true,
    pants: '#3f5b4a', shoe: '#e8e8e8',
  },
  lola: { // lounge singer: gold gown, long plum hair, flower
    skin: '#c98a62', hair: '#5b2a6e', hairStyle: 'long', eye: '#1b1230', brow: '#3a1c48', mouth: 'lips', lashes: true,
    shirt: '#ffe08a', outfit: 'dress', skirt: true, flower: true, bareArms: true,
    pants: '#c98a62', shoe: '#c0304a',
  },
  barista_pip: { // energetic barista: espresso apron, warm brown hair
    skin: '#f5cba7', hair: '#6e3b24', hairStyle: 'short', eye: '#1b1230', brow: '#4e2816', mouth: 'smile',
    shirt: '#e8d8c8', under: '#5c3824', outfit: 'cardigan', pants: '#3b2e2a', shoe: '#5c3824',
  },
  chef_remy: { // head chef: white jacket, tall chef toque
    skin: '#f2c6a0', hair: '#382822', hairStyle: 'short', eye: '#1b1230', brow: '#2a1c18', mouth: 'smile',
    shirt: '#f2ede4', gold: '#d84040', outfit: 'bellhop', chefHat: true, pants: '#2f3542', shoe: '#2b2a3d',
  },
  coach_rex: { // fitness trainer: crimson athletic tee, headband
    skin: '#d99b72', hair: '#282028', hairStyle: 'spiky', eye: '#1b1230', brow: '#1c161c', mouth: 'smile',
    shirt: '#ff5252', outfit: 'tee', headband: '#f2ede4', bareArms: true, pants: '#222836', shoe: '#ff5252',
  },
  marina: { // spa attendant: serene aqua wrap, long dark hair, flower
    skin: '#f7d3b0', hair: '#2a344a', hairStyle: 'long', eye: '#1b1230', brow: '#1e2638', mouth: 'smile', lashes: true,
    shirt: '#5cd6c8', outfit: 'dress', flower: true, pants: '#3a8c82', shoe: '#f4efe6',
  },
  zack: { // arcade wizard: neon purple tee, cyan visor goggles
    skin: '#ffdbb8', hair: '#3a2058', hairStyle: 'spiky', eye: '#1b1230', brow: '#2a1640', mouth: 'open',
    shirt: '#8c52ff', outfit: 'tee', goggles: true, pants: '#241c38', shoe: '#50f0d0',
  },
  clara: { // archivist: emerald cardigan, glasses, bob hair
    skin: '#fce0c4', hair: '#8c442a', hairStyle: 'bob', eye: '#1b1230', brow: '#68301c', mouth: 'smile',
    shirt: '#489c72', under: '#fff8e8', outfit: 'cardigan', glasses: true, pants: '#384454', shoe: '#523422',
  },
  flora: { // botanist: sage tunic, blonde long hair, flower
    skin: '#ffd8b4', hair: '#e8b854', hairStyle: 'long', eye: '#1b1230', brow: '#8a641c', mouth: 'smile',
    shirt: '#78c466', under: '#fff4d4', outfit: 'cardigan', flower: true, pants: '#4a6b48', shoe: '#7c5434',
  },
  celeste: { // head receptionist: royal navy blazer with gold lapels & buttons, neat bob
    skin: '#ffe0c2', hair: '#382230', hairStyle: 'bob', eye: '#1b1230', brow: '#2a1824', mouth: 'smile', lashes: true,
    shirt: '#2e4478', gold: '#ffd268', cuff: '#ffd268', outfit: 'bellhop', pants: '#1e2c50', shoe: '#2b2a3d',
  },
  receptionist: {
    skin: '#ffe0c2', hair: '#382230', hairStyle: 'bob', eye: '#1b1230', brow: '#2a1824', mouth: 'smile', lashes: true,
    shirt: '#2e4478', gold: '#ffd268', cuff: '#ffd268', outfit: 'bellhop', pants: '#1e2c50', shoe: '#2b2a3d',
  },
};
