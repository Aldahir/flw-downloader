import { h, fill, icon } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { store, emit } from '../lib/store.js';
import { resetJobs, refreshJobs } from '../lib/jobs-sync.js';
import { toast } from '../lib/toast.js';

const DEV = { mobile: 'Telemóvel', tablet: 'Tablet', desktop: 'Computador' };
const place = (r) => [r.city, r.country].filter(Boolean).join(', ') || 'Local desconhecido';

export function SecurityTab() {
  const root = h('div', { class: 'panel' }); const sessions = h('div', { class: 'card' });
  async function load() {
    try {
      const { sessions: ss, events } = await api('/api/me/sessions');
      fill(sessions, h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', {}, 'Sessões ativas'), ss.length > 1 ? h('button', { class: 'btn soft sm', onclick: async () => { await api('/api/me/sessions/revoke-others', { method: 'POST', body: {} }); toast('Outras sessões terminadas.'); load(); } }, 'Terminar as outras') : null),
        h('ul', { class: 'files' }, ss.map((s) => h('li', {}, h('div', {}, h('b', {}, `${DEV[s.device] || s.device} · ${[s.os, s.browser].filter(Boolean).join(' / ') || 'aparelho desconhecido'}`, s.current ? h('span', { class: 'pill ok', style: 'margin-left:8px' }, 'esta sessão') : null),
          h('div', { class: 'mut small' }, `${place(s)} · última atividade ${new Date(s.lastSeen).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}`)),
          s.current ? null : h('button', { class: 'btn danger sm', onclick: async () => { await api(`/api/me/sessions/${s.id}`, { method: 'DELETE' }); load(); } }, 'Terminar')))),
        h('h3', { style: 'margin-top:18px' }, 'Atividade de início de sessão'),
        h('ul', { class: 'files' }, events.map((e) => h('li', {}, h('span', {}, e.ok ? icon('check') : icon('circle-alert'), ` ${e.ok ? 'Entrada' : 'Tentativa falhada'} · ${DEV[e.device] || e.device} · ${[e.os, e.browser].filter(Boolean).join(' / ')}`), h('span', { class: 'mut small' }, `${place(e)} · ${new Date(e.at).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}`)))),
        h('p', { class: 'mut small' }, 'O local vem do IP, numa base de dados que está no servidor, e é aproximado. O IP em si não é guardado.'));
    } catch (e) { fill(sessions, h('p', { class: 'msg bad' }, e.message)); }
  }
  const cur = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', required: true }), nxt = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', required: true, minlength: 8 }); const pm = h('p', { class: 'msg', hidden: true });
  const dpw = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', required: true }); const files = h('input', { type: 'checkbox' }); const dm = h('p', { class: 'msg bad', hidden: true });
  load();
  return fill(root, h('h2', {}, 'Segurança'), sessions,
    h('form', { class: 'card sheet', style: 'gap:14px', onsubmit: async (e) => { e.preventDefault(); try { await api('/api/auth/password', { body: { current: cur.value, next: nxt.value } }); cur.value = nxt.value = ''; pm.className = 'msg ok'; pm.textContent = 'Palavra-passe alterada. As outras sessões foram terminadas.'; pm.hidden = false; load(); } catch (er) { pm.className = 'msg bad'; pm.textContent = er.message; pm.hidden = false; } } },
      h('h3', {}, 'Mudar palavra-passe'), h('label', { class: 'field' }, h('span', {}, 'Palavra-passe atual'), cur), h('label', { class: 'field' }, h('span', {}, 'Nova palavra-passe (mínimo 8 caracteres)'), nxt), pm, h('button', { class: 'btn sm', type: 'submit', style: 'justify-self:start' }, 'Guardar')),
    h('form', { class: 'card sheet', style: 'gap:14px', onsubmit: async (e) => { e.preventDefault();
      if (!confirm(files.checked ? 'Apagar a conta E todos os ficheiros descarregados por ela? Não dá para desfazer.' : 'Apagar a conta? Os ficheiros ficam no teu computador.')) return;
      try { await api('/api/auth/account', { method: 'DELETE', body: { password: dpw.value, deleteFiles: files.checked } }); store.user = null; store.settings = null; resetJobs(); await refreshJobs(); emit('user'); toast('Conta apagada.'); location.hash = '#/'; } catch (er) { dm.textContent = er.message; dm.hidden = false; } } },
      h('h3', {}, 'Apagar conta'), h('p', { class: 'mut small' }, 'Apaga o perfil, a foto, as chaves de API, os códigos QR dinâmicos e as suas leituras. Os ficheiros descarregados ficam no computador e voltam a aparecer sem conta, a não ser que marques a opção abaixo.'),
      h('label', { class: 'field' }, h('span', {}, 'Palavra-passe'), dpw), h('label', { class: 'chk' }, files, 'Apagar também os ficheiros descarregados por esta conta'), dm, h('button', { class: 'btn danger sm', type: 'submit', style: 'justify-self:start' }, icon('trash-2'), 'Apagar conta')));
}
