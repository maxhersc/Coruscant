import * as THREE from 'three';
import { MAT, box, slab, railRect, sign, room, landingPad, planter, lamp } from './props.js';
import { stdMat, glowMat } from './env.js';
import { addInteract, addZone, pads } from '../systems/interact.js';
import { batchStatic } from './batch.js';
import { state, addCredits } from '../systems/state.js';
import { openPanel, closePanel, h } from '../ui/panel.js';

// Homes you can buy, each a glass house somewhere extraordinary: a hideout
// on a platform under the clouds, a penthouse on a tower over the hub, a
// villa floating 1.4 km up, and a house on top of a monolith. Every one has a
// bed, a wardrobe, a landing pad and walls for the art you collect, and each
// changes how you play. Buying your first ends your Skyhaven lease.

export const HOMES = {
  hideout: { name: 'Undercity Hideout', price: 2500, where: 'Under the clouds, beside the Shelf', perk: 'Off every map. Reach it while Spire Security is chasing you and the chase is over.' },
  penthouse: { name: 'Spire-view Penthouse', price: 12000, where: 'On a tower over the hub', perk: 'Glass walls over the Spire and a hot tub. Sleeping here leaves you fully rested and fed by room service.' },
  villa: { name: 'Floating Villa', price: 26000, where: '1.4 km above the city', perk: 'A house on an anti-grav platform above everything, with a pool. Guests pay to visit: 90 cr a day.' },
  crown: { name: 'Monolith Crown', price: 42000, where: 'On top of a monolith', perk: 'The highest home in the city. Sightseeing tours pay you 180 cr a day.' },
};
export const DAILY = { villa: 90, crown: 180 };

// Art and plants that hang on your walls.
export const ART = {
  nebula: { name: 'Nebula in glass', price: 600, color: 0x7a5cff, kind: 'art' },
  skyline: { name: 'Skyline at dusk', price: 900, color: 0xff8833, kind: 'art' },
  storm: { name: 'Storm over the Temple', price: 1500, color: 0x33ddff, kind: 'art' },
  heart: { name: 'The Pink Heart', price: 2400, color: 0xff3399, kind: 'art' },
  fern: { name: 'Glow fern', price: 120, color: 0x55ff88, kind: 'plant' },
  orchid: { name: 'Moon orchid', price: 260, color: 0xc7a6ff, kind: 'plant' },
};

export function owned() {
  state.homes ??= [];
  return state.homes;
}
export function ownsHome(id) {
  return owned().includes(id);
}
export function collection() {
  state.art ??= [];
  return state.art;
}

const built = {};

