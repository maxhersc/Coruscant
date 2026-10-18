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

`M` map and places · `H` help · `O` settings · `Esc` close a panel or release the mouse.

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
  terminal and locals.
- **Landmarks**: the Assembly Dome, the five-spired Temple and seven monolith
  towers over 1.5 km tall.
- **A crowd of about 600** people and droids who wander, stop, step aside and
  talk to you.
- **Weather and light**: a cloud deck wraps the lower city, lit by the sun
  by day and by the city's glow at night, and searchlights sweep the night sky.
- **Day and night**: a 12-minute day. Dusk is when the city looks its best.

## Living there

- **Needs**: hunger and energy fall over time. Eat at the stalls, sleep in
  your bed. Run either out and you slow down; run out of energy and you
  collapse, and a medical droid bills you.
- **Rent**: 120 credits at 06:00 every day.
- **Work**: take courier jobs at the Courier Guild or any deck terminal. Land
  at the destination deck and use its terminal. Early deliveries pay a bonus,
  late ones are docked, and fragile cargo loses value with every collision.
- **Betting** (in-game credits only): roulette, twenty-one, slots and Chance
  Cubes. Skyrace runs every few minutes: six pilots fly three laps of the
  streets around the Spire. Bet at the casino booth, then watch from the
  promenade or chase it in your speeder.
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
    district.js        the Spire hub's four levels and the rooftop decks
    elevator.js        the glass lift
    props.js           prop builders (rails, rooms, stalls, signs, pads)
    ads.js, beacons.js, landmarks.js, batch.js
  npc/                 the crowd (instanced, with swinging limbs) and the player model
  player/              walking, speeder flight, camera
  systems/             time, needs, money, jobs, shops, saving
  casino/              table games and Skyrace
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
sleep, settings, wayfinding and automatic quality.

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
