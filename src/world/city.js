import * as THREE from 'three';
import { CELL, GRID, FAR_CELL, FAR_RADIUS, CITY_HALF } from '../config.js';
import { makeRng } from '../core/rng.js';
import { createTowerMaterial } from './towerMaterial.js';

// Procedural city. Produces tower segments (rendered instanced), colliders,
// the rooftop decks you can land on, and points for aviation beacons.

const DECK_NAMES = [
  'Kessa Heights', 'Ondrel Spur', 'Varn Terrace', 'Halcyon Deck', 'Tamsk Overlook', 'Corvan Landing',
  'Ithra Plaza', 'Mezza Ring', 'Sollus Rooftop', 'Drayne Point', 'Pellat Yard', 'Quorin Deck',
  'Azure Shelf', 'Brask Lookout', 'Nimbus Pad', 'Telmar Court', 'Oxen Spire Deck', 'Rhoan Terrace',
  'Galt Platform', 'Ember Landing', 'Saffi Deck', 'Uln Market Roof', 'Cindral Point', 'Vesh Heights',
  'Lumen Yard', 'Krayt Shelf', 'Maro Overlook', 'Felucca Deck', 'Zentha Plaza', 'Obel Terrace',
];

export function generateCity(collision, reservedFn) {
  const rng = makeRng(42);
  const segs = [];
  const decks = [];
  const beacons = [];

  const style = (core, opts = {}) => [
    rng.next(),
    opts.lit ?? rng.range(0.1, 0.32) + core * 0.18,
    opts.tint ?? rng.next(),
    opts.band ?? (rng.chance(0.22) ? rng.int(1, 3) : 0),
  ];

  const addSeg = (kind, x, y0, z, sx, sy, sz, st, collide = true) => {
    segs.push({ kind, x, y: y0 + sy / 2, z, sx, sy, sz, style: st });
    if (collide) {
      collision.addBox(x - sx / 2, y0, z - sz / 2, x + sx / 2, y0 + sy, z + sz / 2, 'tower');
    }
  };

  // A stepped tower: base, setbacks with glowing ledges, optional spire.
  const steppedTower = (x, z, w, d, H, core, opts = {}) => {
    const st = style(core, opts);
    const n = opts.segments ?? rng.int(1, 3);
    let y = 0, cw = w, cd = d;
    const fr = n === 1 ? [1] : n === 2 ? [rng.range(0.5, 0.75), 1] : [rng.range(0.4, 0.6), rng.range(0.7, 0.88), 1];
    for (let s = 0; s < n; s++) {
      const top = H * fr[s];
      addSeg('box', x, y, z, cw, top - y, cd, st);
      if (s < n - 1) {
        addSeg('box', x, top - 2.5, z, cw * 1.035 + 0.6, 2.5, cd * 1.035 + 0.6, [st[0], 0, 0.6, 4], false);
        cw *= rng.range(0.66, 0.84);
        cd *= rng.range(0.66, 0.84);
      }
      y = top;
    }
    if (!opts.flatTop && rng.chance(0.45)) {
      const r = Math.min(cw, cd) * rng.range(0.15, 0.3);
      const sh = rng.range(30, 140) * (0.6 + core);
      addSeg('cone', x, y, z, r * 2, sh, r * 2, [st[0], 0, 0.6, 4], false);
      collision.addBox(x - r * 0.7, y, z - r * 0.7, x + r * 0.7, y + sh * 0.6, z + r * 0.7, 'spire');
      beacons.push([x, y + sh, z]);
    } else if (!opts.flatTop) {
      // Roof antenna clusters with beacons.
      const k = rng.int(1, 3);
      for (let a = 0; a < k; a++) {
        const ax = x + rng.range(-cw * 0.35, cw * 0.35), az = z + rng.range(-cd * 0.35, cd * 0.35);
        const ah = rng.range(8, 40);
        addSeg('box', ax, y, az, 0.8, ah, 0.8, [st[0], 0, 0.7, 4], false);
        beacons.push([ax, y + ah, az]);
      }
    }
    beacons.push([x + cw / 2, y, z + cd / 2], [x - cw / 2, y, z - cd / 2]);
    return { top: y, w: cw, d: cd };
  };

  const roundTower = (x, z, dia, H, core) => {
    const st = style(core);
    const n = rng.int(1, 3);
    let y = 0, cdia = dia;
    for (let s = 0; s < n; s++) {
      const top = s === n - 1 ? H : y + (H - y) * rng.range(0.45, 0.7);
      addSeg('cyl', x, y, z, cdia, top - y, cdia, st, false);
      collision.addBox(x - cdia * 0.45, y, z - cdia * 0.45, x + cdia * 0.45, top, z + cdia * 0.45, 'tower');
      addSeg('cyl', x, top - 3, z, cdia * 1.06 + 1, 3, cdia * 1.06 + 1, [st[0], 0, 0.6, 4], false);
      y = top;
      cdia *= rng.range(0.6, 0.82);
    }
    addSeg('cone', x, y, z, cdia * 0.6, rng.range(20, 90), cdia * 0.6, [st[0], 0, 0.6, 4], false);
    beacons.push([x, y + 60, z]);
  };

  // Monolith landmarks: very tall, visible from anywhere.
  const MONOLITHS = [[3, 2], [-3, -4], [1, 8], [-9, -2], [8, 6], [-5, 9], [10, -7]];
  const monolithSet = new Set(MONOLITHS.map(([i, j]) => `${i},${j}`));

  // Cells for rooftop decks: spread around the city at many distances.
  const deckCells = new Set();
  const deckRng = makeRng(7);
  let guard = 0;
  while (deckCells.size < DECK_NAMES.length && guard++ < 2000) {
    const ang = deckRng.range(0, Math.PI * 2);
    const rad = deckRng.range(3, GRID - 3);
    const i = Math.round(Math.cos(ang) * rad), j = Math.round(Math.sin(ang) * rad);
    const k = `${i},${j}`;
    if (reservedFn(i, j) || monolithSet.has(k)) continue;
    let tooClose = false;
    for (const other of deckCells) {
      const [oi, oj] = other.split(',').map(Number);
      if (Math.abs(oi - i) + Math.abs(oj - j) < 4) tooClose = true;
    }
    if (!tooClose) deckCells.add(k);
  }

  let deckIndex = 0;
  for (let i = -GRID; i <= GRID; i++) {
    for (let j = -GRID; j <= GRID; j++) {
      if (reservedFn(i, j)) continue;
      const cx = i * CELL, cz = j * CELL;
      const dist = Math.hypot(cx, cz);
      const core = 1 - THREE.MathUtils.smoothstep(dist, 300, 2600);
      const key = `${i},${j}`;

      if (monolithSet.has(key)) {
        steppedTower(cx, cz, 76, 76, rng.range(1500, 2300), 1, { segments: 3, band: rng.int(1, 3) });
        continue;
      }
      if (deckCells.has(key)) {
        const w = rng.range(64, 82), d = rng.range(64, 82);
        const H = rng.range(150, 480);
        const t = steppedTower(cx, cz, w, d, H, core, { segments: rng.int(1, 2), flatTop: true });
        decks.push({ name: DECK_NAMES[deckIndex++], x: cx, z: cz, y: t.top, w: t.w, d: t.d });
        continue;
      }

      const hMax = 220 + core * 760;
      const r = rng.next();
      if (r < 0.1) {
        // Low block: a gap in the skyline you can drop into.
        const w = rng.range(50, 88), d = rng.range(50, 88);
        steppedTower(cx, cz, w, d, rng.range(40, 110), 0, { segments: 1 });
      } else if (r < 0.6) {
        const w = rng.range(46, 88), d = rng.range(46, 88);
        const jx = rng.range(-1, 1) * (44 - w / 2), jz = rng.range(-1, 1) * (44 - d / 2);
        const H = 90 + hMax * Math.pow(rng.next(), 1.3);
        steppedTower(cx + jx, cz + jz, w, d, H, core);
      } else if (r < 0.85) {
        const q = rng.int(2, 4);
        const quads = [[-1, -1], [1, -1], [-1, 1], [1, 1]].sort(() => rng.next() - 0.5).slice(0, q);
        for (const [qx, qz] of quads) {
          const w = rng.range(22, 40), d = rng.range(22, 40);
          const H = 60 + hMax * 0.8 * Math.pow(rng.next(), 1.4);
          steppedTower(cx + qx * 22, cz + qz * 22, w, d, H, core);
        }
      } else {
        const dia = rng.range(48, 86);
        roundTower(cx, cz, dia, 120 + hMax * Math.pow(rng.next(), 1.2), core);
      }
    }
  }

  // Backdrop towers out to the horizon. No colliders; fog does the rest.
  const far = [];
  const frng = makeRng(99);
  for (let x = -FAR_RADIUS; x <= FAR_RADIUS; x += FAR_CELL) {
    for (let z = -FAR_RADIUS; z <= FAR_RADIUS; z += FAR_CELL) {
      if (Math.abs(x) < CITY_HALF + 120 && Math.abs(z) < CITY_HALF + 120) continue;
      const dist = Math.hypot(x, z);
      if (dist > FAR_RADIUS) continue;
      const count = frng.int(1, 2);
      for (let c = 0; c < count; c++) {
        const w = frng.range(70, 160), d = frng.range(70, 160);
        const px = x + frng.range(-60, 60), pz = z + frng.range(-60, 60);
        let H = frng.range(120, 700) * (1.1 - dist / FAR_RADIUS * 0.5);
        if (frng.chance(0.04)) H = frng.range(1200, 2400);
        far.push({ kind: 'box', x: px, y: H / 2, z: pz, sx: w, sy: H, sz: d, style: [frng.next(), frng.range(0.15, 0.35), frng.next(), frng.chance(0.2) ? frng.int(1, 3) : 0] });
      }
    }
  }

  return { segs, far, decks, beacons };
}

export function buildCityMeshes(segs) {
  const group = new THREE.Group();
  const kinds = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 20, 1),
    cone: new THREE.ConeGeometry(0.5, 1, 10, 1),
  };
  const mats = { box: createTowerMaterial(false), cyl: createTowerMaterial(true), cone: createTowerMaterial(true) };
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (const kind of Object.keys(kinds)) {
    const list = segs.filter((g) => g.kind === kind);
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(kinds[kind], mats[kind], list.length);
    const size = new Float32Array(list.length * 3);
    const sty = new Float32Array(list.length * 4);
    list.forEach((g, i) => {
      p.set(g.x, g.y, g.z);
      s.set(g.sx, g.sy, g.sz);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      size.set([g.sx, g.sy, g.sz], i * 3);
      sty.set(g.style, i * 4);
    });
    mesh.geometry = mesh.geometry.clone();
    mesh.geometry.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 3));
    mesh.geometry.setAttribute('aStyle', new THREE.InstancedBufferAttribute(sty, 4));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  return group;
}
