/* 战斗场景 */

import { W, H, PAL, FONT, DEPTH, CARD } from '../core/config.js';
import { save } from '../core/save.js';
import { run } from '../core/run.js';
import { random } from '../core/random.js';
import { audio } from '../core/audio.js';
import { Battle, BUFFS } from '../systems/battle.js';
import { FOES, traitTags } from '../data/enemies.js';
import { BOSS_TALK, PAGES } from '../data/story.js';
import { RELIC_SETS } from '../data/relics.js';
import { ELEMENTS, COMBO_NEED, elOf } from '../data/elements.js';
import { POTIONS, POTION_MAX, rollPotion } from '../data/potions.js';
import { ensureCardTexture } from '../ui/cardRender.js';
import { openOverlay, openRules } from '../ui/overlays.js';
import { drawIcon } from '../ui/icons.js';
import { text, makeButton } from '../ui/widgets.js';
import { showDialogue } from '../ui/dialogue.js';
import { createBossLyrics } from '../ui/lyrics.js';
import { BOSS_LYRICS } from '../data/bossLyrics.js';
import { burst, damageNumber, shake, inkSplash, flash, EL_HEX, slashArc, tintFlash, zoomPunch } from '../core/fx.js';

class CardView {
  constructor(scene, card, battle) {
    this.scene = scene;
    this.card = card;
    this.battle = battle;
    const key = ensureCardTexture(scene, card);
    this.img = scene.add.image(0, 0, key);
    this.img.setDisplaySize(CARD.w, CARD.h);
    this.container = scene.add.container(0, 0, [this.img]).setDepth(DEPTH.cards);
    this.baseX = 0; this.baseY = 0; this.baseRot = 0;
    this.x = 0; this.y = 0; this.rot = 0;
    this.scale = 1;
    this.hovered = false;
    this.dragging = false;
    this.dimmed = false;
    this.updateState();
  }

  setLayout(x, y, rot) {
    this.baseX = x; this.baseY = y; this.baseRot = rot;
    if (!this.dragging && !this.hovered && this.scene.selected !== this) {
      this.x = x; this.y = y; this.rot = rot;
    }
  }

  apply() {
    if (this.destroyed) return;
    this.container.x = this.x;
    this.container.y = this.y;
    this.container.rotation = this.rot;
    this.container.setScale(this.scale);
    const raised = this.hovered || this.scene.selected === this;
    this.container.setDepth(this.dragging ? DEPTH.dragCard : DEPTH.cards + (raised ? 10 : 0) + (this.order || 0) / 100);
  }

  hit(mx, my) {
    if (this.destroyed || this.removing) return false;
    const dx = mx - this.x, dy = my - this.y;
    const cos = Math.cos(-this.rot), sin = Math.sin(-this.rot);
    const lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;
    return Math.abs(lx) <= (CARD.w * this.scale) / 2 && Math.abs(ly) <= (CARD.h * this.scale) / 2;
  }

  /* 费用同步：刷新纹理（免费复制品跨回合转正）与可打性置灰 */
  updateState() {
    if (this.destroyed) return;
    const displayCost = this.battle && this.card.def.cost >= 0
      ? this.battle.costOf(this.card, true) : undefined;
    const key = ensureCardTexture(this.scene, this.card, displayCost);
    if (key && key !== this.img.texture.key) this.img.setTexture(key);
    const b = this.battle;
    const busy = this.dragging || this.hovered || this.scene.selected === this;
    const dim = !!(b && b.phase === 'player' && !busy && !b.canPlay(this.card));
    this.dimmed = dim;
    this.img.setAlpha(dim ? 0.52 : 1);
    if (dim) this.img.setTint(0x9a9285); else this.img.clearTint();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.container.destroy();
  }
}

export class BattleScene extends Phaser.Scene {
  constructor() { super('Battle'); }

  init(data) {
    this.encounter = data.encounter || [{ id: 'gudiao', scale: 1 }];
    this.nodeType = data.type || 'battle';
    this.cardViews = [];
    this.dragging = null;
    this.hovered = null;
    this.selected = null;
    this.uiLocked = true;
    this.enemyViews = [];
    // 场景实例会被复用，这些状态必须在每次进入时重置
    this._ended = false;
    this._pauseLayer = null;
    this._rules = null;
    this._codex = null;
    this._dialogue = null;
    this.dmgPreview = [];
    this.brushT = null;
    this.potionLayer = null;
    this.potionTip = null;
    this.lyricsView = null;
  }

  create() {
    this.cameras.main.fadeIn(450, 20, 17, 14);
    const act = run.map ? run.map.act : { theme: 'dawn', index: 0 };
    this.act = act;

    // 背景：按异兽的栖息地取景（大泽 / 密林 / 火原 / 山岭 / 荒谷 / 雪岭 / 空界）
    const lead = FOES[this.encounter[0] && this.encounter[0].id];
    const habKey = lead && lead.hab ? 'hab_' + lead.hab : null;
    const bgKey = (habKey && this.textures.exists(habKey)) ? habKey : ('bg_act' + (act.index + 1));
    if (this.textures.exists(bgKey)) {
      this.add.image(W / 2, H / 2, bgKey).setDisplaySize(W, H).setDepth(DEPTH.bg).setAlpha(0.74);
      this.add.rectangle(W / 2, H / 2, W, H, 0xefe6d4, 0.26).setDepth(DEPTH.bg + 1);
    } else {
      this.add.rectangle(W / 2, H / 2, W, H, 0xefe6d4).setDepth(DEPTH.bg);
    }
    // 地面
    const floor = this.add.graphics().setDepth(DEPTH.bg + 2);
    floor.fillGradientStyle(0xefe6d4, 0xefe6d4, 0xefe6d4, 0xefe6d4, 0, 0, 0.75, 0.75);
    floor.fillRect(0, 560, W, 340);

    this.battle = new Battle(run.player, this.encounter, { boss: this.nodeType === 'boss' });
    this.wireEvents();
    this.battle.start();

    this.buildEnemies();
    this.buildPlayerHud();
    this.buildHand();
    this.buildControls();
    this.drawPotions();

    // 顶部信息
    const title = this.nodeType === 'boss' ? '守卷之兽' : (this.nodeType === 'elite' ? '精英遭遇' : '遭遇');
    text(this, W / 2, 36, title, 22, { originX: 0.5, color: 'rgba(29,26,23,0.42)', font: FONT.song });

    audio.playBgm(this, this.nodeType === 'boss' ? 'bgm_boss' : 'bgm_battle');
    if (this.nodeType === 'boss') this.lyricsView = createBossLyrics(this, BOSS_LYRICS);
    this.events.once('shutdown', () => {
      if (this.lyricsView) { this.lyricsView.destroy(); this.lyricsView = null; }
      this.hideIntentTip();
      this._intentTip = null;
    });

    this.time.delayedCall(620, () => {
      // 开场动画结束不代表剧情已经结束；不能覆盖对话持有的输入锁。
      if (!this._dialogue && !this._ended) this.uiLocked = false;
      this.refreshHand();
    });

    // 初见经文：第一次照面的异兽，头顶浮现《图考》短注（守卷之兽有对话，不重复）
    if (this.nodeType !== 'boss') {
      this.time.delayedCall(760, () => {
        this.enemyViews.forEach((v) => {
          const f = v.foe;
          if (!f || !f.alive || !f.def || !f.def.lore) return;
          if ((save.data.seen.foes[f.id] || 0) > 1) return; // Battle 构造时已记一次
          const t = text(this, v.x, v.y - v.displayH * 0.62, '「' + f.def.lore + '」', 15, {
            originX: 0.5, color: 'rgba(58,52,44,0.68)', font: FONT.song,
            wrap: 460, align: 'center'
          }).setDepth(DEPTH.entities + 8).setAlpha(0);
          v.lore = t;
          this.tweens.add({ targets: t, alpha: 1, duration: 500, delay: 100 });
          this.tweens.add({
            targets: t, alpha: 0, y: t.y - 16, duration: 700, delay: 3200,
            onComplete: () => t.destroy()
          });
        });
      });
    }

    // Boss 前对话
    if (this.nodeType === 'boss' && run.map) {
      const talk = BOSS_TALK[this.act.boss];
      if (talk) this.time.delayedCall(300, () => this.showTalk(talk.before));
    }  }

