// Job store: persisted on disk (survives restarts), parallel-limited queue, cancel and delete.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { maxParallel } from './plans.js';
import { friendly } from './errors.js';

export const DOWNLOADS = path.resolve('downloads');
const jobs = new Map();
const listeners = new Map();
const waiting = []; // queued tasks
let active = 0;

const META = 'job.json';
const PERSISTED = ['id', 'kind', 'title', 'url', 'status', 'stage', 'progress', 'error', 'errorDetail', 'createdAt'];

export function listFiles(job) {
  return fs.existsSync(job.dir)
    ? fs.readdirSync(job.dir).filter((f) => f !== META && !f.startsWith('.') && !f.endsWith('.part'))
        .map((f) => ({ name: f, url: `/files/${job.id}/${encodeURIComponent(f)}`, size: fs.statSync(path.join(job.dir, f)).size }))
    : [];
}

export const pub = (j) => ({
  id: j.id, kind: j.kind, title: j.title, url: j.url, status: j.status, stage: j.stage, progress: j.progress,
  error: j.error, errorDetail: j.errorDetail, createdAt: j.createdAt, files: j.status === 'deleted' ? [] : listFiles(j),
  queuePosition: j.status === 'queued' ? waiting.findIndex((w) => w.job === j) + 1 : 0,
});

function persist(job) {
  if (job.kind === 'model') return;
  try {
    fs.mkdirSync(job.dir, { recursive: true });
    fs.writeFileSync(path.join(job.dir, META), JSON.stringify(Object.fromEntries(PERSISTED.map((k) => [k, job[k]]))));
  } catch { /* disk full etc.: keep in memory */ }
}

export function update(job, patch) {
  Object.assign(job, patch);
  persist(job);
  emit(job);
}
function emit(job) {
  const data = `data: ${JSON.stringify(pub(job))}\n\n`;
  (listeners.get(job.id) || []).forEach((res) => res.write(data));
}

export function loadFromDisk() {
  if (!fs.existsSync(DOWNLOADS)) return;
  for (const id of fs.readdirSync(DOWNLOADS)) {
    const dir = path.join(DOWNLOADS, id);
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(dir, META), 'utf8'));
      const job = { ...meta, dir };
      if (job.status === 'running' || job.status === 'queued') {
        Object.assign(job, { status: 'interrupted', stage: 'interrompido (o servidor foi reiniciado)' });
        persist(job);
      }
      jobs.set(job.id, job);
    } catch { /* not a job dir */ }
  }
}

export function newJob(extra = {}) {
  const id = crypto.randomUUID().slice(0, 8);
  const dir = path.join(DOWNLOADS, id);
  fs.mkdirSync(dir, { recursive: true });
  const job = { id, dir, kind: 'download', status: 'idle', stage: '', progress: 0, error: null, createdAt: Date.now(), ...extra };
  jobs.set(id, job);
  persist(job);
  return job;
}
export const getJob = (id) => jobs.get(id);
export const allJobs = () => [...jobs.values()].filter((j) => j.kind !== 'model').sort((a, b) => b.createdAt - a.createdAt).map(pub);

// ---- queue ----
function pump() {
  while (active < maxParallel() && waiting.length) {
    const { job, fn, resolve } = waiting.shift();
    start(job, fn).then(resolve);
    waitingChanged();
  }
}
const waitingChanged = () => waiting.forEach((w) => emit(w.job));

async function start(job, fn) {
  active++;
  const ac = new AbortController();
  job.abort = ac;
  update(job, { status: 'running', error: null, errorDetail: null });
  try {
    const stage = await fn(ac.signal);
    if (job.status === 'running') update(job, { status: 'done', stage: stage || job.stage, progress: 100 });
  } catch (e) {
    if (ac.signal.aborted) update(job, { status: 'cancelled', stage: 'cancelado' });
    else { const f = friendly(e); update(job, { status: 'error', stage: 'erro', error: f.hint ? `${f.message} ${f.hint}` : f.message, errorDetail: f.raw }); }
  } finally {
    job.abort = null; active--; pump();
  }
}

// Queue a task for a job. Runs now if under the plan's parallel limit.
export function enqueue(job, fn) {
  return new Promise((resolve) => {
    waiting.push({ job, fn, resolve });
    update(job, { status: 'queued', stage: 'na fila', error: null, errorDetail: null });
    pump();
  });
}

export function cancel(job) {
  const i = waiting.findIndex((w) => w.job === job);
  if (i >= 0) { const [w] = waiting.splice(i, 1); w.resolve(); update(job, { status: 'cancelled', stage: 'cancelado' }); waitingChanged(); return true; }
  if (job.abort) { job.abort.abort(); return true; }
  return false;
}

export function remove(job) {
  cancel(job);
  fs.rmSync(job.dir, { recursive: true, force: true });
  jobs.delete(job.id);
}

export function subscribe(job, res) {
  res.write(`data: ${JSON.stringify(pub(job))}\n\n`);
  const arr = listeners.get(job.id) || []; arr.push(res); listeners.set(job.id, arr);
  res.on('close', () => listeners.set(job.id, (listeners.get(job.id) || []).filter((r) => r !== res)));
}
export const stats = () => ({ active, queued: waiting.length, maxParallel: maxParallel() });
