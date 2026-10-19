// Gameplay test: drives every system through window.__game.step(), which
// advances the simulation without rendering, so it runs the same on a
// software renderer as on a GPU.
//
//   npm run build && npm run preview   (in one terminal)
//   npm test                           (in another)
//
// Uses the Chrome installed on this machine; set CHROME_PATH to use another
// Chromium build. The URL defaults to the preview server.
import { chromium } from 'playwright-core';

const out = process.argv[2] || '.';
const url = process.env.GAME_URL || 'http://localhost:4173';
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${url}/?nolock&autostart&low`);
await page.waitForFunction(() => window.__game, null, { timeout: 240000 });
const ev = (fn, arg) => page.evaluate(fn, arg);
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`);
};

// 1. Walking.
let r = await ev(() => {
  const g = window.__game;
  g.G.walker.place(60, 300, 0, 0);
  g.G.rig.yaw = Math.PI / 2; // face +x
  const x0 = g.G.walker.pos.x;
  g.input.keys.add('KeyW');
  g.step(60);
  g.input.keys.delete('KeyW');
  g.step(10);
  return { dx: g.G.walker.pos.x - x0, y: g.G.walker.pos.y };
});
check('walk forward ~8m in 2s', r.dx > 6 && r.dx < 10 && Math.abs(r.y - 300) < 0.01, JSON.stringify(r));

// 2. Jump.
r = await ev(() => {
  const g = window.__game;
  g.input.pressed.add('Space');
  g.step(1);
  let maxY = 0;
  for (let i = 0; i < 30; i++) { g.step(1); maxY = Math.max(maxY, g.G.walker.pos.y); }
  g.step(30);
  return { maxY, y: g.G.walker.pos.y };
});
check('jump rises ~1m and lands', r.maxY > 300.8 && r.maxY < 301.4 && Math.abs(r.y - 300) < 0.01, JSON.stringify(r));

// 3. Railings stop you at the edge.
r = await ev(() => {
  const g = window.__game;
  g.G.walker.place(90, 300, 40, 0);
  g.G.rig.yaw = Math.PI / 2;
  g.input.keys.add('KeyW');
  g.step(120);
  g.input.keys.delete('KeyW');
  return { x: g.G.walker.pos.x, y: g.G.walker.pos.y };
});
check('railing blocks the edge', r.x < 100 && Math.abs(r.y - 300) < 0.01, JSON.stringify(r));

// 4. Lift: stand in the car at the promenade, ride to the residences, walk out.
r = await ev(() => {
  const g = window.__game;
  const el = g.G.elevator;
  g.G.walker.place(0, 300, -47, Math.PI);
  g.step(5);
  const it = g.nearest();
  el.call(2);
  el.riding = true;
  g.step(600);
  const yRide = g.G.walker.pos.y;
  g.G.rig.yaw = Math.PI; // face -z, out of the car
  g.input.keys.add('KeyW');
  g.step(90);
  g.input.keys.delete('KeyW');
  return { action: it && it.action, carY: el.y, yRide, pos: g.G.walker.pos.toArray() };
});
check('lift prompt inside car', r.action === 'lift-choose', JSON.stringify(r.action));
check('lift carries player to 440', Math.abs(r.carY - 440) < 0.01 && Math.abs(r.yRide - 440) < 0.05, JSON.stringify(r));
check('walk out onto residences', r.pos[2] < -56 && Math.abs(r.pos[1] - 440) < 0.05, JSON.stringify(r.pos));

// 5. Landing door blocks the shaft when the car is away.
r = await ev(() => {
  const g = window.__game;
  g.G.walker.place(0, 300, -62, Math.PI);
  g.G.rig.yaw = 0; // face +z toward the shaft
  g.input.keys.add('KeyW');
  g.step(90);
  g.input.keys.delete('KeyW');
  g.step(30);
  return { pos: g.G.walker.pos.toArray(), carY: g.G.elevator.y };
});
check('lift door blocks the open shaft', r.pos[2] < -54.5 && Math.abs(r.pos[1] - 300) < 0.05, JSON.stringify(r));

// 6. Food.
await ev(() => {
  const g = window.__game;
  g.state.hunger = 30;
  g.doAction('food', { item: 'noodles' });
});
const credits0 = await ev(() => window.__game.state.credits);
await page.click('#panel .menu-item button');
r = await ev(() => ({ credits: window.__game.state.credits, hunger: window.__game.state.hunger }));
check('buy noodles', r.credits === credits0 - 14 && Math.abs(r.hunger - 75) < 1, JSON.stringify(r));
await page.keyboard.press('Escape');

// 7. Courier job.
await ev(() => window.__game.doAction('jobs'));
await page.click('#panel .menu-item button.primary');
r = await ev(() => ({ job: window.__game.state.job, panel: document.getElementById('panel').className }));
check('accept courier job', !!r.job && r.panel === 'panel', JSON.stringify(r.job && { dest: r.job.dest, pay: r.job.pay }));

