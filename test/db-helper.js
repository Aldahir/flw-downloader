// Tests use the separate "flw_test" database on the project MySQL. If it is not running they are skipped, not failed.
import { createPool, migrate, dbReachable, config } from '../server/db.js';

export const testPool = createPool({ database: process.env.DB_NAME_TEST || 'flw_test' });
export const dbUp = await dbReachable(testPool);
export const skip = dbUp ? false : 'MySQL não está acessível (confirma que o serviço está a correr e que o .env está certo)';
if (dbUp) await migrate(testPool);
export async function clean() {
  for (const t of ['qr_scans', 'qr_codes', 'api_usage', 'api_keys', 'jobs', 'payment_requests', 'subscriptions', 'user_settings', 'login_events', 'sessions', 'newsletter_subscribers', 'mail_log', 'users']) await testPool.query(`DELETE FROM ${t}`);
}
export { config };
