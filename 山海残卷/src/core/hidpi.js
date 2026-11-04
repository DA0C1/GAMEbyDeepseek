/* HiDPI 渲染层
 *
 * 问题：游戏逻辑分辨率固定 1600×900，Scale.FIT 会把画布「拉伸」到窗口大小，
 *       大屏上文字和画面被放大 → 发糊。
 *
 * 做法：
 *   1. 画布背板按「窗口物理像素 / 1600」放大（1~2 倍），窗口变化时实时重算
 *   2. 每个场景相机 zoom 同倍率并居中，逻辑坐标仍是 1600×900，布局代码零改动
 *   3. 所有 Text 按同倍率重渲染（Phaser 的 Text 是预渲染贴图，必须提高 resolution 才清晰）
 */

import { W, H } from './config.js';

export const HI = { s: 1 };

function computeScale() {
  const dpr = window.devicePixelRatio || 1;
  const cssW = window.innerWidth || window.screen.width || W;
  const s = (cssW * dpr) / W;
  return Math.max(1, Math.min(2, s));
}

function applyCamera(scene) {
  const gw = Math.round(W * HI.s);
  const gh = Math.round(H * HI.s);
  (scene?.cameras?.cameras || []).forEach((cam) => {
    try {
      // A paused impact animation may still hold the previous zoom baseline.
      // Stop it before resizing, or resuming Settings would restore that scale.
      if (cam._zoomPunch) {
        scene.tweens?.killTweensOf(cam);
        cam._zoomPunch = false;
      }
      cam.setSize(gw, gh);
      cam.setZoom(HI.s);
      cam.centerOn(W / 2, H / 2);
    } catch (e) { /* ignore */ }
  });
}

/** 递归遍历显示对象（含 Container 内的文字） */
function forEachText(obj, fn) {
  if (!obj) return;
  if (obj.type === 'Text') fn(obj);
  const list = obj.list;
  if (Array.isArray(list)) list.forEach((c) => forEachText(c, fn));
}

/** 在 new Phaser.Game 之前调用 */
export function installHiDPI(sceneClasses) {
  HI.s = computeScale();

  // 1) 所有 add.text 创建的文本都按 HI.s 重渲染
  const Factory = Phaser.GameObjects.GameObjectFactory.prototype;
  const origText = Factory.text;
  Factory.text = function (x, y, text, style) {
    const t = origText.call(this, x, y, text, style);
    try { t.setResolution(HI.s); } catch (e) { /* ignore */ }
    return t;
  };

  // 2) 每个场景 create 之后设置相机
  sceneClasses.forEach((SceneClass) => {
    const proto = SceneClass.prototype;
    const origPreload = proto.preload;
    proto.preload = function (...args) {
      // 加载页在 preload 中创建画面，此时也必须使用逻辑坐标相机。
      try { applyCamera(this); } catch (e) { /* 相机尚未就绪时由 create 补上 */ }
      return origPreload ? origPreload.apply(this, args) : undefined;
    };
    const origCreate = proto.create;
    proto.create = function (...args) {
      const r = origCreate ? origCreate.apply(this, args) : undefined;
      try { applyCamera(this); } catch (e) { /* ignore */ }
      return r;
    };
  });

  // 3) 窗口尺寸变化：重算倍率，必要时重建背板、相机与文字贴图
  let timer = null;
  window.addEventListener('resize', () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      relayout();
    }, 180);
  });
}

function relayout() {
  const s2 = computeScale();
  if (Math.abs(s2 - HI.s) < 0.02) return;
  HI.s = s2;

  const game = window.__game;
  if (!game) return;
  const gw = Math.round(W * s2);
  const gh = Math.round(H * s2);

  try {
    game.scale.resize(gw, gh);
  } catch (e) { /* ignore */ }

  // 设置页会暂停原场景；暂停画面也要更新，恢复时才能匹配新的背板。
  game.scene.getScenes(false).forEach((scene) => {
    applyCamera(scene);
    (scene?.children?.list || []).forEach((o) => {
      forEachText(o, (t) => {
        try { t.setResolution(s2); } catch (e) { /* ignore */ }
      });
    });
  });
}

export function hidpiSize() {
  return { width: Math.round(W * HI.s), height: Math.round(H * HI.s) };
}
