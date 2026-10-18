import * as THREE from 'three';
import { LEVELS } from '../config.js';
import { createHumanoid } from '../npc/character.js';
import { addInteract, decks } from '../systems/interact.js';
import { state, addCredits } from '../systems/state.js';
import { converse } from './dialogue.js';
import { where, isAt, reached, advance, flag, startFavor, finishFavor, favorState, BRASK_RECORD } from './story.js';

// Named people of the city. Each stands somewhere fixed, faces the player
// while talking, wears a name tag up close and a "!" when they have
// something for you.

const P = LEVELS.promenade, M = LEVELS.market;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function tagTexture(name, title) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.textAlign = 'center';
  g.fillStyle = 'rgba(6,10,18,0.7)';
  g.beginPath();
  g.roundRect(40, 8, 432, 112, 22);
  g.fill();
  g.fillStyle = '#ffffff';
  g.font = '700 50px Rajdhani, "Arial Narrow", Arial, sans-serif';
  g.fillText(name, 256, 62);
  g.fillStyle = '#ffc266';
  g.font = '600 30px Rajdhani, "Arial Narrow", Arial, sans-serif';
  g.fillText(title, 256, 102);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let markTex = null;
function markTexture() {
  if (markTex) return markTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffc266';
  g.shadowColor = '#ffc266';
  g.shadowBlur = 20;
  g.font = '900 110px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('!', 64, 70);
  markTex = new THREE.CanvasTexture(c);
  markTex.colorSpace = THREE.SRGBColorSpace;
  return markTex;
}

