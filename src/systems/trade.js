import { state, addCredits } from './state.js';
import { openPanel, h } from '../ui/panel.js';
import { placeOf } from './places.js';

// Trade: an inventory (your cargo hold), a catalogue of goods, and shops that
// both sell and buy. Each shop pays more for some kinds of goods than others,
// and every price drifts day to day, so buying in one place and selling in
// another is a living.

export const CATEGORIES = {
  food: 'Food & drink',
  tech: 'Tech',
  luxury: 'Luxury',
  goods: 'Goods & medicine',
  spice: 'Spice (contraband)',
  curio: 'Curios',
  parts: 'Speeder parts',
};

// id: [name, category, base price, description, effect]
// effect: { hunger, energy } when used, or { install } for speeder parts.
const RAW = {
  ration: ['Ration bar', 'food', 5, 'Tastes like the wrapper. Keeps you going.', { hunger: 20 }],
  fruit: ['Sky fruit', 'food', 7, 'Grown on rooftop farms, three hundred levels up.', { hunger: 18, energy: 2 }],
  noodlecup: ['Noodle cup', 'food', 10, 'Just add hot water and regret.', { hunger: 30 }],
  jerky: ['Spiced jerky', 'food', 14, 'Nobody asks what animal.', { hunger: 35 }],
  cola: ['Nova-Cola', 'food', 4, 'Taste the Core.', { energy: 8, hunger: 4 }],
  cafbeans: ['Caf beans', 'food', 16, 'Chew them if you must.', { energy: 25 }],
  stim: ['Stim tab', 'food', 32, 'Wide awake for hours. Mostly legal.', { energy: 50 }],
  mealcrate: ['Meal crate', 'food', 45, 'A week of food for one, or one night for a courier.', { hunger: 80, energy: 10 }],
  powercell: ['Power cell', 'tech', 45, 'Standard cell. Everything runs on them.'],
  blankchip: ['Blank datachip', 'tech', 20, 'Two terabytes of nothing.'],
  comlink: ['Comlink', 'tech', 60, 'Short-range, scrambled, second-hand.'],
  holoemitter: ['Holo emitter', 'tech', 125, 'Projects a flickering three-metre image.'],
  enckey: ['Encryption key', 'tech', 180, 'Opens doors that would rather stay shut.'],
  motivator: ['Droid motivator', 'tech', 230, 'The part every broken droid is missing.'],
  repulsor: ['Repulsor coil', 'tech', 310, 'Hums when you hold it. Do not drop it.'],
  navcomp: ['Nav computer', 'tech', 640, 'Plots a jump to any charted system.'],
  silk: ['Chroma silk', 'luxury', 260, 'Changes colour with the light.'],
  perfume: ['Perfume vial', 'luxury', 90, 'Smells of rain on a planet you have never seen.'],
  wine: ['Vintage wine', 'luxury', 150, 'Bottled before the last war.'],
  sculpture: ['Glass sculpture', 'luxury', 420, 'Fragile, beautiful and very expensive.'],
  ring: ['Jewelled ring', 'luxury', 900, 'Three stones from three different moons.'],
  holocron: ['Antique holocron', 'luxury', 1600, 'Its owner was someone important. Once.'],
  medpac: ['Medpac', 'goods', 70, 'Patches most things. Not all things.', { energy: 15 }],
  gel: ['Healing gel', 'goods', 110, 'Smells awful, works wonders.', { energy: 30 }],
  masks: ['Filter masks', 'goods', 25, 'For the lower levels. Box of ten.'],
  tools: ['Tool kit', 'goods', 85, 'Hydrospanners, fusion cutter, missing one piece.'],
  fabric: ['Bolt of fabric', 'goods', 40, 'Plain, practical, in demand everywhere.'],
  glitter: ['Glitter spice', 'spice', 85, 'Sparkles in the dark. Do not get caught with it.'],
  redspice: ['Red spice', 'spice', 150, 'Sweet, strong and very illegal.'],
  bluehaze: ['Blue haze', 'spice', 230, 'The Undercity runs on it.'],
  starmap: ['Starmap chip', 'curio', 25, 'Every lane in the sector. Out of date.'],
  holopet: ['Holo-pet chip', 'curio', 40, 'A holographic cat that ignores you.'],
  oldcoin: ['Old coin', 'curio', 35, 'Pre-city currency, stamped with a forgotten face.'],
  droidhead: ['Vintage droid head', 'curio', 75, 'Still blinks sometimes.'],
  shard: ['Meteor shard', 'curio', 160, 'Fell through the clouds in a storm.'],
  pearl: ['Moon pearl', 'curio', 520, 'Grown in the oceans of the third moon.'],
  idol: ['Temple idol', 'curio', 340, 'Said to come from the Temple. Probably does not.'],
  turbo: ['Turbo injector', 'parts', 800, 'Install for +12 m/s top speed.', { install: 'turbo' }],
  cargopod: ['Cargo pod', 'parts', 600, 'Install for +20 cargo space.', { install: 'cargo' }],
  plating: ['Hull plating', 'parts', 450, 'Install to halve damage to fragile cargo.', { install: 'plating' }],
  jammer: ['Scanner jammer', 'parts', 900, 'Install to halve the range Spire Security can scan you from.', { install: 'jammer' }],
};

