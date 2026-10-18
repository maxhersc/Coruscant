import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { world } from '../core/collision.js';
import { makeRng } from '../core/rng.js';
import { stdMat, glowMat } from '../world/env.js';

// The crowd. People and droids wander the walkable zones, idle, chat in
// pairs, and stop to talk to you. Rendered as instanced meshes.

const CLOTH = [0x6b2b2b, 0x2b3f5c, 0x4a4a4a, 0x7a6a4a, 0x2f4f3a, 0x5a2f5f, 0x8a8278, 0x1e1e24, 0x9a5a2a, 0x3a6a7a, 0xb0a890, 0x6a1a3a];
const PANTS = [0x2a2a30, 0x3a3226, 0x1e2a3a, 0x4a4a4a, 0x2f2a24, 0x5a4a3a];
const SKIN = [0xf0c8a0, 0xd8a47c, 0xb57a52, 0x8a5636, 0x5c3a24, 0x7aa0c8, 0x6aa070, 0xa86a9a, 0x9a9aa4, 0xc8704a, 0x4a8a8a];

const LINES = [
  'Traffic on the 300 lanes is murder this cycle.',
  'They say the lower levels have not seen sunlight in a thousand years.',
  'I put my whole week on Ryn Vasko in the Skyrace. Do not tell my partner.',
  'The noodles at Orbital are the only honest thing on this level.',
  'You a courier? The Guild pays double for runs to the outer decks.',
  'Watch yourself in the Galleria. Vool lends easy and collects hard.',
  'Have you been up to the Skydeck? You can see the Temple from there.',
  'My cousin flies freight on the long lanes. Says the haulers never stop.',
  'Rent went up again. Everything goes up here except the lower levels.',
  'Some nights I swear the whole city hums in one note.',
  'The house always wins at twenty-one. Mostly.',
  'I heard the Assembly is voting on the new skylane tolls.',
  'Need a faster speeder? Jump Station has the new Vexa Sport.',
  'Do not fall off the edge. The medical droids charge by the metre.',
  'The Low Orbit pours a decent ale, if you can find a stool.',
  'Beep-boop. (The droid ignores you politely.)',
  'You look like you have somewhere to be.',
  'Spare a credit? No? Fair enough.',
  'It is never really night here. The city does not allow it.',
  'Three moons tonight. Good luck for gamblers, they say.',
  'The deck traders out in the city pay double for the right goods. Each one wants something different.',
  'Buy tech at Droid Parts, sell it to a deck that wants it. That is how my uncle paid for his speeder.',
  'The Pawn Shop buys anything. Badly, but anything.',
  'There is a market under the clouds where nobody asks what is in the crate.',
  'Prices at the Galleria change every morning. Watch for the green ones.',
];

const DROID_LINES = [
  'Greetings. I am not programmed for small talk.',
  'Please step aside. I am on an errand of moderate importance.',
  'Whirr. Click. Have a productive cycle.',
  'My master is late. My master is always late.',
];

