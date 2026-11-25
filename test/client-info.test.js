import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUa, place, hashIp } from '../server/client-info.js';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  firefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
  bot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
};
test('user agents become device, system and browser', () => {
  assert.deepEqual(parseUa(UA.iphone), { device: 'mobile', os: 'iOS', browser: 'Safari' });
  assert.deepEqual(parseUa(UA.android), { device: 'mobile', os: 'Android', browser: 'Chrome' });
  assert.deepEqual(parseUa(UA.ipad), { device: 'tablet', os: 'iOS', browser: 'Safari' });
  assert.deepEqual(parseUa(UA.mac), { device: 'desktop', os: 'macOS', browser: 'Chrome' });
  assert.deepEqual(parseUa(UA.edge), { device: 'desktop', os: 'Windows', browser: 'Edge' });
  assert.deepEqual(parseUa(UA.firefox), { device: 'desktop', os: 'Linux', browser: 'Firefox' });
  assert.equal(parseUa(UA.bot).device, 'bot');
  assert.deepEqual(parseUa(undefined), { device: 'desktop', os: '', browser: '' });
});
test('place: public IPs get a country, private ones none', () => {
  assert.equal(place('8.8.8.8').country, 'US');
  for (const ip of ['127.0.0.1', '192.168.1.5', '10.0.0.2', '::1', '']) assert.deepEqual(place(ip), { country: null, region: null, city: null }, ip);
});
test('the IP is hashed, never kept', () => {
  assert.match(hashIp('203.0.113.9'), /^[a-f0-9]{64}$/); assert.equal(hashIp('203.0.113.9'), hashIp('203.0.113.9')); assert.notEqual(hashIp('203.0.113.9'), hashIp('203.0.113.10')); assert.equal(hashIp(''), null);
});
