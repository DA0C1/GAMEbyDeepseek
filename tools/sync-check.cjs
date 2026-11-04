'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'shanhai-sync-'));
const origin = path.join(temporaryRoot, 'origin.git');
const peer = path.join(temporaryRoot, 'peer');
const local = path.join(temporaryRoot, 'local game');
const script = path.join(__dirname, 'Sync-Game.ps1');
const environment = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' };

function execute(program, args, cwd = temporaryRoot) {
  return spawnSync(program, args, { cwd, encoding: 'utf8', windowsHide: true, env: environment });
}

function git(args, cwd = local) {
  const result = execute(process.env.GIT_PATH || 'git', args, cwd);
  assert.equal(result.status, 0, result.stderr || result.error?.message || result.stdout);
  return result.stdout.trim();
}

function synchronize(expected = 0) {
  const result = execute('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script,
    '-RepositoryPath', local, '-Message', 'sync: regression fixture']);
  assert.equal(result.status, expected, result.stdout + result.stderr);
  return result;
}

function configure(directory) {
  git(['config', 'user.name', 'Sync regression'], directory);
  git(['config', 'user.email', 'sync-test@example.invalid'], directory);
  git(['config', 'core.autocrlf', 'false'], directory);
}

function publishPeer(name, content) {
  git(['pull', '--ff-only', 'origin', 'main'], peer);
  fs.writeFileSync(path.join(peer, name), content);
  git(['add', '-A'], peer);
  git(['commit', '-m', 'fixture: remote edit'], peer);
  git(['push', 'origin', 'main'], peer);
}

function sameHeads() {
  assert.equal(git(['rev-parse', 'HEAD']), git(['rev-parse', 'main'], origin));
  assert.equal(git(['status', '--porcelain']), '');
}

try {
  git(['init', '--bare', '--initial-branch=main', origin], temporaryRoot);
  git(['init', '--initial-branch=main', peer], temporaryRoot);
  configure(peer);
  fs.writeFileSync(path.join(peer, '.gitignore'), 'dist/\nnode_modules/\n');
  fs.writeFileSync(path.join(peer, 'game.txt'), 'initial game\n');
  fs.writeFileSync(path.join(peer, 'remove.txt'), 'obsolete\n');
  git(['add', '-A'], peer);
  git(['commit', '-m', 'fixture: initial game'], peer);
  git(['remote', 'add', 'origin', origin], peer);
  git(['push', '-u', 'origin', 'main'], peer);
  git(['-c', 'core.autocrlf=false', 'clone', origin, local], temporaryRoot);
  configure(local);

  const firstHead = git(['rev-parse', 'HEAD']);
  synchronize();
  assert.equal(git(['rev-parse', 'HEAD']), firstHead, 'no empty commit');
  console.log('PASS unchanged repository: no empty commits');

  fs.writeFileSync(path.join(local, '卡牌说明.txt'), 'local game update\n');
  fs.unlinkSync(path.join(local, 'remove.txt'));
  fs.mkdirSync(path.join(local, 'dist'));
  fs.writeFileSync(path.join(local, 'dist', 'game.html'), 'ignored build');
  synchronize();
  sameHeads();
  assert.ok(git(['ls-tree', '-r', '--name-only', 'main'], origin).includes('game.txt'));
  assert.equal(git(['ls-tree', '-r', '--name-only', 'main', '--', 'remove.txt', 'dist'], origin), '');
  assert.equal(git(['show', 'main:卡牌说明.txt'], origin), 'local game update');
  console.log('PASS upload: additions, deletions, Unicode paths and ignored builds');

  publishPeer('remote.txt', 'downloaded update\n');
  synchronize();
  sameHeads();
  assert.equal(fs.readFileSync(path.join(local, 'remote.txt'), 'utf8'), 'downloaded update\n');
  console.log('PASS download: remote changes fast-forward into the local folder');

  fs.writeFileSync(path.join(local, 'local-only.txt'), 'local branch\n');
  publishPeer('remote-only.txt', 'remote branch\n');
  synchronize();
  sameHeads();
  assert.equal(git(['rev-list', '--parents', '-n', '1', 'HEAD']).split(' ').length, 3);
  assert.equal(fs.readFileSync(path.join(local, 'remote-only.txt'), 'utf8'), 'remote branch\n');
  assert.equal(git(['show', 'main:local-only.txt'], origin), 'local branch');
  console.log('PASS diverged history: both independent edits survive the merge');

  fs.writeFileSync(path.join(local, 'game.txt'), 'local conflict version\n');
  publishPeer('game.txt', 'remote conflict version\n');
  const remoteBeforeConflict = git(['rev-parse', 'main'], origin);
  synchronize(1);
  const conflictHead = git(['rev-parse', 'HEAD']);
  const contents = fs.readFileSync(path.join(local, 'game.txt'), 'utf8');
  assert.ok(contents.includes('local conflict version') && contents.includes('remote conflict version'));
  assert.ok(git(['diff', '--name-only', '--diff-filter=U']).includes('game.txt'));
  synchronize(1);
  assert.equal(git(['rev-parse', 'HEAD']), conflictHead, 'unresolved conflict is never auto-committed');
  assert.equal(git(['rev-parse', 'main'], origin), remoteBeforeConflict, 'conflict never overwrites GitHub');
  fs.writeFileSync(path.join(local, 'game.txt'), 'local conflict version\nremote conflict version\n');
  git(['add', 'game.txt']);
  git(['commit', '-m', 'fixture: resolve conflict']);
  synchronize();
  sameHeads();
  console.log('PASS conflicts: both versions preserved, repeated sync blocked, resolved merge uploads');

  const beforeFailure = git(['rev-parse', 'HEAD']);
  fs.writeFileSync(path.join(local, 'offline-edit.txt'), 'keep my edit\n');
  git(['remote', 'set-url', 'origin', path.join(temporaryRoot, 'missing-origin.git')]);
  synchronize(1);
  assert.equal(git(['rev-parse', 'HEAD']), beforeFailure);
  assert.equal(fs.readFileSync(path.join(local, 'offline-edit.txt'), 'utf8'), 'keep my edit\n');
  git(['remote', 'set-url', 'origin', origin]);
  synchronize();
  sameHeads();
  console.log('PASS unavailable remote: local work preserved and retry succeeds');
} finally {
  const resolved = path.resolve(temporaryRoot);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('shanhai-sync-')) {
    throw new Error('Refusing to remove a path outside the temporary sync fixture');
  }
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
