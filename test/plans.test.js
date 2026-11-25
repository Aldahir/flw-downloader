import test from 'node:test';
import assert from 'node:assert/strict';
import { PLANS, STORAGE_ADDONS, isPro, planOrFree } from '../server/plans.js';

test('every paid plan costs more than free and has real benefits', () => {
  assert.equal(PLANS.free.price, 0);
  for (const id of ['pro_base', 'pro_plus', 'pro_max']) {
    assert.ok(PLANS[id].price > 0, id);
    assert.ok(PLANS[id].storageMB > PLANS.free.storageMB, id);
    assert.ok(PLANS[id].ttlMinutes > PLANS.free.ttlMinutes, id);
    assert.ok(PLANS[id].benefits.length >= 3, id);
  }
  assert.ok(PLANS.pro_plus.price > PLANS.pro_base.price);
  assert.ok(PLANS.pro_max.price > PLANS.pro_plus.price);
});

test('storage add-ons are cumulative extras, never plans on their own', () => {
  for (const a of STORAGE_ADDONS) { assert.ok(a.mb > 0); assert.ok(a.price > 0); assert.ok(!PLANS[a.id]); }
});

test('isPro/planOrFree treat an unknown or missing plan as free', () => {
  assert.equal(isPro('free'), false); assert.equal(isPro('pro_base'), true); assert.equal(isPro('made-up'), false);
  assert.equal(planOrFree('pro_max'), 'pro_max'); assert.equal(planOrFree('made-up'), 'free'); assert.equal(planOrFree(undefined), 'free');
});
