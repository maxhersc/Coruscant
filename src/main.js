import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { LEVELS, ABYSS_Y } from './config.js';
import { world } from './core/collision.js';
import { input, initInput, requestLock, pressed, key, endFrame } from './core/input.js';
import { ENV, updateEnvironment } from './world/env.js';
import { createSky } from './world/sky.js';
import { generateCity, buildCityMeshes } from './world/city.js';
import { buildLandmarks, isLandmarkCell, LANDMARKS } from './world/landmarks.js';
import { buildDistrict, isHubCell } from './world/district.js';
import { initMaterials, MAT } from './world/props.js';
import { createTraffic, nearestCraft } from './world/traffic.js';
import { createBeacons } from './world/beacons.js';
import { createAds } from './world/ads.js';
import { createFlyers } from './world/flyers.js';
import { createAtmosphere } from './world/atmosphere.js';
import { createCrowd } from './npc/crowd.js';
import { Walker } from './player/walker.js';
import { Speeder, SPEEDER_MODELS, PAINTS } from './player/speeder.js';
import { playerLook, wearing, openBoutique } from './systems/wardrobe.js';
import { CameraRig } from './player/cameraRig.js';
import { state, tick, hooks, addCredits, bodySpeedMul, totalMinutes } from './systems/state.js';
import { interactables, nearestInteract, npcZones, zoneAt, pads } from './systems/interact.js';
import { minutesLeft, GUILD, passengerOf } from './systems/jobs.js';
import * as jobs from './systems/jobs.js';
import { police, updatePolice, openStop, heatStatus, carrying, initPolice, crime, clearHeat } from './systems/police.js';
import { saveGame, loadGame } from './systems/save.js';
import * as acts from './systems/activities.js';
import { settings, loadSettings, saveSettings, QUALITY } from './systems/settings.js';
import { openRoulette, openBlackjack, openSlots, openDice } from './casino/games.js';
import { createSkyrace } from './casino/races.js';
import { createGateRun } from './casino/gaterun.js';
import { buildUndercity } from './world/undercity.js';
import { createPeople } from './story/people.js';
import * as story from './story/story.js';
import * as trade from './systems/trade.js';
import { openPanel, closePanel, isPanelOpen, onPanel, h } from './ui/panel.js';
import { updateHUD, toast, showLocation, setPrompt, speech } from './ui/hud.js';
import { initMap, drawMap, setupMap } from './ui/map.js';
import { nav, buildPlaces, guidance, arrived, setTarget, clearTarget } from './systems/nav.js';
import { initAudio, updateAudio, sfx } from './audio/audio.js';
import { buildInteriors, SHOPS, ROOMS, roomAt } from './world/interiors.js';
import { buildHomes, HOMES, DAILY, ownsHome, openRealty, openArt, homePos, buyHome } from './world/homes.js';
import { openPoker, openDance, openDodger, openSlicer, openEatOff, scoreHand, makeGrid } from './games/minigames.js';
import { hasBuff } from './systems/state.js';

const params = new URLSearchParams(location.search);
const LOW = params.has('low');
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ Renderer
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.info.autoReset = false;
loadSettings();
input.sensitivity = settings.sensitivity;
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.25, 22000);
const hemi = new THREE.HemisphereLight(0x8899bb, 0x553322, 1);
const sun = new THREE.DirectionalLight(0xffeedd, 1.5);
scene.add(hemi, sun, sun.target);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.42, 0.3, 0.98);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// Quality: a fixed level, or 'auto', which steps down when frames run slow
// and back up when there is headroom.
let G = null; // everything built, filled by build()
let envRT = null, envNight = -1; // the reflection map and the night level it was taken at
let qualityLevel = LOW ? 2 : settings.quality === 'auto' ? 0 : Math.max(0, QUALITY.findIndex((q) => q.name === settings.quality));
function applyQuality(level) {
  qualityLevel = level;
  const q = QUALITY[level];
  renderer.setPixelRatio(Math.min(devicePixelRatio, q.pixelRatio));
  renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(Math.min(devicePixelRatio, q.pixelRatio));
  composer.setSize(innerWidth, innerHeight);
  bloom.enabled = q.bloom && !params.has('nobloom');
  // Reflections cost every lit pixel a lookup; the low level goes without.
  if (G) applyReflections(q.reflections && envRT ? envRT.texture : null);
  if (q.reflections && !envRT) envNight = -1; // take one on the next frame
}
applyQuality(qualityLevel);
const autoQ = { frames: 0, time: 0, slow: 0, fast: 0, last: performance.now() };
function autoQuality() {
  const now = performance.now();
  autoQ.time += now - autoQ.last;
  autoQ.last = now;
  autoQ.frames++;
  if (autoQ.time < 3000) return;
  const fps = (autoQ.frames * 1000) / autoQ.time;
  autoQ.frames = 0;
  autoQ.time = 0;
  if (settings.quality !== 'auto' || LOW || document.hidden) return;
  autoQ.slow = fps < 40 ? autoQ.slow + 1 : 0;
  autoQ.fast = fps > 58 ? autoQ.fast + 1 : 0;
  if (autoQ.slow >= 2 && qualityLevel < QUALITY.length - 1) {
    applyQuality(qualityLevel + 1);
    autoQ.slow = 0;
    toast(`Graphics lowered to ${QUALITY[qualityLevel].name} to keep things smooth. Press O for settings.`, 'info', 5000);
  } else if (autoQ.fast >= 4 && qualityLevel > 0) {
    applyQuality(qualityLevel - 1);
    autoQ.fast = 0;
  }
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.resolution.set(innerWidth / 2, innerHeight / 2);
  applyQuality(qualityLevel);
});

// ------------------------------------------------------------------ World build
const loadBar = $('load-bar'), loadText = $('load-text');
const step = async (pct, text) => {
  loadBar.style.width = `${pct}%`;
  loadText.textContent = text;
  await new Promise((r) => setTimeout(r, 16));
};


