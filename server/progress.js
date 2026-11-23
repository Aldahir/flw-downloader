// Parses the progress lines our yt-dlp --progress-template prints.
// "PROGRESS  42.3%|2|10|1.2MiB/s|00:12|4.2MiB|9.9MiB|NA" -> numbers and short display strings (NA = unknown)
const clean = (v) => { v = String(v ?? '').trim(); return /^[\w.\/~: -]{1,24}$/.test(v) && !/^(NA|Unknown)/i.test(v) ? v : ''; };
export function parseProgress(line) {
  const m = line.match(/PROGRESS\s+(.*)/); if (!m) return null;
  const [pct, idx, n, speed, eta, done, total, est] = m[1].split('|');
  const p = parseFloat(pct); if (!Number.isFinite(p)) return null;
  const t = clean(total) || clean(est);
  return { pct: p, idx: Number(idx) || 0, n: Number(n) || 0, speed: clean(speed), eta: clean(eta), sizeText: clean(done) && t ? `${clean(done)} de ${t}` : clean(done) };
}
