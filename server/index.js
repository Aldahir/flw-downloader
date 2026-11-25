import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTools } from './tools.js';
import { run } from './run.js';
import { parseSrt, groupWords } from './srt.js';
import { friendly } from './errors.js';
import { videoFormatArgs, qualitiesFrom } from './formats.js';
import { listModels, resolveModel, downloadModel, CATALOGUE } from './models.js';
import { DOWNLOADS, setJobSink, allJobObjects, newJob, getJob, allJobs, enqueue, cancel, remove, update, subscribe, listFiles, pub, loadFromDisk, stats, canAccess, ownerId, claimUnowned, disownJobs, removeOwned, usedBytes, startExpirySweeper } from './jobs.js';
import { PLATFORMS, platformOf } from './platforms.js';
import { parseProgress } from './progress.js';
import { createV1 } from './api-v1.js';
import { openapi } from './openapi.js';
import { createKeys } from './api-keys.js';
import { createAuth, tokenFromRequest, COOKIE_BROWSERS } from './auth.js';
import { createPool, migrate, dbReachable } from './db.js';
import { createJobsDb } from './jobs-db.js';
import { createQrDynamic } from './qr-dynamic.js';
import { createAvatars } from './avatar.js';
import { createMailer } from './mailer.js';
import { createPayments } from './payments.js';
import { accountRoutes } from './routes-account.js';
import { billingRoutes } from './routes-billing.js';
import { PLANS } from './plans.js';
import { QuotaError } from './errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);
const PORT = Number(process.env.PORT || 3777);
const tools = () => resolveTools(); // re-resolve so installs are picked up without restart

fs.mkdirSync(DOWNLOADS, { recursive: true });
loadFromDisk();
const pool = createPool();
if (!(await dbReachable(pool))) {
  console.error('\nNão consegui ligar ao MySQL. Corre "npm run db:setup" (instala e prepara a base de dados) ou confirma o ficheiro .env.\n');
  process.exit(1);
}
await migrate(pool);
const auth = createAuth(pool);
const keys = createKeys(pool, { planLimitsFor: (userId) => auth.planLimits(userId) });
const qrs = createQrDynamic(pool), jobsDb = createJobsDb(pool);
const mailer = createMailer(pool);
const UPLOADS = path.resolve(process.env.FLW_UPLOADS || 'uploads');
const avatars = createAvatars(path.join(UPLOADS, 'avatars'));
const payments = createPayments(pool, path.join(UPLOADS, 'payment-proofs'));
setJobSink((j) => jobsDb.record(j), (id) => jobsDb.forget(id));
allJobObjects().forEach((j) => jobsDb.record(j)); // history of jobs that existed before the database
startExpirySweeper();

