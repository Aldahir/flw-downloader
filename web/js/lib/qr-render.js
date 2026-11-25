// Draws a QR matrix as SVG (shapes, colours, frame, logo). Pure string building, no DOM: unit-tested in Node.
// The matrix comes from the qrcode library in the browser; nothing is uploaded.
export const HEX = /^#[0-9a-f]{6}$/i;
export const SHAPES = ['square', 'rounded', 'dots'];
export const FRAMES = ['none', 'box', 'label'];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lum = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// Phone cameras read dark-on-light best. Returns a plain-language warning, or ''.
export function readabilityWarning(fg, bg) {
  if (contrast(fg, bg) < 3) return 'As cores têm pouco contraste: o código pode não ser lido. Usa um tom bem mais escuro que o fundo.';
  if (lum(fg) > lum(bg)) return 'Código claro em fundo escuro (invertido): alguns leitores não o reconhecem. Testa antes de imprimir.';
  return '';
}

const inFinder = (r, c, n) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

export function buildSvg(matrix, o = {}) {
  const fg = HEX.test(o.fg) ? o.fg : '#000000', bg = HEX.test(o.bg) ? o.bg : '#ffffff';
  const shape = SHAPES.includes(o.shape) ? o.shape : 'square', frame = FRAMES.includes(o.frame) ? o.frame : 'none';
  const n = matrix.length, margin = Math.max(0, Math.min(8, Number.isFinite(o.margin) ? o.margin : 3)), t = n + margin * 2;
  const logo = o.logo && /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(o.logo) ? o.logo : '';
  const logoSpan = logo ? Math.max(3, Math.floor(n * 0.22)) | 1 : 0; // odd number of modules, ~22% of the side
  const lo = logo ? Math.floor((n - logoSpan) / 2) : -1;
  const hidden = (r, c) => logo && r >= lo - 1 && r <= lo + logoSpan && c >= lo - 1 && c <= lo + logoSpan;

  let body = '';
  const rx = shape === 'square' ? 0 : 0.3;
  // finder patterns: outer ring 7x7, inner 3x3 (shape follows the style)
  for (const [fr, fc] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    const x = margin + fc, y = margin + fr, r = shape === 'square' ? 0 : shape === 'rounded' ? 1.6 : 3.5;
    body += `<path fill-rule="evenodd" d="${rrect(x, y, 7, 7, r)}${rrect(x + 1, y + 1, 5, 5, Math.max(0, r - 1))}"/>`;
    body += `<path d="${rrect(x + 2, y + 2, 3, 3, shape === 'square' ? 0 : shape === 'rounded' ? 0.8 : 1.5)}"/>`;
  }
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!matrix[r][c] || inFinder(r, c, n) || hidden(r, c)) continue;
      const x = margin + c, y = margin + r;
      body += shape === 'dots' ? `<circle cx="${x + 0.5}" cy="${y + 0.5}" r="0.46"/>` : rx ? `<rect x="${x + 0.04}" y="${y + 0.04}" width="0.92" height="0.92" rx="${rx}"/>` : `<rect x="${x}" y="${y}" width="1.02" height="1.02"/>`;
    }
  }
  if (logo) {
    const x = margin + lo - 0.5, s = logoSpan + 1;
    body += `<rect x="${x}" y="${x}" width="${s}" height="${s}" rx="0.8" fill="${bg}"/><image href="${logo}" xlink:href="${logo}" x="${x + 0.4}" y="${x + 0.4}" width="${s - 0.8}" height="${s - 0.8}" preserveAspectRatio="xMidYMid meet"/>`;
  }

  const label = frame === 'label' ? esc(String(o.label || 'ESCANEIA-ME').slice(0, 24)) : '';
  const pad = frame === 'none' ? 0 : 1.2, labelH = frame === 'label' ? 5 : 0;
  const W = t + pad * 2, H = t + pad * 2 + labelH;
  let out = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W * 10}" height="${H * 10}" shape-rendering="${shape === 'square' ? 'crispEdges' : 'geometricPrecision'}">`;
  if (frame !== 'none') out += `<rect width="${W}" height="${H}" rx="2" fill="${fg}"/><rect x="${pad * 0.6}" y="${pad * 0.6}" width="${W - pad * 1.2}" height="${t + pad * 0.8}" rx="1.4" fill="${bg}"/>`;
  else if (!o.transparent) out += `<rect width="${W}" height="${H}" fill="${bg}"/>`;
  out += `<g transform="translate(${pad} ${pad})" fill="${fg}">${body}</g>`;
  if (label) out += `<text x="${W / 2}" y="${H - 1.6}" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-weight="700" font-size="2.6" fill="${bg}">${label}</text>`;
  return { svg: `${out}</svg>`, width: W * 10, height: H * 10 };
}

function rrect(x, y, w, h, r) {
  if (!r) return `M${x} ${y}h${w}v${h}h${-w}z`;
  r = Math.min(r, w / 2, h / 2);
  return `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`;
}
