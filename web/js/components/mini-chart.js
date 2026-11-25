import { h } from '../lib/dom.js';

// Tiny CSS charts, no library. `points` = [{ label, n }]
export function Bars(points, { height = 120, labelEvery = 5 } = {}) {
  const max = Math.max(1, ...points.map((p) => p.n));
  return h('div', { class: 'bars', style: `height:${height}px`, role: 'img', 'aria-label': `Gráfico de barras: ${points.map((p) => `${p.label} ${p.n}`).join(', ')}` },
    points.map((p, i) => h('div', { class: 'bar-col', title: `${p.label}: ${p.n}` }, h('i', { style: `height:${Math.max(p.n ? 4 : 1, (p.n / max) * (height - 22))}px` }), h('span', {}, i % labelEvery === 0 || i === points.length - 1 ? p.label : ''))));
}
// Ranked list with a bar behind each row. `rows` = [{ key, n }]
export function Ranking(rows, { total, name = (k) => k || 'Desconhecido' } = {}) {
  const sum = (total ?? rows.reduce((s, r) => s + r.n, 0)) || 1;
  if (!rows.length) return h('p', { class: 'mut small' }, 'Ainda sem dados.');
  return h('ul', { class: 'rank' }, rows.map((r) => h('li', {}, h('i', { style: `width:${Math.round((r.n / sum) * 100)}%` }), h('span', {}, name(r.key)), h('b', {}, r.n))));
}