// ---------------------------------------------------------------- the cast
// ctx: { openLoan, openBlackjack, openGateRun, toast, sfx, escape }
function cast(ctx) {
  const ondrel = decks.find((d) => d.name === 'Ondrel Spur') || decks[1] || decks[0];
  const kessPos = V(ondrel.x - 4, ondrel.y, ondrel.z + 2);
  return [
    {
      id: 'nella', name: 'Nella Ves', title: 'Courier Guild dispatcher',
      look: { cloth: 0x2a6a6a, accent: 0xffc266, skin: 0xb57a52, hat: 'band', hairColor: 0x1a1210 },
      pos: V(-76, P, -92), facing: 0, talkAt: V(-76, P, -86),
      news: () => isAt('meet-nella') || isAt('report-nella') || isAt('epilogue'),
      talk: () => {
        if (isAt('meet-nella')) return {
          start: { text: "You're the new pilot? Nella Ves. I run dispatch. The Guild pays by the run, not by the hour, so don't get comfortable.", choices: [{ label: "What's the work?", next: 'job' }, { label: 'Any advice for someone new?', next: 'advice' }] },
          advice: { text: "Eat, sleep, and pay your rent before Skyhaven sends a droid. And stay away from Vool in the Galleria. He lends with a smile and collects with his friends.", choices: [{ label: 'Noted. So, the work?', next: 'job' }] },
          job: { text: "Take a contract off the board outside the door, fly it, land on the deck, use the terminal. Fast pays more, smashed pays less. Do one run and come back. Then we'll talk about real work.", choices: [{ label: "I'm on it.", run: () => advance('You met Nella Ves, dispatcher at the Courier Guild.') }] },
        };
        if (isAt('first-job')) return { start: { text: 'Board is right outside. One delivery, then come and see me.' } };
        if (isAt('report-nella')) return {
          start: { text: "Not bad for a first run. The client says you didn't even scratch the paint. I've got something that isn't on the board.", choices: [{ label: 'What kind of something?', next: 'case' }, { label: 'Why me?', next: 'why' }] },
          why: { text: "Because nobody up here knows your face yet. In this city, that's worth more than a fast speeder.", choices: [{ label: 'Go on.', next: 'case' }] },
          case: { text: 'A sealed case. No scanner reads it, which is the point. It goes to a contact called Kess on Ondrel Spur, a rooftop deck out in the city. Five hundred credits when Kess signs for it.', choices: [{ label: "I'll take it.", run: () => { flag('hasCase', true); advance('Nella gave you a sealed case for someone called Kess on Ondrel Spur.'); } }, { label: "What's inside?", next: 'inside' }] },
          inside: { text: "If I knew, it wouldn't be sealed. Some jobs you don't ask about. This is one of them.", choices: [{ label: "Fine. I'll take it.", run: () => { flag('hasCase', true); advance('Nella gave you a sealed case for someone called Kess on Ondrel Spur.'); } }] },
        };
        if (isAt('epilogue')) {
          if (flag('ending') === 'dale') return {
            start: { text: "Inspector Dale called me. He said you did the right thing, and that the Guild has a pilot who can't be bought. That's rare up here. Here's your five hundred, and you're on the priority board now.", choices: [{ label: 'Thanks, Nella.', run: () => { addCredits(500, 'Sealed case, paid in full'); advance('Nella paid you for the case. The Guild trusts you now.'); } }] },
          };
          return {
            start: { text: "Word travels fast. You sold it to Vool. I hope the credits keep you warm, because the Guild won't be calling you for a while.", choices: [{ label: 'It was business.', run: () => advance('Nella knows you sold the key to Vool. The Guild is cold to you now.') }] },
          };
        }
        if (reached('done')) return { start: { text: flag('ending') === 'dale' ? 'The priority board is yours, pilot. Fly safe, and take the long jobs. They pay.' : "Board's outside. Don't expect favours." } };
        return { start: { text: "Ondrel Spur. Kess. Don't open it, don't lose it, and don't stop for noodles." } };
      },
    },
    {
      id: 'kess', name: 'Kess', title: 'A stranger in a hood',
      look: { cloth: 0x26262e, accent: 0x7feaff, skin: 0x7aa0c8, hat: 'hood', coat: true },
      pos: kessPos, facing: Math.PI,
      visible: () => isAt('deliver-case') || isAt('see-brask'),
      news: () => isAt('deliver-case'),
      talk: () => {
        if (isAt('deliver-case')) return {
          start: { text: "Not here. Not with that in plain sight. You're Nella's pilot.", choices: [{ label: "You're Kess? Here's the case.", next: 'k2' }, { label: "Who's asking?", next: 'k2' }] },
          k2: { text: 'Kess was the name on the job. I am not who it was meant for. The person who should collect this went quiet two days ago, and Vool’s collectors have been asking at every pad between here and the Spire.', choices: [{ label: "What's in the case?", next: 'k3' }] },
          k3: { text: 'A navigation key. To what, I can’t tell you. But Old Brask can. He flew the long lanes before any of us. Low Orbit cantina, down in the Galleria. Keep the case and show him.', choices: [{ label: "I'll find Brask.", run: () => advance('On Ondrel Spur a stranger warned you that Vool wants the case, and sent you to Old Brask.') }] },
        };
        return { start: { text: 'Brask. Low Orbit. Go, before somebody sees us talking.' } };
      },
    },
    {
      id: 'brask', name: 'Old Brask', title: 'Retired long-lane pilot',
      look: { cloth: 0x5a4030, accent: 0xb08850, skin: 0xd8a47c, hat: 'cap', hairColor: 0xb0aaa0 },
      pos: V(-10, M, 64), facing: Math.PI / 2,
      news: () => isAt('see-brask') || (favorState('brask') === 'active' && flag('beatBrask')) || (!favorState('brask') && reached('see-zeela')),
      talk: () => {
        if (isAt('see-brask')) return {
          start: { text: "Hah. I know that case. I saw one like it twenty years back, on a freighter called the Meridian Vow. She went down into the clouds with her whole cargo, and nobody ever found her.", choices: [{ label: 'Went down where?', next: 'b2' }] },
          b2: { text: "Under the cloud deck, where the old platforms still hang. If that key is what I think it is, it opens the Vow's cargo vault. Zeela at the Holo Repair stall can read it. She owes me.", choices: [{ label: 'Thanks, Brask.', run: () => advance('Old Brask recognised the case: it belongs to the lost freighter Meridian Vow.') }] },
        };
        const fav = favorState('brask');
        const lines = {
          start: { text: 'Another pilot. Pull up a stool. The long lanes were something, before the tolls.', choices: [
            { label: 'Tell me about the long lanes.', next: 'lanes' },
            { label: 'Got a record I could beat?', next: 'record', show: () => !fav && reached('see-zeela') },
            { label: 'I beat your Gate Run record.', next: 'beat', show: () => fav === 'active' && !!flag('beatBrask') },
            { label: 'Remind me of your record?', next: 'remind', show: () => fav === 'active' && !flag('beatBrask') },
            { label: 'See you, Brask.' },
          ] },
          lanes: { text: 'Six days from the Core to the rim and back, sleeping in the pilot’s chair. You learn the city from above. Every spire is a signpost. The Temple points north-west, the Dome sits east. Never needed a map.', choices: [{ label: 'Back to your drink.', next: 'start' }] },
          record: { text: "The Gate Run. Twelve gates round the Spire. I did it in " + BRASK_RECORD + " seconds, back when my hands were steady. Beat that and I'll pay you myself. Kiosk's by the East Pad.", choices: [{ label: "You're on.", run: () => startFavor('brask') }, { label: 'Some other time.' }] },
          remind: { text: BRASK_RECORD + " seconds. Kiosk by the East Pad. Don't come back slower.", choices: [{ label: 'Right.' }] },
          beat: { text: 'Under ' + BRASK_RECORD + '? Show me... Well, burn me. Here. You earned it, and don’t let it go to your head.', choices: [{ label: 'Thanks, Brask.', run: () => finishFavor('brask') }] },
        };
        if (fav === 'done') lines.start.text = 'Fastest hands on the Promenade. Sit down, I’m buying.';
        return lines;
      },
    },
    {
      id: 'zeela', name: 'Zeela', title: 'Holo Repair, Galleria Market',
      look: { cloth: 0x5a2f5f, accent: 0x7feaff, skin: 0x6aa070, tails: true, visor: 0x55ff88 },
      pos: V(76.2, M, 0), facing: -Math.PI / 2, talkAt: V(72.8, M, 0),
      news: () => isAt('see-zeela') || (isAt('zeela-decode') && flag('hasChip')),
      talk: () => {
        if (isAt('see-zeela')) return {
          start: { text: 'Brask sent you? Let me see that... Oh, this is old. A military seal. I can’t read it without a decoder chip, and I’m out.', choices: [{ label: 'Where do I get one?', next: 'z2' }] },
          z2: { text: 'The Data Chips stall, two along from me. A hundred and fifty credits, and they’ll guess it’s for something shady, so don’t haggle.', choices: [{ label: "I'll get the chip.", run: () => advance('Zeela needs a decoder chip to read the case.') }] },
        };
        if (isAt('buy-chip')) return { start: { text: 'Data Chips. Two stalls along. I’ll be here.' } };
        if (isAt('zeela-decode') && flag('hasChip')) return {
          start: { text: 'That’s the one. Give me a moment... There. It isn’t a key, it’s coordinates: a platform under the cloud deck, west of the Spire. The old pilots called it the Shelf.', choices: [{ label: "What's down there?", next: 'z3' }] },
          z3: { text: 'Whatever the Meridian Vow left behind. Someone wanted it found by the right person. Try not to be the wrong one. And fly slowly through the clouds. You can’t see a thing in there.', choices: [{ label: "I'm going down.", run: () => advance('Zeela decoded the case. It points to the Undercity Shelf, below the clouds.') }] },
        };
        return { start: { text: 'Holo broken? Droid fritzing? Zeela fixes everything except bad decisions.' } };
      },
    },
    {
      id: 'vool', name: 'Vool', title: "Vool's Credit",
      look: { cloth: 0x1e1e24, accent: 0xd8b048, skin: 0x9a9aa4, coat: true, scale: 1.15, hat: 'band' },
      pos: V(-44, M, -76.5), facing: 0, talkAt: V(-44, M, -72.8),
      news: () => isAt('decide'),
      talk: () => {
        const loan = { label: 'I need a loan.', run: () => { ctx.openLoan(); return false; } };
        if (isAt('decide')) return {
          start: { text: 'I hear you found something under the clouds that belongs to me. I am a fair man. Fifteen hundred credits, and we forget my collectors ever met you.', choices: [
            { label: 'Deal. Take it.', run: () => { addCredits(1500, 'Sold the cargo key to Vool'); flag('ending', 'vool'); flag('hasCache', false); advance("You sold the Meridian Vow's cargo key to Vool for 1,500 credits."); } },
            { label: "It's not for sale.", next: 'no' },
            loan,
          ] },
          no: { text: 'Then you had better hope the Inspector is as fond of you as I am.', choices: [{ label: 'Goodbye, Vool.' }] },
        };
        if (reached('epilogue')) return { start: { text: flag('ending') === 'vool' ? 'Pleasure doing business, pilot. Come back any time.' : 'You chose the Inspector. Vool remembers.', choices: [loan, { label: 'Goodbye.' }] } };
        return { start: { text: 'Pilot. You look like someone carrying something heavy. Vool helps carry heavy things. For a fee.', choices: [loan, { label: 'Just looking.' }] } };
      },
    },
    {
      id: 'dale', name: 'Inspector Dale', title: 'Spire Security',
      look: { cloth: 0x1c2840, accent: 0xc0c8d0, skin: 0x8a5636, hat: 'cap' },
      pos: V(-8, P, 49), facing: 0,
      news: () => isAt('decide'),
      talk: () => {
        if (isAt('decide')) return {
          start: { text: "So you're the pilot who found the Meridian Vow's key. Hand it over and the cargo goes back to the families who lost people on her. There's a reward: six hundred credits, and my thanks.", choices: [
            { label: "Here. It's yours.", run: () => { addCredits(600, 'Reward from Spire Security'); flag('ending', 'dale'); flag('hasCache', false); advance("You handed the key to Inspector Dale. The Meridian Vow's cargo will go back to the families."); } },
            { label: 'Vool offered more.', next: 'more' },
          ] },
          more: { text: "I'm sure he did. Money's money. But think about who's left holding the bill when Vool owns everything up here.", choices: [{ label: "I'll think about it." }] },
        };
        if (reached('epilogue')) return { start: { text: flag('ending') === 'dale' ? 'Good work, pilot. The families sent their thanks.' : 'I know what you did. Watch yourself in the Galleria.' } };
        return {
          start: { text: 'Inspector Corrin Dale, Spire Security. Keep out of the restricted lanes and we’ll get along.', choices: [{ label: 'Anything I should know?', next: 'd2' }, { label: 'Understood.' }] },
          d2: { text: 'Vool’s crew have been busy lately. If anyone threatens you, mention my name. It carries weight, most days.', choices: [{ label: "I'll remember.", run: () => { flag('metDale', true); } }] },
        };
      },
    },
    {
      id: 'jessa', name: 'Jessa Marr', title: 'Your neighbour, Unit 4406',
      look: { cloth: 0xb04a6a, accent: 0xffd166, skin: 0xf0c8a0, hairColor: 0x8a3a1a },
      pos: V(-20, LEVELS.residences, 30), facing: Math.PI,
      news: () => !favorState('jessa') || (favorState('jessa') === 'active' && flag('hasNoodles')),
      talk: () => {
        const fav = favorState('jessa');
        if (!fav) return {
          start: { text: "Oh! You're the new one in 4407? I'm Jessa, from 4406. I'd do anything for a bowl of noodles, but the lift and I aren't speaking today.", choices: [{ label: "I'll bring you a bowl.", run: () => startFavor('jessa') }, { label: 'Maybe later.' }] },
        };
        if (fav === 'active' && flag('hasNoodles')) return {
          start: { text: "Is that for me? You're a saint. Here, take something for the trouble. And a tip: the viewers on the Skydeck point straight at the Temple.", choices: [{ label: 'Enjoy them.', run: () => { flag('hasNoodles', false); finishFavor('jessa'); } }] },
        };
        if (fav === 'active') return { start: { text: 'Orbital Noodles, on the Promenade. Spicy, if they have it!' } };
        return { start: { text: ['The rent droid knocked twice today. Twice!', 'Have you been down to the market? Zeela fixed my holo for nothing.', 'Some nights I sit out here and count speeders. I never get past a thousand.'][state.day % 3] } };
      },
    },
    {
      id: 'imani', name: 'Dr. Imani Sola', title: 'Skywatch Survey',
      look: { cloth: 0xe8e8e0, accent: 0x7feaff, skin: 0x5c3a24, hat: 'band', coat: true },
      pos: V(-20, LEVELS.skydeck, -79), facing: Math.PI,
      news: () => !favorState('imani') || (favorState('imani') === 'active' && flag('sawTemple') && flag('sawDome')),
      talk: () => {
        const fav = favorState('imani');
        if (!fav) return {
          start: { text: 'Dr. Imani Sola, Skywatch Survey. I map the skyline: every spire, every lane. My survey drone is grounded. Would you fly a loop past the Temple and the Assembly Dome? Within three hundred and fifty metres of each.', choices: [{ label: "I'll fly it.", run: () => startFavor('imani') }, { label: 'What is the Temple?', next: 'temple' }] },
          temple: { text: 'The oldest building above the clouds. Five spires, and nobody alive remembers who built it. You can see it from the viewers here, north-west of the Spire.', choices: [{ label: "I'll fly the survey.", run: () => startFavor('imani') }, { label: 'Another time.' }] },
        };
        if (fav === 'active' && flag('sawTemple') && flag('sawDome')) return {
          start: { text: 'Both landmarks logged. Beautiful data. Your fee, pilot, and the Survey’s thanks.', choices: [{ label: 'Any time.', run: () => finishFavor('imani') }] },
        };
        if (fav === 'active') return { start: { text: `So far: Temple ${flag('sawTemple') ? 'logged' : 'not yet'}, Assembly Dome ${flag('sawDome') ? 'logged' : 'not yet'}. Within three hundred and fifty metres, please.` } };
        return { start: { text: 'Three moons tonight. On a clear night you can see the orbital docks from here, if you know where to look.' } };
      },
    },
    {
      id: 't77', name: 'T-77', title: 'Dealer droid, Lucky Comet',
      look: { cloth: 0xc0c4c8, accent: 0xd8b048, skin: 0xa8acb0, droid: true },
      pos: V(82, P, 87.6), facing: Math.PI, talkAt: V(86.5, P, 81),
      talk: () => ({
        start: { text: 'Greetings. I am T-77. I deal twenty-one and I never blink.', choices: [{ label: 'Deal me in.', run: () => { ctx.openBlackjack(); return false; } }, { label: 'Do you ever lose?', next: 'lose' }, { label: 'Goodbye.' }] },
        lose: { text: 'Statistically, the house loses forty-nine percent of hands. Emotionally, the house never loses.', choices: [{ label: 'Deal me in.', run: () => { ctx.openBlackjack(); return false; } }, { label: 'Goodbye.' }] },
      }),
    },
    {
      id: 'rusk', name: 'Rusk', title: "Vool's collector",
      look: { cloth: 0x4a2a1a, accent: 0x8a8a8a, skin: 0xc8704a, scale: 1.2, coat: true },
      pos: null, facing: Math.PI,
      visible: () => isAt('collectors'),
      news: () => isAt('collectors'),
      talk: () => {
        const pay = { label: 'Here are 200 credits. You never saw me.', show: () => state.credits >= 200, run: () => { addCredits(-200, "Paid off Vool's collectors"); advance("You paid off Vool's collectors and kept the cargo key."); } };
        const run = { label: 'Make a break for your speeder.', run: () => { ctx.escape(); } };
        return {
          start: { text: 'Well, well. Vool said a little courier might come sniffing around down here. That key belongs to him. Hand it over.', choices: [
            pay,
            { label: "Inspector Dale knows I'm here.", run: () => (flag('metDale') ? 'ok' : 'fail') },
            run,
          ] },
          ok: { text: 'Dale? ... Fine. This isn’t worth a cell. But Vool will hear about you.', choices: [{ label: 'Tell him I said hello.', run: () => advance("You bluffed Vool's collectors with the Inspector's name.") }] },
          fail: { text: 'Dale? He’s never heard of you, courier. Nice try.', choices: [pay, run] },
        };
      },
    },
    {
      id: 'mog', name: 'Mog', title: "Vool's other collector",
      look: { cloth: 0x2a3a2a, accent: 0x8a8a8a, skin: 0x7a6a9a, scale: 1.1, hat: 'cap' },
      pos: null, facing: Math.PI,
      visible: () => isAt('collectors'),
      talk: () => ({ start: { text: 'Talk to Rusk. Rusk does the talking.' } }),
    },
  ];
}

