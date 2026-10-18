import * as THREE from 'three';
import { TIME_SCALE } from '../config.js';
import { decks } from './interact.js';
import { state, totalMinutes, addCredits } from './state.js';
import { placeOf } from './places.js';

// Courier work. Every contract carries cargo that suits where it is going (a
// donor organ to a clinic, kegs to a nightclub), and comes in one of several
// kinds:
//   parcel     the everyday run
//   express    cargo that will not keep: a tight clock and double pay
//   freight    heavy: the speeder flies slower with it aboard
//   route      several drops in a row across the city; takes a while, pays well
//   passenger  someone rides along and tips for a smooth, quick flight
//   smuggle    contraband for the fixer on the Undercity Shelf; pays the most,
//              and Spire Security patrols scan anything that flies close

export const GUILD = { name: 'Courier Guild', pos: new THREE.Vector3(-78.5, 300, -63.5) };
// The fixer stands on the Undercity Shelf; the world fills in where.
export const FIXER = { name: 'Undercity Shelf', pos: new THREE.Vector3(-414, 55, 532) };

export const KINDS = {
  parcel: { label: 'Parcel' },
  express: { label: 'Express', cls: 'warn' },
  freight: { label: 'Heavy freight · slower' },
  route: { label: 'Route' },
  passenger: { label: 'Passenger', cls: 'info' },
  smuggle: { label: 'Contraband', cls: 'bad' },
};

const GUILD_CARGO = [['Return mail sacks', 1.0, []], ['Guild paperwork', 0.9, []], ['Lost-and-found crate', 1.0, ['heavy']], ['Undeliverable parcels', 1.0, []]];
const CONTRABAND = [
  ['Glitter spice bricks', 1.0], ['Unregistered blaster parts', 1.2], ['Sliced security codes', 1.1],
  ['A stolen ledger', 1.3], ['Unlicensed droid brains', 1.2], ['Red spice, vacuum-sealed', 1.4],
];

// Riders, and the kinds of place they board at.
const PASSENGERS = [
  { name: 'Countess Avel Maru', from: ['noble', 'gallery'], to: ['gallery', 'noble', 'embassy'],
    lines: ['Mind the upholstery. And the speed. And the other speeders.', 'In my day pilots wore hats.', 'Is it always this loud out here?', 'Do take the scenic way. No, faster than that.'],
    bump: 'I felt that in my pearls.', happy: 'Adequate. More than adequate. Do keep the change.' },
  { name: 'Envoy Tesh Varr', from: ['embassy'], to: ['embassy', 'noble', 'data'],
    lines: ['I have a treaty to save. Fly as if a war depends on it.', 'Twelve systems are waiting on my signature. No pressure.', 'Do not slow down for anything that is not a wall.'],
    bump: 'That will be in my report.', happy: 'Precisely on schedule. The galaxy thanks you, in a small way.' },
  { name: 'DJ Kilo Nine', from: ['club'], to: ['club', 'diner', 'gallery'],
    lines: ['My set starts in ten. Can this thing go faster?', 'This is a great view. I should sample the wind.', 'Turn left at the big ad. No, the other big ad.'],
    bump: 'Whoa, that was a drop. Not the good kind.', happy: 'You are a legend. Come by the club, you are on the list.' },
  { name: 'Dr. Inra Sol', from: ['clinic'], to: ['clinic'],
    lines: ['There is a patient on the table waiting for me. Please hurry.', 'I scrubbed in once already today.', 'If you see a med droid, wave. They like that.'],
    bump: 'Careful! These hands are booked solid.', happy: 'You may have just saved a life. Thank you.' },
  { name: 'Two newlyweds', from: ['shrine', 'noble', 'diner'], to: ['shrine', 'diner', 'garden', 'noble'],
    lines: ['We just got married! Can you take a photo while you fly? Kidding.', 'Look, you can see the whole city from here!', 'Is that the Temple? We met at the Temple.'],
    bump: 'Ow! That one was not romantic.', happy: 'Best ride ever. We are telling everyone about you.' },
  { name: 'A retired lane pilot', from: ['yard', 'diner', 'shrine'], to: ['yard', 'diner', 'garden'],
    lines: ['I flew these lanes for forty years. You are drifting left.', 'In my day the clouds were higher.', 'Not bad. You hold a line almost as well as I did.'],
    bump: 'Hah! I did that once. They took my licence for a month.', happy: 'Good flying, kid. You have the hands for it.' },
  { name: 'A nervous tourist', from: ['diner', 'garden', 'gallery', 'data'], to: ['gallery', 'shrine', 'diner', 'garden'],
    lines: ['How high are we? Do not tell me. Tell me.', 'Is it normal for the speeders to come that close?', 'My guidebook said this would be relaxing.'],
    bump: 'I would like to get out now. Not here. Later.', happy: 'We made it! I am never doing that again. Five stars.' },
];

