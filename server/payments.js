// Manual payment requests: upgrading to Pro or buying extra storage happens by bank transfer or
// Multicaixa Express, not a payment gateway (none is wired in for Kz yet). The user picks what they
// want, gets a reference and the account's payment details, uploads a proof, and someone in
// ADMIN_EMAILS (see server/auth.js) approves or rejects it from #/admin.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PLANS, STORAGE_ADDONS } from './plans.js';

export class PaymentError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
export const MAX_PROOF = 8 * 1024 * 1024;
const PROOF_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
const MAX_PENDING = 3; // per account, so one person can't flood the review queue

function itemFor(kind, itemId) {
  if (kind === 'plan') { const p = PLANS[itemId]; return p && itemId !== 'free' ? { label: p.label, price: p.price } : null; }
  if (kind === 'storage_addon') { const a = STORAGE_ADDONS.find((x) => x.id === itemId); return a ? { label: a.label, price: a.price } : null; }
  return null;
}
const pubRow = (r) => ({ id: r.id, userId: r.user_id, kind: r.kind, itemId: r.item_id, amountKz: r.amount_kz, reference: r.reference,
  proofUrl: r.proof_url, status: r.status, note: r.note, createdAt: new Date(r.created_at).getTime(), reviewedAt: r.reviewed_at ? new Date(r.reviewed_at).getTime() : null });

export function createPayments(pool, proofDir) {
  fs.mkdirSync(proofDir, { recursive: true });
  const one = async (sql, args) => (await pool.query(sql, args))[0][0];
  const reference = () => crypto.randomBytes(5).toString('hex').toUpperCase();

  return {
    catalogue: () => ({
      plans: Object.entries(PLANS).filter(([id]) => id !== 'free').map(([id, p]) => ({ id, label: p.label, price: p.price, benefits: p.benefits })),
      addons: STORAGE_ADDONS,
      instructions: { bankName: process.env.PAYMENT_BANK_NAME || '', iban: process.env.PAYMENT_IBAN || '', multicaixa: process.env.PAYMENT_MULTICAIXA || '' },
    }),

    async create(userId, { kind, itemId }) {
      const item = itemFor(kind, itemId);
      if (!item) throw new PaymentError('Escolhe um plano ou pacote de armazenamento válido.');
      if ((await one("SELECT COUNT(*) n FROM payment_requests WHERE user_id=? AND status='pending'", [userId])).n >= MAX_PENDING)
        throw new PaymentError(`Já tens ${MAX_PENDING} pedidos por aprovar. Espera que sejam revistos, ou cancela um.`);
      const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12); const ref = reference();
      await pool.query('INSERT INTO payment_requests (id, user_id, kind, item_id, amount_kz, reference) VALUES (?,?,?,?,?,?)', [id, userId, kind, itemId, item.price, ref]);
      return { id, reference: ref, amountKz: item.price, label: item.label };
    },

    async proof(userId, id, buf, mime) {
      const ext = PROOF_EXT[mime];
      if (!Buffer.isBuffer(buf) || !buf.length || !ext) throw new PaymentError('Envia uma imagem (JPG, PNG ou WebP) ou um PDF do comprovativo.');
      if (buf.length > MAX_PROOF) throw new PaymentError('O ficheiro tem mais de 8 MB.');
      const row = await one("SELECT id FROM payment_requests WHERE id=? AND user_id=? AND status='pending'", [id, userId]);
      if (!row) throw new PaymentError('Pedido não encontrado ou já foi revisto.', 404);
      const file = `${id}.${ext}`;
      fs.writeFileSync(path.join(proofDir, file), buf);
      await pool.query('UPDATE payment_requests SET proof_url=? WHERE id=?', [`/uploads/payment-proofs/${file}`, id]);
      return { ok: true };
    },

    async mine(userId) {
      const [rows] = await pool.query('SELECT * FROM payment_requests WHERE user_id=? ORDER BY created_at DESC', [userId]);
      return rows.map(pubRow);
    },

    async cancel(userId, id) {
      const [r] = await pool.query("DELETE FROM payment_requests WHERE id=? AND user_id=? AND status='pending'", [id, userId]);
      if (!r.affectedRows) throw new PaymentError('Pedido não encontrado ou já foi revisto.', 404);
    },

    // ---- reviewed by an admin ----
    async pending() {
      const [rows] = await pool.query("SELECT p.*, u.name user_name, u.email user_email FROM payment_requests p JOIN users u ON u.id = p.user_id WHERE p.status='pending' ORDER BY p.created_at");
      return rows.map((r) => ({ ...pubRow(r), userName: r.user_name, userEmail: r.user_email }));
    },

    async approve(id) {
      const row = await one('SELECT * FROM payment_requests WHERE id=?', [id]);
      if (!row || row.status !== 'pending') throw new PaymentError('Pedido não encontrado ou já foi revisto.', 404);
      const current = await one('SELECT storage_addon_mb FROM subscriptions WHERE user_id=? ORDER BY id DESC LIMIT 1', [row.user_id]);
      const addonMb = current?.storage_addon_mb || 0;
      if (row.kind === 'plan') {
        await pool.query("INSERT INTO subscriptions (user_id, plan, status, renews_at, storage_addon_mb) VALUES (?,?,'active', DATE_ADD(NOW(3), INTERVAL 30 DAY), ?)", [row.user_id, row.item_id, addonMb]);
      } else {
        const addon = STORAGE_ADDONS.find((a) => a.id === row.item_id);
        await pool.query('UPDATE subscriptions SET storage_addon_mb=? WHERE user_id=? ORDER BY id DESC LIMIT 1', [addonMb + (addon?.mb || 0), row.user_id]);
      }
      await pool.query("UPDATE payment_requests SET status='approved', reviewed_at=NOW(3) WHERE id=?", [id]);
      const item = itemFor(row.kind, row.item_id);
      return { userId: row.user_id, userEmail: await one('SELECT email FROM users WHERE id=?', [row.user_id]).then((u) => u?.email), label: item?.label || row.item_id };
    },

    async reject(id, note) {
      const row = await one('SELECT * FROM payment_requests WHERE id=?', [id]);
      if (!row || row.status !== 'pending') throw new PaymentError('Pedido não encontrado ou já foi revisto.', 404);
      await pool.query("UPDATE payment_requests SET status='rejected', note=?, reviewed_at=NOW(3) WHERE id=?", [String(note || '').slice(0, 255), id]);
      const item = itemFor(row.kind, row.item_id);
      return { userId: row.user_id, userEmail: await one('SELECT email FROM users WHERE id=?', [row.user_id]).then((u) => u?.email), label: item?.label || row.item_id, note };
    },
  };
}
