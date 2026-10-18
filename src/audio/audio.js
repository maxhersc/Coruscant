// Procedural sound: the city's hum, wind, the speeder's engine, the crowd's
// murmur and UI cues. No audio files.

let ctx = null;
let master, ambient, wind, windFilter, engine, engineFilter, engineOsc, engineOsc2, crowd, crowdFilter, traffic, trafficFilter;

function noiseBuffer(c, seconds = 2, brown = false) {
  const buf = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return buf;
}

function loopNoise(c, brown) {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 3, brown);
  src.loop = true;
  src.start();
  return src;
}

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch {
    return;
  }
  master = ctx.createGain();
  master.gain.value = 0.7;
  master.connect(ctx.destination);

  // City hum: low brown noise plus a faint drone.
  ambient = ctx.createGain();
  ambient.gain.value = 0.22;
  const hum = loopNoise(ctx, true);
  const humF = ctx.createBiquadFilter();
  humF.type = 'lowpass';
  humF.frequency.value = 320;
  hum.connect(humF).connect(ambient);
  const drone = ctx.createOscillator();
  drone.frequency.value = 55;
  const droneG = ctx.createGain();
  droneG.gain.value = 0.025;
  drone.connect(droneG).connect(ambient);
  drone.start();
  ambient.connect(master);

  // Passing traffic: band-passed noise swelling with nearby craft.
  traffic = ctx.createGain();
  traffic.gain.value = 0;
  trafficFilter = ctx.createBiquadFilter();
  trafficFilter.type = 'bandpass';
  trafficFilter.frequency.value = 600;
  trafficFilter.Q.value = 0.8;
  loopNoise(ctx, false).connect(trafficFilter).connect(traffic).connect(master);

  // Wind with speed.
  wind = ctx.createGain();
  wind.gain.value = 0;
  windFilter = ctx.createBiquadFilter();
  windFilter.type = 'bandpass';
  windFilter.frequency.value = 400;
  windFilter.Q.value = 0.6;
  loopNoise(ctx, false).connect(windFilter).connect(wind).connect(master);

  // Engine: two detuned oscillators through a lowpass.
  engine = ctx.createGain();
  engine.gain.value = 0;
  engineFilter = ctx.createBiquadFilter();
  engineFilter.type = 'lowpass';
  engineFilter.frequency.value = 500;
  engineOsc = ctx.createOscillator();
  engineOsc.type = 'sawtooth';
  engineOsc2 = ctx.createOscillator();
  engineOsc2.type = 'square';
  engineOsc.frequency.value = 70;
  engineOsc2.frequency.value = 71.5;
  const g2 = ctx.createGain();
  g2.gain.value = 0.4;
  engineOsc.connect(engineFilter);
  engineOsc2.connect(g2).connect(engineFilter);
  engineFilter.connect(engine).connect(master);
  engineOsc.start();
  engineOsc2.start();

  // Crowd murmur.
  crowd = ctx.createGain();
  crowd.gain.value = 0;
  crowdFilter = ctx.createBiquadFilter();
  crowdFilter.type = 'bandpass';
  crowdFilter.frequency.value = 700;
  crowdFilter.Q.value = 1.2;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 3.1;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 250;
  lfo.connect(lfoG).connect(crowdFilter.frequency);
  lfo.start();
  loopNoise(ctx, false).connect(crowdFilter).connect(crowd).connect(master);
}

const ramp = (param, v, t = 0.15) => {
  if (!ctx) return;
  param.setTargetAtTime(v, ctx.currentTime, t);
};

// Called every frame with what the player is doing.
export function updateAudio({ flying, speed, boost, nearCraft, crowdCount, altitude, night }) {
  if (!ctx) return;
  const sp = Math.abs(speed || 0);
  ramp(engine.gain, flying ? 0.05 + Math.min(sp / 200, 1) * 0.08 : 0);
  ramp(engineOsc.frequency, 55 + sp * 0.9 + (boost ? 30 : 0));
  ramp(engineOsc2.frequency, 56.5 + sp * 0.92 + (boost ? 31 : 0));
  ramp(engineFilter.frequency, 300 + sp * 12);
  ramp(wind.gain, flying ? Math.min(sp / 180, 1) * 0.22 : 0.015 + Math.min(altitude / 2000, 1) * 0.04);
  ramp(windFilter.frequency, 250 + sp * 6);
  const near = nearCraft ? Math.max(0, 1 - nearCraft.d / 40) : 0;
  ramp(traffic.gain, near * near * 0.5, 0.08);
  ramp(trafficFilter.frequency, 400 + near * 900, 0.08);
  ramp(crowd.gain, flying ? 0 : Math.min(crowdCount / 25, 1) * 0.05);
  ramp(ambient.gain, 0.18 + (night || 0) * 0.06, 1);
}

// One-shot cues.
export function sfx(kind) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const tone = (freq, start, dur, type = 'sine', vol = 0.15) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t + start);
    g.gain.setValueAtTime(0, t + start);
    g.gain.linearRampToValueAtTime(vol, t + start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
    o.connect(g).connect(master);
    o.start(t + start);
    o.stop(t + start + dur + 0.05);
    return o;
  };
  const noise = (dur, freq, vol = 0.3) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, dur);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
  };
  switch (kind) {
    case 'click': tone(880, 0, 0.06, 'square', 0.04); break;
    case 'open': tone(520, 0, 0.08, 'sine', 0.08); tone(780, 0.06, 0.1, 'sine', 0.08); break;
    case 'coin': tone(1320, 0, 0.08, 'square', 0.05); tone(1760, 0.07, 0.15, 'square', 0.05); break;
    case 'win': [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.09, 0.3, 'triangle', 0.12)); break;
    case 'lose': tone(300, 0, 0.25, 'sawtooth', 0.05); tone(200, 0.18, 0.35, 'sawtooth', 0.05); break;
    case 'spin': for (let i = 0; i < 14; i++) tone(1200 - i * 40, i * 0.09, 0.03, 'square', 0.03); break;
    case 'card': noise(0.08, 3000, 0.15); break;
    case 'dice': for (let i = 0; i < 5; i++) { const s = ctx.currentTime; void s; noise(0.05, 1500 + i * 200, 0.12); } break;
    case 'bump': noise(0.4, 180, 0.8); tone(70, 0, 0.3, 'sine', 0.25); break;
    case 'board': tone(220, 0, 0.5, 'sawtooth', 0.05); tone(330, 0.1, 0.5, 'sawtooth', 0.04); noise(0.6, 500, 0.15); break;
    case 'land': noise(0.5, 300, 0.25); tone(160, 0, 0.3, 'sine', 0.06); break;
    case 'lift': tone(660, 0, 0.15, 'sine', 0.08); tone(990, 0.15, 0.25, 'sine', 0.08); break;
    case 'horn': tone(440, 0, 0.5, 'sawtooth', 0.06); tone(554, 0, 0.5, 'sawtooth', 0.05); tone(659, 0, 0.5, 'sawtooth', 0.05); break;
    case 'deliver': [784, 988, 1175].forEach((f, i) => tone(f, i * 0.08, 0.25, 'triangle', 0.1)); break;
    case 'alert': tone(880, 0, 0.12, 'square', 0.06); tone(880, 0.2, 0.12, 'square', 0.06); break;
    default: break;
  }
}

export function setVolume(v) {
  if (master) master.gain.value = v;
}
