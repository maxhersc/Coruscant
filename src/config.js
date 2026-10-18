// World-wide constants. Units are metres and seconds.

export const CELL = 120;          // city block pitch; streets run on the half-cells
export const GRID = 22;           // city blocks span -GRID..GRID on both axes
export const CITY_HALF = GRID * CELL;
export const FAR_CELL = 260;      // backdrop towers beyond the playable grid
export const FAR_RADIUS = 11000;

// The hub district built around the Spire. Elevator stops, low to high.
export const LEVELS = {
  market: 160,
  promenade: 300,
  residences: 440,
  skydeck: 600,
};

// Traffic and the race course keep clear of these altitudes near the hub.
export const LANE_CLEARANCE = 16;

// Game time: one real second is this many game minutes.
export const TIME_SCALE = 2;
export const START_MINUTES = 18 * 60 + 20; // dusk, the city at its best
export const RENT = 120;
export const START_CREDITS = 500;

export const ABYSS_Y = 60;        // falling below this respawns you
