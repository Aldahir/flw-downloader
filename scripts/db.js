// Uses the MySQL already installed on this computer (the system service, e.g. "brew services start mysql"
// on macOS), on its normal port (3306 by default). This script does not start or stop that server — only
// `brew services` (or your OS's service manager) does that — it just prepares the app's own database and user.
//   npm run db:setup   first time (and whenever credentials change): create the databases and app user, write .env
//   npm run db:status  check that the app's own credentials can reach the server
//
// `setup` needs an administrator account on that MySQL server once, to create the app's own low-privilege user.
// Pass it via DB_ADMIN_USER / DB_ADMIN_PASSWORD (env vars), or answer the prompts.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV = path.join(ROOT, '.env');

const readEnv = () => Object.fromEntries((fs.existsSync(ENV) ? fs.readFileSync(ENV, 'utf8') : '').split('\n').filter((l) => /^\w+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const writeEnv = (obj) => { fs.writeFileSync(ENV, `${Object.entries(obj).map(([k, v]) => `${k}=${v}`).join('\n')}\n`, { mode: 0o600 }); };

function ask(q, { hide = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
    let muted = false; const write = rl._writeToOutput.bind(rl); if (hide) rl._writeToOutput = (t) => { if (!muted) write(t); };
    process.stdout.write(q); if (hide) muted = true;
    rl.question('', (a) => { if (hide) { muted = false; console.log(); } rl.close(); resolve(a); });
  });
}

async function status() {
  const env = readEnv();
  const c = await mysql.createConnection({ host: env.DB_HOST || '127.0.0.1', port: Number(env.DB_PORT || 3306), user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME }).catch((e) => e);
  if (c instanceof Error) { console.log(`Não consigo ligar ao MySQL com as credenciais em .env: ${c.message}`); process.exitCode = 1; return; }
  await c.end();
  console.log(`MySQL acessível em ${env.DB_HOST || '127.0.0.1'}:${env.DB_PORT || 3306} com o utilizador "${env.DB_USER}".`);
}

async function setup() {
  const env = readEnv();
  const host = env.DB_HOST || '127.0.0.1', port = Number(env.DB_PORT || 3306);
  const db = env.DB_NAME || 'flw', test = env.DB_NAME_TEST || 'flw_test', user = env.DB_USER || 'flw_app';
  const rand = () => crypto.randomBytes(18).toString('base64url');
  const appPw = env.DB_PASSWORD || rand();

  const adminUser = process.env.DB_ADMIN_USER || await ask('Utilizador administrador do MySQL (ex.: root ou admin_mac): ');
  const adminPass = process.env.DB_ADMIN_PASSWORD ?? await ask('Palavra-passe desse utilizador: ', { hide: true });
  let c;
  try { c = await mysql.createConnection({ host, port, user: adminUser, password: adminPass }); }
  catch (e) { console.error(`Não consegui entrar como "${adminUser}": ${e.message}`); process.exitCode = 1; return; }

  for (const d of [db, test]) await c.query(`CREATE DATABASE IF NOT EXISTS \`${d}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  for (const h of ['127.0.0.1', 'localhost']) {
    await c.query('CREATE USER IF NOT EXISTS ?@? IDENTIFIED BY ?', [user, h, appPw]);
    await c.query('ALTER USER ?@? IDENTIFIED BY ?', [user, h, appPw]);
    for (const d of [db, test]) await c.query(`GRANT ALL PRIVILEGES ON \`${d}\`.* TO ?@?`, [user, h]);
  }
  await c.query('FLUSH PRIVILEGES;'); await c.end();

  writeEnv({ ...env, DB_HOST: host, DB_PORT: String(port), DB_USER: user, DB_PASSWORD: appPw, DB_NAME: db, DB_NAME_TEST: test, IP_SECRET: env.IP_SECRET || crypto.randomBytes(32).toString('hex') });
  console.log(`Pronto: bases "${db}" e "${test}" em ${host}:${port}, utilizador "${user}" (só com acesso a essas duas). Credenciais guardadas em .env (não vai para o Git).`);
}
  
const cmd = process.argv[2];
const run = { setup, status }[cmd];
if (!run) { console.log('Uso: node scripts/db.js setup | status\n(Para ligar/desligar o MySQL em si, usa o gestor de serviços do sistema, ex.: brew services start/stop mysql.)'); process.exit(1); }
await run();
