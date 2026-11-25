import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createQrDynamic, QrDynError, MAX_QR } from '../server/qr-dynamic.js';
import { createAuth } from '../server/auth.js';
import { testPool as pool, skip, clean } from './db-helper.js';

let qrs, uid, other;
beforeEach(async () => { if (skip) return; await clean(); const a = createAuth(pool); qrs = createQrDynamic(pool);
  uid = (await a.register({ name: 'U', email: 'u@example.com', password: 'password 123' })).user.id; other = (await a.register({ name: 'O', email: 'o@example.com', password: 'password 123' })).user.id; });
after(() => pool.end());
const mobile = { device: 'mobile', os: 'iOS', browser: 'Safari', country: 'PT', region: '11', city: 'Lisboa', ipHash: 'a'.repeat(64) };

test('create validates the destination and gives a short code', { skip }, async () => {
  const q = await qrs.create(uid, { title: 'Cartaz', target: 'exemplo.com/promo' });
  assert.match(q.code, /^[a-zA-Z0-9]{8}$/); assert.equal(q.target, 'https://exemplo.com/promo'); assert.equal(q.active, true);
  await assert.rejects(qrs.create(uid, { title: '', target: 'x.com' }), QrDynError); await assert.rejects(qrs.create(uid, { title: 'a', target: 'javascript:alert(1)' }), QrDynError); await assert.rejects(qrs.create(uid, { title: 'a', target: 'ftp://x.com' }), QrDynError);
});
test('only safe design fields are kept', { skip }, async () => {
  const q = await qrs.create(uid, { title: 'D', target: 'x.com', design: { fg: '#112233', bg: 'red', shape: 'dots', evil: '<script>', logo: 'https://evil.example/x.png', margin: 99 } });
  assert.deepEqual(q.design, { fg: '#112233', shape: 'dots' });
});
test('open redirects, counts the scan with device and place, and keeps no raw IP', { skip }, async () => {
  const q = await qrs.create(uid, { title: 'T', target: 'x.com/a' });
  const r = await qrs.open(q.code, mobile, 'https://t.co/abc'); assert.equal(r.status, 302); assert.equal(r.target, 'https://x.com/a');
  await new Promise((res) => setTimeout(res, 150));
  const [[s]] = await pool.query('SELECT * FROM qr_scans'); assert.equal(s.device, 'mobile'); assert.equal(s.os, 'iOS'); assert.equal(s.city, 'Lisboa'); assert.equal(s.country, 'PT'); assert.equal(s.ip_hash.length, 64); assert.equal(s.referrer, 'https://t.co/abc');
  assert.equal((await qrs.open('zzzzzzzz', mobile)).status, 404); assert.equal((await qrs.open('bad!', mobile)).status, 404);
});
test('changing the destination keeps the same code; pausing returns 410', { skip }, async () => {
  const q = await qrs.create(uid, { title: 'T', target: 'x.com/a' });
  await qrs.update(uid, q.id, { target: 'y.com/b' }); assert.equal((await qrs.open(q.code, mobile)).target, 'https://y.com/b');
  await qrs.update(uid, q.id, { active: false }); assert.equal((await qrs.open(q.code, mobile)).status, 410);
  await assert.rejects(qrs.update(uid, q.id, { target: 'nope://x' }), QrDynError);
});
test('an account can only see and change its own codes', { skip }, async () => {
  const q = await qrs.create(uid, { title: 'T', target: 'x.com' });
  assert.deepEqual(await qrs.list(other), []); await assert.rejects(qrs.stats(other, q.id), (e) => e.status === 404); await assert.rejects(qrs.update(other, q.id, { title: 'x' }), (e) => e.status === 404); await assert.rejects(qrs.remove(other, q.id), (e) => e.status === 404);
});
test('stats group scans by day, device, system, browser, country and city', { skip }, async () => {
  const q = await qrs.create(uid, { title: 'T', target: 'x.com' });
  await qrs.open(q.code, mobile); await qrs.open(q.code, mobile); await qrs.open(q.code, { ...mobile, device: 'desktop', os: 'macOS', browser: 'Chrome', country: 'BR', city: 'Recife', ipHash: 'b'.repeat(64) });
  await new Promise((r) => setTimeout(r, 200));
  const s = await qrs.stats(uid, q.id, 7);
  assert.equal(s.total, 3); assert.equal(s.uniques, 2); assert.equal(s.perDay.length, 7); assert.equal(s.perDay.at(-1).n, 3);
  assert.deepEqual(s.devices, [{ key: 'mobile', n: 2 }, { key: 'desktop', n: 1 }]); assert.equal(s.countries[0].key, 'PT'); assert.equal(s.cities.length, 2); assert.equal(s.recent.length, 3);
  assert.equal((await qrs.list(uid))[0].scans, 3);
});
test('scans are not recorded when the owner turned reports off', { skip }, async () => {
  const q = await qrs.create(uid, { title: 'T', target: 'x.com' }); await createAuth(pool).saveSettings(uid, { scanReports: false });
  assert.equal((await qrs.open(q.code, mobile)).status, 302); await new Promise((r) => setTimeout(r, 150)); assert.equal((await qrs.stats(uid, q.id)).total, 0);
});
test('deleting a code deletes its scans; the number of codes is capped', { skip }, async () => {
  const q = await qrs.create(uid, { title: 'T', target: 'x.com' }); await qrs.open(q.code, mobile); await new Promise((r) => setTimeout(r, 150));
  await qrs.remove(uid, q.id); assert.equal((await pool.query('SELECT COUNT(*) n FROM qr_scans'))[0][0].n, 0);
  for (let i = 0; i < MAX_QR; i++) await qrs.create(uid, { title: `c${i}`, target: 'x.com' }); await assert.rejects(qrs.create(uid, { title: 'extra', target: 'x.com' }), QrDynError);
});