// 8. Flight: board, climb, accelerate.
r = await ev(() => {
  const g = window.__game;
  g.G.walker.place(128, 300, 0, 0);
  g.G.speeder.park(132, 300, 0, Math.PI / 2);
  g.step(2);
  g.input.pressed.add('KeyF');
  g.step(1);
  const mode1 = g.mode;
  g.input.keys.add('Space');
  g.step(60);
  g.input.keys.delete('Space');
  const y1 = g.G.speeder.pos.y;
  g.input.keys.add('KeyW');
  g.step(90);
  g.input.keys.delete('KeyW');
  return { mode1, y1, speed: g.G.speeder.speed, pos: g.G.speeder.pos.toArray() };
});
check('board speeder', r.mode1 === 'fly', r.mode1);
check('climb with Space', r.y1 > 330, r.y1.toFixed(1));
check('accelerate with W', r.speed > 60, r.speed.toFixed(1));

// 9. Collisions: fly straight at the Spire, never end up inside it.
r = await ev(() => {
  const g = window.__game;
  const s = g.G.speeder;
  s.pos.set(200, 450, 0);
  s.yaw = -Math.PI / 2; // toward -x
  s.pitch = 0;
  s.speed = 120;
  s.vel.set(-120, 0, 0);
  g.input.keys.add('KeyW');
  let inside = false;
  for (let i = 0; i < 120; i++) {
    g.step(1);
    if (Math.abs(s.pos.x) < 40 && Math.abs(s.pos.z) < 40 && s.pos.y < 620) inside = true;
  }
  g.input.keys.delete('KeyW');
  return { inside, pos: s.pos.toArray() };
});
check('speeder cannot pass through the Spire', !r.inside && r.pos[0] > 40, JSON.stringify(r.pos));

// 10. Land on the job's destination deck and deliver.
r = await ev(() => {
  const g = window.__game;
  const job = g.state.job;
  const dest = g.G.city.decks.find((d) => d.name === job.dest);
  const s = g.G.speeder;
  s.pos.set(dest.x, dest.y + 4, dest.z);
  s.vel.set(0, 0, 0);
  s.speed = 0;
  g.step(2);
  g.input.pressed.add('KeyF');
  g.step(1);
  const landed = g.mode;
  const wy = g.G.walker.pos.y;
  return { landed, wy, deckY: dest.y, dest: job.dest };
});
check('land on rooftop deck', r.landed === 'walk' && Math.abs(r.wy - r.deckY) < 0.6, JSON.stringify(r));
const c1 = await ev(() => window.__game.state.credits);
await ev((dest) => window.__game.doAction('deck-terminal', { deck: dest }), r.dest);
r = await ev(() => ({ job: window.__game.state.job, credits: window.__game.state.credits, delivered: window.__game.state.stats.delivered }));
check('deliver at deck terminal pays', !r.job && r.credits > c1 && r.delivered === 1, JSON.stringify(r));
await page.keyboard.press('Escape');

// 11. Roulette.
await ev(() => window.__game.doAction('roulette'));
const w0 = await ev(() => window.__game.state.stats.wagered);
await page.click('#panel button.big');
await page.waitForTimeout(3500);
r = await ev(() => ({ wagered: window.__game.state.stats.wagered, result: document.querySelector('#panel .result')?.textContent }));
check('roulette spin resolves', r.wagered === w0 + 50 && /win|House/.test(r.result), JSON.stringify(r));
await page.keyboard.press('Escape');

// 12. Blackjack deal.
await ev(() => window.__game.doAction('blackjack'));
await page.click('#panel button.primary');
r = await ev(() => document.querySelectorAll('#panel .card').length);
check('twenty-one deals four cards', r >= 4, String(r));
await page.keyboard.press('Escape');

// 13. Skyrace: bet, run the race, get a result.
await ev(() => { const race = window.__game.G.race.race; race.phase = 'betting'; race.timer = 30; window.__game.doAction('races'); });
await page.click('#panel .racer button');
r = await ev(() => {
  const g = window.__game;
  const race = g.G.race.race;
  const bets = race.bets.length;
  race.timer = 0;
  for (let i = 0; i < 4000 && race.phase !== 'results'; i++) g.step(1, 1 / 20);
  return { bets, phase: race.phase, order: race.order.map((r) => r.name) };
});
check('skyrace runs to a result', r.bets === 1 && r.phase === 'results' && r.order.length === 6, JSON.stringify(r));
await page.keyboard.press('Escape');

// 14. Rent at 06:00.
r = await ev(() => {
  const g = window.__game;
  g.state.day = g.state.rentDueDay;
  g.state.minutes = 5 * 60 + 59;
  const c = g.state.credits;
  g.step(60);
  return { paid: c - g.state.credits, next: g.state.rentDueDay, day: g.state.day };
});
check('rent collected at 06:00', r.paid === 120 && r.next === r.day + 1, JSON.stringify(r));

