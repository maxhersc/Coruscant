import { TIME_SCALE, START_MINUTES, START_CREDITS, RENT } from '../config.js';

// Everything that persists between sessions lives here.
export const state = {
  day: 1,
  minutes: START_MINUTES,
  credits: START_CREDITS,
  energy: 80,
  hunger: 70,
  speeder: 'courier',
  owned: ['courier'],
  loan: null,          // {owed, dueDay}
  rentDueDay: 2,       // rent is collected at 06:00 on this day
  job: null,           // active courier job
  inventory: { ration: 2, cola: 1 }, // cargo hold: item id -> count
  upgrades: {},        // installed speeder parts
  stats: { delivered: 0, earned: 0, wagered: 0, won: 0, races: 0 },
  tutorialDone: false,
};

export function totalMinutes() {
  return (state.day - 1) * 1440 + state.minutes;
}

export function clockString(m = state.minutes) {
  const h = Math.floor(m / 60) % 24, mm = Math.floor(m % 60);
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// Listeners for money changes and alerts, set by the UI.
export const hooks = { toast: () => {}, money: () => {} };

export function addCredits(n, reason) {
  state.credits = Math.round(state.credits + n);
  hooks.money(n, reason);
}

// A shrine fortune lasts until midnight of the day it was told.
export function hasBuff(id) {
  return !!state.buff && state.buff.id === id && state.buff.day === state.day;
}

export function canAfford(n) {
  return state.credits >= n;
}

// Advance the clock and the body. Returns a list of events for the game.
export function tick(dt) {
  const events = [];
  const gm = dt * TIME_SCALE;
  state.minutes += gm;
  if (state.minutes >= 1440) {
    state.minutes -= 1440;
    state.day += 1;
    events.push({ type: 'newday' });
  }
  state.hunger = Math.max(0, state.hunger - gm * (100 / (30 * 60)));
  state.energy = Math.max(0, state.energy - gm * (100 / (22 * 60)));

  if (state.day >= state.rentDueDay && state.minutes >= 6 * 60) {
    state.rentDueDay = state.day + 1;
    // Owning a home ends the Skyhaven lease.
    if (!state.noRent) {
      addCredits(-RENT, 'Rent · Skyhaven Residences');
      events.push({ type: 'rent' });
    }
  }
  if (state.loan && state.day >= state.loan.dueDay && state.minutes >= 12 * 60) {
    events.push({ type: 'loandue' });
  }
  if (state.energy <= 0) events.push({ type: 'collapse' });
  return events;
}

// Movement penalties from hunger and fatigue.
export function bodySpeedMul() {
  let m = 1;
  if (state.hunger < 15) m *= 0.85;
  if (state.energy < 12) m *= 0.75;
  return m;
}
