import { h } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { store, emit } from '../lib/store.js';

export async function loadModels() { store.models = await api('/api/models'); emit('models'); }

export function ModelsPanel(ctx) {
  const list = h('div'); const note = h('p', { class: 'mut small', role: 'status' });
  function watch(id) {
    const es = new EventSource(`/api/jobs/${id}/events`);
    es.onmessage = (m) => { const j = JSON.parse(m.data); note.textContent = `${j.title}: ${j.stage} ${Math.round(j.progress)}%${j.error ? ` — ${j.error}` : ''}`;
      if (['done', 'error', 'cancelled'].includes(j.status)) { es.close(); loadModels(); } };
  }
  const draw = () => list.replaceChildren(...store.models.map((m) => h('div', { class: 'model' },
    h('div', {}, h('strong', {}, m.label), h('div', { class: 'mut small' }, `${m.sizeMB >= 1000 ? `${(m.sizeMB / 1000).toFixed(1)} GB` : `${m.sizeMB} MB`} · ${m.note}`)),
    m.installed ? h('span', { class: 'pill ok' }, '✓ instalado') : h('button', { class: 'btn line sm', onclick: async (e) => { e.target.disabled = true; try { watch((await api('/api/models/download', { body: { name: m.name } })).id); } catch (er) { note.textContent = er.message; e.target.disabled = false; } } }, 'Descarregar'))));
  ctx.on('models', draw); draw();
  return h('div', { class: 'panel' }, h('h2', {}, 'Modelos Whisper'), h('p', {}, 'Modelos maiores transcrevem melhor, mas demoram mais e ocupam mais espaço. Só descarrego um modelo quando tu pedires.'), h('div', { class: 'card' }, list, note));
}
