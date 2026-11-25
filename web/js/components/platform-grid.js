import { h, brand, icon } from '../lib/dom.js';
import { store, countByPlatform } from '../lib/store.js';

// "Total de downloads" per platform; each card opens the history already filtered.
export function PlatformGrid() {
  const root = h('div', { class: 'pgrid' });
  const draw = () => {
    const done = [...store.jobs.values()].filter((j) => j.status === 'done' && j.kind !== 'import');
    const counts = countByPlatform(done);
    const items = [...store.platforms.map((p) => [p.id, p.label]), ['other', 'Outras fontes']];
    root.replaceChildren(...items.map(([id, label]) => h('a', { class: 'pcard', href: `#/historico?p=${id}`, 'aria-label': `${label}: ${counts.get(id) || 0} downloads. Ver histórico` },
      h('span', { class: 'tilebox' }, id === 'other' ? icon('film') : brand(id, '')),
      h('strong', {}, label), h('span', { class: 'lbl' }, 'Total de downloads'), h('span', { class: 'num' }, counts.get(id) || 0))));
  };
  draw();
  return { el: root, update: draw };
}
