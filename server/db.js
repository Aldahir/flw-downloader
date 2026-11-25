// MySQL connection pool and migrations. Settings come from environment variables or a local .env file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* no .env: use the environment as it is */ }

export function config(overrides = {}) {
  const e = process.env;
  return { host: e.DB_HOST || '127.0.0.1', port: Number(e.DB_PORT || 3306), user: e.DB_USER || 'flw_app', password: e.DB_PASSWORD || '', database: e.DB_NAME || 'flw', ...overrides };
}

export function createPool(overrides = {}) {
  return mysql.createPool({ ...config(overrides), waitForConnections: true, connectionLimit: 10, charset: 'utf8mb4', timezone: 'Z', dateStrings: false, multipleStatements: false });
}

// Applies server/migrations/*.sql once each, in name order.
export async function migrate(pool) {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(100) NOT NULL PRIMARY KEY, applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB');
  const done = new Set((await pool.query('SELECT name FROM schema_migrations'))[0].map((r) => r.name));
  const dir = path.join(ROOT, 'server', 'migrations'); const applied = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    const statements = fs.readFileSync(path.join(dir, f), 'utf8').replace(/^--.*$/gm, '').split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean);
    const conn = await pool.getConnection();
    try { for (const s of statements) await conn.query(s); await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [f]); applied.push(f); }
    finally { conn.release(); }
  }
  return applied;
}

export const dbReachable = async (pool) => { try { await pool.query('SELECT 1'); return true; } catch { return false; } };
