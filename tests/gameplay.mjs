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

// 18. Auto quality steps down when frames are slow (a software renderer is).
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
