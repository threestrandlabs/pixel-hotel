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

const frame = (now, ms, count) => Math.floor(now / ms) % count;

/**
 * @param {object} e  render entity: walking, sitting, lying, action, emote
 * @param {number} now ms
 * @returns {{pose: string, face: 'stand'|'sit'|'lie'|'swim'}}
 */
export function poseFor(e, now = 0) {
  if (e.walking) return { pose: `walk${frame(now, 140, 4)}`, face: 'stand' };
  const act = e.action || null;
  if (act === 'swim') return { pose: `swim${frame(now, 240, 4)}`, face: 'swim' };
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
