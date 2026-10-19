import * as THREE from 'three';
import { world } from '../core/collision.js';
import { key, pressed } from '../core/input.js';
import { createHumanoid } from '../npc/character.js';

const RADIUS = 0.35, HEIGHT = 1.8, STEP = 0.45, GRAVITY = 26;

// The player on foot: capsule-ish physics over the box world, with the
// articulated model following.
export class Walker {
  constructor(scene) {
    this.scene = scene;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.onGround = false;
    this.lastSafe = new THREE.Vector3();
    this.model = createHumanoid({ cloth: 0x3b4e6e, accent: 0xd9a441, skin: 0xc68e6a });
    scene.add(this.model.group);
    this.speedMul = 1;
    this.frozen = false;
    this._wish = new THREE.Vector3();
    // What your clothes let you do: run faster, thrust with a jump pack, glide.
    this.abilities = { runner: false, jet: false, glide: false };
    this.fuel = 2.5;
    this.thrusting = false;
    this.gliding = false;
  }

  // Swap the model for one wearing different clothes.
  setLook(look) {
    const visible = this.model.group.visible;
    this.scene.remove(this.model.group);
    this.model = createHumanoid(look);
    this.model.group.visible = visible;
    this.scene.add(this.model.group);
    this.syncModel(0);
  }

  place(x, y, z, facing = 0) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.facing = facing;
    this.lastSafe.copy(this.pos);
    this.syncModel(0);
  }

  setVisible(v) {
    this.model.group.visible = v;
  }

  update(dt, camYaw) {
    let fx = 0, fz = 0;
    if (!this.frozen) {
      if (key('KeyW') || key('ArrowUp')) fz += 1;
      if (key('KeyS') || key('ArrowDown')) fz -= 1;
      if (key('KeyA') || key('ArrowLeft')) fx -= 1;
      if (key('KeyD') || key('ArrowRight')) fx += 1;
    }
    const fwdX = Math.sin(camYaw), fwdZ = Math.cos(camYaw);
    const rightX = -Math.cos(camYaw), rightZ = Math.sin(camYaw);
    const wish = this._wish.set(fwdX * fz + rightX * fx, 0, fwdZ * fz + rightZ * fx);
    const len = wish.length();
    const sprint = key('ShiftLeft') || key('ShiftRight');
    const ab = this.abilities;
    const speed = (sprint ? 7.6 : 4.3) * this.speedMul * (ab.runner ? 1.3 : 1);
    if (len > 0) wish.multiplyScalar(speed / len);
    const accel = this.onGround ? 14 : 3;
    const k = 1 - Math.exp(-accel * dt);
    this.vel.x += (wish.x - this.vel.x) * k;
    this.vel.z += (wish.z - this.vel.z) * k;

    if (this.onGround && !this.frozen && pressed('Space')) {
      this.vel.y = ab.runner ? 9.2 : 7.4;
      this.onGround = false;
    }
    this.vel.y -= GRAVITY * dt;
    // In the air, holding Space: a jump pack thrusts, glider wings glide.
    const hold = !this.frozen && !this.onGround && key('Space');
    this.thrusting = ab.jet && hold && this.fuel > 0 && !pressed('Space');
    if (this.thrusting) {
      this.vel.y = Math.min(7, this.vel.y + 36 * dt);
      this.fuel -= dt;
    } else if (this.onGround) this.fuel = Math.min(2.5, this.fuel + dt * 1.2);
    this.gliding = ab.glide && hold && this.vel.y < -1.5;
    if (this.gliding) {
      this.vel.y = Math.max(this.vel.y, -2.6);
      const fx = Math.sin(this.facing) * 13, fz = Math.cos(this.facing) * 13;
      this.vel.x += (fx - this.vel.x) * Math.min(1, dt * 1.5);
      this.vel.z += (fz - this.vel.z) * Math.min(1, dt * 1.5);
    }
    this.model.setPose?.({ thrust: this.thrusting, glide: this.gliding });
    if (this.vel.y < -60) this.vel.y = -60;

    // Integrate in two halves so fast falls do not skip thin floors.
    for (let i = 0; i < 2; i++) {
      const h = dt / 2;
      const prevY = this.pos.y;
      this.pos.x += this.vel.x * h;
      this.pos.z += this.vel.z * h;
      this.pos.y += this.vel.y * h;
      world.resolveCylinder(this.pos, RADIUS, HEIGHT, STEP);
      const g = world.groundAt(this.pos.x, this.pos.z, Math.max(prevY, this.pos.y), STEP, 0.2);
      const snap = this.onGround ? STEP : 0.05;
      if (this.vel.y <= 0 && g > -Infinity && this.pos.y - g < snap && this.pos.y - g > -STEP - Math.max(0, prevY - this.pos.y)) {
        this.pos.y = g;
        this.vel.y = 0;
        this.onGround = true;
      } else if (this.pos.y - g > snap) {
        this.onGround = false;
      }
    }

    if (this.onGround) this.lastSafe.copy(this.pos);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.3) {
      const want = Math.atan2(this.vel.x, this.vel.z);
      let d = want - this.facing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.facing += d * Math.min(1, dt * 12);
    }
    this.syncModel(dt, hs);
  }

  syncModel(dt, hs = 0) {
    this.model.group.position.copy(this.pos);
    this.model.group.rotation.y = this.facing;
    this.model.animate(hs, dt, !this.onGround && this.vel.y > -2 && dt > 0 && this.vel.y !== 0);
  }
}
