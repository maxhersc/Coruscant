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
  lights that change through the night.
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
- **Spire Security**: patrols scan anything that flies near them, and the
  embassies scan the air around their decks. Carry contraband (a smuggling
  job, or spice in your hold) and the scan meter fills; when it is full a
  patrol gives chase. Boost away until you are far enough off for long enough,
  or dive under the clouds, where patrols will not follow. If one stays on your
  tail it pulls you over: submit to a search (fine, cargo seized), offer a
  "processing fee" (it might work), or hit the boost and run, once. While you
  carry contraband the map shows every patrol and its scanner's reach. A
  scanner jammer from the black market halves that reach.
- **Betting** (in-game credits only): roulette, twenty-one, slots and Chance
  Cubes. Skyrace runs every few minutes: six pilots fly three laps of the
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
- **Speeders**: start with the Mk-II Courier and save up for the Vexa Sport or
  the Zenith Interceptor.
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
    elevator.js        the glass lift
    props.js           prop builders (rails, rooms, stalls, signs, pads)
    ads.js, beacons.js, landmarks.js, batch.js
  npc/                 the crowd (instanced, with swinging limbs) and the player model
  player/              walking, speeder flight, camera
  systems/             time, needs, money, jobs, places, police, shops, trade, saving
  casino/              table games, Skyrace and the Gate Run
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
under the clouds) and automatic quality.

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
