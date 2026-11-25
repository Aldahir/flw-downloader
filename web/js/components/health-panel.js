import { h, icon } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { store, emit } from '../lib/store.js';

export async function loadHealth() { store.health = await api('/api/health'); emit('health'); }

// Which programs were found on this computer (this used to be the chip row at the top of the page).
export function HealthPanel(ctx) {
  const grid = h('div', { class: 'status-grid' }); const queue = h('p', { class: 'mut' });
  const names = [['ytdlp', 'yt-dlp', 'Descarrega os vídeos'], ['ffmpeg', 'FFmpeg', 'Converte e grava legendas'], ['ffprobe', 'ffprobe', 'Lê o formato dos ficheiros'], ['whisper', 'Whisper', 'Transcreve o áudio']];
  const draw = () => { const t = store.health;
    grid.replaceChildren(...names.map(([k, n, d]) => h('div', { class: 'status-item' }, h('span', { class: t[k] ? 'ok' : 'bad' }, icon(t[k] ? 'check' : 'circle-alert')), h('div', {}, h('b', {}, n), h('div', { class: 'mut small' }, t[k] ? d : 'Não instalado')))));
    queue.textContent = t.maxParallel ? `${t.active}/${t.maxParallel} tarefas ativas · ${t.queued} na fila` : ''; };
  ctx.on('health', draw); loadHealth().catch(() => {}); draw();
  return h('div', { class: 'panel' }, h('h2', {}, 'Componentes'), h('p', {}, 'Os programas que fazem o trabalho. Se faltar algum, corre "npm run doctor" no terminal para ver como instalar.'), grid, queue);
}
