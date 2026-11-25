import { h, fill } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { store, on } from '../lib/store.js';
import { put } from '../lib/jobs-sync.js';
import { toast } from '../lib/toast.js';
import { FilePicker } from './file-picker.js';

const o = { model: 'base', language: 'auto', style: 'classic', subtitles: 'transcript', translate: false, words: false };
// Transcription (Whisper), translation to English and styled captions. Lives in Tools, apart from the job history.
export function SubtitleTool(ctx) {
  const body = h('div', { class: 'panel' });
  const picker = FilePicker({ onChange: draw });
  const run = (path, extra) => async () => {
    const sel = picker.value(); if (!sel) return;
    try { await api(path, { body: { ...sel, ...extra } }); put(await api(`/api/jobs/${sel.id}`)); toast('Tarefa iniciada. O progresso aparece no histórico.'); } catch (e) { toast(e.message, 'bad'); }
  };
  function draw() {
    const sel = picker.value(); if (!sel) { fill(body, ); return; }
    const j = store.jobs.get(sel.id); const has = (b) => j.files.some((f) => f.name === `${b}.srt`); const hasWords = j.files.some((f) => f.name.endsWith('.words.srt'));
    const select = (key, opts) => h('select', { class: 'input', 'aria-label': key, onchange: (e) => { o[key] = e.target.value; } }, opts.map(([v, l, dis]) => h('option', { value: v, selected: o[key] === v, disabled: !!dis }, l)));
    const chk = (key, t) => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!o[key], onchange: (e) => { o[key] = e.target.checked; } }), t);
    if (!store.models.find((m) => m.name === o.model && m.installed)) o.model = store.models.find((m) => m.installed)?.name || o.model;
    if (!has(o.subtitles)) o.subtitles = has('transcript') ? 'transcript' : has('translation-en') ? 'translation-en' : o.subtitles;
    const noModel = !store.models.some((m) => m.installed);
    fill(body, 
      noModel ? h('p', { class: 'msg warn' }, 'Ainda não tens nenhum modelo Whisper instalado. ', h('a', { href: '#/ferramentas/modelos' }, 'Instalar um modelo')) : null,
      h('h3', {}, '1. Transcrever'),
      h('div', { class: 'row' }, h('div', { style: 'flex:1 1 200px' }, select('model', store.models.map((m) => [m.name, `${m.label}${m.installed ? '' : ' (não instalado)'}`, !m.installed]))),
        h('div', { style: 'flex:1 1 200px' }, select('language', [['auto', 'Idioma: automático'], ['pt', 'Português'], ['en', 'English'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['it', 'Italiano']]))),
      h('div', { class: 'row' }, chk('translate', 'Traduzir para inglês'), chk('words', 'Palavra a palavra (karaoke)'), h('button', { class: 'btn sm', disabled: noModel, onclick: () => run('/api/transcribe', { model: o.model, language: o.language, translate: o.translate, words: o.words })() }, 'Transcrever')),
      has('transcript') || has('translation-en') ? [h('h3', { style: 'margin-top:8px' }, '2. Gravar legendas no vídeo'),
        h('div', { class: 'row' }, h('div', { style: 'flex:1 1 200px' }, select('subtitles', [['transcript', 'Transcrição original', !has('transcript')], ['translation-en', 'Tradução (inglês)', !has('translation-en')]])),
          h('div', { style: 'flex:1 1 200px' }, select('style', [['classic', 'Estilo clássico'], ['bold', 'Estilo negrito'], ['karaoke', 'Karaoke', !hasWords]]))),
        h('div', { class: 'row' }, h('button', { class: 'btn line sm', onclick: () => run('/api/burn', { subtitles: o.subtitles })() }, 'Legendas simples (FFmpeg)'), h('button', { class: 'btn sm', onclick: () => run('/api/remotion', { subtitles: o.subtitles, style: o.style })() }, 'Legendas estilizadas (Remotion)'))] : null);
  }
  const el = h('div', { class: 'panel' }, h('h2', {}, 'Legendas'), h('p', {}, 'Transcreve o áudio com Whisper, traduz para inglês e grava as legendas no vídeo. Corre tudo no teu computador.'), picker.el, body);
  ctx.on('jobs', draw); draw();
  return el;
}