export function buildHomes(scene, { monolith, frame }) {
  const g = new THREE.Group();
  const water = glowMat(0x33bbff, 1.4);
  const bedM = stdMat(0x2a3a5a, { roughness: 0.9 });
  const sheet = stdMat(0xe8e4dc, { roughness: 0.9 });
  const sofa = stdMat(0x6a2a2a, { roughness: 0.9 });

  // A glass house on a platform: room x0..x1, z0..z1 at height y, door in the
  // south wall, a pad beside it. extra(g) adds the special parts.
  const house = (id, cx, y, cz, { w = 40, d = 40, roomW = 18, roomD = 14, padSide = 'e', padSize = 18, pool = false, frameMat = MAT.neonCyan, extra } = {}) => {
    const def = HOMES[id];
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    slab(g, x0, z0, x1, z1, y, MAT.floor, 2);
    railRect(g, x0 + 0.3, z0 + 0.3, x1 - 0.3, z1 - 0.3, y);
    const rx0 = x0 + 3, rz1 = z1 - 3, rx1 = rx0 + roomW, rz0 = rz1 - roomD;
    room(g, rx0, rz0, rx1, rz1, y, 4.2, MAT.glass, [{ side: 's', at: rx0 + roomW / 2, width: 3 }], { ceilMat: MAT.ceilWhite, frameMat, roofMat: MAT.wallDark });
    // Bed, wardrobe, sofa, terminal.
    box(g, rx0 + 1, y, rz1 - 4.5, rx0 + 4, y + 0.6, rz1 - 1, bedM, { noWalk: true });
    box(g, rx0 + 1.1, y + 0.6, rz1 - 4.4, rx0 + 3.9, y + 0.75, rz1 - 2, sheet, { solid: false });
    box(g, rx1 - 2.2, y, rz1 - 1.2, rx1 - 0.6, y + 2.6, rz1 - 0.6, MAT.wood, { noWalk: true });
    box(g, rx0 + 6, y, rz1 - 1.6, rx0 + 10, y + 0.7, rz1 - 0.7, sofa, { noWalk: true });
    planter(g, rx1 - 1.6, y, rz0 + 1.6, 0.8);
    addInteract({ pos: new THREE.Vector3(rx0 + 5, y, rz1 - 3), radius: 2.4, label: () => (ownsHome(id) ? 'Home: sleep, save, change' : 'Look around'), action: 'home', data: { id } });
    addInteract({ pos: new THREE.Vector3(rx1 - 1.4, y, rz1 - 2.2), radius: 2, label: 'Wardrobe', action: 'wardrobe', data: { id } });
    // Frames for your art, hidden until you own some; spots for plants.
    const artSlots = [];
    for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 0.08), glowMat(0xffffff, 1.2));
      m.position.set(rx0 + 3 + k * ((roomW - 6) / 3), y + 2.5, rz1 - 0.35);
      m.userData.dynamic = true;
      m.visible = false;
      g.add(m);
      artSlots.push(m);
    }
    const plantSlots = [];
    for (let k = 0; k < 2; k++) {
      const p = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), glowMat(0x55ff88, 1));
      p.position.set(rx0 + 1.2 + k * (roomW - 2.4), y + 1.1, rz0 + 1.2);
      p.userData.dynamic = true;
      p.visible = false;
      g.add(p);
      plantSlots.push(p);
    }
    if (pool) {
      const px = rx1 + 2, pz = z1 - 3;
      box(g, px, y - 0.6, pz - 8, px + 8, y + 0.02, pz, water, { solid: false });
      for (const [ax, az, bx, bz] of [[px - 0.4, pz - 8.4, px + 8.4, pz - 8], [px - 0.4, pz, px + 8.4, pz + 0.4], [px - 0.4, pz - 8.4, px, pz + 0.4], [px + 8, pz - 8.4, px + 8.4, pz + 0.4]]) box(g, ax, y, az, bx, y + 0.3, bz, MAT.metal, { noWalk: true });
    }
    // The pad.
    const pxC = padSide === 'e' ? x1 - 3 - padSize / 2 : cx, pzC = z0 + 3 + padSize / 2;
    landingPad(g, pxC, pzC, y + 0.4, padSize, null);
    pads.push({ name: def.name, x: pxC, y: y + 0.4, z: pzC, size: padSize });
    // For sale until it is yours.
    const sale = sign(g, `FOR SALE · ${def.price.toLocaleString()} CR`, rx0 + roomW / 2, y + 6, rz0 - 0.5, 12, 1.4, Math.PI, { fg: '#ffc266', glyphs: true, intensity: 2.6, twoSided: true });
    sale.userData.dynamic = true;
    addInteract({ pos: new THREE.Vector3(rx0 + roomW / 2, y, rz0 - 2.2), radius: 2.6, label: () => (ownsHome(id) ? `${def.name}` : `Buy ${def.name} · ${def.price.toLocaleString()} cr`), action: 'home', data: { id, sale: true } });
    lamp(g, x0 + 3, y, z0 + 3);
    addZone(def.name, def.where, x0 - 2, y - 3, z0 - 2, x1 + 2, y + 20, z1 + 2, 6);
    extra?.(x0, x1, z0, z1, y);
    built[id] = { center: new THREE.Vector3(cx, y, cz), door: new THREE.Vector3(rx0 + roomW / 2, y, rz0 - 2.2), sale, artSlots, plantSlots, sleepAt: new THREE.Vector3(rx0 + 5, y, rz1 - 3) };
  };

  // Hideout: a cramped shack on a platform hanging in the street canyon.
  {
    const cx = -420, y = 55, cz = 606;
    house('hideout', cx, y, cz, { w: 20, d: 30, roomW: 12, roomD: 8, padSide: 's', padSize: 14, frameMat: MAT.neonAmber, extra: (x0, x1, z0, z1) => {
      for (const gz of [z0 + 4, z1 - 4]) box(g, cx - 0.6, y - 40, gz - 0.6, cx + 0.6, y - 2, gz + 0.6, MAT.darkMetal, { solid: false });
      for (let k = 0; k < 4; k++) {
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), glowMat(k % 2 ? 0xff3322 : 0xffaa33, 4));
        l.position.set(k % 2 ? x0 + 0.6 : x1 - 0.6, y + 1.4, z0 + 4 + k * 7);
        g.add(l);
      }
    } });
  }
  // Penthouse: a glass house on top of a framing tower over the hub.
  if (frame) {
    house('penthouse', frame.x, frame.H, frame.z, { w: 44, d: 44, roomW: 22, roomD: 14, pool: true, frameMat: MAT.neonCyan });
  }
  // Villa: a platform with anti-grav rings under it, far above the city.
  {
    const cx = -420, y = 1400, cz = 300;
    house('villa', cx, y, cz, { w: 44, d: 44, roomW: 22, roomD: 14, pool: true, frameMat: MAT.neonMagenta, extra: (x0, x1, z0, z1) => {
      for (const [k, r] of [[0, 18], [1, 12], [2, 6]].values()) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.5, 8, 48), glowMat(0x7a5cff, 3 - k * 0.6));
        ring.rotation.x = Math.PI / 2;
        ring.position.set(cx, y - 3 - k * 4, cz);
        g.add(ring);
      }
      box(g, cx - 8, y - 12, cz - 8, cx + 8, y - 2, cz + 8, MAT.darkMetal, { solid: false });
      for (const [px, pz] of [[x0 + 4, z1 - 4], [x1 - 4, z1 - 4]]) planter(g, px, y, pz, 1.6);
    } });
  }
  // Crown: a house on top of a monolith, the highest point in the city.
  if (monolith) {
    house('crown', monolith.x, monolith.top, monolith.z, { w: 46, d: 46, roomW: 24, roomD: 15, pool: true, frameMat: MAT.neonAmber, extra: (x0, x1, z0, z1, y) => {
      const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 30, 8), glowMat(0xffc266, 3));
      beacon.position.set(x1 - 3, y + 15, z0 + 3);
      g.add(beacon);
    } });
  }

  batchStatic(g);
  scene.add(g);
  refreshHomes();
  return { group: g, homes: built };
}

