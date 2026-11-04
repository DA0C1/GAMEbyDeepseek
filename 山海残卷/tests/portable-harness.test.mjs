import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';

const scriptPath = fileURLToPath(new URL('../tools/portable-check.cjs', import.meta.url));
const source = readFileSync(scriptPath, 'utf8');
const artifacts = path.resolve(path.dirname(scriptPath), '../test-artifacts');

// Run the real CLI without Puppeteer, a browser, a listening socket, or existing artifacts.
async function runHarness(failAt) {
  const events = [], errors = [], directories = new Set();
  const failure = new Error(`injected ${failAt} failure`);
  const processStub = { env: {} };
  const window = {
    __game: {
      textures: { exists: key => key === 'foe_qiongqi' },
      cache: { audio: { exists: key => key === 'bgm_boss' } },
      scene: { isActive: key => key === 'Title' }
    }
  };
  const page = {
    async setViewport() {},
    on() {},
    async goto(url) {
      events.push(['goto', decodeURIComponent(url)]);
      window.__aiTest = decodeURIComponent(url).includes('_AI测试版.html')
        ? { state: () => ({ battle: { phase: 'player', inputBlocked: false, enemies: [{}, {}] } }) }
        : undefined;
    },
    async waitForFunction(fn) { assert.ok(fn()); },
    async evaluate(fn) { return fn(); },
    async click(selector) { events.push(['click', selector]); },
    async screenshot(options) {
      events.push(['screenshot', options.path]);
      assert.ok(directories.has(path.dirname(options.path)), 'artifact directory must exist before screenshot');
      if (failAt === 'screenshot') throw failure;
    }
  };
  const browser = {
    async newPage() { return page; },
    async close() {
      events.push(['browser.close']);
      if (failAt === 'browser.close') throw failure;
    }
  };
  let serverCloseCallback;
  const server = {
    listen(port, host, callback) { events.push(['server.listen', port, host]); callback(); },
    address() { return { port: 32123 }; },
    close(callback) { events.push(['server.close']); serverCloseCallback = callback; },
    closeAllConnections() {
      events.push(['server.closeAllConnections']);
      assert.equal(typeof serverCloseCallback, 'function', 'stop listening before closing active connections');
      // Model an active request: server.close cannot finish until connections are closed.
      serverCloseCallback();
    }
  };
  const modules = {
    'node:assert/strict': assert,
    'node:path': path,
    'node:fs/promises': {
      async mkdir(directory, options) {
        events.push(['mkdir', directory, options.recursive]);
        if (failAt === 'mkdir') throw failure;
        await Promise.resolve();
        directories.add(directory);
        events.push(['mkdir.done']);
      }
    },
    'puppeteer-core': {
      async launch() {
        events.push(['browser.launch']);
        if (failAt === 'launch') throw failure;
        return browser;
      }
    },
    './serve.cjs': { createServer: () => server }
  };
  await vm.runInNewContext(source, {
    __dirname: path.dirname(scriptPath),
    require(name) {
      assert.ok(Object.hasOwn(modules, name), `unexpected dependency: ${name}`);
      return modules[name];
    },
    process: processStub,
    console: { log() {}, error(error) { errors.push(error); } },
    window
  }, { filename: scriptPath, timeout: 1000 });
  return { events, errors, failure, exitCode: processStub.exitCode };
}

test('portable CLI creates and awaits its screenshot directory on a fresh checkout', async () => {
  const result = await runHarness();
  assert.deepEqual(result.errors, []);
  assert.equal(result.exitCode, undefined);
  assert.deepEqual(result.events.filter(([name]) => name === 'mkdir'), [['mkdir', artifacts, true]]);
  assert.deepEqual(result.events.filter(([name]) => name === 'screenshot'), [
    ['screenshot', path.join(artifacts, 'ai-portable.png')]
  ]);
  const names = result.events.map(([name]) => name);
  assert.ok(names.indexOf('mkdir.done') < names.indexOf('screenshot'));
  assert.equal(result.events.filter(([name]) => name === 'goto').length, 2);
  assert.deepEqual(result.events.slice(-3), [['browser.close'], ['server.close'], ['server.closeAllConnections']]);
});

for (const failAt of ['mkdir', 'screenshot', 'launch', 'browser.close']) {
  test(`portable CLI reports ${failAt} failure and releases acquired resources`, async () => {
    const result = await runHarness(failAt);
    assert.deepEqual(result.errors, [result.failure]);
    assert.equal(result.exitCode, 1);
    assert.deepEqual(result.events.filter(([name]) => name.endsWith('.close') || name === 'server.closeAllConnections'),
      failAt === 'launch'
        ? [['server.close'], ['server.closeAllConnections']]
        : [['browser.close'], ['server.close'], ['server.closeAllConnections']]);
    if (failAt === 'mkdir' || failAt === 'launch') {
      assert.equal(result.events.some(([name]) => name === 'screenshot'), false);
    }
  });
}
