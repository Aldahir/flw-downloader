// Spawn helper: never uses a shell, so user input can't inject commands.
import { spawn } from 'node:child_process';

export function run(bin, args, { cwd, onLine, signal } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { cwd, signal, windowsHide: true });
    let out = '', err = '';
    const feed = (buf, isErr) => {
      const s = buf.toString();
      if (isErr) err += s; else out += s;
      if (onLine) s.split(/\r?\n|\r/).filter(Boolean).forEach(onLine);
    };
    p.stdout.on('data', (d) => feed(d, false));
    p.stderr.on('data', (d) => feed(d, true));
    p.on('error', reject);
    p.on('close', (code) => code === 0 ? resolve(out) : reject(new Error(err.trim().split('\n').slice(-3).join('\n') || `exit ${code}`)));
  });
}
