import * as THREE from 'three';
import { LEVELS } from '../config.js';
import { MAT, box, sign, planter, bench, stall } from './props.js';
import { stdMat, glowMat } from './env.js';
import { world } from '../core/collision.js';
import { addInteract, addZone, npcZones, decks } from '../systems/interact.js';
import { placeOf } from '../systems/places.js';
import { batchStatic } from './batch.js';

// Inside the buildings, where they are. Every rooftop deck stands on a tower
// whose top storey is hollow (see VENUE_H in city.js): that storey is the
// deck's venue, a hall with glass walls looking out over the city. A glass
// lift booth on the deck carries you down its shaft into the hall and back
// up. On the Galleria Market three shops are real rooms you walk into
// through open doors: Threads, the Neon Arcade and Skyline Realty.

// Every room, for lighting and for knowing where you are.
export const ROOMS = [];

// A room's shell and helpers for filling it. rect: x0..x1, z0..z1 (z0 is the
// side you come in by), floor height L, height h. tower: its walls are the
// tower's own (collision is already there); otherwise it is a shop with
// walls, a roof and a doorway at doorX.
function makeRoom(g, rect, style, info) {
  const { x0, x1, z0, z1, L, h } = rect;
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const wall = style.wall, trim = style.trim;
  box(g, x0, L - 0.12, z0, x1, L, z1, style.floor, { solid: false, tile: 4 });
  box(g, x0, L + h, z0, x1, L + h + 0.15, z1, MAT.wallDark, { solid: false });
  if (info.tower) {
    // Window walls: a sill, a band of glass, a header, mullions every 6 m.
    const side = (ax, az, bx, bz) => {
      box(g, ax, L, az, bx, L + 0.9, bz, wall, { solid: false });
      box(g, ax, L + 0.9, az, bx, L + h - 1, bz, MAT.glass, { solid: false });
      box(g, ax, L + h - 1, az, bx, L + h, bz, wall, { solid: false });
    };
    side(x0, z0, x1, z0 + 0.12);
    side(x0, z1 - 0.12, x1, z1);
    side(x0, z0, x0 + 0.12, z1);
    side(x1 - 0.12, z0, x1, z1);
    for (let x = x0 + 6; x < x1 - 3; x += 6) for (const z of [z0, z1 - 0.3]) box(g, x - 0.15, L, z, x + 0.15, L + h, z + 0.3, wall, { solid: false });
    for (let z = z0 + 6; z < z1 - 3; z += 6) for (const x of [x0, x1 - 0.3]) box(g, x, L, z - 0.15, x + 0.3, L + h, z + 0.15, wall, { solid: false });
  } else {
    // A shop: solid walls, a glass shopfront either side of an open door, a
    // roof you could stand on, and its name over the door.
    const dx = info.doorX, dw = 2.4;
    box(g, x0 - 0.4, L, z0, x0, L + h, z1, wall, { tag: 'wall', noWalk: true });
    box(g, x1, L, z0, x1 + 0.4, L + h, z1, wall, { tag: 'wall', noWalk: true });
    box(g, x0 - 0.4, L, z1, x1 + 0.4, L + h, z1 + 0.4, wall, { tag: 'wall', noWalk: true });
    for (const [a, b] of [[x0 - 0.4, dx - dw], [dx + dw, x1 + 0.4]]) {
      box(g, a, L, z0 - 0.4, b, L + 0.9, z0, wall, { tag: 'wall', noWalk: true });
      box(g, a, L + 0.9, z0 - 0.4, b, L + h - 1.4, z0, MAT.glass, { tag: 'wall', noWalk: true });
      box(g, a, L + h - 1.4, z0 - 0.4, b, L + h, z0, wall, { tag: 'wall', noWalk: true });
    }
    box(g, dx - dw, L + 3.8, z0 - 0.4, dx + dw, L + h, z0, wall, { tag: 'wall', noWalk: true });
    box(g, x0 - 0.4, L + h, z0 - 0.4, x1 + 0.4, L + h + 0.5, z1 + 0.4, MAT.wallDark);
    box(g, dx - dw, L + 3.7, z0 - 0.5, dx + dw, L + 3.85, z0 - 0.38, trim, { solid: false });
    for (const sx of [-dw, dw - 0.12]) box(g, dx + sx, L, z0 - 0.5, dx + sx + 0.12, L + 3.8, z0 - 0.38, trim, { solid: false });
    box(g, x0 - 0.4, L + h - 0.2, z0 - 0.55, x1 + 0.4, L + h - 0.05, z0 - 0.42, trim, { solid: false });
    sign(g, info.name, dx, L + h - 0.9, z0 - 0.6, Math.min(14, w - 2), 1.3, Math.PI, { fg: trim.userData.css, glyphs: true, intensity: 2.6 });
  }
  // Trim along the floor and the ceiling, and strips of light overhead.
  for (const [ax, az, bx, bz] of [[x0, z0, x1, z0 + 0.08], [x0, z1 - 0.08, x1, z1], [x0, z0, x0 + 0.08, z1], [x1 - 0.08, z0, x1, z1]]) {
    box(g, ax, L + 0.05, az, bx, L + 0.2, bz, trim, { solid: false });
    box(g, ax, L + h - 0.25, az, bx, L + h - 0.1, bz, trim, { solid: false });
  }
  for (let px = x0 + 5; px < x1 - 2; px += 7) box(g, px - 0.3, L + h - 0.15, z0 + 2, px + 0.3, L + h - 0.05, z1 - 2, style.ceil, { solid: false });
  // The venue's name over the far wall.
  sign(g, info.name, cx, L + h - 1.7, z1 - 0.35, Math.min(16, w - 4), 1.6, Math.PI, { fg: trim.userData.css || '#7feaff', glyphs: true, intensity: 2.4 });
  const crowd = Math.min(20, (style.crowd || 6) + Math.round((w * d) / 500));
  npcZones.push({ x0: x0 + 2, x1: x1 - 2, z0: z0 + 6, z1: z1 - 3, y: L, count: crowd });
  addZone(info.name.replace(/\b\w+/g, (s) => s[0] + s.slice(1).toLowerCase()), info.sub, x0, L - 0.5, z0 - (info.tower ? 0 : 0.3), x1, L + h, z1, 9);
  const reach = Math.max(w, d);
  ROOMS.push({ id: info.id, name: info.name, x0, x1, z0, z1, L, h, light: style.light || 0xfff0dd, lamp: new THREE.Vector3(cx, L + h - 1.4, cz), reach });
  const at = (ax, az) => new THREE.Vector3(ax, L, az);
  const solid = (ax, ay, az, bx, by, bz, mat) => box(g, ax, L + ay, az, bx, L + by, bz, mat, { noWalk: true });
  const deco = (ax, ay, az, bx, by, bz, mat) => box(g, ax, L + ay, az, bx, L + by, bz, mat, { solid: false });
  const mesh = (geo, mat, x, y, z, ry = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, L + y, z); o.rotation.y = ry; g.add(o); return o; };
  const act = (x, z, label, action, data, radius = 2.4) => addInteract({ pos: at(x, z), radius, label, action, data });
  return { L, x0, x1, z0, z1, cx, cz, w, d, solid, deco, mesh, act, at };
}

