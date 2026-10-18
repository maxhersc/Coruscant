import * as THREE from 'three';
import { world } from '../core/collision.js';
import { input, key } from '../core/input.js';
import { stdMat, glowMat } from '../world/env.js';
import { settings } from '../systems/settings.js';

export const SPEEDER_MODELS = {
  courier: { name: 'Mk-II Courier', price: 0, maxSpeed: 95, boost: 150, accel: 1.6, turn: 1.0, color: 0xb8a27a, accent: 0xff8833, blurb: 'Reliable, slow, paid off.' },
  sport: { name: 'Vexa Sport', price: 3200, maxSpeed: 140, boost: 215, accel: 2.2, turn: 1.25, color: 0x2a6ad8, accent: 0x33ddff, blurb: 'Twin ion pods. Turns heads and corners.' },
  interceptor: { name: 'Zenith Interceptor', price: 9500, maxSpeed: 190, boost: 300, accel: 2.8, turn: 1.5, color: 0xa01c28, accent: 0xff3355, blurb: 'Ex-security frame. Do not ask where it came from.' },
};

// A speeder model facing +z. Returns the group and its exhaust materials so
// the engines can glow with throttle.
export function buildSpeederMesh(modelId, override = {}) {
  const m = { ...SPEEDER_MODELS[modelId], ...override };
  const g = new THREE.Group();
  const hull = stdMat(m.color, { roughness: 0.35, metalness: 0.65 });
  const dark = stdMat(0x1c1d22, { roughness: 0.4, metalness: 0.7 });
  const glass = stdMat(0x0a1a28, { roughness: 0.05, metalness: 0.9, emissive: 0x0a2a40 });
  const exhaust = glowMat(m.accent, 3);

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.75, 3.2, 6, 14), hull);
  body.rotation.x = Math.PI / 2;
  body.scale.set(1.25, 1, 0.55);
  g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.8, 14), hull);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 2.9;
  nose.scale.set(1.3, 1, 0.55);
  g.add(nose);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  canopy.scale.set(0.9, 0.55, 1.5);
  canopy.position.set(0, 0.3, 0.3);
  g.add(canopy);
  for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 2.6, 14), dark);
    pod.rotation.x = Math.PI / 2;
    pod.position.set(side * 1.55, -0.05, -0.9);
    g.add(pod);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.06, 6, 18), hull);
    ring.position.set(side * 1.55, -0.05, 0.4);
    g.add(ring);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.4, 16), exhaust);
    glow.position.set(side * 1.55, -0.05, -2.21);
    glow.rotation.y = Math.PI;
    g.add(glow);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.9), hull);
    strut.position.set(side * 0.95, -0.05, -0.6);
    g.add(strut);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 1.0), hull);
    fin.position.set(side * 1.55, 0.45, -1.7);
    fin.rotation.x = -0.35;
    g.add(fin);
  }
  const light = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.06), glowMat(0xfff2dd, 4));
  light.position.set(0, -0.05, 3.55);
  g.add(light);
  const under = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 2.6), glowMat(m.accent, 1.5));
  under.position.set(0, -0.42, 0);
  g.add(under);
  return { group: g, exhaust };
}

// The player's speeder: parked (hovering where it was left) or flown.
export class Speeder {
  constructor(scene, modelId = 'courier') {
    this.scene = scene;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.yawRate = 0;
    this.parked = true;
    this.groundY = 0;
    this.time = 0;
    this.onBump = null;
    this._n = new THREE.Vector3();
    this.setModel(modelId);
  }

  setModel(id) {
    if (this.group) this.scene.remove(this.group);
    this.modelId = id;
    this.spec = SPEEDER_MODELS[id];
    const built = buildSpeederMesh(id);
    this.group = built.group;
    this.exhaust = built.exhaust;
    this.baseExhaust = this.exhaust.color.clone();
    this.scene.add(this.group);
    this.sync();
  }