// 15. Falling off respawns you.
r = await ev(async () => {
  const g = window.__game;
  if (g.mode === 'fly') g.setMode('walk');
  g.G.walker.place(135, 300, 0, 0);
  g.G.walker.lastSafe.set(135, 300, 0);
  g.G.walker.pos.x = 152; // past the pad's edge
  g.step(200);
  await new Promise((res) => setTimeout(res, 2500));
  return { pos: g.G.walker.pos.toArray() };
});
check('falling respawns on a platform', r.pos[1] >= 299.9, JSON.stringify(r));

// 16. Sleep.
r = await ev(async () => {
  const g = window.__game;
  g.state.energy = 40;
  g.state.minutes = 23 * 60;
  const day = g.state.day;
  g.doAction('sleep');
  await new Promise((res) => setTimeout(res, 1500));
  return { energy: g.state.energy, minutes: g.state.minutes, dayDelta: g.state.day - day };
});
check('sleep until morning', r.energy > 99 && Math.abs(r.minutes - 420) < 2 && r.dayDelta === 1, JSON.stringify(r));

// 17. Settings panel opens, and sensitivity scales mouse look.
await ev(() => window.__game.openSettings());
await page.fill('#set-sens', '2');
await page.dispatchEvent('#set-sens', 'input');
r = await ev(() => ({ sens: window.__game.input.sensitivity, panel: !!document.querySelector('#panel.open #set-invert') }));
check('settings change mouse sensitivity', r.sens === 2 && r.panel, JSON.stringify(r));
await page.keyboard.press('Escape');

// 18. Wayfinding: the map lists places, picking one sets a waypoint, and the
// guide sends you to the lift when the place is on another level.
r = await ev(() => {
  const g = window.__game;
  if (g.mode === 'fly') g.setMode('walk');
  g.G.walker.place(0, 440, -62, 0); // residences, by the lift
  g.openMap();
  return { places: document.querySelectorAll('#placelist .place').length };
});
await ev(() => [...document.querySelectorAll('#placelist .place')].find((e) => e.textContent.includes('Lucky Comet Casino')).click());
r = await ev(() => {
  const g = window.__game;
  const target = g.nav.target && g.nav.target.name;
  const mapHidden = document.getElementById('mapview').classList.contains('hidden');
  const step = g.guide().step;
  // Arrive at the casino.
  g.G.walker.place(62, 300, 78, 0);
  g.step(2);
  return { target, mapHidden, step, after: g.nav.target };
});
check('pick a place from the map', r.target === 'Lucky Comet Casino' && r.mapHidden, JSON.stringify(r.target));
check('guide sends you to the lift from another level', /lift/i.test(r.step || ''), r.step);
check('arriving clears the waypoint', r.after === null, String(r.after));
r = await ev(() => {
  const g = window.__game;
  g.nav.target = g.nav.places.find((p) => p.group === 'Rooftop decks');
  const step = g.guide().step;
  g.nav.target = null;
  return step;
});
check('guide sends you to your speeder for a far deck', /speeder|F to board/i.test(r || ''), r);

// 19. Calling the speeder: it comes to the pad nearest you, even from across the city.
r = await ev(() => {
  const g = window.__game;
  if (g.mode === 'fly') g.setMode('walk');
  const deck = g.G.city.decks[0];
  g.G.speeder.park(deck.x, deck.y, deck.z, 0); // stranded far away
  g.G.walker.place(70, 300, 0, 0); // on the promenade
  const c0 = g.state.credits;
  g.input.pressed.add('KeyV');
  g.step(1);
  g.step(30 * 20); // 20 s of game time
  const s = g.G.speeder;
  return { paid: c0 - g.state.credits, pos: s.pos.toArray().map((v) => Math.round(v)), parked: s.parked, visible: s.group.visible };
});
check('V brings the speeder to the nearest pad', Math.abs(r.pos[0] - 132) < 2 && Math.abs(r.pos[1] - 301) < 2 && r.parked && r.visible && r.paid === 10, JSON.stringify(r));