async function build() {
  await step(5, 'Pouring foundations…');
  initMaterials();
  const city = generateCity(world, (i, j) => isHubCell(i, j) || isLandmarkCell(i, j));
  await step(20, 'Raising ten thousand towers…');
  scene.add(buildLandmarks(world, city.segs, city.beacons));
  const district = buildDistrict(city.segs, city.decks, city.beacons);
  scene.add(district.group);
  const shelf = buildUndercity();
  scene.add(shelf.group);
  // The venues inside the deck towers, the market's shops, and homes for sale.
  const interiors = buildInteriors(scene);
  // One lamp lights whichever room you are in; outside it is switched off
  // (left in the scene so the shaders never recompile).
  const indoorLight = new THREE.PointLight(0xffffff, 0, 60, 1.3);
  scene.add(indoorLight);
  // The lift car, seen only while you ride it.
  const liftCar = new THREE.Group();
  const carFloor = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.15, 24), MAT.darkMetal);
  carFloor.position.y = -0.08;
  const carRing = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.06, 6, 28), MAT.neonCyan);
  carRing.rotation.x = Math.PI / 2;
  const carTop = carRing.clone();
  carTop.position.y = 3;
  liftCar.add(carFloor, carRing, carTop);
  liftCar.visible = false;
  scene.add(liftCar);
  const homes = buildHomes(scene, { monolith: city.monoliths[0], frame: district.frames[0] });
  await step(40, 'Lighting the windows…');
  scene.add(buildCityMeshes(city.segs));
  scene.add(buildCityMeshes(city.far));
  scene.add(createSky());
  await step(55, 'Opening the skylanes…');
  const traffic = createTraffic();
  scene.add(traffic.group);
  scene.add(createBeacons(city.beacons));
  const ads = createAds(city.segs);
  scene.add(ads.group);
  const atmosphere = createAtmosphere(city.segs);
  scene.add(atmosphere.group);
  await step(70, 'Waking two trillion residents…');
  const crowd = createCrowd(npcZones);
  scene.add(crowd.group);
  await step(82, 'Fuelling your speeder…');
  const walker = new Walker(scene);
  const speeder = new Speeder(scene, 'courier');
  speeder.onBump = (impact) => onBump(impact);
  const rig = new CameraRig(camera);
  const race = createSkyrace(scene, district.raceBoard, sfx, toast);
  const flyers = createFlyers(scene);
  initPolice(scene);
  const gaterun = createGateRun(race.gates, race.courseLength, sfx, toast);
  const people = createPeople(scene, {
    openLoan: () => acts.openLoan(ctx),
    openBlackjack: () => openBlackjack(sfx),
    escape: () => startEscape(),
    openFixer: () => acts.openJobs('fixer', ctx),
  }, shelf);
  story.where.board = new THREE.Vector3(-78.5, LEVELS.promenade, -63.5);
  story.where.chips = new THREE.Vector3(72.8, LEVELS.market, 32);
  story.where.shelf = shelf.center;
  story.where.cache = shelf.cachePos.clone().add(new THREE.Vector3(0, 0, -2));
  story.setStoryHooks({ toast, sfx });
  nav.before = () => gaterun.target();
  nav.after = () => story.storyTarget();
  // A pillar of light standing on the waypoint, visible from far away.
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1, 16, 1, true).translate(0, 0.5, 0),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.7, 1.6), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
  );
  beacon.visible = false;
  scene.add(beacon);
  initMap(city.segs);
  nav.places = buildPlaces(speeder, [
    ...people.people.filter((p) => !p.visible).map((p) => ({ name: p.name, get pos() { return p.talkAt || p.pos; }, group: 'People', hint: p.title, level: Math.hypot(p.pos.x, p.pos.z) < 170 ? p.pos.y : undefined })),
    { name: 'Undercity Shelf', pos: shelf.center, group: 'Hidden places', hint: 'An old platform below the clouds' },
    ...Object.entries(HOMES).map(([id, d]) => ({ name: d.name, get pos() { return homePos(id).door; }, group: 'Homes', get hint() { return ownsHome(id) ? `Yours · ${d.where}` : `For sale, ${d.price.toLocaleString()} cr · ${d.where}`; } })),
    ...SHOPS.map((f) => ({ name: f.label, pos: f.door, group: 'Shops', hint: `${f.hint} · Galleria Market`, level: LEVELS.market })),
    ...interactables.filter((it) => (it.action === 'shop' && !it.data.shop.startsWith('deck:')) || it.action === 'chips').map((it) => {
      const def = trade.shopDef(it.action === 'chips' ? 'chips' : it.data.shop);
      return { name: def.name, pos: it.pos, group: 'Shops', hint: `Buys and sells · ${def.where}`, level: Math.hypot(it.pos.x, it.pos.z) < 170 ? it.pos.y : undefined };
    }),
  ]);
  mapUI = setupMap($('mapcanvas'), $('placelist'), pickPlace);
  $('map-center').onclick = () => mapUI.recenter();
  await step(92, 'Compiling shaders…');

  G = { beacon, city, district, traffic, ads, atmosphere, crowd, walker, speeder, rig, race, flyers, gaterun, people, shelf, interiors, homes, indoorLight, liftCar, elevator: district.elevator };

  // Place the player (from a save, or fresh on the promenade).
  const extra = loadGame();
  if (!SPEEDER_MODELS[state.speeder]) state.speeder = 'courier';
  speeder.setModel(state.speeder, paintFor(state.speeder));
  dress();
  if (extra && extra.player) {
    walker.place(...extra.player, 0);
    if (extra.speeder) speeder.park(extra.speeder.x, extra.speeder.groundY, extra.speeder.z, extra.speeder.yaw);
    G.resumed = true;
  } else {
    walker.place(68, LEVELS.promenade, 0, Math.PI / 2);
    speeder.park(132, LEVELS.promenade, 0, -Math.PI / 2);
  }
  rig.yaw = Math.PI / 2;
  // Saves from when rooms were somewhere else entirely.
  if (state.inside || walker.pos.y < -100) {
    state.inside = undefined;
    walker.place(68, LEVELS.promenade, 0, Math.PI / 2);
  }
  if (params.has('t')) state.minutes = Number(params.get('t')) * 60;

  // Warm up: one render compiles every program before the player sees it.
  updateEnvironment(state.minutes, sun, hemi);
  refreshReflections();
  rig.walk(0, walker.pos.clone().add(new THREE.Vector3(0, 1.6, 0)), false);
  renderer.compile(scene, camera);
  composer.render();
  await step(100, 'Ready.');
  return extra;
}

// ------------------------------------------------------------------ Reflections
// The city, captured from the air beside the hub into a cube map, becomes the
// environment every metal, glass and polished floor reflects. It is re-taken
// as day turns to night (a few times a day), never every frame.
const pmrem = new THREE.PMREMGenerator(renderer);
const cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
const cubeCam = new THREE.CubeCamera(1, 16000, cubeRT);
cubeCam.position.set(0, 360, -175);
scene.add(cubeCam);

// Only shiny things reflect: metals and glass fully, polished floors faintly.
// A scene-wide environment would also light every rough wall from the sky.
function reflectiveMaterials() {
  const out = new Map();
  scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || !m.isMeshStandardMaterial || out.has(m)) continue;
      if (m.metalness >= 0.5) out.set(m, 0.9);
      else if (m === MAT.floor || m === MAT.floorWarm || m === MAT.glass) out.set(m, 0.3);
    }
  });
  return out;
}
function applyReflections(tex) {
  for (const [m, k] of reflectiveMaterials()) {
    if (m.envMap !== tex) {
      if (!m.envMap !== !tex) m.needsUpdate = true;
      m.envMap = tex;
      m.envMapIntensity = k;
    }
  }
}
function refreshReflections() {
  envNight = ENV.uNight.value;
  if (!QUALITY[qualityLevel].reflections) return;
  const hide = [G.walker.model.group, G.speeder.group, G.beacon];
  const was = hide.map((o) => o.visible);
  hide.forEach((o) => { o.visible = false; });
  cubeCam.update(renderer, scene);
  hide.forEach((o, i) => { o.visible = was[i]; });
  const next = pmrem.fromCubemap(cubeRT.texture);
  applyReflections(next.texture);
  if (envRT) envRT.dispose();
  envRT = next;
}

// ------------------------------------------------------------------ Game state
let mode = 'walk'; // walk | fly
let started = false;
let paused = false;
let mapOpen = false;
let helpOpen = false;
let viewer = null;
let wheelSpin = 0;
let bumpCooldown = 0;
let lastAutosave = 0;
let elapsed = 0;
let nearCraft = null;
let currentZone = null;
const head = new THREE.Vector3();

hooks.money = (n, reason) => {
  if (!started) return;
  if (Math.abs(n) >= 1) toast(`${n > 0 ? '+' : ''}${n} cr · ${reason}`, n > 0 ? 'money-pos' : 'info', 3200);
};

function saveExtra() {
  const w = G.walker, s = G.speeder;
  const p = mode === 'fly' ? safeLandingSpot() : w.pos;
  return {
    player: [p.x, p.y, p.z],
    speeder: { x: s.pos.x, groundY: s.parked ? s.groundY : p.y, z: s.pos.z, yaw: s.yaw },
  };
}

function safeLandingSpot() {
  // When saving mid-flight, resume at the nearest pad.
  let best = pads[0], bd = Infinity;
  for (const p of pads) {
    const d = G.speeder.pos.distanceTo(new THREE.Vector3(p.x, p.y, p.z));
    if (d < bd) { bd = d; best = p; }
  }
  return new THREE.Vector3(best.x + 4, best.y, best.z);
}

function save() {
  saveGame(saveExtra());
}

