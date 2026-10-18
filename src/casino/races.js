import * as THREE from 'three';
import { buildSpeederMesh } from '../player/speeder.js';
import { glowMat } from '../world/env.js';
import { state, addCredits } from '../systems/state.js';
import { openPanel, h, betPicker } from '../ui/panel.js';

// Skyrace: six pilots fly three laps of the streets around the hub. Bets are
// taken at the Lucky Comet's booth; the race runs live in the sky, so you can
// watch it from the promenade or chase it in your own speeder.

const PILOTS = [
  { name: 'Ryn Vasko', color: 0xd8a441, accent: 0xffcc55 },
  { name: 'Talla Moonrise', color: 0x5a2f9f, accent: 0xbb77ff },
  { name: 'Kade Sorel', color: 0x1f7a4a, accent: 0x55ff99 },
  { name: 'Ixi Venn', color: 0xc02a3a, accent: 0xff5566 },
  { name: 'Bolt-9', color: 0xc0c4c8, accent: 0x66ddff },
  { name: 'Mara Quell', color: 0x2a5ad8, accent: 0x55aaff },
  { name: 'Jeth Arkon', color: 0x8a5a2a, accent: 0xffaa55 },
  { name: 'Old Pellam', color: 0x4a4a52, accent: 0xff7733 },
];
const LAPS = 3;
const BETTING_TIME = 150; // real seconds between races
const RESULTS_TIME = 25;