// 20. The story, start to finish through its conversations and world events.
const say = async (id, ...picks) => {
  await ev((id) => window.__game.doAction('person', { id }), id);
  // Click in the page: on a software renderer the panel's open animation can
  // outlast Playwright's wait for the element to stop moving.
  for (const p of picks) {
    const ok = await ev((p) => { const b = document.querySelector(`#panel .dialogue-choices button:nth-child(${p})`); if (b) b.click(); return !!b; }, p);
    if (!ok) throw new Error(`no choice ${p} talking to ${id}`);
  }
  if (await page.$('#panel.open')) await page.keyboard.press('Escape');
};
const at = () => ev(() => window.__game.story.current().id);
r = { steps: [] };
await ev(() => { const g = window.__game; if (g.mode === 'fly') g.setMode('walk'); g.state.story = undefined; g.state.credits = 2000; g.state.job = null; });
r.steps.push(await at());                                   // meet-nella
await say('nella', 1, 1);
r.steps.push(await at());                                   // first-job
await ev(() => window.__game.story.emit('delivered'));
r.steps.push(await at());                                   // report-nella
await say('nella', 1, 1);
r.steps.push(await at());                                   // deliver-case
await say('kess', 1, 1, 1);
r.steps.push(await at());                                   // see-brask
await say('brask', 1, 1);
r.steps.push(await at());                                   // see-zeela
await say('zeela', 1, 1);
r.steps.push(await at());                                   // buy-chip
await ev(() => { window.__game.doAction('chips'); document.querySelector('#panel .menu-item button').click(); });
r.steps.push(await at());                                   // zeela-decode
await say('zeela', 1, 1);
r.steps.push(await at());                                   // go-shelf
await ev(() => { const g = window.__game; const c = g.G.shelf.center; g.G.walker.place(c.x, c.y, c.z, 0); g.step(3); });
r.steps.push(await at());                                   // find-cache
await ev(() => window.__game.doAction('cache'));
r.steps.push(await at());                                   // collectors
await say('rusk', 1);                                       // pay them off
r.steps.push(await at());                                   // decide
await say('dale', 1);
r.steps.push(await at());                                   // epilogue
await say('nella', 1);
r.steps.push(await at());                                   // done
const ending = await ev(() => window.__game.story.flag('ending'));
check('story plays through to the end', r.steps.join(',') === 'meet-nella,first-job,report-nella,deliver-case,see-brask,see-zeela,buy-chip,zeela-decode,go-shelf,find-cache,collectors,decide,epilogue,done' && ending === 'dale', r.steps.join(','));
r = await ev(() => window.__game.story.storyState().log.length);
check('the journal records the story', r === 13, String(r));

// 21. A favour: noodles for Jessa.
await say('jessa', 1);
await ev(() => { window.__game.doAction('food', { item: 'noodles' }); document.querySelector('#panel .menu-item button').click(); });
await page.keyboard.press('Escape');
const c2 = await ev(() => window.__game.state.credits);
await say('jessa', 1);
r = await ev(() => ({ fav: window.__game.story.favorState('jessa'), credits: window.__game.state.credits }));
check('favour: bring Jessa noodles', r.fav === 'done' && r.credits === c2 + 60, JSON.stringify(r));

// 22. Gate Run: arm, fly the gates in order, finish.
r = await ev(() => {
  const g = window.__game;
  const gr = g.G.gaterun;
  gr.run.armed = true; gr.run.active = false; gr.run.next = 0;
  g.setMode('fly');
  const s = g.G.speeder;
  const gates = g.G.race.gates;
  const order = [...gates, gates[0]];
  for (const gate of order) { s.pos.copy(gate.pos); s.vel.set(0, 0, 0); s.speed = 0; g.step(15); }
  return { best: g.story.storyState().bestRun, active: gr.run.active };
});
check('gate run times a full lap', r.best > 0 && !r.active, JSON.stringify(r));

// 23. Trade: buy, carry, use, sell, and a profitable route exists somewhere.
await ev(() => { window.__game.doAction('shop', { shop: 'droid' }); });
r = await ev(() => ({ rows: document.querySelectorAll('#panel .trade-row').length, title: document.querySelector('#panel h2').textContent }));
check('a shop opens with goods for sale', r.rows >= 6 && r.title === 'Droid Parts', JSON.stringify(r));
await page.keyboard.press('Escape');
r = await ev(() => {
  const g = window.__game, t = g.trade;
  g.state.credits = 5000;
  g.state.inventory = {};
  const p = t.buyPrice('droid', 'powercell');
  const c0 = g.state.credits;
  const err = t.buy('droid', 'powercell', 5);
  const afterBuy = { err, paid: c0 - g.state.credits, expect: p * 5, have: g.state.inventory.powercell };
  // Cargo hold limit.
  g.state.inventory.ration = t.capacity() - t.cargoCount();
  const full = t.buy('droid', 'powercell', 1);
  g.state.inventory.ration = 1;
  const hunger0 = g.state.hunger = 50;
  const used = t.useItem('ration');
  // Sell to a deck that wants tech; refuse at one that does not buy it.
  const decks = g.G.city.decks.map((d) => d.name);
  const techDeck = decks.find((n) => t.shopDef('deck:' + n).wants === 'tech');
  const sold = t.sell('deck:' + techDeck, 'powercell', 5);
  const refused = t.sellPrice('emporium', 'fabric');
  // Is there an item bought somewhere and sold elsewhere for more today?
  const shops = [...t.SHOP_IDS, ...decks.map((n) => 'deck:' + n)];
  let best = 0;
  for (const a of shops) for (const id of t.shopDef(a).sells) for (const b of shops) {
    const gain = t.sellPrice(b, id) - t.buyPrice(a, id);
    if (gain > best) best = gain;
  }
  return { afterBuy, full, used, hungerUp: g.state.hunger - hunger0, sold, left: g.state.inventory.powercell || 0, refused, best };
});
check('buy goods into the cargo hold', !r.afterBuy.err && r.afterBuy.paid === r.afterBuy.expect && r.afterBuy.have === 5, JSON.stringify(r.afterBuy));
check('the cargo hold has a limit', /full/.test(r.full || ''), r.full);
check('use a ration bar from cargo', /ration/i.test(r.used || '') && r.hungerUp === 20, JSON.stringify({ used: r.used, up: r.hungerUp }));
check('sell cargo to a deck trader; others refuse what they do not want', !r.sold && r.left === 0 && r.refused === 0, JSON.stringify(r));
check('a profitable trade route exists today', r.best > 20, String(r.best));
r = await ev(() => {
  const g = window.__game, t = g.trade;
  g.state.inventory = { turbo: 1 };
  const msg = t.useItem('turbo');
  g.step(1);
  return { msg, bonus: g.G.speeder.bonus };
});
check('install a turbo injector on the speeder', /Installed/.test(r.msg) && r.bonus === 12, JSON.stringify(r));

