# GAMEbyDeepseek

山海残卷 · SCROLLS OF SHANHAI，水墨风格的卡牌构筑 roguelite。

当前为 **v3.9.4「校册」修复与 AI 测试版**（2026-11-03）。本次修复牌组关闭提示与布局、怪物死亡残影、浮层期间误触、战后法宝结算，并增加独立 AI 测试入口。玩家说明与历史改动见 [README.txt](山海残卷/README.txt)。

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
npm run build:ai
npm run test:portable
```

浏览器回归检查使用独立的无头 Edge，不连接正在玩的浏览器；也可通过 `EDGE_PATH` 指定 Chromium 系浏览器路径。截图保存在 `test-artifacts/`，打包结果为 `dist/山海残卷_单文件版.html`，包含本地图片、音乐和引擎，可独立打开。

本次修复与验证记录见 [游玩反馈](山海残卷/docs/游玩反馈.md)。归档未包含旧版 `t1`～`t26` 等历史测试，本仓库提供针对本次问题的新回归检查。

Terra（xhigh）已正常完成天命 0 随机新局：三卷首领全部击败，6/9 页选择代卷结局，评分 **9030**；回山门确认入卷 1 次、破卷 1 次、最佳 9030 分，游戏已停止。20 个检查点合并为 240 次连续操作，0 失败请求、0 测试动作。过程、发现的问题及覆盖限制见 [全流程游玩记录](山海残卷/docs/全流程游玩记录.md)，状态与操作序列见 [验证证据](山海残卷/docs/全流程验证证据.json)。

AI 测试版：双击 `山海残卷/启动AI测试版.bat`，访问 http://localhost:8898/ai-test.html；也可在自行启动的服务中访问 `/ai-test.html`。提供可读状态、具名操作按钮、固定规则种子、问题复现入口和日志导出。用法见 [AI 测试说明](山海残卷/docs/AI测试.md)；`npm run build:ai` 可生成 `dist/山海残卷_AI测试版.html`。

本次 6 项逻辑测试、9 组浏览器检查及普通版、AI 版单文件验证均通过。旧 EXE 未重新打包；本地完整归档中的两个单文件 HTML 和 `03_源代码` 已同步更新，AI 启动器使用 http://localhost:8002/。