function fade(mid, hold = 500) {
  const f = $('fade');
  f.classList.add('on');
  setTimeout(() => {
    mid();
    setTimeout(() => f.classList.remove('on'), hold);
  }, 650);
}

// ------------------------------------------------------------------ Interactions
const ctx = {
  sfx,
  toast,
  fade,
  save,
  saveExtra: () => saveExtra(),
  dress: () => dress(),
  setSpeederModel: (id) => {
    const s = G.speeder;
    const parked = { x: s.pos.x, y: s.groundY, z: s.pos.z, yaw: s.yaw };
    s.setModel(id, paintFor(id));
    if (mode !== 'fly') s.park(parked.x, parked.y, parked.z, parked.yaw);
  },
  afterSleep: (mins) => {
    toast(`You sleep for ${Math.round(mins / 60)} hours and wake refreshed.`, 'win');
  },
  event: (name, data) => story.emit(name, data),
};

// The paint job on a speeder, as overrides for its model.
function paintFor(id) {
  const i = state.paint && state.paint[id];
  if (!i) return {};
  const [, color, accent] = PAINTS[i];
  return { color, accent };
}

// Put the player's clothes on the model, and what they let you do.
function dress() {
  const w = G.walker;
  w.setLook(playerLook());
  w.abilities = { runner: wearing('runner'), jet: wearing('jet'), glide: wearing('glide') };
}

// Vool's collectors: if you run, you have 25 seconds to reach your speeder.
let escapeUntil = 0;
function startEscape() {
  escapeUntil = elapsed + 25;
  toast('Run! Get to your speeder and take off. You have 25 seconds.', 'bad', 6000);
  sfx('alert');
}
function updateEscape() {
  if (!escapeUntil || !story.isAt('collectors')) { escapeUntil = 0; return; }
  if (mode === 'fly') {
    escapeUntil = 0;
    story.advance("You outran Vool's collectors and kept the cargo key.");
  } else if (elapsed > escapeUntil) {
    escapeUntil = 0;
    const lost = Math.min(Math.max(state.credits, 0), 100);
    if (lost) addCredits(-lost, "Vool's collectors");
    state.energy = Math.max(5, state.energy - 25);
    G.rig.shake = 1.2;
    sfx('bump');
    toast('They caught you and shook you down, but a security drone scared them off. You still have the key.', 'bad', 7000);
    story.advance("Vool's collectors roughed you up, but you held on to the cargo key.");
  }
}

// Spire Security: what happens when a scan fills, a patrol is shaken off, or
// one pulls you over.
let sirenT = 0;
const policeHooks = {
  alert: (d, reason) => {
    toast(d < 380
      ? `${reason}! Spire Security is on your tail. Boost away, break their line of sight, or dive below the clouds.`
      : `${reason}. A patrol is on its way, ${(d / 1000).toFixed(1)} km out.`, 'bad', 7000);
    sfx('alert');
  },
  escalate: (stars) => {
    toast(`${'★'.repeat(stars)} Wanted level ${stars}. More patrols are joining the chase.`, 'bad', 5000);
    sfx('alert');
  },
  lost: (stars, cred) => {
    toast(`You lost the patrol${stars > 1 ? 's' : ''}. Breathe.${cred ? ` The Undercity heard about it: +${cred} cr in street cred.` : ''}`, 'win', 6000);
    sfx('win');
  },
  stop: () => {
    if (mode === 'fly') { G.speeder.speed = 0; G.speeder.vel.set(0, 0, 0); }
    sfx('alert');
    openStop({ toast, sfx, release: () => {}, flying: () => mode === 'fly', jail: nightInCells });
  },
  // A stun bolt knocks most of your speed away.
  stun: () => {
    const s = G.speeder;
    const armor = wearing('armor');
    s.speed *= armor ? 0.65 : 0.3;
    s.vel.multiplyScalar(armor ? 0.7 : 0.35);
    G.rig.shake = 1.1;
    sfx('bump');
    toast('Stun bolt! Your engines stutter.', 'bad', 1800);
    if (state.job && state.job.fragile) onBump(30);
  },
  // A pursuer slams into your flank.
  ram: (f) => {
    const s = G.speeder;
    const push = s.pos.clone().sub(f.pos).setY(0).normalize().multiplyScalar(wearing('armor') ? 14 : 28);
    s.vel.add(push);
    s.speed *= 0.7;
    G.rig.shake = 0.9;
    bumpCooldown = 0;
    onBump(22);
  },
  velocity: () => (mode === 'fly' ? G.speeder.vel : new THREE.Vector3()),
  shot: () => sfx('zap'),
};

// Three stars and caught: a night in a holding cell.
function nightInCells() {
  fade(() => {
    state.minutes += 10 * 60;
    if (state.minutes >= 1440) { state.minutes -= 1440; state.day += 1; }
    state.hunger = Math.max(5, state.hunger - 30);
    toast('You spend a long night in a Spire Security holding cell. They let you out at dawn, with a warning.', 'bad', 8000);
  }, 1200);
}

// A passenger talks while you fly.
function updatePassenger(dt) {
  const j = state.job;
  const rider = passengerOf(j);
  if (!rider || mode !== 'fly') return;
  j.chat -= dt;
  if (j.chat <= 0) {
    j.chat = 22 + Math.random() * 14;
    speech(rider.name, rider.lines[Math.floor(Math.random() * rider.lines.length)]);
  }
}

// The Data Chips stall trades like any shop, and sells the story's decoder
// chip when the story needs it.
function openChips() {
  trade.openShop('chips', ctx, () => {
    if (!story.isAt('buy-chip')) return h('span');
    return h('div.menu-item', {},
      h('div', {}, h('b', {}, 'Decoder chip (military grade)'), h('div.muted', {}, 'The seller pretends not to know what it is for.')),
      h('button.btn.primary', { onclick: () => {
        if (state.credits < 150) { toast('Not enough credits.', 'bad'); sfx('lose'); return; }
        addCredits(-150, 'Decoder chip');
        sfx('coin');
        story.flag('hasChip', true);
        story.advance('You bought a military decoder chip at the Data Chips stall.');
        closePanel();
      } }, '150 cr'));
  });
}

function searchCache() {
  if (story.isAt('find-cache')) {
    story.flag('hasCache', true);
    toast("You pry open the locker. Inside: a cargo key stamped with the Meridian Vow's crest. Footsteps behind you.", 'race', 7000);
    story.advance("You found the Meridian Vow's cargo key, hidden on the Shelf.");
  } else if (story.reached('collectors')) {
    toast('The locker is empty now.', 'info');
  } else {
    toast('A rusted cargo locker. Its lock glows green, and it will not open for you. Not yet.', 'info');
  }
}

// ------------------------------------------------------------------ Inside buildings
const DRESS_CODE = { noble: 'The doorman looks you up and down. "The salon is formal wear only." (Threads, in the Galleria Market, can fix that.)', embassy: 'A guard droid blocks the door. "Visitors must be formally dressed." (Try Threads in the Galleria Market.)' };
// The glass lift between a deck and the venue in the storey below it.
let ride = null;
function startRide(data, down) {
  if (ride || mode !== 'walk') return;
  if (down && DRESS_CODE[data.theme] && !wearing('formal')) { toast(DRESS_CODE[data.theme], 'bad', 7000); sfx('lose'); return; }
  if (down && data.theme === 'club' && !wearing('party')) {
    if (state.credits < 20) { toast('The lift wants a 20 cr cover charge for the club. You do not have it.', 'bad'); sfx('lose'); return; }
    addCredits(-20, 'Club cover charge');
  }
  const from = down ? data.top : data.bottom, to = down ? data.bottom : data.top;
  ride = { from: from.clone(), to: to.clone(), t: 0, dur: Math.abs(from.y - to.y) / 3.5 + 0.8 };
  G.walker.place(from.x, from.y, from.z, 0);
  G.liftCar.visible = true;
  sfx('lift');
  toast(down ? `Down to ${data.venue}.` : 'Up to the roof.', 'info', 2000);
}
function updateRide(dt) {
  const w = G.walker;
  ride.t += dt;
  const k = THREE.MathUtils.smoothstep(ride.t / ride.dur, 0, 1);
  w.pos.lerpVectors(ride.from, ride.to, k);
  w.vel.set(0, 0, 0);
  w.syncModel(dt, 0);
  G.liftCar.position.copy(w.pos);
  if (ride.t >= ride.dur) {
    // Step out through the door.
    w.place(ride.to.x, ride.to.y, ride.to.z + 2.6, 0);
    G.rig.yaw = 0;
    G.liftCar.visible = false;
    ride = null;
    sfx('lift');
  }
}

