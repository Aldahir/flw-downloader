// Routes for upgrading to Pro / buying extra storage (manual payment requests reviewed by an
// admin) and the newsletter sign-up. Kept apart from routes-account.js because this is billing,
// not account/profile management.
import express from 'express';
import { PaymentError, MAX_PROOF } from './payments.js';
import { isAdminEmail } from './auth.js';

const KNOWN = [PaymentError];
const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (e) {
    if (KNOWN.some((K) => e instanceof K)) return res.status(e.status || 400).json({ error: e.message });
    console.error(e); res.status(500).json({ error: 'Não foi possível concluir. Tenta de novo.' });
  }
};
const signedIn = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Entra na tua conta primeiro.' }));
const adminOnly = (req, res, next) => (req.user && isAdminEmail(req.user.email) ? next() : res.status(404).json({ error: 'Não encontrado.' }));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function billingRoutes(app, { pool, payments, mailer }) {
  app.get('/api/billing/plans', wrap(async (_req, res) => res.json(payments.catalogue())));

  app.post('/api/me/payments', signedIn, wrap(async (req, res) => {
    const r = await payments.create(req.user.id, req.body || {});
    mailer.send(req.user.email, 'payment_pending', r).catch(() => {});
    res.json(r);
  }));
  app.post('/api/me/payments/:id/proof', signedIn, express.raw({ type: ['image/*', 'application/pdf'], limit: MAX_PROOF }), wrap(async (req, res) => {
    res.json(await payments.proof(req.user.id, req.params.id, req.body, req.headers['content-type']));
  }));
  app.get('/api/me/payments', signedIn, wrap(async (req, res) => res.json({ requests: await payments.mine(req.user.id) })));
  app.delete('/api/me/payments/:id', signedIn, wrap(async (req, res) => { await payments.cancel(req.user.id, req.params.id); res.json({ ok: true }); }));

  // ---- newsletter (no account needed) ----
  app.post('/api/newsletter', wrap(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 200) return res.status(400).json({ error: 'Esse email não parece válido.' });
    await pool.query('INSERT INTO newsletter_subscribers (email, user_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE unsubscribed_at=NULL', [email, req.user?.id || null]);
    mailer.send(email, 'newsletter_confirm', {}).catch(() => {});
    res.json({ ok: true });
  }));
  app.delete('/api/newsletter', wrap(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    await pool.query('UPDATE newsletter_subscribers SET unsubscribed_at=NOW(3) WHERE email=?', [email]);
    res.json({ ok: true });
  }));

  // ---- reviewed by an admin (ADMIN_EMAILS in .env) ----
  app.get('/api/admin/payments', adminOnly, wrap(async (_req, res) => res.json({ requests: await payments.pending() })));
  app.post('/api/admin/payments/:id/approve', adminOnly, wrap(async (req, res) => {
    const r = await payments.approve(req.params.id);
    if (r.userEmail) mailer.send(r.userEmail, 'payment_approved', r).catch(() => {});
    res.json({ ok: true });
  }));
  app.post('/api/admin/payments/:id/reject', adminOnly, wrap(async (req, res) => {
    const r = await payments.reject(req.params.id, req.body?.note);
    if (r.userEmail) mailer.send(r.userEmail, 'payment_rejected', r).catch(() => {});
    res.json({ ok: true });
  }));
}
