import { h } from '../lib/dom.js';
import { DownloadItem } from './download-item.js';

// Keyed list: items are created once and updated in place, so live progress doesn't steal focus or flicker.
export function DownloadList({ empty, onOpen, onDelete }) {
  const root = h('div', { class: 'dl-list' }); const items = new Map();
  const emptyEl = h('div', { class: 'empty' }, empty);
  function set(jobs) {
    emptyEl.remove();
    const keep = new Set(jobs.map((j) => j.id));
    for (const [id, it] of items) if (!keep.has(id)) { it.el.remove(); items.delete(id); }
    jobs.forEach((j, i) => {
      let it = items.get(j.id);
      if (!it) { it = DownloadItem(j, { onOpen, onDelete }); items.set(j.id, it); } else it.update(j);
      if (root.children[i] !== it.el) root.insertBefore(it.el, root.children[i] || null);
    });
    if (!jobs.length) root.replaceChildren(emptyEl);
  }
  return { el: root, set };
}
