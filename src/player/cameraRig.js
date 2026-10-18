import * as THREE from 'three';
import { world } from '../core/collision.js';
import { input } from '../core/input.js';

// Third-person orbit camera on foot; chase camera in the speeder.
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = -0.12;
    this.dist = 4.6;
    this.flyDist = 11;
    this.shake = 0;
    this.baseFov = 70;
    this._t = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this.override = null; // {pos, look, fov} for cutscenes and the viewer
  }

  applyShake(dt) {
    if (this.shake <= 0) return;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const s = this.shake * this.shake * 0.6;
    this.camera.position.x += (Math.random() - 0.5) * s;
    this.camera.position.y += (Math.random() - 0.5) * s;
    this.camera.position.z += (Math.random() - 0.5) * s;
  }

  setFov(fov, dt) {
    const f = this.camera.fov + (fov - this.camera.fov) * Math.min(1, dt * 4);
    if (Math.abs(f - this.camera.fov) > 0.01) {
      this.camera.fov = f;
      this.camera.updateProjectionMatrix();
    }
  }

  walk(dt, head, allowLook = true) {
    if (allowLook) {
      this.yaw -= input.mouseDX * 0.0024;
      this.pitch = THREE.MathUtils.clamp(this.pitch - input.mouseDY * 0.002, -1.25, 0.9);
      this.dist = THREE.MathUtils.clamp(this.dist + input.wheel * 0.6, 1.6, 16);
    }
    const cp = Math.cos(this.pitch);
    const f = this._d.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    const t = this._t.copy(head);
    const dx = t.x - f.x * this.dist, dy = t.y - f.y * this.dist, dz = t.z - f.z * this.dist;
    const hit = world.segmentHit(t.x, t.y, t.z, dx, dy, dz, 32);
    const k = Math.max(0.06, hit - 0.04);
    this.camera.position.set(t.x + (dx - t.x) * k, t.y + (dy - t.y) * k, t.z + (dz - t.z) * k);
    this.camera.lookAt(t);
    this.setFov(this.baseFov, dt);
    this.applyShake(dt);
  }

  fly(dt, sp) {
    const fwd = sp.forward(this._d);
    const back = this.flyDist + Math.max(0, sp.speed) * 0.025;
    const want = this._t.set(
      sp.pos.x - Math.sin(sp.yaw) * back,
      sp.pos.y + 3.2 - fwd.y * back * 0.6,
      sp.pos.z - Math.cos(sp.yaw) * back
    );
    const k = 1 - Math.exp(-dt * 7);
    this.camera.position.lerp(want, k);
    // Keep the camera out of towers.
    const c = this.camera.position;
    const hit = world.segmentHit(sp.pos.x, sp.pos.y + 1, sp.pos.z, c.x, c.y, c.z, 16);
    if (hit < 1) c.lerpVectors(sp.pos, c, Math.max(0.15, hit - 0.05));
    this._look.copy(sp.pos).addScaledVector(fwd, 24);
    this.camera.lookAt(this._look);
    this.camera.rotateZ(-sp.roll * 0.25);
    const speedT = THREE.MathUtils.clamp(sp.speed / sp.spec.boost, 0, 1);
    this.setFov(this.baseFov + speedT * 20, dt);
    // Keep the on-foot orbit aligned for when we land.
    this.yaw = sp.yaw;
    this.applyShake(dt);
  }

  cinematic(dt) {
    const o = this.override;
    this.camera.position.lerp(o.pos, 1 - Math.exp(-dt * (o.ease ?? 3)));
    this.camera.lookAt(o.look);
    this.setFov(o.fov ?? this.baseFov, dt);
  }
}
