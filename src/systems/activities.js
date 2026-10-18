import { state, addCredits, totalMinutes } from './state.js';
import { openPanel, closePanel, h } from '../ui/panel.js';
import { SPEEDER_MODELS } from '../player/speeder.js';
import { makeOffers, acceptJob, deliver, abandonJob, GUILD, minutesLeft } from './jobs.js';
import { saveGame, clearSave } from './save.js';

// Shops, terminals and services: every interaction that opens a panel.

const MENUS = {
  noodles: { title: 'Orbital Noodles', kicker: 'Skyline Food Court', items: [['Noodle bowl', 14, 45, 0], ['Spicy noodle bowl', 18, 55, 4], ['Broth to go', 6, 15, 2]] },
  dumplings: { title: 'Spice & Steam', kicker: 'Skyline Food Court', items: [['Steamed dumplings', 22, 65, 0], ['Glazed buns', 10, 25, 0], ['Spiced tea', 5, 4, 10]] },
  caf: { title: 'Caf Station', kicker: 'Skyline Food Court', items: [['Caf, black', 8, 2, 18], ['Caf with sweetcream', 10, 6, 18], ['Triple-shot caf', 16, 2, 40]] },
  ale: { title: 'The Low Orbit', kicker: 'Bar', items: [['Low Orbit ale', 12, 8, 6], ['Cantina stew', 18, 55, 0], ['Glowing blue thing', 30, 4, 30]] },
  fruit: { title: 'Sky Fruit', kicker: 'Galleria Market', items: [['Sky fruit', 6, 18, 2], ['Fruit basket', 20, 55, 6]] },
  skewers: { title: 'Grill House', kicker: 'Galleria Market', items: [['Grilled skewers', 16, 45, 0], ['Mystery meat platter', 24, 75, -5]] },
  snack: { title: 'Vending machine', kicker: 'Rooftop deck', items: [['Ration bar', 5, 20, 0], ['Caf can', 4, 0, 10]] },
};

export function openFood(item, ctx) {
  const menu = MENUS[item];
  if (!menu) return;
  openPanel(menu.title, (body) => {
    const msg = h('div.result', {}, `Hunger ${Math.round(state.hunger)} · Energy ${Math.round(state.energy)}`);
    const list = h('div.menu');
    for (const [name, price, food, energy] of menu.items) {
      list.append(h('div.menu-item', {},
        h('div', {}, h('b', {}, name), h('div.muted', {}, [food ? `+${food} hunger` : '', energy ? `${energy > 0 ? '+' : ''}${energy} energy` : ''].filter(Boolean).join(' · '))),
        h('button.btn', {
          onclick: () => {
            if (state.credits < price) { msg.textContent = 'Not enough credits.'; ctx.sfx('lose'); return; }
            addCredits(-price, name);
            state.hunger = Math.min(100, state.hunger + food);
            state.energy = Math.max(0, Math.min(100, state.energy + energy));
            ctx.sfx('coin');
            msg.textContent = `You enjoy the ${name.toLowerCase()}. Hunger ${Math.round(state.hunger)} · Energy ${Math.round(state.energy)}`;
          },
        }, `${price} cr`)
      ));
    }
    body.append(list, msg);
  }, { kicker: menu.kicker });
}

export function openDealer(ctx) {
  openPanel('Jump Station Speeders', (body) => {
    const render = () => {
      body.replaceChildren(h('p.muted', {}, 'Trade up your ride. Your new speeder is delivered to wherever you parked the old one.'));
      for (const [id, m] of Object.entries(SPEEDER_MODELS)) {
        const owned = state.owned.includes(id);
        const active = state.speeder === id;
        body.append(h('div.menu-item', {},
          h('div', {},
            h('b', {}, m.name), ' ',
            h('span.muted', {}, `${Math.round(m.maxSpeed * 3.6)} km/h · boost ${Math.round(m.boost * 3.6)} km/h`),
            h('div.muted', {}, m.blurb)),
          active ? h('span.tag', {}, 'Flying this') :
            owned ? h('button.btn', { onclick: () => { state.speeder = id; ctx.setSpeederModel(id); ctx.sfx('click'); render(); } }, 'Switch') :
              h('button.btn.primary', {
                onclick: () => {
                  if (state.credits < m.price) { ctx.toast(`You need ${m.price - state.credits} more credits.`, 'bad'); ctx.sfx('lose'); return; }
                  addCredits(-m.price, `Bought ${m.name}`);
                  state.owned.push(id);
                  state.speeder = id;
                  ctx.setSpeederModel(id);
                  ctx.sfx('win');
                  ctx.toast(`The ${m.name} is yours. It's waiting where you parked.`, 'win');
                  render();
                },
              }, `${m.price.toLocaleString()} cr`)
        ));
      }
    };
    render();
  }, { kicker: 'Spire Promenade' });
}

export function openLoan(ctx) {
  openPanel("Vool's Credit", (body) => {
    const render = () => {
      body.replaceChildren();
      if (state.loan) {
        const due = state.loan.dueDay;
        body.append(
          h('p', {}, `"You owe me ${state.loan.owed} credits by midday on day ${due}. I'd hate for something to happen to that pretty speeder."`),
          h('button.btn.primary', {
            onclick: () => {
              if (state.credits < state.loan.owed) { ctx.toast('Vool snorts. "Come back when you have it all."', 'bad'); ctx.sfx('lose'); return; }
              addCredits(-state.loan.owed, "Repaid Vool's Credit");
              state.loan = null;
              ctx.sfx('coin');
              ctx.toast('Debt cleared. Vool looks almost disappointed.', 'win');
              render();
            },
          }, `Repay ${state.loan.owed} cr`)
        );
        return;
      }
      body.append(h('p', {}, '"Credits, fast. No questions, small print, big consequences." Loans are repaid by midday on the due day, or Vool\'s collectors come looking.'));
      for (const [amount, owed, days] of [[500, 650, 2], [2000, 2700, 3], [5000, 7000, 4]]) {
        body.append(h('div.menu-item', {},
          h('div', {}, h('b', {}, `Borrow ${amount.toLocaleString()} cr`), h('div.muted', {}, `Repay ${owed.toLocaleString()} cr within ${days} days`)),
          h('button.btn', {
            onclick: () => {
              state.loan = { owed, dueDay: state.day + days };
              addCredits(amount, "Loan from Vool's Credit");
              ctx.sfx('coin');
              render();
            },
          }, 'Take it')
        ));
      }
    };
    render();
  }, { kicker: 'Galleria Market' });
}

