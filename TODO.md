# FLW Downloader — TODO

## Decisões de produto
- Backend fica em **Node** (sem migração para Python).
- **Nunca limpar `downloads/` automaticamente**: o utilizador decide manter ou apagar (por job).
- Limite **5 transferências/tarefas em paralelo** (plano gratuito). Limite maior = versão **Pro** (por implementar; a regra de negócio está em definição). O limite vive em `server/plans.js`.
- Instalação de componentes (yt-dlp, FFmpeg, Whisper, codecs) será guiada **no browser do utilizador** — só depois de a app estar completa.
- Windows: só depois de a app estar completa.
- Extensão de browser (Chrome, Edge, Brave, Firefox, Safari): só depois.
- **Commit depois de cada atualização.**

## Concluído nesta fase
- [x] Persistência dos jobs em disco (sobrevivem a reinícios)
- [x] Fila com limite de paralelismo (5) e posição na fila
- [x] Cancelar tarefas
- [x] Apagar job/ficheiros (decisão do utilizador)
- [x] Mensagens de erro em linguagem simples, com sugestão do que fazer
- [x] Leitor de codecs (ffprobe): contentor, vídeo, áudio, legendas, compatibilidade com browsers
- [x] Deteção de codecs/encoders em falta no FFmpeg, com explicação e como obter
- [x] Converter para formato compatível (H.264 + AAC) quando o vídeo não abre em todo o lado
- [x] Abrir ficheiro local (formatos desconhecidos)
- [x] Playlists (testadas só até à fase de erro de playlist inexistente; falta um teste com playlist real)
- [x] Escolha do modelo Whisper (tiny, base, small, medium, large-v3-turbo) + descarregar modelos
- [x] Tradução para inglês (Whisper)
- [x] Legendas palavra a palavra (karaoke) + estilos no Remotion
- [x] Testes automáticos (node:test) e verificação e2e (MP3, qualidade)

## Depois
- [ ] Testar e ajustar no Windows
- [ ] Instalação guiada de componentes no browser (inclui FFmpeg com libass/codecs completos)
- [ ] Extensão de browser
- [ ] Versão Pro (mais paralelismo, etc.)
- [ ] Remoto no GitHub e CI

## Ideias
- Cortar/recortar vídeo por tempo
- Exportar legendas em vários idiomas
- Fila de downloads agendada
- Cookies do browser para vídeos que exigem login
