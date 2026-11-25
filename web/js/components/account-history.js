import { h, fill, brand, icon } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { store, platformLabel } from '../lib/store.js';
import { fmtSize, STATUS } from '../lib/format.js';
import { Bars, Ranking } from './mini-chart.js';

export function HistoryTab() {
  const f = { platform: '', status: '', q: '', page: 1 }; const root = h('div', { class: 'panel' }); const list = h('div'); const sum = h('div');
  let timer = 0;
  async function load() {
    try {
      const qs = new URLSearchParams({ ...(f.platform && { platform: f.platform }), ...(f.status && { status: f.status }), ...(f.q && { q: f.q }), page: f.page });
      const r = await api(`/api/me/history?${qs}`); const s = r.summary;
      fill(sum, h('div', { class: 'stat-grid' }, [['Transferências', s.total], ['Concluídas', s.done], ['Com erro', s.errors], ['Espaço usado', fmtSize(s.bytes)]].map(([l, v]) => h('div', { class: 'stat' }, h('b', {}, v), h('span', { class: 'mut small' }, l)))),
        s.perMonth.length || s.byPlatform.length ? h('div', { class: 'grid2', style: 'margin-top:16px' }, h('div', {}, h('h3', {}, 'Por mês'), s.perMonth.length ? Bars(s.perMonth.map((m) => ({ label: m.m.slice(2), n: m.n })), { height: 110, labelEvery: 1 }) : null),
          h('div', {}, h('h3', {}, 'Por plataforma'), Ranking(s.byPlatform.map((p) => ({ key: p.platform, n: p.n })), { name: platformLabel }))) : null);
      fill(list, r.items.length ? h('ul', { class: 'files hist' }, r.items.map((j) => h('li', {}, h('span', { class: 'hist-ic' }, j.kind === 'import' || j.platform === 'other' ? icon('film') : brand(j.platform, '')),
        h('div', { class: 'grow' }, h('b', {}, j.title || j.url || j.id), h('div', { class: 'mut small' }, [platformLabel(j.platform), new Date(j.createdAt).toLocaleString('pt-PT', { dateStyle: 'medium', timeStyle: 'short' }), j.size ? fmtSize(j.size) : ''].filter(Boolean).join(' · '))),
        h('span', { class: `pill ${j.status === 'done' ? 'ok' : j.status === 'error' ? 'bad' : ''}` }, STATUS[j.status] || j.status)))) : h('p', { class: 'mut' }, 'Nada encontrado com estes filtros.'),
        h('div', { class: 'row', style: 'justify-content:space-between;margin-top:12px' }, h('span', { class: 'mut small' }, `${r.total} resultado${r.total === 1 ? '' : 's'}`),
          h('div', { class: 'row' }, h('button', { class: 'btn soft sm', disabled: f.page <= 1, onclick: () => { f.page--; load(); } }, 'Anterior'), h('button', { class: 'btn soft sm', disabled: f.page * r.pageSize >= r.total, onclick: () => { f.page++; load(); } }, 'Seguinte'))));
    } catch (e) { fill(list, h('p', { class: 'msg bad' }, e.message)); }
  }
  const sel = (key, opts) => h('select', { class: 'input', style: 'width:auto', 'aria-label': key, onchange: (e) => { f[key] = e.target.value; f.page = 1; load(); } }, opts.map(([v, l]) => h('option', { value: v }, l)));
  load();
  return fill(root, h('h2', {}, 'Histórico'), h('p', { class: 'mut' }, 'Todas as tuas transferências, guardadas na base de dados. Apagar um trabalho no histórico da app também o remove daqui.'), sum,
    h('div', { class: 'row', style: 'margin-top:8px' }, sel('platform', [['', 'Todas as plataformas'], ...store.platforms.map((p) => [p.id, p.label]), ['other', 'Outras']]), sel('status', [['', 'Todos os estados'], ['done', 'Concluído'], ['error', 'Erro'], ['cancelled', 'Cancelado'], ['interrupted', 'Interrompido']]),
      h('input', { class: 'input', type: 'search', placeholder: 'Pesquisar por título', 'aria-label': 'Pesquisar', style: 'flex:1 1 200px', oninput: (e) => { clearTimeout(timer); timer = setTimeout(() => { f.q = e.target.value.trim(); f.page = 1; load(); }, 300); } })), list);
}