export const ITEMS = Object.fromEntries(Object.entries(RAW).map(([id, [name, cat, base, desc, effect]]) => [id, { id, name, cat, base, desc, effect }]));

// Shops. sells: item ids on offer. pays: category -> multiplier on base when
// you sell to them (missing categories are not bought at all; '*' covers the
// rest). markup: multiplier on base when you buy.
const SHOP_DEFS = {
  droid: { name: 'Droid Parts', where: 'Galleria Market', sells: ['powercell', 'motivator', 'repulsor', 'comlink', 'droidhead', 'tools'], pays: { tech: 1.0, curio: 0.6, goods: 0.6 }, markup: 1.0 },
  spice: { name: 'Spice Merchant', where: 'Galleria Market', sells: ['jerky', 'cafbeans', 'mealcrate', 'masks', 'medpac', 'fabric'], pays: { food: 0.9, goods: 1.0 }, markup: 0.95 },
  chips: { name: 'Data Chips', where: 'Galleria Market', sells: ['blankchip', 'starmap', 'holopet', 'enckey', 'comlink'], pays: { tech: 1.05, curio: 0.8 }, markup: 1.0 },
  tailor: { name: 'Tailor', where: 'Galleria Market', sells: ['fabric', 'silk', 'perfume'], pays: { luxury: 1.05, goods: 0.7 }, markup: 1.0 },
  pawn: { name: 'Pawn Shop', where: 'Galleria Market', sells: ['oldcoin', 'droidhead', 'starmap', 'tools', 'comlink', 'shard'], pays: { '*': 0.6 }, markup: 1.1 },
  odds: { name: 'Odds & Ends', where: 'Galleria Market', sells: ['holopet', 'oldcoin', 'shard', 'idol', 'pearl', 'cola'], pays: { curio: 1.05 }, markup: 1.05 },
  emporium: { name: 'Skyline Emporium', where: 'Spire Promenade', sells: ['wine', 'perfume', 'sculpture', 'ring', 'holocron', 'silk'], pays: { luxury: 1.1, curio: 0.9 }, markup: 1.2 },
  dealerparts: { name: 'Jump Station Parts Counter', where: 'Spire Promenade', sells: ['turbo', 'cargopod', 'plating', 'powercell'], pays: { parts: 0.7, tech: 0.8 }, markup: 1.0 },
  black: { name: 'The Shelf (black market)', where: 'Undercity Shelf', sells: ['glitter', 'redspice', 'bluehaze', 'enckey', 'navcomp', 'stim', 'jammer'], pays: { spice: 1.0, luxury: 1.3, tech: 1.1, curio: 1.2 }, markup: 0.9 },
};

// Rooftop deck traders: each wants one kind of goods badly and sells what its
// kind of place has to spare (a sky farm sells food, a shipyard tools). It
// never buys back what it sells, or one stall would be a money machine.
function hashStr(s) {
  let x = 2166136261;
  for (const c of s) x = Math.imul(x ^ c.charCodeAt(0), 16777619) >>> 0;
  return x;
}
function deckShop(deckName) {
  const k = hashStr(deckName);
  const p = placeOf(deckName);
  return {
    name: `${p.venue} trader`,
    where: deckName,
    sells: p.sells.filter((id) => ITEMS[id].cat !== p.wants),
    pays: { [p.wants]: 1.35 + ((k >>> 8) % 30) / 100, '*': 0.55 },
    markup: 0.85,
    wants: p.wants,
  };
}

export function shopDef(id) {
  if (id.startsWith('deck:')) return deckShop(id.slice(5));
  return SHOP_DEFS[id];
}

// A daily drift of +-25% per shop and item, the same all day.
function drift(shopId, itemId) {
  const k = hashStr(`${shopId}|${itemId}|${state.day}`);
  return 0.78 + (k % 1000) / 1000 * 0.47;
}