  park(x, groundY, z, yaw) {
    this.parked = true;
    this.groundY = groundY;
    this.pos.set(x, groundY + 0.9, z);
    this.vel.set(0, 0, 0);
    this.speed = 0;
    this.yaw = yaw;
    this.pitch = 0;
    this.roll = 0;
    this.sync();
  }

  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  update(dt, controlled) {
    this.time += dt;
    if (!controlled) {
      if (this.parked && !this.arriving) {
        this.pos.y = this.groundY + 0.9 + Math.sin(this.time * 1.6) * 0.06;
        this.roll *= 0.9;
        this.pitch *= 0.9;
      }
      this.exhaust.color.copy(this.baseExhaust).multiplyScalar(0.25);
      this.sync();
      return;
    }
    this.parked = false;
    const s = this.spec;
    // Steering: mouse turns, arrow keys too.
    let turn = -input.mouseDX * 0.0022 * s.turn;
    if (key('ArrowLeft')) turn += 1.3 * dt * s.turn;
    if (key('ArrowRight')) turn -= 1.3 * dt * s.turn;
    this.yaw += turn;
    this.yawRate = THREE.MathUtils.lerp(this.yawRate, turn / Math.max(dt, 1e-3), 1 - Math.exp(-dt * 6));
    let dp = -input.mouseDY * 0.0018 * s.turn * (settings.invertFlight ? -1 : 1);
    if (key('ArrowUp')) dp += 0.9 * dt;
    if (key('ArrowDown')) dp -= 0.9 * dt;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dp, -1.1, 1.1);
    // Level out gently when not steering in pitch.
    if (Math.abs(dp) < 1e-4) this.pitch *= 1 - Math.min(1, dt * 0.25);

    const boost = key('ShiftLeft') || key('ShiftRight');
    const max = boost ? s.boost : s.maxSpeed;
    if (key('KeyW')) this.speed += (max - this.speed) * Math.min(1, dt * s.accel * (boost ? 0.7 : 0.6));
    else if (key('KeyS')) this.speed -= (this.speed > 0 ? 60 : 12) * dt;
    else this.speed -= this.speed * Math.min(1, dt * 0.35);
    if (!key('KeyW') && this.speed > max) this.speed -= (this.speed - max) * Math.min(1, dt * 2);
    this.speed = THREE.MathUtils.clamp(this.speed, -18, s.boost);

    let strafe = 0, lift = 0;
    if (key('KeyA')) strafe += 1;
    if (key('KeyD')) strafe -= 1;
    if (key('Space')) lift += 1;
    if (key('KeyC') || key('ControlLeft')) lift -= 1;

    const fwd = this.forward(this._f || (this._f = new THREE.Vector3()));
    const rightX = Math.cos(this.yaw), rightZ = -Math.sin(this.yaw);
    const tx = fwd.x * this.speed + rightX * strafe * 22;
    const ty = fwd.y * this.speed + lift * 24;
    const tz = fwd.z * this.speed + rightZ * strafe * 22;
    const k = 1 - Math.exp(-dt * 3.2);
    this.vel.x += (tx - this.vel.x) * k;
    this.vel.y += (ty - this.vel.y) * k;
    this.vel.z += (tz - this.vel.z) * k;

    // Sub-step so fast flight does not tunnel through towers.
    const steps = Math.max(1, Math.ceil((this.vel.length() * dt) / 1.5));
    for (let i = 0; i < steps; i++) {
      this.pos.addScaledVector(this.vel, dt / steps);
      if (world.resolveSphere(this.pos, 2.0, this._n)) {
        const vn = this.vel.dot(this._n);
        if (vn < 0) {
          const impact = -vn;
          this.vel.addScaledVector(this._n, -vn * 1.35);
          this.vel.multiplyScalar(0.6);
          this.speed *= 0.45;
          if (impact > 8 && this.onBump) this.onBump(impact);
        }
      }
    }
    if (this.pos.y < 20) { this.pos.y = 20; this.vel.y = Math.max(0, this.vel.y); }
    if (this.pos.y > 3200) { this.pos.y = 3200; this.vel.y = Math.min(0, this.vel.y); }

    const targetRoll = THREE.MathUtils.clamp(-this.yawRate * 0.35 - strafe * 0.35, -1.0, 1.0);
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 5);
    const t = THREE.MathUtils.clamp(Math.abs(this.speed) / s.boost, 0, 1);
    this.exhaust.color.copy(this.baseExhaust).multiplyScalar(0.6 + t * 2.4 + (boost && key('KeyW') ? 1.5 : 0));
    this.sync();
  }

  sync() {
    this.group.position.copy(this.pos);
    this.group.rotation.set(-this.pitch, this.yaw, this.roll, 'YXZ');
  }
}
