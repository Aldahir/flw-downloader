import { h } from './dom.js';

// Browser-side QR helpers (matrix from the qrcode library, PNG export, download, logo shrinking). Nothing is uploaded.
let lib = null;
async function loadQr() {
  if (!lib) { lib = (await import('/vendor/qrcode.mjs')).default; lib.stringToBytes = (s) => Array.from(new TextEncoder().encode(s)); } // UTF-8
  return lib;
}
export async function matrixFor(text, ecc) {
  const qrcode = await loadQr(); const q = qrcode(0, ecc);
  q.addData(text, 'Byte'); q.make(); const n = q.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => q.isDark(r, c)));
}
export const rasterise = (svg, w, hgt) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })); const img = new Image();
  img.onload = () => { const c = document.createElement('canvas'); c.width = w; c.height = hgt; const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, hgt); URL.revokeObjectURL(url); c.toBlob((b) => (b ? resolve(b) : reject(new Error('Não consegui criar a imagem.'))), 'image/png'); };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não consegui criar a imagem.')); }; img.src = url;
});
export const save = (blob, name) => { const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
export const shrinkLogo = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file); const img = new Image();
  img.onload = () => { const s = Math.min(1, 256 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); resolve(c.toDataURL('image/png')); };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Esse ficheiro não é uma imagem que eu consiga abrir (usa PNG, JPG ou WebP).')); }; img.src = url;
});