// The one indoor lamp follows you from room to room.
let curRoom = null;
function lightRoom(room) {
  curRoom = room;
  const L = G.indoorLight;
  if (!room) { L.intensity = 0; return; }
  L.position.copy(room.lamp);
  L.color.set(room.light);
  L.distance = room.reach * 1.4;
  L.intensity = 220 * Math.pow(room.reach / 28, 1.3);
}

function buyHomeFor(id) { return buyHome(id); }

const realtyCtx = {
  toast, sfx,
  waypoint: (id) => { setTarget({ name: HOMES[id].name, pos: homePos(id).door }); toast(`Waypoint set: ${HOMES[id].name}.`, 'info'); },
};

// The medic: patch you up, or give you a new look.
const SKINS = [0xf1c8a8, 0xd9a07a, 0xc68e6a, 0x9a6a4a, 0x6a4430, 0x8ab0d8, 0x7ac08a];
const HAIRS = [0x2a1a12, 0x6a3a1a, 0xd8b060, 0xe8e8e8, 0xff3399, 0x33ddff, 0x55ff88];
function openClinic() {
  openPanel('Duty medic', (body) => {
    const render = () => {
      body.replaceChildren(
        h('p.muted', {}, 'Patch-ups, stim drips, and the city\'s quickest cosmetic work.'),
        h('div.menu-item', {}, h('div', {}, h('b', {}, 'Full treatment'), h('div.muted', {}, 'Energy to full and a nutrient drip. Takes an hour.')),
          h('button.btn.primary', { onclick: () => {
            if (state.credits < 60) { toast('Not enough credits.', 'bad'); sfx('lose'); return; }
            addCredits(-60, 'Clinic treatment');
            state.energy = 100;
            state.hunger = Math.max(state.hunger, 70);
            state.minutes = (state.minutes + 60) % 1440;
            sfx('win');
            toast('You leave the clinic feeling brand new.', 'win');
          } }, '60 cr')),
        h('div.label', {}, 'New skin tone · 100 cr'),
        h('div.row.wrap', {}, ...SKINS.map((c) => h('button.btn', { onclick: () => restyle({ skin: c }, 100) }, h('span.swatch', { style: `background:#${c.toString(16).padStart(6, '0')}` })))),
        h('div.label', {}, 'New hair colour · 60 cr'),
        h('div.row.wrap', {}, ...HAIRS.map((c) => h('button.btn', { onclick: () => restyle({ hairColor: c }, 60) }, h('span.swatch', { style: `background:#${c.toString(16).padStart(6, '0')}` })))));
    };
    const restyle = (change, price) => {
      if (state.credits < price) { toast('Not enough credits.', 'bad'); sfx('lose'); return; }
      addCredits(-price, 'Cosmetic clinic');
      state.look = { ...(state.look || {}), ...change };
      dress();
      sfx('coin');
      render();
    };
    render();
  }, { kicker: 'Medical centre' });
}

function meditate(what) {
  fade(() => {
    const rest = what === 'rest';
    state.minutes = (state.minutes + (rest ? 90 : 60)) % 1440;
    state.energy = Math.min(100, state.energy + (rest ? 50 : 35));
    toast(rest ? 'You doze for an hour and a half. Much better.' : "An hour of stillness. The city's noise fades, then your tiredness.", 'win', 5000);
  }, 700);
}

const FORTUNES = {
  lucky: 'The keeper turns a tile: a ship with full sails. "Your cargo flies true today." Deliveries pay 20% more until midnight.',
  calm: 'The keeper turns a tile: a closed eye. "Today, the watchers do not see you." Patrol scans reach less far until midnight.',
  swift: 'The keeper turns a tile: a bird. "Your feet are light today." You walk and run faster until midnight.',
};
function fortune() {
  if (hasBuff('lucky') || hasBuff('calm') || hasBuff('swift')) { toast('"One fortune a day," says the keeper. "Come back tomorrow."', 'info'); return; }
  if (state.credits < 25) { toast('The keeper asks 25 cr for incense. You do not have it.', 'bad'); return; }
  addCredits(-25, 'Fortune at the shrine');
  const id = ['lucky', 'calm', 'swift'][Math.floor(Math.random() * 3)];
  state.buff = { id, day: state.day };
  sfx('win');
  toast(FORTUNES[id], 'race', 9000);
}

// The embassy's permits change how the city treats you.
function openVisa() {
  openPanel('Visa and permits', (body) => {
    const up = trade.upgrades();
    const item = (key, name, price, text) => h('div.menu-item', {},
      h('div', {}, h('b', {}, name), up[key] ? h('span.tag', {}, 'yours') : '', h('div.muted', {}, text)),
      up[key] ? h('span.muted', {}, 'Granted') : h('button.btn.primary', { onclick: () => {
        if (state.credits < price) { toast('Not enough credits.', 'bad'); sfx('lose'); return; }
        addCredits(-price, name);
        up[key] = 1;
        sfx('win');
        toast(`${name} granted.`, 'win');
        closePanel();
      } }, `${price.toLocaleString()} cr`));
    body.append(
      h('p.muted', {}, 'Papers that open doors. Stamped while you wait.'),
      item('diplomat', 'Diplomatic transponder', 2200, 'Embassy scanners ignore your speeder, and patrol scans reach a quarter less far.'),
      item('license', 'Priority courier licence', 1500, 'Every delivery pays 15% more.'));
  }, { kicker: 'Embassy' });
}

function pickFruit() {
  if (state.fruitDay === state.day) { toast('You have picked today\'s fruit. The gardener smiles: tomorrow.', 'info'); return; }
  if (trade.cargoCount() + 3 > trade.capacity()) { toast('Your cargo hold is too full for fruit.', 'bad'); return; }
  trade.addItem('fruit', 3);
  state.fruitDay = state.day;
  sfx('coin');
  toast('You pick three sky fruit and put them in your hold. Press I to eat one.', 'win');
}

function lookInMirror() {
  const w = G.walker;
  const T = THREE.Vector3;
  const head = w.pos.clone().add(new T(0, 1.5, 0));
  viewer = { until: elapsed + 6, name: 'mirror' };
  G.rig.override = { pos: head.clone().add(new T(Math.sin(w.facing) * 2.6, 0.2, Math.cos(w.facing) * 2.6)), look: head, fov: 45, ease: 5 };
  toast('Looking good. Move to stop.', 'info', 2500);
}