// Show what you own: sale signs come down, art and plants go up.
export function refreshHomes() {
  const art = collection().filter((id) => ART[id]?.kind === 'art');
  const plants = collection().filter((id) => ART[id]?.kind === 'plant');
  for (const [id, b] of Object.entries(built)) {
    b.sale.visible = !ownsHome(id);
    b.artSlots.forEach((m, k) => {
      const a = ART[art[k]];
      m.visible = !!a && ownsHome(id);
      if (a) m.material = glowMat(a.color, 1.2);
    });
    b.plantSlots.forEach((m, k) => {
      const a = ART[plants[k]];
      m.visible = !!a && ownsHome(id);
      if (a) m.material = glowMat(a.color, 1.1);
    });
  }
}

export function homePos(id) {
  return built[id];
}

export function buyHome(id) {
  const def = HOMES[id];
  if (!def) return 'No such home.';
  if (ownsHome(id)) return 'It is already yours.';
  if (state.credits < def.price) return `You need ${(def.price - state.credits).toLocaleString()} more credits.`;
  addCredits(-def.price, `Bought ${def.name}`);
  owned().push(id);
  state.noRent = true;
  refreshHomes();
  return null;
}

// The realtor: every home, its perk, and a button to buy or fly there.
// ctx: { toast, sfx, waypoint(id) }
export function openRealty(ctx) {
  openPanel('Skyline Realty', (body) => {
    const render = () => {
      body.replaceChildren(h('p.muted', {}, 'Homes for sale across the city. Buying your first ends your Skyhaven lease, so no more rent. You can sleep, save and change clothes in any home you own.'));
      for (const [id, d] of Object.entries(HOMES)) {
        const mine = ownsHome(id);
        body.append(h('div.menu-item', {},
          h('div', {}, h('b', {}, d.name), mine ? h('span.tag', {}, 'yours') : '', h('div.muted', {}, `${d.where}. ${d.perk}`)),
          h('div.row', {},
            h('button.btn.ghost', { onclick: () => { ctx.waypoint(id); closePanel(); } }, 'Show me'),
            mine ? '' : h('button.btn.primary', {
              onclick: () => {
                const err = buyHome(id);
                if (err) { ctx.toast(err, 'bad'); ctx.sfx('lose'); return; }
                ctx.sfx('win');
                ctx.toast(`${d.name} is yours. Your Skyhaven lease is over: no more rent.`, 'win', 7000);
                render();
              },
            }, `${d.price.toLocaleString()} cr`))));
      }
    };
    render();
  }, { kicker: 'Galleria Market', wide: true });
}

// The gallery's curator (and the farm's plant stall).
export function openArt(ctx, kind = 'art') {
  openPanel(kind === 'plant' ? 'Houseplants' : 'The curator', (body) => {
    const render = () => {
      body.replaceChildren(h('p.muted', {}, kind === 'plant'
        ? 'Glowing plants for your home. They go on display in every home you own.'
        : 'Original work for your walls. Pieces hang in every home you own, four at a time.'));
      for (const [id, a] of Object.entries(ART)) {
        if (a.kind !== kind) continue;
        const have = collection().includes(id);
        body.append(h('div.menu-item', {},
          h('div', {}, h('span.swatch', { style: `background:#${a.color.toString(16).padStart(6, '0')}` }), ' ', h('b', {}, a.name), have ? h('span.tag', {}, 'yours') : ''),
          have ? h('span.muted', {}, owned().length ? 'On your wall' : 'In storage until you own a home') : h('button.btn.primary', {
            onclick: () => {
              if (state.credits < a.price) { ctx.toast('Not enough credits.', 'bad'); ctx.sfx('lose'); return; }
              addCredits(-a.price, `Bought ${a.name}`);
              collection().push(id);
              refreshHomes();
              ctx.sfx('coin');
              render();
            },
          }, `${a.price.toLocaleString()} cr`)));
      }
    };
    render();
  }, { kicker: kind === 'plant' ? 'Sky farm' : 'Art gallery' });
}
