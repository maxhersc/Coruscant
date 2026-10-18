import * as THREE from 'three';
import { LEVELS, CELL } from '../config.js';
import { decks, pads } from './interact.js';
import { LANDMARKS } from '../world/landmarks.js';
import { state } from './state.js';
import { jobTarget } from './jobs.js';

// Wayfinding: the places you can be guided to, the one you picked, and the
// next step toward it (take the lift, go to your speeder, land at a pad).

const LEVEL_NAMES = {
  [LEVELS.market]: 'Galleria Market (160)',
  [LEVELS.promenade]: 'Spire Promenade (300)',
  [LEVELS.residences]: 'Skyhaven Residences (440)',
  [LEVELS.skydeck]: 'Skydeck (600)',
};
const HUB_RADIUS = 170;
const LIFT = (y) => new THREE.Vector3(8, y, -58);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function levelName(y) {
  return LEVEL_NAMES[y] || `Level ${Math.round(y)}`;
}

// Built after the world exists (decks and pads are filled in while building).
export function buildPlaces(speeder, extra = []) {
  const P = LEVELS.promenade;
  const hub = [
    { name: 'Lucky Comet Casino', pos: V(62, P, 78), level: P, hint: 'Roulette, twenty-one, slots and Skyrace betting' },
    { name: 'Skyline Food Court', pos: V(-73, P, 86), level: P, hint: 'Noodles, dumplings and caf' },
    { name: 'Courier Guild', pos: V(-78.5, P, -63.5), level: P, hint: 'Pick up delivery jobs' },
    { name: 'Jump Station Speeders', pos: V(76, P, -70), level: P, hint: 'Buy a faster speeder' },
    { name: 'East Pad', pos: V(132, P, 0), level: P, hint: 'Where your speeder starts' },
    { name: 'The Low Orbit cantina', pos: V(0, LEVELS.market, 66), level: LEVELS.market, hint: 'Drinks and Chance Cubes dice' },
    { name: 'Galleria Market stalls', pos: V(62, LEVELS.market, 0), level: LEVELS.market, hint: 'Sky fruit and street food' },
    { name: "Vool's Credit", pos: V(-44, LEVELS.market, -71), level: LEVELS.market, hint: 'Loans, at a price' },
    { name: 'Your apartment', pos: V(4, LEVELS.residences, 56), level: LEVELS.residences, hint: 'Sleep and save' },
    { name: 'Skydeck', pos: V(0, LEVELS.skydeck, -76), level: LEVELS.skydeck, hint: 'The best view in the city' },
  ].map((p) => ({ ...p, group: 'Spire hub' }));
  const you = [{ name: 'Your speeder', get pos() { return speeder.pos; }, group: 'You', hint: 'Press F beside it to fly, or V to have it brought to you', dynamic: true }];
  const deckPlaces = decks.map((d) => ({ name: d.name, pos: d.dropPos, group: 'Rooftop decks', hint: 'Land on the pad, walk to the terminal' }));
  const sights = LANDMARKS.map((l) => ({ name: l.name, pos: V(l.i * CELL, 320, l.j * CELL), group: 'Landmarks', hint: 'Fly past it', sight: true }));
  return [...hub, ...you, ...extra, ...deckPlaces, ...sights];
}

// before(): a target that outranks everything (an armed Gate Run).
// after(): a fallback when nothing else is set (the story objective).
export const nav = { target: null, places: [], before: null, after: null };

export function setTarget(place) {
  nav.target = place;
}

export function clearTarget() {
  nav.target = null;
}

const inHub = (p) => Math.hypot(p.x, p.z) < HUB_RADIUS;

function nearestPadAt(y, near) {
  let best = null, bd = Infinity;
  for (const p of pads) {
    if (Math.abs(p.y - y) > 1) continue;
    const d = Math.hypot(p.x - near.x, p.z - near.z);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

// The place being guided to: a picked place, else the active job's destination.
export function activeTarget() {
  const first = nav.before && nav.before();
  if (first) return first;
  if (nav.target) return nav.target;
  if (state.job) {
    const pos = jobTarget();
    if (pos) return { name: state.job.dest, pos, job: true, level: Math.hypot(pos.x, pos.z) < HUB_RADIUS ? pos.y : null };
  }
  const last = nav.after && nav.after();
  if (last) return { ...last, level: inHub(last.pos) ? last.pos.y : null };
  return null;
}

// The next step toward the target from where the player is.
// Returns {pos, label, step} or null.
export function guidance(player, mode, speeder, liftHasPlayer) {
  const t = activeTarget();
  if (!t) return null;
  const tp = t.pos;
  const name = t.name;
  if (t.sight || t.dynamic) return { pos: tp, label: name, step: null };

  if (mode === 'fly') {
    // Land on the pad that serves the destination.
    const pad = t.level != null ? nearestPadAt(t.level, tp) : pads.find((p) => Math.hypot(p.x - tp.x, p.z - tp.z) < 40 && Math.abs(p.y - tp.y) < 2);
    if (pad && speeder.pos.distanceTo(V(pad.x, pad.y, pad.z)) > 30) {
      return { pos: V(pad.x, pad.y, pad.z), label: name, step: `Land at ${pad.name}` };
    }
    return { pos: tp, label: name, step: 'Slow down and press F to land' };
  }

  // On foot in the hub, on the wrong level: go to the lift.
  if (inHub(player) && inHub(tp) && Math.abs(player.y - tp.y) > 4) {
    const dest = levelName(t.level ?? tp.y);
    if (liftHasPlayer) return { pos: tp, label: name, step: `Press E in the lift and choose ${dest}` };
    return { pos: LIFT(player.y), label: name, step: `Take the lift on the Spire's south face to ${dest}` };
  }
  // On foot and the target is somewhere else in the city: fly.
  const sameDeck = !inHub(tp) && Math.hypot(player.x - tp.x, player.z - tp.z) < 60 && Math.abs(player.y - tp.y) < 4;
  if (!sameDeck && (!inHub(tp) || !inHub(player))) {
    const far = player.distanceTo(speeder.pos);
    if (far > 150) return { pos: speeder.pos, label: name, step: 'Press V to have your speeder brought to the nearest pad' };
    if (far > 6) return { pos: speeder.pos, label: name, step: 'Go to your speeder, then press F to fly' };
    return { pos: tp, label: name, step: 'Press F to board and fly there' };
  }
  return { pos: tp, label: name, step: null };
}

// True once the player stands at a picked place.
export function arrived(player, mode) {
  const t = nav.target;
  if (!t || t.sight) return false;
  if (t.dynamic) return mode === 'walk' && player.distanceTo(t.pos) < 5;
  return mode === 'walk' && Math.hypot(player.x - t.pos.x, player.z - t.pos.z) < 6 && Math.abs(player.y - t.pos.y) < 3;
}
