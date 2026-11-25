import { h, icon, fill } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { store, on } from '../lib/store.js';
import { toast } from '../lib/toast.js';
import { CodeTabs } from '../components/code-tabs.js';
import { openAuth } from '../components/auth-dialog.js';

const BASE = `${location.origin}/api/v1`;
const table = (rows) => h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Parâmetro', 'Tipo', 'Descrição'].map((t) => h('th', {}, t)))),
  h('tbody', {}, rows.map(([k, t, d, req]) => h('tr', {}, h('td', {}, h('code', {}, k), req ? h('span', { class: 'pill', style: 'margin-left:8px' }, 'obrigatório') : null), h('td', {}, t), h('td', {}, d))))));
const section = (id, title, lead, ...kids) => h('section', { class: 'doc', id }, h('h2', {}, title), lead ? h('p', { class: 'mut' }, lead) : null, ...kids);

const qrCurl = `curl -X POST ${BASE}/qr/create \\
  -H "X-API-Key: A_TUA_CHAVE" \\
  -H "Content-Type: application/json" \\
  -d '{"data":"https://exemplo.com","size":512,"shape":"rounded","fg":"#1b8078"}' \\
  --output qr.png`;
const qrJs = `const res = await fetch("${BASE}/qr/create", {
  method: "POST",
  headers: { "X-API-Key": process.env.FLW_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ data: "https://exemplo.com", size: 512, shape: "rounded", fg: "#1b8078" }),
});
if (!res.ok) throw new Error((await res.json()).error.message);
await fs.promises.writeFile("qr.png", Buffer.from(await res.arrayBuffer()));`;
const qrPy = `import os, requests

r = requests.post("${BASE}/qr/create",
    headers={"X-API-Key": os.environ["FLW_KEY"]},
    json={"data": "https://exemplo.com", "size": 512, "shape": "rounded", "fg": "#1b8078"})
r.raise_for_status()
open("qr.png", "wb").write(r.content)`;
const wifiCurl = `curl -X POST ${BASE}/qr/create \\
  -H "X-API-Key: A_TUA_CHAVE" -H "Content-Type: application/json" \\
  -d '{"type":"wifi","fields":{"ssid":"Casa","sec":"WPA","pass":"palavra-passe"},"format":"svg","frame":"label","label":"LIGA-TE"}' \\
  --output wifi.svg`;
const vidCurl = `# 1. pedir o download
curl -X POST ${BASE}/videos \\
  -H "X-API-Key: A_TUA_CHAVE" -H "Content-Type: application/json" \\
  -d '{"url":"https://exemplo.com/video","kind":"video","height":720}'
# -> 202 {"id":"a1b2c3d4","status":"queued","statusUrl":"/api/v1/videos/a1b2c3d4"}

# 2. ver o progresso
curl ${BASE}/videos/a1b2c3d4 -H "X-API-Key: A_TUA_CHAVE"

# 3. descarregar o ficheiro quando status = "done"
curl -OJ ${BASE}/videos/a1b2c3d4/files/video.mp4 -H "X-API-Key: A_TUA_CHAVE"`;
const vidJs = `const headers = { "X-API-Key": process.env.FLW_KEY, "Content-Type": "application/json" };
const { id } = await (await fetch("${BASE}/videos", { method: "POST", headers,
  body: JSON.stringify({ url: "https://exemplo.com/video", kind: "video", height: 720 }) })).json();

let job;
do { await new Promise((r) => setTimeout(r, 2000));
     job = await (await fetch(\`${BASE}/videos/\${id}\`, { headers })).json();
} while (["queued", "running"].includes(job.status));

if (job.status === "done") console.log(job.files[0].url); else console.error(job.error);`;
const vidPy = `import os, time, requests
H = {"X-API-Key": os.environ["FLW_KEY"]}
job = requests.post("${BASE}/videos", headers=H, json={"url": "https://exemplo.com/video", "height": 720}).json()
while True:
    time.sleep(2)
    s = requests.get(f"${BASE}/videos/{job['id']}", headers=H).json()
    if s["status"] not in ("queued", "running"): break
print(s["status"], s["files"])`;

