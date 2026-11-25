import { h, icon } from '../lib/dom.js';

// Lets the user pick which part of their photo to keep before it is uploaded. Pan by dragging,
// zoom with the slider; resolves with a square PNG blob, or null if cancelled. Nothing leaves the browser here.
export function cropImage(file) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { 'aria-labelledby': 'crop-title' }); document.body.append(dlg);
    const SIZE = 280;
    const canvas = h('canvas', { width: SIZE, height: SIZE, style: `width:${SIZE}px;height:${SIZE}px;border-radius:50%;cursor:grab;touch-action:none;background:#111;display:block;margin:0 auto` });
    const ctx = canvas.getContext('2d');
    const zoom = h('input', { type: 'range', min: '1', max: '4', step: '0.01', value: '1', 'aria-label': 'Ampliar' });
    const ok = h('button', { class: 'btn', disabled: true }, 'Usar esta foto');
    const url = URL.createObjectURL(file);
    const img = new Image();
    let base = 1; const state = { x: 0, y: 0, z: 1 };
    let dragging = false, last = null;

    function draw() {
      ctx.clearRect(0, 0, SIZE, SIZE);
      const scale = base * state.z; const w = img.naturalWidth * scale, ht = img.naturalHeight * scale;
      ctx.drawImage(img, SIZE / 2 + state.x - w / 2, SIZE / 2 + state.y - ht / 2, w, ht);
    }
    function clamp() {
      const scale = base * state.z; const w = img.naturalWidth * scale, ht = img.naturalHeight * scale;
      const maxX = Math.max(0, (w - SIZE) / 2), maxY = Math.max(0, (ht - SIZE) / 2);
      state.x = Math.min(maxX, Math.max(-maxX, state.x)); state.y = Math.min(maxY, Math.max(-maxY, state.y));
    }
    img.onload = () => { base = Math.max(SIZE / img.naturalWidth, SIZE / img.naturalHeight); ok.disabled = false; draw(); };
    img.onerror = () => { finish(null); };
    img.src = url;

    const point = (e) => { const r = canvas.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: (t.clientX - r.left) * SIZE / r.width, y: (t.clientY - r.top) * SIZE / r.height }; };
    const down = (e) => { dragging = true; last = point(e); canvas.style.cursor = 'grabbing'; };
    const move = (e) => { if (!dragging) return; const p = point(e); state.x += p.x - last.x; state.y += p.y - last.y; last = p; clamp(); draw(); e.preventDefault(); };
    const up = () => { dragging = false; canvas.style.cursor = 'grab'; };
    canvas.addEventListener('mousedown', down); canvas.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    canvas.addEventListener('touchstart', down, { passive: true }); canvas.addEventListener('touchmove', move, { passive: false }); canvas.addEventListener('touchend', up);
    zoom.oninput = () => { state.z = Number(zoom.value); clamp(); draw(); };

    function finish(result) {
      window.removeEventListener('mouseup', up); dlg.close(); dlg.remove(); URL.revokeObjectURL(url); resolve(result);
    }
    ok.onclick = () => {
      const OUT = 640; const out = document.createElement('canvas'); out.width = OUT; out.height = OUT;
      const octx = out.getContext('2d'); const k = OUT / SIZE;
      const scale = base * state.z * k; const w = img.naturalWidth * scale, ht = img.naturalHeight * scale;
      octx.drawImage(img, OUT / 2 + state.x * k - w / 2, OUT / 2 + state.y * k - ht / 2, w, ht);
      out.toBlob((blob) => finish(blob), 'image/png');
    };
    const cancel = () => finish(null);

    dlg.append(h('div', { class: 'sheet' },
      h('div', { class: 'sheet-head' }, h('h2', { id: 'crop-title' }, 'Ajustar a foto'), h('button', { class: 'icon-btn dark', 'aria-label': 'Fechar', onclick: cancel }, icon('x'))),
      h('p', { class: 'mut small' }, 'Arrasta a imagem para a posicionar e usa o cursor para ampliar.'),
      h('div', { style: 'padding:8px 0' }, canvas),
      h('label', { class: 'field' }, h('span', {}, 'Ampliar'), zoom),
      h('div', { class: 'sheet-actions' }, h('button', { class: 'btn line', onclick: cancel }, 'Cancelar'), ok)));
    dlg.addEventListener('cancel', cancel);
    dlg.showModal();
  });
}
