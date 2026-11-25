import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPayments, PaymentError } from '../server/payments.js';
import { createAuth } from '../server/auth.js';
import { testPool as pool, skip, clean } from './db-helper.js';

const proofDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flw-proofs-'));
let payments, auth, userId;
beforeEach(async () => { if (skip) return; await clean(); payments = createPayments(pool, proofDir); auth = createAuth(pool); userId = (await auth.register({ name: 'U', email: 'u@example.com', password: 'password 123' })).user.id; });
after(() => pool.end());

test('catalogue lists the paid plans and storage add-ons, never "free"', { skip }, () => {
  const c = payments.catalogue();
  assert.ok(!c.plans.some((p) => p.id === 'free'));
  assert.deepEqual(c.plans.map((p) => p.id).sort(), ['pro_base', 'pro_max', 'pro_plus']);
  assert.equal(c.addons.length, 3);
});

test('create validates the item, gives a reference, and caps pending requests at 3', { skip }, async () => {
  await assert.rejects(payments.create(userId, { kind: 'plan', itemId: 'free' }), PaymentError);
  await assert.rejects(payments.create(userId, { kind: 'plan', itemId: 'nope' }), PaymentError);
  const r = await payments.create(userId, { kind: 'plan', itemId: 'pro_base' });
  assert.equal(r.amountKz, 4000); assert.match(r.reference, /^[0-9A-F]{10}$/);
  await payments.create(userId, { kind: 'plan', itemId: 'pro_plus' });
  await payments.create(userId, { kind: 'storage_addon', itemId: 'addon_5gb' });
  await assert.rejects(payments.create(userId, { kind: 'plan', itemId: 'pro_max' }), PaymentError);
});

test('cancel only removes one\'s own pending request', { skip }, async () => {
  const r = await payments.create(userId, { kind: 'plan', itemId: 'pro_base' });
  await assert.rejects(payments.cancel('someone-else', r.id), PaymentError);
  await payments.cancel(userId, r.id);
  assert.deepEqual(await payments.mine(userId), []);
});

test('approving a plan request activates it with 30 days left, keeping any storage add-on already bought', { skip }, async () => {
  const addon = await payments.create(userId, { kind: 'storage_addon', itemId: 'addon_5gb' });
  await payments.approve(addon.id);
  const plan = await payments.create(userId, { kind: 'plan', itemId: 'pro_base' });
  await payments.approve(plan.id);
  const sub = await auth.subscription(userId);
  assert.equal(sub.plan, 'pro_base'); assert.equal(sub.storageAddonMb, 5 * 1024);
  assert.ok(sub.renewsAt > Date.now());
  const limits = await auth.planLimits(userId);
  assert.equal(limits.storageMB, 5 * 1024 + 5 * 1024); // the plan's own 5 GB plus the add-on
  assert.equal((await payments.mine(userId))[0].status, 'approved');
});

test('rejecting a request keeps the account on its current plan and records the note', { skip }, async () => {
  const r = await payments.create(userId, { kind: 'plan', itemId: 'pro_base' });
  await payments.reject(r.id, 'comprovativo ilegível');
  assert.equal((await auth.subscription(userId)).plan, 'free');
  const mine = (await payments.mine(userId))[0];
  assert.equal(mine.status, 'rejected'); assert.equal(mine.note, 'comprovativo ilegível');
  await assert.rejects(payments.approve(r.id), PaymentError); // already reviewed
});

test('pending() lists every account\'s open requests for an admin to review', { skip }, async () => {
  await payments.create(userId, { kind: 'plan', itemId: 'pro_base' });
  const list = await payments.pending();
  assert.equal(list.length, 1); assert.equal(list[0].userEmail, 'u@example.com');
});

test('proof only accepts a real image/PDF under 8 MB, for a pending request of that same user', { skip }, async () => {
  const r = await payments.create(userId, { kind: 'plan', itemId: 'pro_base' });
  await assert.rejects(payments.proof(userId, r.id, Buffer.from('x'), 'text/plain'), PaymentError);
  await assert.rejects(payments.proof('someone-else', r.id, Buffer.from('x'), 'image/png'), PaymentError);
  await payments.proof(userId, r.id, Buffer.from('fake-png-bytes'), 'image/png');
  assert.equal((await payments.mine(userId))[0].proofUrl, `/uploads/payment-proofs/${r.id}.png`);
});
