import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// jobs.js stores under ./downloads, so run in a throwaway cwd.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flw-jobs-'));
process.chdir(tmp);
process.env.MAX_GLOBAL_PARALLEL = '5'; // read once at import time by server/plans.js
const jobs = await import('../server/jobs.js');
const { GLOBAL_MAX_PARALLEL } = await import('../server/plans.js');

const gate = () => { let open; const p = new Promise((r) => { open = r; }); return { p, open }; };

test('the global cap allows 5 in parallel, the rest queue in order, and cancel works', async () => {
  assert.equal(GLOBAL_MAX_PARALLEL, 5);
  const g = gate();
  const made = Array.from({ length: 8 }, () => jobs.newJob({ title: 't' }));
  const done = made.map((j) => jobs.enqueue(j, () => g.p));
  assert.equal(jobs.stats().active, 5);
  assert.equal(jobs.stats().queued, 3);
  assert.equal(made[5].status, 'queued');
  assert.equal(jobs.pub(made[5]).queuePosition, 1);

  assert.equal(jobs.cancel(made[6]), true); // cancel a queued one
  assert.equal(made[6].status, 'cancelled');
  assert.equal(jobs.stats().queued, 2);

  g.open();
  await Promise.all(done);
  assert.equal(jobs.stats().active, 0);
  assert.deepEqual(made.map((j) => j.status), ['done', 'done', 'done', 'done', 'done', 'done', 'cancelled', 'done']);
});

test('a finished job gets expiresAt from its ttlMinutes, and the sweeper deletes files past it', async () => {
  const j = jobs.newJob({ title: 't', ttlMinutes: 60 });
  await jobs.enqueue(j, () => Promise.resolve());
  assert.equal(j.status, 'done');
  assert.ok(j.expiresAt > Date.now());
  fs.writeFileSync(path.join(j.dir, 'v.mp4'), 'x');
  jobs.sweepExpired(); // not due yet
  assert.equal(j.status, 'done'); assert.ok(fs.existsSync(path.join(j.dir, 'v.mp4')));
  j.expiresAt = Date.now() - 1; // force it due
  jobs.sweepExpired();
  assert.equal(j.status, 'expired');
  assert.ok(!fs.existsSync(path.join(j.dir, 'v.mp4')));
  assert.deepEqual(jobs.pub(j).files, []);
});

test('usedBytes sums only an account\'s own finished jobs, not other users\', queued ones or models', () => {
  const mine1 = jobs.newJob({ userId: 'u-bytes' }); fs.writeFileSync(path.join(mine1.dir, 'a.mp4'), 'x'.repeat(100)); jobs.update(mine1, { status: 'done' });
  const mine2 = jobs.newJob({ userId: 'u-bytes' }); fs.writeFileSync(path.join(mine2.dir, 'b.mp4'), 'x'.repeat(50)); jobs.update(mine2, { status: 'done' });
  const queued = jobs.newJob({ userId: 'u-bytes' }); fs.writeFileSync(path.join(queued.dir, 'c.mp4'), 'x'.repeat(999)); // not 'done': does not count
  const other = jobs.newJob({ userId: 'someone-else' }); fs.writeFileSync(path.join(other.dir, 'd.mp4'), 'x'.repeat(999)); jobs.update(other, { status: 'done' });
  assert.equal(jobs.usedBytes('u-bytes'), 150);
});

test('a priority job jumps ahead of regular ones already queued, but not ahead of another priority job', async () => {
  const g = gate();
  const base = Array.from({ length: 5 }, () => jobs.newJob({})); // fills the 5 global slots
  base.forEach((j) => jobs.enqueue(j, () => g.p));
  const regular = jobs.newJob({});
  const p1 = jobs.newJob({ priority: true });
  const p2 = jobs.newJob({ priority: true });
  jobs.enqueue(regular, () => g.p); jobs.enqueue(p1, () => g.p); jobs.enqueue(p2, () => g.p);
  assert.deepEqual([p1, p2, regular].map((j) => jobs.pub(j).queuePosition), [1, 2, 3]);
  g.open();
  await Promise.all([...base, regular, p1, p2].map((j) => new Promise((r) => { const check = () => (j.status !== 'running' && j.status !== 'queued' ? r() : setTimeout(check, 5)); check(); })));
});

test('failed tasks get a friendly message and the raw detail', async () => {
  const j = jobs.newJob({});
  await jobs.enqueue(j, async () => { throw new Error('ERROR: Private video'); });
  assert.equal(j.status, 'error');
  assert.match(j.error, /privado/);
  assert.match(j.errorDetail, /Private video/);
});

test('jobs persist to disk and running ones come back as interrupted', async () => {
  const j = jobs.newJob({ title: 'persist me' });
  jobs.update(j, { status: 'running', stage: 'x' });
  const again = await import('../server/jobs.js?reload'); // fresh module state, same dir
  again.loadFromDisk();
  const back = again.getJob(j.id);
  assert.equal(back.title, 'persist me');
  assert.equal(back.status, 'interrupted');
});

test('delete removes files only when asked', () => {
  const j = jobs.newJob({});
  fs.writeFileSync(path.join(j.dir, 'a.mp4'), 'x');
  assert.ok(fs.existsSync(j.dir));
  jobs.remove(j);
  assert.ok(!fs.existsSync(j.dir));
  assert.equal(jobs.getJob(j.id), undefined);
});

test('listing files ignores yt-dlp temp files and survives files that vanish', () => {
  const j = jobs.newJob({});
  for (const f of ['v.mp4', 'v.mp4.part', 'v.mp4.ytdl', 'v.mp4.part-Frag12', 'x.temp']) fs.writeFileSync(path.join(j.dir, f), 'x');
  assert.deepEqual(jobs.listFiles(j).map((f) => f.name), ['v.mp4']);
  fs.rmSync(j.dir, { recursive: true });
  assert.deepEqual(jobs.listFiles(j), []); // dir gone: no crash
});

const { canAccess, ownerId } = jobs;
test('jobs are only visible to the account that owns them', () => {
  const mine = { id: 'a', kind: 'download', userId: 'u1' }, anon = { id: 'b', kind: 'download', userId: null }, model = { id: 'c', kind: 'model' };
  assert.equal(canAccess(mine, { id: 'u1' }), true);
  assert.equal(canAccess(mine, { id: 'u2' }), false);
  assert.equal(canAccess(mine, null), false);
  assert.equal(canAccess(anon, null), true);
  assert.equal(canAccess(anon, { id: 'u1' }), false);
  assert.equal(canAccess(model, { id: 'u9' }), true);
  assert.equal(ownerId(null), null);
});

test('disowning keeps the files and makes them visible without an account; removeOwned deletes', () => {
  const a = jobs.newJob({ userId: 'u7' }), b = jobs.newJob({ userId: 'u7' });
  fs.writeFileSync(path.join(a.dir, 'x.mp4'), 'x');
  jobs.disownJobs('u7');
  assert.equal(jobs.canAccess(a, null), true); assert.ok(fs.existsSync(path.join(a.dir, 'x.mp4')));
  const c = jobs.newJob({ userId: 'u8' }); jobs.removeOwned('u8');
  assert.equal(jobs.getJob(c.id), undefined); assert.ok(jobs.getJob(b.id));
});
