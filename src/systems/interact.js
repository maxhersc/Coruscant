import * as THREE from 'three';

// Registries the world fills while it is built and the game reads every frame.

// {pos | getPos(), radius, label (string | fn), action: id, data, enabled?: fn}
export const interactables = [];
// Named places shown on arrival: {name, sub, min:[x,y,z], max:[x,y,z]}
export const zones = [];
// Rectangles the crowd wanders: {x0,x1,z0,z1,y,count,style}
export const npcZones = [];
// Where speeders can be set down: {name, x, y, z, size}
export const pads = [];
// Rooftop decks used as courier destinations: {name, x, y, z, w, d, dropPos}
export const decks = [];

export function addInteract(def) {
  def.radius ??= 2.4;
  interactables.push(def);
  return def;
}

const tmp = new THREE.Vector3();
export function nearestInteract(p) {
  let best = null, bestD = Infinity;
  for (const it of interactables) {
    const pos = it.getPos ? it.getPos(tmp) : it.pos;
    if (Math.abs(pos.y - p.y) > 2.5) continue;
    const d = Math.hypot(pos.x - p.x, pos.z - p.z);
    if (d > it.radius || d >= bestD) continue;
    if (it.enabled && !it.enabled()) continue;
    best = it;
    bestD = d;
  }
  return best;
}

export function addZone(name, sub, x0, y0, z0, x1, y1, z1, priority = 0) {
  zones.push({ name, sub, min: [x0, y0, z0], max: [x1, y1, z1], priority });
}

export function zoneAt(p) {
  let best = null;
  for (const z of zones) {
    if (p.x < z.min[0] || p.x > z.max[0] || p.y < z.min[1] || p.y > z.max[1] || p.z < z.min[2] || p.z > z.max[2]) continue;
    if (!best || z.priority > best.priority) best = z;
  }
  return best;
}