export function createPeople(scene, ctx, shelf) {
  const people = cast(ctx);
  // The collectors wait on the Shelf.
  const rusk = people.find((p) => p.id === 'rusk'), mog = people.find((p) => p.id === 'mog');
  rusk.pos = shelf.center.clone().add(V(3, 0, 4));
  mog.pos = shelf.center.clone().add(V(-3, 0, 6));

  for (const p of people) {
    const model = createHumanoid(p.look);
    p.model = model;
    p.group = model.group;
    p.group.position.copy(p.pos);
    p.group.rotation.y = p.facing;
    p.heading = p.facing;
    scene.add(p.group);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTexture(p.name, p.title), depthWrite: false, transparent: true }));
    tag.scale.set(2.4, 0.6, 1);
    tag.position.y = 2.45;
    p.group.add(tag);
    p.tag = tag;
    const mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTexture(), depthWrite: false, depthTest: false, transparent: true, color: new THREE.Color(2, 2, 2) }));
    mark.position.y = 3.1;
    mark.renderOrder = 10;
    p.group.add(mark);
    p.mark = mark;
    const talkAt = p.talkAt || p.pos;
    where[p.id] = () => (p.talkAt || p.pos);
    addInteract({
      getPos: (v) => v.copy(talkAt),
      radius: 2.6,
      label: `Talk to ${p.name}`,
      action: 'person',
      data: { id: p.id },
      enabled: () => !p.visible || p.visible(),
    });
  }

  const talkTo = (id, sfx) => {
    const p = people.find((q) => q.id === id);
    if (!p) return;
    p.talking = 6;
    converse(p, p.talk(), 'start', sfx);
  };

  const update = (dt, player, camPos, t) => {
    for (const p of people) {
      const vis = !p.visible || p.visible();
      p.group.visible = vis;
      if (!vis) continue;
      const d = camPos.distanceTo(p.group.position);
      p.tag.visible = d < 22;
      p.mark.visible = !!(p.news && p.news());
      if (p.mark.visible) {
        const s = Math.max(0.7, d * 0.035);
        p.mark.scale.set(s, s, 1);
        p.mark.position.y = 3.1 + Math.sin(t * 3) * 0.12 + s * 0.3;
      }
      // Turn to face the player when they come close, otherwise drift back.
      const pd = Math.hypot(player.x - p.pos.x, player.z - p.pos.z);
      const want = pd < 4 && Math.abs(player.y - p.pos.y) < 2 ? Math.atan2(player.x - p.pos.x, player.z - p.pos.z) : p.facing;
      let dh = want - p.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      p.heading += dh * Math.min(1, dt * 4);
      p.group.rotation.y = p.heading;
      if (d < 80) p.model.animate(0, dt);
    }
  };

  return { people, update, talkTo };
}

