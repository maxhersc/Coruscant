import * as THREE from 'three';
import { state, addCredits, hasBuff } from './state.js';
import { decks } from './interact.js';
import { placeOf } from './places.js';
import * as trade from './trade.js';
import { world } from '../core/collision.js';
import { glowMat } from '../world/env.js';
import { openPanel, closePanel, h } from '../ui/panel.js';
import { wearing } from './wardrobe.js';

// Spire Security, and how to get them after you.
//
// Patrols scan anything that flies close; embassies scan the air round their
// decks. Carry contraband (a smuggling job, or spice in the hold) and every
// scan fills a meter. Fill it, honk at a patrol (G), ram one, or boost past one
// flat out, and you are WANTED: one star to start, more the longer the chase
// runs. Every star brings another patrol in, faster, and pursuers fire stun
// bolts that knock your speed away. Lose them by getting far enough away, by
// breaking their line of sight behind towers, or by dropping under the clouds,
// where patrols do not follow, and keep it up long enough. If one stays on your
// tail it pulls you over: submit, bribe, or run once. At three stars a stop
// means a night in a cell.

const SCAN_R = 120;      // a patrol's scanner reaches this far
const SCANNER_R = 170;   // an embassy's fixed scanner
const BELOW = 110;       // under the cloud deck
const ESCAPE_R = 380;
const CHASE_SPEED = 126; // faster than a courier's cruise, slower than its boost
const BOLT_SPEED = 230;

export const police = {
  suspicion: 0, wanted: false, stars: 0, pursuers: [], engaged: false, reason: '',
  close: 0, lost: 0, cool: 0, ran: false, stopped: false, dist: 0, nearest: Infinity,
  chaseTime: 0, ramCool: 0,
};

let scanners = null;
let bolts = [];
const _a = new THREE.Vector3();

export function carrying() {
  const job = !!(state.job && state.job.contraband);
  const spice = trade.contrabandCount();
  return { job, spice, any: job || spice > 0 };
}

// Bolts are pooled meshes in the scene; initPolice makes them.
export function initPolice(scene) {
  const geo = new THREE.CapsuleGeometry(0.35, 3.2, 3, 8).rotateX(Math.PI / 2);
  const mat = glowMat(0xff3344, 5);
  bolts = Array.from({ length: 12 }, () => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0 };
  });
}

function releasePursuers() {
  for (const f of police.pursuers) { f.chase = null; f.chaseSpeed = 0; f.fireT = 0; }
  police.pursuers = [];
}

function endChase() {
  releasePursuers();
  Object.assign(police, { wanted: false, stars: 0, engaged: false, close: 0, lost: 0, suspicion: 0, ran: false, stopped: false, chaseTime: 0, reason: '' });
}

function freePatrols(flyers) {
  return flyers.filter((f) => f.kind === 'police' && !f.chase);
}

function nearestTo(list, player) {
  let best = null, bd = Infinity;
  for (const f of list) {
    const d = f.pos.distanceTo(player);
    if (d < bd) { bd = d; best = f; }
  }
  return [best, bd];
}

function enlist(f, player) {
  if (!f || police.pursuers.includes(f)) return;
  f.chase = player.clone();
  f.chase.y = Math.max(f.chase.y, BELOW + 15);
  f.chaseSpeed = CHASE_SPEED + 12 * Math.max(0, police.stars - 1);
  f.fireT = 1.5 + Math.random() * 2;
  police.pursuers.push(f);
}

function startChase(stars, f, player, reason, hooks) {
  police.wanted = true;
  police.stars = stars;
  police.reason = reason;
  police.engaged = f.pos.distanceTo(player) < ESCAPE_R;
  Object.assign(police, { close: 0, lost: 0, ran: false, chaseTime: 0 });
  enlist(f, player);
  hooks.alert(f.pos.distanceTo(player), reason);
}

function raise(stars, flyers, player, hooks, reason) {
  const p = police;
  if (stars <= p.stars) return;
  p.stars = Math.min(3, stars);
  if (reason) p.reason = reason;
  // Every star brings another patrol in.
  while (p.pursuers.length < p.stars) {
    const [f] = nearestTo(freePatrols(flyers), player);
    if (!f) break;
    enlist(f, player);
  }
  hooks.escalate(p.stars);
}

