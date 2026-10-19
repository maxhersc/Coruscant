import { state, addCredits } from '../systems/state.js';
import { openPanel, closePanel, h } from '../ui/panel.js';

// Games you play in the city's back rooms: Holo Poker, a dance-off, the
// Skylane Dodger arcade cabinet, slicing a security grid, and an eating
// contest. Each opens a panel; ctx is { sfx, toast } plus anything noted.

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const pay = (n, why) => { if (n) addCredits(n, why); };

// ------------------------------------------------------------- Holo Poker
// Jacks or better, five-card draw against the pay table.
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUITS = ['♠', '♥', '♦', '♣'];
const TABLE = [
  ['Royal flush', 250], ['Straight flush', 50], ['Four of a kind', 25], ['Full house', 9], ['Flush', 6],
  ['Straight', 4], ['Three of a kind', 3], ['Two pair', 2], ['Jacks or better', 1],
];

export function scoreHand(cards) {
  const v = cards.map((c) => RANKS.indexOf(c.r)).sort((a, b) => a - b);
  const flush = cards.every((c) => c.s === cards[0].s);
  const wheel = v.join() === '0,1,2,3,12';
  const straight = wheel || v.every((x, i) => i === 0 || x === v[i - 1] + 1);
  const counts = Object.values(v.reduce((m, x) => ((m[x] = (m[x] || 0) + 1), m), {})).sort((a, b) => b - a);
  if (straight && flush && v[0] === 8) return TABLE[0];
  if (straight && flush) return TABLE[1];
  if (counts[0] === 4) return TABLE[2];
  if (counts[0] === 3 && counts[1] === 2) return TABLE[3];
  if (flush) return TABLE[4];
  if (straight) return TABLE[5];
  if (counts[0] === 3) return TABLE[6];
  if (counts[0] === 2 && counts[1] === 2) return TABLE[7];
  if (counts[0] === 2) {
    const pair = v.find((x, i) => v.indexOf(x) !== i);
    if (pair >= 9) return TABLE[8];
  }
  return null;
}

export function openPoker(ctx, { title = 'Holo Poker', kicker = 'Jacks or better', bets = [10, 25, 50, 100] } = {}) {
  openPanel(title, (body) => {
    let bet = bets[0], deck = [], hand = [], held = [false, false, false, false, false], phase = 'bet';
    const shuffle = () => {
      deck = [];
      for (const s of SUITS) for (const r of RANKS) deck.push({ r, s });
      deck.sort(() => Math.random() - 0.5);
    };
    const msg = h('div.result', {}, 'Place a bet and deal. Hold the cards you want to keep, then draw.');
    const cardsRow = h('div.cards.poker');
    const controls = h('div.row.wrap');
    const table = h('div.muted.small', {}, TABLE.map(([n, m]) => `${n} ${m}×`).join(' · '));
    const render = () => {
      cardsRow.replaceChildren(...(hand.length ? hand : Array(5).fill(null)).map((c, i) => {
        if (!c) return h('div.card.back');
        const el = h(`div.card${c.s === '♥' || c.s === '♦' ? '.red' : ''}${held[i] ? '.held' : ''}`, {
          onclick: () => { if (phase !== 'draw') return; held[i] = !held[i]; ctx.sfx('card'); render(); },
        }, `${c.r}${c.s}`);
        return el;
      }));
      controls.replaceChildren(
        ...bets.map((b) => h('button.btn' + (b === bet ? '.primary' : ''), { disabled: phase === 'draw' ? 'true' : undefined, onclick: () => { bet = b; render(); } }, `${b} cr`)),
        h('button.btn.primary.big', { onclick: phase === 'draw' ? draw : deal }, phase === 'draw' ? 'Draw' : 'Deal'));
    };
    const deal = () => {
      if (state.credits < bet) { msg.textContent = 'Not enough credits.'; ctx.sfx('lose'); return; }
      addCredits(-bet, `${title} bet`);
      state.stats.wagered += bet;
      shuffle();
      hand = deck.splice(0, 5);
      held = [false, false, false, false, false];
      phase = 'draw';
      msg.textContent = 'Click cards to hold them, then draw.';
      ctx.sfx('card');
      render();
    };
    const draw = () => {
      hand = hand.map((c, i) => (held[i] ? c : deck.shift()));
      phase = 'bet';
      const win = scoreHand(hand);
      if (win) {
        const amount = bet * win[1];
        pay(amount, `${title}: ${win[0]}`);
        state.stats.won += amount;
        msg.replaceChildren(h('b.good', {}, `${win[0]}! You win ${amount} cr.`));
        ctx.sfx(win[1] >= 9 ? 'win' : 'coin');
      } else {
        msg.textContent = 'Nothing. The house thanks you.';
        ctx.sfx('lose');
      }
      held = [false, false, false, false, false];
      render();
    };
    body.append(msg, cardsRow, controls, table);
    render();
  }, { kicker });
}

