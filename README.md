# Coruscant

An open-world life in a planet-wide city, in the browser. You live as one
person among billions: walk the promenades, ride the glass lift, fly your
speeder through the skylanes, run courier jobs to earn credits, eat, sleep,
pay rent, and lose it all at the Lucky Comet casino.

Built with [three.js](https://threejs.org) and [Vite](https://vite.dev). No
art assets: every tower, window, sign, vehicle and sound is generated in code.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
```

`npm run build` writes a static site to `dist/` that any web server can host.

Click to capture the mouse. `Esc` releases it, and the game pauses until you
click again.

## Controls

| On foot | Flying |
|---|---|
| `W A S D` walk, `Shift` run, `Space` jump | `W` throttle, `S` brake, `Shift` boost |
| Mouse look, wheel zoom | Mouse steer, `A D` strafe |
| `E` interact / talk | `Space` rise, `C` descend |
| `F` board your speeder, `V` call it to the nearest pad (10 cr) | `F` land (slow down over a floor first) |

`J` journal · `I` cargo · `M` map and places · `H` help · `O` settings · `Esc` close a panel or release the mouse.

**Finding your way**: press `M`, pick a place from the list (or click it on
the map), and follow the pink ◆ marker and light pillar. The banner under the
compass tells you the next step: take the lift to another level, go to your
speeder, or land at a particular pad. Each lift landing also has a floor
directory. Scroll to zoom the map and drag to pan.

Settings (`O`) has mouse sensitivity, inverted flight pitch and graphics
quality. On **Auto**, the game measures its frame rate and lowers resolution
and glow if it drops below 40 fps, raising them again when there is headroom.

## The city

- **About 13,000 towers** on a 45 × 45 block grid, plus a backdrop ring out to
  11 km. Every window is procedural: lit or dark, blinds, silhouettes,
  lights that change through the night. Not all of them are boxes: tapering
  needles girdled by glowing halo rings, saucer towers (a wide disc and dome on
  a thin stem), twin towers joined by skybridges, ziggurats, three-sided
  blades, hexagonal and domed round towers.
- **About 14,000 craft on the skylanes.** Their positions are computed on the
  GPU from lane and clock, so the whole fleet costs two draw calls. Air
  taxis land on pads, wait and take off again. Police patrol with light bars.
- **The Spire hub**, four public levels joined by a glass lift:
  - *Galleria Market* (160): stalls, the Low Orbit cantina, Chance Cubes dice,
    Vool's Credit (a loan shark).
  - *Spire Promenade* (300): the Lucky Comet Casino, the Skyline Food Court,
    the Courier Guild, the Jump Station speeder dealer, four landing pads.
  - *Skyhaven Residences* (440): your apartment, Unit 4407.
  - *Skydeck* (600): viewers looking out over the city.
- **30 rooftop decks** across the city, each with a pad, a kiosk, a courier
  terminal and locals, and each its own kind of place with its own floor,
  landmark and name: medical centres under green crosses, sky farms with
  glasshouses, noble estates with fountains, nightclubs under a turning
  holo-ring, shipyards with cranes, data exchanges with dishes and server
  racks, temple shrines, food courts, embassies flying flags, and art
  galleries.
- **Landmarks**: the Assembly Dome, the five-spired Temple and seven monolith
  towers over 1.5 km tall.
- **A crowd of about 600** people and droids who wander, stop, step aside and
  talk to you.
- **Weather and light**: a cloud deck wraps the lower city, lit by the sun
  by day and by the city's glow at night, and searchlights sweep the night sky.
- **Day and night**: a 12-minute day. Dusk is when the city looks its best.

## The story: The Sealed Case

Start by meeting Nella Ves, the dispatcher at the Courier Guild. One delivery
later she hands you a sealed case for a contact on a rooftop deck, and things
go sideways from there: a hooded stranger, an old pilot who remembers a lost
freighter, a decoder chip from the market, a flight down through the clouds
to the Undercity Shelf, and Vool's collectors waiting for you. You choose how
to deal with them (pay, bluff or run) and who gets what you found (the
Inspector or the loan shark). Press `J` for your journal; the ◆ waypoint
always points at your next objective.

**People** (a `!` over someone's head means they have something for you):
Nella Ves (Courier Guild), Old Brask (Low Orbit cantina), Zeela (Holo Repair,
Galleria Market), Vool (Vool's Credit), Inspector Dale (by the Spire doors),
Jessa Marr (your neighbour), Dr. Imani Sola (Skydeck) and T-77 (the dealer
droid). Some ask favours: noodles for Jessa, a survey flight past the Temple
and the Dome for Dr. Sola, and beating Brask's Gate Run record.

**Gate Run**: a time trial through the twelve Skyrace gates around the Spire.
Arm it at the kiosk by the East Pad; the next gate glows amber. Under par pays
100 cr once a day.

## Living there

- **Needs**: hunger and energy fall over time. Eat at the stalls, sleep in
  your bed. Run either out and you slow down; run out of energy and you
  collapse, and a medical droid bills you.
- **Rent**: 120 credits at 06:00 every day.
- **Work**: take courier jobs at the Courier Guild or any deck terminal, land
  at the destination and use its terminal. The cargo suits the place it is
  going: donor organs to clinics, kegs and speaker stacks to clubs, engine
  blocks to shipyards, relics to shrines. Jobs come in kinds:
  - *Parcel*: the everyday run.
  - *Express*: cargo that will not keep. A tight clock, nearly double pay, and
    a quarter of the fee if it arrives late.
  - *Heavy freight*: pays well, but the speeder flies 30% slower with it.
  - *Route*: two or three drops in a row across the city, paid as you go. It
    takes a while, and it pays the most of the legal work.
  - *Passenger*: a countess, an envoy, a DJ late for a set, a surgeon, a pair
    of newlyweds... They talk while you fly and tip for a smooth ride; every
    bump costs you the tip.
  - *Contraband*: smuggling runs from Sable, the fixer on the Undercity Shelf,
    and sometimes under the counter at nightclubs, shipyards and data
    exchanges. They pay three times the Guild rate.
  Early deliveries pay a bonus, late ones are docked, and fragile cargo loses
  value with every collision.
- **Spire Security**, and how to get them after you. Patrols scan anything
  that flies near them, and the embassies scan the air around their decks:
  carry contraband (a smuggling job, or spice in your hold) and the scan meter
  fills. Fill it, honk at a patrol (`G`), ram one, or boost past one flat out,
  and you are wanted. The wanted level runs from one star to three: it rises the
  longer a chase lasts, every star brings another patrol in, faster, and
  pursuers ram you and fire stun bolts that knock your speed away. Lose them by
  getting far enough away, by breaking their line of sight behind towers, or by
  diving under the clouds, where they will not follow, and keeping it up for a
  few seconds; escaping a long chase earns street cred in credits. If one stays
  on your tail it pulls you over: submit (fine, contraband seized, and at three
  stars a night in a cell), offer a "processing fee" (it might work), or hit
  the boost and run, once. While you carry contraband the map shows every
  patrol and its scanner's reach. A scanner jammer, a shadow cloak, the Ghost
  Runner, a diplomatic transponder and a shrine fortune all shrink that reach;
  your own hideout, or slicing your file at a data exchange, ends a chase.
- **Inside buildings**: every deck tower's top storey is a real floor you
  walk around in, a hall with window walls looking out over the city. A glass
  lift booth on each deck rides down its shaft into the venue below. Dance at the nightclubs (a rhythm game, with cover charge unless
  you are dressed for it), get patched up or restyled at the clinics, feast or
  take on Big Oro in an eating contest at the food courts, play the arcade
  cabinet or slice security grids at the data exchanges, meditate or have your
  fortune told at the shrines (a day-long bonus), play the high table at the
  noble salons and buy permits at the embassies (both formal dress only), buy
  art at the galleries, use the parts counter and paint shop at the shipyards,
  and pick fruit at the sky farms. On the Galleria Market's north side three
  shops are rooms you walk into through open doors: **Threads** (clothes), the
  **Neon Arcade** (Skylane Dodger, Holo Poker, slicing, a dance machine) and
  **Skyline Realty** (homes). Patrols cannot follow you indoors.
- **Clothes that change how you play**, from Threads: a neon street jacket
  (clubs let you in free and you dance better), a runner suit (run 30% faster,
  jump higher), a flight suit (sharper steering, free fall-catch), a tailored
  suit or silk robe (formal: dress codes, bigger passenger tips, better
  bribes), a shadow cloak (harder to scan), bounty plate (stun bolts and rams
  hurt half as much); hats from a pilot cap to a floating crown of lights; and
  on your back a cape, glider wings (hold `Space` while falling to glide off a
  deck) or a jump pack (hold `Space` in the air to fly). The clinic changes
  your skin tone and hair colour.
- **Homes**: an Undercity Hideout (chases end when you reach it), a
  Spire-view Penthouse with a hot tub, a Floating Villa on an anti-grav
  platform 1.4 km up with a pool (guests pay 90 cr a day), and the Monolith
  Crown on top of a monolith (tours pay 180 cr a day). Every home has a bed, a
  wardrobe, a landing pad and walls for the art and glowing plants you buy.
  Buying your first ends your Skyhaven rent.
- **Betting** (in-game credits only): roulette, twenty-one, slots, Chance
  Cubes and Holo Poker (jacks or better; the noble salons run a high table). Skyrace runs every few minutes: six pilots fly three laps of the
  streets around the Spire. Bet at the casino booth, then watch from the
  promenade or chase it in your speeder.
- **Trade**: 40 kinds of goods in seven categories (food, tech, luxury, goods
  and medicine, curios, speeder parts, and contraband spice). Every shop both
  sells and buys: the Galleria Market stalls, the Skyline Emporium on the
  Promenade, the parts counter at Jump Station, a trader on every rooftop deck
  and a black market on the Undercity Shelf. Each shop pays more for some kinds
  of goods than others, every price drifts day to day, and each deck trader
  badly wants one thing, so buying in one place and selling in another pays.
  Your speeder carries 30 items; press `I` for your cargo hold to eat, use,
  install or drop things. Speeder parts install for more speed, more cargo
  space or a plated hull that protects fragile deliveries.
- **Speeders**: start with the Mk-II Courier and work up: the Vexa Sport, the
  Bulkhead Hauler (+60 cargo, heavy freight does not slow it), the Razor
  Skimmer (a fast bike, hard on fragile cargo), the Zenith Interceptor, the
  Aurelia Cruiser sky yacht (passengers tip half as much again), the Ghost
  Runner (scanners reach half as far) and the Comet GT, the fastest thing in
  the city. Paint any of them at the dealer.
- **Loans**: Vool lends fast. Miss the due date and his collectors take what
  you owe and leave you bruised.
- The game saves to your browser every minute and whenever you sleep.

## Code map

```
src/
  main.js              boot, game loop, modes, interactions
  config.js            world constants
  core/                seeded RNG, box collision world, input
  world/
    env.js             shared sky/fog uniforms, time-of-day palette
    sky.js             sky dome: gradient, clouds, stars, moons
    city.js            procedural city layout and instanced tower meshes
    towerMaterial.js   the one shader every tower uses (windows, bands, fog)
    traffic.js         GPU skylane traffic
    flyers.js          taxis and police that route along the streets
    atmosphere.js      cloud decks and searchlights
    undercity.js       the Undercity Shelf, below the clouds
    district.js        the Spire hub's four levels and the rooftop decks
    deckDecor.js       what stands on each kind of rooftop deck
    interiors.js       the venues inside the deck towers, their lifts, and the market's shops
    homes.js           homes for sale, art and plants for their walls
    elevator.js        the glass lift
    props.js           prop builders (rails, rooms, stalls, signs, pads)
    ads.js, beacons.js, landmarks.js, batch.js
  npc/                 the crowd (instanced, with swinging limbs) and the player model
  player/              walking, speeder flight, camera
  systems/             time, needs, money, jobs, places, police, wardrobe, shops, trade, saving
  casino/              table games, Skyrace and the Gate Run
  games/               Holo Poker, the dance-off, Skylane Dodger, slicing, the eating contest
  story/               the storyline, named people and conversations
  ui/                  HUD, panels, map
  audio/               procedural sound
```

Everything solid is an axis-aligned box in one spatial hash (`core/collision.js`).
Box tops are floors, box sides are walls, and the walker, speeder, crowd and
camera all query the same hash.

## Tests

`tests/gameplay.mjs` drives every system in a real browser through
`window.__game.step()`, which advances the simulation without rendering:
walking, jumping, railings, the lift and its doors, food, courier jobs,
flight and collisions, landing, delivery, the casino, Skyrace, rent, falling,
sleep, settings, wayfinding, the speeder valet, the whole storyline, a
favour, the Gate Run, trading (buy, sell, cargo limit, using and installing
items), the kinds of delivery (routes, heavy freight, passengers and their
tips, smuggling), Spire Security (a scan, a stop, a search, losing a patrol
under the clouds, honking and ramming, rising wanted levels), riding a deck's
lift down into its venue, walking the hall, walking into a shop (cover
charges, dress codes), clothes (the boutique, the runner
suit, the jump pack), homes (rent ends, the hideout ends a chase), cargo by
speeder, Holo Poker hands, slicer grids, the arcade cabinet, and automatic
quality.

```sh
npm run build && npm run preview     # terminal 1
npm test                             # terminal 2 (uses your installed Chrome)
```

Set `CHROME_PATH` to point at another Chromium build.

URL flags for testing: `?nolock` (play without pointer lock), `?autostart`,
`?low` (no bloom, pixel ratio 1), `?nobloom`, `?t=21` (start at 21:00).

## A note on the name

This is a fan-made homage to the city-planet of *Star Wars*. All names inside
the game (districts, brands, characters) are original, but the title is not:
rename it before releasing this publicly.
