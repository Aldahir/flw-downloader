import { h, icon, brand } from '../lib/dom.js';
import { store } from '../lib/store.js';
import { TYPES } from '../lib/qr-payloads.js';

const sec = (id, title, lead, ...kids) => h('section', { class: 'section', 'aria-labelledby': id }, h('div', { class: 'wrap' },
  h('div', { class: 'sec-head' }, h('h2', { id }, title), lead ? h('p', { class: 'mut' }, lead) : null), ...kids));
const feat = ([ic, t, d]) => h('div', { class: 'feat' }, h('span', { class: 'fi' }, icon(ic)), h('h3', {}, t), h('p', { class: 'mut' }, d));

// Sections under the home hero: what the app does, how to use it, why, what a QR code is, and the API.
export function HomeSections() {
  const go = (id) => (e) => { e.preventDefault(); location.hash = id; };
  return h('div', {},
    sec('feat', 'Tudo para os teus vídeos', 'Do link ao ficheiro, e do ficheiro às legendas, no teu computador.',
      h('div', { class: 'feat-grid' }, [
        ['download', 'Vídeo ou só áudio', 'Escolhe a qualidade, ou extrai o áudio em MP3. Vês o tamanho aproximado antes de descarregar.'],
        ['layers', 'Playlists inteiras', 'Descarrega as primeiras N de uma playlist, com progresso global e velocidade.'],
        ['captions', 'Legendas com Whisper', 'Transcreve, traduz para inglês e grava legendas no vídeo, clássicas ou karaoke.'],
        ['play', 'Leitor com codecs', 'Abre formatos que o navegador não conhece. A conversão acontece no teu navegador.'],
        ['qr-code', 'Códigos QR', 'Links, Wi-Fi, contactos, texto e mais, com o teu estilo e logótipo.'],
        ['code', 'API', 'Gera QR e descarrega vídeos a partir dos teus programas.']].map(feat))),

    sec('how', 'Como usar', 'Três passos, sem instalar extensões.',
      h('ol', { class: 'steps' }, [['1', 'Cola o link', 'Copia o endereço do vídeo ou da playlist e cola-o na caixa.'], ['2', 'Escolhe a qualidade', 'Vê o que foi encontrado e escolhe HD, SD ou só áudio.'], ['3', 'Descarrega e usa', 'Acompanha o progresso. Depois reproduz, cria legendas ou apaga quando quiseres.']]
        .map(([n, t, d]) => h('li', {}, h('span', { class: 'num' }, n), h('div', {}, h('h3', {}, t), h('p', { class: 'mut' }, d)))))),

    sec('why', 'Porquê usar', 'Pensado para quem quer controlo sobre o que descarrega.',
      h('div', { class: 'feat-grid' }, [
        ['shield-check', 'Privado', 'Corre no teu computador. Os teus links e ficheiros não passam por terceiros.'],
        ['heart-handshake', 'Sem anúncios nem rastreio', 'Nada de pop-ups, contas obrigatórias ou cookies de publicidade.'],
        ['badge-check', 'Tu decides o que apagar', 'Nada é apagado sozinho: manténs ou apagas cada trabalho.'],
        ['zap', 'Rápido e em fila', 'Até 5 downloads em simultâneo, com fila e cancelamento.']].map(feat))),

    sec('qrwhat', 'O que é um código QR?', 'QR vem de "Quick Response" (resposta rápida). Foi criado em 1994 pela Denso Wave para seguir peças nas fábricas e hoje lê-se com a câmara do telemóvel.',
      h('div', { class: 'qr-info' }, h('div', {}, h('h3', {}, 'Tipos de código disponíveis'), h('p', { class: 'mut' }, 'Escolhe o tipo e preenche os campos. O código sai pronto a imprimir ou a partilhar.')),
        h('div', { class: 'qr-chips' }, TYPES.map((t) => h('a', { class: 'qr-type', href: '#/ferramentas/qr', title: t.hint }, icon(t.icon), h('span', {}, t.label)))))),

    sec('static', 'Estáticos ou dinâmicos?', 'Os dois parecem iguais, mas comportam-se de forma diferente.',
      h('div', { class: 'cmp' },
        h('div', { class: 'card' }, h('span', { class: 'pill ok' }, 'Disponível'), h('h3', { style: 'margin-top:10px' }, 'Estáticos'), h('p', { class: 'mut' }, 'A informação fica dentro da imagem. Nunca expiram, não dependem de nenhum servidor e funcionam offline. Ideais para Wi-Fi, contactos, texto e links que não mudam.')),
        h('div', { class: 'card' }, h('span', { class: 'pill' }, 'Em preparação'), h('h3', { style: 'margin-top:10px' }, 'Dinâmicos'), h('p', { class: 'mut' }, 'Apontam para um endereço curto que podes mudar depois sem reimprimir, e permitem contar leituras. Precisam de um servidor sempre ligado, por isso ainda não estão nesta versão.')))),

    h('section', { class: 'section', 'aria-labelledby': 'apicta' }, h('div', { class: 'wrap' }, h('div', { class: 'band' }, h('div', { class: 'band-in' },
      h('h2', { id: 'apicta' }, 'Leva isto para os teus programas'),
      h('p', {}, 'Gera códigos QR e descarrega vídeos com uma chave de API simples. Pensada para ser previsível, privada e transparente, com limites claros desde o primeiro dia.'),
      h('div', { class: 'row', style: 'justify-content:center' }, h('a', { class: 'btn', style: 'background:var(--hl);color:var(--on-hl)', href: '#/api' }, icon('code'), 'Ver a API'), h('a', { class: 'btn line', style: 'color:inherit;box-shadow:inset 0 0 0 1.5px currentColor', href: '#/ferramentas/qr' }, 'Experimentar os QR')))))));
}