// A home: buy it, or sleep, save and admire the view.
function openHome(id) {
  const d = HOMES[id];
  if (!ownsHome(id)) {
    openPanel(d.name, (body) => {
      body.append(h('p', {}, `${d.where}. ${d.perk}`),
        h('p.muted', {}, 'Buying your first home ends your Skyhaven lease: no more rent.'),
        h('div.row', {}, h('button.btn.primary', { onclick: () => { closePanel(); openRealty(realtyCtx); } }, `See it at Skyline Realty · ${d.price.toLocaleString()} cr`)));
    }, { kicker: 'For sale' });
    return;
  }
  openPanel(d.name, (body) => {
    body.append(h('p.muted', {}, d.perk),
      h('div.row.wrap', {},
        h('button.btn.primary', { onclick: () => {
          closePanel();
          if (acts.sleepUntilMorning(ctx) && id === 'penthouse') setTimeout(() => { state.hunger = 100; }, 800);
        } }, 'Sleep'),
        h('button.btn', { onclick: () => { save(); toast('Game saved.', 'info'); } }, 'Save'),
        h('button.btn', { onclick: () => { closePanel(); openBoutique(ctx, { title: 'Wardrobe', kicker: d.name }); } }, 'Wardrobe')));
  }, { kicker: 'Your home' });
}

function doAction(it) {
  sfx('open');
  switch (it.action) {
    case 'roulette': openRoulette(sfx, (n) => { wheelSpin = 18 + n * 0.01; }); break;
    case 'blackjack': openBlackjack(sfx); break;
    case 'slots': openSlots(sfx); break;
    case 'dice': openDice(sfx); break;
    case 'races': G.race.openBetting(); break;
    case 'food': acts.openFood(it.data.item, ctx); break;
    case 'jobs': acts.openJobs(GUILD.name, ctx); break;
    case 'deck-terminal': acts.openJobs(it.data.deck, ctx); break;
    case 'dealer': acts.openDealer(ctx); break;
    case 'loan': acts.openLoan(ctx); break;
    case 'terminal': acts.openTerminal(ctx); break;
    case 'plaque': acts.openPlaque(); break;
    case 'sleep': acts.sleepUntilMorning(ctx); break;
    case 'person': G.people.talkTo(it.data.id, sfx); break;
    case 'chips': openChips(); break;
    case 'shop': trade.openShop(it.data.shop, ctx); break;
    case 'cache': searchCache(); break;
    case 'gaterun': G.gaterun.open(); break;
    case 'lift-call': {
      const el = G.elevator;
      const idx = it.data.level;
      if (el.docked() && el.levelIndexAt(el.y) === idx) toast('The lift is here. Step inside and press E.', 'info');
      else { el.call(idx); toast('Lift called.', 'info', 2000); sfx('lift'); }
      break;
    }
    case 'lift-choose': openLiftPanel(); break;
    case 'viewer': startViewer(); break;
    case 'lift-down': startRide(it.data, true); break;
    case 'lift-up': startRide(it.data, false); break;
    case 'bar': acts.openFood('ale', ctx); break;
    case 'feast': acts.openFood('feast', ctx); break;
    case 'eatoff': openEatOff(ctx); break;
    case 'dance': openDance(ctx, { fee: curRoom && curRoom.id === 'club' && wearing('party') ? 0 : 20, bonus: wearing('party') ? 1.35 : 1 }); break;
    case 'arcade': openDodger(ctx); break;
    case 'poker': openPoker(ctx, it.data && it.data.stakes === 'high'
      ? { title: 'The high table', kicker: 'Noble salon · Holo Poker', bets: [100, 250, 500, 1000] }
      : { title: 'Holo Poker', kicker: 'Jacks or better', bets: [5, 10, 25, 50] }); break;
    case 'slicer': openSlicer(ctx, {
      reward: police.wanted ? 'a wiped record' : '220 cr of paydata',
      onWin: () => {
        if (police.wanted) { clearHeat(); return 'You slice into Spire Security and wipe your file. The patrols lose interest.'; }
        addCredits(220, 'Sliced paydata');
        return 'Clean slice. You skim 220 cr of paydata before anyone notices.';
      },
    }); break;
    case 'clinic': openClinic(); break;
    case 'meditate': meditate(it.data && it.data.what); break;
    case 'fortune': fortune(); break;
    case 'visa': openVisa(); break;
    case 'art': openArt(ctx, (it.data && it.data.kind) || 'art'); break;
    case 'pickfruit': pickFruit(); break;
    case 'boutique': openBoutique(ctx, { shopOnly: true }); break;
    case 'wardrobe':
      if (ownsHome(it.data.id)) openBoutique(ctx, { title: 'Wardrobe', kicker: HOMES[it.data.id].name });
      else toast('Not your wardrobe. Not yet.', 'info');
      break;
    case 'mirror': lookInMirror(); break;
    case 'realty': openRealty(realtyCtx); break;
    case 'home': openHome(it.data.id); break;
    default: break;
  }
}

function openSettings() {
  openPanel('Settings', (body) => {
    const sensVal = h('span.bet-val', {}, settings.sensitivity.toFixed(2) + '×');
    const sens = h('input', { type: 'range', id: 'set-sens', min: '0.3', max: '2.5', step: '0.05', value: String(settings.sensitivity) });
    sens.oninput = () => {
      settings.sensitivity = Number(sens.value);
      input.sensitivity = settings.sensitivity;
      sensVal.textContent = settings.sensitivity.toFixed(2) + '×';
      saveSettings();
    };
    const inv = h('input', { type: 'checkbox', id: 'set-invert' });
    inv.checked = settings.invertFlight;
    inv.onchange = () => { settings.invertFlight = inv.checked; saveSettings(); };
    const qRow = h('div.row.wrap');
    const renderQ = () => {
      qRow.replaceChildren(...['auto', 'high', 'medium', 'low'].map((q) => h('button.btn' + (settings.quality === q ? '.primary' : ''), {
        onclick: () => {
          settings.quality = q;
          saveSettings();
          if (q !== 'auto') applyQuality(QUALITY.findIndex((x) => x.name === q));
          renderQ();
        },
      }, q[0].toUpperCase() + q.slice(1))));
    };
    renderQ();
    body.append(
      h('div.row', {}, h('label.label', { for: 'set-sens' }, 'Mouse sensitivity'), sens, sensVal),
      h('div.row', {}, inv, h('label', { for: 'set-invert' }, 'Invert flight pitch (pull back to climb)')),
      h('div', {}, h('div.label', {}, 'Graphics'), qRow),
      h('p.muted', {}, `Auto lowers resolution and glow if the frame rate drops, and raises them again when there is headroom. Now running: ${QUALITY[qualityLevel].name}.`)
    );
  }, { kicker: 'Press O any time' });
}

function openLiftPanel() {
  const el = G.elevator;
  openPanel('Spire Lift', (body) => {
    const cur = el.levelIndexAt(el.y);
    body.append(h('p.muted', {}, 'Choose a floor.'));
    el.levels.forEach((lv, i) => {
      body.append(h('button.btn' + (i === cur ? '.ghost' : '.primary'), {
        disabled: i === cur ? 'true' : undefined,
        onclick: () => {
          el.call(i);
          el.riding = true;
          sfx('lift');
          closePanel();
        },
      }, `${lv.y} · ${lv.name}`));
    });
  }, { kicker: 'Glass elevator' });
}

function startViewer() {
  const targets = [
    { name: 'The Temple', p: new THREE.Vector3(LANDMARKS[1].i * 120, 300, LANDMARKS[1].j * 120) },
    { name: 'The Assembly Dome', p: new THREE.Vector3(LANDMARKS[0].i * 120, 320, LANDMARKS[0].j * 120) },
  ];
  const t = targets[Math.floor(Math.random() * targets.length)];
  const from = G.walker.pos.clone().add(new THREE.Vector3(0, 1.7, 0));
  viewer = { until: elapsed + 9, name: t.name };
  G.rig.override = { pos: from, look: t.p, fov: 9, ease: 6 };
  toast(`Through the viewer: ${t.name}. Press any movement key to stop.`, 'info', 4000);
}

onPanel('open', () => {
  input.enabled = false;
  if (document.pointerLockElement) document.exitPointerLock();
});
onPanel('close', () => {
  input.enabled = true;
  requestLock(canvas);
});

