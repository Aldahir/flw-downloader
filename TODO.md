# FLW Downloader — TODO

## Decisões de produto
- Backend fica em **Node** (sem migração para Python).
- **Cada trabalho apaga-se sozinho passada a validade do plano** (gratuito: 60 minutos; Pro: 30-60 dias) — substituiu a decisão antiga de nunca limpar `downloads/`, para o disco do servidor não encher em produção. O utilizador pode sempre apagar antes disso.
- Limite **global de 20 tarefas em paralelo** no servidor (`MAX_GLOBAL_PARALLEL`), para proteger a máquina; contas Pro só têm prioridade na fila, não um limite maior. Quota de armazenamento por plano em `server/plans.js`.
- Pagamento do Pro é **manual** (transferência/Multicaixa, aprovado por um admin em `#/admin`): não há processador automático para Kz.
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
- [x] Leitor de vídeo no navegador com codecs (FFmpeg WebAssembly), sem enviar nada ao servidor
- [x] Gerador de códigos QR no navegador (texto 1200, link, SMS, chamada, e-mail, vCard, Wi-Fi, WhatsApp, evento, localização, áudio/vídeo)
- [x] Leitor de códigos QR no navegador: pela câmara (BarcodeDetector nativo, jsQR por alternativa), de uma imagem ou de um PDF (página a página); interpreta o conteúdo (link, Wi-Fi, contacto, evento, email, telefone, SMS, localização) com uma ação pronta
- [x] Lote de códigos QR em sequência (modelo com `{n}`, até 1000), com pré-visualização e download em ZIP (PNG ou SVG) com manifesto CSV — inspirado na emissão em lote do Eticket
- [x] Playlists (testadas com uma playlist real: canal Blender Open Movies, 2 vídeos; limite de vídeos à escolha)
- [x] Escolha do modelo Whisper (tiny, base, small, medium, large-v3-turbo) + descarregar modelos
- [x] Tradução para inglês (Whisper)
- [x] Legendas palavra a palavra (karaoke) + estilos no Remotion
- [x] Nova interface em componentes (menu, filtro por plataforma, rodapé), histórico separado das ferramentas (legendas, codecs, modelos)
- [x] Conta de utilizador com sessão por cookie; trabalhos por conta; mudar palavra-passe, apagar conta, reposição pelo terminal
- [x] Progresso com velocidade, tempo em falta e tamanho
- [x] Leitor de vídeo e Códigos QR movidos para Ferramentas (menu: Transferir, Histórico, API, Ferramentas)
- [x] API pública `/api/v1`: criar QR (PNG/SVG/JSON) e descarregar vídeos, com chaves de API (guardadas só em hash), quota diária por chave e erros claros
- [x] Página da API (documentação com exemplos curl/JavaScript/Python, tabelas de parâmetros, gestão de chaves) e CTA de marketing 3.0 (valores: privacidade, transparência, limites claros)
- [x] Secções da home: funcionalidades, como usar, porquê usar, o que é um QR e tipos, estáticos vs dinâmicos, CTA da API
- [x] **MySQL**: usa o servidor do sistema (não uma instância própria do projeto), migrações, `npm run db:setup/status`
- [x] Contas, sessões, chaves de API e uso passaram para a base de dados; histórico de trabalhos espelhado na base
- [x] Página de perfil: foto (WebP ≤120 KB, mesmo nome, substitui a antiga), nome, histórico com relatórios, definições, subscrição, segurança (sessões, atividade de login), apagar conta
- [x] QR dinâmicos (`/q/<código>`): mudar destino, pausar, leituras por dia, aparelho, sistema, navegador, país e cidade (IP → local offline, IP não guardado)
- [x] Tarefas fáceis: mudar o nome da conta, especificação OpenAPI (`/api/v1/openapi.json`), CI no GitHub Actions (ficheiro pronto), cookies do navegador para vídeos com login (opcional, por conta)
- [x] Testes automáticos (node:test) e verificação e2e (MP3, qualidade)
- [x] Dados pessoais no perfil (género, ano de nascimento, localização, telefone; opcionais, para estatísticas agregadas) e recorte da foto antes de enviar (arrastar e ampliar)
- [x] Correção: `api()` ignorava o `method` pedido quando havia corpo (mudar destino/pausar QR, mudar nome, apagar conta e guardar definições falhavam); erro do Vimeo "só funciona com sessão iniciada" agora reconhecido com sugestão de ligar os cookies do navegador
- [x] **Armazenamento por plano**: quota (1/5/15/30 GB) e validade (60 min / 30-60 dias) por conta (`server/plans.js`); passada a validade o ficheiro apaga-se sozinho (trabalho fica "expirado" no histórico); acima da quota, novo download é recusado com link para os planos; sem conta aplica-se só o prazo gratuito, sem quota
- [x] **Planos Pro em Kz** (Base 4000, Plus 8000, Max 12000) e pacotes de armazenamento extra (+5/15/30 GB); fila com prioridade para contas Pro, limite global de 20 tarefas em paralelo a proteger o servidor (`server/jobs.js`)
- [x] **Pagamento manual**: pedido com referência e dados de pagamento (`PAYMENT_BANK_NAME`/`PAYMENT_IBAN`/`PAYMENT_MULTICAIXA`), upload do comprovativo, aprovação/rejeição por um admin (`ADMIN_EMAILS`) em `#/admin`
- [x] **Emails** (`server/mailer.js`, tabela `mail_log`): pedido recebido/aprovado/rejeitado, armazenamento cheio, conta apagada, confirmação de newsletter — prontos a ligar a um SMTP real (`SMTP_URL`)
- [x] **Newsletter** no rodapé: subscrever/cancelar por email

