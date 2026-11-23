// Local accounts with cookie sessions. Passwords are hashed with scrypt; the session cookie holds a random
// token and only its SHA-256 is stored on disk. Everything stays in data/ on this computer.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
export const COOKIE = 'flw_session';
const MAX_AGE = 30 * 24 * 3600; // seconds
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, createdAt: u.createdAt });

export class AuthError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }

export function createAuth(dir) {
  const usersFile = path.join(dir, 'users.json');
  const sessionsFile = path.join(dir, 'sessions.json');
  const read = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; } };
  const write = (f, data) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(`${f}.tmp`, JSON.stringify(data), { mode: 0o600 }); fs.renameSync(`${f}.tmp`, f); };
  const users = read(usersFile, []);
  const sessions = read(sessionsFile, {}); // sha256(token) -> { userId, expires }
  const fails = new Map(); // "email" -> { n, until }

  const hash = async (password, salt) => (await scrypt(password, salt, 64)).toString('hex');
  const saveSessions = () => { const now = Date.now(); for (const k of Object.keys(sessions)) if (sessions[k].expires < now) delete sessions[k]; write(sessionsFile, sessions); };

  async function startSession(user) {
    const token = crypto.randomBytes(32).toString('base64url');
    sessions[sha(token)] = { userId: user.id, expires: Date.now() + MAX_AGE * 1000 };
    saveSessions();
    return token;
  }

  return {
    count: () => users.length,

    async register({ name, email, password }) {
      name = String(name || '').trim(); email = String(email || '').trim().toLowerCase(); password = String(password || '');
      if (!name || name.length > 60) throw new AuthError('Escreve um nome (até 60 letras).');
      if (!EMAIL_RE.test(email) || email.length > 200) throw new AuthError('Esse email não parece válido.');
      if (password.length < 8 || password.length > 200) throw new AuthError('A palavra-passe precisa de pelo menos 8 caracteres.');
      if (users.some((u) => u.email === email)) throw new AuthError('Já existe uma conta com esse email. Entra com ela.', 409);
      const salt = crypto.randomBytes(16).toString('hex');
      const user = { id: crypto.randomUUID().slice(0, 12), name, email, salt, hash: await hash(password, salt), createdAt: Date.now() };
      const first = users.length === 0;
      users.push(user); write(usersFile, users);
      return { user: publicUser(user), token: await startSession(user), first };
    },

    async login({ email, password }) {
      email = String(email || '').trim().toLowerCase(); password = String(password || '');
      const f = fails.get(email);
      if (f && f.until > Date.now()) throw new AuthError('Demasiadas tentativas. Espera um minuto e tenta de novo.', 429);
      const user = users.find((u) => u.email === email);
      // Hash even when the user is unknown, so timing does not reveal which emails exist.
      const given = await hash(password, user ? user.salt : 'x'.repeat(32));
      const ok = user && crypto.timingSafeEqual(Buffer.from(given, 'hex'), Buffer.from(user.hash, 'hex'));
      if (!ok) {
        const expired = f && f.until > 0 && f.until <= Date.now(); // a finished lockout starts the count again
        const n = (expired ? 0 : f?.n || 0) + 1;
        fails.set(email, { n, until: n >= 5 ? Date.now() + 60_000 : 0 });
        throw new AuthError('Email ou palavra-passe errados.', 401);
      }
      fails.delete(email);
      return { user: publicUser(user), token: await startSession(user) };
    },

    logout(token) { if (token) { delete sessions[sha(token)]; saveSessions(); } },

    userFromToken(token) {
      if (!token) return null;
      const s = sessions[sha(token)];
      if (!s || s.expires < Date.now()) return null;
      const u = users.find((x) => x.id === s.userId);
      return u ? publicUser(u) : null;
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
