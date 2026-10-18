import * as THREE from 'three';
import { state, addCredits } from './state.js';
import { decks } from './interact.js';
import { placeOf } from './places.js';
import * as trade from './trade.js';
import { openPanel, closePanel, h } from '../ui/panel.js';

// Spire Security. Patrol craft scan anything that flies close to them, and
// the embassies scan the air around their decks. Carry contraband (a
// smuggling job, or spice in the hold) and every scan fills a meter; when it
// is full a patrol gives chase. Lose it by getting far enough away for long
// enough, or by dropping under the clouds, where patrols do not follow. If it
// stays on your tail it pulls you over: submit, bribe, or run.

const SCAN_R = 120;      // a patrol's scanner reaches this far
const SCANNER_R = 170;   // an embassy's fixed scanner
const BELOW = 110;       // under the cloud deck
const ESCAPE_R = 380;
const CHASE_SPEED = 128; // faster than a courier's cruise, slower than its boost

export const police = {
  suspicion: 0, wanted: false, pursuer: null, engaged: false,
  close: 0, lost: 0, cool: 0, ran: false, stopped: false, dist: 0, nearest: Infinity,
};

let scanners = null;

export function carrying() {
  const job = !!(state.job && state.job.contraband);
  const spice = trade.contrabandCount();
  return { job, spice, any: job || spice > 0 };
}

function endChase() {
  const f = police.pursuer;
  if (f) { f.chase = null; f.chaseSpeed = 0; }
  Object.assign(police, { wanted: false, pursuer: null, engaged: false, close: 0, lost: 0, suspicion: 0, ran: false, stopped: false });
}

// player: where you are; flying: in the speeder; speed: its speed;
// flyers: every craft (police among them); hooks: { alert, lost, stop }.
export function updatePolice(dt, { player, flying, speed, flyers, hooks }) {
  const p = police;
  if (p.stopped) return;
  if (!scanners) scanners = decks.filter((d) => placeOf(d.name).strict).map((d) => new THREE.Vector3(d.x, d.y + 10, d.z));
  if (p.cool > 0) p.cool -= dt;
  const c = carrying();
  const jam = trade.upgrades().jammer ? 0.5 : 1;

  if (!p.wanted) {
    let nearest = null, nd = Infinity;
    for (const f of flyers) {
      if (f.kind !== 'police') continue;
      const d = f.pos.distanceTo(player);
      if (d < nd) { nd = d; nearest = f; }
    }
    p.nearest = nd;
    let gain = 0;
    if (c.any && flying && p.cool <= 0 && player.y > BELOW) {
      // A smuggling job is a hold full of it; a little spice is less obvious.
      const weight = c.job ? 1 : Math.min(1, 0.35 + c.spice * 0.05);
      const R = SCAN_R * jam;
      if (nd < R) gain += (1 - nd / R) * 0.6 * weight * (speed > 120 ? 1.4 : 1);
      for (const s of scanners) {
        const d = s.distanceTo(player), R2 = SCANNER_R * jam;
        if (d < R2) gain += (1 - d / R2) * 0.4 * weight;
      }
    }
    if (gain > 0) p.suspicion = Math.min(1, p.suspicion + gain * dt);
    else p.suspicion = Math.max(0, p.suspicion - dt * 0.07);
    if (p.suspicion >= 1 && nearest) {
      Object.assign(p, { wanted: true, pursuer: nearest, engaged: nd < ESCAPE_R, close: 0, lost: 0, ran: false });
      nearest.chase = player.clone();
      nearest.chase.y = Math.max(nearest.chase.y, BELOW + 15);
      nearest.chaseSpeed = CHASE_SPEED;
      hooks.alert(nd);
    }
    return;
  }

  // The chase.
  const f = p.pursuer;
  // Patrols will not follow you down into the clouds.
  f.chase.copy(player);
  f.chase.y = Math.max(f.chase.y, BELOW + 15);
  const d = f.pos.distanceTo(player);
  p.dist = d;
  if (d < ESCAPE_R * 0.8) p.engaged = true;
  // A patrol still on its way cannot be lost; one on your tail can.
  const escaping = p.engaged && (d > ESCAPE_R || player.y < BELOW);
  p.lost = escaping ? p.lost + dt : Math.max(0, p.lost - dt * 0.5);
  if (p.lost > 7) {
    endChase();
    p.cool = 25;
    state.stats.escapes = (state.stats.escapes || 0) + 1;
    hooks.lost();
    return;
  }
  const reach = flying ? 14 : 30;
  p.close = d < reach ? p.close + dt : Math.max(0, p.close - dt);
  if (p.close > (flying ? 1.6 : 0.4)) {
    p.stopped = true;
    hooks.stop();
  }
}

