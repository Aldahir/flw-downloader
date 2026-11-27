// Loads the project's .env into process.env. Import this module FIRST (before any other local module):
// ES modules run in import order, and several modules read process.env at load time (auth, plans, jobs, mailer).
// Variables already set in the environment win over the file.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* no .env: use the environment as it is */ }
