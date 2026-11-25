// Daily check-in streak (pure: no DOM). Dates are the player's local calendar
// days, so the streak follows their own midnight.
//
// state.checkin = { lastDate: 'YYYY-MM-DD' | '', streak, best, totalDays }

// Coins for day 1..7 of the weekly cycle; day 7 is the big one.
export const CHECKIN_REWARDS = [20, 25, 30, 40, 50, 60, 100];

export function defaultCheckin() {
  return { lastDate: '', streak: 0, best: 0, totalDays: 0 };
}

export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function previousDayKey(date) {
  const prev = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1, 12);
  return dayKey(prev);
}

function normalise(checkin) {
  const c = checkin && typeof checkin === 'object' ? checkin : {};
  return {
    lastDate: typeof c.lastDate === 'string' ? c.lastDate : '',
    streak: Number.isFinite(c.streak) && c.streak > 0 ? Math.floor(c.streak) : 0,
    best: Number.isFinite(c.best) && c.best > 0 ? Math.floor(c.best) : 0,
    totalDays: Number.isFinite(c.totalDays) && c.totalDays > 0 ? Math.floor(c.totalDays) : 0,
  };
}

/**
 * What today's check-in looks like without claiming it.
 * { available, streak (after claiming), day (1-7), coins, broken, current }
 */
export function checkinStatus(state, now = new Date()) {
  const c = normalise(state.checkin);
  const today = dayKey(now);
  if (c.lastDate === today) {
    const day = ((c.streak - 1) % 7) + 1;
    return { available: false, streak: c.streak, day, coins: 0, broken: false, current: c };
  }
  const continues = c.lastDate === previousDayKey(now);
  const streak = continues ? c.streak + 1 : 1;
  const day = ((streak - 1) % 7) + 1;
  return {
    available: true,
    streak,
    day,
    coins: CHECKIN_REWARDS[day - 1],
    broken: !continues && c.streak > 0,
    current: c,
  };
}

/** Claims today's check-in. Returns { ok, streak, day, coins } or { ok: false, reason }. */
export function claimCheckin(state, now = new Date()) {
  const s = checkinStatus(state, now);
  if (!s.available) return { ok: false, reason: 'already_checked_in' };
  state.checkin = {
    lastDate: dayKey(now),
    streak: s.streak,
    best: Math.max(s.current.best, s.streak),
    totalDays: s.current.totalDays + 1,
  };
  state.coins += s.coins;
  return { ok: true, streak: s.streak, day: s.day, coins: s.coins };
}
