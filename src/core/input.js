// Keyboard and mouse state. Mouse movement accumulates between frames and is
// consumed once per frame.

export const input = {
  keys: new Set(),
  pressed: new Set(),
  mouseDX: 0,
  mouseDY: 0,
  wheel: 0,
  locked: false,
  lockFailed: false, // the browser refused pointer lock: look by dragging instead
  mouseDown: false,
  sensitivity: 1,
  enabled: true,
};

export function initInput(canvas, onLockChange) {
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (!input.keys.has(e.code)) input.pressed.add(e.code);
    input.keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => input.keys.clear());
  window.addEventListener('mousemove', (e) => {
    if (!input.locked && !(input.lockFailed && input.mouseDown)) return;
    input.mouseDX += (e.movementX || 0) * input.sensitivity;
    input.mouseDY += (e.movementY || 0) * input.sensitivity;
  });
  window.addEventListener('wheel', (e) => { input.wheel += Math.sign(e.deltaY); }, { passive: true });
  canvas.addEventListener('mousedown', () => { input.mouseDown = true; });
  window.addEventListener('mouseup', () => { input.mouseDown = false; });
  document.addEventListener('pointerlockerror', () => { input.lockFailed = true; });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
    onLockChange?.(input.locked);
  });
}

export function requestLock(canvas) {
  try {
    if (!canvas.requestPointerLock) { input.lockFailed = true; return; }
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => { input.lockFailed = true; });
  } catch {
    // Pointer lock can be refused (sandboxed frames); fall back to drag-to-look.
    input.lockFailed = true;
  }
}

export function key(code) {
  return input.enabled && input.keys.has(code);
}

export function pressed(code) {
  return input.enabled && input.pressed.has(code);
}

export function endFrame() {
  input.pressed.clear();
  input.mouseDX = 0;
  input.mouseDY = 0;
  input.wheel = 0;
}