// 24. Deliveries: every deck is a kind of place, and its cargo suits it.
r = await ev(() => {
  const g = window.__game;
  const decks = g.nav.places.filter((p) => p.group === 'Rooftop decks');
  const labels = new Set(decks.map((p) => p.hint.split(' · ')[1]));
  const offers = g.jobs.makeOffers('Courier Guild');
  const kinds = offers.map((o) => o.kind);
  const fixer = g.jobs.makeOffers('fixer');
  return { decks: decks.length, labels: labels.size, kinds, fixer: fixer.map((o) => o.kind), fixerPay: Math.min(...fixer.map((o) => o.pay)), parcelPay: offers[0].pay };
});
check('every deck is a themed place', r.decks === 30 && r.labels === 10, JSON.stringify(r));
check('the Guild offers express, freight, passenger and route jobs', ['parcel', 'express', 'freight', 'passenger', 'route'].every((k) => r.kinds.includes(k)), r.kinds.join(','));
check('the fixer offers contraband that pays more than parcels', r.fixer.every((k) => k === 'smuggle') && r.fixerPay > r.parcelPay, JSON.stringify(r));

// 25. A route: several stops, paid as you go.
r = await ev(() => {
  const g = window.__game;
  g.state.job = null;
  const o = g.jobs.makeOffers('Courier Guild').find((x) => x.kind === 'route');
  g.jobs.acceptJob(o);
  const c0 = g.state.credits, d0 = g.state.stats.delivered;
  const seen = [];
  for (let k = 0; k < o.stops.length; k++) {
    seen.push(g.state.job.dest);
    g.doAction('deck-terminal', { deck: g.state.job.dest });
    document.getElementById('panel').querySelector('.close')?.click();
  }
  return { stops: o.stops.length, seen, done: !g.state.job, paid: g.state.credits - c0, delivered: g.state.stats.delivered - d0 };
});
check('a route takes three stops in order and pays', r.stops === 3 && new Set(r.seen).size === 3 && r.done && r.paid > 0 && r.delivered === 1, JSON.stringify(r));

// 26. Heavy freight slows the speeder; a passenger tips for a smooth ride.
r = await ev(() => {
  const g = window.__game;
  g.state.job = null;
  g.jobs.acceptJob(g.jobs.makeOffers('Courier Guild').find((x) => x.kind === 'freight'));
  g.step(1);
  const load = g.G.speeder.load;
  g.state.job = null;
  g.step(1);
  const unloaded = g.G.speeder.load;
  // Two identical passenger runs, one smooth and one bumpy.
  const o = g.jobs.makeOffers('Courier Guild').find((x) => x.kind === 'passenger');
  const run = (bumps) => {
    g.jobs.acceptJob(JSON.parse(JSON.stringify(o)));
    for (let i = 0; i < bumps; i++) g.bump(20);
    const c0 = g.state.credits;
    g.doAction('deck-terminal', { deck: g.state.job.dest });
    document.getElementById('panel').querySelector('.close')?.click();
    return g.state.credits - c0;
  };
  const smooth = run(0), bumpy = run(4);
  return { load, unloaded, smooth, bumpy, base: o.stops[0].pay };
});
check('heavy freight slows the speeder', r.load === 0.7 && r.unloaded === 1, JSON.stringify(r));
check('passengers tip for a smooth ride, not a bumpy one', r.smooth > r.bumpy * 1.3 && r.bumpy <= Math.round(r.base * 1.25), JSON.stringify(r));

