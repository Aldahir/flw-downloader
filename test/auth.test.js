import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createAuth, AuthError, tokenFromRequest } from '../server/auth.js';
import { testPool as pool, skip, clean } from './db-helper.js';

const ana = { name: 'Ana', email: 'Ana@Example.com', password: 'correct horse' };
const phone = { device: 'mobile', os: 'iOS', browser: 'Safari', country: 'PT', city: 'Lisboa', ipHash: 'a'.repeat(64) };
let auth;
beforeEach(async () => { if (skip) return; await clean(); auth = createAuth(pool); });
after(() => pool.end());

test('register, login, session and logout', { skip }, async () => {
  const r = await auth.register(ana);
  assert.equal(r.first, true); assert.equal(r.user.email, 'ana@example.com'); assert.ok(!('hash' in r.user));
  assert.equal((await auth.userFromToken(r.token)).name, 'Ana');
  const l = await auth.login({ email: 'ANA@example.com', password: 'correct horse' });
  assert.equal((await auth.userFromToken(l.token)).id, r.user.id);
  await auth.logout(l.token);
  assert.equal(await auth.userFromToken(l.token), null);
  assert.ok(await auth.userFromToken(r.token)); // other sessions stay
});
test('validation and duplicates', { skip }, async () => {
  await assert.rejects(auth.register({ ...ana, password: 'short' }), AuthError);
  await assert.rejects(auth.register({ ...ana, email: 'nope' }), AuthError);
  await assert.rejects(auth.register({ ...ana, name: ' ' }), AuthError);
  await auth.register(ana);
  await assert.rejects(auth.register(ana), (e) => e.status === 409);
  assert.equal((await auth.register({ name: 'Bo', email: 'bo@example.com', password: 'another one' })).first, false);
});
test('wrong password is refused and locks after 5 tries', { skip }, async () => {
  await auth.register(ana);
  for (let i = 0; i < 5; i++) await assert.rejects(auth.login({ email: ana.email, password: 'bad bad bad' }), (e) => e.status === 401);
  await assert.rejects(auth.login({ email: ana.email, password: 'correct horse' }), (e) => e.status === 429);
});
test('the password is never stored in clear and the session token is stored hashed', { skip }, async () => {
  const r = await auth.register(ana);
  const [[u]] = await pool.query('SELECT * FROM users'); const [[s]] = await pool.query('SELECT * FROM sessions');
  assert.ok(!JSON.stringify(u).includes('correct horse')); assert.notEqual(s.token_hash, r.token); assert.equal(s.token_hash.length, 64);
  assert.equal((await auth.login({ email: ana.email, password: ana.password })).user.name, 'Ana');
});
test('unknown tokens give no user; cookie parsing', { skip }, async () => {
  assert.equal(await auth.userFromToken('x'), null); assert.equal(await auth.userFromToken(null), null);
  assert.equal(tokenFromRequest({ headers: { cookie: 'a=1; flw_session=abc%2Bdef; b=2' } }), 'abc+def'); assert.equal(tokenFromRequest({ headers: {} }), null);
});
test('a new account gets default settings and a free subscription', { skip }, async () => {
  const { user } = await auth.register(ana);
  assert.deepEqual(await auth.settings(user.id), { theme: 'auto', defaultKind: 'video', defaultHeight: null, scanReports: true, cookiesBrowser: '', notifyStorage: true });
  const s = await auth.subscription(user.id); assert.equal(s.plan, 'free'); assert.equal(s.status, 'active'); assert.equal(s.storageAddonMb, 0);
  const limits = await auth.planLimits(user.id); assert.equal(limits.storageMB, 1024); assert.equal(limits.ttlMinutes, 60);
});
test('settings are validated and saved', { skip }, async () => {
  const { user } = await auth.register(ana);
  assert.deepEqual(await auth.saveSettings(user.id, { theme: 'dark', defaultKind: 'audio', defaultHeight: '720', scanReports: false }), { theme: 'dark', defaultKind: 'audio', defaultHeight: 720, scanReports: false, cookiesBrowser: '', notifyStorage: true });
  await assert.rejects(auth.saveSettings(user.id, { defaultHeight: 5 }), AuthError);
  assert.equal((await auth.saveSettings(user.id, { theme: 'neon' })).theme, 'auto');
});
test('browser cookies are opt-in and limited to known browsers', { skip }, async () => {
  const { user } = await auth.register(ana);
  assert.equal((await auth.saveSettings(user.id, { cookiesBrowser: 'firefox' })).cookiesBrowser, 'firefox');
  assert.equal((await auth.saveSettings(user.id, { cookiesBrowser: 'chrome; rm -rf /' })).cookiesBrowser, ''); // anything else is dropped
});
test('name and avatar url update; the name is validated', { skip }, async () => {
  const { user } = await auth.register(ana);
  assert.equal((await auth.updateName(user.id, '  Ana Maria ')).name, 'Ana Maria'); await assert.rejects(auth.updateName(user.id, ' '), AuthError);
  assert.equal((await auth.setAvatar(user.id, '/uploads/avatars/x.webp')).avatarUrl, '/uploads/avatars/x.webp'); assert.equal((await auth.setAvatar(user.id, null)).avatarUrl, null);
});
test('sessions record the device and place; one can be revoked', { skip }, async () => {
  const a = await auth.register(ana, phone); const b = await auth.login(ana);
  const list = await auth.sessions(a.user.id, a.token); assert.equal(list.length, 2);
  const cur = list.find((s) => s.current); assert.equal(cur.device, 'mobile'); assert.equal(cur.city, 'Lisboa'); assert.equal(cur.os, 'iOS');
  const other = list.find((s) => !s.current); await auth.revokeSession(a.user.id, other.id);
  assert.equal(await auth.userFromToken(b.token), null); assert.ok(await auth.userFromToken(a.token));
  await assert.rejects(auth.revokeSession(a.user.id, 'ffffffffffffffff'), (e) => e.status === 404);
});
test('login history keeps successes and failures with the device', { skip }, async () => {
  await auth.register(ana, phone); await assert.rejects(auth.login({ email: ana.email, password: 'wrong wrong' }, phone));
  const { user } = await auth.login(ana, phone); const ev = await auth.loginEvents(user.id);
  assert.equal(ev.length, 3); assert.equal(ev.filter((e) => !e.ok).length, 1); assert.equal(ev[0].ok, true);
  await assert.rejects(auth.login({ email: 'ghost@example.com', password: 'whatever pass' }, phone));
  const [[n]] = await pool.query('SELECT COUNT(*) n FROM login_events WHERE user_id IS NULL AND ok=0'); assert.equal(n.n, 1); // unknown email: kept by email only
});
test('change password keeps this session, ends the others, and checks the current one', { skip }, async () => {
  const r = await auth.register(ana); const other = await auth.login(ana);
  await assert.rejects(auth.changePassword(r.user.id, { current: 'wrong', next: 'brand new pass' }, r.token), (e) => e.status === 401);
  await assert.rejects(auth.changePassword(r.user.id, { current: ana.password, next: 'short' }, r.token), AuthError);
  await auth.changePassword(r.user.id, { current: ana.password, next: 'brand new pass' }, r.token);
  assert.ok(await auth.userFromToken(r.token)); assert.equal(await auth.userFromToken(other.token), null);
  await assert.rejects(auth.login(ana), AuthError); assert.ok((await auth.login({ email: ana.email, password: 'brand new pass' })).user);
});
test('delete account needs the password and removes everything of the account', { skip }, async () => {
  const r = await auth.register(ana);
  await pool.query("INSERT INTO api_keys (id, user_id, name, hash, prefix) VALUES ('k1', ?, 'n', ?, 'p')", [r.user.id, 'h'.repeat(64)]);
  await assert.rejects(auth.deleteAccount(r.user.id, 'nope'), (e) => e.status === 401);
  await auth.deleteAccount(r.user.id, ana.password);
  assert.equal(await auth.userFromToken(r.token), null); assert.equal(await auth.count(), 0);
  for (const t of ['api_keys', 'sessions', 'user_settings', 'subscriptions']) assert.equal((await pool.query(`SELECT COUNT(*) n FROM ${t}`))[0][0].n, 0, t);
});
test('terminal reset sets a new password and signs the account out', { skip }, async () => {
  const r = await auth.register(ana);
  await assert.rejects(auth.resetPassword('x@example.com', 'whatever long'), (e) => e.status === 404);
  await auth.resetPassword('ANA@example.com', 'reset by terminal');
  assert.equal(await auth.userFromToken(r.token), null); assert.ok((await auth.login({ email: ana.email, password: 'reset by terminal' })).user);
});