// ---------------------------------------------------------------- Dance-off
// Arrows fall in four lanes; hit the matching arrow key as each crosses the
// line. 20 seconds, then the crowd decides what you earned.
const LANES = [['ArrowLeft', '←'], ['ArrowDown', '↓'], ['ArrowUp', '↑'], ['ArrowRight', '→']];
export function openDance(ctx, { fee = 20, bonus = 1 } = {}) {
  openPanel('Dance-off', (body) => {
    const stage = h('div.dance');
    const line = h('div.dance-line');
    const scoreEl = h('div.dance-score', {}, '');
    const msg = h('div.result', {}, `Entry ${fee} cr. Hit the arrow keys as the arrows cross the line. The crowd pays for style.`);
    LANES.forEach(([, g], i) => stage.append(h('div.dance-lane', { style: `left:${i * 25}%` }, h('span.dance-target', {}, g))));
    stage.append(line, scoreEl);
    const start = h('button.btn.primary.big', { onclick: () => begin() }, `Dance (${fee} cr)`);
    body.append(msg, stage, start);
    let notes = [], t = 0, raf = 0, last = 0, hits = 0, perfect = 0, total = 0, running = false, streak = 0;
    const window_ = 0.13 * bonus;
    const LEN = 20, FALL = 1.6;
    const begin = () => {
      if (running) return;
      if (state.credits < fee) { msg.textContent = 'Not enough credits.'; ctx.sfx('lose'); return; }
      addCredits(-fee, 'Dance-off entry');
      notes.forEach((n) => n.el.remove());
      notes = [];
      // A beat every 0.4 s, sometimes doubled, sometimes resting.
      for (let b = 1.2; b < LEN; b += 0.4) {
        if (Math.random() < 0.18) continue;
        const lane = Math.floor(Math.random() * 4);
        notes.push({ t: b, lane, done: false, el: null });
        if (Math.random() < 0.12 && b > 4) notes.push({ t: b, lane: (lane + 2) % 4, done: false, el: null });
      }
      for (const n of notes) {
        n.el = h('div.dance-note', { style: `left:${n.lane * 25}%` }, LANES[n.lane][1]);
        stage.append(n.el);
      }
      total = notes.length;
      hits = perfect = streak = 0;
      t = 0;
      running = true;
      start.disabled = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      for (const n of notes) {
        const y = (1 - (n.t - t) / FALL) * 80; // % from top; the line is at 80%
        n.el.style.top = `${y}%`;
        n.el.style.opacity = y < -10 || n.done ? 0 : 1;
        if (!n.done && t - n.t > window_) { n.done = true; streak = 0; n.el.classList.add('miss'); }
      }
      scoreEl.textContent = `${hits}/${total}${streak > 4 ? ` · streak ${streak}` : ''}`;
      if (t > LEN + 0.5) return finish();
      raf = requestAnimationFrame(tick);
    };
    const onKey = (e) => {
      const lane = LANES.findIndex(([k]) => k === e.code);
      if (lane < 0 || !running) return;
      e.preventDefault();
      const n = notes.find((q) => !q.done && q.lane === lane && Math.abs(q.t - t) < window_);
      const tgt = stage.querySelectorAll('.dance-target')[lane];
      tgt.classList.remove('hit');
      void tgt.offsetWidth;
      tgt.classList.add('hit');
      if (n) {
        n.done = true;
        hits++;
        streak++;
        if (Math.abs(n.t - t) < window_ * 0.4) perfect++;
        n.el.classList.add('good');
        ctx.sfx('click');
      } else streak = 0;
    };
    const finish = () => {
      running = false;
      start.disabled = false;
      const acc = total ? (hits + perfect * 0.25) / total : 0;
      const prize = acc > 0.95 ? 160 : acc > 0.8 ? 90 : acc > 0.65 ? 45 : acc > 0.5 ? 20 : 0;
      pay(prize, 'Dance-off prize');
      state.stats.danceBest = Math.max(state.stats.danceBest || 0, Math.round(acc * 100));
      msg.replaceChildren(h('b', { class: prize ? 'good' : '' }, prize ? `The crowd loves you: ${Math.round(acc * 100)}%. +${prize} cr.` : `${Math.round(acc * 100)}%. The crowd goes back to its drinks.`));
      ctx.sfx(prize ? 'win' : 'lose');
    };
    addEventListener('keydown', onKey);
    return () => { removeEventListener('keydown', onKey); cancelAnimationFrame(raf); };
  }, { kicker: 'On the dance floor', wide: true });
}