const app = express();
app.disable('x-powered-by');
// Cookies are sent automatically by browsers, so refuse writes that come from another site.
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin) { try { if (new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Pedido recusado (origem diferente).' }); } catch { return res.status(403).json({ error: 'Pedido recusado.' }); } }
  next();
});
app.use(async (req, _res, next) => {
  try { req.token = tokenFromRequest(req); req.user = await auth.userFromToken(req.token); } catch (e) { console.error(e); req.user = null; }
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(ROOT, 'web')));
app.use('/files', express.static(DOWNLOADS));
// Profile photos keep the same file name when replaced, so make browsers re-check instead of showing the old one.
app.use('/uploads', express.static(UPLOADS, { setHeaders: (res) => res.set('Cache-Control', 'no-cache') }));
// Libraries that run in the browser (QR codes, video player codecs). Served from node_modules; nothing is stored per user.
const nm = (...p) => path.join(ROOT, 'node_modules', ...p);
app.get('/vendor/qrcode.mjs', (_req, res) => res.sendFile(nm('qrcode-generator', 'dist', 'qrcode.mjs')));
app.use('/vendor/ffmpeg', express.static(nm('@ffmpeg', 'ffmpeg', 'dist', 'esm')));
app.use('/vendor/ffmpeg-core', express.static(nm('@ffmpeg', 'core', 'dist', 'esm')));
app.get('/vendor/jsqr.js', (_req, res) => res.sendFile(nm('jsqr', 'dist', 'jsQR.js')));
app.get('/vendor/pdf.mjs', (_req, res) => res.sendFile(nm('pdfjs-dist', 'build', 'pdf.min.mjs')));
app.get('/vendor/pdf.worker.mjs', (_req, res) => res.sendFile(nm('pdfjs-dist', 'build', 'pdf.worker.min.mjs')));
app.get('/vendor/jszip.js', (_req, res) => res.sendFile(nm('jszip', 'dist', 'jszip.min.js')));

const validUrl = (u) => { try { const p = new URL(u); return p.protocol === 'http:' || p.protocol === 'https:'; } catch { return false; } };
const fail = (res, e, code = 500) => { const f = friendly(e); res.status(code).json({ error: f.hint ? `${f.message} ${f.hint}` : f.message, detail: f.raw }); };
function need(res, ...keys) {
  const t = tools();
  const missing = keys.filter((k) => !t[k]);
  if (missing.length) { res.status(424).json({ error: `Falta instalar: ${missing.join(', ')}. Corre "npm run doctor" para ver como.` }); return null; }
  return t;
}
const MAX_PLAYLIST = 100; // safety cap per playlist job
const MEDIA_RE = /\.(mp4|mkv|webm|mov|avi|flv|ts|mp3|m4a|opus|ogg|wav|flac|aac)$/i;
const DERIVED_RE = /^(burned|captioned|with-subtitles|compatible)/;
const mediaFiles = (job) => fs.readdirSync(job.dir).filter((f) => MEDIA_RE.test(f) && !DERIVED_RE.test(f));
function pickMedia(job, wanted) {
  const all = mediaFiles(job);
  if (wanted) return all.includes(wanted) ? wanted : null; // never trust a client path
  return all[0] || null;
}
function jobOr404(req, res) {
  const job = getJob(req.params.id || req.body?.id);
  if (!job || !canAccess(job, req.user)) { res.status(404).json({ error: 'Esse trabalho já não existe.' }); return null; }
  return job;
}

accountRoutes(app, { auth, keys, qrs, jobsDb, avatars, claimUnowned, disownJobs, removeOwned, mailer });
billingRoutes(app, { pool, payments, mailer });

app.get('/api/v1/openapi.json', (req, res) => res.json(openapi(`${req.protocol}://${req.get('host')}`)));
app.use('/api/v1', createV1({ keys, tools, startDownload, validUrl, getJob, remove, pub, listFiles, canAccessKey: (job, rec) => job.kind !== 'model' && job.userId === rec.userId }));
app.get('/api/health', (_req, res) => res.json({ ...tools(), ...stats() }));

app.post('/api/info', async (req, res) => {
  const { url, playlist = false } = req.body || {};
  if (!validUrl(url)) return res.status(400).json({ error: 'Link inválido. Cola o endereço completo (começa por http:// ou https://).' });
  const t = need(res, 'ytdlp'); if (!t) return;
  const u = new URL(url);
  const looksLikePlaylist = u.searchParams.has('list') || /\/playlist|\/sets\//.test(u.pathname);
  try {
    const cb = req.user ? (await auth.settings(req.user.id)).cookiesBrowser : '';
    const out = await run(t.ytdlp, [...(COOKIE_BROWSERS.includes(cb) ? ['--cookies-from-browser', cb] : []), ...(playlist ? ['-J', '--flat-playlist', '--', url] : ['-J', '--no-playlist', '--', url])]);
    const j = JSON.parse(out);
    if (j._type === 'playlist') {
      const entries = (j.entries || []).filter(Boolean);
      return res.json({ platform: platformOf(url), playlist: { title: j.title, count: entries.length, capped: entries.length > MAX_PLAYLIST,
        entries: entries.slice(0, MAX_PLAYLIST).map((e) => ({ id: e.id, title: e.title, duration: e.duration })) }, looksLikePlaylist });
    }
    const heights = [...new Set((j.formats || []).map((f) => f.height).filter(Boolean))].sort((a, b) => b - a);
    res.json({ title: j.title, thumbnail: j.thumbnail, duration: j.duration, uploader: j.uploader, heights, qualities: qualitiesFrom(j.formats), platform: platformOf(url), looksLikePlaylist });
  } catch (e) { fail(res, e); }
});

// Creates the job and queues the yt-dlp run. Shared by the web app (/api/download) and the public API (/api/v1/videos).
// Logged-in accounts get their plan's storage quota, retention and queue priority; anyone else
// (no account) gets the free plan's retention with no storage quota (there is no reliable identity
// to track usage against between anonymous visits).
async function startDownload(t, { url, kind = 'video', height, playlist = false, title, limit = MAX_PLAYLIST, userId = null, cookiesBrowser = '' }) {
  let ttlMinutes = PLANS.free.ttlMinutes, priority = false;
  if (userId) {
    const limits = await auth.planLimits(userId);
    ttlMinutes = limits.ttlMinutes; priority = limits.priority;
    const quotaBytes = limits.storageMB * 1024 * 1024; const used = usedBytes(userId);
    if (used >= quotaBytes) throw new QuotaError(`Estás sem espaço (${Math.round(used / (1024 * 1024))} de ${limits.storageMB} MB usados). Apaga trabalhos antigos para libertar espaço, ou atualiza para o Pro.`);
  }
  const job = newJob({ url, title: typeof title === 'string' && title ? title.slice(0, 200) : url, platform: platformOf(url), userId, ttlMinutes, priority });
  const args = ['--newline', '--ffmpeg-location', path.dirname(t.ffmpeg), '--restrict-filenames',
    '--progress-template', 'PROGRESS %(progress._percent_str)s|%(info.playlist_index)s|%(info.n_entries)s|%(progress._speed_str)s|%(progress._eta_str)s|%(progress._downloaded_bytes_str)s|%(progress._total_bytes_str)s|%(progress._total_bytes_estimate_str)s',
    '--progress', '--print', 'before_dl:TITLE %(title)s']; // --print implies quiet; --progress keeps the progress lines
  if (playlist) args.push('--yes-playlist', '--playlist-end', String(limit), '--ignore-errors',
    '-o', '%(playlist_index)03d - %(title).70B [%(id)s].%(ext)s');
  else args.push('--no-playlist', '-o', '%(title).80B [%(id)s].%(ext)s');
  if (kind === 'audio') args.push('-x', '--audio-format', 'mp3');
  else args.push(...videoFormatArgs(Number(height)), '--merge-output-format', 'mp4');
  if (COOKIE_BROWSERS.includes(cookiesBrowser)) args.unshift('--cookies-from-browser', cookiesBrowser); // opt-in, read locally by yt-dlp
  args.push('--', url);

  enqueue(job, (signal) => {
    update(job, { stage: 'a descarregar' });
    return run(t.ytdlp, args, {
      cwd: job.dir, signal,
      onLine: (l) => {
        const p = parseProgress(l);
        if (p) {
          const extra = { speed: p.speed, eta: p.eta, sizeText: p.sizeText };
          if (playlist && p.idx && p.n) update(job, { ...extra, progress: ((p.idx - 1 + p.pct / 100) / p.n) * 100, stage: `a descarregar ${p.idx}/${p.n}` });
          else update(job, { ...extra, progress: p.pct });
        }
        const ti = l.match(/^TITLE (.+)/); if (ti && !playlist) update(job, { title: ti[1] });
      },
    }).then(() => 'descarregado');
  });
  return job;
}

app.post('/api/download', async (req, res) => {
  const { url, kind = 'video', height, playlist = false, title } = req.body || {};
  const limit = Math.min(MAX_PLAYLIST, Math.max(1, Math.floor(Number(req.body?.limit)) || MAX_PLAYLIST)); // user-chosen number of videos
  if (!validUrl(url)) return res.status(400).json({ error: 'Link inválido.' });
  const t = need(res, 'ytdlp', 'ffmpeg'); if (!t) return;
  const cookiesBrowser = req.user ? (await auth.settings(req.user.id)).cookiesBrowser : '';
  try { const job = await startDownload(t, { url, kind, height, playlist, title, limit, userId: ownerId(req.user), cookiesBrowser }); res.json({ id: job.id }); }
  catch (e) { if (e instanceof QuotaError) return res.status(e.status).json({ error: e.message, upgrade: true }); throw e; }
});

app.get('/api/models', (_req, res) => res.json(listModels()));
app.post('/api/models/download', (req, res) => {
  const name = req.body?.name;
  if (!CATALOGUE.some((m) => m.name === name)) return res.status(400).json({ error: 'Modelo desconhecido.' });
  const job = newJob({ kind: 'model', title: `Modelo Whisper ${name}` });
  res.json({ id: job.id });
  enqueue(job, async (signal) => {
    update(job, { stage: `a descarregar o modelo ${name}` });
    try { await downloadModel(name, { signal, onProgress: (p) => update(job, { progress: Math.round(p) }) }); }
    finally { setTimeout(() => remove(job), 60_000); } // placeholder dir; the model itself lives in models/
    return 'modelo instalado';
  });
});

const LANG_RE = /^[a-z]{2,3}(-[a-z]{2,4})?$/i;
app.post('/api/transcribe', (req, res) => {
  const job = jobOr404(req, res); if (!job) return;
  const t = need(res, 'ffmpeg', 'whisper'); if (!t) return;
  const model = resolveModel(req.body?.model);
  if (!model) return res.status(424).json({ error: `O modelo Whisper "${req.body?.model || 'base'}" não está instalado. Instala-o na secção de modelos.` });
  const src = pickMedia(job, req.body?.file);
  if (!src) return res.status(400).json({ error: 'Não há vídeo ou áudio neste trabalho.' });
  const lang = LANG_RE.test(req.body?.language || '') ? req.body.language : 'auto';
  const translate = !!req.body?.translate; // whisper can only translate to English
  const words = !!req.body?.words; // extra pass: one word per cue, for karaoke-style captions
  const base = translate ? 'translation-en' : 'transcript';
  res.json({ ok: true });

  enqueue(job, async (signal) => {
    update(job, { stage: 'a extrair áudio', progress: 0 });
    await run(t.ffmpeg, ['-y', '-i', src, '-ar', '16000', '-ac', '1', 'audio.wav'], { cwd: job.dir, signal });
    const common = ['-m', model, '-f', 'audio.wav', '-l', lang, ...(translate ? ['-tr'] : [])];
    update(job, { stage: translate ? 'a transcrever e traduzir' : 'a transcrever', progress: 10 });
    const span = words ? 45 : 90;
    await run(t.whisper, [...common, '-osrt', '-ovtt', '-otxt', '-of', base, '-pp'],
      { cwd: job.dir, signal, onLine: (l) => { const m = l.match(/progress\s*=\s*(\d+)%/); if (m) update(job, { progress: 10 + Number(m[1]) * span / 100 }); } });
    if (words) {
      update(job, { stage: 'a marcar palavra a palavra' });
      await run(t.whisper, [...common, '-ml', '1', '-sow', '-osrt', '-of', `${base}.words`, '-pp'],
        { cwd: job.dir, signal, onLine: (l) => { const m = l.match(/progress\s*=\s*(\d+)%/); if (m) update(job, { progress: 55 + Number(m[1]) * 0.45 }); } });
    }
    fs.rmSync(path.join(job.dir, 'audio.wav'), { force: true });
    return translate ? 'transcrito e traduzido' : 'transcrito';
  });
});

// Which subtitle set to use (transcript or translation); only known names are accepted.
const subtitleBase = (job, wanted) => {
  const base = wanted === 'translation-en' ? 'translation-en' : 'transcript';
  return fs.existsSync(path.join(job.dir, `${base}.srt`)) ? base : null;
};

// Burn subtitles with ffmpeg. Relative filename + cwd avoids Windows path escaping.
app.post('/api/burn', (req, res) => {
  const job = jobOr404(req, res); if (!job) return;
  const t = need(res, 'ffmpeg'); if (!t) return;
  const src = pickMedia(job, req.body?.file);
  const sub = subtitleBase(job, req.body?.subtitles);
  if (!src || !sub) return res.status(400).json({ error: 'Transcreve primeiro.' });
  res.json({ ok: true });
  const hard = ['-y', '-i', src, '-vf', `subtitles=${sub}.srt:force_style='Fontsize=22,Outline=2'`, '-c:a', 'copy', 'burned.mp4'];
  // Some ffmpeg builds (e.g. Homebrew's default) have no libass, so the "subtitles" filter is missing.
  const soft = ['-y', '-i', src, '-i', `${sub}.srt`, '-map', '0', '-map', '1', '-c', 'copy', '-c:s', 'mov_text', 'with-subtitles.mp4'];
  enqueue(job, async (signal) => {
    update(job, { stage: 'a gravar legendas', progress: 50 });
    try { await run(t.ffmpeg, hard, { cwd: job.dir, signal }); return 'legendas gravadas'; }
    catch (e) {
      if (signal.aborted) throw e;
      await run(t.ffmpeg, soft, { cwd: job.dir, signal });
      return 'O teu FFmpeg não tem libass: foi adicionada uma faixa de legendas ativável (para gravar no vídeo usa o Remotion)';
    }
  });
});

// Styled captions via Remotion.
app.post('/api/remotion', (req, res) => {
  const job = jobOr404(req, res); if (!job) return;
  const t = need(res, 'ffprobe'); if (!t) return;
  const src = pickMedia(job, req.body?.file);
  const sub = subtitleBase(job, req.body?.subtitles);
  if (!src || !sub) return res.status(400).json({ error: 'Transcreve primeiro.' });
  const style = ['classic', 'bold', 'karaoke'].includes(req.body?.style) ? req.body.style : 'classic';
  const wordsFile = path.join(job.dir, `${sub}.words.srt`);
  if (style === 'karaoke' && !fs.existsSync(wordsFile)) return res.status(400).json({ error: 'Para o estilo karaoke, transcreve com "palavra a palavra" ativado.' });
  res.json({ ok: true });

  enqueue(job, async (signal) => {
    update(job, { stage: 'a analisar o vídeo', progress: 0 });
    const probe = JSON.parse(await run(t.ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
      'stream=width,height,r_frame_rate:format=duration', '-of', 'json', path.join(job.dir, src)], { signal }));
    if (!probe.streams?.[0]) throw new Error('Este ficheiro não tem vídeo.');
    const [n, d] = probe.streams[0].r_frame_rate.split('/').map(Number);
    const fps = Math.round(n / (d || 1)) || 30;
    const { renderCaptioned } = await import('./remotion-render.js');
    await renderCaptioned({
      props: {
        videoSrc: `http://127.0.0.1:${PORT}/files/${job.id}/${encodeURIComponent(src)}`,
        style,
        captions: style === 'karaoke'
          ? groupWords(parseSrt(fs.readFileSync(wordsFile, 'utf8')))
          : parseSrt(fs.readFileSync(path.join(job.dir, `${sub}.srt`), 'utf8')),
      },
      width: probe.streams[0].width, height: probe.streams[0].height, fps,
      durationInFrames: Math.ceil(Number(probe.format.duration) * fps),
      out: path.join(job.dir, style === 'classic' ? 'captioned.mp4' : `captioned-${style}.mp4`),
      onProgress: (p) => update(job, { stage: 'a renderizar (Remotion)', progress: Math.round(p * 100) }),
    });
    return 'legendas estilizadas prontas';
  });
});

// ---- job management ----
app.get('/api/jobs', (req, res) => res.json(allJobs(req.user)));
app.get('/api/jobs/:id', (req, res) => { const j = jobOr404(req, res); if (j) res.json(pub(j)); });
app.post('/api/jobs/:id/cancel', (req, res) => { const j = jobOr404(req, res); if (j) res.json({ cancelled: cancel(j) }); });
// Deleting is always the user's explicit choice; nothing is ever cleaned up automatically.
app.delete('/api/jobs/:id', (req, res) => { const j = jobOr404(req, res); if (j) { remove(j); res.json({ ok: true }); } });
app.get('/api/jobs/:id/events', (req, res) => {
  const job = getJob(req.params.id);
  if (!job || !canAccess(job, req.user)) return res.sendStatus(404);
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  subscribe(job, res);
});

// Local-only: this app shells out to yt-dlp/ffmpeg, so never expose it on the network.
app.listen(PORT, '127.0.0.1', () => console.log(`flw-downloader → http://localhost:${PORT}`));
