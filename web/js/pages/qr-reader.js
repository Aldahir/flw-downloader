import { h, icon, fill } from '../lib/dom.js';
import { toast } from '../lib/toast.js';
import { detect, detectImageFile, detectPdfFile } from '../lib/qr-decode.js';
import { interpret } from '../lib/qr-interpret.js';

const KIND_ICON = { url: 'link', wifi: 'wifi', vcard: 'contact', email: 'at-sign', tel: 'phone', sms: 'mail', geo: 'map-pin', event: 'calendar', text: 'captions' };
const SEC_NAME = { WPA: 'WPA/WPA2/WPA3', WEP: 'WEP', nopass: 'Sem palavra-passe' };

function copyBtn(text, label = 'Copiar') {
  return h('button', { class: 'btn soft sm', onclick: async () => { try { await navigator.clipboard.writeText(text); toast('Copiado.'); } catch { toast('O teu navegador não deixou copiar.', 'bad'); } } }, icon('copy'), label);
}
function vcardFile(raw, name) { return new Blob([raw], { type: 'text/vcard' }); }
const saveBlob = (blob, name) => { const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };

// One decoded code, turned into a title, a plain-language line and 1-2 actions.
function resultCard(raw, where) {
  const r = interpret(raw);
  let title, line, actions = [copyBtn(raw, 'Copiar texto')];
  if (r.kind === 'url') { title = 'Link'; line = r.href; actions.unshift(h('a', { class: 'btn sm', href: r.href, target: '_blank', rel: 'noopener noreferrer' }, icon('link'), 'Abrir link')); }
  else if (r.kind === 'wifi') { title = `Wi-Fi: ${r.ssid || '(sem nome)'}`; line = `${SEC_NAME[r.security] || r.security}${r.hidden ? ' · rede oculta' : ''}`; if (r.password) actions.unshift(copyBtn(r.password, 'Copiar palavra-passe')); }
  else if (r.kind === 'vcard') { title = r.name || 'Contacto'; line = [r.org, ...r.phones, ...r.emails].filter(Boolean).join(' · '); actions.unshift(h('button', { class: 'btn sm', onclick: () => saveBlob(vcardFile(r.raw), `${(r.name || 'contacto').replace(/[^\w-]+/g, '_')}.vcf`) }, icon('download'), 'Guardar contacto')); }
  else if (r.kind === 'event') { title = r.title || 'Evento'; line = [r.start, r.place].filter(Boolean).join(' · '); actions.unshift(h('button', { class: 'btn sm', onclick: () => saveBlob(new Blob([r.raw], { type: 'text/calendar' }), `${(r.title || 'evento').replace(/[^\w-]+/g, '_')}.ics`) }, icon('calendar'), 'Adicionar ao calendário')); }
  else if (r.kind === 'email') { title = 'Email'; line = r.address + (r.subject ? ` · ${r.subject}` : ''); actions.unshift(h('a', { class: 'btn sm', href: r.href }, icon('at-sign'), 'Escrever email')); }
  else if (r.kind === 'tel') { title = 'Chamada'; line = r.number; actions.unshift(h('a', { class: 'btn sm', href: r.href }, icon('phone'), 'Ligar')); }
  else if (r.kind === 'sms') { title = 'Mensagem'; line = [r.number, r.body].filter(Boolean).join(' · '); actions.unshift(h('a', { class: 'btn sm', href: r.href }, icon('mail'), 'Abrir mensagens')); }
  else if (r.kind === 'geo') { title = 'Localização'; line = `${r.lat}, ${r.lng}`; actions.unshift(h('a', { class: 'btn sm', href: r.href, target: '_blank', rel: 'noopener noreferrer' }, icon('map-pin'), 'Abrir no mapa')); }
  else { title = 'Texto'; line = raw.length > 160 ? `${raw.slice(0, 160)}…` : raw; }
  return h('article', { class: 'card qr-found' }, h('span', { class: 'oi' }, icon(KIND_ICON[r.kind] || 'qr-code')),
    h('div', { class: 'grow' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', {}, title), where ? h('span', { class: 'mut small' }, where) : null),
      h('p', { class: 'mut small', style: 'overflow-wrap:anywhere' }, line), h('div', { class: 'row', style: 'margin-top:8px' }, actions)));
}

// ---- camera ----
function CameraReader(ctx) {
  const video = h('video', { class: 'qr-cam', playsinline: true, muted: true, hidden: true });
  const results = h('div', { class: 'qr-results' });
  const status = h('p', { class: 'mut small' }, 'A câmara só lê quando a ligas; nada é enviado para fora do navegador.');
  const btn = h('button', { class: 'btn' }, icon('scan-line'), 'Ligar câmara');
  let stream = null, raf = 0, last = { code: '', at: 0 };
  const seen = new Set();
  ctx.cleanup(() => stop());

  function stop() { cancelAnimationFrame(raf); raf = 0; stream?.getTracks().forEach((t) => t.stop()); stream = null; video.hidden = true; btn.hidden = false; btn.disabled = false; btn.lastChild.textContent = 'Ligar câmara'; }
  async function loop() {
    if (!stream) return;
    if (video.readyState >= 2) {
      try { const codes = await detect(video); for (const c of codes) onFound(c); } catch { /* frame skipped */ }
    }
    raf = requestAnimationFrame(loop);
  }
  function onFound(code) {
    const now = Date.now();
    if (code === last.code && now - last.at < 2500) return; last = { code, at: now };
    if (navigator.vibrate) navigator.vibrate(60);
    if (!seen.has(code)) { seen.add(code); results.prepend(resultCard(code, new Date().toLocaleTimeString('pt-PT'))); status.hidden = true; }
  }
  btn.onclick = async () => {
    if (!navigator.mediaDevices?.getUserMedia) { toast('Este navegador não permite usar a câmara.', 'bad'); return; }
    btn.disabled = true; btn.lastChild.textContent = 'A ligar…';
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
      video.srcObject = stream; video.hidden = false; await video.play(); btn.hidden = true; loop();
    } catch { btn.disabled = false; btn.lastChild.textContent = 'Ligar câmara'; toast('Sem acesso à câmara. Autoriza-a nas definições do navegador.', 'bad'); }
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden && stream) stop(); });
  return h('div', { class: 'panel' }, h('h3', {}, 'Pela câmara'), h('div', { class: 'row' }, btn), video, status, results);
}