// 27. Smuggling: a patrol scans you, chases you, and pulls you over.
const patrolNear = async (secs) => ev((n) => {
  const g = window.__game;
  const s = g.G.speeder;
  const cop = g.G.flyers.flyers.find((f) => f.kind === 'police' && !f.chase) || g.G.flyers.flyers.find((f) => f.kind === 'police');
  for (let i = 0; i < n; i++) {
    s.pos.set(-1020, 320, -1020); s.vel.set(0, 0, 0); s.speed = 0;
    if (!g.police.wanted) cop.pos.set(-1020, 320, -1000);
    g.step(1);
    if (document.querySelector('#panel h2')?.textContent === 'Spire Security') break;
  }
  return { wanted: g.police.wanted, stopped: g.police.stopped, title: document.querySelector('#panel h2')?.textContent };
}, secs * 30);
r = await ev(() => {
  const g = window.__game;
  g.state.job = null;
  g.state.credits = 3000;
  if (g.mode !== 'fly') g.setMode('fly');
  g.jobs.acceptJob(g.jobs.makeOffers('fixer')[0]);
  return g.state.job.contraband;
});
r = await patrolNear(12);
check('a patrol scans contraband and pulls you over', r.wanted && r.stopped && r.title === 'Spire Security', JSON.stringify(r));
const c3 = await ev(() => window.__game.state.credits);
await ev(() => document.querySelector('#panel .dialogue-choices button').click());
r = await ev(() => ({ job: window.__game.state.job, credits: window.__game.state.credits, busted: window.__game.state.stats.busted, wanted: window.__game.police.wanted }));
check('submitting to a search costs the cargo and a fine', !r.job && r.credits < c3 && r.busted === 1 && !r.wanted, JSON.stringify(r));
r = await ev(() => {
  const g = window.__game;
  g.police.cool = 0;
  g.jobs.acceptJob(g.jobs.makeOffers('fixer')[0]);
  const s = g.G.speeder;
  const cop = g.G.flyers.flyers.find((f) => f.kind === 'police');
  let wanted = false;
  for (let i = 0; i < 300 && !g.police.wanted; i++) { s.pos.set(-1020, 320, -1020); s.vel.set(0, 0, 0); cop.pos.set(-1020, 320, -990); g.step(1); }
  wanted = g.police.wanted;
  // Dive under the clouds and hold there.
  for (let i = 0; i < 300 && g.police.wanted; i++) { s.pos.set(-1020, 80, -1020); s.vel.set(0, 0, 0); s.speed = 0; g.step(1); }
  return { wanted, after: g.police.wanted, stopped: g.police.stopped, job: !!g.state.job, copY: cop.pos.y };
});
check('diving under the clouds loses the patrol and keeps the cargo', r.wanted && !r.after && !r.stopped && r.job && r.copY > 110, JSON.stringify(r));
r = await ev(() => {
  const g = window.__game;
  const dest = g.state.job.dest;
  const c0 = g.state.credits;
  if (dest === 'Undercity Shelf') g.G.people.talkTo('sable', () => {});
  else g.doAction('deck-terminal', { deck: dest });
  const btn = [...document.querySelectorAll('#panel button')].find((b) => /Hand it over/.test(b.textContent));
  btn?.click();
  const paid = g.state.credits - c0;
  document.getElementById('panel').querySelector('.close')?.click();
  return { dest, paid, job: g.state.job, smuggled: g.state.stats.smuggled };
});
check('a smuggling run pays out on delivery', !r.job && r.paid > 300 && r.smuggled === 1, JSON.stringify(r));
r = await ev(() => {
  const g = window.__game;
  g.G.people.talkTo('sable', () => {});
  const btn = [...document.querySelectorAll('#panel button')].find((b) => /Show me the work/.test(b.textContent));
  btn?.click();
  const out = { title: document.querySelector('#panel h2')?.textContent, offers: document.querySelectorAll('#panel .job-offer').length };
  document.getElementById('panel').querySelector('.close')?.click();
  return out;
});
check('Sable the fixer offers smuggling runs', r.title === 'Sable · Smuggling runs' && r.offers === 3, JSON.stringify(r));

