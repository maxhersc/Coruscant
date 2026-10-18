import * as THREE from 'three';
import { LEVELS } from '../config.js';
import { world } from '../core/collision.js';
import { makeRng } from '../core/rng.js';
import { MAT, box, slab, railRect, rail, sign, lamp, planter, bench, room, stall, landingPad } from './props.js';
import { Elevator, SHAFT } from './elevator.js';
import { addInteract, addZone, npcZones, pads, decks } from '../systems/interact.js';
import { patchFog } from './env.js';
import { batchStatic } from './batch.js';

// The hub: four public levels wrapped around the Spire, joined by the glass
// lift, plus every rooftop deck out in the city.

export function isHubCell(i, j) {
  return Math.abs(i) <= 1 && Math.abs(j) <= 1;
}

// A level slab around the Spire (80 x 80) leaving the lift shaft open.
function levelSlab(g, L, half, mat) {
  slab(g, -half, 40, half, half, L, mat);                 // north
  slab(g, 40, -40, half, 40, L, mat);                     // east
  slab(g, -half, -40, -40, 40, L, mat);                   // west
  slab(g, -half, -half, SHAFT.x0, -40, L, mat);           // south-west
  slab(g, SHAFT.x1, -half, half, -40, L, mat);            // south-east
  slab(g, SHAFT.x0, -half, SHAFT.x1, SHAFT.z0, L, mat);   // in front of the lift
}

function padWithBridge(g, L, side, half, name, size = 28, bridge = 18) {
  const w = 14;
  const h = size / 2;
  let cx = 0, cz = 0;
  if (side === 'e') { cx = half + bridge + h; slab(g, half, -w / 2, half + bridge, w / 2, L); rail(g, half, -w / 2, half + bridge, -w / 2, L); rail(g, half, w / 2, half + bridge, w / 2, L); }
  if (side === 'w') { cx = -(half + bridge + h); slab(g, -half - bridge, -w / 2, -half, w / 2, L); rail(g, -half - bridge, -w / 2, -half, -w / 2, L); rail(g, -half - bridge, w / 2, -half, w / 2, L); }
  if (side === 'n') { cz = half + bridge + h; slab(g, -w / 2, half, w / 2, half + bridge, L); rail(g, -w / 2, half, -w / 2, half + bridge, L); rail(g, w / 2, half, w / 2, half + bridge, L); }
  if (side === 's') { cz = -(half + bridge + h); slab(g, -w / 2, -half - bridge, w / 2, -half, L); rail(g, -w / 2, -half - bridge, -w / 2, -half, L); rail(g, w / 2, -half - bridge, w / 2, -half, L); }
  landingPad(g, cx, cz, L, size, name.toUpperCase());
  pads.push({ name, x: cx, y: L, z: cz, size });
  lamp(g, cx + (side === 'n' || side === 's' ? 9 : 0), L, cz + (side === 'e' || side === 'w' ? 9 : 0));
  return { x: cx, z: cz };
}

function tables(g, L, spots) {
  for (const [x, z] of spots) {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.08, 16), MAT.metal);
    top.position.set(x, L + 1.0, z);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.3, 1.0, 8), MAT.darkMetal);
    leg.position.set(x, L + 0.5, z);
    g.add(top, leg);
    world.addBox(x - 0.8, L, z - 0.8, x + 0.8, L + 1.05, z + 0.8, 'table').noWalk = true;
    for (let s = 0; s < 3; s++) {
      const a = s * 2.1;
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.25, 0.6, 8), MAT.cloth);
      st.position.set(x + Math.cos(a) * 1.5, L + 0.3, z + Math.sin(a) * 1.5);
      g.add(st);
    }
  }
}

