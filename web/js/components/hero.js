import { h, icon, brand } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { openFound } from './found-dialog.js';

const TILES = [['youtube', '6%', '18%', '0s'], ['instagram', '58%', '0%', '.6s'], ['tiktok', '70%', '46%', '1.2s'], ['facebook', '10%', '58%', '1.8s'], ['vimeo', '44%', '70%', '2.4s']];

export function Hero() {
  const input = h('input', { type: 'url', id: 'link', placeholder: 'Cola o link aqui…', 'aria-label': 'Link do vídeo ou da playlist', autocomplete: 'off', inputmode: 'url', spellcheck: 'false' });
  const btn = h('button', { class: 'btn', type: 'submit' }, icon('download'), 'Analisar');
  const err = h('p', { class: 'msg bad', role: 'alert', hidden: true, style: 'margin-top:12px' });
  let playlist = false;
  async function analyse() {
    err.hidden = true; const url = input.value.trim();
    if (!url) { err.textContent = 'Cola primeiro o endereço do vídeo.'; err.hidden = false; input.focus(); return; }
    btn.disabled = true; btn.lastChild.textContent = 'A analisar…';
    try {
      const info = await api('/api/info', { body: { url, playlist } });
      const more = info.looksLikePlaylist && !playlist && !info.playlist; // the link also points to a playlist
      playlist = false;
      openFound({ url, info, onPlaylist: more ? () => { playlist = true; analyse(); } : null });
    } catch (e) { err.textContent = e.message; err.hidden = false; playlist = false; }
    btn.disabled = false; btn.lastChild.textContent = 'Analisar';
  }
  const art = h('div', { class: 'hero-art', 'aria-hidden': 'true' }, h('span', { class: 'blob b1' }), h('span', { class: 'blob b2' }), h('span', { class: 'blob b3' }),
    TILES.map(([id, l, t, d]) => h('span', { class: 'tile', style: `left:${l};top:${t};animation-delay:${d}` }, brand(id, ''))));
  return h('section', { class: 'hero' }, h('div', { class: 'wrap' },
    h('div', {},
      h('p', { class: 'eyebrow' }, 'Rápido, local e sem anúncios'),
      h('h1', {}, 'Descarrega de ', h('span', { class: 'hl' }, 'múltiplas'), ' fontes'),
      h('p', { class: 'lead' }, 'Cola o link de um vídeo ou playlist do YouTube, Instagram, TikTok, Facebook, X, Vimeo e muitos outros sites. Escolhes a qualidade e ele trata do resto.'),
      h('form', { class: 'paste', onsubmit: (e) => { e.preventDefault(); analyse(); } }, icon('link'), input, btn),
      err,
      h('p', { class: 'alt mut' }, 'Já tens o ficheiro? ', h('a', { href: '#/ferramentas/leitor' }, 'Abre-o no leitor'), ' (qualquer formato, sem enviar nada) ou ', h('a', { href: '#/ferramentas/qr' }, 'cria um código QR'), '.')),
    art));
}
