// What each rooftop deck is. Every deck belongs to a kind of place (a clinic,
// a sky farm, a nightclub...), has its own venue name, and the cargo flown to
// it is the cargo that place would order. Pure data: the world builds the
// look from `decor`, the jobs read `cargo`, and the trader reads `wants`.

// cargo: [name, pay multiplier, tags]. Tags: fragile (collisions damage it),
// heavy (the speeder flies slower), rush (it will not keep: a tight deadline
// that pays far better).
export const THEMES = {
  clinic: {
    label: 'Medical centre', neon: 'neonCyan', decor: 'clinic', wants: 'tech',
    sells: ['medpac', 'gel', 'masks', 'stim'],
    cargo: [
      ['Medical supplies', 1.0, []],
      ['Cryo-sealed donor organ', 1.5, ['rush', 'fragile']],
      ['Chilled blood plasma', 1.3, ['rush']],
      ['Drums of healing gel', 1.2, ['heavy']],
      ['Surgical droid arm', 1.3, ['fragile']],
      ['Crate of filter masks', 0.9, []],
    ],
    thanks: ['The duty medic signs for it without looking up. "Ward six. Go."', 'A med droid scans the seal and chirps. Somebody upstairs will live because of this.', '"Finally. We have been rationing since breakfast."'],
  },
  garden: {
    label: 'Sky farm', neon: 'neonGreen', decor: 'garden', wants: 'tech',
    sells: ['fruit', 'mealcrate', 'cafbeans', 'ration'],
    cargo: [
      ['Seed vault canisters', 1.1, ['fragile']],
      ['Sacks of soil substrate', 1.0, ['heavy']],
      ['Pollinator drones', 1.3, ['fragile']],
      ['Hydroponic pump', 1.2, ['heavy']],
      ['Hive of glow-moths', 1.4, ['rush', 'fragile']],
      ['Grow-lamp panels', 1.0, []],
    ],
    thanks: ['The farmer wipes soil off a glove to shake your hand. It smells like rain up here.', '"Put it by the beans. No, the other beans."', 'A gardening droid takes the crate and hums at the seedlings.'],
  },
  noble: {
    label: 'Noble estate', neon: 'neonAmber', decor: 'noble', wants: 'curio',
    sells: ['wine', 'perfume', 'silk'],
    cargo: [
      ['Case of vintage wine', 1.3, ['fragile']],
      ['Commissioned portrait', 1.4, ['fragile']],
      ['Gown for tonight\'s gala', 1.5, ['rush']],
      ['Locked jewel case', 1.6, []],
      ['Imported marble bust', 1.4, ['heavy', 'fragile']],
      ['Invitations, hand-inked', 1.1, []],
    ],
    thanks: ['A butler droid takes it with two fingers, as if you might be catching.', '"The tradesman\'s entrance is round the back. But I suppose this once."', 'Somewhere inside a string quartet stops, then starts again.'],
  },
  club: {
    label: 'Nightclub', neon: 'neonMagenta', decor: 'club', wants: 'luxury', shady: true,
    sells: ['cola', 'stim', 'jerky', 'holopet'],
    cargo: [
      ['Speaker stack', 1.2, ['heavy']],
      ['Kegs of fizz', 1.1, ['heavy']],
      ['The DJ\'s lost record case', 1.5, ['rush']],
      ['Crate of glow sticks', 0.9, []],
      ['Holo-light rig', 1.3, ['fragile']],
      ['Ice for the bar', 1.2, ['rush']],
    ],
    thanks: ['The bouncer nods you past the queue. The bass hits you in the chest.', '"Tonight is going to be legendary. Probably."', 'Someone in sequins hugs you, takes the crate and vanishes onto the floor.'],
  },
  yard: {
    label: 'Shipyard', neon: 'neonAmber', decor: 'yard', wants: 'tech', shady: true,
    sells: ['tools', 'fabric', 'masks', 'medpac'],
    cargo: [
      ['Hyperdrive coupling', 1.2, ['heavy']],
      ['Engine block', 1.3, ['heavy']],
      ['Canisters of welding gas', 1.3, ['fragile']],
      ['Hull plates', 1.1, ['heavy']],
      ['Replacement nav sensor', 1.2, []],
      ['Coolant for a hot reactor', 1.5, ['rush']],
    ],
    thanks: ['A welder flips up a visor. "About time. That freighter is not going to fix itself."', 'The yard boss signs with a grease pencil and goes back to shouting.', 'A loader droid lifts the crate as if it weighs nothing. It does not.'],
  },
  data: {
    label: 'Data exchange', neon: 'neonCyan', decor: 'data', wants: 'food', shady: true,
    sells: ['blankchip', 'enckey', 'comlink', 'holoemitter'],
    cargo: [
      ['Encrypted datachips', 1.2, []],
      ['Server blades', 1.2, ['fragile']],
      ['Quantum key, one use', 1.6, ['rush']],
      ['Backup cores', 1.1, ['heavy']],
      ['Signal amplifier', 1.0, []],
      ['Market prices, minutes old', 1.5, ['rush']],
    ],
    thanks: ['A tech with too many earpieces plugs the chip in before you have let go of it.', '"Clean. Good. You did not plug it into anything, right?"', 'The racks hum louder for a second, like they are pleased.'],
  },
  shrine: {
    label: 'Temple shrine', neon: 'neonAmber', decor: 'shrine', wants: 'goods',
    sells: ['oldcoin', 'idol', 'starmap'],
    cargo: [
      ['Bundles of incense', 0.9, []],
      ['Sacred texts', 1.3, ['fragile']],
      ['Ceremonial bell', 1.3, ['heavy']],
      ['Relic in a sealed casket', 1.6, ['fragile']],
      ['Lantern oil', 1.0, []],
      ['Offerings for the dawn rite', 1.4, ['rush']],
    ],
    thanks: ['A robed keeper bows and lights a lantern for your journey.', '"The city forgets to be quiet. Thank you for bringing a little peace."', 'Bells ring somewhere above you. The keeper says it is a coincidence.'],
  },
  diner: {
    label: 'Food court', neon: 'neonAmber', decor: 'diner', wants: 'goods',
    sells: ['noodlecup', 'jerky', 'fruit', 'cola', 'ration'],
    cargo: [
      ['Hot meal order', 1.3, ['rush']],
      ['Wedding cake, three tiers', 1.4, ['fragile', 'rush']],
      ['Live spice-eels', 1.3, ['rush']],
      ['Sacks of rice flour', 1.0, ['heavy']],
      ['Crate of Nova-Cola', 0.9, ['heavy']],
      ['A new noodle press', 1.1, []],
    ],
    thanks: ['The cook hands you a dumpling for the road. It is very good.', '"Order up! Oh, it is you. Even better."', 'The dinner rush roars around you. Nobody notices, which is how you know you were on time.'],
  },
  embassy: {
    label: 'Embassy', neon: 'neonWhite', decor: 'embassy', wants: 'luxury', strict: true,
    sells: ['comlink', 'enckey', 'masks'],
    cargo: [
      ['Diplomatic pouch', 1.3, []],
      ['Sealed court summons', 1.2, []],
      ['Treaty draft, for signing today', 1.6, ['rush']],
      ['Gifts for a visiting envoy', 1.3, ['fragile']],
      ['Archive crates', 1.0, ['heavy']],
      ['Encrypted cipher book', 1.4, []],
    ],
    thanks: ['A protocol droid thanks you in nine languages, then in a tenth to be safe.', 'Two guards check your papers twice before they sign for it.', '"The ambassador will not thank you personally. Consider this that."'],
  },
  gallery: {
    label: 'Art gallery', neon: 'neonMagenta', decor: 'gallery', wants: 'luxury',
    sells: ['shard', 'holopet', 'droidhead', 'oldcoin'],
    cargo: [
      ['Glass sculpture', 1.5, ['fragile']],
      ['Holo-painting', 1.3, ['fragile']],
      ['Drums of paint', 1.0, ['heavy']],
      ['A sculptor\'s chisels', 1.0, []],
      ['Piece for tonight\'s opening', 1.5, ['rush', 'fragile']],
      ['Packing crates of frames', 1.1, ['heavy']],
    ],
    thanks: ['The curator circles the crate twice before nodding. "Acceptable."', '"Do you see it? The way the light falls?" You see a crate.', 'A critic is already writing a review of the packaging.'],
  },
};