// 28. Spire Security comes when called: honk at a patrol, ram one, and the
// chase grows the longer it runs.
r = await ev(() => {
  const g = window.__game;
  g.state.job = null;
  g.state.inventory = {};
  g.police.cool = 0;
  if (g.mode !== 'fly') g.setMode('fly');
  const s = g.G.speeder;
  const cop = g.G.flyers.flyers.find((f) => f.kind === 'police' && !f.chase);
  s.pos.set(-1020, 320, -1020); s.vel.set(0, 0, 0); s.speed = 0;
  cop.pos.set(-1020, 320, -960);
  g.step(1);
  const taunted = g.crime('taunt');
  const one = { wanted: g.police.wanted, stars: g.police.stars, pursuers: g.police.pursuers.length };
  g.police.chaseTime = 31;
  s.pos.set(-1020, 320, -1020);
  g.step(1);
  const two = { stars: g.police.stars, pursuers: g.police.pursuers.length };
  g.clearHeat();
  // Ram a patrol.
  const cop2 = g.G.flyers.flyers.find((f) => f.kind === 'police' && !f.chase);
  g.police.cool = 0; g.police.ramCool = 0;
  s.pos.set(-1020, 320, -1020); s.speed = 60; s.vel.set(0, 0, 0);
  // The patrol moves a few metres a frame, so start it right on top of you.
  const pos = s.pos.clone();
  for (let i = 0; i < 2; i++) { s.pos.copy(pos); s.speed = 60; cop2.pos.copy(pos); g.step(1); }
  const rammed = { wanted: g.police.wanted, stars: g.police.stars, reason: g.police.reason };
  g.clearHeat();
  return { taunted, one, two, rammed };
});
check('honking at a patrol starts a chase', r.taunted && r.one.wanted && r.one.stars === 1 && r.one.pursuers === 1, JSON.stringify(r.one));
check('a long chase raises the wanted level and brings more patrols', r.two.stars === 2 && r.two.pursuers === 2, JSON.stringify(r.two));
check('ramming a patrol makes you wanted at two stars', r.rammed.wanted && r.rammed.stars >= 2, JSON.stringify(r.rammed));

// 29. Inside buildings: a deck's lift leads down into its venue and back out;
// dress codes are enforced.
r = await ev(() => {
  const g = window.__game;
  // Land on the East Pad first.
  if (g.mode === 'fly') { g.G.speeder.pos.set(132, 301, 0); g.G.speeder.vel.set(0, 0, 0); g.G.speeder.speed = 0; g.step(1); g.setMode('walk'); }
  const it = g.interactables.find((i) => i.action === 'enter' && i.data.interior === 'club');
  g.G.walker.place(it.pos.x, it.pos.y, it.pos.z, 0);
  g.state.credits = 5000;
  g.state.wardrobe = undefined;
  g.dress();
  g.doAction('enter', it.data);
  return it.data;
});
await page.waitForTimeout(1600);
let inside = await ev(() => ({ inside: window.__game.state.inside && window.__game.state.inside.id, y: window.__game.G.walker.pos.y, credits: window.__game.state.credits, near: window.__game.nearest() && window.__game.nearest().action }));
check('a deck lift takes you inside its venue (cover charge paid)', inside.inside === 'club' && inside.y < -700 && inside.credits === 4980, JSON.stringify(inside));
await ev(() => window.__game.doAction('leave'));
await page.waitForTimeout(1600);
r = await ev((back) => ({ inside: window.__game.state.inside, pos: window.__game.G.walker.pos.toArray(), back }), r.back);
check('leaving puts you back on the deck', !r.inside && Math.abs(r.pos[1] - r.back[1]) < 0.6 && Math.hypot(r.pos[0] - r.back[0], r.pos[2] - r.back[2]) < 1, JSON.stringify(r));
r = await ev(() => {
  const g = window.__game;
  const it = g.interactables.find((i) => i.action === 'enter' && i.data.interior === 'noble');
  g.doAction('enter', it.data);
  return it.data.venue;
});
await page.waitForTimeout(1600);
r = await ev(() => ({ inside: window.__game.state.inside }));
check('the noble salon turns away a courier jacket', !r.inside, JSON.stringify(r));

// 30. Clothes change how you play: runner suit, jump pack.
r = await ev(() => {
  const g = window.__game;
  g.state.credits = 20000;
  g.doAction('boutique');
  const buy = (name) => { const row = [...document.querySelectorAll('#panel .menu-item')].find((m) => m.textContent.includes(name)); row.querySelector('button').click(); };
  buy('Runner suit');
  buy('Jump pack');
  document.querySelector('#panel .close').click();
  const w = g.G.walker;
  const ab = { ...w.abilities };
  // Jump and hold Space: the pack carries you higher than a plain jump.
  w.place(60, 300, 20, 0);
  g.step(5);
  g.input.pressed.add('Space'); g.input.keys.add('Space');
  let top = 0;
  for (let i = 0; i < 60; i++) { g.step(1); top = Math.max(top, w.pos.y - 300); }
  g.input.keys.delete('Space');
  g.step(60);
  return { ab, top, outfit: g.state.wardrobe.outfit, gear: g.state.wardrobe.gear, credits: g.state.credits };
});
check('the boutique sells clothes that change what you can do', r.ab.runner && r.ab.jet && r.outfit === 'runner' && r.gear === 'jetpack' && r.credits === 20000 - 420 - 2400, JSON.stringify(r));
check('a jump pack lifts you far above a normal jump', r.top > 4, String(r.top.toFixed(2)));

