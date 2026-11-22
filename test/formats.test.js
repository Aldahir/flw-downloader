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
