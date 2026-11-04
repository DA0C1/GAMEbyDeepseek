'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}
const repository = path.resolve(option('--repository', path.join(__dirname, '..')));
const interval = Math.max(500, Number(option('--interval-ms', 30000)));
const debounce = Math.max(200, Number(option('--debounce-ms', 5000)));
const notifications = !process.argv.includes('--no-notifications');
const runtime = path.join(repository, '.game-sync');
const lockPath = path.join(runtime, 'daemon.lock');
const stopPath = path.join(runtime, 'stop');
const logPath = path.join(runtime, 'sync.log');
const statePath = path.join(runtime, 'state.json');
fs.mkdirSync(runtime, { recursive: true });

function alive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

try {
  const prior = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  if (alive(prior.pid)) process.exit(0);
  fs.unlinkSync(lockPath);
} catch (error) {
  if (error.code !== 'ENOENT') {
    // A partial lock from a process still starting is treated as occupied.
    if (fs.existsSync(lockPath)) process.exit(1);
  }
}
let lock;
try { lock = fs.openSync(lockPath, 'wx'); }
catch (error) { if (error.code === 'EEXIST') process.exit(0); throw error; }
fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
fs.closeSync(lock);

const state = { pid: process.pid, repository, status: 'starting', busy: false,
  intervalMs: interval, debounceMs: debounce, lastSuccessAt: null, lastCheckAt: null, lastError: null };
let dirty = true;
let generation = 0;
let lastChange = Date.now();
let nextRemote = 0;
let stopping = false;
let warned = null;
let lastOutcome = null;

function appendLog(message) {
  try {
    if (fs.existsSync(logPath) && fs.statSync(logPath).size > 1024 * 1024) {
      fs.copyFileSync(logPath, path.join(runtime, 'sync.previous.log'));
      fs.writeFileSync(logPath, '');
    }
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`);
  } catch { /* Status remains available if log rotation fails. */ }
}

function publishState() {
  const labels = { starting: '正在启动', syncing: '正在同步', idle: '后台自动同步运行中',
    blocked: '已暂停：请先解决文件冲突并完成合并', retrying: '暂时失败：稍后自动重试', stopped: '已停止自动同步' };
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  fs.writeFileSync(path.join(runtime, 'status.txt'), '\ufeff' + [
    '山海残卷 · 自动同步状态', '========================', labels[state.status] || state.status,
    `工作目录：${repository}`, 'GitHub：https://github.com/DA0C1/GAMEbyDeepseek',
    `本地修改停稳 ${debounce / 1000} 秒后自动上传；每 ${interval / 1000} 秒检查远端。`,
    `最近检查：${state.lastCheckAt || '尚未检查'}`, `最近成功：${state.lastSuccessAt || '尚未完成'}`,
    state.lastError ? `提示：${state.lastError}` : '文件冲突时保留双方内容；不会强制推送。',
    '详细记录：.game-sync\\sync.log', ''
  ].join('\r\n'));
}

function notify(message) {
  if (!notifications) return;
  const child = spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass',
    '-File', path.join(__dirname, 'Notify-Sync.ps1'), '-Message', message], { windowsHide: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
}

function blocked() {
  return ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply']
    .some(name => fs.existsSync(path.join(repository, '.git', name)));
}

function finish() {
  if (state.busy) { stopping = true; return; }
  state.status = 'stopped';
  publishState();
  appendLog('自动同步已停止。');
  try { fs.unlinkSync(lockPath); } catch {}
  try { fs.unlinkSync(stopPath); } catch {}
  watcher.close();
  clearInterval(timer);
}

function synchronize() {
  state.busy = true;
  state.status = 'syncing';
  state.lastCheckAt = new Date().toISOString();
  publishState();
  const startedGeneration = generation;
  dirty = false;
  let output = '';
  const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
    path.join(__dirname, 'Sync-Game.ps1'), '-RepositoryPath', repository], {
    cwd: repository, windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' }
  });
  child.stdout.on('data', data => { output += data.toString('utf8'); });
  child.stderr.on('data', data => { output += data.toString('utf8'); });
  let finished = false;
  function done(code, error) {
    if (finished) return;
    finished = true;
    state.busy = false;
    dirty = generation !== startedGeneration;
    nextRemote = Date.now() + interval;
    if (code === 0) {
      state.status = 'idle';
      state.lastSuccessAt = new Date().toISOString();
      state.lastError = null;
      warned = null;
      const outcome = output.trim().split(/\r?\n/).at(-1);
      if (outcome !== lastOutcome) appendLog(output.trim());
      lastOutcome = outcome;
    } else {
      state.status = blocked() ? 'blocked' : 'retrying';
      state.lastError = state.status === 'blocked' ? '双方修改有冲突，请处理后完成合并；随后会自动恢复。'
        : 'GitHub 暂时无法同步，本地内容保留，稍后自动重试。可查看 sync.log 中的具体原因。';
      appendLog(output.trim() || String(error));
      if (state.status === 'blocked' && warned !== 'blocked') {
        notify('游戏自动同步遇到文件冲突，已暂停上传。双方内容都已保留，请打开 C:\\GAMEbyDeepseek 处理，或把同步日志发给我。');
        warned = 'blocked';
      }
    }
    publishState();
    if (stopping || fs.existsSync(stopPath)) finish();
  }
  child.on('error', error => done(1, error));
  child.on('close', code => done(code));
}

const ignored = new Set(['.git', '.game-sync', 'node_modules', 'dist', 'test-artifacts']);
const watcher = fs.watch(repository, { recursive: true }, (_event, filename) => {
  if (!filename) return;
  const parts = String(filename).split(/[\\/]/).map(part => part.toLowerCase());
  if (parts.some(part => ignored.has(part)) || parts.at(-1).endsWith('.log')) return;
  dirty = true;
  generation++;
  lastChange = Date.now();
});
watcher.on('error', error => { appendLog(String(error)); dirty = true; });

const timer = setInterval(() => {
  if (fs.existsSync(stopPath) || stopping) { finish(); return; }
  if (state.busy) return;
  const now = Date.now();
  if (dirty && now - lastChange < debounce) return;
  if (!dirty && now < nextRemote) return;
  if (blocked()) {
    state.status = 'blocked';
    state.lastError = '存在未完成的合并或 Git 操作，自动同步正在等待处理。';
    publishState();
    dirty = false;
    nextRemote = now + interval;
    return;
  }
  synchronize();
}, 500);
process.on('SIGTERM', finish);
process.on('SIGINT', finish);
process.on('exit', () => { try { fs.unlinkSync(lockPath); } catch {} });
publishState();
appendLog('自动同步已启动。');
