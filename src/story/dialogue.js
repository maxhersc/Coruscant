import { openPanel, closePanel, h } from '../ui/panel.js';

// Conversations: a set of nodes, each a line and the player's choices.
//   nodes = { start: { text, choices: [{ label, next, run, show }] }, ... }
// A choice goes to `next` (a node key), or closes the conversation when it has
// none. `run` happens first and may return a node key to go to instead.
// `show` hides a choice when it returns false. Number keys pick a choice.

export function converse(person, nodes, startKey = 'start', sfx = () => {}) {
  openPanel(person.name, (body) => {
    const line = h('p.dialogue-text');
    const list = h('div.dialogue-choices');
    body.classList.add('dialogue');
    body.append(line, list);
    let choices = [];
    const show = (key) => {
      const node = nodes[key];
      if (!node) { closePanel(); return; }
      line.textContent = typeof node.text === 'function' ? node.text() : node.text;
      choices = (node.choices || [{ label: 'Goodbye.' }]).filter((c) => !c.show || c.show());
      list.replaceChildren(...choices.map((c, i) => h('button.btn.choice', { onclick: () => pick(i) }, h('span.num', {}, String(i + 1)), typeof c.label === 'function' ? c.label() : c.label)));
    };
    const pick = (i) => {
      const c = choices[i];
      if (!c) return;
      sfx('click');
      let next = c.next;
      if (c.run) {
        const r = c.run();
        if (typeof r === 'string') next = r;
        if (r === false) return; // the action closed or replaced the panel
      }
      if (next) show(next);
      else closePanel();
    };
    const onKey = (e) => {
      const n = Number(e.key);
      if (n >= 1 && n <= 9) { e.preventDefault(); pick(n - 1); }
    };
    addEventListener('keydown', onKey);
    show(startKey);
    return () => removeEventListener('keydown', onKey);
  }, { kicker: person.title });
}
