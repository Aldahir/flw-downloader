import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolveTools } from './tools.js';
import { run } from './run.js';
import { parseSrt } from './srt.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);
const DOWNLOADS = path.join(ROOT, 'downloads');
const PORT = Number(process.env.PORT || 3777);
const tools = () => resolveTools(); // re-resolve so installs are picked up without restart

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(ROOT, 'web')));
app.use('/files', express.static(DOWNLOADS));

const jobs = new Map();
const listeners = new Map();

function newJob(extra = {}) {
  const id = crypto.randomUUID().slice(0, 8);
  const dir = path.join(DOWNLOADS, id);
  fs.mkdirSync(dir, { recursive: true });
  const job = { id, dir, status: 'queued', stage: '', progress: 0, files: [], error: null, ...extra };
  jobs.set(id, job);
  return job;
}
function update(job, patch) {
  Object.assign(job, patch);
  (listeners.get(job.id) || []).forEach((res) => res.write(`data: ${JSON.stringify(pub(job))}\n\n`));
}
const pub = (j) => ({ id: j.id, status: j.status, stage: j.stage, progress: j.progress, files: j.files, error: j.error, title: j.title });
const listFiles = (job) => fs.readdirSync(job.dir).map((f) => ({ name: f, url: `/files/${job.id}/${encodeURIComponent(f)}` }));

function validUrl(u) {
  try { const p = new URL(u); return p.protocol === 'http:' || p.protocol === 'https:'; } catch { return false; }
}
function need(res, ...keys) {
  const t = tools();
  const missing = keys.filter((k) => !t[k]);
  if (missing.length) { res.status(424).json({ error: `Missing tool(s): ${missing.join(', ')}. Run "npm run doctor".` }); return null; }
  return t;
}

app.get('/api/health', (_req, res) => res.json(tools()));

