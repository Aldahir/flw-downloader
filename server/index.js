import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTools } from './tools.js';
import { run } from './run.js';
import { parseSrt } from './srt.js';
import { friendly } from './errors.js';
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

app.get('/api/health', (_req, res) => res.json({ ...tools(), ...stats() }));

app.post('/api/info', async (req, res) => {
  const { url } = req.body || {};
  if (!validUrl(url)) return res.status(400).json({ error: 'Link inválido. Cola o endereço completo (começa por http:// ou https://).' });
  const t = need(res, 'ytdlp'); if (!t) return;
  try {
    const out = await run(t.ytdlp, ['-J', '--no-playlist', '--', url]);
    const j = JSON.parse(out);
    const heights = [...new Set((j.formats || []).map((f) => f.height).filter(Boolean))].sort((a, b) => b - a);
    res.json({ title: j.title, thumbnail: j.thumbnail, duration: j.duration, uploader: j.uploader, heights });
  } catch (e) { fail(res, e); }
});

app.post('/api/download', (req, res) => {
  const { url, kind = 'video', height } = req.body || {};
  if (!validUrl(url)) return res.status(400).json({ error: 'Link inválido.' });
  const t = need(res, 'ytdlp', 'ffmpeg'); if (!t) return;
  const job = newJob({ url, title: url });
  res.json({ id: job.id });

  const args = ['--no-playlist', '--newline', '--ffmpeg-location', path.dirname(t.ffmpeg),
    '--progress-template', 'PROGRESS %(progress._percent_str)s',
    '--print', 'before_dl:TITLE %(title)s',
    '-o', '%(title).80B [%(id)s].%(ext)s', '--restrict-filenames'];
  if (kind === 'audio') args.push('-x', '--audio-format', 'mp3');
  else {
    const h = Number(height);
    args.push('-f', h ? `bv*[height<=${h}]+ba/b[height<=${h}]` : 'bv*+ba/b', '--merge-output-format', 'mp4');
  }
  args.push('--', url);

  enqueue(job, (signal) => {
    update(job, { stage: 'a descarregar' });
    return run(t.ytdlp, args, {
      cwd: job.dir, signal,
      onLine: (l) => {
        const m = l.match(/PROGRESS\s+([\d.]+)%/); if (m) update(job, { progress: Number(m[1]) });
        const ti = l.match(/^TITLE (.+)/); if (ti) update(job, { title: ti[1] });
      },
    }).then(() => 'descarregado');
  });
});

app.post('/api/transcribe', (req, res) => {
  const job = jobOr404(req, res); if (!job) return;
  const t = need(res, 'ffmpeg', 'whisper'); if (!t) return;
  if (!t.whisperModel) return res.status(424).json({ error: `Falta o modelo Whisper (${t.whisperModelPath}). Corre "npm run doctor".` });
  const src = pickMedia(job, req.body?.file);
  if (!src) return res.status(400).json({ error: 'Não há vídeo ou áudio neste trabalho.' });
  const lang = String(req.body?.language || 'auto').replace(/[^a-z-]/gi, '') || 'auto';
  res.json({ ok: true });

  enqueue(job, async (signal) => {
    update(job, { stage: 'a extrair áudio', progress: 0 });
    await run(t.ffmpeg, ['-y', '-i', src, '-ar', '16000', '-ac', '1', 'audio.wav'], { cwd: job.dir, signal });
    update(job, { stage: 'a transcrever', progress: 10 });
    await run(t.whisper, ['-m', t.whisperModel, '-f', 'audio.wav', '-l', lang, '-osrt', '-ovtt', '-otxt', '-of', 'transcript', '-pp'],
      { cwd: job.dir, signal, onLine: (l) => { const m = l.match(/progress\s*=\s*(\d+)%/); if (m) update(job, { progress: 10 + Number(m[1]) * 0.9 }); } });
    fs.rmSync(path.join(job.dir, 'audio.wav'), { force: true });
    return 'transcrito';
  });
});

// Burn subtitles with ffmpeg. Relative filename + cwd avoids Windows path escaping.
app.post('/api/burn', (req, res) => {
  const job = jobOr404(req, res); if (!job) return;
  const t = need(res, 'ffmpeg'); if (!t) return;
  const src = pickMedia(job, req.body?.file);
  if (!src || !fs.existsSync(path.join(job.dir, 'transcript.srt'))) return res.status(400).json({ error: 'Transcreve primeiro.' });
  res.json({ ok: true });
  const hard = ['-y', '-i', src, '-vf', "subtitles=transcript.srt:force_style='Fontsize=22,Outline=2'", '-c:a', 'copy', 'burned.mp4'];
  // Some ffmpeg builds (e.g. Homebrew's default) have no libass, so the "subtitles" filter is missing.
  const soft = ['-y', '-i', src, '-i', 'transcript.srt', '-map', '0', '-map', '1', '-c', 'copy', '-c:s', 'mov_text', 'with-subtitles.mp4'];
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
  const srtPath = path.join(job.dir, 'transcript.srt');
  if (!src || !fs.existsSync(srtPath)) return res.status(400).json({ error: 'Transcreve primeiro.' });
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
        captions: parseSrt(fs.readFileSync(srtPath, 'utf8')),
      },
      width: probe.streams[0].width, height: probe.streams[0].height, fps,
      durationInFrames: Math.ceil(Number(probe.format.duration) * fps),
      out: path.join(job.dir, 'captioned.mp4'),
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
