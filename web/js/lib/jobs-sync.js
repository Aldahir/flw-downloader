// Keeps store.jobs in step with the server: one list fetch, then a live stream per active job.
import { api } from './api.js';
import { store, emit } from './store.js';
import { isActive } from './format.js';

const streams = new Map();
function watch(j) {
  if (!isActive(j) || streams.has(j.id)) return;
  const es = new EventSource(`/api/jobs/${j.id}/events`); streams.set(j.id, es);
  es.onmessage = (m) => {
    const d = JSON.parse(m.data); store.jobs.set(d.id, d);
    if (!isActive(d)) { es.close(); streams.delete(d.id); emit('health'); }
    emit('jobs'); emit(`job:${d.id}`);
  };
  es.onerror = () => { es.close(); streams.delete(j.id); };
}
export function put(j) { store.jobs.set(j.id, j); watch(j); }
export async function refreshJobs() { const list = await api('/api/jobs'); list.forEach(put); const ids = new Set(list.map((j) => j.id)); for (const id of [...store.jobs.keys()]) if (!ids.has(id)) store.jobs.delete(id); emit('jobs'); }
export function resetJobs() { streams.forEach((es) => es.close()); streams.clear(); store.jobs.clear(); emit('jobs'); }
export async function removeJob(id) { await api(`/api/jobs/${id}`, { method: 'DELETE' }); store.jobs.delete(id); emit('jobs'); }
