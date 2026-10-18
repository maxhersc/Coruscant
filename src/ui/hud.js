import * as THREE from 'three';
import { state, clockString } from '../systems/state.js';

// The heads-up display: clock, credits, needs, prompts, job card, compass,
// flight readout and the waypoint marker.
const $ = (id) => document.getElementById(id);

let lastCredits = null;
const toasts = [];

export function toast(msg, kind = 'info', ms = 4200) {
  const box = $('toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  box.appendChild(el);
  toasts.push(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => {
    el.classList.remove('in');
    setTimeout(() => el.remove(), 400);
  }, ms);
  while (box.children.length > 5) box.firstChild.remove();
}

let locTimer = 0;
let lastZone = null;
export function showLocation(zone) {
  const name = zone ? zone.name : null;
  if (name === lastZone) return;
  lastZone = name;
  if (!zone) return;
  const el = $('location');
  el.querySelector('.loc-name').textContent = zone.name;
  el.querySelector('.loc-sub').textContent = zone.sub || '';
  el.classList.add('show');
  clearTimeout(locTimer);
  locTimer = setTimeout(() => el.classList.remove('show'), 3800);
}

export function setPrompt(text) {
  const el = $('prompt');
  if (!text) { el.classList.remove('show'); return; }
  el.innerHTML = text;
  el.classList.add('show');
}

let speechTimer = 0;
export function speech(who, line) {
  const el = $('speech');
  el.innerHTML = `<b>${who}</b>${line}`;
  el.classList.add('show');
  clearTimeout(speechTimer);
  speechTimer = setTimeout(() => el.classList.remove('show'), 5200);
}

const _v = new THREE.Vector3();
const _c = new THREE.Vector3();
const COMPASS = [
  ['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315],
];

export function updateHUD({ camera, mode, speeder, guide, jobLeft, landmarks }) {
  $('clock').textContent = clockString();
  $('day').textContent = `Day ${state.day}`;
  if (lastCredits !== state.credits) {
    const el = $('credits');
    el.textContent = `${state.credits.toLocaleString()} cr`;
    el.classList.toggle('neg', state.credits < 0);
    if (lastCredits !== null) {
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    }
    lastCredits = state.credits;
  }
  setBar('bar-energy', state.energy);
  setBar('bar-hunger', state.hunger);

  // Flight readout.
  const fl = $('flight');
  if (mode === 'fly') {
    fl.classList.add('show');
    $('spd').textContent = Math.round(Math.abs(speeder.speed) * 3.6);
    $('alt').textContent = Math.round(speeder.pos.y);
    const t = THREE.MathUtils.clamp(speeder.speed / speeder.spec.boost, 0, 1);
    $('thr').style.width = `${t * 100}%`;
  } else fl.classList.remove('show');

  // Compass: bearings clockwise from north, where north is -z and east +x.
  camera.getWorldDirection(_v);
  const heading = (Math.atan2(_v.x, -_v.z) * 180) / Math.PI;
  const strip = $('compass-strip');
  let html = '';
  const place = (deg, label, cls) => {
    let d = deg - heading;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    if (Math.abs(d) > 75) return;
    html += `<span class="${cls}" style="left:${50 + (d / 75) * 50}%">${label}</span>`;
  };
  for (const [l, deg] of COMPASS) place(deg, l, l.length === 1 ? 'cardinal' : 'minor');
  const cam = camera.position;
  for (const lm of landmarks) {
    const deg = (Math.atan2(lm.x - cam.x, cam.z - lm.z) * 180) / Math.PI;
    place(deg, lm.icon, 'mark ' + (lm.cls || ''));
  }
  if (guide) {
    const deg = (Math.atan2(guide.pos.x - cam.x, cam.z - guide.pos.z) * 180) / Math.PI;
    place(deg, '◆', 'mark job');
  }
  strip.innerHTML = html;

  // Job card and waypoint.
  const card = $('job');
  const wp = $('waypoint');
  if (state.job) {
    card.classList.add('show');
    card.querySelector('.job-cargo').textContent = state.job.cargo + (state.job.fragile ? ' · fragile' : '');
    card.querySelector('.job-dest').textContent = `→ ${state.job.dest}`;
    const left = jobLeft;
    const m = Math.floor(Math.abs(left) / 60), s = Math.floor(Math.abs(left) % 60);
    const tEl = card.querySelector('.job-time');
    tEl.textContent = `${left < 0 ? 'LATE ' : ''}${m}h ${String(s).padStart(2, '0')}m`;
    tEl.classList.toggle('late', left < 0);
    card.querySelector('.job-pay').textContent = `${state.job.pay} cr`;
  } else card.classList.remove('show');

  // Waypoint marker and the next step toward it.
  const gd = $('guide');
  if (guide) {
    gd.querySelector('.guide-to').textContent = `◆ ${guide.label}`;
    gd.querySelector('.guide-step').textContent = guide.step || '';
    gd.classList.add('show');
    const dist = cam.distanceTo(guide.pos);
    // In view: the marker sits on the target. Off screen or behind: it rides
    // the screen edge with an arrow showing which way to turn.
    _c.copy(guide.pos).applyMatrix4(camera.matrixWorldInverse);
    _v.copy(guide.pos).project(camera);
    let x = (_v.x * 0.5 + 0.5) * innerWidth, y = (-_v.y * 0.5 + 0.5) * innerHeight;
    const onScreen = _c.z < 0 && x > 40 && x < innerWidth - 40 && y > 70 && y < innerHeight - 50;
    wp.classList.toggle('edge', !onScreen);
    if (!onScreen) {
      let dx = _c.x, dy = -_c.y;
      if (_c.z > 0 && Math.abs(dx) < 1e-3) dx = 1;
      if (_c.z > 0) dy = Math.max(dy, 0); // behind: point along the bottom edge
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      const rx = innerWidth / 2 - 50, ry = innerHeight / 2 - 70;
      const k = Math.min(rx / Math.max(Math.abs(dx), 1e-3), ry / Math.max(Math.abs(dy), 1e-3));
      x = innerWidth / 2 + dx * k;
      y = innerHeight / 2 + dy * k;
      wp.querySelector('.wp-arrow').style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    }
    wp.style.transform = `translate(${x}px, ${y}px)`;
    wp.querySelector('.wp-dist').textContent = dist > 1000 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist)} m`;
    wp.classList.add('show');
  } else {
    wp.classList.remove('show');
    gd.classList.remove('show');
  }
}

function setBar(id, v) {
  const el = $(id);
  el.style.width = `${Math.max(0, Math.min(100, v))}%`;
  el.parentElement.classList.toggle('low', v < 20);
}
