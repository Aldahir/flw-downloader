import test from 'node:test';
import assert from 'node:assert/strict';
import { openapi } from '../server/openapi.js';
import { TYPES } from '../web/js/lib/qr-payloads.js';

test('the OpenAPI document lists every endpoint and QR type', () => {
  const d = openapi('http://localhost:3777');
  assert.equal(d.openapi, '3.0.3'); assert.equal(d.servers[0].url, 'http://localhost:3777/api/v1');
  for (const p of ['/qr/create', '/videos', '/videos/{id}', '/videos/{id}/files/{name}', '/usage']) assert.ok(d.paths[p], p);
  assert.deepEqual(d.paths['/qr/create'].post.requestBody.content['application/json'].schema.properties.type.enum, TYPES.map((t) => t.id));
  assert.deepEqual(d.security, [{ ApiKey: [] }]);
});
