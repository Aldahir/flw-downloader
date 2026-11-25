import { h, fill, icon } from '../lib/dom.js';
import { store, on, platformLabel } from '../lib/store.js';
import { fmtSize, isActive, mediaOf, STATUS } from '../lib/format.js';
import { api } from '../lib/api.js';
import { removeJob } from '../lib/jobs-sync.js';
import { toast } from '../lib/toast.js';

// Details of one job: files, error, and shortcuts into the tools. Kept apart from subtitle features on purpose.
export function openJob(id) {
  const dlg = h('dialog', { 'aria-labelledby': 'job-title' }); document.body.append(dlg);
  const close = () => { off(); dlg.close(); dlg.remove(); };
  const draw = () => {
    const j = store.jobs.get(id); if (!j) { close(); return; }
    const media = mediaOf(j); const active = isActive(j);
    const go = (tab) => () => { store.selection = { jobId: j.id, file: media[0]?.name || '' }; close(); location.hash = `#/ferramentas/${tab}`; };
    fill(dlg, h('div', { class: 'sheet' },
      h('div', { class: 'sheet-head' }, h('h2', { id: 'job-title', style: 'overflow-wrap:anywhere;font-size:1.2rem' }, j.title || j.id), h('button', { class: 'icon-btn dark', 'aria-label': 'Fechar', onclick: close }, icon('x'))),
      h('div', { class: 'row' }, h('span', { class: `pill ${j.status === 'done' ? 'ok' : j.status === 'error' ? 'bad' : active ? 'run' : ''}` }, STATUS[j.status] || j.status), h('span', { class: 'mut small' }, j.kind === 'import' ? 'Ficheiro local' : platformLabel(j.platform || 'other')), j.url ? h('a', { class: 'small', href: j.url, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir origem') : null),
      j.error ? h('div', { class: 'msg bad' }, j.error, j.errorDetail ? h('details', {}, h('summary', { class: 'small' }, 'Detalhes técnicos'), h('pre', { class: 'small', style: 'white-space:pre-wrap;margin:6px 0 0' }, j.errorDetail)) : null) : null,
      j.files.length ? h('ul', { class: 'files' }, j.files.map((f) => h('li', {}, h('a', { href: f.url, download: f.name }, f.name), h('span', { class: 'mut small' }, fmtSize(f.size))))) : h('p', { class: 'mut' }, active ? 'Os ficheiros aparecem aqui quando o download terminar.' : 'Sem ficheiros.'),
      media.length && !active ? h('div', { class: 'row' }, h('button', { class: 'btn soft sm', onclick: go('leitor') }, icon('play'), 'Reproduzir'), h('button', { class: 'btn soft sm', onclick: go('legendas') }, icon('captions'), 'Legendas')) : null,
      h('div', { class: 'sheet-actions' },
        active ? h('button', { class: 'btn line', onclick: () => api(`/api/jobs/${j.id}/cancel`, { method: 'POST', body: {} }) }, 'Cancelar download') : h('button', { class: 'btn line', onclick: close }, 'Fechar'),
        h('button', { class: 'btn danger', disabled: active, onclick: async () => { if (confirm('Apagar este trabalho e todos os seus ficheiros? Não dá para desfazer.')) { await removeJob(j.id); toast('Trabalho apagado.'); close(); } } }, icon('trash-2'), 'Apagar'))));
  };
  const off = on(`job:${id}`, draw);
  dlg.addEventListener('cancel', () => setTimeout(() => { off(); dlg.remove(); }, 0));
  draw(); dlg.showModal();
}
