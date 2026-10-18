import { CITY_HALF, CELL } from '../config.js';
import { nav, setTarget, clearTarget, levelName } from '../systems/nav.js';

// The map: the whole city drawn once into an offscreen image, shown zoomed
// and panned around you, with every place you can be guided to. Click a place
// (on the map or in the list) to set a waypoint.

let base = null;
const SIZE = 2048;
const toMap = (v) => ((v + CITY_HALF) / (CITY_HALF * 2)) * SIZE;

export function initMap(segs) {
  base = document.createElement('canvas');
  base.width = base.height = SIZE;
  const g = base.getContext('2d');
  g.fillStyle = '#07090f';
  g.fillRect(0, 0, SIZE, SIZE);
  g.strokeStyle = 'rgba(120,180,255,0.08)';
  g.lineWidth = 1;
  for (let v = -CITY_HALF + CELL / 2; v < CITY_HALF; v += CELL) {
    g.beginPath(); g.moveTo(toMap(v), 0); g.lineTo(toMap(v), SIZE); g.stroke();
    g.beginPath(); g.moveTo(0, toMap(v)); g.lineTo(SIZE, toMap(v)); g.stroke();
  }
  const sorted = segs.filter((s) => s.kind !== 'cone' && s.sx > 4).sort((a, b) => a.y + a.sy / 2 - (b.y + b.sy / 2));
  for (const s of sorted) {
    const top = s.y + s.sy / 2;
    const t = Math.min(1, top / 1200);
    g.fillStyle = `hsl(${215 - t * 30}, ${20 + t * 30}%, ${14 + t * 40}%)`;
    const x = toMap(s.x - s.sx / 2), w = (s.sx / (CITY_HALF * 2)) * SIZE;
    const y = toMap(s.z - s.sz / 2), h = (s.sz / (CITY_HALF * 2)) * SIZE;
    if (s.kind === 'cyl') {
      g.beginPath();
      g.arc(x + w / 2, y + h / 2, w / 2, 0, Math.PI * 2);
      g.fill();
    } else g.fillRect(x, y, w, h);
  }
  // The hub's walkable levels, outlined.
  g.strokeStyle = 'rgba(255,209,102,0.7)';
  g.lineWidth = 2;
  for (const half of [100, 85, 70]) g.strokeRect(toMap(-half), toMap(-half), toMap(half) - toMap(-half), toMap(half) - toMap(-half));
}

const view = { zoom: 12, cx: 0, cz: 0, follow: true };
let canvas = null, drag = null, hits = [], onPick = null;

export function setupMap(canvasEl, listEl, pick) {
  canvas = canvasEl;
  onPick = pick;
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    view.zoom = Math.min(40, Math.max(1, view.zoom * (e.deltaY < 0 ? 1.25 : 0.8)));
  }, { passive: false });
  canvas.addEventListener('mousedown', (e) => { drag = { x: e.clientX, y: e.clientY, cx: view.cx, cz: view.cz, moved: false }; });
  window.addEventListener('mousemove', (e) => {
    if (!drag) return;
    const k = (CITY_HALF * 2) / (canvas.clientWidth * view.zoom);
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    view.cx = drag.cx - dx * k;
    view.cz = drag.cz - dy * k;
    view.follow = false;
  });
  window.addEventListener('mouseup', (e) => {
    if (drag && !drag.moved && e.target === canvas) {
      const r = canvas.getBoundingClientRect();
      const px = (e.clientX - r.left) * devicePixelRatio, py = (e.clientY - r.top) * devicePixelRatio;
      let best = null, bd = 18 * devicePixelRatio;
      for (const hit of hits) {
        const d = Math.hypot(hit.x - px, hit.y - py);
        if (d < bd) { bd = d; best = hit.place; }
      }
      if (best) onPick(best);
    }
    drag = null;
  });
  return {
    fillList: (places) => fillList(listEl, places),
    recenter: () => { view.follow = true; },
  };
}

function fillList(listEl, places) {
  listEl.replaceChildren();
  const groups = [...new Set(places.map((p) => p.group))];
  if (nav.target) {
    const b = document.createElement('button');
    b.className = 'btn ghost place-clear';
    b.textContent = `Clear waypoint: ${nav.target.name}`;
    b.onclick = () => { clearTarget(); fillList(listEl, places); };
    listEl.append(b);
  }
  for (const grp of groups) {
    const h = document.createElement('div');
    h.className = 'place-group';
    h.textContent = grp;
    listEl.append(h);
    for (const p of places.filter((q) => q.group === grp)) {
      const b = document.createElement('button');
      b.className = 'place' + (nav.target === p ? ' active' : '');
      const sub = p.level ? `${levelName(p.level)} · ${p.hint}` : p.hint;
      b.innerHTML = `<b>${p.name}</b><span>${sub}</span>`;
      b.onclick = () => onPick(p);
      listEl.append(b);
    }
  }
}