  /* ---------------- 事件绑定 ---------------- */
  wireEvents() {
    const B = this.battle;
    B.on('turnStart', () => {
      this.refreshHand();
      this.drawEnergy();
      this.refreshPlayerHud();
      this.refreshEnemyBars();
      this.updateEnemyIntents();
      if (!this.battle || this.battle.turn === 1) return;
      this.floatText(W / 2, 150, '第 ' + B.turn + ' 回合', 'rgba(29,26,23,0.5)', 22);
    });
    B.on('enemyTurnStart', () => {
      this.drawEnergy();
      this.hideIntentGlow();
      audio.sfx('enemyTurn');
    });
    B.on('damage', ({ target, amount, isPlayer, el }) => {
      if (!isPlayer) this.updateEnemyIntents();
      // 多段攻击的 damage 事件是同步连发的：按目标错峰滚出，
      // 数字/音效逐段可辨，不再同帧叠成一团
      const pv = isPlayer ? this.playerView : this.enemyViews.find((v) => v.foe === target);
      if (!pv) { if (!isPlayer) audio.sfx('hit'); return; }
      const now = this.time.now;
      const startAt = Math.max(now, pv.fxAt || 0);
      pv.fxAt = startAt + (isPlayer ? 95 : 88);
      this.time.delayedCall(startAt - now, () => {
        if (!this.battle) return;
        if (isPlayer) {
          damageNumber(this, pv.x + 30, pv.y - 120, '-' + amount, { color: PAL.cinnabarLight, size: amount >= 15 ? 46 : 38 });
          const art = pv.img || pv.g;
          if (art) {
            this.tweens.add({ targets: art, x: pv.x + 10, duration: 60, yoyo: true, repeat: 1,
              onComplete: () => { art.x = pv.x; } });
            tintFlash(this, art, 60, 0xe8d8c8);
          }
          inkSplash(this, 300, 560, 0.8);
          shake(this, 0.008, 220);
          this.cameras.main.flash(140, 178, 58, 46, false);
          audio.sfx('hurt');
        } else {
          const conf = el && el.rel !== 0 ? ELEMENTS[el.el] : null;
          const heavy = amount >= 20, mid = amount >= 10;
          damageNumber(this, pv.x + (Math.random() - 0.5) * 60, pv.y - pv.displayH * 0.45, '-' + amount,
            { color: el && el.rel > 0 && conf ? conf.color : (heavy ? PAL.cinnabar : PAL.ink),
              size: heavy ? 52 : mid ? 42 : 32, pop: heavy ? 1.45 : 1.25 });
          inkSplash(this, pv.x, pv.y, heavy ? 0.85 : 0.6);
          if (el && el.rel > 0 && conf) {
            // 克制：按卡牌五行炸开同色墨点，并落一枚「克」
            burst(this, pv.x, pv.y, {
              tex: 'fx_el_' + el.el, count: 22, speed: 300, life: 820, scale: 0.72,
              depth: DEPTH.entities + 6
            });
            this.floatText(pv.x + 52, pv.y - pv.displayH * 0.36, '克', conf.color, 27);
          } else if (el && el.rel < 0) {
            this.floatText(pv.x + 52, pv.y - pv.displayH * 0.36, '被克', 'rgba(58,52,44,0.42)', 17);
          }
          this.tweens.add({
            // ev.img 在容器内，坐标是局部的：这里只能用 0 附近的值
            targets: pv.img, x: heavy ? 18 : 12, duration: 50, yoyo: true, repeat: 1,
            onComplete: () => { pv.img.x = 0; }
          });
          if (target.alive) tintFlash(this, pv.img, heavy ? 80 : 55);
          if (heavy) { zoomPunch(this); audio.sfx('heavy'); }
          else audio.sfx('hit');
          shake(this, heavy ? 0.009 : mid ? 0.004 : 0.0025, heavy ? 200 : 120);
        }
      });
      this.refreshEnemyBars();
      this.refreshPlayerHud();
    });
    B.on('block', ({ target, amount, gain }) => {
      const isP = target === this.battle.player;
      if (isP) {
        this.refreshPlayerHud();
        if (gain) damageNumber(this, 300, 520, '+' + amount, { color: PAL.azure, size: 28 });
      } else {
        this.refreshEnemyBars();
        if (gain) {
          const ev = this.enemyViews.find((v) => v.foe === target);
          if (ev) damageNumber(this, ev.x, ev.y - ev.displayH * 0.4, '+' + amount, { color: PAL.azure, size: 26 });
        }
      }
      if (gain) {
        audio.sfx('block');
      } else if (amount >= 5) {
        // 被护甲挡下：盾面擦碰，看得见这一下没打进血里
        const pos = isP ? { x: 300, y: 540 }
          : (this.enemyViews.find((v) => v.foe === target) || null);
        if (pos) {
          damageNumber(this, pos.x, pos.y - 100, '盾 ' + amount, { color: PAL.azure, size: 24 });
          burst(this, pos.x, pos.y - 40, { kind: 'dust', count: 10, speed: 130, life: 420, add: true });
        }
        audio.sfx('clang');
      }
    });
    B.on('heal', ({ target, amount }) => {
      const isP = target === this.battle.player;
      const pos = isP ? { x: 300, y: 560 } : (this.enemyViews.find((v) => v.foe === target) || { x: 1000, y: 400 });
      damageNumber(this, pos.x, pos.y - 90, '+' + amount, { color: PAL.jade, size: 32 });
      burst(this, pos.x, pos.y - 40, { kind: 'gold', count: 8, speed: 90, life: 700 });
      audio.sfx('heal');
      this.refreshPlayerHud();
      this.refreshEnemyBars();
    });
    B.on('buff', ({ target, name, stacks }) => {
      const info = BUFFS[name] || { name };
      const isP = target === this.battle.player;
      const pos = isP ? { x: 300, y: 500 } : (this.enemyViews.find((v) => v.foe === target) || { x: 1000, y: 400 });
      this.floatText(pos.x, pos.y - 70, info.name + ' +' + stacks, isP ? PAL.gold : PAL.ink3, 22);
      audio.sfx(isP ? 'buff' : 'debuff');
      this.refreshBuffs();
    });
    B.on('poisonTick', ({ target, amount }) => {
      const pos = target === this.battle.player ? { x: 300, y: 560 } : (this.enemyViews.find((v) => v.foe === target) || { x: 1000, y: 400 });
      this.floatText(pos.x, pos.y - 100, '中毒 -' + amount, PAL.jade, 26);
      burst(this, pos.x, pos.y - 60, { kind: 'ink', count: 10, speed: 70, life: 800 });
      audio.sfx('poison');
    });
    B.on('burnTick', ({ target, amount }) => {
      const pos = target === this.battle.player ? { x: 300, y: 560 } : (this.enemyViews.find((v) => v.foe === target) || { x: 1000, y: 400 });
      this.floatText(pos.x, pos.y - 100, '灼烧 -' + amount, PAL.cinnabar, 26);
      burst(this, pos.x, pos.y - 60, { kind: 'cinnabar', count: 12, speed: 110, life: 700, add: true });
      audio.sfx('burn');
    });
    B.on('enemyDeath', ({ enemy }) => {
      this.hideDamagePreview();
      const ev = this.enemyViews.find((v) => v.foe === enemy);
      if (ev) {
        this.hideIntentTip();
        if (this.hoverFoe === enemy) this.hoverFoe = null;
        ev.img.disableInteractive();
        // 光晕、灵光、地面墨影和选中圈不在立绘容器内，必须一起清理。
        const visuals = [ev.container, ev.shadow, ev.halo, ev.aura, ev.ring, ev.lore].filter(Boolean);
        this.tweens.killTweensOf([ev.img, ...visuals]);
        ev.hpBar.setVisible(false);
        ev.intent.setVisible(false);
        burst(this, ev.x, ev.y, { kind: 'ink', count: 26, speed: 260, life: 900, scale: 0.9 });
        burst(this, ev.x, ev.y, { kind: 'cinnabar', count: 10, speed: 180, life: 700 });
        this.tweens.add({
          targets: ev.container, scaleX: 1.15, scaleY: 1.15,
          duration: 620, ease: 'Cubic.easeOut'
        });
        this.tweens.add({
          targets: visuals, alpha: 0, duration: 620, ease: 'Cubic.easeOut',
          onComplete: () => visuals.forEach((obj) => { if (obj.scene) obj.destroy(); })
        });
        run.stats.kills++;
      }
      audio.sfx('kill');
      shake(this, 0.01, 260);
      this.refreshEnemyBars();
    });
    B.on('trait', ({ target, text }) => {
      const ev = this.enemyViews.find((v) => v.foe === target);
      if (!ev) return;
      this.floatText(ev.x, ev.y - ev.displayH * 0.28, text, PAL.cinnabar, 24);
      this.tweens.add({ targets: ev.img, scaleX: ev.img.scaleX * 1.04, scaleY: ev.img.scaleY * 1.04, duration: 90, yoyo: true });
    });
    B.on('bossPhase', ({ enemy, phase }) => {
      const ev = this.enemyViews.find((v) => v.foe === enemy);
      audio.sfx('bossWarn');
      shake(this, 0.012, 420);
      this.cameras.main.flash(300, 178, 58, 46, false);
      if (ev) {
        this.floatText(ev.x, ev.y - ev.displayH * 0.4, phase.name, PAL.cinnabar, 44);
        const key2 = 'foe_' + enemy.id + '_2';
        if (this.textures.exists(key2)) {
          // 二阶段换相：先被朱砂闪白吞掉，再以新形体淡回
          const img = ev.img;
          this.tweens.add({
            targets: img, alpha: 0, duration: 260,
            onComplete: () => {
              img.setTexture(key2);
              img.setDisplaySize(ev.displayW, ev.displayH);
              img.setAlpha(0);
              this.tweens.add({ targets: img, alpha: 0.94, duration: 520, ease: 'Cubic.easeOut' });
            }
          });
          burst(this, ev.x, ev.y, { kind: 'cinnabar', count: 34, speed: 340, life: 900, scale: 1.0 });
          burst(this, ev.x, ev.y, { kind: 'ink', count: 20, speed: 260, life: 800, scale: 0.9 });
        } else {
          this.tweens.add({ targets: ev.img, alpha: 0.35, duration: 120, yoyo: true, repeat: 3 });
        }
      }
      this.time.delayedCall(420, () => {
        // 阶段台词
        if (phase.line) {
          const t = text(this, W / 2, 300, phase.line, 26, {
            originX: 0.5, originY: 0.5, color: PAL.ink, font: FONT.song,
            stroke: '#f8f1e2', strokeThickness: 5
          }).setDepth(DEPTH.overlay);
          t.setAlpha(0);
          this.tweens.add({ targets: t, alpha: 1, duration: 350, yoyo: true, hold: 1500, onComplete: () => t.destroy() });
        }
      });
      this.updateEnemyTraits();
      this.updateEnemyIntents();
    });
    B.on('enrage', ({ enemy, str }) => {
      const ev = this.enemyViews.find((v) => v.foe === enemy);
      if (ev) {
        this.floatText(ev.x, ev.y - ev.displayH * 0.34, '狂 暴', PAL.cinnabar, 34);
        shake(this, 0.006, 180);
      }
      audio.sfx('bossWarn');
      this.updateEnemyTraits();
    });
    B.on('draw', () => { this.refreshHand(); this.refreshPiles(); });
    B.on('discardAll', () => { this.refreshHand(); this.refreshPiles(); });
    B.on('energy', ({ amount }) => {
      this.drawEnergy();
      this.updateHandState();
      if (amount > 0) {
        // 回灵脉冲：灵力盘弹一下，耳朵里也有一点声
        if (this.energyT) {
          this.energyT.setScale(1.3);
          this.tweens.add({ targets: this.energyT, scale: 1, duration: 200, ease: 'Cubic.easeOut' });
        }
        audio.sfx('energy');
      }
    });
    B.on('cardPlayed', ({ card }) => { this.refreshHand(); this.drawEnergy(); this.refreshPiles(); this.updateEnemyIntents(); });
    B.on('curse', () => { this.refreshHand(); this.refreshPiles(); });
    B.on('turnStart', () => {
      this.updateHandState();
      this.refreshPiles();
      // 重置打击反馈错峰链
      this.enemyViews.forEach((v) => { v.fxAt = 0; });
      if (this.playerView) this.playerView.fxAt = 0;
    });
    B.on('brush', () => this.drawEnergy());
    B.on('xiangsheng', ({ el, from }) => {
      const a = ELEMENTS[from];
      const b = ELEMENTS[el];
      if (!a || !b) return;
      this.floatText(300, 468, '相生 · ' + a.name + '生' + b.name, a.color, 19);
      burst(this, 300, 520, { kind: 'gold', count: 8, speed: 150, life: 620, scale: 0.45 });
      audio.sfx('buff');
    });
    B.on('potion', () => {
      this.drawPotions(); this.refreshPlayerHud(); this.refreshEnemyBars(); this.updateEnemyIntents();
      this.updateHandState();
      const activeCard = this.dragging || this.selected || this.hovered;
      if (activeCard) this.showDamagePreview(activeCard.card);
    });
    B.on('surge', ({ el, conf }) => this.playSurge(el, conf));
    B.on('win', () => this.onWin());
    B.on('lose', () => this.onLose());
    B.on('end', (r) => this.onEnd(r));
  }

