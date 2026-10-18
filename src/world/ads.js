import * as THREE from 'three';
import { makeRng } from '../core/rng.js';
import { textTexture } from './props.js';
import { patchFog } from './env.js';

// Giant holo-billboards on tower faces around the hub. Each cycles between two
// panels so the skyline keeps moving.
const ADS = [
  ['NOVA-COLA\nTaste the Core', '#ff4d6d', '#2a0010'],
  ['HYPERLANE TRAVEL\n3 systems · 1 ticket', '#7feaff', '#001a2a'],
  ['SKYRACE TONIGHT\nLucky Comet Casino', '#ffd166', '#2a1a00'],
  ['ARKANIS DROIDWORKS\nBuilt to serve', '#c0c8d0', '#101418'],
  ['CHROMA SILK', '#ff7ac0', '#22001a'],
  ['STARGAZER CRUISES\nSee the rings of Talos', '#9effc4', '#00200f'],
  ['FLUX CELLS\nPower for the long haul', '#ffb347', '#201000'],
  ['HOLONET 24\nNews from every sector', '#7fa8ff', '#000a24'],
  ['JUMP STATION\nNew Vexa Sport', '#7feaff', '#00151f'],
  ['SKYHAVEN\nLive above the clouds', '#fff2dd', '#1a1410'],
  ['ORBITAL NOODLES\nOpen all cycle', '#ffc266', '#1f0f00'],
  ['COURIER GUILD\nNow hiring pilots', '#8dffad', '#001a08'],
];