export function drawMap({ player, speeder, flying, places, target }) {
  const g = canvas.getContext('2d');
  const W = (canvas.width = canvas.clientWidth * devicePixelRatio);
  const H = (canvas.height = canvas.clientHeight * devicePixelRatio);
  if (view.follow) { view.cx = player.x; view.cz = player.z; }
  // World metres per screen pixel.
  const mpp = (CITY_HALF * 2) / (Math.min(W, H) * view.zoom);
  const P = (x, z) => [W / 2 + (x - view.cx) / mpp, H / 2 + (z - view.cz) / mpp];
  g.fillStyle = '#05070c';
  g.fillRect(0, 0, W, H);
  // Source rectangle of the base image under the view.
  const [x0, y0] = [toMap(view.cx - (W / 2) * mpp), toMap(view.cz - (H / 2) * mpp)];
  const sw = (W * mpp * SIZE) / (CITY_HALF * 2), sh = (H * mpp * SIZE) / (CITY_HALF * 2);
  g.imageSmoothingEnabled = view.zoom < 8;
  g.drawImage(base, x0, y0, sw, sh, 0, 0, W, H);

  const dpr = devicePixelRatio;
  g.textAlign = 'center';
  hits = [];
  const dot = (p, color, r = 5) => {
    const [px, py] = P(p.pos.x, p.pos.z);
    if (px < -40 || py < -40 || px > W + 40 || py > H + 40) return null;
    g.fillStyle = color;
    g.beginPath(); g.arc(px, py, r * dpr, 0, Math.PI * 2); g.fill();
    hits.push({ x: px, y: py, place: p });
    return [px, py];
  };
  // Place labels. Hub places show once zoomed in; those on your own level
  // come first, other levels are dimmed, and a label that would overlap one
  // already drawn is left out (its dot stays, and it is in the list).
  const showHub = view.zoom >= 10;
  g.font = `600 ${Math.round(11 * dpr)}px system-ui, sans-serif`;
  const isTarget = (p) => target === p || (target && target.name === p.name);
  const sameLevel = (p) => p.level == null || Math.abs(p.level - player.y) < 4;
  const ordered = places
    .filter((p) => p.group !== 'You' && (p.group !== 'Spire hub' || showHub))
    .sort((a, b) => (isTarget(b) - isTarget(a)) || (sameLevel(b) - sameLevel(a)));
  // Your own label is drawn last but its space is reserved first.
  const [mx, my] = P(player.x, player.z);
  const youW = g.measureText('You · 000 m').width;
  const taken = [[mx - youW / 2, my + 8 * dpr, youW, 14 * dpr], [mx - 10 * dpr, my - 10 * dpr, 20 * dpr, 20 * dpr]];
  for (const p of ordered) {
    const tgt = isTarget(p);
    const near = sameLevel(p);
    g.globalAlpha = tgt || near ? 1 : 0.45;
    const color = tgt ? '#ff7ac0' : p.group === 'Rooftop decks' ? '#7feaff' : p.group === 'Landmarks' ? '#c0c8d0' : '#ffd166';
    const at = dot(p, color, tgt ? 7 : 4.5);
    if (at) {
      const text = p.name + (p.level != null && !near ? ` (${p.level} m)` : '');
      const w = g.measureText(text).width, hgt = 13 * dpr;
      const rect = [at[0] - w / 2, at[1] - 9 * dpr - hgt, w, hgt];
      const clash = taken.some((r) => rect[0] < r[0] + r[2] && rect[0] + rect[2] > r[0] && rect[1] < r[1] + r[3] && rect[1] + rect[3] > r[1]);
      if (!clash || tgt) {
        taken.push(rect);
        g.fillStyle = tgt ? '#ffd6ea' : 'rgba(230,240,255,0.9)';
        g.fillText(text, at[0], at[1] - 9 * dpr);
      }
    }
    g.globalAlpha = 1;
  }
  if (!showHub) {
    const [hx, hy] = P(0, 0);
    g.fillStyle = '#ffd166';
    g.font = `700 ${Math.round(12 * dpr)}px system-ui, sans-serif`;
    g.fillText('THE SPIRE (hub) · zoom in for places', hx, hy - 12 * dpr);
  }
  // Your speeder.
  if (!flying) {
    const at = dot({ pos: speeder.pos, name: 'Your speeder' }, '#ffc266', 5);
    if (at) { g.fillStyle = '#ffc266'; g.fillText('Your speeder', at[0], at[1] + 16 * dpr); }
  }
  // You.
  const [px, py] = P(player.x, player.z);
  g.save();
  g.translate(px, py);
  g.rotate(player.heading);
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#05070c';
  g.lineWidth = 2 * dpr;
  const r = 9 * dpr;
  g.beginPath();
  g.moveTo(0, -r); g.lineTo(r * 0.6, r * 0.7); g.lineTo(0, r * 0.35); g.lineTo(-r * 0.6, r * 0.7);
  g.closePath();
  g.stroke();
  g.fill();
  g.restore();
  g.fillStyle = '#fff';
  g.font = `600 ${Math.round(11 * dpr)}px system-ui, sans-serif`;
  g.fillText(`You · ${Math.round(player.y)} m`, px, py + 20 * dpr);
}
