import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from '../tools/serve-portable.cjs';

async function fixture(t, ai) {
  const folder = await mkdtemp(path.join(tmpdir(), 'shanhai-server-'));
  const file = path.join(folder, '山海残卷_AI测试版.html');
  const body = '<!doctype html><title>山海残卷</title>';
  await writeFile(file, body);
  const server = createServer({ file, ai });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(file);
    await rmdir(folder);
  });
  return { base: `http://127.0.0.1:${server.address().port}`, body };
}

test('portable AI routes serve the same file through root, source-style alias and encoded filename', async t => {
  const { base, body } = await fixture(t, true);
  for (const route of ['/', '/index.html', '/ai-test.html', '/' + encodeURIComponent('山海残卷_AI测试版.html')]) {
    const response = await fetch(base + route + '?test=1');
    assert.equal(response.status, 200, route);
    assert.equal(await response.text(), body);
    const head = await fetch(base + route, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), String(Buffer.byteLength(body)));
    assert.equal(await head.text(), '');
  }
  assert.equal((await fetch(base + '/missing')).status, 404);
  assert.equal((await fetch(base + '/%ZZ')).status, 400);
  const post = await fetch(base + '/ai-test.html', { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD');
});

test('portable normal server does not expose its file as an AI entry', async t => {
  const { base, body } = await fixture(t, false);
  assert.equal(await (await fetch(base + '/')).text(), body);
  assert.equal((await fetch(base + '/ai-test.html')).status, 404);
});
