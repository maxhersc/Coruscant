import * as THREE from 'three';
import { TIME_SCALE } from '../config.js';
import { decks } from './interact.js';
import { state, totalMinutes, addCredits } from './state.js';

// Courier work: carry cargo between the Courier Guild and the rooftop decks.

const CARGO = [
  ['Medical supplies', 1.0, false],
  ['Encrypted datachips', 1.2, false],
  ['Live spice-eels', 1.5, true],
  ['Diplomatic pouch', 1.6, false],
  ['Hyperdrive coupling', 1.1, true],
  ['Crate of Nova-Cola', 0.8, false],
  ['Antique holocrons', 1.7, true],
  ['Replacement droid head', 1.0, false],
  ['Wedding cake (three tiers)', 1.3, true],
  ['Sealed court summons', 1.2, false],
];

export const GUILD = { name: 'Courier Guild', pos: new THREE.Vector3(-78.5, 300, -63.5) };

function placeOf(name) {
  if (name === GUILD.name) return GUILD.pos;
  const d = decks.find((k) => k.name === name);
  return d ? d.dropPos : null;
}

// Three offers starting from `from` (a deck name or the Guild).
export function makeOffers(from) {
  const origin = placeOf(from) || GUILD.pos;
  const pool = decks.filter((d) => d.name !== from);
  const offers = [];
  const picks = pool.sort(() => Math.random() - 0.5).slice(0, from === GUILD.name ? 3 : 2);
  if (from !== GUILD.name) picks.push({ name: GUILD.name, dropPos: GUILD.pos });
  for (const d of picks) {
    const [cargo, mult, fragile] = CARGO[Math.floor(Math.random() * CARGO.length)];
    const dist = origin.distanceTo(d.dropPos);
    // Allow for flying at ~65 m/s plus a minute and a half to land and walk.
    const seconds = dist / 65 + 90;
    const limit = Math.round(seconds * TIME_SCALE * 1.35);
    const pay = Math.round((60 + dist * 0.07) * mult / 5) * 5;
    offers.push({ dest: d.name, cargo, pay, limit, fragile, dist: Math.round(dist) });
  }
  return offers;
}

export function acceptJob(offer) {
  state.job = { ...offer, deadline: totalMinutes() + offer.limit, damage: 0 };
}

export function jobTarget() {
  if (!state.job) return null;
  return placeOf(state.job.dest);
}

export function minutesLeft() {
  return state.job ? state.job.deadline - totalMinutes() : 0;
}

// Returns a result message.
export function deliver() {
  const j = state.job;
  if (!j) return null;
  const left = minutesLeft();
  let pay = j.pay;
  let note = 'On time.';
  if (left < 0) {
    const late = -left / j.limit;
    pay = Math.round(pay * Math.max(0.2, 1 - late));
    note = 'Late. The client docked your fee.';
  } else if (left > j.limit * 0.4) {
    pay = Math.round(pay * 1.25);
    note = 'Early! Speed bonus.';
  }
  if (j.fragile && j.damage > 0) {
    const cut = Math.min(0.8, j.damage * 0.2);
    pay = Math.round(pay * (1 - cut));
    note += ` Cargo damaged in ${j.damage} collision${j.damage > 1 ? 's' : ''}.`;
  }
  addCredits(pay, `Delivery · ${j.cargo}`);
  state.stats.delivered += 1;
  state.stats.earned += pay;
  state.job = null;
  return { pay, note };
}

export function abandonJob() {
  state.job = null;
}
