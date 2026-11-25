// Server-side QR rendering for the public API. Uses the same pure modules as the web page, so both give the same code.
import qrcode from 'qrcode-generator';
import { Resvg } from '@resvg/resvg-js';
import { buildSvg, HEX } from '../web/js/lib/qr-render.js';
import { typeById, FieldError, TYPES } from '../web/js/lib/qr-payloads.js';

qrcode.stringToBytes = (s) => Array.from(new TextEncoder().encode(s)); // UTF-8
export class QrError extends Error { constructor(message) { super(message); this.status = 400; } }
const MAX_DATA = 2000, MAX_LOGO = 200_000;

export function payloadFrom(body) {
  if (body.type) {
    if (!TYPES.some((t) => t.id === body.type)) throw new QrError(`"type" desconhecido. Usa um de: ${TYPES.map((t) => t.id).join(', ')}.`);
    try { return typeById(body.type).build(body.fields && typeof body.fields === 'object' ? body.fields : {}); } catch (e) { if (e instanceof FieldError) throw new QrError(e.message); throw e; }
  }
  if (typeof body.data !== 'string' || !body.data) throw new QrError('Falta "data" (o que queres codificar) ou "type" com "fields".');
  if (body.data.length > MAX_DATA) throw new QrError(`"data" tem mais de ${MAX_DATA} caracteres.`);
  return body.data;
}

const color = (v, name, fb) => { if (v == null || v === '') return fb; if (!HEX.test(v)) throw new QrError(`"${name}" tem de ser uma cor hexadecimal como #1a2b3c.`); return v; };
const pick = (v, list, name, fb) => { if (v == null || v === '') return fb; if (!list.includes(v)) throw new QrError(`"${name}" tem de ser um de: ${list.join(', ')}.`); return v; };

function logoFrom(v) {
  if (!v) return '';
  const b64 = String(v).replace(/^data:image\/\w+;base64,/, '');
  if (!/^[a-z0-9+/=]+$/i.test(b64) || b64.length > MAX_LOGO * 1.4) throw new QrError('"logo" tem de ser uma imagem PNG, JPEG ou WebP em base64 (até 200 KB).');
  const head = Buffer.from(b64.slice(0, 16), 'base64'); const mime = head[0] === 0x89 && head[1] === 0x50 ? 'png' : head[0] === 0xff && head[1] === 0xd8 ? 'jpeg' : head.toString('ascii', 0, 4) === 'RIFF' ? 'webp' : '';
  if (!mime) throw new QrError('"logo" tem de ser uma imagem PNG, JPEG ou WebP em base64 (até 200 KB).');
  return `data:image/${mime};base64,${b64}`;
}

export function renderQr(body = {}) {
  const text = payloadFrom(body);
  const format = pick(body.format, ['png', 'svg'], 'format', 'png');
  const logo = logoFrom(body.logo);
  const ecc = logo ? 'H' : pick(body.ecc, ['L', 'M', 'Q', 'H'], 'ecc', 'M');
  const size = body.size == null ? 512 : Number(body.size);
  if (!Number.isInteger(size) || size < 64 || size > 4096) throw new QrError('"size" tem de ser um número inteiro entre 64 e 4096 (pixéis).');
  const margin = body.margin == null ? 3 : Number(body.margin);
  if (!Number.isInteger(margin) || margin < 0 || margin > 8) throw new QrError('"margin" tem de ser um inteiro entre 0 e 8.');
  const opts = { fg: color(body.fg, 'fg', '#000000'), bg: color(body.bg, 'bg', '#ffffff'), transparent: body.transparent === true || body.transparent === 'on',
    shape: pick(body.shape, ['square', 'rounded', 'dots'], 'shape', 'square'), frame: pick(body.frame, ['none', 'box', 'label'], 'frame', 'none'), label: typeof body.label === 'string' ? body.label : undefined, margin, logo };
  let q;
  try { q = qrcode(0, ecc); q.addData(text, 'Byte'); q.make(); } catch { throw new QrError('Há demasiada informação para um código QR. Envia menos dados ou baixa "ecc".'); }
  const n = q.getModuleCount(); const matrix = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => q.isDark(r, c)));
  const { svg, width, height } = buildSvg(matrix, opts);
  if (format === 'svg') return { format, mime: 'image/svg+xml', body: Buffer.from(svg), width, height };
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size }, font: { loadSystemFonts: true, defaultFontFamily: 'Arial' } }).render();
  return { format, mime: 'image/png', body: png.asPng(), width: png.width, height: png.height };
}
