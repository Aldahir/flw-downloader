import { h } from '../lib/dom.js';
import { NewsletterCard } from './newsletter-card.js';

export function AppFooter() {
  const col = (title, links) => h('div', {}, h('h3', {}, title), h('ul', {}, links.map(([href, t]) => h('li', {}, h('a', { href }, t)))));
  return h('footer', { class: 'foot' }, h('div', { class: 'wrap' },
    h('div', { class: 'foot-grid' },
      h('div', {}, h('a', { class: 'logo', href: '#/' }, h('span', { class: 'dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i')), h('span', { class: 'hl' }, 'FLW Downloader')),
        h('p', { class: 'mut', style: 'margin-top:14px;max-width:34ch' }, 'Corre no teu computador. Os ficheiros só são apagados se tu pedires.')),
      col('Transferir', [['#/', 'Colar um link'], ['#/historico', 'Histórico'], ['#/api', 'API para programadores']]),
      col('Ferramentas', [['#/ferramentas/leitor', 'Leitor de vídeo'], ['#/ferramentas/qr', 'Códigos QR'], ['#/ferramentas/leitor-qr', 'Leitor de QR'], ['#/ferramentas/legendas', 'Legendas'], ['#/ferramentas/modelos', 'Modelos Whisper'], ['#/ferramentas/componentes', 'Componentes']]),
      col('Conta', [['#/historico', 'Os meus trabalhos'], ['#/conta/subscricao', 'Planos Pro']]),
      NewsletterCard()),
    h('div', { class: 'foot-note' },
      h('span', {}, 'yt-dlp · FFmpeg · Whisper · Remotion'),
      h('span', {}, 'Nomes e logótipos são marcas dos seus donos. Ícones: SVG Logos (CC0), Lucide (ISC).'))));
}
