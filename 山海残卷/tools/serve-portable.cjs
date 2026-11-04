'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

function createServer({ file, ai = false }) {
  const gameFile = path.resolve(file);
  const aliases = new Set(['/', '/index.html', '/' + path.basename(gameFile)]);
  if (ai) aliases.add('/ai-test.html');
  return http.createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
    catch { response.writeHead(400).end(); return; }
    if (!aliases.has(pathname)) { response.writeHead(404).end('Not found'); return; }
    fs.stat(gameFile, (error, stats) => {
      if (error || !stats.isFile()) { response.writeHead(500).end('Game file unavailable'); return; }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': stats.size,
        'Cache-Control': 'no-store', 'X-Shanhai-Local': ai ? 'v3.9.4-archive1-ai' : 'v3.9.4-archive1' });
      if (request.method === 'HEAD') { response.end(); return; }
      const stream = fs.createReadStream(gameFile);
      stream.on('error', () => response.destroy());
      response.on('close', () => stream.destroy());
      stream.pipe(response);
    });
  });
}

function start({ ai = process.argv.includes('--ai'), file, port } = {}) {
  file ||= path.resolve(__dirname, '../dist', ai ? '山海残卷_AI测试版.html' : '山海残卷_单文件版.html');
  port ??= ai ? 8002 : 8001;
  const server = createServer({ file, ai });
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Shanhai Scrolls: http://localhost:${server.address().port}/`));
  return server;
}

if (require.main === module) start();
module.exports = { createServer, start };
