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
  return { group, update };
}