// Something you did that Spire Security takes personally. kind: 'taunt' | 'ram'.
export function crime(kind, { player, flyers, flying, hooks }) {
  const [f, d] = nearestTo(flyers.filter((q) => q.kind === 'police'), player);
  if (!f) return false;
  if (kind === 'taunt' && (!flying || d > 150)) return false;
  const reason = kind === 'taunt' ? 'Honked at a patrol' : 'Rammed a patrol craft';
  if (!police.wanted) startChase(kind === 'ram' ? 2 : 1, f, player, reason, hooks);
  else raise(police.stars + 1, flyers, player, hooks, reason);
  if (kind === 'ram') raise(2, flyers, player, hooks);
  return true;
}

// player: where you are; flying: in the speeder; speed: its speed;
// flyers: every craft (police among them); hooks: { alert, escalate, lost, stop, stun, ram }.
export function updatePolice(dt, { player, flying, speed, flyers, hooks, indoors = false }) {
  const p = police;
  updateBolts(dt, player, flying, hooks);
  if (p.stopped) return;
  if (!scanners) scanners = decks.filter((d) => placeOf(d.name).strict).map((d) => new THREE.Vector3(d.x, d.y + 10, d.z));
  if (p.cool > 0) p.cool -= dt;
  if (p.ramCool > 0) p.ramCool -= dt;
  const c = carrying();
  const up = trade.upgrades();
  const stealth = (up.jammer ? 0.5 : 1) * (wearing('cloak') ? 0.6 : 1) * (state.speeder === 'ghost' ? 0.5 : 1) * (up.diplomat ? 0.75 : 1) * (hasBuff('calm') ? 0.7 : 1);
  const patrols = flyers.filter((f) => f.kind === 'police');
  const [nearest, nd] = nearestTo(patrols, player);
  p.nearest = nd;

  // Ramming a patrol is a crime whatever you carry.
  if (flying && nd < 5.5 && speed > 25 && p.ramCool <= 0) {
    p.ramCool = 2;
    crime('ram', { player, flyers, flying, hooks });
    return;
  }

  if (!p.wanted) {
    let gain = 0;
    if (c.any && flying && p.cool <= 0 && player.y > BELOW) {
      // A smuggling job is a hold full of it; a little spice is less obvious.
      const weight = c.job ? 1 : Math.min(1, 0.35 + c.spice * 0.05);
      const R = SCAN_R * stealth;
      if (nd < R) gain += (1 - nd / R) * 0.6 * weight * (speed > 120 ? 1.4 : 1);
      for (const s of up.diplomat ? [] : scanners) {
        const d = s.distanceTo(player), R2 = SCANNER_R * stealth;
        if (d < R2) gain += (1 - d / R2) * 0.4 * weight;
      }
    }
    if (gain > 0) p.suspicion = Math.min(1, p.suspicion + gain * dt);
    else p.suspicion = Math.max(0, p.suspicion - dt * 0.07);
    if (p.suspicion >= 1 && nearest) startChase(1, nearest, player, 'Contraband on board', hooks);
    else if (flying && nearest && nd < 45 && speed > 155 && p.cool <= 0) startChase(1, nearest, player, 'Reckless flying past a patrol', hooks);
    return;
  }

  // The chase. The longer it runs, the more of them there are.
  if (p.engaged) p.chaseTime += dt;
  if (p.chaseTime > 30 && p.stars < 2) raise(2, flyers, player, hooks, 'Evading Spire Security');
  if (p.chaseTime > 60 && p.stars < 3) raise(3, flyers, player, hooks, 'Evading Spire Security');
  let d = Infinity, los = false, closest = null;
  for (const f of p.pursuers) {
    // Patrols will not follow you down into the clouds.
    f.chase.copy(player);
    f.chase.y = Math.max(f.chase.y, BELOW + 15);
    f.chaseSpeed = CHASE_SPEED + 12 * (p.stars - 1) + (p.ran ? 18 : 0);
    const fd = f.pos.distanceTo(player);
    if (fd < d) { d = fd; closest = f; }
    const seen = fd < 600 && world.segmentHit(f.pos.x, f.pos.y, f.pos.z, player.x, player.y + 1, player.z, 20) >= 1;
    los = los || seen;
    // Stun bolts, faster with every star.
    f.fireT -= dt;
    if (flying && p.engaged && seen && fd < 260 && fd > 12 && f.fireT <= 0) {
      f.fireT = Math.max(1.2, 3.6 - p.stars * 0.7) + Math.random();
      fire(f.pos, player, hooks);
    }
  }
  p.dist = d;
  if (d < ESCAPE_R * 0.8) p.engaged = true;
  // A patrol still on its way cannot be lost; ones on your tail can, by
  // distance, by the clouds, or by putting towers between you.
  // Inside a building they cannot see you or reach you.
  const escaping = p.engaged && (indoors || d > ESCAPE_R || player.y < BELOW || (!los && d > 90));
  const need = 4 + p.stars * 2;
  p.lost = escaping ? p.lost + dt : Math.max(0, p.lost - dt * 0.5);
  p.need = need;
  if (p.lost > need) {
    const stars = p.stars, long = p.chaseTime;
    endChase();
    p.cool = 25;
    state.stats.escapes = (state.stats.escapes || 0) + 1;
    // The Undercity pays in reputation, and reputation pays.
    const cred = long > 10 ? 40 * stars : 0;
    if (cred) addCredits(cred, 'Street cred: you lost Spire Security');
    hooks.lost(stars, cred);
    return;
  }
  // Up close they ram you.
  if (flying && closest && d < 7 && p.ramCool <= 0) {
    p.ramCool = 1.4;
    hooks.ram(closest);
  }
  const reach = flying ? 14 : 30;
  p.close = d < reach && !indoors ? p.close + dt : Math.max(0, p.close - dt);
  if (p.close > (flying ? 1.6 : 0.4)) {
    p.stopped = true;
    hooks.stop();
  }
}