// What the officer finds and what it costs.
function charges() {
  const c = carrying();
  const j = state.job;
  const fine = c.any ? 150 + (c.job ? Math.round(j.pay * 0.4) : 0) + c.spice * 20 : 60;
  return { ...c, fine: fine + (police.ran ? 120 : 0), bribe: Math.round(fine * 0.7) };
}

function submit(ch, mult = 1) {
  const fine = Math.round(ch.fine * mult);
  addCredits(-fine, 'Spire Security fine');
  const lost = [];
  if (ch.job) { lost.push(state.job.cargo); state.job = null; }
  const n = trade.confiscate();
  if (n) lost.push(`${n} spice`);
  if (ch.any) state.stats.busted = (state.stats.busted || 0) + 1;
  endChase();
  police.cool = 60;
  return lost.length ? `They took the ${lost.join(' and the ')} and fined you ${fine} cr.` : `They found nothing, and fined you ${fine} cr for running.`;
}

// The stop: a panel with the officer, opened by the game when a patrol
// catches you. ctx: { toast, sfx, release }.
export function openStop(ctx) {
  const ch = charges();
  let done = false;
  const finish = (msg, kind) => {
    done = true;
    closePanel();
    ctx.toast(msg, kind, 7000);
    ctx.release();
  };
  openPanel('Spire Security', (body) => {
    body.classList.add('dialogue');
    const line = ch.any
      ? (ch.job ? `"Routine stop, pilot. Our scanner says that cargo is not ${state.job.cargo.toLowerCase().includes('spice') ? 'seasoning' : 'what your manifest says'}. Step out of the speeder."` : '"Routine stop, pilot. We picked up spice on our scanner. Open the hold."')
      : '"You ran from a patrol, pilot. Want to tell me why?"';
    body.append(h('p.dialogue-text', {}, line));
    const choices = h('div.dialogue-choices');
    const choice = (label, fn) => choices.append(h('button.btn.choice', { onclick: fn }, label));
    choice(`Submit to the search (fine ${ch.fine} cr${ch.any ? ', contraband seized' : ''})`, () => {
      ctx.sfx('lose');
      finish(submit(ch), 'bad');
    });
    if (ch.any) {
      choice(`Offer a "processing fee" (${ch.bribe} cr, risky)`, () => {
        if (!police.ran && Math.random() < 0.55) {
          addCredits(-ch.bribe, 'A quiet word with Spire Security');
          endChase();
          police.cool = 90;
          ctx.sfx('coin');
          finish('The officer pockets the chit and looks the other way. "Fly safe."', 'win');
        } else {
          ctx.sfx('lose');
          finish(`"Bribing an officer. That doubles it." ${submit(ch, 1.5)}`, 'bad');
        }
      });
    }
    if (!police.ran && ctx.flying()) {
      choice('Hit the boost and run', () => {
        police.ran = true;
        police.stopped = false;
        police.close = 0;
        police.lost = 0;
        if (police.pursuer) police.pursuer.chaseSpeed = CHASE_SPEED + 18;
        ctx.sfx('alert');
        finish('You punch it. Sirens behind you. Lose them, or get under the clouds!', 'bad');
      });
    }
    body.append(choices, h('p.muted', {}, 'Close this and you comply with the search.'));
  }, { kicker: 'You have been pulled over', onClose: () => { if (!done) { done = true; ctx.toast(submit(ch), 'bad', 7000); ctx.release(); } } });
}

// For the HUD: what to show, if anything.
export function heatStatus() {
  const p = police;
  if (p.wanted) {
    if (!p.engaged) return { label: `Patrol inbound · ${(p.dist / 1000).toFixed(1)} km`, level: 1, chase: true };
    const label = p.lost > 0 ? `Losing them… ${Math.ceil(7 - p.lost)}` : `PURSUIT · ${Math.round(p.dist)} m`;
    return { label, level: Math.min(1, p.lost / 7), chase: true, losing: p.lost > 0 };
  }
  if (!carrying().any) return null;
  if (p.suspicion > 0.01) return { label: 'Security scan', level: p.suspicion };
  if (p.nearest < 400) return { label: `Patrol nearby · ${Math.round(p.nearest)} m`, level: 0 };
  return { label: 'Carrying contraband', level: 0 };
}

export function resetPolice() {
  endChase();
  police.cool = 0;
}
