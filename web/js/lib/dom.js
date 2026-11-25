// Safe DOM builder: text always goes through text nodes / textContent, so titles and file names can't inject HTML.
export const h = (tag, props = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'selected' || k === 'disabled') { if (v !== false && v != null) el[k] = v; }
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  kids.flat(Infinity).forEach((c) => { if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c)); });
  return el;
};
// Interface glyph (Lucide, local file) painted in the text colour via CSS mask.
export const icon = (name, cls = '') => { const s = h('span', { class: `ic ${cls}`.trim(), 'aria-hidden': 'true' }); s.style.setProperty('--i', `url(/assets/icons/ui-${name}.svg)`); return s; };
// Real brand logo in its own colours (local file).
export const brand = (id, label = '', cls = 'brand-ic') => h('img', { class: cls, src: `/assets/icons/${id}.svg`, alt: label, width: 28, height: 28, loading: 'lazy' });
export const clear = (el) => { el.replaceChildren(); return el; };
// replaceChildren() would print the word "null" for empty slots; this skips them.
export const fill = (el, ...kids) => { el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false)); return el; };
