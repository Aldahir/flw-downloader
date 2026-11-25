import { h, icon, brand } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { fmtSize, fmtDur } from '../lib/format.js';
import { put } from '../lib/jobs-sync.js';
import { toast } from '../lib/toast.js';
import { store } from '../lib/store.js';

// "Vídeo encontrado": pick a quality (or audio only) and start the download.
export function openFound({ url, info, onPlaylist = null }) {
  const dlg = h('dialog', { 'aria-labelledby': 'found-title' }); document.body.append(dlg);
  const isList = !!info.playlist;
  const pref = store.settings; // account defaults: kind and maximum quality
  const choice = { v: '' }; // '' = best, 'audio', or a height
  const quals = isList ? [{ height: 720 }, { height: 480 }] : (info.qualities?.length ? info.qualities : (info.heights || []).map((height) => ({ height })));
  const rows = [
    { v: '', label: 'Melhor qualidade', sub: !isList && quals[0] ? `até ${quals[0].height}p` : '', size: isList ? 0 : quals[0]?.size, ic: 'play' },
    ...quals.map((q) => ({ v: String(q.height), label: isList ? `Até ${q.height}p` : q.height >= 720 ? `Vídeo HD · ${q.height}p` : `Vídeo SD · ${q.height}p`, size: q.size, ic: 'film' })),
    { v: 'audio', label: 'Só áudio (MP3)', sub: 'Sem imagem', ic: 'captions' },
  ].filter((r, i, a) => i === 0 || r.v === 'audio' || a.findIndex((x) => x.v === r.v) === i);
  const want = pref?.defaultKind === 'audio' ? 'audio' : pref?.defaultHeight ? String((rows.map((r) => Number(r.v)).filter((x) => x && x <= pref.defaultHeight).sort((a, b) => b - a)[0]) || '') : '';
  if (rows.some((r) => r.v === want)) choice.v = want;
  const limit = h('input', { class: 'input', type: 'number', min: 1, max: 100, value: Math.min(100, info.playlist?.count || 1), style: 'width:96px', 'aria-label': 'Quantos vídeos descarregar' });
  const err = h('p', { class: 'msg bad', role: 'alert', hidden: true });
  const go = h('button', { class: 'btn' }, icon('download'), 'Descarregar');
  const close = () => { dlg.close(); dlg.remove(); };

  const optEls = rows.map((r, i) => h('label', { class: 'opt' },
    h('span', { class: 'oi' }, icon(r.ic)), h('span', {}, h('b', {}, r.label), r.sub ? h('div', { class: 'mut small' }, r.sub) : null),
    h('span', { class: 'mut small' }, r.size ? `≈ ${fmtSize(r.size)}` : ''), h('input', { type: 'radio', name: 'q', value: r.v, checked: r.v === choice.v, onchange: () => { choice.v = r.v; } })));

  go.onclick = async () => {
    go.disabled = true; err.hidden = true;
    try {
      const body = { url, kind: choice.v === 'audio' ? 'audio' : 'video', height: choice.v && choice.v !== 'audio' ? choice.v : '', playlist: isList, title: isList ? info.playlist.title : info.title, limit: limit.value };
      const { id } = await api('/api/download', { body });
      const j = await api(`/api/jobs/${id}`); put(j);
      toast('Download adicionado. Podes acompanhar o progresso aqui em baixo.'); close();
    } catch (e) {
      err.replaceChildren(e.message, e.upgrade ? h('a', { href: '#/conta/subscricao', onclick: close, style: 'margin-left:6px;font-weight:700' }, 'Ver planos Pro →') : null);
      err.hidden = false; go.disabled = false;
    }
  };

  const head = isList
    ? h('div', { class: 'found' }, h('div', { class: 'pic' }, icon('film')), h('div', {}, h('h3', {}, info.playlist.title || 'Playlist'), h('div', { class: 'mut small' }, `${info.playlist.count} vídeos${info.playlist.capped ? ' (máximo de 100 por trabalho)' : ''}`),
      h('label', { class: 'row small', style: 'margin-top:8px' }, 'Primeiros', limit, 'vídeos')))
    : h('div', { class: 'found' }, info.thumbnail ? Object.assign(new Image(), { src: info.thumbnail, alt: '', className: 'pic', referrerPolicy: 'no-referrer' }) : h('div', { class: 'pic' }, icon('film')),
      h('div', {}, h('h3', {}, info.title), h('div', { class: 'mut small' }, [info.uploader, info.duration && fmtDur(info.duration)].filter(Boolean).join(' · '))));

  dlg.append(h('div', { class: 'sheet' },
    h('div', { class: 'sheet-head' }, h('h2', { id: 'found-title' }, isList ? 'Playlist encontrada' : 'Vídeo encontrado'), h('button', { class: 'icon-btn dark', 'aria-label': 'Fechar', onclick: close }, icon('x'))),
    head, onPlaylist ? h('button', { class: 'btn soft sm', onclick: () => { close(); onPlaylist(); } }, icon('layout-grid'), 'Este link também tem uma playlist: ver') : null,
    h('div', { class: 'opts', role: 'radiogroup', 'aria-label': 'Qualidade' }, optEls), err,
    h('div', { class: 'sheet-actions' }, h('button', { class: 'btn line', onclick: close }, 'Cancelar'), go)));
  dlg.addEventListener('cancel', () => setTimeout(() => dlg.remove(), 0));
  dlg.showModal();
  return dlg;
}
