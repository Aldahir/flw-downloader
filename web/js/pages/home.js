import { h } from '../lib/dom.js';
import { jobList } from '../lib/store.js';
import { removeJob } from '../lib/jobs-sync.js';
import { Hero } from '../components/hero.js';
import { PlatformGrid } from '../components/platform-grid.js';
import { DownloadList } from '../components/download-list.js';
import { HomeSections } from '../components/home-sections.js';
import { openJob } from '../components/job-dialog.js';

export function HomePage(ctx) {
  const list = DownloadList({
    empty: [h('strong', {}, 'Ainda não descarregaste nada'), h('span', {}, 'Cola um link aqui em cima. Os downloads em curso aparecem aqui, com o progresso.')],
    onOpen: openJob, onDelete: async (id) => { if (confirm('Apagar este trabalho e todos os seus ficheiros? Não dá para desfazer.')) await removeJob(id); },
  });
  const grid = PlatformGrid();
  const draw = () => { list.set(jobList().slice(0, 5)); grid.update(); };
  ctx.on('jobs', draw); draw();
  return h('div', {}, Hero(),
    h('section', { class: 'section', 'aria-labelledby': 'rec' }, h('div', { class: 'wrap' },
      h('div', { class: 'section-head' }, h('h2', { id: 'rec' }, 'Transferências'), h('a', { href: '#/historico' }, 'Ver todo o histórico')), list.el)),
    h('section', { class: 'section', 'aria-labelledby': 'plat' }, h('div', { class: 'wrap' },
      h('div', { class: 'section-head' }, h('h2', { id: 'plat' }, 'Plataformas')), grid.el)),
    HomeSections());
}
