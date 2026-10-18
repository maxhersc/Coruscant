import * as THREE from 'three';
import { stdMat, glowMat, patchFog } from './env.js';
import { world } from '../core/collision.js';

// Shared prop materials and builders for the walkable districts. Every solid
// builder also registers its collider.

function tileTexture(base, line, size = 512, tiles = 4) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  const step = size / tiles;
  for (let i = 0; i < tiles; i++) {
    for (let j = 0; j < tiles; j++) {
      const v = Math.random() * 18 - 9;
      g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 255})`;
      g.fillRect(i * step, j * step, step, step);
    }
  }
  g.strokeStyle = line;
  g.lineWidth = 3;
  for (let i = 0; i <= tiles; i++) {
    g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step, size); g.stroke();
    g.beginPath(); g.moveTo(0, i * step); g.lineTo(size, i * step); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export const MAT = {};
export function initMaterials() {
  MAT.floor = stdMat(0xffffff, { map: tileTexture('#8d8a84', '#6c6964'), roughness: 0.45, metalness: 0.15 });
  MAT.floorDark = stdMat(0xffffff, { map: tileTexture('#4d4a48', '#2f2d2c'), roughness: 0.7 });
  MAT.floorWarm = stdMat(0xffffff, { map: tileTexture('#7a5a44', '#4a3528', 512, 8), roughness: 0.5 });
  MAT.under = stdMat(0x2a2a2e, { roughness: 0.9 });
  MAT.metal = stdMat(0x5a5f66, { roughness: 0.35, metalness: 0.7 });
  MAT.darkMetal = stdMat(0x24262b, { roughness: 0.4, metalness: 0.6 });
  MAT.wall = stdMat(0xb9b2a5, { roughness: 0.8 });
  MAT.wallDark = stdMat(0x3c3a40, { roughness: 0.7 });
  MAT.wood = stdMat(0x5b3a26, { roughness: 0.6 });
  MAT.cloth = stdMat(0x7a2a2a, { roughness: 0.9 });
  MAT.felt = stdMat(0x0f5a3a, { roughness: 0.95 });
  MAT.plant = stdMat(0x2f6b3a, { roughness: 0.9 });
  MAT.trunk = stdMat(0x4a3424, { roughness: 0.9 });
  MAT.glass = patchFog(new THREE.MeshStandardMaterial({ color: 0x9fd8ff, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.18, depthWrite: false }));
  MAT.screen = glowMat(0x66ccff, 1.6);
  MAT.neonCyan = glowMat(0x33ddff, 4);
  MAT.neonAmber = glowMat(0xffaa33, 4);
  MAT.neonMagenta = glowMat(0xff3399, 4);
  MAT.neonGreen = glowMat(0x55ff88, 4);
  MAT.neonWhite = glowMat(0xfff2dd, 3);
  MAT.lampGlow = glowMat(0xffd9a0, 5);
  MAT.railGlow = glowMat(0x33ddff, 1.4);
  MAT.neonCyan.userData.css = '#7feaff';
  MAT.neonAmber.userData.css = '#ffc266';
  MAT.neonMagenta.userData.css = '#ff7ac0';
  MAT.neonGreen.userData.css = '#8dffad';
  MAT.neonWhite.userData.css = '#fff2dd';
}

// Scale a box's UVs so a tile texture repeats every `tile` metres.
function scaleBoxUV(geo, w, h, d, tile) {
  const uv = geo.attributes.uv;
  const n = geo.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    let su, sv;
    if (ny > 0.5) { su = w; sv = d; } else if (nx > 0.5) { su = d; sv = h; } else { su = w; sv = h; }
    uv.setXY(i, uv.getX(i) * su / tile, uv.getY(i) * sv / tile);
  }
}

// A solid box from min/max corners. Returns the mesh; the collider is added
// unless opts.solid === false.
export function box(parent, x0, y0, z0, x1, y1, z1, mat, opts = {}) {
  const w = x1 - x0, h = y1 - y0, d = z1 - z0;
  const geo = new THREE.BoxGeometry(w, h, d);
  if (opts.tile) scaleBoxUV(geo, w, h, d, opts.tile);
  const m = new THREE.Mesh(geo, mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  parent.add(m);
  if (opts.solid !== false) {
    const b = world.addBox(x0, y0, z0, x1, y1, z1, opts.tag || 'prop');
    if (opts.noWalk) b.noWalk = true;
    m.userData.collider = b;
  }
  return m;
}

// A floor slab whose top is at y.
export function slab(parent, x0, z0, x1, z1, y, mat = MAT.floor, thick = 2.5) {
  box(parent, x0, y - thick, z0, x1, y, z1, mat, { tile: 4, tag: 'floor' });
  // Underside lights so platforms read from below at night.
  if ((x1 - x0) * (z1 - z0) > 400) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 - 2, 0.2, 0.6), MAT.neonAmber);
    g.position.set((x0 + x1) / 2, y - thick - 0.1, z0 + 1);
    parent.add(g);
    const g2 = g.clone();
    g2.position.z = z1 - 1;
    parent.add(g2);
  }
}

// A glass railing along an axis-aligned line, with a lit top bar.
export function rail(parent, x0, z0, x1, z1, y, h = 1.25) {
  const t = 0.15;
  const minx = Math.min(x0, x1) - (x0 === x1 ? t : 0), maxx = Math.max(x0, x1) + (x0 === x1 ? t : 0);
  const minz = Math.min(z0, z1) - (z0 === z1 ? t : 0), maxz = Math.max(z0, z1) + (z0 === z1 ? t : 0);
  box(parent, minx, y, minz, maxx, y + h, maxz, MAT.glass, { tag: 'rail', noWalk: true });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(maxx - minx + 0.05, 0.06, maxz - minz + 0.05), MAT.railGlow);
  bar.position.set((minx + maxx) / 2, y + h, (minz + maxz) / 2);
  parent.add(bar);
}

// Railing around a rectangle with gaps: gaps = [{side:'n'|'s'|'e'|'w', at, width}]
export function railRect(parent, x0, z0, x1, z1, y, gaps = []) {
  const sides = {
    s: [[x0, z0], [x1, z0]],
    n: [[x0, z1], [x1, z1]],
    w: [[x0, z0], [x0, z1]],
    e: [[x1, z0], [x1, z1]],
  };
  for (const side of Object.keys(sides)) {
    const [[ax, az], [bx, bz]] = sides[side];
    const horizontal = az === bz;
    let a = horizontal ? ax : az, b = horizontal ? bx : bz;
    const cuts = gaps.filter((g) => g.side === side).map((g) => [g.at - g.width / 2, g.at + g.width / 2]).sort((p, q) => p[0] - q[0]);
    let cur = a;
    for (const [c0, c1] of [...cuts, [b, b]]) {
      if (c0 > cur + 0.5) {
        if (horizontal) rail(parent, cur, az, c0, az, y);
        else rail(parent, ax, cur, ax, c0, y);
      }
      cur = Math.max(cur, c1);
    }
  }
}

const textCache = new Map();
// Canvas text texture. glyphs: add a line of invented script under the text.
export function textTexture(text, opts = {}) {
  const key = text + JSON.stringify(opts);
  if (textCache.has(key)) return textCache.get(key);
  const w = opts.w || 512, h = opts.h || 128;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = opts.bg || 'rgba(0,0,0,0)';
  g.fillRect(0, 0, w, h);
  if (opts.border) {
    g.strokeStyle = opts.border;
    g.lineWidth = 6;
    g.strokeRect(6, 6, w - 12, h - 12);
  }
  g.fillStyle = opts.fg || '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const size = opts.size || Math.floor(h * (opts.glyphs ? 0.42 : 0.6));
  g.font = `${opts.weight || 700} ${size}px ${opts.font || '"Arial Narrow", "Helvetica Neue", Arial, sans-serif'}`;
  g.shadowColor = opts.fg || '#fff';
  g.shadowBlur = opts.blur ?? 12;
  const lines = String(text).split('\n');
  const lh = size * 1.1;
  const top = h / 2 - (lines.length - 1) * lh / 2 - (opts.glyphs ? h * 0.12 : 0);
  lines.forEach((ln, i) => g.fillText(ln, w / 2, top + i * lh));
  if (opts.glyphs) {
    // Invented script: angular strokes, deterministic per text.
    let seed = 0;
    for (const ch of text) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    g.strokeStyle = opts.glyphColor || opts.fg || '#fff';
    g.lineWidth = Math.max(2, h * 0.025);
    const n = Math.min(14, Math.max(5, text.length));
    const gw = (w * 0.8) / n;
    const y0 = h * 0.74, gh = h * 0.16;
    for (let i = 0; i < n; i++) {
      const x = w * 0.1 + i * gw + gw * 0.15;
      g.beginPath();
      const strokes = 2 + Math.floor(rnd() * 3);
      for (let s = 0; s < strokes; s++) {
        g.moveTo(x + rnd() * gw * 0.7, y0 + rnd() * gh);
        g.lineTo(x + rnd() * gw * 0.7, y0 + rnd() * gh);
      }
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  textCache.set(key, t);
  return t;
}

// An emissive sign plane. facing: rotation about Y in radians.
export function sign(parent, text, x, y, z, w, h, facing, opts = {}) {
  const tex = textTexture(text, { w: 1024, h: Math.round(1024 * h / w), ...opts });
  const mat = patchFog(new THREE.MeshBasicMaterial({
    map: tex,
    color: new THREE.Color(1, 1, 1).multiplyScalar(opts.intensity ?? 2.2),
    transparent: true,
    depthWrite: false,
    side: opts.twoSided ? THREE.FrontSide : THREE.DoubleSide,
  }));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  m.rotation.y = facing;
  m.renderOrder = 2;
  parent.add(m);
  if (opts.twoSided) {
    // A second face so the text reads the right way from behind.
    const back = new THREE.Mesh(m.geometry, mat);
    back.rotation.y = Math.PI;
    m.add(back);
  }
  return m;
}

export function lamp(parent, x, y, z) {
  box(parent, x - 0.12, y, z - 0.12, x + 0.12, y + 4.2, z + 0.12, MAT.darkMetal, { noWalk: true });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), MAT.lampGlow);
  bulb.position.set(x, y + 4.4, z);
  parent.add(bulb);
}

export function planter(parent, x, y, z, r = 1.6) {
  box(parent, x - r, y, z - r, x + r, y + 0.8, z + r, MAT.wallDark, { noWalk: true });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 3, 6), MAT.trunk);
  trunk.position.set(x, y + 2.2, z);
  parent.add(trunk);
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 1.1, 1), MAT.plant);
  crown.position.set(x, y + 4.2, z);
  crown.scale.y = 0.8;
  parent.add(crown);
}

export function bench(parent, x, y, z, rotY = 0) {
  const g = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.6), MAT.wood);
  seat.position.y = 0.5;
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 0.1), MAT.wood);
  back.position.set(0, 0.85, -0.28);
  const leg = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.45, 0.4), MAT.darkMetal);
  leg.position.y = 0.22;
  g.add(seat, back, leg);
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  parent.add(g);
  const hw = Math.abs(Math.cos(rotY)) > 0.5 ? 1.2 : 0.35, hd = Math.abs(Math.cos(rotY)) > 0.5 ? 0.35 : 1.2;
  world.addBox(x - hw, y, z - hd, x + hw, y + 0.55, z + hd, 'bench');
}

// A walled room with door gaps. doors = [{side, at, width}]. Interior is open
// (floor comes from the slab underneath).
export function room(parent, x0, z0, x1, z1, y, h, mat, doors = [], opts = {}) {
  const t = 0.5;
  const doorH = 3.6;
  const sides = {
    s: { horiz: true, a: x0, b: x1, c: z0 },
    n: { horiz: true, a: x0, b: x1, c: z1 },
    w: { horiz: false, a: z0, b: z1, c: x0 },
    e: { horiz: false, a: z0, b: z1, c: x1 },
  };
  for (const side of Object.keys(sides)) {
    const s = sides[side];
    const cuts = doors.filter((d) => d.side === side).map((d) => [d.at - d.width / 2, d.at + d.width / 2]).sort((p, q) => p[0] - q[0]);
    let cur = s.a;
    const seg = (p, q, yy0, yy1) => {
      if (q - p < 0.05) return;
      if (s.horiz) box(parent, p, yy0, s.c - t / 2, q, yy1, s.c + t / 2, mat, { tag: 'wall', noWalk: true });
      else box(parent, s.c - t / 2, yy0, p, s.c + t / 2, yy1, q, mat, { tag: 'wall', noWalk: true });
    };
    for (const [c0, c1] of cuts) {
      seg(cur, c0, y, y + h);
      seg(c0, c1, y + doorH, y + h); // lintel
      // Glowing door frame.
      const fm = new THREE.Mesh(new THREE.BoxGeometry(s.horiz ? c1 - c0 : 0.6, 0.15, s.horiz ? 0.6 : c1 - c0), opts.frameMat || MAT.neonCyan);
      if (s.horiz) fm.position.set((c0 + c1) / 2, y + doorH, s.c);
      else fm.position.set(s.c, y + doorH, (c0 + c1) / 2);
      parent.add(fm);
      cur = c1;
    }
    seg(cur, s.b, y, y + h);
  }
  // Roof, walkable from above, with a lit trim around its edge.
  box(parent, x0 - 0.3, y + h, z0 - 0.3, x1 + 0.3, y + h + 0.6, z1 + 0.3, opts.roofMat || MAT.wallDark);
  const trimMat = opts.frameMat || MAT.neonCyan;
  for (const [w, d, px, pz] of [[x1 - x0 + 0.8, 0.12, (x0 + x1) / 2, z0 - 0.36], [x1 - x0 + 0.8, 0.12, (x0 + x1) / 2, z1 + 0.36], [0.12, z1 - z0 + 0.8, x0 - 0.36, (z0 + z1) / 2], [0.12, z1 - z0 + 0.8, x1 + 0.36, (z0 + z1) / 2]]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), trimMat);
    t.position.set(px, y + h + 0.3, pz);
    parent.add(t);
  }
  // Ceiling light panels.
  if (opts.ceilingLights !== false) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry((x1 - x0) * 0.6, 0.1, (z1 - z0) * 0.6), opts.ceilMat || MAT.neonWhite);
    panel.position.set((x0 + x1) / 2, y + h - 0.1, (z0 + z1) / 2);
    parent.add(panel);
  }
}

// A market stall: counter, back wall, awning and a glowing sign.
export function stall(parent, x, y, z, facing, name, neon, w = 8) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = facing;
  parent.add(g);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, 1.2), MAT.metal);
  counter.position.set(0, 0.55, 1.6);
  const back = new THREE.Mesh(new THREE.BoxGeometry(w, 4, 0.4), MAT.wallDark);
  back.position.set(0, 2, -1.6);
  const awn = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.15, 4.2), MAT.cloth);
  awn.position.set(0, 3.6, 0.2);
  awn.rotation.x = -0.12;
  const strip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.12, 0.12), neon);
  strip.position.set(0, 3.35, 2.3);
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(w - 1, 0.1, 0.6), MAT.screen);
  shelf.position.set(0, 2.2, -1.2);
  g.add(counter, back, awn, strip, shelf);
  const sg = sign(g, name, 0, 4.4, 2.2, w, 1.1, 0, { fg: neon.userData.css || '#ffd9a0', glyphs: true });
  sg.rotation.y = 0;
  // Colliders in world space for the counter and back wall.
  const cos = Math.cos(facing), sin = Math.sin(facing);
  const toW = (lx, lz) => [x + lx * cos + lz * sin, z - lx * sin + lz * cos];
  for (const [lx0, lz0, lx1, lz1, hh] of [[-w / 2, 1.0, w / 2, 2.2, 1.1], [-w / 2, -1.8, w / 2, -1.4, 4]]) {
    const [ax, az] = toW(lx0, lz0), [bx, bz] = toW(lx1, lz1);
    world.addBox(Math.min(ax, bx), y, Math.min(az, bz), Math.max(ax, bx), y + hh, Math.max(az, bz), 'stall').noWalk = true;
  }
  // The point a customer stands to be served, in world space.
  const [sx, sz] = toW(0, 3.2);
  return new THREE.Vector3(sx, y, sz);
}

// A landing pad: slab with glowing edge, a painted ring and corner lights.
export function landingPad(parent, cx, cz, y, size, label) {
  const h = size / 2;
  slab(parent, cx - h, cz - h, cx + h, cz + h, y, MAT.floorDark, 2);
  const ring = new THREE.Mesh(new THREE.RingGeometry(h * 0.55, h * 0.62, 48), MAT.neonAmber);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(cx, y + 0.03, cz);
  parent.add(ring);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.6), MAT.neonGreen);
    l.position.set(cx + dx * (h - 0.6), y + 0.15, cz + dz * (h - 0.6));
    parent.add(l);
  }
  const edge = (w, d, px, pz) => {
    const e = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), MAT.neonAmber);
    e.position.set(px, y + 0.02, pz);
    parent.add(e);
  };
  edge(size, 0.3, cx, cz - h + 0.15);
  edge(size, 0.3, cx, cz + h - 0.15);
  edge(0.3, size, cx - h + 0.15, cz);
  edge(0.3, size, cx + h - 0.15, cz);
  if (label) {
    const s = sign(parent, label, cx, y + 0.05, cz, size * 0.5, size * 0.12, 0, { fg: '#ffcc66', blur: 4 });
    s.rotation.x = -Math.PI / 2;
  }
}
