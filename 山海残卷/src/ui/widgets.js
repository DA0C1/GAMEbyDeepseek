/* 通用 UI 组件：按钮、面板、血条、提示 */

import { W, H, PAL, FONT, DEPTH } from '../core/config.js';
import { audio } from '../core/audio.js';

export function makeButton(scene, x, y, w, h, label, onClick, opt = {}) {
  const c = scene.add.container(x, y).setDepth(opt.depth || DEPTH.hud);
  const g = scene.add.graphics();
  const txt = scene.add.text(w / 2, h / 2, label, {
    fontFamily: opt.font || FONT.song,
    fontSize: (opt.size || 26) + 'px',
    color: PAL.ink
  }).setOrigin(0.5);
  c.add([g, txt]);
  const zone = scene.add.zone(x, y, w, h).setOrigin(0, 0).setDepth(opt.depth || DEPTH.hud);
  zone.setInteractive({ useHandCursor: true });

  let hover = false;
  const primary = !!opt.primary;
  const draw = () => {
    g.clear();
    if (primary) {
      g.fillStyle(hover ? 0xc2483a : 0xa8332a, hover ? 1 : 0.94);
      g.fillRoundedRect(0, 0, w, h, opt.radius || 4);
      g.lineStyle(1.2, 0x6f1f18, 0.55);
      g.strokeRoundedRect(0, 0, w, h, opt.radius || 4);
      g.fillStyle(0xffffff, hover ? 0.14 : 0.08);
      g.fillRoundedRect(1, 1, w - 2, h * 0.42, (opt.radius || 4));
    } else {
      g.fillStyle(hover ? 0xfdfaf3 : 0xf7efdd, hover ? 0.98 : 0.86);
      g.fillRoundedRect(0, 0, w, h, opt.radius || 4);
      g.lineStyle(hover ? 2 : 1.2, hover ? 0xb23a2e : 0x1d1a17, hover ? 1 : 0.42);
      g.strokeRoundedRect(0, 0, w, h, opt.radius || 4);
      if (hover) {
        g.fillStyle(0xb23a2e, 1);
        g.fillRect(10, h / 2 - 7, 2, 14);
      }
    }
    txt.setColor(primary ? '#fdf9ef' : (hover ? PAL.cinnabar : PAL.ink));
  };
  draw();

  c.setScale(1);
  zone.on('pointerover', () => {
    hover = true;
    draw();
    audio.sfx('hover');
    scene.tweens.add({ targets: c, scaleX: 1.02, scaleY: 1.02, duration: 120, ease: 'Cubic.easeOut' });
  });
  zone.on('pointerout', () => {
    hover = false;
    draw();
    scene.tweens.add({ targets: c, scaleX: 1, scaleY: 1, duration: 120, ease: 'Cubic.easeOut' });
  });
  let lastClick = -Infinity, pending = null, disposed = false;
  zone.on('pointerdown', (_pointer, _x, _y, event) => {
    event?.stopPropagation();
    if (disposed || pending) return;
    // 防手抖/双击：40ms 延迟回调期间重复点击会排队，导致开两次局
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (now - lastClick < 320) return;
    lastClick = now;
    audio.sfx('click');
    scene.tweens.add({ targets: c, scaleX: 0.98, scaleY: 0.98, duration: 60, yoyo: true });
    if (onClick) pending = scene.time.delayedCall(40, () => {
      pending = null;
      if (!disposed) onClick();
    });
  });

  c.zone = zone;
  c.hitZone = zone;
  const origDestroy = c.destroy.bind(c);
  c.destroy = function () {
    if (disposed) return;
    disposed = true;
    pending?.remove(false);
    pending = null;
    try { zone.destroy(); } catch (e) {}
    origDestroy();
  };
  return c;
}

export function drawPanel(g, x, y, w, h, opt = {}) {
  g.fillStyle(opt.fill !== undefined ? opt.fill : 0xfaf4e6, opt.alpha === undefined ? 0.97 : opt.alpha);
  g.fillRoundedRect(x, y, w, h, opt.radius || 6);
  g.lineStyle(1.4, opt.border !== undefined ? opt.border : 0x1d1a17, opt.borderAlpha === undefined ? 0.35 : opt.borderAlpha);
  g.strokeRoundedRect(x, y, w, h, opt.radius || 6);
  if (opt.inner !== false) {
    g.lineStyle(1, 0x1d1a17, 0.12);
    g.strokeRoundedRect(x + 9, y + 9, w - 18, h - 18, 3);
  }
  if (opt.gold) {
    g.lineStyle(2, 0xb98f3f, 0.5);
    g.strokeRoundedRect(x + 5, y + 5, w - 10, h - 10, 4);
  }
}

export function text(scene, x, y, str, size, opt = {}) {
  const style = {
    fontFamily: opt.font || FONT.song,
    fontSize: size + 'px',
    color: opt.color || PAL.ink,
    align: opt.align || 'left',
    lineSpacing: opt.lineSpacing || 6,
    wordWrap: opt.wrap ? { width: opt.wrap, useAdvancedWrap: opt.advancedWrap === true } : undefined
  };
  if (opt.bg) style.backgroundColor = opt.bg;
  if (opt.padding) style.padding = opt.padding;
  return scene.add.text(x, y, str, style)
    .setOrigin(opt.originX === undefined ? 0 : opt.originX, opt.originY === undefined ? 0 : opt.originY)
    .setDepth(opt.depth || DEPTH.hud);
}