export function createAds(segs) {
  const rng = makeRng(808);
  const group = new THREE.Group();
  const panels = [];
  const candidates = segs.filter((s) => s.kind === 'box' && s.sy > 90 && s.style[3] !== 4 && s.sx > 30 && s.sz > 30);
  const near = candidates.filter((s) => {
    const d = Math.hypot(s.x, s.z);
    return d > 180 && d < 1500;
  });
  const chosen = near.sort(() => rng.next() - 0.5).slice(0, 70);
  const textures = ADS.map(([t, fg, bg]) => textTexture(t, { w: 512, h: 768, fg, bg, border: fg, glyphs: true, size: 64 }));
  const wide = ADS.map(([t, fg, bg]) => textTexture(t, { w: 1024, h: 384, fg, bg, border: fg, glyphs: true, size: 70 }));

  for (const s of chosen) {
    // Face the hub.
    const tx = -s.x, tz = -s.z;
    let nx = 0, nz = 0;
    if (Math.abs(tx) > Math.abs(tz)) nx = Math.sign(tx); else nz = Math.sign(tz);
    const faceW = nx ? s.sz : s.sx;
    const portrait = rng.chance(0.6);
    const w = Math.min(faceW * 0.7, portrait ? 34 : 60);
    const h = portrait ? w * 1.5 : w * 0.375;
    const y0 = s.y - s.sy / 2, y1 = s.y + s.sy / 2;
    if (y1 - y0 < h + 30) continue;
    const y = rng.range(Math.max(y0 + h / 2 + 20, 120), y1 - h / 2 - 8);
    if (y < y0) continue;
    const px = s.x + nx * (s.sx / 2 + 0.8);
    const pz = s.z + nz * (s.sz / 2 + 0.8);
    const a = rng.int(0, ADS.length - 1), b = (a + rng.int(1, ADS.length - 1)) % ADS.length;
    const set = portrait ? textures : wide;
    const mat = patchFog(new THREE.MeshBasicMaterial({
      map: set[a],
      color: new THREE.Color(1, 1, 1).multiplyScalar(1.6),
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(px, y, pz);
    m.rotation.y = Math.atan2(nx, nz);
    group.add(m);
    panels.push({ mesh: m, maps: [set[a], set[b]], period: rng.range(6, 14), offset: rng.range(0, 10), flicker: rng.range(0, 100) });
  }

  const update = (t) => {
    for (const p of panels) {
      const k = Math.floor((t + p.offset) / p.period) % 2;
      if (p.mesh.material.map !== p.maps[k]) {
        p.mesh.material.map = p.maps[k];
      }
      // A brief glitch as the panel changes.
      const phase = ((t + p.offset) % p.period) / p.period;
      p.mesh.material.opacity = phase < 0.03 ? 0.4 + 0.5 * Math.random() : 0.92;
    }
  };
  addBanners(group, segs, rng);
  return { group, update };
}

// Vertical neon banners hung on tower faces near the hub. One instanced mesh
// per design, so a hundred and fifty banners cost a handful of draw calls.
const BANNERS = [
  ['NOODLES', '#ffc266'], ['HOTEL', '#7feaff'], ['CAF', '#ff7ac0'], ['DROIDS', '#8dffad'],
  ['SPICE', '#ffb347'], ['CLUB 9', '#c78cff'], ['BAR', '#ff4d6d'], ['REPAIR', '#7fa8ff'],
  ['CANTINA', '#ffd166'], ['HOLO', '#66ffe0'],
];

function bannerTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 640;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(8,8,14,0.85)';
  g.fillRect(0, 0, 128, 640);
  g.strokeStyle = color;
  g.lineWidth = 6;
  g.shadowColor = color;
  g.shadowBlur = 14;
  g.strokeRect(8, 8, 112, 624);
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const chars = [...text.replace(/ /g, '')];
  const step = Math.min(90, 560 / chars.length);
  g.font = `700 ${Math.floor(step * 0.8)}px "Arial Narrow", Arial, sans-serif`;
  chars.forEach((ch, i) => g.fillText(ch, 64, 50 + step * (i + 0.5)));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function addBanners(group, segs, rng) {
  const spots = BANNERS.map(() => []);
  const cands = segs.filter((s) => s.kind === 'box' && s.sy > 60 && s.style[3] !== 4 && s.sx > 20 && s.sz > 20);
  for (const s of cands) {
    const d = Math.hypot(s.x, s.z);
    if (d < 150 || d > 1100 || !rng.chance(d < 500 ? 0.75 : 0.45)) continue;
    const y0 = s.y - s.sy / 2, y1 = s.y + s.sy / 2;
    const count = rng.int(1, 2);
    for (let k = 0; k < count; k++) {
      const h = rng.range(22, 46);
      const lo = Math.max(y0 + h / 2 + 10, 110), hi = Math.min(y1 - h / 2 - 4, 620);
      if (hi <= lo) continue;
      const y = rng.range(lo, hi);
      // Hang it off a corner, sticking out from one face.
      const sx = rng.chance(0.5) ? 1 : -1, sz = rng.chance(0.5) ? 1 : -1;
      const alongX = rng.chance(0.5);
      const w = h * 0.2;
      const x = s.x + sx * (s.sx / 2 + (alongX ? w / 2 + 0.3 : 0.4));
      const z = s.z + sz * (s.sz / 2 + (alongX ? 0.4 : w / 2 + 0.3));
      // Plane faces along the street so it reads from both directions.
      const rot = alongX ? 0 : Math.PI / 2;
      spots[rng.int(0, BANNERS.length - 1)].push({ x, y, z, w, h, rot });
    }
  }
  const geo = new THREE.PlaneGeometry(1, 1);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  BANNERS.forEach(([text, color], i) => {
    const list = spots[i];
    if (!list.length) return;
    const mat = patchFog(new THREE.MeshBasicMaterial({
      map: bannerTexture(text, color),
      color: new THREE.Color(2.2, 2.2, 2.2),
      side: THREE.DoubleSide,
    }));
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((b, k) => {
      q.setFromAxisAngle(up, b.rot);
      m.compose(p.set(b.x, b.y, b.z), q, sc.set(b.w, b.h, 1));
      mesh.setMatrixAt(k, m);
    });
    mesh.frustumCulled = false;
    group.add(mesh);
  });
}