// Strings of hanging lights across a space: instanced bulbs on sagging cables.
function lightStrings(g, L, lines) {
  const bulbs = [];
  for (const [ax, az, bx, bz, h] of lines) {
    const n = Math.floor(Math.hypot(bx - ax, bz - az) / 2.2);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      bulbs.push([ax + (bx - ax) * t, L + h - Math.sin(t * Math.PI) * 1.4, az + (bz - az) * t]);
    }
  }
  const colors = [0xffcc66, 0xff6699, 0x66ddff, 0x99ff99];
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 6, 4), patchFog(new THREE.MeshBasicMaterial({ color: 0xffffff })), bulbs.length);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  bulbs.forEach((p, i) => {
    m.makeTranslation(p[0], p[1], p[2]);
    mesh.setMatrixAt(i, m);
    c.set(colors[i % colors.length]).multiplyScalar(4);
    mesh.setColorAt(i, c);
  });
  g.add(mesh);
}

function promenade(g) {
  const L = LEVELS.promenade, H = 100;
  levelSlab(g, L, H, MAT.floor);
  railRect(g, -H, -H, H, H, L, [
    { side: 'e', at: 0, width: 14 }, { side: 'w', at: 0, width: 14 },
    { side: 'n', at: 0, width: 14 }, { side: 's', at: 0, width: 14 },
  ]);
  padWithBridge(g, L, 'e', H, 'East Pad');
  padWithBridge(g, L, 'w', H, 'West Pad');
  padWithBridge(g, L, 'n', H, 'North Pad');
  padWithBridge(g, L, 's', H, 'South Pad');
  addZone('Spire Promenade', 'Level 300 · Upper City', -160, L - 3, -160, 160, L + 40, 160, 1);

  // Lucky Comet Casino (north-east).
  room(g, 48, 48, 96, 96, L, 10, MAT.wallDark, [{ side: 'w', at: 72, width: 8 }, { side: 's', at: 72, width: 8 }], { ceilMat: MAT.neonMagenta, frameMat: MAT.neonMagenta });
  box(g, 48.3, L, 48.3, 95.7, L + 0.05, 95.7, MAT.floorWarm, { tile: 3 });
  sign(g, 'LUCKY COMET\nCASINO', 72, L + 7, 47.6, 22, 5, Math.PI, { fg: '#ff7ac0', glyphs: false });
  sign(g, 'LUCKY COMET', 47.6, L + 7, 72, 20, 3.4, -Math.PI / 2, { fg: '#ff7ac0', glyphs: true });
  sign(g, 'SKYRACE · ROULETTE · TWENTY-ONE · SLOTS', 72, L + 13.5, 48, 40, 4, Math.PI, { fg: '#ffd166', intensity: 2.6 });
  const roof = sign(g, '★ LUCKY COMET ★', 72, L + 20, 72, 44, 9, Math.PI / 4, { fg: '#ff7ac0', intensity: 3, twoSided: true });
  roof.userData.spin = 0.25;
  const casinoLight = new THREE.PointLight(0xff88cc, 400, 45, 2);
  casinoLight.position.set(72, L + 8, 72);
  g.add(casinoLight);
  addZone('Lucky Comet Casino', 'Fortune favours the bold', 48, L - 1, 48, 96, L + 10, 96, 5);
  npcZones.push({ x0: 50, x1: 94, z0: 50, z1: 94, y: L, count: 16 });

  // Roulette.
  box(g, 58, L, 82, 66, L + 0.95, 87, MAT.wood, { noWalk: true });
  box(g, 58.3, L + 0.95, 82.3, 65.7, L + 1.0, 86.7, MAT.felt, { solid: false });
  const wheel = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.9, 0.3, 37), MAT.wood);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.06, 37), MAT.neonAmber);
  disc.position.y = 0.16;
  const hub = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 8), MAT.metal);
  hub.position.y = 0.35;
  for (let s = 0; s < 37; s++) {
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.3), s === 0 ? MAT.neonGreen : s % 2 ? MAT.cloth : MAT.darkMetal);
    const a = (s / 37) * Math.PI * 2;
    pocket.position.set(Math.cos(a) * 0.78, 0.2, Math.sin(a) * 0.78);
    pocket.rotation.y = -a;
    wheel.add(pocket);
  }
  wheel.add(bowl, disc, hub);
  wheel.position.set(59.5, L + 1.15, 84.5);
  wheel.userData.isWheel = true;
  g.add(wheel);
  addInteract({ pos: new THREE.Vector3(62, L, 80.5), radius: 3.2, label: 'Play roulette', action: 'roulette' });

  // Twenty-one with a dealer droid.
  box(g, 78, L, 82, 86, L + 0.95, 86, MAT.wood, { noWalk: true });
  box(g, 78.3, L + 0.95, 82.3, 85.7, L + 1.0, 85.7, MAT.felt, { solid: false });
  addInteract({ pos: new THREE.Vector3(82, L, 80.5), radius: 3.2, label: 'Play twenty-one', action: 'blackjack' });

  // Slot machines along the west wall.
  for (let i = 0; i < 6; i++) {
    const z = 54 + i * 3;
    box(g, 49, L, z - 0.8, 50.4, L + 2.2, z + 0.8, MAT.metal, { noWalk: true });
    const sc = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 1.1), i % 2 ? MAT.neonMagenta : MAT.neonCyan);
    sc.position.set(50.45, L + 1.5, z);
    g.add(sc);
  }
  addInteract({ pos: new THREE.Vector3(51.8, L, 61.5), radius: 4, label: 'Play the slots', action: 'slots' });

  // Skyrace betting booth and the big board.
  box(g, 92, L, 54, 95.5, L + 1.2, 66, MAT.metal, { noWalk: true });
  const board = sign(g, 'SKYRACE', 95.4, L + 5.2, 60, 11, 5.5, -Math.PI / 2, { fg: '#7feaff' });
  board.userData.isRaceBoard = true;
  addInteract({ pos: new THREE.Vector3(90, L, 60), radius: 3, label: 'Skyrace betting', action: 'races' });

  // Food court (north-west).
  const foods = [
    ['ORBITAL NOODLES', MAT.neonAmber, 'noodles'],
    ['SPICE & STEAM', MAT.neonMagenta, 'dumplings'],
    ['CAF STATION', MAT.neonCyan, 'caf'],
  ];
  foods.forEach(([name, neon, item], i) => {
    const x = -88 + i * 15;
    const servePos = stall(g, x, L, 93, Math.PI, name, neon, 10);
    addInteract({ pos: servePos, radius: 2.6, label: `Buy at ${name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}`, action: 'food', data: { item } });
  });
  tables(g, L, [[-86, 72], [-72, 76], [-60, 66], [-88, 58], [-74, 58]]);
  lightStrings(g, L, [[-98, 52, -50, 98, 6], [-98, 98, -50, 52, 6], [-98, 75, -50, 75, 6.5]]);
  addZone('Skyline Food Court', 'Spire Promenade', -100, L - 1, 48, -48, L + 12, 100, 3);

  // Courier Guild (south-west).
  room(g, -96, -96, -56, -70, L, 7, MAT.wall, [{ side: 'n', at: -76, width: 6 }]);
  sign(g, 'COURIER GUILD', -76, L + 5.4, -69.6, 18, 2.4, 0, { fg: '#8dffad', glyphs: true, intensity: 2.6 });
  box(g, -84, L, -90, -68, L + 1.1, -88, MAT.metal, { noWalk: true });
  const term = box(g, -79.5, L, -66.5, -77.5, L + 1.6, -65.5, MAT.metal, { noWalk: true });
  const termScr = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 0.05), MAT.neonGreen);
  termScr.position.set(-78.5, L + 1.9, -65.6);
  g.add(termScr);
  void term;
  addInteract({ pos: new THREE.Vector3(-78.5, L, -63.5), radius: 2.8, label: 'Courier job board', action: 'jobs' });
  addInteract({ pos: new THREE.Vector3(-76, L, -86), radius: 3, label: 'Talk to the dispatcher', action: 'talk', data: { who: 'dispatcher' } });
  addZone('Courier Guild', 'Deliveries across the city', -96, L - 1, -96, -56, L + 7, -70, 4);

  // Speeder dealer (south-east).
  box(g, 56, L, -96, 96, L + 0.4, -66, MAT.floorDark, { tile: 4 });
  sign(g, 'JUMP STATION SPEEDERS', 76, L + 7, -64.5, 26, 3, 0, { fg: '#7feaff', glyphs: true });
  for (const [x, z] of [[64, -82], [76, -86], [88, -82]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.12, 8, 40), MAT.neonCyan);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, L + 0.5, z);
    g.add(ring);
  }
  addInteract({ pos: new THREE.Vector3(76, L, -70), radius: 3.5, label: 'Browse speeders', action: 'dealer' });
  addZone('Jump Station Speeders', 'New and pre-owned craft', 56, L - 1, -96, 96, L + 10, -60, 3);

  // Around the Spire: lamps, planters, benches, the founders' monument.
  for (const z of [-30, -15, 0, 15, 30]) { lamp(g, 46, L, z); lamp(g, -46, L, z); }
  for (const x of [-30, -15, 15, 30]) lamp(g, x, L, 46);
  for (const [x, z] of [[60, 20], [60, -20], [-60, 20], [-60, -20], [25, 62], [-25, 62], [25, -62], [-25, -62]]) planter(g, x, L, z);
  bench(g, 52, L, 8, Math.PI / 2); bench(g, 52, L, -8, Math.PI / 2);
  bench(g, -52, L, 8, -Math.PI / 2); bench(g, -52, L, -8, -Math.PI / 2);
  bench(g, 12, L, 52, 0); bench(g, -12, L, 52, 0);
  box(g, -3, L, 62, 3, L + 1.2, 68, MAT.metal);
  const holo = new THREE.Group();
  const holoMat = patchFog(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 0.8, 1.6), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.9, 3.2, 6, 12), holoMat);
  body.position.y = 2.4;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), holoMat);
  head.position.y = 5;
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 2.2, 4, 8), holoMat);
  arm.position.set(1.2, 4.2, 0);
  arm.rotation.z = -2.4;
  holo.add(body, head, arm);
  holo.position.set(0, L + 1.2, 65);
  holo.userData.spin = 0.3;
  g.add(holo);
  addInteract({ pos: new THREE.Vector3(0, L, 60), radius: 3, label: 'Read the plaque', action: 'plaque' });
  // The Spire's entrance on the north face.
  const door = new THREE.Mesh(new THREE.BoxGeometry(14, 8, 0.2), MAT.screen);
  door.position.set(0, L + 4, 40.15);
  g.add(door);
  sign(g, 'THE SPIRE', 0, L + 10, 40.3, 18, 2.6, 0, { fg: '#fff2dd', glyphs: true });

  // Elevator landing.
  sign(g, 'LIFT ▲▼', 0, L + 5, -55.4, 8, 1.4, Math.PI, { fg: '#ffc266' });
  addInteract({ pos: new THREE.Vector3(10, L, -58), radius: 3, label: 'Call the lift', action: 'lift-call', data: { level: 1 } });

  npcZones.push({ x0: -98, x1: 98, z0: -98, z1: 98, y: L, count: 200 });
  npcZones.push({ x0: -98, x1: -50, z0: 50, z1: 88, y: L, count: 30 });
  npcZones.push({ x0: 40, x1: 98, z0: -40, z1: 40, y: L, count: 30 });
}

