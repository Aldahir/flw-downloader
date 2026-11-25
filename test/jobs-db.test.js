import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createJobsDb } from '../server/jobs-db.js';
import { createAuth } from '../server/auth.js';
import { testPool as pool, skip, clean } from './db-helper.js';

let jdb, uid;
beforeEach(async () => { if (skip) return; await clean(); jdb = createJobsDb(pool); uid = (await createAuth(pool).register({ name: 'U', email: 'u@example.com', password: 'password 123' })).user.id; });
after(() => pool.end());
const job = (o) => ({ id: Math.random().toString(16).slice(2, 10), kind: 'download', title: 'Vídeo', url: 'https://youtu.be/x', platform: 'youtube', status: 'done', stage: 'ok', createdAt: Date.now(), userId: uid, dir: '/nonexistent', ...o });

test('jobs are mirrored, updated in place and filterable', { skip }, async () => {
  const a = job({ title: 'Aula de design' }), b = job({ platform: 'tiktok', status: 'error', error: 'falhou', title: 'Dança' });
  await jdb.record(a); await jdb.record(b); await jdb.record({ ...a, status: 'done', stage: 'novo' });
  const all = await jdb.history(uid); assert.equal(all.total, 2);
  assert.equal((await jdb.history(uid, { platform: 'tiktok' })).items[0].title, 'Dança'); assert.equal((await jdb.history(uid, { status: 'error' })).total, 1);
  assert.equal((await jdb.history(uid, { q: 'aula' })).total, 1); assert.equal((await jdb.history(uid, { q: '%' })).total, 0); // wildcards are escaped
});
test('history is private and paginated; the summary counts', { skip }, async () => {
  for (let i = 0; i < 25; i++) await jdb.record(job({ id: `j${String(i).padStart(7, '0')}` }));
  await jdb.record(job({ id: 'other000', userId: null }));
  const p1 = await jdb.history(uid, { pageSize: 20 }); assert.equal(p1.items.length, 20); assert.equal(p1.total, 25); assert.equal((await jdb.history(uid, { page: 2 })).items.length, 5);
  const s = await jdb.summary(uid); assert.equal(s.total, 25); assert.equal(s.done, 25); assert.deepEqual(s.byPlatform, [{ platform: 'youtube', n: 25 }]);
});
test('a job of an unknown user is kept without owner instead of failing', { skip }, async () => {
  await jdb.record(job({ id: 'ghost000', userId: 'nonexistent1' })); assert.equal((await pool.query("SELECT user_id FROM jobs WHERE id='ghost000'"))[0][0].user_id, null);
});
test('forget removes the row; model downloads are never mirrored', { skip }, async () => {
  const j = job({ id: 'gone0000' }); await jdb.record(j); await jdb.forget(j.id); assert.equal((await jdb.history(uid)).total, 0);
  await jdb.record(job({ id: 'model000', kind: 'model' })); assert.equal((await pool.query('SELECT COUNT(*) n FROM jobs'))[0][0].n, 0);
});