export function buyPrice(shopId, itemId) {
  const shop = shopDef(shopId), it = ITEMS[itemId];
  return Math.max(1, Math.round(it.base * shop.markup * drift(shopId, itemId)));
}

// What the shop pays you, or 0 if it does not buy that kind of thing.
export function sellPrice(shopId, itemId) {
  const shop = shopDef(shopId), it = ITEMS[itemId];
  const k = shop.pays[it.cat] ?? shop.pays['*'];
  if (!k) return 0;
  return Math.max(1, Math.round(it.base * k * 0.85 * drift(shopId + ':buy', itemId)));
}

// ---------------------------------------------------------------- cargo
export function inventory() {
  if (!state.inventory) state.inventory = {};
  return state.inventory;
}
export function upgrades() {
  if (!state.upgrades) state.upgrades = {};
  return state.upgrades;
}
export function capacity() {
  return 30 + (upgrades().cargo || 0) * 20;
}
export function cargoCount() {
  return Object.values(inventory()).reduce((a, b) => a + b, 0);
}
// Spice in the hold: what a Spire Security scan finds.
export function contrabandCount() {
  const inv = inventory();
  return Object.keys(inv).reduce((n, id) => n + (ITEMS[id] && ITEMS[id].cat === 'spice' ? inv[id] : 0), 0);
}

// Security takes every spice item in the hold.
export function confiscate() {
  const inv = inventory();
  let n = 0;
  for (const id of Object.keys(inv)) if (ITEMS[id] && ITEMS[id].cat === 'spice') { n += inv[id]; delete inv[id]; }
  return n;
}

export function addItem(id, n = 1) {
  const inv = inventory();
  inv[id] = (inv[id] || 0) + n;
}
export function removeItem(id, n = 1) {
  const inv = inventory();
  inv[id] = (inv[id] || 0) - n;
  if (inv[id] <= 0) delete inv[id];
}

function tradeStats() {
  if (!state.stats.trade) state.stats.trade = { bought: 0, sold: 0 };
  return state.stats.trade;
}

export function buy(shopId, itemId, n = 1) {
  const price = buyPrice(shopId, itemId) * n;
  if (state.credits < price) return 'Not enough credits.';
  if (cargoCount() + n > capacity()) return `Your cargo hold is full (${capacity()}).`;
  addCredits(-price, `Bought ${ITEMS[itemId].name}${n > 1 ? ` ×${n}` : ''}`);
  addItem(itemId, n);
  tradeStats().bought += price;
  return null;
}

export function sell(shopId, itemId, n = 1) {
  const have = inventory()[itemId] || 0;
  n = Math.min(n, have);
  const each = sellPrice(shopId, itemId);
  if (!n || !each) return 'They will not buy that.';
  removeItem(itemId, n);
  addCredits(each * n, `Sold ${ITEMS[itemId].name}${n > 1 ? ` ×${n}` : ''}`);
  tradeStats().sold += each * n;
  return null;
}

// Use a consumable or install a part. Returns a message.
export function useItem(id) {
  const it = ITEMS[id];
  if (!it || !it.effect || !(inventory()[id] > 0)) return null;
  const e = it.effect;
  if (e.install) {
    const up = upgrades();
    if (e.install === 'turbo' && (up.turbo || 0) >= 3) return 'Your speeder already has three turbo injectors.';
    if (e.install === 'cargo' && (up.cargo || 0) >= 3) return 'No room for another cargo pod.';
    if (e.install === 'plating' && up.plating) return 'Your hull is already plated.';
    if (e.install === 'jammer' && up.jammer) return 'A jammer is already fitted.';
    up[e.install] = (up[e.install] || 0) + 1;
    removeItem(id);
    return `Installed: ${it.name}.`;
  }
  removeItem(id);
  if (e.hunger) state.hunger = Math.min(100, state.hunger + e.hunger);
  if (e.energy) state.energy = Math.min(100, state.energy + e.energy);
  return `You use the ${it.name.toLowerCase()}.`;
}

// ---------------------------------------------------------------- screens
const catTag = (cat) => h(`span.tag.cat-${cat}`, {}, CATEGORIES[cat].split(' ')[0]);

