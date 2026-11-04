# AI 测试版

这是独立测试入口，普通 `index.html` 不加载测试面板或测试操作。建议用独立端口，避免测试新局影响同一来源的图鉴记录。

```sh
node tools/serve.cjs 8002
# 打开 http://localhost:8002/ai-test.html
```

也可双击 `启动AI测试版.bat`。`npm run build:ai` 会生成包含全部素材的 `dist/山海残卷_AI测试版.html`。

### 源码与完整归档的地址

- 源码启动器：`http://localhost:8898/ai-test.html`；手动运行 `tools/serve.cjs` 时也访问对应端口的 `/ai-test.html`。
- 完整归档启动器：`http://localhost:8002/` 与 `http://localhost:8002/ai-test.html` 指向同一 AI 单文件。
- 单独服务构建产物：先 `npm run build:ai`，再 `node tools/serve-portable.cjs --ai`；根地址和 `/ai-test.html` 均有效。

## 通过界面操作

右侧全部是真正的 HTML 按钮、下拉框和文字，可由浏览器无障碍树读取，无需识别卡面像素。

- **当前操作**：结束回合、药水、牌组开关、剧情补全与下一句。
- **手牌与目标**：选择目标，再点具名卡牌；仍受灵力、存活目标和浮层锁限制。
- **路线**：只显示当前可达节点；商店、奖励、休息等场景的可见按钮会映射到「当前界面按钮」。
- **奖励**：按钮直接显示费用、升级标记与效果；可读状态中相应按钮的 `card` 包含 `id`、`name`、`upgraded`、`cost`、`description`。X 费的 `cost` 为 -1，界面显示 X。
- **可读取状态**：气血、护甲、灵力、增益、当前手牌、敌人和意图、牌堆数量。不会输出未抽到的牌的顺序。
- **复现入口**：49 张牌组、双敌死亡、首领对话、葫芦与铜钱结算。每个入口都会重建测试局。
- **测试专用击杀**：用于快速验证死亡与战后结算，单独标明，不属于正常出牌规则。
- **导出日志**：保存本页操作、种子和当前状态，最多保留最近 200 次操作，包含失败请求。

种子只控制地图、遭遇、洗牌、掉落、事件等规则随机数；画面墨点等美术随机数不消耗该序列。相同初始设置、种子和操作序列可复现规则结果。普通版默认仍使用系统随机数。

## 结构化接口

仅测试页提供 `window.__aiTest`：

```js
window.__aiTest.state(); // 当前快照
window.__aiTest.act({ type: 'scenario', name: 'two-enemies', seed: 42 });

// 等待快照的 battle.inputBlocked === false 且 battle.phase === 'player'
const state = window.__aiTest.state();
window.__aiTest.act({
  type: 'play_card',
  index: state.battle.hand.find(card => card.playable).index,
  target: state.battle.enemies.find(enemy => enemy.alive).uid
});
window.__aiTest.act({ type: 'end_turn' });
window.__aiTest.log();
```

操作返回 `{ ok, state }`；无效操作返回 `{ ok: false, error, state }`。场景切换与动画异步完成，后续操作前要重新读取状态，不能将成功发起视为切换已经完成。

选定结局后旧选择立即撤下，战绩只结算一次；完整正文或隐藏尾声显示后，回山门按钮才会出现并启用。低帧率与窗口失焦时按真实帧间隔计时，隐藏页面继续使用引擎的暂停与恢复机制。

| type | 参数 | 用途 |
| --- | --- | --- |
| `scenario` | `name`, `seed` | `normal` / `deck49` / `two-enemies` / `boss` / `relics` |
| `play_card` | `index`, `target` | 当前手牌下标、敌人 uid；下标应从最新快照读取 |
| `end_turn` | 无 | 结束玩家回合 |
| `potion` | `index` | 使用当前药水 |
| `dialogue_next` | 无 | 补全本句或推进一句 |
| `continue_scene` | 无 | 地图引言、际遇结果的「点击继续」 |
| `open_deck` / `close_overlay` | 无 | 牌组、浮层开关 |
| `route` | `id` | 进入快照列出的可达节点，id 为数字 |
| `ui` | `id` | 激活当前快照列出的可见控件 |
| `test_defeat_enemy` | `target` | 测试专用击杀，用于验证死亡与结算 |

接口版本为 `window.__aiTest.version === 1`。当前版本不提供任意脚本执行、存档删除或正常版后台自动游玩。
