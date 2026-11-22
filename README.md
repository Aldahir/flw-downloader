# FLW Downloader

Web app local (macOS + Windows) que junta **yt-dlp** (download), **FFmpeg** (conversão/legendas), **Whisper** (transcrição, via whisper.cpp) e **Remotion** (legendas estilizadas).

```bash
npm install
npm run doctor   # verifica e diz como instalar o que falta
npm start        # http://localhost:3777
```

## Estrutura
- `server/` — API Node/Express (só em 127.0.0.1): `/api/info`, `/download`, `/transcribe`, `/burn`, `/remotion`, SSE de progresso
- `web/index.html` — UI sem build step (fácil de reaproveitar na extensão)
- `remotion/` — composição `Captioned`
- `downloads/` — um diretório por job

## Variáveis opcionais
`YTDLP_BIN`, `FFMPEG_BIN`, `FFPROBE_BIN`, `WHISPER_BIN`, `WHISPER_MODEL`, `PORT`.

## Rumo à extensão de browser
A UI chama apenas `/api/*`. Numa extensão (Chrome/Edge/Brave/Firefox, depois Safari) o service worker fala com este servidor local via Native Messaging ou `fetch` a `127.0.0.1`.
