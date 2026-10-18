import { state, addCredits } from '../systems/state.js';
import { openPanel, closePanel, h } from '../ui/panel.js';

// The storyline: "The Sealed Case". A chain of steps, each with an objective
// and a place to guide the player to, advanced by conversations and by things
// the player does in the world. Choices are kept as flags.

export const STEPS = [
  { id: 'meet-nella', chapter: 'New in the City', goal: 'Meet Nella Ves, dispatcher at the Courier Guild (Promenade, 300)', at: 'nella' },
  { id: 'first-job', chapter: 'New in the City', goal: 'Complete a courier delivery. Take any job from the Guild board.', at: 'board' },
  { id: 'report-nella', chapter: 'New in the City', goal: 'Report back to Nella at the Courier Guild', at: 'nella' },
  { id: 'deliver-case', chapter: 'The Sealed Case', goal: 'Fly the sealed case to Ondrel Spur and find the recipient', at: 'kess' },
  { id: 'see-brask', chapter: 'The Sealed Case', goal: 'Find Old Brask in the Low Orbit cantina (Galleria Market, 160)', at: 'brask' },
  { id: 'see-zeela', chapter: 'Who Is Asking', goal: 'Show the case to Zeela at the Holo Repair stall (Galleria Market, 160)', at: 'zeela' },
  { id: 'buy-chip', chapter: 'Who Is Asking', goal: 'Buy a decoder chip at the Data Chips stall (Galleria Market, 160)', at: 'chips' },
  { id: 'zeela-decode', chapter: 'Who Is Asking', goal: 'Bring the decoder chip to Zeela', at: 'zeela' },
  { id: 'go-shelf', chapter: 'Below the Clouds', goal: 'Fly down through the clouds to the Undercity Shelf', at: 'shelf' },
  { id: 'find-cache', chapter: 'Below the Clouds', goal: 'Search the Shelf for the hidden cache', at: 'cache' },
  { id: 'collectors', chapter: 'Below the Clouds', goal: "Vool's collectors are here. Talk to them.", at: 'rusk' },
  { id: 'decide', chapter: 'What It Is Worth', goal: 'Decide what to do with the cache: give it to Inspector Dale (Promenade, by the Spire doors) or sell it to Vool (Galleria Market)', at: 'dale' },
  { id: 'epilogue', chapter: 'What It Is Worth', goal: 'Tell Nella how it ended', at: 'nella' },
  { id: 'done', chapter: 'Epilogue', goal: 'The story is over. The city goes on: work, bet, explore, help people.', at: null },
];

const FAVORS = {
  jessa: { who: 'Jessa Marr', title: 'Noodles for a neighbour', goal: 'Buy a bowl at Orbital Noodles (Promenade) and bring it to Jessa (Residences, 440)', reward: 60 },
  imani: { who: 'Dr. Imani Sola', title: 'Survey flight', goal: 'Fly within 350 m of the Temple and of the Assembly Dome, then report to Dr. Sola on the Skydeck', reward: 150 },
  brask: { who: 'Old Brask', title: 'Beat the old record', goal: 'Run the Gate Run under Brask’s record, then tell him (Low Orbit, Market 160)', reward: 200 },
};

// Story state lives inside the save.
export function storyState() {
  if (!state.story) state.story = { step: 0, flags: {}, log: [], favors: {}, bestRun: null };
  return state.story;
}

// Positions of the people and places the story points at, filled in as the
// world is built: where[key] = Vector3 or () => Vector3.
export const where = {};
const hooks = { toast: () => {}, sfx: () => {}, onChange: () => {} };
export function setStoryHooks(h2) { Object.assign(hooks, h2); }

export function current() {
  return STEPS[Math.min(storyState().step, STEPS.length - 1)];
}

export function isAt(id) {
  return current().id === id;
}

export function stepIndex(id) {
  return STEPS.findIndex((s) => s.id === id);
}

export function reached(id) {
  return storyState().step >= stepIndex(id);
}

export function flag(name, value) {
  const f = storyState().flags;
  if (value !== undefined) f[name] = value;
  return f[name];
}

