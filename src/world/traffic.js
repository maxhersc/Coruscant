import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CELL, GRID, LEVELS, LANE_CLEARANCE } from '../config.js';
import { makeRng } from '../core/rng.js';
import { ENV, SKY_GLSL } from './env.js';

// Skylane traffic. Every vehicle's position is computed on the GPU from its
// lane and the clock, so tens of thousands of craft cost one draw call each
// for cars and for heavy haulers.

function partGeo(geo, part) {
  const n = geo.attributes.position.count;
  geo.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(part), 1));
  return geo;
}

function carGeometry() {
  const body = partGeo(new THREE.BoxGeometry(1.8, 0.8, 4.6), 0);
  const cab = partGeo(new THREE.BoxGeometry(1.3, 0.6, 1.8).translate(0, 0.6, -0.3), 0);
  const head = partGeo(new THREE.BoxGeometry(1.6, 0.25, 0.1).translate(0, 0.05, 2.32), 1);
  const tail = partGeo(new THREE.BoxGeometry(1.7, 0.3, 0.1).translate(0, 0.05, -2.32), 2);
  const under = partGeo(new THREE.BoxGeometry(1.2, 0.08, 3.0).translate(0, -0.42, 0), 3);
  return mergeGeometries([body, cab, head, tail, under].map((g) => g.index ? g.toNonIndexed() : g));
}

function haulerGeometry() {
  const body = partGeo(new THREE.BoxGeometry(5, 4, 22), 0);
  const nose = partGeo(new THREE.BoxGeometry(4, 2.5, 3).translate(0, 0.5, 12.5), 0);
  const head = partGeo(new THREE.BoxGeometry(3.6, 0.5, 0.2).translate(0, 0.8, 14.05), 1);
  const tail = partGeo(new THREE.BoxGeometry(4.6, 0.6, 0.2).translate(0, 0, -11.05), 2);
  const strip = partGeo(new THREE.BoxGeometry(5.05, 0.3, 18).translate(0, 0.6, 0), 4);
  return mergeGeometries([body, nose, head, tail, strip].map((g) => g.index ? g.toNonIndexed() : g));
}

const VERT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute float aPart;
  attribute vec4 aLane;   // start x, y, z, length
  attribute vec4 aMove;   // dir x, dir z, speed, phase
  attribute float aColor;
  uniform float uTime;
  flat varying float vPart;
  flat varying float vColor;
  varying vec3 vWp;
  varying vec3 vN;
  varying float vFade;
  void main() {
    float len = aLane.w;
    float s = mod(aMove.w + uTime * aMove.z, len);
    vec3 dir = vec3(aMove.x, 0.0, aMove.y);
    vec3 origin = aLane.xyz + dir * s;
    // Gentle bob so streams do not look like rails.
    origin.y += sin(uTime * 0.7 + aMove.w * 0.13) * 0.6;
    // Local +z faces the direction of travel.
    vec3 fwd = dir;
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
    float camDist = distance(origin, cameraPosition);
    // Far craft grow so their lights stay a few pixels wide.
    float grow = max(1.0, camDist / 420.0);
    vec3 lp = position * grow;
    vec3 wp = origin + right * lp.x + vec3(0.0, lp.y, 0.0) + fwd * lp.z;
    vWp = wp;
    vN = right * normal.x + vec3(0.0, normal.y, 0.0) + fwd * normal.z;
    vPart = aPart;
    vColor = aColor;
    vFade = smoothstep(0.0, 120.0, s) * smoothstep(len, len - 120.0, s);
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
    #include <logdepthbuf_vertex>
  }`;

const FRAG = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  ${SKY_GLSL}
  flat varying float vPart;
  flat varying float vColor;
  varying vec3 vWp;
  varying vec3 vN;
  varying float vFade;
  vec3 paint(float c) {
    if (c < 0.2) return vec3(0.75, 0.72, 0.66);
    if (c < 0.35) return vec3(0.55, 0.12, 0.1);
    if (c < 0.5) return vec3(0.85, 0.65, 0.2);
    if (c < 0.62) return vec3(0.12, 0.25, 0.5);
    if (c < 0.75) return vec3(0.2, 0.2, 0.22);
    if (c < 0.87) return vec3(0.9, 0.9, 0.92);
    return vec3(0.3, 0.45, 0.35);
  }
  void main() {
    if (vFade < 0.01) discard;
    vec3 col;
    if (vPart < 0.5) {
      vec3 n = normalize(vN);
      vec3 light = uAmbient * (0.6 + 0.4 * n.y) + uSunColor * max(dot(n, uSunDir), 0.0) * 0.45;
      col = paint(vColor) * light;
    } else if (vPart < 1.5) {
      col = vec3(4.0, 3.6, 3.0) * (0.5 + uNight);
    } else if (vPart < 2.5) {
      col = vec3(4.5, 0.4, 0.2) * (0.5 + uNight);
    } else if (vPart < 3.5) {
      col = vec3(0.3, 0.8, 2.5) * (0.4 + uNight);
    } else {
      col = vec3(2.2, 1.6, 0.8) * (0.4 + uNight);
    }
    col = applyFog(col, vWp);
    gl_FragColor = vec4(col, 1.0);
    #include <logdepthbuf_fragment>
  }`;

