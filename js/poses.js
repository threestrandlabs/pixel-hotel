// Which character pose to show (pure, no DOM). Poses are baked into the atlas
// (char/<facing>/<pose>/<layer>) by art/sprites/character.js.

// Activity kinds that play the generic "using it with both hands" pose.
const USE_KINDS = new Set([
  'use', 'cook_stove', 'water_cooler', 'gumball_machine', 'city_view', 'squat_rack', 'arcade_pool',
  'arcade_noodle_snake', 'arcade_brick_bash', 'arcade_block_drop', 'arcade_leaderboard', 'wardrobe',
  'toggle_light', 'swimsuit_change',
]);

// Emote id -> [pose prefix, frame count, ms per frame]
const EMOTE_POSES = {
  wave: ['wave', 2, 260],
  clap: ['clap', 2, 200],
  cheer: ['cheer', 2, 320],
  dance: ['dance', 4, 220],
  thumbsup: ['thumbs', 1, 1000],
  heart: ['heart', 1, 1000],
};

// Height (px) of the surface someone lies on, per catalogue item.
export const LIE_SURFACE = { suite_bed: 24, massage_bed: 21, yoga_mat: 1 };

// Where a lying body is drawn relative to its slot tile (the head-end tile),
// measured on screen: the lie sprite's bulk sits ahead of and slightly to one
// side of its pivot.
//   along:   tiles toward the feet (bed: head on the pillow; 1x2: centred)
//   lateral: sprite bias toward body-space +a, plus `inset` toward the item's
//            centre line so each sleeper on a double bed lies on their pillow
const LIE_ALONG = { suite_bed: 1.0, massage_bed: 0.95, yoga_mat: 0.95 };
const LIE_LATERAL_BIAS = 0.3;
const LIE_INSET = { suite_bed: 0.1 };

const DIR_STEP = { down: [0, 1], up: [0, -1], right: [1, 0], left: [-1, 0] };
// body-space +a for each facing (see FACING in art/sprites/character.js)
const DIR_LATERAL = { down: [1, 0], right: [0, -1], up: [-1, 0], left: [0, 1] };

/**
 * Tile offset [dx, dy] at which to draw someone lying on `itemId` facing
 * `dir`. `towardCentre` is -1/0/1: which lateral way the item's centre line
 * lies from this slot, measured along body-space +a.
 */
export function lieOffset(itemId, dir, towardCentre = 0) {
  if (!(itemId in LIE_ALONG)) return [0, 0];
  const along = LIE_ALONG[itemId];
  const lateral = LIE_LATERAL_BIAS + (LIE_INSET[itemId] || 0) * towardCentre;
  const [fx, fy] = DIR_STEP[dir] || DIR_STEP.down;
  const [lx, ly] = DIR_LATERAL[dir] || DIR_LATERAL.down;
  return [fx * along + lx * lateral, fy * along + ly * lateral];
}

/** Which lateral way (-1/0/1, along body-space +a) an item's centre is from slot (sx, sy). */
export function lateralTowardCentre(dir, slotX, slotY, centreX, centreY) {
  const [lx, ly] = DIR_LATERAL[dir] || DIR_LATERAL.down;
  const d = (centreX - slotX) * lx + (centreY - slotY) * ly;
  return Math.abs(d) < 0.01 ? 0 : Math.sign(d);
}

const frame = (now, ms, count) => Math.floor(now / ms) % count;

/**
 * @param {object} e  render entity: walking, sitting, lying, action, emote
 * @param {number} now ms
 * @returns {{pose: string, face: 'stand'|'sit'|'lie'|'swim'}}
 */
export function poseFor(e, now = 0) {
  const act = e.action || null;
  // in the water you swim, whether moving or treading water
  if (act === 'swim') return { pose: `swim${frame(now, e.walking ? 180 : 240, 4)}`, face: 'swim' };
  if (e.walking) return { pose: `walk${frame(now, 140, 4)}`, face: 'stand' };
  if (e.lying) return { pose: 'lie0', face: 'lie' };
  if (act === 'treadmill') return { pose: `run${frame(now, 110, 4)}`, face: 'stand' };
  if (act === 'exercise_bike') return { pose: `pedal${frame(now, 260, 2)}`, face: 'sit' };
  if (act === 'rowing') return { pose: `row${frame(now, 650, 2)}`, face: 'sit' };
  if (act === 'piano') return { pose: `play${frame(now, 300, 2)}`, face: 'sit' };
  if (act === 'eat') {
    return e.sitting
      ? { pose: `eatsit${frame(now, 700, 2)}`, face: 'sit' }
      : { pose: `eat${frame(now, 700, 2)}`, face: 'stand' };
  }
  if (e.sitting) return { pose: 'sit0', face: 'sit' };
  const emote = e.emote && EMOTE_POSES[e.emote];
  if (emote) return { pose: `${emote[0]}${frame(now, emote[2], emote[1])}`, face: 'stand' };
  if (act && USE_KINDS.has(act)) return { pose: `use${frame(now, 420, 2)}`, face: 'stand' };
  return { pose: 'idle0', face: 'stand' };
}
