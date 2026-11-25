import { h, icon, fill } from '../lib/dom.js';
import { jobList } from '../lib/store.js';
import { mediaOf, fmtSize, isActive } from '../lib/format.js';
import { toast } from '../lib/toast.js';

// Video player with codec support. The file never leaves this browser: it plays from a local object URL, and when
// the browser can't decode it, FFmpeg (WebAssembly) converts it here, in this tab. Nothing is uploaded or stored.
const BIG = 1.5e9; // WebAssembly memory is limited; warn before trying
const CODEC_NAMES = { h264: 'H.264', hevc: 'H.265 (HEVC)', av1: 'AV1', vp9: 'VP9', vp8: 'VP8', mpeg4: 'MPEG-4', mpeg2video: 'MPEG-2', wmv3: 'WMV', prores: 'ProRes', aac: 'AAC', mp3: 'MP3', ac3: 'AC-3', eac3: 'E-AC-3', dts: 'DTS', opus: 'Opus', vorbis: 'Vorbis', flac: 'FLAC', pcm_s16le: 'PCM', wmav2: 'WMA', truehd: 'TrueHD' };
const nice = (c) => CODEC_NAMES[c] || (c ? c.toUpperCase() : '');
const safeExt = (name) => { const m = /\.([a-z0-9]{1,5})$/i.exec(name); return m ? m[1].toLowerCase() : 'bin'; };