// The job board at the Guild and the terminals on each deck.
export function openJobs(from, ctx) {
  openPanel(from === GUILD.name ? 'Courier Guild · Job Board' : `${from} · Courier Terminal`, (body) => {
    const render = () => {
      body.replaceChildren();
      const j = state.job;
      if (j && j.dest === from) {
        const r = deliver();
        ctx.sfx('deliver');
        ctx.toast(`Delivered ${r ? '' : ''}for ${r.pay} cr. ${r.note}`, 'win', 6000);
        body.append(h('div.result', {}, h('b.good', {}, `Delivery complete: +${r.pay} cr`), h('div.muted', {}, r.note)));
      } else if (j) {
        const left = minutesLeft();
        body.append(
          h('div.result', {}, h('b', {}, `Active: ${j.cargo}`), h('div.muted', {}, `Deliver to ${j.dest} · ${left < 0 ? 'late' : `${Math.floor(left / 60)}h ${Math.floor(left % 60)}m left`} · ${j.pay} cr`)),
          h('button.btn.ghost', { onclick: () => { abandonJob(); ctx.toast('Job abandoned. The Guild will remember.', 'bad'); render(); } }, 'Abandon job')
        );
        return;
      }
      body.append(h('p.muted', {}, 'Pick a job, fly to the destination deck, land, and use its courier terminal. Faster pays more. Fragile cargo hates collisions.'));
      for (const o of makeOffers(from)) {
        body.append(h('div.menu-item', {},
          h('div', {},
            h('b', {}, o.cargo), o.fragile ? h('span.tag.warn', {}, 'fragile') : '',
            h('div.muted', {}, `To ${o.dest} · ${(o.dist / 1000).toFixed(1)} km · ${Math.floor(o.limit / 60)}h ${o.limit % 60}m`)),
          h('button.btn.primary', {
            onclick: () => {
              acceptJob(o);
              ctx.sfx('open');
              ctx.toast(`Job accepted: ${o.cargo} to ${o.dest}. Follow the ◆ marker.`, 'info', 5000);
              closePanel();
            },
          }, `${o.pay} cr`)
        ));
      }
    };
    render();
  }, { kicker: 'Courier work' });
}

export function openTerminal(ctx) {
  openPanel('Personal Terminal', (body) => {
    const s = state.stats;
    body.append(
      h('div.stats', {},
        stat('Day', state.day), stat('Credits', `${state.credits.toLocaleString()} cr`),
        stat('Deliveries', s.delivered), stat('Courier earnings', `${s.earned.toLocaleString()} cr`),
        stat('Wagered', `${s.wagered.toLocaleString()} cr`), stat('Winnings', `${s.won.toLocaleString()} cr`),
        stat('Speeder', SPEEDER_MODELS[state.speeder].name), stat('Rent', '120 cr daily at 06:00'),
        stat('Debt', state.loan ? `${state.loan.owed} cr due day ${state.loan.dueDay}` : 'None')),
      h('div.row', {},
        h('button.btn.primary', { onclick: () => { ctx.save(); ctx.toast('Game saved.', 'info'); } }, 'Save game'),
        h('button.btn.ghost', {
          onclick: () => {
            if (confirm('Start over? Your saved progress will be erased.')) { clearSave(); location.reload(); }
          },
        }, 'New life')
      ),
      h('p.muted', {}, 'The game also saves itself every minute and whenever you sleep.')
    );
  }, { kicker: 'Unit 4407' });
}

function stat(label, value) {
  return h('div.stat', {}, h('div.muted', {}, label), h('b', {}, String(value)));
}

export function openPlaque() {
  openPanel('The Founders', (body) => {
    body.append(
      h('p', {}, 'When the last open ground was built over, the city kept growing upward. This monument marks the first level ever raised above the clouds.'),
      h('p.muted', {}, 'Five thousand levels. Two trillion residents. Not one patch of bare soil. The city does not sleep, and neither, the saying goes, do its people.'),
      h('p.muted', {}, 'Look north-west for the Temple. Look east for the Assembly Dome. Look down only if you must.')
    );
  }, { kicker: 'Spire Promenade' });
}

export function sleepUntilMorning(ctx) {
  if (state.energy > 85) { ctx.toast("You're not tired yet.", 'info'); return false; }
  const now = state.minutes;
  let target = 7 * 60;
  let add = target - now;
  if (add <= 0) add += 1440;
  if (add > 10 * 60) add = 8 * 60; // napping in the afternoon: eight hours at most
  const before = totalMinutes();
  ctx.fade(() => {
    state.minutes += add;
    while (state.minutes >= 1440) { state.minutes -= 1440; state.day += 1; }
    state.energy = 100;
    state.hunger = Math.max(0, state.hunger - add * (100 / (30 * 60)) * 0.5);
    ctx.afterSleep(totalMinutes() - before);
    saveGame(ctx.saveExtra());
  });
  return true;
}
