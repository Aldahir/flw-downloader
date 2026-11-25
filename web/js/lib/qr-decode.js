// Reads QR codes: from the camera, from an image file, or from a PDF (one page at a time). Everything runs in
// this browser tab; nothing is uploaded. Uses the native BarcodeDetector when the browser has it, jsQR otherwise.

const scripts = new Map();
function loadScript(src) {
  if (scripts.has(src)) return scripts.get(src);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = src;
    s.onload = () => resolve(); s.onerror = () => reject(new Error(`Não consegui carregar ${src}.`));
    document.head.append(s);
  });
  scripts.set(src, p); return p;
}

let detector = null, detectorTried = false;
async function nativeDetector() {
  if (detectorTried) return detector;
  detectorTried = true;
  if ('BarcodeDetector' in window) { try { detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch { detector = null; } }
  return detector;
}
let jsQrReady = null;
const jsQr = () => (jsQrReady ||= loadScript('/vendor/jsqr.js').then(() => window.jsQR));

// Reads one frame: a <video>, <canvas>, ImageBitmap or ImageData. Returns an array of decoded strings (0-2 found).
export async function detect(source) {
  const det = await nativeDetector();
  if (det) {
    try { const codes = await det.detect(source); if (codes.length) return codes.map((c) => c.rawValue); } catch { /* fall through to jsQR */ }
  }
  const jsqr = await jsQr();
  let data;
  if (source instanceof ImageData) data = source;
  else {
    const w = source.videoWidth || source.width, h = source.videoHeight || source.height;
    if (!w || !h) return [];
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(source, 0, 0, w, h);
    data = g.getImageData(0, 0, w, h);
  }
  const code = jsqr(data.data, data.width, data.height, { inversionAttempts: 'attemptBoth' });
  return code ? [code.data] : [];
}

// Decodes a static image file (photo of a printed QR, a screenshot, ...).
export async function detectImageFile(file) {
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('Esse ficheiro não é uma imagem que eu consiga abrir.'); }
  try { return await detect(bitmap); } finally { bitmap.close?.(); }
}

// Decodes every page of a PDF (scans the whole page, not just an embedded image), up to `maxPages`.
// Calls onPage(pageNumber, total) as it goes. Returns [{ page, codes: [...] }] for pages where something was found.
export async function detectPdfFile(file, { maxPages = 30, onPage } = {}) {
  const pdfjs = await import('/vendor/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.mjs';
  const buf = await file.arrayBuffer();
  let doc;
  try { doc = await pdfjs.getDocument({ data: buf }).promise; } catch { throw new Error('Esse ficheiro não é um PDF que eu consiga abrir.'); }
  const total = Math.min(doc.numPages, maxPages);
  const found = [];
  for (let n = 1; n <= total; n++) {
    onPage?.(n, total);
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: 2.5 }); // higher than on-screen size, so small codes stay readable
    const canvas = document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const codes = await detect(canvas);
    if (codes.length) found.push({ page: n, codes });
  }
  if (doc.numPages > maxPages) found.truncated = true;
  return found;
}

export async function loadJSZip() { await loadScript('/vendor/jszip.js'); return window.JSZip; }
