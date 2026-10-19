import * as THREE from 'three';
import { LEVELS } from '../config.js';
import { MAT, box, sign, textTexture, planter, bench, stall } from './props.js';
import { stdMat, glowMat, patchFog } from './env.js';
import { world } from '../core/collision.js';
import { addInteract, addZone, npcZones, decks } from '../systems/interact.js';
import { placeOf, THEMES } from '../systems/places.js';
import { batchStatic } from './batch.js';

// Inside the buildings. Every rooftop deck has a lift entrance against its
// north rail that takes you down into the place below: the nightclub's dance
// floor, the clinic's ward, the shrine's lantern hall. Three shopfronts on the
// Galleria Market's south side open into a boutique, an arcade and a realtor.
//
// The rooms themselves are built far below the city (no window looks out, so
// they can be anywhere) and the game fades you in and out of them. Decks of
// the same kind share a room; its name sign is repainted for each venue.

const BASE_Y = -800;
export const INTERIORS = {};

let slot = 0;
function site() {
  const x = -6000 + (slot++) * 140;
  return { x, z: 0, L: BASE_Y };
}

// A room: floor, walls, ceiling, lights, an exit, and a name sign that can be
// repainted. Returns helpers for filling it.
function shell(g, id, { w = 28, d = 22, h = 7, floor = MAT.floor, wall = MAT.wallDark, ceil = MAT.ceilWhite, trim = MAT.neonCyan, crowd = 8, title = '', light = 0xfff0dd } = {}) {
  const s = site();
  const L = s.L;
  const x0 = s.x - w / 2, x1 = s.x + w / 2, z0 = s.z - d / 2, z1 = s.z + d / 2;
  box(g, x0 - 1, L - 1, z0 - 1, x1 + 1, L, z1 + 1, floor, { tile: 4, tag: 'floor' });
  box(g, x0 - 1, L, z0 - 1, x0, L + h, z1 + 1, wall, { tag: 'wall', noWalk: true });
  box(g, x1, L, z0 - 1, x1 + 1, L + h, z1 + 1, wall, { tag: 'wall', noWalk: true });
  box(g, x0, L, z0 - 1, x1, L + h, z0, wall, { tag: 'wall', noWalk: true });
  box(g, x0, L, z1, x1, L + h, z1 + 1, wall, { tag: 'wall', noWalk: true });
  box(g, x0 - 1, L + h, z0 - 1, x1 + 1, L + h + 1, z1 + 1, MAT.wallDark, { solid: false });
  for (const [ax, az, bx, bz] of [[x0, z0, x1, z0 + 0.08], [x0, z1 - 0.08, x1, z1], [x0, z0, x0 + 0.08, z1], [x1 - 0.08, z0, x1, z1]]) {
    box(g, ax, L + 0.05, az, bx, L + 0.2, bz, trim, { solid: false });
    box(g, ax, L + h - 0.25, az, bx, L + h - 0.1, bz, trim, { solid: false });
  }
  // Light strips across the ceiling.
  for (let k = 1; k < 4; k++) {
    const px = x0 + (w * k) / 4;
    box(g, px - 0.3, L + h - 0.15, z0 + 2, px + 0.3, L + h - 0.05, z1 - 2, ceil, { solid: false });
  }
  // The way out: a lit door in the south wall.
  box(g, s.x - 1.6, L, z0, s.x + 1.6, L + 3.6, z0 + 0.1, glowMat(0x0a1a2a, 1), { solid: false });
  box(g, s.x - 1.8, L + 3.6, z0, s.x + 1.8, L + 3.8, z0 + 0.15, trim, { solid: false });
  for (const sx of [-1.8, 1.65]) box(g, s.x + sx, L, z0, s.x + sx + 0.15, L + 3.6, z0 + 0.15, trim, { solid: false });
  sign(g, 'EXIT ▲ TO THE ROOF', s.x, L + 4.4, z0 + 0.2, 5, 0.6, 0, { fg: '#8dffad', glyphs: true, intensity: 2 });
  addInteract({ pos: new THREE.Vector3(s.x, L, z0 + 1.4), radius: 2.4, label: 'Leave', action: 'leave' });
  // A name over the far wall, repainted for whichever venue you came in by.
  const nameMesh = sign(g, title || ' ', s.x, L + h - 1.5, z1 - 0.2, Math.min(16, w - 4), 1.6, Math.PI, { fg: trim.userData.css || '#7feaff', glyphs: true, intensity: 2.4 });
  nameMesh.userData.dynamic = true;
  const setName = (text) => {
    const tex = textTexture(text, { w: 1024, h: Math.round((1024 * 1.6) / Math.min(16, w - 4)), fg: trim.userData.css || '#7feaff', glyphs: true });
    nameMesh.material.map?.dispose();
    nameMesh.material.map = tex;
    nameMesh.material.needsUpdate = true;
  };
  if (crowd) npcZones.push({ x0: x0 + 2, x1: x1 - 2, z0: z0 + 4, z1: z1 - 3, y: L, count: crowd });
  // light: the colour of the one lamp that follows you indoors.
  const def = { id, entry: new THREE.Vector3(s.x, L, z0 + 2.6), facing: 0, setName, name: title, lamp: new THREE.Vector3(s.x, L + h - 1.2, s.z), light };
  INTERIORS[id] = def;
  addZone(title || THEMES[id]?.label || id, 'Inside', x0, L - 2, z0, x1, L + h, z1, 9);
  const at = (ax, az) => new THREE.Vector3(ax, L, az);
  const solid = (ax, ay, az, bx, by, bz, mat) => box(g, ax, L + ay, az, bx, L + by, bz, mat, { noWalk: true });
  const deco = (ax, ay, az, bx, by, bz, mat) => box(g, ax, L + ay, az, bx, L + by, bz, mat, { solid: false });
  const mesh = (geo, mat, x, y, z, ry = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, L + y, z); o.rotation.y = ry; g.add(o); return o; };
  const act = (x, z, label, action, data, radius = 2.4) => addInteract({ pos: at(x, z), radius, label, action, data });
  return { def, L, x0, x1, z0, z1, cx: s.x, cz: s.z, solid, deco, mesh, act, at };
}

