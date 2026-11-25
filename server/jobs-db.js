// Mirrors the job history into MySQL so the profile can list, filter and summarise it. The files themselves stay on disk.
import { listFiles } from './jobs.js';

const when = (ms) => (ms ? new Date(ms) : null);
export function createJobsDb(pool) {
  const seen = new Map(); // job id -> last recorded signature, so progress ticks don't hit the database
  async function record(job) {
    if (job.kind === 'model') return;
    const sig = [job.status, job.title, job.error, job.stage, job.userId].join('|');
    if (seen.get(job.id) === sig) return; seen.set(job.id, sig);
    const done = ['done', 'error', 'cancelled', 'interrupted'].includes(job.status);
    const size = job.status === 'done' ? listFiles(job).reduce((s, f) => s + f.size, 0) : 0;
    const row = (uid) => [job.id, uid, job.kind || 'download', String(job.title || '').slice(0, 255), job.url || null, job.platform || 'other', job.status, String(job.stage || '').slice(0, 120), job.error || null, size, when(job.createdAt), done ? new Date() : null];
    const sql = 'INSERT INTO jobs (id, user_id, kind, title, url, platform, status, stage, error, size_bytes, created_at, finished_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id), title=VALUES(title), platform=VALUES(platform), status=VALUES(status), stage=VALUES(stage), error=VALUES(error), size_bytes=VALUES(size_bytes), finished_at=VALUES(finished_at)';
    try { await pool.query(sql, row(job.userId || null)); }
    catch (e) { if (e.code === 'ER_NO_REFERENCED_ROW_2') await pool.query(sql, row(null)).catch(() => {}); else seen.delete(job.id); }
  }
  return {
    record,
    forget: (id) => { seen.delete(id); return pool.query('DELETE FROM jobs WHERE id=?', [id]).catch(() => {}); },
    async history(userId, { platform = '', status = '', q = '', page = 1, pageSize = 20 } = {}) {
      const where = ['user_id=?']; const args = [userId];
      if (platform) { where.push('platform=?'); args.push(platform); } if (status) { where.push('status=?'); args.push(status); }
      if (q) { where.push('title LIKE ?'); args.push(`%${String(q).replace(/[%_]/g, '\\$&').slice(0, 80)}%`); }
      page = Math.max(1, Number(page) || 1); pageSize = Math.min(50, Math.max(1, Number(pageSize) || 20));
      const [[{ n }]] = await pool.query(`SELECT COUNT(*) n FROM jobs WHERE ${where.join(' AND ')}`, args);
      const [rows] = await pool.query(`SELECT id, kind, title, url, platform, status, stage, error, size_bytes, created_at, finished_at FROM jobs WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...args, pageSize, (page - 1) * pageSize]);
      return { total: n, page, pageSize, items: rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, url: r.url, platform: r.platform, status: r.status, stage: r.stage, error: r.error, size: Number(r.size_bytes), createdAt: new Date(r.created_at).getTime(), finishedAt: r.finished_at ? new Date(r.finished_at).getTime() : null })) };
    },
    async summary(userId) {
      const [[t]] = await pool.query("SELECT COUNT(*) total, SUM(status='done') done, SUM(status='error') errors, COALESCE(SUM(size_bytes),0) bytes FROM jobs WHERE user_id=?", [userId]);
      const [byPlatform] = await pool.query("SELECT platform, COUNT(*) n FROM jobs WHERE user_id=? AND kind<>'import' GROUP BY platform ORDER BY n DESC", [userId]);
      const [perMonth] = await pool.query("SELECT DATE_FORMAT(created_at, '%Y-%m') m, COUNT(*) n FROM jobs WHERE user_id=? AND created_at >= UTC_DATE() - INTERVAL 6 MONTH GROUP BY m ORDER BY m", [userId]);
      return { total: Number(t.total), done: Number(t.done || 0), errors: Number(t.errors || 0), bytes: Number(t.bytes), byPlatform, perMonth };
    },
  };
}