export function openShop(shopId, ctx, extraTop) {
  const shop = shopDef(shopId);
  openPanel(shop.name, (body) => {
    const msg = h('div.result');
    const head = h('div.trade-head');
    const buyList = h('div.trade-list');
    const sellList = h('div.trade-list');
    const render = () => {
      head.replaceChildren(
        h('span', {}, h('b', {}, `${state.credits.toLocaleString()} cr`), ' · cargo ', h('b', {}, `${cargoCount()}/${capacity()}`)),
        h('span.muted', {}, 'Pays well for: ', Object.entries(shop.pays).filter(([c, k]) => c !== '*' && k >= 1).map(([c]) => CATEGORIES[c]).join(', ') || 'nothing in particular'),
      );
      buyList.replaceChildren(...shop.sells.map((id) => {
        const it = ITEMS[id], p = buyPrice(shopId, id);
        const cheap = p < it.base * 0.92;
        return h('div.trade-row', { title: it.desc },
          h('div.trade-name', {}, h('b', {}, it.name), catTag(it.cat), h('div.muted', {}, it.desc)),
          h('span.trade-price' + (cheap ? '.good' : ''), {}, `${p} cr`),
          h('div.trade-btns', {},
            h('button.btn', { onclick: () => act(buy(shopId, id, 1)) }, 'Buy'),
            h('button.btn.ghost', { onclick: () => act(buy(shopId, id, 5)) }, '×5')));
      }));
      const mine = Object.entries(inventory()).filter(([, n]) => n > 0);
      sellList.replaceChildren(...(mine.length ? mine.map(([id, n]) => {
        const it = ITEMS[id], p = sellPrice(shopId, id);
        const good = p > it.base;
        return h('div.trade-row', { title: it.desc },
          h('div.trade-name', {}, h('b', {}, `${it.name} ×${n}`), catTag(it.cat)),
          h('span.trade-price' + (good ? '.good' : p ? '' : '.muted'), {}, p ? `${p} cr` : 'not wanted'),
          h('div.trade-btns', {},
            h('button.btn', { disabled: p ? undefined : 'true', onclick: () => act(sell(shopId, id, 1)) }, 'Sell'),
            h('button.btn.ghost', { disabled: p ? undefined : 'true', onclick: () => act(sell(shopId, id, n)) }, 'All')));
      }) : [h('p.muted', {}, 'Your cargo hold is empty.')]));
    };
    const act = (err) => {
      if (err) { msg.textContent = err; ctx.sfx('lose'); } else { msg.textContent = ''; ctx.sfx('coin'); }
      render();
    };
    if (extraTop) body.append(extraTop(() => render()));
    body.append(head,
      h('div.trade-cols', {},
        h('section', {}, h('div.label', {}, 'For sale'), buyList),
        h('section', {}, h('div.label', {}, 'Sell your cargo'), sellList)),
      msg,
      h('p.muted', {}, 'Prices change every day and differ between shops. Green prices are good deals. Rooftop deck traders pay the most for the one thing they want.'));
    render();
  }, { kicker: shop.where, wide: true });
}

export function openInventory(ctx) {
  openPanel('Cargo hold', (body) => {
    const list = h('div.trade-list');
    const msg = h('div.result');
    const render = () => {
      const mine = Object.entries(inventory()).filter(([, n]) => n > 0);
      const worth = mine.reduce((a, [id, n]) => a + ITEMS[id].base * n, 0);
      const up = upgrades();
      list.replaceChildren(
        h('div.trade-head', {}, h('span', {}, 'Cargo ', h('b', {}, `${cargoCount()}/${capacity()}`), ` · worth about ${worth.toLocaleString()} cr`),
          h('span.muted', {}, `Speeder: +${(up.turbo || 0) * 12} m/s, ${up.plating ? 'plated hull' : 'standard hull'}`)),
        ...(mine.length ? mine.map(([id, n]) => {
          const it = ITEMS[id];
          const usable = it.effect;
          return h('div.trade-row', { title: it.desc },
            h('div.trade-name', {}, h('b', {}, `${it.name} ×${n}`), catTag(it.cat), h('div.muted', {}, it.desc)),
            h('span.trade-price.muted', {}, `~${it.base} cr`),
            h('div.trade-btns', {},
              usable ? h('button.btn', { onclick: () => { msg.textContent = useItem(id) || ''; ctx.sfx('coin'); render(); } }, it.effect.install ? 'Install' : 'Use') : null,
              h('button.btn.ghost', { onclick: () => { removeItem(id); render(); } }, 'Drop')));
        }) : [h('p.muted', {}, 'Empty. Buy goods at the Galleria Market stalls, the Skyline Emporium or any rooftop deck trader, and sell them where they pay more.')]));
    };
    body.append(list, msg);
    render();
  }, { kicker: 'Press I any time', wide: true });
}

export const SHOP_IDS = Object.keys(SHOP_DEFS);
