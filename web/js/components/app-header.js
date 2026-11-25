import { h, fill, icon } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { store, on, emit } from '../lib/store.js';
import { isActive } from '../lib/format.js';
import { resetJobs, refreshJobs } from '../lib/jobs-sync.js';
import { openAuth } from './auth-dialog.js';
import { Avatar } from './avatar.js';
import { setTheme, currentTheme } from '../lib/theme.js';

const TOOL_LINKS = [
  ['leitor', 'play', 'Leitor de vídeo', 'Qualquer formato, com codecs'],
  ['qr', 'qr-code', 'Códigos QR', 'Texto, link, Wi-Fi, contacto…'],
  ['leitor-qr', 'scan-line', 'Leitor de QR', 'Pela câmara, imagem ou PDF'],
  ['legendas', 'captions', 'Legendas', 'Transcrever, traduzir e gravar'],
  ['modelos', 'download', 'Modelos Whisper', 'Escolher e instalar modelos'],
  ['componentes', 'wrench', 'Componentes', 'yt-dlp, FFmpeg, Whisper'],
];

export function AppHeader(ctx) {
  const nav = h('nav', { class: 'nav', id: 'nav', 'aria-label': 'Principal' });
  const burger = h('button', { class: 'icon-btn burger', 'aria-label': 'Abrir menu', 'aria-expanded': 'false', 'aria-controls': 'nav', onclick: () => { const o = nav.classList.toggle('open'); burger.setAttribute('aria-expanded', String(o)); } }, icon('menu'));
  const right = h('div', { class: 'tools-right' });
  const root = h('header', { class: 'top' }, h('div', { class: 'wrap' },
    h('a', { class: 'logo', href: '#/', 'aria-label': 'FLW Downloader, início' }, h('span', { class: 'dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i')), h('span', {}, h('span', { class: 'hl' }, 'FLW Downloader'))),
    nav, right, burger));

  let toolsOpen = false;
  const closeAll = () => { toolsOpen = false; drawNav(); drawRight(); };
  function drawNav() {
    const route = ctx.route.page;
    const tools = h('div', { class: 'menu' },
      h('button', { class: 'nav-btn', 'aria-expanded': String(toolsOpen), 'aria-haspopup': 'true', 'aria-current': route === 'ferramentas' ? 'page' : null, onclick: (e) => { e.stopPropagation(); toolsOpen = !toolsOpen; drawNav(); } }, icon('wrench'), 'Ferramentas', icon('chevron-down')),
      toolsOpen ? h('div', { class: 'menu-pop' }, TOOL_LINKS.map(([id, ic, t, d]) => h('a', { href: `#/ferramentas/${id}`, onclick: () => { nav.classList.remove('open'); closeAll(); } }, icon(ic), h('span', {}, t, h('small', {}, d))))) : null);
    fill(nav, 
      h('a', { href: '#/', 'aria-current': route === 'home' ? 'page' : null, onclick: () => nav.classList.remove('open') }, icon('download'), 'Transferir'),
      h('a', { href: '#/historico', 'aria-current': route === 'historico' ? 'page' : null, onclick: () => nav.classList.remove('open') }, icon('history'), 'Histórico'),
      h('a', { href: '#/api', 'aria-current': route === 'api' ? 'page' : null, onclick: () => nav.classList.remove('open') }, icon('code'), 'API'), tools);
  }

  let userOpen = false;
  function drawRight() {
    const active = [...store.jobs.values()].filter(isActive).length;
    const u = store.user;
    fill(right, 
      h('a', { class: 'icon-btn', href: '#/historico', 'aria-label': active ? `${active} transferências em curso` : 'Transferências' }, icon('bell'), active ? h('span', { class: 'badge' }, active) : null),
      u ? h('div', { class: 'menu' },
        h('button', { class: 'avatar-btn', 'aria-label': `Conta de ${u.name}`, 'aria-expanded': String(userOpen), 'aria-haspopup': 'true', onclick: (e) => { e.stopPropagation(); userOpen = !userOpen; drawRight(); } }, Avatar(u, 44)),
        userOpen ? h('div', { class: 'menu-pop right' },
          h('div', { class: 'who' }, h('b', {}, u.name), h('small', { class: 'mut' }, u.email)),
          h('a', { href: '#/conta', onclick: () => { userOpen = false; drawRight(); } }, icon('user'), 'O meu perfil'),
          h('a', { href: '#/conta/qr', onclick: () => { userOpen = false; drawRight(); } }, icon('qr-code'), 'Leituras dos QR'),
          h('a', { href: '#/conta/subscricao', onclick: () => { userOpen = false; drawRight(); } }, icon('zap'), 'Subscrição'),
          u.isAdmin ? h('a', { href: '#/admin', onclick: () => { userOpen = false; drawRight(); } }, icon('shield-check'), 'Admin: pagamentos') : null,
          h('button', { onclick: () => { setTheme(currentTheme() === 'dark' ? 'light' : 'dark'); drawRight(); } }, icon(currentTheme() === 'dark' ? 'sun' : 'moon'), currentTheme() === 'dark' ? 'Tema claro' : 'Tema escuro'),
          h('button', { onclick: async () => { await api('/api/auth/logout', { method: 'POST', body: {} }); store.user = null; userOpen = false; resetJobs(); await refreshJobs(); emit('user'); } }, icon('log-out'), 'Sair')) : null)
        : h('div', { class: 'row', style: 'gap:6px' },
          h('button', { class: 'icon-btn', 'aria-label': currentTheme() === 'dark' ? 'Tema claro' : 'Tema escuro', onclick: () => { setTheme(currentTheme() === 'dark' ? 'light' : 'dark'); drawRight(); } }, icon(currentTheme() === 'dark' ? 'sun' : 'moon')),
          h('button', { class: 'btn sm', onclick: () => openAuth() }, icon('user'), h('span', { class: 'btn-label' }, 'Entrar'))));
  }
  const offs = [on('jobs', drawRight), on('user', () => { drawRight(); }), on('route', () => { toolsOpen = false; userOpen = false; drawNav(); drawRight(); })];
  const outside = (e) => { if ((toolsOpen || userOpen) && !e.target.closest('.menu')) { toolsOpen = false; userOpen = false; drawNav(); drawRight(); } };
  const esc = (e) => { if (e.key === 'Escape' && (toolsOpen || userOpen || nav.classList.contains('open'))) { toolsOpen = false; userOpen = false; nav.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); drawNav(); drawRight(); } };
  document.addEventListener('click', outside); document.addEventListener('keydown', esc);
  drawNav(); drawRight();
  return root;
}
