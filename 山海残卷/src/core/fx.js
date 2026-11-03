/* 特效工厂：墨点、朱砂尘、伤害数字、镜头反馈 */

import { W, H, PAL, FONT, DEPTH } from './config.js';

const TEX = {};

/* 五行色墨点：克制命中时按属性炸开 */
export const EL_HEX = { jin: 0xb98f3f, mu: 0x4a7a52, shui: 0x2f6b8a, huo: 0xb23a2e, tu: 0x8a7350 };

export function ensureTextures(scene) {
  if (!TEX.ink) {
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x1d1a17, 1);
    g.fillCircle(24, 24, 17);
    g.generateTexture('fx_ink', 48, 48);
    g.clear();
    g.fillStyle(0xb23a2e, 1);
    g.fillCircle(16, 16, 11);
    g.generateTexture('fx_cinnabar', 32, 32);
    g.clear();
    g.fillStyle(0xb98f3f, 1);
    g.fillCircle(10, 10, 7);
    g.generateTexture('fx_gold', 20, 20);
    g.clear();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 6);
    g.generateTexture('fx_dust', 16, 16);
    Object.keys(EL_HEX).forEach((id) => {
      g.clear();
      g.fillStyle(EL_HEX[id], 1);
      g.fillCircle(18, 18, 13);
      g.generateTexture('fx_el_' + id, 36, 36);
    });
    g.destroy();
    TEX.ink = TEX.cinnabar = TEX.gold = TEX.dust = true;
  }
}

const TEXKEY = { ink: 'fx_ink', cinnabar: 'fx_cinnabar', gold: 'fx_gold', dust: 'fx_dust' };

export function burst(scene, x, y, opt = {}) {
  const kind = opt.tex || TEXKEY[opt.kind || 'ink'] || 'fx_ink';
  const count = opt.count || 12;
  const speed = opt.speed || 160;
  const life = opt.life || 600;
  const scale = opt.scale || 0.5;

  const emitter = scene.add.particles(x, y, kind, {
    speed: { min: speed * 0.3, max: speed },
    angle: opt.angle !== undefined
      ? { min: opt.angle - (opt.spread || 40), max: opt.angle + (opt.spread || 40) }
      : { min: 0, max: 360 },
    scale: { start: scale, end: 0 },
    alpha: { start: 0.9, end: 0 },
    lifespan: { min: life * 0.5, max: life },
    gravityY: opt.gravity || 0,
    blendMode: opt.add ? 'ADD' : 'NORMAL',
    emitting: false
  });
  emitter.setDepth(opt.depth || DEPTH.entities + 5);
  emitter.explode(count);
  scene.time.delayedCall(life + 200, () => emitter.destroy());
  return emitter;
}

export function inkSplash(scene, x, y, scale = 1) {
  burst(scene, x, y, { kind: 'ink', count: 16, speed: 220, scale: 0.7 * scale, life: 700 });
  burst(scene, x, y, { kind: 'cinnabar', count: 6, speed: 150, scale: 0.4 * scale, life: 520 });
}

export function damageNumber(scene, x, y, text, opt = {}) {
  const t = scene.add.text(x, y, String(text), {
    fontFamily: FONT.mono,
    fontSize: (opt.size || 34) + 'px',
    fontStyle: 'bold',
    color: opt.color || PAL.ink,
    stroke: opt.stroke || '#f8f1e2',
    strokeThickness: 6
  }).setOrigin(0.5).setDepth(opt.depth || DEPTH.hud - 1);

  scene.tweens.add({
    targets: t,
    y: y - (opt.rise || 62),
    alpha: { from: 1, to: 0 },
    scale: { from: opt.pop || 1.25, to: 0.9 },
    duration: opt.duration || 850,
    ease: 'Cubic.easeOut',
    onComplete: () => t.destroy()
  });
  return t;
}

export function shake(scene, intensity = 0.006, duration = 180) {
  try { scene.cameras.main.shake(duration, intensity); } catch (e) { /* ignore */ }
}

