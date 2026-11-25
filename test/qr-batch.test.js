import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBatch, buildList, csvManifest, BatchError, MAX_BATCH } from '../web/js/lib/qr-batch.js';

test('validateBatch requires {n} and a sane range', () => {
  assert.throws(() => validateBatch({ template: '', start: 1, end: 10 }), BatchError);
  assert.throws(() => validateBatch({ template: 'https://x.com/sem-marcador', start: 1, end: 10 }), BatchError);
  assert.throws(() => validateBatch({ template: 'T-{n}', start: 10, end: 1 }), BatchError);
  assert.throws(() => validateBatch({ template: 'T-{n}', start: -1, end: 10 }), BatchError);
  assert.throws(() => validateBatch({ template: 'T-{n}', start: 1.5, end: 10 }), BatchError);
  assert.throws(() => validateBatch({ template: 'T-{n}', start: 1, end: 1 + MAX_BATCH }), /1000/);
});
test('validateBatch fills in digits from the largest number and checks they fit', () => {
  assert.equal(validateBatch({ template: 'T-{n}', start: 1, end: 42 }).digits, 2);
  assert.equal(validateBatch({ template: 'T-{n}', start: 1, end: 9 }).digits, 1);
  assert.throws(() => validateBatch({ template: 'T-{n}', start: 1, end: 100, digits: 2 }), /não cabe/);
  assert.equal(validateBatch({ template: 'T-{n}', start: 1, end: 5, digits: 5 }).digits, 5);
});
test('buildList pads and substitutes every {n}, including repeats', () => {
  const list = buildList({ template: 'BILHETE-{n}', start: 8, end: 11, digits: 3 });
  assert.deepEqual(list.map((i) => i.text), ['BILHETE-008', 'BILHETE-009', 'BILHETE-010', 'BILHETE-011']);
  assert.deepEqual(list.map((i) => i.padded), ['008', '009', '010', '011']);
  assert.equal(buildList({ template: '{n}/{n}', start: 1, end: 1, digits: 2 })[0].text, '01/01');
});
test('csvManifest escapes separators, quotes and formula-looking content', () => {
  const csv = csvManifest([{ n: 1, padded: '01', text: '=cmd|calc' }, { n: 2, padded: '02', text: 'ok;"quote"' }]);
  assert.match(csv, /^﻿numero;ficheiro;conteudo\r\n/);
  assert.match(csv, /"'=cmd\|calc"/);
  assert.match(csv, /"ok;""quote"""/);
});
