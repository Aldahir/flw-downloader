# FLW Downloader

FLW Downloader é uma aplicação web que junta, numa só ferramenta, download de vídeo/áudio, transcrição por IA, legendas estilizadas e geração/leitura de códigos QR, com uma API pública para quem quiser construir por cima. Localmente usa **yt-dlp** (download), **FFmpeg** (conversão/legendas), **Whisper** (transcrição, via whisper.cpp) e **Remotion** (legendas estilizadas).

## Sobre o projeto
- **Para quem é**: criadores de conteúdo e gestores de redes sociais, pequenos negócios (menus, cartões e campanhas com QR dinâmico), equipas de marketing (lotes de QR para material impresso), developers que querem a API, e utilizadores sem conta nas ferramentas gratuitas com limite de tempo.
- **Objetivos**: reunir download, transcrição e QR numa só conta; proteger a privacidade (leitura/conversão de vídeo no próprio navegador); manter o servidor sustentável em produção (quota e validade por conta); gerar receita com planos Pro e API por quota; servir o mercado angolano com pagamento em Kz por transferência/Multicaixa.
- **Vantagens**: tudo numa conta só, privacidade real (IP de leitores de QR nunca é guardado), servidor leve mesmo em produção (ficheiros expiram automaticamente), preço e pagamento adaptados ao mercado, API clara com quotas previsíveis, sem instalação.
- **Paradigma de mercado**: segue o modelo freemium comum aos downloaders e geradores de QR globais, mas combina um produto de consumo (gratuito com limites) com uma plataforma de API (B2B por quota) e resolve o que as plataformas internacionais deixam de fora dos mercados lusófonos — nenhuma aceita Kz nem liga a processadores locais. O pagamento manual com aprovação humana é uma ponte até um gateway automático (Multicaixa Express/EMIS) se o volume justificar.
- **Planos**: Gratuito (1 GB / 60 min), Pro Base 4 000 Kz (5 GB / 30 dias), Pro Plus 8 000 Kz (15 GB / 30 dias), Pro Max 12 000 Kz (30 GB / 60 dias), com prioridade na fila e quotas de API maiores; pacotes de armazenamento extra à parte. Detalhes em [TODO.md](TODO.md) e em `server/plans.js`.

```bash
npm install
# tem um MySQL a correr (ex.: brew install mysql && brew services start mysql no macOS)
npm run db:setup  # primeira vez: cria as bases flw/flw_test, o utilizador flw_app e o ficheiro .env
npm run doctor    # verifica e diz como instalar o que falta
npm start         # http://localhost:3777
npm test          # testes automáticos (usa a base flw_test)
npm run db:status # confirma que as credenciais em .env conseguem ligar
```

## Estrutura
- `server/` — API Node/Express (só em 127.0.0.1): `/api/info`, `/download`, `/transcribe`, `/burn`, `/remotion`, SSE de progresso
- `web/` — UI sem build step (módulos ES), separada em componentes:
  - `index.html` (casca) · `css/` (tokens, base, componentes) · `assets/icons/` (logótipos e glifos locais)
  - `js/lib/` (dom, api, store, jobs-sync, tema) · `js/components/` (cabeçalho, rodapé, hero, filtro e grelha de plataformas, lista de downloads, diálogos, painéis de ferramentas) · `js/pages/` (Transferir, Histórico, Ferramentas)
- `remotion/` — composição `Captioned`
- `downloads/` — um diretório por job

## Base de dados (MySQL)
- Usa o **MySQL que já tens instalado** no computador (o serviço normal do sistema, porta 3306 por omissão); a app não arranca nem gere nenhum servidor próprio.
- `npm run db:setup` pede uma conta administradora desse MySQL uma única vez (para criar as bases e o utilizador da app) e cria as bases `flw` e `flw_test` e o utilizador `flw_app`, com acesso só a essas duas bases. As credenciais ficam em `.env` (não vai para o Git).
- Tabelas (`server/migrations/*.sql`, aplicadas no arranque): utilizadores, sessões, histórico de inícios de sessão, chaves e uso da API, histórico de trabalhos, definições, subscrições, códigos QR dinâmicos e leituras.
- Os ficheiros (vídeos, foto de perfil) ficam em disco; a base guarda só os caminhos e o URL da foto.
- Foto de perfil: reduzida e comprimida para WebP até 120 KB, sempre com o mesmo nome (`uploads/avatars/<id>.webp`): trocar a foto substitui a antiga.
- Leituras dos QR: aparelho, sistema e navegador pelo User-Agent; local aproximado pelo IP numa base local (geoip-lite). O IP não é guardado, só um hash para contar visitantes distintos.

