import { h } from './lib/dom.js';
import { api } from './lib/api.js';
import { store, on, emit } from './lib/store.js';
import { refreshJobs } from './lib/jobs-sync.js';
import { toast } from './lib/toast.js';
import { applyThemePref } from './lib/theme.js';
import { AppHeader } from './components/app-header.js';
import { AppFooter } from './components/app-footer.js';
import { loadModels } from './components/models-panel.js';
import { loadHealth } from './components/health-panel.js';
import { HomePage } from './pages/home.js';
import { HistoryPage } from './pages/history.js';
import { ToolsPage } from './pages/tools.js';
import { ApiPage } from './pages/api.js';
import { ContaPage } from './pages/conta.js';
import { AdminPage } from './pages/admin.js';

const PAGES = { home: HomePage, historico: HistoryPage, api: ApiPage, conta: ContaPage, ferramentas: ToolsPage, admin: AdminPage };
const TITLES = { home: 'Transferir', historico: 'Histórico', api: 'API', conta: 'O meu perfil', ferramentas: 'Ferramentas', admin: 'Admin' };
let offs = [];
const ctx = { route: parse(), on: (topic, fn) => offs.push(on(topic, fn)), cleanup: (fn) => offs.push(fn) };

function parse() {
  const [path, qs = ''] = (location.hash.replace(/^#/, '') || '/').split('?');
  let [, page = '', sub = ''] = path.split('/');
  if (page === 'leitor' || page === 'qr') { sub = page; page = 'ferramentas'; } // old links
  return { page: PAGES[page || 'home'] ? page || 'home' : 'home', sub, query: new URLSearchParams(qs) };
}

const main = h('main', { id: 'main', tabindex: '-1', style: 'outline:none' });
function render() {
  offs.forEach((off) => off()); offs = [];
  ctx.route = parse();
  main.replaceChildren(PAGES[ctx.route.page](ctx));
  document.title = `${TITLES[ctx.route.page]} · FLW Downloader`;
  emit('route');
}

let last = '';
window.addEventListener('hashchange', () => { const k = parse().page; render(); if (k !== last) { window.scrollTo(0, 0); main.focus({ preventScroll: true }); } last = k; });

(async () => {
  document.body.prepend(h('a', { class: 'skip', href: '#main', onclick: (e) => { e.preventDefault(); main.focus(); } }, 'Saltar para o conteúdo'));
  document.body.append(AppHeader(ctx), main, AppFooter());
  try {
    const me = await api('/api/auth/me'); store.user = me.user; store.platforms = me.platforms; store.settings = me.settings; if (me.settings) applyThemePref(me.settings.theme);
    await Promise.all([loadModels(), loadHealth(), refreshJobs()]);
  } catch (e) { toast(e.message, 'bad'); }
  last = ctx.route.page; render(); emit('user');
  setInterval(() => loadHealth().catch(() => {}), 5000);
})();