// Every deck, its kind of place and the name of what stands on it.
export const DECK_PLACES = {
  'Halcyon Deck': ['clinic', 'Halcyon Mercy Ward'],
  'Telmar Court': ['clinic', 'Telmar Trauma Centre'],
  'Lumen Yard': ['clinic', 'Lumen Clinic'],
  'Saffi Deck': ['garden', 'Saffi Sky Farm'],
  'Felucca Deck': ['garden', 'Felucca Hydroponics'],
  'Rhoan Terrace': ['garden', 'Rhoan Orchard'],
  'Kessa Heights': ['noble', 'House Kessa'],
  'Vesh Heights': ['noble', 'The Vesh Residence'],
  'Azure Shelf': ['noble', 'Azure Garden Club'],
  'Ember Landing': ['club', 'Club Ember'],
  'Cindral Point': ['club', 'The Cinder Room'],
  'Mezza Ring': ['club', 'Ring Lounge'],
  'Galt Platform': ['yard', 'Galt Drydock'],
  'Pellat Yard': ['yard', 'Pellat Salvage'],
  'Krayt Shelf': ['yard', 'Shelf Engine Works'],
  'Quorin Deck': ['data', 'Quorin Data Exchange'],
  'Ithra Plaza': ['data', 'Ithra Relay Station'],
  'Drayne Point': ['data', 'Drayne Archive'],
  'Sollus Rooftop': ['shrine', 'Sollus Shrine'],
  'Maro Overlook': ['shrine', 'Maro Lantern Temple'],
  'Tamsk Overlook': ['shrine', 'Tamsk Meditation Garden'],
  'Uln Market Roof': ['diner', 'Uln Night Market'],
  'Corvan Landing': ['diner', 'Corvan Grill'],
  'Nimbus Pad': ['diner', 'Nimbus Noodle Bar'],
  'Zentha Plaza': ['embassy', 'Zentha Consulate'],
  'Obel Terrace': ['embassy', 'Obel Trade Mission'],
  'Varn Terrace': ['embassy', 'Varn Embassy'],
  'Oxen Spire Deck': ['gallery', 'Oxen Gallery'],
  'Brask Lookout': ['gallery', 'Lookout Sculpture Park'],
  'Ondrel Spur': ['gallery', "Ondrel Collectors' Hall"],
};

// The place a deck name stands for, with a fallback for unknown names.
export function placeOf(deckName) {
  const [theme, venue] = DECK_PLACES[deckName] || ['diner', deckName];
  return { theme, venue, ...THEMES[theme] };
}
