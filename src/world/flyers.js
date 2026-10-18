import * as THREE from 'three';
import { CELL, LEVELS } from '../config.js';
import { makeRng } from '../core/rng.js';
import { buildSpeederMesh } from '../player/speeder.js';
import { glowMat } from './env.js';
import { pads } from '../systems/interact.js';
import { world } from '../core/collision.js';

// Craft that fly near you rather than on the far skylanes: air taxis that
// land on pads, wait, and take off for another, and police patrols with
// flashing light bars. They route along the streets, which are kept clear
// of towers, so they never fly through a building.

const TAXI_COLORS = [[0xe8c040, 0xffcc55], [0xd8d8d0, 0x66ddff], [0x2a2a30, 0xff7733], [0xa83a2a, 0xffaa55], [0x3a5a8a, 0x66aaff]];

// Nearest street line to v (streets run on the half-cells).
const street = (v) => (Math.round(v / CELL - 0.5) + 0.5) * CELL;

// Altitudes to avoid near the hub: each level's slab and what stands on it.
const BANDS = Object.values(LEVELS).map((L) => [L - 6, L + 34]);
function clearAltitude(a) {
  for (const [lo, hi] of BANDS) if (a > lo && a < hi) return hi + 4;
  return a;
}

// Where a craft leaves or joins the street grid for a pad, at the pad's own
// height plus a margin. Hub pads stick straight out from the hub, so their
// corridor runs outward along that axis; deck pads use the nearest street.
function streetPoint(pad) {
  const y = pad.y + 12;
  if (Math.hypot(pad.x, pad.z) < 200) {
    if (Math.abs(pad.x) > Math.abs(pad.z)) return { p: new THREE.Vector3(Math.sign(pad.x) * 180, y, pad.z), axis: 'x' };
    return { p: new THREE.Vector3(pad.x, y, Math.sign(pad.z) * 180), axis: 'z' };
  }
  return { p: new THREE.Vector3(street(pad.x), y, pad.z), axis: 'x' };
}

// axis 'x' means the point lies on a street of constant x (running along z).
function route(from, fromPad, to, toPad, cruise) {
  const a = streetPoint(fromPad), b = streetPoint(toPad);
  const pts = [from.clone(), new THREE.Vector3(from.x, from.y + 12, from.z), a.p.clone()];
  const A = a.p.clone(); A.y = cruise;
  const B = b.p.clone(); B.y = cruise;
  pts.push(A);
  if (a.axis === 'x' && b.axis === 'x') {
    const Z = street(B.z);
    pts.push(new THREE.Vector3(A.x, cruise, Z), new THREE.Vector3(B.x, cruise, Z));
  } else if (a.axis === 'z' && b.axis === 'x') {
    pts.push(new THREE.Vector3(B.x, cruise, A.z));
  } else if (a.axis === 'x' && b.axis === 'z') {
    pts.push(new THREE.Vector3(A.x, cruise, B.z));
  } else {
    const X = street(B.x);
    pts.push(new THREE.Vector3(X, cruise, A.z), new THREE.Vector3(X, cruise, B.z));
  }
  pts.push(B, b.p.clone(), new THREE.Vector3(to.x, to.y + 12, to.z), to.clone());
  return pts.filter((p, i) => i === 0 || p.distanceToSquared(pts[i - 1]) > 1);
}

