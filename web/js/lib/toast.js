import { h } from './dom.js';
export function toast(message, kind = '') {
  let box = document.getElementById('toasts');
  if (!box) { box = h('div', { id: 'toasts', class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(box); }
  const t = h('div', { class: `toast ${kind}`.trim() }, message); box.append(t);
  setTimeout(() => t.remove(), kind === 'bad' ? 7000 : 4000);
}