export function PlayerPanel(ctx) {
  let ff = null, objectUrls = [], token = 0;
  const own = (blobOrFile) => { const u = URL.createObjectURL(blobOrFile); objectUrls.push(u); return u; };
  ctx.cleanup(() => { token++; objectUrls.forEach((u) => URL.revokeObjectURL(u)); if (ff) { try { ff.terminate(); } catch { /* already gone */ } ff = null; } });

  const stage = h('div', { class: 'pl-stage' }); const status = h('div', { class: 'pl-status' }); const tools = h('div', { class: 'row' });
  const video = h('video', { class: 'pl-video', controls: true, playsinline: true, preload: 'metadata' }); video.hidden = true;
  let source = null; // { name, size, getBlob(): Promise<Blob>, url }

  const empty = () => fill(stage, h('div', { class: 'pl-drop' }, icon('play', 'big'), h('strong', {}, 'Arrasta um vídeo para aqui'), h('span', { class: 'mut' }, 'ou escolhe um ficheiro. Abre mesmo formatos que o navegador não conhece.'), h('div', { class: 'row', style: 'justify-content:center' }, pick, fromHistory.wrap)));
  const input = h('input', { type: 'file', accept: 'video/*,audio/*,.mkv,.avi,.flv,.ts,.mov,.wmv,.mts,.m2ts,.3gp,.ogv,.hevc,.h265', hidden: true, onchange: () => { const f = input.files[0]; if (f) open({ name: f.name, size: f.size, url: own(f), getBlob: async () => f }); input.value = ''; } });
  const pick = h('button', { class: 'btn', onclick: () => input.click() }, icon('folder-open'), 'Escolher ficheiro…');

  // ---- from the history (files that are already on this computer) ----
  const fromHistory = (() => {
    const files = jobList().filter((j) => !isActive(j)).flatMap((j) => mediaOf(j).map((f) => ({ ...f, job: j.title || j.id })));
    const sel = h('select', { class: 'input', 'aria-label': 'Abrir do histórico', style: 'min-width:220px;max-width:340px', onchange: () => { const f = files[Number(sel.value)]; if (f) open({ name: f.name, size: f.size, url: f.url, getBlob: async () => (await fetch(f.url)).blob() }); } },
      h('option', { value: '' }, 'Abrir do histórico…'), files.map((f, i) => h('option', { value: i }, `${f.job} · ${fmtSize(f.size)}`)));
    return { wrap: files.length ? sel : null };
  })();

  // ---- play ----
  function open(src) {
    token++; if (ff) { try { ff.terminate(); } catch { /* ignore */ } ff = null; }
    source = src; video.hidden = true; video.removeAttribute('src'); video.load(); fill(tools); fill(status, h('p', { class: 'mut' }, 'A abrir…'));
    fill(stage, h('div', { class: 'pl-head' }, h('strong', {}, src.name), h('button', { class: 'btn soft sm', onclick: () => { token++; video.pause(); video.hidden = true; source = null; fill(status); fill(tools); empty(); } }, 'Fechar')), video);
    const my = token; let settled = false;
    const fail = (why) => { if (settled || my !== token) return; settled = true; video.hidden = true; offerConvert(why); };
    video.onerror = () => fail('error');
    video.onloadedmetadata = () => {
      if (my !== token) return;
      const wantsVideo = !/\.(mp3|m4a|aac|wav|flac|ogg|oga|opus)$/i.test(src.name);
      if (wantsVideo && video.videoWidth === 0) return fail('novideo'); // sound plays but the picture can't be decoded
      settled = true; video.hidden = false; fill(status, h('p', { class: 'msg ok' }, 'A reproduzir com o teu navegador, sem converter.')); video.play().catch(() => {});
    };
    video.src = src.url;
  }

  // ---- codecs: convert in the browser ----
  function offerConvert(why) {
    const big = source.size > BIG;
    fill(status, h('div', { class: 'msg warn' }, h('strong', {}, 'O teu navegador não consegue reproduzir este formato. '),
      why === 'novideo' ? 'O som funciona, mas o vídeo usa um codec que ele não conhece. ' : 'O contentor ou o codec não é suportado. ',
      'Posso converter aqui mesmo, no navegador (descarrega o codec FFmpeg uma vez, cerca de 31 MB). O ficheiro não sai do teu computador.',
      big ? h('div', { style: 'margin-top:6px' }, `Este ficheiro é grande (${fmtSize(source.size)}): a conversão no navegador pode falhar por falta de memória. Se acontecer, converte-o com o FFmpeg instalado no computador.`) : null));
    fill(tools, h('button', { class: 'btn', onclick: convert }, icon('play'), 'Converter e reproduzir'));
  }

  async function engine(my) {
    if (ff) return ff;
    const { FFmpeg } = await import('/vendor/ffmpeg/index.js');
    const f = new FFmpeg();
    await f.load({ coreURL: '/vendor/ffmpeg-core/ffmpeg-core.js', wasmURL: '/vendor/ffmpeg-core/ffmpeg-core.wasm' });
    if (my !== token) { f.terminate(); throw new Error('cancelled'); }
    return (ff = f);
  }

  async function convert() {
    const my = token; const bar = h('div', { class: 'bar indeterminate', role: 'progressbar', 'aria-label': 'Conversão' }, h('i', { style: 'width:0%' })); const label = h('span', { class: 'mut' }, 'A preparar o codec…');
    fill(tools, h('button', { class: 'btn line', onclick: () => { token++; if (ff) { try { ff.terminate(); } catch { /* ignore */ } ff = null; } offerConvert('error'); } }, 'Cancelar'));
    fill(status, h('div', { class: 'pl-progress' }, label, bar));
    try {
      const f = await engine(my); const logs = [];
      f.on('log', ({ message }) => logs.push(message));
      f.on('progress', ({ progress }) => { if (my !== token || !(progress > 0)) return; bar.classList.remove('indeterminate'); bar.firstChild.style.width = `${Math.min(100, Math.round(progress * 100))}%`; label.textContent = `A converter… ${Math.min(100, Math.round(progress * 100))}%`; });
      label.textContent = 'A ler o ficheiro…';
      const blob = await source.getBlob(); const inName = `in.${safeExt(source.name)}`;
      await f.writeFile(inName, new Uint8Array(await blob.arrayBuffer()));
      await f.exec(['-i', inName, '-t', '0.1', '-f', 'null', '-']).catch(() => {}); // only to learn the streams from the log
      const text = logs.join('\n'); const vc = /Video: (\w+)/.exec(text)?.[1], ac = /Audio: (\w+)/.exec(text)?.[1];
      const hasVideo = !!vc && !/Video: (mjpeg|png)\b.*attached/i.test(text);
      fill(status, h('div', { class: 'pl-progress' }, h('p', {}, [hasVideo && `Vídeo: ${nice(vc)}`, ac && `Áudio: ${nice(ac)}`].filter(Boolean).join(' · ') || 'A converter…'), label, bar));
      label.textContent = 'A converter…';
      let out, mime, args;
      if (hasVideo) {
        out = 'out.mp4'; mime = 'video/mp4';
        // H.264 already plays everywhere: only the sound needs converting, which is much faster.
        const v = vc === 'h264' ? ['-c:v', 'copy'] : ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26', '-pix_fmt', 'yuv420p'];
        args = ['-i', inName, '-map', '0:v:0', '-map', '0:a:0?', ...v, '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out];
      } else { out = 'out.m4a'; mime = 'audio/mp4'; args = ['-i', inName, '-vn', '-c:a', 'aac', '-b:a', '192k', out]; }
      const code = await f.exec(args);
      if (my !== token) return;
      if (code !== 0) throw new Error('A conversão falhou. O ficheiro pode estar danificado ou ser demasiado grande para o navegador.');
      const data = await f.readFile(out); await f.deleteFile(inName).catch(() => {}); await f.deleteFile(out).catch(() => {});
      const done = new Blob([data], { type: mime }); const url = own(done);
      video.onloadedmetadata = null; video.onerror = () => { fill(status, h('p', { class: 'msg bad' }, 'Mesmo depois de convertido, o navegador não reproduz este ficheiro.')); };
      video.src = url; video.hidden = false; video.play().catch(() => {});
      fill(status, h('p', { class: 'msg ok' }, `Convertido no navegador${vc ? ` (${nice(vc)} → ${out.endsWith('mp4') ? 'MP4' : 'M4A'})` : ''}. Continua tudo no teu computador.`));
      const base = source.name.replace(/\.[^.]+$/, '');
      fill(tools, h('a', { class: 'btn soft', href: url, download: `${base}.${out.split('.')[1]}` }, icon('download'), 'Guardar versão compatível'));
    } catch (e) {
      if (my !== token) return;
      const m = String(e?.message || e);
      fill(status, h('p', { class: 'msg bad', role: 'alert' }, /memory|abort|out of bounds|Aborted/i.test(m) ? 'Faltou memória ao navegador para converter este ficheiro. Experimenta um ficheiro mais pequeno.' : `Não consegui converter: ${m}`));
      fill(tools, h('button', { class: 'btn', onclick: convert }, 'Tentar de novo'));
      if (ff) { try { ff.terminate(); } catch { /* ignore */ } ff = null; }
    }
  }

  // drag and drop
  const over = (e) => { e.preventDefault(); stage.classList.add('drag'); };
  stage.addEventListener('dragover', over); stage.addEventListener('dragleave', () => stage.classList.remove('drag'));
  stage.addEventListener('drop', (e) => { e.preventDefault(); stage.classList.remove('drag'); const f = e.dataTransfer.files[0]; if (f) open({ name: f.name, size: f.size, url: own(f), getBlob: async () => f }); else toast('Arrasta um ficheiro do teu computador.', 'bad'); });

  empty();
  return h('div', { class: 'panel' }, h('h2', {}, 'Leitor de vídeo'), h('p', {}, 'Reproduz vídeos e áudios de qualquer formato. O ficheiro e os codecs ficam no teu navegador: nada é enviado nem guardado no servidor.'),
    h('div', { class: 'card pl-card' }, stage, status, tools, input));
}