// Valet: a drone brings your parked speeder to the pad nearest you. It takes
// a few seconds, longer from further away, then the speeder descends onto the
// pad from above (pads are open to the sky, so the descent is clear).
const VALET_FEE = 10;
let recall = null;

function nearestPadTo(p) {
  let best = null, bd = Infinity;
  for (const pad of pads) {
    // Prefer pads on your own level: a pad 5 m away but 140 m below is no use.
    const d = Math.hypot(pad.x - p.x, pad.z - p.z) + Math.abs(pad.y - p.y) * 3;
    if (d < bd) { bd = d; best = pad; }
  }
  return best;
}

function callSpeeder() {
  const s = G.speeder, w = G.walker;
  if (mode === 'fly') { toast("You're already flying it.", 'info', 2000); return; }
  if (recall) { toast(`Your speeder is on its way to ${recall.pad.name}.`, 'info', 2500); return; }
  const pad = nearestPadTo(w.pos);
  if (!pad) return;
  const padPos = new THREE.Vector3(pad.x, pad.y, pad.z);
  if (s.pos.distanceTo(padPos) < 12) { toast(`Your speeder is already at ${pad.name}.`, 'info', 2500); setTarget(nav.places.find((p) => p.group === 'You')); return; }
  // Always charged; if you are broke it goes on your balance (like rent),
  // so you are never stranded without your speeder.
  addCredits(-VALET_FEE, 'Speeder valet');
  const dist = s.pos.distanceTo(padPos);
  recall = { pad, wait: Math.min(14, 3 + dist / 180), descend: 0 };
  s.group.visible = false;
  sfx('board');
  toast(`A valet drone is bringing your speeder to ${pad.name}. About ${Math.ceil(recall.wait + 3)} seconds.`, 'info', 5000);
  setTarget(nav.places.find((p) => p.group === 'You'));
}

function updateRecall(dt) {
  if (!recall) return;
  const s = G.speeder, pad = recall.pad;
  if (recall.wait > 0) {
    recall.wait -= dt;
    if (recall.wait <= 0) {
      s.park(pad.x, pad.y, pad.z, s.yaw);
      s.pos.y = pad.y + 60;
      s.group.visible = true;
      recall.descend = 3;
      s.arriving = true;
    }
    return;
  }
  recall.descend -= dt;
  const k = Math.max(0, recall.descend / 3);
  // Ease down onto the pad; park() keeps it hovering once it arrives.
  s.groundY = pad.y;
  s.pos.y = pad.y + 0.9 + 60 * k * k;
  s.sync();
  if (recall.descend <= 0) {
    s.arriving = false;
    s.park(pad.x, pad.y, pad.z, s.yaw);
    recall = null;
    sfx('land');
    toast(`Your speeder is waiting at ${pad.name}.`, 'win', 4000);
  }
}

function boardSpeeder() {
  mode = 'fly';
  G.walker.setVisible(false);
  G.speeder.parked = false;
  G.speeder.speed = 0;
  G.speeder.vel.set(0, 3, 0);
  G.rig.camera.position.copy(G.speeder.pos).add(new THREE.Vector3(-Math.sin(G.speeder.yaw) * 10, 4, -Math.cos(G.speeder.yaw) * 10));
  sfx('board');
  if (!state.tutorialDone) {
    toast('W to throttle, mouse to steer, Space/C to rise and descend. Hold Shift to boost.', 'info', 7000);
  }
}

// Ground suitable for setting down: a walkable top within a few metres below.
function landingGround() {
  const p = G.speeder.pos;
  const g = world.groundAt(p.x, p.z, p.y, 0, 0.5);
  if (g === -Infinity || p.y - g > 9) return null;
  return g;
}

function exitSpeeder() {
  const g = landingGround();
  if (g === null) return false;
  if (Math.abs(G.speeder.speed) > 30) { toast('Slow down to land.', 'bad', 2000); return false; }
  const s = G.speeder;
  s.park(s.pos.x, g, s.pos.z, s.yaw);
  // Step out to the side if there is floor there.
  const w = G.walker;
  const sideX = Math.cos(s.yaw) * 3, sideZ = -Math.sin(s.yaw) * 3;
  let px = s.pos.x + sideX, pz = s.pos.z + sideZ;
  const gs = world.groundAt(px, pz, g + 0.4, 0.5, 0);
  if (!(Math.abs(gs - g) < 0.6) || world.pointInside(px, g + 1, pz)) { px = s.pos.x - sideX; pz = s.pos.z - sideZ; }
  const g2 = world.groundAt(px, pz, g + 0.4, 0.5, 0);
  if (!(Math.abs(g2 - g) < 0.6) || world.pointInside(px, g + 1, pz)) { px = s.pos.x; pz = s.pos.z; }
  w.place(px, g + 0.05, pz, s.yaw);
  w.setVisible(true);
  mode = 'walk';
  G.rig.yaw = s.yaw;
  G.rig.pitch = -0.15;
  sfx('land');
  if (!state.tutorialDone) { state.tutorialDone = true; }
  return true;
}

// ------------------------------------------------------------------ Events
function handleEvents(events) {
  for (const e of events) {
    if (e.type === 'rent') {
      toast(`Rent of 120 cr collected.${state.credits < 0 ? ' You are in the red. Find work fast.' : ''}`, state.credits < 0 ? 'bad' : 'info', 6000);
      sfx('alert');
    }
    if (e.type === 'newday') {
      toast(`Day ${state.day} begins.`, 'info');
      for (const [id, n] of Object.entries(DAILY)) if (ownsHome(id)) addCredits(n, id === 'crown' ? 'Monolith Crown sightseeing tours' : 'Floating Villa guests');
    }
    if (e.type === 'loandue' && state.loan) {
      const owed = state.loan.owed;
      state.loan = null;
      addCredits(-owed, "Vool's collectors");
      state.energy = Math.max(5, state.energy - 35);
      G.rig.shake = 1.2;
      sfx('bump');
      toast(`Vool's collectors found you. They took ${owed} cr and left you bruised.`, 'bad', 8000);
    }
    if (e.type === 'collapse') collapse();
  }
}

function collapse() {
  if (G.collapsing) return;
  G.collapsing = true;
  fade(() => {
    if (mode === 'fly') {
      const p = safeLandingSpot();
      G.speeder.park(p.x - 4, p.y, p.z, G.speeder.yaw);
      mode = 'walk';
      G.walker.setVisible(true);
    }
    G.walker.place(8, LEVELS.residences, 57, Math.PI);
    state.minutes += 6 * 60;
    if (state.minutes >= 1440) { state.minutes -= 1440; state.day += 1; }
    state.energy = 45;
    addCredits(-80, 'Medical droid call-out');
    toast('You collapsed from exhaustion. A med droid carried you home. Sleep more!', 'bad', 7000);
    G.collapsing = false;
  }, 900);
}

function fellOff() {
  if (G.falling) return;
  G.falling = true;
  fade(() => {
    const s = G.walker.lastSafe;
    G.walker.place(s.x, s.y, s.z, G.walker.facing);
    // Nudge back from the edge we fell from.
    const z = zoneAt(G.walker.pos);
    if (!z) G.walker.place(68, LEVELS.promenade, 0, Math.PI / 2);
    if (wearing('pilot') || wearing('glide')) toast('A fall-catch drone snagged you. Pilots ride free.', 'info', 5000);
    else {
      addCredits(-50, 'Fall-catch drone');
      toast('A fall-catch drone snagged you a few hundred metres down. That will be 50 credits.', 'bad', 6000);
    }
    G.falling = false;
  });
}

// ------------------------------------------------------------------ Main loop
const clock = new THREE.Clock();
let hudTimer = 0;

