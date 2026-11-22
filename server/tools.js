// Resolve external binaries (yt-dlp, ffmpeg, ffprobe, whisper) on macOS and Windows.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const isWin = process.platform === 'win32';

function which(name) {
  const r = spawnSync(isWin ? 'where' : 'which', [name], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  return r.stdout.split(/\r?\n/).find(Boolean) || null;
}

export function resolveTools() {
  const env = process.env;
  const pick = (override, names) => {
    if (override && fs.existsSync(override)) return override;
    for (const n of names) { const p = which(n); if (p) return p; }
    return null;
  };
  const modelsDir = path.resolve('models');
  const model = env.WHISPER_MODEL || path.join(modelsDir, 'ggml-base.bin');
  return {
    ytdlp: pick(env.YTDLP_BIN, ['yt-dlp']),
    ffmpeg: pick(env.FFMPEG_BIN, ['ffmpeg']),
    ffprobe: pick(env.FFPROBE_BIN, ['ffprobe']),
    whisper: pick(env.WHISPER_BIN, ['whisper-cli', 'whisper-cpp', 'main']),
    whisperModel: fs.existsSync(model) ? model : null,
    whisperModelPath: model,
  };
}
