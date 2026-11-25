// Accounts, cookie sessions, login history, profile, settings and subscription, stored in MySQL.
// Passwords use scrypt; the session cookie holds a random token and only its SHA-256 is stored.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { PLANS, planOrFree } from './plans.js';

const scrypt = promisify(crypto.scrypt);
export const COOKIE = 'flw_session';
const MAX_AGE = 30 * 24 * 3600; // seconds
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
export const COOKIE_BROWSERS = ['chrome', 'firefox', 'safari', 'edge', 'brave'];
const NO_CLIENT = { device: 'desktop', os: '', browser: '', country: null, city: null, ipHash: null };
// Accounts with one of these emails (comma-separated in .env) can review payment requests.
const ADMIN_EMAILS = String(process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
export const isAdminEmail = (email) => ADMIN_EMAILS.includes(String(email || '').toLowerCase());

export class AuthError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const GENDERS = ['', 'feminino', 'masculino', 'outro', 'prefiro-nao-dizer'];
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, avatarUrl: u.avatar_url || null, createdAt: new Date(u.created_at).getTime(),
  gender: u.gender || '', birthYear: u.birth_year || null, location: u.location || '', phone: u.phone || '', isAdmin: isAdminEmail(u.email) });

export function createAuth(pool) {
  const fails = new Map(); // email -> { n, until }
  const hash = async (password, salt) => (await scrypt(password, salt, 64)).toString('hex');
  const one = async (sql, args) => (await pool.query(sql, args))[0][0];

  async function startSession(userId, c = NO_CLIENT) {
    const token = crypto.randomBytes(32).toString('base64url');
    await pool.query('INSERT INTO sessions (token_hash, user_id, expires_at, device, os, browser, ip_hash, country, city) VALUES (?,?,?,?,?,?,?,?,?)',
      [sha(token), userId, new Date(Date.now() + MAX_AGE * 1000), c.device, c.os, c.browser, c.ipHash, c.country, c.city]);
    pool.query('DELETE FROM sessions WHERE expires_at < NOW(3)').catch(() => {});
    return token;
  }
  const logEvent = (userId, email, ok, c = NO_CLIENT) => pool.query('INSERT INTO login_events (user_id, email, ok, device, os, browser, ip_hash, country, city) VALUES (?,?,?,?,?,?,?,?,?)',
    [userId, String(email).slice(0, 200), ok ? 1 : 0, c.device, c.os, c.browser, c.ipHash, c.country, c.city]).catch(() => {});

  async function setPassword(userId, password) {
    const salt = crypto.randomBytes(16).toString('hex');
    await pool.query('UPDATE users SET salt=?, hash=? WHERE id=?', [salt, await hash(password, salt), userId]);
  }
  async function verify(u, password) {
    const given = await hash(String(password || ''), u.salt);
    if (!crypto.timingSafeEqual(Buffer.from(given, 'hex'), Buffer.from(u.hash, 'hex'))) throw new AuthError('A palavra-passe atual está errada.', 401);
  }
  const need = async (userId) => { const u = await one('SELECT * FROM users WHERE id=?', [userId]); if (!u) throw new AuthError('Conta não encontrada.', 404); return u; };

  return {
    count: async () => (await one('SELECT COUNT(*) n FROM users')).n,

    async register({ name, email, password }, c = NO_CLIENT) {
      name = String(name || '').trim(); email = String(email || '').trim().toLowerCase(); password = String(password || '');
      if (!name || name.length > 60) throw new AuthError('Escreve um nome (até 60 letras).');
      if (!EMAIL_RE.test(email) || email.length > 200) throw new AuthError('Esse email não parece válido.');
      if (password.length < 8 || password.length > 200) throw new AuthError('A palavra-passe precisa de pelo menos 8 caracteres.');
      const first = (await one('SELECT COUNT(*) n FROM users')).n === 0;
      const salt = crypto.randomBytes(16).toString('hex'); const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      try { await pool.query('INSERT INTO users (id, name, email, salt, hash) VALUES (?,?,?,?,?)', [id, name, email, salt, await hash(password, salt)]); }
      catch (e) { if (e.code === 'ER_DUP_ENTRY') throw new AuthError('Já existe uma conta com esse email. Entra com ela.', 409); throw e; }
      await pool.query('INSERT INTO user_settings (user_id) VALUES (?)', [id]); await pool.query('INSERT INTO subscriptions (user_id, plan) VALUES (?, ?)', [id, 'free']);
      await logEvent(id, email, true, c);
      return { user: publicUser(await need(id)), token: await startSession(id, c), first };
    },

    async login({ email, password }, c = NO_CLIENT) {
      email = String(email || '').trim().toLowerCase(); password = String(password || '');
      const f = fails.get(email);
      if (f && f.until > Date.now()) throw new AuthError('Demasiadas tentativas. Espera um minuto e tenta de novo.', 429);
      const u = await one('SELECT * FROM users WHERE email=?', [email]);
      // Hash even when the user is unknown, so timing does not reveal which emails exist.
      const given = await hash(password, u ? u.salt : 'x'.repeat(32));
      const ok = u && crypto.timingSafeEqual(Buffer.from(given, 'hex'), Buffer.from(u.hash, 'hex'));
      if (!ok) {
        const expired = f && f.until > 0 && f.until <= Date.now(); const n = (expired ? 0 : f?.n || 0) + 1;
        fails.set(email, { n, until: n >= 5 ? Date.now() + 60_000 : 0 });
        await logEvent(u?.id ?? null, email, false, c);
        throw new AuthError('Email ou palavra-passe errados.', 401);
      }
      fails.delete(email); await logEvent(u.id, email, true, c);
      return { user: publicUser(u), token: await startSession(u.id, c) };
    },

    logout: async (token) => { if (token) await pool.query('DELETE FROM sessions WHERE token_hash=?', [sha(token)]); },

    async userFromToken(token) {
      if (!token) return null;
      const u = await one('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash=? AND s.expires_at > NOW(3)', [sha(token)]);
      if (!u) return null;
      pool.query('UPDATE sessions SET last_seen = NOW(3) WHERE token_hash=? AND last_seen < NOW(3) - INTERVAL 5 MINUTE', [sha(token)]).catch(() => {});
      return publicUser(u);
    },

    // ---- profile ----
    async updateName(userId, name) {
      name = String(name || '').trim(); if (!name || name.length > 60) throw new AuthError('Escreve um nome (até 60 letras).');
      await pool.query('UPDATE users SET name=? WHERE id=?', [name, userId]); return publicUser(await need(userId));
    },
    async setAvatar(userId, url) { await pool.query('UPDATE users SET avatar_url=? WHERE id=?', [url, userId]); return publicUser(await need(userId)); },

    // Optional, used only to understand who uses the app (shown aggregated in admin stats).
    async updateProfile(userId, b = {}) {
      const gender = GENDERS.includes(b.gender) ? b.gender : '';
      let birthYear = b.birthYear === '' || b.birthYear == null ? null : Number(b.birthYear);
      if (birthYear !== null) { const now = new Date().getFullYear(); if (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > now) throw new AuthError('Ano de nascimento inválido.'); }
      const location = String(b.location || '').trim().slice(0, 120);
      const phone = String(b.phone || '').trim().slice(0, 30);
      if (phone && !/^[\d\s+()-]{3,30}$/.test(phone)) throw new AuthError('Esse telefone não parece válido.');
      await pool.query('UPDATE users SET gender=?, birth_year=?, location=?, phone=? WHERE id=?', [gender, birthYear, location, phone, userId]);
      return publicUser(await need(userId));
    },

    async settings(userId) {
      const s = await one('SELECT theme, default_kind, default_height, scan_reports, cookies_browser, notify_storage FROM user_settings WHERE user_id=?', [userId]);
      return { theme: s?.theme || 'auto', defaultKind: s?.default_kind || 'video', defaultHeight: s?.default_height || null, scanReports: s ? !!s.scan_reports : true, cookiesBrowser: s?.cookies_browser || '', notifyStorage: s ? !!s.notify_storage : true };
    },
    async saveSettings(userId, b = {}) {
      const theme = ['auto', 'light', 'dark'].includes(b.theme) ? b.theme : 'auto', kind = b.defaultKind === 'audio' ? 'audio' : 'video';
      const hgt = b.defaultHeight == null || b.defaultHeight === '' ? null : Number(b.defaultHeight);
      if (hgt !== null && (!Number.isInteger(hgt) || hgt < 144 || hgt > 4320)) throw new AuthError('A qualidade por omissão tem de estar entre 144 e 4320.');
      const cb = COOKIE_BROWSERS.includes(b.cookiesBrowser) ? b.cookiesBrowser : '';
      await pool.query('INSERT INTO user_settings (user_id, theme, default_kind, default_height, scan_reports, cookies_browser, notify_storage) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE theme=VALUES(theme), default_kind=VALUES(default_kind), default_height=VALUES(default_height), scan_reports=VALUES(scan_reports), cookies_browser=VALUES(cookies_browser), notify_storage=VALUES(notify_storage)',
        [userId, theme, kind, hgt, b.scanReports === false ? 0 : 1, cb, b.notifyStorage === false ? 0 : 1]);
      return this.settings(userId);
    },
    async subscription(userId) {
      const s = await one('SELECT plan, status, started_at, renews_at, canceled_at, storage_addon_mb FROM subscriptions WHERE user_id=? ORDER BY id DESC LIMIT 1', [userId]);
      return s
        ? { plan: planOrFree(s.plan), status: s.status, startedAt: new Date(s.started_at).getTime(), renewsAt: s.renews_at ? new Date(s.renews_at).getTime() : null, storageAddonMb: s.storage_addon_mb || 0 }
        : { plan: 'free', status: 'active', startedAt: null, renewsAt: null, storageAddonMb: 0 };
    },
    // The business rules that apply to this account right now: plan benefits plus any purchased extra storage.
    async planLimits(userId) {
      const sub = await this.subscription(userId); const p = PLANS[sub.plan] || PLANS.free;
      return { planId: sub.plan, label: p.label, benefits: p.benefits, storageMB: p.storageMB + (sub.storageAddonMb || 0), ttlMinutes: p.ttlMinutes, maxParallel: p.maxParallel, priority: p.priority, api: p.api };
    },

    // ---- security ----
    async sessions(userId, currentToken) {
      const cur = currentToken ? sha(currentToken) : '';
      const [rows] = await pool.query('SELECT token_hash, created_at, last_seen, device, os, browser, country, city FROM sessions WHERE user_id=? AND expires_at > NOW(3) ORDER BY last_seen DESC', [userId]);
      return rows.map((r) => ({ id: r.token_hash.slice(0, 16), current: r.token_hash === cur, createdAt: new Date(r.created_at).getTime(), lastSeen: new Date(r.last_seen).getTime(), device: r.device, os: r.os, browser: r.browser, country: r.country, city: r.city }));
    },
    async revokeSession(userId, id) { const [r] = await pool.query('DELETE FROM sessions WHERE user_id=? AND token_hash LIKE ?', [userId, `${String(id).replace(/[^a-f0-9]/gi, '').slice(0, 16)}%`]); if (!r.affectedRows) throw new AuthError('Sessão não encontrada.', 404); },
    async revokeOthers(userId, currentToken) { await pool.query('DELETE FROM sessions WHERE user_id=? AND token_hash <> ?', [userId, sha(currentToken || '')]); },
    async loginEvents(userId, limit = 20) { const [rows] = await pool.query('SELECT ok, at, device, os, browser, country, city FROM login_events WHERE user_id=? ORDER BY id DESC LIMIT ?', [userId, limit]); return rows.map((r) => ({ ok: !!r.ok, at: new Date(r.at).getTime(), device: r.device, os: r.os, browser: r.browser, country: r.country, city: r.city })); },

    async changePassword(userId, { current, next }, keepToken) {
      const u = await need(userId); next = String(next || '');
      if (next.length < 8 || next.length > 200) throw new AuthError('A nova palavra-passe precisa de pelo menos 8 caracteres.');
      await verify(u, current); await setPassword(userId, next);
      await pool.query('DELETE FROM sessions WHERE user_id=? AND token_hash <> ?', [userId, sha(keepToken || '')]); // other sessions end
    },
    async deleteAccount(userId, password) { await verify(await need(userId), password); await pool.query('DELETE FROM users WHERE id=?', [userId]); }, // cascades to sessions, keys, QR codes, settings
    // Used by the terminal command (npm run account): no email is sent, access to this computer is the proof.
    async resetPassword(email, next) {
      const u = await one('SELECT * FROM users WHERE email=?', [String(email || '').trim().toLowerCase()]); if (!u) throw new AuthError('Não há nenhuma conta com esse email.', 404);
      if (String(next).length < 8) throw new AuthError('A palavra-passe precisa de pelo menos 8 caracteres.');
      await setPassword(u.id, String(next)); await pool.query('DELETE FROM sessions WHERE user_id=?', [u.id]); fails.delete(u.email);
    },
  };
}

export function tokenFromRequest(req) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === COOKIE) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
export const setCookie = (res, token) => res.append('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`);
export const clearCookie = (res) => res.append('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
