import test from 'node:test';
import assert from 'node:assert/strict';
import { videoFormatArgs } from '../server/formats.js';

test('quality cap sorts by resolution and never allows audio-only', () => {
  const a = videoFormatArgs(240);
  assert.equal(a[0], '-f'); assert.match(a[1], /height>0/);
  assert.deepEqual(a.slice(2), ['-S', 'res:240']);
});
test('no cap means best quality, no sorting override', () => {
  assert.deepEqual(videoFormatArgs(undefined).slice(2), []);
});
test('cap is coerced to a number (no injection into yt-dlp args)', () => {
  assert.deepEqual(videoFormatArgs('240; rm -rf /').slice(2), ['-S', 'res:NaN']);
});

import { qualitiesFrom } from '../server/formats.js';
test('qualities: one row per height, biggest size, skips audio-only', () => {
  const q = qualitiesFrom([
    { height: 720, vcodec: 'avc1', filesize: 100 }, { height: 720, vcodec: 'vp9', filesize_approx: 300 },
    { height: 1080, vcodec: 'avc1' }, { height: null, vcodec: 'none' }, { height: 480, vcodec: 'none', filesize: 5 }]);
  assert.deepEqual(q, [{ height: 1080, size: 0 }, { height: 720, size: 300 }]);
  assert.deepEqual(qualitiesFrom(undefined), []);
});