export function createFlyers(scene) {
  const rng = makeRng(4242);
  const flyers = [];
  const hubPads = pads.filter((p) => Math.hypot(p.x, p.z) < 200);
  const deckPads = pads.filter((p) => Math.hypot(p.x, p.z) >= 200 && !p.hidden);

  const make = (kind) => {
    const [color, accent] = kind === 'police' ? [0x1c2840, 0x3366ff] : rng.pick(TAXI_COLORS);
    const built = buildSpeederMesh(kind === 'police' ? 'interceptor' : 'courier', { color, accent });
    if (kind === 'police') {
      const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.25), glowMat(0xff2233, 5));
      const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.25), glowMat(0x2255ff, 5));
      red.position.set(-0.35, 0.75, 0.2);
      blue.position.set(0.35, 0.75, 0.2);
      built.group.add(red, blue);
      built.lights = [red, blue];
    } else {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.35), glowMat(0xffd166, 3));
      lamp.position.set(0, 0.7, 0.1);
      built.group.add(lamp);
    }
    scene.add(built.group);
    return built;
  };

  const pickPad = (exclude, avoid) => {
    for (let k = 0; k < 10; k++) {
      const p = rng.chance(0.5) ? rng.pick(hubPads) : rng.pick(deckPads);
      if (p === exclude) continue;
      if (avoid && Math.hypot(p.x - avoid.x, p.z - avoid.z) < 10 && Math.abs(p.y - avoid.y) < 5) continue;
      return p;
    }
    return rng.pick(hubPads);
  };

  // Taxis start parked on random pads.
  for (let i = 0; i < 16; i++) {
    const built = make('taxi');
    const pad = i < hubPads.length ? hubPads[i] : pickPad();
    const f = {
      kind: 'taxi', ...built, pad,
      pos: new THREE.Vector3(pad.x + rng.range(-5, 5), pad.y + 0.9, pad.z + rng.range(-5, 5)),
      path: null, seg: 0, speed: rng.range(45, 70), wait: rng.range(2, 25), yaw: rng.range(0, 6.28), bank: 0,
    };
    flyers.push(f);
  }
  // Police loop rectangles of streets. A patrol that is sent after someone
  // (f.chase, set by the police system) leaves its loop and closes in.
  for (let i = 0; i < 12; i++) {
    const built = make('police');
    const cx = street(rng.range(-1700, 1700)), cz = street(rng.range(-1700, 1700));
    const w = CELL * rng.int(2, 6), d = CELL * rng.int(2, 6);
    const alt = clearAltitude(rng.range(160, 520));
    const loop = [
      new THREE.Vector3(cx, alt, cz), new THREE.Vector3(cx + w, alt, cz),
      new THREE.Vector3(cx + w, alt, cz + d), new THREE.Vector3(cx, alt, cz + d),
    ];
    flyers.push({ kind: 'police', ...built, pos: loop[0].clone(), path: loop, loop: true, seg: 1, speed: rng.range(80, 120), yaw: 0, bank: 0 });
  }

  const dir = new THREE.Vector3(), nrm = new THREE.Vector3();
  // Face the direction of horizontal travel; bank into turns.
  const orient = (f, d3, dt, t, flash) => {
    if (Math.abs(d3.x) + Math.abs(d3.z) > 0.5) {
      const want = Math.atan2(d3.x, d3.z);
      let d = want - f.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      f.yaw += d * Math.min(1, dt * 3);
      f.bank += (THREE.MathUtils.clamp(-d * 0.8, -0.6, 0.6) - f.bank) * Math.min(1, dt * 3);
    } else f.bank *= 1 - Math.min(1, dt * 3);
    f.group.position.copy(f.pos);
    f.group.rotation.set(0, f.yaw, f.bank, 'YXZ');
    f.exhaust.color.setRGB(2.4, 1.6, 0.8);
    if (f.lights) {
      const on = Math.floor(t * flash) % 2 === 0;
      f.lights[0].visible = on;
      f.lights[1].visible = !on;
    }
  };
  const update = (dt, t, avoid) => {
    for (const f of flyers) {
      if (f.kind === 'taxi' && !f.path) {
        f.wait -= dt;
        f.group.position.set(f.pos.x, f.pos.y + Math.sin(t * 1.5 + f.speed) * 0.05, f.pos.z);
        f.group.rotation.set(0, f.yaw, 0);
        f.exhaust.color.setRGB(0.4, 0.3, 0.2);
        if (f.wait <= 0) {
          const next = pickPad(f.pad, avoid);
          const to = new THREE.Vector3(next.x + rng.range(-4, 4), next.y + 0.9, next.z + rng.range(-4, 4));
          const cruise = clearAltitude(Math.max(f.pos.y, to.y) + rng.range(25, 90));
          f.path = route(f.pos, f.pad, to, next, cruise);
          f.seg = 1;
          f.pad = next;
        }
        continue;
      }
      if (f.chase) {
        // Hold station a few metres off whoever it is chasing.
        dir.subVectors(f.chase, f.pos);
        const dist = dir.length();
        const step = Math.min(Math.max(0, dist - 9), f.chaseSpeed * dt);
        if (dist > 0.01) f.pos.addScaledVector(dir, step / dist);
        // Blocked by a tower: slide along it and climb over.
        if (world.resolveSphere(f.pos, 2.5, nrm)) f.pos.y += 45 * dt;
        orient(f, dir, dt, t, 12);
        continue;
      }
      const target = f.path[f.seg];
      dir.subVectors(target, f.pos);
      const dist = dir.length();
      // Slow for the last stretch of a vertical descent or a landing.
      const landing = f.kind === 'taxi' && f.seg === f.path.length - 1;
      const v = landing ? Math.min(f.speed, 4 + dist * 1.2) : f.speed;
      const step = v * dt;
      if (dist <= step) {
        f.pos.copy(target);
        f.seg++;
        if (f.seg >= f.path.length) {
          if (f.loop) f.seg = 0;
          else { f.path = null; f.wait = rng.range(6, 30); continue; }
        }
      } else {
        f.pos.addScaledVector(dir, step / dist);
      }
      // A patrol back from a chase slides around towers on its way home.
      if (f.kind === 'police' && world.resolveSphere(f.pos, 2.5, nrm)) f.pos.y += 45 * dt;
      orient(f, dir, dt, t, 6);
    }
  };
  return { flyers, update };
}