// Near the hub, lanes keep clear of each level's slab and the buildings on it.
function laneAltitudeOk(a, nearHub) {
  if (!nearHub) return true;
  for (const L of Object.values(LEVELS)) if (a > L - LANE_CLEARANCE && a < L + LANE_CLEARANCE + 18) return false;
  return true;
}

// Returns { group, lanes } where lanes describe each lane for gameplay
// (near-miss audio, NPC talk about traffic).
export function createTraffic() {
  const rng = makeRng(2024);
  const cars = [];
  const haulers = [];
  const lanes = [];
  const span = GRID * CELL;
  const ALTS = [70, 95, 125, 150, 185, 215, 245, 275, 330, 365, 400, 470, 520, 560, 640, 720, 820, 950];

  for (const axis of ['x', 'z']) {
    for (let k = -GRID; k < GRID; k++) {
      let c = (k + 0.5) * CELL;
      // The street south of the Spire runs past its lift shaft: shift it clear.
      if (axis === 'x' && k === -1) c -= 5;
      const nearHub = Math.abs(c) < 260;
      // Busier lanes near the centre.
      const busy = 1 - Math.min(Math.abs(c) / span, 1) * 0.6;
      const nAlt = rng.int(2, 4) + (nearHub ? 3 : 0);
      const used = new Set();
      for (let a = 0; a < nAlt; a++) {
        let alt;
        let tries = 0;
        do { alt = rng.pick(ALTS) + rng.range(-6, 6); tries++; } while ((!laneAltitudeOk(alt, nearHub) || used.has(Math.round(alt / 20))) && tries < 20);
        if (tries >= 20) continue;
        used.add(Math.round(alt / 20));
        for (const sign of [1, -1]) {
          const off = sign * 5.5;
          const start = axis === 'x' ? [-span * sign, alt, c + off] : [c - off, alt, -span * sign];
          const dir = axis === 'x' ? [sign, 0] : [0, sign];
          const speed = rng.range(38, 75);
          const len = span * 2;
          const lane = { axis, c: c + (axis === 'x' ? off : -off), alt, sign, speed, len, start, dir, cars: [] };
          lanes.push(lane);
          const spacing = rng.range(70, 180) / busy;
          const count = Math.floor(len / spacing);
          const hauler = rng.chance(0.12);
          const list = hauler ? haulers : cars;
          const hCount = hauler ? Math.max(3, Math.floor(count / 6)) : count;
          for (let i = 0; i < hCount; i++) {
            const phase = (i / hCount) * len + rng.range(-spacing * 0.3, spacing * 0.3);
            list.push({ start, len, dir, speed: hauler ? speed * 0.55 : speed * rng.range(0.92, 1.08), phase, color: rng.next() });
            lane.cars.push(phase);
          }
        }
      }
    }
  }

  const group = new THREE.Group();
  const build = (list, geo) => {
    const mat = new THREE.ShaderMaterial({ uniforms: { ...ENV }, vertexShader: VERT, fragmentShader: FRAG });
    const ig = new THREE.InstancedBufferGeometry();
    ig.index = geo.index;
    for (const k in geo.attributes) ig.setAttribute(k, geo.attributes[k]);
    const laneA = new Float32Array(list.length * 4);
    const moveA = new Float32Array(list.length * 4);
    const colA = new Float32Array(list.length);
    list.forEach((c, i) => {
      laneA.set([c.start[0], c.start[1], c.start[2], c.len], i * 4);
      moveA.set([c.dir[0], c.dir[1], c.speed, c.phase], i * 4);
      colA[i] = c.color;
    });
    ig.setAttribute('aLane', new THREE.InstancedBufferAttribute(laneA, 4));
    ig.setAttribute('aMove', new THREE.InstancedBufferAttribute(moveA, 4));
    ig.setAttribute('aColor', new THREE.InstancedBufferAttribute(colA, 1));
    ig.instanceCount = list.length;
    const mesh = new THREE.Mesh(ig, mat);
    mesh.frustumCulled = false;
    group.add(mesh);
  };
  build(cars, carGeometry());
  build(haulers, haulerGeometry());

  return { group, lanes, carCount: cars.length + haulers.length };
}

// Position of the nearest craft on any lane to p, computed the same way as
// the shader. Used for near-miss sounds and collisions with the player.
export function nearestCraft(lanes, p, time, maxDist = 40) {
  let best = null, bestD = maxDist;
  for (const lane of lanes) {
    if (Math.abs(p.y - lane.alt) > maxDist) continue;
    const lat = lane.axis === 'x' ? p.z - lane.c : p.x - lane.c;
    if (Math.abs(lat) > maxDist) continue;
    const along = lane.axis === 'x' ? p.x : p.z;
    const sAlong = (along - lane.start[lane.axis === 'x' ? 0 : 2]) * lane.sign;
    for (const phase of lane.cars) {
      let s = (phase + time * lane.speed) % lane.len;
      if (s < 0) s += lane.len;
      const ds = Math.abs(s - sAlong);
      if (ds > bestD) continue;
      const d = Math.hypot(ds, lat, p.y - lane.alt);
      if (d < bestD) {
        bestD = d;
        best = { d, speed: lane.speed, lane };
      }
    }
  }
  return best;
}
