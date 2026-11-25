// Public API (/api/v1): generate QR codes and download online videos, authenticated with an API key.
import express from 'express';
import path from 'node:path';
import { renderQr, QrError } from './qr-server.js';
import { platformOf } from './platforms.js';

const err = (res, status, code, message) => res.status(status).json({ error: { code, message } });

export function createV1({ keys, tools, startDownload, validUrl, getJob, remove, pub, listFiles, canAccessKey }) {
  const r = express.Router();

  // Key from "X-API-Key", "Authorization: Bearer ..." or (like other QR APIs) the JSON field "apikey".
  r.use(async (req, res, next) => {
    const bearer = /^Bearer (.+)$/i.exec(req.headers.authorization || '')?.[1];
    const raw = req.headers['x-api-key'] || bearer || req.body?.apikey;
    const rec = await keys.verify(typeof raw === 'string' ? raw.trim() : '').catch(() => null);
    if (!rec) return err(res, 401, 'invalid_api_key', 'Falta uma chave de API válida. Envia-a no cabeçalho X-API-Key.');
    req.key = rec; next();
  });
  const limited = (kind) => async (req, res, next) => {
    const q = await keys.consume(req.key, kind);
    res.set({ 'X-RateLimit-Limit': q.limit, 'X-RateLimit-Remaining': q.remaining });
    if (!q.ok) return err(res, 429, 'quota_exceeded', `Chegaste ao limite diário de ${q.limit} pedidos. Volta amanhã (UTC) ou pede um limite maior.`);
    res.on('finish', () => { if (res.statusCode >= 400) keys.refund(req.key, kind).catch(() => {}); });
    next();
  };

  r.get('/usage', async (req, res) => res.json(await keys.usage(req.key)));

  r.post('/qr/create', limited('qr'), (req, res) => {
    try {
      const out = renderQr(req.body || {});
      if (req.body?.response === 'json') return res.json({ format: out.format, mime: out.mime, width: out.width, height: out.height, data: out.format === 'svg' ? out.body.toString() : out.body.toString('base64') });
      res.type(out.mime).send(out.body);
    } catch (e) { if (e instanceof QrError) return err(res, 400, 'invalid_parameter', e.message); console.error(e); err(res, 500, 'server_error', 'Não foi possível gerar o código.'); }
  });

  r.post('/videos', limited('videos'), async (req, res) => {
    const { url, kind = 'video', height } = req.body || {};
    if (!validUrl(url)) return err(res, 400, 'invalid_parameter', '"url" tem de ser um endereço http ou https.');
    if (!['video', 'audio'].includes(kind)) return err(res, 400, 'invalid_parameter', '"kind" tem de ser "video" ou "audio".');
    if (height != null && (!Number.isInteger(height) || height < 144 || height > 4320)) return err(res, 400, 'invalid_parameter', '"height" tem de ser um inteiro entre 144 e 4320.');
    const t = tools(); if (!t.ytdlp || !t.ffmpeg) return err(res, 503, 'unavailable', 'O servidor ainda não tem o yt-dlp e o FFmpeg instalados.');
    try {
      const job = await startDownload(t, { url, kind, height, userId: req.key.userId });
      res.status(202).json({ id: job.id, status: 'queued', platform: platformOf(url), statusUrl: `/api/v1/videos/${job.id}` });
    } catch (e) { if (e.upgrade) return err(res, 403, 'storage_quota_exceeded', e.message); throw e; }
  });

  const mine = (req, res) => { const j = getJob(req.params.id); if (!j || !canAccessKey(j, req.key)) { err(res, 404, 'not_found', 'Esse trabalho não existe.'); return null; } return j; };
  const view = (j) => { const p = pub(j); return { id: p.id, status: p.status, stage: p.stage, progress: Math.round(p.progress), speed: p.speed, eta: p.eta, title: p.title, platform: p.platform, error: p.error,
    files: p.files.filter((f) => f.name !== 'job.json').map((f) => ({ name: f.name, size: f.size, url: `/api/v1/videos/${p.id}/files/${encodeURIComponent(f.name)}` })) }; };

  r.get('/videos/:id', (req, res) => { const j = mine(req, res); if (j) res.json(view(j)); });
  r.get('/videos/:id/files/:name', (req, res) => {
    const j = mine(req, res); if (!j) return;
    const f = listFiles(j).find((x) => x.name === req.params.name); // only files we list: never a client-built path
    if (!f) return err(res, 404, 'not_found', 'Esse ficheiro não existe.');
    res.download(path.join(j.dir, f.name), f.name);
  });
  r.delete('/videos/:id', (req, res) => { const j = mine(req, res); if (!j) return; remove(j); res.json({ ok: true }); });

  r.use((_req, res) => err(res, 404, 'not_found', 'Endpoint desconhecido. Vê a documentação em /#/api.'));
  return r;
}