function market(g) {
  const L = LEVELS.market, H = 85;
  levelSlab(g, L, H, MAT.floorDark);
  railRect(g, -H, -H, H, H, L, [{ side: 'w', at: 0, width: 14 }, { side: 'e', at: 0, width: 14 }]);
  padWithBridge(g, L, 'w', H, 'Market West Pad', 26, 14);
  padWithBridge(g, L, 'e', H, 'Market East Pad', 26, 14);
  addZone('Galleria Market', 'Level 160 · Mid City', -130, L - 3, -130, 130, L + 30, 130, 1);

  // The Low Orbit cantina.
  room(g, -30, 50, 30, 82, L, 8, MAT.wallDark, [{ side: 's', at: 0, width: 8 }], { ceilMat: MAT.neonAmber, frameMat: MAT.neonAmber });
  box(g, -29.7, L, 50.3, 29.7, L + 0.05, 81.7, MAT.floorWarm, { tile: 2 });
  sign(g, 'THE LOW ORBIT', 0, L + 6, 49.6, 20, 3, Math.PI, { fg: '#ffc266', glyphs: true, intensity: 2.8 });
  box(g, -20, L, 73, 20, L + 1.15, 75, MAT.wood, { noWalk: true });
  for (let x = -18; x <= 18; x += 4) {
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 6), x % 8 ? MAT.neonAmber : MAT.neonGreen);
    bottle.position.set(x, L + 2.2, 81.3);
    g.add(bottle);
  }
  box(g, -20, L + 1.8, 81, 20, L + 1.9, 81.6, MAT.metal, { solid: false });
  addInteract({ pos: new THREE.Vector3(0, L, 71), radius: 3.5, label: 'Order at the bar', action: 'food', data: { item: 'ale' } });
  box(g, -22, L, 57, -14, L + 0.95, 63, MAT.felt, { noWalk: true });
  addInteract({ pos: new THREE.Vector3(-18, L, 55.5), radius: 3, label: 'Play Chance Cubes', action: 'dice' });
  box(g, 14, L, 58, 28, L + 0.6, 66, MAT.darkMetal);
  const stage = new THREE.Mesh(new THREE.BoxGeometry(14, 0.1, 8), MAT.neonMagenta);
  stage.position.set(21, L + 0.62, 62);
  g.add(stage);
  tables(g, L, [[-6, 60], [4, 64], [-8, 68]]);
  const cantinaLight = new THREE.PointLight(0xffaa55, 300, 40, 2);
  cantinaLight.position.set(0, L + 6, 66);
  g.add(cantinaLight);
  addZone('The Low Orbit', 'Cantina', -30, L - 1, 50, 30, L + 8, 82, 5);
  npcZones.push({ x0: -28, x1: 28, z0: 52, z1: 72, y: L, count: 14 });

  // Stalls in the east and west wings.
  const east = [['DROID PARTS', MAT.neonCyan], ['SPICE MERCHANT', MAT.neonAmber], ['HOLO REPAIR', MAT.neonMagenta], ['SKY FRUIT', MAT.neonGreen], ['DATA CHIPS', MAT.neonCyan]];
  east.forEach(([name, neon], i) => {
    const pos = stall(g, 76, L, -32 + i * 16, -Math.PI / 2, name, neon, 9);
    if (name === 'SKY FRUIT') addInteract({ pos, radius: 2.6, label: 'Buy sky fruit', action: 'food', data: { item: 'fruit' } });
  });
  const west = [['TAILOR', MAT.neonMagenta], ['GRILL HOUSE', MAT.neonAmber], ['PAWN SHOP', MAT.neonCyan], ['ODDS & ENDS', MAT.neonGreen]];
  west.forEach(([name, neon], i) => {
    const z = [-32, -16, 20, 36][i];
    const pos = stall(g, -76, L, z, Math.PI / 2, name, neon, 9);
    if (name === 'GRILL HOUSE') addInteract({ pos, radius: 2.6, label: 'Buy at Grill House', action: 'food', data: { item: 'skewers' } });
  });
  // Vool's Credit, a lender with poor manners.
  const lenderPos = stall(g, -44, L, -76, 0, "VOOL'S CREDIT", MAT.neonMagenta, 10);
  addInteract({ pos: lenderPos, radius: 2.8, label: "Vool's Credit (loans)", action: 'loan' });
  lightStrings(g, L, [[-85, -60, 85, -60, 7], [-85, -20, 85, -20, 7.5], [-85, 20, 85, 20, 7], [44, -85, 44, 85, 8], [-44, -85, -44, 85, 8]]);
  for (const [x, z] of [[60, 0], [-60, 0], [0, -70]]) {
    const glow = new THREE.PointLight(0xffb070, 900, 90, 2);
    glow.position.set(x, L + 9, z);
    g.add(glow);
  }
  for (const [x, z] of [[-60, 0], [60, -45], [-60, -50], [50, 50]]) lamp(g, x, L, z);
  sign(g, 'LIFT ▲▼', 0, L + 5, -55.4, 8, 1.4, Math.PI, { fg: '#ffc266' });
  addInteract({ pos: new THREE.Vector3(10, L, -58), radius: 3, label: 'Call the lift', action: 'lift-call', data: { level: 0 } });
  npcZones.push({ x0: -84, x1: 84, z0: -84, z1: 48, y: L, count: 190 });
}

