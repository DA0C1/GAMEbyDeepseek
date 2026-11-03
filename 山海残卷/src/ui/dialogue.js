/* 打字机对话：逐字浮现、点击推进，说话人朱印
 *
 * 用法：
 *   showDialogue(scene, { speaker: '烛龙', lines: [...], onDone() {} })
 * 点击行为：正在打字 → 立即补全本句；已完 → 下一句；最后一句 → 收起并回调。
 * 返回句柄 { close() }，可强行收起（换场景前调用）。
 */

import { W, H, FONT, DEPTH } from '../core/config.js';
import { audio } from '../core/audio.js';

export function showDialogue(scene, opt) {
  const lines = opt.lines || [];
  const speed = opt.speed || 30; // ms / 字
  const depth = opt.depth || DEPTH.overlay + 20;
  const objs = [];
  let closed = false;

  // 压暗层（吃掉点击，防止穿透到战斗 UI）
  const shade = scene.add.rectangle(W / 2, H / 2, W, H, 0x0d0b09, 0.86)
    .setDepth(depth).setInteractive();
  objs.push(shade);

  // 对话框：墨底金线的卷轴一纸（center 模式居中呈现，用于序章等叙事页）
  const boxW = Math.min(1120, W - 160);
  const boxH = 92 + Math.min(lines.length, 4) * 44;
  const boxY = opt.center ? H / 2 : H - boxH / 2 - 96;
  const g = scene.add.graphics().setDepth(depth + 1);
  g.fillStyle(0x17140f, 0.94);
  g.fillRoundedRect(W / 2 - boxW / 2, boxY - boxH / 2, boxW, boxH, 6);
  g.lineStyle(1.2, 0xb98f3f, 0.45);
  g.strokeRoundedRect(W / 2 - boxW / 2, boxY - boxH / 2, boxW, boxH, 6);
  // 内衬细线
  g.lineStyle(1, 0xb98f3f, 0.16);
  g.strokeRoundedRect(W / 2 - boxW / 2 + 10, boxY - boxH / 2 + 10, boxW - 20, boxH - 20, 4);
  objs.push(g);

  // 说话人：朱印名，压在框沿上
  if (opt.speaker) {
    const nameG = scene.add.graphics().setDepth(depth + 2);
    nameG.fillStyle(0xb23a2e, 0.94);
    const nw = opt.speaker.length * 26 + 34;
    nameG.fillRoundedRect(W / 2 - boxW / 2 + 26, boxY - boxH / 2 - 22, nw, 44, 4);
    nameG.lineStyle(1.2, 0xf3ecdc, 0.5);
    nameG.strokeRoundedRect(W / 2 - boxW / 2 + 31, boxY - boxH / 2 - 17, nw - 10, 34, 2);
    objs.push(nameG);
    const nameT = scene.add.text(W / 2 - boxW / 2 + 26 + nw / 2, boxY - boxH / 2, opt.speaker, {
      fontFamily: FONT.song, fontSize: '22px', color: '#f7f0e0'
    }).setOrigin(0.5).setDepth(depth + 3);
    objs.push(nameT);
  }

  // 正文（一次只显示一句，逐字打出）
  const body = scene.add.text(W / 2, boxY - (opt.center ? 12 : 24), '', {
    fontFamily: FONT.song, fontSize: '24px', color: '#f3ecdc',
    align: 'center', wordWrap: { width: boxW - 110 }, lineSpacing: 10
  }).setOrigin(0.5).setDepth(depth + 2);
  objs.push(body);

  // 推进提示 ▼
  const hint = scene.add.text(W / 2 + boxW / 2 - 46, boxY + boxH / 2 - 30, '▼', {
    fontFamily: FONT.hei, fontSize: '18px', color: 'rgba(226,196,137,0.85)'
  }).setOrigin(0.5).setDepth(depth + 2).setAlpha(0);
  objs.push(hint);
  scene.tweens.add({ targets: hint, alpha: 0.25, duration: 640, yoyo: true, repeat: -1 });

  // 底部小字：点击推进 / 跳过
  const tip = scene.add.text(W / 2, boxY + boxH / 2 + 26, '点击继续', {
    fontFamily: FONT.hei, fontSize: '13px', color: 'rgba(226,196,137,0.5)'
  }).setOrigin(0.5).setDepth(depth + 2);
  objs.push(tip);

  let idx = 0;      // 当前句
  let shown = 0;    // 已打出的字符数
  let timer = null;

  function stopType() {
    if (timer) { timer.remove(); timer = null; }
  }

  function typeLine() {
    stopType();
    const full = lines[idx] || '';
    shown = 0;
    body.setText('');
    hint.setAlpha(0);
    timer = scene.time.addEvent({
      delay: speed, repeat: full.length - 1,
      callback: () => {
        shown += 1;
        body.setText(full.slice(0, shown));
        if (shown >= full.length) {
          stopType();
          hint.setAlpha(0.85);
        }
      }
    });
  }

  function advance() {
    if (closed) return;
    const full = lines[idx] || '';
    if (shown < full.length) {
      // 补全本句
      stopType();
      shown = full.length;
      body.setText(full);
      hint.setAlpha(0.85);
      return;
    }
    idx += 1;
    if (idx >= lines.length) { close(); return; }
    audio.sfx('page');
    typeLine();
  }

  function close() {
    if (closed) return;
    closed = true;
    stopType();
    if (scene._dialogue === handle) scene._dialogue = null;
    objs.forEach((o) => o.destroy());
    if (opt.onDone) opt.onDone();
  }

  const handle = {
    close,
    advance,
    getState: () => ({ speaker: opt.speaker || '', text: body.text, line: idx + 1, total: lines.length, typing: shown < (lines[idx] || '').length })
  };
  scene._dialogue = handle; // 可编程关闭（测试/换场景前强制收起）
  shade.on('pointerdown', (_pointer, _x, _y, event) => {
    event.stopPropagation();
    advance();
  });
  shade.on('pointerup', (_pointer, _x, _y, event) => event.stopPropagation());

  typeLine();
  return handle;
}
