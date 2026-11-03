# GAMEbyDeepseek

山海残卷 · SCROLLS OF SHANHAI，水墨风格的卡牌构筑 roguelite。

完整源码、美术、音频与 Phaser 运行时位于 `山海残卷/`。下载整个仓库后，双击该目录中的 `启动游戏.bat`，或安装 Node.js 22 及以上版本后运行：

```sh
cd 山海残卷
npm start
```

浏览器打开 http://localhost:8899/。运行游戏不需要安装 npm 依赖，也不需要原开发机器的 D 盘目录。手动运行时可以用 `node tools/serve.cjs 8002` 指定端口。

开发验证与单文件打包：

```sh
npm ci
npm test
npm run test:browser
npm run build:single
```

浏览器回归检查使用独立的无头 Edge，不连接正在玩的浏览器；也可通过 `EDGE_PATH` 指定 Chromium 系浏览器路径。截图保存在 `test-artifacts/`，打包结果为 `dist/山海残卷_单文件版.html`，包含本地图片、音乐和引擎，可独立打开。

本次修复与验证记录见 [游玩反馈](山海残卷/docs/游玩反馈.md)。归档未包含旧版 `t1`～`t26` 等历史测试，本仓库提供针对本次问题的新回归检查。

AI 测试版：双击 `山海残卷/启动AI测试版.bat`，或启动服务后访问 `/ai-test.html`。提供可读状态、具名操作按钮、固定规则种子、问题复现入口和日志导出。用法见 [AI 测试说明](山海残卷/docs/AI测试.md)；`npm run build:ai` 可生成独立单文件版本。
