import { h, brand, icon } from '../lib/dom.js';
import { store, countByPlatform } from '../lib/store.js';

// Chips: "Todas" + one per platform that has jobs (always shows the selected one). Calls onChange(id|'all').
export function PlatformFilter({ value, onChange, list }) {
  const counts = countByPlatform(list);
  const ids = ['all', ...store.platforms.map((p) => p.id), 'other'].filter((id) => id === 'all' || counts.has(id) || id === value);
  const label = (id) => (id === 'all' ? 'Todas' : id === 'other' ? 'Outras' : store.platforms.find((p) => p.id === id)?.label || id);
  return h('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrar por plataforma' }, ids.map((id) => h('button', { class: 'chip', 'aria-pressed': String(value === id), onclick: () => onChange(id) },
    id === 'all' ? icon('layout-grid') : id === 'other' ? icon('film') : brand(id, ''), label(id), h('span', { class: 'n' }, id === 'all' ? list.length : counts.get(id) || 0))));
}