// ---- API keys (needs an account) ----
function Keys(ctx) {
  const box = h('div', { class: 'card', id: 'chaves' });
  let list = [], fresh = null, err = '';
  async function load() { if (!store.user) { draw(); return; } try { list = (await api('/api/auth/keys')).keys; } catch (e) { err = e.message; } draw(); }
  function draw() {
    if (!store.user) return fill(box, h('h2', {}, 'As tuas chaves de API'), h('p', { class: 'mut' }, 'Cria uma conta (é grátis e fica no teu computador) para gerar a tua primeira chave.'),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => openAuth('register') }, icon('key-round'), 'Criar conta e obter chave'), h('button', { class: 'btn line', onclick: () => openAuth('login') }, 'Já tenho conta')));
    const name = h('input', { class: 'input', placeholder: 'Nome da chave (ex.: o meu site)', maxlength: 40, 'aria-label': 'Nome da chave', style: 'flex:1 1 220px' });
    fill(box, h('h2', {}, 'As tuas chaves de API'), err ? h('p', { class: 'msg bad', role: 'alert' }, err) : null,
      fresh ? h('div', { class: 'msg ok', role: 'status' }, h('strong', {}, 'Copia a chave agora: não a voltas a ver. '), h('div', { class: 'row', style: 'margin-top:8px' }, h('code', { class: 'keyshow' }, fresh), h('button', { class: 'btn sm', onclick: async () => { try { await navigator.clipboard.writeText(fresh); toast('Chave copiada.'); } catch { toast('Seleciona a chave e copia à mão.', 'bad'); } } }, icon('copy'), 'Copiar'))) : null,
      list.length ? h('ul', { class: 'files' }, list.map((k) => h('li', {}, h('div', {}, h('b', {}, k.name), h('div', { class: 'mut small' }, `${k.prefix} · QR hoje: ${k.usage.qr} · vídeos hoje: ${k.usage.videos}${k.lastUsed ? ` · último uso ${new Date(k.lastUsed).toLocaleDateString('pt-PT')}` : ' · ainda não usada'}`)),
        h('button', { class: 'btn danger sm', onclick: async () => { if (confirm(`Apagar a chave "${k.name}"? Quem a usa deixa de ter acesso.`)) { try { await api(`/api/auth/keys/${k.id}`, { method: 'DELETE' }); fresh = null; await load(); } catch (e) { toast(e.message, 'bad'); } } } }, icon('trash-2'), 'Apagar')))) : h('p', { class: 'mut' }, 'Ainda não tens chaves.'),
      h('form', { class: 'row', onsubmit: async (e) => { e.preventDefault(); try { const r = await api('/api/auth/keys', { body: { name: name.value } }); fresh = r.key; err = ''; await load(); } catch (er) { err = er.message; draw(); } } }, name, h('button', { class: 'btn', type: 'submit' }, icon('key-round'), 'Criar chave')));
  }
  ctx.on('user', load); load();
  return box;
}

