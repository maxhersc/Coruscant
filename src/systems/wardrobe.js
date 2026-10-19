import { state, addCredits } from './state.js';
import { openPanel, h } from '../ui/panel.js';

// What you wear, and what it does. One outfit, one hat and one piece of gear
// at a time; anything you have bought stays in your wardrobe. Outfits are
// more than looks: formal wear gets you past doormen and charms passengers, a
// shadow cloak hides you from scanners, a jump pack lets you fly on foot.

// look: options for createHumanoid. effect: what the code checks with wearing().
export const CLOTHES = {
  // Outfits.
  courier: { slot: 'outfit', name: 'Courier jacket', price: 0, look: { cloth: 0x3b4e6e, accent: 0xd9a441 }, blurb: 'Guild issue. Comfortable, anonymous.' },
  neon: { slot: 'outfit', name: 'Neon street jacket', price: 220, look: { cloth: 0x1a1824, accent: 0xff3399, trim: 0xff3399, pants: 0x14121c }, effect: 'party', blurb: 'Glows in the dark. Clubs let you in free and you dance better in it.' },
  runner: { slot: 'outfit', name: 'Runner suit', price: 420, look: { cloth: 0x1f6a4a, accent: 0x55ff88, trim: 0x55ff88, pants: 0x173a2c }, effect: 'runner', blurb: 'Run 30% faster and jump higher on foot.' },
  flight: { slot: 'outfit', name: 'Flight suit', price: 780, look: { cloth: 0xd86a1a, accent: 0xf2f2f2, pants: 0x3a2a1a }, effect: 'pilot', blurb: 'Sharper steering, and fall-catch drones catch you for free.' },
  suit: { slot: 'outfit', name: 'Tailored suit', price: 650, look: { cloth: 0x1c1c24, accent: 0xc9a23a, pants: 0x1c1c24 }, effect: 'formal', blurb: 'Dress code for noble salons and embassies. Passengers tip a quarter more; officers listen.' },
  robe: { slot: 'outfit', name: 'Silk evening robe', price: 980, look: { cloth: 0x6a1a4a, accent: 0xe8c060, coat: true, pants: 0x3a0e2a }, effect: 'formal', blurb: 'Formal, and impossible to ignore. Same doors open as for a suit.' },
  cloak: { slot: 'outfit', name: 'Shadow cloak', price: 1250, look: { cloth: 0x121216, accent: 0x3a3a44, coat: true, pants: 0x121216, hood: true }, effect: 'cloak', blurb: 'Scanner-dampening weave. Patrol scans reach 40% less far.' },
  armor: { slot: 'outfit', name: 'Bounty plate', price: 2600, look: { cloth: 0x7a8088, accent: 0xb03030, metal: true, pants: 0x3a3c42 }, effect: 'armor', blurb: 'Stun bolts and rams hurt half as much.' },
  // Hats.
  cap: { slot: 'hat', name: 'Pilot cap', price: 60, look: { hat: 'cap' }, blurb: 'A cap with a short brim.' },
  band: { slot: 'hat', name: 'Gold headband', price: 90, look: { hat: 'band' }, blurb: 'Simple and shiny.' },
  shades: { slot: 'hat', name: 'Visor shades', price: 140, look: { visor: 0xff7733 }, blurb: 'A glowing visor across the eyes.' },
  halo: { slot: 'hat', name: 'Crown of lights', price: 3200, look: { halo: true }, blurb: 'A ring of light that floats over your head. People stare.' },
  // Gear on your back.
  cape: { slot: 'gear', name: 'Cape', price: 320, look: { cape: 0x8a1a1a }, blurb: 'It does nothing. It looks amazing.' },
  wings: { slot: 'gear', name: 'Glider wings', price: 1600, look: { pack: 'wings' }, effect: 'glide', blurb: 'Hold Space while falling to glide. Step off a deck and fly.' },
  jetpack: { slot: 'gear', name: 'Jump pack', price: 2400, look: { pack: 'jet' }, effect: 'jet', blurb: 'Hold Space in the air for a few seconds of thrust.' },
};

export function wardrobe() {
  state.wardrobe ??= { owned: ['courier'], outfit: 'courier', hat: null, gear: null };
  return state.wardrobe;
}

// Is something with this effect (or this id) being worn?
export function wearing(what) {
  const w = wardrobe();
  for (const id of [w.outfit, w.hat, w.gear]) {
    if (!id) continue;
    if (id === what || CLOTHES[id]?.effect === what) return true;
  }
  return false;
}

// The options for the player's humanoid, from what is worn.
export function playerLook() {
  const w = wardrobe();
  const look = { skin: 0xc68e6a, cloth: 0x3b4e6e, accent: 0xd9a441 };
  for (const id of [w.outfit, w.hat, w.gear]) if (id && CLOTHES[id]) Object.assign(look, CLOTHES[id].look);
  if (look.hood) look.hat = 'hood';
  // The clinic's work: skin tone and hair colour.
  if (state.look) Object.assign(look, state.look);
  return look;
}

export function put(id) {
  const c = CLOTHES[id];
  const w = wardrobe();
  if (!c || !w.owned.includes(id)) return false;
  w[c.slot] = w[c.slot] === id && c.slot !== 'outfit' ? null : id;
  return true;
}

export function buyClothes(id) {
  const c = CLOTHES[id];
  const w = wardrobe();
  if (!c) return 'No such thing.';
  if (w.owned.includes(id)) return 'You already own it.';
  if (state.credits < c.price) return `You need ${c.price - state.credits} more credits.`;
  addCredits(-c.price, `Bought ${c.name}`);
  w.owned.push(id);
  put(id);
  return null;
}

// The boutique (buy and try on) and the wardrobe at home (change only).
// ctx: { toast, sfx, dress } where dress() refreshes the player model.
export function openBoutique(ctx, { shopOnly = false, title = 'Threads', kicker = 'Galleria Market boutique' } = {}) {
  openPanel(title, (body) => {
    const render = () => {
      body.replaceChildren(h('p.muted', {}, shopOnly
        ? 'Buy something and wear it out of the shop. Everything you buy goes to your wardrobe.'
        : 'Your wardrobe. Click to put something on or take it off.'));
      const w = wardrobe();
      for (const [slot, label] of [['outfit', 'Outfits'], ['hat', 'Hats'], ['gear', 'On your back']]) {
        body.append(h('div.label', {}, label));
        for (const [id, c] of Object.entries(CLOTHES)) {
          if (c.slot !== slot) continue;
          const owned = w.owned.includes(id);
          if (!shopOnly && !owned) continue;
          const on = w[slot] === id;
          body.append(h('div.menu-item', {},
            h('div', {}, h('b', {}, c.name), on ? h('span.tag', {}, 'wearing') : '', h('div.muted', {}, c.blurb)),
            owned
              ? h('button.btn' + (on ? '.ghost' : ''), { onclick: () => { put(id); ctx.dress(); ctx.sfx('click'); render(); } }, on ? (slot === 'outfit' ? 'Wearing' : 'Take off') : 'Wear')
              : h('button.btn.primary', {
                onclick: () => {
                  const err = buyClothes(id);
                  if (err) { ctx.toast(err, 'bad'); ctx.sfx('lose'); return; }
                  ctx.dress();
                  ctx.sfx('coin');
                  ctx.toast(`You are wearing the ${c.name.toLowerCase()}.`, 'win');
                  render();
                },
              }, `${c.price.toLocaleString()} cr`)));
        }
      }
    };
    render();
  }, { kicker });
}
