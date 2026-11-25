// Forgot your password? There is no email on a local app: reset it here, on the computer that runs it.
//   npm run account -- reset someone@example.com
import path from 'node:path';
import readline from 'node:readline';
import { createAuth } from '../server/auth.js';

const [cmd, email] = process.argv.slice(2);
if (cmd !== 'reset' || !email) { console.log('Uso: npm run account -- reset <email>'); process.exit(1); }
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
let muted = false; const write = rl._writeToOutput.bind(rl);
rl._writeToOutput = (t) => { if (!muted) write(t); }; // hide what is typed
const lines = [], waiters = [];
rl.on('line', (l) => (waiters.length ? waiters.shift()(l) : lines.push(l)));
const ask = (q) => new Promise((resolve) => { process.stdout.write(q); muted = true; const done = (l) => { muted = false; console.log(); resolve(l); }; if (lines.length) done(lines.shift()); else waiters.push(done); });
const auth = createAuth(path.resolve(process.env.FLW_DATA || 'data'));
try {
  const a = await ask('Nova palavra-passe: '), b = await ask('Repete: ');
  if (a !== b) throw new Error('As palavras-passe não coincidem.');
  await auth.resetPassword(email, a);
  console.log('Pronto. As sessões abertas dessa conta foram terminadas; entra com a nova palavra-passe.');
} catch (e) { console.error(e.message); process.exitCode = 1; }
rl.close();
