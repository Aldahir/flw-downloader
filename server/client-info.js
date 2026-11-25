// Who is calling: device, system and browser from the User-Agent, approximate place from the IP (offline database),
// and a keyed hash of the IP. The IP itself is never stored: the hash only lets us count distinct visitors.
import crypto from 'node:crypto';
import geoip from 'geoip-lite';

const SECRET = process.env.IP_SECRET || crypto.randomBytes(32).toString('hex'); // without IP_SECRET, uniqueness resets on restart
export const hashIp = (ip) => (ip ? crypto.createHmac('sha256', SECRET).update(ip).digest('hex') : null);

export function parseUa(ua = '') {
  ua = String(ua).slice(0, 400);
  const bot = /bot|crawler|spider|crawling|preview|facebookexternalhit|slurp|curl|wget|python-requests|httpclient/i.test(ua);
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : '';
  const browser = /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Edg(e|A|iOS)?\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Chrome|CriOS/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : '';
  const device = bot ? 'bot' : /iPad|Tablet|PlayBook/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? 'tablet' : /Mobi|iPhone|iPod|Android/.test(ua) ? 'mobile' : 'desktop';
  return { device, os, browser };
}

const privateIp = (ip) => !ip || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|fc|fd|fe80)/i.test(ip);
export function place(ip) {
  if (privateIp(ip)) return { country: null, region: null, city: null };
  const g = geoip.lookup(ip); // eslint-disable-line
  return g ? { country: g.country || null, region: g.region || null, city: g.city || null } : { country: null, region: null, city: null };
}

// Behind a reverse proxy set TRUST_PROXY=1 so the real visitor address is read from X-Forwarded-For.
export function ipOf(req) {
  const fwd = process.env.TRUST_PROXY === '1' ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
  return (fwd || req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
}
export function clientInfo(req) {
  const ip = ipOf(req); const ua = parseUa(req.headers['user-agent']);
  return { ...ua, ...place(ip), ipHash: hashIp(ip) };
}
