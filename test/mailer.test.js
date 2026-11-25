import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMailer } from '../server/mailer.js';
import { testPool as pool, skip, clean } from './db-helper.js';

let mailer;
beforeEach(async () => { if (skip) return; await clean(); delete process.env.SMTP_URL; mailer = createMailer(pool); });
after(() => pool.end());

test('without SMTP_URL, sending just logs to mail_log and never throws', { skip }, async () => {
  assert.equal(mailer.configured, false);
  const r = await mailer.send('a@example.com', 'payment_pending', { label: 'Pro Base', amountKz: 4000, reference: 'ABC' });
  assert.equal(r.sent, false);
  const [[row]] = await pool.query('SELECT * FROM mail_log WHERE to_email=?', ['a@example.com']);
  assert.equal(row.template, 'payment_pending'); assert.equal(row.sent, 0); assert.match(row.subject, /pedido/);
});

test('an unknown template is a programming error, not a silently dropped email', { skip }, async () => {
  await assert.rejects(mailer.send('a@example.com', 'nope', {}));
});
