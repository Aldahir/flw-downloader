// Profile photo: any common image becomes a WebP of at most 120 KB. One file per account, same name every time:
// changing the photo overwrites the old one, so nothing piles up on the server. The database only keeps the URL.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export const MAX_BYTES = 120 * 1024;
export const MAX_UPLOAD = 6 * 1024 * 1024;
export class AvatarError extends Error { constructor(message) { super(message); this.status = 400; } }

export async function compress(input) {
  let meta;
  try { meta = await sharp(input, { limitInputPixels: 50_000_000 }).metadata(); } catch { throw new AvatarError('Esse ficheiro não é uma imagem que eu consiga abrir. Usa JPG, PNG, WebP ou GIF.'); }
  if (!['jpeg', 'png', 'webp', 'gif'].includes(meta.format)) throw new AvatarError('Formato não suportado. Usa JPG, PNG, WebP ou GIF.');
  // Shrink quality first, then the size, until it fits. Square crop around the middle.
  for (const side of [512, 384, 256, 160]) {
    for (const quality of [82, 70, 58, 46, 34]) {
      const out = await sharp(input, { limitInputPixels: 50_000_000 }).rotate().resize(side, side, { fit: 'cover', position: 'attention' }).webp({ quality, effort: 4 }).toBuffer();
      if (out.length <= MAX_BYTES) return out;
    }
  }
  throw new AvatarError('Não consegui reduzir esta imagem para 120 KB. Experimenta outra.');
}

export function createAvatars(dir, publicPath = '/uploads/avatars') {
  fs.mkdirSync(dir, { recursive: true });
  const file = (userId) => path.join(dir, `${String(userId).replace(/[^a-zA-Z0-9]/g, '')}.webp`);
  return {
    async save(userId, input) {
      const out = await compress(input); const target = file(userId); const tmp = `${target}.tmp`;
      fs.writeFileSync(tmp, out); fs.renameSync(tmp, target); // atomic replace of the previous photo
      return { url: `${publicPath}/${path.basename(target)}`, bytes: out.length };
    },
    remove(userId) { fs.rmSync(file(userId), { force: true }); },
    file,
  };
}
