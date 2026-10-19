import * as THREE from 'three';
import { MAT, box, sign, lamp, planter, bench, stall } from './props.js';
import { stdMat, glowMat } from './env.js';
import { world } from '../core/collision.js';

// What stands on a rooftop deck, by kind of place, so each reads at a glance
// and from the air: its own floor, one big landmark (a clinic's ward under a
// green cross, a farm's glasshouse, a club's dance floor under a holo-ring,
// a shipyard's crane...) and smaller pieces around it.
//
// Every deck keeps its kiosk (north-west corner) and landing pad (south-east
// corner). The landmark goes in strip A along the east rail, north of the
// pad; the smaller pieces in strip B along the south rail, west of the pad.
// Decks run from 47 to 80 m across, so both strips size themselves to fit.

let M = null;
function mats() {
  if (M) return M;
  M = {
    white: stdMat(0xe6eaec, { roughness: 0.5 }),
    red: stdMat(0xa8261e, { roughness: 0.6 }),
    gold: stdMat(0xc9a23a, { roughness: 0.3, metalness: 0.8 }),
    stone: stdMat(0xcfc6b4, { roughness: 0.8 }),
    hedge: stdMat(0x24502c, { roughness: 0.95 }),
    soil: stdMat(0x3a2a1c, { roughness: 1 }),
    containers: [0xb4562a, 0x2a5a8a, 0x3a6a3a, 0x8a8a84, 0xc49a2a].map((c) => stdMat(c, { roughness: 0.7, metalness: 0.3 })),
    canopies: [0xa8261e, 0xd8902a, 0x1f7a7a].map((c) => stdMat(c, { roughness: 0.8, side: THREE.DoubleSide })),
    banners: [0x2a4a9a, 0x9a2a2a, 0xd8b04a, 0x2a7a5a, 0x6a2a8a].map((c) => {
      const m = glowMat(c, 0.8);
      m.side = THREE.DoubleSide;
      return m;
    }),
    cross: glowMat(0x55ff88, 1.8),
    water: glowMat(0x66ddff, 1.3),
    tileA: glowMat(0xff3399, 1.0),
    tileB: glowMat(0x33ddff, 1.0),
    ring: glowMat(0xff3399, 3),
    amber: glowMat(0xffaa33, 3),
    redLight: glowMat(0xff3322, 4),
    rack: glowMat(0x55ff88, 2),
    gridCyan: glowMat(0x33ddff, 1.1),
    gridMagenta: glowMat(0xff3399, 1.1),
    art: [0xff3399, 0x33ddff, 0xffaa33, 0x8dffad].map((c) => glowMat(c, 1.1)),
    // Floors, one per kind of place.
    // Floors, one per kind of place. They glow a little, as if lit by the
    // deck's own lamps, so each reads from the air at night.
    floors: Object.fromEntries(Object.entries({
      clinic: [0xc9d2d6, 0.35, 0.14], garden: [0x2c5a2a, 0.95, 0.3], noble: [0xd6cfc0, 0.3, 0.13],
      club: [0x2a1438, 0.5, 0.35], yard: [0x6a6a62, 0.9, 0.18], data: [0x0e1a2c, 0.4, 0.3],
      shrine: [0x6a4428, 0.7, 0.3], diner: [0x8a4f2e, 0.75, 0.3], embassy: [0xb8b1a2, 0.6, 0.2],
      gallery: [0xeeeeec, 0.25, 0.12],
    }).map(([k, [c, roughness, glow]]) => [k, stdMat(c, { roughness, emissive: c, emissiveIntensity: glow * 0.45 })])),
    // Seams between deck plates, and painted hazard stripes.
    seam: stdMat(0x2a2622, { roughness: 0.8 }),
    hazard: stdMat(0xc8a030, { roughness: 0.7 }),
    growLight: glowMat(0xcc66ff, 1.6),
    warm: glowMat(0xffc27a, 2.2),
    crossDim: glowMat(0x55ff88, 1),
  };
  return M;
}

const cyl = (r, h, seg = 12) => new THREE.CylinderGeometry(r, r, h, seg);