function update(dt) {
  elapsed += dt;
  ENV.uTime.value = elapsed;
  const w = G.walker, s = G.speeder, rig = G.rig;

  // Time and body.
  if (!paused) handleEvents(tick(dt));
  w.speedMul = bodySpeedMul() * (hasBuff('swift') ? 1.2 : 1);
  const elev = updateEnvironment(state.minutes, sun, hemi);
  void elev;
  if (Math.abs(ENV.uNight.value - envNight) > 0.2) refreshReflections();

  // Toggles.
  if (pressed('KeyH')) { helpOpen = !helpOpen; $('help').classList.toggle('hidden', !helpOpen); }
  if (pressed('KeyO')) openSettings();
  if (pressed('KeyV')) callSpeeder();
  if (pressed('KeyJ')) story.openJournal(() => clearTarget());
  if (pressed('KeyI')) trade.openInventory(ctx);
  // Honk. At a patrol, that is an invitation.
  if (pressed('KeyG') && mode === 'fly') {
    sfx('horn');
    crime('taunt', { player: G.speeder.pos, flyers: G.flyers.flyers, flying: true, hooks: policeHooks });
  }

  // Lift.
  const el = G.elevator;
  el.update(dt, mode === 'walk' ? w : null);
  if (el.riding && el.docked()) el.riding = false;
  w.frozen = el.riding || !!viewer;

  // Viewer.
  if (viewer) {
    if (elapsed > viewer.until || key('KeyW') || key('KeyA') || key('KeyS') || key('KeyD')) {
      viewer = null;
      rig.override = null;
    }
  }

  let prompt = null;
  if (mode === 'walk') {
    if (ride) updateRide(dt);
    else w.update(dt, rig.yaw);
    if (rig.override) rig.cinematic(dt);
    else {
      head.copy(w.pos).y += 1.6;
      rig.walk(dt, head, !isPanelOpen());
    }
    if (w.pos.y < Math.min(ABYSS_Y, w.lastSafe.y - 60)) fellOff();

    // What can we do here?
    const it = nearestInteract(w.pos);
    const dSpeeder = w.pos.distanceTo(s.pos);
    const npc = G.crowd.nearest(w.pos, 2.2);
    if (!el.riding && !isPanelOpen()) {
      if (dSpeeder < 5) prompt = `<kbd>F</kbd> Board your ${s.spec.name}`;
      if (it) {
        const label = typeof it.label === 'function' ? it.label() : it.label;
        const deliverHere = state.job && ((it.action === 'deck-terminal' && it.data.deck === state.job.dest) || (it.action === 'jobs' && state.job.dest === GUILD.name));
        prompt = `<kbd>E</kbd> ${deliverHere ? 'Deliver ' + state.job.cargo : label}` + (prompt ? ` &nbsp; ${prompt}` : '');
      } else if (npc) {
        prompt = `<kbd>E</kbd> Talk` + (prompt ? ` &nbsp; ${prompt}` : '');
      }
      if (pressed('KeyE')) {
        if (it) doAction(it);
        else if (npc) {
          npc.talkTimer = 5;
          speech(npc.droid ? 'Droid' : 'Passer-by', npc.line);
          sfx('click');
        }
      }
      if (pressed('KeyF') && dSpeeder < 5) boardSpeeder();
    }
  } else {
    s.update(dt, !isPanelOpen());
    rig.fly(dt, s);
    nearCraft = nearestCraft(G.traffic.lanes, s.pos, elapsed, 40);
    if (nearCraft && nearCraft.d < 4.5 && bumpCooldown <= 0) {
      onBump(25);
      toast('Mind the skylanes!', 'bad', 2000);
    }
    const g = landingGround();
    if (g !== null) prompt = Math.abs(s.speed) > 30 ? 'Slow down to land' : '<kbd>F</kbd> Land here';
    if (pressed('KeyF')) exitSpeeder();
  }
  if (mode === 'walk') s.update(dt, false);
  updateRecall(dt);
  s.bonus = (trade.upgrades().turbo || 0) * 12;
  s.load = state.job && state.job.heavy && !s.spec.hauler ? 0.7 : 1;
  s.handling = wearing('pilot') ? 1.2 : 1;
  bumpCooldown -= dt;

  // The world around.
  const focus = mode === 'fly' ? s.pos : w.pos;
  G.crowd.update(dt, w.pos, camera.position);
  G.ads.update(elapsed);
  G.flyers.update(dt, elapsed, s.parked ? s.pos : null);
  G.people.update(dt, w.pos, camera.position, elapsed);
  const room = mode === 'walk' ? roomAt(w.pos) : null;
  if (room !== curRoom) lightRoom(room);
  updatePolice(dt, { player: focus, flying: mode === 'fly', speed: s.speed, flyers: G.flyers.flyers, hooks: policeHooks, indoors: !!room || !!ride });
  if (police.wanted && police.dist < 700 && (sirenT -= dt) <= 0) { sirenT = 1.1; sfx('siren'); }
  updatePassenger(dt);
  // The hideout is off every map.
  if (police.wanted && ownsHome('hideout') && focus.distanceTo(homePos('hideout').center) < 45) {
    clearHeat();
    toast('You slip into your hideout under the clouds. Spire Security loses the trail.', 'win', 6000);
  }
  G.gaterun.update(dt, mode === 'fly' ? s.pos : null);
  updateEscape();
  if (mode === 'fly' && story.favorState('imani') === 'active') {
    for (const l of LANDMARKS) {
      if (Math.hypot(s.pos.x - l.i * 120, s.pos.z - l.j * 120) < 350) story.emit('near', { what: l.id });
    }
  }
  G.atmosphere.update(elapsed, camera);
  G.race.update(dt, elapsed, focus.length() < 1500);
  for (const o of G.district.spinners) o.rotation.y += o.userData.spin * dt;
  for (const o of G.interiors.spinners) o.rotation.y += o.userData.spin * dt;
  if (G.district.rouletteWheel) {
    G.district.rouletteWheel.rotation.y += wheelSpin * dt;
    wheelSpin *= 1 - Math.min(1, dt * 0.6);
  }

  // Wayfinding.
  const guide = guidance(focus, mode, s, mode === 'walk' && el.containsPlayer(w.pos));
  if (arrived(w.pos, mode)) {
    toast(`You've arrived: ${nav.target.name}.`, 'win', 3500);
    sfx('deliver');
    clearTarget();
  }

  if (guide && !(mode === 'walk' && w.pos.distanceTo(guide.pos) < 25)) {
    const d = camera.position.distanceTo(guide.pos);
    const r = Math.max(0.8, d * 0.004);
    G.beacon.visible = true;
    G.beacon.position.copy(guide.pos);
    G.beacon.scale.set(r, Math.max(14, d * 0.25), r);
    G.beacon.material.opacity = 0.25 + 0.12 * Math.sin(elapsed * 3);
  } else G.beacon.visible = false;

  // HUD (a little less often than every frame).
  hudTimer -= dt;
  setPrompt(prompt);
  const zone = zoneAt(focus);
  if (zone !== currentZone) {
    currentZone = zone;
    showLocation(zone);
    if (zone) story.emit('zone', { name: zone.name });
  }
  if (hudTimer <= 0) {
    hudTimer = 0.05;
    updateHUD({
      camera,
      mode,
      speeder: s,
      guide,
      jobLeft: minutesLeft(),
      heat: heatStatus(),
      landmarks: [
        { x: 0, z: 0, icon: '▲', cls: 'hub' },
        ...LANDMARKS.map((l) => ({ x: l.i * 120, z: l.j * 120, icon: '●' })),
      ],
    });
    const tick_ = G.gaterun.ticker() || G.race.tickerText();
    const tk = $('ticker');
    if (tick_ && (focus.length() < 2000 || G.race.race.bets.length)) { tk.textContent = tick_; tk.classList.add('show'); }
    else tk.classList.remove('show');
  }
  if (mapOpen) {
    const f = mode === 'fly' ? new THREE.Vector3(Math.sin(s.yaw), 0, Math.cos(s.yaw)) : new THREE.Vector3(Math.sin(w.facing), 0, Math.cos(w.facing));
    drawMap({
      player: { x: focus.x, y: focus.y, z: focus.z, heading: Math.atan2(f.x, -f.z) },
      speeder: s,
      flying: mode === 'fly',
      places: nav.places,
      target: nav.target || (state.job ? { name: state.job.dest } : null),
      police: carrying().any || police.wanted ? G.flyers.flyers.filter((f) => f.kind === 'police').map((f) => ({ x: f.pos.x, z: f.pos.z, chasing: !!f.chase, r: 120 * (trade.upgrades().jammer ? 0.5 : 1) })) : null,
    });
  }

  updateAudio({
    flying: mode === 'fly',
    speed: s.speed,
    boost: key('ShiftLeft'),
    nearCraft: mode === 'fly' ? nearCraft : null,
    crowdCount: mode === 'walk' ? G.crowd.countNear(w.pos, 18) : 0,
    altitude: focus.y,
    night: ENV.uNight.value,
  });

  // Autosave.
  if (elapsed - lastAutosave > 60) {
    lastAutosave = elapsed;
    save();
  }
}

