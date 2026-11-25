import { h, fill } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { store, emit } from '../lib/store.js';
import { applyThemePref } from '../lib/theme.js';
import { toast } from '../lib/toast.js';

export function SettingsTab() {
  const s = { ...store.settings }; const root = h('div', { class: 'panel' });
  const seg = (key, opts) => h('div', { class: 'seg', role: 'radiogroup' }, opts.map(([v, l]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(s[key] === v), onclick: (e) => { s[key] = v; e.currentTarget.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b === e.currentTarget))); } }, l)));
  const hgt = h('select', { class: 'input', style: 'width:auto', onchange: (e) => { s.defaultHeight = e.target.value ? Number(e.target.value) : null; } }, [['', 'Melhor disponível'], [2160, '2160p (4K)'], [1440, '1440p'], [1080, '1080p'], [720, '720p'], [480, '480p'], [360, '360p']].map(([v, l]) => h('option', { value: v, selected: String(s.defaultHeight ?? '') === String(v) }, l)));
  return fill(root, h('h2', {}, 'Definições'),
    h('form', { class: 'card sheet', style: 'gap:18px', onsubmit: async (e) => { e.preventDefault(); try { store.settings = await api('/api/me/settings', { method: 'PUT', body: s }); applyThemePref(store.settings.theme); emit('user'); toast('Definições guardadas.'); } catch (er) { toast(er.message, 'bad'); } } },
      h('div', { class: 'field' }, h('span', {}, 'Tema'), seg('theme', [['auto', 'Como o sistema'], ['light', 'Claro'], ['dark', 'Escuro']])),
      h('div', { class: 'field' }, h('span', {}, 'Formato por omissão nos downloads'), seg('defaultKind', [['video', 'Vídeo (MP4)'], ['audio', 'Só áudio (MP3)']])),
      h('label', { class: 'field' }, h('span', {}, 'Qualidade máxima por omissão'), hgt),
      h('label', { class: 'field' }, h('span', {}, 'Vídeos que pedem login (cookies do navegador)'), h('select', { class: 'input', style: 'width:auto', onchange: (e) => { s.cookiesBrowser = e.target.value; } }, [['', 'Não usar'], ['chrome', 'Chrome'], ['firefox', 'Firefox'], ['edge', 'Edge'], ['brave', 'Brave'], ['safari', 'Safari']].map(([v, l]) => h('option', { value: v, selected: (s.cookiesBrowser || '') === v }, l))), h('span', { class: 'mut small' }, 'Para vídeos privados ou com idade mínima. O yt-dlp lê os cookies neste computador e usa-os só para esse pedido; nada é guardado nem enviado. O macOS pode pedir permissão.')),
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: s.scanReports !== false, onchange: (e) => { s.scanReports = e.target.checked; } }), 'Registar as leituras dos meus códigos QR dinâmicos (aparelho e local aproximado)'),
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: s.notifyStorage !== false, onchange: (e) => { s.notifyStorage = e.target.checked; } }), 'Avisar-me por email quando o armazenamento estiver quase ou totalmente cheio'),
      h('button', { class: 'btn sm', type: 'submit', style: 'justify-self:start' }, 'Guardar definições')));
}
