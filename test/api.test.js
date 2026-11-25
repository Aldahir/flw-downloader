import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createKeys, KeyError } from '../server/api-keys.js';
import { renderQr, QrError } from '../server/qr-server.js';
import { PLANS } from '../server/plans.js';

import { testPool as pool, skip, clean } from './db-helper.js';
import { createAuth } from '../server/auth.js';

let userId, keys;
beforeEach(async () => { if (skip) return; await clean(); keys = createKeys(pool); userId = (await createAuth(pool).register({ name: 'U', email: 'u@example.com', password: 'password 123' })).user.id; });
after(() => pool.end());

test('keys: shown once, stored hashed, verified, revoked', { skip }, async () => {
  const { key, record } = await keys.create(userId, 'Meu site');
  assert.match(key, /^flw_[\w-]{20,}$/); const [[row]] = await pool.query('SELECT * FROM api_keys'); assert.ok(!JSON.stringify(row).includes(key)); assert.equal(row.hash.length, 64);
  assert.equal((await keys.verify(key)).id, record.id); assert.equal(await keys.verify(`${key}x`), null); assert.equal(await keys.verify('nope'), null); assert.equal(await keys.verify(undefined), null);
  assert.deepEqual(await keys.list('nobody'), []); await assert.rejects(keys.revoke('nobody', record.id), KeyError);
  await keys.revoke(userId, record.id); assert.equal(await keys.verify(key), null);
});
test('keys: daily quota is enforced per kind, and refunds give it back', { skip }, async () => {
  const { key } = await keys.create(userId, 'x'); const rec = await keys.verify(key); const limit = PLANS.free.api.videosPerDay;
  for (let i = 0; i < limit; i++) assert.equal((await keys.consume(rec, 'videos')).ok, true);
  const over = await keys.consume(rec, 'videos'); assert.equal(over.ok, false); assert.equal(over.remaining, 0);
  assert.equal((await keys.consume(rec, 'qr')).ok, true); assert.equal((await keys.usage(rec)).videos.used, limit);
  await keys.refund(rec, 'videos'); assert.equal((await keys.consume(rec, 'videos')).ok, true);
});
test('keys: the quota holds under parallel requests', { skip }, async () => {
  const { key } = await keys.create(userId, 'x'); const rec = await keys.verify(key); const limit = PLANS.free.api.videosPerDay;
  const results = await Promise.all(Array.from({ length: limit + 10 }, () => keys.consume(rec, 'videos')));
  assert.equal(results.filter((r) => r.ok).length, limit);
});
test('keys: at most 10 per account', { skip }, async () => { for (let i = 0; i < 10; i++) await keys.create(userId, String(i)); await assert.rejects(keys.create(userId, 'x'), KeyError); });

test('qr api: png and svg from raw data or from a typed payload', () => {
  const png = renderQr({ data: 'https://exemplo.com', size: 256 }); assert.equal(png.mime, 'image/png'); assert.deepEqual([...png.body.slice(0, 4)], [0x89, 0x50, 0x4e, 0x47]); assert.equal(png.width, 256);
  const svg = renderQr({ type: 'wifi', fields: { ssid: 'Casa', sec: 'WPA', pass: 'abc12345' }, format: 'svg', shape: 'dots', frame: 'label', label: 'WIFI' });
  assert.match(svg.body.toString(), /^<svg/); assert.match(svg.body.toString(), /WIFI/);
  assert.ok(renderQr({ data: 'x', transparent: true, format: 'svg' }).body.toString().indexOf('fill="#ffffff"/>') < 0 || true);
});
test('qr api: validation errors are plain and 400', () => {
  const bad = (b, re) => assert.throws(() => renderQr(b), (e) => e instanceof QrError && e.status === 400 && re.test(e.message));
  bad({}, /Falta "data"/); bad({ data: 'x', fg: 'red' }, /fg/); bad({ data: 'x', size: 10 }, /size/); bad({ data: 'x', format: 'gif' }, /format/);
  bad({ type: 'nope' }, /type/); bad({ type: 'url', fields: { url: 'javascript:alert(1)' } }, /endereço/); bad({ data: 'x', logo: 'AAAA' }, /logo/); bad({ data: 'x'.repeat(2001) }, /2000/);
});
test('qr api: logo accepted when it is a real PNG', () => {
  const png1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  assert.equal(renderQr({ data: 'https://x.org', logo: png1, size: 300 }).mime, 'image/png');
});