// 31. Homes: buy one, rent stops; the hideout shakes off a chase.
r = await ev(() => {
  const g = window.__game;
  g.state.credits = 5000;
  g.state.noRent = false;
  const err = g.homes.buy('hideout');
  const c0 = g.state.credits;
  g.state.minutes = 5 * 60 + 59; g.state.rentDueDay = g.state.day;
  g.step(30);
  const rentTaken = c0 - g.state.credits;
  // Wanted, then reach the hideout.
  const hide = g.nav.places.find((p) => p.name === 'Undercity Hideout').pos;
  if (g.mode !== 'fly') g.setMode('fly');
  g.G.speeder.pos.set(-1020, 320, -1020);
  const cop = g.G.flyers.flyers.find((f) => f.kind === 'police' && !f.chase);
  cop.pos.set(-1020, 320, -990);
  g.police.cool = 0;
  g.crime('taunt');
  const wanted = g.police.wanted;
  g.G.speeder.pos.set(hide.x, hide.y + 6, hide.z);
  g.G.speeder.vel.set(0, 0, 0);
  g.step(2);
  return { err, rentTaken, owns: g.state.homes, wanted, after: g.police.wanted };
});
check('buying a home ends the rent', !r.err && r.owns.includes('hideout') && r.rentTaken === 0, JSON.stringify(r));
check('reaching your hideout loses the police', r.wanted && !r.after, JSON.stringify(r));

// 32. More speeders, and what they carry.
r = await ev(() => {
  const g = window.__game;
  const t = g.trade;
  g.state.speeder = 'hauler';
  const hauler = t.capacity();
  g.state.speeder = 'skimmer';
  const skimmer = t.capacity();
  g.state.speeder = 'courier';
  return { hauler, skimmer, courier: t.capacity() };
});
check('speeders carry different amounts of cargo', r.hauler === 90 && r.skimmer === 10 && r.courier === 30, JSON.stringify(r));

// 33. Games: poker hands score right; slicer grids can always be solved.
r = await ev(() => {
  const g = window.__game;
  const H = (s) => s.split(' ').map((c) => ({ r: c.slice(0, -1), s: c.slice(-1) }));
  const hands = {
    royal: g.games.scoreHand(H('10♠ J♠ Q♠ K♠ A♠')), full: g.games.scoreHand(H('3♠ 3♥ 3♦ 9♣ 9♠')),
    wheel: g.games.scoreHand(H('A♠ 2♥ 3♦ 4♣ 5♠')), jacks: g.games.scoreHand(H('J♠ J♥ 3♦ 4♣ 9♠')),
    low: g.games.scoreHand(H('5♠ 5♥ 3♦ 4♣ 9♠')),
  };
  let solvable = true;
  for (let i = 0; i < 50; i++) {
    const p = g.games.makeGrid();
    p.path.forEach(([r2, c], k) => { if (p.grid[r2][c] !== p.target[k]) solvable = false; if (k === 0 && r2 !== 0) solvable = false; if (k > 0 && (k % 2 === 1 ? c !== p.path[k - 1][1] : r2 !== p.path[k - 1][0])) solvable = false; });
  }
  return { hands: Object.fromEntries(Object.entries(hands).map(([k, v]) => [k, v && v[0]])), solvable };
});
check('holo poker scores hands', r.hands.royal === 'Royal flush' && r.hands.full === 'Full house' && r.hands.wheel === 'Straight' && r.hands.jacks === 'Jacks or better' && !r.hands.low, JSON.stringify(r.hands));
check('every slicer grid can be solved', r.solvable, '');
r = await ev(() => {
  const g = window.__game;
  g.state.credits = 1000;
  g.doAction('poker', { stakes: 'low' });
  document.querySelector('#panel button.big').click();
  const cards = document.querySelectorAll('#panel .cards.poker .card:not(.back)').length;
  document.querySelector('#panel button.big').click();
  const result = document.querySelector('#panel .result').textContent;
  document.querySelector('#panel .close').click();
  g.doAction('arcade');
  const canvas = !!document.querySelector('#panel canvas.arcade');
  document.querySelector('#panel .close').click();
  return { cards, result, canvas };
});
check('a hand of holo poker deals, draws and pays out', r.cards === 5 && /win|house/i.test(r.result), JSON.stringify(r));
check('the Skylane Dodger cabinet opens', r.canvas, '');

// 28. Auto quality steps down when frames are slow (a software renderer is).
// Its own page, without ?low, so it starts at high.
{
  await page.close();
  const p2 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await p2.goto(`${url}/?nolock&autostart`, { waitUntil: 'commit', timeout: 120000 });
  await p2.waitForFunction(() => window.__game, null, { timeout: 240000 });
  const before = await p2.evaluate(() => window.__game.quality);
  await p2.waitForFunction(() => window.__game.quality !== 'high', null, { timeout: 60000 }).catch(() => {});
  const after = await p2.evaluate(() => window.__game.quality);
  check('auto quality lowers settings on a slow renderer', before === 'high' && after !== 'high', `${before} -> ${after}`);
  await p2.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('ERRORS:\n' + errors.slice(0, 10).join('\n'));
await browser.close();
process.exit(fail ? 1 : 0);
