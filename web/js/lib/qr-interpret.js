// Turns a decoded QR string into something a person can act on: open a link, call a number, save a contact,
// add an event, join a Wi-Fi network... Pure parsing, no DOM.
const unesc = (v) => String(v ?? '').replace(/\\([\\;,])/g, '$1').replace(/\\n/g, '\n');
// Splits a vCard/iCal "KEY:value" or "KEY;a=b:value" line into its key and value, respecting the backslash escapes above.
const splitLines = (s) => s.split(/\r\n|\r|\n/).filter(Boolean);

function parseWifi(s) {
  const m = {}; const body = s.slice(5).replace(/;;$/, ';');
  for (const part of body.split(/(?<!\\);/)) { const i = part.indexOf(':'); if (i < 0) continue; m[part.slice(0, i)] = unesc(part.slice(i + 1)); }
  return { kind: 'wifi', ssid: m.S || '', security: m.T || 'WPA', password: m.P || '', hidden: m.H === 'true' };
}
function parseVcard(s) {
  const out = { kind: 'vcard', name: '', org: '', phones: [], emails: [] };
  for (const line of splitLines(s)) {
    const i = line.indexOf(':'); if (i < 0) continue;
    const key = line.slice(0, i).split(';')[0].toUpperCase(), val = unesc(line.slice(i + 1));
    if (key === 'FN') out.name = val; else if (key === 'ORG') out.org = val;
    else if (key === 'TEL') out.phones.push(val); else if (key === 'EMAIL') out.emails.push(val);
  }
  return out;
}
function parseVevent(s) {
  const out = { kind: 'event', title: '', start: '', end: '', place: '' };
  const fmt = (v) => (/^\d{8}T\d{6}/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)} ${v.slice(9, 11)}:${v.slice(11, 13)}` : v);
  for (const line of splitLines(s)) {
    const i = line.indexOf(':'); if (i < 0) continue;
    const key = line.slice(0, i).split(';')[0].toUpperCase(), val = unesc(line.slice(i + 1));
    if (key === 'SUMMARY') out.title = val; else if (key === 'DTSTART') out.start = fmt(val); else if (key === 'DTEND') out.end = fmt(val); else if (key === 'LOCATION') out.place = val;
  }
  return out;
}

export function interpret(raw) {
  const text = String(raw ?? '');
  if (/^WIFI:/i.test(text)) return parseWifi(text);
  if (/^BEGIN:VCARD/i.test(text)) return { ...parseVcard(text), raw: text };
  if (/^BEGIN:VCALENDAR/i.test(text)) return { ...parseVevent(text), raw: text };
  if (/^mailto:/i.test(text)) { const [addr, qs] = text.slice(7).split('?'); return { kind: 'email', address: addr, href: text, subject: new URLSearchParams(qs).get('subject') || '' }; }
  if (/^tel:/i.test(text)) return { kind: 'tel', number: text.slice(4), href: text };
  if (/^(sms|smsto):/i.test(text)) { const [num, body] = text.replace(/^smsto:/i, '').replace(/^sms:/i, '').split(':'); return { kind: 'sms', number: num, body: body || '', href: `sms:${num}` }; }
  if (/^geo:/i.test(text)) { const [lat, lng] = text.slice(4).split(';')[0].split(','); return { kind: 'geo', lat, lng, href: `https://maps.google.com/?q=${lat},${lng}` }; }
  if (/^https?:\/\//i.test(text)) return { kind: 'url', href: text };
  return { kind: 'text', text };
}