// ------------------------------------------------------------ Skylane Dodger
// The arcade cabinet: weave a speeder up a skylane between the traffic and
// grab credit chips. Every 10 points is a credit.
export function openDodger(ctx, { fee = 5 } = {}) {
  openPanel('Skylane Dodger', (body) => {
    const cv = h('canvas.arcade', { width: '420', height: '420' });
    const msg = h('div.result', {}, `${fee} cr a play. A/D or ←/→ to steer. Grab the gold chips, miss everything else.`);
    const start = h('button.btn.primary.big', { onclick: () => begin() }, `Insert ${fee} cr`);
    body.append(msg, cv, start);
    const g = cv.getContext('2d');
    let raf = 0, last = 0, running = false;
    let x = 210, cars = [], chips = [], score = 0, speed = 160, spawn = 0, t = 0, pts = 0, bonus = 0;
    const keys = new Set();
    const begin = () => {
      if (running) return;
      if (state.credits < fee) { msg.textContent = 'Not enough credits.'; ctx.sfx('lose'); return; }
      addCredits(-fee, 'Skylane Dodger');
      x = 210; cars = []; chips = []; score = 0; speed = 160; spawn = 0; t = 0; pts = 0; bonus = 0;
      running = true;
      start.disabled = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const draw = () => {
      g.fillStyle = '#05070c';
      g.fillRect(0, 0, 420, 420);
      for (let i = 0; i < 4; i++) {
        g.strokeStyle = 'rgba(127,234,255,0.25)';
        g.setLineDash([18, 22]);
        g.lineDashOffset = -t * speed;
        g.beginPath(); g.moveTo(84 * (i + 1), 0); g.lineTo(84 * (i + 1), 420); g.stroke();
      }
      g.setLineDash([]);
      for (const c of chips) { g.fillStyle = '#ffc266'; g.beginPath(); g.arc(c.x, c.y, 9, 0, 7); g.fill(); }
      for (const c of cars) {
        g.fillStyle = c.col;
        g.fillRect(c.x - 16, c.y - 26, 32, 52);
        g.fillStyle = '#ffeecc';
        g.fillRect(c.x - 12, c.y + 22, 8, 4); g.fillRect(c.x + 4, c.y + 22, 8, 4);
      }
      g.fillStyle = '#ff8833';
      g.beginPath(); g.moveTo(x, 360); g.lineTo(x - 16, 398); g.lineTo(x + 16, 398); g.closePath(); g.fill();
      g.fillStyle = '#7feaff';
      g.font = 'bold 18px system-ui';
      g.fillText(`${score}`, 12, 26);
    };
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      speed += dt * 9;
      const dir = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
      x = Math.max(18, Math.min(402, x + dir * 300 * dt));
      spawn -= dt;
      if (spawn <= 0) {
        spawn = Math.max(0.28, 0.9 - t * 0.012);
        cars.push({ x: 42 + Math.floor(Math.random() * 5) * 84, y: -30, col: pick(['#4a6aa8', '#a83a2a', '#d8d8d0', '#3a8a5a', '#8a4aa8']), v: 0.8 + Math.random() * 0.5 });
        if (Math.random() < 0.45) chips.push({ x: 42 + Math.floor(Math.random() * 5) * 84, y: -20 });
      }
      for (const c of cars) c.y += speed * c.v * dt;
      for (const c of chips) c.y += speed * dt;
      pts += (dt * speed) / 16;
      chips = chips.filter((c) => {
        if (Math.abs(c.x - x) < 22 && Math.abs(c.y - 380) < 22) { bonus += 25; ctx.sfx('coin'); return false; }
        return c.y < 440;
      });
      cars = cars.filter((c) => c.y < 460);
      score = Math.floor(pts) + bonus;
      draw();
      if (cars.some((c) => Math.abs(c.x - x) < 26 && Math.abs(c.y - 378) < 40)) return finish();
      raf = requestAnimationFrame(tick);
    };
    const finish = () => {
      running = false;
      start.disabled = false;
      const prize = Math.floor(score / 10);
      pay(prize, 'Skylane Dodger winnings');
      const best = Math.max(state.stats.dodgerBest || 0, score);
      const record = best > (state.stats.dodgerBest || 0);
      state.stats.dodgerBest = best;
      msg.replaceChildren(h('b', { class: prize ? 'good' : '' }, `Crash! ${score} points${record ? ' · new high score' : ` · best ${best}`}.${prize ? ` The machine pays ${prize} cr.` : ''}`));
      ctx.sfx('bump');
    };
    const down = (e) => { if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) { keys.add(e.code); e.preventDefault(); } };
    const up = (e) => keys.delete(e.code);
    addEventListener('keydown', down);
    addEventListener('keyup', up);
    draw();
    return () => { removeEventListener('keydown', down); removeEventListener('keyup', up); cancelAnimationFrame(raf); };
  }, { kicker: 'Arcade cabinet' });
}

