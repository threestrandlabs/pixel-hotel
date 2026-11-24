// Which face parts to show for a character (pure, no DOM).
// The renderer stacks the matching atlas sprites (face/<facing>/<pose>/<part>).

import { EMOTE_EXPRESSION_MAP } from './emotes.js';

const MOUTHS = new Set(['smile', 'frown', 'open', 'lips', 'grin', 'cat']);
// wardrobe eye shape -> resting eye sprite
const EYE_REST = { round: 'open', sparkly: 'sparkle', sleepy: 'half', sharp: 'sharp' };
const BROW_STYLES = new Set(['soft', 'thick', 'arched', 'thin']);

// Eye shapes that show a coloured iris.
export const IRIS_SHAPES = new Set(['open', 'sparkle', 'sharp', 'half']);

/**
 * @param {object} look  wardrobe look (mouth, lashes, eyeShape, browStyle, freckles, blush ...)
 * @param {{emote?: string|null, blink?: boolean}} state
 * @returns {{eyeL: string, eyeR: string, brows: string, mouth: string,
 *   lashes: boolean, blush: boolean, freckles: boolean}}
 *   brows is the sprite suffix, e.g. 'soft_normal', 'thick_raised' or 'sad'.
 */
export function faceFor(look = {}, { emote = null, blink = false } = {}) {
  const mouth = MOUTHS.has(look?.mouth) ? look.mouth : 'smile';
  const rest = EYE_REST[look?.eyeShape] || 'open';
  const browStyle = BROW_STYLES.has(look?.browStyle) ? look.browStyle : 'soft';
  let brows = mouth === 'frown' ? 'sad' : 'normal';
  const face = {
    eyeL: rest,
    eyeR: rest,
    mouth,
    lashes: Boolean(look?.lashes),
    blush: look?.blush !== false,
    freckles: Boolean(look?.freckles),
  };
  switch (emote ? EMOTE_EXPRESSION_MAP[emote] : null) {
    case 'happy':
      Object.assign(face, { eyeL: 'happy', eyeR: 'happy', mouth: 'open' });
      brows = 'raised';
      break;
    case 'laughing':
      Object.assign(face, { eyeL: 'happy', eyeR: 'happy', mouth: 'laugh' });
      brows = 'raised';
      break;
    case 'smug':
      Object.assign(face, { eyeL: 'half', eyeR: 'half', mouth: 'smug' });
      brows = 'normal';
      break;
    case 'wink':
      Object.assign(face, { eyeL: rest, eyeR: 'closed', mouth: 'smile' });
      brows = 'raised';
      break;
    case 'sleepy':
      Object.assign(face, { eyeL: 'closed', eyeR: 'closed', mouth: 'sleepy', blush: false });
      brows = 'normal';
      break;
    default:
      break;
  }
  if (blink) {
    if (IRIS_SHAPES.has(face.eyeL)) face.eyeL = 'closed';
    if (IRIS_SHAPES.has(face.eyeR)) face.eyeR = 'closed';
  }
  face.brows = brows === 'sad' ? 'sad' : `${browStyle}_${brows}`;
  return face;
}
