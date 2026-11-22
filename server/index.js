import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTools } from './tools.js';
import { run } from './run.js';
import { parseSrt, groupWords } from './srt.js';
import { friendly } from './errors.js';
import { videoFormatArgs } from './formats.js';
import { listModels, resolveModel, downloadModel, CATALOGUE } from './models.js';
import { capabilities, capabilitySummary, probe, analyze, transcode } from './codec.js';
import { DOWNLOADS, newJob, getJob, allJobs, enqueue, cancel, remove, update, subscribe, listFiles, pub, loadFromDisk, stats } from './jobs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);
const PORT = Number(process.env.PORT || 3777);
const tools = () => resolveTools(); // re-resolve so installs are picked up without restart

fs.mkdirSync(DOWNLOADS, { recursive: true });
loadFromDisk();

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(ROOT, 'web')));
app.use('/files', express.static(DOWNLOADS));

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
  if (!job) { res.status(404).json({ error: 'Esse trabalho já não existe.' }); return null; }
  return job;
}

app.get('/api/capabilities', async (_req, res) => {
  const t = tools();
  if (!t.ffmpeg) return res.status(424).json({ error: 'FFmpeg não está instalado.' });
  try { res.json(capabilitySummary(await capabilities(t.ffmpeg))); } catch (e) { fail(res, e); }
});

// Codec reader: what is inside this file, can this FFmpeg read it, will browsers play it?
app.post('/api/probe', async (req, res) => {
  const job = jobOr404(req, res); if (!job) return;
  const t = need(res, 'ffprobe', 'ffmpeg'); if (!t) return;
  const src = pickMedia(job, req.body?.file);
  if (!src) return res.status(400).json({ error: 'Não há vídeo ou áudio neste trabalho.' });
  try {
    const cap = await capabilities(t.ffmpeg);
    const info = await probe(t.ffprobe, path.join(job.dir, src));
    const { encoder, ...analysis } = analyze(info, cap);
    res.json({ file: src, ...info, ...analysis, encoder });
  } catch (e) { fail(res, e); }
});

app.post('/api/transcode', async (req, res) => {
  const job = jobOr404(req, res); if (!job) return;
  const t = need(res, 'ffprobe', 'ffmpeg'); if (!t) return;
  const src = pickMedia(job, req.body?.file);
  if (!src) return res.status(400).json({ error: 'Não há vídeo ou áudio neste trabalho.' });
  let info, cap;
  try { cap = await capabilities(t.ffmpeg); info = await probe(t.ffprobe, path.join(job.dir, src)); } catch (e) { return fail(res, e); }
  const a = analyze(info, cap);
  if (a.missing.length) return res.status(424).json({ error: `${a.missing[0].explain} ${a.missing[0].how}` });
  res.json({ ok: true });
  enqueue(job, async (signal) => {
    update(job, { stage: 'a converter para formato compatível', progress: 0 });
    await transcode({ ffmpeg: t.ffmpeg, cap, src, cwd: job.dir, hasVideo: !!info.video, duration: info.duration, signal,
      onProgress: (p) => update(job, { progress: Math.round(p) }) });
    return 'convertido';
  });
});

// Open a local file (e.g. an unknown format) as a job so it can be inspected, converted and transcribed.
app.post('/api/upload', (req, res) => {
  const raw = String(req.query.name || 'ficheiro');
  const name = path.basename(raw).replace(/[^\w.\- ()\[\]]+/g, '_').slice(0, 120) || 'ficheiro';
  if (!MEDIA_RE.test(name)) return res.status(400).json({ error: 'Tipo de ficheiro não suportado (usa vídeo ou áudio).' });
  const job = newJob({ kind: 'import', title: name, url: '' });
  const out = fs.createWriteStream(path.join(job.dir, name));
  req.pipe(out);
  out.on('finish', () => { update(job, { status: 'done', stage: 'ficheiro aberto', progress: 100 }); res.json({ id: job.id }); });
  out.on('error', (e) => { remove(job); fail(res, e); });
  req.on('aborted', () => { out.destroy(); remove(job); });
});

app.get('/api/health', (_req, res) => res.json({ ...tools(), ...stats() }));