function residences(g) {
  const L = LEVELS.residences, H = 70;
  levelSlab(g, L, H, MAT.floor);
  railRect(g, -H, -H, H, H, L, [{ side: 'e', at: 0, width: 14 }]);
  padWithBridge(g, L, 'e', H, 'Residence Pad', 26, 14);
  addZone('Skyhaven Residences', 'Level 440 · Your home', -110, L - 3, -110, 110, L + 30, 110, 1);

  // Three apartments; the middle one is yours.
  room(g, -40, 44, 40, 68, L, 7, MAT.wall, [{ side: 's', at: 0, width: 3 }, { side: 'n', at: 0, width: 10 }], { ceilMat: MAT.neonWhite });
  rail(g, -5, 68, 5, 68, L, 3.6); // the window
  box(g, -14.25, L, 44, -13.75, L + 7, 68, MAT.wall, { noWalk: true });
  box(g, 13.75, L, 44, 14.25, L + 7, 68, MAT.wall, { noWalk: true });
  box(g, -13.7, L, 44.3, 13.7, L + 0.05, 67.7, MAT.floorWarm, { tile: 2 });
  for (const x of [-27, 27]) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(3, 3.4, 0.1), MAT.darkMetal);
    d.position.set(x, L + 1.7, 43.7);
    g.add(d);
  }
  sign(g, 'SKYHAVEN RESIDENCES', 0, L + 9, 43.6, 22, 2.4, Math.PI, { fg: '#fff2dd', glyphs: true });
  sign(g, 'UNIT 4407', 0, L + 4.2, 43.6, 3.2, 0.6, Math.PI, { fg: '#7feaff' });
  // Bed, wardrobe, terminal.
  box(g, 6, L, 60, 10, L + 0.6, 66.5, MAT.cloth, { noWalk: true });
  box(g, 6.2, L + 0.6, 65.2, 9.8, L + 0.85, 66.3, MAT.neonWhite, { solid: false });
  box(g, -12, L, 60, -9, L + 3, 67, MAT.wood, { noWalk: true });
  box(g, -6, L, 66.5, -2, L + 1.1, 67.5, MAT.metal, { noWalk: true });
  const scr = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 0.05), MAT.screen);
  scr.position.set(-4, L + 1.9, 67.4);
  g.add(scr);
  const aptLight = new THREE.PointLight(0xffd9a0, 120, 20, 2);
  aptLight.position.set(0, L + 5, 56);
  g.add(aptLight);
  addInteract({ pos: new THREE.Vector3(8, L, 58), radius: 2.6, label: 'Sleep', action: 'sleep' });
  addInteract({ pos: new THREE.Vector3(-4, L, 64.5), radius: 2.4, label: 'Personal terminal', action: 'terminal' });
  addZone('Your apartment', 'Unit 4407', -14, L - 1, 44, 14, L + 7, 68, 6);

  // Gardens.
  for (let x = -55; x <= 55; x += 22) for (const z of [-22, 22]) planter(g, x, L, z, 2.2);
  for (const x of [-44, -22, 22, 44]) bench(g, x, L, 0, 0);
  const pond = new THREE.Mesh(new THREE.PlaneGeometry(18, 10), patchFog(new THREE.MeshStandardMaterial({ color: 0x1a6a8a, roughness: 0.05, metalness: 0.6, emissive: 0x0a3a55 })));
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(-48, L + 0.06, -50);
  g.add(pond);
  for (const z of [-30, 30]) { lamp(g, 50, L, z); lamp(g, -50, L, z); }
  sign(g, 'LIFT ▲▼', 0, L + 5, -55.4, 8, 1.4, Math.PI, { fg: '#ffc266' });
  addInteract({ pos: new THREE.Vector3(10, L, -58), radius: 3, label: 'Call the lift', action: 'lift-call', data: { level: 2 } });
  npcZones.push({ x0: -68, x1: 68, z0: -68, z1: 40, y: L, count: 34 });
}

