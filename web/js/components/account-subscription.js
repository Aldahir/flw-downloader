import { h, fill, icon } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { openCheckout } from './checkout-dialog.js';

const STATUS = { pending: ['Por aprovar', ''], approved: ['Aprovado', 'ok'], rejected: ['Rejeitado', 'bad'] };
const fmtMB = (mb) => (mb >= 1024 ? `${(mb / 1024).toFixed(mb % 1024 ? 1 : 0)} GB` : `${mb} MB`);

export function SubscriptionTab() {
  const root = h('div', { class: 'panel' }); fill(root, h('h2', {}, 'Subscrição'), h('p', { class: 'mut' }, 'A carregar…'));

  async function draw() {
    let s, cat, mine;
    try { [s, cat, mine] = await Promise.all([api('/api/me/subscription'), api('/api/billing/plans'), api('/api/me/payments')]); }
    catch (e) { return fill(root, h('h2', {}, 'Subscrição'), h('p', { class: 'msg bad' }, e.message)); }
    const bar = (pct, cls = '') => h('div', { class: `bar ${cls}`, role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemax': 100 }, h('i', { style: `width:${Math.min(100, pct)}%` }));
    const buy = (kind, itemId, label, amountKz) => openCheckout({ kind, itemId, label, amountKz }, draw);

    const tierCard = (p) => {
      const current = p.id === s.plan;
      return h('article', { class: `card${current ? ' ok' : ''}` }, h('h3', {}, p.label), h('p', { class: 'mut' }, `${p.price} Kz/mês`),
        h('ul', { class: 'files' }, p.benefits.map((t) => h('li', {}, h('span', {}, icon('check'), ' ', t)))),
        current ? h('span', { class: 'pill ok' }, 'O teu plano') : h('button', { class: 'btn sm', onclick: () => buy('plan', p.id, p.label, p.price) }, icon('zap'), 'Atualizar'));
    };
    const addonCard = (a) => h('article', { class: 'card' }, h('h3', {}, a.label), h('p', { class: 'mut' }, `${a.price} Kz/mês`),
      h('button', { class: 'btn sm', onclick: () => buy('storage_addon', a.id, a.label, a.price) }, icon('layers'), 'Comprar'));

    const requestsCard = mine.requests.length
      ? h('div', { class: 'card' }, h('h3', {}, 'Os meus pedidos'), h('div', { class: 'files' }, mine.requests.map((r) => {
          const [label, cls] = STATUS[r.status] || [r.status, ''];
          return h('div', { class: 'row', style: 'justify-content:space-between;padding:8px 0;border-top:1px solid var(--line)' },
            h('div', {}, h('b', {}, r.kind === 'plan' ? (cat.plans.find((p) => p.id === r.itemId)?.label || r.itemId) : (cat.addons.find((a) => a.id === r.itemId)?.label || r.itemId)),
              h('p', { class: 'mut small' }, `${r.amountKz} Kz · ref. ${r.reference} · ${new Date(r.createdAt).toLocaleDateString('pt-PT')}`),
              r.status === 'rejected' && r.note ? h('p', { class: 'mut small' }, `Motivo: ${r.note}`) : null),
            h('div', { class: 'row' }, h('span', { class: `pill ${cls}` }, label),
              r.status === 'pending' ? h('button', { class: 'btn danger sm', onclick: async () => { try { await api(`/api/me/payments/${r.id}`, { method: 'DELETE' }); toast('Pedido cancelado.'); draw(); } catch (e) { toast(e.message, 'bad'); } } }, 'Cancelar') : null));
        })))
      : null;

    fill(root, h('h2', {}, 'Subscrição'),
      h('div', { class: 'card' }, h('div', { class: 'row', style: 'justify-content:space-between' },
        h('div', {}, h('span', { class: 'pill ok' }, s.status === 'active' ? 'Ativa' : s.status), h('h3', { style: 'margin-top:8px;font-size:1.4rem' }, `Plano ${s.limits.label}`),
          s.renewsAt ? h('p', { class: 'mut small' }, `Renova a ${new Date(s.renewsAt).toLocaleDateString('pt-PT', { dateStyle: 'long' })}`) : null)),
        h('ul', { class: 'files' }, s.limits.benefits.map((t) => h('li', {}, h('span', {}, icon('check'), ' ', t))))),
      h('div', { class: 'card' }, h('h3', {}, 'Armazenamento'), h('p', { class: 'mut small' }, `${s.storage.usedMB} MB de ${fmtMB(s.storage.quotaMB)} usados`),
        bar(s.storage.pct, s.storage.pct >= 100 ? 'bad' : s.storage.pct >= 80 ? 'warn' : ''),
        s.storage.pct >= 100 ? h('p', { class: 'msg bad', style: 'margin-top:10px' }, 'Sem espaço: novos downloads ficam bloqueados até apagares trabalhos antigos ou aumentares o plano.') : null),
      h('div', { class: 'card' }, h('h3', {}, 'Utilização de hoje (API)'), h('p', { class: 'mut small' }, `${s.keys} chave${s.keys === 1 ? '' : 's'} de API`),
        h('div', { class: 'field' }, h('span', { class: 'small' }, `Códigos QR: ${s.usageToday.qr} de ${s.limits.qrPerDay}`), bar((s.usageToday.qr / s.limits.qrPerDay) * 100)),
        h('div', { class: 'field', style: 'margin-top:10px' }, h('span', { class: 'small' }, `Downloads de vídeo: ${s.usageToday.videos} de ${s.limits.videosPerDay}`), bar((s.usageToday.videos / s.limits.videosPerDay) * 100)),
        h('a', { href: '#/api', style: 'margin-top:10px;display:inline-block' }, 'Gerir chaves de API')),
      h('h3', {}, 'Planos Pro'), h('p', { class: 'mut small' }, 'Pagamento por transferência bancária ou Multicaixa Express; ativamos a conta depois de confirmarmos o comprovativo.'),
      h('div', { class: 'plan-cards' }, cat.plans.map(tierCard)),
      s.plan !== 'free' ? h('div', {}, h('h3', { style: 'margin-top:18px' }, 'Mais armazenamento'), h('div', { class: 'plan-cards' }, cat.addons.map(addonCard))) : null,
      requestsCard);
  }
  draw();
  return root;
}
