import { h, fill, icon } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { buildSvg } from '../lib/qr-render.js';
import { matrixFor, rasterise, save } from '../lib/qr-client.js';
import { Bars, Ranking } from './mini-chart.js';

const DEVICE = { mobile: 'Telemóvel', tablet: 'Tablet', desktop: 'Computador', bot: 'Robô' };
const COUNTRY = (c) => { if (!c) return 'Local desconhecido'; try { return new Intl.DisplayNames(['pt-PT'], { type: 'region' }).of(c) || c; } catch { return c; } };
const dayLabel = (d) => d.slice(8) + '/' + d.slice(5, 7);

async function draw(code) {
  const m = await matrixFor(code.shortUrl, code.design?.logo ? 'H' : code.design?.ecc || 'M'); return buildSvg(m, { ...code.design });
}
async function QrImage(code) { const o = await draw(code); return { ...o, img: h('img', { class: 'qr-thumb', src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(o.svg)}`, alt: `Código QR de ${code.title}` }) }; }

export function QrTab(ctx) {
  const root = h('div', { class: 'panel' }); let open = null;
  async function list() {
    open = null; fill(root, h('p', { class: 'mut' }, 'A carregar…'));
    let codes; try { codes = (await api('/api/me/qr')).codes; } catch (e) { return fill(root, h('p', { class: 'msg bad' }, e.message)); }
    const imgs = await Promise.all(codes.map((c) => QrImage(c).catch(() => null)));
    const title = h('input', { class: 'input', placeholder: 'Nome (ex.: Cartaz da loja)', maxlength: 80, 'aria-label': 'Nome do código', style: 'flex:1 1 200px' });
    const target = h('input', { class: 'input', placeholder: 'Destino (ex.: exemplo.com/promo)', 'aria-label': 'Endereço de destino', style: 'flex:2 1 260px' });
    const err = h('p', { class: 'msg bad', role: 'alert', hidden: true });
    fill(root, h('h2', {}, 'Códigos QR dinâmicos e leituras'), h('p', { class: 'mut' }, 'Um código dinâmico aponta para um endereço curto. Podes mudar o destino sem reimprimir e ver quando, onde e com que aparelhos foi lido. A localização é aproximada (por IP, numa base de dados local) e o IP não é guardado.'),
      h('div', { class: 'msg warn' }, 'Para os códigos funcionarem fora do teu computador, o servidor tem de ser acessível pela internet e ter a variável PUBLIC_URL definida. Neste momento o endereço curto é ', h('code', {}, codes[0]?.shortUrl.replace(/\/q\/.*/, '') || location.origin), '.'),
      h('form', { class: 'card row', onsubmit: async (e) => { e.preventDefault(); err.hidden = true; try { await api('/api/me/qr', { body: { title: title.value, target: target.value, type: 'url' } }); toast('Código criado.'); list(); } catch (er) { err.textContent = er.message; err.hidden = false; } } }, title, target, h('button', { class: 'btn', type: 'submit' }, icon('qr-code'), 'Criar código dinâmico')), err,
      codes.length ? h('div', { class: 'qr-cards' }, codes.map((c, i) => h('article', { class: 'card qr-card' }, imgs[i]?.img || h('div', { class: 'qr-thumb' }),
        h('div', { class: 'grow' }, h('h3', {}, c.title), h('p', { class: 'mut small', style: 'overflow-wrap:anywhere' }, c.target), h('p', { class: 'small' }, h('code', {}, c.shortUrl)),
          h('div', { class: 'row', style: 'margin-top:8px' }, h('span', { class: `pill ${c.active ? 'ok' : ''}` }, c.active ? 'Ativo' : 'Pausado'), h('span', { class: 'pill' }, `${c.scans || 0} leituras`), h('button', { class: 'btn soft sm', onclick: () => details(c.id) }, icon('layout-grid'), 'Relatório')))))) : h('p', { class: 'mut' }, 'Ainda não tens códigos dinâmicos. Cria o primeiro acima, ou transforma um código do gerador.'));
  }

  async function details(id) {
    fill(root, h('p', { class: 'mut' }, 'A carregar relatório…'));
    let s; try { s = await api(`/api/me/qr/${id}/stats?days=30`); } catch (e) { return fill(root, h('p', { class: 'msg bad' }, e.message)); }
    const c = s.qr; const q = await QrImage(c).catch(() => null);
    const target = h('input', { class: 'input', value: c.target, 'aria-label': 'Destino' }); const msg = h('p', { class: 'msg', hidden: true });
    fill(root, h('div', { class: 'row' }, h('button', { class: 'btn soft sm', onclick: list }, 'Voltar'), h('h2', { style: 'margin:0' }, c.title)),
      h('div', { class: 'card qr-card' }, q ? q.img : null, h('div', { class: 'grow' }, h('p', { class: 'small' }, h('code', {}, c.shortUrl)),
        h('form', { class: 'row', style: 'margin-top:8px', onsubmit: async (e) => { e.preventDefault(); try { await api(`/api/me/qr/${id}`, { method: 'PATCH', body: { target: target.value } }); msg.className = 'msg ok'; msg.textContent = 'Destino atualizado. Os códigos já impressos passam a abrir o novo endereço.'; msg.hidden = false; } catch (er) { msg.className = 'msg bad'; msg.textContent = er.message; msg.hidden = false; } } }, h('div', { style: 'flex:1 1 240px' }, target), h('button', { class: 'btn sm', type: 'submit' }, 'Guardar destino')), msg,
        h('div', { class: 'row', style: 'margin-top:10px' }, q ? [h('button', { class: 'btn sm', onclick: async () => save(await rasterise(q.svg, 1024, Math.round(1024 * q.height / q.width)), `qr-${c.code}.png`) }, icon('download'), 'PNG'), h('button', { class: 'btn line sm', onclick: () => save(new Blob([q.svg], { type: 'image/svg+xml' }), `qr-${c.code}.svg`) }, 'SVG')] : null,
          h('button', { class: 'btn soft sm', onclick: async () => { await api(`/api/me/qr/${id}`, { method: 'PATCH', body: { active: !c.active } }); details(id); } }, c.active ? 'Pausar' : 'Reativar'),
          h('button', { class: 'btn danger sm', onclick: async () => { if (confirm('Apagar este código e todo o seu histórico de leituras? O QR impresso deixa de funcionar.')) { await api(`/api/me/qr/${id}`, { method: 'DELETE' }); list(); } } }, icon('trash-2'), 'Apagar')))),
      h('div', { class: 'stat-grid' }, [['Leituras', s.total], ['Visitantes distintos', s.uniques], ['Última leitura', s.lastScan ? new Date(s.lastScan).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }) : '—']].map(([l, v]) => h('div', { class: 'stat' }, h('b', {}, v), h('span', { class: 'mut small' }, l)))),
      h('div', { class: 'card' }, h('h3', {}, 'Últimos 30 dias'), Bars(s.perDay.map((d) => ({ label: dayLabel(d.day), n: d.n })))),
      h('div', { class: 'grid2' }, h('div', { class: 'card' }, h('h3', {}, 'Aparelhos'), Ranking(s.devices, { name: (k) => DEVICE[k] || k })), h('div', { class: 'card' }, h('h3', {}, 'Sistemas'), Ranking(s.systems, { name: (k) => k || 'Desconhecido' })),
        h('div', { class: 'card' }, h('h3', {}, 'Navegadores'), Ranking(s.browsers)), h('div', { class: 'card' }, h('h3', {}, 'Países'), Ranking(s.countries, { name: COUNTRY })), h('div', { class: 'card' }, h('h3', {}, 'Cidades'), Ranking(s.cities, { name: (k) => k || 'Desconhecida' }))),
      h('div', { class: 'card' }, h('h3', {}, 'Leituras recentes'), s.recent.length ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Quando', 'Aparelho', 'Sistema / navegador', 'Local'].map((t) => h('th', {}, t)))),
        h('tbody', {}, s.recent.map((r) => h('tr', {}, h('td', {}, new Date(r.at).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })), h('td', {}, DEVICE[r.device] || r.device), h('td', {}, [r.os, r.browser].filter(Boolean).join(' / ') || '—'), h('td', {}, [r.city, r.country && COUNTRY(r.country)].filter(Boolean).join(', ') || 'Desconhecido')))))) : h('p', { class: 'mut small' }, 'Ainda ninguém leu este código.')));
  }
  list(); return root;
}