// Which room a point is in, if any.
export function roomAt(p) {
  for (const r of ROOMS) {
    if (p.x > r.x0 && p.x < r.x1 && p.z > r.z0 - 0.5 && p.z < r.z1 && p.y > r.L - 1 && p.y < r.L + r.h) return r;
  }
  return null;
}

// A counter with a glowing front, and a stool row.
function counter(r, x0, z, x1, glow) {
  r.solid(x0, 0, z - 0.6, x1, 1.1, z + 0.6, MAT.wood);
  r.deco(x0, 0.75, z - 0.65, x1, 0.85, z - 0.6, glow);
}

// The three shops on the Galleria Market, north side, doors facing the stalls.
export const SHOPS = [
  { id: 'boutique', name: 'THREADS', label: 'Threads', x0: 40, x1: 61, z0: 44, z1: 66, hint: 'Clothes that change how you play' },
  { id: 'arcade', name: 'NEON ARCADE', label: 'The Neon Arcade', x0: 63, x1: 84, z0: 44, z1: 66, hint: 'Dodger, poker, slicing and dancing' },
  { id: 'realty', name: 'SKYLINE REALTY', label: 'Skyline Realty', x0: -84, x1: -63, z0: 44, z1: 64, hint: 'Homes for sale' },
];

// The lift between a deck and its venue: a glass booth on the roof, a glass
// shaft through the hall below. Returns where you stand at each end.
function liftShaft(g, bx, bz, top, floor, ceil, neon, name, data) {
  const hw = 1.6, door = 1.1;
  const glassWalls = (y0, y1) => {
    box(g, bx - hw, y0, bz - hw, bx + hw, y1, bz - hw + 0.15, MAT.glass, { noWalk: true });
    box(g, bx - hw, y0, bz - hw, bx - hw + 0.15, y1, bz + hw, MAT.glass, { noWalk: true });
    box(g, bx + hw - 0.15, y0, bz - hw, bx + hw, y1, bz + hw, MAT.glass, { noWalk: true });
    box(g, bx - hw, y0, bz + hw - 0.15, bx - door, y1, bz + hw, MAT.glass, { noWalk: true });
    box(g, bx + door, y0, bz + hw - 0.15, bx + hw, y1, bz + hw, MAT.glass, { noWalk: true });
    for (const [px, pz] of [[-hw, -hw], [hw, -hw], [-hw, hw], [hw, hw], [-door, hw], [door, hw]]) box(g, bx + px - 0.08, y0, bz + pz - 0.08, bx + px + 0.08, y1, bz + pz + 0.08, MAT.darkMetal, { solid: false });
  };
  // On the roof.
  glassWalls(top, top + 3.4);
  box(g, bx - hw - 0.2, top + 3.4, bz - hw - 0.2, bx + hw + 0.2, top + 3.7, bz + hw + 0.2, MAT.darkMetal);
  box(g, bx - door, top + 3.2, bz + hw, bx + door, top + 3.4, bz + hw + 0.1, neon, { solid: false });
  sign(g, `${name} ▼`, bx, top + 4.5, bz + hw + 0.2, 8, 1, 0, { fg: neon.userData.css, glyphs: true, intensity: 2.6, twoSided: true });
  // Down through the hall.
  glassWalls(floor, ceil);
  box(g, bx - door, floor + 3.2, bz + hw, bx + door, floor + 3.4, bz + hw + 0.1, neon, { solid: false });
  sign(g, 'ROOF ▲', bx, floor + 4, bz + hw + 0.2, 2.6, 0.6, 0, { fg: neon.userData.css, glyphs: true, intensity: 2.2 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.06, 6, 28), neon);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(bx, floor + 0.05, bz);
  g.add(ring);
  const up = new THREE.Vector3(bx, top, bz), down = new THREE.Vector3(bx, floor, bz);
  addInteract({ pos: up, radius: 1.4, label: `Ride down to ${data.venue}`, action: 'lift-down', data: { ...data, top: up, bottom: down } });
  addInteract({ pos: down, radius: 1.4, label: 'Ride up to the roof', action: 'lift-up', data: { ...data, top: up, bottom: down } });
  return { up, down };
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

  // How each kind of place looks inside.
  const STYLES = {
    club: { light: 0xff66cc, h: 8, floor: MAT.floorDark, wall: stdMat(0x140a1c, { roughness: 0.6 }), ceil: MAT.ceilMagenta, trim: MAT.neonMagenta, crowd: 16 },
    clinic: { light: 0xe8fff4, floor: stdMat(0xd8dee2, { roughness: 0.3 }), wall: M.white, ceil: MAT.ceilWhite, trim: MAT.neonGreen, crowd: 5 },
    diner: { light: 0xffc890, floor: MAT.floorWarm, wall: stdMat(0x5a3020, { roughness: 0.8 }), ceil: MAT.ceilAmber, trim: MAT.neonAmber, crowd: 14 },
    data: { light: 0x9fe8ff, floor: stdMat(0x0e1a2c, { roughness: 0.4, metalness: 0.3 }), wall: stdMat(0x0a0e18, { roughness: 0.5 }), ceil: MAT.ceilWhite, trim: MAT.neonCyan, crowd: 6 },
    shrine: { light: 0xffb060, h: 9, floor: MAT.floorWarm, wall: stdMat(0x3a2418, { roughness: 0.8 }), ceil: MAT.ceilAmber, trim: MAT.neonAmber, crowd: 5 },
    noble: { light: 0xffe0a0, h: 9, floor: M.marble, wall: M.velvet, ceil: MAT.ceilAmber, trim: MAT.neonAmber, crowd: 10 },
    embassy: { light: 0xfff4e0, h: 9, floor: M.marble, wall: stdMat(0xb8b1a2, { roughness: 0.6 }), ceil: MAT.ceilWhite, trim: MAT.neonWhite, crowd: 8 },
    gallery: { light: 0xffffff, h: 8, floor: stdMat(0xf2f2f0, { roughness: 0.2 }), wall: M.white, ceil: MAT.ceilWhite, trim: MAT.neonMagenta, crowd: 8 },
    yard: { light: 0xffe8c8, h: 10, floor: stdMat(0x5a5a54, { roughness: 0.9 }), wall: stdMat(0x3a3c40, { roughness: 0.7, metalness: 0.3 }), ceil: MAT.ceilWhite, trim: MAT.neonAmber, crowd: 6 },
    garden: { light: 0xe0b0ff, h: 8, floor: stdMat(0x2c4a22, { roughness: 0.95 }), wall: stdMat(0x1e2a1a, { roughness: 0.9 }), ceil: M.grow, trim: MAT.neonGreen, crowd: 5 },
    boutique: { light: 0xffd0ee, floor: MAT.floor, wall: stdMat(0x2a1a2a, { roughness: 0.6 }), ceil: MAT.ceilMagenta, trim: MAT.neonMagenta, crowd: 4 },
    arcade: { light: 0xa0e8ff, floor: MAT.floorDark, wall: stdMat(0x10101a, { roughness: 0.6 }), ceil: MAT.ceilMagenta, trim: MAT.neonCyan, crowd: 10 },
    realty: { light: 0xfff0d0, floor: M.marble, wall: stdMat(0x1a2433, { roughness: 0.5 }), ceil: MAT.ceilWhite, trim: MAT.neonAmber, crowd: 2 },
  };

  // What each kind of place has inside it.
  const FILL = {
    club(r) {
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
    },
    clinic(r) {
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
    },
    diner(r) {
      stall(g, r.x0 + 6, r.L, r.z1 - 3, Math.PI, 'FEAST', MAT.neonAmber, 8);
      stall(g, r.x1 - 7, r.L, r.z1 - 3, Math.PI, 'CONTEST', MAT.neonMagenta, 8);
      for (const x of [r.cx - 6, r.cx, r.cx + 6]) for (const z of [r.cz - 3, r.cz + 2]) {
        r.solid(x - 1.2, 0, z - 0.8, x + 1.2, 0.8, z + 0.8, MAT.wood);
        r.mesh(sphere(0.25), M.amber, x, 2.6, z);
      }
      r.act(r.x0 + 6, r.z1 - 6.2, 'Order a feast', 'feast');
      r.act(r.x1 - 7, r.z1 - 6.2, 'Enter the eating contest', 'eatoff');
    },
    data(r) {
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
    },
    shrine(r) {
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
    },
    noble(r) {
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
    },
    embassy(r) {
      for (let k = 0; k < 5; k++) r.mesh(new THREE.PlaneGeometry(1.6, 4), stdMat([0x2a4a9a, 0x9a2a2a, 0xd8b04a, 0x2a7a5a, 0x6a2a8a][k], { side: THREE.DoubleSide, roughness: 0.8 }), r.x0 + 5 + k * 4.5, 5.5, r.z1 - 0.3);
      counter(r, r.cx - 5, r.cz + 4, r.cx + 5, MAT.neonWhite);
      r.deco(r.cx - 1.5, 0.02, r.z0, r.cx + 1.5, 0.06, r.cz + 3, MAT.cloth);
      for (const x of [r.x0 + 4, r.x1 - 4]) planter(g, x, r.L, r.cz - 3, 1.2);
      r.act(r.cx, r.cz + 2.4, 'Visa and permits desk', 'visa', null, 3);
    },
    gallery(r) {
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
    },
    yard(r) {
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
    },
    garden(r) {
      for (let k = 0; k < 4; k++) {
        const z = r.z0 + 9 + k * 4.5;
        if (z > r.z1 - 3) break;
        r.solid(r.x0 + 3, 0, z - 0.8, r.x1 - 8, 0.6, z + 0.8, stdMat(0x3a2a1c, { roughness: 1 }));
        for (let q = 0; q < 8; q++) r.mesh(new THREE.IcosahedronGeometry(0.6 + Math.random() * 0.4, 0), MAT.plant, r.x0 + 4 + q * 2.4, 1.1, z);
        for (let q = 0; q < 4; q++) r.mesh(sphere(0.18), M.amber, r.x0 + 5 + q * 4.8, 1.6, z + 0.3);
        r.deco(r.x0 + 3, 4, z - 0.1, r.x1 - 8, 4.1, z + 0.1, M.grow);
      }
      planter(g, r.x1 - 4, r.L, r.cz, 2);
      r.act(r.x1 - 6, r.z0 + 4, 'Pick today\'s sky fruit', 'pickfruit', null, 3);
      r.act(r.x1 - 6, r.z1 - 4, 'Buy a houseplant for your home', 'art', { kind: 'plant' }, 3);
    },
    boutique(r) {
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
    },
    arcade(r) {
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
    },
    realty(r) {
      for (let k = 0; k < 4; k++) {
        const x = r.x0 + 3.5 + k * 5;
        r.deco(x - 2, 1.4, r.z1 - 0.25, x + 2, 4, r.z1 - 0.15, [M.cyan, M.amber, M.pink, M.rack][k]);
      }
      counter(r, r.cx - 3, r.cz + 1, r.cx + 3, M.amber);
      r.act(r.cx, r.cz - 1, 'Ask about homes for sale', 'realty', null, 3);
    },
  };

  // Every deck's venue, in the storey under its roof.
  const lifts = [];
  for (const d of decks) {
    if (!d.room) continue;
    const p = placeOf(d.name);
    const st = STYLES[p.decor];
    if (!st || !FILL[p.decor]) continue;
    const rm = d.room;
    const r = makeRoom(g, { x0: rm.x0, x1: rm.x1, z0: rm.z0, z1: rm.z1, L: rm.floor, h: rm.ceil - rm.floor }, st, { id: p.decor, name: p.venue.toUpperCase(), sub: `${p.label} · ${d.name}`, tower: true });
    FILL[p.decor](r);
    // A few planters along the windows of the bigger halls.
    if (r.w > 44) for (const [px, pz] of [[r.x0 + 2.5, r.z1 - 2.5], [r.x1 - 2.5, r.z1 - 2.5]]) planter(g, px, r.L, pz, 1.2);
    const bx = d.x - 3.5, bz = d.z - d.d / 2 + 4;
    const neon = MAT[p.neon] || MAT.neonCyan;
    lifts.push({ deck: d.name, ...liftShaft(g, bx, bz, d.y, rm.floor, rm.ceil, neon, p.venue.toUpperCase(), { deck: d.name, venue: p.venue, theme: p.decor }) });
  }

  // The market's shops.
  for (const s of SHOPS) {
    const st = STYLES[s.id];
    const r = makeRoom(g, { x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1, L: LEVELS.market, h: 6 }, st, { id: s.id, name: s.name, sub: 'Galleria Market', doorX: (s.x0 + s.x1) / 2 });
    FILL[s.id](r);
    s.door = new THREE.Vector3((s.x0 + s.x1) / 2, LEVELS.market, s.z0 - 1.5);
  }

  batchStatic(g);
  scene.add(g);
  const spinners = [];
  g.traverse((o) => { if (o.userData.spin) spinners.push(o); });
  return { group: g, spinners, lifts };
}
