import test from 'node:test';
import assert from 'node:assert/strict';
import { friendly } from '../server/errors.js';

test('maps common yt-dlp errors to plain language', () => {
  assert.match(friendly(new Error('ERROR: Private video. Sign in')).message, /privado/);
  assert.match(friendly(new Error('ERROR: [youtube] x: Video unavailable')).message, /já não está disponível/);
  assert.match(friendly(new Error('HTTP Error 429: Too Many Requests')).message, /429/);
  assert.match(friendly(new Error('ERROR: Unsupported URL: https://x')).message, /não é suportado/);
});

test('a missing format is not reported as a network failure', () => {
  assert.match(friendly(new Error('WARNING: Unable to download webpage: HTTP Error 400\nERROR: Requested format is not available')).message, /formato ou a qualidade/);
});

test('unknown errors keep the raw text for the technical details', () => {
  const f = friendly(new Error('weird failure'));
  assert.equal(f.raw, 'weird failure');
  assert.match(f.message, /inesperado/);
});