// A counter with a glowing front, and a stool row.
function counter(r, x0, z, x1, glow) {
  r.solid(x0, 0, z - 0.6, x1, 1.1, z + 0.6, MAT.wood);
  r.deco(x0, 0.75, z - 0.65, x1, 0.85, z - 0.6, glow);
}

export function buildInteriors(scene) {
  const g = new THREE.Group();
  const M = {
    white: stdMat(0xe8ecef, { roughness: 0.4 }),
    gold: stdMat(0xc9a23a, { roughness: 0.3, metalness: 0.8 }),
    red: stdMat(0x8a1a1a, { roughness: 0.7 }),
    velvet: stdMat(0x4a1030, { roughness: 0.9 }),
    marble: stdMat(0xd8d2c6, { roughness: 0.2, metalness: 0.1 }),
    plant: MAT.plant,
    rack: glowMat(0x55ff88, 2),
    pink: glowMat(0xff3399, 1.6),
    cyan: glowMat(0x33ddff, 1.6),
    amber: glowMat(0xffaa33, 2.2),
    grow: glowMat(0xcc66ff, 1.6),
    water: glowMat(0x66ddff, 1.3),
    art: [0xff3399, 0x33ddff, 0xffaa33, 0x8dffad].map((c) => glowMat(c, 1.2)),
  };
  const sphere = (r) => new THREE.SphereGeometry(r, 14, 10);
  const cyl = (r, hh, seg = 14) => new THREE.CylinderGeometry(r, r, hh, seg);

  // ---------------------------------------------------------- nightclub
  {
    const r = shell(g, 'club', { light: 0xff66cc, w: 32, d: 26, h: 8, floor: MAT.floorDark, wall: stdMat(0x140a1c, { roughness: 0.6 }), ceil: MAT.ceilMagenta, trim: MAT.neonMagenta, crowd: 16 });
    for (let i = 0; i < 8; i++) for (let k = 0; k < 6; k++) r.deco(r.cx - 8 + i * 2, 0.02, r.cz - 4 + k * 2, r.cx - 6.1 + i * 2, 0.08, r.cz - 2.1 + k * 2, (i + k) % 2 ? M.pink : M.cyan);
    const ring = r.mesh(new THREE.TorusGeometry(3.5, 0.18, 8, 40), MAT.neonMagenta, r.cx, 6.2, r.cz + 2, 0);
    ring.rotation.x = Math.PI / 2;
    ring.userData.spin = 0.6;
    r.solid(r.cx - 3, 0, r.z1 - 3, r.cx + 3, 1.3, r.z1 - 1.2, MAT.darkMetal);
    r.deco(r.cx - 3, 1.1, r.z1 - 3.05, r.cx + 3, 1.25, r.z1 - 3, M.cyan);
    for (const sx of [-1, 1]) r.solid(r.cx + sx * 6 - 1, 0, r.z1 - 3, r.cx + sx * 6 + 1, 4, r.z1 - 1, MAT.darkMetal);
    counter(r, r.x0 + 2, r.cz, r.x0 + 3.2, M.pink);
    r.solid(r.x0 + 0.5, 0, r.cz - 6, r.x0 + 1.2, 3, r.cz + 6, MAT.wallDark);
    for (let k = 0; k < 8; k++) r.mesh(cyl(0.1, 0.4, 6), M.art[k % 4], r.x0 + 0.9, 2.2, r.cz - 5 + k * 1.4);
    r.solid(r.x0 + 2, 0, r.cz - 6, r.x0 + 3.2, 1.1, r.cz - 5, MAT.wood);
    r.act(r.x0 + 4.5, r.cz, 'Order at the bar', 'bar', null, 3);
    r.act(r.cx, r.cz, 'Join the dance-off', 'dance', null, 4);
    for (const z of [r.z0 + 4, r.z0 + 8]) for (const x of [r.x1 - 5, r.x1 - 9]) { r.solid(x - 1.2, 0, z - 0.6, x + 1.2, 0.5, z + 0.6, M.velvet); }
  }
  // ---------------------------------------------------------------- clinic
  {
    const r = shell(g, 'clinic', { light: 0xe8fff4, w: 28, d: 22, floor: stdMat(0xd8dee2, { roughness: 0.3 }), wall: M.white, ceil: MAT.ceilWhite, trim: MAT.neonGreen, crowd: 5 });
    for (let k = 0; k < 4; k++) {
      const z = r.z0 + 5 + k * 4;
      r.solid(r.x1 - 6, 0, z - 1, r.x1 - 2, 0.7, z + 1, M.white);
      r.deco(r.x1 - 2.6, 0.7, z - 0.8, r.x1 - 2, 1, z + 0.8, M.white);
      r.deco(r.x1 - 6.5, 0, z - 1.4, r.x1 - 6.4, 2.6, z + 1.4, MAT.glass);
      r.mesh(new THREE.BoxGeometry(0.6, 0.4, 0.05), MAT.screen, r.x1 - 1.5, 1.8, z);
    }
    counter(r, r.x0 + 3, r.cz + 3, r.x0 + 11, M.rack);
    const cross = glowMat(0x55ff88, 2.4);
    r.deco(r.cx - 0.4, 3.2, r.z1 - 0.3, r.cx + 0.4, 5.6, r.z1 - 0.2, cross);
    r.deco(r.cx - 1.2, 4, r.z1 - 0.3, r.cx + 1.2, 4.8, r.z1 - 0.2, cross);
    r.act(r.x0 + 7, r.cz + 1.5, 'Talk to the duty medic', 'clinic', null, 3);
    r.act(r.x1 - 7.5, r.z0 + 5, 'Rest in a bed', 'meditate', { what: 'rest' });
  }
  // ---------------------------------------------------------- food court
  {
    const r = shell(g, 'diner', { light: 0xffc890, w: 30, d: 22, floor: MAT.floorWarm, wall: stdMat(0x5a3020, { roughness: 0.8 }), ceil: MAT.ceilAmber, trim: MAT.neonAmber, crowd: 14 });
    stall(g, r.x0 + 6, r.L, r.z1 - 3, Math.PI, 'FEAST', MAT.neonAmber, 8);
    stall(g, r.x1 - 7, r.L, r.z1 - 3, Math.PI, 'CONTEST', MAT.neonMagenta, 8);
    for (const x of [r.cx - 6, r.cx, r.cx + 6]) for (const z of [r.cz - 3, r.cz + 2]) {
      r.solid(x - 1.2, 0, z - 0.8, x + 1.2, 0.8, z + 0.8, MAT.wood);
      r.mesh(sphere(0.25), M.amber, x, 2.6, z);
    }
    r.act(r.x0 + 6, r.z1 - 6.2, 'Order a feast', 'feast');
    r.act(r.x1 - 7, r.z1 - 6.2, 'Enter the eating contest', 'eatoff');
  }
  // ------------------------------------------------------- data exchange
  {
    const r = shell(g, 'data', { light: 0x9fe8ff, w: 30, d: 24, floor: stdMat(0x0e1a2c, { roughness: 0.4, metalness: 0.3 }), wall: stdMat(0x0a0e18, { roughness: 0.5 }), ceil: MAT.ceilWhite, trim: MAT.neonCyan, crowd: 6 });
    for (let row = 0; row < 3; row++) for (let k = 0; k < 6; k++) {
      const x = r.x1 - 3 - row * 3.4, z = r.z0 + 4 + k * 2.6;
      r.solid(x - 0.5, 0, z - 1, x + 0.5, 3, z + 1, MAT.darkMetal);
      for (let q = 0; q < 5; q++) r.deco(x - 0.53, 0.5 + q * 0.5, z - 0.7, x - 0.5, 0.56 + q * 0.5, z + Math.random() * 0.9 - 0.2, q % 2 ? M.rack : MAT.screen);
    }
    for (const [i, z] of [r.cz - 4, r.cz, r.cz + 4].entries()) {
      r.solid(r.x0 + 2, 0, z - 0.8, r.x0 + 3.2, 2.4, z + 0.8, MAT.darkMetal);
      r.deco(r.x0 + 3.2, 1.2, z - 0.6, r.x0 + 3.25, 2.1, z + 0.6, i === 1 ? M.pink : MAT.screen);
    }
    r.act(r.x0 + 4.6, r.cz - 4, 'Play Skylane Dodger', 'arcade');
    r.act(r.x0 + 4.6, r.cz, 'Use the slicer rig', 'slicer');
    r.act(r.x0 + 4.6, r.cz + 4, 'Play Skylane Dodger', 'arcade');
  }
  // ----------------------------------------------------------- shrine
  {
    const r = shell(g, 'shrine', { light: 0xffb060, w: 26, d: 26, h: 9, floor: MAT.floorWarm, wall: stdMat(0x3a2418, { roughness: 0.8 }), ceil: MAT.ceilAmber, trim: MAT.neonAmber, crowd: 5 });
    r.solid(r.cx - 3, 0, r.z1 - 5, r.cx + 3, 1, r.z1 - 1.5, M.marble);
    r.mesh(cyl(0.6, 2.2), M.gold, r.cx, 2.1, r.z1 - 3.2);
    r.mesh(sphere(0.7), M.amber, r.cx, 3.8, r.z1 - 3.2);
    for (const x of [r.x0 + 3, r.x1 - 3]) for (let k = 0; k < 5; k++) {
      const z = r.z0 + 4 + k * 4;
      r.solid(x - 0.1, 0, z - 0.1, x + 0.1, 2.6, z + 0.1, MAT.wood);
      r.mesh(sphere(0.38), M.amber, x, 2.9, z);
    }
    for (let k = 0; k < 6; k++) r.solid(r.cx - 5 + k * 2, 0, r.cz - 0.6, r.cx - 4 + k * 2, 0.15, r.cz + 0.6, M.red);
    r.act(r.cx, r.cz + 1.5, 'Meditate', 'meditate', { what: 'meditate' }, 3);
    r.act(r.cx, r.z1 - 6.2, 'Ask the keeper for your fortune', 'fortune');
  }
  // ------------------------------------------------------- noble salon
  {
    const r = shell(g, 'noble', { light: 0xffe0a0, w: 30, d: 24, h: 9, floor: M.marble, wall: M.velvet, ceil: MAT.ceilAmber, trim: MAT.neonAmber, crowd: 10 });
    for (const x of [r.cx - 6, r.cx + 6]) {
      const ch = r.mesh(new THREE.IcosahedronGeometry(1.2, 1), glowMat(0xfff2c0, 2.2), x, 7, r.cz);
      ch.scale.y = 0.6;
    }
    for (const [x, z] of [[r.cx - 5, r.cz], [r.cx + 5, r.cz]]) {
      r.mesh(cyl(2, 0.8, 24), MAT.felt, x, 0.8, z);
      world.addBox(x - 2, r.L, z - 2, x + 2, r.L + 1.2, z + 2, 'prop').noWalk = true;
      r.mesh(cyl(0.3, 0.8), M.gold, x, 0.4, z);
    }
    for (const x of [r.x0 + 2, r.x1 - 2]) for (let k = 0; k < 3; k++) r.mesh(new THREE.BoxGeometry(0.1, 2.2, 1.6), M.art[k % 4], x, 3.2, r.z0 + 6 + k * 6, Math.PI / 2);
    r.deco(r.cx - 1.5, 0.02, r.z0, r.cx + 1.5, 0.06, r.z1, MAT.cloth);
    r.act(r.cx - 5, r.cz - 2.6, 'Sit at the high-stakes table', 'poker', { stakes: 'high' }, 3);
    r.act(r.cx + 5, r.cz - 2.6, 'Sit at the high-stakes table', 'poker', { stakes: 'high' }, 3);
  }
  // ------------------------------------------------------------ embassy
  {
    const r = shell(g, 'embassy', { light: 0xfff4e0, w: 28, d: 24, h: 9, floor: M.marble, wall: stdMat(0xb8b1a2, { roughness: 0.6 }), ceil: MAT.ceilWhite, trim: MAT.neonWhite, crowd: 8 });
    for (let k = 0; k < 5; k++) r.mesh(new THREE.PlaneGeometry(1.6, 4), stdMat([0x2a4a9a, 0x9a2a2a, 0xd8b04a, 0x2a7a5a, 0x6a2a8a][k], { side: THREE.DoubleSide, roughness: 0.8 }), r.x0 + 5 + k * 4.5, 5.5, r.z1 - 0.3);
    counter(r, r.cx - 5, r.cz + 4, r.cx + 5, MAT.neonWhite);
    r.deco(r.cx - 1.5, 0.02, r.z0, r.cx + 1.5, 0.06, r.cz + 3, MAT.cloth);
    for (const x of [r.x0 + 4, r.x1 - 4]) planter(g, x, r.L, r.cz - 3, 1.2);
    r.act(r.cx, r.cz + 2.4, 'Visa and permits desk', 'visa', null, 3);
  }
  // ------------------------------------------------------------ gallery
  {
    const r = shell(g, 'gallery', { light: 0xffffff, w: 30, d: 24, h: 8, floor: stdMat(0xf2f2f0, { roughness: 0.2 }), wall: M.white, ceil: MAT.ceilWhite, trim: MAT.neonMagenta, crowd: 8 });
    const pieces = [new THREE.TorusKnotGeometry(0.7, 0.2, 80, 10), new THREE.IcosahedronGeometry(0.9, 0), new THREE.OctahedronGeometry(0.9, 0), new THREE.DodecahedronGeometry(0.85, 0)];
    pieces.forEach((geo, k) => {
      const x = r.cx - 6 + k * 4;
      r.solid(x - 0.7, 0, r.cz - 0.7, x + 0.7, 1.2, r.cz + 0.7, M.white);
      const o = r.mesh(geo, M.art[k], x, 2.4, r.cz);
      o.userData.spin = 0.3 + k * 0.1;
    });
    for (let k = 0; k < 5; k++) {
      const x = r.x0 + 4 + k * 5.5;
      r.deco(x - 1.5, 2, r.z1 - 0.2, x + 1.5, 4.2, r.z1 - 0.1, MAT.darkMetal);
      r.deco(x - 1.3, 2.2, r.z1 - 0.25, x + 1.3, 4, r.z1 - 0.2, M.art[k % 4]);
    }
    bench(g, r.cx, r.L, r.cz - 4, 0);
    r.act(r.cx, r.z1 - 2.5, 'Talk to the curator about buying art', 'art', null, 3);
  }
  // ------------------------------------------------------------ shipyard
  {
    const r = shell(g, 'yard', { light: 0xffe8c8, w: 34, d: 26, h: 10, floor: stdMat(0x5a5a54, { roughness: 0.9 }), wall: stdMat(0x3a3c40, { roughness: 0.7, metalness: 0.3 }), ceil: MAT.ceilWhite, trim: MAT.neonAmber, crowd: 6 });
    for (const x of [r.cx - 7, r.cx + 7]) {
      r.solid(x - 3, 0, r.cz - 1, x + 3, 0.6, r.cz + 5, MAT.darkMetal);
      r.mesh(new THREE.CapsuleGeometry(0.9, 3.6, 6, 12), stdMat(x < r.cx ? 0x2a6ad8 : 0xa01c28, { roughness: 0.35, metalness: 0.65 }), x, 1.8, r.cz + 2).rotation.x = Math.PI / 2;
      for (const sx of [-2.8, 2.8]) r.solid(x + sx - 0.15, 0, r.cz - 0.8, x + sx + 0.15, 6, r.cz - 0.5, MAT.metal);
      r.deco(x - 3, 5.8, r.cz - 0.8, x + 3, 6, r.cz - 0.5, M.amber);
    }
    for (let k = 0; k < 4; k++) r.solid(r.x1 - 4, k * 1.2, r.z0 + 3 + k * 0.2, r.x1 - 2, (k + 1) * 1.2, r.z0 + 5, [MAT.metal, M.red, MAT.darkMetal, M.gold][k]);
    counter(r, r.x0 + 3, r.z1 - 4, r.x0 + 11, M.amber);
    r.act(r.x0 + 7, r.z1 - 6, 'Parts counter', 'shop', { shop: 'dealerparts' }, 3);
    r.act(r.cx, r.cz - 3, 'Paint shop and speeder bay', 'dealer', null, 3.5);
  }
  // ----------------------------------------------------------- sky farm
  {
    const r = shell(g, 'garden', { light: 0xe0b0ff, w: 30, d: 24, h: 8, floor: stdMat(0x2c4a22, { roughness: 0.95 }), wall: stdMat(0x1e2a1a, { roughness: 0.9 }), ceil: M.grow, trim: MAT.neonGreen, crowd: 5 });
    for (let k = 0; k < 4; k++) {
      const z = r.z0 + 5 + k * 4.5;
      r.solid(r.x0 + 3, 0, z - 0.8, r.x1 - 8, 0.6, z + 0.8, stdMat(0x3a2a1c, { roughness: 1 }));
      for (let q = 0; q < 8; q++) r.mesh(new THREE.IcosahedronGeometry(0.6 + Math.random() * 0.4, 0), MAT.plant, r.x0 + 4 + q * 2.4, 1.1, z);
      for (let q = 0; q < 4; q++) r.mesh(sphere(0.18), M.amber, r.x0 + 5 + q * 4.8, 1.6, z + 0.3);
      r.deco(r.x0 + 3, 4, z - 0.1, r.x1 - 8, 4.1, z + 0.1, M.grow);
    }
    planter(g, r.x1 - 4, r.L, r.cz, 2);
    r.act(r.x1 - 6, r.z0 + 4, 'Pick today\'s sky fruit', 'pickfruit', null, 3);
    r.act(r.x1 - 6, r.z1 - 4, 'Buy a houseplant for your home', 'art', { kind: 'plant' }, 3);
  }
  // ------------------------------------------------- Threads (boutique)
  {
    const r = shell(g, 'boutique', { light: 0xffd0ee, w: 24, d: 20, floor: MAT.floor, wall: stdMat(0x2a1a2a, { roughness: 0.6 }), ceil: MAT.ceilMagenta, trim: MAT.neonMagenta, crowd: 4, title: 'THREADS' });
    for (let k = 0; k < 6; k++) {
      const x = r.x0 + 3 + k * 3.6;
      r.solid(x - 0.5, 0, r.z1 - 2.5, x + 0.5, 0.3, r.z1 - 1.5, MAT.darkMetal);
      r.mesh(new THREE.CapsuleGeometry(0.22, 0.9, 4, 10), stdMat([0xff3399, 0x1f6a4a, 0xd86a1a, 0x1c1c24, 0x6a1a4a, 0x121216][k], { roughness: 0.8 }), x, 1.3, r.z1 - 2);
      r.mesh(sphere(0.14), M.white, x, 2.2, r.z1 - 2);
    }
    r.deco(r.x0 + 0.2, 0.3, r.cz - 2, r.x0 + 0.3, 3.6, r.cz + 2, stdMat(0xddeeff, { roughness: 0.02, metalness: 1 }));
    counter(r, r.cx - 3, r.cz, r.cx + 3, M.pink);
    r.act(r.cx, r.cz - 1.8, 'Browse the racks', 'boutique', null, 3);
    r.act(r.x0 + 1.8, r.cz, 'Look in the mirror', 'mirror');
  }
  // ---------------------------------------------------- the Neon Arcade
  {
    const r = shell(g, 'arcade', { light: 0xa0e8ff, w: 26, d: 22, floor: MAT.floorDark, wall: stdMat(0x10101a, { roughness: 0.6 }), ceil: MAT.ceilMagenta, trim: MAT.neonCyan, crowd: 10, title: 'NEON ARCADE' });
    const cab = (x, z, ry, glow) => {
      r.solid(x - 0.6, 0, z - 0.5, x + 0.6, 2.2, z + 0.5, MAT.darkMetal);
      const scr = r.mesh(new THREE.PlaneGeometry(0.9, 0.7), glow, x, 1.5, z, ry);
      scr.position.x += Math.sin(ry) * 0.52;
      scr.position.z += Math.cos(ry) * 0.52;
    };
    for (let k = 0; k < 4; k++) cab(r.x0 + 1.5, r.z0 + 5 + k * 3.5, Math.PI / 2, k % 2 ? M.pink : M.cyan);
    for (let k = 0; k < 4; k++) cab(r.x1 - 1.5, r.z0 + 5 + k * 3.5, -Math.PI / 2, k % 2 ? M.cyan : M.amber);
    for (let k = 0; k < 3; k++) r.deco(r.cx - 3 + k * 2.1, 0.02, r.z1 - 6, r.cx - 1.1 + k * 2.1, 0.08, r.z1 - 4, [M.pink, M.cyan, M.amber][k]);
    r.mesh(new THREE.TorusGeometry(1.5, 0.15, 8, 30), MAT.felt, r.cx, 0.9, r.cz - 2).rotation.x = Math.PI / 2;
    world.addBox(r.cx - 1.6, r.L, r.cz - 3.6, r.cx + 1.6, r.L + 1, r.cz - 0.4, 'prop').noWalk = true;
    r.act(r.x0 + 3, r.z0 + 5, 'Play Skylane Dodger', 'arcade');
    r.act(r.x0 + 3, r.z0 + 8.5, 'Play Skylane Dodger', 'arcade');
    r.act(r.x0 + 3, r.z0 + 12, 'Holo Poker machine', 'poker', { stakes: 'low' });
    r.act(r.x1 - 3, r.z0 + 5, 'Slicer challenge', 'slicer');
    r.act(r.x1 - 3, r.z0 + 8.5, 'Holo Poker machine', 'poker', { stakes: 'low' });
    r.act(r.cx, r.z1 - 5, 'Dance machine', 'dance', null, 3);
    r.act(r.cx, r.cz, 'Holo Poker table', 'poker', { stakes: 'low' }, 2.6);
  }
  // ------------------------------------------------------ Skyline Realty
  {
    const r = shell(g, 'realty', { light: 0xfff0d0, w: 22, d: 18, floor: M.marble, wall: stdMat(0x1a2433, { roughness: 0.5 }), ceil: MAT.ceilWhite, trim: MAT.neonAmber, crowd: 2, title: 'SKYLINE REALTY' });
    for (let k = 0; k < 4; k++) {
      const x = r.x0 + 3.5 + k * 5;
      r.deco(x - 2, 1.4, r.z1 - 0.25, x + 2, 4, r.z1 - 0.15, [M.cyan, M.amber, M.pink, M.rack][k]);
    }
    counter(r, r.cx - 3, r.cz + 1, r.cx + 3, M.amber);
    r.act(r.cx, r.cz - 1, 'Ask about homes for sale', 'realty', null, 3);
  }

  batchStatic(g);
  scene.add(g);
  const spinners = [];
  g.traverse((o) => { if (o.userData.spin) spinners.push(o); });
  return { group: g, spinners };
}