export function createSkyrace(scene, raceBoard, sfx, toast) {
  const R = 180, alt = 262;
  const pts = [
    [R, alt, -R], [R, alt - 18, 0], [R, alt, R], [0, alt + 22, R], [-R, alt, R], [-R, alt - 14, 0], [-R, alt, -R], [0, alt + 10, -R],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const length = curve.getLength();

  // Holo gates along the course. Each has its own material so the Gate Run
  // can light the next one.
  const gates = [];
  for (let i = 0; i < 12; i++) {
    const u = i / 12;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const mat = glowMat(0x33ddff, 2.5);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(16, 0.35, 6, 40), mat);
    ring.position.copy(p);
    ring.lookAt(p.clone().add(t));
    scene.add(ring);
    gates.push({ mesh: ring, pos: p.clone(), base: mat.color.clone() });
  }

  const trailMat = glowMat(0xffffff, 2);
  const racers = PILOTS.map((p) => {
    const built = buildSpeederMesh('sport', { color: p.color, accent: p.accent });
    const trail = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 1), glowMat(p.accent, 3));
    trail.position.z = -2.5;
    built.group.add(trail);
    built.group.visible = false;
    scene.add(built.group);
    return { ...p, group: built.group, trail, u: 0, v: 1, skill: 1, odds: 2, finished: false, place: 0 };
  });
  void trailMat;

  // Board.
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (raceBoard) {
    raceBoard.material.map = tex;
    raceBoard.material.needsUpdate = true;
  }

  const race = {
    phase: 'betting',
    timer: 45,          // the first race starts soon after you arrive
    field: [],
    bets: [],
    order: [],
    curve,
    length,
    racers,
    number: 1,
  };

  const setupField = () => {
    const pool = [...racers].sort(() => Math.random() - 0.5).slice(0, 6);
    for (const r of racers) r.group.visible = false;
    for (const r of pool) r.skill = 0.9 + Math.random() * 0.12;
    const mean = pool.reduce((s, r) => s + r.skill, 0) / pool.length;
    const w = pool.map((r) => Math.exp((r.skill - mean) * 55));
    const sum = w.reduce((a, b) => a + b, 0);
    pool.forEach((r, i) => {
      const p = w[i] / sum;
      r.odds = Math.max(1.4, Math.round((0.85 / p) * 10) / 10);
      r.u = -i * 0.004;
      r.v = 0;
      r.finished = false;
      r.place = 0;
      r.noise = 0;
    });
    race.field = pool;
    race.bets = [];
    race.order = [];
  };
  setupField();

  const drawBoard = () => {
    const g = canvas.getContext('2d');
    g.fillStyle = '#020a12';
    g.fillRect(0, 0, 512, 256);
    g.strokeStyle = '#33ddff';
    g.lineWidth = 4;
    g.strokeRect(4, 4, 504, 248);
    g.fillStyle = '#7feaff';
    g.font = '700 30px Arial Narrow, Arial, sans-serif';
    g.textAlign = 'left';
    let head = `SKYRACE #${race.number}`;
    if (race.phase === 'betting') head += `  ·  START ${Math.ceil(race.timer)}s`;
    if (race.phase === 'racing') head += '  ·  LIVE';
    if (race.phase === 'results') head += '  ·  RESULT';
    g.fillText(head, 18, 40);
    g.font = '600 22px Arial Narrow, Arial, sans-serif';
    const list = race.phase === 'betting' ? race.field : [...race.field].sort((a, b) => (a.place || 99) - (b.place || 99) || b.u - a.u);
    list.forEach((r, i) => {
      const y = 76 + i * 29;
      g.fillStyle = '#' + r.accent.toString(16).padStart(6, '0');
      g.fillRect(18, y - 16, 10, 18);
      g.fillStyle = '#e8f6ff';
      const pos = race.phase === 'betting' ? '' : `${i + 1}. `;
      g.fillText(`${pos}${r.name}`, 38, y);
      g.textAlign = 'right';
      g.fillStyle = '#ffd166';
      g.fillText(race.phase === 'racing' ? `lap ${Math.min(LAPS, Math.floor(Math.max(0, r.u)) + 1)}` : `${r.odds.toFixed(1)}×`, 494, y);
      g.textAlign = 'left';
    });
    tex.needsUpdate = true;
  };

  let boardTimer = 0;
  const tmpP = new THREE.Vector3(), tmpT = new THREE.Vector3(), side = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  const placeRacer = (r, i, t) => {
    const u = ((r.u % 1) + 1) % 1;
    curve.getPointAt(u, tmpP);
    curve.getTangentAt(u, tmpT);
    side.crossVectors(tmpT, UP).normalize();
    const lane = (i - 2.5) * 3.2;
    tmpP.addScaledVector(side, lane + Math.sin(t * 0.9 + i) * 1.5);
    tmpP.y += Math.sin(t * 1.3 + i * 2) * 1.2;
    r.group.position.copy(tmpP);
    r.group.lookAt(tmpP.clone().add(tmpT));
    r.group.rotateZ(Math.sin(t * 1.1 + i) * 0.15);
    r.trail.scale.z = 4 + r.v * 0.12;
    r.trail.position.z = -2.2 - r.trail.scale.z / 2;
  };

  const update = (dt, t, playerNear) => {
    race.timer -= dt;
    boardTimer -= dt;
    if (race.phase === 'betting') {
      race.field.forEach((r, i) => { r.group.visible = true; r.u = -i * 0.004; r.v = 0; placeRacer(r, i, t); });
      if (race.timer <= 0) {
        race.phase = 'racing';
        if (race.bets.length || playerNear) {
          toast(`Skyrace #${race.number} is off! Watch the streets around the Spire.`, 'race');
          sfx('horn');
        }
      }
    } else if (race.phase === 'racing') {
      let done = 0;
      race.field.forEach((r, i) => {
        if (!r.finished) {
          r.noise += (Math.random() - 0.5) * dt * 0.5;
          r.noise *= 1 - dt * 0.4;
          const target = 118 * r.skill * (1 + r.noise);
          r.v += (target - r.v) * Math.min(1, dt * 0.8);
          r.u += (r.v * dt) / length;
          if (r.u >= LAPS) {
            r.finished = true;
            race.order.push(r);
            r.place = race.order.length;
          }
        } else {
          r.u += (r.v * 0.5 * dt) / length;
          r.v *= 1 - dt * 0.5;
        }
        placeRacer(r, i, t);
        if (r.finished) done++;
      });
      if (done === race.field.length) {
        race.phase = 'results';
        race.timer = RESULTS_TIME;
        state.stats.races += 1;
        const winner = race.order[0];
        let paid = 0;
        for (const b of race.bets) {
          if (b.racer === winner) {
            const amount = Math.round(b.amount * b.odds);
            addCredits(amount, `Skyrace · ${winner.name}`);
            state.stats.won += amount;
            paid += amount;
          }
        }
        if (race.bets.length) {
          if (paid > 0) { toast(`${winner.name} wins Skyrace #${race.number}! You collect ${paid} cr.`, 'win', 6000); sfx('win'); }
          else { toast(`${winner.name} wins Skyrace #${race.number}. Your pilot didn't.`, 'race', 6000); sfx('lose'); }
        } else if (playerNear) toast(`${winner.name} takes Skyrace #${race.number}.`, 'race');
      }
    } else if (race.phase === 'results') {
      race.field.forEach((r, i) => placeRacer(r, i, t));
      if (race.timer <= 0) {
        race.number += 1;
        race.phase = 'betting';
        race.timer = BETTING_TIME;
        setupField();
      }
    }
    if (boardTimer <= 0) {
      boardTimer = 0.5;
      drawBoard();
    }
  };

  const openBetting = () => {
    openPanel(`Skyrace #${race.number}`, (body) => {
      const bet = betPicker(() => state.credits, 50);
      const status = h('div.result');
      const list = h('div.racers');
      const yourBets = h('div.muted');
      // Rows are built once; refresh only updates text and button state, so a
      // button is never replaced under the cursor.
      const buttons = [];
      list.replaceChildren(...race.field.map((r) => {
        const btn = h('button.btn', {
          onclick: () => {
            const amount = bet.get();
            if (race.phase !== 'betting') return;
            if (amount > state.credits || amount <= 0) { status.textContent = 'Not enough credits.'; return; }
            addCredits(-amount, `Skyrace bet · ${r.name}`);
            state.stats.wagered += amount;
            race.bets.push({ racer: r, amount, odds: r.odds });
            sfx('click');
            refresh();
          },
        }, 'Bet');
        buttons.push(btn);
        return h('div.racer', {},
          h('span.swatch', { style: `background:#${r.accent.toString(16).padStart(6, '0')}` }),
          h('span.rname', {}, r.name),
          h('span.odds', {}, `${r.odds.toFixed(1)}×`),
          btn);
      }));
      const raceNo = race.number;
      const refresh = () => {
        if (race.number !== raceNo) status.textContent = 'This race is over. Close and reopen the booth for the next one.';
        else if (race.phase === 'betting') status.textContent = `Betting open. Race starts in ${Math.ceil(race.timer)}s. Three laps of the streets around the Spire.`;
        else if (race.phase === 'racing') status.textContent = 'Race in progress. Betting is closed.';
        else status.textContent = `Finished. Winner: ${race.order[0]?.name}. Next race opens shortly.`;
        yourBets.textContent = race.bets.length ? 'Your bets: ' + race.bets.map((b) => `${b.amount} cr on ${b.racer.name} @ ${b.odds}×`).join(', ') : 'No bets placed on this race.';
        for (const b of buttons) b.disabled = race.phase !== 'betting' || race.number !== raceNo;
      };
      refresh();
      const iv = setInterval(refresh, 1000);
      body.append(h('p.muted', {}, 'Odds include your stake. Racers with lower odds are the favourites, but anything can happen on the skylanes.'), bet.el, status, list, yourBets);
      return () => clearInterval(iv);
    }, { kicker: 'Lucky Comet · Skyrace booth', onClose: () => {} });
  };

  const tickerText = () => {
    if (race.phase !== 'racing') return null;
    const sorted = [...race.field].sort((a, b) => (a.place || 99) - (b.place || 99) || b.u - a.u);
    const lap = Math.min(LAPS, Math.floor(Math.max(0, sorted[0].u)) + 1);
    return `SKYRACE #${race.number} · LAP ${lap}/${LAPS} · ` + sorted.slice(0, 3).map((r, i) => `${i + 1}. ${r.name}`).join('  ');
  };

  return { race, update, openBetting, tickerText, gates, courseLength: length };
}