app.post('/api/info', async (req, res) => {
  const { url, playlist = false } = req.body || {};
  if (!validUrl(url)) return res.status(400).json({ error: 'Link inválido. Cola o endereço completo (começa por http:// ou https://).' });
  const t = need(res, 'ytdlp'); if (!t) return;
  const u = new URL(url);
  const looksLikePlaylist = u.searchParams.has('list') || /\/playlist|\/sets\//.test(u.pathname);
  try {
    const out = await run(t.ytdlp, playlist ? ['-J', '--flat-playlist', '--', url] : ['-J', '--no-playlist', '--', url]);
    const j = JSON.parse(out);
    if (j._type === 'playlist') {
      const entries = (j.entries || []).filter(Boolean);
      return res.json({ playlist: { title: j.title, count: entries.length, capped: entries.length > MAX_PLAYLIST,
        entries: entries.slice(0, MAX_PLAYLIST).map((e) => ({ id: e.id, title: e.title, duration: e.duration })) }, looksLikePlaylist });
    }
    const heights = [...new Set((j.formats || []).map((f) => f.height).filter(Boolean))].sort((a, b) => b - a);
    res.json({ title: j.title, thumbnail: j.thumbnail, duration: j.duration, uploader: j.uploader, heights, looksLikePlaylist });
  } catch (e) { fail(res, e); }
});

app.post('/api/download', (req, res) => {
  const { url, kind = 'video', height, playlist = false, title } = req.body || {};
  const limit = Math.min(MAX_PLAYLIST, Math.max(1, Math.floor(Number(req.body?.limit)) || MAX_PLAYLIST)); // user-chosen number of videos
  if (!validUrl(url)) return res.status(400).json({ error: 'Link inválido.' });
  const t = need(res, 'ytdlp', 'ffmpeg'); if (!t) return;
  const job = newJob({ url, title: typeof title === 'string' && title ? title.slice(0, 200) : url });
  res.json({ id: job.id });

  const args = ['--newline', '--ffmpeg-location', path.dirname(t.ffmpeg), '--restrict-filenames',
    '--progress-template', 'PROGRESS %(progress._percent_str)s|%(info.playlist_index)s|%(info.n_entries)s',
    '--progress', '--print', 'before_dl:TITLE %(title)s']; // --print implies quiet; --progress keeps the progress lines
  if (playlist) args.push('--yes-playlist', '--playlist-end', String(limit), '--ignore-errors',
    '-o', '%(playlist_index)03d - %(title).70B [%(id)s].%(ext)s');
  else args.push('--no-playlist', '-o', '%(title).80B [%(id)s].%(ext)s');
  if (kind === 'audio') args.push('-x', '--audio-format', 'mp3');
  else {
    const h = Number(height);
    args.push(...videoFormatArgs(h), '--merge-output-format', 'mp4');
  }
  args.push('--', url);

  enqueue(job, (signal) => {
    update(job, { stage: 'a descarregar' });
    return run(t.ytdlp, args, {
      cwd: job.dir, signal,
      onLine: (l) => {
        const m = l.match(/PROGRESS\s+([\d.]+)%\|(\w+)\|(\w+)/);
        if (m) {
          const pct = Number(m[1]), idx = Number(m[2]), n = Number(m[3]);
          if (playlist && idx && n) update(job, { progress: ((idx - 1 + pct / 100) / n) * 100, stage: `a descarregar ${idx}/${n}` });
          else update(job, { progress: pct });
        }
        const ti = l.match(/^TITLE (.+)/); if (ti && !playlist) update(job, { title: ti[1] });
      },
    }).then(() => 'descarregado');
  });
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
app.get('/api/jobs', (_req, res) => res.json(allJobs()));
app.get('/api/jobs/:id', (req, res) => { const j = jobOr404(req, res); if (j) res.json(pub(j)); });
app.post('/api/jobs/:id/cancel', (req, res) => { const j = jobOr404(req, res); if (j) res.json({ cancelled: cancel(j) }); });
// Deleting is always the user's explicit choice; nothing is ever cleaned up automatically.
app.delete('/api/jobs/:id', (req, res) => { const j = jobOr404(req, res); if (j) { remove(j); res.json({ ok: true }); } });
app.get('/api/jobs/:id/events', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.sendStatus(404);
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  subscribe(job, res);
});

// Local-only: this app shells out to yt-dlp/ffmpeg, so never expose it on the network.
app.listen(PORT, '127.0.0.1', () => console.log(`flw-downloader → http://localhost:${PORT}`));
