import { h, icon } from '../lib/dom.js';
import { jobList } from '../lib/store.js';
import { removeJob } from '../lib/jobs-sync.js';
import { STATUS } from '../lib/format.js';
import { PlatformFilter } from '../components/platform-filter.js';
import { DownloadList } from '../components/download-list.js';
import { openJob } from '../components/job-dialog.js';

// Job history only: no subtitle or conversion controls here (those live under Ferramentas).
export function HistoryPage(ctx) {
  const f = { p: ctx.route.query.get('p') || 'all', q: '', s: 'all' };
  const chips = h('div'); const list = DownloadList({
    empty: [h('strong', {}, 'Nada por aqui'), h('span', {}, 'Nenhum trabalho corresponde a este filtro.'), h('a', { href: '#/' }, 'Descarregar um vídeo')],
    onOpen: openJob, onDelete: async (id) => { if (confirm('Apagar este trabalho e todos os seus ficheiros? Não dá para desfazer.')) await removeJob(id); },
  });
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Pesquisar no histórico', 'aria-label': 'Pesquisar no histórico', oninput: (e) => { f.q = e.target.value.toLowerCase(); draw(); } });
  const status = h('select', { class: 'input', 'aria-label': 'Estado', style: 'width:auto', onchange: (e) => { f.s = e.target.value; draw(); } },
    [['all', 'Todos os estados'], ...['running', 'queued', 'done', 'error', 'cancelled'].map((k) => [k, STATUS[k]])].map(([v, l]) => h('option', { value: v }, l)));
  function draw() {
    const all = jobList();
    chips.replaceChildren(PlatformFilter({ value: f.p, list: all, onChange: (id) => { f.p = id; history.replaceState(null, '', id === 'all' ? '#/historico' : `#/historico?p=${id}`); draw(); } }));
    list.set(all.filter((j) => (f.p === 'all' || (j.platform || 'other') === f.p) && (f.s === 'all' || j.status === f.s) && (!f.q || (j.title || '').toLowerCase().includes(f.q))));
  }
  ctx.on('jobs', draw); draw();
  return h('div', { class: 'wrap', style: 'padding-bottom:48px' },
    h('div', { class: 'page-head' }, h('h1', { style: 'font-size:clamp(1.8rem,4vw,2.6rem)' }, 'Histórico'), h('p', {}, 'Tudo o que descarregaste ou abriste. Nada é apagado sozinho: só quando tu pedires.')),
    h('div', { class: 'filters' }, chips, h('div', { class: 'row' }, h('div', { class: 'search' }, icon('search'), search), status)), list.el);
}