function skydeck(g) {
  const L = LEVELS.skydeck;
  slab(g, -26, -86, 26, SHAFT.z0, L, MAT.floor);
  railRect(g, -26, -86, 26, SHAFT.z0, L, [{ side: 'n', at: 0, width: 16 }]);
  addZone('Skydeck', 'Level 600 · The best view in the city', -26, L - 2, -86, 26, L + 20, -40, 2);
  for (const x of [-16, 0, 16]) {
    box(g, x - 0.3, L, -83.3, x + 0.3, L + 1.2, -82.7, MAT.metal, { noWalk: true });
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 1.2, 10), MAT.darkMetal);
    scope.rotation.x = Math.PI / 2 - 0.2;
    scope.position.set(x, L + 1.45, -83.2);
    g.add(scope);
    addInteract({ pos: new THREE.Vector3(x, L, -81), radius: 2, label: 'Use the viewer', action: 'viewer' });
  }
  bench(g, -12, L, -70, Math.PI); bench(g, 12, L, -70, Math.PI);
  sign(g, 'SKYDECK 600', 0, L + 0.06, -66, 12, 2, 0, { fg: '#7feaff', blur: 6 }).rotation.x = -Math.PI / 2;
  sign(g, 'LIFT ▲▼', 0, L + 5, -55.4, 8, 1.4, Math.PI, { fg: '#ffc266' });
  addInteract({ pos: new THREE.Vector3(10, L, -58), radius: 3, label: 'Call the lift', action: 'lift-call', data: { level: 3 } });
  npcZones.push({ x0: -24, x1: 24, z0: -84, z1: -58, y: L, count: 8 });
}

