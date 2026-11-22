import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, pickH264Encoder } from '../server/codec.js';

const cap = (dec = [], enc = ['libx264']) => ({ decoders: new Set(dec), encoders: new Set(enc), filters: new Set(), libass: false });
const info = (over = {}) => ({ container: 'mov', duration: 10, size: 1, bitrate: 1,
  video: { codec: 'h264', label: 'H.264 (AVC)', pixFmt: 'yuv420p', bitDepth: 8 }, audio: { codec: 'aac', label: 'AAC' }, subtitles: [], ...over });

test('H.264 + AAC in MP4 is universally playable', () => {
  const a = analyze(info(), cap(['h264', 'aac']));
  assert.equal(a.level, 'yes'); assert.equal(a.missing.length, 0); assert.equal(a.actions.length, 0);
});

test('HEVC + AC-3 in MKV is flagged and can be converted', () => {
  const a = analyze(info({ container: 'matroska', video: { codec: 'hevc', label: 'H.265 (HEVC)', pixFmt: 'yuv420p', bitDepth: 8 }, audio: { codec: 'ac3', label: 'AC-3' } }), cap(['hevc', 'ac3']));
  assert.equal(a.level, 'no'); assert.equal(a.actions[0].id, 'transcode');
});

test('a codec this FFmpeg cannot decode is reported as missing, with how to get it, and no conversion offered', () => {
  const a = analyze(info({ video: { codec: 'prores', label: 'Apple ProRes', pixFmt: 'yuv422p10le', bitDepth: 10 } }), cap(['aac']), 'darwin');
  assert.equal(a.missing.length, 1); assert.match(a.missing[0].how, /brew install ffmpeg/);
  assert.equal(a.actions.length, 0);
});

test('unknown codec name is treated as missing; Windows hint uses winget', () => {
  const a = analyze(info({ audio: { codec: 'unknown', label: 'DESCONHECIDO' } }), cap(['h264']), 'win32');
  assert.match(a.missing[0].how, /winget/);
});

test('encoder choice prefers libx264, falls back to hardware encoders', () => {
  assert.equal(pickH264Encoder(cap([], ['libx264', 'h264_videotoolbox'])), 'libx264');
  const hw = pickH264Encoder(cap([], ['h264_videotoolbox', 'h264_nvenc']));
  assert.ok(['h264_videotoolbox', 'h264_nvenc'].includes(hw));
  assert.equal(pickH264Encoder(cap([], [])), null);
});