// A bolt aimed where you will be.
function fire(from, player, hooks) {
  const b = bolts.find((q) => q.life <= 0);
  if (!b) return;
  const lead = player.clone().addScaledVector(hooks.velocity(), from.distanceTo(player) / BOLT_SPEED);
  b.pos.copy(from);
  b.vel.subVectors(lead, from).normalize().multiplyScalar(BOLT_SPEED);
  b.life = 2.2;
  b.mesh.visible = true;
  hooks.shot?.();
}

function updateBolts(dt, player, flying, hooks) {
  for (const b of bolts) {
    if (b.life <= 0) continue;
    b.life -= dt;
    b.pos.addScaledVector(b.vel, dt);
    b.mesh.position.copy(b.pos);
    b.mesh.lookAt(_a.copy(b.pos).add(b.vel));
    let done = b.life <= 0 || world.pointInside(b.pos.x, b.pos.y, b.pos.z);
    if (!done && flying && b.pos.distanceTo(player) < 3.2) {
      done = true;
      hooks.stun();
    }
    if (done) { b.life = 0; b.mesh.visible = false; }
  }
}

// What the officer finds and what it costs.
function charges() {
  const c = carrying();
  const j = state.job;
  const stars = Math.max(1, police.stars);
  const base = c.any ? 150 + (c.job ? Math.round(j.pay * 0.4) : 0) + c.spice * 20 : 40;
  const fine = base + 90 * stars + (police.ran ? 120 : 0);
  return { ...c, stars, fine, bribe: Math.round(fine * 0.7), jail: stars >= 3 };
}

function submit(ch, ctx, mult = 1) {
  const fine = Math.round(ch.fine * mult);
  addCredits(-fine, 'Spire Security fine');
  const lost = [];
  if (ch.job) { lost.push(state.job.cargo); state.job = null; }
  const n = trade.confiscate();
  if (n) lost.push(`${n} spice`);
  state.stats.busted = (state.stats.busted || 0) + 1;
  endChase();
  police.cool = 60;
  let msg = lost.length ? `They took the ${lost.join(' and the ')} and fined you ${fine} cr.` : `They found nothing to take, and fined you ${fine} cr.`;
  if (ch.jail) {
    ctx.jail?.();
    msg += ' Three stars buys you a night in a holding cell.';
  }
  return msg;
}