// ------------------------------------------------------------------- Slicer
// Breach a security grid: pick the target codes in order, each pick on the
// same row (1st, 3rd...) or column (2nd, 4th...) as the one before.
// onWin(): what a clean slice gets you. reward: shown on the button.
export function makeGrid(n = 5, len = 4) {
  const codes = ['1C', '55', 'BD', 'E9', '7A', 'FF', '3F'];
  const grid = Array.from({ length: n }, () => Array.from({ length: n }, () => pick(codes)));
  // A path that is always solvable: alternate row moves and column moves.
  const path = [];
  let r = 0, c = Math.floor(Math.random() * n);
  for (let i = 0; i < len; i++) {
    if (i % 2 === 0) { // pick in row r
      let nc;
      do nc = Math.floor(Math.random() * n); while (path.some(([pr, pc]) => pr === r && pc === nc));
      c = nc;
    } else {
      let nr;
      do nr = Math.floor(Math.random() * n); while (path.some(([pr, pc]) => pr === nr && pc === c));
      r = nr;
    }
    path.push([r, c]);
  }
  const target = path.map(([pr, pc]) => grid[pr][pc]);
  return { grid, target, path };
}

export function openSlicer(ctx, { title = 'Slicer terminal', fee = 30, reward = '200 cr of paydata', onWin, time = 30 } = {}) {
  openPanel(title, (body) => {
    const msg = h('div.result', {}, `Fee ${fee} cr. Pick the target codes in order. Start anywhere on the top row; then alternate: same column, same row, same column...`);
    const targetEl = h('div.slice-target');
    const gridEl = h('div.slice-grid');
    const timer = h('div.slice-timer');
    const start = h('button.btn.primary.big', { onclick: () => begin() }, `Slice (${fee} cr) · win ${reward}`);
    body.append(msg, timer, targetEl, gridEl, start);
    let puzzle = null, chosen = [], left = 0, iv = 0, running = false, axis = 'row', at = [0, -1];
    const render = () => {
      targetEl.replaceChildren(...(puzzle ? puzzle.target : []).map((c, i) => h('span' + (i < chosen.length ? '.done' : ''), {}, c)));
      gridEl.replaceChildren(...(puzzle ? puzzle.grid : []).flatMap((row, r) => row.map((code, c) => {
        const used = chosen.some(([pr, pc]) => pr === r && pc === c);
        const live = running && !used && (axis === 'row' ? r === at[0] : c === at[1]);
        return h('button.slice-cell' + (used ? '.used' : '') + (live ? '.live' : ''), { onclick: () => choose(r, c) }, code);
      })));
    };
    const begin = () => {
      if (running) return;
      if (state.credits < fee) { msg.textContent = 'Not enough credits.'; ctx.sfx('lose'); return; }
      addCredits(-fee, 'Slicer rig rental');
      puzzle = makeGrid();
      chosen = []; axis = 'row'; at = [0, -1];
      running = true;
      start.disabled = true;
      left = time;
      clearInterval(iv);
      iv = setInterval(() => {
        left -= 0.1;
        timer.textContent = `${left.toFixed(1)} s`;
        if (left <= 0) end(false, 'Trace complete. The grid locked you out.');
      }, 100);
      render();
    };
    const choose = (r, c) => {
      if (!running) return;
      if (axis === 'row' ? r !== at[0] : c !== at[1]) return;
      if (chosen.some(([pr, pc]) => pr === r && pc === c)) return;
      const code = puzzle.grid[r][c];
      if (code !== puzzle.target[chosen.length]) { end(false, `Wrong code (${code}). The grid slams shut.`); return; }
      chosen.push([r, c]);
      at = [r, c];
      axis = axis === 'row' ? 'col' : 'row';
      ctx.sfx('click');
      if (chosen.length === puzzle.target.length) end(true);
      else render();
    };
    const end = (won, why) => {
      running = false;
      start.disabled = false;
      clearInterval(iv);
      if (won) {
        const text = onWin ? onWin() : null;
        msg.replaceChildren(h('b.good', {}, text || 'Clean slice.'));
        ctx.sfx('win');
      } else {
        msg.replaceChildren(h('b', {}, why));
        ctx.sfx('lose');
      }
      render();
    };
    return () => clearInterval(iv);
  }, { kicker: 'Data exchange back room' });
}

