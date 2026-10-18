// Modal panels (shops, casino tables, terminals). While one is open the game
// keeps running but the player's controls are released.

const listeners = { open: [], close: [] };
let current = null;

export function onPanel(evt, fn) {
  listeners[evt].push(fn);
}

export function isPanelOpen() {
  return !!current;
}

export function openPanel(title, build, opts = {}) {
  closePanel(true);
  const root = document.getElementById('panel');
  root.innerHTML = '';
  root.className = 'panel open' + (opts.wide ? ' wide' : '');
  const head = document.createElement('div');
  head.className = 'panel-head';
  head.innerHTML = `<div><div class="panel-kicker">${opts.kicker || ''}</div><h2>${title}</h2></div>`;
  const close = document.createElement('button');
  close.className = 'btn ghost close';
  close.textContent = 'Close [Esc]';
  close.onclick = () => closePanel();
  head.appendChild(close);
  const body = document.createElement('div');
  body.className = 'panel-body';
  root.append(head, body);
  current = { root, body, onClose: opts.onClose };
  const cleanup = build(body, current);
  if (typeof cleanup === 'function') current.cleanup = cleanup;
  listeners.open.forEach((f) => f());
  return current;
}

export function closePanel(silent = false) {
  if (!current) return;
  const c = current;
  current = null;
  c.root.className = 'panel';
  c.root.innerHTML = '';
  c.cleanup?.();
  c.onClose?.();
  if (!silent) listeners.close.forEach((f) => f());
}

// Small DOM helper: h('div.cls', {onclick}, children...)
export function h(tag, props = {}, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(props || {})) {
    if (k.startsWith('on')) el[k] = v;
    else if (k === 'html') el.innerHTML = v;
    else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

// A bet selector shared by the casino games.
export function betPicker(getCredits, initial = 50) {
  let bet = initial;
  const wrap = h('div.bet');
  const val = h('span.bet-val');
  const render = () => {
    bet = Math.max(1, Math.min(bet, Math.max(1, getCredits())));
    val.textContent = `${bet} cr`;
  };
  wrap.append(
    h('span.label', {}, 'Bet'),
    ...[10, 50, 100, 500].map((n) => h('button.btn.chip', { onclick: () => { bet = n; render(); } }, String(n))),
    h('button.btn.chip', { onclick: () => { bet = Math.max(1, Math.floor(getCredits() / 2)); render(); } }, '½'),
    h('button.btn.chip', { onclick: () => { bet = Math.max(1, getCredits()); render(); } }, 'All in'),
    val
  );
  render();
  return { el: wrap, get: () => { render(); return bet; }, refresh: render };
}
