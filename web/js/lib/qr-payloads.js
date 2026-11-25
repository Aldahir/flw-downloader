// What goes inside each kind of QR code. Pure functions (no DOM), so they are unit-tested in Node.
// Everything is built in the browser; nothing here is sent anywhere.
export const TEXT_MAX = 1200;
const trim = (v) => String(v ?? '').trim();
const digits = (v) => { const t = trim(v); return (t.startsWith('+') ? '+' : '') + t.replace(/\D/g, ''); }; // digits and a leading +
const url = (v) => { const t = trim(v); if (!t) return ''; const u = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`; try { const p = new URL(u); return p.protocol === 'http:' || p.protocol === 'https:' ? p.href : ''; } catch { return ''; } };
const vEsc = (v) => trim(v).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
const wEsc = (v) => String(v).replace(/([\\;,:"])/g, '\\$1');
const utc = (local) => { const d = new Date(local); return Number.isNaN(d.getTime()) ? '' : d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };

export class FieldError extends Error {}
const need = (v, msg) => { if (!v) throw new FieldError(msg); return v; };

export const TYPES = [
  { id: 'url', label: 'Link', icon: 'link', hint: 'Abre um site', fields: [{ k: 'url', label: 'Endereço do site', type: 'text', ph: 'exemplo.com/pagina', req: true }],
    build: (f) => need(url(f.url), 'Escreve um endereço válido (http ou https).') },
  { id: 'text', label: 'Texto', icon: 'captions', hint: `Até ${TEXT_MAX} caracteres`, fields: [{ k: 'text', label: 'Texto', type: 'area', max: TEXT_MAX, req: true }],
    build: (f) => { const t = String(f.text ?? ''); need(t.trim(), 'Escreve o texto.'); if (t.length > TEXT_MAX) throw new FieldError(`O texto tem ${t.length} caracteres; o máximo é ${TEXT_MAX}.`); return t; } },
  { id: 'sms', label: 'Mensagem', icon: 'mail', hint: 'SMS pronto a enviar', fields: [{ k: 'phone', label: 'Telefone (com indicativo)', type: 'tel', ph: '+351 912 345 678', req: true }, { k: 'msg', label: 'Mensagem', type: 'area', max: 300 }],
    build: (f) => { const n = need(digits(f.phone), 'Escreve o número de telefone.'); return `SMSTO:${n}:${trim(f.msg)}`; } },
  { id: 'call', label: 'Chamada', icon: 'phone', hint: 'Liga para um número', fields: [{ k: 'phone', label: 'Telefone (com indicativo)', type: 'tel', ph: '+351 912 345 678', req: true }],
    build: (f) => `tel:${need(digits(f.phone), 'Escreve o número de telefone.')}` },
  { id: 'email', label: 'E-mail', icon: 'at-sign', hint: 'Escreve um email', fields: [{ k: 'to', label: 'Para', type: 'email', ph: 'nome@exemplo.com', req: true }, { k: 'subject', label: 'Assunto', type: 'text' }, { k: 'body', label: 'Mensagem', type: 'area', max: 500 }],
    build: (f) => { const to = need(trim(f.to), 'Escreve o email de destino.'); if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) throw new FieldError('Esse email não parece válido.');
      const q = [['subject', trim(f.subject)], ['body', trim(f.body)]].filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&'); return `mailto:${to}${q ? `?${q}` : ''}`; } },
  { id: 'vcard', label: 'Cartão de visita', icon: 'contact', hint: 'Guarda um contacto', fields: [
      { k: 'first', label: 'Nome', type: 'text', req: true }, { k: 'last', label: 'Apelido', type: 'text' }, { k: 'org', label: 'Empresa', type: 'text' }, { k: 'title', label: 'Cargo', type: 'text' },
      { k: 'mobile', label: 'Telemóvel', type: 'tel' }, { k: 'work', label: 'Telefone de trabalho', type: 'tel' }, { k: 'email', label: 'Email', type: 'email' }, { k: 'site', label: 'Site', type: 'text' },
      { k: 'street', label: 'Morada', type: 'text' }, { k: 'city', label: 'Cidade', type: 'text' }, { k: 'zip', label: 'Código postal', type: 'text' }, { k: 'country', label: 'País', type: 'text' }],
    build: (f) => { need(trim(f.first) || trim(f.last), 'Escreve pelo menos o nome.');
      const L = ['BEGIN:VCARD', 'VERSION:3.0', `N:${vEsc(f.last)};${vEsc(f.first)};;;`, `FN:${vEsc(`${trim(f.first)} ${trim(f.last)}`.trim())}`];
      if (trim(f.org)) L.push(`ORG:${vEsc(f.org)}`); if (trim(f.title)) L.push(`TITLE:${vEsc(f.title)}`);
      if (digits(f.mobile)) L.push(`TEL;TYPE=CELL:${digits(f.mobile)}`); if (digits(f.work)) L.push(`TEL;TYPE=WORK:${digits(f.work)}`);
      if (trim(f.email)) L.push(`EMAIL:${vEsc(f.email)}`); if (url(f.site)) L.push(`URL:${url(f.site)}`);
      if ([f.street, f.city, f.zip, f.country].some(trim)) L.push(`ADR;TYPE=WORK:;;${vEsc(f.street)};${vEsc(f.city)};;${vEsc(f.zip)};${vEsc(f.country)}`);
      L.push('END:VCARD'); return L.join('\n'); } },
  { id: 'wifi', label: 'Wi-Fi', icon: 'wifi', hint: 'Liga à rede sem escrever a palavra-passe', fields: [
      { k: 'ssid', label: 'Nome da rede (SSID)', type: 'text', req: true }, { k: 'sec', label: 'Segurança', type: 'select', options: [['WPA', 'WPA/WPA2/WPA3'], ['WEP', 'WEP'], ['nopass', 'Sem palavra-passe']] },
      { k: 'pass', label: 'Palavra-passe', type: 'text', showIf: (f) => f.sec !== 'nopass' }, { k: 'hidden', label: 'Rede oculta', type: 'check' }],
    build: (f) => { const ssid = need(String(f.ssid ?? ''), 'Escreve o nome da rede.'); const sec = ['WPA', 'WEP', 'nopass'].includes(f.sec) ? f.sec : 'WPA';
      if (sec !== 'nopass') need(String(f.pass ?? ''), 'Escreve a palavra-passe da rede.');
      return `WIFI:T:${sec};S:${wEsc(ssid)};${sec !== 'nopass' ? `P:${wEsc(f.pass)};` : ''}${f.hidden ? 'H:true;' : ''};`; } },
  { id: 'whatsapp', label: 'WhatsApp', icon: 'message-circle', hint: 'Abre uma conversa', fields: [{ k: 'phone', label: 'Telefone (com indicativo)', type: 'tel', ph: '+351 912 345 678', req: true }, { k: 'msg', label: 'Mensagem inicial', type: 'area', max: 300 }],
    build: (f) => { const n = need(digits(f.phone).replace('+', ''), 'Escreve o número de telefone.'); return `https://wa.me/${n}${trim(f.msg) ? `?text=${encodeURIComponent(trim(f.msg))}` : ''}`; } },
  { id: 'event', label: 'Evento', icon: 'calendar', hint: 'Adiciona ao calendário', fields: [
      { k: 'title', label: 'Título', type: 'text', req: true }, { k: 'start', label: 'Início', type: 'datetime-local', req: true }, { k: 'end', label: 'Fim', type: 'datetime-local' }, { k: 'place', label: 'Local', type: 'text' }, { k: 'desc', label: 'Descrição', type: 'area', max: 300 }],
    build: (f) => { need(trim(f.title), 'Escreve o título do evento.'); const s = need(utc(f.start), 'Escolhe a data de início.'); const e = f.end ? utc(f.end) : '';
      if (e && e < s) throw new FieldError('O fim tem de ser depois do início.');
      return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', `SUMMARY:${vEsc(f.title)}`, `DTSTART:${s}`, e && `DTEND:${e}`, trim(f.place) && `LOCATION:${vEsc(f.place)}`, trim(f.desc) && `DESCRIPTION:${vEsc(f.desc)}`, 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\n'); } },
  { id: 'geo', label: 'Localização', icon: 'map-pin', hint: 'Abre no mapa', fields: [{ k: 'lat', label: 'Latitude', type: 'text', ph: '38.7223', req: true }, { k: 'lng', label: 'Longitude', type: 'text', ph: '-9.1393', req: true }],
    build: (f) => { const la = Number(trim(f.lat).replace(',', '.')), lo = Number(trim(f.lng).replace(',', '.'));
      if (!trim(f.lat) || !trim(f.lng) || !Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) throw new FieldError('Escreve latitude (−90 a 90) e longitude (−180 a 180).'); return `geo:${la},${lo}`; } },
  { id: 'media', label: 'Áudio / Vídeo', icon: 'film', hint: 'Link para um áudio ou vídeo', fields: [{ k: 'url', label: 'Endereço do áudio ou vídeo', type: 'text', ph: 'youtube.com/watch?v=… ou ficheiro .mp4/.mp3', req: true }],
    build: (f) => need(url(f.url), 'Escreve o endereço do áudio ou vídeo (http ou https).') },
];
export const typeById = (id) => TYPES.find((t) => t.id === id) || TYPES[0];
