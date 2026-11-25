import test from 'node:test';
import assert from 'node:assert/strict';
import { typeById, TEXT_MAX, FieldError } from '../web/js/lib/qr-payloads.js';

const b = (id, f) => typeById(id).build(f);
test('url: adds https, rejects other schemes', () => {
  assert.equal(b('url', { url: 'exemplo.com/a b' }), 'https://exemplo.com/a%20b');
  assert.equal(b('url', { url: 'http://x.org' }), 'http://x.org/');
  assert.throws(() => b('url', { url: 'javascript:alert(1)' }), FieldError);
  assert.throws(() => b('url', { url: '' }), FieldError);
});
test('text: 1200 characters allowed, 1201 refused', () => {
  assert.equal(b('text', { text: 'a'.repeat(TEXT_MAX) }).length, 1200);
  assert.throws(() => b('text', { text: 'a'.repeat(TEXT_MAX + 1) }), /1201/);
  assert.throws(() => b('text', { text: '   ' }), FieldError);
});
test('sms, call, whatsapp clean the phone number', () => {
  assert.equal(b('sms', { phone: '+351 912-345 678', msg: 'Olá' }), 'SMSTO:+351912345678:Olá');
  assert.equal(b('call', { phone: '(21) 555 01 00' }), 'tel:215550100');
  assert.equal(b('whatsapp', { phone: '+351 912 345 678', msg: 'oi & tchau' }), 'https://wa.me/351912345678?text=oi%20%26%20tchau');
  assert.throws(() => b('call', { phone: 'abc' }), FieldError);
});
test('email builds a mailto with encoded fields', () => {
  assert.equal(b('email', { to: 'a@b.pt', subject: 'Olá mundo', body: 'x&y' }), 'mailto:a@b.pt?subject=Ol%C3%A1%20mundo&body=x%26y');
  assert.equal(b('email', { to: 'a@b.pt' }), 'mailto:a@b.pt');
  assert.throws(() => b('email', { to: 'nope' }), FieldError);
});
test('wifi escapes special characters and handles open networks', () => {
  assert.equal(b('wifi', { ssid: 'Casa;1', sec: 'WPA', pass: String.raw`a:b,c\d`, hidden: true }), String.raw`WIFI:T:WPA;S:Casa\;1;P:a\:b\,c\\d;H:true;;`);
  assert.equal(b('wifi', { ssid: 'Aberta', sec: 'nopass' }), 'WIFI:T:nopass;S:Aberta;;');
  assert.throws(() => b('wifi', { ssid: 'x', sec: 'WPA', pass: '' }), FieldError);
});
test('vcard escapes and keeps only filled fields', () => {
  const v = b('vcard', { first: 'Ana', last: 'Silva; Jr', org: 'A,B', mobile: '+351 912 345 678', email: 'a@b.pt', site: 'ana.pt' });
  assert.match(v, /^BEGIN:VCARD\nVERSION:3\.0\nN:Silva\\; Jr;Ana;;;\nFN:Ana Silva\\; Jr\n/);
  assert.match(v, /ORG:A\\,B/); assert.match(v, /TEL;TYPE=CELL:\+351912345678/); assert.match(v, /URL:https:\/\/ana\.pt\//); assert.ok(!v.includes('ADR')); assert.ok(v.endsWith('END:VCARD'));
  assert.throws(() => b('vcard', {}), FieldError);
});
test('event: UTC times, end must follow start', () => {
  const e = b('event', { title: 'Jantar', start: '2027-01-02T20:00', end: '2027-01-02T22:00', place: 'Lisboa' });
  assert.match(e, /DTSTART:\d{8}T\d{6}Z/); assert.match(e, /LOCATION:Lisboa/);
  assert.throws(() => b('event', { title: 'x', start: '2027-01-02T20:00', end: '2027-01-02T19:00' }), FieldError);
});
test('geo validates ranges; media needs http(s)', () => {
  assert.equal(b('geo', { lat: '38,7223', lng: '-9.1393' }), 'geo:38.7223,-9.1393');
  assert.throws(() => b('geo', { lat: '91', lng: '0' }), FieldError);
  assert.equal(b('media', { url: 'youtube.com/watch?v=1' }), 'https://youtube.com/watch?v=1');
  assert.throws(() => b('media', { url: 'ftp://x' }), FieldError);
});
