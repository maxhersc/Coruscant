// Every solid in the world is an axis-aligned box. Its top is walkable and its
// sides block. One spatial hash over XZ serves the walker, the speeder, the
// crowd and the camera.

const HASH = 64;

export class CollisionWorld {
  constructor() {
    this.cells = new Map();
    this.stamp = 0;
    this.all = [];
  }

  key(ix, iz) {
    return ix * 73856093 ^ iz * 19349663;
  }

  // box: {min:[x,y,z], max:[x,y,z], tag?, dynamic?}
  add(box) {
    box._s = 0;
    this.all.push(box);
    const x0 = Math.floor(box.min[0] / HASH), x1 = Math.floor(box.max[0] / HASH);
    const z0 = Math.floor(box.min[2] / HASH), z1 = Math.floor(box.max[2] / HASH);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = this.key(ix, iz);
        let list = this.cells.get(k);
        if (!list) this.cells.set(k, (list = []));
        list.push(box);
      }
    }
    return box;
  }

  addBox(minx, miny, minz, maxx, maxy, maxz, tag) {
    return this.add({ min: [minx, miny, minz], max: [maxx, maxy, maxz], tag });
  }

  // Boxes overlapping an XZ rectangle. The result array is reused.
  query(minx, minz, maxx, maxz, out = []) {
    out.length = 0;
    const s = ++this.stamp;
    const x0 = Math.floor(minx / HASH), x1 = Math.floor(maxx / HASH);
    const z0 = Math.floor(minz / HASH), z1 = Math.floor(maxz / HASH);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const list = this.cells.get(this.key(ix, iz));
        if (!list) continue;
        for (const b of list) {
          if (b._s === s || b.disabled) continue;
          b._s = s;
          if (b.max[0] < minx || b.min[0] > maxx || b.max[2] < minz || b.min[2] > maxz) continue;
          out.push(b);
        }
      }
    }
    return out;
  }

  // Highest walkable top under (x,z) that is at or below y + step.
  groundAt(x, z, y, step = 0.5, r = 0) {
    const boxes = this.query(x - r, z - r, x + r, z + r, this._tmp || (this._tmp = []));
    let best = -Infinity;
    for (const b of boxes) {
      if (b.noWalk) continue;
      if (x < b.min[0] - r || x > b.max[0] + r || z < b.min[2] - r || z > b.max[2] + r) continue;
      const top = b.max[1];
      if (top <= y + step && top > best) best = top;
    }
    return best;
  }

  // Is a point inside any box?
  pointInside(x, y, z) {
    const boxes = this.query(x, z, x, z, this._tmp2 || (this._tmp2 = []));
    for (const b of boxes) {
      if (x > b.min[0] && x < b.max[0] && y > b.min[1] && y < b.max[1] && z > b.min[2] && z < b.max[2]) return b;
    }
    return null;
  }

  // Push a vertical cylinder (feet at y) out of boxes that overlap its body.
  resolveCylinder(pos, radius, height, step) {
    const boxes = this.query(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius, this._tmp3 || (this._tmp3 = []));
    let hit = false;
    for (const b of boxes) {
      if (b.max[1] <= pos.y + step || b.min[1] >= pos.y + height) continue;
      const cx = Math.max(b.min[0], Math.min(pos.x, b.max[0]));
      const cz = Math.max(b.min[2], Math.min(pos.z, b.max[2]));
      let dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      hit = true;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else {
        // Centre is inside the box: leave by the nearest side.
        const pen = [pos.x - b.min[0], b.max[0] - pos.x, pos.z - b.min[2], b.max[2] - pos.z];
        const m = pen.indexOf(Math.min(...pen));
        if (m === 0) pos.x = b.min[0] - radius;
        else if (m === 1) pos.x = b.max[0] + radius;
        else if (m === 2) pos.z = b.min[2] - radius;
        else pos.z = b.max[2] + radius;
      }
    }
    return hit;
  }

  // Push a sphere out of all boxes; returns the summed push normal or null.
  resolveSphere(pos, radius, normalOut) {
    const boxes = this.query(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius, this._tmp4 || (this._tmp4 = []));
    let hit = false;
    normalOut.set(0, 0, 0);
    for (const b of boxes) {
      const cx = Math.max(b.min[0], Math.min(pos.x, b.max[0]));
      const cy = Math.max(b.min[1], Math.min(pos.y, b.max[1]));
      const cz = Math.max(b.min[2], Math.min(pos.z, b.max[2]));
      let dx = pos.x - cx, dy = pos.y - cy, dz = pos.z - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= radius * radius) continue;
      hit = true;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        dx /= d; dy /= d; dz /= d;
        const push = radius - d;
        pos.x += dx * push; pos.y += dy * push; pos.z += dz * push;
        normalOut.x += dx; normalOut.y += dy; normalOut.z += dz;
      } else {
        const pen = [pos.x - b.min[0], b.max[0] - pos.x, pos.y - b.min[1], b.max[1] - pos.y, pos.z - b.min[2], b.max[2] - pos.z];
        const m = pen.indexOf(Math.min(...pen));
        const axis = m >> 1, sign = m & 1 ? 1 : -1;
        const comp = ['x', 'y', 'z'][axis];
        pos[comp] = sign > 0 ? b.max[axis] + radius : b.min[axis] - radius;
        normalOut[comp] += sign;
      }
    }
    if (hit && normalOut.lengthSq() > 0) normalOut.normalize();
    return hit;
  }

  // March a segment and return the first fraction (0..1) that enters a box.
  segmentHit(ax, ay, az, bx, by, bz, steps = 24) {
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (this.pointInside(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t)) return (i - 1) / steps;
    }
    return 1;
  }
}

export const world = new CollisionWorld();
