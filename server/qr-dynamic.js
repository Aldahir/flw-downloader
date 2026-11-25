// Dynamic QR codes: the QR holds a short link (/q/<code>), the destination can change later, and each scan is recorded
// with device, system, browser and approximate place (from the IP, offline). No raw IP is stored.
import crypto from 'node:crypto';

const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export class QrDynError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
export const MAX_QR = 50;
// Only these design fields are kept, so a client can't store arbitrary data.
const cleanDesign = (d) => { if (!d || typeof d !== 'object') return null; const o = {}; const hex = /^#[0-9a-f]{6}$/i;
  if (hex.test(d.fg)) o.fg = d.fg; if (hex.test(d.bg)) o.bg = d.bg; if (['square', 'rounded', 'dots'].includes(d.shape)) o.shape = d.shape; if (['none', 'box', 'label'].includes(d.frame)) o.frame = d.frame;
  if (typeof d.label === 'string') o.label = d.label.slice(0, 24); if (['L', 'M', 'Q', 'H'].includes(d.ecc)) o.ecc = d.ecc; if (Number.isInteger(d.margin) && d.margin >= 0 && d.margin <= 8) o.margin = d.margin;
  if (typeof d.logo === 'string' && /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(d.logo) && d.logo.length <= 150_000) o.logo = d.logo; return o; };
const code = () => Array.from(crypto.randomBytes(8), (b) => ALPHABET[b % ALPHABET.length]).join('');
const httpUrl = (v) => { try { const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(String(v).trim()) ? String(v).trim() : `https://${String(v).trim()}`); return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };
const view = (r) => ({ id: r.id, code: r.code, title: r.title, type: r.type, target: r.target, active: !!r.active, design: r.design ? (typeof r.design === 'string' ? JSON.parse(r.design) : r.design) : null, createdAt: new Date(r.created_at).getTime(), scans: r.scans ?? undefined, lastScan: r.last_scan ? new Date(r.last_scan).getTime() : null });

export function createQrDynamic(pool) {
  const one = async (sql, a) => (await pool.query(sql, a))[0][0];
  const mine = async (userId, id) => { const r = await one('SELECT * FROM qr_codes WHERE id=? AND user_id=?', [id, userId]); if (!r) throw new QrDynError('Código não encontrado.', 404); return r; };
  return {
    async create(userId, { title, target, type = 'url', design }) {
      title = String(title || '').trim().slice(0, 80); const t = httpUrl(target);
      if (!title) throw new QrDynError('Dá um nome ao código para o reconheceres depois.'); if (!t) throw new QrDynError('O destino tem de ser um endereço http ou https.');
      if ((await one('SELECT COUNT(*) n FROM qr_codes WHERE user_id=?', [userId])).n >= MAX_QR) throw new QrDynError(`Podes ter no máximo ${MAX_QR} códigos dinâmicos.`);
      const id = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
      for (let i = 0; i < 5; i++) {
        try { await pool.query('INSERT INTO qr_codes (id, user_id, code, title, type, target, design) VALUES (?,?,?,?,?,?,?)', [id, userId, code(), title, String(type).slice(0, 20), t, design ? JSON.stringify(cleanDesign(design)) : null]); break; }
        catch (e) { if (e.code !== 'ER_DUP_ENTRY' || i === 4) throw e; }
      }
      return view(await mine(userId, id));
    },
    async list(userId) {
      const [rows] = await pool.query('SELECT q.*, (SELECT COUNT(*) FROM qr_scans s WHERE s.qr_id=q.id) scans, (SELECT MAX(at) FROM qr_scans s WHERE s.qr_id=q.id) last_scan FROM qr_codes q WHERE q.user_id=? ORDER BY q.created_at DESC', [userId]);
      return rows.map(view);
    },
    async update(userId, id, b = {}) {
      const r = await mine(userId, id); const title = b.title == null ? r.title : String(b.title).trim().slice(0, 80); const target = b.target == null ? r.target : httpUrl(b.target);
      if (!title) throw new QrDynError('O nome não pode ficar vazio.'); if (!target) throw new QrDynError('O destino tem de ser um endereço http ou https.');
      await pool.query('UPDATE qr_codes SET title=?, target=?, active=? WHERE id=?', [title, target, b.active == null ? r.active : (b.active ? 1 : 0), id]);
      return view(await mine(userId, id));
    },
    async remove(userId, id) { await mine(userId, id); await pool.query('DELETE FROM qr_codes WHERE id=?', [id]); },

    // Called by the public redirect. Returns the target (or null) and records the scan without delaying the redirect.
    async open(codeStr, info = {}, referrer = '') {
      if (!/^[a-zA-Z0-9]{8}$/.test(codeStr)) return { status: 404 };
      const r = await one('SELECT id, target, active, user_id FROM qr_codes WHERE code=?', [codeStr]);
      if (!r) return { status: 404 }; if (!r.active) return { status: 410 };
      const wants = await one('SELECT scan_reports FROM user_settings WHERE user_id=?', [r.user_id]);
      if (!wants || wants.scan_reports) pool.query('INSERT INTO qr_scans (qr_id, device, os, browser, country, region, city, ip_hash, referrer) VALUES (?,?,?,?,?,?,?,?,?)',
        [r.id, info.device || 'desktop', info.os || '', info.browser || '', info.country || null, info.region || null, info.city || null, info.ipHash || null, referrer ? String(referrer).slice(0, 200) : null]).catch(() => {});
      return { status: 302, target: r.target };
    },

    async stats(userId, id, days = 30) {
      const q = await mine(userId, id); days = Math.min(365, Math.max(1, Number(days) || 30));
      const [[tot]] = await pool.query('SELECT COUNT(*) total, COUNT(DISTINCT ip_hash) uniques, MAX(at) last FROM qr_scans WHERE qr_id=?', [id]);
      const [perDay] = await pool.query('SELECT DATE(at) d, COUNT(*) n FROM qr_scans WHERE qr_id=? AND at >= UTC_DATE() - INTERVAL ? DAY GROUP BY DATE(at) ORDER BY d', [id, days - 1]);
      const group = async (col) => (await pool.query(`SELECT ${col} k, COUNT(*) n FROM qr_scans WHERE qr_id=? GROUP BY ${col} ORDER BY n DESC LIMIT 8`, [id]))[0].map((r) => ({ key: r.k || '', n: r.n }));
      const [recent] = await pool.query('SELECT at, device, os, browser, country, region, city, referrer FROM qr_scans WHERE qr_id=? ORDER BY id DESC LIMIT 25', [id]);
      const fill = []; for (let i = days - 1; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); fill.push({ day: d, n: perDay.find((r) => (r.d instanceof Date ? r.d.toISOString().slice(0, 10) : String(r.d).slice(0, 10)) === d)?.n || 0 }); }
      return { qr: view(q), total: tot.total, uniques: tot.uniques, lastScan: tot.last ? new Date(tot.last).getTime() : null, perDay: fill, devices: await group('device'), systems: await group('os'), browsers: await group('browser'), countries: await group('country'), cities: await group('city'),
        recent: recent.map((r) => ({ at: new Date(r.at).getTime(), device: r.device, os: r.os, browser: r.browser, country: r.country, region: r.region, city: r.city, referrer: r.referrer })) };
    },
  };
}
