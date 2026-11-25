// Web-app routes for accounts: sign-in, profile, photo, settings, subscription, security, history, API keys and dynamic QR codes.
import express from 'express';
import { AuthError, setCookie, clearCookie } from './auth.js';
import { KeyError } from './api-keys.js';
import { QrDynError } from './qr-dynamic.js';
import { AvatarError, MAX_UPLOAD } from './avatar.js';
import { clientInfo } from './client-info.js';
import { PLATFORMS } from './platforms.js';
import { usedBytes } from './jobs.js';

const KNOWN = [AuthError, KeyError, QrDynError, AvatarError];
const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (e) {
    if (KNOWN.some((K) => e instanceof K)) return res.status(e.status || 400).json({ error: e.message });
    console.error(e); res.status(500).json({ error: 'Não foi possível concluir. Tenta de novo.' });
  }
};
const signedIn = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Entra na tua conta primeiro.' }));
const publicBase = (req) => (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

export function accountRoutes(app, { auth, keys, qrs, jobsDb, avatars, claimUnowned, disownJobs, removeOwned, mailer }) {
  const shortUrl = (req, q) => ({ ...q, shortUrl: `${publicBase(req)}/q/${q.code}` });

  app.get('/api/auth/me', wrap(async (req, res) => res.json({ user: req.user, platforms: PLATFORMS.map(({ id, label }) => ({ id, label })), settings: req.user ? await auth.settings(req.user.id) : null })));
  app.post('/api/auth/register', wrap(async (req, res) => {
    const { user, token, first } = await auth.register(req.body || {}, clientInfo(req));
    if (first) claimUnowned(user.id);
    setCookie(res, token); res.json({ user, adopted: first });
  }));
  app.post('/api/auth/login', wrap(async (req, res) => { const { user, token } = await auth.login(req.body || {}, clientInfo(req)); setCookie(res, token); res.json({ user, settings: await auth.settings(user.id) }); }));
  app.post('/api/auth/logout', wrap(async (req, res) => { await auth.logout(req.token); clearCookie(res); res.json({ ok: true }); }));
  app.post('/api/auth/password', signedIn, wrap(async (req, res) => { await auth.changePassword(req.user.id, { current: req.body?.current, next: req.body?.next }, req.token); res.json({ ok: true }); }));
  // Deleting the account never deletes downloaded files unless the user asks for it in the same request.
  app.delete('/api/auth/account', signedIn, wrap(async (req, res) => {
    const email = req.user.email;
    await auth.deleteAccount(req.user.id, req.body?.password);
    avatars.remove(req.user.id);
    if (req.body?.deleteFiles === true) removeOwned(req.user.id); else disownJobs(req.user.id);
    clearCookie(res); res.json({ ok: true });
    mailer.send(email, 'account_deleted', {}).catch(() => {});
  }));

  // ---- API keys ----
  app.get('/api/auth/keys', signedIn, wrap(async (req, res) => res.json({ keys: await keys.list(req.user.id) })));
  app.post('/api/auth/keys', signedIn, wrap(async (req, res) => res.json(await keys.create(req.user.id, req.body?.name))));
  app.delete('/api/auth/keys/:id', signedIn, wrap(async (req, res) => { await keys.revoke(req.user.id, req.params.id); res.json({ ok: true }); }));

  // ---- profile ----
  app.patch('/api/me', signedIn, wrap(async (req, res) => res.json({ user: await auth.updateName(req.user.id, req.body?.name) })));
  app.patch('/api/me/profile', signedIn, wrap(async (req, res) => res.json({ user: await auth.updateProfile(req.user.id, req.body || {}) })));
  app.post('/api/me/avatar', signedIn, express.raw({ type: 'image/*', limit: MAX_UPLOAD }), wrap(async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new AvatarError('Escolhe uma imagem (JPG, PNG, WebP ou GIF).');
    const { url, bytes } = await avatars.save(req.user.id, req.body);
    res.json({ user: await auth.setAvatar(req.user.id, url), bytes });
  }));
  app.delete('/api/me/avatar', signedIn, wrap(async (req, res) => { avatars.remove(req.user.id); res.json({ user: await auth.setAvatar(req.user.id, null) }); }));
  app.get('/api/me/settings', signedIn, wrap(async (req, res) => res.json(await auth.settings(req.user.id))));
  app.put('/api/me/settings', signedIn, wrap(async (req, res) => res.json(await auth.saveSettings(req.user.id, req.body || {}))));
  app.get('/api/me/subscription', signedIn, wrap(async (req, res) => {
    const sub = await auth.subscription(req.user.id); const limits = await auth.planLimits(req.user.id); const k = await keys.list(req.user.id);
    const usedMB = Math.round(usedBytes(req.user.id) / (1024 * 1024));
    res.json({
      ...sub, limits: { label: limits.label, benefits: limits.benefits, maxParallel: limits.maxParallel, priority: limits.priority, qrPerDay: limits.api.qrPerDay, videosPerDay: limits.api.videosPerDay, storageMB: limits.storageMB },
      storage: { usedMB, quotaMB: limits.storageMB, pct: Math.min(100, Math.round((usedMB / limits.storageMB) * 100)) },
      usageToday: { qr: k.reduce((s, x) => s + x.usage.qr, 0), videos: k.reduce((s, x) => s + x.usage.videos, 0) }, keys: k.length,
    });
  }));

  // ---- security ----
  app.get('/api/me/sessions', signedIn, wrap(async (req, res) => res.json({ sessions: await auth.sessions(req.user.id, req.token), events: await auth.loginEvents(req.user.id) })));
  app.delete('/api/me/sessions/:id', signedIn, wrap(async (req, res) => { await auth.revokeSession(req.user.id, req.params.id); res.json({ ok: true }); }));
  app.post('/api/me/sessions/revoke-others', signedIn, wrap(async (req, res) => { await auth.revokeOthers(req.user.id, req.token); res.json({ ok: true }); }));

  // ---- history ----
  app.get('/api/me/history', signedIn, wrap(async (req, res) => res.json({ ...(await jobsDb.history(req.user.id, req.query)), summary: await jobsDb.summary(req.user.id) })));

  // ---- dynamic QR codes and their scan reports ----
  app.get('/api/me/qr', signedIn, wrap(async (req, res) => res.json({ codes: (await qrs.list(req.user.id)).map((q) => shortUrl(req, q)) })));
  app.post('/api/me/qr', signedIn, wrap(async (req, res) => res.json({ code: shortUrl(req, await qrs.create(req.user.id, req.body || {})) })));
  app.patch('/api/me/qr/:id', signedIn, wrap(async (req, res) => res.json({ code: shortUrl(req, await qrs.update(req.user.id, req.params.id, req.body || {})) })));
  app.delete('/api/me/qr/:id', signedIn, wrap(async (req, res) => { await qrs.remove(req.user.id, req.params.id); res.json({ ok: true }); }));
  app.get('/api/me/qr/:id/stats', signedIn, wrap(async (req, res) => { const s = await qrs.stats(req.user.id, req.params.id, req.query.days); res.json({ ...s, qr: shortUrl(req, s.qr) }); }));

  // Public: what the printed QR opens. 302 (not 301) so the destination can change without browsers caching it.
  app.get('/q/:code', async (req, res) => {
    try {
      const r = await qrs.open(req.params.code, clientInfo(req), req.headers.referer);
      if (r.status === 302) return res.redirect(302, r.target);
      res.status(r.status).type('text').send(r.status === 410 ? 'Este código QR foi desativado.' : 'Código QR não encontrado.');
    } catch (e) { console.error(e); res.status(500).type('text').send('Não foi possível abrir este código.'); }
  });
}
