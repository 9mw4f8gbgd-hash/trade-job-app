import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLogo, LOGO_MAX_BYTES } from './logo.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('logo accepts png, jpeg, gif, and webp and rejects other types and oversize files', () => {
  const png = parseLogo(`data:image/png;base64,${PNG.toString('base64')}`);
  assert.equal(png.error, undefined);
  assert.ok(png.dataUrl.startsWith('data:image/png;base64,'));

  const jpg = parseLogo(`data:image/jpg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64')}`);
  assert.ok(jpg.dataUrl.startsWith('data:image/jpeg;base64,'));

  const gif = Buffer.alloc(12);
  gif.write('GIF89a', 0, 'ascii');
  assert.ok(parseLogo(`data:image/gif;base64,${gif.toString('base64')}`).dataUrl.startsWith('data:image/gif;base64,'));

  const webp = Buffer.alloc(16);
  webp.write('RIFF', 0, 'ascii');
  webp.write('WEBP', 8, 'ascii');
  assert.ok(parseLogo(`data:image/webp;base64,${webp.toString('base64')}`).dataUrl.startsWith('data:image/webp;base64,'));

  assert.match(parseLogo('data:image/svg+xml;base64,PHN2Zy8+').error, /PNG, JPEG/);
  assert.match(parseLogo('data:text/html;base64,SGk=').error, /PNG, JPEG/);
  assert.match(parseLogo(`data:image/jpeg;base64,${PNG.toString('base64')}`).error, /does not match/);
  assert.match(parseLogo(null).error, /PNG, JPEG/);

  const big = Buffer.concat([PNG, Buffer.alloc(LOGO_MAX_BYTES)]);
  assert.match(parseLogo(`data:image/png;base64,${big.toString('base64')}`).error, /512 KB/);
});