// The lift lobby on a deck: a doorway against the north rail with the venue
// over it. Returns nothing; adds an 'enter' interaction.
export function buildEntrances(g) {
  const kioskEnd = 15, padStart = 22;
  for (const d of decks) {
    const p = placeOf(d.name);
    const L = d.y;
    const x0 = d.x - d.w / 2, x1 = d.x + d.w / 2, z0 = d.z - d.d / 2;
    const ex = (x0 + kioskEnd + x1 - padStart) / 2, ez = z0 + 1.6;
    const neon = MAT[p.neon] || MAT.neonCyan;
    box(g, ex - 3.2, L, ez - 1, ex - 2.4, L + 4.6, ez + 0.6, MAT.darkMetal, { noWalk: true });
    box(g, ex + 2.4, L, ez - 1, ex + 3.2, L + 4.6, ez + 0.6, MAT.darkMetal, { noWalk: true });
    box(g, ex - 3.2, L + 4.6, ez - 1, ex + 3.2, L + 5.4, ez + 0.6, MAT.darkMetal, { noWalk: true });
    box(g, ex - 2.4, L, ez - 1, ex + 2.4, L + 4.6, ez - 0.7, glowMat(0x0c1424, 1), { noWalk: true });
    box(g, ex - 2.4, L + 4.45, ez + 0.55, ex + 2.4, L + 4.6, ez + 0.65, neon, { solid: false });
    for (const sx of [-2.45, 2.35]) box(g, ex + sx, L, ez + 0.55, ex + sx + 0.1, L + 4.6, ez + 0.65, neon, { solid: false });
    sign(g, `${p.venue.toUpperCase()} ▼`, ex, L + 6.1, ez + 0.2, 9, 1.1, 0, { fg: neon.userData.css, glyphs: true, intensity: 2.6, twoSided: true });
    addInteract({ pos: new THREE.Vector3(ex, L, ez + 1.8), radius: 2.6, label: `Enter ${p.venue}`, action: 'enter', data: { interior: p.decor, venue: p.venue, back: [ex, L, ez + 2.4] } });
  }
}