## Armazenamento, planos e pagamentos
- Cada download ocupa espaço no disco do servidor. Para não encher em produção, cada conta tem uma **quota** e uma **validade** (`server/plans.js`): gratuito 1 GB / 60 minutos; Pro Base, Plus e Max têm mais espaço e 30-60 dias, em Kz (pagamento manual, por transferência ou Multicaixa Express — não há processador automático para Kz). Passada a validade, o ficheiro é apagado sozinho (o trabalho fica no histórico, marcado "expirado"); sem conta, aplica-se só o prazo gratuito, sem quota (não há identidade fiável para somar o espaço de visitantes anónimos).
- Acima da quota, um novo download é recusado com uma mensagem a convidar a atualizar o plano.
- Mudar de plano ou comprar mais armazenamento (`#/conta/subscricao`) cria um pedido com uma referência e os dados de pagamento (`PAYMENT_BANK_NAME`, `PAYMENT_IBAN`, `PAYMENT_MULTICAIXA`); o utilizador envia o comprovativo e uma conta em `ADMIN_EMAILS` aprova ou rejeita em `#/admin`.
- Todos os emails (pedido recebido, aprovado, rejeitado, armazenamento cheio, conta apagada, newsletter) passam por `server/mailer.js` e ficam registados na tabela `mail_log`; só são mesmo enviados se definires `SMTP_URL` (e opcionalmente `MAIL_FROM`).
- Um limite global (`MAX_GLOBAL_PARALLEL`, por omissão 20) protege a máquina independentemente do plano de cada conta; contas Pro só saltam à frente na fila (prioridade), nunca ultrapassam esse limite.

## Variáveis opcionais
`YTDLP_BIN`, `FFMPEG_BIN`, `FFPROBE_BIN`, `WHISPER_BIN`, `WHISPER_MODEL`, `PORT`, `PUBLIC_URL` (endereço público para os QR dinâmicos), `TRUST_PROXY=1` (atrás de um proxy, para ler o IP real), `DB_*` e `IP_SECRET` (geridos pelo `.env`), `FLW_UPLOADS`, `FLW_DOWNLOADS` (por omissão `downloads/`), `MAX_GLOBAL_PARALLEL` (por omissão 20), `ADMIN_EMAILS` (lista separada por vírgulas), `PAYMENT_BANK_NAME`/`PAYMENT_IBAN`/`PAYMENT_MULTICAIXA`, `SMTP_URL`/`MAIL_FROM`.

## Rumo à extensão de browser
A UI chama apenas `/api/*`. Numa extensão (Chrome/Edge/Brave/Firefox, depois Safari) o service worker fala com este servidor local via Native Messaging ou `fetch` a `127.0.0.1`.

## Funcionalidades
- **Perfil** (`#/conta`): foto, nome, histórico com relatórios, códigos QR dinâmicos com leituras por aparelho e local, definições, subscrição e segurança (sessões e atividade de login)
- **Conta de utilizador (opcional)**: sessão por cookie `HttpOnly` (30 dias), palavra-passe com scrypt, tudo guardado no MySQL. Cada conta vê só os seus trabalhos; a primeira conta criada fica com os trabalhos que já existiam
- Conta: mudar palavra-passe e apagar conta (os ficheiros ficam, a não ser que marques para os apagar). Esqueceste a palavra-passe? `npm run account -- reset <email>` (não há emails: a app é local)
- **Filtro por plataforma** (YouTube, Instagram, TikTok, Facebook, X, Vimeo, Twitch, Reddit, outras) e contagem de downloads por plataforma
- Progresso do download com percentagem, velocidade, tempo em falta e tamanho
- **API pública** (`/api/v1`, chave de API): `POST /qr/create`, `POST /videos`, `GET /videos/:id`, `GET /usage`. Documentação em `#/api`; quotas diárias em `server/plans.js`; chaves guardadas no MySQL (só o hash)
- Download de vídeo (MP4, qualidade à escolha), só áudio (MP3) e playlists (máx. 100)
- Fila: máx. **20 tarefas em paralelo no servidor** (contas Pro têm prioridade), cancelar; trabalhos guardados em disco
- Cada trabalho apaga-se sozinho passada a validade do plano (gratuito: 60 minutos; Pro: 30-60 dias) — ou antes, se o utilizador o apagar
- **Leitor de vídeo** (cliente): reproduz ficheiros locais de qualquer formato. Se o navegador não os abre, o FFmpeg (WebAssembly) converte-os no próprio navegador; o ficheiro e os codecs não passam pelo servidor
- **Códigos QR** (cliente): texto (até 1200 caracteres), link, mensagem, chamada, e-mail, cartão de visita, Wi-Fi, WhatsApp, evento, localização e link de áudio/vídeo; forma, cores, moldura, logótipo, PNG/SVG. Nada é guardado nem enviado
- **Lote de códigos QR** (cliente): modelo com `{n}` e um intervalo (até 1000), pré-visualização e download em ZIP (PNG ou SVG) com manifesto CSV
- **Leitor de códigos QR** (cliente): pela câmara, de uma imagem ou de um PDF (página a página); mostra uma ação para cada tipo (abrir link, guardar contacto/evento, copiar a palavra-passe do Wi-Fi…). Nada é enviado
- Transcrição Whisper com escolha de modelo (descarregáveis na app), tradução para inglês, palavra a palavra
- Legendas: FFmpeg (ou faixa ativável se faltar libass) e Remotion (clássico, negrito, karaoke)
- **Planos Pro** (`#/conta/subscricao`): mais armazenamento, mais dias de validade e quotas maiores na API; pagamento manual (transferência/Multicaixa), com pedido, referência, comprovativo e aprovação por um admin (`#/admin`)
- **Newsletter** (rodapé): subscrição/cancelamento por email
- Erros em linguagem simples, com detalhes técnicos à parte

Roteiro e decisões: ver [TODO.md](TODO.md).
