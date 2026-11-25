// API keys for the public API (/api/v1), in MySQL. A key is shown once; only its SHA-256 is stored.
import crypto from 'node:crypto';
import { PLANS } from './plans.js';

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
export const MAX_KEYS = 10;
export class KeyError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const USAGE = (id) => ['SELECT qr, videos FROM api_usage WHERE key_id=? AND day=UTC_DATE()', [id]];

// planLimitsFor(userId) -> the owner's current plan's { api: { qrPerDay, videosPerDay } }; a quota depends on
// whoever owns the key, so a Pro account's keys get the Pro quota automatically when it upgrades.
export function createKeys(pool, { planLimitsFor = async () => ({ api: PLANS.free.api }) } = {}) {
  const one = async (sql, args) => (await pool.query(sql, args))[0][0];
  return {
    async create(userId, name) {
      name = String(name || '').trim().slice(0, 40) || 'Chave sem nome';
      if ((await one('SELECT COUNT(*) n FROM api_keys WHERE user_id=?', [userId])).n >= MAX_KEYS) throw new KeyError(`Podes ter no máximo ${MAX_KEYS} chaves. Apaga uma que já não uses.`);
      const key = `flw_${crypto.randomBytes(24).toString('base64url')}`; const id = crypto.randomUUID().replace(/-/g, '').slice(0, 10); const prefix = `${key.slice(0, 9)}…${key.slice(-3)}`;
      await pool.query('INSERT INTO api_keys (id, user_id, name, hash, prefix) VALUES (?,?,?,?,?)', [id, userId, name, sha(key), prefix]);
      return { key, record: { id, name, prefix, createdAt: Date.now(), lastUsed: null } };
    },
    async list(userId) {
      const [rows] = await pool.query('SELECT k.id, k.name, k.prefix, k.created_at, k.last_used, COALESCE(u.qr,0) qr, COALESCE(u.videos,0) videos FROM api_keys k LEFT JOIN api_usage u ON u.key_id=k.id AND u.day=UTC_DATE() WHERE k.user_id=? ORDER BY k.created_at', [userId]);
      return rows.map((r) => ({ id: r.id, name: r.name, prefix: r.prefix, createdAt: new Date(r.created_at).getTime(), lastUsed: r.last_used ? new Date(r.last_used).getTime() : null, usage: { qr: r.qr, videos: r.videos } }));
    },
    async revoke(userId, id) { const [r] = await pool.query('DELETE FROM api_keys WHERE id=? AND user_id=?', [id, userId]); if (!r.affectedRows) throw new KeyError('Chave não encontrada.', 404); },
    // Returns { id, userId } or null.
    async verify(raw) {
      if (typeof raw !== 'string' || !raw.startsWith('flw_') || raw.length > 100) return null;
      const k = await one('SELECT id, user_id FROM api_keys WHERE hash=?', [sha(raw)]); return k ? { id: k.id, userId: k.user_id } : null;
    },
    // Count one use of `kind` ('qr' | 'videos') atomically; refuses (ok:false) once the daily quota is spent.
    async consume(rec, kind) {
      const col = kind === 'qr' ? 'qr' : 'videos'; const limit = (await planLimitsFor(rec.userId)).api[kind === 'qr' ? 'qrPerDay' : 'videosPerDay'];
      await pool.query('INSERT IGNORE INTO api_usage (key_id, day) VALUES (?, UTC_DATE())', [rec.id]);
      const [r] = await pool.query(`UPDATE api_usage SET ${col} = ${col} + 1 WHERE key_id=? AND day=UTC_DATE() AND ${col} < ?`, [rec.id, limit]);
      if (!r.affectedRows) return { ok: false, limit, remaining: 0 };
      const used = (await one(...USAGE(rec.id)))[col]; pool.query('UPDATE api_keys SET last_used=NOW(3) WHERE id=?', [rec.id]).catch(() => {});
      return { ok: true, limit, remaining: limit - used };
    },
    // A request that fails validation does not count against the quota.
    refund: (rec, kind) => pool.query(`UPDATE api_usage SET ${kind === 'qr' ? 'qr' : 'videos'} = GREATEST(0, ${kind === 'qr' ? 'qr' : 'videos'} - 1) WHERE key_id=? AND day=UTC_DATE()`, [rec.id]),
    async usage(rec) { const u = (await one(...USAGE(rec.id))) || { qr: 0, videos: 0 }; const l = (await planLimitsFor(rec.userId)).api; return { day: new Date().toISOString().slice(0, 10), qr: { used: u.qr, limit: l.qrPerDay }, videos: { used: u.videos, limit: l.videosPerDay } }; },
  };
}
