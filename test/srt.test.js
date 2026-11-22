import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSrt, groupWords } from '../server/srt.js';

test('parseSrt reads cues in seconds', () => {
  const cues = parseSrt('1\n00:00:01,500 --> 00:00:03,000\nHello\nworld\n\n2\n00:01:00,000 --> 00:01:01,250\nBye\n');
  assert.deepEqual(cues, [{ start: 1.5, end: 3, text: 'Hello world' }, { start: 60, end: 61.25, text: 'Bye' }]);
});

test('groupWords splits on 4 words and on long pauses, skipping empty cues', () => {
  const w = (start, end, text) => ({ start, end, text });
  const chunks = groupWords([w(0, 0.1, ''), w(0.1, 0.3, 'a'), w(0.3, 0.5, 'b'), w(0.5, 0.7, 'c'), w(0.7, 0.9, 'd'), w(0.9, 1.1, 'e'), w(5, 5.2, 'f')]);
  assert.deepEqual(chunks.map((c) => c.text), ['a b c d', 'e', 'f']);
  assert.equal(chunks[0].words.length, 4);
});
