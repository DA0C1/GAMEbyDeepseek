'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const launcher = path.join(root, '山海残卷/tools/launch-posix.cjs');
const source = fs.readFileSync(launcher, 'utf8');

function fixture() {
  const logs = [];
  const errors = [];
  const opened = [];
  const process = new EventEmitter();
  Object.assign(process, { argv: [], versions: { node: '22.0.0' }, platform: 'linux', env: { DISPLAY: ':fixture' } });
  const server = new EventEmitter();
  server.listen = (port, host, callback) => { Object.assign(server, { port, host, ready: callback }); };
  server.close = () => { server.closed = true; };
  server.closeAllConnections = () => { server.connectionsClosed = true; };
  const module = { exports: {} };
  const require = name => {
    if (name === './serve.cjs') return { createServer: () => server };
    if (name === 'node:child_process') return { spawn: (...args) => {
      opened.push(args);
      const child = new EventEmitter();
      child.unref = () => {};
      return child;
    } };
    throw new Error(name);
  };
  vm.runInNewContext(source, { require, module, process, console: {
    log: message => logs.push(message), error: message => errors.push(message)
  } }, { filename: launcher });
  return { api: module.exports, logs, errors, opened, process, server };
}

for (const [args, port, page] of [[[], 8899, 'index.html'], [['--ai'], 8898, 'ai-test.html'], [['--port', '9000'], 9000, 'index.html']]) {
  const f = fixture();
  f.api.main(args);
  assert.equal(f.server.host, '127.0.0.1');
  assert.equal(f.server.port, port);
  assert.equal(f.logs.length, 0, 'never claims ready before listen succeeds');
  assert.equal(f.opened.length, 0, 'never opens browser before listen succeeds');
  f.server.ready();
  assert.ok(f.logs[0].includes(`http://127.0.0.1:${port}/${page}`));
  assert.equal(f.opened[0][0], 'xdg-open');
  assert.equal(f.opened[0][1][0], `http://127.0.0.1:${port}/${page}`);
  f.process.emit('SIGINT');
  assert.equal(f.server.closed, true);
  assert.equal(f.server.connectionsClosed, true);
}
console.log('PASS regular/AI launch, custom ports, ready signal and foreground cleanup');

for (const noOpen of [true, false]) {
  const f = fixture();
  if (!noOpen) f.process.env = {};
  f.api.main(noOpen ? ['--no-open'] : []);
  f.server.ready();
  assert.equal(f.opened.length, 0);
}
console.log('PASS explicit no-open and headless environments do not open a browser');

const mac = fixture();
mac.process.platform = 'darwin';
mac.process.env = {};
mac.api.main([]);
mac.server.ready();
assert.equal(mac.opened[0][0], 'open');
const oldNode = fixture();
oldNode.process.versions.node = '20.0.0';
oldNode.api.main([]);
assert.equal(oldNode.process.exitCode, 1);
assert.equal(oldNode.server.port, undefined);
console.log('PASS macOS opener selection and minimum Node.js version');

for (const args of [['--port'], ['--port', '0'], ['--port', '65536'], ['--port', '3x'], ['--unknown']]) {
  const f = fixture();
  f.api.main(args);
  assert.equal(f.process.exitCode, 1);
  assert.equal(f.server.port, undefined);
}
const f = fixture();
f.api.main([]);
f.server.emit('error', Object.assign(new Error('address in use'), { code: 'EADDRINUSE' }));
assert.equal(f.process.exitCode, 1);
assert.ok(f.errors[0].includes('8899'));
assert.equal(f.opened.length, 0);
console.log('PASS invalid arguments and occupied ports fail without opening an unrelated server');

for (const name of ['启动游戏.sh', '启动AI测试版.sh']) {
  const result = spawnSync('sh', [path.join(root, '山海残卷', name), '--help'], { cwd: '/tmp', encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('--no-open'));
  assert.ok(result.stdout.includes('sh 启动游戏.sh'));
  assert.ok(result.stdout.includes('sh 启动AI测试版.sh'));
  assert.ok(!result.stdout.includes('./启动'), 'help must not require executable file modes');
}
console.log('PASS Unicode shell launchers resolve their directory from another working directory');
