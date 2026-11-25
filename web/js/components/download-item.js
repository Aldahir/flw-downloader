import { h, fill, brand, icon } from '../lib/dom.js';
import { store, platformLabel } from '../lib/store.js';
import { STATUS, isActive, fmtSize } from '../lib/format.js';
import { api } from '../lib/api.js';

// One row of the download list. Returns { el, update(job) } so progress ticks don't rebuild the list.
export function DownloadItem(job, { onOpen, onDelete }) {
  const thumb = h('div', { class: 'thumb' });
  const title = h('h3'); const sub = h('div', { class: 'sub-line' });
  const prog = h('div', { class: 'prog' }); const err = h('div', { class: 'err', role: 'alert' });
  const acts = h('div', { class: 'acts' });
  const el = h('article', { class: 'dl' }, thumb, h('div', {}, title, sub, prog, err), acts);

  function update(j) {
    const imp = j.kind === 'import'; const pid = j.platform || 'other';
    fill(thumb, imp || pid === 'other' ? icon(imp ? 'file-play' : 'film') : brand(pid, ''));
    title.textContent = j.title || j.url || j.id;
    const bits = [imp ? 'Ficheiro local' : platformLabel(pid)];
    const total = j.files.filter((f) => !f.name.endsWith('.json')).reduce((s, f) => s + f.size, 0);
    if (j.status === 'done' && total) bits.push(fmtSize(total));
    sub.textContent = bits.join(' · ');
    const active = isActive(j);
    if (active) {
      const known = j.status === 'running' && j.progress > 0;
      fill(prog, 
        h('div', { class: 'prog-meta' }, h('span', {}, j.status === 'queued' ? `Na fila · posição ${j.queuePosition}` : `${j.stage || 'A processar'} · ${Math.round(j.progress)}%`),
          h('span', {}, [j.sizeText, j.speed, j.eta && `falta ${j.eta}`].filter(Boolean).join(' · '))),
        h('div', { class: `bar${known || j.status === 'queued' ? '' : ' indeterminate'}`, role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(j.progress), 'aria-label': 'Progresso' }, h('i', { style: `width:${j.status === 'queued' ? 0 : j.progress}%` })));
    } else fill(prog, h('span', { class: `pill ${j.status === 'done' ? 'ok' : j.status === 'error' ? 'bad' : ''}` }, STATUS[j.status] || j.status), j.status === 'done' && j.stage ? h('span', { class: 'mut small', style: 'margin-left:8px' }, j.stage) : null);
    err.textContent = j.error || ''; err.hidden = !j.error;
    fill(acts, 
      active ? h('button', { class: 'icon-btn', 'aria-label': 'Cancelar', title: 'Cancelar', onclick: () => api(`/api/jobs/${j.id}/cancel`, { method: 'POST', body: {} }) }, icon('x')) : null,
      h('button', { class: 'btn soft sm', onclick: () => onOpen(j.id) }, 'Detalhes'),
      h('button', { class: 'icon-btn', 'aria-label': 'Apagar', title: 'Apagar', disabled: active, onclick: () => onDelete(j.id) }, icon('trash-2')));
    acts.querySelectorAll('button[disabled]').forEach((b) => { b.style.opacity = '.4'; });
  }
  update(job);
  return { el, update };
}
