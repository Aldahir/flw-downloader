// Pure logic for a batch of sequential QR codes (e.g. tickets: https://exemplo.com/bilhete/{n}). No DOM, no
// rendering: just turns a template + range into the list of strings to encode, and names the files.
export const MAX_BATCH = 1000;
export class BatchError extends Error {}

export function validateBatch({ template, start, end, digits }) {
  template = String(template ?? '');
  if (!template.trim()) throw new BatchError('Escreve o modelo do código (por exemplo, https://exemplo.com/bilhete/{n}).');
  if (!template.includes('{n}')) throw new BatchError('O modelo precisa de ter {n}: é aí que entra o número de cada código.');
  const s = Number(start), e = Number(end);
  if (!Number.isInteger(s) || !Number.isInteger(e)) throw new BatchError('O início e o fim têm de ser números inteiros.');
  if (s < 0 || e < 0) throw new BatchError('O início e o fim não podem ser negativos.');
  if (e < s) throw new BatchError('O fim tem de ser maior ou igual ao início.');
  const count = e - s + 1;
  if (count > MAX_BATCH) throw new BatchError(`Um lote pode ter no máximo ${MAX_BATCH} códigos (pediste ${count}). Divide em lotes mais pequenos.`);
  let d = digits == null || digits === '' ? String(e).length : Number(digits);
  if (!Number.isInteger(d) || d < 1 || d > 10) throw new BatchError('O número de dígitos tem de ser um inteiro entre 1 e 10.');
  if (String(e).length > d) throw new BatchError(`Com ${d} dígito(s), "${e}" não cabe. Aumenta os dígitos ou baixa o fim.`);
  return { template, start: s, end: e, digits: d, count };
}

// [{ n, padded, text }], one per sequence number. `text` is the template with every {n} replaced.
export function buildList({ template, start, end, digits }) {
  const out = [];
  for (let n = start; n <= end; n++) { const padded = String(n).padStart(digits, '0'); out.push({ n, padded, text: template.split('{n}').join(padded) }); }
  return out;
}

const escCsv = (v) => { const s = String(v ?? ''); return /^[=+\-@\t\r]/.test(s) ? `"'${s.replace(/"/g, '""')}"` : `"${s.replace(/"/g, '""')}"`; };
export const csvManifest = (list) => `﻿${['numero;ficheiro;conteudo', ...list.map((i) => [i.n, i.padded, i.text].map(escCsv).join(';'))].join('\r\n')}\r\n`;
