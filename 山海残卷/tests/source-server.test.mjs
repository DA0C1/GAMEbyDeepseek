import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import { test } from 'node:test';
import { createServer } from '../tools/serve.cjs';

const root = new URL('../', import.meta.url);

async function fixture(t) {
  const server = createServer();
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  return (pathname, method = 'GET') => new Promise((resolve, reject) => {
    // Keep the path verbatim: URL-based clients normalize traversal before sending it.
    const request = http.request({ host: '127.0.0.1', port, path: pathname, method, agent: false }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks)
      }));
    });
    request.setTimeout(2000, () => request.destroy(new Error(`Request timed out: ${method} ${pathname}`)));
    request.on('error', reject);
    request.end();
  });
}

test('source server serves both entry pages and ignores query strings', { timeout: 10000 }, async t => {
  const request = await fixture(t);
  const main = await readFile(new URL('index.html', root));
  const ai = await readFile(new URL('ai-test.html', root));
  for (const [pathname, expected] of [
    ['/', main],
    ['/index.html', main],
    ['/?cache=1&ignored=%00', main],
    ['/index.html?cache=2', main],
    ['/ai-test.html?scenario=battle', ai]
  ]) {
    const response = await request(pathname);
    assert.equal(response.status, 200, pathname);
    assert.equal(response.headers['content-type'], 'text/html; charset=utf-8', pathname);
    assert.equal(response.headers['content-length'], String(expected.length), pathname);
    assert.equal(response.headers['cache-control'], 'no-store', pathname);
    assert.deepEqual(response.body, expected, pathname);
  }
});

test('source server serves asset bytes and returns matching HEAD metadata without a body', { timeout: 10000 }, async t => {
  const request = await fixture(t);
  for (const [file, contentType] of [
    ['index.html', 'text/html; charset=utf-8'],
    ['css/style.css', 'text/css; charset=utf-8'],
    ['src/main.js', 'text/javascript; charset=utf-8'],
    ['package.json', 'application/json; charset=utf-8'],
    ['assets/art/bg_act1.webp', 'image/webp']
  ]) {
    const expected = await readFile(new URL(file, root));
    const get = await request(`/${file}?asset=1`);
    assert.equal(get.status, 200, file);
    assert.equal(get.headers['content-type'], contentType, file);
    assert.deepEqual(get.body, expected, file);
    const head = await request(`/${file}?asset=2`, 'HEAD');
    assert.equal(head.status, 200, file);
    assert.equal(head.headers['content-type'], contentType, file);
    assert.equal(head.headers['content-length'], String(expected.length), file);
    assert.equal(head.headers['cache-control'], 'no-store', file);
    assert.equal(head.body.length, 0, file);
  }
  const audio = await request('/assets/audio/bgm_title.mp3', 'HEAD');
  assert.equal(audio.status, 200);
  assert.equal(audio.headers['content-type'], 'audio/mpeg');
  assert.equal(audio.headers['content-length'], String((await stat(new URL('assets/audio/bgm_title.mp3', root))).size));
  assert.equal(audio.body.length, 0);
});

test('source server rejects unsupported methods and does not serve directories or missing files', { timeout: 10000 }, async t => {
  const request = await fixture(t);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const response = await request('/index.html', method);
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.allow, 'GET, HEAD', method);
    assert.equal(response.body.length, 0, method);
  }
  for (const pathname of ['/missing-source-server-test.html', '/assets', '/assets/']) {
    for (const method of ['GET', 'HEAD']) {
      const response = await request(pathname, method);
      assert.equal(response.status, 404, `${method} ${pathname}`);
      assert.equal(response.body.length, 0, `${method} ${pathname}`);
    }
  }
  assert.equal((await request('/')).status, 200);
});

test('source server rejects encoded traversal, malformed escapes and NUL paths without crashing', { timeout: 10000 }, async t => {
  const request = await fixture(t);
  const expected = await readFile(new URL('index.html', root));
  for (const pathname of [
    '/..%2fREADME.md',
    '/%2e%2e%2fREADME.md',
    '/assets/%2e%2e%2f%2e%2e%2fREADME.md',
    '/%',
    '/%ZZ',
    '/%E0%A4%A',
    '/%00',
    '/index.html%00',
    '/assets/%00/missing.webp'
  ]) {
    const response = await request(pathname);
    assert.equal(response.status, 400, pathname);
    assert.equal(response.body.length, 0, pathname);
    const healthy = await request('/');
    assert.equal(healthy.status, 200, `Server remains available after ${pathname}`);
    assert.deepEqual(healthy.body, expected, pathname);
  }
});
