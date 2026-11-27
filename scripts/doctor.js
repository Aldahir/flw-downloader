import '../server/env.js';
import { resolveTools } from '../server/tools.js';
const t = resolveTools();
const win = process.platform === 'win32';
const hint = {
  ytdlp: win ? 'winget install yt-dlp' : 'brew install yt-dlp',
  ffmpeg: win ? 'winget install Gyan.FFmpeg' : 'brew install ffmpeg',
  ffprobe: 'ships with ffmpeg',
  whisper: win ? 'download whisper.cpp release (whisper-cli.exe) and set WHISPER_BIN' : 'brew install whisper-cpp',
  whisperModel: `mkdir -p models && curl -L -o models/ggml-base.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin`,
};
let bad = 0;
for (const k of Object.keys(hint)) {
  const ok = !!t[k]; if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} ${k.padEnd(13)} ${ok ? t[k] : '→ ' + hint[k]}`);
}
process.exit(bad ? 1 : 0);
