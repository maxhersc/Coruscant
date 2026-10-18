// Player settings, kept in this browser. Every read and write tolerates
// storage being unavailable; the defaults then apply.

const KEY = 'coruscant-settings-v1';

export const settings = {
  sensitivity: 1,      // mouse look multiplier
  invertFlight: false, // pull back on the mouse to climb
  quality: 'auto',     // auto | high | medium | low
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(settings, JSON.parse(raw));
  } catch {
    // Storage blocked: keep defaults.
  }
  return settings;
}

export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked: settings last for this session only.
  }
}

// Quality levels, high to low: render resolution scale, bloom, reflections.
export const QUALITY = [
  { name: 'high', pixelRatio: 1.5, bloom: true, reflections: true },
  { name: 'medium', pixelRatio: 1, bloom: true, reflections: true },
  { name: 'low', pixelRatio: 0.75, bloom: false, reflections: false },
];
