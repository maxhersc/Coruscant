import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Merge every static mesh under `root` that shares a material into one mesh,
// so thousands of props cost a few dozen draw calls. Anything marked
// userData.dynamic (and its children), instanced meshes, lights and objects
// that animate are left alone.
export function batchStatic(root) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  const remove = [];
  const visit = (o) => {
    if (o.userData.dynamic || o.userData.spin || o.userData.isWheel || o.userData.isRaceBoard) return;
    if (o.isMesh && !o.isInstancedMesh && o.visible && o.children.length === 0) {
      const key = o.material.uuid;
      if (!groups.has(key)) groups.set(key, { material: o.material, geos: [] });
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const name of Object.keys(g.attributes)) {
        if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      }
      if (!g.attributes.uv) {
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      }
      g.applyMatrix4(o.matrixWorld);
      groups.get(key).geos.push(g);
      remove.push(o);
      return;
    }
    for (const c of o.children) visit(c);
  };
  for (const c of root.children) visit(c);

  let merged = 0;
  for (const { material, geos } of groups.values()) {
    if (geos.length < 2) {
      // Not worth merging; put the single mesh back as it was.
      continue;
    }
    const geo = mergeGeometries(geos, false);
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, material);
    mesh.renderOrder = material.transparent ? 2 : 0;
    root.add(mesh);
    merged += geos.length;
    geos.length = 0;
    geos.done = true;
  }
  // Remove the originals that were merged.
  for (const o of remove) {
    const entry = groups.get(o.material.uuid);
    if (entry && entry.geos.done) o.parent.remove(o);
  }
  return merged;
}