function posOf(name) {
  if (name === GUILD.name) return GUILD.pos;
  if (name === FIXER.name) return FIXER.pos;
  const d = decks.find((k) => k.name === name);
  return d ? d.dropPos : null;
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => arr.slice().sort(() => Math.random() - 0.5);
const round5 = (n) => Math.round(n / 5) * 5;

// Cargo for a destination, preferring one that carries `want` tag.
function cargoFor(dest, want) {
  const list = dest === GUILD.name ? GUILD_CARGO : placeOf(dest).cargo;
  // Without a wanted tag: something that keeps and is not heavy freight.
  const fits = list.filter(([, , tags]) => (want ? tags.includes(want) : !tags.includes('rush') && !tags.includes('heavy')));
  const [name, mult, tags] = pick(fits.length ? fits : list);
  return { name, mult, tags };
}

// Time allowed for a leg: flying at ~65 m/s (slower with heavy cargo) plus a
// minute and a half to land and walk, with some slack, in game minutes.
const legMinutes = (dist, heavy) => Math.round((dist / (heavy ? 45 : 65) + 90) * TIME_SCALE * 1.35);
const legPay = (dist, mult) => (60 + dist * 0.07) * mult;

function offer(kind, from, stops, extra = {}) {
  let at = posOf(from) || GUILD.pos;
  let dist = 0, minutes = 0, pay = 0;
  const heavy = kind === 'freight' || stops.some((s) => s.tags?.includes('heavy'));
  for (const s of stops) {
    const p = posOf(s.dest);
    const d = at.distanceTo(p);
    dist += d;
    minutes += legMinutes(d, heavy);
    s.due = minutes;
    s.pay = legPay(d, s.mult);
    pay += s.pay;
    at = p;
  }
  const o = {
    kind, from, stops, leg: 0,
    dest: stops[0].dest, cargo: stops[0].cargo,
    fragile: stops.some((s) => s.tags?.includes('fragile')),
    heavy,
    contraband: kind === 'smuggle',
    dist: Math.round(dist), limit: minutes, pay, ...extra,
  };
  const k = { parcel: 1, express: 1.9, freight: 1.45, route: 1.2, passenger: 1.25, smuggle: 3.4 }[kind];
  if (kind === 'express') { o.limit = Math.round(o.limit * 0.7); stops.forEach((s) => { s.due = Math.round(s.due * 0.7); }); }
  o.pay = round5(o.pay * k + (kind === 'route' ? 60 * (stops.length - 1) : 0) + (kind === 'smuggle' ? 150 : 0) + (extra.bonus || 0));
  // Each stop's share of the fee, so a route pays as you go.
  const raw = stops.reduce((a, s) => a + s.pay, 0);
  stops.forEach((s) => { s.pay = Math.round(o.pay * (s.pay / raw)); });
  return o;
}

const themed = (dest, want) => {
  const c = cargoFor(dest, want);
  return { dest, cargo: c.name, mult: c.mult, tags: c.tags };
};

function parcelTo(from, dest) {
  return offer('parcel', from, [themed(dest)]);
}
function expressTo(from, dest) {
  return offer('express', from, [themed(dest, 'rush')]);
}
function freightTo(from, dest) {
  return offer('freight', from, [themed(dest, 'heavy')]);
}
function routeFrom(from, count, pool) {
  // Fly them nearest first, so a route sweeps across the city, not back and forth.
  const left = shuffle(pool).slice(0, count);
  const order = [];
  let at = posOf(from);
  while (left.length) {
    left.sort((a, b) => at.distanceTo(a.dropPos) - at.distanceTo(b.dropPos));
    const next = left.shift();
    order.push(next);
    at = next.dropPos;
  }
  return offer('route', from, order.map((d) => themed(d.name)));
}
function passengerFrom(from, pool) {
  const theme = from === GUILD.name ? null : placeOf(from).theme;
  const riders = PASSENGERS.filter((p) => !theme || p.from.includes(theme));
  const rider = pick(riders.length ? riders : PASSENGERS);
  const dests = pool.filter((d) => rider.to.includes(placeOf(d.name).theme));
  const dest = pick(dests.length ? dests : pool).name;
  return offer('passenger', from, [{ dest, cargo: rider.name, mult: 1.0, tags: [] }], { passenger: PASSENGERS.indexOf(rider), bumps: 0 });
}
function smuggleTo(from, dest) {
  const [name, mult] = pick(CONTRABAND);
  // Into an embassy, past its scanners, pays half again.
  const strict = dest !== FIXER.name && placeOf(dest).strict;
  return offer('smuggle', from, [{ dest, cargo: name, mult: mult * (strict ? 1.5 : 1), tags: [] }], { strict });
}

// Offers on the board at `from`: the Guild, a deck's terminal, or 'fixer'.
export function makeOffers(from) {
  const isGuild = from === GUILD.name, isFixer = from === 'fixer';
  const origin = isFixer ? FIXER.name : from;
  const pool = decks.filter((d) => d.name !== from);
  const near = pool.slice().sort((a, b) => posOf(origin).distanceTo(a.dropPos) - posOf(origin).distanceTo(b.dropPos));
  const far = near.slice(Math.floor(near.length / 2));
  if (isFixer) {
    const shady = pool.filter((d) => placeOf(d.name).shady);
    const strict = pool.filter((d) => placeOf(d.name).strict);
    return [smuggleTo(origin, pick(shady).name), smuggleTo(origin, pick(shady).name), smuggleTo(origin, pick(strict).name)];
  }
  if (isGuild) {
    return [
      parcelTo(origin, pick(near.slice(0, 10)).name),
      expressTo(origin, pick(pool).name),
      freightTo(origin, pick(pool).name),
      passengerFrom(origin, pool),
      routeFrom(origin, 3, far),
    ];
  }
  const here = placeOf(from);
  const out = [parcelTo(origin, GUILD.name)];
  const kinds = shuffle([parcelTo, expressTo, freightTo]).slice(0, 2);
  for (const make of kinds) out.push(make(origin, pick(pool).name));
  if (['noble', 'embassy', 'club', 'clinic'].includes(here.theme)) out.push(passengerFrom(origin, pool));
  else out.push(routeFrom(origin, 2, pool));
  // Shady places have something under the counter, some of the time.
  if (here.shady && Math.random() < 0.6) out.push(smuggleTo(origin, Math.random() < 0.5 ? FIXER.name : pick(pool.filter((d) => placeOf(d.name).shady)).name));
  return out;
}

export function passengerOf(job) {
  return job && job.passenger !== undefined ? PASSENGERS[job.passenger] : null;
}

export function acceptJob(o) {
  const now = totalMinutes();
  state.job = { ...o, stops: o.stops.map((s) => ({ ...s, deadline: now + s.due })), deadline: now + o.limit, damage: 0, earned: 0, chat: 8 };
}

export function jobTarget() {
  if (!state.job) return null;
  return posOf(state.job.dest);
}

// Minutes left on the current stop.
export function minutesLeft() {
  const j = state.job;
  if (!j) return 0;
  const s = j.stops ? j.stops[j.leg] : null;
  return (s ? s.deadline : j.deadline) - totalMinutes();
}

// Is a delivery for the active job made here? `at` is a terminal's place name.
export function deliversAt(at) {
  return !!state.job && state.job.dest === at;
}

// Hand over the current stop's cargo. Returns { pay, note, thanks, more }.
export function deliver() {
  const j = state.job;
  if (!j) return null;
  // Saves from before routes had stops.
  if (!j.stops) Object.assign(j, { stops: [{ dest: j.dest, cargo: j.cargo, pay: j.pay, deadline: j.deadline, due: j.limit }], leg: 0, kind: j.kind || 'parcel', earned: 0 });
  const stop = j.stops[j.leg];
  const left = minutesLeft();
  const due = Math.max(1, j.kind === 'route' ? stop.due - (j.leg ? j.stops[j.leg - 1].due : 0) : j.limit);
  let pay = stop.pay;
  const notes = [];
  if (left < 0) {
    if (j.kind === 'express') { pay = Math.round(pay * 0.25); notes.push('Late, and it did not keep. You got a quarter of the fee.'); }
    else { pay = Math.round(pay * Math.max(0.2, 1 + left / due)); notes.push('Late. The client docked your fee.'); }
  } else if (left > due * 0.4 && j.kind !== 'smuggle') {
    pay = Math.round(pay * 1.25);
    notes.push('Early! Speed bonus.');
  } else notes.push('On time.');
  if (j.fragile && j.damage > 0) {
    pay = Math.round(pay * (1 - Math.min(0.8, j.damage * 0.2)));
    notes.push(`Cargo damaged in ${j.damage} collision${j.damage === 1 ? '' : 's'}.`);
  }
  let thanks;
  const rider = passengerOf(j);
  if (rider) {
    const tip = left >= 0 ? Math.round(pay * 0.5 * Math.max(0, 1 - j.bumps * 0.25)) : 0;
    if (tip > 0) { pay += tip; notes.push(`Tip: ${tip} cr.`); }
    thanks = j.bumps === 0 && left >= 0 ? rider.happy : left < 0 ? 'Late. I will be walking next time.' : 'Well, I am alive. That counts for something.';
  } else if (j.dest === GUILD.name) thanks = 'The Guild clerk stamps the manifest.';
  else if (j.contraband) thanks = pick(['Nobody looks at you. Nobody takes the crate. And then it is gone, and the credits are there.', '"You were never here." The credits are, though.', 'A hand from a doorway, a nod, and a credit chit that smells of spice.']);
  else thanks = pick(placeOf(j.dest).thanks);
  addCredits(pay, `Delivery · ${stop.cargo}`);
  state.stats.earned += pay;
  j.earned += pay;
  j.leg += 1;
  if (j.leg < j.stops.length) {
    const next = j.stops[j.leg];
    j.dest = next.dest;
    j.cargo = next.cargo;
    return { pay, note: notes.join(' '), thanks, more: true, next };
  }
  state.stats.delivered += 1;
  if (j.contraband) state.stats.smuggled = (state.stats.smuggled || 0) + 1;
  state.job = null;
  return { pay, note: notes.join(' '), thanks, more: false, total: j.earned };
}

export function abandonJob() {
  state.job = null;
}

// What a board shows for an offer.
export function describe(o) {
  const tags = [];
  const k = KINDS[o.kind];
  tags.push([k.label, k.cls || '']);
  if (o.kind === 'route') tags.push([`${o.stops.length} stops`, '']);
  if (o.fragile) tags.push(['fragile', 'warn']);
  if (o.heavy && o.kind !== 'freight') tags.push(['heavy · slower', '']);
  if (o.strict) tags.push(['embassy scanners', 'bad']);
  const where = o.kind === 'route'
    ? o.stops.map((s) => s.dest).join(' → ')
    : `To ${o.dest === GUILD.name || o.dest === FIXER.name ? o.dest : `${placeOf(o.dest).venue}, ${o.dest}`}`;
  const title = o.kind === 'passenger' ? `Fly ${o.cargo}` : o.kind === 'route' ? `${o.stops.length} drops: ${o.stops[0].cargo.toLowerCase()} and more` : o.cargo;
  return { title, where, tags, time: `${Math.floor(o.limit / 60)}h ${String(o.limit % 60).padStart(2, '0')}m`, km: (o.dist / 1000).toFixed(1) };
}

