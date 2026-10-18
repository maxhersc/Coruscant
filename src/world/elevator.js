import * as THREE from 'three';
import { world } from '../core/collision.js';
import { MAT, box } from './props.js';
import { patchFog } from './env.js';

// The glass lift on the Spire's south face. The car is a moving floor; a door
// barrier closes each landing whenever the car is not docked there.
export const SHAFT = { x0: -8, x1: 8, z0: -55, z1: -40 };

export class Elevator {
  constructor(parent, levels) {
    this.levels = levels; // [{name, y}]
    this.y = levels[1].y;
    this.target = this.y;
    this.speed = 0;
    this.riding = false;
    this.onArrive = null;

    const bottom = levels[0].y - 10, top = levels[levels.length - 1].y + 12;
    // Shaft: glass skin, corner columns and running light strips.
    const glass = new THREE.Mesh(new THREE.BoxGeometry(16, top - bottom, 14.6), MAT.glass);
    glass.position.set(0, (top + bottom) / 2, -47.7);
    parent.add(glass);
    for (const [x, z] of [[-8, -55], [8, -55]]) {
      box(parent, x - 0.4, bottom, z - 0.4, x + 0.4, top, z + 0.4, MAT.metal, { noWalk: true });
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.15, top - bottom, 0.15), MAT.neonCyan);
      strip.position.set(x, (top + bottom) / 2, z - 0.5);
      parent.add(strip);
    }
    // Side walls block walking into the shaft from the landings.
    world.addBox(-8.2, bottom, -55, -7.2, top, -40, 'shaft').noWalk = true;
    world.addBox(7.2, bottom, -55, 8.2, top, -40, 'shaft').noWalk = true;

    // Car.
    this.car = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.BoxGeometry(14, 0.4, 14.5), MAT.darkMetal);
    floor.position.set(0, -0.2, 0);
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(14, 0.3, 14.5), MAT.darkMetal);
    ceil.position.set(0, 4.2, 0);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(10, 0.05, 10), MAT.neonWhite);
    panel.position.set(0, 4.03, 0);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(14.2, 0.1, 14.7), MAT.neonCyan);
    trim.position.set(0, 0.02, 0);
    const console_ = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.3, 0.5), MAT.metal);
    console_.position.set(5.5, 0.65, 6.6);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 0.05), MAT.screen);
    screen.position.set(5.5, 1.1, 6.33);
    this.car.add(floor, ceil, panel, trim, console_, screen);
    this.car.position.set(0, this.y, -47.25);
    this.car.userData.dynamic = true;
    parent.add(this.car);
    this.floor = world.addBox(-7, this.y - 0.4, -54.5, 7, this.y, -40, 'lift');

    // Landing barriers.
    this.doors = levels.map((lv) => {
      const b = world.addBox(-7.2, lv.y, -55.3, 7.2, lv.y + 3.8, -54.7, 'liftdoor');
      b.noWalk = true;
      const mat = patchFog(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffaa33).multiplyScalar(2), transparent: true, opacity: 0.3, depthWrite: false }));
      const m = new THREE.Mesh(new THREE.BoxGeometry(14.4, 3.8, 0.1), mat);
      m.position.set(0, lv.y + 1.9, -55);
      m.userData.dynamic = true;
      parent.add(m);
      return { box: b, mesh: m, y: lv.y };
    });
    this.updateDoors();
  }

  levelIndexAt(y) {
    let best = 0;
    this.levels.forEach((lv, i) => {
      if (Math.abs(lv.y - y) < Math.abs(this.levels[best].y - y)) best = i;
    });
    return best;
  }

  docked() {
    return this.y === this.target;
  }

  call(index) {
    this.target = this.levels[index].y;
  }

  containsPlayer(p) {
    return p.x > -7 && p.x < 7 && p.z > -54.5 && p.z < -40 && Math.abs(p.y - this.y) < 1.2;
  }

  updateDoors() {
    for (const d of this.doors) {
      const open = this.docked() && Math.abs(this.y - d.y) < 0.01;
      d.box.disabled = open;
      d.mesh.visible = !open;
    }
  }

  update(dt, player) {
    if (this.y !== this.target) {
      const dist = this.target - this.y;
      const dir = Math.sign(dist);
      // Ease in and out: accelerate to 28 m/s, slow over the last stretch.
      const maxV = Math.min(28, Math.sqrt(2 * 9 * Math.abs(dist)) + 0.5);
      this.speed = Math.min(maxV, this.speed + 12 * dt);
      let step = dir * this.speed * dt;
      if (Math.abs(step) >= Math.abs(dist)) step = dist;
      const carry = player && this.containsPlayer(player.pos);
      this.y += step;
      if (carry) {
        player.pos.y = this.y;
        player.vel.y = 0;
      }
      if (this.y === this.target) {
        this.speed = 0;
        if (this.onArrive) this.onArrive(this.levelIndexAt(this.y));
      }
    }
    this.car.position.y = this.y;
    this.floor.min[1] = this.y - 0.4;
    this.floor.max[1] = this.y;
    this.updateDoors();
  }
}