// ---- image file ----
function ImageReader() {
  const input = h('input', { type: 'file', accept: 'image/*', hidden: true });
  const results = h('div', { class: 'qr-results' });
  const stage = h('div', { class: 'pl-stage', style: 'min-height:160px' }, h('div', { class: 'pl-drop' }, icon('image', 'big'), h('strong', {}, 'Arrasta uma imagem'), h('span', { class: 'mut' }, 'uma foto do código, uma captura de ecrã…'), h('button', { class: 'btn soft sm', onclick: () => input.click() }, 'Escolher imagem…')));
  async function run(file) {
    fill(results, h('p', { class: 'mut' }, 'A ler…'));
    try { const codes = await detectImageFile(file); fill(results, codes.length ? codes.map((c) => resultCard(c, file.name)) : h('p', { class: 'msg warn' }, 'Não encontrei nenhum código QR nesta imagem.')); }
    catch (e) { fill(results, h('p', { class: 'msg bad' }, e.message)); }
  }
  input.onchange = () => { const f = input.files[0]; if (f) run(f); input.value = ''; };
  stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('drag'); });
  stage.addEventListener('dragleave', () => stage.classList.remove('drag'));
  stage.addEventListener('drop', (e) => { e.preventDefault(); stage.classList.remove('drag'); const f = e.dataTransfer.files[0]; if (f) run(f); });
  return h('div', { class: 'panel' }, h('h3', {}, 'De uma imagem'), stage, input, results);
}

// ---- PDF file ----
function PdfReader() {
  const input = h('input', { type: 'file', accept: 'application/pdf', hidden: true });
  const results = h('div', { class: 'qr-results' });
  const status = h('p', { class: 'mut small' });
  const btn = h('button', { class: 'btn soft sm', onclick: () => input.click() }, icon('upload'), 'Escolher PDF…');
  async function run(file) {
    fill(results); status.hidden = false; status.textContent = 'A abrir o PDF…';
    try {
      const found = await detectPdfFile(file, { onPage: (n, total) => { status.textContent = `A ler a página ${n} de ${total}…`; } });
      status.hidden = true;
      if (!found.length) { fill(results, h('p', { class: 'msg warn' }, 'Não encontrei nenhum código QR neste PDF.')); return; }
      fill(results, found.flatMap((f) => f.codes.map((c) => resultCard(c, `página ${f.page}`))), found.truncated ? h('p', { class: 'mut small' }, 'O PDF tem mais páginas do que as lidas (limite de 30).') : null);
    } catch (e) { status.hidden = true; fill(results, h('p', { class: 'msg bad' }, e.message)); }
  }
  input.onchange = () => { const f = input.files[0]; if (f) run(f); input.value = ''; };
  return h('div', { class: 'panel' }, h('h3', {}, 'De um PDF'), h('p', { class: 'mut small' }, 'Lê cada página à procura de um código QR (bilhetes, faturas, convites…). Até 30 páginas.'), h('div', { class: 'row' }, btn), input, status, results);
}

export function QrReaderPanel(ctx) {
  return h('div', { class: 'panel' }, h('h2', {}, 'Leitor de códigos QR'), h('p', {}, 'Lê um código QR pela câmara, de uma imagem ou de um PDF. Tudo acontece no teu navegador: nada é enviado nem guardado.'),
    CameraReader(ctx), h('hr', { style: 'border:0;border-top:1px solid var(--line)' }), ImageReader(), h('hr', { style: 'border:0;border-top:1px solid var(--line)' }), PdfReader());
}