// Three shopfronts along the Galleria Market's south rail.
export const SHOPFRONTS = [
  { id: 'boutique', name: 'THREADS', label: 'Threads', x: 30, neon: 'neonMagenta', hint: 'Clothes that change how you play' },
  { id: 'arcade', name: 'NEON ARCADE', label: 'the Neon Arcade', x: 50, neon: 'neonCyan', hint: 'Dodger, poker, slicing and dancing' },
  { id: 'realty', name: 'SKYLINE REALTY', label: 'Skyline Realty', x: 70, neon: 'neonAmber', hint: 'Homes for sale' },
];
export function buildShopfronts(g) {
  const L = LEVELS.market, z = -84.6;
  for (const s of SHOPFRONTS) {
    const neon = MAT[s.neon];
    box(g, s.x - 8, L, z, s.x - 2, L + 6, z + 0.6, MAT.wallDark, { noWalk: true });
    box(g, s.x + 2, L, z, s.x + 8, L + 6, z + 0.6, MAT.wallDark, { noWalk: true });
    box(g, s.x - 8, L + 4.2, z, s.x + 8, L + 6, z + 0.6, MAT.wallDark, { noWalk: true });
    box(g, s.x - 2, L, z, s.x + 2, L + 4.2, z + 0.3, glowMat(0x0c1424, 1), { noWalk: true });
    box(g, s.x - 8, L + 4.1, z + 0.6, s.x + 8, L + 4.25, z + 0.7, neon, { solid: false });
    for (const sx of [-7, 3]) box(g, s.x + sx, L + 0.8, z + 0.6, s.x + sx + 4, L + 3.4, z + 0.62, patchFog(new THREE.MeshBasicMaterial({ color: new THREE.Color(neon.color).multiplyScalar(0.25) })), { solid: false });
    sign(g, s.name, s.x, L + 5.1, z + 0.7, 12, 1.4, 0, { fg: neon.userData.css, glyphs: true, intensity: 2.6 });
    addInteract({ pos: new THREE.Vector3(s.x, L, z + 2), radius: 2.6, label: `Enter ${s.label}`, action: 'enter', data: { interior: s.id, venue: s.name, back: [s.x, L, z + 2.6] } });
  }
}