// Move to the next step, recording what just happened in the journal.
export function advance(logLine) {
  const s = storyState();
  if (logLine) s.log.push(logLine);
  s.step = Math.min(s.step + 1, STEPS.length - 1);
  const next = current();
  hooks.sfx('deliver');
  hooks.toast(`New objective: ${next.goal}`, 'race', 7000);
  hooks.onChange();
}

export function storyTarget() {
  const step = current();
  if (!step.at) return null;
  const w = where[step.at];
  if (!w) return null;
  const pos = typeof w === 'function' ? w() : w;
  return pos ? { name: step.goal.split('(')[0].replace(/\.$/, '').trim(), pos, story: true } : null;
}

// Things that happen in the world, reported by the game.
export function emit(event, data = {}) {
  const s = storyState();
  if (event === 'delivered' && isAt('first-job')) advance('You ran your first delivery for the Guild.');
  if (event === 'zone' && data.name === 'Undercity Shelf' && isAt('go-shelf')) advance('You dropped through the clouds and found the Undercity Shelf.');
  if (event === 'bought' && data.item === 'noodles' && s.favors.jessa === 'active') {
    flag('hasNoodles', true);
    hooks.toast('You picked up an extra bowl for Jessa.', 'info');
  }
  if (event === 'near' && s.favors.imani === 'active') {
    if (data.what === 'temple' && !flag('sawTemple')) { flag('sawTemple', true); hooks.toast('Survey: the Temple logged.', 'win'); }
    if (data.what === 'dome' && !flag('sawDome')) { flag('sawDome', true); hooks.toast('Survey: the Assembly Dome logged.', 'win'); }
  }
  if (event === 'gaterun') {
    if (!s.bestRun || data.time < s.bestRun) s.bestRun = data.time;
    if (s.favors.brask === 'active' && data.time < BRASK_RECORD) {
      flag('beatBrask', true);
      hooks.toast('That beats Old Brask’s record. Go and tell him.', 'win', 6000);
    }
  }
}

export const BRASK_RECORD = 34;

export function startFavor(id) {
  const s = storyState();
  if (s.favors[id]) return;
  s.favors[id] = 'active';
  hooks.toast(`New favour: ${FAVORS[id].title}. ${FAVORS[id].goal}.`, 'race', 7000);
  hooks.sfx('open');
}

export function finishFavor(id) {
  const s = storyState();
  if (s.favors[id] !== 'active') return;
  s.favors[id] = 'done';
  addCredits(FAVORS[id].reward, `Favour · ${FAVORS[id].title}`);
  hooks.sfx('win');
}

export function favorState(id) {
  return storyState().favors[id] || null;
}

export function openJournal(onTrack) {
  const s = storyState();
  const step = current();
  openPanel('Journal', (body) => {
    body.append(
      h('div.journal-chapter', {}, h('span.label', {}, `Chapter: ${step.chapter}`), h('div.journal-goal', {}, step.goal)),
      step.at ? h('div.row', {}, h('button.btn.primary', { onclick: () => { onTrack(); closePanel(); } }, 'Track this objective')) : null,
    );
    if (s.log.length) {
      body.append(h('div.label', {}, 'The story so far'));
      body.append(h('ol.journal-log', {}, ...s.log.map((l) => h('li', {}, l))));
    }
    const favs = Object.entries(s.favors);
    body.append(h('div.label', {}, 'Favours'));
    if (!favs.length) body.append(h('p.muted', {}, 'People around the city may ask you for help. Talk to them.'));
    for (const [id, st] of favs) {
      const f = FAVORS[id];
      body.append(h('div.menu-item', {},
        h('div', {}, h('b', {}, f.title), h('div.muted', {}, `${f.who} · ${f.goal}`)),
        h('span.tag' + (st === 'done' ? '' : '.warn'), {}, st === 'done' ? 'done' : `${f.reward} cr`)));
    }
    body.append(h('div.label', {}, 'Records'));
    body.append(h('p.muted', {}, s.bestRun ? `Gate Run best: ${s.bestRun.toFixed(1)} s` : 'Gate Run: no time set yet. Find the kiosk by the East Pad.'));
  }, { kicker: 'Press J any time' });
}

