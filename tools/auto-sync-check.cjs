'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'shanhai-auto-sync-'));
const origin = path.join(temporaryRoot, 'origin.git');
const peer = path.join(temporaryRoot, 'peer');
const local = path.join(temporaryRoot, 'local game');
const runtime = path.join(local, '.game-sync');
let daemon;
let output = '';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function git(args, cwd = local) {
  const result = spawnSync(process.env.GIT_PATH || 'git', args, { cwd, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.error?.message || result.stdout);
  return result.stdout.trim();
}

async function until(check, label, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { if (check()) return; } catch {}
    if (daemon?.exitCode !== null && daemon?.exitCode !== undefined) throw new Error('Daemon exited: ' + output);
    await wait(200);
  }
  throw new Error('Timed out: ' + label + '\n' + output + '\n' + JSON.stringify(state()));
}

function state() {
  try { return JSON.parse(fs.readFileSync(path.join(runtime, 'state.json'), 'utf8')); } catch { return {}; }
}

function startDaemon() {
  output = '';
  daemon = spawn(process.execPath, [path.join(__dirname, 'auto-sync.cjs'), '--repository', local,
    '--interval-ms', '1200', '--debounce-ms', '700', '--no-notifications'], { windowsHide: true });
  daemon.stdout.on('data', data => { output += data; });
  daemon.stderr.on('data', data => { output += data; });
}

async function stopDaemon() {
  if (!daemon || daemon.exitCode !== null) return;
  fs.writeFileSync(path.join(runtime, 'stop'), 'stop');
  let timeoutId;
  const result = await Promise.race([
    new Promise(resolve => daemon.once('exit', (code) => resolve(code))),
    new Promise(resolve => { timeoutId = setTimeout(() => resolve('timeout'), 20000); })
  ]).finally(() => clearTimeout(timeoutId));
  assert.equal(result, 0, 'daemon stops gracefully: ' + output);
  assert.equal(state().status, 'stopped');
  assert.equal(fs.existsSync(path.join(runtime, 'daemon.lock')), false);
}

async function main() {
  try {
    git(['init', '--bare', '--initial-branch=main', origin], temporaryRoot);
    git(['init', '--initial-branch=main', peer], temporaryRoot);
    for (const [name, value] of [['user.name', 'Auto sync test'], ['user.email', 'auto-test@example.invalid'], ['core.autocrlf', 'false']]) {
      git(['config', name, value], peer);
    }
    fs.writeFileSync(path.join(peer, '.gitignore'), '.game-sync/\ndist/\n');
    fs.writeFileSync(path.join(peer, 'game.txt'), 'initial\n');
    git(['add', '-A'], peer);
    git(['commit', '-m', 'fixture: initial'], peer);
    git(['remote', 'add', 'origin', origin], peer);
    git(['push', '-u', 'origin', 'main'], peer);
    git(['-c', 'core.autocrlf=false', 'clone', origin, local], temporaryRoot);
    for (const [name, value] of [['user.name', 'Auto sync test'], ['user.email', 'auto-test@example.invalid'], ['core.autocrlf', 'false']]) {
      git(['config', name, value]);
    }
    startDaemon();
    await until(() => state().status === 'idle', 'initial background synchronization');
    const before = git(['rev-parse', 'main'], origin);
    for (const value of ['first', 'second', 'settled']) {
      fs.writeFileSync(path.join(local, 'local.txt'), value + '\n');
      await wait(150);
    }
    assert.equal(git(['rev-parse', 'main'], origin), before, 'waits for edits to settle');
    await until(() => git(['rev-parse', 'main'], origin) !== before && state().status === 'idle', 'automatic local upload');
    assert.equal(git(['show', 'main:local.txt'], origin), 'settled');
    assert.equal(git(['status', '--porcelain']), '');
    console.log('PASS automatic upload: waits for edits to settle, excludes runtime files');

    git(['pull', '--ff-only', 'origin', 'main'], peer);
    fs.writeFileSync(path.join(peer, 'remote.txt'), 'remote background update\n');
    git(['add', '-A'], peer);
    git(['commit', '-m', 'fixture: remote update'], peer);
    git(['push', 'origin', 'main'], peer);
    await until(() => fs.existsSync(path.join(local, 'remote.txt')) && state().status === 'idle', 'automatic remote download');
    assert.equal(fs.readFileSync(path.join(local, 'remote.txt'), 'utf8'), 'remote background update\n');
    console.log('PASS automatic download: periodic fetch updates local files without clicking');

    await stopDaemon();
    fs.writeFileSync(path.join(peer, 'game.txt'), 'remote conflicting change\n');
    git(['add', '-A'], peer);
    git(['commit', '-m', 'fixture: remote conflict'], peer);
    git(['push', 'origin', 'main'], peer);
    fs.writeFileSync(path.join(local, 'game.txt'), 'local conflicting change\n');
    const remoteConflictHead = git(['rev-parse', 'main'], origin);
    startDaemon();
    await until(() => state().status === 'blocked', 'conflict detection');
    const localConflictHead = git(['rev-parse', 'HEAD']);
    await wait(1800);
    assert.equal(git(['rev-parse', 'HEAD']), localConflictHead);
    assert.equal(git(['rev-parse', 'main'], origin), remoteConflictHead);
    const contents = fs.readFileSync(path.join(local, 'game.txt'), 'utf8');
    assert.ok(contents.includes('local conflicting change') && contents.includes('remote conflicting change'));
    fs.writeFileSync(path.join(local, 'game.txt'), 'local conflicting change\nremote conflicting change\n');
    git(['add', 'game.txt']);
    git(['commit', '-m', 'fixture: resolve conflict']);
    await until(() => state().status === 'idle' && git(['rev-parse', 'main'], origin) === git(['rev-parse', 'HEAD']), 'automatic recovery');
    console.log('PASS conflict handling: pauses without overwrites and resumes after resolution');
    await stopDaemon();
    console.log('PASS graceful stop: background process exits and releases its lock');
  } finally {
    await stopDaemon();
    const resolved = path.resolve(temporaryRoot);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('shanhai-auto-sync-')) {
      throw new Error('Refusing to remove a path outside the temporary automatic sync fixture');
    }
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