export function createCrowd(zones) {
  const rng = makeRng(9001);
  const npcs = [];
  const tmp = [];

  const free = (x, z, y) => {
    // Keep out of the lift car so nobody rides it by accident.
    if (x > -8.5 && x < 8.5 && z > -56 && z < -39) return false;
    const g = world.groundAt(x, z, y, 0.3, 0);
    if (!(g > y - 0.4)) return false;
    const boxes = world.query(x - 0.35, z - 0.35, x + 0.35, z + 0.35, tmp);
    for (const b of boxes) {
      if (b.max[1] > y + 0.3 && b.min[1] < y + 1.7) {
        if (x > b.min[0] - 0.35 && x < b.max[0] + 0.35 && z > b.min[2] - 0.35 && z < b.max[2] + 0.35) return false;
      }
    }
    return true;
  };

  const randomPoint = (zn, out) => {
    for (let k = 0; k < 20; k++) {
      const x = rng.range(zn.x0, zn.x1), z = rng.range(zn.z0, zn.z1);
      if (free(x, z, zn.y)) return out.set(x, zn.y, z);
    }
    return null;
  };

  for (const zn of zones) {
    for (let i = 0; i < zn.count; i++) {
      const pos = randomPoint(zn, new THREE.Vector3());
      if (!pos) continue;
      const droid = rng.chance(0.12);
      npcs.push({
        zone: zn,
        pos,
        target: pos.clone(),
        heading: rng.range(0, Math.PI * 2),
        speed: droid ? rng.range(0.8, 1.3) : rng.range(0.9, 1.6),
        state: 'idle',
        timer: rng.range(0, 6),
        scale: droid ? rng.range(0.8, 1.0) : rng.range(0.88, 1.14),
        width: rng.range(0.9, 1.15),
        droid,
        robe: rng.chance(0.3),
        cloth: rng.pick(CLOTH),
        pants: rng.pick(PANTS),
        skin: rng.pick(SKIN),
        // Head shape: [x, y, z] scale. Some species have long skulls, some broad.
        head: rng.pick([[1, 1, 1], [1, 1, 1], [1, 1, 1], [0.9, 1.35, 1.0], [1.2, 0.9, 1.1], [0.85, 1.15, 1.2]]),
        tails: rng.chance(0.1),
        phase: rng.range(0, 10),
        talkTimer: 0,
        line: droid ? rng.pick(DROID_LINES) : rng.pick(LINES),
      });
    }
  }

  // People: a torso (coat or robe), a head, two legs and two arms, each an
  // instanced mesh so limbs can swing. Droids are a single shell.
  const nonIdx = (g) => (g.index ? g.toNonIndexed() : g);
  const coatGeo = mergeGeometries([
    new THREE.CapsuleGeometry(0.2, 0.36, 2, 8).translate(0, 1.22, 0),
    new THREE.CylinderGeometry(0.21, 0.27, 0.42, 8).translate(0, 0.86, 0),
    new THREE.BoxGeometry(0.5, 0.11, 0.24).translate(0, 1.46, 0),
  ].map(nonIdx));
  const robeGeo = mergeGeometries([
    new THREE.CapsuleGeometry(0.2, 0.36, 2, 8).translate(0, 1.22, 0),
    new THREE.CylinderGeometry(0.2, 0.34, 1.05, 8).translate(0, 0.55, 0),
    new THREE.BoxGeometry(0.5, 0.11, 0.24).translate(0, 1.46, 0),
  ].map(nonIdx));
  const headGeo = new THREE.SphereGeometry(0.135, 10, 7);
  const legGeo = new THREE.CapsuleGeometry(0.075, 0.68, 1, 6).translate(0, -0.42, 0);
  const armGeo = new THREE.CapsuleGeometry(0.06, 0.5, 1, 6).translate(0, -0.3, 0);
  const tailGeo = mergeGeometries([
    new THREE.CapsuleGeometry(0.05, 0.5, 1, 5).translate(-0.07, -0.25, 0),
    new THREE.CapsuleGeometry(0.05, 0.42, 1, 5).translate(0.07, -0.21, 0),
  ].map(nonIdx));
  const droidGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.26, 0.3, 0.9, 12).translate(0, 0.55, 0),
    new THREE.SphereGeometry(0.26, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.0, 0),
    new THREE.BoxGeometry(0.12, 0.1, 0.5).translate(-0.3, 0.2, 0),
    new THREE.BoxGeometry(0.12, 0.1, 0.5).translate(0.3, 0.2, 0),
  ].map(nonIdx));
  const eyeGeo = new THREE.SphereGeometry(0.06, 8, 6).translate(0, 1.08, 0.22);

  const people = npcs.filter((n) => !n.droid);
  const droids = npcs.filter((n) => n.droid);
  const coats = people.filter((n) => !n.robe), robes = people.filter((n) => n.robe);
  const tailed = people.filter((n) => n.tails);
  const clothMat = stdMat(0xffffff, { roughness: 0.85, metalness: 0.05 });
  const skinMat = stdMat(0xffffff, { roughness: 0.7, metalness: 0 });
  const IM = (geo, m, n) => {
    const mesh = new THREE.InstancedMesh(geo, m, Math.max(n, 1));
    mesh.count = n;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return mesh;
  };
  const coatMesh = IM(coatGeo, clothMat, coats.length);
  const robeMesh = IM(robeGeo, clothMat, robes.length);
  const headMesh = IM(headGeo, skinMat, people.length);
  const legMesh = IM(legGeo, clothMat, coats.length * 2);
  const armMesh = IM(armGeo, clothMat, people.length * 2);
  const tailMesh = IM(tailGeo, skinMat, tailed.length);
  const droidMesh = IM(droidGeo, stdMat(0xffffff, { roughness: 0.3, metalness: 0.8 }), droids.length);
  const eyeMesh = IM(eyeGeo, glowMat(0xff5533, 3), droids.length);
  const c = new THREE.Color();
  coats.forEach((n, i) => {
    n.torso = coatMesh; n.torsoIdx = i; n.legIdx = i * 2;
    coatMesh.setColorAt(i, c.set(n.cloth));
    legMesh.setColorAt(i * 2, c.set(n.pants));
    legMesh.setColorAt(i * 2 + 1, c);
  });
  robes.forEach((n, i) => { n.torso = robeMesh; n.torsoIdx = i; n.legIdx = -1; robeMesh.setColorAt(i, c.set(n.cloth)); });
  people.forEach((n, i) => {
    n.index = i;
    headMesh.setColorAt(i, c.set(n.skin));
    armMesh.setColorAt(i * 2, c.set(n.cloth).multiplyScalar(0.85));
    armMesh.setColorAt(i * 2 + 1, c);
  });
  tailed.forEach((n, i) => { n.tailIdx = i; tailMesh.setColorAt(i, c.set(n.skin)); });
  const DROID_COL = [0xc0c4c8, 0xd8b048, 0x8a9aa8, 0xe8e8e0, 0x6a7078, 0xb04a3a];
  droids.forEach((n, i) => {
    n.index = i;
    droidMesh.setColorAt(i, c.set(rng.pick(DROID_COL)));
  });
  const meshes = [coatMesh, robeMesh, headMesh, legMesh, armMesh, tailMesh, droidMesh, eyeMesh];
  const group = new THREE.Group();
  group.add(...meshes);

  const base = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  const out = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const part = (mesh, idx, x, y, z, rx, rz, sx = 1, sy = 1, sz = 1) => {
    e.set(rx, 0, rz);
    q.setFromEuler(e);
    p.set(x, y, z);
    s.set(sx, sy, sz);
    local.compose(p, q, s);
    out.multiplyMatrices(base, local);
    mesh.setMatrixAt(idx, out);
  };
  const writeMatrix = (n) => {
    const moving = n.state === 'walk';
    const bob = moving ? Math.abs(Math.sin(n.phase)) * 0.04 : 0;
    e.set(0, n.heading, 0);
    q.setFromEuler(e);
    s.set(n.scale * n.width, n.scale, n.scale * n.width);
    p.copy(n.pos);
    p.y += bob;
    base.compose(p, q, s);
    if (n.droid) {
      droidMesh.setMatrixAt(n.index, base);
      eyeMesh.setMatrixAt(n.index, base);
      return;
    }
    const swing = moving ? Math.sin(n.phase) * 0.55 : 0;
    n.torso.setMatrixAt(n.torsoIdx, base);
    const [hx, hy, hz] = n.head;
    part(headMesh, n.index, 0, 1.66 + (hy - 1) * 0.07, 0, 0, 0, hx, hy, hz);
    if (n.legIdx >= 0) {
      part(legMesh, n.legIdx, -0.1, 0.86, 0, swing, 0);
      part(legMesh, n.legIdx + 1, 0.1, 0.86, 0, -swing, 0);
    }
    part(armMesh, n.index * 2, -0.27, 1.44, 0, -swing * 0.8, -0.1);
    part(armMesh, n.index * 2 + 1, 0.27, 1.44, 0, swing * 0.8, 0.1);
    if (n.tails) part(tailMesh, n.tailIdx, 0, 1.68, -0.1, 0.35, 0);
  };
  npcs.forEach(writeMatrix);

  const dir = new THREE.Vector3();
  const update = (dt, playerPos, camPos) => {
    for (const n of npcs) {
      const dx = n.pos.x - camPos.x, dz = n.pos.z - camPos.z, dy = n.pos.y - camPos.y;
      if (dx * dx + dz * dz + dy * dy > 350 * 350) continue;
      n.timer -= dt;
      if (n.talkTimer > 0) {
        n.talkTimer -= dt;
        n.state = 'idle';
        const want = Math.atan2(playerPos.x - n.pos.x, playerPos.z - n.pos.z);
        n.heading += angleDiff(want, n.heading) * Math.min(1, dt * 5);
      } else if (n.state === 'idle') {
        if (n.timer <= 0) {
          const t = randomPoint(n.zone, n.target);
          if (t) {
            n.state = 'walk';
            n.timer = 30;
          } else n.timer = 2;
        }
      } else {
        dir.set(n.target.x - n.pos.x, 0, n.target.z - n.pos.z);
        const dist = dir.length();
        if (dist < 0.4 || n.timer <= 0) {
          n.state = 'idle';
          n.timer = rng.chance(0.3) ? rng.range(6, 20) : rng.range(0.5, 4);
        } else {
          dir.multiplyScalar(1 / dist);
          const step = n.speed * dt;
          const nx = n.pos.x + dir.x * step, nz = n.pos.z + dir.z * step;
          if (free(nx, nz, n.zone.y)) {
            n.pos.x = nx;
            n.pos.z = nz;
            n.heading += angleDiff(Math.atan2(dir.x, dir.z), n.heading) * Math.min(1, dt * 6);
            n.phase += dt * n.speed * 4.8;
          } else {
            n.state = 'idle';
            n.timer = rng.range(0.3, 1.5);
          }
        }
      }
      // Step aside for the player.
      const px = n.pos.x - playerPos.x, pz = n.pos.z - playerPos.z;
      const pd = px * px + pz * pz;
      if (pd < 0.7 * 0.7 && Math.abs(n.pos.y - playerPos.y) < 1.5 && pd > 1e-4) {
        const d = Math.sqrt(pd);
        const nx = playerPos.x + (px / d) * 0.7, nz = playerPos.z + (pz / d) * 0.7;
        if (free(nx, nz, n.zone.y)) { n.pos.x = nx; n.pos.z = nz; }
      }
      writeMatrix(n);
    }
    for (const m of meshes) m.instanceMatrix.needsUpdate = true;
  };

  const nearest = (p, maxD = 2.4) => {
    let best = null, bd = maxD;
    for (const n of npcs) {
      if (Math.abs(n.pos.y - p.y) > 1.5) continue;
      const d = Math.hypot(n.pos.x - p.x, n.pos.z - p.z);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  };

  const countNear = (p, r) => {
    let k = 0;
    for (const n of npcs) {
      if (Math.abs(n.pos.y - p.y) < 20 && Math.abs(n.pos.x - p.x) < r && Math.abs(n.pos.z - p.z) < r) k++;
    }
    return k;
  };

  return { group, npcs, update, nearest, countNear, randomLine: () => rng.pick(LINES) };
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