export function decorateDeck(g, d, place, rng) {
  const m = mats();
  const L = d.y;
  const x0 = d.x - d.w / 2, x1 = d.x + d.w / 2, z0 = d.z - d.d / 2, z1 = d.z + d.d / 2;
  const A = { x0: x1 - 22, x1: x1 - 3, z0: z0 + 5, z1: z1 - 26 };
  const B = { x0: x0 + 8, x1: x1 - 27, z0: z1 - 13, z1: z1 - 3 };
  A.cx = (A.x0 + A.x1) / 2; A.cz = (A.z0 + A.z1) / 2; A.d = A.z1 - A.z0;
  B.cx = (B.x0 + B.x1) / 2; B.cz = (B.z0 + B.z1) / 2; B.w = B.x1 - B.x0;

  const solid = (ax, ay, az, bx, by, bz, mat) => box(g, ax, L + ay, az, bx, L + by, bz, mat, { noWalk: true });
  const deco = (ax, ay, az, bx, by, bz, mat) => box(g, ax, L + ay, az, bx, L + by, bz, mat, { solid: false });
  const block = (ax, az, bx, bz, h) => { world.addBox(ax, L, az, bx, L + h, bz, 'prop').noWalk = true; };
  const mesh = (geometry, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const o = new THREE.Mesh(geometry, mat);
    o.position.set(x, L + y, z);
    o.rotation.set(rx, ry, rz);
    g.add(o);
    return o;
  };
  // Positions spread evenly along a span, `step` metres apart at least.
  const along = (a, b, step) => {
    const n = Math.max(1, Math.floor((b - a) / step));
    return Array.from({ length: n }, (_, i) => a + ((i + 0.5) * (b - a)) / n);
  };
  // The venue's name, high over strip A, readable from the deck and the air.
  const venueSign = (y, fg) => sign(g, place.venue.toUpperCase(), A.cx, L + y, A.z0 - 0.5, 16, 1.8, Math.PI, { fg, glyphs: true, intensity: 2.6, twoSided: true });

  // The floor: the whole deck in this place's colours.
  deco(x0 + 0.6, 0, z0 + 0.6, x1 - 0.6, 0.05, z1 - 0.6, m.floors[place.decor] || m.floors.diner);
  const gridLines = (mat, step) => {
    for (const x of along(x0 + 2, x1 - 2, step)) deco(x - 0.06, 0.05, z0 + 1, x + 0.06, 0.07, z1 - 1, mat);
    for (const z of along(z0 + 2, z1 - 2, step)) deco(x0 + 1, 0.05, z - 0.06, x1 - 1, 0.07, z + 0.06, mat);
  };
  const border = (mat, inset = 1.4) => {
    deco(x0 + inset, 0.05, z0 + inset, x1 - inset, 0.07, z0 + inset + 0.3, mat);
    deco(x0 + inset, 0.05, z1 - inset - 0.3, x1 - inset, 0.07, z1 - inset, mat);
    deco(x0 + inset, 0.05, z0 + inset, x0 + inset + 0.3, 0.07, z1 - inset, mat);
    deco(x1 - inset - 0.3, 0.05, z0 + inset, x1 - inset, 0.07, z1 - inset, mat);
  };

  switch (place.decor) {
    case 'clinic': {
      // A white ward under a big green cross; beds under glass; supply crates.
      solid(A.x0 + 1, 0, A.cz - 7, A.x1 - 1, 7, A.cz + 7, m.white);
      deco(A.x0 + 0.9, 1, A.cz - 5, A.x0 + 1, 2.4, A.cz + 5, MAT.screen);
      deco(A.x0 + 0.9, 4.2, A.cz - 5, A.x0 + 1, 5.6, A.cz + 5, MAT.screen);
      deco(A.cx - 1, 7, A.cz - 0.4, A.cx + 1, 15, A.cz + 0.4, m.cross);
      deco(A.cx - 3.5, 9.8, A.cz - 0.4, A.cx + 3.5, 11.8, A.cz + 0.4, m.cross);
      for (const z of [A.cz - 9.5, A.cz + 9.5]) {
        if (Math.abs(z - A.cz) + 1 > A.d / 2) continue;
        for (let k = 0; k < 6; k++) solid(A.x0 + 3 + (k % 3) * 1.4, Math.floor(k / 3), z - 0.6, A.x0 + 4.2 + (k % 3) * 1.4, 1 + Math.floor(k / 3), z + 0.6, k % 2 ? m.white : m.red);
      }
      for (const x of along(B.x0, B.x1, 4)) {
        solid(x - 1, 0, B.z0 + 3, x + 1, 0.7, B.z0 + 5.4, m.white);
        deco(x - 0.8, 0.7, B.z0 + 4.8, x + 0.8, 0.95, B.z0 + 5.3, m.white);
      }
      deco(B.x0, 3.4, B.z0 + 1.5, B.x1, 3.55, B.z0 + 7, MAT.glass);
      for (const x of [B.x0 + 0.2, B.x1 - 0.2]) solid(x - 0.12, 0, B.z0 + 1.5, x + 0.12, 3.4, B.z0 + 1.75, MAT.metal);
      border(MAT.metal);
      venueSign(17, '#8dffad');
      break;
    }
    case 'garden': {
      // A vaulted glasshouse, rows of crops, a water tower.
      const gw = A.x1 - A.x0 - 2, gd = Math.min(A.d - 2, 22);
      solid(A.x0 + 1, 0, A.cz - gd / 2, A.x1 - 1, 4, A.cz + gd / 2, MAT.glass);
      mesh(new THREE.CylinderGeometry(gw / 2, gw / 2, gd, 20, 1, true, -Math.PI / 2, Math.PI), MAT.glass, A.cx, 4, A.cz, Math.PI / 2, 0, 0).renderOrder = 2;
      for (const z of along(A.cz - gd / 2, A.cz + gd / 2, 4)) {
        deco(A.cx - gw / 2, 0, z - 0.1, A.cx - gw / 2 + 0.2, 4, z + 0.1, MAT.darkMetal);
        deco(A.cx + gw / 2 - 0.2, 0, z - 0.1, A.cx + gw / 2, 4, z + 0.1, MAT.darkMetal);
      }
      for (const z of along(A.cz - gd / 2 + 1, A.cz + gd / 2 - 1, 4)) {
        deco(A.x0 + 3, 0, z - 0.8, A.x1 - 3, 0.6, z + 0.8, m.soil);
        for (const x of along(A.x0 + 3, A.x1 - 3, 2.4)) mesh(new THREE.IcosahedronGeometry(0.7 + rng.range(0, 0.5), 0), MAT.plant, x, 1.1, z);
        deco(A.x0 + 3, 3.2, z - 0.15, A.x1 - 3, 3.35, z + 0.15, m.growLight);
      }
      planter(g, A.cx, L, A.cz, 2.2);
      for (const z of along(B.z0 + 1, B.z1 - 1, 3)) {
        solid(B.x0 + 1, 0, z - 0.7, B.x1 - 7, 0.5, z + 0.7, MAT.wallDark);
        deco(B.x0 + 1.2, 0.5, z - 0.5, B.x1 - 7.2, 0.95, z + 0.5, MAT.plant);
        deco(B.x0 + 1.2, 2.2, z - 0.1, B.x1 - 7.2, 2.3, z + 0.1, m.growLight);
        for (const x of [B.x0 + 1.3, B.x1 - 7.3]) deco(x - 0.06, 0, z - 0.06, x + 0.06, 2.2, z + 0.06, MAT.darkMetal);
      }
      mesh(cyl(2.2, 4, 16), MAT.metal, B.x1 - 3.5, 8, B.cz);
      mesh(new THREE.ConeGeometry(2.4, 1.4, 16), MAT.darkMetal, B.x1 - 3.5, 10.7, B.cz);
      for (const [px, pz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) solid(B.x1 - 3.5 + px - 0.15, 0, B.cz + pz - 0.15, B.x1 - 3.5 + px + 0.15, 6, B.cz + pz + 0.15, MAT.darkMetal);
      venueSign(13, '#8dffad');
      break;
    }
    case 'noble': {
      // A two-tier fountain between gilded statues, hedge walls, a red carpet.
      mesh(cyl(4.6, 1, 28), m.stone, A.cx, 0.5, A.cz);
      mesh(cyl(4.3, 0.05, 28), m.water, A.cx, 0.98, A.cz);
      mesh(cyl(0.6, 2.4, 12), m.stone, A.cx, 2.2, A.cz);
      mesh(cyl(2.2, 0.4, 20), m.stone, A.cx, 3.5, A.cz);
      mesh(cyl(2, 0.05, 20), m.water, A.cx, 3.72, A.cz);
      mesh(cyl(0.3, 2.4, 10), m.gold, A.cx, 4.9, A.cz);
      mesh(new THREE.SphereGeometry(0.9, 16, 12), m.water, A.cx, 6.6, A.cz);
      block(A.cx - 4.6, A.cz - 4.6, A.cx + 4.6, A.cz + 4.6, 1);
      for (const dz of [-1, 1]) {
        const sz = A.cz + dz * Math.min(9.5, A.d / 2 - 1.5);
        solid(A.cx - 1, 0, sz - 1, A.cx + 1, 2.2, sz + 1, m.stone);
        mesh(cyl(0.5, 2.4, 12), m.gold, A.cx, 3.4, sz);
        mesh(new THREE.SphereGeometry(0.45, 12, 8), m.gold, A.cx, 5, sz);
        mesh(new THREE.BoxGeometry(2.4, 0.3, 0.4), m.gold, A.cx, 4.2, sz);
        mesh(new THREE.ConeGeometry(0.6, 0.8, 10), m.gold, A.cx, 5.8, sz);
      }
      solid(A.x1 - 1.5, 0, A.z0 + 1, A.x1 - 0.4, 2, A.z1 - 1, m.hedge);
      solid(A.x0 + 0.4, 0, A.z0 + 1, A.x0 + 1.5, 2, A.cz - 6, m.hedge);
      solid(A.x0 + 0.4, 0, A.cz + 6, A.x0 + 1.5, 2, A.z1 - 1, m.hedge);
      deco(B.x0 - 4, 0.05, B.cz - 1.2, B.x1 + 2, 0.08, B.cz + 1.2, MAT.cloth);
      for (const x of along(B.x0, B.x1, 4)) for (const dz of [-1.7, 1.7]) mesh(cyl(0.08, 1.1, 8), m.gold, x, 0.55, B.cz + dz);
      for (const x of along(B.x0, B.x1, 7)) planter(g, x, L, B.z1 - 1.5, 1.2);
      border(m.gold, 1.2);
      venueSign(9, '#ffc266');
      break;
    }
    case 'club': {
      // A glowing dance floor under a truss and a turning holo-ring, speaker
      // stacks, and a bar.
      const n = Math.max(4, Math.min(7, Math.floor((A.d - 4) / 2)));
      for (let i = 0; i < 7; i++) for (let k = 0; k < n; k++) {
        const tx = A.x0 + 2.5 + i * 2, tz = A.cz - n + k * 2;
        deco(tx, 0.05, tz, tx + 1.9, 0.1, tz + 1.9, (i + k) % 2 ? m.tileA : m.tileB);
      }
      const fz0 = A.cz - n - 1, fz1 = A.cz + n + 1;
      for (const [px, pz] of [[A.x0 + 1.5, fz0], [A.x1 - 1.5, fz0], [A.x0 + 1.5, fz1], [A.x1 - 1.5, fz1]]) {
        solid(px - 1, 0, pz - 1, px + 1, 4.2, pz + 1, MAT.darkMetal);
        mesh(new THREE.CircleGeometry(0.6, 16), m.tileA, px, 3, pz + (pz < A.cz ? 1.02 : -1.02), 0, pz < A.cz ? 0 : Math.PI);
        mesh(new THREE.CircleGeometry(0.4, 16), m.tileB, px, 1.6, pz + (pz < A.cz ? 1.02 : -1.02), 0, pz < A.cz ? 0 : Math.PI);
      }
      for (const z of [fz0, fz1]) deco(A.x0 + 1, 8, z - 0.25, A.x1 - 1, 8.5, z + 0.25, MAT.darkMetal);
      for (const x of [A.x0 + 1.5, A.x1 - 1.5]) deco(x - 0.25, 4.2, fz0, x + 0.25, 8, fz0 + 0.5, MAT.darkMetal);
      for (const x of [A.x0 + 1.5, A.x1 - 1.5]) deco(x - 0.25, 4.2, fz1 - 0.5, x + 0.25, 8, fz1, MAT.darkMetal);
      for (const x of along(A.x0 + 1, A.x1 - 1, 2.2)) for (const z of [fz0, fz1]) mesh(new THREE.SphereGeometry(0.3, 8, 6), x % 2 > 1 ? m.tileA : m.tileB, x, 7.6, z);
      const ring = mesh(new THREE.TorusGeometry(4.5, 0.25, 8, 48), m.ring, A.cx, 11, A.cz, 0, Math.PI / 2, 0);
      ring.userData.spin = 0.4;
      solid(A.x1 - 2.2, 0, A.cz - 2, A.x1 - 0.6, 1.3, A.cz + 2, MAT.darkMetal);
      deco(A.x1 - 2.25, 1.1, A.cz - 2, A.x1 - 2.2, 1.25, A.cz + 2, m.tileB);
      solid(B.x0 + 1, 0, B.cz - 0.6, B.x1 - 1, 1.1, B.cz + 0.6, MAT.wood);
      deco(B.x0 + 1, 0.7, B.cz - 0.65, B.x1 - 1, 0.8, B.cz - 0.6, m.tileA);
      solid(B.x0 + 1, 0, B.z1 - 0.8, B.x1 - 1, 3.4, B.z1 - 0.4, MAT.wallDark);
      for (const x of along(B.x0 + 1.5, B.x1 - 1.5, 0.9)) mesh(cyl(0.1, 0.45, 6), m.art[Math.floor(x) % 4], x, 1.9, B.z1 - 0.95);
      for (const x of along(B.x0 + 1, B.x1 - 1, 2.2)) mesh(cyl(0.3, 0.75, 10), MAT.metal, x, 0.375, B.cz - 1.6);
      gridLines(m.seam, 8);
      venueSign(14.5, '#ff7ac0');
      break;
    }
    case 'yard': {
      // A tall crane over stacked containers, engines on stands, hazard lines.
      const cxm = A.x1 - 2.5, czm = A.z0 + 2.5;
      solid(cxm - 0.9, 0, czm - 0.9, cxm + 0.9, 26, czm + 0.9, m.containers[4]);
      deco(cxm - 0.6, 24.5, czm - 6, cxm + 0.6, 26, A.z1 - 1, m.containers[4]);
      deco(cxm - 1.4, 23.5, czm - 7, cxm + 1.4, 26, czm - 4, MAT.darkMetal);
      deco(cxm - 0.06, 13, A.z1 - 4.06, cxm + 0.06, 24.5, A.z1 - 3.94, MAT.darkMetal);
      deco(cxm - 1.3, 11.4, A.z1 - 7, cxm + 1.3, 13, A.z1 - 1, m.containers[0]);
      mesh(new THREE.SphereGeometry(0.4, 8, 6), m.redLight, cxm, 26.6, czm);
      mesh(new THREE.SphereGeometry(0.3, 8, 6), m.redLight, cxm, 26.4, A.z1 - 1);
      let k = 0;
      for (const z of along(A.z0 + 5, A.z1 - 9, 3.2)) {
        const h = 1 + (k % 3);
        for (let lv = 0; lv < h; lv++) solid(A.x0 + 1, lv * 2.6, z - 1.3, A.x0 + 8, (lv + 1) * 2.6, z + 1.3, m.containers[(k + lv) % 4]);
        k++;
      }
      for (const x of along(B.x0, B.x1 - 6, 3.5)) {
        mesh(cyl(1, 2.6, 14), MAT.metal, x, 1.4, B.cz, 0, 0, Math.PI / 2);
        solid(x - 1.2, 0, B.cz - 0.8, x + 1.2, 0.4, B.cz + 0.8, MAT.darkMetal);
      }
      for (let q = 0; q < 6; q++) mesh(cyl(0.4, 1.1, 10), m.red, B.x1 - 4 + (q % 3) * 0.9, 0.55, B.cz + (q > 2 ? 1 : -0.6));
      border(m.hazard, 1.6);
      for (const x of along(x0 + 2, x1 - 2, 3)) deco(x - 0.6, 0.05, z1 - 2.6, x + 0.6, 0.08, z1 - 2.1, m.hazard);
      venueSign(29, '#ffc266');
      break;
    }
    case 'data': {
      // Rows of blinking server racks, a big dish on a mast, antenna masts.
      for (const rx of along(A.x0 + 1, A.x1 - 6, 3.4)) for (const rz of along(A.z0 + 1, A.z1 - 9, 2.2)) {
        solid(rx - 0.55, 0, rz - 0.9, rx + 0.55, 3, rz + 0.9, MAT.darkMetal);
        for (let q = 0; q < 5; q++) deco(rx - 0.58, 0.5 + q * 0.5, rz - 0.6, rx - 0.55, 0.56 + q * 0.5, rz - 0.6 + rng.range(0.3, 1.2), q % 2 ? m.rack : MAT.screen);
      }
      const dx = A.x1 - 4, dz = A.z1 - 4;
      solid(dx - 0.5, 0, dz - 0.5, dx + 0.5, 8, dz + 0.5, MAT.darkMetal);
      mesh(new THREE.SphereGeometry(4.5, 20, 8, 0, Math.PI * 2, 0, 0.85), MAT.metal, dx, 9.5, dz, -0.7, 0.8, 0);
      mesh(cyl(0.1, 3, 6), MAT.darkMetal, dx, 10.5, dz);
      mesh(new THREE.SphereGeometry(0.3, 8, 6), m.redLight, dx, 12.1, dz);
      for (const [i, x] of along(B.x0, B.x1 - 7, 5).entries()) {
        const h = 14 + (i % 3) * 3;
        solid(x - 0.2, 0, B.cz - 0.2, x + 0.2, h, B.cz + 0.2, MAT.metal);
        for (let q = 1; q < 4; q++) deco(x - 1, h * q / 4, B.cz - 0.05, x + 1, h * q / 4 + 0.1, B.cz + 0.05, MAT.metal);
        mesh(new THREE.SphereGeometry(0.3, 8, 6), m.redLight, x, h + 0.3, B.cz);
      }
      solid(B.x1 - 6, 0, B.cz - 2, B.x1 - 1, 2.2, B.cz + 2, MAT.metal);
      for (let q = 0; q < 4; q++) deco(B.x1 - 6.05, 0.4 + q * 0.45, B.cz - 1.6, B.x1 - 6, 0.6 + q * 0.45, B.cz + 1.6, MAT.darkMetal);
      gridLines(m.seam, 6);
      venueSign(15, '#7feaff');
      break;
    }
    case 'shrine': {
      // A four-tier shrine with glowing eaves, braziers, a lantern walk and a gate.
      const sx = A.cx, sz = A.cz;
      solid(sx - 6, 0, sz - 6, sx + 6, 0.8, sz + 6, m.stone);
      const tiers = [[4, 3.2], [3.2, 2.4], [2.4, 2], [1.6, 1.6]];
      let y = 0.8;
      for (const [hw, hh] of tiers) {
        (y < 1 ? solid : deco)(sx - hw, y, sz - hw, sx + hw, y + hh, sz + hw, MAT.wood);
        y += hh;
        deco(sx - hw - 1.4, y - 0.15, sz - hw - 1.4, sx + hw + 1.4, y, sz + hw + 1.4, m.amber);
        deco(sx - hw - 1.4, y, sz - hw - 1.4, sx + hw + 1.4, y + 0.45, sz + hw + 1.4, m.red);
        y += 0.45;
      }
      mesh(new THREE.ConeGeometry(0.5, 3, 8), m.gold, sx, y + 1.5, sz);
      for (const dz of [-1, 1]) {
        const bz = sz + dz * Math.min(8.5, A.d / 2 - 1);
        mesh(cyl(0.6, 1.1, 12), m.gold, sx, 0.55, bz);
        mesh(new THREE.SphereGeometry(0.45, 10, 8), m.amber, sx, 1.4, bz);
        block(sx - 0.6, bz - 0.6, sx + 0.6, bz + 0.6, 1.1);
      }
      for (const x of along(B.x0 + 3, B.x1, 3.5)) for (const z of [B.z0 + 2, B.z1 - 2]) {
        solid(x - 0.1, 0, z - 0.1, x + 0.1, 2.8, z + 0.1, MAT.wood);
        mesh(new THREE.SphereGeometry(0.38, 10, 8), m.amber, x, 3, z);
      }
      solid(B.x0 + 0.5, 0, B.z0 + 1, B.x0 + 1.2, 5, B.z0 + 1.7, m.red);
      solid(B.x0 + 0.5, 0, B.z1 - 1.7, B.x0 + 1.2, 5, B.z1 - 1, m.red);
      deco(B.x0 + 0.2, 5, B.z0, B.x0 + 1.5, 5.6, B.z1, m.red);
      deco(B.x0 + 0.4, 4.1, B.z0 + 0.6, B.x0 + 1.3, 4.4, B.z1 - 0.6, m.red);
      for (const x of along(x0 + 2, x1 - 2, 1.6)) deco(x - 0.7, 0.05, z0 + 1, x + 0.7, 0.07, z1 - 1, MAT.floorWarm);
      venueSign(y + 4.5, '#ffc266');
      break;
    }
    case 'diner': {
      // Tables under bright umbrellas, strings of lights, food stalls, and a
      // tall neon sign you can read from three blocks away.
      let k = 0;
      for (const tz of along(A.z0, A.z1, 6)) for (const tx of along(A.x0, A.x1, 8)) {
        solid(tx - 0.8, 0, tz - 0.8, tx + 0.8, 0.85, tz + 0.8, MAT.metal);
        mesh(cyl(0.06, 2.8, 6), MAT.darkMetal, tx, 1.4, tz);
        mesh(new THREE.ConeGeometry(2.3, 0.8, 10, 1, true), m.canopies[k++ % 3], tx, 3, tz);
        mesh(new THREE.SphereGeometry(0.28, 10, 8), m.warm, tx, 2.45, tz);
        for (const sx of [-1.5, 1.5]) mesh(cyl(0.32, 0.6, 8), MAT.wood, tx + sx, 0.3, tz);
      }
      for (const z of along(A.z0, A.z1, 6)) {
        for (const x of along(A.x0, A.x1, 1.4)) mesh(new THREE.SphereGeometry(0.13, 6, 4), m.amber, x, 4.2 - Math.sin(((x - A.x0) / (A.x1 - A.x0)) * Math.PI) * 0.6, z + 3);
      }
      solid(A.x1 - 1.2, 0, A.z0 + 0.6, A.x1 - 0.6, 12, A.z0 + 1.2, MAT.darkMetal);
      sign(g, 'EAT', A.x1 - 0.9, L + 9.5, A.z0 + 0.4, 5, 2.4, Math.PI, { fg: '#ffc266', glyphs: true, intensity: 3, twoSided: true });
      const stalls = Math.max(1, Math.min(3, Math.floor(B.w / 9)));
      const names = ['DUMPLINGS', 'GRILL', 'NOODLES'], neons = [MAT.neonAmber, MAT.neonMagenta, MAT.neonCyan];
      along(B.x0, B.x1, B.w / stalls).forEach((x, i) => stall(g, x, L, B.cz - 0.5, Math.PI, names[i], neons[i], 7));
      venueSign(14, '#ffc266');
      break;
    }
    case 'embassy': {
      // A row of tall flags, a scanner arch, a guard post, clipped hedges and
      // a red carpet to the door.
      const flags = along(A.z0, A.z1, 4);
      flags.forEach((fz, k) => {
        mesh(cyl(0.1, 15, 8), MAT.metal, A.x1 - 2, 7.5, fz);
        mesh(new THREE.PlaneGeometry(1.8, 4.2), m.banners[k % 5], A.x1 - 2, 12.4, fz + 1, 0, Math.PI / 2, 0).renderOrder = 1;
        mesh(new THREE.SphereGeometry(0.2, 8, 6), m.gold, A.x1 - 2, 15.1, fz);
        solid(A.x1 - 2.3, 0, fz - 0.3, A.x1 - 1.7, 0.5, fz + 0.3, MAT.metal);
      });
      const ax = A.x0 + 6;
      solid(ax - 3.4, 0, A.cz - 0.5, ax - 2.6, 4.4, A.cz + 0.5, MAT.darkMetal);
      solid(ax + 2.6, 0, A.cz - 0.5, ax + 3.4, 4.4, A.cz + 0.5, MAT.darkMetal);
      deco(ax - 3.4, 4.4, A.cz - 0.5, ax + 3.4, 5, A.cz + 0.5, MAT.darkMetal);
      deco(ax - 2.65, 0.3, A.cz - 0.52, ax - 2.6, 4.2, A.cz - 0.45, MAT.neonCyan);
      deco(ax + 2.6, 0.3, A.cz - 0.52, ax + 2.65, 4.2, A.cz - 0.45, MAT.neonCyan);
      deco(ax - 2.6, 4.25, A.cz - 0.52, ax + 2.6, 4.35, A.cz - 0.45, MAT.neonCyan);
      deco(ax - 1.5, 0.05, A.z0 + 1, ax + 1.5, 0.08, A.z1 - 1, MAT.cloth);
      solid(A.x0 + 1, 0, A.z1 - 6, A.x0 + 6, 3.4, A.z1 - 2, m.white);
      deco(A.x0 + 0.95, 1.5, A.z1 - 5, A.x0 + 1, 2.6, A.z1 - 3, MAT.screen);
      for (const x of along(B.x0, B.x1, 6)) solid(x - 2, 0, B.z1 - 2, x + 2, 1.2, B.z1 - 0.8, m.hedge);
      if (B.w > 10) bench(g, B.cx, L, B.z0 + 3, Math.PI);
      border(m.gold, 1.2);
      venueSign(17, '#fff2dd');
      break;
    }
    case 'gallery': {
      // One huge sculpture on a plinth, smaller pieces around it, and a long
      // white wall of glowing holo-paintings.
      solid(A.cx - 2, 0, A.cz - 2, A.cx + 2, 2.4, A.cz + 2, m.white);
      const big = mesh(new THREE.TorusKnotGeometry(2.6, 0.7, 120, 12), m.ring, A.cx, 7.2, A.cz, 0.3, 0, 0);
      big.userData.spin = 0.15;
      const pieces = [new THREE.IcosahedronGeometry(0.9, 0), new THREE.OctahedronGeometry(0.95, 0), new THREE.TorusGeometry(0.75, 0.22, 10, 24), new THREE.DodecahedronGeometry(0.85, 0)];
      const spots = [[A.x0 + 2.5, A.z0 + 2.5], [A.x1 - 2.5, A.z0 + 2.5], [A.x0 + 2.5, A.z1 - 2.5], [A.x1 - 2.5, A.z1 - 2.5]];
      spots.forEach(([px, pz], k) => {
        solid(px - 0.75, 0, pz - 0.75, px + 0.75, 1.3, pz + 0.75, m.white);
        mesh(pieces[k], m.art[k], px, 2.4, pz, rng.range(0, 1), rng.range(0, 3), 0);
      });
      lamp(g, A.cx - 4, L, A.cz + 4);
      lamp(g, A.cx + 4, L, A.cz - 4);
      solid(B.x0, 0, B.z1 - 1.2, B.x1, 4, B.z1 - 0.7, m.white);
      along(B.x0, B.x1, 4).forEach((fx, k) => {
        deco(fx - 1.4, 1, B.z1 - 1.3, fx + 1.4, 3.1, B.z1 - 1.2, MAT.darkMetal);
        deco(fx - 1.2, 1.2, B.z1 - 1.34, fx + 1.2, 2.9, B.z1 - 1.3, m.art[k % 4]);
      });
      if (B.w > 10) bench(g, B.cx, L, B.z0 + 3, 0);
      venueSign(13, '#ff7ac0');
      break;
    }
    default:
      break;
  }
}