// Rooftop decks across the city: a pad, a kiosk, rails and a few locals.
function buildDecks(g, cityDecks) {
  const rng = makeRng(555);
  const neons = [MAT.neonCyan, MAT.neonAmber, MAT.neonMagenta, MAT.neonGreen];
  for (const d of cityDecks) {
    const L = d.y;
    const x0 = d.x - d.w / 2, x1 = d.x + d.w / 2, z0 = d.z - d.d / 2, z1 = d.z + d.d / 2;
    railRect(g, x0 + 0.3, z0 + 0.3, x1 - 0.3, z1 - 0.3, L);
    // Pad in one corner (speeders land over the rail from above).
    const ps = 20;
    const pcx = x1 - ps / 2 - 3, pcz = z1 - ps / 2 - 3;
    landingPad(g, pcx, pcz, L + 0.4, ps, null);
    pads.push({ name: d.name, x: pcx, y: L + 0.4, z: pcz, size: ps });
    // Kiosk with the drop-off terminal.
    const kx = x0 + 9, kz = z0 + 8;
    const neon = rng.pick(neons);
    room(g, kx - 6, kz - 5, kx + 6, kz + 5, L, 4.5, MAT.wallDark, [{ side: 'n', at: kx, width: 3 }], { ceilMat: neon, frameMat: neon });
    sign(g, d.name.toUpperCase(), kx, L + 5.6, kz + 5.3, 12, 1.5, 0, { fg: neon.userData.css, glyphs: true, intensity: 2.6 });
    box(g, kx + 3, L, kz + 5.4, kx + 4.2, L + 1.5, kz + 6.2, MAT.metal, { noWalk: true });
    const sc = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.05), MAT.neonGreen);
    sc.position.set(kx + 3.6, L + 1.8, kz + 6.25);
    g.add(sc);
    const dropPos = new THREE.Vector3(kx + 3.6, L, kz + 7.6);
    addInteract({ pos: dropPos, radius: 2.6, label: 'Courier terminal', action: 'deck-terminal', data: { deck: d.name } });
    addInteract({ pos: new THREE.Vector3(kx - 3, L, kz + 7), radius: 2.2, label: 'Vending machine', action: 'food', data: { item: 'snack' } });
    box(g, kx - 4, L, kz + 5.4, kx - 2, L + 2.2, kz + 6.4, MAT.metal, { noWalk: true });
    const vm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 0.05), neon);
    vm.position.set(kx - 3, L + 1.4, kz + 6.45);
    g.add(vm);
    lamp(g, x0 + 4, L, z1 - 2.5);
    lamp(g, d.x, L, z0 + 2.5);
    lamp(g, x1 - 4, L, z0 + 2.5);
    planter(g, x0 + 4, L, z1 - 6, 1.4);
    bench(g, x0 + 12, L, z0 + d.d * 0.55, 0);
    addZone(d.name, 'Rooftop deck', x0, L - 1, z0, x1, L + 20, z1, 2);
    npcZones.push({ x0: x0 + 2, x1: x1 - 2, z0: z0 + 2, z1: z1 - 2, y: L, count: rng.int(5, 9) });
    decks.push({ ...d, dropPos });
  }
}

