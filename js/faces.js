// Which face parts to show for a character (pure, no DOM).
// The renderer stacks the matching atlas sprites (face/<facing>/<pose>/<part>).

import { EMOTE_EXPRESSION_MAP } from './emotes.js';

const MOUTHS = new Set(['smile', 'frown', 'open', 'lips']);

/**
 * @param {object} look  wardrobe look (mouth, lashes, eye, brow ...)
 * @param {{emote?: string|null, blink?: boolean}} state
 * @returns {{eyeL: string, eyeR: string, brows: string, mouth: string, lashes: boolean, blush: boolean}}
 */
export function faceFor(look = {}, { emote = null, blink = false } = {}) {
  const mouth = MOUTHS.has(look?.mouth) ? look.mouth : 'smile';
  const face = {
    eyeL: 'open',
    eyeR: 'open',
    brows: mouth === 'frown' ? 'sad' : 'normal',
    mouth,
    lashes: Boolean(look?.lashes),
    blush: true,
  };
  switch (emote ? EMOTE_EXPRESSION_MAP[emote] : null) {
    case 'happy':
      Object.assign(face, { eyeL: 'happy', eyeR: 'happy', brows: 'raised', mouth: 'open' });
      break;
    case 'laughing':
      Object.assign(face, { eyeL: 'happy', eyeR: 'happy', brows: 'raised', mouth: 'laugh' });
      break;
    case 'smug':
      Object.assign(face, { eyeL: 'half', eyeR: 'half', brows: 'normal', mouth: 'smug' });
      break;
    case 'wink':
      Object.assign(face, { eyeL: 'open', eyeR: 'closed', brows: 'raised', mouth: 'smile' });
      break;
    case 'sleepy':
      Object.assign(face, { eyeL: 'closed', eyeR: 'closed', brows: 'normal', mouth: 'sleepy', blush: false });
      break;
    default:
      break;
  }
  if (blink) {
    if (face.eyeL === 'open' || face.eyeL === 'half') face.eyeL = 'closed';
    if (face.eyeR === 'open' || face.eyeR === 'half') face.eyeR = 'closed';
  }
  return face;
}

// Eye shapes that show a coloured iris.
export const IRIS_SHAPES = new Set(['open', 'half']);
