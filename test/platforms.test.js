import test from 'node:test';
import assert from 'node:assert/strict';
import { platformOf } from '../server/platforms.js';
import { parseProgress } from '../server/progress.js';

test('platformOf recognises sites and subdomains', () => {
  assert.equal(platformOf('https://www.youtube.com/watch?v=1'), 'youtube');
  assert.equal(platformOf('https://youtu.be/abc'), 'youtube');
  assert.equal(platformOf('https://m.facebook.com/x'), 'facebook');
  assert.equal(platformOf('https://x.com/a/status/1'), 'twitter');
  assert.equal(platformOf('https://video.blender.org/w/1'), 'other');
});
test('platformOf does not match look-alike hosts', () => {
  assert.equal(platformOf('https://notyoutube.com/x'), 'other');
  assert.equal(platformOf('https://youtube.com.evil.example/x'), 'other');
  assert.equal(platformOf('not a url'), 'other');
});
test('parseProgress reads percent, speed, eta and sizes', () => {
  const p = parseProgress('PROGRESS  42.3%|NA|NA|1.20MiB/s|00:12|4.20MiB|9.90MiB|NA');
  assert.equal(p.pct, 42.3); assert.equal(p.speed, '1.20MiB/s'); assert.equal(p.eta, '00:12'); assert.equal(p.sizeText, '4.20MiB de 9.90MiB');
  assert.equal(p.idx, 0);
});
test('parseProgress copes with unknown fields and junk', () => {
  const p = parseProgress('PROGRESS   5.0%|2|10|Unknown B/s|NA|1MiB|NA|8MiB');
  assert.equal(p.idx, 2); assert.equal(p.n, 10); assert.equal(p.speed, ''); assert.equal(p.sizeText, '1MiB de 8MiB');
  assert.equal(parseProgress('PROGRESS 1.0%|NA|NA|N/A|N/A|128KiB|N/A|N/A').sizeText, '128KiB'); // yt-dlp prints N/A for unknown
  assert.equal(parseProgress('something else'), null);
  assert.equal(parseProgress('PROGRESS abc|1'), null);
});
