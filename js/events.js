// Seasonal hotel events (pure: no DOM). One runs for each season; each has a
// handful of limited-time quests that reuse the game's normal quest types.
// Event quest progress lives in state.quests under `event:<id>-<year>:<qid>`,
// so the same event next year starts fresh.

export const SEASONAL_EVENTS = [
  {
    id: 'winter_lights',
    name: 'Winter Lights',
    emoji: '❄️',
    start: '12-01',
    end: '01-06',
    blurb: 'The tower is strung with lights. Warm up with friends and a swim in the heated pool.',
    quests: [
      { id: 'visit', title: 'Festive Rounds', description: 'Visit 5 different floors of the hotel.', type: 'visit', target: 5, reward: { coins: 80 } },
      { id: 'swim', title: 'Polar Plunge', description: 'Swim 2 laps in the heated pool.', type: 'swim_laps', target: 2, reward: { coins: 90 } },
      { id: 'checkin', title: 'Home for the Holidays', description: 'Check in on 3 days in a row.', type: 'checkin_streak', target: 3, reward: { coins: 120 } },
    ],
  },
  {
    id: 'spring_bloom',
    name: 'Spring Bloom',
    emoji: '🌸',
    start: '03-20',
    end: '05-31',
    blurb: 'Fresh flowers on every floor. Time for a new look and some fresh air.',
    quests: [
      { id: 'style', title: 'Spring Refresh', description: 'Get a new style at the salon.', type: 'salon_style', target: 1, reward: { coins: 70 } },
      { id: 'greet', title: 'Garden Party', description: 'Say hello to 5 different guests.', type: 'greet', target: 5, reward: { coins: 80 } },
      { id: 'place', title: 'Spring Cleaning', description: 'Place or move 4 pieces of furniture.', type: 'place', target: 4, reward: { coins: 90 } },
    ],
  },
  {
    id: 'summer_splash',
    name: 'Summer Splash',
    emoji: '☀️',
    start: '06-01',
    end: '08-31',
    blurb: 'Long days by the pool and the arcade buzzing all night.',
    quests: [
      { id: 'swim', title: 'Lifeguard on Duty', description: 'Swim 5 laps in the pool.', type: 'swim_laps', target: 5, reward: { coins: 120 } },
      { id: 'arcade', title: 'Arcade Nights', description: 'Play 3 arcade games.', type: 'arcade_play', target: 3, reward: { coins: 90 } },
      { id: 'massage', title: 'Sun & Spa', description: 'Unwind with a massage at the spa.', type: 'massage', target: 1, reward: { coins: 60 } },
    ],
  },
  {
    id: 'autumn_harvest',
    name: 'Autumn Harvest',
    emoji: '🍂',
    start: '09-01',
    end: '11-30',
    blurb: 'Cosy evenings, good food and a full house. Bring friends to the restaurant.',
    quests: [
      { id: 'dine', title: 'Harvest Supper', description: 'Sit down to eat at the Skyline Restaurant.', type: 'sit_restaurant', target: 1, reward: { coins: 70 } },
      { id: 'gumballs', title: 'Lucky Leaves', description: 'Pull 5 gumballs from the capsule machine.', type: 'gumball_pulls', target: 5, reward: { coins: 90 } },
      { id: 'checkin', title: 'Regular Guest', description: 'Check in on 3 days in a row.', type: 'checkin_streak', target: 3, reward: { coins: 120 } },
    ],
  },
];

function md(date) {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function inWindow(start, end, today) {
  return start <= end ? today >= start && today <= end : today >= start || today <= end;
}

/**
 * The event running on `now`, with its instance key, end date and quests
 * expanded to full quest definitions, or null.
 */
export function activeEvent(now = new Date()) {
  const today = md(now);
  const ev = SEASONAL_EVENTS.find((e) => inWindow(e.start, e.end, today));
  if (!ev) return null;
  // an event that wraps the new year belongs to the year it started in
  const year = ev.start > ev.end && today <= ev.end ? now.getFullYear() - 1 : now.getFullYear();
  const key = `${ev.id}-${year}`;
  const [em, ed] = ev.end.split('-').map(Number);
  const endYear = ev.start > ev.end ? year + 1 : year;
  const endsAt = new Date(endYear, em - 1, ed, 23, 59, 59);
  return {
    ...ev,
    key,
    endsAt,
    quests: ev.quests.map((q) => ({ ...q, id: `event:${key}:${q.id}`, event: ev.id, reward: { unlock: null, ...q.reward } })),
  };
}

/** Whole days left in the event, counting today. */
export function daysLeft(event, now = new Date()) {
  if (!event) return 0;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(1, Math.ceil((event.endsAt - start) / 86400000));
}
