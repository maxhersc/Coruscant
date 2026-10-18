import * as THREE from 'three';
import { state, addCredits } from '../systems/state.js';
import { openPanel, closePanel, h } from '../ui/panel.js';
import { storyState, BRASK_RECORD, emit } from '../story/story.js';

// Gate Run: a time trial through the twelve Skyrace gates around the Spire.
// The clock starts at gate 1 and stops when you come back through it.

const NEXT = new THREE.Color(0xffc266).multiplyScalar(4);
const DONE = new THREE.Color(0x55ff88).multiplyScalar(1.2);

export function createGateRun(gates, courseLength, sfx, toast) {
  const par = Math.round(courseLength / 60);
  const run = { armed: false, active: false, next: 0, t: 0, lastPassDay: 0 };

  const paint = () => {
    gates.forEach((g, i) => {
      if (!run.armed && !run.active) g.mesh.material.color.copy(g.base);
      else if (i === run.next % gates.length) g.mesh.material.color.copy(NEXT);
      else if (run.active && i < run.next) g.mesh.material.color.copy(DONE);
      else g.mesh.material.color.copy(g.base).multiplyScalar(0.4);
    });
  };

  const stop = () => {
    run.armed = false;
    run.active = false;
    run.next = 0;
    paint();
  };

  const open = () => {
    const best = storyState().bestRun;
    openPanel('Gate Run', (body) => {
      body.append(
        h('p', {}, 'Fly through the twelve holo gates around the Spire, in order, and back through the first. The clock starts at gate 1.'),
        h('div.stats', {},
          h('div.stat', {}, h('div.muted', {}, 'Par'), h('b', {}, `${par} s`)),
          h('div.stat', {}, h('div.muted', {}, 'Your best'), h('b', {}, best ? `${best.toFixed(1)} s` : 'none')),
          h('div.stat', {}, h('div.muted', {}, 'Old Brask’s record'), h('b', {}, `${BRASK_RECORD} s`)),
          h('div.stat', {}, h('div.muted', {}, 'Prize'), h('b', {}, '100 cr under par, once a day'))),
        h('div.row', {},
          h('button.btn.primary', { onclick: () => { run.armed = true; run.active = false; run.next = 0; paint(); closePanel(); toast('Gate Run armed. Board your speeder and fly through the glowing gate to start.', 'info', 6000); } }, run.armed || run.active ? 'Restart' : 'Arm the gates'),
          run.armed || run.active ? h('button.btn.ghost', { onclick: () => { stop(); closePanel(); } }, 'Cancel run') : null)
      );
    }, { kicker: 'East Pad · time trial' });
  };

  // Called every frame with the speeder position (null when on foot).
  const update = (dt, pos) => {
    if (run.active) run.t += dt;
    if (!pos || (!run.armed && !run.active)) return;
    const g = gates[run.next % gates.length];
    if (pos.distanceTo(g.pos) > 15) return;
    sfx('click');
    if (run.armed) {
      run.armed = false;
      run.active = true;
      run.t = 0;
      run.next = 1;
      toast('Go!', 'race', 1500);
      sfx('horn');
    } else if (run.next < gates.length) {
      run.next++;
    } else {
      // Back through gate 1: finished.
      const time = run.t;
      const best = storyState().bestRun;
      emit('gaterun', { time });
      let msg = `Gate Run: ${time.toFixed(1)} s.`;
      if (!best || time < best) msg += ' New best!';
      if (time < par && run.lastPassDay !== state.day) {
        run.lastPassDay = state.day;
        addCredits(100, 'Gate Run under par');
        msg += ' Under par: +100 cr.';
      }
      toast(msg, 'win', 6000);
      sfx('win');
      stop();
      return;
    }
    paint();
  };

  const ticker = () => {
    if (run.active) return `GATE RUN ${run.t.toFixed(1)} s · next gate ${run.next === gates.length ? 1 : run.next + 1}/${gates.length} · par ${par} s`;
    if (run.armed) return 'GATE RUN armed · fly through the glowing gate to start';
    return null;
  };

  const target = () => {
    if (!run.armed && !run.active) return null;
    const i = run.next % gates.length;
    return { name: `Gate ${i + 1}`, pos: gates[i].pos, sight: true };
  };

  return { run, open, update, ticker, target, par, stop };
}
