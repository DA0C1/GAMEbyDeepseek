'use strict';

const { spawn } = require('node:child_process');
const { createServer } = require('./serve.cjs');

function options(args) {
  let ai = false;
  let open = true;
  let port;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--ai') ai = true;
    else if (argument === '--no-open') open = false;
    else if (argument === '--help' || argument === '-h') return { help: true };
    else if (argument === '--port') {
      const value = args[++index];
      if (!value || !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
        throw new Error('--port 需要 1 到 65535 之间的整数。');
      }
      port = Number(value);
    } else throw new Error(`未知参数：${argument}`);
  }
  return { ai, open, port: port ?? (ai ? 8898 : 8899) };
}

function openBrowser(url) {
  const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
  if (process.platform !== 'darwin' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return;
  const child = spawn(command, [url], { stdio: 'ignore', detached: true });
  child.on('error', () => console.log('未能自动打开浏览器，请手动访问上面的地址。'));
  child.on('exit', code => {
    if (code) console.log('未能自动打开浏览器，请手动访问上面的地址。');
  });
  child.unref();
}

function main(args = process.argv.slice(2)) {
  let config;
  try {
    config = options(args);
    if (config.help) {
      console.log('用法：sh 启动游戏.sh [--port 8899] [--no-open]\n      sh 启动AI测试版.sh [--port 8898] [--no-open]\n服务在前台运行，按 Ctrl+C 停止。');
      return;
    }
    if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('请先安装 Node.js 22 或以上版本。');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }
  const server = createServer();
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE'
      ? `端口 ${config.port} 已被占用。请用 --port 指定其他端口，或停止原有服务。`
      : `服务未能启动：${error.message}`);
    process.exitCode = 1;
  });
  server.listen(config.port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${config.port}/${config.ai ? 'ai-test.html' : 'index.html'}`;
    console.log(`山海残卷${config.ai ? ' · AI 测试版' : ''}\n${url}\n服务在前台运行，按 Ctrl+C 停止。`);
    if (config.open) openBrowser(url);
  });
  for (const name of ['SIGINT', 'SIGTERM']) process.once(name, () => {
    server.close();
    server.closeAllConnections();
  });
  return server;
}

if (require.main === module) main();
module.exports = { options, main };
