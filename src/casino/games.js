import { state, addCredits } from '../systems/state.js';
import { openPanel, h, betPicker } from '../ui/panel.js';

// Table games. All bets are in-game credits only.

const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const credits = () => state.credits;

function wager(n) {
  if (n <= 0 || n > state.credits) return false;
  addCredits(-n, 'Bet');
  state.stats.wagered += n;
  return true;
}

function win(n, label) {
  if (n <= 0) return;
  addCredits(n, label);
  state.stats.won += n;
}

// ---------------------------------------------------------------- Roulette
export function openRoulette(sfx, spinWheel) {
  openPanel('Roulette', (body) => {
    const bet = betPicker(credits, 50);
    let choice = { kind: 'red', label: 'Red' };
    const result = h('div.result', {}, 'Place a bet and spin.');
    const history = h('div.history');
    const sel = h('div.selected', {}, 'Betting on: Red (pays 2×)');
    const choose = (kind, label, pays, extra) => {
      choice = { kind, label, ...extra };
      sel.textContent = `Betting on: ${label} (pays ${pays}×)`;
      sfx('click');
    };
    const grid = h('div.roulette-grid');
    grid.append(h('button.btn.num.green', { onclick: () => choose('num', '0', 36, { n: 0 }) }, '0'));
    for (let n = 1; n <= 36; n++) {
      grid.append(h(`button.btn.num.${REDS.has(n) ? 'red' : 'black'}`, { onclick: () => choose('num', String(n), 36, { n }) }, String(n)));
    }
    const outside = h('div.row.wrap',
      {},
      h('button.btn.red', { onclick: () => choose('red', 'Red', 2) }, 'Red'),
      h('button.btn.black', { onclick: () => choose('black', 'Black', 2) }, 'Black'),
      h('button.btn', { onclick: () => choose('even', 'Even', 2) }, 'Even'),
      h('button.btn', { onclick: () => choose('odd', 'Odd', 2) }, 'Odd'),
      h('button.btn', { onclick: () => choose('low', '1–18', 2) }, '1–18'),
      h('button.btn', { onclick: () => choose('high', '19–36', 2) }, '19–36'),
      h('button.btn', { onclick: () => choose('dozen', '1st 12', 3, { d: 0 }) }, '1st 12'),
      h('button.btn', { onclick: () => choose('dozen', '2nd 12', 3, { d: 1 }) }, '2nd 12'),
      h('button.btn', { onclick: () => choose('dozen', '3rd 12', 3, { d: 2 }) }, '3rd 12')
    );
    let spinning = false;
    const spinBtn = h('button.btn.primary.big', {
      onclick: () => {
        if (spinning) return;
        const amount = bet.get();
        if (!wager(amount)) { result.textContent = 'Not enough credits.'; return; }
        spinning = true;
        spinBtn.disabled = true;
        sfx('spin');
        const n = Math.floor(Math.random() * 37);
        spinWheel?.(n);
        let ticks = 0;
        const iv = setInterval(() => {
          const r = Math.floor(Math.random() * 37);
          result.innerHTML = `<span class="ball ${r === 0 ? 'green' : REDS.has(r) ? 'red' : 'black'}">${r}</span>`;
          if (++ticks > 22) {
            clearInterval(iv);
            const color = n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black';
            const c = choice;
            const hit =
              (c.kind === 'num' && c.n === n) ||
              (n !== 0 && ((c.kind === 'red' && color === 'red') || (c.kind === 'black' && color === 'black') ||
                (c.kind === 'even' && n % 2 === 0) || (c.kind === 'odd' && n % 2 === 1) ||
                (c.kind === 'low' && n <= 18) || (c.kind === 'high' && n >= 19) ||
                (c.kind === 'dozen' && Math.floor((n - 1) / 12) === c.d)));
            const mult = c.kind === 'num' ? 36 : c.kind === 'dozen' ? 3 : 2;
            if (hit) {
              win(amount * mult, 'Roulette win');
              sfx('win');
            } else sfx('lose');
            result.innerHTML = `<span class="ball ${color}">${n}</span> ${hit ? `<b class="good">You win ${amount * mult} cr!</b>` : `<span class="bad">House wins.</span>`}`;
            history.prepend(h(`span.ball.small.${color}`, {}, String(n)));
            while (history.children.length > 12) history.lastChild.remove();
            spinning = false;
            spinBtn.disabled = false;
            bet.refresh();
          }
        }, 80 + ticks * 4);
      },
    }, 'Spin');
    body.append(
      h('p.muted', {}, 'European wheel, single zero. Straight numbers pay 36×, dozens 3×, even-money bets 2× (all including your stake).'),
      bet.el, sel, outside, grid,
      h('div.row', {}, spinBtn, result),
      h('div.row', {}, h('span.label', {}, 'Last spins'), history)
    );
  }, { kicker: 'Lucky Comet Casino', wide: true });
}