app.post('/api/info', async (req, res) => {
  const { url } = req.body || {};
  if (!validUrl(url)) return res.status(400).json({ error: 'Invalid URL' });
  const t = need(res, 'ytdlp'); if (!t) return;
  try {
    const out = await run(t.ytdlp, ['-J', '--no-playlist', '--', url]);
    const j = JSON.parse(out);
    const heights = [...new Set((j.formats || []).map((f) => f.height).filter(Boolean))].sort((a, b) => b - a);
    res.json({ title: j.title, thumbnail: j.thumbnail, duration: j.duration, uploader: j.uploader, heights });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/download', (req, res) => {
  const { url, kind = 'video', height } = req.body || {};
  if (!validUrl(url)) return res.status(400).json({ error: 'Invalid URL' });
  const t = need(res, 'ytdlp', 'ffmpeg'); if (!t) return;
  const job = newJob();
  res.json({ id: job.id });

  const args = ['--no-playlist', '--newline', '--ffmpeg-location', path.dirname(t.ffmpeg),
    '--progress-template', 'PROGRESS %(progress._percent_str)s',
    '-o', '%(title).80B [%(id)s].%(ext)s', '--restrict-filenames'];
  if (kind === 'audio') args.push('-x', '--audio-format', 'mp3');
  else {
    const h = Number(height);
    args.push('-f', h ? `bv*[height<=${h}]+ba/b[height<=${h}]` : 'bv*+ba/b', '--merge-output-format', 'mp4');
  }
  args.push('--', url);

  update(job, { status: 'running', stage: 'downloading' });
  run(t.ytdlp, args, {
    cwd: job.dir,
    onLine: (l) => {
      const m = l.match(/PROGRESS\s+([\d.]+)%/);
      if (m) update(job, { progress: Number(m[1]) });
    },
  }).then(() => update(job, { status: 'done', stage: 'downloaded', progress: 100, files: listFiles(job) }))
    .catch((e) => update(job, { status: 'error', error: e.message }));
});

const media = (job) => fs.readdirSync(job.dir).find((f) => /\.(mp4|mkv|webm|mp3|m4a)$/i.test(f) && !/^(burned|captioned|with-subtitles)/.test(f));

app.post('/api/transcribe', (req, res) => {
  const job = jobs.get(req.body?.id);
  if (!job) return res.status(404).json({ error: 'Unknown job' });
  const t = need(res, 'ffmpeg', 'whisper'); if (!t) return;
  if (!t.whisperModel) return res.status(424).json({ error: `Whisper model not found at ${t.whisperModelPath}. Run "npm run doctor".` });
  const src = media(job);
  if (!src) return res.status(400).json({ error: 'No media in job' });
  res.json({ ok: true });

  (async () => {
    update(job, { status: 'running', stage: 'extracting audio', progress: 0 });
    await run(t.ffmpeg, ['-y', '-i', src, '-ar', '16000', '-ac', '1', 'audio.wav'], { cwd: job.dir });
    update(job, { stage: 'transcribing', progress: 10 });
    const lang = String(req.body?.language || 'auto').replace(/[^a-z-]/gi, '') || 'auto';
    await run(t.whisper, ['-m', t.whisperModel, '-f', 'audio.wav', '-l', lang, '-osrt', '-ovtt', '-otxt', '-of', 'transcript',
      '-pp'], { cwd: job.dir, onLine: (l) => { const m = l.match(/progress\s*=\s*(\d+)%/); if (m) update(job, { progress: 10 + Number(m[1]) * 0.9 }); } });
    fs.rmSync(path.join(job.dir, 'audio.wav'), { force: true });
    update(job, { status: 'done', stage: 'transcribed', progress: 100, files: listFiles(job) });
  })().catch((e) => update(job, { status: 'error', error: e.message }));
});

// Fast path: hard-burn plain subtitles with ffmpeg. Relative filename + cwd avoids Windows path escaping.
app.post('/api/burn', (req, res) => {
  const job = jobs.get(req.body?.id);
  if (!job) return res.status(404).json({ error: 'Unknown job' });
  const t = need(res, 'ffmpeg'); if (!t) return;
  const src = media(job);
  if (!src || !fs.existsSync(path.join(job.dir, 'transcript.srt'))) return res.status(400).json({ error: 'Transcribe first' });
  res.json({ ok: true });
  update(job, { status: 'running', stage: 'burning subtitles', progress: 50 });
  const hard = ['-y', '-i', src, '-vf', "subtitles=transcript.srt:force_style='Fontsize=22,Outline=2'", '-c:a', 'copy', 'burned.mp4'];
  // Some ffmpeg builds (e.g. Homebrew's default) ship without libass, so the "subtitles" filter is missing.
  // Fall back to a selectable subtitle track (mov_text) and tell the user; Remotion gives styled burn-in.
  const soft = ['-y', '-i', src, '-i', 'transcript.srt', '-map', '0', '-map', '1', '-c', 'copy', '-c:s', 'mov_text', 'with-subtitles.mp4'];
  run(t.ffmpeg, hard, { cwd: job.dir })
    .then(() => update(job, { status: 'done', stage: 'burned', progress: 100, files: listFiles(job) }))
    .catch(() => run(t.ffmpeg, soft, { cwd: job.dir })
      .then(() => update(job, { status: 'done', stage: 'ffmpeg has no libass: added a soft subtitle track instead (use Remotion for burned-in)', progress: 100, files: listFiles(job) })))
    .catch((e) => update(job, { status: 'error', error: e.message }));
});

// Styled captions via Remotion (slower, nicer).
app.post('/api/remotion', (req, res) => {
  const job = jobs.get(req.body?.id);
  if (!job) return res.status(404).json({ error: 'Unknown job' });
  const t = need(res, 'ffprobe'); if (!t) return;
  const src = media(job);
  const srtPath = path.join(job.dir, 'transcript.srt');
  if (!src || !fs.existsSync(srtPath)) return res.status(400).json({ error: 'Transcribe first' });
  res.json({ ok: true });

  (async () => {
    update(job, { status: 'running', stage: 'probing', progress: 0 });
    const probe = JSON.parse(await run(t.ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
      'stream=width,height,r_frame_rate:format=duration', '-of', 'json', path.join(job.dir, src)]));
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
      onProgress: (p) => update(job, { stage: 'rendering (Remotion)', progress: Math.round(p * 100) }),
    });
    update(job, { status: 'done', stage: 'captioned', progress: 100, files: listFiles(job) });
  })().catch((e) => update(job, { status: 'error', error: e.message }));
});

app.get('/api/jobs/:id/events', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.sendStatus(404);
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write(`data: ${JSON.stringify(pub(job))}\n\n`);
  const arr = listeners.get(job.id) || []; arr.push(res); listeners.set(job.id, arr);
  req.on('close', () => listeners.set(job.id, (listeners.get(job.id) || []).filter((r) => r !== res)));
});

// Local-only: this app shells out to yt-dlp/ffmpeg, so never expose it on the network.
app.listen(PORT, '127.0.0.1', () => console.log(`flw-downloader → http://localhost:${PORT}`));
