import { h, icon } from '../lib/dom.js';
import { PlayerPanel } from './player.js';
import { QrPanel } from './qr.js';
import { QrReaderPanel } from './qr-reader.js';
import { SubtitleTool } from '../components/subtitle-tool.js';
import { ModelsPanel } from '../components/models-panel.js';
import { HealthPanel } from '../components/health-panel.js';

const TABS = [
  ['leitor', 'play', 'Leitor de vídeo', (ctx) => PlayerPanel(ctx)],
  ['qr', 'qr-code', 'Códigos QR', () => QrPanel()],
  ['leitor-qr', 'scan-line', 'Leitor de QR', (ctx) => QrReaderPanel(ctx)],
  ['legendas', 'captions', 'Legendas', (ctx) => SubtitleTool(ctx)],
  ['modelos', 'download', 'Modelos Whisper', (ctx) => ModelsPanel(ctx)],
  ['componentes', 'wrench', 'Componentes', (ctx) => HealthPanel(ctx)],
];

export function ToolsPage(ctx) {
  const cur = TABS.find((t) => t[0] === ctx.route.sub) || TABS[0];
  return h('div', { class: 'wrap', style: 'padding-bottom:56px' },
    h('div', { class: 'page-head' }, h('h1', { style: 'font-size:clamp(1.8rem,4vw,2.6rem)' }, 'Ferramentas'), h('p', {}, 'Leitor de vídeo com codecs, códigos QR, legendas e o estado dos componentes.')),
    h('div', { class: 'tool-layout' },
      h('nav', { class: 'side', 'aria-label': 'Ferramentas' }, TABS.map(([id, ic, label]) => h('a', { href: `#/ferramentas/${id}`, 'aria-current': id === cur[0] ? 'page' : null }, icon(ic), label))),
      h('div', {}, cur[3](ctx))));
}
