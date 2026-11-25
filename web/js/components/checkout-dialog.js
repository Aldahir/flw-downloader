import { h, icon } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

// Manual payment (bank transfer / Multicaixa): create the request, show the reference and the
// account's payment details, let the user upload a proof. A human approves it afterwards (#/admin).
export function openCheckout({ kind, itemId, label, amountKz }, onDone) {
  const dlg = h('dialog', { 'aria-labelledby': 'checkout-title' }); document.body.append(dlg);
  const close = () => { dlg.close(); dlg.remove(); };
  const body = h('div', {}, h('p', { class: 'mut' }, 'A criar o pedido…'));
  dlg.append(h('div', { class: 'sheet' },
    h('div', { class: 'sheet-head' }, h('h2', { id: 'checkout-title' }, `Comprar: ${label}`), h('button', { class: 'icon-btn dark', 'aria-label': 'Fechar', onclick: close }, icon('x'))),
    body));
  dlg.addEventListener('cancel', () => setTimeout(() => dlg.remove(), 0));
  dlg.showModal();

  (async () => {
    let cat, req;
    try { [cat, req] = await Promise.all([api('/api/billing/plans'), api('/api/me/payments', { body: { kind, itemId } })]); }
    catch (e) { body.replaceChildren(h('p', { class: 'msg bad' }, e.message)); return; }

    const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,application/pdf', hidden: true });
    const status = h('p', { class: 'mut small' });
    const upBtn = h('button', { class: 'btn soft sm', onclick: () => file.click() }, icon('upload'), 'Escolher comprovativo…');
    const finishBtn = h('button', { class: 'btn', onclick: () => { close(); onDone?.(); } }, 'Concluir');
    file.onchange = async () => {
      const f = file.files[0]; file.value = ''; if (!f) return;
      status.textContent = 'A enviar…'; status.className = 'mut small';
      try {
        await api(`/api/me/payments/${req.id}/proof`, { method: 'POST', headers: { 'Content-Type': f.type || 'application/octet-stream' }, body: f });
        status.textContent = 'Comprovativo enviado. Assim que for aprovado, a conta é atualizada automaticamente.'; status.className = 'msg ok';
        toast('Comprovativo enviado.');
      } catch (e) { status.textContent = e.message; status.className = 'msg bad'; }
    };
    const i = cat.instructions;
    const instructions = [i.bankName && ['Banco', i.bankName], i.iban && ['IBAN', i.iban], i.multicaixa && ['Multicaixa Express', i.multicaixa]].filter(Boolean);
    body.replaceChildren(
      h('p', {}, `Valor a pagar: `, h('b', {}, `${req.amountKz} Kz`)),
      h('p', {}, `Referência (indica-a na transferência): `, h('code', {}, req.reference)),
      instructions.length
        ? h('div', { class: 'card', style: 'margin:10px 0' }, instructions.map(([l, v]) => h('p', { class: 'small', style: 'margin:4px 0' }, h('b', {}, `${l}: `), v)))
        : h('p', { class: 'msg warn' }, 'Os dados de pagamento ainda não foram configurados. Contacta o suporte antes de pagar.'),
      h('p', { class: 'mut small' }, 'Depois de pagares, envia aqui o comprovativo (print ou PDF). Revemos e ativamos manualmente — vês o estado em "Os meus pedidos" abaixo.'),
      h('div', { class: 'row' }, upBtn, file), status,
      h('div', { class: 'sheet-actions' }, finishBtn));
  })();
  return dlg;
}
