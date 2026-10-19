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

// Every deck tower's top storey is hollow: the venue the deck belongs to.
export const VENUE_H = 9;

export function generateCity(collision, reservedFn) {
  const rng = makeRng(42);
  // Variety (which unusual shape, domes, hexes) draws on its own stream.
  const vrng = makeRng(4343);
  const segs = [];
  const decks = [];
  const beacons = [];
  const monoliths = [];

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

  // Machinery on a roof: plant rooms, vents and tanks in weathered metal.
  // The skyline's texture up close is mostly this.
  const greebles = (x, z, y, cw, cd, st, n) => {
    const plain = [st[0], 0, st[2], 6];
    for (let k = 0; k < n; k++) {
      const gw = vrng.range(3, Math.max(3.5, Math.min(14, cw * 0.32))), gd = vrng.range(3, Math.max(3.5, Math.min(14, cd * 0.32)));
      const gh = vrng.range(1.5, 7);
      const gx = x + vrng.range(-1, 1) * Math.max(0, cw / 2 - gw / 2 - 1.5), gz = z + vrng.range(-1, 1) * Math.max(0, cd / 2 - gd / 2 - 1.5);
      if (vrng.chance(0.28)) {
        const r = Math.min(gw, gd);
        addSeg('cyl', gx, y, gz, r, gh * 1.3, r, plain, false);
      } else {
        addSeg('box', gx, y, gz, gw, gh, gd, plain);
        // A smaller unit stacked on some.
        if (vrng.chance(0.35)) addSeg('box', gx + vrng.range(-1, 1) * gw * 0.2, y + gh, gz, gw * 0.5, gh * 0.5, gd * 0.5, plain, false);
      }
    }
  };

  // A stepped tower: base, setbacks with glowing ledges, optional spire.
  const steppedTower = (x, z, w, d, H, core, opts = {}) => {
    const st = style(core, opts);
    const n = opts.segments ?? rng.int(1, 3);
    let y = 0, cw = w, cd = d, room = null;
    const fr = n === 1 ? [1] : n === 2 ? [rng.range(0.5, 0.75), 1] : [rng.range(0.4, 0.6), rng.range(0.7, 0.88), 1];
    for (let s = 0; s < n; s++) {
      const top = H * fr[s];
      if (opts.hollow && s === n - 1) {
        // The top floor is a real storey you can walk around in: solid below,
        // a roof slab above, and walls a metre thick at the facade.
        const floor = top - opts.hollow - 1, ceil = top - 1;
        addSeg('box', x, y, z, cw, top - y, cd, st, false);
        const x0 = x - cw / 2, x1 = x + cw / 2, z0 = z - cd / 2, z1 = z + cd / 2;
        collision.addBox(x0, y, z0, x1, floor, z1, 'tower');
        collision.addBox(x0, ceil, z0, x1, top, z1, 'tower');
        collision.addBox(x0, floor, z0, x0 + 1, ceil, z1, 'tower');
        collision.addBox(x1 - 1, floor, z0, x1, ceil, z1, 'tower');
        collision.addBox(x0 + 1, floor, z0, x1 - 1, ceil, z0 + 1, 'tower');
        collision.addBox(x0 + 1, floor, z1 - 1, x1 - 1, ceil, z1, 'tower');
        room = { floor, ceil, x0: x0 + 1, x1: x1 - 1, z0: z0 + 1, z1: z1 - 1 };
      } else addSeg('box', x, y, z, cw, top - y, cd, st);
      if (s < n - 1) {
        addSeg('box', x, top - 2.5, z, cw * 1.035 + 0.6, 2.5, cd * 1.035 + 0.6, [st[0], 0, 0.6, 4], false);
        if (core > 0.02 && !opts.flatTop) greebles(x, z, top, cw, cd, st, vrng.int(1, 3));
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
    if (!opts.flatTop && core > 0.02) greebles(x, z, y, cw, cd, st, vrng.int(2, 5));
    beacons.push([x + cw / 2, y, z + cd / 2], [x - cw / 2, y, z - cd / 2]);
    return { top: y, w: cw, d: cd, room };
  };

  const roundTower = (x, z, dia, H, core) => {
    const st = style(core);
    const n = rng.int(1, 3);
    // Some round towers are six-sided, and some wear a dome instead of a spire.
    const kind = vrng.chance(0.35) ? 'hex' : 'cyl';
    const domed = vrng.chance(0.4);
    let y = 0, cdia = dia;
    for (let s = 0; s < n; s++) {
      const top = s === n - 1 ? H : y + (H - y) * rng.range(0.45, 0.7);
      addSeg(kind, x, y, z, cdia, top - y, cdia, st, false);
      collision.addBox(x - cdia * 0.45, y, z - cdia * 0.45, x + cdia * 0.45, top, z + cdia * 0.45, 'tower');
      addSeg('cyl', x, top - 3, z, cdia * 1.06 + 1, 3, cdia * 1.06 + 1, [st[0], 0, 0.6, 4], false);
      y = top;
      cdia *= rng.range(0.6, 0.82);
    }
    if (domed) {
      addSeg('dome', x, y, z, cdia * 0.95, cdia * 0.42, cdia * 0.95, [st[0], 0, st[2], 0], false);
      collision.addBox(x - cdia * 0.3, y, z - cdia * 0.3, x + cdia * 0.3, y + cdia * 0.35, z + cdia * 0.3, 'tower');
      addSeg('cone', x, y + cdia * 0.4, z, 3, 26, 3, [st[0], 0, 0.6, 4], false);
      beacons.push([x, y + cdia * 0.4 + 26, z]);
    } else {
      addSeg('cone', x, y, z, cdia * 0.6, rng.range(20, 90), cdia * 0.6, [st[0], 0, 0.6, 4], false);
      beacons.push([x, y + 60, z]);
    }
  };

  // ------------------------------------------------ unusual towers
  // A ledge glows along its top lip; a halo is a glowing ring round a tower.
  const ledge = (st) => [st[0], 0, 0.6, 4];
  const halo = (st) => [st[0], 0, 0.6, 5];

  // A tapering eight-sided needle girdled by glowing halo rings.
  const needle = (x, z, dia, H, core) => {
    const st = style(core);
    addSeg('taper', x, 0, z, dia, H, dia, st, false);
    collision.addBox(x - dia * 0.45, 0, z - dia * 0.45, x + dia * 0.45, H * 0.5, z + dia * 0.45, 'tower');
    collision.addBox(x - dia * 0.36, H * 0.5, z - dia * 0.36, x + dia * 0.36, H, z + dia * 0.36, 'tower');
    for (const f of vrng.chance(0.5) ? [0.62] : [0.42, 0.72]) {
      const r = dia * (1 - f * 0.36);
      addSeg('ring', x, H * f - 3, z, r * 1.6, 6, r * 1.6, halo(st), false);
    }
    const sh = vrng.range(40, 120);
    addSeg('cone', x, H, z, dia * 0.3, sh, dia * 0.3, ledge(st), false);
    beacons.push([x, H + sh, z]);
  };

  // A thin stem holding up a wide disc with a dome on top.
  const saucer = (x, z, H, core) => {
    const st = style(core, { lit: 0.4 });
    const stem = vrng.range(14, 22), disc = vrng.range(56, 76), dh = vrng.range(10, 16);
    addSeg('cyl', x, 0, z, stem, H, stem, st, false);
    collision.addBox(x - stem * 0.45, 0, z - stem * 0.45, x + stem * 0.45, H, z + stem * 0.45, 'tower');
    addSeg('cyl', x, H, z, disc, dh, disc, st, false);
    addSeg('cyl', x, H - 2, z, disc * 0.8, 2, disc * 0.8, ledge(st), false);
    addSeg('ring', x, H + dh - 2, z, disc * 1.04, 4, disc * 1.04, halo(st), false);
    collision.addBox(x - disc * 0.42, H, z - disc * 0.42, x + disc * 0.42, H + dh, z + disc * 0.42, 'tower');
    addSeg('dome', x, H + dh, z, disc * 0.6, disc * 0.22, disc * 0.6, [st[0], 0, st[2], 0], false);
    collision.addBox(x - disc * 0.2, H + dh, z - disc * 0.2, x + disc * 0.2, H + dh + disc * 0.2, z + disc * 0.2, 'tower');
    beacons.push([x, H + dh + disc * 0.22, z], [x + disc / 2, H + dh, z], [x - disc / 2, H + dh, z]);
  };

  // Two slim towers joined by glowing skybridges.
  const twin = (x, z, core) => {
    const stA = style(core), stB = style(core);
    const w = vrng.range(20, 28), d = vrng.range(30, 44), gap = vrng.range(18, 30);
    const H1 = vrng.range(200, 260 + core * 600), H2 = H1 * vrng.range(0.75, 1.1);
    const xa = x - (gap + w) / 2, xb = x + (gap + w) / 2;
    addSeg('box', xa, 0, z, w, H1, d, stA);
    addSeg('box', xb, 0, z, w, H2, d, stB);
    const low = Math.min(H1, H2);
    const k = vrng.int(2, 3);
    for (let i = 0; i < k; i++) {
      const by = low * (0.35 + i * 0.22);
      addSeg('box', x, by, z, gap + 2, 6, 9, [stA[0], 0.75, stA[2], 0]);
      addSeg('box', x, by - 1.2, z, gap + 2, 1.2, 10, halo(stA), false);
    }
    for (const [tx, h] of [[xa, H1], [xb, H2]]) addSeg('pyr', tx, h, z, w, vrng.range(14, 30), d, ledge(stA), false);
    beacons.push([xa, H1 + 20, z], [xb, H2 + 20, z]);
  };

  // A stepped pyramid of many tiers with a pointed cap.
  const ziggurat = (x, z, w, H, core) => {
    const st = style(core, { band: 0 });
    const n = vrng.int(5, 7);
    let y = 0, cw = w;
    for (let i = 0; i < n; i++) {
      const h = (H / n) * (1 - i * 0.04);
      addSeg('box', x, y, z, cw, h, cw, st);
      addSeg('box', x, y + h - 2, z, cw * 1.03 + 0.6, 2, cw * 1.03 + 0.6, ledge(st), false);
      y += h;
      cw *= 0.82;
    }
    addSeg('pyr', x, y, z, cw, cw * 0.9, cw, ledge(st), false);
    collision.addBox(x - cw * 0.3, y, z - cw * 0.3, x + cw * 0.3, y + cw * 0.5, z + cw * 0.3, 'tower');
    beacons.push([x, y + cw * 0.9, z]);
  };

  // A three-sided blade of a tower.
  const wedge = (x, z, dia, H, core) => {
    const st = style(core);
    addSeg('wedge', x, 0, z, dia, H, dia, st, false);
    collision.addBox(x - dia * 0.3, 0, z - dia * 0.3, x + dia * 0.3, H, z + dia * 0.3, 'tower');
    collision.addBox(x - dia * 0.1, 0, z + dia * 0.1, x + dia * 0.1, H, z + dia * 0.45, 'tower');
    addSeg('ring', x, H * 0.55, z, dia * 1.1, 5, dia * 1.1, halo(st), false);
    addSeg('cone', x, H, z, dia * 0.25, vrng.range(40, 90), dia * 0.25, ledge(st), false);
    beacons.push([x, H + 60, z]);
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
        // The first monolith keeps a flat top: someone lives up there.
        const home = monoliths.length === 0;
        const t = steppedTower(cx, cz, 76, 76, rng.range(1500, 2300), 1, { segments: 3, band: rng.int(1, 3), flatTop: home });
        monoliths.push({ x: cx, z: cz, top: t.top, w: t.w, d: t.d });
        continue;
      }
      if (deckCells.has(key)) {
        const w = rng.range(64, 82), d = rng.range(64, 82);
        const H = rng.range(150, 480);
        const t = steppedTower(cx, cz, w, d, H, core, { segments: rng.int(1, 2), flatTop: true, hollow: VENUE_H });
        decks.push({ name: DECK_NAMES[deckIndex++], x: cx, z: cz, y: t.top, w: t.w, d: t.d, room: t.room });
        continue;
      }

      const hMax = 220 + core * 760;
      const r = rng.next();
      if (r < 0.1) {
        // Low block: a gap in the skyline you can drop into.
        const w = rng.range(50, 88), d = rng.range(50, 88);
        steppedTower(cx, cz, w, d, rng.range(40, 110), 0, { segments: 1 });
      } else if (r < 0.6 && vrng.chance(0.4) && dist > 260) {
        // One of the unusual shapes, so the skyline is not all boxes.
        const H = 140 + hMax * Math.pow(vrng.next(), 1.2);
        const pick = vrng.int(0, 4);
        if (pick === 0) needle(cx, cz, vrng.range(40, 64), H * 1.2, core);
        else if (pick === 1) saucer(cx, cz, Math.max(120, H * 0.8), core);
        else if (pick === 2) twin(cx, cz, core);
        else if (pick === 3) ziggurat(cx, cz, vrng.range(70, 86), H * 0.75, core);
        else wedge(cx, cz, vrng.range(56, 80), H, core);
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

  return { segs, far, decks, beacons, monoliths };
}

export function buildCityMeshes(segs) {
  const group = new THREE.Group();
  const kinds = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 20, 1),
    cone: new THREE.ConeGeometry(0.5, 1, 10, 1),
    taper: new THREE.CylinderGeometry(0.32, 0.5, 1, 8, 1),
    hex: new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1),
    wedge: new THREE.CylinderGeometry(0.5, 0.5, 1, 3, 1),
    // Half a sphere stretched to fill the unit box, flat side down.
    dome: new THREE.SphereGeometry(0.5, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 2, 1).translate(0, -0.5, 0),
    // A flat ring filling the unit box.
    ring: new THREE.TorusGeometry(0.44, 0.06, 6, 48).rotateX(Math.PI / 2).scale(1, 1 / 0.12, 1),
    pyr: new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4),
  };
  const round = createTowerMaterial(true);
  const mats = { box: createTowerMaterial(false), cyl: round, cone: round, taper: round, hex: round, wedge: round, dome: round, ring: round, pyr: round };
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