/* 重击镜头顿挫：轻微放大再弹回，模拟「一击定音」的呼吸感 */
export function zoomPunch(scene, amt = 0.014, dur = 130) {
  try {
    const cam = scene.cameras.main;
    if (cam._zoomPunch) return;
    cam._zoomPunch = true;
    const z0 = cam.zoom;
    scene.tweens.add({
      targets: cam, zoom: z0 + amt, duration: Math.round(dur * 0.4), yoyo: true,
      ease: 'Cubic.easeOut',
      onComplete: () => { cam.zoom = z0; cam._zoomPunch = false; }
    });
  } catch (e) { /* ignore */ }
}

/* 受击白闪：把立绘瞬时染成剪影白，一拍后还原 */
export function tintFlash(scene, img, ms = 70, color = 0xfff6e8) {
  if (!img || typeof img.setTintFill !== 'function') return;
  try {
    img.setTintFill(color);
    scene.time.delayedCall(ms, () => { try { img.clearTint(); } catch (e) { /* ignore */ } });
  } catch (e) { /* ignore */ }
}

/* 笔势弧线：从守卷人扫向目标的一道笔锋，落笔即收 */
export function slashArc(scene, x1, y1, x2, y2, opt = {}) {
  const color = opt.color || 0xb23a2e;
  const g = scene.add.graphics().setDepth(opt.depth || DEPTH.entities + 7);
  g.setBlendMode(Phaser.BlendModes.ADD);
  // 控制点在连线上方挑起，弧线像提笔的锋
  const cx = (x1 + x2) / 2 - Math.abs(x2 - x1) * 0.12;
  const cy = Math.min(y1, y2) - Math.abs(x2 - x1) * 0.22 - 50;
  const obj = { t: 0 };
  const draw = (t) => {
    g.clear();
    g.lineStyle(opt.width || 7, color, 0.8);
    g.beginPath();
    g.moveTo(x1, y1);
    const steps = 16;
    for (let i = 1; i <= steps; i++) {
      const u = (i / steps) * t;
      const a = 1 - u;
      g.lineTo(a * a * x1 + 2 * a * u * cx + u * u * x2,
               a * a * y1 + 2 * a * u * cy + u * u * y2);
    }
    g.strokePath();
    g.lineStyle(opt.width * 0.4, 0xfdfaf3, 0.5); // 内芯提亮
    g.beginPath();
    g.moveTo(x1, y1);
    for (let i = 1; i <= steps; i++) {
      const u = (i / steps) * t;
      const a = 1 - u;
      g.lineTo(a * a * x1 + 2 * a * u * cx + u * u * x2,
               a * a * y1 + 2 * a * u * cy + u * u * y2);
    }
    g.strokePath();
  };
  scene.tweens.add({
    targets: obj, t: 1, duration: opt.dur || 110, ease: 'Cubic.easeOut',
    onUpdate: () => draw(obj.t),
    onComplete: () => {
      scene.tweens.add({ targets: g, alpha: 0, duration: 150, onComplete: () => g.destroy() });
    }
  });
  return g;
}

export function flash(scene, color = 0xb23a2e, alpha = 0.3, duration = 220) {
  try {
    const c = Phaser.Display.Color.HexStringToColor(color);
    scene.cameras.main.flash(duration, c.red, c.green, c.blue, false);
  } catch (e) { /* ignore */ }
}

/* 墨迹转场：在场景上盖一层墨，再化开 */
export function inkTransition(scene, onMid, onDone) {
  const layer = scene.add.graphics().setDepth(DEPTH.overlay).setScrollFactor(0);
  let r = 0;
  const cx = W / 2;
  const cy = H / 2;
  const maxR = Math.hypot(cx, cy) * 1.05;

  const obj = { r: 0 };
  scene.tweens.add({
    targets: obj,
    r: maxR,
    duration: 380,
    ease: 'Cubic.easeIn',
    onUpdate: () => {
      layer.clear();
      layer.fillStyle(0x1d1a17, 1);
      layer.fillCircle(cx, cy, obj.r);
    },
    onComplete: () => {
      if (onMid) onMid();
      scene.tweens.add({
        targets: obj,
        r: 0,
        duration: 460,
        delay: 60,
        ease: 'Cubic.easeOut',
        onUpdate: () => {
          layer.clear();
          layer.fillStyle(0x1d1a17, 1);
          layer.fillCircle(cx, cy, obj.r);
        },
        onComplete: () => {
          layer.destroy();
          if (onDone) onDone();
        }
      });
    }
  });
}