  /* ---------------- 敌人 ---------------- */
  buildEnemies() {
    const list = this.battle.aliveEnemies();
    const n = list.length;
    const slots = n === 1 ? [1120] : n === 2 ? [930, 1310] : [830, 1110, 1380];
    const floorY = 482;

    this.battle.enemies.forEach((foe, i) => {
      const def = FOES[foe.id];
      const base = def.kind === 'boss' ? 430 : (def.kind === 'elite' ? 390 : 340);
      const targetH = base * (n >= 3 ? 0.86 : 1);
      const x = slots[i] || (860 + i * 280);

      const elConf = def.el ? ELEMENTS[def.el] : null;
      const elHex = elConf ? (EL_HEX[def.el] || 0x8a7350) : 0x8a7350;
      const key = 'foe_' + foe.id;
      let displayW = targetH, displayH = targetH;

      // 按素材原始宽高比适配，避免立绘被压扁
      if (this.textures.exists(key)) {
        const src = this.textures.get(key).getSourceImage();
        const ar = (src && src.width && src.height) ? src.width / src.height : 1;
        displayH = targetH;
        displayW = displayH * ar;
        const maxW = (n >= 3 ? 330 : n === 2 ? 420 : 560);
        if (displayW > maxW) { displayW = maxW; displayH = maxW / ar; }
      }

      const y = floorY - displayH * 0.5;

      let img;
      if (this.textures.exists(key)) {
        img = this.add.image(0, 0, key);
        img.setDisplaySize(displayW, displayH);
      } else {
        img = this.add.rectangle(0, 0, displayW * 0.7, displayH * 0.7, 0x2a2520, 0.2);
      }
      img.setDepth(DEPTH.entities);
      img.setAlpha(0);
      img.setBlendMode(Phaser.BlendModes.NORMAL);
      this.tweens.add({ targets: img, alpha: 0.94, duration: 520, delay: i * 110, ease: 'Cubic.easeOut' });

      // 墨迹落笔效果
      burst(this, x, y, { kind: 'ink', count: 16, speed: 200, life: 700, scale: 0.8 });

      // 地面墨影
      const shadow = this.add.graphics().setDepth(DEPTH.entities - 1);
      shadow.fillStyle(0x2a2520, 0.10);
      shadow.fillEllipse(x, floorY - 6, displayW * 0.62, displayH * 0.075);
      this.tweens.add({ targets: shadow, alpha: { from: 0, to: 1 }, duration: 600, delay: i * 110 });
      shadow.setAlpha(0);

      // 五行灵光：极淡的彩晕垫在立绘后面，一眼能看出属性
      let aura = null;
      if (elConf) {
        aura = this.add.graphics().setDepth(DEPTH.entities - 1);
        aura.fillStyle(elHex, 0.14);
        aura.fillEllipse(x, y + displayH * 0.03, displayW * 0.98, displayH * 0.94);
        aura.setAlpha(0);
        this.tweens.add({ targets: aura, alpha: 1, duration: 820, delay: i * 110 });
      }

      // 宣纸光晕：把立绘从背景山水中托出来
      const halo = this.add.graphics().setDepth(DEPTH.entities - 1);
      halo.fillStyle(0xf6efdf, 0.34);
      halo.fillEllipse(x, y + displayH * 0.04, displayW * 0.86, displayH * 0.86);
      this.tweens.add({ targets: halo, alpha: { from: 0, to: 1 }, duration: 700, delay: i * 110 });

      const container = this.add.container(x, y, [img]).setDepth(DEPTH.entities);

      // 血条在上，姓名在下 —— 避免文字压在血条上
      const barW = def.kind === 'boss' ? 400 : 240;
      const barY = displayH * 0.5 + 6;
      const hpBar = this.add.graphics().setDepth(DEPTH.entities + 2);
      container.add(hpBar);

      const nameT = this.add.text(0, barY + 32, def.name, {
        fontFamily: FONT.song, fontSize: def.kind === 'boss' ? '34px' : '26px', color: PAL.ink
      }).setOrigin(0.5).setDepth(DEPTH.entities + 1);
      const subT = this.add.text(0, barY + 62, def.title, {
        fontFamily: FONT.hei, fontSize: '13px', color: 'rgba(58,52,44,0.52)'
      }).setOrigin(0.5).setDepth(DEPTH.entities + 1);
      subT.setVisible(false);
      container.add([nameT, subT]);

      // 五行印：缀在名字左侧，像一行小注
      let elSeal = null, elGlyph = null;
      if (elConf) {
        const sx = -(nameT.width / 2) - 22;
        elSeal = this.add.graphics().setDepth(DEPTH.entities + 1);
        elSeal.fillStyle(elHex, 0.1);
        elSeal.lineStyle(1.2, elHex, 0.78);
        elSeal.fillCircle(sx, barY + 32, 14);
        elSeal.strokeCircle(sx, barY + 32, 14);
        elGlyph = this.add.text(sx, barY + 32, elConf.name, {
          fontFamily: FONT.song, fontSize: '15px', color: elConf.color
        }).setOrigin(0.5).setDepth(DEPTH.entities + 2);
        container.add([elSeal, elGlyph]);
      }

      // 意图
      const intent = this.add.container(0, -displayH * 0.5 + 6).setDepth(DEPTH.entities + 2);
      container.add(intent);

      // 特性标签
      const trTags = traitTags(def);
      const traitT = this.add.text(0, barY + 57, trTags.join(' · '), {
        fontFamily: FONT.hei, fontSize: '12.5px', color: 'rgba(164,48,38,0.92)'
      }).setOrigin(0.5).setDepth(DEPTH.entities + 1);
      traitT.setStroke('#f7efdd', 4);
      container.add(traitT);

      const view = { foe, container, img, x, y, displayH, displayW, hpBar, barW, barY, intent, nameT, subT, shadow, halo, traitT, trTags, elConf, aura, elSeal, elGlyph };
      this.enemyViews.push(view);

      // 点击选中为目标
      img.setInteractive({ useHandCursor: true });
      img.on('pointerdown', () => this.onEnemyClick(foe));
      img.on('pointerover', () => { this.hoverFoe = foe; });
      img.on('pointerout', () => { if (this.hoverFoe === foe) this.hoverFoe = null; });

      this.drawEnemyBar(view);
      this.drawIntent(view);
    });

    this.refreshEnemyBars();
  }

  updateEnemyTraits() {
    this.enemyViews.forEach((v) => {
      if (!v.foe.alive || !v.traitT || !v.trTags) return;
      const f = v.foe;
      const tags = v.trTags.filter((t) => !(t === '狂暴' && f._enraged));
      // 动态增益并入同一行：力/毒/灼/弱/伤/愈，玩家不必心算
      const b = f.buffs || {};
      if (b.str > 0) tags.push('力+' + b.str);
      if (b.poison > 0) tags.push('毒' + b.poison);
      if (b.burn > 0) tags.push('灼' + b.burn);
      if (b.weak > 0) tags.push('弱' + b.weak);
      if (b.vuln > 0) tags.push('伤' + b.vuln);
      if (b.regen > 0) tags.push('愈' + b.regen);
      v.traitT.setText(tags.join(' · '));
    });
  }

  drawEnemyBar(view) {
    const f = view.foe;
    if (!f.alive) return;
    const g = view.hpBar;
    const w = view.barW, h = 13;
    const x = -w / 2, y = view.barY;
    g.clear();
    // 槽
    g.fillStyle(0x1d1a17, 0.14);
    g.fillRoundedRect(x - 1, y - 1, w + 2, h + 2, (h + 2) / 2);
    const pct = Math.max(0, f.hp / f.maxHp);
    if (pct > 0) {
      g.fillStyle(0x8b2a20, 1);
      g.fillRoundedRect(x, y, Math.max(h, w * pct), h, h / 2);
      g.fillStyle(0xc65b4d, 0.5);
      g.fillRoundedRect(x, y + 1, Math.max(h, w * pct), h * 0.42, h / 4);
    }
    // 护甲
    if (f.block > 0) {
      g.fillStyle(0x2f6b8a, 0.95);
      g.fillRoundedRect(x - 3, y - 7, Math.min(w + 6, w * (f.block / Math.max(1, f.maxHp)) + 14), 5, 2);
    }
    g.lineStyle(1, 0x1d1a17, 0.35);
    g.strokeRoundedRect(x, y, w, h, h / 2);

    // 血量数字压在条上
    if (!view.hpT) {
      view.hpT = this.add.text(0, y + h / 2, '', {
        fontFamily: FONT.mono, fontSize: '12px', color: '#fdfaf3',
        stroke: '#3a2a22', strokeThickness: 2.4
      }).setOrigin(0.5).setDepth(DEPTH.entities + 3);
      view.container.add(view.hpT);
    }
    view.hpT.setText(`${Math.max(0, f.hp)} / ${f.maxHp}`);
    view.hpT.setY(y + h / 2);
  }

