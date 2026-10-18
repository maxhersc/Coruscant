import * as THREE from 'three';
import { MAT, box, slab, railRect, sign, lamp } from './props.js';
import { glowMat, patchFog } from './env.js';
import { addInteract, addZone, npcZones, pads } from '../systems/interact.js';

// The Undercity Shelf: an old platform hanging in a street canyon below the
// cloud deck, where the light never reaches. It sits at a street crossing,
// clear of towers, and below the lowest skylane.
export const SHELF = { x: -420, y: 55, z: 540, w: 22, d: 52 };

export function buildUndercity() {
  const g = new THREE.Group();
  const { x, y, z, w, d } = SHELF;
  const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
  const rust = patchFog(new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 0.9, metalness: 0.4 }));
  slab(g, x0, z0, x1, z1, y, MAT.floorDark, 3);
  // Old girders under the deck, hanging into the dark.
  for (const gz of [z0 + 4, z, z1 - 4]) {
    box(g, x0, y - 9, gz - 0.6, x1, y - 3, gz + 0.6, rust, { solid: false });
    box(g, x - 0.6, y - 40, gz - 0.6, x + 0.6, y - 3, gz + 0.6, rust, { solid: false });
  }
  railRect(g, x0 + 0.3, z0 + 0.3, x1 - 0.3, z1 - 0.3, y, [{ side: 'n', at: x, width: 10 }]);

  // A shack with a flickering sign, crates, pipes venting steam.
  box(g, x0 + 1, y, z0 + 1, x0 + 9, y + 4, z0 + 9, rust, { noWalk: true });
  sign(g, 'THE SHELF', x0 + 5, y + 4.8, z0 + 9.2, 7, 1.4, 0, { fg: '#ff5544', glyphs: true, intensity: 2.4 });
  addInteract({ pos: new THREE.Vector3(x0 + 5, y, z0 + 10.5), radius: 2.6, label: 'Black market', action: 'shop', data: { shop: 'black' } });
  for (const [cx, cz, s] of [[x1 - 3, z0 + 3, 1.6], [x1 - 5.5, z0 + 3.4, 1.2], [x1 - 3.2, z0 + 6, 1.3], [x0 + 3, z1 - 8, 1.5], [x0 + 4.8, z1 - 6, 1.1]]) {
    box(g, cx - s / 2, y, cz - s / 2, cx + s / 2, y + s, cz + s / 2, MAT.wood, { noWalk: true });
  }
  for (const pz of [z - 10, z + 6]) {
    box(g, x1 - 1.2, y, pz - 0.4, x1 - 0.4, y + 6, pz + 0.4, MAT.darkMetal, { noWalk: true });
  }
  // Warning lights along the edges.
  for (let k = 0; k < 6; k++) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), glowMat(k % 2 ? 0xff3322 : 0xffaa33, 4));
    l.position.set(k % 2 ? x0 + 0.6 : x1 - 0.6, y + 1.4, z0 + 4 + k * ((d - 8) / 5));
    g.add(l);
  }
  lamp(g, x0 + 2, y, z);
  lamp(g, x1 - 2, y, z + 14);

  // The cache: an old cargo locker with a dim green lock.
  const cachePos = new THREE.Vector3(x - 6, y, z1 - 4);
  box(g, cachePos.x - 0.9, y, cachePos.z - 0.5, cachePos.x + 0.9, y + 1.3, cachePos.z + 0.5, MAT.darkMetal, { noWalk: true });
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.05), glowMat(0x55ff88, 3));
  lock.position.set(cachePos.x, y + 0.9, cachePos.z - 0.53);
  g.add(lock);
  addInteract({ pos: new THREE.Vector3(cachePos.x, y, cachePos.z - 2), radius: 2.4, label: 'Search the old cargo locker', action: 'cache' });

  // A landing marking at the open north end.
  const ring = new THREE.Mesh(new THREE.RingGeometry(6, 6.4, 40), MAT.padGlow);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, y + 0.03, z1 - 12);
  g.add(ring);
  pads.push({ name: 'Undercity Shelf', x, y, z: z1 - 12, size: 14, hidden: true });

  addZone('Undercity Shelf', 'Below the clouds · Level 55', x0 - 4, y - 3, z0 - 4, x1 + 4, y + 30, z1 + 4, 3);
  npcZones.push({ x0: x0 + 2, x1: x1 - 2, z0: z0 + 2, z1: z1 - 2, y, count: 7 });

  return { group: g, cachePos, center: new THREE.Vector3(x, y, z) };
}
