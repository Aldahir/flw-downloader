// Job store: persisted on disk (survives restarts), parallel-limited queue, cancel and delete.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { GLOBAL_MAX_PARALLEL } from './plans.js';
import { friendly } from './errors.js';
import { platformOf } from './platforms.js';

export const DOWNLOADS = path.resolve(process.env.FLW_DOWNLOADS || 'downloads');
const jobs = new Map();
const listeners = new Map();
const waiting = []; // queued tasks
let active = 0;

const META = 'job.json';
const PERSISTED = ['id', 'kind', 'title', 'url', 'status', 'stage', 'progress', 'error', 'errorDetail', 'createdAt', 'platform', 'userId', 'priority', 'ttlMinutes', 'expiresAt'];

// yt-dlp keeps temp files while downloading (.part, .ytdl, .part-FragN, .temp) and deletes them at any moment.
const isTemp = (f) => /\.(part|ytdl|temp)$|\.part-Frag\d+/.test(f);
export function listFiles(job) {
  let names;
  try { names = fs.readdirSync(job.dir); } catch { return []; }
  const out = [];
  for (const f of names) {
    if (f === META || f.startsWith('.') || isTemp(f)) continue;
    try { out.push({ name: f, url: `/files/${job.id}/${encodeURIComponent(f)}`, size: fs.statSync(path.join(job.dir, f)).size }); }
    catch { /* file vanished between readdir and stat */ }
  }
  return out;
}

export const pub = (j) => ({
  id: j.id, kind: j.kind, title: j.title, url: j.url, status: j.status, stage: j.stage, progress: j.progress,
  error: j.error, errorDetail: j.errorDetail, createdAt: j.createdAt, files: (j.status === 'deleted' || j.status === 'expired') ? [] : listFiles(j),
  queuePosition: j.status === 'queued' ? waiting.findIndex((w) => w.job === j) + 1 : 0,
  platform: j.platform || platformOf(j.url), speed: j.speed || '', eta: j.eta || '', sizeText: j.sizeText || '',
  expiresAt: j.expiresAt || null,
});
// Bytes currently on disk across an account's finished (not yet expired/deleted) jobs — used to enforce the plan's storage quota.
export const usedBytes = (userId) => [...jobs.values()].filter((j) => j.kind !== 'model' && j.userId === userId && j.status === 'done')
  .reduce((sum, j) => sum + listFiles(j).reduce((s, f) => s + f.size, 0), 0);

// Jobs belong to the account that created them (null = nobody logged in). Model downloads are shared.
export const ownerId = (user) => (user ? user.id : null);
export const canAccess = (job, user) => job.kind === 'model' || (job.userId ?? null) === ownerId(user);

// Optional listener (the MySQL history mirror). Set once at startup; absent in unit tests.
let sink = null;
export const setJobSink = (fn, removed) => { sink = fn; onRemoved = removed || null; };
let onRemoved = null;
export const allJobObjects = () => [...jobs.values()];

function persist(job) {
  if (job.kind === 'model') return;
  try { sink?.(job); } catch { /* history is best effort */ }
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
// The first account created on this computer inherits the jobs made before accounts existed.
export function claimUnowned(userId) {
  for (const j of jobs.values()) if (j.kind !== 'model' && !j.userId) { j.userId = userId; persist(j); }
}
export const allJobs = (user) => [...jobs.values()].filter((j) => j.kind !== 'model' && canAccess(j, user)).sort((a, b) => b.createdAt - a.createdAt).map(pub);

// ---- queue ----
function pump() {
  while (active < GLOBAL_MAX_PARALLEL && waiting.length) {
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
    if (job.status === 'running') {
      const expiresAt = Date.now() + (job.ttlMinutes || 60) * 60_000;
      update(job, { status: 'done', stage: stage || job.stage, progress: 100, speed: '', eta: '', sizeText: '', expiresAt });
    }
  } catch (e) {
    if (ac.signal.aborted) update(job, { status: 'cancelled', stage: 'cancelado' });
    else { const f = friendly(e); update(job, { status: 'error', stage: 'erro', error: f.hint ? `${f.message} ${f.hint}` : f.message, errorDetail: f.raw }); }
  } finally {
    job.abort = null; active--; pump();
  }
}

// Queue a task for a job. Runs now if under the global parallel cap. A job created with
// `priority: true` (a paying account) joins the line after other priority jobs but ahead of free ones.
export function enqueue(job, fn) {
  return new Promise((resolve) => {
    const entry = { job, fn, resolve };
    if (job.priority) { let i = 0; while (i < waiting.length && waiting[i].job.priority) i++; waiting.splice(i, 0, entry); }
    else waiting.push(entry);
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

// Account deleted: keep the files (never auto-delete) and make them visible again without an account.
export function disownJobs(userId) { for (const j of jobs.values()) if (j.userId === userId) { j.userId = null; persist(j); } }
export function removeOwned(userId) { for (const j of [...jobs.values()]) if (j.userId === userId) remove(j); }

export function remove(job) {
  cancel(job);
  fs.rmSync(job.dir, { recursive: true, force: true });
  jobs.delete(job.id);
  onRemoved?.(job.id);
}

export function subscribe(job, res) {
  res.write(`data: ${JSON.stringify(pub(job))}\n\n`);
  const arr = listeners.get(job.id) || []; arr.push(res); listeners.set(job.id, arr);
  res.on('close', () => listeners.set(job.id, (listeners.get(job.id) || []).filter((r) => r !== res)));
}
export const stats = () => ({ active, queued: waiting.length, maxParallel: GLOBAL_MAX_PARALLEL });

// A finished job's files are deleted once its plan's validity (ttlMinutes, counted from completion) runs
// out; the job itself stays (status 'expired') so it keeps showing in the history. Nothing is deleted while
// it is still queued/running, and a job the user already deleted is simply gone, not "expired".
export function sweepExpired() {
  const now = Date.now();
  for (const job of jobs.values()) {
    if (job.status === 'done' && job.expiresAt && job.expiresAt <= now) {
      fs.rmSync(job.dir, { recursive: true, force: true });
      fs.mkdirSync(job.dir, { recursive: true });
      update(job, { status: 'expired', stage: 'expirado (passou a validade do plano)' });
    }
  }
}
export const startExpirySweeper = (intervalMs = 60_000) => { sweepExpired(); return setInterval(sweepExpired, intervalMs); };
