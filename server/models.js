// Whisper model catalogue (whisper.cpp ggml files). Downloads are always started by the user.
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const MODELS_DIR = path.resolve('models');
export const CATALOGUE = [
  { name: 'tiny', label: 'Tiny', sizeMB: 75, note: 'Muito rápido, menos preciso' },
  { name: 'base', label: 'Base', sizeMB: 142, note: 'Bom equilíbrio para começar' },
  { name: 'small', label: 'Small', sizeMB: 466, note: 'Mais preciso, mais lento' },
  { name: 'medium', label: 'Medium', sizeMB: 1500, note: 'Muito preciso, lento' },
  { name: 'large-v3-turbo-q5_0', label: 'Large v3 Turbo (comprimido)', sizeMB: 574, note: 'Melhor qualidade geral' },
];
const known = (n) => CATALOGUE.some((m) => m.name === n);
export const modelPath = (name) => path.join(MODELS_DIR, `ggml-${name}.bin`);

export function listModels() {
  return CATALOGUE.map((m) => ({ ...m, installed: fs.existsSync(modelPath(m.name)) }));
}
// Resolve a user-chosen model name to a file; unknown names are rejected (no path tricks).
export function resolveModel(name) {
  const n = name || process.env.WHISPER_MODEL_NAME || 'base';
  if (!known(n)) return null;
  return fs.existsSync(modelPath(n)) ? modelPath(n) : null;
}

export async function downloadModel(name, { signal, onProgress }) {
  if (!known(name)) throw new Error('Modelo desconhecido');
  fs.mkdirSync(MODELS_DIR, { recursive: true });
  const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${name}.bin`;
  const res = await fetch(url, { signal });
  if (!res.ok || !res.body) throw new Error(`Unable to download model (HTTP ${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  let got = 0;
  const part = `${modelPath(name)}.part`;
  const body = Readable.fromWeb(res.body);
  body.on('data', (c) => { got += c.length; if (total) onProgress?.((got / total) * 100); });
  try { await pipeline(body, fs.createWriteStream(part), { signal }); }
  catch (e) { fs.rmSync(part, { force: true }); throw e; }
  fs.renameSync(part, modelPath(name));
}