// The stop: a panel with the officer, opened by the game when a patrol
// catches you. ctx: { toast, sfx, release, flying, jail }.
export function openStop(ctx) {
  const ch = charges();
  let done = false;
  const finish = (msg, kind) => {
    done = true;
    closePanel();
    ctx.toast(msg, kind, 7000);
    ctx.release();
  };
  const stars = '★'.repeat(ch.stars);
  openPanel('Spire Security', (body) => {
    body.classList.add('dialogue');
    const line = ch.any
      ? (ch.job ? `"Pilot, our scanner says that cargo is not ${state.job.cargo.toLowerCase().includes('spice') ? 'seasoning' : 'what your manifest says'}. Step out of the speeder."` : '"We picked up spice on our scanner, pilot. Open the hold."')
      : `"${police.reason || 'You ran from a patrol'}, pilot. ${ch.stars >= 3 ? 'Half the precinct is out here because of you.' : 'Want to tell me why?'}"`;
    body.append(h('p.dialogue-text', {}, line));
    const choices = h('div.dialogue-choices');
    const choice = (label, fn) => choices.append(h('button.btn.choice', { onclick: fn }, label));
    choice(`Submit (fine ${ch.fine} cr${ch.any ? ', contraband seized' : ''}${ch.jail ? ', a night in the cells' : ''})`, () => {
      ctx.sfx('lose');
      finish(submit(ch, ctx), 'bad');
    });
    const odds = Math.max(0.2, 0.65 - 0.12 * ch.stars) + (wearing('formal') ? 0.15 : 0);
    choice(`Offer a "processing fee" (${ch.bribe} cr, ${odds > 0.5 ? 'might work' : 'long odds'})`, () => {
      if (!police.ran && Math.random() < odds) {
        addCredits(-ch.bribe, 'A quiet word with Spire Security');
        endChase();
        police.cool = 90;
        ctx.sfx('coin');
        finish('The officer pockets the chit and looks the other way. "Fly safe."', 'win');
      } else {
        ctx.sfx('lose');
        finish(`"Bribing an officer. That costs extra." ${submit(ch, ctx, 1.5)}`, 'bad');
      }
    });
    if (!police.ran && ctx.flying()) {
      choice('Hit the boost and run', () => {
        police.ran = true;
        police.stopped = false;
        police.close = 0;
        police.lost = 0;
        police.stars = Math.min(3, police.stars + 1);
        ctx.sfx('alert');
        finish('You punch it. Sirens behind you. Lose them, or get under the clouds!', 'bad');
      });
    }
    body.append(choices, h('p.muted', {}, 'Close this and you submit.'));
  }, { kicker: `Pulled over · ${stars}`, onClose: () => { if (!done) { done = true; ctx.toast(submit(ch, ctx), 'bad', 7000); ctx.release(); } } });
}

// For the HUD: what to show, if anything.
export function heatStatus() {
  const p = police;
  if (p.wanted) {
    const stars = '★'.repeat(p.stars) + '☆'.repeat(3 - p.stars);
    if (!p.engaged) return { label: `${stars} Patrol inbound · ${(p.dist / 1000).toFixed(1)} km`, level: 1, chase: true };
    const label = p.lost > 0 ? `${stars} Losing them… ${Math.ceil(p.need - p.lost)}` : `${stars} PURSUIT · ${Math.round(p.dist)} m`;
    return { label, level: p.lost > 0 ? Math.min(1, p.lost / p.need) : Math.min(1, p.chaseTime / 60), chase: true, losing: p.lost > 0 };
  }
  if (!carrying().any) return null;
  if (p.suspicion > 0.01) return { label: 'Security scan', level: p.suspicion };
  if (p.nearest < 400) return { label: `Patrol nearby · ${Math.round(p.nearest)} m`, level: 0 };
  return { label: 'Carrying contraband', level: 0 };
}

// Wipe the slate: a sliced record, or a long sleep in a safe house.
export function clearHeat() {
  endChase();
  police.cool = 30;
}

export function resetPolice() {
  endChase();
  police.cool = 0;
}
