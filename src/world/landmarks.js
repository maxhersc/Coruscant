import * as THREE from 'three';
import { CELL } from '../config.js';
import { stdMat, glowMat } from './env.js';

// Landmarks that give the skyline its silhouette and the player something to
// steer by. Each one owns a few city cells that the generator leaves empty.
export const LANDMARKS = [
  { id: 'dome', name: 'Assembly Dome', i: 6, j: -4, r: 2 },
  { id: 'temple', name: 'The Temple', i: -7, j: 5, r: 1 },
];

export function isLandmarkCell(i, j) {
  return LANDMARKS.some((l) => Math.abs(i - l.i) <= l.r && Math.abs(j - l.j) <= l.r);
}

export function buildLandmarks(collision, segs, beacons) {
  const group = new THREE.Group();

  // Assembly Dome: a flattened mushroom on a fluted stem.
  {
    const l = LANDMARKS[0];
    const x = l.i * CELL, z = l.j * CELL;
    const stemMat = stdMat(0x8a8780, { roughness: 0.5, metalness: 0.4 });
    const domeMat = stdMat(0xb8b4aa, { roughness: 0.35, metalness: 0.55 });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(55, 80, 280, 40), stemMat);
    stem.position.set(x, 140, z);
    group.add(stem);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(230, 64, 24), domeMat);
    dome.scale.set(1, 0.3, 1);
    dome.position.set(x, 310, z);
    group.add(dome);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(226, 2.2, 8, 96), glowMat(0x88ccff, 3));
    rim.rotation.x = Math.PI / 2;
    rim.position.set(x, 310, z);
    group.add(rim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(30, 38, 18, 24), domeMat);
    crown.position.set(x, 386, z);
    group.add(crown);
    collision.addBox(x - 55, 0, z - 55, x + 55, 290, z + 55, 'landmark');
    collision.addBox(x - 215, 290, z - 215, x + 215, 335, z + 215, 'landmark');
    collision.addBox(x - 160, 335, z - 160, x + 160, 365, z + 160, 'landmark');
    collision.addBox(x - 80, 365, z - 80, x + 80, 395, z + 80, 'landmark');
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      beacons.push([x + Math.cos(ang) * 228, 310, z + Math.sin(ang) * 228]);
    }
  }

  // The Temple: a stepped ziggurat with five spires.
  {
    const l = LANDMARKS[1];
    const x = l.i * CELL, z = l.j * CELL;
    const tiers = [[230, 160], [190, 40], [150, 36], [112, 32], [80, 28]];
    let y = 0;
    for (const [w, h] of tiers) {
      segs.push({ kind: 'box', x, y: y + h / 2, z, sx: w, sy: h, sz: w, style: [0.31, 0.12, 0.02, 0] });
      collision.addBox(x - w / 2, y, z - w / 2, x + w / 2, y + h, z + w / 2, 'landmark');
      y += h;
    }
    const top = y;
    const tw = tiers[tiers.length - 1][0];
    const spire = (sx, sz, h, r) => {
      segs.push({ kind: 'cyl', x: sx, y: top + h * 0.35 / 2, z: sz, sx: r * 2, sy: h * 0.35, sz: r * 2, style: [0.31, 0.1, 0.02, 0] });
      segs.push({ kind: 'cone', x: sx, y: top + h * 0.35 + h * 0.65 / 2, z: sz, sx: r * 2, sy: h * 0.65, sz: r * 2, style: [0.31, 0, 0.02, 4] });
      collision.addBox(sx - r * 0.8, top, sz - r * 0.8, sx + r * 0.8, top + h * 0.6, sz + r * 0.8, 'landmark');
      beacons.push([sx, top + h, sz]);
    };
    spire(x, z, 220, 14);
    const o = tw / 2 - 10;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) spire(x + dx * o, z + dz * o, 130, 9);
  }

  return group;
}
