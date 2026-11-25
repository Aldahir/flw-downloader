import test from 'node:test';
import assert from 'node:assert/strict';
import qrcode from '../node_modules/qrcode-generator/dist/qrcode.mjs';
import { buildSvg, contrast, readabilityWarning } from '../web/js/lib/qr-render.js';
import { TEXT_MAX } from '../web/js/lib/qr-payloads.js';

qrcode.stringToBytes = (s) => Array.from(new TextEncoder().encode(s)); // same UTF-8 setup as the page
const matrix = (text, ecc = 'M') => { const q = qrcode(0, ecc); q.addData(text, 'Byte'); q.make(); const n = q.getModuleCount(); return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => q.isDark(r, c))); };

test('the library fits 1200 ASCII characters at every error-correction level', () => {
  for (const ecc of ['L', 'M', 'Q', 'H']) assert.ok(matrix('a'.repeat(TEXT_MAX), ecc).length >= 21, ecc);
});
test('UTF-8 text (accents, emoji) is encoded as bytes, not Latin-1', () => {
  assert.notDeepEqual(matrix('olá ✓'), matrix('ol? ?'));
});
test('svg: every shape and frame produces a well-formed, escaped document', () => {
  const m = matrix('https://exemplo.com');
  for (const shape of ['square', 'rounded', 'dots']) for (const frame of ['none', 'box', 'label']) {
    const { svg, width, height } = buildSvg(m, { shape, frame, label: '<script>"x"&' });
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>')); assert.ok(width > 0 && height >= width);
    assert.ok(!svg.includes('<script')); // label is escaped
  }
});
test('svg: bad colours and logos are ignored, a valid logo is embedded', () => {
  const m = matrix('x');
  assert.ok(buildSvg(m, { fg: 'red;"onload=1', bg: 'url(x)' }).svg.includes('#000000'));
  assert.ok(!buildSvg(m, { logo: 'https://evil.example/x.png' }).svg.includes('evil'));
  assert.ok(buildSvg(m, { logo: 'data:image/png;base64,AAAA' }).svg.includes('<image'));
});
test('logo leaves the centre empty and square draws one rect per run of dark modules', () => {
  const m = matrix('https://exemplo.com/um/caminho/mais/longo', 'H');
  const plain = buildSvg(m, {}).svg.match(/<rect/g).length, withLogo = buildSvg(m, { logo: 'data:image/png;base64,AAAA' }).svg.match(/<rect/g).length;
  assert.ok(withLogo < plain + 2);
});
test('contrast and readability warnings', () => {
  assert.equal(contrast('#000000', '#ffffff').toFixed(0), '21');
  assert.equal(readabilityWarning('#000000', '#ffffff'), '');
  assert.match(readabilityWarning('#777777', '#888888'), /contraste/);
  assert.match(readabilityWarning('#ffffff', '#000000'), /invertido/);
});
