// Tiny shared state with topics. Pages subscribe through ctx.on(), which is cleaned up on every route change.
const subs = new Map();
export const store = { user: null, settings: null, platforms: [], jobs: new Map(), models: [], health: {}, selection: { jobId: null, file: '' } };
export const on = (topic, fn) => { const s = subs.get(topic) || new Set(); s.add(fn); subs.set(topic, s); return () => s.delete(fn); };
export const emit = (topic) => (subs.get(topic) || []).forEach((fn) => fn());
export const platformLabel = (id) => (id === 'other' ? 'Outras fontes' : store.platforms.find((p) => p.id === id)?.label || id);
export const jobList = () => [...store.jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
export const countByPlatform = (list = jobList()) => { const m = new Map(); for (const j of list) m.set(j.platform || 'other', (m.get(j.platform || 'other') || 0) + 1); return m; };