  drawIntent(view) {
    this.hideIntentTip();
    const c = view.intent;
    c.removeAll(true);
    const f = view.foe;
    const forecast = this.battle.previewEnemyIntent(f);
    const mv = forecast.move || (forecast.willDie ? { type: 'debuff' } : null);
    if (!mv) return;
    const g = this.add.graphics();
    const r = 30;
    let col = 0x1d1a17;
    if (mv.type === 'attack' || mv.type === 'attack_debuff') col = 0xb23a2e;
    else if (mv.type === 'defend') col = 0x2f6b8a;
    else if (mv.type === 'buff') col = 0xb98f3f;
    else if (mv.type === 'debuff') col = 0x41694a;

    g.fillStyle(0xfdfaf3, 0.92);
    g.fillCircle(0, 0, r);
    g.lineStyle(1.4, col, 0.6);
    g.strokeCircle(0, 0, r);
    c.add(g);

    const iconKey = forecast.willDie ? 'skull' : mv.type === 'attack' || mv.type === 'attack_debuff' ? 'sword'
      : mv.type === 'defend' ? 'shield'
        : mv.type === 'buff' ? 'star' : 'eye';
    // 用小纹理绘制图标
    const tex = this.iconTexture(iconKey, col);
    if (tex) {
      const ic = this.add.image(0, 0, tex).setDisplaySize(34, 34);
      c.add(ic);
    }

    let dmgText = forecast.willDie ? '将亡' : '';
    if (mv.dmg) {
      const hits = forecast.damageByHit;
      dmgText = hits.every((value) => value === hits[0])
        ? String(hits[0]) + (hits.length > 1 ? '×' + hits.length : '')
        : hits.join('+');
    } else if (mv.block) {
      dmgText = '+' + mv.block;
    }
    if (dmgText) {
      const t = this.add.text(0, r + 14, dmgText, {
        fontFamily: FONT.mono, fontSize: '18px', fontStyle: 'bold',
        color: mv.dmg ? PAL.cinnabar : PAL.azure,
        stroke: '#fdfaf3', strokeThickness: 4
      }).setOrigin(0.5);
      c.add(t);
    }

    // 意图可悬停：把图标翻译成人话，新手不必去翻图鉴
    const hit = this.add.zone(0, 0, 84, 84).setOrigin(0.5).setInteractive();
    hit.on('pointerover', () => this.showIntentTip(view));
    hit.on('pointerout', () => this.hideIntentTip());
    hit.on('pointerdown', () => { this.hideIntentTip(); this.onEnemyClick(view.foe); });
    c.add(hit);
  }

  intentTipLines(mv, f, forecast = this.battle.previewEnemyIntent(f)) {
    if (forecast.willDie) return ['按当前状态，毒 / 灼烧将在行动前致死。', '前序行动可能改变结果。'];
    const out = [];
    if (forecast.phaseChange) out.push('毒 / 灼烧将触发新阶段，意图已预演。');
    if (mv.dmg) {
      const hits = forecast.damageByHit;
      out.push('伤害 ' + (hits.every((value) => value === hits[0])
        ? hits[0] + (hits.length > 1 ? ' × ' + hits.length : '')
        : hits.join(' + ') + '（合计 ' + hits.reduce((sum, value) => sum + value, 0) + '）'));
    }
    if (mv.block) out.push('护甲 +' + mv.block);
    if (mv.playerBuff) out.push('使你' + ((BUFFS[mv.playerBuff[0]] || {}).name || mv.playerBuff[0]) + ' ' + mv.playerBuff[1]);
    if (mv.selfBuff) out.push('自身' + ((BUFFS[mv.selfBuff[0]] || {}).name || mv.selfBuff[0]) + ' +' + mv.selfBuff[1]);
    if (mv.special === 'curse') out.push('塞入一张诅咒');
    out.push('按当前状态估算；前序行动可能改变结果。');
    return out;
  }

