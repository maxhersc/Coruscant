import { state } from './state.js';

const KEY = 'coruscant-save-v1';

export function saveGame(extra) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ state, extra, at: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    Object.assign(state, data.state);
    return data.extra || {};
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Storage may be blocked; nothing to clear.
  }
}