// ---------------------------------------------------------------- Twenty-one
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function newShoe() {
  const cards = [];
  for (let d = 0; d < 4; d++) for (const s of SUITS) for (const r of RANKS) cards.push({ r, s });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function handValue(hand) {
  let v = 0, aces = 0;
  for (const c of hand) {
    if (c.r === 'A') { v += 11; aces++; } else if ('JQK'.includes(c.r)) v += 10; else v += +c.r;
  }
  while (v > 21 && aces) { v -= 10; aces--; }
  return v;
}

export function openBlackjack(sfx) {
  let shoe = newShoe();
  const draw = () => { if (shoe.length < 30) shoe = newShoe(); return shoe.pop(); };
  openPanel('Twenty-One', (body) => {
    const bet = betPicker(credits, 50);
    const dealerEl = h('div.hand');
    const playerEl = h('div.hand');
    const dealerVal = h('span.hv');
    const playerVal = h('span.hv');
    const msg = h('div.result', {}, 'Dealer stands on 17. Blackjack pays 3:2.');
    let player = [], dealer = [], stake = 0, live = false, hideHole = true;

    const cardEl = (c, hidden) => h(`div.card${hidden ? '.back' : ''}${!hidden && (c.s === '♥' || c.s === '♦') ? '.red' : ''}`, {}, hidden ? '' : `${c.r}${c.s}`);
    const render = () => {
      dealerEl.replaceChildren(...dealer.map((c, i) => cardEl(c, live && hideHole && i === 1)));
      playerEl.replaceChildren(...player.map((c) => cardEl(c, false)));
      playerVal.textContent = player.length ? String(handValue(player)) : '';
      dealerVal.textContent = dealer.length ? (live && hideHole ? '?' : String(handValue(dealer))) : '';
      dealBtn.disabled = live;
      hitBtn.disabled = standBtn.disabled = !live;
      dblBtn.disabled = !live || player.length !== 2 || state.credits < stake;
    };
    const finish = (text, payout) => {
      live = false;
      hideHole = false;
      if (payout > 0) { win(payout, 'Twenty-one'); sfx(payout > stake ? 'win' : 'click'); } else sfx('lose');
      msg.innerHTML = text;
      render();
      bet.refresh();
    };
    const dealerPlay = () => {
      hideHole = false;
      while (handValue(dealer) < 17) dealer.push(draw());
      const p = handValue(player), d = handValue(dealer);
      if (d > 21) finish(`<b class="good">Dealer busts with ${d}. You win ${stake * 2} cr.</b>`, stake * 2);
      else if (p > d) finish(`<b class="good">${p} beats ${d}. You win ${stake * 2} cr.</b>`, stake * 2);
      else if (p === d) finish(`Push at ${p}. Stake returned.`, stake);
      else finish(`<span class="bad">Dealer ${d} beats your ${p}.</span>`, 0);
    };
    const dealBtn = h('button.btn.primary', {
      onclick: () => {
        const amount = bet.get();
        if (!wager(amount)) { msg.textContent = 'Not enough credits.'; return; }
        stake = amount;
        player = [draw(), draw()];
        dealer = [draw(), draw()];
        live = true;
        hideHole = true;
        sfx('card');
        msg.textContent = 'Hit or stand?';
        if (handValue(player) === 21) {
          hideHole = false;
          if (handValue(dealer) === 21) finish('Both blackjack. Push.', stake);
          else finish(`<b class="good">Blackjack! You win ${Math.floor(stake * 2.5)} cr.</b>`, Math.floor(stake * 2.5));
          return;
        }
        render();
      },
    }, 'Deal');
    const hitBtn = h('button.btn', {
      onclick: () => {
        player.push(draw());
        sfx('card');
        if (handValue(player) > 21) finish(`<span class="bad">Bust with ${handValue(player)}.</span>`, 0);
        else if (handValue(player) === 21) dealerPlay();
        else render();
      },
    }, 'Hit');
    const standBtn = h('button.btn', { onclick: () => dealerPlay() }, 'Stand');
    const dblBtn = h('button.btn', {
      onclick: () => {
        if (!wager(stake)) return;
        stake *= 2;
        player.push(draw());
        sfx('card');
        if (handValue(player) > 21) finish(`<span class="bad">Bust with ${handValue(player)}.</span>`, 0);
        else dealerPlay();
      },
    }, 'Double');
    body.append(
      bet.el,
      h('div.table-felt', {},
        h('div.hand-row', {}, h('span.label', {}, 'Dealer droid '), dealerVal, dealerEl),
        h('div.hand-row', {}, h('span.label', {}, 'You '), playerVal, playerEl)
      ),
      h('div.row', {}, dealBtn, hitBtn, standBtn, dblBtn),
      msg
    );
    render();
  }, { kicker: 'Lucky Comet Casino' });
}

// ---------------------------------------------------------------- Slots
const SYMBOLS = ['7', '◆', '★', '☾', '✦', '⬢'];
export function openSlots(sfx) {
  openPanel('Comet Slots', (body) => {
    const bet = betPicker(credits, 10);
    const reels = [0, 1, 2].map(() => h('div.reel', {}, '★'));
    const msg = h('div.result', {}, 'Three 7s pay 50×. Three ◆ pay 20×. Any other triple pays 10×. A pair returns your stake.');
    let busy = false;
    const pull = h('button.btn.primary.big', {
      onclick: () => {
        if (busy) return;
        const amount = bet.get();
        if (!wager(amount)) { msg.textContent = 'Not enough credits.'; return; }
        busy = true;
        pull.disabled = true;
        sfx('spin');
        const final = [0, 1, 2].map(() => Math.floor(Math.random() * SYMBOLS.length));
        let t = 0;
        const iv = setInterval(() => {
          t++;
          reels.forEach((r, i) => {
            if (t < 10 + i * 6) r.textContent = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
            else r.textContent = SYMBOLS[final[i]];
          });
          if (t >= 22) {
            clearInterval(iv);
            const [a, b, c] = final;
            let mult = 0;
            if (a === b && b === c) mult = a === 0 ? 50 : a === 1 ? 20 : 10;
            else if (a === b || b === c || a === c) mult = 1;
            if (mult > 1) { win(amount * mult, 'Slots jackpot'); sfx('win'); msg.innerHTML = `<b class="good">${SYMBOLS[a]} ${SYMBOLS[b]} ${SYMBOLS[c]} — you win ${amount * mult} cr!</b>`; }
            else if (mult === 1) { win(amount, 'Slots'); sfx('click'); msg.textContent = 'A pair. Stake returned.'; }
            else { sfx('lose'); msg.innerHTML = '<span class="bad">Nothing. The machine hums smugly.</span>'; }
            busy = false;
            pull.disabled = false;
            bet.refresh();
          }
        }, 70);
      },
    }, 'Pull');
    body.append(bet.el, h('div.reels', {}, ...reels), h('div.row', {}, pull), msg);
  }, { kicker: 'Lucky Comet Casino' });
}

// ---------------------------------------------------------------- Chance Cubes (dice)
const PIPS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
export function openDice(sfx) {
  openPanel('Chance Cubes', (body) => {
    const bet = betPicker(credits, 20);
    const dice = [h('div.die', {}, '⚂'), h('div.die', {}, '⚃')];
    const msg = h('div.result', {}, 'A grizzled dealer rattles two cubes in a cup. "Pick your fate, flyboy."');
    let busy = false;
    const roll = (kind) => {
      if (busy) return;
      const amount = bet.get();
      if (!wager(amount)) { msg.textContent = 'Not enough credits.'; return; }
      busy = true;
      sfx('dice');
      const a = 1 + Math.floor(Math.random() * 6), b = 1 + Math.floor(Math.random() * 6);
      let t = 0;
      const iv = setInterval(() => {
        dice[0].textContent = PIPS[Math.floor(Math.random() * 6)];
        dice[1].textContent = PIPS[Math.floor(Math.random() * 6)];
        if (++t > 12) {
          clearInterval(iv);
          dice[0].textContent = PIPS[a - 1];
          dice[1].textContent = PIPS[b - 1];
          const sum = a + b;
          const hit = (kind === 'high' && sum >= 8) || (kind === 'low' && sum <= 6) || (kind === 'seven' && sum === 7) || (kind === 'doubles' && a === b);
          const mult = kind === 'high' || kind === 'low' ? 2 : 5;
          if (hit) { win(amount * mult, 'Chance Cubes'); sfx('win'); msg.innerHTML = `<b class="good">${sum}! You take ${amount * mult} cr.</b>`; }
          else { sfx('lose'); msg.innerHTML = `<span class="bad">${sum}. The dealer grins and sweeps your chips.</span>`; }
          busy = false;
          bet.refresh();
        }
      }, 60);
    };
    body.append(
      bet.el,
      h('div.reels', {}, ...dice),
      h('div.row.wrap', {},
        h('button.btn', { onclick: () => roll('low') }, 'Low 2–6 (2×)'),
        h('button.btn', { onclick: () => roll('high') }, 'High 8–12 (2×)'),
        h('button.btn', { onclick: () => roll('seven') }, 'Lucky 7 (5×)'),
        h('button.btn', { onclick: () => roll('doubles') }, 'Doubles (5×)')
      ),
      msg
    );
  }, { kicker: 'The Low Orbit · back table' });
}