export function buildDistrict(segs, cityDecks, beacons) {
  const g = new THREE.Group();

  // The Spire.
  const spireStyle = [0.77, 0.62, 0.38, 2];
  const addT = (x, y0, z, sx, sy, sz, st, collide = true) => {
    segs.push({ kind: 'box', x, y: y0 + sy / 2, z, sx, sy, sz, style: st });
    if (collide) world.addBox(x - sx / 2, y0, z - sz / 2, x + sx / 2, y0 + sy, z + sz / 2, 'tower');
  };
  addT(0, 0, 0, 80, 620, 80, spireStyle);
  addT(0, 617.5, 0, 84, 2.5, 84, [0.77, 0, 0.6, 4], false);
  addT(0, 620, 0, 58, 220, 58, spireStyle);
  addT(0, 837.5, 0, 61, 2.5, 61, [0.77, 0, 0.6, 4], false);
  addT(0, 840, 0, 36, 90, 36, spireStyle);
  segs.push({ kind: 'cone', x: 0, y: 930 + 130, z: 0, sx: 26, sy: 260, sz: 26, style: [0.77, 0, 0.6, 4] });
  beacons.push([0, 1190, 0], [18, 930, 18], [-18, 930, -18], [18, 930, -18], [-18, 930, 18]);

  // Four towers framing the hub.
  const rng = makeRng(31);
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const st = [rng.next(), 0.55, rng.next(), rng.int(1, 3)];
    const x = sx * 145, z = sz * 145;
    const H = rng.range(640, 980);
    addT(x, 0, z, 42, H * 0.6, 42, st);
    addT(x, H * 0.6 - 2.5, z, 44, 2.5, 44, [st[0], 0, 0.6, 4], false);
    addT(x, H * 0.6, z, 32, H * 0.4, 32, st);
    beacons.push([x, H, z]);
  }

  promenade(g);
  market(g);
  residences(g);
  skydeck(g);
  buildDecks(g, cityDecks);

  const elevator = new Elevator(g, [
    { name: 'Galleria Market', y: LEVELS.market },
    { name: 'Spire Promenade', y: LEVELS.promenade },
    { name: 'Skyhaven Residences', y: LEVELS.residences },
    { name: 'Skydeck', y: LEVELS.skydeck },
  ]);
  addInteract({
    getPos: (v) => v.set(5.5, elevator.y, -48),
    radius: 7,
    label: 'Choose a floor',
    action: 'lift-choose',
    enabled: () => elevator.docked(),
  });
  addZone('Spire Lift', 'Glass elevator', -7, 0, -54.5, 7, 1000, -40, 8);

  // Fold thousands of static props into a few dozen draw calls.
  batchStatic(g);

  // Spinning things.
  const spinners = [];
  g.traverse((o) => { if (o.userData.spin) spinners.push(o); });
  let raceBoard = null;
  g.traverse((o) => { if (o.userData.isRaceBoard) raceBoard = o; });
  let rouletteWheel = null;
  g.traverse((o) => { if (o.userData.isWheel) rouletteWheel = o; });

  return { group: g, elevator, spinners, raceBoard, rouletteWheel };
}