function onBump(impact) {
  if (bumpCooldown > 0) return;
  bumpCooldown = 0.8;
  G.rig.shake = Math.min(1.5, impact / 30);
  sfx('bump');
  if (state.job && state.job.fragile) {
    // Hull plating halves the knocks fragile cargo takes.
    state.job.damage += (trade.upgrades().plating ? 0.5 : 1) * (G.speeder.spec.fragile ? 2 : 1);
    toast(`Fragile cargo took a hit (${state.job.damage}).`, 'bad', 2500);
  }
  const rider = passengerOf(state.job);
  if (rider) {
    state.job.bumps += 1;
    speech(rider.name, rider.bump);
  }
}

let fpsFrames = 0, fpsTime = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  if (started) autoQuality();
  fpsFrames++;
  fpsTime += dt;
  if (fpsTime > 1) { window.__fps = fpsFrames / fpsTime; fpsFrames = 0; fpsTime = 0; }
  if (G && started) {
    paused = !input.locked && !input.lockFailed && !isPanelOpen() && !mapOpen && !params.has('nolock');
    $('pause').classList.toggle('hidden', !paused || mapOpen || helpOpen);
    const t0 = performance.now();
    if (!paused || isPanelOpen() || mapOpen) update(dt);
    else ENV.uTime.value = elapsed;
    window.__perf = window.__perf || { update: 0, render: 0 };
    window.__perf.update = performance.now() - t0;

  } else if (G) {
    // Title screen: a slow orbit around the Spire.
    elapsed += dt;
    ENV.uTime.value = elapsed;
    updateEnvironment(state.minutes, sun, hemi);
    // Circle the hub in the clear air between the Spire and its four
    // framing towers, looking out over the city.
    const a = elapsed * 0.035 + 0.6;
    camera.position.set(Math.cos(a) * 150, 375 + Math.sin(elapsed * 0.07) * 15, Math.sin(a) * 150);
    const b = a + 0.55;
    camera.lookAt(Math.cos(b) * 1000, 290, Math.sin(b) * 1000);
    G.race.update(dt, elapsed, false);
    G.ads.update(elapsed);
    G.flyers.update(dt, elapsed, null);
    G.atmosphere.update(elapsed, camera);
  }
  endFrame();
  const r0 = performance.now();
  renderer.info.reset();
  if (G) composer.render();
  if (window.__perf) {
    window.__perf.render = performance.now() - r0;
    window.__perf.calls = renderer.info.render.calls;
    window.__perf.tris = renderer.info.render.triangles;
  }
}

// ------------------------------------------------------------------ Boot
initInput(canvas, () => {});
canvas.addEventListener('click', () => {
  if (started && !input.locked && !isPanelOpen()) requestLock(canvas);
});
$('pause').addEventListener('click', () => requestLock(canvas));
addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && isPanelOpen()) closePanel();
  else if (e.code === 'Escape' && mapOpen) closeMap();
  else if (e.code === 'KeyM' && started && !isPanelOpen()) (mapOpen ? closeMap() : openMap());
});

// The map takes the mouse while it is open; the world keeps running.
let mapUI = null;
function openMap() {
  mapOpen = true;
  $('mapview').classList.remove('hidden');
  mapUI.recenter();
  mapUI.fillList(nav.places);
  input.enabled = false;
  if (document.pointerLockElement) document.exitPointerLock();
}
function closeMap() {
  mapOpen = false;
  $('mapview').classList.add('hidden');
  input.enabled = true;
  requestLock(canvas);
}
function pickPlace(place) {
  setTarget(place);
  sfx('click');
  toast(`Waypoint set: ${place.name}. Follow the ◆ marker.`, 'info', 3500);
  closeMap();
}

function begin(fresh) {
  if (fresh) {
    try { localStorage.removeItem('coruscant-save-v1'); } catch { /* storage blocked */ }
    if (G.resumed) { location.reload(); return; }
  }
  started = true;
  $('title').classList.add('hidden');
  $('hud').classList.remove('hidden');
  initAudio();
  requestLock(canvas);
  if (!G.resumed || fresh) {
    setTimeout(() => toast('Welcome to the city. You have 500 credits, a speeder on the East Pad, and rent due at 06:00.', 'info', 8000), 600);
    setTimeout(() => toast(`Your first objective: ${story.current().goal}. Follow the ◆ marker. Press J for your journal.`, 'race', 10000), 3500);
    setTimeout(() => toast('People with a ! over their heads have something for you. Press M for the map and every place in the city.', 'info', 9000), 8000);
  } else {
    toast(`Welcome back. Day ${state.day}, ${state.credits} cr.`, 'info', 5000);
  }
}

build().then((extra) => {
  $('loading').classList.add('hidden');
  $('start-buttons').classList.remove('hidden');
  if (extra && extra.player) {
    const c = $('btn-continue');
    c.classList.remove('hidden');
    c.textContent = `Continue · Day ${state.day}`;
    c.onclick = () => begin(false);
    $('btn-new').textContent = 'New life';
    $('btn-new').classList.remove('primary');
  }
  $('btn-new').onclick = () => begin(true);
  if (params.has('autostart')) begin(false);
  // Hooks for automated testing.
  window.__game = {
    G, scene, camera, state, input,
    // Advance the simulation without rendering (for automated tests).
    step: (n, dt = 1 / 30) => { for (let i = 0; i < n; i++) { update(dt); endFrame(); } },
    doAction: (action, data) => doAction({ action, data }),
    nearest: () => nearestInteract(G.walker.pos),
    nav, openMap, closeMap, story, trade, jobs, police, dress, homes: { buy: (id) => buyHomeFor(id) }, rooms: ROOMS, get room() { return curRoom; }, get riding() { return !!ride; }, games: { scoreHand, makeGrid }, wearing, crime: (k) => crime(k, { player: mode === 'fly' ? G.speeder.pos : G.walker.pos, flyers: G.flyers.flyers, flying: mode === 'fly', hooks: policeHooks }), clearHeat, bump: (i) => { bumpCooldown = 0; onBump(i); },
    guide: () => guidance(mode === 'fly' ? G.speeder.pos : G.walker.pos, mode, G.speeder, mode === 'walk' && G.elevator.containsPlayer(G.walker.pos)), setMode: (m) => (m === 'fly' ? boardSpeeder() : exitSpeeder()), begin, world, interactables, get mode() { return mode; }, get quality() { return QUALITY[qualityLevel].name; }, openSettings,
    setQuality: (name) => { settings.quality = name; applyQuality(Math.max(0, QUALITY.findIndex((q) => q.name === name))); }, totalMinutes };
});
requestAnimationFrame(frame);