export function ApiPage(ctx) {
  const why = [['zap', 'Um pedido, um resultado', 'JSON simples e uma chave. Sem SDKs, sem OAuth, sem formulários.'], ['lock-keyhole', 'Privacidade por defeito', 'Não guardamos o conteúdo dos teus códigos QR. Os vídeos ficam num espaço só teu e apagas quando quiseres.'],
    ['layers', 'O mesmo motor da app', 'O que vês no gerador é o que a API devolve: mesmas formas, cores, molduras e logótipo.'], ['refresh-cw', 'Limites claros', 'Quota diária visível em cada resposta (X-RateLimit-Remaining). Pedidos inválidos não gastam quota.'],
    ['badge-check', 'Erros que se leem', 'Cada erro diz o que correu mal e como corrigir, em português.'], ['globe', 'Muitas plataformas', 'YouTube, Instagram, TikTok, Facebook, X, Vimeo e muitas outras, graças ao yt-dlp.']];
  return h('div', { class: 'wrap', style: 'padding-bottom:64px' },
    h('div', { class: 'page-head' }, h('p', { class: 'eyebrow' }, 'Para programadores'), h('h1', { style: 'font-size:clamp(2rem,5vw,3.2rem)' }, 'Automatiza os teus ', h('span', { class: 'hl' }, 'códigos QR'), ' e downloads de vídeo'),
      h('p', {}, 'Cria códigos QR estáticos e descarrega vídeos online com a mesma API. Uma chave, JSON e pronto.'),
      h('div', { class: 'row', style: 'margin-top:12px' }, h('a', { class: 'btn', href: '#chaves', onclick: (e) => { e.preventDefault(); document.getElementById('chaves')?.scrollIntoView({ behavior: 'smooth' }); } }, icon('key-round'), 'Obter chave de API'), h('a', { class: 'btn soft', href: '/api/v1/openapi.json', target: '_blank', rel: 'noopener' }, 'OpenAPI (JSON)'), h('a', { class: 'btn line', href: '#qr-create', onclick: (e) => { e.preventDefault(); document.getElementById('qr-create')?.scrollIntoView({ behavior: 'smooth' }); } }, icon('code'), 'Ver documentação'))),

    h('div', { class: 'feat-grid', style: 'margin:28px 0' }, why.map(([ic, t, d]) => h('div', { class: 'feat' }, h('span', { class: 'fi' }, icon(ic)), h('h3', {}, t), h('p', { class: 'mut' }, d)))),
    h('p', { class: 'msg warn' }, 'Estado: a API corre neste servidor (endereço ', h('code', {}, BASE), '). Para a usar a partir de outros computadores, o servidor tem de estar alojado com HTTPS; os limites e preços do plano Pro ainda estão em definição.'),

    h('div', { class: 'doc-layout' },
      h('nav', { class: 'side', 'aria-label': 'Documentação' }, [['auth', 'Autenticação'], ['qr-create', 'Criar código QR'], ['qr-params', 'Parâmetros do QR'], ['videos', 'Descarregar vídeos'], ['usage', 'Utilização e limites'], ['errors', 'Erros'], ['chaves', 'As minhas chaves']].map(([id, t]) => h('a', { href: `#${id}`, onclick: (e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); } }, t))),
      h('div', { class: 'docs' },
        section('auth', 'Autenticação', 'Todos os pedidos precisam de uma chave. Envia-a no cabeçalho X-API-Key (ou Authorization: Bearer). Usa a chave só no teu servidor: nunca a metas em código que corre no navegador.',
          CodeTabs([['Cabeçalho', 'X-API-Key: flw_xxxxxxxxxxxxxxxx'], ['Bearer', 'Authorization: Bearer flw_xxxxxxxxxxxxxxxx']])),
        section('qr-create', 'Criar um código QR', 'POST /api/v1/qr/create devolve a imagem (PNG ou SVG). Envia "data" com o que queres codificar, ou "type" e "fields" para tipos prontos: url, text, sms, call, email, vcard, wifi, whatsapp, event, geo e media.',
          CodeTabs([['curl', qrCurl], ['JavaScript', qrJs], ['Python', qrPy]]),
          h('p', { class: 'mut' }, 'Tipos prontos, por exemplo Wi-Fi, com moldura e SVG:'), CodeTabs([['curl', wifiCurl]]),
          h('p', { class: 'mut' }, 'Com "response":"json" recebes {format, mime, width, height, data}: base64 no PNG, texto no SVG.')),
        section('qr-params', 'Parâmetros do código QR', null, table([
          ['data', 'string', 'O que codificar (até 2000 caracteres). Obrigatório se não usares "type".', true], ['type', 'string', 'url, text, sms, call, email, vcard, wifi, whatsapp, event, geo ou media.'], ['fields', 'objeto', 'Campos do tipo escolhido (ex.: {"ssid":"Casa","pass":"…"} no wifi). O texto livre tem o máximo de 1200 caracteres.'],
          ['format', 'string', 'png (por omissão) ou svg.'], ['size', 'inteiro', 'Largura do PNG em pixéis, de 64 a 4096. Por omissão 512.'], ['fg', 'string', 'Cor do código, hexadecimal. Por omissão #000000.'], ['bg', 'string', 'Cor do fundo. Por omissão #ffffff.'], ['transparent', 'booleano', 'Fundo transparente (sem moldura).'],
          ['shape', 'string', 'square, rounded ou dots.'], ['frame', 'string', 'none, box ou label (com texto).'], ['label', 'string', 'Texto da moldura (até 24 caracteres).'], ['margin', 'inteiro', 'Margem em módulos, de 0 a 8. Por omissão 3.'],
          ['ecc', 'string', 'Correção de erros: L, M (por omissão), Q ou H.'], ['logo', 'string', 'Imagem PNG, JPEG ou WebP em base64 (até 200 KB). Sobe a correção para H.'], ['response', 'string', '"image" (por omissão) ou "json".']])),
        section('videos', 'Descarregar vídeos', 'Em três passos: pedir, acompanhar e buscar o ficheiro. O pedido responde logo com 202; o download corre em segundo plano.',
          CodeTabs([['curl', vidCurl], ['JavaScript', vidJs], ['Python', vidPy]]),
          table([['url', 'string', 'Endereço do vídeo (http ou https).', true], ['kind', 'string', 'video (MP4, por omissão) ou audio (MP3).'], ['height', 'inteiro', 'Qualidade máxima em pixéis de altura (144 a 4320). Sem isto, a melhor disponível.']]),
          h('p', { class: 'mut' }, 'Estados: queued, running, done, error, cancelled. GET /api/v1/videos/{id} devolve também progress (0 a 100), speed, eta, title e files. DELETE /api/v1/videos/{id} apaga o trabalho e os ficheiros: nada é apagado sozinho.')),
        section('usage', 'Utilização e limites', 'GET /api/v1/usage mostra quantos pedidos já fizeste hoje (dia UTC). Cada resposta traz X-RateLimit-Limit e X-RateLimit-Remaining. Pedidos recusados por parâmetros inválidos não contam.',
          CodeTabs([['curl', `curl ${BASE}/usage -H "X-API-Key: A_TUA_CHAVE"\n# {"day":"2026-11-23","qr":{"used":3,"limit":200},"videos":{"used":1,"limit":20}}`]])),
        section('errors', 'Erros', 'Os erros vêm sempre assim: {"error":{"code":"…","message":"…"}}.',
          table([['400 invalid_parameter', '', 'Um parâmetro está em falta ou é inválido; a mensagem diz qual.'], ['401 invalid_api_key', '', 'Chave em falta, errada ou apagada.'], ['404 not_found', '', 'O trabalho ou o ficheiro não existe, ou não é teu.'], ['429 quota_exceeded', '', 'Chegaste ao limite diário. Volta amanhã (UTC).'], ['503 unavailable', '', 'O servidor ainda não tem o yt-dlp e o FFmpeg instalados.']])),
        Keys(ctx)),
    ),

    // Marketing 3.0: values first, honest claims, one clear action
    h('section', { class: 'band' }, h('div', { class: 'band-in' }, h('h2', {}, 'Constrói com ferramentas que respeitam as pessoas'),
      h('p', {}, 'Privacidade, transparência e limites honestos: sem rastreio, sem letras pequenas, sem ficares preso. Começa grátis e cresce ao teu ritmo.'),
      h('div', { class: 'row', style: 'justify-content:center' }, h('a', { class: 'btn', style: 'background:var(--hl);color:var(--on-hl)', href: '#chaves', onclick: (e) => { e.preventDefault(); document.getElementById('chaves')?.scrollIntoView({ behavior: 'smooth' }); } }, icon('key-round'), 'Começar grátis'), h('a', { class: 'btn line', style: 'color:inherit;box-shadow:inset 0 0 0 1.5px currentColor', href: '#/ferramentas/qr' }, 'Experimentar no navegador')))));
}