  showIntentTip(view) {
    this.hideIntentTip();
    if (!view.foe || !this.battle) return;
    const forecast = this.battle.previewEnemyIntent(view.foe);
    const mv = forecast.move || (forecast.willDie ? { type: 'debuff', name: '毒灼将止行动' } : null);
    if (!mv) return;
    const typeName = { attack: '攻', attack_debuff: '攻', defend: '守', buff: '势', debuff: '术' }[mv.type] || '行';

    const title = this.add.text(0, 0, `${typeName}　${mv.name}`, {
      fontFamily: FONT.song, fontSize: '19px', color: PAL.ink
    });
    const bodyStr = this.intentTipLines(mv, view.foe, forecast).join('\n');
    const body = bodyStr ? this.add.text(0, 0, bodyStr, {
      fontFamily: FONT.hei, fontSize: '14px', color: 'rgba(58,52,44,0.82)', lineSpacing: 6
    }) : null;

    const w = Math.max(title.width, body ? body.width : 0) + 38;
    const h = title.height + (body ? body.height + 10 : 0) + 24;
    const intentY = view.y - view.displayH * 0.5 + 6;
    const cx = Phaser.Math.Clamp(view.x, w / 2 + 12, W - w / 2 - 12);
    // 上方放得下就放上方，否则压到意图下面（Boss 头顶常贴屏幕边）
    let cy = intentY - h / 2 - 16;
    if (cy - h / 2 < 8) cy = intentY + h / 2 + 30;
    cy = Phaser.Math.Clamp(cy, h / 2 + 8, H - h / 2 - 8);

    const g = this.add.graphics().setDepth(DEPTH.tooltip);
    g.fillStyle(0x2a2118, 0.16);
    g.fillRoundedRect(cx - w / 2 + 2, cy - h / 2 + 4, w, h, 5);
    g.fillStyle(0xfdfaf3, 0.97);
    g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 5);
    g.lineStyle(1, 0x1d1a17, 0.28);
    g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 5);
    g.fillStyle(0xb23a2e, 0.85);
    g.fillRect(cx - w / 2 + 13, cy - h / 2 + 14, 2, 18);

    title.setPosition(cx - w / 2 + 26, cy - h / 2 + 10).setDepth(DEPTH.tooltip + 1);
    if (body) body.setPosition(cx - w / 2 + 26, cy - h / 2 + 14 + title.height).setDepth(DEPTH.tooltip + 1);

    this._intentTip = [g, title, body].filter(Boolean);
    this._intentTip.forEach((o) => o.setAlpha(0));
    this.tweens.add({ targets: this._intentTip, alpha: 1, duration: 120 });
  }

  hideIntentTip() {
    if (!this._intentTip) return;
    this._intentTip.forEach((o) => { try { o.destroy(); } catch (e) {} });
    this._intentTip = null;
  }

  iconTexture(name, color) {
    const key = 'icon_' + name + '_' + color;
    if (this.textures.exists(key)) return key;
    const cv = this.textures.createCanvas(key, 96, 96);
    if (!cv) return null;
    drawIcon(cv.getContext(), name, 48, 48, 76, '#' + color.toString(16).padStart(6, '0'), 1.3);
    cv.refresh();
    return key;
  }

  updateEnemyIntents() {
    this.enemyViews.forEach((v) => {
      if (v.foe.alive) this.drawIntent(v);
    });
  }

  refreshEnemyBars() {
    this.enemyViews.forEach((v) => this.drawEnemyBar(v));
    this.updateEnemyTraits();
  }

  refreshBuffs() {
    this.drawPlayerBuffs();
    this.updateEnemyIntents();
  }

  /* ---------------- 玩家 HUD ---------------- */
  buildPlayerHud() {
    const p = run.player;

    // 人物立绘（与异兽比例接近，底部贴近手牌上沿）
    const px = 278, py = 332;
    if (this.textures.exists('guardian')) {
      const img = this.add.image(px, py, 'guardian').setDepth(DEPTH.entities);
      img.setDisplaySize(410, 410);
      img.setAlpha(0);
      this.tweens.add({ targets: img, alpha: 1, duration: 600, ease: 'Cubic.easeOut' });
      this.playerView = { x: px, y: py, img };
    } else {
      const g = this.add.graphics().setDepth(DEPTH.entities);
      this.playerView = { x: px, y: py, g };
      this.drawPlayerFigure(g, px, py);
    }

    // 立绘下的墨影与身份圈
    const shadow = this.add.graphics().setDepth(DEPTH.entities - 1);
    shadow.fillStyle(0x2a2520, 0.10);
    shadow.fillEllipse(px, 516, 250, 26);
    shadow.lineStyle(1.4, 0x1d1a17, 0.16);
    shadow.strokeEllipse(px, 516, 300, 44);
    shadow.lineStyle(1, 0x1d1a17, 0.10);
    shadow.strokeEllipse(px, 516, 352, 60);
    this.playerShadow = shadow;

    // 身份牌
    const tagG = this.add.graphics().setDepth(DEPTH.entities + 1);
    tagG.fillStyle(0xb23a2e, 0.72);
    tagG.fillRect(px - 26, 528, 2, 30);
    this.add.text(px - 16, 530, '守卷人', {
      fontFamily: FONT.song, fontSize: '17px', color: 'rgba(29,26,23,0.8)'
    }).setDepth(DEPTH.entities + 1).setStroke('#f7efdd', 4);

    /* ---------- 左上：卷轴式状态牌 ---------- */
    const hx = 54, hy = 40, hw = 356, hh = 146;
    const panel = this.add.graphics().setDepth(DEPTH.hud - 1);
    panel.fillStyle(0xfdfaf3, 0.82);
    panel.fillRoundedRect(hx, hy, hw, hh, 4);
    panel.fillStyle(0xb23a2e, 0.85);
    panel.fillRect(hx, hy + 10, 3, hh - 20);
    panel.lineStyle(1, 0x1d1a17, 0.16);
    panel.strokeRoundedRect(hx, hy, hw, hh, 4);
    this.hudPanel = panel;

    // 名号
    text(this, hx + 22, hy + 16, '守 卷 人', 15, { font: FONT.song, color: PAL.ink2 });

    // 气血条
    this.playerHpBar = new (class {
      constructor(scene, x, y, w, h) {
        this.scene = scene; this.x = x; this.y = y; this.w = w; this.h = h;
        this.g = scene.add.graphics().setDepth(DEPTH.hud);
      }
      set(cur, max) {
        const g = this.g;
        g.clear();
        g.fillStyle(0x1d1a17, 0.13);
        g.fillRoundedRect(this.x - 1, this.y - 1, this.w + 2, this.h + 2, (this.h + 2) / 2);
        const pct = Math.max(0, Math.min(1, cur / max));
        if (pct > 0) {
          g.fillStyle(0x8b2a20, 1);
          g.fillRoundedRect(this.x, this.y, Math.max(this.h, this.w * pct), this.h, this.h / 2);
          g.fillStyle(0xc65b4d, 0.45);
          g.fillRoundedRect(this.x, this.y + 1, Math.max(this.h, this.w * pct), this.h * 0.42, this.h / 4);
        }
        g.lineStyle(1, 0x1d1a17, 0.32);
        g.strokeRoundedRect(this.x, this.y, this.w, this.h, this.h / 2);
      }
    })(this, hx + 22, hy + 44, 236, 15);

    this.playerHpT = text(this, hx + 270, hy + 51, '', 14, {
      font: FONT.mono, color: PAL.ink2, originY: 0.5
    });

    // 护甲
    this.blockT = text(this, hx + 330, hy + 16, '', 15, { font: FONT.hei, color: PAL.azure, originX: 1 });

    this.buffLayer = this.add.container(hx + 22, hy + 72).setDepth(DEPTH.hud + 2);

    // 套装共鸣
    const sets = Object.keys(this.battle.activeSets || {});
    if (sets.length) {
      const names = sets.map((k) => RELIC_SETS[k].name).join(' · ');
      text(this, hx + 22, hy + 116, '共鸣  ' + names, 14, {
        font: FONT.hei, color: PAL.gold
      });
    }

    this.refreshPlayerHud();
    this.drawPlayerBuffs();
  }

  drawPlayerFigure(g, x, y) {
    g.clear();
    const ink = 0x2a2520;
    // 墨气
    g.fillStyle(ink, 0.06);
    g.fillCircle(x, y - 40, 120);
    // 身体
    g.fillStyle(ink, 0.86);
    g.beginPath();
    g.moveTo(x - 66, y);
    g.lineTo(x - 22, y - 96);
    g.lineTo(x + 22, y - 96);
    g.lineTo(x + 66, y);
    g.closePath();
    g.fillPath();
    // 衣纹
    g.lineStyle(1.4, 0xefe6d4, 0.35);
    g.beginPath();
    g.moveTo(x - 30, y - 20);
    g.lineTo(x, y - 70);
    g.lineTo(x + 30, y - 20);
    g.strokePath();
    // 头
    g.fillStyle(ink, 0.9);
    g.fillCircle(x, y - 116, 22);
    // 斗笠
    g.fillStyle(0x3a342c, 0.95);
    g.beginPath();
    g.moveTo(x - 42, y - 126);
    g.lineTo(x, y - 156);
    g.lineTo(x + 42, y - 126);
    g.closePath();
    g.fillPath();
    g.lineStyle(1.2, 0xb98f3f, 0.4);
    g.strokePath();
    // 手中卷
    g.fillStyle(0xf3ecdc, 0.9);
    g.fillRoundedRect(x - 26, y - 62, 52, 16, 2);
    g.lineStyle(1, 0xb23a2e, 0.5);
    g.strokeRoundedRect(x - 26, y - 62, 52, 16, 2);
  }

  refreshPlayerHud() {
    const p = run.player;
    if (this.playerHpBar) this.playerHpBar.set(p.hp, p.maxHp);
    if (this.playerHpT) this.playerHpT.setText(`${Math.max(0, p.hp)} / ${p.maxHp}`);
    if (this.blockT) {
      this.blockT.setText(p.block > 0 ? `护甲 ${p.block}` : '');
    }
    this.drawPlayerBuffs();
  }

  drawPlayerBuffs() {
    if (!this.buffLayer) return;
    this.buffLayer.removeAll(true);
    const p = run.player;
    let i = 0;
    Object.keys(p.buffs || {}).forEach((k) => {
      if (p.buffs[k] > 0 && BUFFS[k]) {
        const info = BUFFS[k];
        const bw = 30, step = 36;
        const col = Phaser.Display.Color.HexStringToColor(info.color).color;
        const g = this.add.graphics();
        g.fillStyle(0xfdfaf3, 0.95);
        g.fillRoundedRect(i * step, 0, bw, bw, 3);
        g.lineStyle(1, col, 0.6);
        g.strokeRoundedRect(i * step, 0, bw, bw, 3);
        this.buffLayer.add(g);
        const tex = this.iconTexture(info.icon, col);
        if (tex) {
          const ic = this.add.image(i * step + bw / 2, bw / 2, tex).setDisplaySize(21, 21);
          this.buffLayer.add(ic);
        }
        const st = this.add.text(i * step + bw - 1, bw - 1, String(p.buffs[k]), {
          fontFamily: FONT.mono, fontSize: '13px', fontStyle: 'bold', color: PAL.ink,
          stroke: '#fdfaf3', strokeThickness: 3
        }).setOrigin(1, 1);
        this.buffLayer.add(st);
        i++;
      }
    });
  }

  /* ---------------- 手牌 ---------------- */
  buildHand() {
    this.handLayer = this.add.container(0, 0).setDepth(DEPTH.cards);
    this.refreshHand();
    this.drawEnergy();
    this.refreshPiles();
  }

  refreshHand() {
    if (!this.battle) return;
    const hand = this.battle.hand;

    // 同步视图
    const wanted = hand.slice();
    this.cardViews.slice().forEach((v) => {
      if (wanted.indexOf(v.card) < 0 && !v.removing) {
        if (this.hovered === v) { this.hovered = null; this.hideDamagePreview(); }
        if (this.dragging === v) { this.dragging = null; this.highlightTarget(null); }
        if (this.selected === v) { this.selected = null; this.hideDamagePreview(); }
        v.hovered = v.dragging = false;
        v.removing = true;
        this.tweens.add({
          targets: v.container, y: v.container.y + 80, alpha: 0, duration: 220,
          onComplete: () => v.destroy()
        });
        this.cardViews.splice(this.cardViews.indexOf(v), 1);
      }
    });
    const exist = new Set(this.cardViews.map((v) => v.card));
    wanted.forEach((card) => {
      if (!exist.has(card)) {
        const v = new CardView(this, card, this.battle);
        v.container.setAlpha(0);
        v.container.y = 900;
        this.cardViews.push(v);
        this.tweens.add({ targets: v.container, alpha: 1, duration: 260 });
      }
    });

    // 排序：按手牌顺序
    this.cardViews.sort((a, b) => wanted.indexOf(a.card) - wanted.indexOf(b.card));
    this.layoutHand();
    this.updateHandState();
  }

  /* 手牌可打性批量刷新：灵力变动 / 回合切换后置灰同步 */
  updateHandState() {
    this.cardViews.forEach((v) => { if (!v.removing) v.updateState(); });
  }

  layoutHand() {
    const n = this.cardViews.length;
    if (!n) return;
    const maxW = n <= 6 ? 1100 : 960;
    const step = Math.min(196, maxW / Math.max(1, n - 1));
    const cx = 800 - Math.max(0, Math.min(56, (n - 6) * 14));
    this.cardViews.forEach((v, i) => {
      v.order = i;
      const off = i - (n - 1) / 2;
      const x = cx + off * step;
      const y = 712 + Math.abs(off) * 6;
      const rot = off * 0.028;
      v.setLayout(x, y, rot);
      if (!v.dragging && !v.hovered) {
        this.tweens.killTweensOf(v);
        const selected = this.selected === v;
        this.tweens.add({
          targets: v, x, y: y - (selected ? 70 : 0), rot: selected ? 0 : rot, scale: selected ? 1.24 : 1, duration: 180, ease: 'Cubic.easeOut',
          onUpdate: () => v.apply()
        });
      }
    });
    this.cardViews.forEach((v) => v.apply());
  }

  /* ---------------- 药水 ---------------- */
  drawPotions() {
    if (this.potionTip) { this.potionTip.destroy(true); this.potionTip = null; }
    if (this.potionLayer) this.potionLayer.destroy(true);
    this.potionLayer = this.add.container(0, 0).setDepth(DEPTH.hud + 2);

    const list = run.player.potions || [];
    const y = 104;

    for (let i = 0; i < POTION_MAX; i++) {
      const x = 438 + i * 64;
      const id = list[i];
      const def = id ? POTIONS[id] : null;

      const g = this.add.graphics();
      g.fillStyle(0x1d1a17, 0.05);
      g.fillCircle(x, y, 29);
      if (def) {
        const col = Phaser.Display.Color.HexStringToColor(def.color).color;
        g.fillStyle(0xfdfaf3, 0.95);
        g.fillCircle(x, y, 25);
        g.lineStyle(2, col, 0.9);
        g.strokeCircle(x, y, 25);
      } else {
        g.lineStyle(1.2, 0x1d1a17, 0.18);
        g.strokeCircle(x, y, 25);
      }
      this.potionLayer.add(g);

      if (def) {
        const col = Phaser.Display.Color.HexStringToColor(def.color).color;
        const tex = this.iconTexture(def.icon, col);
        if (tex) {
          const ic = this.add.image(x, y, tex).setDisplaySize(30, 30);
          this.potionLayer.add(ic);
        }
        const z = this.add.zone(x - 26, y - 26, 52, 52).setOrigin(0, 0)
          .setInteractive({ useHandCursor: true });
        z.on('pointerover', () => this.showPotionTip(x, y, def));
        z.on('pointerout', () => this.hidePotionTip());
        z.on('pointerdown', () => this.usePotionAt(i));
        this.potionLayer.add(z);
      }
    }
  }

  showPotionTip(x, y, def) {
    this.hidePotionTip();
    const tw = 300;
    // 靠右挂，避免压住左侧的守卷人立绘
    const tx = Math.min(x - 18, W - tw - 20);
    const ty = y + 40;

    const c = this.add.container(0, 0).setDepth(DEPTH.tooltip);
    const g = this.add.graphics();
    g.fillStyle(0xfdfaf3, 0.97);
    g.fillRoundedRect(tx, ty, tw, 72, 6);
    g.lineStyle(1.2, Phaser.Display.Color.HexStringToColor(def.color).color, 0.6);
    g.strokeRoundedRect(tx, ty, tw, 72, 6);
    c.add(g);

    c.add(this.add.text(tx + 16, ty + 12, def.name, {
      fontFamily: FONT.song, fontSize: '19px', color: PAL.ink
    }));
    c.add(this.add.text(tx + 16, ty + 40, def.desc, {
      fontFamily: FONT.hei, fontSize: '13px', color: 'rgba(58,52,44,0.8)',
      wordWrap: { width: tw - 32 }, lineSpacing: 4
    }));

    this.potionTip = c;
  }

  hidePotionTip() {
    if (!this.potionTip) return;
    this.potionTip.destroy(true);
    this.potionTip = null;
  }

  usePotionAt(i) {
    if (this.isInputBlocked()) return;
    const id = (run.player.potions || [])[i];
    if (!id) return;
    const def = POTIONS[id];
    this.hidePotionTip();
    const ok = this.battle.usePotion(i);
    if (!ok) return;
    audio.sfx('potion');
    this.floatText(438 + i * 64, 150, def.name, def.color, 18);
    this.drawPotions();
  }

  drawEnergy() {
    if (this.energyG) this.energyG.destroy();
    if (this.energyT) this.energyT.destroy();
    const p = run.player;
    const x = 118, y = 676;
    const g = this.add.graphics().setDepth(DEPTH.hud);

    /* 外圈五行环：笔意所在 */
    const order = ['jin', 'mu', 'shui', 'huo', 'tu'];
    const b = this.battle;
    const curEl = b ? b.brushEl : null;
    const cnt = b ? b.brushCount : 0;
    const seg = (Math.PI * 2) / 5;
    order.forEach((id, i) => {
      const conf = ELEMENTS[id];
      const a0 = -Math.PI / 2 + i * seg + 0.055;
      const a1 = -Math.PI / 2 + (i + 1) * seg - 0.055;
      const on = (curEl === id);
      const col = Phaser.Display.Color.HexStringToColor(conf.color).color;
      g.lineStyle(on ? 6 : 4, col, on ? 1 : (curEl ? 0.14 : 0.34));
      g.beginPath();
      g.arc(x, y, 60, a0, a1);
      g.strokePath();
    });

    /* 层数：当前属性弧外侧的三个点 */
    if (curEl) {
      const conf = ELEMENTS[curEl];
      const idx = order.indexOf(curEl);
      const mid = -Math.PI / 2 + (idx + 0.5) * seg;
      const col = Phaser.Display.Color.HexStringToColor(conf.color).color;
      for (let k = 0; k < COMBO_NEED - 1; k++) {
        const a = mid - 0.20 + k * 0.20;
        const px = x + Math.cos(a) * 74;
        const py = y + Math.sin(a) * 74;
        if (k < cnt - 1) {
          g.fillStyle(col, 0.95);
          g.fillCircle(px, py, 4.2);
        } else {
          g.lineStyle(1.2, col, 0.5);
          g.strokeCircle(px, py, 3.6);
        }
      }
    }

    g.fillStyle(0x1d1a17, 0.08);
    g.fillCircle(x, y, 42);
    g.fillStyle(0xfdfaf3, 0.9);
    g.fillCircle(x, y, 34);
    g.lineStyle(2, 0xb98f3f, 0.7);
    g.strokeCircle(x, y, 34);
    const energyMax = this.battle.energyMax();
    const pct = Math.max(0, Math.min(1, p.energy / Math.max(1, energyMax)));
    if (pct > 0) {
      g.lineStyle(4, 0xb23a2e, 0.85);
      g.beginPath();
      g.arc(x, y, 30, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
      g.strokePath();
    }
    this.energyG = g;
    this.energyT = text(this, x, y, `${p.energy}/${energyMax}`, 21, {
      font: FONT.mono, color: PAL.ink, originX: 0.5, originY: 0.5
    }).setDepth(DEPTH.hud + 1);

    if (this.brushT) { this.brushT.destroy(); this.brushT = null; }
    if (curEl) {
      const conf = ELEMENTS[curEl];
      const tip = (cnt >= COMBO_NEED - 1) ? '再一张成势' : `${cnt} / ${COMBO_NEED}`;
      this.brushT = text(this, x + 74, y - 4, conf.name + '\n' + tip, 13, {
        font: FONT.hei, color: conf.color, originX: 0, originY: 0.5, lineSpacing: 3
      }).setDepth(DEPTH.hud + 1);
    }
  }

  /* 成势：三张同属相连，落一笔大的 */
  playSurge(el, conf) {
    const col = Phaser.Display.Color.HexStringToColor(conf.color).color;
    flash(this, col, 0.16, 240);
    shake(this, 0.009, 280);
    audio.sfx('surge');

    const cx = W / 2, cy = 336;

    const blot = this.add.graphics().setDepth(DEPTH.overlay - 4).setAlpha(0);
    blot.fillStyle(0x1d1a17, 0.016);
    blot.fillCircle(cx, cy, 148);
    blot.fillStyle(0x1d1a17, 0.022);
    blot.fillCircle(cx, cy, 108);
    blot.fillStyle(0x1d1a17, 0.026);
    blot.fillCircle(cx, cy, 70);
    blot.lineStyle(1, col, 0.28);
    blot.strokeCircle(cx, cy, 124);
    blot.lineStyle(1, col, 0.14);
    blot.strokeCircle(cx, cy, 150);

    const glyph = this.add.text(cx, cy - 10, conf.glyph, {
      fontFamily: FONT.song, fontSize: '92px', color: conf.color,
      stroke: '#f8f1e2', strokeThickness: 3
    }).setOrigin(0.5).setDepth(DEPTH.overlay - 3).setAlpha(0).setScale(1.45);

    const label = this.add.text(cx, cy + 60, conf.full + '　成 势', {
      fontFamily: FONT.hei, fontSize: '21px', color: 'rgba(29,26,23,0.82)',
      stroke: '#f8f1e2', strokeThickness: 4
    }).setOrigin(0.5).setDepth(DEPTH.overlay - 3).setAlpha(0);

    this.tweens.add({ targets: blot, alpha: 1, duration: 180 });
    this.tweens.add({ targets: glyph, alpha: 1, scale: 1, duration: 340, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: label, alpha: 1, duration: 280, delay: 110 });

    // 墨点四散
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3;
      const d = 70 + Math.random() * 90;
      burst(this, cx + Math.cos(a) * 30, cy + Math.sin(a) * 30, {
        count: 3, color: conf.color, speed: 120 + Math.random() * 140, size: 1.4
      });
    }

    this.time.delayedCall(820, () => {
      this.tweens.add({
        targets: [blot, glyph, label], alpha: 0, duration: 380,
        onComplete: () => { blot.destroy(); glyph.destroy(); label.destroy(); }
      });
    });
  }

  refreshPiles() {
    if (this.pileT) this.pileT.destroy();
    const b = this.battle;
    this.pileT = text(this, W - 40, H - 22,
      `抽 ${b.drawPile.length}   弃 ${b.discardPile.length}   耗 ${b.exhaustPile.length}`,
      13, { font: FONT.mono, color: 'rgba(58,52,44,0.6)', originX: 1 });
  }

  buildControls() {
    makeButton(this, W - 202, 706, 164, 56, '结束回合', () => this.endTurn(), { size: 22, primary: true });
    makeButton(this, W - 62, 36, 78, 34, '暂停', () => this.togglePause(), { size: 15 });
    this.input.keyboard.on('keydown-ESC', () => this.togglePause());
    makeButton(this, W - 202, 610, 164, 36, '牌　组', () => this.openCodex('cards'), { size: 15 });
    makeButton(this, W - 202, 652, 164, 36, '法　宝', () => this.openCodex('relics'), { size: 15 });

    this.input.on('pointerdown', (pointer) => this.onPointerDown(pointer));
    this.input.on('pointermove', (pointer) => this.onPointerMove(pointer));
    this.input.on('pointerup', (pointer) => this.onPointerUp(pointer));
  }

  showDamagePreview(card) {
    this.hideDamagePreview();
    if (!card || !this.battle || this.battle.phase !== 'player') return;
    if (!card.def) return;
    this.dmgPreview = [];

    this.battle.enemies.forEach((e) => {
      if (!e.alive) return;
      const pv = this.battle.previewDamage(card, e);
      if (!pv) return;
      const ev = this.enemyViews.find((v) => v.foe === e);
      if (!ev) return;
      const x = ev.x;
      const y = ev.y - ev.displayH * 0.12;
      const lethal = pv.lethal;
      const em = pv.element || { rel: 0 };
      const keHex = em.rel > 0 ? (EL_HEX[em.el] || 0xb23a2e) : 0xb23a2e;

      // 底衬：克制时描边换成目标被克的那一行的颜色
      const plate = this.add.graphics().setDepth(DEPTH.tooltip - 1);
      let plateTop = y - 34;
      const paintPlate = (height) => {
        plate.clear();
        plate.fillStyle(lethal ? 0x8b2a20 : 0xfdfaf3, lethal ? 0.92 : 0.88);
        plate.fillRoundedRect(x - 114, plateTop, 228, height, 8);
        plate.lineStyle(em.rel > 0 ? 2 : 1.5, lethal ? 0xfdfaf3 : (em.rel > 0 ? keHex : 0xb23a2e), em.rel > 0 ? 0.85 : 0.6);
        plate.strokeRoundedRect(x - 114, plateTop, 228, height, 8);
      };
      paintPlate(68);
      this.dmgPreview.push(plate);

      const main = this.add.text(x, y - 2, pv.uncertain ? '≈' + pv.total : pv.pureOnly ? '＋' + pv.total : String(pv.total), {
        fontFamily: FONT.mono, fontSize: pv.uncertain ? '34px' : pv.pureOnly ? '40px' : '52px', fontStyle: 'bold',
        color: lethal ? '#fdfaf3' : '#b23a2e'
      }).setOrigin(0.5).setDepth(DEPTH.tooltip);
      this.dmgPreview.push(main);
      plateTop = Math.min(plateTop, y - 2 - main.height / 2 - 8);
      const subtitleY = Math.max(y + 24, y - 2 + main.height / 2 + 4);
      paintPlate(Math.max(y + 34, y - 2 + main.height / 2 + 10) - plateTop);

      const frag = [];
      if (em.rel > 0 && ELEMENTS[em.el] && ELEMENTS[em.foeEl]) {
        frag.push(ELEMENTS[em.el].name + '克' + ELEMENTS[em.foeEl].name);
      } else if (em.rel < 0 && ELEMENTS[em.el] && ELEMENTS[em.foeEl]) {
        frag.push('被克 · ' + ELEMENTS[em.foeEl].name + '克' + ELEMENTS[em.el].name);
      }
      if (pv.randomTarget) frag.push('随机分配 · 示例');
      else if (pv.uncertain) frag.push('可能闪避 · 示例');
      if (pv.playerDefeated) frag.push('自损 / 反噬致败');
      if (pv.hits > 1) frag.push(pv.damageByHit?.every((value) => value === pv.per)
        ? pv.per + ' × ' + pv.hits : '共 ' + pv.hits + ' 段');
      if (pv.blocked > 0) frag.push('挡 ' + pv.blocked + ' → ' + pv.effective);
      if (pv.surge) {
        frag.push(pv.surge.dmg
          ? `成势 +${pv.surge.dmg}`
          : `成势 · ${pv.surge.conf.name}${pv.surge.el === 'jin' ? '群伤' : pv.surge.el === 'mu' ? '群毒' : pv.surge.el === 'huo' ? '群烧' : pv.surge.el === 'shui' ? '护甲' : '抽牌'}`);
      }
      if (frag.length) {
        const sub = this.add.text(x, subtitleY, frag.join('  '), {
          fontFamily: FONT.hei, fontSize: '13px', align: 'center', lineSpacing: 2,
          wordWrap: { width: 208, useAdvancedWrap: true },
          color: lethal ? 'rgba(253,250,243,0.92)' : 'rgba(139,42,32,0.9)'
        }).setOrigin(0.5, 0).setDepth(DEPTH.tooltip);
        paintPlate(subtitleY + sub.height + 10 - plateTop);
        this.dmgPreview.push(sub);
      }

      if (!lethal && em.rel > 0) {
        const kt = this.add.text(x, plateTop - 10, '克', {
          fontFamily: FONT.song, fontSize: '18px', color: '#fdfaf3',
          backgroundColor: '#' + keHex.toString(16).padStart(6, '0'), padding: { x: 7, y: 1 }
        }).setOrigin(0.5).setDepth(DEPTH.tooltip);
        this.dmgPreview.push(kt);
      }

      if (lethal) {
        const seal = this.add.text(x, plateTop - 10, '斩', {
          fontFamily: FONT.song, fontSize: '22px', color: '#fdfaf3',
          backgroundColor: 'rgba(139,42,32,0.9)', padding: { x: 6, y: 2 }
        }).setOrigin(0.5).setDepth(DEPTH.tooltip);
        this.dmgPreview.push(seal);
      }
    });
  }

  hideDamagePreview() {
    if (!this.dmgPreview) return;
    this.dmgPreview.forEach((o) => { try { o.destroy(); } catch (e) { } });
    this.dmgPreview = [];
  }

  togglePause() {
    if (this._dialogue) return;
    // 牌组/法宝浮层优先：ESC 先收浮层，再谈暂停
    if (this._codex) { this._codex.close(); this._codex = null; return; }
    if (this._pauseLayer) this.hidePause();
    else this.showPause();
  }

  showPause() {
    if (this._pauseLayer || this._ended || ['won', 'lost'].includes(this.battle?.phase)) return;
    this.cancelCardInteraction();
    if (this._codex) { this._codex.close(); this._codex = null; }
    this.hideDamagePreview();
    const layer = this.add.container(0, 0).setDepth(DEPTH.overlay + 30);

    const bg = this.add.graphics();
    bg.fillStyle(0x0f0d0a, 0.94);
    bg.fillRect(0, 0, W, H);
    layer.add(bg);

    const blocker = this.add.zone(W / 2, H / 2, W, H).setInteractive();
    layer.add(blocker);

    const t1 = this.add.text(W / 2, 268, '暂　停', {
      fontFamily: FONT.song, fontSize: '52px', color: '#f6efdf'
    }).setOrigin(0.5);
    const t2 = this.add.text(W / 2, 316,
      `第 ${this.battle.turn} 回合　·　气血 ${run.player.hp} / ${run.player.maxHp}`, {
      fontFamily: FONT.mono, fontSize: '16px', color: 'rgba(202,191,169,0.75)'
    }).setOrigin(0.5);
    layer.add([t1, t2]);

    const bw = 300, bh = 58, bx = (W - bw) / 2;
    const mk = (y, label, cb, opt) => {
      const btn = makeButton(this, bx, y, bw, bh, label, cb, {
        size: 20, depth: DEPTH.overlay + 31, ...(opt || {})
      });
      layer.add(btn);
      return btn;
    };

    mk(384, '继续', () => this.hidePause());
    mk(452, '要　诀', () => this.showRules(), { size: 19, font: FONT.hei });
    mk(520, '心　法 · 设置', () => {
      this.scene.launch('Settings', { from: 'Battle' });
      this.scene.pause();
    }, { size: 18, font: FONT.hei });
    mk(588, '放弃本局', () => {
      this.onEnd('lose');
    }, { size: 18, color: PAL.cinnabar });

    layer.add(this.add.text(W / 2, 700, 'ESC 或点击「继续」返回战斗', {
      fontFamily: FONT.hei, fontSize: '15px', color: 'rgba(202,191,169,0.62)'
    }).setOrigin(0.5).setDepth(DEPTH.overlay + 31));

    this._pauseLayer = layer;
  }

  hidePause() {
    if (this._rules) { this._rules.close(); this._rules = null; }
    if (!this._pauseLayer) return;
    this._pauseLayer.destroy(true);
    this._pauseLayer = null;
  }

  showRules() {
    if (this._rules) { this._rules.close(); this._rules = null; return; }
    this._rules = openRules(this, { depth: DEPTH.overlay + 40, onClose: () => { this._rules = null; } });
  }

  openCodex(kind) {
    if (this._codex) { this._codex.close(); this._codex = null; return; }
    if (this._dialogue || this._pauseLayer || this._rules) return;
    this.cancelCardInteraction();
    audio.sfx('page');
    this._codex = openOverlay(this, {
      kind,
      cards: kind === 'cards' ? run.player.deck : [],
      relics: kind === 'relics' ? run.player.relics : [],
      onClose: () => { this._codex = null; }
    });
  }

  endTurn() {
    if (this.isInputBlocked()) return;
    this.hideDamagePreview();
    this.clearSelection();
    this.battle.endTurn();
    SH_safeUpdate(this);
  }

  /* ---------------- 交互 ---------------- */
  isInputBlocked() {
    return this.uiLocked || !this.battle || this.battle.phase !== 'player'
      || !!(this._pauseLayer || this._rules || this._codex || this._dialogue);
  }

  cancelCardInteraction() {
    this.hideDamagePreview();
    this.hideIntentTip();
    this.hidePotionTip();
    this.clearSelection();
    this.highlightTarget(null);
    const cards = new Set([this.dragging, this.hovered].filter(Boolean));
    this.dragging = null;
    this.hovered = null;
    cards.forEach((v) => {
      v.dragging = false;
      v.hovered = false;
      v.updateState();
      this.returnCard(v);
    });
  }

  onPointerDown(pointer) {
    if (this.isInputBlocked()) return;
    const mx = pointer.worldX, my = pointer.worldY;

    // 点敌人（选中模式下出牌）
    if (this.selected) {
      const foe = this.foeAt(mx, my);
      if (foe) { this.playCard(this.selected, foe); return; }
      this.clearSelection();
      return;
    }

    const v = this.cardAt(mx, my);
    if (!v) return;
    if (!this.battle.canPlay(v.card)) {
      this.floatText(v.x, v.y - 160, v.card.def.unplayable ? '无法打出' : '灵力不足', PAL.ink4, 20);
      audio.sfx('debuff');
      return;
    }
    this.tweens.killTweensOf(v);
    v.dragging = true;
    this.dragging = v;
    this.dragStartX = mx;
    this.dragStartY = my;
    v.container.setDepth(DEPTH.dragCard);
    v.updateState();
    audio.sfx('draw');
  }

  cardAt(mx, my) {
    let top = null, depth = -Infinity;
    this.cardViews.forEach(v => {
      const renderedDepth = v.container.depth || 0;
      if (v.hit(mx, my) && renderedDepth >= depth) { top = v; depth = renderedDepth; }
    });
    return top;
  }

  onPointerMove(pointer) {
    if (this.isInputBlocked()) return;
    const mx = pointer.worldX, my = pointer.worldY;
    if (this.dragging) {
      const v = this.dragging;
      v.x = mx;
      v.y = my - 60;
      v.rot = 0;
      v.scale = 1.06;
      v.apply();
      this.highlightTarget(this.foeAt(mx, my));
      if (!this.dmgPreview || this.dmgPreview.length === 0) this.showDamagePreview(v.card);
      return;
    }
    if (this.uiLocked) return;
    // 悬停
    const hover = this.cardAt(mx, my);
    if (hover !== this.hovered) {
      if (this.hovered) {
        const h = this.hovered;
        h.hovered = false;
        h.updateState();
        this.hideDamagePreview();
        this.tweens.killTweensOf(h);
        const selected = this.selected === h;
        this.tweens.add({ targets: h, scale: selected ? 1.24 : 1, y: h.baseY - (selected ? 70 : 0), rot: selected ? 0 : h.baseRot, duration: 160, onUpdate: () => h.apply() });
      }
      this.hovered = hover;
      if (hover) {
        hover.hovered = true;
        hover.updateState();
        this.showDamagePreview(hover.card);
        audio.sfx('hover');
        this.tweens.killTweensOf(hover);
        this.tweens.add({
          targets: hover, scale: 1.24, y: hover.baseY - 70, rot: 0, duration: 170,
          ease: 'Cubic.easeOut', onUpdate: () => hover.apply()
        });
      }
    }
  }

  onPointerUp(pointer) {
    if (this.isInputBlocked()) return;
    if (!this.dragging) return;
    const v = this.dragging;
    const mx = pointer.worldX, my = pointer.worldY;
    const moved = Math.hypot(mx - this.dragStartX, my - this.dragStartY);
    const foe = this.foeAt(mx, my);

    v.dragging = false;
    this.dragging = null;
    this.highlightTarget(null);
    v.updateState();

    const needTarget = v.card.def.target === 'enemy';

    if (moved < 14) {
      // 点击
      if (needTarget) {
        this.selected = v;
        this.floatText(W / 2, 470, '点选目标', PAL.cinnabar, 22);
        this.showDamagePreview(v.card);
        this.tweens.killTweensOf(v);
        this.tweens.add({ targets: v, scale: 1.24, y: v.baseY - 70, rot: 0, duration: 150, onUpdate: () => v.apply() });
        return;
      }
      this.playCard(v, null);
      return;
    }

    // 拖拽
    if (needTarget) {
      if (foe) this.playCard(v, foe);
      else this.returnCard(v);
    } else {
      if (my < 690) this.playCard(v, null);
      else this.returnCard(v);
    }
  }

  returnCard(v) {
    if (v.destroyed || v.removing) return;
    v.hovered = false;
    if (this.hovered === v) this.hovered = null;
    if (this.selected === v) this.selected = null;
    this.hideDamagePreview();
    v.updateState();
    this.tweens.killTweensOf(v);
    v.apply();
    this.tweens.add({
      targets: v, x: v.baseX, y: v.baseY, rot: v.baseRot, scale: 1,
      duration: 220, ease: 'Back.easeOut', onUpdate: () => v.apply()
    });
  }

  clearSelection() {
    if (this.selected) this.hideDamagePreview();
    const prev = this.selected;
    this.selected = null;
    if (prev && !prev.removing) {
      prev.updateState();
      prev.apply();
      if (prev !== this.hovered && !prev.dragging) this.returnCard(prev);
    }
  }

  playCard(v, foe) {
    if (this.isInputBlocked() || !v || v.removing) return;
    if (!this.battle.canPlay(v.card) || !this.battle.hand.includes(v.card)) { this.returnCard(v); return; }
    // 攻击牌：先落一道笔势弧线、守卷人前倾，让「打出去」先于「掉血」出现
    if (v.card.def.type === 'attack' && this.playerView) {
      const ev = foe
        ? this.enemyViews.find((e) => e.foe === foe)
        : this.enemyViews.find((e) => e.foe.alive);
      const px = this.playerView.x + 70, py = this.playerView.y - 40;
      const tx = ev ? ev.x : 1000;
      const ty = ev ? ev.y - ev.displayH * 0.2 : 400;
      const el = elOf(v.card);
      slashArc(this, px, py, tx, ty, { color: (el && EL_HEX[el]) || 0xb23a2e, width: 7 });
      audio.sfx('slash');
      const art = this.playerView.img || this.playerView.g;
      if (art) {
        const dx = Math.max(-1, Math.min(1, tx - px)) * 24;
        this.tweens.add({
          targets: art, x: this.playerView.x + dx, duration: 110, yoyo: true, ease: 'Cubic.easeIn',
          onComplete: () => { art.x = this.playerView.x; }
        });
      }
    }
    // 先把飞出的视图与手牌解绑。出牌事件中的抽牌/回响会立即刷新手牌，
    // 返回的同一张逻辑牌必须获得新视图，不能在旧视图动画结束时一起销毁。
    this.tweens.killTweensOf(v);
    const viewIndex = this.cardViews.indexOf(v);
    if (viewIndex >= 0) this.cardViews.splice(viewIndex, 1);
    v.removing = true;
    const ok = this.battle.playCard(v.card, foe);
    if (!ok) {
      v.removing = false;
      if (viewIndex >= 0) this.cardViews.splice(viewIndex, 0, v);
      this.returnCard(v);
      return;
    }
    if (this.hovered === v) this.hovered = null;
    if (this.dragging === v) this.dragging = null;
    this.hideDamagePreview();
    this.clearSelection();
    // 卡牌飞向目标
    const tx = foe ? (this.enemyViews.find((e) => e.foe === foe) || { x: 1000 }).x : W / 2;
    const ty = foe ? 340 : 420;
    const c = v.container;
    v.hovered = false;
    v.removing = true;
    this.tweens.add({
      targets: c, x: tx, y: ty, scale: 0.6, alpha: 0, rotation: 0,
      duration: 280, ease: 'Cubic.easeIn',
      onComplete: () => {
        const idx = this.cardViews.indexOf(v);
        if (idx >= 0) this.cardViews.splice(idx, 1);
        v.destroy();
        this.layoutHand();
      }
    });
    // 消耗牌：飞到一半化成余烬
    if (v.card.def.exhaust) {
      this.time.delayedCall(200, () => {
        if (!this.battle || !this.scene) return;
        burst(this, W / 2, ty + 40, { kind: 'cinnabar', count: 14, speed: 130, life: 620, add: true });
        if (audio.gate('exhaustFx', 120)) audio.sfx('burn');
      });
    }
    audio.sfx('play');
    this.drawEnergy();
    this.refreshPlayerHud();
    this.refreshEnemyBars();
    this.refreshPiles();
  }

  onEnemyClick(foe) {
    if (this.isInputBlocked() || !foe.alive) return;
    if (this.selected) {
      this.playCard(this.selected, foe);
    }
  }

  foeAt(x, y) {
    for (const v of this.enemyViews) {
      if (!v.foe.alive) continue;
      const hw = v.displayH * 0.34;
      const hh = v.displayH * 0.44;
      if (Math.abs(x - v.x) < hw && Math.abs(y - v.y) < hh) return v.foe;
    }
    return null;
  }

  highlightTarget(foe) {
    this.enemyViews.forEach((v) => {
      if (!v.foe.alive) {
        if (v.ring && v.ring.scene) v.ring.clear();
        return;
      }
      if (!v.ring) {
        v.ring = this.add.graphics().setDepth(DEPTH.entities - 1);
      }
      v.ring.clear();
      if (foe === v.foe) {
        v.ring.lineStyle(3, 0xb23a2e, 0.55);
        v.ring.strokeCircle(v.x, v.y, v.displayH * 0.36);
        v.ring.lineStyle(1, 0xb23a2e, 0.3);
        v.ring.strokeCircle(v.x, v.y, v.displayH * 0.4);
      }
    });
  }

  hideIntentGlow() {
    this.enemyViews.forEach((v) => { if (v.ring) v.ring.clear(); });
  }

  /* ---------------- 表现辅助 ---------------- */
  floatText(x, y, str, color, size) {
    const t = this.add.text(x, y, str, {
      fontFamily: FONT.hei, fontSize: size + 'px', color,
      stroke: '#f3ecdc', strokeThickness: 4
    }).setOrigin(0.5).setDepth(DEPTH.hud + 5);
    this.tweens.add({
      targets: t, y: y - 44, alpha: 0, duration: 900, ease: 'Cubic.easeOut',
      onComplete: () => t.destroy()
    });
  }

  showTalk(lines) {
    // 打字机对话：逐字浮现、点击推进（推进提示/快进由组件处理）
    const def = FOES[this.act.boss];
    save.seeLore('boss_' + this.act.boss + '_before');
    this.cancelCardInteraction();
    this.uiLocked = true;
    showDialogue(this, {
      speaker: def ? def.name : null,
      lines,
      onDone: () => { if (!this._ended) this.uiLocked = false; }
    });
  }

  /* ---------------- 结束 ---------------- */
  onWin() {
    this.uiLocked = true;
    audio.sfx('win');
    this.time.delayedCall(200, () => {
      this.floatText(W / 2, 260, '净', PAL.cinnabar, 90);
      burst(this, W / 2, 300, { kind: 'gold', count: 30, speed: 300, life: 1200, add: true });
    });
  }

  onLose() {
    this.uiLocked = true;
    audio.sfx('lose');
    shake(this, 0.012, 600);
    this.time.delayedCall(200, () => {
      this.cameras.main.fadeOut(1200, 20, 17, 14);
    });
  }

  onEnd(result) {
    if (this._ended) return;
    this._ended = true;
    // 胜败与主动退出都应保留本场统计，且只能计入一次。
    const b = this.battle;
    run.stats.damage += b.damageDealt;
    run.stats.cardsPlayed += b.cardsPlayed;
    if (result === 'lose') {
      this.scene.start('Result', { win: false });
      return;
    }
    // 胜利结算
    const node = run.map ? run.map.cur.node : null;
    if (node) node.cleared = true;
    run.player.gold += b.bonusGold;
    if (this.nodeType === 'elite') run.stats.elites++;
    if (b.outHeal > 0) run.heal(b.outHeal);

    // 首领会提前转入剧情，药水必须在所有胜利分支之前发放。
    let potion = null;
    const chance = this.nodeType === 'boss' ? 1 : (this.nodeType === 'elite' ? 0.65 : 0.3);
    if (random() < chance && run.player.potions.length < POTION_MAX) {
      potion = rollPotion();
      if (potion) run.addPotion(potion);
    }
    if (this.nodeType === 'boss' && potion) {
      this.floatText(W / 2, 356, '获得药水 · ' + POTIONS[potion].name, PAL.gold, 24);
    }

    // Boss：残页 + 推进卷目；胜利后先演守卷之兽的遗言，再进结算
    if (this.nodeType === 'boss') {
      // 从未收集的残页里挑一张（优先本卷），避免拿到重复页
      const got = run.flags.pages;
      const pool = PAGES.filter((p) => got.indexOf(p.id) < 0);
      let page = null;
      if (pool.length) {
        const prefer = pool.filter((p) => p.act === run.actIndex);
        const src = prefer.length ? prefer : pool;
        page = src[Math.floor(random() * src.length)];
        run.recordPage(page.id); // 统一走 recordPage：图鉴见闻 + 补笔回血
      }
      const proceed = () => {
        if (run.actIndex < 2) {
          // 卷末成长：残印解封，否则玩家的灵力与血量完全跟不上后两卷的敌人曲线
          run.player.maxHp += 10;
          run.player.energyMax += 1;
          run.heal(Math.round(run.player.maxHp * 0.75));
          run.actIndex++;
          run.map = null;
          run._actIntroShown = false;
          this.scene.start('Story', { kind: 'act', page });
          return;
        }
        this.scene.start('Story', { kind: 'final', page });
      };
      const talk = BOSS_TALK[this.act.boss];
      if (talk && talk.after && talk.after.length) {
        // 让「净」的余韵先落一拍，再入遗言
        save.seeLore('boss_' + this.act.boss + '_after');
        this.time.delayedCall(1100, () => {
          this.uiLocked = true;
          showDialogue(this, {
            speaker: FOES[this.act.boss] ? FOES[this.act.boss].name : null,
            lines: talk.after,
            onDone: () => proceed()
          });
        });
      } else {
        proceed();
      }
      return;
    }

    // 精英战利：啃下一头凶兽，回一点气血，还有实打实的墨。
    // 险道要连打精英，若纯粹是掉血，选上道就只剩惩罚没有回报。
    if (this.nodeType === 'elite') {
      const h = Math.round(run.player.maxHp * 0.08);
      if (h > 0) {
        run.heal(h);
        this.floatText(W / 2, 300, '啖 肉 +' + h, PAL.gold, 30);
      }
      run.gold(45);
      this.floatText(W / 2, 356, '兽 髓 墨 +45', PAL.gold, 22);
    }

    this.cameras.main.fadeOut(400, 20, 17, 14);
    this.time.delayedCall(420, () => this.scene.start('Reward', { treasure: false, potion }));
  }

  update(time, delta) {
    // 浮层只暂停战斗时钟，场景仍渲染菜单；不能在暂停背后承受敌人伤害。
    if (this.battle && !this._pauseLayer && !this._rules && !this._codex && !this._dialogue) {
      this.battle.update(delta / 1000);
    }
    if (this.lyricsView) {
      const bgm = audio.bgm;
      this.lyricsView.update(bgm && bgm.isPlaying ? bgm.seek : -1);
    }
  }
}

function SH_safeUpdate(scene) {
  // 结束回合后刷新一次 UI，避免遗留选中态
  if (scene.selected) scene.clearSelection();
}
