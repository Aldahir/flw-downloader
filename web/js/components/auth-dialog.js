import { h, icon } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { store, emit } from '../lib/store.js';
import { resetJobs, refreshJobs } from '../lib/jobs-sync.js';
import { toast } from '../lib/toast.js';
import { applyThemePref } from '../lib/theme.js';

// Sign in / create account. The server answers with an HttpOnly session cookie; the page never sees the token.
export function openAuth(mode = 'login') {
  const dlg = h('dialog', { 'aria-labelledby': 'auth-title' }); document.body.append(dlg);
  const close = () => { dlg.close(); dlg.remove(); };
  const draw = () => {
    const reg = mode === 'register';
    const name = h('input', { class: 'input', id: 'au-name', autocomplete: 'name', maxlength: 60 });
    const email = h('input', { class: 'input', id: 'au-email', type: 'email', autocomplete: 'email', required: true });
    const pw = h('input', { class: 'input', id: 'au-pw', type: 'password', autocomplete: reg ? 'new-password' : 'current-password', required: true, minlength: reg ? 8 : null });
    const err = h('p', { class: 'msg bad', role: 'alert', hidden: true });
    const submit = h('button', { class: 'btn', type: 'submit' }, reg ? 'Criar conta' : 'Entrar');
    const eye = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mostrar palavra-passe', onclick: () => { const s = pw.type === 'password'; pw.type = s ? 'text' : 'password'; eye.setAttribute('aria-label', s ? 'Esconder palavra-passe' : 'Mostrar palavra-passe'); } }, icon('eye'));
    const form = h('form', { class: 'sheet', onsubmit: async (e) => {
      e.preventDefault(); submit.disabled = true; err.hidden = true;
      try {
        const r = await api(reg ? '/api/auth/register' : '/api/auth/login', { body: { name: name.value, email: email.value, password: pw.value } });
        store.user = r.user; if (r.settings) { store.settings = r.settings; applyThemePref(r.settings.theme); } resetJobs(); await refreshJobs(); emit('user'); close();
        toast(r.adopted ? `Conta criada. Os trabalhos que já tinhas passaram para a conta de ${r.user.name}.` : `Olá, ${r.user.name}.`);
      } catch (er) { err.textContent = er.message; err.hidden = false; submit.disabled = false; }
    } },
      h('div', { class: 'sheet-head' }, h('h2', { id: 'auth-title' }, reg ? 'Criar conta' : 'Entrar'), h('button', { class: 'icon-btn dark', type: 'button', 'aria-label': 'Fechar', onclick: close }, icon('x'))),
      h('div', { class: 'tabs2', role: 'tablist' },
        h('button', { type: 'button', role: 'tab', 'aria-selected': String(!reg), onclick: () => { mode = 'login'; draw(); } }, 'Entrar'),
        h('button', { type: 'button', role: 'tab', 'aria-selected': String(reg), onclick: () => { mode = 'register'; draw(); } }, 'Criar conta')),
      reg ? h('label', { class: 'field' }, h('span', {}, 'Nome'), name) : null,
      h('label', { class: 'field' }, h('span', {}, 'Email'), email),
      h('label', { class: 'field' }, h('span', {}, reg ? 'Palavra-passe (mínimo 8 caracteres)' : 'Palavra-passe'), h('div', { class: 'pw' }, pw, eye)),
      err, submit,
      reg ? null : h('details', { class: 'small mut' }, h('summary', { style: 'cursor:pointer' }, 'Esqueceste a palavra-passe?'), h('p', { style: 'margin:8px 0 0' }, 'Não enviamos emails: a app corre no teu computador. No terminal, na pasta do projeto, corre ', h('code', {}, 'npm run account -- reset o-teu-email'), ' e escolhe uma nova.')),
      h('p', { class: 'mut small' }, 'A sessão fica guardada num cookie neste computador durante 30 dias. A conta e os dados ficam só aqui, nunca saem do teu computador.'));
    dlg.replaceChildren(form); (reg ? name : email).focus();
  };
  dlg.addEventListener('cancel', () => setTimeout(() => dlg.remove(), 0));
  draw(); dlg.showModal();
}
