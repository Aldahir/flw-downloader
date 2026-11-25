import { h, icon } from '../lib/dom.js';
import { toast } from '../lib/toast.js';

// Code samples with a tab per language and a copy button. `samples` = [[label, code], ...]
export function CodeTabs(samples) {
  let cur = 0; const pre = h('pre', { class: 'code', tabindex: '0' }); const tabs = h('div', { class: 'code-tabs', role: 'tablist' });
  const draw = () => {
    pre.replaceChildren(h('code', {}, samples[cur][1]));
    tabs.replaceChildren(...samples.map(([label], i) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(i === cur), onclick: () => { cur = i; draw(); } }, label)),
      h('button', { type: 'button', class: 'code-copy', 'aria-label': 'Copiar código', onclick: async () => { try { await navigator.clipboard.writeText(samples[cur][1]); toast('Código copiado.'); } catch { toast('Não consegui copiar. Seleciona o texto à mão.', 'bad'); } } }, icon('copy'), 'Copiar'));
  };
  draw();
  return h('div', { class: 'code-box' }, tabs, pre);
}
