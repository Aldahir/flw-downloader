import { h, fill, icon } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { store } from '../lib/store.js';
import { toast } from '../lib/toast.js';

const KIND = { plan: 'Plano', storage_addon: 'Armazenamento extra' };

export function AdminPage() {
  const root = h('div', { class: 'wrap', style: 'padding-bottom:56px' });
  if (!store.user?.isAdmin) { fill(root, h('div', { class: 'page-head' }, h('h1', {}, 'Admin')), h('p', { class: 'msg bad' }, 'Esta página é só para administradores.')); return root; }

  async function draw() {
    fill(root, h('div', { class: 'page-head' }, h('h1', {}, 'Pagamentos por aprovar')), h('p', { class: 'mut' }, 'A carregar…'));
    let requests; try { requests = (await api('/api/admin/payments')).requests; } catch (e) { return fill(root, h('p', { class: 'msg bad' }, e.message)); }
    const rows = requests.length ? requests.map((r) => {
      const note = h('input', { class: 'input', placeholder: 'Motivo (se rejeitares)', style: 'flex:1 1 200px' });
      return h('article', { class: 'card', style: 'margin-bottom:14px' },
        h('div', { class: 'row', style: 'justify-content:space-between' },
          h('div', {}, h('h3', {}, `${KIND[r.kind] || r.kind}: ${r.itemId}`), h('p', { class: 'mut small' }, `${r.userName} · ${r.userEmail}`), h('p', { class: 'small' }, `${r.amountKz} Kz · ref. ${r.reference} · ${new Date(r.createdAt).toLocaleString('pt-PT')}`)),
          r.proofUrl ? h('a', { class: 'btn soft sm', href: r.proofUrl, target: '_blank', rel: 'noopener noreferrer' }, icon('file-play'), 'Ver comprovativo') : h('span', { class: 'pill bad' }, 'Sem comprovativo')),
        h('div', { class: 'row', style: 'margin-top:12px' }, note,
          h('button', { class: 'btn sm', onclick: async () => { try { await api(`/api/admin/payments/${r.id}/approve`, { method: 'POST', body: {} }); toast('Aprovado.'); draw(); } catch (e) { toast(e.message, 'bad'); } } }, icon('check'), 'Aprovar'),
          h('button', { class: 'btn danger sm', onclick: async () => { try { await api(`/api/admin/payments/${r.id}/reject`, { method: 'POST', body: { note: note.value } }); toast('Rejeitado.'); draw(); } catch (e) { toast(e.message, 'bad'); } } }, 'Rejeitar')));
    }) : [h('p', { class: 'mut' }, 'Não há pedidos por aprovar.')];
    fill(root, h('div', { class: 'page-head' }, h('h1', {}, 'Pagamentos por aprovar'), h('p', {}, 'Confirma o comprovativo fora daqui (banco/Multicaixa) antes de aprovar.')), ...rows);
  }
  draw();
  return root;
}
