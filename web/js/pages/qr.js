import { h, icon, fill } from '../lib/dom.js';
import { toast } from '../lib/toast.js';
import { api } from '../lib/api.js';
import { store } from '../lib/store.js';
import { TYPES, typeById, FieldError } from '../lib/qr-payloads.js';
import { buildSvg, readabilityWarning } from '../lib/qr-render.js';
import { matrixFor, rasterise, save, shrinkLogo } from '../lib/qr-client.js';
import { loadJSZip } from '../lib/qr-decode.js';
import { validateBatch, buildList, csvManifest, MAX_BATCH, BatchError } from '../lib/qr-batch.js';

export function QrPanel() {
  const S = { mode: 'single', type: 'url', values: {}, d: { shape: 'square', fg: '#111827', bg: '#ffffff', frame: 'none', label: 'ESCANEIA-ME', ecc: 'M', margin: 3, logo: '', size: 1024 } };
  const preview = h('div', { class: 'qr-preview', 'aria-live': 'polite' }); const note = h('p', { class: 'msg', role: 'status', hidden: true });
  const dl = { png: h('button', { class: 'btn', disabled: true }, icon('download'), 'Descarregar PNG'), svg: h('button', { class: 'btn line', disabled: true }, 'SVG'), copy: h('button', { class: 'btn soft', disabled: true }, icon('copy'), 'Copiar') };
  let current = null, seq = 0, timer = 0;

  async function render() {
    const my = ++seq; const t = typeById(S.type); const values = S.values[S.type] || {};
    let text = '';
    try { text = t.build(values); } catch (e) {
      if (!(e instanceof FieldError)) throw e;
      current = null; Object.values(dl).forEach((b) => { b.disabled = true; }); syncDyn();
      const empty = !Object.values(values).some((v) => String(v ?? '').trim());
      fill(preview, h('div', { class: 'qr-empty' }, icon('qr-code'), h('span', {}, empty ? 'O teu código aparece aqui.' : '')));
      note.textContent = empty ? '' : e.message; note.className = 'msg warn'; note.hidden = empty; return;
    }
    try {
      const ecc = S.d.logo ? 'H' : S.d.ecc;
      const m = await matrixFor(text, ecc); if (my !== seq) return;
      const out = buildSvg(m, { ...S.d }); current = { ...out, name: `qr-${S.type}` };
      const img = h('img', { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(out.svg)}`, alt: `Código QR: ${t.label}`, width: out.width, height: out.height });
      fill(preview, img); Object.values(dl).forEach((b) => { b.disabled = false; }); syncDyn();
      const warn = readabilityWarning(S.d.fg, S.d.bg); note.textContent = warn; note.className = 'msg warn'; note.hidden = !warn;
    } catch (e) {
      current = null; Object.values(dl).forEach((b) => { b.disabled = true; });
      note.textContent = /overflow/i.test(e.message) ? 'Há demasiada informação para um código QR. Escreve menos ou baixa a correção de erros.' : e.message; note.className = 'msg bad'; note.hidden = false;
    }
  }
  // Static codes hold the link itself. A dynamic one holds a short link we can redirect and count (needs an account).
  const dynBtn = h('button', { class: 'btn soft', hidden: true, onclick: async () => {
    const t = typeById(S.type); const title = prompt('Nome para reconheceres este código nas leituras:', t.label); if (!title) return;
    try { const target = t.build(S.values[S.type] || {}); await api('/api/me/qr', { body: { title, target, type: S.type, design: { ...S.d } } }); toast('Código dinâmico criado. Vê as leituras no teu perfil.'); location.hash = '#/conta/qr'; }
    catch (e) { toast(e.message, 'bad'); } } }, icon('layout-grid'), 'Tornar dinâmico (com leituras)');
  const syncDyn = () => { dynBtn.hidden = !(store.user && ['url', 'media'].includes(S.type) && current); };
  const later = () => { clearTimeout(timer); timer = setTimeout(render, 120); };
  dl.png.onclick = async () => { try { const k = S.d.size / current.width; save(await rasterise(current.svg, S.d.size, Math.round(current.height * k)), `${current.name}.png`); } catch (e) { toast(e.message, 'bad'); } };
  dl.svg.onclick = () => save(new Blob([current.svg], { type: 'image/svg+xml' }), `${current.name}.svg`);
  dl.copy.onclick = async () => { try { const k = 1024 / current.width; await navigator.clipboard.write([new ClipboardItem({ 'image/png': rasterise(current.svg, 1024, Math.round(current.height * k)) })]); toast('Imagem copiada.'); } catch { toast('O teu navegador não deixou copiar. Descarrega o PNG.', 'bad'); } };

  // ---- step 1: content ----
  const form = h('div', { class: 'qr-form' });
  const typeBar = h('div', { class: 'qr-types', role: 'radiogroup', 'aria-label': 'Tipo de código' });
  function drawTypes() {
    fill(typeBar, TYPES.map((t) => h('button', { class: 'qr-type', role: 'radio', 'aria-checked': String(S.type === t.id), title: t.hint, onclick: () => { S.type = t.id; drawTypes(); drawForm(); later(); } }, icon(t.icon), h('span', {}, t.label))));
  }
  function drawForm() {
    const t = typeById(S.type); const v = (S.values[S.type] ||= t.fields.some((f) => f.k === 'sec') ? { sec: 'WPA' } : {});
    const rows = t.fields.filter((f) => !f.showIf || f.showIf(v)).map((f) => {
      const id = `qf-${S.type}-${f.k}`, set = (val) => { v[f.k] = val; later(); };
      if (f.type === 'check') return h('label', { class: 'chk', for: id }, h('input', { id, type: 'checkbox', checked: !!v[f.k], onchange: (e) => set(e.target.checked) }), f.label);
      let input;
      if (f.type === 'area') {
        const count = h('span', { class: 'mut small', 'aria-live': 'off' }, f.max ? `${(v[f.k] || '').length}/${f.max}` : '');
        input = h('textarea', { class: 'input', id, rows: 4, style: 'min-height:110px;padding-top:12px', value: v[f.k] || '', oninput: (e) => { set(e.target.value); if (f.max) { count.textContent = `${e.target.value.length}/${f.max}`; count.className = e.target.value.length > f.max ? 'bad small' : 'mut small'; } } });
        return h('div', { class: 'field' }, h('span', { class: 'row', style: 'justify-content:space-between;width:100%' }, h('label', { for: id, style: 'font-weight:600;font-size:.875rem' }, f.label), count), input);
      }
      if (f.type === 'select') input = h('select', { class: 'input', id, onchange: (e) => { set(e.target.value); drawForm(); } }, f.options.map(([val, l]) => h('option', { value: val, selected: (v[f.k] || f.options[0][0]) === val }, l)));
      else input = h('input', { class: 'input', id, type: f.type, placeholder: f.ph || '', value: v[f.k] || '', autocomplete: 'off', oninput: (e) => set(e.target.value) });
      return h('div', { class: 'field' }, h('label', { for: id, style: 'font-weight:600;font-size:.875rem' }, f.label, f.req ? h('span', { class: 'mut' }, ' *') : null), input);
    });
    fill(form, h('p', { class: 'mut small' }, t.hint), h('div', { class: t.fields.length > 4 ? 'qr-grid' : '' }, rows));
  }

  // ---- step 2: design ----
  const design = h('div', { class: 'qr-design' });
  function drawDesign() {
    const d = S.d;
    const seg = (key, opts) => h('div', { class: 'seg', role: 'radiogroup' }, opts.map(([val, l]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(d[key] === val), onclick: () => { d[key] = val; drawDesign(); later(); } }, l)));
    const color = (key, label) => h('label', { class: 'colour' }, h('input', { type: 'color', value: d[key], 'aria-label': label, oninput: (e) => { d[key] = e.target.value; later(); } }), h('span', {}, label));
    const logoIn = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true, onchange: async (e) => { const f = e.target.files[0]; if (!f) return; try { d.logo = await shrinkLogo(f); drawDesign(); later(); } catch (er) { toast(er.message, 'bad'); } e.target.value = ''; } });
    fill(design,
      h('div', { class: 'field' }, h('span', {}, 'Forma'), seg('shape', [['square', 'Quadrada'], ['rounded', 'Arredondada'], ['dots', 'Pontos']])),
      h('div', { class: 'row' }, color('fg', 'Cor do código'), color('bg', 'Cor do fundo')),
      h('div', { class: 'field' }, h('span', {}, 'Moldura'), seg('frame', [['none', 'Sem moldura'], ['box', 'Caixa'], ['label', 'Com texto']])),
      d.frame === 'label' ? h('label', { class: 'field' }, h('span', {}, 'Texto da moldura'), h('input', { class: 'input', maxlength: 24, value: d.label, oninput: (e) => { d.label = e.target.value; later(); } })) : null,
      h('div', { class: 'field' }, h('span', {}, 'Logótipo no centro (fica só neste navegador)'),
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn soft sm', onclick: () => logoIn.click() }, icon('image'), d.logo ? 'Trocar imagem' : 'Escolher imagem'), d.logo ? h('button', { type: 'button', class: 'btn danger sm', onclick: () => { d.logo = ''; drawDesign(); later(); } }, 'Remover') : null, logoIn)),
      h('div', { class: 'row' },
        h('label', { class: 'field', style: 'flex:1 1 160px' }, h('span', {}, 'Correção de erros'), h('select', { class: 'input', disabled: !!d.logo, onchange: (e) => { d.ecc = e.target.value; later(); } }, [['L', 'Baixa (7%)'], ['M', 'Média (15%)'], ['Q', 'Alta (25%)'], ['H', 'Máxima (30%)']].map(([val, l]) => h('option', { value: val, selected: (d.logo ? 'H' : d.ecc) === val }, l)))),
        h('label', { class: 'field', style: 'flex:1 1 160px' }, h('span', {}, 'Tamanho do PNG'), h('select', { class: 'input', onchange: (e) => { d.size = Number(e.target.value); } }, [512, 1024, 2048, 4096].map((px) => h('option', { value: px, selected: d.size === px }, `${px} px`))))),
      d.logo ? h('p', { class: 'mut small' }, 'Com logótipo, a correção de erros sobe para o máximo, para o código continuar a ser lido.') : null);
  }

  // ---- batch mode: many sequential codes (e.g. tickets), downloaded as a ZIP ----
  const B = { template: '', start: 1, end: 100, digits: '', items: null };
  const bErr = h('p', { class: 'msg bad', role: 'alert', hidden: true });
  const bGrid = h('div', { class: 'qr-batch-grid' });
  const bStatus = h('p', { class: 'mut small', role: 'status' });
  const bBar = h('div', { class: 'bar', hidden: true }, h('i', { style: 'width:0%' }));
  const bCsv = h('input', { type: 'checkbox', checked: true });
  const bZip = { png: h('button', { class: 'btn', disabled: true }, icon('download'), 'ZIP de PNG'), svg: h('button', { class: 'btn line', disabled: true }, 'ZIP de SVG') };
  let bToken = 0;

  function batchForm() {
    const tpl = h('input', { class: 'input', placeholder: 'https://exemplo.com/bilhete/{n}', value: B.template, oninput: (e) => { B.template = e.target.value; } });
    const start = h('input', { class: 'input', type: 'number', value: B.start, min: 0 });
    const end = h('input', { class: 'input', type: 'number', value: B.end, min: 0 });
    const digits = h('input', { class: 'input', type: 'number', placeholder: 'auto', value: B.digits, min: 1, max: 10 });
    const gen = h('button', { class: 'btn', onclick: async () => {
      bErr.hidden = true; const b = ++bToken;
      let v; try { v = validateBatch({ template: tpl.value, start: start.value, end: end.value, digits: digits.value }); }
      catch (e) { if (!(e instanceof BatchError)) throw e; bErr.textContent = e.message; bErr.hidden = false; return; }
      B.template = v.template; B.start = v.start; B.end = v.end; B.digits = v.digits;
      await generateBatch(v, b);
    } }, icon('qr-code'), 'Gerar lote');
    return h('div', { class: 'qr-form' },
      h('p', { class: 'mut small' }, 'Cria vários códigos de uma vez a partir de um modelo com {n}: cada código recebe o seu número de sequência (ex.: bilhetes, senhas, etiquetas).'),
      h('label', { class: 'field' }, h('span', {}, 'Modelo (usa {n} onde entra o número)'), tpl),
      h('div', { class: 'row' }, h('label', { class: 'field', style: 'flex:1 1 100px' }, h('span', {}, 'De'), start), h('label', { class: 'field', style: 'flex:1 1 100px' }, h('span', {}, 'Até'), end), h('label', { class: 'field', style: 'flex:1 1 100px' }, h('span', {}, 'Dígitos'), digits)),
      h('p', { class: 'mut small' }, `Máximo ${MAX_BATCH} códigos por lote.`), bErr, gen);
  }

  async function generateBatch(v, token) {
    const list = buildList(v); B.items = null; bZip.png.disabled = bZip.svg.disabled = true;
    fill(bGrid); bBar.hidden = false; bBar.firstChild.style.width = '0%'; bStatus.textContent = `A gerar 0/${list.length}…`;
    const out = [];
    for (let i = 0; i < list.length; i++) {
      if (token !== bToken) return;
      const item = list[i];
      try { const m = await matrixFor(item.text, S.d.logo ? 'H' : S.d.ecc); const svgOut = buildSvg(m, { ...S.d }); out.push({ ...item, ...svgOut }); }
      catch (e) { bBar.hidden = true; bErr.textContent = /overflow/i.test(e.message) ? `O código ${item.padded} ficou com demasiada informação. Encurta o modelo.` : e.message; bErr.hidden = false; return; }
      if (i % 10 === 0 || i === list.length - 1) { bStatus.textContent = `A gerar ${i + 1}/${list.length}…`; bBar.firstChild.style.width = `${Math.round(((i + 1) / list.length) * 100)}%`; await new Promise((r) => setTimeout(r, 0)); }
    }
    if (token !== bToken) return;
    B.items = out; bBar.hidden = true; bStatus.textContent = '';
    const first = out[0];
    fill(bGrid, first ? h('div', { class: 'bthumb' }, h('img', { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(first.svg)}`, alt: first.padded, width: 96, height: 96 }), h('span', {}, first.padded)) : null,
      h('p', { class: 'mut' }, `${out.length} código(s) prontos para descarregar, de ${out[0]?.padded} a ${out[out.length - 1]?.padded}.`));
    bZip.png.disabled = bZip.svg.disabled = false;
  }

  async function downloadZip(kind) {
    if (!B.items) return;
    const JSZip = await loadJSZip(); const zip = new JSZip();
    bBar.hidden = false; bBar.firstChild.style.width = '0%'; bStatus.textContent = `A preparar o ZIP (${kind.toUpperCase()})… 0/${B.items.length}`;
    for (let i = 0; i < B.items.length; i++) {
      const it = B.items[i];
      if (kind === 'svg') zip.file(`${it.padded}.svg`, it.svg);
      else { const k = S.d.size / it.width; zip.file(`${it.padded}.png`, await rasterise(it.svg, S.d.size, Math.round(it.height * k))); }
      if (i % 10 === 0 || i === B.items.length - 1) { bStatus.textContent = `A preparar o ZIP (${kind.toUpperCase()})… ${i + 1}/${B.items.length}`; bBar.firstChild.style.width = `${Math.round(((i + 1) / B.items.length) * 100)}%`; await new Promise((r) => setTimeout(r, 0)); }
    }
    if (bCsv.checked) zip.file('lote.csv', csvManifest(B.items));
    const blob = await zip.generateAsync({ type: 'blob' });
    bBar.hidden = true; bStatus.textContent = `${B.items.length} código(s) prontos.`;
    save(blob, `qr-lote-${B.start}-${B.end}.zip`);
  }
  bZip.png.onclick = () => downloadZip('png').catch((e) => toast(e.message, 'bad'));
  bZip.svg.onclick = () => downloadZip('svg').catch((e) => toast(e.message, 'bad'));

  drawTypes(); drawForm(); drawDesign(); render();
  const step = (n, title, ...kids) => h('section', { class: 'card qr-step' }, h('h2', {}, h('span', { class: 'num' }, n), title), ...kids);
  const leftCol = h('div', { class: 'qr-left' }); const rightCol = h('aside', { class: 'qr-right' });
  function drawMode() {
    if (S.mode === 'single') {
      fill(leftCol, step('1', 'Conteúdo', typeBar, form), step('2', 'Design', design));
      fill(rightCol, h('div', { class: 'card qr-sticky' }, h('h2', {}, h('span', { class: 'num' }, '3'), 'Descarregar'), preview, note, h('div', { class: 'row', style: 'justify-content:center' }, dl.png, dl.svg, dl.copy), dynBtn,
        h('p', { class: 'mut small', style: 'text-align:center' }, 'Códigos estáticos: o conteúdo fica dentro da imagem e nunca expira. Os dinâmicos permitem mudar o destino e ver as leituras.')));
    } else {
      fill(leftCol, step('1', 'Conteúdo do lote', batchForm()), step('2', 'Design (aplica-se a todo o lote)', design));
      fill(rightCol, h('div', { class: 'card qr-sticky' }, h('h2', {}, h('span', { class: 'num' }, '3'), 'Pré-visualização e download'), bGrid, bBar, bStatus,
        h('label', { class: 'chk' }, bCsv, 'Incluir lote.csv (número e conteúdo de cada código)'),
        h('div', { class: 'row', style: 'justify-content:center' }, bZip.png, bZip.svg)));
    }
  }
  const modeBar = h('div', { class: 'tabs2', role: 'tablist', style: 'max-width:360px;margin-bottom:18px' },
    h('button', { type: 'button', role: 'tab', 'aria-selected': String(S.mode === 'single'), onclick: () => { S.mode = 'single'; modeBar.children[0].setAttribute('aria-selected', 'true'); modeBar.children[1].setAttribute('aria-selected', 'false'); drawMode(); } }, 'Um código'),
    h('button', { type: 'button', role: 'tab', 'aria-selected': String(S.mode === 'lote'), onclick: () => { S.mode = 'lote'; modeBar.children[0].setAttribute('aria-selected', 'false'); modeBar.children[1].setAttribute('aria-selected', 'true'); drawMode(); } }, 'Lote de códigos'));
  drawMode();
  return h('div', { class: 'panel' }, h('h2', {}, 'Códigos QR'), h('p', {}, 'Cria códigos QR de texto, links, Wi-Fi, contactos e mais, ou um lote de códigos em sequência. Tudo é feito no teu navegador: nada é guardado nem enviado. Precisas de gerar códigos a partir de outro programa? Usa a ', h('a', { href: '#/api' }, 'API'), '.'),
    modeBar, h('div', { class: 'qr-layout' }, leftCol, rightCol));
}