## Depois
- [ ] **API para vender** (ver decisões em aberto abaixo): alojar com HTTPS, domínio, CORS, termos de uso e política de direitos de autor para o download de vídeos, deteção de abuso, painel de utilização
- [ ] QR dinâmicos (endereço curto editável + contagem de leituras): precisa de servidor sempre ligado e base de dados
- [ ] QR: mais padrões e marcadores (como os da API do qr.io), gradientes, molduras com balão/telemóvel, lote (CSV → ZIP), histórico local de códigos criados
- [ ] Testar e ajustar no Windows
- [ ] Instalação guiada de componentes no browser (inclui FFmpeg com libass/codecs completos)
- [ ] Extensão de browser
- [ ] Criar o repositório no GitHub (o ficheiro `.github/workflows/ci.yml` já está pronto)
- [ ] Ligar um processador de pagamento automático para Kz (Multicaixa Express/EMIS) em vez da aprovação manual, se/quando houver volume que justifique
- [ ] Aviso automático por email quando o armazenamento passa de 80%/100% (hoje o campo `notify_storage` já existe nas definições, falta o gatilho que chama `mailer.send('storage_warning', ...)`)
- [ ] Email de notificação quando um pedido de pagamento é aprovado/rejeitado para o admin também (hoje só o utilizador recebe)

## Decisões em aberto (base de dados e conta)
- Backups da base de dados e onde guardar: hoje só existe no MySQL deste computador
- Recuperação de palavra-passe por email (precisa de `SMTP_URL` configurado) e verificação de email
- Migrar os ficheiros (vídeos e fotos) para armazenamento na nuvem (S3/R2) quando o servidor for público — por agora é só disco local com quota/validade por plano
- QR dinâmicos fora do computador: definir `PUBLIC_URL`, domínio e HTTPS

## Decisões em aberto (API)
- Onde alojar e como limitar abusos do download de vídeos (direitos de autor, termos dos sites)
- Webhook quando um download termina, em vez de ficar a consultar o estado

## Ideias
- SDKs pequenos (npm e pip) e coleção Postman/OpenAPI da API
- Webhooks de fim de download e URL de ficheiro temporário assinado
- QR com "estado" público: página de leituras sem conta
- Modo equipa: várias pessoas partilham chaves e histórico
- Marcação de água/legenda automática em lote (pasta vigiada)
- Extrair só o áudio com capítulos, e cortar por tempo
- Agendar downloads para a noite
- Gerador de QR para cartões de visita em PDF pronto a imprimir
- Verificador de QR (ler um QR de uma imagem, no navegador) com aviso de links suspeitos
- Pré-visualização do QR em contexto (cartaz, cartão, t-shirt)
- Cortar/recortar vídeo por tempo
- Exportar legendas em vários idiomas
- Fila de downloads agendada
