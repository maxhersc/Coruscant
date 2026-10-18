import * as THREE from 'three';
import { stdMat, glowMat } from '../world/env.js';

// An articulated humanoid for the player: legs and arms swing with speed.
export function createHumanoid({ skin = 0xc68e6a, cloth = 0x2b3f5c, accent = 0xd9a441, pants = 0x2a2a30 } = {}) {
  const g = new THREE.Group();
  const skinM = stdMat(skin, { roughness: 0.8, metalness: 0 });
  const clothM = stdMat(cloth, { roughness: 0.85, metalness: 0.05 });
  const pantsM = stdMat(pants, { roughness: 0.9, metalness: 0 });
  const accentM = stdMat(accent, { roughness: 0.4, metalness: 0.6 });
  const bootM = stdMat(0x1a1714, { roughness: 0.6 });

  const hips = new THREE.Group();
  hips.position.y = 0.95;
  g.add(hips);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.42, 4, 10), clothM);
  torso.position.y = 0.42;
  torso.scale.set(1.15, 1, 0.75);
  hips.add(torso);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.07, 12), accentM);
  belt.position.y = 0.12;
  belt.scale.z = 0.8;
  hips.add(belt);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.04, 6, 14), accentM);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.78;
  hips.add(collar);

  const neck = new THREE.Group();
  neck.position.y = 0.8;
  hips.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 16, 12), skinM);
  head.position.y = 0.14;
  head.scale.set(0.92, 1.08, 1);
  neck.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.142, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), stdMat(0x2a1a12, { roughness: 0.9 }));
  hair.position.y = 0.16;
  hair.rotation.x = -0.25;
  neck.add(hair);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.035, 0.05), glowMat(0x66ddff, 2));
  visor.position.set(0, 0.17, 0.12);
  neck.add(visor);

  const limb = (r, len, mat) => {
    const pivot = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 8), mat);
    m.position.y = -len / 2 - r;
    pivot.add(m);
    return pivot;
  };
  const legL = limb(0.085, 0.72, pantsM), legR = limb(0.085, 0.72, pantsM);
  legL.position.set(-0.11, 0, 0);
  legR.position.set(0.11, 0, 0);
  hips.add(legL, legR);
  for (const leg of [legL, legR]) {
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.1, 0.24), bootM);
    boot.position.set(0, -0.9, 0.04);
    leg.add(boot);
  }
  const armL = limb(0.065, 0.55, clothM), armR = limb(0.065, 0.55, clothM);
  armL.position.set(-0.3, 0.68, 0);
  armR.position.set(0.3, 0.68, 0);
  hips.add(armL, armR);
  for (const arm of [armL, armR]) {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), skinM);
    hand.position.y = -0.74;
    arm.add(hand);
  }

  let phase = 0;
  const animate = (speed, dt, airborne = false) => {
    const s = Math.min(speed / 4.5, 1.8);
    phase += dt * (3 + speed * 1.6);
    const swing = Math.sin(phase) * 0.7 * Math.min(s, 1.2);
    if (airborne) {
      legL.rotation.x = -0.5; legR.rotation.x = 0.3;
      armL.rotation.x = -0.9; armR.rotation.x = -0.9;
      return;
    }
    legL.rotation.x = swing;
    legR.rotation.x = -swing;
    armL.rotation.x = -swing * 0.8;
    armR.rotation.x = swing * 0.8;
    armL.rotation.z = -0.08;
    armR.rotation.z = 0.08;
    hips.position.y = 0.95 + Math.abs(Math.cos(phase)) * 0.05 * Math.min(s, 1);
    torso.rotation.x = s * 0.08;
    neck.rotation.y = Math.sin(phase * 0.25) * 0.05;
  };

  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return { group: g, animate };
}
