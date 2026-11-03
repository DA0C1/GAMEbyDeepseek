/* Boss 战歌词：左上天空处的卷首批注签，按 BGM 播放进度逐句浮现 */

import { FONT, DEPTH } from '../core/config.js';

const SLIP_W = 392;
const SLIP_H = 50;

export function createBossLyrics(scene, lines) {
  if (!lines || !lines.length) return null;

  const root = scene.add.container(470, 185).setDepth(DEPTH.hud + 3).setAlpha(0);

  // 纸签：只覆盖文字区，避免横贯画面压住守卷之兽
  const g = scene.add.graphics();
  g.fillStyle(0xf8f1e2, 0.68);
  g.fillRoundedRect(0, -SLIP_H / 2, SLIP_W, SLIP_H, 3);
  g.lineStyle(1, 0xb98f3f, 0.3);
  g.lineBetween(10, SLIP_H / 2 - 4, SLIP_W - 10, SLIP_H / 2 - 4);
  root.add(g);

  // 左侧朱印
  const seal = scene.add.graphics();
  seal.fillStyle(0xb23a2e, 0.94);
  seal.fillRoundedRect(-38, -15, 30, 30, 3);
  seal.lineStyle(1, 0xf7f0e0, 0.72);
  seal.strokeRoundedRect(-34, -11, 22, 22, 2);
  root.add(seal);
  root.add(scene.add.text(-23, 0, '词', {
    fontFamily: FONT.song, fontSize: '15px', color: '#f7f0e0'
  }).setOrigin(0.5));

  const label = scene.add.text(24, 0, '', {
    fontFamily: FONT.brush, fontSize: '28px', color: '#2b241b'
  }).setOrigin(0, 0.5);
  label.setLetterSpacing(3);
  label.setShadow(0, 1, 'rgba(250,245,233,0.85)', 5, false, true);
  root.add(label);

  let idx = -1;
  let tween = null;
  let dead = false;

  const fadeTo = (alpha, duration) => {
    if (tween) tween.stop();
    tween = scene.tweens.add({ targets: root, alpha, duration, ease: 'Sine.easeOut' });
  };

  const update = (t) => {
    if (dead) return;
    if (typeof t !== 'number' || t < 0) {
      if (idx !== -1) { idx = -1; fadeTo(0, 220); }
      return;
    }
    let cur = -1;
    for (let i = 0; i < lines.length; i++) {
      if (t >= lines[i].t && t < lines[i].end) { cur = i; break; }
    }
    if (cur === idx) return;
    idx = cur;
    if (cur < 0) { fadeTo(0, 240); return; }

    const ln = lines[cur];
    label.setText(ln.text);
    label.setColor(ln.chorus ? '#8b2a20' : '#2b241b');
    label.x = 18;
    scene.tweens.add({ targets: label, x: 24, duration: 420, ease: 'Cubic.easeOut' });
    fadeTo(1, 320);
  };

  return {
    update,
    getText: () => label.text,
    getAlpha: () => root.alpha,
    destroy() {
      if (dead) return;
      dead = true;
      if (tween) tween.stop();
      try { root.destroy(true); } catch (e) { /* 场景销毁时可能已清空 */ }
    }
  };
}
