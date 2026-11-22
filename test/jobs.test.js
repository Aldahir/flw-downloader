import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// jobs.js stores under ./downloads, so run in a throwaway cwd.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flw-jobs-'));
process.chdir(tmp);
const jobs = await import('../server/jobs.js');
const { maxParallel } = await import('../server/plans.js');

const gate = () => { let open; const p = new Promise((r) => { open = r; }); return { p, open }; };

test('free plan allows 5 in parallel, the rest queue in order, and cancel works', async () => {
  assert.equal(maxParallel(), 5);
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
