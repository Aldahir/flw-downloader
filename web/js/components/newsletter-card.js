import { h, icon } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

// A compact email sign-up, meant for the footer (every page). Actual sending depends on the
// server having a mail service configured (server/mailer.js); the subscription itself always works.
export function NewsletterCard() {
  const input = h('input', { class: 'input', type: 'email', placeholder: 'o-teu@email.com', 'aria-label': 'Email para a newsletter', required: true, style: 'flex:1 1 180px' });
  const msg = h('p', { class: 'mut small', style: 'margin-top:6px' });
  return h('form', { class: 'news-card', onsubmit: async (e) => {
    e.preventDefault();
    try { await api('/api/newsletter', { body: { email: input.value } }); msg.textContent = 'Inscrito! Podes cancelar quando quiseres.'; msg.className = 'small ok'; input.value = ''; toast('Inscrição confirmada.'); }
    catch (er) { msg.textContent = er.message; msg.className = 'small bad'; }
  } },
    h('h3', {}, 'Novidades por email'), h('p', { class: 'mut small' }, 'Uma ou outra novidade, sem spam.'),
    h('div', { class: 'row', style: 'margin-top:8px' }, input, h('button', { class: 'btn sm', type: 'submit' }, icon('mail'), 'Subscrever')), msg);
}
