import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAuth, AuthError, tokenFromRequest } from '../server/auth.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'flw-auth-'));
const ana = { name: 'Ana', email: 'Ana@Example.com', password: 'correct horse' };

test('register, login, session and logout', async () => {
  const a = createAuth(tmp());
  const r = await a.register(ana);
  assert.equal(r.first, true); assert.equal(r.user.email, 'ana@example.com'); assert.ok(!('hash' in r.user));
  assert.equal(a.userFromToken(r.token).name, 'Ana');
  const l = await a.login({ email: 'ANA@example.com', password: 'correct horse' });
  assert.equal(a.userFromToken(l.token).id, r.user.id);
  a.logout(l.token);
  assert.equal(a.userFromToken(l.token), null);
  assert.ok(a.userFromToken(r.token)); // other sessions stay
});
test('validation and duplicates', async () => {
  const a = createAuth(tmp());
  await assert.rejects(a.register({ ...ana, password: 'short' }), AuthError);
  await assert.rejects(a.register({ ...ana, email: 'nope' }), AuthError);
  await assert.rejects(a.register({ ...ana, name: ' ' }), AuthError);
  await a.register(ana);
  await assert.rejects(a.register(ana), (e) => e.status === 409);
  assert.equal((await a.register({ name: 'Bo', email: 'bo@example.com', password: 'another one' })).first, false);
});
test('wrong password is refused and locks after 5 tries', async () => {
  const a = createAuth(tmp()); await a.register(ana);
  for (let i = 0; i < 5; i++) await assert.rejects(a.login({ email: ana.email, password: 'bad bad bad' }), (e) => e.status === 401);
  await assert.rejects(a.login({ email: ana.email, password: 'correct horse' }), (e) => e.status === 429);
});
test('data persists; password is never stored in clear; files are private', async () => {
  const dir = tmp(); const a = createAuth(dir); const r = await a.register(ana);
  const raw = fs.readFileSync(path.join(dir, 'users.json'), 'utf8');
  assert.ok(!raw.includes('correct horse')); assert.ok(!fs.readFileSync(path.join(dir, 'sessions.json'), 'utf8').includes(r.token));
  assert.equal(fs.statSync(path.join(dir, 'users.json')).mode & 0o077, 0);
  const b = createAuth(dir); // restart
  assert.equal(b.userFromToken(r.token).email, 'ana@example.com');
  assert.equal((await b.login({ email: ana.email, password: ana.password })).user.name, 'Ana');
});
test('unknown or expired tokens give no user; cookie parsing', () => {
  const a = createAuth(tmp());
  assert.equal(a.userFromToken('x'), null); assert.equal(a.userFromToken(null), null);
  assert.equal(tokenFromRequest({ headers: { cookie: 'a=1; flw_session=abc%2Bdef; b=2' } }), 'abc+def');
  assert.equal(tokenFromRequest({ headers: {} }), null);
});
