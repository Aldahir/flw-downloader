// Machine-readable description of the public API (OpenAPI 3.0), served at /api/v1/openapi.json.
import { PLANS } from './plans.js';
import { TYPES } from '../web/js/lib/qr-payloads.js';

export function openapi(baseUrl) {
  const err = { description: 'Erro', content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } } } } } } };
  const l = PLANS.free.api;
  return {
    openapi: '3.0.3', info: { title: 'FLW Downloader API', version: '1.0.0', description: `Gera códigos QR e descarrega vídeos online. Quota diária por chave no plano gratuito: ${l.qrPerDay} QR, ${l.videosPerDay} vídeos (planos Pro têm quotas maiores).` },
    servers: [{ url: `${baseUrl}/api/v1` }],
    components: { securitySchemes: { ApiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' } } }, security: [{ ApiKey: [] }],
    paths: {
      '/qr/create': { post: { summary: 'Criar um código QR', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: {
        data: { type: 'string', maxLength: 2000 }, type: { type: 'string', enum: TYPES.map((t) => t.id) }, fields: { type: 'object' }, format: { type: 'string', enum: ['png', 'svg'] }, size: { type: 'integer', minimum: 64, maximum: 4096 },
        fg: { type: 'string', example: '#000000' }, bg: { type: 'string', example: '#ffffff' }, transparent: { type: 'boolean' }, shape: { type: 'string', enum: ['square', 'rounded', 'dots'] }, frame: { type: 'string', enum: ['none', 'box', 'label'] }, label: { type: 'string', maxLength: 24 },
        margin: { type: 'integer', minimum: 0, maximum: 8 }, ecc: { type: 'string', enum: ['L', 'M', 'Q', 'H'] }, logo: { type: 'string', description: 'PNG, JPEG ou WebP em base64 (até 200 KB)' }, response: { type: 'string', enum: ['image', 'json'] } } } } } },
        responses: { 200: { description: 'Imagem PNG/SVG, ou JSON com response=json' }, 400: err, 401: err, 429: err } } },
      '/videos': { post: { summary: 'Pedir o download de um vídeo', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['url'], properties: { url: { type: 'string' }, kind: { type: 'string', enum: ['video', 'audio'] }, height: { type: 'integer', minimum: 144, maximum: 4320 } } } } } }, responses: { 202: { description: 'Aceite' }, 400: err, 401: err, 429: err, 503: err } } },
      '/videos/{id}': { parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], get: { summary: 'Estado e ficheiros', responses: { 200: { description: 'Estado' }, 404: err } }, delete: { summary: 'Apagar o trabalho e os ficheiros', responses: { 200: { description: 'Apagado' }, 404: err } } },
      '/videos/{id}/files/{name}': { get: { summary: 'Descarregar um ficheiro', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'name', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Ficheiro' }, 404: err } } },
      '/usage': { get: { summary: 'Utilização de hoje', responses: { 200: { description: 'Quota usada e limite' } } } },
    },
  };
}
