import { CITY_HALF, CELL } from '../config.js';
import { decks } from '../systems/interact.js';
import { LANDMARKS } from '../world/landmarks.js';

// A top-down city map. The skyline is drawn once into an offscreen canvas;
// markers are drawn over it each time the map is shown.
let base = null;
const SIZE = 1024;
const toMap = (v) => ((v + CITY_HALF) / (CITY_HALF * 2)) * SIZE;

export function initMap(segs) {
  base = document.createElement('canvas');
  base.width = base.height = SIZE;
  const g = base.getContext('2d');
  g.fillStyle = '#07090f';
  g.fillRect(0, 0, SIZE, SIZE);
  // Streets as faint grid.
  g.strokeStyle = 'rgba(120,180,255,0.07)';
  g.lineWidth = 1;
  for (let v = -CITY_HALF + CELL / 2; v < CITY_HALF; v += CELL) {
    g.beginPath(); g.moveTo(toMap(v), 0); g.lineTo(toMap(v), SIZE); g.stroke();
    g.beginPath(); g.moveTo(0, toMap(v)); g.lineTo(SIZE, toMap(v)); g.stroke();
  }
  const sorted = segs.filter((s) => s.kind !== 'cone' && s.sx > 4).sort((a, b) => a.y + a.sy / 2 - (b.y + b.sy / 2));
  for (const s of sorted) {
    const top = s.y + s.sy / 2;
    const t = Math.min(1, top / 1200);
    const l = 14 + t * 40;
    g.fillStyle = `hsl(${215 - t * 30}, ${20 + t * 30}%, ${l}%)`;
    const x = toMap(s.x - s.sx / 2), w = (s.sx / (CITY_HALF * 2)) * SIZE;
    const y = toMap(s.z - s.sz / 2), h = (s.sz / (CITY_HALF * 2)) * SIZE;
    if (s.kind === 'cyl') {
      g.beginPath();
      g.arc(x + w / 2, y + h / 2, w / 2, 0, Math.PI * 2);
      g.fill();
    } else g.fillRect(x, y, w, h);
  }
}

export function drawMap(canvas, { player, speeder, job, flying }) {
  const g = canvas.getContext('2d');
  const W = canvas.width = canvas.clientWidth * devicePixelRatio;
  const H = canvas.height = canvas.clientHeight * devicePixelRatio;
  const s = Math.min(W, H) / SIZE;
  const ox = (W - SIZE * s) / 2, oy = (H - SIZE * s) / 2;
  g.clearRect(0, 0, W, H);
  g.drawImage(base, ox, oy, SIZE * s, SIZE * s);
  // North (-z) is up, east (+x) is right.
  const P = (x, z) => [ox + toMap(x) * s, oy + toMap(z) * s];
  const font = Math.round(11 * devicePixelRatio);
  g.font = `600 ${font}px system-ui, sans-serif`;
  g.textAlign = 'center';

  // Landmarks and the hub.
  const label = (x, z, text, color) => {
    const [px, py] = P(x, z);
    g.fillStyle = color;
    g.beginPath(); g.arc(px, py, 5 * devicePixelRatio, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.fillText(text, px, py - 9 * devicePixelRatio);
  };
  label(0, 0, 'The Spire (hub)', '#ffd166');
  for (const lm of LANDMARKS) label(lm.i * CELL, lm.j * CELL, lm.name, '#c0c8d0');
  for (const d of decks) {
    const [px, py] = P(d.x, d.z);
    const isJob = job && job.dest === d.name;
    g.fillStyle = isJob ? '#ff7ac0' : '#7feaff';
    g.fillRect(px - 3 * devicePixelRatio, py - 3 * devicePixelRatio, 6 * devicePixelRatio, 6 * devicePixelRatio);
    g.fillStyle = isJob ? '#ffb3da' : 'rgba(180,230,255,0.75)';
    g.fillText(d.name, px, py + 15 * devicePixelRatio);
  }
  if (job && job.dest === 'Courier Guild') label(-78, -64, 'Courier Guild ◆', '#ff7ac0');

  // Speeder and player.
  if (!flying) {
    const [sx, sy] = P(speeder.pos.x, speeder.pos.z);
    g.fillStyle = '#ffc266';
    g.fillText('⛴', sx, sy + 4);
    g.fillText('speeder', sx, sy + 16 * devicePixelRatio);
  }
  const [px, py] = P(player.x, player.z);
  g.save();
  g.translate(px, py);
  g.rotate(player.heading);
  g.fillStyle = '#ffffff';
  g.beginPath();
  const r = 8 * devicePixelRatio;
  g.moveTo(0, -r); g.lineTo(r * 0.6, r * 0.7); g.lineTo(0, r * 0.35); g.lineTo(-r * 0.6, r * 0.7);
  g.closePath();
  g.fill();
  g.restore();
}
