import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { compress, createAvatars, MAX_BYTES, AvatarError } from '../server/avatar.js';

// Noisy photo-like image: hard to compress, so it exercises the size loop.
const noisy = (w, h, format = 'png') => sharp(crypto.randomBytes(w * h * 3), { raw: { width: w, height: h, channels: 3 } })[format]().toBuffer();

test('a big noisy photo is squeezed under 120 KB as WebP', async () => {
  const out = await compress(await noisy(2400, 1800, 'jpeg')); const m = await sharp(out).metadata();
  assert.ok(out.length <= MAX_BYTES, `${out.length} bytes`); assert.equal(m.format, 'webp'); assert.equal(m.width, m.height); assert.ok(m.width <= 512);
});
test('png, jpeg, webp and gif are all accepted', async () => {
  for (const f of ['png', 'jpeg', 'webp', 'gif']) assert.equal((await sharp(await compress(await noisy(300, 300, f))).metadata()).format, 'webp', f);
});
test('files that are not images are refused with a plain message', async () => {
  await assert.rejects(compress(Buffer.from('hello, not an image')), AvatarError); await assert.rejects(compress(Buffer.alloc(0)), AvatarError);
  await assert.rejects(compress(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), AvatarError); // SVG is not accepted
});
test('replacing the photo keeps the same file name and leaves one file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flw-av-')); const av = createAvatars(dir);
  const a = await av.save('user1', await noisy(400, 400)); const b = await av.save('user1', await noisy(500, 300, 'jpeg'));
  assert.equal(a.url, '/uploads/avatars/user1.webp'); assert.equal(b.url, a.url); assert.deepEqual(fs.readdirSync(dir), ['user1.webp']);
  assert.ok(fs.statSync(path.join(dir, 'user1.webp')).size <= MAX_BYTES);
  av.remove('user1'); assert.deepEqual(fs.readdirSync(dir), []); av.remove('user1'); // removing twice is fine
});
test('the file name only comes from the user id (no path tricks)', () => {
  const av = createAvatars(fs.mkdtempSync(path.join(os.tmpdir(), 'flw-av-')));
  assert.equal(path.basename(av.file('../../etc/passwd')), 'etcpasswd.webp');
});