// ------------------------------------------------------------ Eating contest
// Mash Space faster than Big Oro eats. Ten seconds.
export function openEatOff(ctx, { fee = 25, prize = 110 } = {}) {
  openPanel('Eating contest', (body) => {
    const msg = h('div.result', {}, `Entry ${fee} cr, first to finish the platter wins ${prize} cr. Mash Space (or click) to eat.`);
    const you = h('i'), oro = h('i');
    const bars = h('div', {},
      h('div.need', {}, h('span', {}, 'You'), h('div.bar', {}, you)),
      h('div.need', {}, h('span', {}, 'Big Oro'), h('div.bar.rival', {}, oro)));
    const mash = h('button.btn.primary.big', { onclick: () => bite() }, 'Start eating');
    body.append(msg, bars, mash);
    let a = 0, b = 0, running = false, iv = 0, t = 0;
    const draw = () => { you.style.width = `${Math.min(100, a)}%`; oro.style.width = `${Math.min(100, b)}%`; };
    const begin = () => {
      if (state.credits < fee) { msg.textContent = 'Not enough credits.'; ctx.sfx('lose'); return false; }
      addCredits(-fee, 'Eating contest entry');
      a = b = t = 0;
      running = true;
      mash.textContent = 'EAT!';
      const pace = 8.5 + Math.random() * 2.5;
      iv = setInterval(() => {
        t += 0.1;
        b += pace * 0.1 * (0.7 + Math.random() * 0.6);
        draw();
        if (b >= 100 || t >= 10) end();
      }, 100);
      return true;
    };
    const bite = () => {
      if (!running) { begin(); return; }
      a += 1.6;
      draw();
      if (a >= 100) end();
    };
    const end = () => {
      running = false;
      clearInterval(iv);
      mash.textContent = 'Go again';
      state.hunger = Math.min(100, state.hunger + 50);
      if (a >= 100 && a >= b) {
        pay(prize, 'Eating contest prize');
        msg.replaceChildren(h('b.good', {}, `You clean the platter first! +${prize} cr, and you are very full.`));
        ctx.sfx('win');
      } else {
        msg.replaceChildren(h('b', {}, 'Big Oro wins again. He pats your shoulder kindly. You are very full.'));
        ctx.sfx('lose');
      }
    };
    const onKey = (e) => { if (e.code === 'Space') { e.preventDefault(); if (running) bite(); } };
    addEventListener('keydown', onKey);
    return () => { removeEventListener('keydown', onKey); clearInterval(iv); };
  }, { kicker: 'Food court challenge' });
}

export { closePanel };
