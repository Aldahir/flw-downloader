export async function api(path, opts = {}) {
  let init = opts;
  if (opts.body != null && !(opts.body instanceof Blob)) {
    const body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
    init = { ...opts, method: opts.method || 'POST', headers: { 'Content-Type': 'application/json', ...opts.headers }, body };
  }
  const r = await fetch(path, init); // same-origin: the session cookie travels with it
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { detail: j.detail, status: r.status, upgrade: !!j.upgrade });
  return j;
}
